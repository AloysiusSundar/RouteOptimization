'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import dynamic from 'next/dynamic';
import { Reorder } from 'framer-motion';
import { Place as SchedulePlace, ScheduleStop, generateSchedule, ActiveHours } from '@/lib/ScheduleGenerator';
import { optimizeRoute } from '@/lib/TspSolver';
import { getCoordinates, getDurationsMatrix, getRoutePolyline, getAutocompleteSuggestions } from '@/lib/orsClient';
import { getTomTomDurationsMatrix, getTomTomLegDetails } from '@/lib/tomtomClient';
import { Loader2, Search, Wand2, Sparkles, ChevronDown, MapPin, Plus, Sparkle, Clock, Car, Footprints, Bike, Globe, Activity, Route, CalendarCheck, Minimize2, Maximize2, Save, Trash2, Map, Calendar, RotateCcw, Grab, Moon, Layers, CloudFog, CloudDrizzle, CloudRain, CloudLightning, CloudSnow, Wind, Cloud, Sun, Home as HomeIcon } from 'lucide-react';
import { fetchNearbyPOIs, rankPOIs, POI } from '@/lib/RecommendationEngine';
import { clusterPlaces } from '@/lib/Clusterer';
import { exportToCsv, exportToIcal } from '@/lib/ExportUtils';
import { fetchWikiData, getOpenStatus } from '@/lib/WikiEnricher';
import { getWeatherData, WeatherData } from '@/lib/weatherClient';

const WEATHER_ICON_MAP: Record<string, any> = {
    '01': Sun,
    '02': Cloud,
    '03': Cloud,
    '04': Cloud,
    '09': CloudDrizzle,
    '10': CloudRain,
    '11': CloudLightning,
    '13': CloudSnow,
    '50': CloudFog,
};

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

interface UIPlace extends SchedulePlace {
    id: string;
    is_reservation: boolean;
    reservation_date: string; // YYYY-MM-DD
    reservation_clock: string; // HH:MM
    coords?: [number, number]; // Optimized: store coords from autocomplete
}

interface SavedTrip {
    id: string;
    name: string;
    timestamp: number;
    baseCity: string;
    baseCityCoords?: [number, number] | null;
    accommodation: string;
    accommodationCoords?: [number, number] | null;
    startDate: string;
    tripLength: number;
    places: UIPlace[];
    transportMode: string;
}

