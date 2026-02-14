import React, { useState, useEffect } from 'react';

export default function PatientVitals({ className }: { className?: string }) {
  // Mock Data States
  const [hr, setHr] = useState(75);
  const [spO2, setSpO2] = useState(98);
  const [bp, setBp] = useState({ sys: 120, dia: 80 });
  const [ecgData, setEcgData] = useState<number[]>(new Array(50).fill(50));

  // Simulation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Fluctuate Vitals slightly
      setHr(prev => 70 + Math.floor(Math.random() * 15)); // 70-85
      setSpO2(prev => 97 + Math.floor(Math.random() * 3)); // 97-100
      setBp({ 
        sys: 115 + Math.floor(Math.random() * 10), 
        dia: 75 + Math.floor(Math.random() * 10) 
      });

      // 2. Animate ECG Graph (Shift array left, add new point)
      setEcgData(prev => {
        const newData = [...prev.slice(1)];
        // Create a "Heartbeat" spike pattern every ~10 frames
        const time = Date.now();
        if (time % 1000 < 100) {
            newData.push(10); // Spike Up
        } else if (time % 1000 < 200) {
            newData.push(90); // Spike Down
        } else {
            newData.push(50 + (Math.random() * 10 - 5)); // Noise
        }
        return newData;
      });

    }, 100); // Update every 100ms for smooth graph

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
        <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase">
          PATIENT VITALS
        </h2>
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-mono">CONNECTION: STABLE</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#00ff00]" />
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Heart Rate */}
        <div className="bg-red-950/20 border border-red-900/30 p-2 rounded relative overflow-hidden">
            <div className="text-red-500 text-[10px] font-mono">HEART RATE (BPM)</div>
            <div className="text-4xl text-red-500 font-bold font-mono">{hr}</div>
            <div className="absolute top-2 right-2 text-red-500/50 text-xs animate-ping">♥</div>
        </div>

        {/* SpO2 */}
        <div className="bg-blue-950/20 border border-blue-900/30 p-2 rounded">
            <div className="text-blue-400 text-[10px] font-mono">SpO2 (%)</div>
            <div className="text-4xl text-blue-400 font-bold font-mono">{spO2}%</div>
        </div>
      </div>

      {/* BP & Info */}
      <div className="flex justify-between items-end mb-4 bg-white/5 p-2 rounded">
          <div>
            <div className="text-gray-400 text-[10px] font-mono">BLOOD PRESSURE</div>
            <div className="text-2xl text-white font-mono">{bp.sys}/{bp.dia} <span className="text-xs text-gray-500">mmHg</span></div>
          </div>
          <div className="text-right">
              <div className="text-[10px] text-gray-500">PATIENT ID</div>
              <div className="text-xs text-cyan-400 font-mono">#992-AX-YORK</div>
          </div>
      </div>

      {/* ECG Graph Visualization */}
      <div className="flex-1 bg-black/50 rounded border border-white/10 relative overflow-hidden flex items-center">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-20" 
             style={{ backgroundImage: 'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)', backgroundSize: '10px 10px' }}>
        </div>
        
        {/* The Line */}
        <svg className="w-full h-full" preserveAspectRatio="none">
            <polyline 
                points={ecgData.map((y, x) => `${(x / 50) * 100},${y}`).join(' ')}
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="drop-shadow-[0_0_5px_rgba(0,240,255,0.8)]"
            />
        </svg>

        {/* Scanline Effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent w-full h-full animate-scan" />
      </div>
    </div>
  );
}