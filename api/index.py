from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple, Dict, Optional
from datetime import datetime, timedelta
from .config import settings

# Import engines
from .engine.tsp_solver import optimize_route
from .engine.clusterer import cluster_places
from .engine.recommendation import fetch_nearby_pois, rank_pois_with_cohere
from .engine.schedule import generate_schedule

# Import clients
from .clients.ors_client import get_coordinates, get_durations_matrix, get_route_polyline, get_autocomplete_suggestions
from .clients.tomtom_client import get_tomtom_durations_matrix, get_tomtom_leg_details, get_tomtom_route_summary
from .clients.wiki_client import fetch_wiki_data
from .clients.weather_client import get_weather_data

app = FastAPI()

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Request Logging Middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"DEBUG: Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"DEBUG: Response status: {response.status_code}")
    return response

class PlaceInput(BaseModel):
    id: str
    name: str
    visit_duration: int
    is_reservation: bool
    reservation_date: Optional[str] = None
    reservation_clock: Optional[str] = None
    coords: Optional[Tuple[float, float]] = None

class ActiveHours(BaseModel):
    start: Dict[str, int]
    end: Dict[str, int]

class PlanInput(BaseModel):
    baseCity: str
    accommodation: str
    accommodationCoords: Optional[Tuple[float, float]] = None
    startDate: str
    tripLength: int
    places: List[PlaceInput]
    transportMode: str = "driving-car"
    activeHours: Dict[str, ActiveHours]

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "engine": "Python (FastAPI)", "platform": "Vercel"}

