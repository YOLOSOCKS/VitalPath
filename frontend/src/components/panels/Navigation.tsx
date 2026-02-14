import React, { useState, useEffect } from 'react';

export default function Navigation({ className }: { className?: string }) {
  // Mock Navigation State
  const [distance, setDistance] = useState(450); // meters
  const [nextTurn, setNextTurn] = useState("TURN RIGHT");
  const [street, setStreet] = useState("MAJOR MACKENZIE DR");
  const [eta, setEta] = useState("4 MIN");

  // Simulation: Count down distance as if driving
  useEffect(() => {
    const interval = setInterval(() => {
      setDistance(prev => {
        if (prev <= 0) {
            // Reset for demo loop
            setNextTurn(curr => curr === "TURN RIGHT" ? "MERGE LEFT" : "TURN RIGHT");
            setStreet(curr => curr === "MAJOR MACKENZIE DR" ? "HWY 404 SOUTH" : "MAJOR MACKENZIE DR");
            return 800; 
        }
        return prev - 10; // "Driving" speed
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col justify-between ${className}`}>
      {/* Header */}
      <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase border-b border-white/5 pb-1">
        NAV-COM // DUAN-MAO
      </h2>

      {/* Main Instruction */}
      <div className="flex flex-col items-center justify-center my-2">
        <div className="text-6xl text-white font-bold tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
            {distance}<span className="text-2xl text-gray-500 ml-1">m</span>
        </div>
        <div className="flex items-center gap-3 mt-1">
            {/* Arrow Icon */}
            <div className="text-4xl text-cyan-400">
                {nextTurn.includes("RIGHT") ? "↱" : "↰"}
            </div>
            <div className="text-xl text-cyan-400 font-mono font-bold">
                {nextTurn}
            </div>
        </div>
      </div>

      {/* Street Name & ETA */}
      <div className="bg-white/5 rounded p-2 border border-white/10 flex justify-between items-center">
        <div>
            <div className="text-[10px] text-gray-500 font-mono">ON ROUTE</div>
            <div className="text-sm text-white font-mono truncate max-w-[120px]">{street}</div>
        </div>
        <div className="text-right">
            <div className="text-[10px] text-gray-500 font-mono">ETA</div>
            <div className="text-xl text-green-400 font-mono font-bold animate-pulse">{eta}</div>
        </div>
      </div>
      
      {/* Algorithm Verification Badge */}
      <div className="mt-2 text-[9px] text-cyan-900 bg-cyan-400/10 border border-cyan-400/20 rounded px-2 py-0.5 text-center font-mono">
        OPTIMIZED BY: DUAN-MAO-SHU-YIN (2025)
      </div>
    </div>
  );
}