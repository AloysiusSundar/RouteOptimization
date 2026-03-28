'use server';
import { unstable_cache } from 'next/cache';

/**
 * RecommendationEngine.ts (V3.1 - Intent Driven + AI Ranking)
 * - Intent → OSM tag mapping (CLEAN + POWERFUL)
 * - Dynamic Overpass queries
 * - Hugging Face Semantic Ranking (Resume-Ready ML)
 * - Heuristic fallback (Upgraded scoring)
 */

export interface POI {
  id: number;
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  score?: number;
  photo?: string; // V6.0 Wiki Photo
  summary?: string; // V6.0 Wiki Description
  opening_hours?: string; // V6.0 OSM Hours
  website?: string; // V6.0 OSM Website
  pageId?: string; // V6.2 Wiki Page ID (Direct Links)
}

/**
 * 🔥 Intent → OSM Tag Mapping
 */
const intentToTags: Record<string, { key: string; value: string }[]> = {
  beach: [
    { key: "natural", value: "beach" },
    { key: "leisure", value: "beach_resort" }
  ],
  park: [
    { key: "leisure", value: "park|garden" }
  ],
  museum: [
    { key: "tourism", value: "museum|gallery" }
  ],
  temple: [
    { key: "amenity", value: "place_of_worship" },
    { key: "building", value: "cathedral|church|chapel|temple|shrine|mosque" }
  ],
  attraction: [
    { key: "tourism", value: "attraction|viewpoint|theme_park" }
  ],
  historic: [
    { key: "historic", value: "monument|memorial|landmark|heritage|castle|palace|ruins" },
    { key: "building", value: "civic|castle|palace" }
  ]
};

/**
 * 🧠 Basic Intent Detection
 */
function detectIntent(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("beach")) return "beach";
  if (q.includes("park") || q.includes("garden")) return "park";
  if (q.includes("museum") || q.includes("gallery")) return "museum";
  if (q.includes("temple") || q.includes("church") || q.includes("cathedral") || q.includes("shrine") || q.includes("mosque")) return "temple";
  if (q.includes("historic") || q.includes("monument") || q.includes("gothic") || q.includes("castle") || q.includes("palace") || q.includes("architecture")) return "historic";
  return "attraction";
}

/**
 * 🔥 Dynamic Overpass Query Builder
 */
function buildOverpassQuery(lat: number, lon: number, radius: number, intent: string): string {
  const tagRules = intentToTags[intent] || intentToTags["attraction"];
  const queries = tagRules.map(rule => `
    node["${rule.key}"~"${rule.value}"](around:${radius}, ${lat}, ${lon});
    way["${rule.key}"~"${rule.value}"](around:${radius}, ${lat}, ${lon});
  `).join("\n");

  const timeoutVal = radius >= 100000 ? 180 : 90;
  const limitStr = radius >= 30000 ? "out center 500;" : "out center;";

  return `
    [out:json][timeout:${timeoutVal}];
    (
      ${queries}
    );
    ${limitStr}
  `;
}

/**
 * 🌍 Fetch POIs (INTENT AWARE)
 */
export async function fetchNearbyPOIs(
  lat: number,
  lon: number,
  interest: string,
  radius: number = 3000,
  retryCount: number = 0
): Promise<POI[]> {
  const intent = detectIntent(interest);
  console.log(`[Engine V3.1] Intent detected: ${intent} (Radius: ${radius}m)`);

  const query = buildOverpassQuery(lat, lon, radius, intent);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: AbortSignal.timeout(185000),
      cache: 'force-cache' // Overpass results are static enough to cache
    });

    if (!response.ok) {
      console.warn(`[Engine V3.1] Overpass Error ${response.status}, retrying...`);
      const nextRad = [30000, 100000, 1000000][retryCount] || 1000000;
      if (retryCount < 3) return fetchNearbyPOIs(lat, lon, interest, nextRad, retryCount + 1);
      return [];
    }

    const data = await response.json();
    const mapped: POI[] = (data.elements || [])
      .map((el: any) => ({
        id: el.id,
        name: el.tags?.name || el.tags?.operator || el.tags?.tourism || "Unknown",
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        tags: el.tags || {},
        opening_hours: el.tags?.opening_hours,
        website: el.tags?.website || el.tags?.["contact:website"]
      }))
      .filter((poi: POI) => poi.name !== "Unknown" && poi.lat && poi.lon);

    console.log(`[Engine V3.1] Candidates found: ${mapped.length}`);

    if (mapped.length === 0 && retryCount < 3) {
      const nextRad = [30000, 100000, 1000000][retryCount];
      return fetchNearbyPOIs(lat, lon, interest, nextRad, retryCount + 1);
    }

    return mapped;
  } catch (err) {
    console.error('[Engine V3.1] Fetch Critical Fail:', err);
    if (retryCount < 3) {
      const nextRad = [30000, 100000, 1000000][retryCount];
      return fetchNearbyPOIs(lat, lon, interest, nextRad, retryCount + 1);
    }
    return [];
  }
}

