'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Place as SchedulePlace, ScheduleStop, generateSchedule, ActiveHours } from '@/lib/ScheduleGenerator';
import { optimizeRoute } from '@/lib/TspSolver';
import { getCoordinates, getDurationsMatrix, getRoutePolyline, getAutocompleteSuggestions } from '@/lib/orsClient';
import { Loader2, Search, Wand2, Sparkles, ChevronDown, MapPin, Plus, Sparkle } from 'lucide-react';
import { fetchNearbyPOIs, rankPOIs, POI } from '@/lib/RecommendationEngine';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

interface UIPlace extends SchedulePlace {
  is_reservation: boolean;
  reservation_date: string; // YYYY-MM-DD
  reservation_clock: string; // HH:MM
  coords?: [number, number]; // Optimized: store coords from autocomplete
}

export default function Home() {
  const today = new Date().toISOString().split('T')[0];
  
  const [places, setPlaces] = useState<UIPlace[]>([
    { name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' },
    { name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' }
  ]);
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<{name: string, label: string, coords: [number, number]}[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [startDate, setStartDate] = useState<string>(today);
  const [tripLength, setTripLength] = useState<number>(3);
  const [baseCity, setBaseCity] = useState<string>('');
  const [baseCityCoords, setBaseCityCoords] = useState<[number, number] | null>(null);
  const [activeHours, setActiveHours] = useState<Record<string, ActiveHours>>({});
  
  const [isPlanning, setIsPlanning] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleStop[] | null>(null);
  const [mapCoords, setMapCoords] = useState<[number, number][]>([]);
  const [routeGeoJson, setRouteGeoJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [isHoursOpen, setIsHoursOpen] = useState(true);
  const [recommendations, setRecommendations] = useState<POI[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);
  const [interest, setInterest] = useState('Top tourist attractions, museums, and historical landmarks');

  // Base City Geocoding (Debounced)
  useEffect(() => {
    if (!baseCity || baseCity.length < 3) {
      setBaseCityCoords(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const coords = await getCoordinates(baseCity);
        if (coords) setBaseCityCoords(coords);
      } catch (err) {
        console.warn('Silent fail geocoding base city for focus:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [baseCity]);

  // Autocomplete debouncing
  useEffect(() => {
    if (activeSearchIdx === null) {
      setSuggestions([]);
      return;
    }

    const name = places[activeSearchIdx].name;
    if (!name || name.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      // Bias towards existing stops OR the current Base City
      const bias = places.find(p => p.coords)?.coords || baseCityCoords || undefined;
      const results = await getAutocompleteSuggestions(name, bias);
      setSuggestions(results);
      setSearchLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [activeSearchIdx, places, baseCityCoords]);

  const handleSelectSuggestion = (idx: number, suggestion: {name: string, label: string, coords: [number, number]}) => {
    const newPlaces = [...places];
    newPlaces[idx] = { 
      ...newPlaces[idx], 
      name: suggestion.name, 
      coords: suggestion.coords 
    };
    setPlaces(newPlaces);
    setActiveSearchIdx(null);
    setSuggestions([]);
  };

  useEffect(() => {
    const newActiveHours: Record<string, ActiveHours> = { ...activeHours };
    for (let i = 0; i < tripLength; i++) {
       const d = new Date(startDate + "T00:00:00");
       d.setDate(d.getDate() + i);
       const dateStr = d.toISOString().split('T')[0];
       if (!newActiveHours[dateStr]) {
         newActiveHours[dateStr] = { start: { hours: 8, minutes: 0 }, end: { hours: 20, minutes: 0 } };
       }
    }
    setActiveHours(newActiveHours);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripLength, startDate]);

  const handleActiveHoursChange = (dateStr: string, field: 'start' | 'end', timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    setActiveHours(prev => ({
       ...prev,
       [dateStr]: {
          ...prev[dateStr],
          [field]: { hours, minutes }
       }
    }));
  };

  const handleAddPlace = () => {
    setPlaces([...places, { name: '', visit_duration: 60, is_reservation: false, reservation_date: startDate, reservation_clock: '12:00' }]);
  };

  const handleAddRecommended = (poi: POI) => {
    setPlaces([...places, { 
      name: poi.name, 
      visit_duration: 120, 
      is_reservation: false, 
      reservation_date: startDate, 
      reservation_clock: '12:00',
      coords: [poi.lat, poi.lon]
    }]);
    setRecommendations(prev => prev.filter(p => p.id !== poi.id));
  };

  const handleDiscover = async () => {
    if (!baseCity) {
      setError('Please specify a Base City first to discover local gems.');
      return;
    }
    setIsRecommending(true);
    setError(null);
    try {
      const cityCoords = await getCoordinates(baseCity);
      if (!cityCoords) throw new Error('Could not locate base city for recommendations.');
      
      const rawPois = await fetchNearbyPOIs(cityCoords[0], cityCoords[1]);
      const ranked = await rankPOIs(rawPois, interest);
      setRecommendations(ranked.slice(0, 5));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch recommendations.');
    } finally {
      setIsRecommending(false);
    }
  };

  const handleRemovePlace = (index: number) => {
    if (places.length <= 2) return;
    setPlaces(places.filter((_, i) => i !== index));
  };

  const handlePlaceChange = (index: number, field: keyof UIPlace, value: any) => {
    const newPlaces = [...places];
    newPlaces[index] = { ...newPlaces[index], [field]: value } as UIPlace;
    setPlaces(newPlaces);
  };

  const handlePlanTour = async () => {
    try {
      setError(null);
      setIsPlanning(true);
      
      const validPlaces = places.filter(p => p.name.trim() !== '');
      if (validPlaces.length < 2) {
        throw new Error('Please add at least 2 destinations to plan a route.');
      }

      console.log('📍 Starting route optimization with places:', validPlaces.map(p => p.name));

      // Step 1: Establish Initial Focus
      let focus: [number, number] | undefined = undefined;
      
      // If base city is provided, geocode it first to lock the region
      if (baseCity.trim()) {
        const cityCoords = await getCoordinates(baseCity);
        if (cityCoords) {
           focus = cityCoords;
           console.log(`🌍 Base City Context Established: ${baseCity} @`, focus);
        }
      }

      const coords: [number, number][] = [];
      for (const place of validPlaces) {
        if (place.coords) {
          coords.push(place.coords);
          if (!focus) focus = place.coords;
        } else {
          console.log(`🔍 Geocoding ${place.name} with focus:`, focus);
          const c = await getCoordinates(place.name, focus);
          if (c) {
            coords.push(c);
            if (!focus) focus = c;
          }
        }
      } 
      const durations = await getDurationsMatrix(coords);
      console.log('⏱️ Durations Matrix (mins):', durations);

      const parsedPlaces = validPlaces.map(p => {
         let reservation_time: Date | null = null;
         if (p.is_reservation) {
            reservation_time = new Date(`${p.reservation_date}T${p.reservation_clock}:00`);
         }
         return { ...p, reservation_time };
      });
      
      const { optimizedCoords, order } = optimizeRoute(coords, durations, parsedPlaces);
      console.log('🚗 Optimized Order Indices:', order);
      console.log('🎯 Organized Coords:', optimizedCoords);

      const sched = generateSchedule(
        parsedPlaces,
        coords,
        order,
        new Date(startDate + "T00:00:00"),
        activeHours,
        durations
      );
      console.log('📅 Generated Schedule:', sched);

      console.log(`🗺️ Fetching full optimized route polyline for ${optimizedCoords.length} stops...`);
      const fullGeoJson = await getRoutePolyline(optimizedCoords);
      
      if (fullGeoJson && fullGeoJson.features) {
        console.log(`✅ Full route polyline fetched successfully`);
      } else {
        console.warn(`❌ Failed to fetch full route polyline`);
      }

      setMapCoords(optimizedCoords);
      setRouteGeoJson(fullGeoJson);
      setSchedule(sched);
    } catch (err: any) {
      setError(err.message || 'An error occurred while planning the tour.');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleAiParse = async () => {
    if (!aiInput.trim()) return;
    try {
      setIsAiParsing(true);
      setError(null);
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiInput })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.startDate) setStartDate(data.startDate);
      if (data.days) setTripLength(data.days);
      
      let focus: [number, number] | undefined = undefined;
      if (data.baseCity) {
        setBaseCity(data.baseCity);
        const cityCoords = await getCoordinates(data.baseCity);
        if (cityCoords) focus = cityCoords;
      } else if (baseCity) {
        const cityCoords = await getCoordinates(baseCity);
        if (cityCoords) focus = cityCoords;
      }

      if (data.places) {
        const verifiedPlaces: UIPlace[] = [];
        for (const p of data.places) {
          console.log(`🔍 AI Auto-Verifying: ${p.name}...`);
          const suggestions = await getAutocompleteSuggestions(p.name, focus);
          const bestMatch = suggestions[0];

          verifiedPlaces.push({
            name: bestMatch?.name || p.name,
            coords: bestMatch?.coords, // Lock in the coordinates immediately
            visit_duration: p.duration || 60,
            is_reservation: !!p.isReservation,
            reservation_date: p.reservationDate || data.startDate || startDate,
            reservation_clock: p.reservationTime || '12:00'
          });
        }
        setPlaces(verifiedPlaces);
      }
      setIsAiOpen(false);
      setAiInput('');
    } catch (err: any) {
      setError(err.message || 'AI failed to parse your text. Check your API key.');
    } finally {
      setIsAiParsing(false);
    }
  };

  return (
    <div className="flex overflow-hidden h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)] font-body">
      {/* SideNavBar Shell */}
      <aside className="h-screen w-64 fixed left-0 top-0 border-r border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)]/70 backdrop-blur-lg shadow-[40px_0_60px_-10px_rgba(0,68,147,0.08)] flex flex-col py-6 z-50">
        <div className="px-6 mb-10">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--color-on-surface)]">TripIt</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-secondary)] font-semibold mt-1">AI Concierge Active</p>
        </div>
        <nav className="flex-1 px-3 space-y-2">
          <a className="flex items-center gap-3 px-4 py-3 bg-[var(--color-primary-container)]/10 text-[var(--color-primary)] rounded-xl border-r-2 border-[var(--color-secondary)] transition-all" href="#">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>
            <span className="font-medium text-sm">Itinerary</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)] transition-all rounded-xl" href="#">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
            <span className="font-medium text-sm">Exploration</span>
          </a>
        </nav>
      </aside>

      {/* Main Map Canvas */}
      <main className="ml-64 flex-1 relative h-screen w-full bg-[var(--color-surface-container-lowest)]">
        
        {/* Top Navigation */}
        <header className="fixed top-0 right-0 left-64 h-16 z-40 bg-[var(--color-background)]/80 backdrop-blur-xl flex items-center justify-between px-8">
          <div className="flex items-center gap-8">
            <a className="text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] pb-1 text-sm font-medium" href="#">My Trips</a>
            <a className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors text-sm font-medium" href="#">Saved</a>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative flex items-center">
              <svg className="absolute left-3 text-[var(--color-outline)]" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input className="bg-[var(--color-surface-container-low)] border-none border-b border-[var(--color-outline-variant)]/20 focus:ring-0 text-sm pl-10 pr-4 py-2 w-64 rounded-lg text-white" placeholder="Search destinations..." type="text"/>
            </div>
          </div>
        </header>

        {/* Map Background */}
        <div className="absolute inset-0 z-0">
          {/* Use live derived coords for instant feedback, fallback to optimized ones if exists */}
          <MapComponent 
            coords={mapCoords.length > 0 ? mapCoords : places.filter(p => p.coords).map(p => p.coords!)} 
            routeGeoJson={routeGeoJson} 
            schedule={schedule || places.filter(p => p.coords).map(p => ({
              place: p.name,
              latlon: p.coords!,
              arrival: new Date(),
              departure: new Date(),
              day: '',
              date: '',
              time: 'Selected'
            }))} 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-background)] via-transparent to-transparent pointer-events-none"></div>
        </div>

        {/* Configuration Panel */}
        <div className="absolute left-10 top-24 bottom-10 w-[440px] z-20 flex flex-col gap-4 overflow-hidden">
          <section className="bg-[var(--color-surface-container-low)]/90 backdrop-blur-md rounded-[2.5rem] p-7 shadow-2xl border border-white/5 flex flex-col gap-5 overflow-y-auto h-full scrollbar-none">
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-secondary)] shadow-[0_0_8px_rgba(83,225,111,0.6)]"></div>
                  <span className="text-[10px] font-bold tracking-[0.1em] text-[var(--color-secondary)] uppercase">AI Optimization Panel</span>
                </div>
                <button 
                  onClick={() => setIsAiOpen(!isAiOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${isAiOpen ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border-transparent shadow-[0_0_12px_var(--color-primary)]' : 'bg-transparent text-[var(--color-primary)] border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10'}`}
                >
                  <Wand2 size={12} />
                  AI Magic Wand
                </button>
              </div>
              <h2 className="text-2xl font-bold text-[var(--color-on-surface)] tracking-tight">Configure Your Voyage</h2>
              
              {isAiOpen && (
                <div className="mt-4 p-4 bg-[var(--color-surface-container-lowest)] rounded-2xl border border-[var(--color-primary)]/20 animate-in fade-in slide-in-from-top-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                    <Sparkles size={48} className="text-[var(--color-primary)]" />
                  </div>
                  <label className="text-[9px] font-bold tracking-[0.15em] text-[var(--color-primary)] uppercase mb-2 block">Tell AI about your trip...</label>
                  <textarea 
                    className="w-full bg-transparent border-none text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-0 p-0 resize-none min-h-[100px] font-medium leading-relaxed"
                    placeholder="e.g., 'I want a 3 day trip to NYC starting next Monday. I have a 7pm dinner reservation at Le Coucou on day 2. Include Central Park and The Met.'"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                  />
                  <div className="flex justify-end mt-2">
                    <button 
                      disabled={isAiParsing}
                      onClick={handleAiParse}
                      className="bg-[var(--color-primary-container)] hover:bg-[var(--color-primary-fixed-dim)] text-[var(--color-on-primary-container)] text-[10px] font-extrabold px-4 py-2 rounded-xl transition-all flex items-center gap-2 shadow-lg active:scale-95"
                    >
                      {isAiParsing ? <Loader2 size={12} className="animate-spin" /> : 'Apply Magic'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Trip Base City</label>
                <input 
                  className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none placeholder:text-white/10" 
                  type="text" 
                  placeholder="e.g. New York, Tokyo"
                  value={baseCity} 
                  onChange={e => setBaseCity(e.target.value)} 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Starting Date</label>
                <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Days</label>
                <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none" type="number" min={1} max={30} value={tripLength} onChange={e => setTripLength(parseInt(e.target.value) || 1)} />
              </div>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => setIsHoursOpen(!isHoursOpen)}
                className="flex justify-between items-center w-full px-1 group"
              >
                <label className="text-[10px] font-bold tracking-widest text-[var(--color-on-surface-variant)] uppercase cursor-pointer group-hover:text-[var(--color-primary)] transition-colors">
                  Daily Active Hours
                  {!isHoursOpen && <span className="ml-2 text-[9px] lowercase italic font-normal text-white/20">(Expand to refine)</span>}
                </label>
                <ChevronDown 
                  size={16} 
                  className={`text-[var(--color-on-surface-variant)] transition-transform duration-300 ${isHoursOpen ? 'rotate-180' : ''}`} 
                />
              </button>
              
              {isHoursOpen && (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-none animate-in fade-in slide-in-from-top-1">
                  {Array.from({ length: tripLength }).map((_, i) => {
                    const d = new Date(startDate + "T00:00:00");
                    d.setDate(d.getDate() + i);
                    const dateStr = d.toISOString().split('T')[0];
                    const hoursParams = activeHours[dateStr];
                    if (!hoursParams) return null;
                    const formatTime = (h: number, m: number) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                    
                    return (
                      <div key={dateStr} className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                        <span className="text-[10px] font-bold text-white/40 ml-2 w-16 uppercase tracking-wider">{d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</span>
                        <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-center py-1 text-white font-mono outline-none" type="time" value={formatTime(hoursParams.start.hours, hoursParams.start.minutes)} onChange={(e) => handleActiveHoursChange(dateStr, 'start', e.target.value)} />
                        <div className="w-2 h-px bg-white/10"></div>
                        <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-center py-1 text-white font-mono outline-none" type="time" value={formatTime(hoursParams.end.hours, hoursParams.end.minutes)} onChange={(e) => handleActiveHoursChange(dateStr, 'end', e.target.value)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-[var(--color-outline-variant)]/10 pb-2">
                <label className="text-[10px] font-bold tracking-widest text-[var(--color-on-surface-variant)] uppercase ml-1">Places to Visit</label>
                <button onClick={handleAddPlace} className="text-[var(--color-primary)] hover:text-[var(--color-secondary)] text-xs font-bold transition-colors flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  Add Place
                </button>
              </div>

              {places.map((place, idx) => (
                <div key={idx} className="bg-[var(--color-surface-container-high)] rounded-2xl p-4 border border-[var(--color-outline-variant)]/20 relative group hover:border-[var(--color-secondary)]/30 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="relative">
                      <input 
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-base font-bold text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)]/40 outline-none" 
                        placeholder={idx === 0 ? "e.g., TeamLab Borderless" : "e.g., Shibuya Crossing"} 
                        value={place.name}
                        onFocus={() => setActiveSearchIdx(idx)}
                        onChange={(e) => {
                          handlePlaceChange(idx, 'name', e.target.value);
                          if (place.coords) handlePlaceChange(idx, 'coords', undefined); // Clear coords if they edit the text
                        }}
                      />
                      {activeSearchIdx === idx && (suggestions.length > 0 || searchLoading) && (
                        <div className="absolute top-full left-0 right-0 z-[100] mt-2 bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]/30 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                          {searchLoading && (
                            <div className="p-3 text-xs text-gray-400 flex items-center gap-2">
                              <Loader2 className="animate-spin" size={12} /> Searching...
                            </div>
                          )}
                          {suggestions.map((s, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => handleSelectSuggestion(idx, s)}
                              className="w-full text-left p-3 hover:bg-[var(--color-primary)]/10 border-b border-white/5 last:border-none transition-colors group"
                            >
                              <div className="text-sm font-bold text-white group-hover:text-[var(--color-primary)]">{s.name}</div>
                              <div className="text-[10px] text-gray-400 truncate">{s.label}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {places.length > 2 && (
                      <button onClick={() => handleRemovePlace(idx)} className="text-[var(--color-outline)] hover:text-[var(--color-error)] transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-2">
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                      <label className="text-[9px] font-bold tracking-widest text-white/40 uppercase">Duration</label>
                      <input 
                        type="number"
                        className="w-12 bg-transparent border-none text-xs p-0 text-center font-bold text-[var(--color-primary)] focus:ring-0 outline-none"
                        value={place.visit_duration}
                        onChange={(e) => handlePlaceChange(idx, 'visit_duration', parseInt(e.target.value) || 60)}
                      />
                      <span className="text-[9px] text-white/20 font-bold uppercase">min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        id={`res-${idx}`}
                        type="checkbox" 
                        checked={place.is_reservation}
                        onChange={(e) => handlePlaceChange(idx, 'is_reservation', e.target.checked)}
                        className="w-4 h-4 rounded border-white/10 bg-white/5 text-[var(--color-primary)] focus:ring-[var(--color-primary)]/20 cursor-pointer transition-all"
                      />
                      <label htmlFor={`res-${idx}`} className="text-[10px] font-bold uppercase tracking-wider text-white/60 cursor-pointer hover:text-white transition-colors">Reservation</label>
                    </div>
                  </div>

                  {place.is_reservation && (
                    <div className="grid grid-cols-2 gap-4 pt-3 mt-2 border-t border-[var(--color-outline-variant)]/10 animate-in fade-in slide-in-from-top-1">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold tracking-widest text-[var(--color-on-surface-variant)] uppercase">Date</label>
                        <input className="w-full bg-transparent border-none text-xs p-0 text-[var(--color-on-surface)] focus:ring-0 outline-none" type="date" value={place.reservation_date} onChange={(e) => handlePlaceChange(idx, 'reservation_date', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold tracking-widest text-[var(--color-on-surface-variant)] uppercase">Time</label>
                        <input className="w-full bg-transparent border-none text-xs p-0 text-[var(--color-on-surface)] focus:ring-0 outline-none" type="time" value={place.reservation_clock} onChange={(e) => handlePlaceChange(idx, 'reservation_clock', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <label className="text-[10px] font-bold tracking-widest text-white/40 uppercase ml-1 flex items-center gap-2">
                  <Sparkles size={12} className="text-[var(--color-secondary)]" />
                  Discover Local Gems
                </label>
                <button 
                  onClick={handleDiscover}
                  disabled={isRecommending}
                  className="text-[var(--color-secondary)] hover:text-white text-[10px] font-bold transition-all flex items-center gap-1 bg-[var(--color-secondary)]/10 px-2 py-1 rounded-md"
                >
                  {isRecommending ? <Loader2 size={10} className="animate-spin" /> : <Sparkle size={10} />}
                  Inspire Me
                </button>
              </div>

              <div className="relative group px-1">
                <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[var(--color-secondary)] transition-colors" />
                <input 
                  type="text" 
                  value={interest} 
                  onChange={(e) => setInterest(e.target.value)}
                  placeholder="What are you in the mood for? (e.g. Art, Coffee, Landmarks)"
                  className="w-full bg-white/5 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-[11px] text-white placeholder-white/20 focus:border-[var(--color-secondary)]/50 focus:bg-white/[0.08] outline-none transition-all"
                />
              </div>

              {isRecommending && (
                <div className="space-y-2 animate-pulse px-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-white/5 rounded-2xl border border-white/5" />
                  ))}
                  <p className="text-[9px] text-white/20 text-center animate-bounce uppercase tracking-widest font-bold mt-2">Semantic Search Active...</p>
                </div>
              )}

              {recommendations.length > 0 && !isRecommending && (
                <div className="grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-bottom-2">
                  {recommendations.map((poi) => (
                    <div key={poi.id} className="bg-white/[0.03] border border-white/5 p-3 rounded-2xl flex items-center justify-between group hover:border-[var(--color-secondary)]/30 transition-all">
                      <div className="flex flex-col gap-0.5 max-w-[80%]">
                        <span className="text-sm font-bold text-white truncate">{poi.name}</span>
                        <span className="text-[9px] uppercase tracking-wider text-white/30 font-medium">
                          {poi.tags.tourism || poi.tags.historic || 'Attraction'} • {Math.round((poi.score || 0) * 100)}% Match
                        </span>
                      </div>
                      <button 
                        onClick={() => handleAddRecommended(poi)}
                        className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--color-secondary)] hover:bg-[var(--color-secondary)] hover:text-white transition-all shadow-lg"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-xl text-[var(--color-error)] text-xs">
                {error}
              </div>
            )}

            <button 
              onClick={handlePlanTour}
              disabled={isPlanning}
              className="mt-auto w-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-container)] text-[var(--color-on-primary-container)] font-extrabold py-4 rounded-full shadow-[0_12px_24px_-8px_rgba(75,142,255,0.4)] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isPlanning ? <><Loader2 className="animate-spin" size={18} /> Routing...</> : 'Generate Optimized Itinerary'}
            </button>
          </section>
        </div>

        {/* Right Side Context Cards (Schedule) */}
        {schedule && schedule.length > 0 && (
          <div className="absolute right-10 top-24 bottom-10 w-96 flex flex-col gap-4 z-20">
            <div className="bg-[var(--color-surface-container-high)]/80 backdrop-blur-xl rounded-3xl p-6 border border-[var(--color-outline-variant)]/10 flex-1 overflow-y-auto shadow-2xl scrollbar-thin scrollbar-thumb-white/10">
              <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-6 flex items-center gap-2">
                 <MapPin className="text-[var(--color-secondary)]" size={20} />
                 Optimized Plan
              </h2>
              <div className="space-y-6 border-l border-[var(--color-primary)]/30 ml-2 pl-6 relative">
                {schedule.map((stop, i) => (
                  <div key={i} className="relative group hover:-translate-y-1 transition-transform">
                    <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-background)] shadow-[0_0_8px_var(--color-primary)] group-hover:bg-[var(--color-secondary)] transition-colors" />
                    <div className="bg-[var(--color-surface-container-low)] p-4 rounded-xl border border-[var(--color-outline-variant)]/10 group-hover:border-[var(--color-primary)]/40 transition-colors">
                      <h4 className="text-sm font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary-fixed-dim)] transition-colors">{stop.place}</h4>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-on-surface-variant)] mt-1 mb-2">{stop.day.substring(0,3)}, {stop.date}</p>
                      <div className="inline-flex items-center gap-2 bg-[var(--color-surface-container-lowest)] px-2 py-1 rounded-md border border-[var(--color-outline-variant)]/20">
                        <svg className="text-[var(--color-secondary)]" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span className="font-mono text-[var(--color-primary)] text-xs font-semibold">
                          {stop.time} - {stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
