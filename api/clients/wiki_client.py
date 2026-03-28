import requests
from typing import Dict, Optional, List, Tuple
from ..engine.cache_manager import wiki_cache, get_cached_item, set_cached_item

def fetch_wiki_data(name: str, lat: Optional[float] = None, lon: Optional[float] = None) -> Optional[Dict]:
    """
    Python Implementation of WikiMedia POI enrichment with multi-stage fallback.
    - Stage 0: Cache Check (24 Hour TTL)
    - Stage 1: Exact Title Match (with redirects)
    - Stage 2: GeoSearch (Find articles near coords)
    - Stage 3: Fuzzy Search Generator
    """
    cache_key = f"wiki:{name}"
    if lat and lon:
        cache_key += f":geo:{lat:.3f},{lon:.3f}"
    
    cached = get_cached_item(wiki_cache, cache_key)
    if cached:
        return cached

    try:
        # Stage 1: Exact Title Match (with redirects)
        data = wiki_api_call({"titles": name, "redirects": "1"})
        if is_valid_wiki(data): 
            set_cached_item(wiki_cache, cache_key, data)
            return data

        # Stage 2: GeoSearch (Best for local landmarks)
        if lat is not None and lon is not None:
            geo_id_data = wiki_api_call({
                "list": "geosearch",
                "gscoord": f"{lat}|{lon}",
                "gsradius": "500"
            })
            if geo_id_data and geo_id_data.get("pageId"):
                # Recursive fetch for the found pageId
                geo_data = wiki_api_call({"pageids": geo_id_data["pageId"]})
                if is_valid_wiki(geo_data): 
                    set_cached_item(wiki_cache, cache_key, geo_data)
                    return geo_data

        # Stage 3: Fuzzy Search Generator
        search_data = wiki_api_call({
            "generator": "search",
            "gsrsearch": name,
            "gsrlimit": "1"
        })
        if is_valid_wiki(search_data):
            set_cached_item(wiki_cache, cache_key, search_data)
        
        return search_data

    except Exception as e:
        print(f"DEBUG: Wiki Enrichment Critical Fail for {name}: {e}")
        return {}

def wiki_api_call(params: Dict[str, str]) -> Dict:
    base_url = "https://en.wikipedia.org/w/api.php"
    
    # Wikipedia REQUIRES a User-Agent. requests generic UA is often blocked.
    headers = {
        "User-Agent": "YathiraiPlanner/1.0 (https://yathirai.ai; travel@yathirai.ai) requests/2.0"
    }

    standard_params = {
        "action": "query",
        "format": "json",
        "prop": "pageimages|extracts",
        "exintro": "",
        "explaintext": "",
        "exchars": "300",
        "piprop": "thumbnail",
        "pithumbsize": "1000"
    }
    
    # Merge and call
    full_params = {**standard_params, **params}
    
    try:
        res = requests.get(base_url, params=full_params, headers=headers, timeout=5)
        if not res.ok: 
            print(f"DEBUG: Wiki API HTTP Error {res.status_code} for {params.get('titles') or params.get('gsrsearch')}")
            return {}
        data = res.json()
    except Exception as e:
        print(f"DEBUG: Wiki API Exception: {e}")
        return {}

    query_data = data.get("query", {})
    
    # Special case: geosearch list returns a list of results - just return pageId to trigger detail fetch
    if "geosearch" in query_data and query_data["geosearch"]:
        return {"pageId": str(query_data["geosearch"][0]["pageid"])}

    pages = query_data.get("pages", {})
    if not pages: return {}
    
    page_id = next(iter(pages))
    if page_id == "-1": return {}
    
    page = pages[page_id]
    extract = page.get("extract", "")
    
    # Disambiguation filter (relaxed)
    if extract and ("may refer to:" in extract.lower() or len(extract) < 20):
        return {}

    return {
        "photo": page.get("thumbnail", {}).get("source"),
        "summary": extract,
        "pageId": str(page_id)
    }

def is_valid_wiki(data: Optional[Dict]) -> bool:
    # LOOSENED: Accept if we have a summary OR a photo
    return bool(data and (data.get("summary") or data.get("photo")))



