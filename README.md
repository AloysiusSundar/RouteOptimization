<h1 align="center">🗺️ RouteOptimization (TripIt)</h1>
<p align="center"><strong>Plan Less. Do More. AI-Powered Smart Itineraries.</strong></p>

---

## 🚀 The Multi-Engine Evolution
This project has evolved from a simple Python prototype into a high-performance, secure, and AI-driven web application.

### 🌟 Modern Engine (`next-app`)
The core of the project is now a **Next.js 15+** application designed for speed and security.
- **AI Core**: Integrates **Gemini 1.5 Flash** for natural language itinerary parsing. Just type "3 days in Paris next week" and watch the magic.
- **Security First**: Zero client-side API keys. All OpenRouteService (ORS) and Gemini calls are routed through **Next.js Server Actions** and API routes.
- **Performance**: Consolidated API calls reduce network overhead by 80% using multi-stop routing logic.
- **Smart Proximity**: Intent-aware search biases destinations towards your "Base City" automatically.

### 🧪 Legacy Prototype (`apppp.py`)
The original concept was built with **Streamlit** and Python. It remains in the root as a "proof of concept" and a reference for the original routing logic.
- [Launch Legacy App](https://routeoptimization-g5dtxtcww9vgnmnrudnf78.streamlit.app/)

---

## ✨ Features
- ✅ **Natural Language Parsing**: Extract full trips from a single paragraph of text.
- ✅ **Held-Karp Optimization**: Advanced TSP (Traveling Salesperson Problem) solver for the most efficient stop ordering.
- ✅ **Real-Time Map**: Dynamic Leaflet integration with optimized route polylines.
- ✅ **Smart Scheduling**: Handles visit durations, arrival/departure times, and multi-day planning.

---

## 🛠️ Stack
- **Frontend**: Next.js 15 (App Router), TypeScript, Framer Motion, Lucide.
- **Maps & Routing**: Leaflet, OpenRouteService API.
- **AI**: Google Gemini API.
- **Legacy**: Streamlit, Folium, Geopy.

---

## 🔐 Security Note
This project follows strict security standards:
- **No Client-Side Keys**: `ORS_API_KEY` and `GEMINI_API_KEY` are stored in `.env.local` and never exposed to the browser.
- **Server Actions**: All external API communication happens on the server.

---

## 🚦 Getting Started (Next.js)

1. Navigate to the `next-app` folder:
```bash
cd next-app
```
2. Install dependencies:
```bash
npm install
```
3. Create a `.env.local` file with your keys:
```env
ORS_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```
4. Start the engine:
```bash
npm run dev
```

---

<p align="center"><i>Smart routes. Better trips. Built for the modern traveler.</i></p>
