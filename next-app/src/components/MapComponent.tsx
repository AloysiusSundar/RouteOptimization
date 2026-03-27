'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ScheduleStop } from '@/lib/ScheduleGenerator';
import { Activity } from 'lucide-react';
import { useEffect, useMemo, useState, Fragment } from 'react';

// fix leaflet icon issues in next.js
const customIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = customIcon;

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
    const map = useMap();
    useEffect(() => {
        // Only set view if it's the first render or if the data actually changed
        // We use JSON.stringify to compare the array values rather than references
        map.setView(center, zoom);
    }, [JSON.stringify(center), zoom, map]);
    return null;
}

function MapEvents({ mode, onMapClick }: { mode: 'drag' | 'pin', onMapClick?: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            if (mode === 'pin' && onMapClick) {
                onMapClick(e.latlng.lat, e.latlng.lng);
            }
        },
    });
    return null;
}

interface MapProps {
    coords: [number, number][];
    routeGeoJson?: any; 
    schedule?: ScheduleStop[] | null;
    onMarkerClick?: (stop: ScheduleStop) => void;
    mapMode?: 'drag' | 'pin';
    onMapClick?: (lat: number, lng: number) => void;
    mapStyle?: 'dark' | 'light' | 'voyager' | 'satellite';
    accommodationCoords?: [number, number] | null;
    accommodationName?: string;
}

