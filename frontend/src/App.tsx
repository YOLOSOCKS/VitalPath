import React, { useState } from 'react';
import LiveMap from './components/Map';
import AIAssistant from './components/panels/AIAssistant';
import PatientVitals from './components/panels/PatientVitals';
import Navigation from './components/panels/Navigation';
import DispatchFeed from './components/panels/DispatchFeed';

// --- COMPONENTS ---

// 1. Static Panel (For Dispatch & Nav)
const PanelPlaceholder = ({ title, className }: { title: string, className?: string }) => (
  <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col ${className}`}>
    <h2 className="text-cyan-400 font-mono text-sm tracking-widest mb-2 border-b border-white/5 pb-2 uppercase">
      {title}
    </h2>
    <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-xs animate-pulse">
      [AWAITING_DATA_STREAM]
    </div>
  </div>
);

// 2. Dynamic "Pull-Up" Equipment Panel
const EquipmentPanel = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div 
      onClick={() => setIsOpen(!isOpen)}
      className={`
        bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl 
        transition-all duration-500 ease-in-out cursor-pointer overflow-hidden
        flex flex-col
        ${isOpen ? 'h-64' : 'h-12 hover:bg-white/5'} // Collapsed vs Expanded Height
      `}
    >
      {/* Header (Always Visible) */}
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
        <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase flex items-center gap-2">
          {/* Status Indicator Dot */}
          <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-cyan-400 shadow-[0_0_10px_#00f0ff]' : 'bg-green-500'}`} />
          EQUIPMENT DIAGNOSTICS
        </h2>
        <span className="text-gray-500 text-[10px] font-mono">
          {isOpen ? '▼ MINIMIZE' : '▲ EXPAND'}
        </span>
      </div>

      {/* Content (Hidden when collapsed) */}
      <div className={`flex-1 p-4 grid grid-cols-2 gap-2 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[10px] font-mono">O2 TANK (MAIN)</div>
          <div className="text-xl text-green-400 font-mono">98%</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[10px] font-mono">DEFIB BATTERY</div>
          <div className="text-xl text-yellow-400 font-mono">42%</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[10px] font-mono">TIRE PRESSURE</div>
          <div className="text-xl text-cyan-400 font-mono">35 PSI</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[10px] font-mono">ENGINE TEMP</div>
          <div className="text-xl text-green-400 font-mono">NORMAL</div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [isRedAlert, setIsRedAlert] = useState(false);

  React.useEffect(() => {
    if (isRedAlert) {
      document.body.classList.add('red-alert');
    } else {
      document.body.classList.remove('red-alert');
    }
  }, [isRedAlert]);

  return (
    <div className={`w-screen h-screen overflow-hidden flex flex-col transition-colors duration-500 ${isRedAlert ? 'bg-red-950/20' : 'bg-[#050505]'}`}>
      
      {/* TOP HEADER */}
      <header className="h-14 shrink-0 border-b border-white/10 bg-black/50 backdrop-blur-lg flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tighter text-white">
            AEGIS <span className="text-cyan-400 text-sm font-normal tracking-widest ml-2">// MISSION_CONTROL</span>
          </h1>
          <div className="px-2 py-0.5 bg-cyan-950/30 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-mono">
            V.2.0.25 (DUAN-MAO)
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="text-right">
             <div className="text-white font-mono text-sm">03:04:21 AM</div>
             <div className="text-gray-500 text-[10px] font-mono">SAT FEB 14 2026</div>
           </div>
           <button 
             onClick={() => setIsRedAlert(!isRedAlert)}
             className={`px-4 py-1 rounded border font-mono text-xs transition-all ${isRedAlert ? 'bg-red-600 text-white border-red-500 animate-pulse' : 'bg-transparent text-gray-400 border-gray-700 hover:border-white'}`}
           >
             {isRedAlert ? '⚠ CRITICAL TRAUMA' : 'ROUTINE PATROL'}
           </button>
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="flex-1 min-h-0 p-4 grid grid-cols-12 gap-4 relative z-10">
        
        {/* LEFT COLUMN: Sidebar (3 cols) */}
        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          {/* Dispatch: Fixed at top */}
          <DispatchFeed className="h-48 shrink-0" />
          
          {/* AI: Takes ALL remaining space (flex-1) */}
          <AIAssistant className="flex-1 min-h-0 shadow-[0_0_30px_rgba(0,240,255,0.1)]" />
          
          {/* Equipment: Collapsible at bottom */}
          <EquipmentPanel />
        </div>

        {/* CENTER COLUMN: Map (6 cols) */}
        <div className="col-span-6 h-full relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
           <LiveMap />
           <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
           <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>

        {/* RIGHT COLUMN: Info (3 cols) */}
        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          <Navigation className="h-1/3 shrink-0" />
          <PatientVitals className="flex-1 min-h-0" />
        </div>

      </main>

      {/* Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-10" 
           style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

    </div>
  );
}

export default App;