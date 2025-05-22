import streamlit as st
import folium
from itertools import permutations
from geopy.geocoders import Nominatim
from geopy.distance import geodesic
import numpy as np

# Setup geolocator
geolocator = Nominatim(user_agent="tour_planner")

# Functions
def geocode_locations(places):
    valid_places = []
    coords = []

    for place in places:
        try:
            location = geolocator.geocode(place)
            if location:
                coords.append((location.latitude, location.longitude))
                valid_places.append(place)
            else:
                st.warning(f"⚠️ Could not geocode: {place}")
        except:
            st.warning(f"⚠️ Error occurred while geocoding: {place}")
            continue

    return valid_places, coords


def route_distance(route):
    distance = 0
    for i in range(len(route) - 1):
        distance += geodesic(route[i], route[i+1]).km
    return distance

def optimize_route(coords):
    n = len(coords)
    dist = np.zeros((n, n))
    
    # Build distance matrix
    for i in range(n):
        for j in range(n):
            if i != j:
                dist[i][j] = geodesic(coords[i], coords[j]).km

    # Held-Karp DP
    dp = {}
    for i in range(n):
        dp[(1 << i, i)] = (0, -1)

    for mask in range(1 << n):
        for j in range(n):
            if not (mask & (1 << j)):
                continue
            prev_mask = mask ^ (1 << j)
            best = (float('inf'), -1)
            for k in range(n):
                if (prev_mask & (1 << k)) and (prev_mask, k) in dp:
                    new_cost = dp[(prev_mask, k)][0] + dist[k][j]
                    if new_cost < best[0]:
                        best = (new_cost, k)
            if best[0] < float('inf'):
                dp[(mask, j)] = best

    # Find minimum cost among all possible end nodes
    full_mask = (1 << n) - 1
    min_cost, end = min((dp[(full_mask, j)][0], j) for j in range(n))

    # Reconstruct path
    path = []
    mask = full_mask
    current = end
    while current != -1:
        path.append(current)
        mask, current = mask ^ (1 << current), dp[(mask, current)][1]

    path.reverse()
    optimal_route = [coords[i] for i in path]
    return optimal_route, path


def create_map(coords):
    m = folium.Map(location=coords[0], zoom_start=13)
    for i, (lat, lon) in enumerate(coords):
        folium.Marker([lat, lon], tooltip=f"Stop {i+1}").add_to(m)
    folium.PolyLine(coords, color="blue").add_to(m)
    return m

# Streamlit UI
st.set_page_config(page_title="Tour Planner", layout="centered")
st.title("🗺️ Tour Planner App")
st.write("Enter the places you want to visit in a city, and get the most optimal route!")

city = st.text_input("Enter the city:", "Paris")
places_input = st.text_area("Enter the places you want to visit (one per line):")

if st.button("Plan Tour"):
    places = [place.strip() + ", " + city for place in places_input.split("\n") if place.strip()]
    st.write("🔍 Geocoding locations...")
    valid_places, coords = geocode_locations(places)

    if len(coords) < 2:
        st.error("Need at least two valid locations to plan a route.")
    else:
        st.write("📍 Optimizing route...")
        optimized_coords, order = optimize_route(coords)

        st.write("✅ Optimized order of visit:")
        for i, index in enumerate(order):
            st.markdown(f"{i+1}. {valid_places[index]}")

        st.write("🗺️ Route Map:")
        route_map = create_map(optimized_coords)
        st.components.v1.html(route_map._repr_html_(), height=600, scrolling=False)
