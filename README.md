# Aegis — Real‑Time EMS Navigation & Triage Dashboard (Hackathon Prototype)

Aegis is a **paramedic/first‑responder in‑vehicle dashboard** designed for high‑stress, time‑critical dispatch.  
It combines **real road‑law–aware routing on OpenStreetMap**, **GPS‑style route simulation**, and an **AI triage assistant** into a single, glanceable UI.

> **Status:** Hackathon prototype (functional routing + live nav telemetry).  
> **Not a medical device. Do not use for real patient care or live dispatch.**

---

## Executive summary

Emergency response routing is a *directed* shortest‑path problem on a constantly changing road graph (one‑ways, turn restrictions, closures, congestion). Aegis demonstrates:

- **Real routing** on **drivable** OpenStreetMap graphs (one‑ways respected).
- **Turn‑by‑turn navigation** derived from route geometry:
  - “Next maneuver”, “Distance to next”, “Current street”, “ETA remaining”, “Remaining distance”.
- **GPS‑style simulation**: vehicle marker follows the computed polyline with a follow‑camera (bearing + pitch).
- **Scenario profiles** (Routine / Trauma / Cardiac Arrest) that influence simulation speed and UI emphasis.
- **AI assistant** via **Gemini API** for concise EMS guidance, with optional **ElevenLabs TTS** audio.

This is built to align with **York Region healthcare** priorities: faster on‑scene arrival, fewer navigation errors, and rapid re‑routing when conditions change.

---

## Key features (what’s implemented in this repo)

### Navigation (real, end‑to‑end)
- ✅ Destination search via geocoding (`/api/algo/geocode`)
- ✅ Road‑law routing on OSM drive network (`/api/algo/calculate`)
- ✅ **Route polyline** returned as `[lng, lat]` for frontend rendering
- ✅ Vehicle marker **snaps to the road network** (no “inside buildings” drift)
- ✅ Live navigation telemetry computed from backend route metadata:
  - total distance / total time
  - cumulative distance/time per polyline point
  - steps (“turn left/right/slight/etc.”) derived from street changes & bearings

### UI/UX (EMS‑style “glanceable”)
- Glassy, high‑contrast panels tuned for rapid scanning
- Follow camera toggle (vehicle‑centric navigation feel)
- Scenario buttons with distinct urgency tones (demo‑friendly)

### AI + Voice
- Gemini chat endpoint: `/api/ai/chat` (triage assistant)
- ElevenLabs voice endpoint: `/api/ai/speak` (optional; requires key)
- Demo audio fallbacks in `frontend/public/audio/`

---

## Why this matters for York Region healthcare

York Region spans dense urban corridors and suburban road networks where **minute‑level improvements** matter. Aegis targets three operational pain points:

1. **Rapid re‑routing under disruption**  
   When closures/incidents occur (or an updated destination is issued), you want a fast recompute of the shortest path on a directed road graph.

2. **Reducing navigation load on crews**  
   Crews shouldn’t interpret complex map UI under stress. Aegis elevates the *single next action* (“Turn right in 300m”) plus ETA and current road.

3. **Consistent on‑route clinical support**  
   AI guidance is constrained to concise bullet points to keep attention on driving/triage.

> Note: York Region open‑data feeds are a natural next integration for live closures/incidents, but this repo focuses on the core routing + navigation telemetry loop.

---

## Duan–Mao (BM‑SSSP) vs Dijkstra — what we’re actually doing

### Baseline: Dijkstra
Dijkstra’s algorithm is the standard for single‑source shortest paths with non‑negative weights. On sparse graphs, it’s commonly described as:

- **Time:** \(O(m + n \log n)\) with a priority queue (model‑dependent)
- **Behavior:** reliable, predictable, excellent in practice

### Breakthrough: “Breaking the Sorting Barrier” (Duan et al., 2025)
Recent theory work shows a deterministic directed SSSP algorithm with improved asymptotic runtime in the comparison‑addition model:

- **Time:** \(O(m \log^{2/3} n)\) for directed SSSP with non‑negative weights  
- **Meaning:** it breaks the long‑standing “sorting barrier” implied by Dijkstra‑style approaches.

In Aegis, this is exposed as an **optional routing engine**:
- **Default:** Dijkstra via NetworkX (most robust)
- **Optional:** BM‑SSSP runner (TypeScript implementation) with fallback to Dijkstra if anything fails

### Why it helps in emergency routing
Emergency response is rarely “compute one route once.” It’s:
- recompute under changing conditions,
- compare multiple candidate destinations (nearest ER vs trauma center),
- run repeated what‑ifs.

Even modest improvements to recompute time can matter when routing is triggered frequently across a region-scale network.

> **Reality check:** on small subgraphs, BM‑SSSP may not beat Dijkstra due to constants/overhead.  
> That’s why Aegis ships **both** and treats BM‑SSSP as an *accelerator path*.

**References**
- “Breaking the Sorting Barrier for Directed Single‑Source Shortest Paths” (arXiv:2504.17033)  
- TypeScript BM‑SSSP implementation used for the optional runner: `Braeniac/bm-sssp`

---

## Tech stack

**Frontend**
- Vite + React + TypeScript
- MapLibre GL (map + route rendering + follow camera)
- TailwindCSS styling

**Backend**
- FastAPI (Python)
- OSMnx + NetworkX for road graph download + routing
- Gemini (Google GenAI SDK) for triage assistant
- ElevenLabs TTS (optional)

