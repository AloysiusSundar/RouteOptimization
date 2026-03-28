'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Globe from '@/components/Globe';
import {
    Terminal,
    Settings,
    UserCircle,
    LayoutGrid,
    Map as MapIcon,
    Network,
    FileText,
    HelpCircle,
    LogOut,
    Route,
    Search,
    Fingerprint,
    ChevronRight,
    Play,
    GitBranch,
    Code2,
    Cpu,
    Zap
} from 'lucide-react';

export default function LandingPage() {
    const pathname = usePathname();

    return (
        <AnimatePresence mode="wait">
            <div key={pathname} className="theme-zen min-h-screen bg-zen-bg text-on-background font-body selection:bg-zen-neon selection:text-black">
                {/* Minimalist Top Bar (Optional, for links) */}
                <div className="absolute top-0 w-full p-8 flex justify-between items-center z-50 pointer-events-none">
                    <div className="font-mono text-[10px] text-zen-dark uppercase tracking-[0.3em] pointer-events-auto">
                        PROJECT_STATUS // <span className="text-zen-neon">PRODUCTION_STABLE</span>
                    </div>
                    <div className="flex gap-8 pointer-events-auto">
                        <a href="https://github.com/AloysiusSundar" target="_blank" rel="noopener noreferrer" className="text-zen-dark hover:text-zen-neon transition-colors">
                            <GitBranch size={18} />
                        </a>
                    </div>
                </div>

                <main className="flex-1 bg-zen-bg overflow-x-hidden">
                    {/* Expanded Hero Section */}
                    <section className="min-h-screen flex flex-col justify-center items-center px-6 lg:px-20 relative overflow-hidden text-center">
                        <div className="absolute inset-0 opacity-10 pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle,_#00FF41_0%,_transparent_70%)] opacity-20"></div>
                        </div>

                        <div className="z-10 max-w-5xl">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 0.6, y: 0 }}
                                transition={{ duration: 0.8 }}
                                className="font-mono text-zen-neon text-[10px] mb-6 tracking-[0.5em] uppercase"
                            >
                                BUILD_VER // 1.0.4.RC2
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            >
                                <div className="relative inline-block group">
                                    {/* Base Layer: White text */}
                                    <h1 className="font-headline text-8xl md:text-[160px] font-extrabold tracking-tighter leading-none mb-4 text-zen-light select-none whitespace-nowrap">
                                        YATHIR.AI
                                    </h1>

                                    {/* Mask Layer: Black on Green Reveal */}
                                    <motion.div
                                        className="absolute top-0 left-0 h-full bg-zen-neon overflow-hidden pointer-events-none"
                                        initial={{ width: "0%" }}
                                        animate={{
                                            width: ["0%", "100%", "0%"]
                                        }}
                                        transition={{
                                            duration: 2.2,
                                            ease: "easeInOut"
                                        }}
                                        style={{ height: 'calc(100% - 1.2rem)' }} // Account for margin-bottom of h1
                                    >
                                        <h1 className="font-headline text-8xl md:text-[160px] font-extrabold tracking-tighter leading-none text-[#003907] select-none whitespace-nowrap">
                                            YATHIR.AI
                                        </h1>
                                        {/* The Terminal Cursor Cursor */}
                                        <div className="absolute top-0 right-0 w-[4px] md:w-[8px] h-full bg-zen-neon shadow-[0_0_20px_#00FF41]"></div>
                                    </motion.div>
                                </div>

                                <p className="font-mono text-zen-dark text-sm md:text-base tracking-[0.2em] mb-16 uppercase max-w-3xl mx-auto">
                                    Next-generation route optimization for the modern traveler
                                </p>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.8 }}
                                className="flex flex-col md:flex-row items-center justify-center gap-6"
                            >
                                <Link href="/planner" className="w-full md:w-auto">
                                    <button className="w-full md:w-auto bg-zen-neon text-[#003907] px-12 py-5 font-mono font-bold text-sm uppercase tracking-widest hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-3 group">
                                        INITIALIZE_PLANNER
                                        <Play size={14} className="fill-current group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </Link>

                                <a href="https://github.com/AloysiusSundar/RouteOptimization/tree/main" target="_blank" rel="noopener noreferrer" className="w-full md:w-auto">
                                    <button className="w-full md:w-auto bg-transparent border border-zen-neon/30 text-zen-neon px-12 py-5 font-mono font-bold text-sm uppercase tracking-widest hover:bg-zen-neon/5 active:scale-[0.99] transition-all flex items-center justify-center gap-3 group">
                                        <GitBranch size={16} />
                                        VIEW_SOURCE
                                    </button>
                                </a>
                            </motion.div>
                        </div>

                        {/* Technical Stack Pills - App Core Only */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1, duration: 1 }}
                            className="absolute bottom-12 flex gap-6 overflow-hidden max-w-full px-6"
                        >
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Python</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">FastAPI</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Next.js 16 // React 19</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Vector Search</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Deterministic Held-Karp</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Leaflet.js</span>
                            <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Federated Architecture</span>
                        </motion.div>
                    </section>

                    {/* Technical Architecture Section */}
                    <section className="py-40 px-6 lg:px-20 bg-zen-surface-low border-y border-zen-dark/15">
                        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
                            <div className="lg:col-span-5">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-2 h-6 bg-zen-neon"></div>
                                    <span className="font-mono text-[10px] tracking-widest text-zen-neon uppercase font-bold">ARC_OVERVIEW // V1</span>
                                </div>
                                <h2 className="font-headline text-5xl font-bold tracking-tight text-zen-light uppercase leading-[1.1]">The Technical <br />Nodal Core.</h2>
                            </div>
                            <div className="lg:col-span-7">
                                <p className="font-mono text-zen-dark text-xl leading-relaxed mb-8">
                                    Yathir.ai merges high-dimensional vector intelligence with a deterministic <span className="text-zen-light underline decoration-zen-neon/30 underline-offset-4 font-bold">Held-Karp</span> routing engine. The system dynamically evaluates massive spatial matrices to compute exact solutions for multi-day, multi-stop circuits.
                                </p>
                                <p className="font-mono text-zen-dark text-xl leading-relaxed">
                                    By strictly enforcing topological time-windows alongside semantic location matching, this hybrid architecture delivers mathematically perfect, context-aware itineraries.
                                </p>
                                <div className="mt-12 grid grid-cols-2 gap-8">
                                    <div>
                                        <div className="text-zen-neon font-mono text-[10px] mb-2 font-bold tracking-tighter">SPACE</div>
                                        <div className="text-zen-light text-2xl font-bold font-mono tracking-tighter">O(n 2ⁿ)</div>
                                    </div>
                                    <div>
                                        <div className="text-zen-neon font-mono text-[10px] mb-2 font-bold tracking-tighter">COMPLEXITY</div>
                                        <div className="text-zen-light text-2xl font-bold font-mono tracking-tighter">O(n² 2ⁿ)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Core Modules (Bento Grid) */}
                    <section className="py-40 px-6 lg:px-20">
                        <div className="max-w-7xl mx-auto">
                            <div className="flex items-center justify-between mb-20">
                                <div className="font-mono text-[10px] tracking-widest text-zen-dark uppercase font-bold">TECHNICAL_SUBSYSTEMS // CORE</div>
                                <div className="h-px bg-zen-dark/15 flex-1 mx-8"></div>
                                <div className="font-mono text-[10px] tracking-widest text-zen-neon uppercase">v1.1_MODULES</div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                                {/* Module 1 */}
                                <motion.div
                                    whileHover={{ backgroundColor: "rgba(0, 255, 65, 0.05)" }}
                                    transition={{ duration: 0 }}
                                    className="ghost-border p-10 transition-all duration-0 group flex flex-col justify-between h-[450px]"
                                >
                                    <div>
                                        <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors duration-0">
                                            <Cpu size={48} strokeWidth={1} />
                                        </div>
                                        <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ CORE_PROC ]</div>
                                        <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Topological <br />Scheduling</h3>
                                        <p className="text-base text-zen-dark leading-relaxed">Treating time as a strict topological dimension, the TSPTW architecture locks reservations as immutable graph anchors. By syncing parallel traffic fetches across all route legs, it mathematically eliminates schedule drift and guarantees nodal efficiency.</p>
                                    </div>
                                    <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-0 flex items-center gap-2">
                                        ALGO_DETAILS &gt;
                                    </div>
                                </motion.div>
                                {/* Module 2 */}
                                <motion.div
                                    whileHover={{ backgroundColor: "rgba(0, 255, 65, 0.05)" }}
                                    transition={{ duration: 0 }}
                                    className="ghost-border p-10 border-l-0 transition-all duration-0 group flex flex-col justify-between h-[450px]"
                                >
                                    <div>
                                        <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors duration-0">
                                            <Search size={48} strokeWidth={1} />
                                        </div>
                                        <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ CLUS_LAYER ]</div>
                                        <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Geospatial <br />Load Balancing</h3>
                                        <p className="text-base text-zen-dark leading-relaxed">Yathir.ai segments geographic markers into logical "Daily Sectors," using the accommodation as a priority centroid. This constraint-aware clustering minimizes overhead and enforces realistic travel pacing.</p>
                                    </div>
                                    <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-0 flex items-center gap-2">
                                        CLUSTER_STATS &gt;
                                    </div>
                                </motion.div>
                                {/* Module 3 */}
                                <motion.div
                                    whileHover={{ backgroundColor: "rgba(0, 255, 65, 0.05)" }}
                                    transition={{ duration: 0 }}
                                    className="ghost-border p-10 border-l-0 transition-all duration-0 group flex flex-col justify-between h-[450px]"
                                >
                                    <div>
                                        <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors duration-0">
                                            <Fingerprint size={48} strokeWidth={1} />
                                        </div>
                                        <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ VEC_SEARCH ]</div>
                                        <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Semantic <br />Search</h3>
                                        <p className="text-base text-zen-dark leading-relaxed">High-dimensional vector orchestration via Cohere V3.0. The engine executes dot-product similarity analysis across a 1536-D latent space, enabling zero-shot conceptual discovery by mapping natural language intent directly to geospatial metadata.</p>
                                    </div>
                                    <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-0 flex items-center gap-2">
                                        MODEL_STATS &gt;
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </section>
                    {/* Real-Time AI Orchestration Visualizer */}
                    <section className="py-40 px-6 lg:px-20 relative bg-zen-surface-low border-t border-zen-dark/15">
                        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-20">
                            <div className="lg:w-2/5 flex flex-col justify-center">
                                <div className="font-mono text-[10px] text-zen-dark mb-10 uppercase tracking-widest font-bold">OP_FEED // AI_ORCHESTRATION</div>
                                <h2 className="font-headline text-5xl font-bold text-zen-light mb-8 uppercase text-pretty leading-[1.1]">Natural Language <br />Processing.</h2>
                                <p className="text-zen-dark text-base mb-14 leading-relaxed max-w-md">Yaathir.ai uses Gemini 3.1 Flash-Lite to turn messy travel ideas into structured data. It handles the boring stuff like dates, locations, and reservations, so the engine can focus on building the perfect route for you.</p>

                                <div className="space-y-6">
                                    <div className="flex justify-between items-center py-3 border-b border-zen-dark/10">
                                        <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">Token_Compliance</span>
                                        <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">99.4%</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3 border-b border-zen-dark/10">
                                        <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">Inference_Model</span>
                                        <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">GEMINI_3.1_FLASH</span>
                                    </div>
                                    <div className="flex justify-between items-center py-3">
                                        <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">Latent_Accuracy</span>
                                        <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">HIGH_PRECISION</span>
                                    </div>
                                </div>
                            </div>
                            <div className="lg:w-3/5 h-[650px] overflow-hidden relative group">
                                <Globe />

                                {/* Parsing Animation Overlay (Representation) */}
                                <div className="absolute inset-0 p-12 overflow-hidden pointer-events-none opacity-40">
                                    <pre className="text-zen-neon font-mono text-[8px] leading-relaxed">
                                        {`{
  "intent": "itinerary_generation",
  "entities": [
    { "type": "location", "value": "Tokyo", "res": "GEOSPATIAL_LOCKED" },
    { "type": "temporal", "value": "Next Week", "res": "2024-04-05" }
  ],
  "schema": "STRICT_JSON_V4",
  "tokens": 428,
  "status": "VALID_PARSE"
}`}
                                    </pre>
                                </div>



                                <div className="absolute bottom-10 right-10 font-mono text-[10px] text-zen-neon bg-zen-bg/80 backdrop-blur-md p-5 border border-zen-neon/30 uppercase tracking-widest leading-relaxed">
                                    <span className="text-zen-dark">INPUT:</span> SCHEMA_EXTRACTION<br />
                                    <span className="text-zen-dark">STAGE:</span> ENTITY_LOCK<br />
                                    <span className="text-zen-dark">TRUST:</span> 99.8% RESOLVED
                                </div>
                            </div>
                        </div>
                    </section>
                </main>

                {/* Technical Footer */}
                <footer className="bg-zen-bg text-zen-neon border-t border-zen-dark/15 flex flex-col md:flex-row justify-between items-center w-full px-10 py-12 z-50">
                    <div className="flex flex-col gap-2">
                        <div className="font-mono text-[10px] tracking-widest text-zen-dark uppercase font-bold">© 2024 YATHIR_ENGINE_V1.0.4</div>
                        <div className="font-mono text-[9px] text-zen-dark uppercase tracking-widest font-bold">LICENSED_THROUGH_MIT_OPEN_SOURCE</div>
                    </div>

                    <div className="flex flex-wrap gap-12 my-10 md:my-0">
                        <div className="flex flex-col gap-2">
                            <span className="font-mono text-[9px] text-zen-dark uppercase tracking-tighter">DEVELOPER</span>
                            <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="https://x.com/aloysiusbarb" target="_blank" rel="noopener noreferrer">Aloysius Sundar</a>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="font-mono text-[9px] text-zen-dark uppercase tracking-tighter">PROJECT</span>
                            <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="#">Technical Overview</a>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="font-mono text-[9px] text-zen-dark uppercase tracking-tighter">REPOSITORY</span>
                            <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="https://github.com/AloysiusSundar/RouteOptimization" target="_blank" rel="noopener noreferrer">Github_Access</a>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-zen-neon/10 border border-zen-neon/30 flex items-center justify-center">
                            <Code2 size={16} className="text-zen-neon" />
                        </div>
                    </div>
                </footer>

                <style jsx global>{`
                @keyframes scan {
                    from { transform: translateY(-100px); }
                    to { transform: translateY(700px); }
                }
            `}</style>
            </div>
        </AnimatePresence>
    );
}
