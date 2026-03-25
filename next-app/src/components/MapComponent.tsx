'use client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ScheduleStop } from '@/lib/ScheduleGenerator';
import { useEffect, useMemo } from 'react';

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
}

export default function MapComponent({ coords, routeGeoJson, schedule }: MapProps) {
  const defaultCenter: [number, number] = [40.7128, -74.0060]; // NYC default
  
  const { center, zoom } = useMemo(() => {
    const c = coords.length > 0 ? coords[coords.length - 1] : defaultCenter;
    const z = coords.length > 0 ? 14 : 3;
    return { center: c, zoom: z };
  }, [coords]);

  const routePositions: [number, number][] = [];
  if (routeGeoJson && routeGeoJson.features?.length > 0) {
    routeGeoJson.features.forEach((feature: any) => {
      const geo = feature.geometry;
      if (geo && geo.coordinates) {
        if(geo.type === 'LineString') {
           geo.coordinates.forEach((c: [number, number]) => routePositions.push([c[1], c[0]]));
        } else if (geo.type === 'MultiLineString') {
           geo.coordinates.forEach((line: [number, number][]) => {
             line.forEach(c => routePositions.push([c[1], c[0]]));
           });
        }
      }
    });
  }

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
        {coords.map((coord, i) => {
          const stop = schedule?.[i];
          const icon = L.divIcon({
            className: 'number-icon',
            html: `<span>${i + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          return (
            <Marker key={i} position={coord} icon={icon}>
              <Popup>
                <div className="text-gray-900 font-semibold p-1">
                  {i + 1}. {stop?.place || 'Stop'}
                </div>
              </Popup>
              {stop && (
                <Tooltip direction="top" offset={[0, -10]} opacity={1} className="leaflet-tooltip-tripit">
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--color-secondary)] font-bold">Stop {i+1}</div>
                    <div className="text-sm font-bold text-white">{stop.place}</div>
                    <div className="h-px bg-white/10 my-1"></div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {stop.time} - {stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  </div>
                </Tooltip>
              )}
            </Marker>
          );
        })}
        {routePositions.length > 0 && (
           <Polyline positions={routePositions} pathOptions={{ color: '#4b8eff', weight: 4, opacity: 0.6 }} />
        )}
      </MapContainer>
    </div>
  );
}
