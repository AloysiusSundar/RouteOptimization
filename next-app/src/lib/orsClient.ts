'use server';

function getApiKey() {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new Error('ORS_API_KEY is not configured on the server. Please check your .env.local file and restart your development server.');
  }
  return key;
}

export async function getCoordinates(placeName: string, focus?: [number, number], boundaryRadiusKm?: number): Promise<[number, number]> {
  const apiKey = getApiKey();
  let url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(placeName)}&size=1`;
  
  if (focus) {
    url += `&focus.point.lon=${focus[1]}&focus.point.lat=${focus[0]}`;
  }
  
  if (boundaryRadiusKm && focus) {
    url += `&boundary.circle.lat=${focus[0]}&boundary.circle.lon=${focus[1]}&boundary.circle.radius=${boundaryRadiusKm}`;
  }
  
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to geocode ${placeName}. Status: ${res.status}`);
  const data = await res.json();
  if (!data?.features || data.features.length === 0) throw new Error(`Place not found: ${placeName}`);
  
  const [lon, lat] = data.features[0].geometry.coordinates;
  return [lat, lon]; // return [lat, lon]
}

export async function getDurationsMatrix(coords: [number, number][], profile: string = 'driving-car'): Promise<number[][]> {
  const apiKey = getApiKey();
  
  if (coords.length <= 1) {
    return [[0]];
  }

  // ORS matrix endpoint expects [lon, lat]
  const locations = coords.map(([lat, lon]) => [lon, lat]);
  
  const res = await fetch(`https://api.openrouteservice.org/v2/matrix/${profile}`, {
    method: 'POST',
    headers: {
      'Authorization': apiKey as string,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      locations: locations,
      metrics: ['duration']
    }),
    next: { revalidate: 86400 } // Cache matrix for 24 hours
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get route durations. Status: ${res.status}, Details: ${errorText}`);
  }
  const data = await res.json();
  
  // ORS returns durations in seconds. It can return null if no route is found!
  // Convert to minutes, fallback to a massive number if null so the optimizer avoids it.
  const durationsMinutes = data.durations.map((row: (number | null)[]) => 
    row.map(secs => secs === null ? 99999 : secs / 60)
  );
  return durationsMinutes;
}

export async function getAutocompleteSuggestions(text: string, focus?: [number, number], boundaryRadiusKm?: number): Promise<{name: string, label: string, coords: [number, number]}[]> {
  const apiKey = getApiKey();
  if (!text || text.length < 3) return [];

  let url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${apiKey}&text=${encodeURIComponent(text)}&size=5`;
  if (focus) {
    url += `&focus.point.lat=${focus[0]}&focus.point.lon=${focus[1]}`;
    if (boundaryRadiusKm) {
        url += `&boundary.circle.lat=${focus[0]}&boundary.circle.lon=${focus[1]}&boundary.circle.radius=${boundaryRadiusKm}`;
    }
  }

  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.features.map((f: any) => ({
      name: f.properties.name,
      label: f.properties.label,
      coords: [f.geometry.coordinates[1], f.geometry.coordinates[0]] // [lat, lon]
    }));
  } catch (err) {
    console.error('Autocomplete fetch failed:', err);
    return [];
  }
}

export async function getRoutePolyline(coords: [number, number][], profile: string = 'driving-car'): Promise<any> {
  const apiKey = getApiKey();
  
  if (coords.length < 2) return null;

  // Basic distance check to prevent 6,000,000.0 meters limit error
  // Checked against first and last point for simplicity
  const start = coords[0];
  const end = coords[coords.length - 1];
  const latDiff = Math.abs(start[0] - end[0]);
  const lonDiff = Math.abs(start[1] - end[1]);
  
  if (latDiff > 40 || lonDiff > 40) {
    console.warn('Long distance route detected (>4,000km). Returning straight line fallback.');
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { 
          type: 'LineString', 
          coordinates: coords.map(([lat, lon]) => [lon, lat]) 
        },
        properties: { summary: { distance: 0, duration: 0 } }
      }]
    };
  }

  // Convert [lat, lon] to [lon, lat] for ORS
  const locations = coords.map(([lat, lon]) => [lon, lat]);

  const url = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey as string
      },
      body: JSON.stringify({ coordinates: locations }),
      next: { revalidate: 86400 } // Cache polylines for 24 hours
    });

    if (!res.ok) {
       const err = await res.json();
       console.error('Directions API failed. Status:', res.status, 'Error:', JSON.stringify(err));
       // Return straight line fallback on error
       return {
         type: 'FeatureCollection',
         features: [{
           type: 'Feature',
           geometry: { 
             type: 'LineString', 
             coordinates: locations
           },
           properties: { }
         }]
       };
    }
    return await res.json();
  } catch (err) {
    console.error('Route polyline fetch failed:', err);
    return null;
  }
}
