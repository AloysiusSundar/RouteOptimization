# 🗺️ Yathirai: AI-Driven Route Optimization Platform

Yathirai (formerly TripIt) is a high-performance travel planning and route optimization engine. It solves the **Traveling Salesperson Problem with Time Windows (TSPTW)**, providing users with hyper-optimized, multi-day itineraries backed by real-time traffic data and semantic AI intelligence.

Built on a decoupled microservice architecture, Yathirai leverages a **Next.js/TypeScript** thick-client for fluid, 60 FPS geospatial rendering, while offloading NP-hard optimization matrices and LLM orchestration to a dedicated **Python/FastAPI** backend.

## ✨ Core Architecture & Features

### 1. Deterministic Time-Window Routing (TSPTW)
Standard routing engines optimize purely for spatial distance; Yathirai treats time as a strict topological dimension. The core Held-Karp dynamic programming solver locks hard bookings (e.g., a 7:00 PM dinner reservation) into the execution matrix as immutable graph anchors. By executing parallel fetches against TomTom’s live traffic matrices, the engine mathematically guarantees wait-time efficiency and actively prevents transit delays from causing schedule drift.

### 2. Geospatial Load Balancing (Multi-Day Partitioning)
To bypass the $O(n^2 \cdot 2^n)$ exponential complexity of massive itineraries, the partitioning layer pre-processes geographic POIs through a radial clustering algorithm. It dynamically segments high-density markers into logical "Daily Sectors," utilizing the user's accommodation as the priority centroid anchor. This constraint-aware clustering minimizes inter-daily travel overhead and enforces realistic travel pacing.

### 3. The Intelligence Pipeline (LLM & Vector Search)
Yathirai utilizes a dual-engine AI architecture to drive itinerary generation:
* **The Magic Parser:** An LLM agent extracts entities, temporal constraints, and base coordinates directly from unstructured natural language (e.g., *"I want a 3-day relaxed trip to Paris with a dinner reservation at Le Meurice..."*).
* **Semantic Discovery:** Integrates Cohere AI (`embed-english-v3.0`) for high-dimensional vector similarity ranking, converting user intent into dynamic OpenStreetMap Overpass QL queries to surface context-aware, hyper-relevant locations.



## 🛠️ Technology Stack

**Frontend (Client Edge)**
* **Framework:** Next.js 16 (React 19)
* **Language:** TypeScript
* **Geospatial UI:** Leaflet, Globe.gl, Framer Motion
* **Styling:** Tailwind CSS (v4)

**Backend (Optimization Microservice)**
* **Framework:** FastAPI (Python)
* **Intelligence:** Gemini 1.5 Flash (NLP), Cohere V3 (Ranking)
* **Algorithms:** Deterministic Held-Karp TSP Solver, Radial Clustering (NumPy/SciPy)

**Data Orchestration**
* **Routing & Geocoding:** OpenRouteService (ORS)
* **Traffic & Durations:** TomTom API
* **Data Enrichment:** Wikimedia API, OpenWeather



## 🚀 Getting Started

### Prerequisites
* Node.js 18+
* Python 3.10+
* API Keys for: OpenRouteService, TomTom, Cohere AI

### 1. Environment Setup
Clone the repository and set up your environment variables. 
Copy the provided `.example_env.local` to `.env.local` in the root directory and populate your keys:
```bash
cp .example_env.local .env.local
```

Required keys in `.env.local`:
- `ORS_API_KEY`
- `TOMTOM_API_KEY`
- `COHERE_API_KEY`
- `GEMINI_API_KEY`
- `OPENWEATHER_API_KEY`
The Python engine handles the heavy routing matrices and AI parsing.
```bash
cd api
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
fastapi dev index.py --port 8080
```
*The API will be available at `http://localhost:8080`*

### 3. Start the Next.js Frontend
In a new terminal window, start the frontend client.
```bash
npm install
npm run dev
```
*The application will be available at `http://localhost:3000`*

---

## 📂 Project Structure

```text
├── api/                        # Python FastAPI Backend
│   ├── clients/                # TomTom, ORS, Cohere, Weather integrations
│   ├── engine/                 # NP-Hard Math & AI Logic
│   │   ├── tsp_solver.py       # Held-Karp Dynamic Programming implementation
│   │   ├── schedule.py         # Multi-day timeline & duration logic
│   │   ├── clusterer.py        # Radial multi-day spatial partitioning
│   │   ├── magic_parser.py     # LLM natural language extraction
│   │   └── cache_manager.py    # Multi-user plan persistence layer
│   └── index.py                # FastAPI routing and endpoints
├── src/                        # Next.js Frontend
│   ├── app/                    # App Router (Pages & Layouts)
│   ├── components/             # React components (Map Component, Timeline)
│   └── lib/                    # Client-side utilities and types
└── TECHNICAL_OVERVIEW.md       # Deep-dive into system architecture
```

---
*Designed and engineered for algorithmic precision and zero-latency exploration.*
```