export default function MapComponent({ 
  coords, 
  routeGeoJson, 
  schedule, 
  onMarkerClick, 
  mapMode = 'drag', 
  onMapClick,
  mapStyle = 'dark',
  accommodationCoords,
  accommodationName
}: MapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const defaultCenter: [number, number] = [40.7128, -74.0060]; // NYC default
  
  const { center, zoom } = useMemo(() => {
    if (coords.length > 0) {
      return { center: coords[coords.length - 1], zoom: 14 };
    }
    if (accommodationCoords) {
      return { center: accommodationCoords, zoom: 14 };
    }
    return { center: defaultCenter, zoom: 3 };
  }, [coords, accommodationCoords]);

  const segments = useMemo(() => {
    if (!routeGeoJson || !routeGeoJson.features || routeGeoJson.features.length === 0) return [];
    
    const feature = routeGeoJson.features[0];
    const coords = feature.geometry.coordinates; // [lon, lat]
    const wayPoints = feature.properties?.way_points;

    if (!wayPoints || wayPoints.length < 2) {
      // Fallback: draw as single segment
      return [{
        positions: coords.map((c: any) => [c[1], c[0]] as [number, number]),
        travelMinutes: 0,
        historicalMinutes: 0
      }];
    }

    const result = [];
    for (let i = 0; i < wayPoints.length - 1; i++) {
        const startIdx = wayPoints[i];
        const endIdx = wayPoints[i+1];
        const segmentCoords = coords.slice(startIdx, endIdx + 1);
        
        result.push({
            positions: segmentCoords.map((c: any) => [c[1], c[0]] as [number, number]),
            travelMinutes: schedule?.[i+1]?.travelMinutes || 0,
            historicalMinutes: schedule?.[i+1]?.historicalMinutes || 0
        });
    }
    return result;
  }, [routeGeoJson, schedule]);

  return (
    <div className={`h-full w-full rounded-2xl overflow-hidden shadow-2xl z-0 relative ${mapMode === 'pin' ? 'cursor-crosshair' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .number-icon {
          background: ${mapStyle === 'satellite' ? 'var(--color-map-pin-satellite)' : 'var(--color-map-pin)'};
          color: white;
          border: 2px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          box-shadow: 0 0 15px ${mapStyle === 'satellite' ? 'rgba(0,0,0,0.5)' : 'var(--color-map-pin)'};
        }
        .hotel-icon {
          background: var(--color-map-stay);
          color: black;
          border: 2px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px ${mapStyle === 'satellite' ? 'rgba(0,0,0,0.5)' : 'var(--color-map-stay)'};
        }
        .leaflet-tooltip-tripit {
          background: ${mapStyle === 'satellite' ? 'var(--color-map-tooltip-bg-satellite)' : 'var(--color-map-tooltip-bg)'} !important;
          border: 1px solid ${mapStyle === 'satellite' ? 'var(--color-map-tooltip-border-satellite)' : 'var(--color-map-tooltip-border)'} !important;
          color: white !important;
          padding: 12px !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.7) !important;
          font-family: var(--font-body) !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-tooltip-tripit:before {
          border-top-color: ${mapStyle === 'satellite' ? 'var(--color-map-tooltip-bg-satellite)' : 'var(--color-map-tooltip-bg)'} !important;
        }
        @keyframes routeFlow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .route-flow {
          animation: routeFlow 1s linear infinite;
        }
        .cursor-crosshair .leaflet-container {
          cursor: crosshair !important;
        }
        .leaflet-container {
          background: #000 !important;
        }
      `}} />
      <MapContainer 
        center={center} 
        zoom={zoom} 
        minZoom={3}
        maxBounds={[[-85, -180], [85, 180]]}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
      >
        <ChangeView center={center} zoom={zoom} />
        <MapEvents mode={mapMode} onMapClick={onMapClick} />
        <TileLayer
          url={
            mapStyle === 'light' 
              ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              : mapStyle === 'voyager'
                ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                : mapStyle === 'satellite'
                  ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          }
          attribution={
            mapStyle === 'satellite'
              ? '&copy; <a href="https://www.esri.com/">Esri</a>'
              : '&copy; <a href="https://carto.com/">CARTO</a>'
          }
        />
        {useMemo(() => {
          let realStopIndex = 0;
          return coords.map((coord, i) => {
            const stop = schedule?.[i];
            const isHotel = stop?.place.toLowerCase().includes('stay location');
            
            // If it's the stay location, we skip rendering here to let the dedicated marker handle it
            // This prevents double markers when schedule is active
            if (isHotel) return null;
            
            realStopIndex++;
            const displayLabel = realStopIndex.toString();
            
            const icon = L.divIcon({
              className: isHotel ? 'hotel-icon' : 'number-icon',
              html: `<span>${displayLabel}</span>`,
              iconSize: isHotel ? [32, 32] : [28, 28],
              iconAnchor: isHotel ? [16, 16] : [14, 14]
            });

            return (
              <Marker 
                key={stop?.id || `marker-${i}`} 
                position={coord} 
                icon={icon}
                eventHandlers={{
                  click: () => {
                    if (stop && onMarkerClick) onMarkerClick(stop);
                  }
                }}
              >
                <Popup>
                  <div className="text-gray-900 font-semibold p-1 flex items-center gap-2">
                    {isHotel ? <span className="text-[var(--color-secondary)]">Stay</span> : `${realStopIndex}.`} {stop?.place || 'Stop'}
                  </div>
                </Popup>
                {stop && (
                  <Tooltip direction="top" offset={[0, -10]} opacity={1} className="leaflet-tooltip-tripit">
                    <div className="flex flex-col gap-1 min-w-[140px]">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--color-secondary)] font-bold">
                        {isHotel ? 'Base' : `Stop ${realStopIndex}`}
                      </div>
                      <div className="text-sm font-bold text-white">{stop.place}</div>
                      <div className="h-px bg-white/10 my-1"></div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-300">
                        <Activity size={10} />
                        {stop.time} - {stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                    </div>
                  </Tooltip>
                )}
              </Marker>
            );
          });
        }, [coords, schedule, onMarkerClick])}
        
        {/* Dedicated Stay Location Marker (Always visible if coords exist) */}
        {useMemo(() => {
          if (!accommodationCoords) return null;
          
          // Try to find more details from the schedule if it exists
          const scheduleStop = schedule?.find(s => s.place.toLowerCase().includes('stay location'));

          return (
            <Marker 
              position={accommodationCoords} 
              icon={L.divIcon({
                className: 'hotel-icon',
                html: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
              })}
            >
              <Popup>
                <div className="text-gray-900 font-semibold p-1">
                  Stay: {accommodationName || 'Stay Location'}
                  {scheduleStop && <div className="text-[10px] text-gray-500 font-normal mt-1">Active for this trip</div>}
                </div>
              </Popup>
              <Tooltip direction="top" offset={[0, -10]} opacity={1} className="leaflet-tooltip-tripit">
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <div className="text-[10px] uppercase tracking-widest text-yellow-500 font-bold">Stay Location</div>
                  <div className="text-sm font-bold text-white">{accommodationName || 'Your Accommodation'}</div>
                  {scheduleStop && (
                    <>
                      <div className="h-px bg-white/10 my-1"></div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-300">
                        <Activity size={10} />
                        Trip Base / Anchor
                      </div>
                    </>
                  )}
                </div>
              </Tooltip>
            </Marker>
          );
        }, [accommodationCoords, accommodationName, schedule])}

        {/* 1. Base Route Layer (Memoized) */}
        {useMemo(() => (
          segments.map((segment, idx) => (
            <Fragment key={`base-seg-${idx}`}>
              {/* 
                THE BUFFER ZONE 🧲 
                Invisible, 24px wide, handles ALL mouse logic.
              */}
              <Polyline 
                key={`buffer-${idx}-${mapStyle}`}
                positions={segment.positions} 
                eventHandlers={{
                  mouseover: () => setHoveredIndex(idx),
                  mouseout: () => setHoveredIndex(null),
                  click: () => setHoveredIndex(idx)
                }}
                pathOptions={{ 
                  color: 'transparent', 
                  weight: 24, 
                  opacity: 0.1, 
                  lineCap: 'round'
                }}
              >
                 {segment.travelMinutes !== undefined && (
                   <Tooltip sticky direction="top" interactive={false} className="leaflet-tooltip-tripit">
                     <div className="flex flex-col gap-2 min-w-[180px] p-0.5">
                       {/* Header: Drive Time (Precision Alignment) */}
                       <div className="flex items-baseline justify-between w-full">
                         <div className="flex items-center gap-1.5 min-w-0">
                           <Activity size={10} className="text-[var(--color-map-pin-secondary)] shrink-0 translate-y-[-1px]" />
                           <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 truncate">Drive Time</span>
                         </div>
                         <span className="text-sm font-black text-[var(--color-map-route)] ml-4 tabular-nums">{segment.travelMinutes.toFixed(1)}m</span>
                       </div>
                       
                       <div className="h-px bg-white/5 w-full"></div>

                       {/* Traffic Status Badge (Robust Hybrid) */}
                       {(() => {
                         const delay = segment.travelMinutes - segment.historicalMinutes;
                         const baseline = Math.max(0.5, segment.historicalMinutes);
                         const delayPercent = Math.round((delay / baseline) * 100);
                         const isSignificant = delay > 0.5 || Math.abs(delayPercent) >= 15;
                         
                         if (!isSignificant) {
                           return (
                             <div className="flex items-center justify-center px-2 py-1.5 rounded-lg border border-green-500/20 bg-green-500/10 text-center">
                               <span className="text-[9px] font-bold uppercase tracking-widest text-green-400">Smooth Flow</span>
                             </div>
                           );
                         }

                         const isSlower = delay > 0;
                         const colorClass = isSlower 
                           ? (delayPercent > 40 ? 'bg-red-500/15 border-red-500/25 text-red-400' : 'bg-orange-500/15 border-orange-500/20 text-orange-400')
                           : 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400';

                         return (
                           <div className={`flex items-center justify-center px-2 py-1.5 rounded-lg border text-center ${colorClass.split(' ').slice(0,2).join(' ')}`}>
                             <span className={`text-[9px] font-bold uppercase tracking-widest ${colorClass.split(' ').slice(2).join(' ')}`}>
                               {delay > 0 ? '+' : ''}{Math.abs(delay).toFixed(1)}m {isSlower ? 'slower' : 'faster'} than usual
                             </span>
                           </div>
                         );
                       })()}
                     </div>
                   </Tooltip>
                 )}
              </Polyline>

               {/* THE HALO LAYER (Finalized for Satellite) */}
               {mapStyle === 'satellite' && (
                 <Polyline 
                   key={`halo-${idx}-${mapStyle}`}
                   positions={segment.positions} 
                   interactive={false}
                   pathOptions={{ 
                     color: 'white', 
                     weight: 8, 
                     opacity: 0.8,
                     lineCap: 'round'
                   }}
                 />
               )}

               {/* THE BASE LINE (Visual only) */}
               <Polyline 
                 key={`base-${idx}-${mapStyle}`}
                 positions={segment.positions} 
                 interactive={false}
                 pathOptions={{ 
                   color: mapStyle === 'satellite' ? 'var(--color-map-route-satellite)' : 'var(--color-map-route)', 
                   weight: mapStyle === 'satellite' ? 5 : 4, 
                   opacity: hoveredIndex !== null && hoveredIndex !== idx ? (mapStyle === 'satellite' ? 0.3 : 0.2) : 1,
                   lineCap: 'round'
                 }}
               />
            </Fragment>
          ))
        ), [segments, hoveredIndex, mapStyle])}

        {/* 2. Active Focus Layer (Visual Overlay - Always on Top) */}
        {hoveredIndex !== null && segments[hoveredIndex] && (() => {
           const segment = segments[hoveredIndex];
           return (
             <Fragment key="active-focus-layer">
               {/* Decorative Glow Backdrop (Non-interactive) */}
               <Polyline 
                 key={`focus-glow-${hoveredIndex}-${mapStyle}`}
                 positions={segment.positions}
                 interactive={false}
                 pathOptions={{ 
                   color: mapStyle === 'satellite' ? 'var(--color-map-route-satellite)' : 'var(--color-map-route)', 
                   weight: mapStyle === 'satellite' ? 18 : 16, 
                   opacity: mapStyle === 'satellite' ? 0.4 : 0.25,
                   lineCap: 'round'
                 }} 
               />
               
               {/* Main Focus Line (Non-interactive) */}
               <Polyline 
                 key={`focus-main-${hoveredIndex}-${mapStyle}`}
                 positions={segment.positions} 
                 interactive={false}
                 pathOptions={{ 
                   color: mapStyle === 'satellite' ? 'white' : 'var(--color-map-pin-secondary)', 
                   weight: mapStyle === 'satellite' ? 7 : 6, 
                   opacity: 1,
                   lineCap: 'round',
                   dashArray: '10 10',
                   className: 'route-flow'
                 }}
               />
             </Fragment>
           );
        })()}
      </MapContainer>
    </div>
  );
}
