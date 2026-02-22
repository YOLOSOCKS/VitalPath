import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import LiveMap from './components/Map';
import WelcomeScreen from './components/WelcomeScreen';
import AIAssistant from './components/panels/AIAssistant';
import PatientVitals from './components/panels/PatientVitals';
import Navigation from './components/panels/Navigation';
import HospitalInfo from './components/panels/HospitalInfo';
import MissionDetailsPanel, { type OrganPlanSummary } from './components/panels/MissionDetailsPanel';
import AITransparency from './pages/AITransparency';

const api = axios.create({ baseURL: (import.meta as any).env?.VITE_API_BASE || '' });

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
  const [organPlan, setOrganPlan] = useState<OrganPlanSummary | null>(null);
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const aiRef = useRef<any>(null);

  // Detect when backend is not running (proxy ECONNREFUSED → 502, or network error)
  useEffect(() => {
    const onRejected = (err: any) => {
      const status = err?.response?.status;
      const msg = err?.message ? String(err.message) : '';
      if (
        err?.code === 'ECONNREFUSED' ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Network Error') ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        setBackendUnreachable(true);
      }
      return Promise.reject(err);
    };
    const id = api.interceptors.response.use((r) => r, onRejected);
    return () => api.interceptors.response.eject(id);
  }, []);

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
    // Cargo alert is driven only by cargo conditions (PatientVitals onCargoIssueChange), not by scenario
    setActiveScenario(scenario);

    // Auto-fetch organ transport plan (donor/recipient/organ) so we show mission details and transport mode — no address input
    const donor = scenario.donor_hospital;
    const recipient = scenario.recipient_hospital;
    const organ = scenario.organ_type || 'liver';
    if (donor && recipient) {
      api.post('/api/vitalpath/plan/organ-transport', {
        donor_hospital: donor,
        recipient_hospital: recipient,
        organ_type: organ,
      })
        .then((res) => {
          const d = res.data;
          setOrganPlan({
            donor_hospital: donor,
            recipient_hospital: recipient,
            organ_type: organ,
            transport_mode: d.transport_mode || 'road',
            risk_status: d.risk_status || 'low',
            recommendation: d.recommendation || '',
            max_safe_time_s: d.max_safe_time_s ?? 0,
            eta_total_s: d.eta_total_s ?? 0,
            alerts: d.alerts || [],
          });
        })
        .catch(() => setOrganPlan(null));
    } else {
      setOrganPlan(null);
    }

    // 1. Alert tone
    const fileName = scenario.isRedAlert ? 'trauma.mp3' : 'routine.mp3';
    const audioPath = `/audio/${fileName}`;
    const audio = new Audio(audioPath);
    audio.volume = 1.0;
    audio.play()
      .then(() => setAudioError(false))
      .catch(() => setAudioError(true));

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
    setOrganPlan(null);
  };

  return (
    <div className={`w-screen h-screen overflow-hidden flex flex-col transition-all duration-700 ${isRedAlert ? 'bg-red-950/50' : 'bg-[#050505]'}`}>

      {showWelcome && <WelcomeScreen onComplete={() => setShowWelcome(false)} />}

      {backendUnreachable && (
        <div className="absolute top-14 left-0 right-0 z-[100] flex items-center justify-between gap-4 bg-amber-950/95 border-b border-amber-500/50 px-4 py-2 text-amber-200 font-mono text-sm">
          <span>Backend not running — API calls will fail. Start it in a separate terminal:</span>
          <code className="bg-black/40 px-2 py-1 rounded text-amber-300 text-xs whitespace-nowrap">
            cd backend && uvicorn app.main:app --reload --port 8000
          </code>
          <button onClick={() => setBackendUnreachable(false)} className="text-amber-400 hover:text-white shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

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
        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0 overflow-y-auto">
          <MissionDetailsPanel
            className="shrink-0"
            plan={organPlan}
            tripProgressPercent={
              navData?.total_distance_m != null && navData.total_distance_m > 0
                ? ((navData.total_distance_m - navData.remaining_distance_m) / navData.total_distance_m) * 100
                : undefined
            }
          />
          <AIAssistant
            ref={aiRef}
            className={`shrink-0 transition-all duration-500 border-cyan-500/30 shadow-[0_0_40px_rgba(0,240,255,0.2)] ${isRedAlert ? 'shadow-[0_0_60px_rgba(239,68,68,0.3)]' : ''}`}
          />
          <HospitalInfo className="shrink-0" />
        </div>

        <div className="col-span-6 h-full relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/20">
          {/* SYNC: Passing activeScenario to Map for 3D Driver View */}
          <MapErrorBoundary>
            <LiveMap
              activeScenario={activeScenario}
              organPlan={organPlan}
              onNavUpdate={setNavData}
              onScenarioInject={handleScenarioInject}
              onScenarioClear={handleScenarioClear}
            />
          </MapErrorBoundary>
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>

        <div className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          <Navigation className="shrink-0" activeScenario={activeScenario} navData={navData} />
          <PatientVitals
            className="flex-1 min-h-0"
            scenarioData={activeScenario?.cargoTelemetry}
            scenarioTitle={activeScenario?.title}
            patientOnBoard={activeScenario?.patientOnBoard}
            onCargoIssueChange={setIsRedAlert}
          />
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