# 🚀 Route Optimization Setup & Usage Guide

This guide covers how to run the **FastAPI Python Backend** and the **Next.js Frontend** for the Route Optimization engine.

---

### 🛠️ Prerequisites
- Python 3.10+
- Node.js 18+ (LTS)
- API Keys: Gemini, TomTom, OpenRouteService (ORS), Cohere, OpenWeather.

---

### 🐍 Step 1: Start the Python Backend (FastAPI)
The backend handles the AI Magic Parser, traffic-aware scheduling, and POI enrichment.

1. Open a terminal at the project root.
2. Activate your virtual environment:
   ```bash
   .\venv\Scripts\activate
   ```
3. Run the backend server on port **8080**:
   ```bash
   uvicorn api.index:app --reload --port 8080
   ```
*The backend is live at `http://127.0.0.1:8080`.*

---

### ⚛️ Step 2: Start the Next.js Frontend
The frontend handles the interactive map and itinerary management.

1. Open a **second** terminal at the project root.
2. Install dependencies (if you haven't recently):
   ```bash
   npm install
   ```
3. Start the dev server on port **3000**:
   ```bash
   npm run dev
   ```
*The app is live at `http://localhost:3000`.*

---

### ⚙️ 3. Configuration (`.env.local`)
Create a `.env.local` file in the root if it doesn't exist:
```env
GEMINI_API_KEY=your_key_here
TOMTOM_API_KEY=your_key_here
ORS_API_KEY=your_key_here
COHERE_API_KEY=your_key_here
OPENWEATHER_API_KEY=your_key_here
```

---

### 🗃️ Key Architecture Notes (V8.6)
- **AI Magic Caching**: Trip parsing results are cached for **30 days** in the Python backend.
- **Traffic Scaling**: Supports up to **50 stops** per trip using TomTom Route Summaries.
- **Port 8080**: The frontend is set up to specifically talk to the backend on port 8080.
- **Node-to-Node Context**: Live traffic vs. historical "usual" travel time is calculated per leg.
