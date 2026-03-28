from typing import List, Tuple, Dict, Optional
from datetime import datetime
import numpy as np

def count_bits(n: int) -> int:
    return bin(n).count('1')

def optimize_route(
    coords: List[Tuple[float, float]],
    durations: List[List[float]],
    places: Optional[List[Dict]] = None,
    fixed_start: bool = False,
    start_minutes: float = 480.0, # Default to 8:00 AM if not provided
) -> Dict:
    """
    Python Implementation of Held-Karp TSP with Time Windows (TSPTW).
    Identifies the shortest path that satisfies all reservation constraints
    given traffic-affected durations and visit durations.
    """
    n = len(coords)
    if n == 0:
        return {"optimized_coords": [], "order": []}
    if n == 1:
        return {"optimized_coords": [coords[0]], "order": [0]}

    # visit_durations map
    visit_durations = [0.0] * n
    if places:
        for idx in range(min(n, len(places))):
            visit_durations[idx] = float(places[idx].get("visit_duration", 0.0))

    # Pre-parse reservation times into "minutes from midnight"
    reservation_windows: List[Optional[float]] = [None] * n
    if places:
        for idx in range(min(n, len(places))):
            res_val = places[idx].get("reservation_time")
            if res_val:
                # Handle iso string or datetime object
                try:
                    dt = None
                    if isinstance(res_val, str):
                        dt = datetime.fromisoformat(res_val.replace('Z', '+00:00'))
                    elif isinstance(res_val, datetime):
                        dt = res_val
                    
                    if dt:
                        reservation_windows[idx] = dt.hour * 60 + dt.minute
                except Exception:
                    pass

    # dp map -> key: (mask, node), value: (finish_time, prev_node)
    # finish_time is the earliest minutes-from-midnight you finish visiting the node
    dp: Dict[Tuple[int, int], Tuple[float, int]] = {}

    TRAFFIC_BUFFER = 5.0 # 5 minute safety buffer

    if fixed_start:
        # Day starts at node 0 (Stay Location) at 'start_minutes'
        # Stay location visit_duration is usually 0 here as we just 'leave' it
        dp[(1 << 0, 0)] = (start_minutes + visit_durations[0], -1)
    else:
        for i in range(n):
            dp[(1 << i, i)] = (start_minutes + visit_durations[i], -1)

    for size in range(2, n + 1):
        for mask in range(1, 1 << n):
            if count_bits(mask) == size:
                for j in range(n):
                    if not (mask & (1 << j)):
                        continue
                    
                    prev_mask = mask ^ (1 << j)
                    res_j = reservation_windows[j]
                    
                    min_finish = float('inf')
                    best_prev_node = -1

                    for k in range(n):
                        if (prev_mask & (1 << k)):
                            val = dp.get((prev_mask, k))
                            if val is not None:
                                finish_k = val[0]
                                travel_k_j = durations[k][j]
                                
                                arrival_j = finish_k + travel_k_j
                                
                                # Safety Constraint: Are we late for reservation j?
                                if res_j is not None and (arrival_j > res_j + TRAFFIC_BUFFER):
                                    continue # This path is invalid
                                
                                # Start j: Can't start before arrival, and can't start before reservation
                                start_j = max(arrival_j, res_j if res_j is not None else 0.0)
                                finish_j = start_j + visit_durations[j]
                                
                                if finish_j < min_finish:
                                    min_finish = finish_j
                                    best_prev_node = k
                    
                    if best_prev_node != -1:
                        dp[(mask, j)] = (min_finish, best_prev_node)

    full_mask = (1 << n) - 1
    min_total_finish = float('inf')
    end_node = -1

    for j in range(n):
        val = dp.get((full_mask, j))
        if val is not None and val[0] < min_total_finish:
            min_total_finish = val[0]
            end_node = j

    if end_node == -1:
        # Fallback if hard constraints were impossible for ALL paths (rare)
        # In this case, just return the most reasonable greedy or sequential order
        print("⚠️ TSPTW: No path found satisfying all hard reservation windows. Falling back.")
        return {"optimized_coords": coords, "order": list(range(n))}

    path = []
    curr_mask = full_mask
    curr_node = end_node
    while curr_node != -1:
        path.append(curr_node)
        val = dp.get((curr_mask, curr_node))
        prev_node = val[1] if val else -1
        curr_mask = curr_mask ^ (1 << curr_node)
        curr_node = prev_node

    path.reverse()
    optimized_coords = [coords[i] for i in path]
    return {"optimized_coords": optimized_coords, "order": path}
