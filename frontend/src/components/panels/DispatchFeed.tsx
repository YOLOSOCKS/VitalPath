import React, { useState, useEffect, useRef } from 'react';

const SCENARIO_LOGS = [
  { time: "00:00", sender: "DISPATCH", msg: "UNIT 992: RESPOND CODE 4 - CARDIAC ARREST" },
  { time: "00:01", sender: "SYSTEM", msg: "ROUTE CALCULATED: DUAN-MAO OPTIMIZED" },
  { time: "00:02", sender: "DISPATCH", msg: "FIRE SERVICES EN ROUTE. ETA 2 MINS." },
  { time: "00:04", sender: "992", msg: "COPY. EN ROUTE. TRAFFIC HEAVY ON MAJOR MAC." },
  { time: "00:05", sender: "SYSTEM", msg: "V2X SIGNAL: GREEN WAVE REQUESTED [APPROVED]" },
  { time: "00:08", sender: "POLICE", msg: "ON SCENE. SCENE SECURE. STARTING CPR." },
  { time: "00:12", sender: "DISPATCH", msg: "UPDATE: PATIENT IS 60M. NO PULSE." },
  { time: "00:15", sender: "SYSTEM", msg: "AI ADVISORY: PREP LUCAS DEVICE & EPI" },
];

export default function DispatchFeed({ className }: { className?: string }) {
  const [logs, setLogs] = useState<typeof SCENARIO_LOGS>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < SCENARIO_LOGS.length) {
        setLogs(prev => [...prev, {
            ...SCENARIO_LOGS[index],
            time: new Date().toLocaleTimeString([], { hour12: false }) // Real time
        }]);
        index++;
      }
    }, 2500); // Add a new log every 2.5 seconds

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex flex-col overflow-hidden ${className}`}>
      {/* Header */}
      <h2 className="p-3 text-cyan-400 font-mono text-sm tracking-widest uppercase border-b border-white/5 bg-white/5 flex justify-between">
        <span>LIVE UPDATES // DISPATCH</span>
        <span className="text-[10px] text-green-500 animate-pulse">● LIVE RF-900</span>
      </h2>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
        {logs.length === 0 && (
            <div className="text-gray-600 italic">CONNECTING TO CAD NETWORK...</div>
        )}
        
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 border-b border-white/5 pb-1">
            <span className="text-gray-500 shrink-0">[{log.time}]</span>
            <span className={`font-bold shrink-0 w-16 ${
                log.sender === "DISPATCH" ? "text-yellow-400" :
                log.sender === "SYSTEM" ? "text-cyan-400" :
                "text-blue-400"
            }`}>
                {log.sender}:
            </span>
            <span className="text-gray-300">{log.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}