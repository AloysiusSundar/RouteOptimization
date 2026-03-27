'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
                    <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-zen-dark hover:text-zen-neon transition-colors">
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
                            <h1 className="font-headline text-8xl md:text-[160px] font-extrabold tracking-tighter leading-none mb-4 text-zen-light">
                                YATHIR.AI
                            </h1>
                            <p className="font-mono text-zen-dark text-sm md:text-base tracking-[0.2em] mb-16 uppercase max-w-3xl mx-auto">
                                High-Performance Route Optimization & Nodal Intelligence for Modern Explorers.
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
                            
                            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="w-full md:w-auto">
                                <button className="w-full md:w-auto bg-transparent border border-zen-neon/30 text-zen-neon px-12 py-5 font-mono font-bold text-sm uppercase tracking-widest hover:bg-zen-neon/5 active:scale-[0.99] transition-all flex items-center justify-center gap-3 group">
                                    <GitBranch size={16} />
                                    VIEW_SOURCE
                                </button>
                            </a>
                        </motion.div>
                    </div>

                    {/* Technical Stack Pills */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1, duration: 1 }}
                        className="absolute bottom-12 flex gap-6 overflow-hidden max-w-full px-6"
                    >
                        <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Next.js 15</span>
                        <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Tailwind 4</span>
                        <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Framer Motion</span>
                        <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Rust Backend</span>
                        <span className="font-mono text-[9px] text-zen-dark uppercase border border-zen-dark/20 px-3 py-1">Turf.js</span>
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
                            <h2 className="font-headline text-5xl font-bold tracking-tight text-zen-light uppercase leading-[1.1]">The Technical <br/>Nodal Core.</h2>
                        </div>
                        <div className="lg:col-span-7">
                            <p className="font-mono text-zen-dark text-xl leading-relaxed mb-8">
                                Built for absolute precision. Yathir leverages a custom-tuned <span className="text-zen-light underline decoration-zen-neon/30 underline-offset-4 font-bold">Dijkstra variant</span> optimized for multi-modal travel sets. 
                            </p>
                            <p className="font-mono text-zen-dark text-xl leading-relaxed">
                                By mapping over 1.2M nodes into a high-dimensional vector space, we achieve sub-milli latency in pathfinding—delivering raw technical efficiency where traditional routing fails.
                            </p>
                            <div className="mt-12 grid grid-cols-2 gap-8">
                                <div>
                                    <div className="text-zen-neon font-mono text-[10px] mb-2 font-bold tracking-tighter">LATENCY</div>
                                    <div className="text-zen-light text-2xl font-bold font-mono tracking-tighter">&lt; 14ms</div>
                                </div>
                                <div>
                                    <div className="text-zen-neon font-mono text-[10px] mb-2 font-bold tracking-tighter">COMPLEXITY</div>
                                    <div className="text-zen-light text-2xl font-bold font-mono tracking-tighter">O(E log V)</div>
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
                                className="ghost-border p-10 transition-all group flex flex-col justify-between h-[450px]"
                            >
                                <div>
                                    <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors">
                                        <Cpu size={48} strokeWidth={1} />
                                    </div>
                                    <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ CORE_PROC ]</div>
                                    <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Predictive <br/>Routing</h3>
                                    <p className="text-base text-zen-dark leading-relaxed">Asynchronous pathfinding engine that anticipates traffic density through historical nodal analysis.</p>
                                </div>
                                <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                    ALGO_DETAILS &gt;
                                </div>
                            </motion.div>
                            {/* Module 2 */}
                            <motion.div 
                                whileHover={{ backgroundColor: "rgba(0, 255, 65, 0.05)" }}
                                className="ghost-border p-10 border-l-0 transition-all group flex flex-col justify-between h-[450px]"
                            >
                                <div>
                                    <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors">
                                        <Search size={48} strokeWidth={1} />
                                    </div>
                                    <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ VEC_SEARCH ]</div>
                                    <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Semantic <br/>Indexing</h3>
                                    <p className="text-base text-zen-dark leading-relaxed">Neural indexing of destination metadata allowing for vague or conceptual search parameters.</p>
                                </div>
                                <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                    MODEL_STATS &gt;
                                </div>
                            </motion.div>
                            {/* Module 3 */}
                            <motion.div 
                                whileHover={{ backgroundColor: "rgba(0, 255, 65, 0.05)" }}
                                className="ghost-border p-10 border-l-0 transition-all group flex flex-col justify-between h-[450px]"
                            >
                                <div>
                                    <div className="mb-10 text-zen-dark group-hover:text-zen-neon transition-colors">
                                        <Fingerprint size={48} strokeWidth={1} />
                                    </div>
                                    <div className="font-mono text-[10px] text-zen-neon mb-3 font-bold">[ SEC_LAYER ]</div>
                                    <h3 className="font-headline text-2xl font-bold text-zen-light mb-6 uppercase text-pretty leading-none">Hardware <br/>Security</h3>
                                    <p className="text-base text-zen-dark leading-relaxed">AES-256-GCM encryption for all user travel itineraries and biometric verification nodes.</p>
                                </div>
                                <div className="text-zen-neon font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                    LINK_SECURE &gt;
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Real-Time Nodal Visualizer */}
                <section className="py-40 px-6 lg:px-20 relative bg-zen-surface-low border-t border-zen-dark/15">
                    <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-20">
                        <div className="lg:w-2/5 flex flex-col justify-center">
                            <div className="font-mono text-[10px] text-zen-dark mb-10 uppercase tracking-widest font-bold">OP_FEED // REALTIME</div>
                            <h2 className="font-headline text-5xl font-bold text-zen-light mb-8 uppercase text-pretty leading-[1.1]">Global Nodal <br/>Intelligence.</h2>
                            <p className="text-zen-dark text-base mb-14 leading-relaxed max-w-md">Our global network monitors 1.2M vector points. This map visualizes real-time handshakes between the Yathir core and distributed edge nodes.</p>
                            
                            <div className="space-y-6">
                                <div className="flex justify-between items-center py-3 border-b border-zen-dark/10">
                                    <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">Active_Nodes</span>
                                    <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">1,244,092</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-zen-dark/10">
                                    <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">System_Health</span>
                                    <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">NOMINAL</span>
                                </div>
                                <div className="flex justify-between items-center py-3">
                                    <span className="font-mono text-[10px] text-zen-dark uppercase tracking-widest">Global_Latency</span>
                                    <span className="font-mono text-xs text-zen-neon font-bold tracking-tighter">18ms AVG</span>
                                </div>
                            </div>
                        </div>
                        <div className="lg:w-3/5 h-[650px] bg-zen-bg ghost-border overflow-hidden relative group">
                            <img 
                                alt="Technical map visualization" 
                                className="w-full h-full object-cover grayscale brightness-50 contrast-125 opacity-30 group-hover:opacity-50 transition-opacity duration-1000" 
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDgMAx07Gm4rNJ8s0B4xtQfxaz78Vu-hrN6gj03SxlOASfFkfsTV7gYmlMSvZ07_LTx3OfL1gilRof5oGGdOII_q96IjouvbyIaRd709_s3Z-QCZdTAPshCHoPpPQVjdjjFCu7qYbZpm6w1Lgp6ToLfohvgXUc6FqzTQWilGkeResfakkwuCm1duP_Z6znkk3tKLCwJ4Rcl93_w7_uX2FGifdZugWPfC8xZxProy28z26O1Vd3PJ8F1drJuz5gPBBCP-Lqjqsnz1rFr"
                            />
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#050505_100%)] pointer-events-none"></div>
                            
                            {/* Scanning Effect */}
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-zen-neon/20 shadow-[0_0_15px_#00FF41] animate-[scan_4s_linear_infinite]"></div>
                            
                            {/* Node Indicators */}
                            <div className="absolute top-[30%] left-[25%] w-2 h-2 bg-zen-neon animate-pulse shadow-[0_0_10px_#00FF41]"></div>
                            <div className="absolute top-[45%] left-[65%] w-2 h-2 bg-zen-neon animate-pulse shadow-[0_0_10px_#00FF41] delay-700"></div>
                            <div className="absolute top-[60%] left-[40%] w-2 h-2 bg-zen-neon animate-pulse shadow-[0_0_10px_#00FF41] delay-300"></div>
                            
                            <div className="absolute bottom-10 right-10 font-mono text-[10px] text-zen-neon bg-zen-bg/80 backdrop-blur-md p-5 border border-zen-neon/30 uppercase tracking-widest leading-relaxed">
                                <span className="text-zen-dark">COORD:</span> 34.0522, -118.2437<br/>
                                <span className="text-zen-dark">STATUS:</span> NODE_RESOLVED<br/>
                                <span className="text-zen-dark">PKT_LOSS:</span> 0.00%
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
                        <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="#">Aloysius Sundar</a>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="font-mono text-[9px] text-zen-dark uppercase tracking-tighter">PROJECT</span>
                        <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="#">Technical Overview</a>
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="font-mono text-[9px] text-zen-dark uppercase tracking-tighter">REPOSITORY</span>
                        <a className="text-zen-light font-mono text-[10px] tracking-widest hover:text-zen-neon transition-colors uppercase font-bold" href="#">Github_Access</a>
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
