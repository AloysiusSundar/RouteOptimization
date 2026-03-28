import math
from typing import List, Dict, Tuple, Optional
from datetime import datetime

class ClusterablePlace(dict):
    name: str
    coords: Optional[Tuple[float, float]]
    reservation_date: Optional[str] # YYYY-MM-DD
    is_reservation: bool

class ClusteredDay(dict):
    places: List[ClusterablePlace]
    indices: List[int]

def calculate_centroid(places: List[ClusterablePlace], fallback: Tuple[float, float]) -> Tuple[float, float]:
    active_places = [p for p in places if p.get("coords")]
    if not active_places:
        return fallback

    sum_lat = sum(p["coords"][0] for p in active_places)
    sum_lon = sum(p["coords"][1] for p in active_places)
    return (sum_lat / len(active_places), sum_lon / len(active_places))

def calculate_distance(c1: Tuple[float, float], c2: Tuple[float, float]) -> float:
    # Simple Euclidean distance for clustering (city-scale)
    dy = c1[0] - c2[0]
    dx = c1[1] - c2[1]
    return math.sqrt(dx * dx + dy * dy)

def cluster_places(
    places: List[ClusterablePlace],
    start_date: str,
    num_days: int,
    base_coords: Optional[Tuple[float, float]] = None
) -> List[ClusteredDay]:
    """
    Python Implementation of greedy centroid-based spatial partitioning.
    :param places: List of places with coords and reservation_date
    :param start_date: Trip start date (YYYY-MM-DD)
    :param num_days: Total days in trip
    :param base_coords: Anchor point (e.g., hotel/city center)
    """
    clusters = [{"places": [], "indices": []} for _ in range(num_days)]

    active_places_with_coords = [p for p in places if p.get("coords")]
    
    # Calculate global centroid as fallback
    global_centroid = calculate_centroid(active_places_with_coords, base_coords or (0, 0))

    trip_start = datetime.fromisoformat(start_date)
    unassigned_indices: List[int] = []

    # 1. Hard Reservation Assignment
    for idx, p in enumerate(places):
        if p.get("reservation_date") and p.get("is_reservation"):
            try:
                res_date = datetime.fromisoformat(p["reservation_date"])
                diff_days = (res_date - trip_start).days
                if 0 <= diff_days < num_days:
                    clusters[diff_days]["places"].append(p)
                    clusters[diff_days]["indices"].append(idx)
                    continue
            except ValueError:
                pass
        unassigned_indices.append(idx)

    # 2. Initial Seeding for Empty Days
    # Give empty days one unassigned spot to anchor its centroid
    for d in range(num_days):
        if len(clusters[d]["places"]) == 0 and unassigned_indices:
            seed_idx = unassigned_indices.pop(0)
            clusters[d]["places"].append(places[seed_idx])
            clusters[d]["indices"].append(seed_idx)

    # 3. Greedy Proximity Assignment for remaining spots
    for idx in unassigned_indices:
        p = places[idx]
        if not p.get("coords"):
            # Fallback for places without coords
            clusters[0]["places"].append(p)
            clusters[0]["indices"].append(idx)
            continue

        min_distance = float('inf')
        best_day = 0

        for day_idx, day in enumerate(clusters):
            # Centroid of the day
            centroid = calculate_centroid(day["places"], base_coords or global_centroid)
            dist = calculate_distance(p["coords"], centroid)
            
            # Load Balancing Adjustment (Imbalance Penalty)
            imbalance_penalty = len(day["places"]) * 0.005 # ~500m penalty per item
            adjusted_dist = dist + imbalance_penalty

            if adjusted_dist < min_distance:
                min_distance = adjusted_dist
                best_day = day_idx

        clusters[best_day]["places"].append(p)
        clusters[best_day]["indices"].append(idx)

    return clusters
