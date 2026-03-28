import os
import requests
import json
from typing import List, Dict, Optional
import numpy as np

# Intent -> OSM tag mapping
INTENT_TO_TAGS = {
    "beach": [
        {"key": "natural", "value": "beach"},
        {"key": "leisure", "value": "beach_resort"}
    ],
    "park": [
        {"key": "leisure", "value": "park|garden"}
    ],
    "museum": [
        {"key": "tourism", "value": "museum|gallery"}
    ],
    "temple": [
        {"key": "amenity", "value": "place_of_worship"},
        {"key": "building", "value": "cathedral|church|chapel|temple|shrine|mosque"}
    ],
    "attraction": [
        {"key": "tourism", "value": "attraction|viewpoint|theme_park"}
    ],
    "historic": [
        {"key": "historic", "value": "monument|memorial|landmark|heritage|castle|palace|ruins"},
        {"key": "building", "value": "civic|castle|palace"}
    ]
}

def detect_intent(query: str) -> str:
    q = query.lower()
    if any(k in q for k in ["beach"]): return "beach"
    if any(k in q for k in ["park", "garden"]): return "park"
    if any(k in q for k in ["museum", "gallery"]): return "museum"
    if any(k in q for k in ["temple", "church", "cathedral", "shrine", "mosque"]): return "temple"
    if any(k in q for k in ["historic", "monument", "gothic", "castle", "palace", "architecture"]): return "historic"
    return "attraction"

def build_overpass_query(lat: float, lon: float, radius: int, intent: str) -> str:
    tag_rules = INTENT_TO_TAGS.get(intent, INTENT_TO_TAGS["attraction"])
    queries = "\n".join([
        f'node["{rule["key"]}"~"{rule["value"]}"](around:{radius}, {lat}, {lon});\n'
        f'way["{rule["key"]}"~"{rule["value"]}"](around:{radius}, {lat}, {lon});'
        for rule in tag_rules
    ])

    timeout_val = 180 if radius >= 100000 else 90
    limit_str = "out center 500;" if radius >= 30000 else "out center;"

    return f"""
    [out:json][timeout:{timeout_val}];
    (
      {queries}
    );
    {limit_str}
    """

def fetch_nearby_pois(lat: float, lon: float, interest: str, radius: int = 3000, retry_count: int = 0) -> List[Dict]:
    intent = detect_intent(interest)
    query = build_overpass_query(lat, lon, radius, intent)

    try:
        response = requests.post('https://overpass-api.de/api/interpreter', data=query, timeout=185)
        if response.status_code != 200:
            if retry_count < 3:
                next_rad = [30000, 100000, 1000000][retry_count]
                return fetch_nearby_pois(lat, lon, interest, next_rad, retry_count + 1)
            return []

        data = response.json()
        mapped = []
        for el in data.get('elements', []):
            tags = el.get('tags', {})
            poi = {
                "id": el.get('id'),
                "name": tags.get('name') or tags.get('operator') or tags.get('tourism') or "Unknown",
                "lat": el.get('lat') or (el.get('center', {}).get('lat')),
                "lon": el.get('lon') or (el.get('center', {}).get('lon')),
                "tags": tags,
                "opening_hours": tags.get('opening_hours'),
                "website": tags.get('website') or tags.get('contact:website')
            }
            if poi["name"] != "Unknown" and poi["lat"] and poi["lon"]:
                mapped.append(poi)

        if not mapped and retry_count < 3:
            next_rad = [30000, 100000, 1000000][retry_count]
            return fetch_nearby_pois(lat, lon, interest, next_rad, retry_count + 1)

        return mapped
    except Exception as e:
        if retry_count < 3:
            next_rad = [30000, 100000, 1000000][retry_count]
            return fetch_nearby_pois(lat, lon, interest, next_rad, retry_count + 1)
        return []

def rank_pois_heuristic(pois: List[Dict], interest: str) -> List[Dict]:
    query = interest.lower()
    for poi in pois:
        name = poi.get("name", "").lower()
        tags = str(poi.get("tags", {})).lower()
        score = 0
        if query in name: score += 8
        if query in tags: score += 5

        terms = [t for t in query.split() if len(t) > 2]
        for term in terms:
            if term in name: score += 3
            if term in tags: score += 2

        if poi.get("tags", {}).get("tourism"):
            score += 1
        poi["score"] = score

    return sorted(pois, key=lambda x: x.get("score", 0), reverse=True)

def rank_pois_with_cohere(pois: List[Dict], interest: str, api_key: str) -> List[Dict]:
    if not api_key:
        return rank_pois_heuristic(pois, interest)

    try:
        import cohere
        co = cohere.Client(api_key)
        
        query = interest or 'Top attractions'
        documents = [
            f"{poi['name']}. {poi['tags'].get('tourism', '')} {poi['tags'].get('historic', '')} {poi['tags'].get('description', '')}".strip()
            for poi in pois
        ]

        # Cohere v3 Embeddings
        query_response = co.embed(
            texts=[query],
            model="embed-english-v3.0",
            input_type="search_query"
        )
        doc_response = co.embed(
            texts=documents,
            model="embed-english-v3.0",
            input_type="search_document"
        )

        query_vector = np.array(query_response.embeddings[0])
        doc_vectors = np.array(doc_response.embeddings)

        # Dot product for similarity
        scores = np.dot(doc_vectors, query_vector)

        for i, poi in enumerate(pois):
            poi["score"] = float(scores[i])

        return sorted(pois, key=lambda x: x.get("score", 0), reverse=True)
    except Exception as e:
        print(f"Cohere Error: {e}")
        return rank_pois_heuristic(pois, interest)
