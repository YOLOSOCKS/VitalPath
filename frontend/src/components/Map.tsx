import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';

// Fix 1: Explicitly tell TS this is a tuple of numbers, not a generic array
const INITIAL_CENTER: [number, number] = [-79.4400, 43.8620]; 

// Define types for our API response so TS doesn't panic
interface PivotNode {
  id: string;
  lat: number;
  lng: number;
  type: string;
}

interface RouteResponse {
  algorithm: string;
  pivots_identified: PivotNode[];
  path_coordinates: number[][];
}

export default function LiveMap() {
  // Fix 2: Tell useRef exactly what HTML element it will hold
  const mapContainer = useRef<HTMLDivElement>(null);
  
  // Fix 3: Tell useRef it can hold a Map object OR null
  const map = useRef<maplibregl.Map | null>(null);
  
  const [status, setStatus] = useState<string>("CONNECTING...");

  useEffect(() => {
    // Fix 4: Safety check - if map exists OR container is missing, stop.
    if (map.current || !mapContainer.current) return;

    // 1. Initialize Map
    map.current = new maplibregl.Map({
      container: mapContainer.current, // TS now knows this is valid
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap &copy; CARTO'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: INITIAL_CENTER,
      zoom: 11,
      pitch: 50,
      bearing: -10
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // 2. Fetch Data from Python Backend on Load
    map.current.on('load', async () => {
      // Fix 5: Use optional chaining (?.) just in case map vanishes (unlikely but TS likes it)
      if (!map.current) return;

      try {
        setStatus("FETCHING DUAN-MAO PATH...");
        
        // Fetch from API
        const response = await axios.post<RouteResponse>('/api/algo/calculate', {
          start: { lat: 43.8561, lng: -79.5570 },
          end: { lat: 43.8800, lng: -79.2500 }
        });

        const data = response.data;
        console.log("Algorithm Response:", data);
        setStatus(`ROUTED: ${data.algorithm.substring(0, 20)}...`);

        // 3. Draw the "Cyan Path"
        map.current.addSource('route', {
          'type': 'geojson',
          'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
              'type': 'LineString',
              'coordinates': data.path_coordinates
            }
          }
        });

        map.current.addLayer({
          'id': 'route',
          'type': 'line',
          'source': 'route',
          'layout': { 'line-join': 'round', 'line-cap': 'round' },
          'paint': {
            'line-color': '#00f0ff', // Aegis Cyan
            'line-width': 6,
            'line-opacity': 0.9,
            'line-blur': 1
          }
        });

        // 4. Draw the "Pivots" (Glowing Nodes)
        const pivotFeatures = data.pivots_identified.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { description: p.id }
        }));

        map.current.addSource('pivots', {
          type: 'geojson',
          // WE ADD "as any" HERE TO SHUT TYPESCRIPT UP
          data: { 
            type: 'FeatureCollection', 
            features: pivotFeatures 
          } as any 
        });

        map.current.addLayer({
          id: 'pivots',
          type: 'circle',
          source: 'pivots',
          paint: {
            'circle-radius': 8,
            'circle-color': '#ff00ff', // Neon Pink Pivots
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });

      } catch (error) {
        console.error("Backend Error:", error);
        setStatus("ERROR: BACKEND OFFLINE");
      }
    });

  }, []);

  return (
    <div className="w-full h-full relative group">
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10" />
      
      {/* Live Status Overlay */}
      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-4 py-2 rounded-lg border border-cyan-500/30">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.includes("ERROR") ? "bg-red-500" : "bg-cyan-400 animate-pulse"}`} />
          <span className="text-cyan-400 text-xs font-mono font-bold">{status}</span>
        </div>
      </div>
    </div>
  );
}