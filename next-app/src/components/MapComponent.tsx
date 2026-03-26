'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
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

interface MapProps {
  coords: [number, number][];
  routeGeoJson?: any; 
  schedule?: ScheduleStop[] | null;
  onMarkerClick?: (stop: ScheduleStop) => void;
}

export default function MapComponent({ coords, routeGeoJson, schedule, onMarkerClick }: MapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const defaultCenter: [number, number] = [40.7128, -74.0060]; // NYC default
  
  const { center, zoom } = useMemo(() => {
    const c = coords.length > 0 ? coords[coords.length - 1] : defaultCenter;
    const z = coords.length > 0 ? 14 : 3;
    return { center: c, zoom: z };
  }, [coords]);

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
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl z-0 relative">
      <style dangerouslySetInnerHTML={{ __html: `
        .number-icon {
          background: var(--color-primary);
          color: var(--color-on-primary-container);
          border: 2px solid var(--color-background);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          box-shadow: 0 0 15px var(--color-primary);
        }
        .hotel-icon {
          background: transparent;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 24px;
          filter: drop-shadow(0 0 2px rgba(250, 204, 21, 0.4));
        }
        .leaflet-tooltip-tripit {
          background: var(--color-surface-container-high) !important;
          border: 1px solid var(--color-outline-variant) !important;
          color: var(--color-on-surface) !important;
          padding: 12px !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.5) !important;
          font-family: var(--font-body) !important;
        }
        .leaflet-tooltip-tripit:before {
          border-top-color: var(--color-surface-container-high) !important;
        }
        @keyframes routeFlow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .route-flow {
          animation: routeFlow 1s linear infinite;
        }
      `}} />
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        zoomControl={false}
      >
        <ChangeView center={center} zoom={zoom} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {useMemo(() => {
          let realStopIndex = 0;
          return coords.map((coord, i) => {
            const stop = schedule?.[i];
            const isHotel = stop?.place.toLowerCase().includes('stay location');
            if (!isHotel) realStopIndex++;
            
            const displayLabel = isHotel ? '🏨' : realStopIndex.toString();
            
            const icon = L.divIcon({
              className: isHotel ? 'hotel-icon' : 'number-icon',
              html: `<span>${displayLabel}</span>`,
              iconSize: isHotel ? [32, 32] : [28, 28],
              iconAnchor: isHotel ? [16, 16] : [14, 14]
            });

            return (
              <Marker 
                key={`marker-${i}`} 
                position={coord} 
                icon={icon}
                eventHandlers={{
                  click: () => {
                    if (stop && onMarkerClick) onMarkerClick(stop);
                  }
                }}
              >
                <Popup>
                  <div className="text-gray-900 font-semibold p-1">
                    {isHotel ? '🏠' : `${realStopIndex}.`} {stop?.place || 'Stop'}
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

        {/* 1. Base Route Layer (Memoized) */}
        {useMemo(() => (
          segments.map((segment, idx) => (
            <Fragment key={`base-seg-${idx}`}>
              {/* 
                THE BUFFER ZONE 🧲 
                Invisible, 24px wide, handles ALL mouse logic.
              */}
              <Polyline 
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
                     <div className="flex flex-col gap-1 min-w-[120px]">
                       <div className="flex items-center gap-2">
                         <Activity size={12} className="text-[var(--color-secondary)]" />
                         <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Live Drive Time:</span>
                         <span className="text-xs font-black text-[var(--color-primary)]">{segment.travelMinutes.toFixed(1)} mins</span>
                       </div>
                       
                       {(() => {
                         const delay = segment.travelMinutes - segment.historicalMinutes;
                         const delayRatio = delay / Math.max(0.1, segment.historicalMinutes);
                         
                         if (delayRatio > 0.1) {
                           // NOT smooth flow: Show ONLY the delay stats as requested
                           return (
                             <div className={`flex items-center gap-2 px-2 py-0.5 rounded-full border ${delayRatio > 0.4 ? 'bg-red-500/20 border-red-500/30' : 'bg-orange-500/20 border-orange-500/30'}`}>
                               <span className={`text-[9px] font-bold uppercase tracking-tighter ${delayRatio > 0.4 ? 'text-red-400' : 'text-orange-400'}`}>
                                 {delay > 0 ? '+' : ''}{delay.toFixed(1)}m relative to usual
                               </span>
                             </div>
                           );
                         } else {
                           // Smooth flow: Show the label
                           return (
                             <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30">
                               <span className="text-[9px] font-bold text-green-400 uppercase tracking-tighter">Smooth Flow</span>
                             </div>
                           );
                         }
                       })()}
                     </div>
                   </Tooltip>
                 )}
              </Polyline>
              {/* THE BASE LINE (Visual only) */}
              <Polyline 
                positions={segment.positions} 
                interactive={false}
                pathOptions={{ 
                  color: '#4b8eff', 
                  weight: 4, 
                  opacity: hoveredIndex !== null && hoveredIndex !== idx ? 0.2 : 0.6,
                  lineCap: 'round'
                }}
              />
            </Fragment>
          ))
        ), [segments, hoveredIndex])}

        {/* 2. Active Focus Layer (Visual Overlay - Always on Top) */}
        {hoveredIndex !== null && segments[hoveredIndex] && (() => {
           const segment = segments[hoveredIndex];
           return (
             <Fragment key="active-focus-layer">
               {/* Decorative Glow Backdrop (Non-interactive) */}
               <Polyline 
                 positions={segment.positions}
                 interactive={false}
                 pathOptions={{ 
                   color: 'var(--color-primary)', 
                   weight: 16, 
                   opacity: 0.25,
                   lineCap: 'round'
                 }} 
               />
               
               {/* Main Focus Line (Non-interactive) */}
               <Polyline 
                 positions={segment.positions} 
                 interactive={false}
                 pathOptions={{ 
                   color: 'var(--color-secondary)', 
                   weight: 6, 
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
