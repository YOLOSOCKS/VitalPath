import React from 'react';

export default function HospitalInfo({ className }: { className?: string }) {
    return (
        <div className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col ${className}`}>
            <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-2">
                <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase">
                    Receiving Facility
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-mono">UPLINK: ACTIVE</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
                </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono content-start">
                <div className="text-gray-500 uppercase">Cold-chain ready</div>
                <div className="text-right">
                    <span className="text-emerald-400 font-bold">Yes</span>
                </div>

                <div className="text-gray-500 uppercase">Handoff team</div>
                <div className="text-right">
                    <span className="text-cyan-400 font-bold">Standing by</span>
                </div>

                <div className="text-gray-500 uppercase">OR / Transplant</div>
                <div className="text-right">
                    <span className="text-cyan-400 font-bold">Ready</span>
                </div>

                <div className="text-gray-500 uppercase">Receiving dock</div>
                <div className="text-right">
                    <span className="text-emerald-400 font-bold">Open</span>
                </div>

                <div className="text-gray-500 uppercase">ETA window</div>
                <div className="text-right">
                    <span className="text-cyan-400 font-bold">Within spec</span>
                </div>

                <div className="text-gray-500 uppercase">Diversion</div>
                <div className="text-right">
                    <span className="text-emerald-400 font-bold">OPEN</span>
                </div>
            </div>
        </div>
    );
}
