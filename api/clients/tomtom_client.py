import requests
from typing import List, Tuple, Optional, Dict
from ..config import settings

def map_to_tomtom_mode(profile: str) -> str:
    """Maps ORS profiles to TomTom travel modes"""
    mapping = {
        "driving-car": "car",
        "foot-walking": "pedestrian",
        "cycling-regular": "bicycle"
    }
    return mapping.get(profile, "car")

from ..engine.cache_manager import traffic_cache, get_cached_item, set_cached_item
import json

def get_tomtom_durations_matrix(coords: List[Tuple[float, float]], profile: str = "car", traffic: bool = True) -> Optional[List[List[float]]]:
    if not settings.TOMTOM_API_KEY:
        return None

    # V8.5: Cache Check
    coords_key = "|".join([f"{lat:.4f},{lon:.4f}" for lat, lon in coords])
    cache_key = f"matrix:{coords_key}:mode:{profile}:traffic:{traffic}"
    
    cached = get_cached_item(traffic_cache, cache_key)
    if cached:
        return cached

    # TomTom expects [lat, lon]
    origins = [{"point": {"latitude": lat, "longitude": lon}} for lat, lon in coords]
    destinations = origins
    
    traffic_param = "true" if traffic else "false"
    mode = map_to_tomtom_mode(profile)
    url = f"https://api.tomtom.com/routing/1/matrix/sync/json?key={settings.TOMTOM_API_KEY}&routeType=fastest&traffic={traffic_param}&travelMode={mode}"
    
    try:
        res = requests.post(
            url,
            json={
                "origins": origins,
                "destinations": destinations
            },
            timeout=10
        )

        if not res.ok:
            print(f"DEBUG: TomTom Matrix API Error: {res.status_code} {res.text}")
            return None
        
        data = res.json()
        matrix = []
        n = len(coords)
 
        # Verify matrix structure
        if "matrix" not in data or len(data["matrix"]) < n:
            return None
 
        for i in range(n):
            row = []
            for j in range(n):
                cell = data["matrix"][i][j]
                # TomTom returns travelTimeInSeconds
                seconds = cell.get("response", {}).get("routeSummary", {}).get("travelTimeInSeconds")
                # Fallback to high value if path not found
                row.append(seconds / 60 if seconds is not None else 99999.0)
            matrix.append(row)
        
        # Cache store
        set_cached_item(traffic_cache, cache_key, matrix)
        return matrix
    except Exception as e:
        print(f"DEBUG: TomTom Matrix Exception: {e}")
        return None

def get_tomtom_route_summary(coords: List[Tuple[float, float]], profile: str = "car") -> List[Dict]:
    """
    Fetches detailed travel stats for an entire fixed sequence of coordinates.
    Used to bypass the 100-cell matrix limit for the final schedule generation.
    Supports up to 50 waypoints.
    """
    if not settings.TOMTOM_API_KEY or len(coords) < 2:
        return []

    # V8.5: Cache Check
    coords_key = "|".join([f"{lat:.4f},{lon:.4f}" for lat, lon in coords])
    cache_key = f"summary:{coords_key}:mode:{profile}"
    
    cached = get_cached_item(traffic_cache, cache_key)
    if cached:
        return cached

    # TomTom expects {lat},{lon}:{lat},{lon}...
    points_str = ":".join([f"{lat},{lon}" for lat, lon in coords])
    mode = map_to_tomtom_mode(profile)
    url = f"https://api.tomtom.com/routing/1/calculateRoute/{points_str}/json?key={settings.TOMTOM_API_KEY}&traffic=true&travelMode={mode}&departAt=now&computeTravelTimeFor=all"
    
    try:
        res = requests.get(url, timeout=15)
        if not res.ok:
            print(f"DEBUG: TomTom Route Summary Error: {res.status_code} {res.text}")
            return []
        
        data = res.json()
        route = data.get("routes", [{}])[0]
        legs = route.get("legs", [])
        
        results = []
        for leg in legs:
            summary = leg.get("summary", {})
            results.append({
                "liveMinutes": summary.get("travelTimeInSeconds", 0) / 60,
                "historicalMinutes": summary.get("historicTrafficTravelTimeInSeconds", summary.get("travelTimeInSeconds", 0)) / 60,
                "noTrafficMinutes": summary.get("noTrafficTravelTimeInSeconds", summary.get("travelTimeInSeconds", 0)) / 60
            })
        
        # Cache store
        if results:
            set_cached_item(traffic_cache, cache_key, results)
        return results
    except Exception as e:
        print(f"DEBUG: TomTom Route Summary Exception: {e}")
        return []

def get_tomtom_leg_details(start: Tuple[float, float], end: Tuple[float, float], profile: str = "car") -> Optional[Dict]:
    """Legacy individual leg fetch (fallback)"""
    res = get_tomtom_route_summary([start, end], profile)
    return res[0] if res else None