export default function Home() {
    const today = new Date().toISOString().split('T')[0];

    const [places, setPlaces] = useState<UIPlace[]>([
        { id: 'initial-1', name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' },
        { id: 'initial-2', name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' }
    ]);
    const [activeSearch, setActiveSearch] = useState<{ type: 'place' | 'base' | 'stay', index?: number } | null>(null);
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
    const [interest, setInterest] = useState('');
    const [transportMode, setTransportMode] = useState<string>('driving-car');
    const [isConfigExpanded, setIsConfigExpanded] = useState(true);
    const [isPlanExpanded, setIsPlanExpanded] = useState(true);
    const [isSpotlightLoading, setIsSpotlightLoading] = useState(false);

    // V8.0: Persistence Layer (localStorage)
    const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
    const [isMyTripsOpen, setIsMyTripsOpen] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [mapMode, setMapMode] = useState<'drag' | 'pin'>('drag');
    const [mapStyle, setMapStyle] = useState<'dark' | 'light' | 'voyager' | 'satellite'>('dark');
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);

    // Load Saved Trips on Mount
    useEffect(() => {
        const stored = localStorage.getItem('tripit_saved_trips');
        if (stored) {
            try {
                setSavedTrips(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse saved trips:', e);
            }
        }
    }, []);

    // Save Trips to LocalStorage when they change
    useEffect(() => {
        localStorage.setItem('tripit_saved_trips', JSON.stringify(savedTrips));
    }, [savedTrips]);

    // V9.0: Real-time Weather Integration
    useEffect(() => {
        const fetchWeather = async () => {
            const targetCoords = accommodationCoords || baseCityCoords;
            if (!targetCoords) {
                setWeather(null);
                return;
            }

            setIsWeatherLoading(true);
            const data = await getWeatherData(targetCoords[0], targetCoords[1]);
            setWeather(data);
            setIsWeatherLoading(false);
        };

        fetchWeather();
    }, [accommodationCoords, baseCityCoords]);

    const handleMapClick = (lat: number, lng: number) => {
        const newPlace: UIPlace = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Dropped Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            visit_duration: 60,
            is_reservation: false,
            reservation_date: startDate,
            reservation_clock: '12:00',
            coords: [lat, lng]
        };

        // Add to the first empty slot or append
        const emptyIdx = places.findIndex(p => !p.name);
        if (emptyIdx !== -1) {
            const nextPlaces = [...places];
            nextPlaces[emptyIdx] = newPlace;
            setPlaces(nextPlaces);
        } else {
            setPlaces([...places, newPlace]);
        }
    };



    // Autocomplete debouncing
    useEffect(() => {
        if (!activeSearch) {
            setSuggestions([]);
            return;
        }

        let queryInput = '';
        if (activeSearch.type === 'place' && activeSearch.index !== undefined) {
            queryInput = places[activeSearch.index].name;
        } else if (activeSearch.type === 'base') {
            queryInput = baseCity;
        } else if (activeSearch.type === 'stay') {
            queryInput = accommodation;
        }

        if (!queryInput || queryInput.length < 3) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchLoading(true);
            // Bias towards existing stops OR the current Base City
            const bias = places.find(p => p.coords)?.coords || baseCityCoords || undefined;
            const results = await getAutocompleteSuggestions(queryInput, bias, 100); // 100km hard boundary
            setSuggestions(results);
            setSearchLoading(false);
        }, 400);

        return () => clearTimeout(timer);
    }, [activeSearch, places, baseCityCoords, baseCity, accommodation]);

    const handleSelectSuggestion = (idx: number, suggestion: { name: string, label: string, coords: [number, number] }) => {
        const newPlaces = [...places];
        newPlaces[idx] = {
            ...newPlaces[idx],
            name: suggestion.name,
            coords: suggestion.coords
        };
        setPlaces(newPlaces);
        setActiveSearch(null);
        setSuggestions([]);
    };

    const handleSelectBaseCitySuggestion = (suggestion: { name: string, label: string, coords: [number, number] }) => {
        setBaseCity(suggestion.name);
        setBaseCityCoords(suggestion.coords);
        setActiveSearch(null);
        setSuggestions([]);
    };

    const handleSelectStaySuggestion = (suggestion: { name: string, label: string, coords: [number, number] }) => {
        setAccommodation(suggestion.name);
        setAccommodationCoords(suggestion.coords);
        setActiveSearch(null);
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
        setPlaces([...places, { id: Math.random().toString(36).substr(2, 9), name: '', visit_duration: 60, is_reservation: false, reservation_date: startDate, reservation_clock: '12:00' }]);
    };

    const handleAddRecommended = (poi: POI) => {
        setPlaces([...places, {
            id: Math.random().toString(36).substr(2, 9),
            name: poi.name,
            visit_duration: 120,
            is_reservation: false,
            reservation_date: startDate,
            reservation_clock: '12:00',
            coords: [poi.lat, poi.lon]
        }]);
        setRecommendations(prev => prev.filter(p => p.id !== poi.id));
    };

    const handleInspireMe = () => {
        const categories = ['Museums', 'Street Art', 'Hidden Gems', 'Local Coffee', 'Panoramic Views', 'Botanical Gardens', 'Historic Sites', 'Modern Architecture', 'Local Markets', 'Traditional Crafts'];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        setInterest(randomCategory);
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
                    dayPlaces = [{ id: `hotel-start-${forcedDateStr}`, name: `Stay Location (Start)`, visit_duration: 0, is_reservation: false, forcedDate: forcedDateStr }, ...dayPlaces];
                }

                // V7.2: Data-Proven Traffic Modeling (TomTom Priority for small sets, ORS for large)
                let dayDurations = null;
                if (dayCoords.length <= 20) {
                    dayDurations = await getTomTomDurationsMatrix(dayCoords, transportMode);
                }

                if (dayDurations) {
                    console.log('🚥 TomTom Traffic-Aware Matrix Acquired.');
                } else {
                    console.log(`⚠️ ${dayCoords.length > 8 ? 'Large set' : 'TomTom Failed'}. Using ORS base durations for optimization speed.`);
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
                        finalOrderedPlaces.push({ id: `hotel-start-${forcedDateStr}`, name: `Stay Location (Start)`, visit_duration: 0, is_reservation: false, is_stay_anchor: true, forcedDate: forcedDateStr });
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
                    finalOrderedPlaces.push({ id: `hotel-end-${forcedDateStr}`, name: `Stay Location (End)`, visit_duration: 0, is_reservation: false, is_stay_anchor: true, forcedDate: forcedDateStr });
                }

                // Track count for polyline slicing
                dayStopCounts.push(dayCountForPoly);
            }

            console.log('🏁 Multi-Day Global Order:', finalOrderIndices);

            // Step 3: Generate Schedule
            // Optimization: We only need the durations for the SPECIFIC sequence found by the solver (N-1 legs).
            // A full Matrix (N^2) for the whole trip is redundant and slow for 10+ stops.
            const baseDurations = await getDurationsMatrix(finalOrderedCoords, transportMode);

            // Sparse matrices for Schedule Generation
            const liveMatrix: number[][] = Array(finalOrderedCoords.length).fill(0).map(() => Array(finalOrderedCoords.length).fill(0));
            const historicalMatrix: number[][] = Array(finalOrderedCoords.length).fill(0).map(() => Array(finalOrderedCoords.length).fill(0));

            try {
                console.log(`📡 Fetching live traffic for ${finalOrderedCoords.length - 1} legs in parallel...`);
                const legPromises = [];
                for (let i = 0; i < finalOrderedCoords.length - 1; i++) {
                    legPromises.push((async (idx: number) => {
                        const details = await getTomTomLegDetails(finalOrderedCoords[idx], finalOrderedCoords[idx + 1], transportMode);
                        if (details) {
                            liveMatrix[idx][idx + 1] = details.liveMinutes;
                            historicalMatrix[idx][idx + 1] = details.historicalMinutes;
                        } else {
                            // Fallback to ORS if specific leg fetch fails
                            liveMatrix[idx][idx + 1] = baseDurations[idx][idx + 1];
                            historicalMatrix[idx][idx + 1] = baseDurations[idx][idx + 1];
                        }
                    })(i));
                }
                await Promise.all(legPromises);
            } catch (e) {
                console.error('Failed to fetch leg details:', e);
            }

            const sched = generateSchedule(
                finalOrderedPlaces,
                finalOrderedCoords,
                finalOrderedPlaces.map((_, idx: number) => idx),
                new Date(startDate + "T00:00:00"),
                activeHours,
                liveMatrix,
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
        setIsSpotlightLoading(true);
        // Instant visual feedback: clear old card or show skeleton immediately
        setSelectedEnrichment(null);

        try {
            const wiki = await fetchWikiData(name, lat, lon);
            setSelectedEnrichment({
                name,
                lat: lat || 0,
                lon: lon || 0,
                tags: {},
                ...wiki,
                id: Math.random() // Temp ID for the spotlight view
            } as POI);
        } finally {
            setIsSpotlightLoading(false);
        }
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
                id: p.id,
                name: p.name,
                date: p.reservation_date,
                time: p.reservation_clock,
                latlon: p.coords
            }))
            : currentSchedule.filter(s => s.isReservation).map(s => ({
                id: s.id,
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
                console.log(`🔍 AI Auto-Verifying Base City: ${data.baseCity}...`);
                const baseSuggestions = await getAutocompleteSuggestions(data.baseCity, undefined, 500);
                const bestBase = baseSuggestions[0];
                if (bestBase) {
                    setBaseCity(bestBase.name);
                    setBaseCityCoords(bestBase.coords);
                    focus = bestBase.coords;
                } else {
                    setBaseCity(data.baseCity);
                    const cityCoords = await getCoordinates(data.baseCity);
                    if (cityCoords) focus = cityCoords;
                }
            } else if (baseCity) {
                const cityCoords = await getCoordinates(baseCity);
                if (cityCoords) focus = cityCoords;
            }

            if (data.stayLocation) {
                console.log(`🔍 AI Auto-Verifying Stay Location: ${data.stayLocation}...`);
                const staySuggestions = await getAutocompleteSuggestions(data.stayLocation, focus, 100);
                const bestStay = staySuggestions[0];
                if (bestStay) {
                    setAccommodation(bestStay.name);
                    setAccommodationCoords(bestStay.coords);
                } else {
                    setAccommodation(data.stayLocation);
                    const stayCoords = await getCoordinates(data.stayLocation, focus);
                    if (stayCoords) setAccommodationCoords(stayCoords);
                }
            }

            if (data.places) {
                const verifiedPlaces: UIPlace[] = [];
                for (const p of data.places) {
                    console.log(`🔍 AI Auto-Verifying: ${p.name}...`);
                    const suggestions = await getAutocompleteSuggestions(p.name, focus, 100);
                    const bestMatch = suggestions[0];

                    verifiedPlaces.push({
                        id: Math.random().toString(36).substr(2, 9),
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

    const handleSaveTrip = () => {
        if (!saveName.trim()) return;

        const newTrip: SavedTrip = {
            id: Math.random().toString(36).substring(7),
            name: saveName,
            timestamp: Date.now(),
            baseCity,
            baseCityCoords,
            accommodation,
            accommodationCoords,
            startDate: startDate.toString(),
            tripLength,
            places,
            transportMode
        };

        setSavedTrips(prev => [newTrip, ...prev]);
        setIsSaveModalOpen(false);
        setSaveName('');
    };

    const handleLoadTrip = (trip: SavedTrip) => {
        setBaseCity(trip.baseCity);
        setBaseCityCoords(trip.baseCityCoords || null);
        setAccommodation(trip.accommodation);
        setAccommodationCoords(trip.accommodationCoords || null);
        setStartDate(trip.startDate);
        setTripLength(trip.tripLength);
        setPlaces(trip.places);
        setTransportMode(trip.transportMode);
        setIsMyTripsOpen(false);

        // Reset operational state to trigger re-plan
        setSchedule(null);
        setRouteGeoJson({});
        setMapCoords([]);
    };

    const handleDeleteTrip = (id: string) => {
        setSavedTrips(prev => prev.filter(t => t.id !== id));
    };

    const handleClearAll = () => {
        setBaseCity('');
        setBaseCityCoords(null);
        setAccommodation('');
        setAccommodationCoords(null);
        setStartDate(new Date().toISOString().split('T')[0]);
        setTripLength(1);
        setTransportMode('driving-car');
        setPlaces([
            { id: 'initial-1', name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' },
            { id: 'initial-2', name: '', visit_duration: 60, is_reservation: false, reservation_date: today, reservation_clock: '12:00' }
        ]);
        setSchedule(null);
        setRouteGeoJson({});
        setMapCoords([]);
        setError(null);
        setAiInput('');
        setSelectedEnrichment(null);
    };

    return (
        <div className="flex overflow-hidden h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)] font-body">
            {/* SideNavBar Shell */}
            <aside className="h-screen w-72 fixed left-0 top-0 border-r border-[var(--color-outline-variant)]/15 bg-[var(--color-surface-container-lowest)]/70 backdrop-blur-lg flex flex-col z-50">
                <div className="px-6 pt-8 mb-10 shrink-0">
                    <h1 className="text-xl font-bold tracking-tighter text-[var(--color-on-surface)] font-headline">Yathir.ai</h1>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-secondary)] font-semibold mt-1">AI Concierge</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                    <nav className="px-3 space-y-6 mb-8">
                        <a
                            className={`flex items-center gap-3 px-4 py-3 rounded-none transition-all ${!isMyTripsOpen ? 'bg-[var(--color-primary-container)]/10 text-[var(--color-primary)] border-r-2 border-[var(--color-secondary)]' : 'text-white/40 hover:bg-white/5'}`}
                            href="#"
                            onClick={(e) => { e.preventDefault(); setIsMyTripsOpen(false); }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" /><line x1="9" x2="9" y1="3" y2="18" /><line x1="15" x2="15" y1="6" y2="21" /></svg>
                            <span className="font-medium text-sm">Itinerary</span>
                        </a>
                        <a
                            className={`flex items-center gap-3 px-4 py-3 rounded-none transition-all ${isMyTripsOpen ? 'bg-[#00ff41]/10 text-[#00ff41] border-r-2 border-[#00ff41]' : 'text-white/40 hover:bg-white/5'}`}
                            href="#"
                            onClick={(e) => { e.preventDefault(); setIsMyTripsOpen(true); }}
                        >
                            <Globe size={20} />
                            <span className="font-medium text-sm">My Trips ({savedTrips.length})</span>
                        </a>


                        {isMyTripsOpen ? (
                            <div className="mt-8 animate-in fade-in slide-in-from-left-4 duration-500 overflow-y-auto max-h-[60vh] custom-scrollbar px-3">
                                <div className="px-3 mb-4 flex items-center justify-between">
                                    <span className="text-[10px] font-black tracking-[0.2em] text-[var(--color-secondary)] uppercase">Saved Routes</span>
                                </div>
                                {savedTrips.length === 0 ? (
                                    <div className="p-10 text-center space-y-4">
                                        <div className="w-16 h-16 bg-white/5 rounded-none flex items-center justify-center mx-auto opacity-20">
                                            <Map size={32} />
                                        </div>
                                        <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">No trips saved yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {savedTrips.map(trip => (
                                            <div key={trip.id} className="group relative bg-[var(--color-surface-container-lowest)] p-4 rounded-none border border-white/5 hover:border-[var(--color-primary)]/40 transition-all shadow-xl">
                                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteTrip(trip.id); }}
                                                        className="p-1.5 bg-red-500/20 text-red-400 rounded-none hover:bg-red-500 hover:text-white transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                                <div onClick={() => handleLoadTrip(trip)} className="cursor-pointer space-y-2">
                                                    <h4 className="text-sm font-bold text-[var(--color-zen-neon)] group-hover:text-white transition-colors line-clamp-1">{trip.name}</h4>
                                                    <div className="flex items-center gap-3 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                                        <span className="flex items-center gap-1"><MapPin size={8} /> {trip.baseCity}</span>
                                                        <span className="flex items-center gap-1"><Calendar size={8} /> {new Date(trip.timestamp).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="text-[8px] text-[var(--color-secondary)] font-black uppercase tracking-[0.2em]">
                                                        {trip.places.length} STOPS • {trip.tripLength} DAYS
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {isSpotlightLoading && (
                                    <div className="mt-8 animate-in fade-in slide-in-from-left-4 duration-500">
                                        <div className="px-6 mb-4 flex items-center justify-between">
                                            <span className="text-[10px] font-black tracking-[0.2em] text-[var(--color-secondary)] uppercase">POI Insights</span>
                                        </div>
                                        <div className="bg-[var(--color-surface-container-lowest)] rounded-none overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] mx-3 animate-pulse">
                                            <div className="h-48 w-full bg-white/5" />
                                            <div className="p-6 relative z-10 -mt-10">
                                                <div className="h-6 w-3/4 bg-white/10 rounded-none mb-4" />
                                                <div className="space-y-2 mb-6">
                                                    <div className="h-3 w-full bg-white/5 rounded-none" />
                                                    <div className="h-3 w-full bg-white/5 rounded-none" />
                                                    <div className="h-3 w-2/3 bg-white/5 rounded-none" />
                                                </div>
                                                <div className="h-10 w-full bg-[var(--color-primary)]/10 rounded-none" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!isSpotlightLoading && selectedEnrichment && (
                                    <div className="mt-8 animate-in fade-in slide-in-from-left-4 duration-500">
                                        <div className="px-6 mb-4 flex items-center justify-between">
                                            <span className="text-[10px] font-black tracking-[0.2em] text-[var(--color-secondary)] uppercase">POI Insights</span>
                                            <button onClick={() => setSelectedEnrichment(null)} className="text-white/20 hover:text-white transition-all hover:rotate-90">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                            </button>
                                        </div>
                                        <div className="bg-[var(--color-surface-container-lowest)] rounded-none overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] mx-3">
                                            {selectedEnrichment.photo ? (
                                                <div className="h-48 w-full relative group/photo overflow-hidden bg-[var(--color-surface)] rounded-t-none">
                                                    <img src={selectedEnrichment.photo} alt={selectedEnrichment.name} className="w-full h-full object-cover transition-all duration-700 group-hover/photo:scale-110 brightness-[0.85] group-hover/photo:brightness-100" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-container-lowest)] via-[var(--color-surface-container-lowest)]/40 to-transparent opacity-100 z-10" />
                                                    <div className="progressive-blur-bottom" />
                                                    <div className="absolute top-4 right-4 flex gap-2.5 items-center z-50">
                                                        {selectedEnrichment.website && (
                                                            <a href={selectedEnrichment.website} title="Official Website" target="_blank" rel="noopener noreferrer" className="p-2.5 bg-black/60 rounded-none text-white hover:bg-[var(--color-primary)] hover:text-black transition-all backdrop-blur-md border border-white/10 shadow-xl">
                                                                <Globe size={14} />
                                                            </a>
                                                        )}
                                                        {selectedEnrichment.pageId && (
                                                            <a href={`https://en.wikipedia.org/?curid=${selectedEnrichment.pageId}`} title="Wikipedia Article" target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center bg-black/60 rounded-none text-white hover:bg-white hover:text-black transition-all backdrop-blur-md border border-white/10 shadow-xl group/wiki">
                                                                <span className="text-[17px] font-bold leading-none translate-y-[1px] group-hover/wiki:scale-110 transition-transform" style={{ fontFamily: '"Linux Libertine", "Hoefler Text", var(--font-libre-baskerville), serif' }}>W</span>
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
                                                        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-none border border-white/5 shadow-inner">
                                                            <Clock className="text-[var(--color-secondary)]" size={14} />
                                                            <span className="text-[10px] font-bold text-white/60 tracking-wide uppercase">{getOpenStatus(selectedEnrichment.opening_hours).message}</span>
                                                        </div>
                                                    )}
                                                    {!places.some(p => p.name === selectedEnrichment.name) && (
                                                        <button
                                                            onClick={() => handleAddRecommended(selectedEnrichment)}
                                                            className="w-full bg-[var(--color-primary)] text-black text-[10px] font-bold py-3.5 rounded-none shadow-[0_10px_30px_-5px_rgba(75,142,255,0.4)] active:scale-[0.98] transition-all uppercase tracking-[0.2em] mt-1 group"
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
                            </>
                        )}


                    </nav>

                    {/* Trip Analytics (V6.7) */}
                    <div className="mt-auto border-t border-white/5 bg-black/20 p-6 space-y-5 animate-in slide-in-from-bottom-4 fade-in duration-1000">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                            <span className="text-xs font-mono font-bold tracking-[0.2em] text-white/50 uppercase">Trip Analytics</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 p-3 rounded-none border border-white/5 space-y-1 hover:-translate-y-1 hover:border-[var(--color-primary)]/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                                <div className="flex items-center gap-2 text-[var(--color-primary)] opacity-60 group-hover:opacity-100 transition-opacity">
                                    <MapPin size={12} />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Stops</span>
                                </div>
                                <div className="text-lg font-black text-white">{analytics.stops}</div>
                            </div>

                            <div className="bg-white/5 p-3 rounded-none border border-white/5 space-y-1 hover:-translate-y-1 hover:border-[var(--color-secondary)]/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                                <div className="flex items-center gap-2 text-[var(--color-secondary)] opacity-60 group-hover:opacity-100 transition-opacity">
                                    <Clock size={12} />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Hours</span>
                                </div>
                                <div className="text-lg font-black text-white">{analytics.hours}</div>
                            </div>

                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-blue-400/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                                <div className="flex items-center gap-2 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <Route size={12} />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Distance</span>
                                </div>
                                <div className="text-lg font-black text-white">{analytics.distance} <span className="text-[10px] text-white/40">km</span></div>
                            </div>

                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-white/10 transition-all duration-300 cursor-default group">
                                <div className="flex items-center gap-2 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <CalendarCheck size={12} />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Bookings</span>
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
                                    {analytics.reservationDetails.map((res) => (
                                        <div
                                            key={res.id || `${res.name}-${res.date}-${res.time}`}
                                            onClick={() => res.latlon && handleSpotlight(res.name, res.latlon[0], res.latlon[1])}
                                            className="bg-black/20 p-3 rounded-2xl border border-white/5 flex items-center justify-between group/res hover:bg-white/5 hover:border-[var(--color-zen-neon)]/30 hover:-translate-y-0.5 transition-all cursor-pointer shadow-lg active:scale-[0.98]"
                                        >
                                            <div className="space-y-0.5">
                                                <div className="text-[11px] font-bold text-[var(--color-zen-neon)] group-hover/res:text-white transition-colors line-clamp-1">{res.name}</div>
                                                <div className="text-[9px] text-white/40 uppercase tracking-wider">{res.date}</div>
                                            </div>
                                            <div className="text-[10px] font-mono font-bold text-[var(--color-zen-neon)] bg-[var(--color-zen-neon)]/10 px-2 py-1 rounded-lg group-hover/res:bg-[var(--color-zen-neon)] group-hover/res:text-black transition-all">
                                                {res.time}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isWeatherLoading ? (
                            <div className="bg-white/5 p-4 rounded-none border border-white/5 flex items-center justify-center h-20 animate-pulse">
                                <Loader2 size={20} className="text-[var(--color-primary)] animate-spin opacity-40" />
                            </div>
                        ) : weather ? (() => {
                            const Icon = WEATHER_ICON_MAP[weather.iconCode] || Cloud;
                            return (
                                <div className="bg-gradient-to-br from-[var(--color-primary)]/10 to-transparent p-4 rounded-none border border-white/5 flex items-center justify-between group hover:from-[var(--color-primary)]/20 transition-all cursor-default relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1 opacity-10">
                                        <Icon size={40} className="text-[var(--color-primary)]" />
                                    </div>
                                    <div className="space-y-0.5 relative z-10">
                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">Current Weather</div>
                                        <div className="text-base font-black text-white flex items-center gap-2">
                                            {weather.temp}°C
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter truncate max-w-[80px]">{weather.description}</span>
                                        </div>
                                        <div className="text-[8px] text-[var(--color-secondary)] font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-1">
                                            <MapPin size={8} /> {weather.location}
                                        </div>
                                    </div>
                                    <Icon size={24} className="text-[var(--color-primary)] opacity-40 group-hover:opacity-80 transition-opacity" />
                                </div>
                            );
                        })() : (
                            <div className="bg-white/5 p-4 rounded-none border border-white/5 flex items-center justify-between group transition-all cursor-default relative overflow-hidden">
                                <div className="space-y-1 relative z-10">
                                    <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">Real-time Weather</div>
                                    <div className="text-xs font-bold text-white/60">
                                        Set location to see weather
                                    </div>
                                </div>
                                <Sun size={24} className="text-white/10" />
                            </div>
                        )}

                        <p className="text-[9px] text-white/20 leading-relaxed font-medium italic">
                            "Travel is the only thing you buy that makes you richer."
                        </p>
                    </div>
                </div>
            </aside>

            {/* Save Trip Modal Overlay */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-[var(--color-surface-container-lowest)] w-full max-w-md p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6">
                        <div className="space-y-2 text-center">
                            <div className="w-16 h-16 bg-[var(--color-zen-neon)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Save size={32} className="text-[var(--color-zen-neon)]" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tighter text-white font-headline">Name Your Adventure</h2>
                            <p className="text-sm text-white/40">Give this itinerary a memorable name to find it later.</p>
                        </div>

                        <div className="space-y-4">
                            <input
                                type="text"
                                value={saveName}
                                onChange={(e) => setSaveName(e.target.value)}
                                placeholder="e.g. Autumn in Tokyo 2026"
                                autoFocus
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-zen-neon)] transition-all text-center text-lg font-medium"
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setIsSaveModalOpen(false)}
                                    className="px-6 py-4 rounded-none border border-white/10 text-white/60 hover:bg-white/5 transition-all font-bold text-xs uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveTrip}
                                    disabled={!saveName.trim()}
                                    className="px-6 py-4 rounded-none bg-[var(--color-zen-neon)] text-black font-bold text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    Store Route
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Map Canvas */}
            <main className="ml-72 flex-1 relative h-screen w-full bg-[var(--color-surface-container-lowest)]">

                {/* Top Navigation */}
                {/* Floating Navigation Pill (Left) */}
                <div className="fixed top-6 left-80 z-40 flex items-center gap-1.5 p-1.5 backdrop-blur-2xl bg-black/40 border border-white/10 rounded-none shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                    <button
                        onClick={() => setIsMyTripsOpen(false)}
                        className={`px-7 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-all ${!isMyTripsOpen ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/20 rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                    >
                        Planner
                    </button>
                    <button
                        onClick={() => setIsMyTripsOpen(true)}
                        className={`px-7 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-all ${isMyTripsOpen ? 'bg-[var(--color-zen-neon)] text-black shadow-lg shadow-[var(--color-zen-neon)]/20 rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                    >
                        Saved Trips
                    </button>
                </div>

                {/* Floating Map Mode Pill (Center) */}
                <div className="fixed top-6 left-[calc(50%+9rem)] -translate-x-1/2 z-40 flex items-center gap-1.5 p-1.5 backdrop-blur-2xl bg-black/40 border border-white/10 rounded-none shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 delay-100">
                    <button
                        onClick={() => setMapMode('drag')}
                        className={`flex items-center gap-2 px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-all ${mapMode === 'drag' ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/20 rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                        title="Pan and Zoom"
                    >
                        <Grab size={16} /> Drag
                    </button>
                    <button
                        onClick={() => setMapMode('pin')}
                        className={`flex items-center gap-2 px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider transition-all ${mapMode === 'pin' ? 'bg-[var(--color-zen-neon)] text-black shadow-lg shadow-[var(--color-zen-neon)]/30 rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                        title="Drop Pin to Add Location"
                    >
                        <MapPin size={16} /> Pin
                    </button>
                </div>

                {/* Floating System Pill (Right) */}
                <div className="fixed top-6 right-10 z-40 flex items-center gap-5 p-1.5 backdrop-blur-2xl bg-black/40 border border-white/10 rounded-none shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 delay-200">
                    <div className="flex items-center bg-white/5 rounded-none p-1 border border-white/5">
                        <button
                            onClick={() => setMapStyle('dark')}
                            className={`p-2.5 transition-all ${mapStyle === 'dark' ? 'bg-[var(--color-primary)] text-black rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                            title="Dark Matter"
                        >
                            <Moon size={16} />
                        </button>
                        <button
                            onClick={() => setMapStyle('light')}
                            className={`p-2.5 transition-all ${mapStyle === 'light' ? 'bg-[var(--color-primary)] text-black rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                            title="Positron"
                        >
                            <Sun size={16} />
                        </button>
                        <button
                            onClick={() => setMapStyle('voyager')}
                            className={`p-2.5 transition-all ${mapStyle === 'voyager' ? 'bg-[var(--color-primary)] text-black rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                            title="Voyager"
                        >
                            <Layers size={16} />
                        </button>
                        <button
                            onClick={() => setMapStyle('satellite')}
                            className={`p-2.5 transition-all ${mapStyle === 'satellite' ? 'bg-[var(--color-primary)] text-black shadow-lg shadow-[var(--color-primary)]/30 rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                            title="Satellite"
                        >
                            <Globe size={16} />
                        </button>
                    </div>

                    <button
                        onClick={() => setIsSaveModalOpen(true)}
                        className="flex items-center gap-2 bg-[var(--color-zen-neon)] text-black px-6 py-3 rounded-none text-[12px] font-extrabold uppercase tracking-widest border border-transparent hover:bg-black hover:text-[var(--color-zen-neon)] hover:border-[var(--color-zen-neon)]/30 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[var(--color-zen-neon)]/20"
                    >
                        <Save size={16} /> Save
                    </button>
                </div>


                {/* Day Navigation Bar (V4.4) */}
                {schedule && schedule.length > 0 && (
                    <div className="fixed top-24 left-[calc(50%+9rem)] -translate-x-1/2 z-[45] flex items-center gap-2 p-1.5 bg-[var(--color-surface-container-low)]/80 backdrop-blur-2xl rounded-none border border-white/5 shadow-2xl animate-in fade-in slide-in-from-top-4">
                        <button
                            onClick={() => setSelectedDay('all')}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${selectedDay === 'all' ? 'bg-[var(--color-primary)] text-black rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                        >
                            OVERVIEW
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        {Array.from({ length: tripLength }).map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedDay(i)}
                                className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${selectedDay === i ? 'bg-[var(--color-secondary)] text-black rounded-xl' : 'text-white/40 hover:text-white hover:bg-white/5 rounded-none'}`}
                            >
                                DAY {i + 1}
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
                                id: p.id,
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
                        mapMode={mapMode}
                        mapStyle={mapStyle}
                        onMapClick={handleMapClick}
                        accommodationCoords={accommodationCoords}
                        accommodationName={accommodation}
                    />
                </div>

                {/* Configuration Panel (V7.0 Zen Mode) */}
                <div className={`absolute left-10 top-24 z-[100] flex flex-col gap-4 transition-all duration-500 ease-in-out ${isConfigExpanded ? 'bottom-10 w-[440px]' : 'w-48 h-14'}`}>
                    <section className={`bg-[var(--color-surface-container-high)]/80 backdrop-blur-xl rounded-none shadow-2xl border border-[var(--color-outline-variant)]/10 transition-all duration-500 overflow-hidden ${isConfigExpanded ? 'flex flex-col h-full' : 'p-0 h-full flex items-center'}`}>
                        {isConfigExpanded ? (
                            <div className="flex-1 overflow-y-auto p-7 flex flex-col gap-5 scrollbar-bounded">
                                <div className="space-y-1">
                                    <div
                                        className="flex items-center justify-between"
                                        style={{ marginBottom: 'var(--panel-vertical-rhythm)' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[var(--color-planner-green)] shadow-[0_0_8px_rgba(83,225,111,0.6)]"></div>
                                            <span className="text-10px font-bold tracking-[0.1em] text-[var(--color-planner-green)] uppercase">CONFIGURE</span>
                                        </div>
                                        <div
                                            className="flex items-center"
                                            style={{ gap: 'var(--action-bar-gap)' }}
                                        >
                                            <button
                                                onClick={() => setIsAiOpen(!isAiOpen)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all border ${isAiOpen ? 'bg-[var(--color-primary-container)] text-[var(--color-on-primary-container)] border-transparent shadow-[0_0_12px_var(--color-primary)]' : 'bg-transparent text-[var(--color-primary)] border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/10'}`}
                                            >
                                                <Wand2 size={12} />
                                                Magic
                                            </button>
                                            <button
                                                onClick={handleClearAll}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all group"
                                                title="Clear All Inputs"
                                            >
                                                <RotateCcw size={12} className="group-hover:rotate-[-90deg] transition-transform" />
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => setIsConfigExpanded(false)}
                                                className="p-2 hover:bg-white/5 rounded-none text-white/20 hover:text-white transition-all ml-1"
                                                title="Minimize"
                                            >
                                                <Minimize2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold text-[var(--color-on-surface)] tracking-tight font-headline">CONFIGURE YOUR TRIP</h2>
                                    </div>

                                    {isAiOpen && (
                                        <div className="mt-4 p-4 bg-[var(--color-surface-container-lowest)] rounded-none border border-[var(--color-primary)]/20 animate-in fade-in slide-in-from-top-2 relative overflow-hidden">
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
                                                    className="bg-[var(--color-primary-container)] hover:bg-[var(--color-primary-fixed-dim)] text-[var(--color-on-primary-container)] text-[10px] font-extrabold px-4 py-2 rounded-none transition-all flex items-center gap-2 shadow-lg active:scale-95"
                                                >
                                                    {isAiParsing ? <Loader2 size={12} className="animate-spin" /> : 'Apply Magic'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2 grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5 relative">
                                            <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Trip Base City</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-none text-white transition-all outline-none placeholder:text-white/10"
                                                type="text"
                                                placeholder="e.g. Tokyo"
                                                value={baseCity}
                                                onFocus={() => setActiveSearch({ type: 'base' })}
                                                onChange={e => {
                                                    setBaseCity(e.target.value);
                                                    setBaseCityCoords(null);
                                                }}
                                            />
                                            {activeSearch?.type === 'base' && (suggestions.length > 0 || searchLoading) && (
                                                <div className="absolute top-full left-0 right-0 z-[110] mt-2 bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]/30 rounded-none shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                                    {searchLoading && (
                                                        <div className="p-3 text-xs text-gray-400 flex items-center gap-2">
                                                            <Loader2 className="animate-spin" size={12} /> Searching...
                                                        </div>
                                                    )}
                                                    {suggestions.map((s, sIdx) => (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => handleSelectBaseCitySuggestion(s)}
                                                            className="w-full text-left p-3 hover:bg-[var(--color-legacy-blue)]/10 border-b border-white/5 last:border-none transition-colors group"
                                                        >
                                                            <div className="text-sm font-bold text-white group-hover:text-[var(--color-legacy-blue)]">{s.name}</div>
                                                            <div className="text-[10px] text-gray-400 truncate">{s.label}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-1.5 relative">
                                            <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Stay Location</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-none text-white transition-all outline-none placeholder:text-white/10"
                                                type="text"
                                                placeholder="e.g. Hilton Shinjuku"
                                                value={accommodation}
                                                onFocus={() => setActiveSearch({ type: 'stay' })}
                                                onChange={e => {
                                                    setAccommodation(e.target.value);
                                                    setAccommodationCoords(null);
                                                }}
                                            />
                                            {activeSearch?.type === 'stay' && (suggestions.length > 0 || searchLoading) && (
                                                <div className="absolute top-full left-0 right-0 z-[110] mt-2 bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]/30 rounded-none shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
                                                    {searchLoading && (
                                                        <div className="p-3 text-xs text-gray-400 flex items-center gap-2">
                                                            <Loader2 className="animate-spin" size={12} /> Searching...
                                                        </div>
                                                    )}
                                                    {suggestions.map((s, sIdx) => (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => handleSelectStaySuggestion(s)}
                                                            className="w-full text-left p-3 hover:bg-[var(--color-legacy-blue)]/10 border-b border-white/5 last:border-none transition-colors group"
                                                        >
                                                            <div className="text-sm font-bold text-white group-hover:text-[var(--color-legacy-blue)]">{s.name}</div>
                                                            <div className="text-[10px] text-gray-400 truncate">{s.label}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Starting Date</label>
                                        <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-none text-white transition-all outline-none" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Days</label>
                                        <input className="w-full bg-white/5 border border-white/10 focus:border-[var(--color-primary)]/50 focus:ring-4 focus:ring-[var(--color-primary)]/10 text-sm px-4 py-2.5 rounded-none text-white transition-all outline-none" type="number" min={1} max={30} value={tripLength} onChange={e => setTripLength(parseInt(e.target.value) || 1)} />
                                    </div>
                                    <div className="space-y-1.5 col-span-2 mt-1">
                                        <label className="text-[9px] font-bold tracking-[0.2em] text-[var(--color-primary)]/70 uppercase ml-1">Travel Mode</label>
                                        <div className="grid grid-cols-3 bg-white/5 rounded-none p-1 gap-1 border border-white/10">
                                            <button
                                                onClick={() => setTransportMode('driving-car')}
                                                className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'driving-car' ? 'bg-[var(--color-zen-neon)] text-black shadow-lg rounded-xl' : 'text-white/40 hover:bg-white/5 rounded-none'}`}
                                            >
                                                <Car size={14} /> Car
                                            </button>
                                            <button
                                                onClick={() => setTransportMode('foot-walking')}
                                                className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'foot-walking' ? 'bg-[var(--color-zen-neon)] text-black shadow-lg rounded-xl' : 'text-white/40 hover:bg-white/5 rounded-none'}`}
                                            >
                                                <Footprints size={14} /> Walk
                                            </button>
                                            <button
                                                onClick={() => setTransportMode('cycling-regular')}
                                                className={`flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${transportMode === 'cycling-regular' ? 'bg-[var(--color-zen-neon)] text-black shadow-lg rounded-xl' : 'text-white/40 hover:bg-white/5 rounded-none'}`}
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
                                                    <div key={dateStr} className="flex items-center gap-3 bg-white/5 p-2 rounded-none border border-white/5 hover:border-white/10 transition-colors">
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

                                    <Reorder.Group axis="y" values={places} onReorder={setPlaces} className="space-y-4">
                                        {places.map((place, idx) => (
                                            <Reorder.Item
                                                key={place.id}
                                                value={place}
                                                id={place.id}
                                                className="bg-[var(--color-surface-container-high)] p-5 rounded-none border border-[var(--color-outline-variant)]/20 shadow-xl group hover:border-[var(--color-primary)]/30 transition-all cursor-pointer relative"
                                            >
                                                {/* Drag handle */}
                                                <div className="absolute -left-3 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                                                    <Grab size={16} className="text-[var(--color-primary)]/40" />
                                                </div>

                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="relative">
                                                        <input
                                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-base font-bold text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-variant)]/40 outline-none"
                                                            placeholder={idx === 0 ? "e.g., TeamLab Borderless" : "e.g., Shibuya Crossing"}
                                                            value={place.name}
                                                            onFocus={() => setActiveSearch({ type: 'place', index: idx })}
                                                            onChange={(e) => {
                                                                handlePlaceChange(idx, 'name', e.target.value);
                                                                if (place.coords) handlePlaceChange(idx, 'coords', undefined); // Clear coords if they edit the text
                                                            }}
                                                        />
                                                        {activeSearch?.type === 'place' && activeSearch.index === idx && (suggestions.length > 0 || searchLoading) && (
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
                                                                        className="w-full text-left p-3 hover:bg-[var(--color-legacy-blue)]/10 border-b border-white/5 last:border-none transition-colors group"
                                                                    >
                                                                        <div className="text-sm font-bold text-white group-hover:text-[var(--color-legacy-blue)]">{s.name}</div>
                                                                        <div className="text-[10px] text-gray-400 truncate">{s.label}</div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {places.length > 1 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemovePlace(idx);
                                                            }}
                                                            className="text-[var(--color-outline)] hover:text-[var(--color-error)] transition-colors p-1"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-4 mt-2">
                                                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-none border border-white/5">
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
                                            </Reorder.Item>
                                        ))}
                                    </Reorder.Group>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                        <label className="text-[10px] font-bold tracking-widest text-white/40 uppercase ml-1 flex items-center gap-2">
                                            <Sparkles size={12} className="text-[var(--color-planner-green)]" />
                                            Discover Local Gems
                                        </label>
                                        <button
                                            onClick={handleInspireMe}
                                            className="text-[var(--color-planner-green)] hover:text-white text-[10px] font-bold transition-all flex items-center gap-1 bg-[var(--color-planner-green)]/10 px-2 py-1 rounded-none"
                                        >
                                            <Sparkle size={10} />
                                            Inspire Me
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2 px-1">
                                        <div className="relative group flex-1">
                                            <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[var(--color-secondary)] transition-colors" />
                                            <input
                                                type="text"
                                                value={interest}
                                                onChange={(e) => setInterest(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
                                                placeholder="What are you in the mood for? (e.g. Art, Coffee, Landmarks)"
                                                className="w-full bg-white/5 border border-white/5 rounded-none pl-9 pr-4 py-2 text-[11px] text-white placeholder-white/20 focus:border-[var(--color-secondary)]/50 focus:bg-white/[0.08] outline-none transition-all"
                                            />
                                        </div>
                                        <button
                                            onClick={handleDiscover}
                                            disabled={isRecommending || !interest}
                                            className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 py-2 rounded-none border border-white/5 hover:border-white/20 text-[10px] font-bold transition-all uppercase tracking-tighter disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Search
                                        </button>
                                    </div>

                                    {isRecommending && (
                                        <div className="space-y-2 animate-pulse px-1">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="h-14 bg-white/5 rounded-none border border-white/5" />
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
                                                    className={`group relative bg-white/5 rounded-none border transition-all cursor-pointer overflow-hidden ${selectedEnrichment?.id === poi.id ? 'border-[var(--color-planner-green)] bg-white/10 shadow-[0_0_20px_rgba(83,225,111,0.1)]' : 'border-white/10 hover:border-[var(--color-legacy-blue)]/50 hover:bg-[var(--color-legacy-blue)]/5'}`}
                                                >
                                                    {poi.photo && (
                                                        <div className="h-28 w-full overflow-hidden">
                                                            <img src={poi.photo} alt={poi.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-surface-container-lowest)] via-[var(--color-surface-container-lowest)]/30 to-transparent z-10" />
                                                            <div className="progressive-blur-bottom" />
                                                            <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/60 to-transparent p-3">
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-white/80 bg-black/40 px-2 py-0.5 rounded-none backdrop-blur-sm border border-white/5">Wikimedia Photo</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="p-4">
                                                        <div className="flex justify-between items-start gap-2 mb-2">
                                                            <h4 className="text-sm font-bold text-white group-hover:text-[var(--color-legacy-blue)] transition-colors line-clamp-1">{poi.name}</h4>
                                                            {poi.opening_hours && (
                                                                <div className="shrink-0 flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded-none border border-white/5">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-planner-green)] animate-pulse" />
                                                                    <span className="text-[8px] font-bold text-white/60 truncate max-w-[60px]">{getOpenStatus(poi.opening_hours).message}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {poi.summary && <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed mb-3 italic">{poi.summary}</p>}
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleAddRecommended(poi)}
                                                                className="flex-1 bg-[var(--color-primary)] text-black text-[10px] font-bold py-2 rounded-none active:scale-95 transition-all"
                                                            >
                                                                Add to Plan
                                                            </button>
                                                            {poi.website && (
                                                                <a href={poi.website} target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-none text-white/40 hover:text-[var(--color-primary)] transition-colors border border-white/5">
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
                                    className="mt-auto w-full group relative overflow-hidden bg-black/40 border border-[var(--color-primary)]/50 text-[var(--color-primary)] font-mono font-black py-5 rounded-none transition-all active:scale-[0.98] flex items-center justify-center gap-3 hover:bg-[var(--color-primary)] hover:text-[#003907] shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.1)]"
                                >
                                    {/* Scanline hover effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                    
                                    <span className="text-sm uppercase tracking-[0.25em]">
                                        {isPlanning ? (
                                            <span className="flex items-center gap-3">
                                                <Loader2 className="animate-spin" size={16} /> 
                                                RUNNING_OPTIMIZER...
                                            </span>
                                        ) : 'Generate Optimized Itinerary'}
                                    </span>

                                    <div className="w-1.5 h-3.5 bg-[var(--color-primary)]/50 animate-pulse ml-1 group-hover:bg-[#003907]" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsConfigExpanded(true)}
                                className="w-full h-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-[#53e16f] shadow-[0_0_8px_rgba(83,225,111,0.6)]"></div>
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
                        <div className={`bg-[var(--color-surface-container-high)]/80 backdrop-blur-xl rounded-none border border-[var(--color-outline-variant)]/10 shadow-2xl transition-all duration-500 overflow-hidden ${isPlanExpanded ? 'p-6 flex-1 overflow-y-auto scrollbar-bounded' : 'p-0 h-full flex items-center'}`}>
                            {isPlanExpanded ? (
                                <>
                                    <h2 className="text-xl font-bold text-[var(--color-on-surface)] mb-6 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Route className="text-[var(--color-secondary)]" size={20} />
                                            Timeline
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setIsPlanExpanded(false)}
                                                className="p-1.5 hover:bg-white/5 rounded-none text-white/20 hover:text-white transition-all mr-1"
                                                title="Minimize"
                                            >
                                                <Minimize2 size={16} />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => schedule && exportToCsv(schedule)}
                                                className="text-[10px] font-bold tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-none hover:bg-[var(--color-legacy-blue)] hover:text-black transition-all shadow-lg active:scale-95"
                                            >
                                                CSV
                                            </button>
                                            <button
                                                onClick={() => schedule && exportToIcal(schedule)}
                                                className="text-[10px] font-bold tracking-wider bg-white/5 border border-white/10 px-4 py-2 rounded-none hover:bg-[var(--color-legacy-blue)] hover:text-black transition-all shadow-lg active:scale-95"
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
                                                .map((stop, i, arr) => {
                                                    const isHotel = stop.place.toLowerCase().includes('stay location');
                                                    if (!isHotel) realStopCounter++;

                                                    // Calculate traffic for travel bridge (if next stop exists)
                                                    const nextStop = arr[i + 1];
                                                    const travelInfo = nextStop ? {
                                                        mins: nextStop.travelMinutes,
                                                        delay: (nextStop.travelMinutes || 0) - (nextStop.historicalMinutes || 0)
                                                    } : null;

                                                    return (
                                                        <Fragment key={stop.id}>
                                                            <div
                                                                onClick={() => handleSpotlight(stop.place, stop.latlon[0], stop.latlon[1])}
                                                                className="relative group hover:-translate-y-1 transition-transform cursor-pointer"
                                                            >
                                                                <div className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-background)] shadow-[0_0_8px_var(--color-primary)] group-hover:bg-[var(--color-legacy-blue)] transition-colors" />
                                                                <div className="bg-[var(--color-surface-container-low)] p-4 rounded-xl border border-[var(--color-outline-variant)]/10 group-hover:border-[var(--color-legacy-blue)]/40 transition-colors">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <h4 className="text-sm font-bold text-[var(--color-on-surface)] group-hover:text-[var(--color-legacy-blue)] transition-colors line-clamp-1">
                                                                                    {isHotel ? <HomeIcon size={14} className="text-white group-hover:text-[var(--color-legacy-blue)] transition-colors translate-y-[-1px]" /> : `${realStopCounter}.`} {stop.place}
                                                                                </h4>
                                                                                {stop.isReservation && (
                                                                                    <div className="px-1.5 py-0.5 rounded-md bg-[var(--color-secondary)]/10 border border-[var(--color-secondary)]/20 text-[var(--color-secondary)]" title="Fixed Reservation">
                                                                                        <CalendarCheck size={10} />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <p className="text-[9px] uppercase tracking-widest font-bold text-[var(--color-on-surface-variant)] opacity-60">{stop.day.substring(0, 3)}, {stop.date}</p>
                                                                        </div>
                                                                        <span className="text-[10px] font-mono font-black text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full uppercase tracking-tighter shrink-0">
                                                                            {isHotel ? 'BASE' : `STOP ${realStopCounter}`}
                                                                        </span>
                                                                    </div>
                                                                    <div className="inline-flex items-center gap-2 bg-[var(--color-surface-container-lowest)] px-2 py-1 rounded-md border border-[var(--color-outline-variant)]/20 mt-2">
                                                                        <Clock className="text-[var(--color-secondary)]" size={10} />
                                                                        <span className="font-mono text-[var(--color-primary)] text-xs font-semibold">
                                                                            {stop.time} - {stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Travel Bridge (Inline Traffic Context) */}
                                                            {travelInfo && Math.round(travelInfo.mins || 0) > 0 && (
                                                                <div className="relative h-10 -ml-1 flex items-center">
                                                                    <div className="absolute left-[-1.5px] top-0 bottom-0 w-[3px] border-l-2 border-dashed border-white/10 ml-[-2px]"></div>
                                                                    <div className="ml-6 flex items-center gap-3">
                                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 shadow-sm transition-colors hover:bg-white/20">
                                                                            <Car size={10} className="text-[var(--color-primary)] opacity-80" />
                                                                            <span className="text-[10px] font-black text-white">{Math.round(travelInfo.mins || 0)}m</span>
                                                                        </div>

                                                                        {Math.abs(travelInfo.delay) > 0.5 && (
                                                                            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter border shadow-sm ${travelInfo.delay > 0
                                                                                ? (travelInfo.delay > 2 ? 'bg-red-500/20 border-red-500/30 text-red-100' : 'bg-orange-500/20 border-orange-500/30 text-orange-100')
                                                                                : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-100'
                                                                                }`}>
                                                                                <Activity size={10} />
                                                                                {travelInfo.delay > 0 ? '+' : ''}{travelInfo.delay.toFixed(1)}m traffic
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Fragment>
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
