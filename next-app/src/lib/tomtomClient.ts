'use server';

function getTomTomKey() {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    throw new Error('TOMTOM_API_KEY is not configured. Please check your .env.local file.');
  }
  return key;
}

/**
 * Maps ORS profiles to TomTom travel modes
 */
function mapProfileToTomTom(profile: string): string {
  switch (profile) {
    case 'driving-car': return 'car';
    case 'foot-walking': return 'pedestrian';
    case 'cycling-regular': return 'bicycle';
    default: return 'car';
  }
}

/**
 * Fetches a duration matrix (in minutes) from TomTom with live traffic.
 * Fits within the 100-element limit for synchronous requests (e.g., 10x10 matrix).
 */
export async function getTomTomDurationsMatrix(coords: [number, number][], profile: string = 'driving-car'): Promise<number[][] | null> {
  const apiKey = getTomTomKey();
  
  if (coords.length <= 1) return [[0]];
  if (coords.length > 20) {
    console.warn('TomTom Matrix limit exceeded (>20 stops). Falling back to base durations.');
    return null;
  }

  // TomTom expects { point: { latitude, longitude } }
  const points = coords.map(([lat, lon]) => ({
    point: { latitude: lat, longitude: lon }
  }));

  const url = `https://api.tomtom.com/routing/1/matrix/json?key=${apiKey}&traffic=true&travelMode=${mapProfileToTomTom(profile)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origins: points,
        destinations: points
      }),
      next: { revalidate: 300 } // Balance live traffic: 5 minute cache
    });

    if (!res.ok) {
      console.error('TomTom Matrix API failed:', await res.text());
      return null;
    }

    const data = await res.json();
    
    // Matrix v1 structure: data.matrix[originIndex][destinationIndex]
    // Each entry has a "response" or "statusCode": 200
    if (!data.matrix) return null;

    const matrix: number[][] = data.matrix.map((row: any) => 
      row.map((cell: any) => {
        const durationSeconds = cell.response?.routeSummary?.travelTimeInSeconds;
        return durationSeconds !== undefined ? durationSeconds / 60 : 99999;
      })
    );

    return matrix;
  } catch (err) {
    console.error('TomTom Client Error:', err);
    return null;
  }
}

/**
 * Fetches detailed travel stats for a single leg, including historical usuals.
 */
export async function getTomTomLegDetails(origin: [number, number], destination: [number, number], profile: string = 'driving-car') {
  const apiKey = getTomTomKey();
  const mode = mapProfileToTomTom(profile);
  
  // traffic=all + departAt=now triggers the return of live vs historical
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin[0]},${origin[1]}:${destination[0]},${destination[1]}/json?key=${apiKey}&traffic=true&travelMode=${mode}&departAt=now`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0]?.summary;
    if (!route) return null;

    const live = route.travelTimeInSeconds / 60;
    const historical = route.historicTrafficTravelTimeInSeconds / 60;
    const noTraffic = route.noTrafficTravelTimeInSeconds / 60;

    return {
      liveMinutes: live,
      historicalMinutes: historical || live || noTraffic || 0.1,
      noTrafficMinutes: noTraffic || live || 0.1
    };
  } catch (err) {
    return null;
  }
}
