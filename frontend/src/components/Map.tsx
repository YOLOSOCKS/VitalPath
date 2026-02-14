import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';

export default function LiveMap({ activeScenario }: { activeScenario?: any }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ambulanceMarker = useRef<maplibregl.Marker | null>(null);
  
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-79.44, 43.86],
      zoom: 16, 
      pitch: 70, // Driver perspective
      // 'antialias' removed to fix the TS error
    });

    const el = document.createElement('div');
    el.className = 'ambulance-marker';
    el.style.transition = 'all 0.2s linear';
    el.innerHTML = `<div style="width: 24px; height: 24px; background: #00f0ff; border: 2px solid white; border-radius: 4px; box-shadow: 0 0 20px #00f0ff; transform: rotate(45deg);"></div>`;

    ambulanceMarker.current = new maplibregl.Marker(el).setLngLat([-79.44, 43.86]).addTo(map.current);

    map.current.on('load', fetchDuanMaoPath);
  }, []);

  // Sync path with scenario changes
  useEffect(() => {
    if (map.current?.loaded()) fetchDuanMaoPath();
  }, [activeScenario]);

  const fetchDuanMaoPath = async () => {
    try {
      const res = await axios.post('/api/algo/calculate', {
        start: { lat: 43.8561, lng: -79.5570 },
        end: { lat: 43.8800, lng: -79.2500 },
        scenario_type: activeScenario?.title || "ROUTINE"
      });
      setRouteCoordinates(res.data.path_coordinates);
      setCurrentStep(0);
    } catch (e) { console.error("Duan-Mao Link Failed", e); }
  };

  useEffect(() => {
    if (routeCoordinates.length === 0) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= routeCoordinates.length - 1) { clearInterval(interval); return prev; }
        
        const next = prev + 1;
        const pos = routeCoordinates[next];
        const prevPos = routeCoordinates[prev];

        // Dynamic Bearing for 3D Camera Rotation
        const bearing = Math.atan2(pos[0] - prevPos[0], pos[1] - prevPos[1]) * (180 / Math.PI);

        if (ambulanceMarker.current && map.current) {
          ambulanceMarker.current.setLngLat(pos);
          map.current.easeTo({ 
            center: pos, 
            bearing: bearing, 
            duration: 200, 
            easing: (t) => t,
            essential: true
          });
        }
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [routeCoordinates]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden border border-white/10" />
      
      {/* HUD: MINIMAL CORNER OVERLAY */}
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-xl p-3 rounded-lg border border-cyan-500/30 flex flex-col gap-1 min-w-[180px]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${activeScenario?.isRedAlert ? 'bg-red-500 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-cyan-400 text-[10px] font-mono font-bold uppercase tracking-tighter">
            {activeScenario?.title || "SYSTEM IDLE"}
          </span>
        </div>
        <div className="text-[9px] text-gray-500 font-mono">
          UNIT 992 // {routeCoordinates[currentStep]?.[0].toFixed(4)}, {routeCoordinates[currentStep]?.[1].toFixed(4)}
        </div>
      </div>
    </div>
  );
}