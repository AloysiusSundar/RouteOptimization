import streamlit as st
import folium
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
from datetime import datetime, timedelta, time
import numpy as np

st.set_page_config(page_title="Multi-Day Tour Planner with Reservations", layout="centered")

# --- Geocode function ---
geolocator = Nominatim(user_agent="tour_planner_app")

def geocode_location(place):
    try:
        location = geolocator.geocode(place)
        if location:
            return (location.latitude, location.longitude)
    except:
        return None
    return None

# --- Held-Karp TSP solver ---
def optimize_route(coords):
    n = len(coords)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            dist[i][j] = geodesic(coords[i], coords[j]).km

    dp = {}
    for i in range(n):
        dp[(1 << i, i)] = (0, -1)

    for size in range(2, n + 1):
        for mask in [m for m in range(1 << n) if bin(m).count('1') == size]:
            for j in range(n):
                if not (mask & (1 << j)):
                    continue
                prev_mask = mask ^ (1 << j)
                candidates = []
                for k in range(n):
                    if (prev_mask & (1 << k)) and (prev_mask, k) in dp:
                        cost = dp[(prev_mask, k)][0] + dist[k][j]
                        candidates.append((cost, k))
                if candidates:
                    dp[(mask, j)] = min(candidates, key=lambda x: x[0])

    full_mask = (1 << n) - 1
    min_cost, end_node = min((dp[(full_mask, j)][0], j) for j in range(n))

    path = []
    mask = full_mask
    node = end_node
    while node != -1:
        path.append(node)
        mask, node = mask ^ (1 << node), dp[(mask, node)][1]

    path.reverse()
    optimal_route = [coords[i] for i in path]
    return optimal_route, path

# --- Map creation ---
def create_map(coords):
    m = folium.Map(location=coords[0], zoom_start=13)
    for i, (lat, lon) in enumerate(coords):
        folium.Marker([lat, lon], tooltip=f"Stop {i+1}").add_to(m)
    folium.PolyLine(coords, color="blue").add_to(m)
    return m

# --- Schedule generator ---
def generate_schedule(places, coords, order, start_date, trip_length, active_hours_per_day):
    VISIT_DURATION_MINUTES = 60  # fixed 1 hour per visit for simplicity
    REST_DURATION_MINUTES = 30   # fixed 30 min rest if outside active hours
    TRAVEL_SPEED_KMPH = 40       # average speed

    schedule = []
    current_time = datetime.combine(start_date, active_hours_per_day[start_date][0])

    for i, idx in enumerate(order):
        place = places[idx]
        coord = coords[idx]

        if i == 0:
            arrival_time = current_time
        else:
            prev_coord = coords[order[i-1]]
            dist_km = geodesic(prev_coord, coord).km
            travel_minutes = dist_km / TRAVEL_SPEED_KMPH * 60
            arrival_time = current_time + timedelta(minutes=travel_minutes)

        day = arrival_time.date()
        if day not in active_hours_per_day:
            active_start, active_end = time(8,0), time(20,0)
        else:
            active_start, active_end = active_hours_per_day[day]

        day_start_dt = datetime.combine(day, active_start)
        day_end_dt = datetime.combine(day, active_end)
        if day_end_dt <= day_start_dt:
            day_end_dt += timedelta(days=1)

        if arrival_time < day_start_dt:
            arrival_time = day_start_dt
        if arrival_time > day_end_dt:
            next_day = day + timedelta(days=1)
            if next_day in active_hours_per_day:
                next_start = active_hours_per_day[next_day][0]
            else:
                next_start = time(8,0)
            arrival_time = datetime.combine(next_day, next_start)

        reservation = places[idx].get("reservation_time")
        if reservation:
            if arrival_time < reservation:
                arrival_time = reservation

        visit_start = arrival_time
        visit_end = visit_start + timedelta(minutes=VISIT_DURATION_MINUTES)

        if visit_end > day_end_dt:
            next_day = day + timedelta(days=1)
            if next_day in active_hours_per_day:
                next_start = active_hours_per_day[next_day][0]
            else:
                next_start = time(8,0)
            visit_end = datetime.combine(next_day, next_start) + timedelta(minutes=VISIT_DURATION_MINUTES)

        current_time = visit_end

        schedule.append({
            "place": place["name"],
            "latlon": coord,
            "arrival": visit_start,
            "departure": visit_end,
            "day": visit_start.strftime("%A"),
            "date": visit_start.strftime("%Y-%m-%d"),
            "time": visit_start.strftime("%H:%M"),
        })

    return schedule

# ==== Streamlit UI ====

st.title("🗓️ Multi-Day Tour Planner with Reservations and Active Hours")

