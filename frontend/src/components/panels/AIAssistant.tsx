import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';

// Shared API base (aligns with Map and backend); use VITE_API_BASE when hitting backend directly
const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE || '',
});

interface Message {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

// Matches backend ChatRequest: { message: string; context?: string }
interface ChatRequest {
  message: string;
  context?: string;
}

// 1. Wrap in forwardRef to allow App.tsx to 'hold' this component
const AIAssistant = forwardRef(({ className, isOpen: controlledOpen, onToggle: controlledToggle }: { className?: string; isOpen?: boolean; onToggle?: () => void }, ref) => {
  const [internalOpen, setInternalOpen] = useState(true);
  const isControlled = controlledOpen !== undefined && controlledToggle !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onToggle = isControlled ? controlledToggle : () => setInternalOpen((o) => !o);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'VitalPath AI online. Monitoring temperature, shock, seal & battery. Ask about cargo viability or what to do next.', timestamp: 'NOW' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 2. EXPOSE injectSystemMessage AND speak (for scenario TTS)
  useImperativeHandle(ref, () => ({
    injectSystemMessage: async (text: string, shouldSpeak = true) => {
      const aiMsg: Message = {
        role: 'ai',
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour12: false })
      };
      setMessages(prev => [...prev, aiMsg]);
      if (isVoiceEnabled && shouldSpeak) {
        await handleVoicePlay(text);
      }
    },
    speak: async (text: string) => handleVoicePlay(text),
  }));

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clean up audio URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current?.src?.startsWith('blob:')) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  const handleVoicePlay = async (text: string): Promise<void> => {
    if (!isVoiceEnabled) return;

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src?.startsWith('blob:')) {
          URL.revokeObjectURL(audioRef.current.src);
        }
      }

      console.log("[TTS] Calling ElevenLabs API:", text.slice(0, 60) + (text.length > 60 ? "…" : ""));
      const res = await api.post('/api/ai/speak',
        { message: text, context: 'general' } as ChatRequest,
        { responseType: 'blob' }
      );

      if (!res.data || (res.data as Blob).size === 0) {
        throw new Error("Empty audio response");
      }

      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.volume = 1.0;
      audio.playbackRate = 1.1;
      // Play through Web Audio API for extra gain (louder)
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const gainNode = ctx.createGain();
      gainNode.gain.value = 2.0;
      const src = ctx.createMediaElementSource(audio);
      src.connect(gainNode);
      gainNode.connect(ctx.destination);
      await audio.play();
    } catch (err) {
      console.error("ElevenLabs Integration Error:", err);
      // Do NOT use static mp3. Fallback to browser speechSynthesis only when ElevenLabs fails.
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
        console.log("[TTS] Fallback: using speechSynthesis");
      } catch (fallbackErr) {
        console.error("speechSynthesis fallback failed:", fallbackErr);
        throw fallbackErr;
      }
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { 
      role: 'user', 
      text: input.toUpperCase(), 
      timestamp: new Date().toLocaleTimeString([], { hour12: false }) 
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await api.post<{ response: string }>('/api/ai/chat', {
        message: userMsg.text,
        context: 'general',
      } as ChatRequest);
      const aiText = res.data.response;

      const aiMsg: Message = {
        role: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour12: false })
      };
      
      setMessages(prev => [...prev, aiMsg]);

      if (isVoiceEnabled) {
        await handleVoicePlay(aiText);
      }

    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: 'ERROR: NEURAL UPLINK FAILED.', 
        timestamp: 'ERR' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={!open ? onToggle : undefined}
      onKeyDown={(e) => { if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle?.(); } }}
      className={`bg-black/40 backdrop-blur-md border border-white/10 rounded-xl flex flex-col overflow-hidden transition-all duration-300 relative z-10 ${className} ${open ? 'min-h-0 max-h-[200px] shrink-0' : 'min-h-[56px] h-14 shrink-0 flex-grow-0 cursor-pointer hover:bg-white/5 select-none'}`}
    >
      <div
        onClick={open ? (e) => { e.stopPropagation(); onToggle?.(); } : undefined}
        className="h-14 min-h-[56px] shrink-0 px-4 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5 w-full"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-red-400 font-mono text-sm tracking-widest uppercase truncate">
            CARGO GUARDIAN
          </h2>
          <div className={`w-2 h-2 rounded-full shrink-0 ${isLoading ? 'bg-yellow-400 animate-ping' : 'bg-green-500'}`} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {open && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsVoiceEnabled(!isVoiceEnabled); }}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                isVoiceEnabled ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-gray-800 border-gray-600 text-gray-500'
              }`}
            >
              VOICE: {isVoiceEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          <span className="text-gray-500 text-xs font-mono" aria-hidden>{open ? '▼' : '▲'}</span>
        </div>
      </div>

      {open && (
      <>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 font-mono text-xs scrollbar-thin scrollbar-thumb-red-900">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[90%] p-2 rounded border ${
              m.role === 'user' 
                ? 'bg-red-950/30 border-red-500/50 text-red-100' 
                : 'bg-black/50 border-white/20 text-gray-300'
            }`}>
              {m.text.split('\n').map((line, idx) => (
                <p key={idx} className="mb-1 leading-relaxed">{line}</p>
              ))}
            </div>
            <span className="text-[9px] text-gray-600 mt-1">{m.timestamp}</span>
          </div>
        ))}
        {isLoading && <div className="text-red-400 animate-pulse font-mono text-[10px] uppercase">Analyzing cargo status...</div>}
      </div>

      <div className="p-2 border-t border-white/10 bg-black/50 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask about cargo, route, or next steps..."
          className="flex-1 bg-transparent border-none outline-none text-red-400 font-mono text-xs placeholder-gray-700"
          disabled={isLoading}
        />
        <button 
          onClick={sendMessage}
          disabled={isLoading}
          className={`px-3 py-1 font-mono text-xs transition-all ${
            isLoading 
              ? 'bg-gray-800 text-gray-600 border border-gray-700 cursor-not-allowed' 
              : 'bg-red-900/40 border border-red-500/30 text-red-400 hover:bg-red-800/50 hover:border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
          }`}
        >
          {isLoading ? '...' : 'SEND'}
        </button>
      </div>
      </>
      )}
    </div>
  );
});

export default AIAssistant;