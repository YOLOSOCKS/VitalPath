import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';

type LatLng = { lat: number; lng: number };

export type NavLive = {
  distance_to_next_m: number;
  next_instruction: string;
  current_street: string;
  eta_remaining_s: number;
  remaining_distance_m: number;
  algorithm?: string;
  total_distance_m?: number;
  total_time_s?: number;
  sim_speedup: number;
};

type NavStep = {
  id: number;
  instruction: string;
  street: string;
  start_distance_m: number;
  end_distance_m: number;
  maneuver: string;
};

type RouteResponse = {
  path_coordinates: [number, number][]; // [lng, lat]
  snapped_start?: [number, number];
  snapped_end?: [number, number];
  algorithm?: string;
  execution_time_ms?: number;

  total_distance_m?: number;
  total_time_s?: number;
  cum_distance_m?: number[];
  cum_time_s?: number[];
  steps?: NavStep[];
};

const api = axios.create({
  // If you set VITE_API_BASE=http://127.0.0.1:8000, this will use it.
  // Otherwise it stays relative and works with the Vite proxy (/api -> backend).
  baseURL: (import.meta as any).env?.VITE_API_BASE || '',
});

function bearingDeg(a: [number, number], b: [number, number]): number {
  const dLng = b[0] - a[0];
  const dLat = b[1] - a[1];
  const ang = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return (ang + 360) % 360;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatEta(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

function findIndexByCumTime(cumTime: number[], t: number): number {
  // linear scan is fine at hackathon scale (<10k points)
  let i = 1;
  while (i < cumTime.length && cumTime[i] < t) i++;
  return i;
}

function computeNavLive(meta: {
  totalDist: number;
  totalTime: number;
  steps: NavStep[];
  algorithm?: string;
}, traveledM: number, simTimeS: number, simSpeedup: number): NavLive {
  const remainingDist = Math.max(0, meta.totalDist - traveledM);
  const etaRemaining = Math.max(0, meta.totalTime - simTimeS);

  let currentStreet = '--';
  let nextInstruction = 'Proceed';
  let distanceToNext = 0;

  const steps = meta.steps || [];
  if (steps.length) {
    const cur = steps.find((s) => traveledM >= s.start_distance_m && traveledM < s.end_distance_m) || steps[0];
    currentStreet = cur?.street || '--';

    const next =
      steps.find((s) => s.maneuver !== 'depart' && s.start_distance_m > traveledM) ||
      (remainingDist < 15 ? undefined : cur);

    if (!next) {
      nextInstruction = 'Arrive at destination';
      distanceToNext = 0;
    } else {
      nextInstruction = next.instruction;
      distanceToNext = Math.max(0, next.start_distance_m - traveledM);
    }
  }

  return {
    distance_to_next_m: distanceToNext,
    next_instruction: nextInstruction,
    current_street: currentStreet,
    eta_remaining_s: etaRemaining,
    remaining_distance_m: remainingDist,
    algorithm: meta.algorithm,
    total_distance_m: meta.totalDist,
    total_time_s: meta.totalTime,
    sim_speedup: simSpeedup,
  };
}

export default function LiveMap({
  activeScenario,
  onNavUpdate,
}: {
  activeScenario?: any;
  onNavUpdate?: (nav: NavLive) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ambulanceMarker = useRef<maplibregl.Marker | null>(null);

  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);

  // Live routing inputs
  const [destQuery, setDestQuery] = useState('Mackenzie Health Hospital');
  const [endPoint, setEndPoint] = useState<LatLng>({ lat: 43.8800, lng: -79.2500 });
  const [isFollowing, setIsFollowing] = useState(true);

  // UI feedback
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Animation refs
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const followRef = useRef<boolean>(true);
  const scenarioRef = useRef<any>(null);
  const onNavUpdateRef = useRef<typeof onNavUpdate>(onNavUpdate);

  // Route meta ref (provided by backend)
  const routeRef = useRef<{
    coords: [number, number][];
    cumDist: number[];
    cumTime: number[];
    totalDist: number;
    totalTime: number;
    steps: NavStep[];
    algorithm?: string;
  } | null>(null);

  useEffect(() => {
    followRef.current = isFollowing;
  }, [isFollowing]);
  useEffect(() => {
    scenarioRef.current = activeScenario;
  }, [activeScenario]);
  useEffect(() => {
    onNavUpdateRef.current = onNavUpdate;
  }, [onNavUpdate]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-79.44, 43.86],
      zoom: 16,
      pitch: 70,
    });

    // Marker
    const el = document.createElement('div');
    el.className = 'ambulance-marker';
    el.style.width = '28px';
    el.style.height = '28px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.willChange = 'transform';
    el.innerHTML = `
      <div id="veh" style="
        width: 24px; height: 24px;
        background: #00f0ff;
        border: 2px solid white;
        border-radius: 6px;
        box-shadow: 0 0 20px #00f0ff;
        transform: rotate(45deg);
      "></div>
    `;

    ambulanceMarker.current = new maplibregl.Marker(el).setLngLat([-79.44, 43.86]).addTo(map.current);

    map.current.on('load', () => {
      map.current?.addSource('aegis-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.current?.addLayer({
        id: 'aegis-route-line',
        type: 'line',
        source: 'aegis-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 6, 'line-color': '#00f0ff', 'line-opacity': 0.85 },
      });

      // Initial route (so the demo starts "alive")
      fetchRoute();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-route on scenario change
  useEffect(() => {
    if (!map.current?.loaded()) return;

    if (activeScenario?.location) {
      const end = { lat: activeScenario.location.lat, lng: activeScenario.location.lng };
      setEndPoint(end);
      fetchRoute(end);
      return;
    }

    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario]);

  const fetchRoute = async (endOverride?: LatLng) => {
    try {
      setIsRouting(true);
      setRouteError(null);

      const cur = ambulanceMarker.current?.getLngLat();
      const start = cur ? { lat: cur.lat, lng: cur.lng } : { lat: 43.8561, lng: -79.5570 };

      const res = await api.post<RouteResponse>('/api/algo/calculate', {
        start,
        end: endOverride ?? endPoint,
        scenario_type: activeScenario?.title || 'ROUTINE',
      });

      const coords = (res.data?.path_coordinates || []) as [number, number][];
      const cumDist = (res.data?.cum_distance_m || []) as number[];
      const cumTime = (res.data?.cum_time_s || []) as number[];
      const totalDist = Number(res.data?.total_distance_m ?? (cumDist.length ? cumDist[cumDist.length - 1] : 0));
      const totalTime = Number(res.data?.total_time_s ?? (cumTime.length ? cumTime[cumTime.length - 1] : 0));
      const steps = (res.data?.steps || []) as NavStep[];

      if (!coords.length || !cumDist.length || !cumTime.length) {
        throw new Error('Route meta missing (coords/cumDist/cumTime). Check backend /calculate response.');
      }

      // Put the marker ON the road network (snapped) so it's not inside buildings.
      const snapped = res.data.snapped_start;
      if (snapped && ambulanceMarker.current) {
        ambulanceMarker.current.setLngLat(snapped);
      } else if (ambulanceMarker.current) {
        ambulanceMarker.current.setLngLat(coords[0]);
      }

      setRouteCoordinates(coords);

      routeRef.current = {
        coords,
        cumDist,
        cumTime,
        totalDist,
        totalTime,
        steps,
        algorithm: res.data.algorithm,
      };

      // Update route line
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          },
        ],
      };
      const src = map.current?.getSource('aegis-route') as any;
      if (src) src.setData(geojson);

      // Immediately center the camera
      map.current?.jumpTo({ center: (snapped || coords[0]) as any });

      // Push an initial nav state immediately
      const simSpeedup = 8;
      const initialNav = computeNavLive(
        { totalDist, totalTime, steps, algorithm: res.data.algorithm },
        0,
        0,
        simSpeedup
      );
      onNavUpdateRef.current?.(initialNav);
    } catch (e: any) {
      console.error('Route fetch failed', e);
      setRouteError(
        e?.response?.data?.detail ||
          e?.message ||
          'Route fetch failed. Is the backend running on http://127.0.0.1:8000 ?'
      );
    } finally {
      setIsRouting(false);
    }
  };

  const handleGeocode = async () => {
    if (!destQuery.trim()) return;
    try {
      setIsRouting(true);
      setRouteError(null);

      const res = await api.get('/api/algo/geocode', { params: { q: destQuery.trim() } });
      const end = { lat: res.data.lat, lng: res.data.lng };
      setEndPoint(end);
      await fetchRoute(end);
    } catch (e: any) {
      console.error('Geocode failed', e);
      setRouteError(
        e?.response?.data?.detail ||
          e?.message ||
          'Geocode failed. Try a simpler query like "Mackenzie Health" or "Markham Stouffville Hospital".'
      );
      setIsRouting(false);
    }
  };

  // Realistic GPS-like animation: drive the marker using backend's cum_time_s (and a speedup factor for demo).
  useEffect(() => {
    if (!routeCoordinates.length) return;

    // stop previous animation
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const meta = routeRef.current;
    if (!meta) return;

    startTimeRef.current = performance.now();

    // start at first point
    setCurrentPos(meta.coords[0]);

    const SIM_SPEEDUP = 8; // demo speed multiplier: increases how fast the vehicle progresses along the real route timebase

    const tick = () => {
      const m = routeRef.current;
      if (!m || !ambulanceMarker.current || !map.current) return;

      const elapsedS = (performance.now() - startTimeRef.current) / 1000;
      const simTimeS = elapsedS * SIM_SPEEDUP;
      const totalTime = m.totalTime || m.cumTime[m.cumTime.length - 1];

      if (simTimeS >= totalTime) {
        const end = m.coords[m.coords.length - 1];
        ambulanceMarker.current.setLngLat(end);
        setCurrentPos(end);
        // final nav push
        const finalNav = computeNavLive(
          { totalDist: m.totalDist, totalTime, steps: m.steps, algorithm: m.algorithm },
          m.totalDist,
          totalTime,
          SIM_SPEEDUP
        );
        onNavUpdateRef.current?.(finalNav);
        return;
      }

      const i = clamp(findIndexByCumTime(m.cumTime, simTimeS), 1, m.cumTime.length - 1);
      const t0 = m.cumTime[i - 1];
      const t1 = m.cumTime[i];
      const frac = t1 === t0 ? 0 : (simTimeS - t0) / (t1 - t0);

      const a = m.coords[i - 1];
      const b = m.coords[i];
      const pos: [number, number] = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];

      ambulanceMarker.current.setLngLat(pos);
      setCurrentPos(pos);

      // traveled distance for nav
      const d0 = m.cumDist[i - 1];
      const d1 = m.cumDist[i];
      const traveledM = d0 + (d1 - d0) * frac;

      // update nav panel via callback
      const nav = computeNavLive(
        { totalDist: m.totalDist, totalTime, steps: m.steps, algorithm: m.algorithm },
        traveledM,
        simTimeS,
        SIM_SPEEDUP
      );
      onNavUpdateRef.current?.(nav);

      const brg = bearingDeg(a, b);

      if (followRef.current) {
        map.current.easeTo({
          center: pos,
          bearing: brg,
          duration: 120,
          easing: (x) => x,
          essential: true,
        });
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [routeCoordinates]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden border border-white/10" />

      {/* HUD: MINIMAL CORNER OVERLAY */}
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-xl p-3 rounded-lg border border-cyan-500/30 flex flex-col gap-1 min-w-[220px]">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              activeScenario?.isRedAlert ? 'bg-red-500 animate-pulse' : 'bg-cyan-400'
            }`}
          />
          <span className="text-cyan-400 text-[10px] font-mono font-bold uppercase tracking-tighter">
            {activeScenario?.title || 'SYSTEM IDLE'}
          </span>
        </div>
        <div className="text-[9px] text-gray-500 font-mono">
          UNIT 992 // {currentPos ? `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}` : '--, --'}
        </div>
        {routeRef.current?.totalDist != null && routeRef.current?.totalTime != null && (
          <div className="text-[9px] text-gray-500 font-mono">
            ROUTE // {(routeRef.current.totalDist / 1000).toFixed(2)} km // ETA {formatEta(routeRef.current.totalTime)}
          </div>
        )}
        {routeError && <div className="text-[10px] text-red-300 font-mono mt-1 max-w-[300px]">{routeError}</div>}
      </div>

      {/* Destination input (demo) */}
      <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-xl p-3 rounded-lg border border-white/10 flex gap-2 items-center">
        <input
          value={destQuery}
          onChange={(e) => setDestQuery(e.target.value)}
          placeholder="Enter destination (hospital / address)"
          className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white w-56 outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGeocode();
          }}
        />
        <button
          onClick={handleGeocode}
          disabled={isRouting}
          className={`px-3 py-1 rounded border text-xs font-mono ${
            isRouting
              ? 'bg-white/5 border-white/10 text-gray-400 cursor-not-allowed'
              : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30'
          }`}
        >
          {isRouting ? '...' : 'GO'}
        </button>
        <button
          onClick={() => setIsFollowing((v) => !v)}
          className={`px-2 py-1 rounded border text-xs font-mono ${
            isFollowing ? 'border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400'
          }`}
        >
          {isFollowing ? 'FOLLOW' : 'FREE'}
        </button>
      </div>
    </div>
  );
}