# 1. Trip info
start_date = st.date_input("Trip Start Date", datetime.now().date())
trip_length = st.number_input("Trip Length (days)", min_value=1, max_value=30, value=3)

# 2. Active hours per day
st.markdown("### Set your active hours for each day")
active_hours_per_day = {}
for i in range(trip_length):
    day_date = start_date + timedelta(days=i)
    col1, col2 = st.columns(2)
    with col1:
        start_time = st.time_input(f"{day_date} Start Time", time(8,0), key=f"start_{i}")
    with col2:
        end_time = st.time_input(f"{day_date} End Time", time(20,0), key=f"end_{i}")
    active_hours_per_day[day_date] = (start_time, end_time)

# --- Reset button to clear all places ---
if "places_data" not in st.session_state:
    st.session_state.places_data = []

if st.button("Reset All Places"):
    st.session_state.places_data = []
    st.experimental_rerun()

# 3. Dynamic number of places input
st.markdown("### How many places do you want to visit?")
num_places = st.number_input("Number of places", min_value=1, max_value=20, value=len(st.session_state.places_data) or 1)

# 4. Dynamic input fields for each place
places_temp = []

with st.form(key="places_form"):
    for i in range(num_places):
        st.markdown(f"**Place #{i+1} details:**")
        place_name = st.text_input(f"Place Name #{i+1}", value=st.session_state.places_data[i]["name"] if i < len(st.session_state.places_data) else "", key=f"place_name_{i}")

        reservation_flag = st.checkbox(f"Is this place a reservation? (#{i+1})", value=(st.session_state.places_data[i]["reservation_time"] is not None if i < len(st.session_state.places_data) else False), key=f"reservation_flag_{i}")
        reservation_time = None
        if reservation_flag:
            reservation_date = st.date_input(
                f"Reservation Date #{i+1}",
                start_date,
                min_value=start_date,
                max_value=start_date + timedelta(days=trip_length - 1),
                key=f"reservation_date_{i}"
            )
            reservation_clock = st.time_input(f"Reservation Time #{i+1}", time(12, 0), key=f"reservation_clock_{i}")
            reservation_time = datetime.combine(reservation_date, reservation_clock)
        visit_duration = st.number_input(
            f"Visit duration (minutes) #{i+1}",
            min_value=10,
            max_value=240,
            value=st.session_state.places_data[i]["visit_duration"] if i < len(st.session_state.places_data) else 60,
            key=f"visit_duration_{i}"
        )
        places_temp.append({
            "name": place_name.strip(),
            "reservation_time": reservation_time,
            "visit_duration": visit_duration
        })
    submit_places = st.form_submit_button("Save Places")

if submit_places:
    # Filter empty names out and update session_state
    cleaned_places = [p for p in places_temp if p["name"] != ""]
    st.session_state.places_data = cleaned_places
    st.success(f"Saved {len(cleaned_places)} places.")

# Show saved places list
if st.session_state.places_data:
    st.markdown("### Places added so far:")
    for i, place in enumerate(st.session_state.places_data, 1):
        res_str = (
            f" (Reservation at {place['reservation_time'].strftime('%Y-%m-%d %H:%M')})"
            if place['reservation_time'] else ""
        )
        st.write(f"{i}. {place['name']}{res_str} - {place['visit_duration']} mins")
else:
    st.info("No places added yet. Please enter places above and click 'Save Places'.")

# Require at least 2 places
if len(st.session_state.places_data) < 2:
    st.warning("Add at least two places to plan a tour.")
    st.stop()

# Button to finalize places and plan the tour
if st.button("Finish adding places and plan tour"):
    places_data = st.session_state.places_data
else:
    st.stop()

if len(places_data) < 2:
    st.warning("Add at least two places to plan a tour.")
    st.stop()

# Geocode places and filter out failures
coords = []
valid_places = []
for place in places_data:
    coord = geocode_location(place["name"])
    if coord:
        coords.append(coord)
        valid_places.append(place)
    else:
        st.error(f"Could not geocode place: {place['name']}")

if len(coords) < 2:
    st.error("Need at least two geocoded places to optimize route.")
    st.stop()

# Optimize route
optimized_coords, order = optimize_route(coords)

# Generate schedule
schedule = generate_schedule(valid_places, coords, order, start_date, trip_length, active_hours_per_day)

# Display schedule
st.markdown("## 🗓️ Your Planned Tour Schedule")
for stop in schedule:
    st.write(f"**{stop['day']} {stop['date']} at {stop['time']}** - {stop['place']}")

# Show map
st.markdown("## 🗺️ Tour Map")
m = create_map(optimized_coords)
folium_static = st.components.v1.html(m._repr_html_(), height=500)
