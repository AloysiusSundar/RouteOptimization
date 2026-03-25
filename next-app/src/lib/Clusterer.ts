/**
 * Clusterer.ts (V1.0 - Spatial Multi-Day Partitioning)
 * - Groups POIs into K days based on geographic proximity.
 * - Respects Hard Constraints: reservations MUST be in their assigned day.
 * - Soft Constraints: minimizes distance between spots in the same day.
 */

export interface ClusterablePlace {
  name: string;
  coords?: [number, number];
  reservation_date: string; // YYYY-MM-DD
}

export interface ClusteredDay {
  places: ClusterablePlace[];
  indices: number[]; // Original indices from the input array
}

/**
 * Partitions places into K days.
 * @param places The list of places to cluster
 * @param startDate The start date of the trip (YYYY-MM-DD)
 * @param numDays Total days in trip
 * @param baseCoords The starting coordinates (hotel/city center)
 */
export function clusterPlaces(
  places: ClusterablePlace[],
  startDate: string,
  numDays: number,
  baseCoords: [number, number] | null
): ClusteredDay[] {
  console.log(`[Clusterer V1.0] Partitioning ${places.length} places into ${numDays} days...`);

  // Initialize Clusters
  const clusters: ClusteredDay[] = Array.from({ length: numDays }, () => ({
    places: [],
    indices: []
  }));

  const tripStart = new Date(startDate + "T00:00:00");
  const unassignedIndices: number[] = [];

  // 1. Hard Reservation Assignment
  places.forEach((p, idx) => {
    if (p.reservation_date) {
      const resDate = new Date(p.reservation_date + "T00:00:00");
      const diffDays = Math.round((resDate.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays < numDays) {
        clusters[diffDays].places.push(p);
        clusters[diffDays].indices.push(idx);
        return;
      }
    }
    unassignedIndices.push(idx);
  });

  // 2. Greedy Proximity Assignment for "Free" Spots
  // We compute the centroid of each day (or use baseCoords if empty)
  unassignedIndices.forEach((idx) => {
    const p = places[idx];
    if (!p.coords) {
        // Fallback: assign to Day 1 if no coordinates (shouldn't happen with geocoding)
        clusters[0].places.push(p);
        clusters[0].indices.push(idx);
        return;
    }

    let minDistance = Infinity;
    let bestDay = 0;

    clusters.forEach((day, dayIdx) => {
      // Centroid of the day
      const centroid = calculateCentroid(day.places, baseCoords);
      const dist = calculateDistance(p.coords!, centroid);
      
      // Load Balancing Adjustment: 
      // Bias slightly away from already full days to keep schedule balanced
      const balancePenalty = day.places.length * 0.1; 
      const adjustedDist = dist + balancePenalty;

      if (adjustedDist < minDistance) {
        minDistance = adjustedDist;
        bestDay = dayIdx;
      }
    });

    clusters[bestDay].places.push(p);
    clusters[bestDay].indices.push(idx);
  });

  // Final confirmation
  clusters.forEach((day, i) => {
    console.log(`[Clusterer V1.0] Day ${i+1}: ${day.places.length} spots assigned.`);
  });

  return clusters;
}

function calculateCentroid(places: ClusterablePlace[], fallback: [number, number] | null): [number, number] {
  const activePlaces = places.filter(p => p.coords);
  if (activePlaces.length === 0) return fallback || [0, 0];

  let sumLat = 0, sumLon = 0;
  activePlaces.forEach(p => {
    sumLat += p.coords![0];
    sumLon += p.coords![1];
  });
  return [sumLat / activePlaces.length, sumLon / activePlaces.length];
}

function calculateDistance(c1: [number, number], c2: [number, number]): number {
  // Simple Euclidean distance for clustering (good enough for city-scale)
  const dy = c1[0] - c2[0];
  const dx = c1[1] - c2[1];
  return Math.sqrt(dx * dx + dy * dy);
}
