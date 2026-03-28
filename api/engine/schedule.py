from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

class Place(dict):
    id: str
    name: str
    reservation_time: Optional[datetime]
    visit_duration: int # minutes
    forcedDate: Optional[str] # YYYY-MM-DD

class ScheduleStop(dict):
    id: str
    place: str
    latlon: Tuple[float, float]
    arrival: datetime
    departure: datetime
    day: str
    date: str
    time: str
    isReservation: bool
    travelMinutes: float
    trafficDelayMinutes: float
    historicalMinutes: float

class ActiveHours(dict):
    start: Dict[str, int] # { hours, minutes }
    end: Dict[str, int] # { hours, minutes }

def set_time_on_date(d: datetime, hours: int, minutes: int) -> datetime:
    return d.replace(hour=hours, minute=minutes, second=0, microsecond=0)

def generate_schedule(
    places: List[Place],
    coords: List[Tuple[float, float]],
    order: List[int],
    start_date: datetime,
    active_hours: Dict[str, ActiveHours],
    durations_matrix: List[List[float]],
    base_durations_matrix: Optional[List[List[float]]] = None,
    historical_durations_matrix: Optional[List[List[float]]] = None
) -> List[ScheduleStop]:
    """
    Python Implementation of temporal schedule generation with traffic awareness.
    """
    schedule = []

    def get_active_params(dt: datetime):
        date_str = dt.strftime("%Y-%m-%d")
        default = {"start": {"hours": 8, "minutes": 0}, "end": {"hours": 20, "minutes": 0}}
        return active_hours.get(date_str, default)

    current_time = set_time_on_date(
        start_date, 
        get_active_params(start_date)["start"]["hours"], 
        get_active_params(start_date)["start"]["minutes"]
    )

    for i in range(len(order)):
        idx = order[i]
        place = places[idx]
        coord = coords[idx]

        # Forced Date Alignment (Ensure we skip to the correct day if requested)
        forced_date_str = place.get("forcedDate") or place.get("forced_date")
        if forced_date_str:
            try:
                # Handle YYYY-MM-DD or full ISO strings
                if 'T' in forced_date_str:
                    target_date = datetime.fromisoformat(forced_date_str.replace('Z', '+00:00')).date()
                else:
                    target_date = datetime.date(datetime.fromisoformat(forced_date_str))
                
                if current_time.date() < target_date:
                    params = get_active_params(datetime.combine(target_date, datetime.min.time()))
                    current_time = set_time_on_date(
                        datetime.combine(target_date, datetime.min.time()), 
                        params["start"]["hours"], 
                        params["start"]["minutes"]
                    )
            except (ValueError, TypeError):
                pass

        arrival_time = current_time

        if i > 0:
            prev_idx = order[i - 1]
            travel_minutes = durations_matrix[prev_idx][idx]
            arrival_time += timedelta(minutes=travel_minutes)

        params = get_active_params(arrival_time)
        day_start = set_time_on_date(arrival_time, params["start"]["hours"], params["start"]["minutes"])
        day_end = set_time_on_date(arrival_time, params["end"]["hours"], params["end"]["minutes"])

        if day_end <= day_start:
            day_end += timedelta(days=1)

        if arrival_time < day_start:
            arrival_time = day_start

        # If we arrived after the day ended, move to next day's start
        if arrival_time > day_end:
            arrival_time += timedelta(days=1)
            params = get_active_params(arrival_time)
            arrival_time = set_time_on_date(arrival_time, params["start"]["hours"], params["start"]["minutes"])
            day_end = set_time_on_date(arrival_time, params["end"]["hours"], params["end"]["minutes"])
            if day_end <= set_time_on_date(arrival_time, params["start"]["hours"], params["start"]["minutes"]):
                day_end += timedelta(days=1)

        # Hard Reservation Sync
        reservation = place.get("reservation_time")
        if reservation:
            if isinstance(reservation, str):
                try:
                    reservation = datetime.fromisoformat(reservation.replace('Z', '+00:00'))
                except (ValueError, TypeError):
                    reservation = None
            
            if isinstance(reservation, datetime) and arrival_time < reservation:
                arrival_time = reservation
                # Update day bounds for the new arrival time
                params = get_active_params(arrival_time)
                day_end = set_time_on_date(arrival_time, params["end"]["hours"], params["end"]["minutes"])
                if day_end <= set_time_on_date(arrival_time, params["start"]["hours"], params["start"]["minutes"]):
                    day_end += timedelta(days=1)

        visit_start = arrival_time
        visit_duration = place.get("visit_duration", 60)
        visit_end = visit_start + timedelta(minutes=visit_duration)

        # If the visit itself exceeds the day, move the whole visit to tomorrow
        if visit_end > day_end:
            arrival_time += timedelta(days=1)
            params = get_active_params(arrival_time)
            visit_start = set_time_on_date(arrival_time, params["start"]["hours"], params["start"]["minutes"])
            visit_end = visit_start + timedelta(minutes=visit_duration)

        current_time = visit_end

        # V8.2: Live vs Historical Delay Calculation
        hist_mins = 0
        if i > 0 and historical_durations_matrix:
            hist_mins = historical_durations_matrix[prev_idx][idx]
        elif i > 0:
            hist_mins = durations_matrix[prev_idx][idx]

        traffic_delay = 0
        if i > 0 and historical_durations_matrix:
            # Delay is Live Time minus Usual Time. 
            # Can be negative if it's faster than usual!
            traffic_delay = durations_matrix[prev_idx][idx] - historical_durations_matrix[prev_idx][idx]

        schedule.append({
            "id": place.get("id") or f"stop-{i}",
            "place": place["name"],
            "latlon": coord,
            "arrival": visit_start.isoformat(),
            "departure": visit_end.isoformat(),
            "day": visit_start.strftime("%A"),
            "date": visit_start.strftime("%Y-%m-%d"),
            "time": visit_start.strftime("%H:%M"),
            "isReservation": bool(place.get("reservation_time")),
            "travelMinutes": durations_matrix[prev_idx][idx] if i > 0 else 0,
            "trafficDelayMinutes": traffic_delay,
            "historicalMinutes": hist_mins
        })

    return schedule

