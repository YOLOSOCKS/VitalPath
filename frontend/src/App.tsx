import React, { useState, useEffect, useRef } from 'react';
import LiveMap from './components/Map';
import WelcomeScreen from './components/WelcomeScreen';
import AIAssistant from './components/panels/AIAssistant';
import PatientVitals from './components/panels/PatientVitals';
import Navigation from './components/panels/Navigation';
import DispatchFeed from './components/panels/DispatchFeed';
import HospitalInfo from './components/panels/HospitalInfo';
import AITransparency from './pages/AITransparency';

// Error Boundary to catch LiveMap crashes
class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LiveMap crashed:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-950/50 text-white font-mono p-4">
          <div className="text-red-400 text-xl mb-2">⚠ MAP CRASH</div>
          <div className="text-sm text-gray-300 max-w-md break-all">{this.state.error?.message}</div>
          <div className="text-xs text-gray-500 mt-2 max-w-md break-all whitespace-pre-wrap">{this.state.error?.stack?.slice(0, 500)}</div>
          <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-4 px-3 py-1 bg-cyan-600 rounded text-sm">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}


// --- CARGO CONTAINER DIAGNOSTICS (temperature, shock, lid, battery) ---
const EquipmentPanel = ({ forceOpen, isRedAlert, cargoTelemetry }: { forceOpen?: boolean; isRedAlert?: boolean; cargoTelemetry?: { temperature_c?: number; shock_g?: number; lid_closed?: boolean; battery_percent?: number } }) => {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => { if (forceOpen) setIsOpen(true); }, [forceOpen]);
  const temp = cargoTelemetry?.temperature_c ?? 4.5;
  const shock = cargoTelemetry?.shock_g ?? 0;
  const lid = cargoTelemetry?.lid_closed ?? true;
  const battery = cargoTelemetry?.battery_percent ?? 88;
  const tempOk = temp >= 2 && temp <= 8;
  const lidOk = lid;

  return (
    <div
      onClick={() => setIsOpen(!isOpen)}
      className={`bg-black/60 backdrop-blur-xl border rounded-xl transition-all duration-500 ease-in-out cursor-pointer overflow-hidden flex flex-col 
        ${isOpen ? 'h-80' : 'h-12 hover:bg-white/5'} 
        ${isRedAlert ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-white/10'}`}
    >
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
        <h2 className="text-cyan-400 font-mono text-sm tracking-widest uppercase flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-cyan-400 shadow-[0_0_10px_#00f0ff]' : tempOk && lidOk ? 'bg-green-500' : 'bg-red-500'}`} />
          CONTAINER TELEMETRY
        </h2>
        <span className="text-gray-500 text-[10px] font-mono">{isOpen ? '▼' : '▲'}</span>
      </div>
      <div className={`flex-1 p-3 grid grid-cols-2 gap-2 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`rounded p-2 border ${tempOk ? 'bg-white/5 border-white/10' : 'bg-red-950/30 border-red-500/50'}`}>
          <div className="text-gray-400 text-[9px] font-mono uppercase">Temperature</div>
          <div className={`text-lg font-mono font-bold leading-tight ${tempOk ? 'text-green-400' : 'text-red-400'}`}>{temp.toFixed(1)} <span className="text-[10px] font-normal">°C</span></div>
          <div className="text-[9px] text-gray-500 font-mono">Cold-chain 2–8°C</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[9px] font-mono uppercase">Shock (g)</div>
          <div className={`text-lg font-mono font-bold leading-tight ${shock > 2 ? 'text-amber-400' : 'text-cyan-400'}`}>{shock.toFixed(2)}g</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[9px] font-mono uppercase">Lid seal</div>
          <div className={`text-base font-mono font-bold uppercase ${lidOk ? 'text-green-400' : 'text-red-400'}`}>{lidOk ? 'Sealed' : 'Open / Compromised'}</div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="text-gray-400 text-[9px] font-mono uppercase">Battery</div>
          <div className="text-lg text-cyan-400 font-mono font-bold leading-tight">{battery}%</div>
          <div className="w-full bg-gray-800 h-1 mt-1 rounded-full overflow-hidden">
            <div className={`h-full ${battery < 20 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, battery)}%` }} />
          </div>
        </div>
        <div className="bg-white/5 rounded p-2 border border-white/10 col-span-2">
          <div className="text-gray-400 text-[9px] font-mono uppercase">Viability</div>
          <div className={`text-sm font-mono font-bold ${tempOk && lidOk && shock <= 2 ? 'text-green-400' : 'text-amber-400'}`}>
            {tempOk && lidOk && shock <= 2 ? 'Within spec — monitor' : 'Check — risk flagged'}
          </div>
        </div>
      </div>
    </div>
  );
};

// Hash-based routing: #/ai-transparency shows AI Transparency page
const getCurrentView = () => window.location.hash === '#/ai-transparency' ? 'ai-transparency' : 'dashboard';

// --- MAIN APPLICATION ---
function App() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [isRedAlert, setIsRedAlert] = useState(false);
  const [activeScenario, setActiveScenario] = useState<any>(null);
  const [navData, setNavData] = useState<any>(null);
  const [time, setTime] = useState(new Date());
  const [audioError, setAudioError] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'ai-transparency'>(getCurrentView);
  const aiRef = useRef<any>(null);

  useEffect(() => {
    const handler = () => setCurrentView(getCurrentView());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('red-alert', isRedAlert);
  }, [isRedAlert]);

  const handleScenarioInject = (scenario: any) => {
    setIsRedAlert(scenario.isRedAlert);
    setActiveScenario(scenario);

    // 1. SPEAK via ElevenLabs TTS (dynamic, no static mp3)
    const phrase = scenario.spokenPhrase ?? scenario.aiPrompt;
    if (aiRef.current?.speak) {
      aiRef.current.speak(phrase).catch((e: any) => {
        console.error('Voice playback failed:', e);
        setAudioError(true);
      });
    }

    // 2. INJECT MESSAGE INTO AI BRAIN (chat display only, no duplicate speech)
    if (aiRef.current) {
      aiRef.current.injectSystemMessage(scenario.aiPrompt, false);
    }
  };

  const handleScenarioClear = () => {
    setIsRedAlert(false);
    setActiveScenario(null);
  };

  return (
    <div className={`w-screen h-screen overflow-hidden flex flex-col transition-all duration-700 ${isRedAlert ? 'bg-red-950/20' : 'bg-[#050505]'}`}>

      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}

      <header className="h-14 shrink-0 border-b border-white/10 bg-black/50 backdrop-blur-lg flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tighter text-white uppercase">
            VitalPath <span className="text-cyan-400 text-sm font-normal tracking-widest ml-2">// CARGO MONITOR</span>
          </h1>
          <nav className="flex items-center gap-2 ml-4">
            <a
              href="#/"
              onClick={(e) => { e.preventDefault(); window.location.hash = ''; setCurrentView('dashboard'); }}
              className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-wider transition-all ${currentView === 'dashboard' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'text-gray-400 border border-transparent hover:text-white hover:border-white/30'}`}
            >
              Dashboard
            </a>
            <a
              href="#/ai-transparency"
              onClick={(e) => { e.preventDefault(); window.location.hash = '#/ai-transparency'; setCurrentView('ai-transparency'); }}
              className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-wider transition-all ${currentView === 'ai-transparency' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'text-gray-400 border border-transparent hover:text-white hover:border-white/30'}`}
            >
              AI Transparency
            </a>
          </nav>
          {audioError && (
            <div className="px-2 py-0.5 bg-red-900/40 border border-red-500 rounded text-red-400 text-[10px] font-mono animate-pulse">
              AUDIO_BLOCKED: CLICK HEADER TO UNLOCK
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-white font-mono text-sm">{time.toLocaleTimeString([], { hour12: false })}</div>
            <div className="text-gray-500 text-[10px] font-mono uppercase">{time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>

          <button
            onClick={() => {
              // PRIME AUDIO CONTEXT
              const silence = new Audio();
              silence.play().catch(() => { });
              setIsRedAlert(!isRedAlert);
              setAudioError(false);
            }}
            className={`px-4 py-1 rounded border font-mono text-xs transition-all ${isRedAlert ? 'bg-red-600 text-white border-red-500 animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-transparent text-gray-400 border-gray-700 hover:border-white'}`}
          >
            {isRedAlert ? '⚠ CARGO ALERT' : 'STANDBY'}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col relative z-10">
        {currentView === 'ai-transparency' ? (
          <AITransparency />
        ) : (
        <div className="flex-1 min-h-0 p-4 grid grid-cols-12 gap-4">
        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          <DispatchFeed className="h-48 shrink-0" scenarioTitle={activeScenario?.title} patientOnBoard={activeScenario?.patientOnBoard} />
          <AIAssistant
            ref={aiRef}
            className={`flex-1 min-h-0 transition-all duration-500 border-cyan-500/30 shadow-[0_0_40px_rgba(0,240,255,0.2)] ${isRedAlert ? 'shadow-[0_0_60px_rgba(239,68,68,0.3)]' : ''}`}
          />
          <EquipmentPanel forceOpen={activeScenario?.isRedAlert} isRedAlert={isRedAlert} cargoTelemetry={activeScenario?.cargoTelemetry} />
        </div>

        <div className="col-span-6 h-full relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/20">
          {/* SYNC: Passing activeScenario to Map for 3D Driver View */}
          <MapErrorBoundary>
            <LiveMap
              activeScenario={activeScenario}
              onNavUpdate={setNavData}
              onScenarioInject={handleScenarioInject}
              onScenarioClear={handleScenarioClear}
            />
          </MapErrorBoundary>
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>

        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          {/* SYNC: Passing activeScenario to Navigation for Turn-by-Turn */}
          <Navigation className="shrink-0" activeScenario={activeScenario} navData={navData} />
          <PatientVitals
            className="flex-[3] min-h-0"
            scenarioData={activeScenario?.cargoTelemetry}
            scenarioTitle={activeScenario?.title}
            patientOnBoard={activeScenario?.patientOnBoard}
          />
          <HospitalInfo className="flex-[2] min-h-0" />
        </div>
        </div>
        )}
      </main>

      <div className="absolute inset-0 z-0 pointer-events-none opacity-5"
        style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>
    </div>
  );
}

export default App;