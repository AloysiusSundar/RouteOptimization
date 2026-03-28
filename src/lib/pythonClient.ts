/**
 * pythonClient.ts (V1.0 - Vercel Unified Backend Client)
 * This client bridges the Next.js frontend with the Python (FastAPI) engine.
 */

export interface PlanInput {
  baseCity: string;
  accommodation: string;
  accommodationCoords?: [number, number] | null;
  startDate: string;
  tripLength: number;
  places: any[];
  transportMode: string;
  activeHours: Record<string, any>;
}

export interface PlanResult {
  schedule: any[];
  routeGeoJson: Record<string, any>;
  orderedCoords: [number, number][];
}

export async function planTripWithPython(input: PlanInput): Promise<PlanResult> {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to plan trip with Python engine.');
  }

  return response.json();
}

export async function recommendWithPython(lat: number, lon: number, interest: string): Promise<any[]> {
  const response = await fetch(`/api/recommend?lat=${lat}&lon=${lon}&interest=${encodeURIComponent(interest)}`);
  if (!response.ok) throw new Error('Recommendation fail.');
  return response.json();
}

export async function enrichWithPython(name: string, lat: number, lon: number): Promise<any> {
  const response = await fetch(`/api/enrich?name=${encodeURIComponent(name)}&lat=${lat}&lon=${lon}`);
  if (!response.ok) throw new Error('Enrichment fail.');
  return response.json();
}

export async function getAutocompleteWithPython(text: string, lat?: number, lon?: number): Promise<any[]> {
  const url = lat !== undefined && lon !== undefined
    ? `/api/autocomplete?text=${encodeURIComponent(text)}&lat=${lat}&lon=${lon}`
    : `/api/autocomplete?text=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  return response.json();
}

export async function getGeocodeWithPython(text: string): Promise<[number, number] | null> {
  const response = await fetch(`/api/geocode?text=${encodeURIComponent(text)}`);
  if (!response.ok) return null;
  const data = await response.json();
  return [data.lat, data.lon];
}

export async function getWeatherWithPython(lat: number, lon: number): Promise<any | null> {
  const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!response.ok) return null;
  return response.json();
}

export async function parseMagicPromptWithPython(prompt: string): Promise<any> {
  const response = await fetch('/api/magic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'AI Magic extraction failed.');
  }

  return response.json();
}
