from cachetools import TTLCache, LRUCache
from typing import Any, Optional
import time

# V8.5: Multi-Layer Caching Engine
# Cache levels are sized by 'number of entries' and 'seconds to live'

# 📍 Geocoding Cache (Cities, Landmarks) - 1 Hour TTL
# Sized at 512 entries to cover most user searches in a session
geo_cache = TTLCache(maxsize=512, ttl=3600)

# 🏛️ POI Insight Cache (Wikipedia descriptions) - 24 Hour TTL
# Descriptions are static, so we can cache them for a long time
wiki_cache = TTLCache(maxsize=256, ttl=86400)

# 🪄 AI Magic Parser Cache (Structured Trip Plans) - 30 Day TTL
# LLM outputs for common prompts are very static. 
magic_cache = TTLCache(maxsize=248, ttl=2592000)

# 🚥 Traffic Cache (Duration Matrices, Leg Summaries) - 5 Minute TTL
# Short TTL reflects the dynamic nature of traffic while preventing
# redundant API hits during dashboard switching/re-planning.
traffic_cache = TTLCache(maxsize=128, ttl=300)

def get_cached_item(cache: TTLCache, key: str) -> Optional[Any]:
    """Retrieves an item from the specific cache if it exists and hasn't expired."""
    try:
        val = cache.get(key)
        if val is not None:
            print(f"DEBUG: [Cache Hit] Key: {key[:30]}...")
        return val
    except Exception:
        return None

def set_cached_item(cache: TTLCache, key: str, value: Any):
    """Stores an item in the specific cache."""
    try:
        cache[key] = value
    except Exception as e:
        print(f"DEBUG: [Cache Set Error] {e}")

def clear_all_caches():
    """Manual trigger to clear all memory (e.g., on settings change)"""
    geo_cache.clear()
    wiki_cache.clear()
    magic_cache.clear()
    traffic_cache.clear()
    print("DEBUG: All backend caches cleared.")
