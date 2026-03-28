import requests
from typing import List, Tuple, Optional, Dict
from ..config import settings
from ..engine.cache_manager import geo_cache, get_cached_item, set_cached_item

def get_coordinates(place_name: str, focus: Optional[Tuple[float, float]] = None, boundary_radius_km: Optional[int] = None) -> Tuple[float, float]:
    # V8.5: Cache Check
    cache_key = f"geocode:{place_name}"
    if focus:
        cache_key += f":focus:{focus[0]:.4f},{focus[1]:.4f}"
    
    cached = get_cached_item(geo_cache, cache_key)
    if cached:
        return cached

    url = "https://api.openrouteservice.org/geocode/search"
    params = {
        "api_key": settings.ORS_API_KEY,
        "text": place_name,
        "size": 1
    }
    
    if focus:
        params["focus.point.lon"] = focus[1]
        params["focus.point.lat"] = focus[0]
    
    if boundary_radius_km and focus:
        params["boundary.circle.lat"] = focus[0]
        params["boundary.circle.lon"] = focus[1]
        params["boundary.circle.radius"] = boundary_radius_km
    
    res = requests.get(url, params=params)
    if not res.ok:
        raise Exception(f"Failed to geocode {place_name}. Status: {res.status_code}")
    
    data = res.json()
    if not data.get("features"):
        raise Exception(f"Place not found: {place_name}")
    
    lon, lat = data["features"][0]["geometry"]["coordinates"]
    result = (lat, lon)
    
    # Cache store
    set_cached_item(geo_cache, cache_key, result)
    return result

def get_autocomplete_suggestions(text: str, focus: Optional[Tuple[float, float]] = None, boundary_radius_km: Optional[int] = None) -> List[Dict]:
    if not text or len(text) < 3:
        return []

    url = "https://api.openrouteservice.org/geocode/autocomplete"
    params = {
        "api_key": settings.ORS_API_KEY,
        "text": text,
        "size": 5
    }
    if focus:
        params["focus.point.lat"] = focus[0]
        params["focus.point.lon"] = focus[1]
        
        if boundary_radius_km:
            params["boundary.circle.lat"] = focus[0]
            params["boundary.circle.lon"] = focus[1]
            params["boundary.circle.radius"] = boundary_radius_km

    try:
        res = requests.get(url, params=params)
        if not res.ok:
            return []
        data = res.json()
        return [
            {
                "name": f["properties"]["name"],
                "label": f["properties"]["label"],
                "coords": [f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]] # [lat, lon]
            }
            for f in data.get("features", [])
        ]
    except Exception as e:
        print(f"DEBUG: Autocomplete fetch failed: {e}")
        return []

def get_durations_matrix(coords: List[Tuple[float, float]], profile: str = 'driving-car') -> List[List[float]]:
    if len(coords) <= 1:
        return [[0.0]]

    locations = [[lon, lat] for lat, lon in coords]
    
    res = requests.post(
        f"https://api.openrouteservice.org/v2/matrix/{profile}",
        headers={
            "Authorization": settings.ORS_API_KEY,
            "Content-Type": "application/json"
        },
        json={
            "locations": locations,
            "metrics": ["duration"]
        }
    )

    if not res.ok:
        raise Exception(f"Failed to get route durations. Status: {res.status_code}")
    
    data = res.json()
    durations = data.get("durations", [])
    
    # Convert seconds to minutes, handle nulls
    return [[(secs / 60 if secs is not None else 99999) for secs in row] for row in durations]

def get_route_polyline(coords: List[Tuple[float, float]], profile: str = 'driving-car') -> Optional[Dict]:
    if len(coords) < 2:
        return None

    locations = [[lon, lat] for lat, lon in coords]

    # Long distance check to prevent API errors (match TS logic)
    start = coords[0]
    end = coords[-1]
    if abs(start[0] - end[0]) > 40 or abs(start[1] - end[1]) > 40:
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": locations},
                "properties": {"summary": {"distance": 0, "duration": 0}}
            }]
        }
    
    res = requests.post(
        f"https://api.openrouteservice.org/v2/directions/{profile}/geojson",
        headers={
            "Content-Type": "application/json",
            "Authorization": settings.ORS_API_KEY
        },
        json={"coordinates": locations}
    )

    if not res.ok:
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": locations},
                "properties": {}
            }]
        }
    
    return res.json()

