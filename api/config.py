import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    # API Keys
    ORS_API_KEY: str
    GEMINI_API_KEY: str
    COHERE_API_KEY: str
    TOMTOM_API_KEY: str
    OPENWEATHER_API_KEY: str
    
    # App Settings
    CORS_ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    
    # Environment loading configuration
    # Note: Vercel production sets these in the dashboard, 
    # but for local dev we look at .env.local in the root.
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env.local"),
        env_file_encoding='utf-8',
        extra='ignore'
    )

# Instantiate as a singleton
settings = Settings()
