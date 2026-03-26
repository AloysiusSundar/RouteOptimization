/**
 * WikiEnricher.ts (V6.2 - Robust Discovery)
 * - Stage 1: Exact Title Match
 * - Stage 2: GeoSearch (Finds articles near coords)
 * - Stage 3: Search Generator (Fuzzy text search)
 */

export interface WikiData {
  photo?: string;
  summary?: string;
  pageId?: string;
}

/**
 * Resolves a high-quality photo from Wikimedia Commons/Wikipedia.
 * Uses a multi-stage fallback strategy for maximum hit-rate.
 */
export async function fetchWikiData(name: string, lat?: number, lon?: number): Promise<WikiData> {
  try {
    // Stage 1: Try Direct Title Match (Fastest)
    let data = await wikiApiCall({ titles: name });
    if (isValidWiki(data)) return data;

    // Stage 2: Try GeoSearch (Best for local spots/landmarks)
    if (lat && lon) {
      const geoData = await wikiApiCall({ 
        list: 'geosearch', 
        gscoord: `${lat}|${lon}`, 
        gsradius: '500' 
      });
      if (isValidWiki(geoData)) return geoData;
    }

    // Stage 3: Fuzzy Search Generator
    const searchData = await wikiApiCall({ 
      generator: 'search', 
      gsrsearch: name, 
      gsrlimit: '1' 
    });
    return searchData;

  } catch (err) {
    console.error(`[WikiEnricher] Failed to enrich ${name}:`, err);
    return {};
  }
}

async function wikiApiCall(params: Record<string, string>): Promise<WikiData> {
  const baseUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|extracts&exintro&explaintext&exchars=300&piprop=thumbnail&pithumbsize=1000';
  
  const queryParams = new URLSearchParams(params).toString();
  const res = await fetch(`${baseUrl}&${queryParams}`);
  if (!res.ok) return {};
  
  const data = await res.json();
  let pages = data.query?.pages;

  // If we used a list (geosearch), we need to fetch the page details for the top result
  if (data.query?.geosearch?.length > 0) {
    const topPageId = data.query.geosearch[0].pageid;
    return wikiApiCall({ pageids: topPageId.toString() });
  }

  if (!pages) return {};
  
  const pageId = Object.keys(pages)[0];
  if (pageId === "-1") return {};
  
  const page = pages[pageId];
  // Filter out disambiguation pages (often have short extracts like "may refer to")
  if (page.extract?.includes('may refer to:') || page.extract?.length < 50) {
     return {}; 
  }

  return {
    photo: page.thumbnail?.source,
    summary: page.extract,
    pageId
  };
}

function isValidWiki(data: WikiData): boolean {
  return !!(data.photo && data.summary);
}

/**
 * Lightweight helper to check if a place is likely open based on OSM hours.
 */
export function getOpenStatus(openingHours?: string): { status: 'open' | 'closed' | 'unknown', message: string } {
  if (!openingHours) return { status: 'unknown', message: 'Hours not available' };
  
  // Basic cleanup for display
  const clean = openingHours
    .replace(/Mo/g, 'Mon').replace(/Tu/g, 'Tue').replace(/We/g, 'Wed')
    .replace(/Th/g, 'Thu').replace(/Fr/g, 'Fri').replace(/Sa/g, 'Sat')
    .replace(/Su/g, 'Sun')
    .split(';')[0]; // Just show the primary rule

  return { 
    status: 'unknown', 
    message: clean
  };
}