@app.post("/api/plan")
async def plan_trip(input_data: PlanInput):
    try:
        # Step 1: Geocoding & Context
        base_city_coords = None
        if input_data.baseCity:
            base_city_coords = get_coordinates(input_data.baseCity)
        
        anchor_coords = input_data.accommodationCoords
        focus_coords = anchor_coords or base_city_coords

        valid_places = [p.dict() for p in input_data.places if p.name.strip()]
        
        # Step 2: Ensure all places have coordinates (Geocode if missing)
        # Using a "Chain of Proximity": Each place is geocoded relative to the PREVIOUS pin's location.
        # Using a "Chain of Proximity"
        # focus_coords initialized above
        for p in valid_places:
            if not p.get("coords") and p.get("name"):
                try:
                    lat, lon = get_coordinates(p["name"], focus_coords)
                    p["coords"] = [lat, lon]
                    # Update focus for next item in chain
                    focus_coords = [lat, lon]
                except Exception as e:
                    print(f"⚠️ Failed to geocode {p['name']}: {e}")
            elif p.get("coords"):
                # If it already has coords (e.g. from map pick), update focus too!
                focus_coords = p["coords"]

        # Step 3: Clustering
        clustered_days = cluster_places(
            valid_places,
            input_data.startDate,
            input_data.tripLength,
            anchor_coords or base_city_coords # Still use base_city for clustering stability
        )

        final_ordered_places = []
        final_ordered_coords = []
        day_stop_counts = []

        # Step 3: TSP Solver Per Day
        route_geojson = {}

        for day_idx, day in enumerate(clustered_days):
            if not day["indices"]:
                day_stop_counts.append(0)
                continue

            day_places = day["places"]
            
            # Map reservation date/clock to reservation_time for both Solver and Scheduler
            for p in day_places:
                if p.get("is_reservation") and p.get("reservation_date") and p.get("reservation_clock"):
                    try:
                        # Append :00 to ensure backwards compatibility with python 3.9 fromisoformat
                        time_str = f"{p['reservation_date']}T{p['reservation_clock']}:00"
                        p["reservation_time"] = datetime.fromisoformat(time_str)
                    except ValueError:
                        pass

            # Set forced date for the scheduler
            dt = datetime.fromisoformat(input_data.startDate) + timedelta(days=day_idx)
            date_str = dt.strftime("%Y-%m-%d")
            for p in day_places:
                p["forcedDate"] = date_str

            day_coords = [p["coords"] for p in day_places]
            
            # Anchor at start/end of day if available
            if anchor_coords:
                day_coords = [anchor_coords] + day_coords
                # CRITICAL: Assign forcedDate to anchor to ensure schedule generator aligns to day morning
                day_places = [{
                    "id": f"hotel-start-{day_idx}", 
                    "name": "Stay Location (Start)", 
                    "visit_duration": 0, 
                    "is_reservation": False,
                    "is_stay_anchor": True,
                    "forcedDate": date_str
                }] + day_places

            # V8.1: Traffic-Aware Temporal Initialization
            # Determine the day's start time from activeHours
            start_min = 480.0 # Default 8 AM
            if input_data.activeHours and date_str in input_data.activeHours:
                day_cfg = input_data.activeHours[date_str]
                start_min = day_cfg.start["hours"] * 60 + day_cfg.start["minutes"]

            # V8.2: Dual-Track Traffic Matrix Fetching (Live vs Historical Baseline)
            durations_live = get_tomtom_durations_matrix(day_coords, traffic=True)
            durations_hist = get_tomtom_durations_matrix(day_coords, traffic=False)
            
            # Fallback to ORS if TomTom fails
            if not durations_live:
                durations_live = get_durations_matrix(day_coords, input_data.transportMode)
            if not durations_hist:
                durations_hist = durations_live

            # Optimize with Time-Windows using LIVE traffic
            result = optimize_route(
                day_coords, 
                durations_live, 
                day_places, 
                fixed_start=bool(anchor_coords),
                start_minutes=start_min
            )
            
            # Assembly
            day_optimized_coords = []
            for order_idx in result["order"]:
                p = day_places[order_idx]
                day_optimized_coords.append(day_coords[order_idx])
                final_ordered_coords.append(day_coords[order_idx]) # FIXED: Don't scramble coords
                final_ordered_places.append(p)
                
            if anchor_coords:
                # Add end anchor
                end_anchor = {
                    "id": f"hotel-end-{day_idx}", 
                    "name": "Stay Location (End)", 
                    "visit_duration": 0, 
                    "is_reservation": False,
                    "is_stay_anchor": True,
                    "forcedDate": date_str
                }
                final_ordered_coords.append(anchor_coords)
                final_ordered_places.append(end_anchor)
                day_optimized_coords.append(anchor_coords)
                day_stop_counts.append(len(result["order"]) + 1)
            else:
                day_stop_counts.append(len(result["order"]))

            # Capture Day Polyline (Must include the return leg if anchor exists)
            day_polyline = get_route_polyline(day_optimized_coords, input_data.transportMode)
            route_geojson[str(day_idx)] = day_polyline


        # Step 4: Schedule Generation with Traffic Comparison
        # NEW V8.3: Use Route Summary (Sequence) instead of Matrix to bypass 100-cell limit
        leg_summaries = get_tomtom_route_summary(final_ordered_coords, input_data.transportMode)
        
        # Build 1D-sparse matrices for the scheduler (it only needs the adjacent pairs [idx][idx+1])
        n_total = len(final_ordered_coords)
        live_matrix = [[0.0] * n_total for _ in range(n_total)]
        hist_matrix = [[0.0] * n_total for _ in range(n_total)]
        
        if leg_summaries:
            for i, sim in enumerate(leg_summaries):
                live_matrix[i][i+1] = sim["liveMinutes"]
                hist_matrix[i][i+1] = sim["historicalMinutes"]
        else:
            # Fallback to general ORS matrix if TomTom is unavailable
            full_durations = get_durations_matrix(final_ordered_coords, input_data.transportMode)
            for i in range(n_total - 1):
                live_matrix[i][i+1] = full_durations[i][i+1]
                hist_matrix[i][i+1] = full_durations[i][i+1]

        active_hours_dict = {k: v.dict() for k, v in input_data.activeHours.items()}
        
        schedule = generate_schedule(
            final_ordered_places,
            final_ordered_coords,
            list(range(len(final_ordered_places))),
            datetime.fromisoformat(input_data.startDate),
            active_hours_dict,
            live_matrix,
            None, # base_durations_matrix (deprecated in favor of dual hist/live)
            hist_matrix
        )

        # Step 5: Route Polyline
        full_polyline = get_route_polyline(final_ordered_coords, input_data.transportMode)
        route_geojson["all"] = full_polyline

        return {
            "schedule": schedule,
            "routeGeoJson": route_geojson,
            "orderedCoords": final_ordered_coords
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommend")
async def recommend(lat: float, lon: float, interest: str):
    pois = fetch_nearby_pois(lat, lon, interest)
    ranked = rank_pois_with_cohere(pois, interest, settings.COHERE_API_KEY)
    return ranked[:10]

@app.get("/api/enrich")
async def enrich(name: str, lat: float, lon: float):
    return fetch_wiki_data(name, lat, lon)

@app.get("/api/autocomplete")
async def autocomplete(text: str, lat: Optional[float] = None, lon: Optional[float] = None, radius: Optional[int] = None):
    focus = (lat, lon) if lat is not None and lon is not None else None
    return get_autocomplete_suggestions(text, focus, boundary_radius_km=radius)

@app.get("/api/geocode")
async def geocode(text: str):
    try:
        lat, lon = get_coordinates(text)
        return {"lat": lat, "lon": lon}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/weather")
async def weather(lat: float, lon: float):
    data = get_weather_data(lat, lon)
    if not data:
        raise HTTPException(status_code=500, detail="Failed to fetch weather data")
    return data

from .engine.magic_parser import parse_magic_prompt

@app.post("/api/magic")
async def magic_parse(data: Dict[str, str]):
    prompt = data.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    try:
        return parse_magic_prompt(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
