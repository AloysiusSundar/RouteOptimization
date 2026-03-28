'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';

export default function GlobeElement() {
    const globeEl = useRef<any>(null);

    // Generate random arcs for "Handshakes" visualization
    const arcsData = useMemo(() => {
        const ARC_COUNT = 15;
        return [...Array(ARC_COUNT).keys()].map(() => ({
            startLat: (Math.random() - 0.5) * 180,
            startLng: (Math.random() - 0.5) * 360,
            endLat: (Math.random() - 0.5) * 180,
            endLng: (Math.random() - 0.5) * 360,
            color: ['rgba(0, 255, 65, 0.4)', 'rgba(0, 255, 65, 0.4)']
        }));
    }, []);

    useEffect(() => {
        if (globeEl.current) {
            // Configure controls
            const controls = globeEl.current.controls();
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.5;
            controls.enableZoom = false; // Keep it focused for the landing page grid

            // Initial POV
            globeEl.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);
        }
    }, []);

    return (
        <div className="w-full h-full">
            <Globe
                ref={globeEl}
                backgroundColor="rgba(0,0,0,0)" // Transparent for the Bento grid
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg" // High-fidelity dark base
                
                // Arcs for "Nodal Logic"
                arcsData={arcsData}
                arcColor={'color'}
                arcDashLength={0.4}
                arcDashGap={0.2}
                arcDashAnimateTime={1500}
                arcStroke={0.4}
                
                // Point Cloud / Hex Binning for "Zen-Hackery" look
                // We'll use hex polygons with a custom color for a tech feel
                hexPolygonsData={[]} // Reserved for more complex geo-data if needed
                
                // Atmosphere & Glow
                showAtmosphere={true}
                atmosphereColor="#00FF41"
                atmosphereAltitude={0.15}
                
                // Dimensions: Fill the container
                width={800}
                height={650}
            />
        </div>
    );
}
