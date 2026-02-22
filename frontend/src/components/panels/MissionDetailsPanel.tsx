/**
 * Mission Details Panel: donor/recipient, organ type, max safe time, ETA, transport mode, risk.
 * Collapsible; each panel opens/closes independently. Auto-opens when a plan is set.
 */
import React, { useState, useEffect } from 'react';

export type TransportMode = 'road' | 'air' | 'hybrid';
export type RiskStatus = 'low' | 'medium' | 'high' | 'critical';

export interface OrganPlanSummary {
  donor_hospital: string;
  recipient_hospital: string;
  organ_type: string;
  transport_mode: TransportMode;
  risk_status: RiskStatus;
  recommendation: string;
  max_safe_time_s: number;
  eta_total_s: number;
  alerts: Array<{ id: string; severity: string; title: string; message: string; suggested_action?: string }>;
}

const MODE_LABELS: Record<TransportMode, string> = {
  road: 'Road',
  air: 'Air',
  hybrid: 'Air + Road',
};

const MODE_ICONS: Record<TransportMode, string> = {
  road: '🚗',
  air: '✈️',
  hybrid: '🔀',
};

const RISK_COLORS: Record<RiskStatus, string> = {
  low: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10',
  medium: 'text-amber-400 border-amber-500/50 bg-amber-500/10',
  high: 'text-orange-400 border-orange-500/50 bg-orange-500/10',
  critical: 'text-red-400 border-red-500/50 bg-red-500/10',
};

const URGENCY_COLORS: Record<RiskStatus, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m <= 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

export default function MissionDetailsPanel({
  className,
  plan,
  tripProgressPercent,
  isOpen: controlledOpen,
  onToggle: controlledToggle,
}: {
  className?: string;
  plan: OrganPlanSummary | null;
  tripProgressPercent?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isControlled = controlledOpen !== undefined && controlledToggle !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onToggle = isControlled ? controlledToggle : () => setInternalOpen((o) => !o);

  // Auto-open when a mission plan is set
  useEffect(() => {
    if (plan && !isControlled) setInternalOpen(true);
  }, [plan, isControlled]);

  if (!plan) {
    return (
      <div
        onClick={onToggle}
        className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex flex-col overflow-hidden cursor-pointer transition-all duration-300 ${className} ${open ? 'min-h-[120px]' : 'h-12 shrink-0'}`}
      >
        <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
          <h2 className="text-red-400 font-mono text-sm tracking-widest uppercase">Mission Summary</h2>
          <span className="text-gray-500 text-[10px] font-mono">{open ? '▼' : '▲'}</span>
        </div>
        {open && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4">
            <div className="text-gray-500 text-4xl mb-2">📋</div>
            <div className="text-gray-400 font-mono text-sm uppercase tracking-wider">No active mission</div>
            <div className="text-gray-600 font-mono text-[10px] mt-1">Select a scenario on the map to start</div>
          </div>
        )}
      </div>
    );
  }

  const riskColor = RISK_COLORS[plan.risk_status] || RISK_COLORS.low;
  const urgencyColor = URGENCY_COLORS[plan.risk_status] || URGENCY_COLORS.low;

  return (
    <div
      className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex flex-col overflow-hidden transition-all duration-300 ${className} ${open ? 'min-h-0' : 'h-12 shrink-0'}`}
    >
      <div
        onClick={onToggle}
        className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5 cursor-pointer hover:bg-white/5"
      >
        <h2 className="text-red-400 font-mono text-sm tracking-widest uppercase">Mission Summary</h2>
        <span className="text-gray-500 text-[10px] font-mono">{open ? '▼' : '▲'}</span>
      </div>
      {open && (
        <div className="p-4 flex flex-col overflow-y-auto">
      {/* Donor / Recipient */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono mb-3">
        <div className="text-gray-500 uppercase">Donor</div>
        <div className="text-right text-red-300 truncate" title={plan.donor_hospital}>
          {plan.donor_hospital.replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
        <div className="text-gray-500 uppercase">Recipient</div>
        <div className="text-right text-emerald-300 truncate" title={plan.recipient_hospital}>
          {plan.recipient_hospital.replace(/\b\w/g, (c) => c.toUpperCase())}
        </div>
        <div className="text-gray-500 uppercase">Organ</div>
        <div className="text-right text-white font-bold capitalize">{plan.organ_type}</div>
      </div>

      {/* Transport mode + urgency indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl" title={MODE_LABELS[plan.transport_mode]}>
          {MODE_ICONS[plan.transport_mode]}
        </span>
        <span className="text-red-400 font-mono text-sm font-bold uppercase tracking-wider">
          {MODE_LABELS[plan.transport_mode]}
        </span>
        <span className={`ml-auto px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${riskColor}`}>
          {plan.risk_status}
        </span>
      </div>

      {/* Max safe time / ETA */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono mb-3">
        <div className="text-gray-500 uppercase">Max safe time</div>
        <div className="text-right text-white">{formatMinutes(plan.max_safe_time_s)}</div>
        <div className="text-gray-500 uppercase">ETA</div>
        <div className="text-right text-red-400 font-bold">{formatDuration(plan.eta_total_s)}</div>
      </div>

      {/* Mission progress bar (optional) */}
      {typeof tripProgressPercent === 'number' && (
        <div className="mb-3">
          <div className="flex justify-between text-[9px] text-gray-500 font-mono uppercase mb-1">
            <span>Trip progress</span>
            <span>{Math.round(tripProgressPercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${urgencyColor}`}
              style={{ width: `${Math.min(100, Math.max(0, tripProgressPercent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Alerts */}
      {plan.alerts && plan.alerts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {plan.alerts.slice(0, 2).map((a, i) => (
            <div
              key={a.id || i}
              className="px-2 py-1.5 rounded border border-amber-500/40 bg-amber-950/30 text-amber-200 text-[10px] font-mono"
            >
              <span className="font-bold">{a.title}</span>
              {a.suggested_action && (
                <span className="block mt-0.5 text-amber-300/80">{a.suggested_action}</span>
              )}
            </div>
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
