'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Place as SchedulePlace, ScheduleStop, generateSchedule, ActiveHours } from '@/lib/ScheduleGenerator';
import { optimizeRoute } from '@/lib/TspSolver';
import { getCoordinates, getDurationsMatrix, getRoutePolyline, getAutocompleteSuggestions } from '@/lib/orsClient';
import { getTomTomDurationsMatrix, getTomTomLegDetails } from '@/lib/tomtomClient';
import { Loader2, Search, Wand2, Sparkles, ChevronDown, MapPin, Plus, Sparkle, Clock, Car, Footprints, Bike, Globe, Activity, Route, CalendarCheck, Minimize2, Maximize2 } from 'lucide-react';
import { fetchNearbyPOIs, rankPOIs, POI } from '@/lib/RecommendationEngine';
import { clusterPlaces } from '@/lib/Clusterer';
import { exportToCsv, exportToIcal } from '@/lib/ExportUtils';
import { fetchWikiData, getOpenStatus } from '@/lib/WikiEnricher';

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
    const [suggestions, setSuggestions] = useState<{ name: string, label: string, coords: [number, number] }[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [startDate, setStartDate] = useState<string>(today);
    const [tripLength, setTripLength] = useState<number>(3);
    const [baseCity, setBaseCity] = useState<string>('');
    const [baseCityCoords, setBaseCityCoords] = useState<[number, number] | null>(null);
    const [accommodation, setAccommodation] = useState<string>('');
    const [accommodationCoords, setAccommodationCoords] = useState<[number, number] | null>(null);
    const [activeHours, setActiveHours] = useState<Record<string, ActiveHours>>({});

    const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
    const [isPlanning, setIsPlanning] = useState(false);
    const [schedule, setSchedule] = useState<ScheduleStop[] | null>(null);
    const [mapCoords, setMapCoords] = useState<[number, number][]>([]);
    const [routeGeoJson, setRouteGeoJson] = useState<Record<string, any>>({});
    const [error, setError] = useState<string | null>(null);
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [isAiParsing, setIsAiParsing] = useState(false);
    const [isHoursOpen, setIsHoursOpen] = useState(true);
    const [recommendations, setRecommendations] = useState<POI[]>([]);
    const [selectedEnrichment, setSelectedEnrichment] = useState<POI | null>(null);
    const [isRecommending, setIsRecommending] = useState(false);
    const [interest, setInterest] = useState('Top tourist attractions, museums, and historical landmarks');
    const [transportMode, setTransportMode] = useState<string>('driving-car');
    const [isConfigExpanded, setIsConfigExpanded] = useState(true);
    const [isPlanExpanded, setIsPlanExpanded] = useState(true);

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

    // Accommodation Geocoding (Debounced)
    useEffect(() => {
        if (!accommodation || accommodation.length < 3) {
            setAccommodationCoords(null);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const focus = baseCityCoords || undefined;
                const coords = await getCoordinates(accommodation, focus);
                if (coords) setAccommodationCoords(coords);
            } catch (err) {
                console.warn('Silent fail geocoding accommodation:', err);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [accommodation, baseCityCoords]);

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

    const handleSelectSuggestion = (idx: number, suggestion: { name: string, label: string, coords: [number, number] }) => {
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

            const rawPois = await fetchNearbyPOIs(cityCoords[0], cityCoords[1], interest);
            const ranked = await rankPOIs(rawPois, interest);
            setRecommendations(ranked);

            // V6.0: Progressive Enrichment (Async)
            for (const poi of ranked.slice(0, 10)) {
                const wiki = await fetchWikiData(poi.name, poi.lat, poi.lon);
                const enriched = { ...poi, ...wiki };
                setRecommendations(prev => prev.map(p => p.id === poi.id ? enriched : p));
                if (poi.id === ranked[0].id) setSelectedEnrichment(enriched);
            }
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
            const parsedPlaces = validPlaces.map(p => {
                let reservation_time: Date | null = null;
                if (p.is_reservation && p.reservation_date && p.reservation_clock) {
                    reservation_time = new Date(`${p.reservation_date}T${p.reservation_clock}:00`);
                }
                return { ...p, reservation_time };
            });

            // NEW: Cluster destinations into Days (V4.1 Feature)
            console.log(`🎯 Clustering destinations into ${tripLength} logical days...`);
            const clusteredDays = clusterPlaces(
                validPlaces.map((p, i: number) => ({
                    ...p,
                    coords: coords[i],
                    reservation_date: p.reservation_date || '',
                    is_reservation: !!p.is_reservation
                })),
                startDate,
                tripLength,
                accommodationCoords || baseCityCoords // Stay location is priority anchor
            );

            // Step 2: Solve TSP *Per Day* and Assemble Sequence
            const finalOrderedCoords: [number, number][] = [];
            const finalOrderedPlaces: any[] = [];
            const finalOrderIndices: number[] = [];
            const dayStopCounts: number[] = [];
            const hasStayAnchor = !!accommodationCoords;

            for (let dayIdx = 0; dayIdx < clusteredDays.length; dayIdx++) {
                const day = clusteredDays[dayIdx];
                if (day.indices.length === 0) {
                    dayStopCounts.push(0);
                    continue;
                }

                const anchorCoords = accommodationCoords;
                const hasAnchor = hasStayAnchor;

                if (day.indices.length === 1 && !hasAnchor) {
                    const globalIdx = day.indices[0];
                    finalOrderIndices.push(globalIdx);
                    finalOrderedCoords.push(coords[globalIdx]);
                    finalOrderedPlaces.push(parsedPlaces[globalIdx]);
                    continue;
                }

                console.log(`🚗 Solving Day ${dayIdx + 1} locally for ${day.places.length} stops...`);

                const targetDate = new Date(startDate + "T00:00:00");
                targetDate.setDate(targetDate.getDate() + dayIdx);
                const forcedDateStr = targetDate.toLocaleDateString('en-CA'); // YYYY-MM-DD local

                let dayCoords: [number, number][] = day.indices.map(i => coords[i]);
                let dayPlaces: any[] = day.indices.map(i => parsedPlaces[i]);

                const dayCountForPoly = day.indices.length + (hasAnchor ? 2 : 0);

                if (hasAnchor) {
                    dayCoords = [anchorCoords as [number, number], ...dayCoords];
                    dayPlaces = [{ name: `Stay Location (Start)`, visit_duration: 0, is_reservation: false, forcedDate: forcedDateStr }, ...dayPlaces];
                }

                // V7.2: Data-Proven Traffic Modeling (TomTom Priority)
                let dayDurations = await getTomTomDurationsMatrix(dayCoords, transportMode);
                if (dayDurations) {
                    console.log('🚥 TomTom Traffic-Aware Matrix Acquired.');
                } else {
                    console.log('⚠️ TomTom Failed/Limit. Falling back to ORS base durations.');
                    dayDurations = await getDurationsMatrix(dayCoords, transportMode);
                }
                const { order: dayOrder } = optimizeRoute(
                    dayCoords,
                    dayDurations,
                    dayPlaces,
                    hasAnchor // fixedStart
                );

                // Map local order back to global indices and assembly
                dayOrder.forEach(localIdx => {
                    if (hasAnchor && localIdx === 0) {
                        // Add Hotel Start
                        finalOrderedCoords.push(anchorCoords as [number, number]);
                        finalOrderedPlaces.push({ name: `Stay Location (Start)`, visit_duration: 0, is_reservation: false, is_stay_anchor: true, forcedDate: forcedDateStr });
                    } else {
                        const globalIdx = day.indices[hasAnchor ? localIdx - 1 : localIdx];
                        finalOrderIndices.push(globalIdx);
                        finalOrderedCoords.push(coords[globalIdx]);
                        // Inject forcedDate into regular spots too
                        finalOrderedPlaces.push({ ...parsedPlaces[globalIdx], forcedDate: forcedDateStr });
                    }
                });

                // Add Hotel End for Round Trip
                if (hasAnchor) {
                    finalOrderedCoords.push(anchorCoords as [number, number]);
                    finalOrderedPlaces.push({ name: `Stay Location (End)`, visit_duration: 0, is_reservation: false, is_stay_anchor: true, forcedDate: forcedDateStr });
                }

                // Track count for polyline slicing
                dayStopCounts.push(dayCountForPoly);
            }

            console.log('🏁 Multi-Day Global Order:', finalOrderIndices);

            console.log('🏁 Multi-Day Global Order:', finalOrderIndices);

            // Step 3: Generate Schedule
            // Since we already ordered them by day and then by proximity, durations need updating
            // V7.8: Historical Baseline Integration (Live vs. Usual)
            const baseDurations = await getDurationsMatrix(finalOrderedCoords, transportMode);
            let finalDurations = await getTomTomDurationsMatrix(finalOrderedCoords, transportMode);
            if (!finalDurations) {
                finalDurations = baseDurations;
            }

            // Fetch historical "Usual" durations for each leg to calculate delay-sentiment
            const historicalMatrix: number[][] = Array(finalOrderedCoords.length).fill(0).map(() => Array(finalOrderedCoords.length).fill(0));
            
            try {
                const legPromises = [];
                for (let i = 0; i < finalOrderedCoords.length - 1; i++) {
                    legPromises.push((async (idx: number) => {
                        const details = await getTomTomLegDetails(finalOrderedCoords[idx], finalOrderedCoords[idx+1], transportMode);
                        if (details) {
                            historicalMatrix[idx][idx+1] = details.historicalMinutes;
                        } else {
                            historicalMatrix[idx][idx+1] = baseDurations[idx][idx+1];
                        }
                    })(i));
                }
                await Promise.all(legPromises);
            } catch (e) {
                console.error('Failed to fetch historical baselines:', e);
            }

            const sched = generateSchedule(
                finalOrderedPlaces,
                finalOrderedCoords,
                finalOrderedPlaces.map((_, idx: number) => idx), // It's already in order
                new Date(startDate + "T00:00:00"),
                activeHours,
                finalDurations,
                baseDurations,
                historicalMatrix
            );

            console.log('📅 Generated Schedule:', sched);

            console.log(`🗺️ Fetching full optimized route polyline for ${finalOrderedCoords.length} stops...`);
            const fullGeoJson = await getRoutePolyline(finalOrderedCoords, transportMode);

            // NEW: Generate focused polylines for each day (V4.8)
            const allRouteGeoJsons: Record<string, any> = { 'all': fullGeoJson };

            // Extract day segments from the final sequence
            let sliceStart = 0;
            for (let dayIdx = 0; dayIdx < clusteredDays.length; dayIdx++) {
                const dayCount = dayStopCounts[dayIdx];
                if (dayCount > 1) {
                    const dayCoords = finalOrderedCoords.slice(sliceStart, sliceStart + dayCount);
                    allRouteGeoJsons[dayIdx.toString()] = await getRoutePolyline(dayCoords, transportMode);
                }
                sliceStart += dayCount;
            }

            setMapCoords(finalOrderedCoords);
            setRouteGeoJson(allRouteGeoJsons);
            setSchedule(sched);
        } catch (err: any) {
            setError(err.message || 'An error occurred while planning the tour.');
        } finally {
            setIsPlanning(false);
        }
    };

    const handleSpotlight = async (name: string, lat?: number, lon?: number) => {
        // 1. Check if we already have it in recommendations (it's likely enriched)
        const existing = recommendations.find(r => r.name === name);
        if (existing && (existing.photo || existing.summary)) {
            setSelectedEnrichment(existing);
            return;
        }
        // 2. Otherwise, fetch on-demand for manual stops
        const wiki = await fetchWikiData(name, lat, lon);
        setSelectedEnrichment({
            name,
            lat: lat || 0,
            lon: lon || 0,
            tags: {},
            ...wiki,
            id: Math.random() // Temp ID for the spotlight view
        } as POI);
    };

    const analytics = useMemo(() => {
        const currentSchedule = (schedule || []).filter(s => {
            if (selectedDay === 'all') return true;
            const d = new Date(startDate + "T00:00:00");
            d.setDate(d.getDate() + (selectedDay as number));
            return s.date === d.toLocaleDateString('en-CA');
        });

        const geoJson = routeGeoJson[selectedDay.toString()];
        const distanceMeters = geoJson?.features?.[0]?.properties?.summary?.distance || 0;

        const isAll = selectedDay === 'all';
        const displayStops = isAll ? (schedule?.length || places.length) : currentSchedule.length;

        let displayHours = 0;
        if (currentSchedule.length > 0) {
            // V7.3: Total Trip Time (Visit + Travel/Traffic)
            const firstArrival = currentSchedule[0].arrival.getTime();
            const lastDeparture = currentSchedule[currentSchedule.length - 1].departure.getTime();
            displayHours = Math.ceil((lastDeparture - firstArrival) / 3600000);
        } else if (isAll) {
            displayHours = Math.ceil(places.reduce((acc, p) => acc + p.visit_duration, 0) / 60);
        }

        const displayReservations = isAll
            ? places.filter(p => p.is_reservation).length
            : currentSchedule.filter(s => s.isReservation).length;

        const reservationDetails = isAll
            ? places.filter(p => p.is_reservation).map(p => ({
                name: p.name,
                date: p.reservation_date,
                time: p.reservation_clock,
                latlon: p.coords
            }))
            : currentSchedule.filter(s => s.isReservation).map(s => ({
                name: s.place,
                date: s.date,
                time: s.time,
                latlon: s.latlon
            }));

        return {
            stops: displayStops,
            hours: displayHours,
            distance: (distanceMeters / 1000).toFixed(1),
            reservations: displayReservations,
            reservationDetails
        };
    }, [schedule, selectedDay, routeGeoJson, places, startDate]);

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

            if (data.stayLocation) {
                setAccommodation(data.stayLocation);
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
            <aside className="h-screen w-72 fixed left-0 top-0 border-r border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)]/70 backdrop-blur-lg shadow-[40px_0_60px_-10px_rgba(0,68,147,0.08)] flex flex-col py-6 z-50">
                <div className="px-6 mb-10">
                    <h1 className="text-xl font-bold tracking-tighter text-[var(--color-on-surface)]">TripIt</h1>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-secondary)] font-semibold mt-1">AI Concierge Active</p>
                </div>
                <nav className="flex-1 px-3 space-y-6">
                    <a className="flex items-center gap-3 px-4 py-3 bg-[var(--color-primary-container)]/10 text-[var(--color-primary)] rounded-xl border-r-2 border-[var(--color-secondary)] transition-all" href="#">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" /><line x1="9" x2="9" y1="3" y2="18" /><line x1="15" x2="15" y1="6" y2="21" /></svg>
                        <span className="font-medium text-sm">Itinerary</span>
                    </a>

                    {selectedEnrichment && (
                        <div className="mt-8 animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="px-6 mb-4 flex items-center justify-between">
                                <span className="text-[10px] font-black tracking-[0.2em] text-[var(--color-secondary)] uppercase">POI Insights</span>
                                <button onClick={() => setSelectedEnrichment(null)} className="text-white/20 hover:text-white transition-all hover:rotate-90">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>
                            </div>
                            <div className="bg-[var(--color-surface-container-lowest)] rounded-3xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] mx-3">
                                {selectedEnrichment.photo ? (
                                    <div className="h-48 w-full relative group/photo overflow-hidden bg-[var(--color-surface)] rounded-t-3xl">
                                        <img src={selectedEnrichment.photo} alt={selectedEnrichment.name} className="w-full h-full object-cover transition-all duration-700 group-hover/photo:scale-110 brightness-[0.85] group-hover/photo:brightness-100" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-container-lowest)] via-transparent to-transparent opacity-90" />
                                        <div className="absolute top-4 right-4 flex gap-2.5 items-center">
                                            {selectedEnrichment.website && (
                                                <a href={selectedEnrichment.website} title="Official Website" target="_blank" rel="noopener noreferrer" className="p-2.5 bg-black/60 rounded-full text-white hover:bg-[var(--color-primary)] hover:text-black transition-all backdrop-blur-md border border-white/10 shadow-xl">
                                                    <Globe size={14} />
                                                </a>
                                            )}
                                            {selectedEnrichment.pageId && (
                                                <a href={`https://en.wikipedia.org/?curid=${selectedEnrichment.pageId}`} title="Wikipedia Article" target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-full text-white hover:bg-white hover:text-black transition-all backdrop-blur-md border border-white/10 shadow-xl">
                                                    <span className="font-serif italic font-black text-sm">W</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-48 w-full bg-white/5 flex items-center justify-center text-white/10">
                                        <Sparkles size={32} />
                                    </div>
                                )}
                                <div className="p-6 relative z-10 -mt-10">
                                    <h3 className="text-white font-bold text-lg mb-1 leading-tight tracking-tight drop-shadow-md">{selectedEnrichment.name}</h3>
                                    {selectedEnrichment.summary && (
                                        <p className="text-[11px] text-white/50 leading-relaxed line-clamp-6 italic mb-4 font-medium opacity-70 serif">{selectedEnrichment.summary}</p>
                                    )}
                                    <div className="flex flex-col gap-3">
                                        {selectedEnrichment.opening_hours && (
                                            <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/5 shadow-inner">
                                                <Clock className="text-[var(--color-secondary)]" size={14} />
                                                <span className="text-[10px] font-bold text-white/60 tracking-wide uppercase">{getOpenStatus(selectedEnrichment.opening_hours).message}</span>
                                            </div>
                                        )}
                                        {!places.some(p => p.name === selectedEnrichment.name) && (
                                            <button
                                                onClick={() => handleAddRecommended(selectedEnrichment)}
                                                className="w-full bg-[var(--color-primary)] text-black text-[10px] font-bold py-3.5 rounded-2xl shadow-[0_10px_30px_-5px_rgba(75,142,255,0.4)] active:scale-[0.98] transition-all uppercase tracking-[0.2em] mt-1 group"
                                            >
                                                Add to Plan
                                                <Plus size={12} className="inline ml-1 group-hover:rotate-90 transition-transform" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </nav>

                {/* Trip Analytics (V6.7) */}
                <div className="mt-auto border-t border-white/5 bg-black/20 p-6 space-y-5 animate-in slide-in-from-bottom-4 fade-in duration-1000">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                        <span className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">Trip Analytics</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-[var(--color-primary)]/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                            <div className="flex items-center gap-2 text-[var(--color-primary)] opacity-60 group-hover:opacity-100 transition-opacity">
                                <MapPin size={10} />
                                <span className="text-[8px] font-bold uppercase tracking-widest">Stops</span>
                            </div>
                            <div className="text-lg font-black text-white">{analytics.stops}</div>
                        </div>

                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-[var(--color-secondary)]/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                            <div className="flex items-center gap-2 text-[var(--color-secondary)] opacity-60 group-hover:opacity-100 transition-opacity">
                                <Clock size={10} />
                                <span className="text-[8px] font-bold uppercase tracking-widest">Hours</span>
                            </div>
                            <div className="text-lg font-black text-white">{analytics.hours}</div>
                        </div>

                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-blue-400/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                            <div className="flex items-center gap-2 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                <Route size={10} />
                                <span className="text-[8px] font-bold uppercase tracking-widest">Distance</span>
                            </div>
                            <div className="text-lg font-black text-white">{analytics.distance} <span className="text-[10px] text-white/40">km</span></div>
                        </div>

                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                            <div className="flex items-center gap-2 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                <CalendarCheck size={10} />
                                <span className="text-[8px] font-bold uppercase tracking-widest">Bookings</span>
                            </div>
                            <div className="text-lg font-black text-white">{analytics.reservations}</div>
                        </div>
                    </div>

                    {analytics.reservationDetails.length > 0 && (
                        <div className="space-y-3 pt-2">
                             <div className="flex items-center justify-between">
                                 <span className="text-[9px] font-bold tracking-[0.2em] text-white/30 uppercase">Confirmed Bookings</span>
                                 <div className="h-px flex-1 bg-white/5 ml-3" />
                             </div>
                             <div className="space-y-2">
                                 {analytics.reservationDetails.map((res, i) => (
                                     <div 
                                         key={i} 
                                         onClick={() => res.latlon && handleSpotlight(res.name, res.latlon[0], res.latlon[1])}
                                         className="bg-black/20 p-3 rounded-2xl border border-white/5 flex items-center justify-between group/res hover:bg-white/5 hover:border-[var(--color-primary)]/30 hover:-translate-y-0.5 transition-all cursor-pointer shadow-lg active:scale-[0.98]"
                                     >
                                         <div className="space-y-0.5">
                                             <div className="text-[11px] font-bold text-white group-hover/res:text-[var(--color-primary)] transition-colors line-clamp-1">{res.name}</div>
                                             <div className="text-[9px] text-white/40 uppercase tracking-wider">{res.date}</div>
                                         </div>
                                         <div className="text-[10px] font-mono font-bold text-[var(--color-secondary)] bg-[var(--color-secondary)]/10 px-2 py-1 rounded-lg group-hover/res:bg-[var(--color-secondary)] group-hover/res:text-black transition-all">
                                             {res.time}
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    )}

                    <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-4 rounded-3xl border border-white/5 flex items-center justify-between group hover:from-[var(--color-primary)]/20 transition-all cursor-default relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-1 opacity-10">
                             <Sparkles size={40} className="text-[var(--color-primary)]" />
                        </div>
                        <div className="space-y-1 relative z-10">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{selectedDay === 'all' ? 'Trip Pace' : `Day ${selectedDay as number + 1} Focus`}</div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                Steady Explorer
                                <Sparkles size={12} className="text-[var(--color-primary)] animate-pulse" />
                            </div>
                            <div className="text-[8px] text-[var(--color-secondary)] font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-1">
                                <Activity size={8} /> Traffic-Proven
                            </div>
                        </div>
                        <Activity size={24} className="text-[var(--color-primary)] opacity-40 group-hover:opacity-80 transition-opacity" />
                    </div>

                    <p className="text-[9px] text-white/20 leading-relaxed font-medium italic">
                        "Travel is the only thing you buy that makes you richer."
                    </p>
                </div>
            </aside>

            {/* Main Map Canvas */}
            <main className="ml-72 flex-1 relative h-screen w-full bg-[var(--color-surface-container-lowest)]">

                {/* Top Navigation */}
                <header className="fixed top-0 right-0 left-72 h-16 z-40 bg-[var(--color-background)]/80 backdrop-blur-xl flex items-center justify-between px-8">
                    <div className="flex items-center gap-8">
                        <a className="text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] pb-1 text-sm font-medium" href="#">My Trips</a>
                        <a className="text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors text-sm font-medium" href="#">Saved</a>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="relative flex items-center">
                            <svg className="absolute left-3 text-[var(--color-outline)]" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            <input className="bg-[var(--color-surface-container-low)] border-none border-b border-[var(--color-outline-variant)]/20 focus:ring-0 text-sm pl-10 pr-4 py-2 w-64 rounded-lg text-white" placeholder="Search destinations..." type="text" />
                        </div>
                    </div>
                </header>

                {/* Day Navigation Bar (V4.4) */}
                {schedule && schedule.length > 0 && (
                    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-2 p-1.5 bg-[var(--color-surface-container-low)]/80 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl animate-in fade-in slide-in-from-top-4">
                        <button
                            onClick={() => setSelectedDay('all')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${selectedDay === 'all' ? 'bg-[var(--color-primary)] text-white shadow-[0_0_15px_var(--color-primary)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        >
                            Overview
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        {Array.from({ length: tripLength }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedDay(i)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${selectedDay === i ? 'bg-[var(--color-secondary)] text-white shadow-[0_0_15px_var(--color-secondary)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                            >
                                Day {i + 1}
                            </button>
                        ))}
                    </div>
                )}

                {/* Map Background */}
                <div className="absolute inset-0 z-0">
                    <MapComponent
                        coords={
                            selectedDay === 'all'
                                ? (mapCoords.length > 0 ? mapCoords : places.filter(p => p.coords).map(p => p.coords!))
                                : (schedule?.filter(s => {
                                    const d = new Date(startDate + "T00:00:00");
                                    d.setDate(d.getDate() + selectedDay);
                                    return s.date === d.toLocaleDateString('en-CA');
                                }).map(s => s.latlon) || [])
                        }
                        routeGeoJson={routeGeoJson[selectedDay.toString()]}
                        schedule={
                            (schedule || places.filter(p => p.coords).map(p => ({
                                place: p.name,
                                latlon: p.coords!,
                                arrival: new Date(),
                                departure: new Date(),
                                day: '',
                                date: '',
                                time: 'Selected'
                            }))).filter(s => {
                                if (selectedDay === 'all') return true;
                                const d = new Date(startDate + "T00:00:00");
                                d.setDate(d.getDate() + selectedDay);
                                return s.date === d.toLocaleDateString('en-CA');
                            })
                        }
                        onMarkerClick={(s) => handleSpotlight(s.place, s.latlon[0], s.latlon[1])}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-background)] via-transparent to-transparent pointer-events-none"></div>
                </div>

                {/* Configuration Panel (V7.0 Zen Mode) */}
                <div className={`absolute left-10 top-24 z-[100] flex flex-col gap-4 transition-all duration-500 ease-in-out ${isConfigExpanded ? 'bottom-10 w-[440px]' : 'w-48 h-14'}`}>
                    <section className={`bg-[var(--color-surface-container-low)]/90 backdrop-blur-md rounded-[2.5rem] shadow-2xl border border-white/5 transition-all duration-500 overflow-hidden ${isConfigExpanded ? 'p-7 flex flex-col gap-5 h-full overflow-y-auto scrollbar-none' : 'p-0 h-full flex items-center'}`}>
                        {isConfigExpanded ? (
                            <>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[var(--color-secondary)] shadow-[0_0_8px_rgba(83,225,111,0.6)]"></div>
                                            <span className="text-[10px] font-bold tracking-[0.1em] text-[var(--color-secondary)] uppercase">AI Optimization Panel</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setIsAiOpen(!isAiOpen)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${isAiOpen ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border-transparent shadow-[0_0_12px_var(--color-primary)]' : 'bg-transparent text-[var(--color-primary)] border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10'}`}
                                            >
                                                <Wand2 size={12} />
                                                Magic
                                            </button>
                                            <button 
                                                onClick={() => setIsConfigExpanded(false)}
                                                className="p-2 hover:bg-white/5 rounded-xl text-white/20 hover:text-white transition-all"
                                                title="Minimize"
                                            >
                                                <Minimize2 size={16} />
                                            </button>
                                        </div>
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
                            <div className="col-span-2 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Trip Base City</label>
                                    <input
                                        className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none placeholder:text-white/10"
                                        type="text"
                                        placeholder="e.g. Tokyo"
                                        value={baseCity}
                                        onChange={e => setBaseCity(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-secondary)]/70 uppercase ml-1">Stay Location 🏨</label>
                                    <input
                                        className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-secondary)]/50 focus:ring-4 focus:ring-[var(--color-secondary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none placeholder:text-white/10"
                                        type="text"
                                        placeholder="e.g. Hilton Shinjuku"
                                        value={accommodation}
                                        onChange={e => setAccommodation(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Starting Date</label>
                                <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Days</label>
                                <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-2xl text-white transition-all outline-none" type="number" min={1} max={30} value={tripLength} onChange={e => setTripLength(parseInt(e.target.value) || 1)} />
                            </div>
                            <div className="space-y-1.5 col-span-2 mt-1">
                                <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Travel Mode</label>
                                <div className="grid grid-cols-3 bg-white/5 rounded-2xl p-1 gap-1 border border-white/10">
                                    <button
                                        onClick={() => setTransportMode('driving-car')}
                                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'driving-car' ? 'bg-[var(--color-secondary)] text-black shadow-lg' : 'text-white/40 hover:bg-white/5'}`}
                                    >
                                        <Car size={14} /> Car
                                    </button>
                                    <button
                                        onClick={() => setTransportMode('foot-walking')}
                                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'foot-walking' ? 'bg-[var(--color-secondary)] text-black shadow-lg' : 'text-white/40 hover:bg-white/5'}`}
                                    >
                                        <Footprints size={14} /> Walk
                                    </button>
                                    <button
                                        onClick={() => setTransportMode('cycling-regular')}
                                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'cycling-regular' ? 'bg-[var(--color-secondary)] text-black shadow-lg' : 'text-white/40 hover:bg-white/5'}`}
                                    >
                                        <Bike size={14} /> Bike
                                    </button>
                                </div>
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
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                    Add Place
                                </button>
                            </div>

                            {places.map((place, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => place.coords && handleSpotlight(place.name, place.coords[0], place.coords[1])}
                                    className="bg-[var(--color-surface-container-high)] p-5 rounded-3xl border border-[var(--color-outline-variant)]/20 shadow-xl group hover:border-[var(--color-primary)]/30 transition-all cursor-pointer"
                                >
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
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
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
                                    <p className="text-[9px] text-white/20 text-center animate-bounce uppercase tracking-widest font-bold mt-2">Searching...</p>
                                </div>
                            )}

                            {recommendations.length > 0 && !isRecommending && (
                                <div className="grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-bottom-2">
                                    {recommendations.map((poi) => (
                                        <div
                                            key={poi.id}
                                            onClick={() => setSelectedEnrichment(poi)}
                                            className={`group relative bg-white/5 rounded-2xl border transition-all cursor-pointer overflow-hidden ${selectedEnrichment?.id === poi.id ? 'border-[var(--color-secondary)] bg-white/10 shadow-[0_0_20px_rgba(83,225,111,0.1)]' : 'border-white/10 hover:border-[var(--color-primary)]/50 hover:bg-white/10'}`}
                                        >
                                            {poi.photo && (
                                                <div className="h-28 w-full overflow-hidden">
                                                    <img src={poi.photo} alt={poi.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                    <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 to-transparent p-3">
                                                        <span className="text-[8px] font-black uppercase tracking-widest text-white/80 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/5">Wikimedia Photo</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="p-4">
                                                <div className="flex justify-between items-start gap-2 mb-2">
                                                    <h4 className="text-sm font-bold text-white group-hover:text-[var(--color-primary)] transition-colors line-clamp-1">{poi.name}</h4>
                                                    {poi.opening_hours && (
                                                        <div className="shrink-0 flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded-md border border-white/5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-secondary)] animate-pulse" />
                                                            <span className="text-[8px] font-bold text-white/60 truncate max-w-[60px]">{getOpenStatus(poi.opening_hours).message}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {poi.summary && <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed mb-3 italic">{poi.summary}</p>}
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleAddRecommended(poi)}
                                                        className="flex-1 bg-[var(--color-primary)] text-black text-[10px] font-bold py-2 rounded-xl active:scale-95 transition-all"
                                                    >
                                                        Add to Plan
                                                    </button>
                                                    {poi.website && (
                                                        <a href={poi.website} target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-xl text-white/40 hover:text-[var(--color-primary)] transition-colors border border-white/5">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
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
                            </>
                        ) : (
                            <button 
                                onClick={() => setIsConfigExpanded(true)}
                                className="w-full h-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-[var(--color-secondary)] shadow-[0_0_8px_rgba(83,225,111,0.6)]"></div>
                                    <span className="text-[11px] font-bold text-white/60 tracking-[0.2em] uppercase">Configure</span>
                                </div>
                                <Maximize2 size={16} className="text-white/20 group-hover:text-white transition-all duration-300" />
                            </button>
                        )}
                    </section>
                </div>

                {/* Right Side Context Cards (Schedule) (V7.0 Zen Mode) */}
                {schedule && schedule.length > 0 && (
                    <div className={`absolute right-10 top-24 z-[100] flex flex-col gap-4 transition-all duration-500 ease-in-out ${isPlanExpanded ? 'bottom-10 w-96' : 'w-48 h-14'}`}>
                        <div className={`bg-[var(--color-surface-container-high)]/80 backdrop-blur-xl rounded-3xl border border-[var(--color-outline-variant)]/10 shadow-2xl transition-all duration-500 overflow-hidden ${isPlanExpanded ? 'p-6 flex-1 overflow-y-auto scrollbar-thin' : 'p-0 h-full flex items-center'}`}>
                            {isPlanExpanded ? (
                                <>
                                    <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-6 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="text-[var(--color-secondary)]" size={20} />
                                            Optimized Plan
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setIsPlanExpanded(false)}
                                                className="p-1.5 hover:bg-white/5 rounded-lg text-white/20 hover:text-white transition-all mr-1"
                                                title="Minimize"
                                            >
                                                <Minimize2 size={16} />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                    <button
                                        onClick={() => schedule && exportToCsv(schedule)}
                                        className="text-[10px] font-bold tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-xl hover:bg-[var(--color-primary)] hover:text-black transition-all shadow-lg active:scale-95"
                                    >
                                        CSV
                                    </button>
                                    <button
                                        onClick={() => schedule && exportToIcal(schedule)}
                                        className="text-[10px] font-bold tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-xl hover:bg-[var(--color-secondary)] hover:text-black transition-all shadow-lg active:scale-95"
                                    >
                                        ICAL
                                    </button>
                                </div>
                            </h2>
                            <div className="space-y-6 border-l border-[var(--color-primary)]/30 ml-2 pl-6 relative">
                                {(() => {
                                    let realStopCounter = 0;
                                    return schedule
                                        .filter(stop => {
                                            if (selectedDay === 'all') return true;
                                            const d = new Date(startDate + "T00:00:00");
                                            d.setDate(d.getDate() + selectedDay);
                                            return stop.date === d.toLocaleDateString('en-CA');
                                        })
                                        .map((stop, i) => {
                                            const isHotel = stop.place.toLowerCase().includes('stay location');
                                            if (!isHotel) realStopCounter++;

                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => handleSpotlight(stop.place, stop.latlon[0], stop.latlon[1])}
                                                    className="relative group hover:-translate-y-1 transition-transform cursor-pointer"
                                                >
                                                    <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-background)] shadow-[0_0_8px_var(--color-primary)] group-hover:bg-[var(--color-secondary)] transition-colors" />
                                                    <div className="bg-[var(--color-surface-container-low)] p-4 rounded-xl border border-[var(--color-outline-variant)]/10 group-hover:border-[var(--color-primary)]/40 transition-colors">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h4 className="text-sm font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-primary-fixed-dim)] transition-colors">
                                                                {isHotel ? '🏠' : `${realStopCounter}.`} {stop.place}
                                                            </h4>
                                                            <span className="text-[10px] font-mono font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full uppercase tracking-tighter shrink-0">
                                                                {isHotel ? 'BASE' : `STOP ${realStopCounter}`}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-on-surface-variant)] mt-1 mb-2">{stop.day.substring(0, 3)}, {stop.date}</p>
                                                        <div className="inline-flex items-center gap-2 bg-[var(--color-surface-container-lowest)] px-2 py-1 rounded-md border border-[var(--color-outline-variant)]/20">
                                                            <Clock className="text-[var(--color-secondary)]" size={12} />
                                                            <span className="font-mono text-[var(--color-primary)] text-xs font-semibold">
                                                                {stop.time} - {stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                })()}
                            </div>
                        </>
                    ) : (
                        <button 
                            onClick={() => setIsPlanExpanded(true)}
                            className="w-full h-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <MapPin className="text-[var(--color-secondary)]" size={16} />
                                <span className="text-[11px] font-bold text-white/60 tracking-[0.2em] uppercase">Itinerary</span>
                            </div>
                            <Maximize2 size={16} className="text-white/20 group-hover:text-white transition-all duration-300" />
                        </button>
                    )}
                </div>
            </div>
        )}
            </main>
        </div>
    );
}
