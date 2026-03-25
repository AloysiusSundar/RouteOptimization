/**
 * RecommendationEngine.ts
 * Logic for fetching nearby POIs via Overpass and ranking them semantically
 * using Edge ML (transformers.js).
 */

export interface POI {
  id: number;
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  score?: number;
}

/**
 * Fetches Points of Interest from OpenStreetMap via Overpass API
 */
export async function fetchNearbyPOIs(lat: number, lon: number, radius: number = 3000): Promise<POI[]> {
  const query = `
    [out:json][timeout:60];
    (
      node["tourism"~"museum|attraction|viewpoint|gallery|theme_park"](around:${radius}, ${lat}, ${lon});
      way["tourism"~"museum|attraction|viewpoint|gallery|theme_park"](around:${radius}, ${lat}, ${lon});
      node["historic"~"monument|landmark|memorial"](around:${radius}, ${lat}, ${lon});
      node["artwork"~"sculpture|installation"](around:${radius}, ${lat}, ${lon});
    );
    out center;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  });

  if (!response.ok) throw new Error('Overpass API failed');
  const data = await response.json();

  console.log('[Phase 3] Overpass raw data:', data);
  if (!data.elements || !Array.isArray(data.elements)) {
    console.warn('[Phase 3] Overpass returned no valid elements.');
    return [];
  }

  const mapped = data.elements
    .filter((el: any) => el && typeof el === 'object') // Extra defensive
    .map((el: any) => {
      try {
        return {
          id: el.id,
          name: el.tags?.name || el.tags?.operator || 'Unknown Attraction',
          lat: el.lat || el.center?.lat,
          lon: el.lon || el.center?.lon,
          tags: el.tags || {}
        };
      } catch (err) {
        console.error('[Phase 3] Error mapping element:', el, err);
        return null;
      }
    })
    .filter((poi: any): poi is POI => 
      !!poi && poi.name !== 'Unknown Attraction' && !!poi.lat && !!poi.lon
    );

  console.log('[Phase 3] Mapped POIs count:', mapped.length);
  return mapped;
}

let extractorPromise: any = null;

async function getExtractor() {
  if (!extractorPromise) {
    try {
      // 1. More robust shim: catch ALL global contexts
      const globalContext: any = typeof window !== 'undefined' ? window : globalThis;
      if (!globalContext.process) {
        console.log('[Phase 3] Mocking process object for browser compatibility');
        globalContext.process = { env: {} };
      }
      if (!globalContext.process.env) {
        globalContext.process.env = {};
      }
      
      // Some versions look specifically at globalThis.process
      if (!(globalThis as any).process) {
        (globalThis as any).process = globalContext.process;
      }

      console.log('[Phase 3] Initiating dynamic import of @xenova/transformers');
      const Transformers = await import('@xenova/transformers');
      const { pipeline, env } = Transformers;
      
      console.log('[Phase 3] Configuring transformers.js environment...');
      // 2. Proactive environment configuration
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      
      // Some versions need this manually set if not detected correctly
      if (typeof window !== 'undefined') {
        (env as any).allowRemoteModels = true;
      }
      
      console.log('[Phase 3] Loading Xenova/all-MiniLM-L6-v2 model...');
      extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (p: any) => {
          if (p.status === 'progress') {
            console.log(`[Phase 3] AI Model Download: ${Math.round(p.progress)}%`);
          }
        }
      });
      console.log('[Phase 3] Pipeline initialized.');
    } catch (err) {
      console.error('[Phase 3] Failed to load transformers pipeline:', err);
      extractorPromise = null;
      throw err;
    }
  }
  return extractorPromise;
}

/**
 * Ranks POIs based on semantic similarity to user interest using transformers.js
 */
export async function rankPOIs(pois: POI[], interest: string): Promise<POI[]> {
  if (pois.length === 0) return [];

  console.log('[Phase 3] Ranking POIs for interest:', interest);
  const extractor = await getExtractor();
  if (!extractor) throw new Error('Semantic Engine not ready.');

  const interestOutput = await extractor(interest || 'Recommended places', { pooling: 'mean', normalize: true });
  const interestVector = interestOutput.data;

  const ranked = await Promise.all(pois.map(async (poi) => {
    try {
      const context = `${poi.name || ''}. ${poi.tags?.tourism || ''} ${poi.tags?.historic || ''} ${poi.tags?.description || ''}`.trim() || 'POI';
      const poiOutput = await extractor(context, { pooling: 'mean', normalize: true });
      const poiVector = poiOutput.data;

      let score = 0;
      for (let i = 0; i < interestVector.length; i++) {
          score += interestVector[i] * poiVector[i];
      }
      return { ...poi, score };
    } catch (err) {
      console.error('[Phase 3] Error ranking POI:', poi.name, err);
      return { ...poi, score: 0 };
    }
  }));

  const finalResults = ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
  console.log('[Phase 3] Ranking complete. Top result:', finalResults[0]?.name);
  return finalResults;
}
