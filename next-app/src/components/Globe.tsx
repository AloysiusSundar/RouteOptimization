'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Use dynamic import for react-globe.gl as it requires 'window'
const GlobeElement = dynamic(() => import('./GlobeElement'), { 
    ssr: false,
    loading: () => <div className="w-full h-full bg-[#050505] animate-pulse flex items-center justify-center font-mono text-[10px] text-zen-neon/40 uppercase tracking-[0.4em]">INIT_GL_CONTEXT...</div>
});

export default function Globe() {
    return (
        <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
            <GlobeElement />
            
            {/* Draggable hint */}
            <div className="absolute bottom-6 left-6 font-mono text-[8px] text-zen-dark uppercase tracking-widest opacity-40 select-none pointer-events-none">
                [ DRAG_TO_ROTATE ]
            </div>
        </div>
    );
}

