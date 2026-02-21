import React, { useState, useEffect } from 'react';

/** Cargo telemetry from container sensors (temperature, shock, lid, battery, elapsed time) */
interface CargoTelemetry {
  temperature_c?: number;
  shock_g?: number;
  lid_closed?: boolean;
  battery_percent?: number;
  elapsed_time_s?: number;
}

export default function PatientVitals({ className, scenarioData, scenarioTitle, patientOnBoard }: {
  className?: string;
  scenarioData?: CargoTelemetry | Record<string, unknown>;
  scenarioTitle?: string;
  patientOnBoard?: boolean;
}) {
  const cargo = scenarioData && typeof scenarioData === 'object' && 'temperature_c' in scenarioData
    ? (scenarioData as CargoTelemetry)
    : null;
  const [temp, setTemp] = useState(cargo?.temperature_c ?? 4.5);
  const [shock, setShock] = useState(cargo?.shock_g ?? 0);
  const [elapsed, setElapsed] = useState(cargo?.elapsed_time_s ?? 0);

  const hasCargo = Boolean(scenarioTitle && cargo);
  const tempOk = temp >= 2 && temp <= 8;
  const lidOk = cargo?.lid_closed ?? true;
  const battery = cargo?.battery_percent ?? 88;

  useEffect(() => {
    if (cargo) {
      setTemp(cargo.temperature_c ?? 4.5);
      setShock(cargo.shock_g ?? 0);
      setElapsed(cargo.elapsed_time_s ?? 0);
    }
  }, [cargo?.temperature_c, cargo?.shock_g, cargo?.elapsed_time_s]);

  // Simulate slight drift over time when scenario is active
  useEffect(() => {
    if (!hasCargo) return;
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
      setTemp(prev => Math.max(1.5, Math.min(8.5, prev + (Math.random() * 0.2 - 0.1))));
      setShock(prev => Math.random() < 0.02 ? prev + 0.2 : Math.max(0, prev - 0.01));
    }, 1000);
    return () => clearInterval(interval);
  }, [hasCargo]);

  const isEnRouteToPickup = scenarioTitle?.toUpperCase().includes('BLOOD') && !patientOnBoard;

  return (
    <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col ${className}`}>
      <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
        <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase">
          CARGO STATUS
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 font-mono">{hasCargo ? 'LIVE' : 'NO SHIPMENT'}</span>
          <div className={`w-2 h-2 rounded-full ${!hasCargo ? 'bg-gray-500' : tempOk && lidOk ? 'bg-green-500' : 'bg-amber-500'}`} />
        </div>
      </div>

      {!scenarioTitle && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-gray-600 text-3xl mb-3">📦</div>
          <div className="text-gray-400 font-mono text-sm tracking-wider uppercase mb-1">NO ACTIVE SHIPMENT</div>
          <div className="text-gray-600 font-mono text-[10px] tracking-wide">AWAITING ASSIGNMENT</div>
        </div>
      )}

      {isEnRouteToPickup && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-cyan-600 text-3xl mb-3 animate-pulse">📍</div>
          <div className="text-cyan-500 font-mono text-sm tracking-wider uppercase mb-1">EN ROUTE TO PICKUP</div>
          <div className="text-cyan-600/70 font-mono text-[10px] tracking-wide">Telemetry after cargo loaded</div>
        </div>
      )}

      {hasCargo && !isEnRouteToPickup && (
        <>
          {!tempOk || !lidOk ? (
            <div className="mb-3 px-3 py-1.5 bg-amber-950/40 border border-amber-500/50 rounded-lg">
              <div className="text-amber-400 text-[10px] font-mono font-bold tracking-wider text-center">
                Check temperature or seal — risk flagged
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className={`border p-2 rounded ${tempOk ? 'bg-white/5 border-white/10' : 'bg-amber-950/20 border-amber-500/40'}`}>
              <div className="text-gray-400 text-[10px] font-mono">Temperature</div>
              <div className={`text-2xl font-mono font-bold ${tempOk ? 'text-green-400' : 'text-amber-400'}`}>{temp.toFixed(1)}°C</div>
              <div className="text-[9px] text-gray-500">Cold-chain 2–8°C</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-2 rounded">
              <div className="text-gray-400 text-[10px] font-mono">Shock</div>
              <div className={`text-2xl font-mono font-bold ${shock > 2 ? 'text-amber-400' : 'text-cyan-400'}`}>{shock.toFixed(2)}g</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-2 rounded">
              <div className="text-gray-400 text-[10px] font-mono">Lid seal</div>
              <div className={`text-lg font-mono font-bold ${lidOk ? 'text-green-400' : 'text-red-400'}`}>{lidOk ? 'Sealed' : 'Open'}</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-2 rounded">
              <div className="text-gray-400 text-[10px] font-mono">Battery</div>
              <div className="text-2xl text-cyan-400 font-mono font-bold">{battery}%</div>
            </div>
          </div>

          <div className="bg-white/5 p-2 rounded border border-white/10 flex justify-between items-center">
            <div>
              <div className="text-gray-400 text-[10px] font-mono">Elapsed (transport)</div>
              <div className="text-lg text-white font-mono">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Viability</div>
              <div className={`text-xs font-mono font-bold ${tempOk && lidOk && shock <= 2 ? 'text-green-400' : 'text-amber-400'}`}>
                {tempOk && lidOk && shock <= 2 ? 'Within spec' : 'Check'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