/**
 * 🤖 Semantic Ranking (Cohere AI) + Heuristic Fallback
 */
export async function rankPOIs(pois: POI[], interest: string): Promise<POI[]> {
  console.log(`[Engine V4.0] Ranking ${pois.length} places with Cohere AI for "${interest}"`);
  
  const cohereKey = process.env.COHERE_API_KEY;
  if (!cohereKey) {
    console.warn('[Engine V4.0] COHERE_API_KEY missing. Using HeuristicFallback.');
    return rankPOIsHeuristic(pois, interest);
  }

  // Define the cached fetching logic
  const getEmbeddings = unstable_cache(
    async (texts: string[], inputType: "search_query" | "search_document") => {
      const modelId = "embed-english-v3.0";
      const headers = {
        "Authorization": `Bearer ${cohereKey}`,
        "Content-Type": "application/json",
        "Request-Source": "node-sdk"
      };

      const res = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers,
        body: JSON.stringify({
          texts,
          model: modelId,
          input_type: inputType,
          embedding_types: ["float"]
        })
      });

      if (!res.ok) throw new Error(`Cohere API Fail: ${res.status}`);
      const data = await res.json();
      return data.embeddings.float;
    },
    ['cohere-embeddings'],
    { revalidate: 86400 * 30 } // Cache for 30 days
  );

  try {
    const query = interest || 'Top attractions';
    const documents = pois.map(poi => 
      `${poi.name}. ${poi.tags?.tourism || ''} ${poi.tags?.historic || ''} ${poi.tags?.description || ''}`.trim()
    );

    // Use the cached embeddings
    const queryEmbeds = await getEmbeddings([query], "search_query");
    const docEmbeds = await getEmbeddings(documents, "search_document");
    
    const interestVector = queryEmbeds[0];
    const poiVectors = docEmbeds;

    console.log(`[Engine V4.0] Semantic search complete. Computing similarities...`);

    const ranked = pois.map((poi, idx) => {
      const poiVector = poiVectors[idx];
      let score = 0;
      if (poiVector && interestVector) {
        // Dot product (since Cohere vectors are normalized by default)
        for (let i = 0; i < interestVector.length; i++) {
          score += interestVector[i] * poiVector[i];
        }
      }
      return { ...poi, score };
    });

    const final = ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
    console.log(`[Engine V4.0] Cohere Top Result: ${final[0]?.name} (${final[0]?.score?.toFixed(4)})`);
    return final;
  } catch (err) {
    console.error('[Engine V4.0] Cohere Process Error:', err);
    return rankPOIsHeuristic(pois, interest);
  }
}

/**
 * 🧠 Upgraded Heuristic Ranking
 */
async function rankPOIsHeuristic(pois: POI[], interest: string): Promise<POI[]> {
  const query = interest.toLowerCase();
  const ranked = pois.map(poi => {
    const name = (poi.name || "").toLowerCase();
    const tags = JSON.stringify(poi.tags || {}).toLowerCase();
    let score = 0;

    if (name.includes(query)) score += 8;
    if (tags.includes(query)) score += 5;

    const terms = query.split(/\s+/).filter(t => t.length > 2);
    terms.forEach(term => {
      if (name.includes(term)) score += 3;
      if (tags.includes(term)) score += 2;
    });

    if (poi.tags.tourism) score += 1;
    return { ...poi, score };
  });

  const final = ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
  console.log(`[Engine V3.1] Heuristic Top Result: ${final[0]?.name}`);
  return final;
}
