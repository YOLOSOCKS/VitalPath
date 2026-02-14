import React, { useState, useEffect } from 'react';

export default function Navigation({ className, activeScenario }: { className?: string, activeScenario?: any }) {
  const [distance, setDistance] = useState(800);
  const [nextTurn, setNextTurn] = useState("PROCEED STRAIGHT");
  const [street, setStreet] = useState("MAJOR MACKENZIE DR");

  // Sync with Scenario
  useEffect(() => {
    if (activeScenario?.title?.includes("ARREST")) {
      setStreet("MACKENZIE HEALTH BAY");
      setDistance(1200);
      setNextTurn("MERGE LEFT");
    } else {
      setStreet("MAJOR MACKENZIE DR");
      setDistance(450);
      setNextTurn("TURN RIGHT");
    }
  }, [activeScenario]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDistance(prev => (prev > 0 ? prev - 5 : 0));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col justify-between ${className}`}>
      <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase border-b border-white/5 pb-1">
        NAV-COM // MISSION_STATE
      </h2>

      <div className="flex flex-col items-center justify-center my-4">
        <div className="text-6xl text-white font-bold tracking-tighter drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
            {distance}<span className="text-2xl text-gray-500 ml-1">m</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
            <div className="text-4xl text-cyan-400 font-bold">
                {nextTurn.includes("RIGHT") ? "↱" : nextTurn.includes("LEFT") ? "↰" : "↑"}
            </div>
            <div className="text-xl text-cyan-400 font-mono font-bold">
                {nextTurn}
            </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="bg-white/5 rounded p-2 border border-white/10 flex justify-between items-center">
            <div>
                <div className="text-[10px] text-gray-500 font-mono uppercase">Target Point</div>
                <div className="text-sm text-white font-mono font-bold">{street}</div>
            </div>
            <div className="text-right">
                <div className="text-[10px] text-gray-500 font-mono">ETA</div>
                <div className="text-xl text-green-400 font-mono font-bold animate-pulse">
                    {Math.ceil(distance / 200)}m
                </div>
            </div>
        </div>
        
        <div className="text-[9px] text-cyan-900 bg-cyan-400/10 border border-cyan-400/20 rounded px-2 py-1 text-center font-mono uppercase">
          Algo: Duan-Mao (2025) // Edge Relaxation Active
        </div>
      </div>
    </div>
  );
}