import React, { useState } from 'react';

export default function HospitalInfo({ className }: { className?: string }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div
            onClick={() => setIsOpen(!isOpen)}
            className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex flex-col overflow-hidden cursor-pointer transition-all duration-300 hover:bg-white/5 ${className} ${isOpen ? 'min-h-0' : 'h-12 shrink-0'}`}
        >
            <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
                <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase">
                    Receiving Facility
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-mono">UPLINK: ACTIVE</span>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
                    <span className="text-gray-500 text-[10px] font-mono">{isOpen ? '▼' : '▲'}</span>
                </div>
            </div>

            {isOpen && (
                <div className="flex-1 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono content-start">
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
            )}
        </div>
    );
}