---

## Repository layout

```text
Paradash-main/
├─ backend/
│  ├─ app/
│  │  ├─ main.py                  # FastAPI app + routes (algo + AI)
│  │  ├─ algorithm/
│  │  │  └─ router.py             # OSM routing, nav steps, BM‑SSSP hook
│  │  └─ services/
│  │     ├─ gemini.py             # Gemini assistant (optional key)
│  │     └─ voice.py              # ElevenLabs TTS (optional key)
│  ├─ bmssp-runner/
│  │  ├─ package.json             # Node deps for BM‑SSSP runner
│  │  └─ run.mjs                  # Reads graph edges → returns predecessors/path
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ public/audio/               # Demo audio fallbacks
│  ├─ src/
│  │  ├─ App.tsx                  # Dashboard composition + scenario switching
│  │  ├─ components/Map.tsx        # Real routing + GPS simulation + nav telemetry
│  │  ├─ components/panels/        # Navigation, vitals, dispatch, AI assistant
│  │  └─ components/dev/           # Scenario injector (demo tool)
│  ├─ package.json
│  └─ vite.config.ts              # Proxy /api → backend
└─ docs/
   └─ algorithm_for_map.pdf        # Paper/notes bundled for the demo
```

---

## Quickstart

### 1) Backend (FastAPI)
```bash
cd Paradash-main/backend

python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

### 2) Frontend (Vite)
```bash
cd Paradash-main/frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

---

## Installation guide (Windows / macOS / Linux)

### Prerequisites
- **Python 3.10+** (3.11 recommended)
- **Node.js 18+**
- A C/C++ build toolchain may be required for some Python wheels on certain setups.

### Windows
1. Install Python from python.org (check “Add Python to PATH”).
2. Install Node.js LTS.
3. Create and activate venv:
   ```powershell
   cd Paradash-main\backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
4. Frontend:
   ```powershell
   cd ..\frontend
   npm install
   npm run dev
   ```

> If `scikit-learn` fails to install, install **Microsoft C++ Build Tools** (Visual Studio Build Tools) and retry.

### macOS
1. Install dependencies (Homebrew recommended):
   ```bash
   brew install python node
   ```
2. Follow Quickstart.

### Linux (Ubuntu/Debian)
1. Install Python + Node:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-venv python3-pip nodejs npm
   ```
2. Follow Quickstart.

---

## Configuration

Copy the backend environment file:
```bash
cd Paradash-main/backend
cp .env.example .env
```

Set keys (optional):
```env
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
```

### Enable BM‑SSSP (Duan–Mao mode)
By default, Aegis uses Dijkstra.

To enable BM‑SSSP:
```bash
cd Paradash-main/backend/bmssp-runner
npm install

cd ..
AEGIS_ROUTE_ALGO=bmsssp uvicorn app.main:app --reload --port 8000
```

If BM‑SSSP fails, the backend automatically falls back to Dijkstra (for demo reliability).

---

## API

### Routing
- `GET /api/algo/geocode?q=...` → `{ lat, lng, display_name }`
- `POST /api/algo/calculate` with:
  ```json
  {
    "start": {"lat": 43.86, "lng": -79.44},
    "end":   {"lat": 43.88, "lng": -79.25},
    "scenario_type": "ROUTINE"
  }
  ```
  Returns:
  - `path_coordinates` (polyline)
  - `snapped_start`, `snapped_end`
  - `total_distance_m`, `total_time_s`
  - `cum_distance_m[]`, `cum_time_s[]`
  - `steps[]` (maneuvers)

### AI
- `POST /api/ai/chat` `{ "message": "..." }` → `{ "response": "..." }`
- `POST /api/ai/speak` `{ "message": "..." }` → audio/mpeg (if ElevenLabs configured)

---

## Troubleshooting (common hackathon issues)

### “Navigation Fault: scikit-learn must be installed…”
OSMnx uses a BallTree for nearest‑node search on unprojected (lat/lon) graphs.
```bash
pip install scikit-learn
```

### Overpass returns `elements: []`
This is **not** rate limiting — it means your bbox query returned no roads.
Fixes:
- Use a larger bbox padding (see `_bbox_for_route` in `router.py`)
- Clear OSMnx cache (`backend/.osmnx_cache`) if an empty response was cached

### GO does nothing
Check:
- Backend running on port 8000
- Vite proxy is active (`frontend/vite.config.ts`)
- DevTools → Network for `/api/algo/calculate` 200 vs 500

---

## Roadmap (post-hackathon)
- York Region open‑data integration for closures/incidents (auto re-route)
- Offline prebuilt region graphs (no Overpass dependency during demos)
- Better maneuver generation (turn restrictions, roundabouts, lane guidance)
- Multi‑unit fleet view + dispatch assignment
- Audit logging + replay for incident review (privacy‑safe)

---

## License & data attribution
This project downloads and routes on **OpenStreetMap** road data via OSMnx/Overpass.
OpenStreetMap data is licensed under **ODbL** — see the OSM website for details.

---

## Demo script (90 seconds)
1. Choose scenario (Routine / Trauma / Cardiac Arrest)
2. Enter destination → **Route**
3. Vehicle begins moving; Nav panel updates live:
   - next instruction, distance, ETA, current street
4. Toggle follow camera for “GPS feel”
5. Ask AI: “CPR checklist, bullet points” → voice response (if configured)
