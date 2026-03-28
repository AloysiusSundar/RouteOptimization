import requests
import json
from datetime import datetime
from typing import Dict, Any, Optional
from ..config import settings
from .cache_manager import magic_cache, get_cached_item, set_cached_item

# V8.6: AI Magic Parser (FastAPI Implementation)
# Ported from Node.js with Dual-Model Fallback & Centralized Caching

def parse_magic_prompt(prompt: str) -> Dict[str, Any]:
    # Check Cache (30 Day TTL)
    cache_key = f"magic:{prompt.strip().lower()}"
    cached = get_cached_item(magic_cache, cache_key)
    if cached:
        return cached

    today = datetime.now().strftime("%Y-%m-%d")

    system_prompt = f"""
      You are an expert travel assistant. Extract structured itinerary data from the user's text.
      Return ONLY a JSON object. Do not include markdown formatting or extra text.
      
      Current date: {today}
      
      Rules:
      1. IDENTIFY THE BASE CITY/REGION (e.g., New York, Tokyo, London).
      2. IDENTIFY THE STAY LOCATION / HOTEL (e.g. "Hilton", "staying at my friend's place in Shinjuku").
         CRITICAL: Only populate stayLocation if the user explicitly names a hotel, apartment, or address. 
         IF the user only mentions the city (e.g. "Plan a trip to SF"), stayLocation MUST BE NULL or empty string.
         DO NOT set stayLocation to the name of the Base City itself.
      3. APPEND THE BASE CITY NAME TO EVERY PLACE NAME (e.g. "Met Museum" -> "Met Museum, NYC"). This is CRITICAL for geocoding accuracy.
      4. If the user mentions "tomorrow", "next week", etc., calculate based on {today}.
      5. Durations should be in minutes (default 60 if not specified).
      6. isReservation should be true ONLY if they clearly mention a booking, reservation, or fixed time.
      7. If reservationTime is mentioned, format as HH:MM.
      8. Output Schema:
      {{
        "startDate": "YYYY-MM-DD",
        "days": number,
        "baseCity": "string",
        "stayLocation": "string | null",
        "places": [
          {{ "name": "string", "duration": number, "isReservation": boolean, "reservationDate": "YYYY-MM-DD", "reservationTime": "HH:MM" }}
        ]
      }}
    """

    def call_gemini(model_name: str):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{
                "parts": [{"text": f"{system_prompt}\n\nUser text: {prompt}"}]
            }],
            "generationConfig": {
                "response_mime_type": "application/json"
            }
        }
        
        print(f"🤖 [Cache Miss] Calling Gemini {model_name}...")
        res = requests.post(url, headers=headers, json=payload, timeout=15)
        res.raise_for_status()
        return res.json()

    try:
        # V8.6: Custom User-Specific Model Names (as seen in route.ts)
        try:
            data = call_gemini("gemini-2.5-flash")
        except Exception:
            # Fallback to lite model
            data = call_gemini("gemini-3.1-flash-lite-preview")

        # Extract & Parse
        raw_text = data['candidates'][0]['content']['parts'][0]['text']
        # Clean up possible markdown noise
        clean_json = raw_text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean_json)

        # Cache Success
        set_cached_item(magic_cache, cache_key, result)
        return result

    except Exception as e:
        print(f"❌ AI Magic Parser Error: {e}")
        raise e
