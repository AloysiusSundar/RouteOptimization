import requests
from typing import Optional, Dict
from ..config import settings

def get_weather_data(lat: float, lon: float) -> Optional[Dict]:
    """
    Fetches weather data from OpenWeatherMap for a given lat/lon.
    """
    try:
        response = requests.get(
            f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={settings.OPENWEATHER_API_KEY}&units=metric"
        )
        if not response.ok:
            print(f"DEBUG: Weather API error: {response.status_code}")
            return None
        
        data = response.json()
        
        return {
            "temp": round(data["main"]["temp"]),
            "description": data["weather"][0]["description"],
            "iconCode": data["weather"][0]["icon"][:2],
            "location": data.get("name", "Unknown")
        }
    except Exception as e:
        print(f"DEBUG: Error fetching weather: {e}")
        return None
