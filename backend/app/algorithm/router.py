import asyncio
import os
import json
import subprocess
import threading
import random
import time
import re
from functools import lru_cache
from typing import List, Tuple, Optional, Any, Dict

import networkx as nx
import osmnx as ox
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel


router = APIRouter()

# --- OSMnx configuration ---
ox.settings.use_cache = True
ox.settings.cache_folder = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".osmnx_cache")
ox.settings.log_console = False

VITALPATH_AI_ROUTE_ALGO = os.environ.get("VITALPATH_AI_ROUTE_ALGO", "dijkstra").lower()

# Howard University Hospital — fixed destination for cardiac arrest scenarios (DMV)
MSH_LAT = 38.9185
MSH_LNG = -77.0195
_MSH_MATCH_THRESHOLD_DEG = 0.002  # ~200 m tolerance for coordinate matching

# Payload / visualization caps (keeps AlgoRace responsive)
VITALPATH_AI_MAX_EXPLORATION_SEGS = int(os.environ.get("VITALPATH_AI_MAX_EXPLORATION_SEGS", "2500"))
VITALPATH_AI_MAX_NETWORK_SEGS = int(os.environ.get("VITALPATH_AI_MAX_NETWORK_SEGS", "2200"))
VITALPATH_AI_COORD_ROUND_DIGITS = int(os.environ.get("VITALPATH_AI_COORD_ROUND_DIGITS", "6"))


# -------------------------------
# Models
# -------------------------------
class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    display_name: str


class AutocompleteResult(BaseModel):
    lat: float
    lng: float
    display_name: str


class AutocompleteResponse(BaseModel):
    results: List[AutocompleteResult]


class Coordinate(BaseModel):
    lat: float
    lng: float


class RouteRequest(BaseModel):
    start: Coordinate
    end: Coordinate
    scenario_type: str = "ROUTINE"  # ROUTINE / TRAUMA / CARDIAC ARREST etc.
    algorithm: str = "dijkstra"     # "dijkstra" or "bmsssp"
    blocked_edges: Optional[List[List[float]]] = None  # [[lat, lng], ...] nodes to block
    include_exploration: bool = False  # return explored edges for visualization


class PivotNode(BaseModel):
    id: str
    lat: float
    lng: float
    type: str


class NavStep(BaseModel):
    id: int
    instruction: str
    street: str
    start_distance_m: float
    end_distance_m: float
    maneuver: str  # depart/continue/slight_left/left/right/uturn...


class RouteResponse(BaseModel):
    algorithm: str
    destination: str

    # execution_time_ms is kept for frontend compatibility, but it now represents the
    # *pathfinding* time only (graph download/snap are excluded).
    execution_time_ms: float

    # Optional extra timings for debugging / demos.
    algorithm_time_ms: Optional[float] = None
    total_time_ms: Optional[float] = None

    pivots_identified: List[PivotNode]

    # Polyline for the frontend (lon/lat)
    path_coordinates: List[List[float]]  # [lng, lat]
    snapped_start: List[float]  # [lng, lat]
    snapped_end: List[float]  # [lng, lat]

    # "Real" navigation values derived from the route
    total_distance_m: float
    total_time_s: float
    cum_distance_m: List[float]  # same length as path_coordinates
    cum_time_s: List[float]  # same length as path_coordinates
    steps: List[NavStep]

    narrative: List[str]

    # Optional: edges explored during search (for mini-map visualization)
    explored_coords: Optional[List[List[List[float]]]] = None  # [[[lng,lat],[lng,lat]], ...]
    explored_count: Optional[int] = None

    # Optional: faint background network segments (helps the minimap look like "streets").
    network_edges_coords: Optional[List[List[List[float]]]] = None


# -------------------------------
# Helpers
# -------------------------------
def _haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """a,b are (lng, lat) in degrees; returns meters."""
    lng1, lat1 = a
    lng2, lat2 = b
    r = 6371000.0
    phi1 = lat1 * 3.141592653589793 / 180.0
    phi2 = lat2 * 3.141592653589793 / 180.0
    dphi = (lat2 - lat1) * 3.141592653589793 / 180.0
    dlmb = (lng2 - lng1) * 3.141592653589793 / 180.0
    s = (pow((__import__("math").sin(dphi / 2.0)), 2.0)
         + __import__("math").cos(phi1) * __import__("math").cos(phi2) * pow((__import__("math").sin(dlmb / 2.0)), 2.0))
    return 2.0 * r * __import__("math").asin(min(1.0, __import__("math").sqrt(s)))


def _bearing_deg(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Rough bearing in degrees (0=north, 90=east)."""
    lng1, lat1 = a
    lng2, lat2 = b
    d_lng = (lng2 - lng1)
    d_lat = (lat2 - lat1)
    ang = __import__("math").atan2(d_lng, d_lat) * 180.0 / 3.141592653589793
    # normalize 0..360
    ang = (ang + 360.0) % 360.0
    return ang


def _angle_diff_deg(a2: float, a1: float) -> float:
    """Return signed smallest difference a2-a1 in range [-180, 180]."""
    d = (a2 - a1 + 540.0) % 360.0 - 180.0
    return d


def _round_segments(segs: Optional[List[List[List[float]]]], digits: int = VITALPATH_AI_COORD_ROUND_DIGITS) -> Optional[List[List[List[float]]]]:
    if segs is None:
        return None
    out: List[List[List[float]]] = []
    for seg in segs:
        if not seg or len(seg) < 2:
            continue
        (x1, y1), (x2, y2) = seg[0], seg[1]
        out.append([[round(float(x1), digits), round(float(y1), digits)], [round(float(x2), digits), round(float(y2), digits)]])
    return out

def _downsample_segments(segs: Optional[List[List[List[float]]]], max_n: int) -> Optional[List[List[List[float]]]]:
    if segs is None:
        return None
    n = len(segs)
    if n <= max_n:
        return segs
    step = n / float(max_n)
    out: List[List[List[float]]] = []
    t = 0.0
    while len(out) < max_n:
        idx = int(t)
        if idx >= n:
            break
        out.append(segs[idx])
        t += step
    return out

def _sample_graph_edge_segments(G: nx.MultiDiGraph, max_n: int = VITALPATH_AI_MAX_NETWORK_SEGS) -> List[List[List[float]]]:
    """Reservoir-sample edge segments so we can draw a faint street network in the minimap without huge payloads."""
    sample: List[List[List[float]]] = []
    seen = 0
    for u, v, k in G.edges(keys=True):
        try:
            ux, uy = float(G.nodes[u]["x"]), float(G.nodes[u]["y"])
            vx, vy = float(G.nodes[v]["x"]), float(G.nodes[v]["y"])
        except Exception:
            continue
        seg = [[ux, uy], [vx, vy]]
        seen += 1
        if len(sample) < max_n:
            sample.append(seg)
        else:
            j = random.randint(0, seen - 1)
            if j < max_n:
                sample[j] = seg
    return sample

def _pick_first_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (list, tuple)) and v:
        for item in v:
            if isinstance(item, str) and item.strip():
                return item
    return str(v)


def _parse_maxspeed_kph(v: Any) -> Optional[float]:
    """Parse OSM maxspeed into km/h if possible."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        for item in v:
            ms = _parse_maxspeed_kph(item)
            if ms is not None:
                return ms
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower()
    # common forms: "50", "50 km/h", "30 mph", "signals", etc.
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if not m:
        return None
    val = float(m.group(1))
    if "mph" in s:
        return val * 1.60934
    return val


def _default_speed_kph(highway: Any) -> float:
    """Fallback speeds when OSM doesn't provide maxspeed."""
    h = _pick_first_str(highway).lower()
    # crude but defensible for a demo
    if "motorway" in h:
        return 100.0
    if "trunk" in h:
        return 80.0
    if "primary" in h:
        return 70.0
    if "secondary" in h:
        return 60.0
    if "tertiary" in h:
        return 55.0
    if "residential" in h:
        return 50.0
    if "service" in h:
        return 35.0
    return 50.0


def _scenario_speed_multiplier(s: str) -> float:
    """Optional speed profile multiplier for the sim (keeps one-way / drivable constraints real)."""
    t = (s or "").upper()
    if "ARREST" in t or "CARDIAC" in t:
        return 1.10
    if "TRAUMA" in t:
        return 1.05
    return 1.00


# -------------------------------
# Duan–Mao pivot heuristic (demo)
# -------------------------------
def find_duan_mao_pivots(G: nx.MultiDiGraph, path_nodes: List[int], k: int = 2) -> List[PivotNode]:
    pivots: List[PivotNode] = []
    for node in path_nodes:
        if G.out_degree(node) >= 3:
            data = G.nodes[node]
            pivots.append(
                PivotNode(
                    id=str(node),
                    lat=float(data["y"]),
                    lng=float(data["x"]),
                    type="Pivot-Relaxed",
                )
            )
            if len(pivots) >= k:
                break
    return pivots


def _remove_blocked_edges(G: nx.MultiDiGraph, blocked_points: List[List[float]], radius_m: float = 100.0) -> nx.MultiDiGraph:
    """Return a copy of G with edges near blocked_points removed.
    Only considers edges that touch nodes within radius of a block (faster than scanning all edges)."""
    if not blocked_points:
        return G
    # 1) Nodes within radius of any blocked point (candidate edges touch these)
    bp_tuples = [(blng, blat) for blat, blng in blocked_points]  # (lng, lat) for haversine
    nearby_nodes = set()
    for node, data in G.nodes(data=True):
        x, y = data.get("x"), data.get("y")
        if x is None or y is None:
            continue
        pt = (float(x), float(y))
        for bp in bp_tuples:
            if _haversine_m(bp, pt) < radius_m:
                nearby_nodes.add(node)
                break
    # 2) Only check edges incident to those nodes (avoids haversine on most of the graph)
    edges_to_remove = set()
    for u, v, k in list(G.edges(keys=True)):
        if u not in nearby_nodes and v not in nearby_nodes:
            continue
        u_lng, u_lat = G.nodes[u]["x"], G.nodes[u]["y"]
        v_lng, v_lat = G.nodes[v]["x"], G.nodes[v]["y"]
        mid_lng = (u_lng + v_lng) / 2.0
        mid_lat = (u_lat + v_lat) / 2.0
        for bp in bp_tuples:
            if (_haversine_m(bp, (u_lng, u_lat)) < radius_m or
                _haversine_m(bp, (mid_lng, mid_lat)) < radius_m or
                _haversine_m(bp, (v_lng, v_lat)) < radius_m):
                edges_to_remove.add((u, v, k))
                break
    G2 = G.copy()
    for u, v, k in edges_to_remove:
        if G2.has_edge(u, v, k):
            G2.remove_edge(u, v, k)
    return G2


def _bbox_for_route(start: Coordinate, end: Coordinate, pad_deg: float = 0.02):
    north = max(start.lat, end.lat) + pad_deg
    south = min(start.lat, end.lat) - pad_deg
    east = max(start.lng, end.lng) + pad_deg
    west = min(start.lng, end.lng) - pad_deg
    return north, south, east, west


def _round_bbox(north: float, south: float, east: float, west: float, digits: int = 3):
    return (round(north, digits), round(south, digits), round(east, digits), round(west, digits))


@lru_cache(maxsize=16)
def _load_graph_cached(north: float, south: float, east: float, west: float) -> nx.MultiDiGraph:
    """Load a drive network for the bbox (cached)."""
    bbox = (west, south, east, north)  # (left, bottom, right, top) for OSMnx v2
    G = ox.graph_from_bbox(bbox, network_type="drive", simplify=True)
    return G


# -----------------------------------------------
# Precomputed MSH shortest-path tree (reverse Dijkstra)
# -----------------------------------------------
import heapq as _heapq

# Module-level cache: {(north, south, east, west): (msh_node, predecessors, distances)}
_msh_spt_cache: Dict[tuple, Tuple[int, Dict[int, Optional[int]], Dict[int, float]]] = {}


def _is_msh_destination(end: 'Coordinate') -> bool:
    """Check if the destination coordinates match MSH within threshold."""
    return (abs(end.lat - MSH_LAT) < _MSH_MATCH_THRESHOLD_DEG and
            abs(end.lng - MSH_LNG) < _MSH_MATCH_THRESHOLD_DEG)


def _get_msh_shortest_path_tree(
    G: nx.MultiDiGraph, bbox_key: tuple
) -> Tuple[int, Dict[int, Optional[int]], Dict[int, float]]:
    """Return (msh_node, predecessors, distances) using a reverse Dijkstra from MSH.

    'Reverse' means we run Dijkstra on the reversed graph so that
    predecessors[node] gives the *next* node on the path FROM node TO msh_node.
    This lets any source instantly reconstruct its path to MSH.
    """
    if bbox_key in _msh_spt_cache:
        return _msh_spt_cache[bbox_key]

    print(f"[MSH-CACHE] Building shortest-path tree for MSH (first call)...")
    build_start = time.time()

    msh_node = ox.nearest_nodes(G, X=MSH_LNG, Y=MSH_LAT)

    # Reverse the graph: an edge u->v becomes v->u so that Dijkstra from MSH
    # computes shortest paths from ALL nodes TO MSH.
    R = G.reverse(copy=False)

    dist: Dict[int, float] = {msh_node: 0.0}
    pred: Dict[int, Optional[int]] = {msh_node: None}
    visited: set = set()
    heap = [(0.0, msh_node)]

    while heap:
        d, u = _heapq.heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        for v, edge_dict in R[u].items():
            if v in visited:
                continue
            best_key = min(edge_dict.keys(), key=lambda kk: float(edge_dict[kk].get("length", 1e18)))
            w = float(edge_dict[best_key].get("length", 1.0))
            new_dist = d + w
            if v not in dist or new_dist < dist[v]:
                dist[v] = new_dist
                pred[v] = u
                _heapq.heappush(heap, (new_dist, v))

    elapsed = (time.time() - build_start) * 1000
    print(f"[MSH-CACHE] Tree built: {len(visited)} nodes reachable in {elapsed:.1f}ms")

    _msh_spt_cache[bbox_key] = (msh_node, pred, dist)
    return msh_node, pred, dist


def _reconstruct_from_msh_cache(
    pred: Dict[int, Optional[int]], source_node: int, msh_node: int
) -> List[int]:
    """Reconstruct path from source_node to msh_node using precomputed predecessors."""
    path = [source_node]
    cur = source_node
    seen = {cur}
    while cur != msh_node:
        nxt = pred.get(cur)
        if nxt is None:
            raise RuntimeError(f"No precomputed path from node {source_node} to MSH")
        if nxt in seen:
            raise RuntimeError("Cycle detected in precomputed path")
        seen.add(nxt)
        path.append(nxt)
        cur = nxt
    return path


def _edge_list_from_graph(G: nx.MultiDiGraph):
    nodes = list(G.nodes)
    idx = {n: i for i, n in enumerate(nodes)}
    edges: List[List[float]] = []
    for u, v, k, data in G.edges(keys=True, data=True):
        w = float(data.get("length", 1.0))
        edges.append([idx[u], idx[v], w])
    return nodes, idx, edges


def _dijkstra_with_exploration(G: nx.MultiDiGraph, source_node: int, target_node: int) -> Tuple[List[int], List[List[List[float]]]]:
    """Custom Dijkstra that returns (path_nodes, explored_edges).
    explored_edges = list of [[lng1,lat1],[lng2,lat2]] segments in visitation order.
    """
    import heapq
    dist = {source_node: 0.0}
    pred = {source_node: None}
    visited = set()
    heap = [(0.0, source_node)]
    explored_edges: List[List[List[float]]] = []

    while heap:
        d, u = heapq.heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        if u == target_node:
            break
        for v, edge_dict in G[u].items():
            if v in visited:
                continue
            # pick shortest parallel edge
            best_key = min(edge_dict.keys(), key=lambda kk: float(edge_dict[kk].get("length", 1e18)))
            w = float(edge_dict[best_key].get("length", 1.0))
            new_dist = d + w
            if v not in dist or new_dist < dist[v]:
                dist[v] = new_dist
                pred[v] = u
                heapq.heappush(heap, (new_dist, v))
            # Record this explored edge as a coordinate segment
            try:
                ux, uy = float(G.nodes[u]["x"]), float(G.nodes[u]["y"])
                vx, vy = float(G.nodes[v]["x"]), float(G.nodes[v]["y"])
                explored_edges.append([[ux, uy], [vx, vy]])
            except (KeyError, TypeError):
                pass

    # Reconstruct path
    if target_node not in pred:
        raise RuntimeError("no path found via dijkstra")
    path = []
    cur = target_node
    while cur is not None:
        path.append(cur)
        cur = pred[cur]
    path.reverse()
    return path, explored_edges

# -------------------------------
# BM-SSSP runner (Node)
# -------------------------------

_BMSSSP_RUNNER: Optional["_BmSsspServerRunner"] = None
_BMSSSP_RUNNER_INIT_LOCK = threading.Lock()


def _readline_with_timeout(pipe, timeout_s: float) -> str:
    out: List[str] = []
    def _target():
        try:
            out.append(pipe.readline())
        except Exception:
            out.append("")

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join(timeout_s)
    if not out:
        raise TimeoutError("bmsssp runner timed out")
    return out[0]


class _BmSsspServerRunner:
    """Keeps a single Node process alive and sends newline-delimited JSON requests.

    This removes per-call Node startup + module import overhead, which otherwise dwarfs
    the algo time for small-ish route graphs.
    """

    def __init__(self, server_path: str):
        self.server_path = server_path
        self.proc = subprocess.Popen(
            ["node", self.server_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.lock = threading.Lock()

    def call(self, payload: Dict[str, Any], timeout_s: float = 20.0) -> Dict[str, Any]:
        if self.proc.poll() is not None:
            raise RuntimeError("bmsssp runner not running")
        assert self.proc.stdin is not None and self.proc.stdout is not None
        with self.lock:
            self.proc.stdin.write(json.dumps(payload) + "\n")
            self.proc.stdin.flush()
            line = _readline_with_timeout(self.proc.stdout, timeout_s).strip()
            if not line:
                # try to surface stderr for debugging
                err = ""
                try:
                    if self.proc.stderr is not None:
                        err = self.proc.stderr.read()
                except Exception:
                    pass
                raise RuntimeError(f"bmsssp runner returned empty output. stderr={err[:400]}")
            return json.loads(line)


def _get_bmsssp_runner() -> Optional["_BmSsspServerRunner"]:
    global _BMSSSP_RUNNER
    if os.environ.get("BMSSSP_USE_SERVER", "1") in ("0", "false", "False"):
        return None

    if _BMSSSP_RUNNER is not None:
        return _BMSSSP_RUNNER

    with _BMSSSP_RUNNER_INIT_LOCK:
        if _BMSSSP_RUNNER is not None:
            return _BMSSSP_RUNNER

        server_path = os.environ.get(
            "BMSSSP_SERVER",
            os.path.join(os.path.dirname(__file__), "..", "..", "bmssp-runner", "server.mjs"),
        )
        server_path = os.path.abspath(server_path)
        if not os.path.exists(server_path):
            return None

        try:
            _BMSSSP_RUNNER = _BmSsspServerRunner(server_path)
            return _BMSSSP_RUNNER
        except Exception:
            _BMSSSP_RUNNER = None
            return None


def _bmsssp_path(G: nx.MultiDiGraph, source_node: int, target_node: int, include_exploration: bool = False) -> Tuple[List[int], List[List[List[float]]]]:
    nodes, idx, edges = _edge_list_from_graph(G)
    if source_node not in idx or target_node not in idx:
        raise RuntimeError("source/target not in subgraph")

    payload = {
        "n": len(nodes),
        "edges": edges,
        "source": idx[source_node],
        "target": idx[target_node],
        "returnPredecessors": True,
    }

    explored_edges: List[List[List[float]]] = []

    try:
        out: Dict[str, Any]
        runner = _get_bmsssp_runner()
        if runner is not None:
            out = runner.call(payload, timeout_s=20.0)
        else:
            # One-shot fallback (slower): spawn node process per request.
            one_shot = os.environ.get(
                "BMSSSP_RUNNER",
                os.path.join(os.path.dirname(__file__), "..", "..", "bmssp-runner", "run.mjs"),
            )
            one_shot = os.path.abspath(one_shot)
            proc = subprocess.run(
                ["node", one_shot],
                input=json.dumps(payload).encode("utf-8"),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=20,
                check=True,
            )
            out = json.loads(proc.stdout.decode("utf-8"))

        pred = out.get("predecessors")
        if not isinstance(pred, list):
            raise RuntimeError("runner output missing predecessors")

        src_i = payload["source"]
        dst_i = payload["target"]

        # Build explored edges from predecessors (all nodes that got a predecessor)
        if include_exploration:
            for i, p in enumerate(pred):
                if p >= 0 and i != src_i:
                    try:
                        n_i = nodes[i]
                        n_p = nodes[p]
                        ix, iy = float(G.nodes[n_i]["x"]), float(G.nodes[n_i]["y"])
                        px, py = float(G.nodes[n_p]["x"]), float(G.nodes[n_p]["y"])
                        explored_edges.append([[px, py], [ix, iy]])
                    except Exception:
                        pass

        # Reconstruct path (dst -> src)
        path_idx: List[int] = []
        cur = dst_i
        seen = set()
        while cur != -1 and cur not in seen:
            seen.add(cur)
            path_idx.append(cur)
            if cur == src_i:
                break
            cur = int(pred[cur])

        if not path_idx or path_idx[-1] != src_i:
            raise RuntimeError("no path found via bm-sssp")

        path_idx.reverse()
        return [nodes[i] for i in path_idx], explored_edges

    except Exception:
        # Fallback to networkx shortest path.
        path = nx.shortest_path(G, source_node, target_node, weight="length")
        return path, explored_edges



def _route_polyline_and_edges(G: nx.MultiDiGraph, path_nodes: List[int], scenario_type: str) -> Tuple[List[List[float]], List[Dict[str, Any]]]:
    """Expand node path into a dense polyline using edge geometry.
    Also returns per-edge spans (start/end point indices) and metadata for steps/ETA.
    """
    route_coords: List[List[float]] = []
    edges_meta: List[Dict[str, Any]] = []
    mult = _scenario_speed_multiplier(scenario_type)

    for u, v in zip(path_nodes[:-1], path_nodes[1:]):
        edge_dict = G.get_edge_data(u, v)
        if not edge_dict:
            continue

        # pick the shortest parallel edge if multiple exist
        best_key = min(edge_dict.keys(), key=lambda kk: float(edge_dict[kk].get("length", 1e18)))
        edge_data = edge_dict[best_key]

        name = _pick_first_str(edge_data.get("name")) or _pick_first_str(edge_data.get("ref")) or "Unnamed Road"
        highway = edge_data.get("highway")
        maxspeed = _parse_maxspeed_kph(edge_data.get("maxspeed"))
        speed_kph = (maxspeed if maxspeed is not None else _default_speed_kph(highway)) * mult

        # span starts at the previous last coord if we already have points
        span_start = len(route_coords) - 1 if route_coords else 0

        if "geometry" in edge_data and edge_data["geometry"] is not None:
            x, y = edge_data["geometry"].xy
            pts = list(zip(x, y))
            if route_coords and pts:
                pts = pts[1:]  # avoid duplication
            for lon, lat in pts:
                route_coords.append([float(lon), float(lat)])
        else:
            if not route_coords:
                route_coords.append([float(G.nodes[u]["x"]), float(G.nodes[u]["y"])])
            route_coords.append([float(G.nodes[v]["x"]), float(G.nodes[v]["y"])])

        span_end = len(route_coords) - 1

        # bearing uses the first segment of this edge span
        if span_end > span_start:
            a = (route_coords[span_start][0], route_coords[span_start][1])
            b_idx = span_start + 1
            b = (route_coords[b_idx][0], route_coords[b_idx][1])
            brg = _bearing_deg(a, b)
        else:
            brg = 0.0

        edges_meta.append(
            {
                "u": u,
                "v": v,
                "name": name,
                "highway": highway,
                "speed_kph": float(speed_kph),
                "span_start": int(span_start),
                "span_end": int(span_end),
                "bearing": float(brg),
            }
        )

    return route_coords, edges_meta


def _build_cum_distance(coords: List[List[float]]) -> List[float]:
    if not coords:
        return []
    cum = [0.0] * len(coords)
    for i in range(1, len(coords)):
        cum[i] = cum[i - 1] + _haversine_m((coords[i - 1][0], coords[i - 1][1]), (coords[i][0], coords[i][1]))
    return cum


def _build_cum_time(coords: List[List[float]], cum_dist: List[float], edges_meta: List[Dict[str, Any]]) -> List[float]:
    """Distribute per-edge travel times across polyline points."""
    if not coords:
        return []
    cum_time = [0.0] * len(coords)

    for em in edges_meta:
        s = em["span_start"]
        e = em["span_end"]
        if e <= s:
            continue
        seg_dist = max(0.0, cum_dist[e] - cum_dist[s])
        speed_mps = max(0.1, (float(em["speed_kph"]) / 3.6))
        seg_time = seg_dist / speed_mps

        t0 = cum_time[s]
        # fill times on this edge proportionally to distance
        for i in range(s + 1, e + 1):
            dd = cum_dist[i] - cum_dist[s]
            frac = 0.0 if seg_dist <= 0 else (dd / seg_dist)
            cum_time[i] = t0 + seg_time * frac

    # Ensure monotonicity (floating point noise)
    for i in range(1, len(cum_time)):
        if cum_time[i] < cum_time[i - 1]:
            cum_time[i] = cum_time[i - 1]
    return cum_time


def _classify_maneuver(delta: float) -> str:
    ad = abs(delta)
    if ad < 20:
        return "continue"
    if ad < 60:
        return "slight_right" if delta > 0 else "slight_left"
    if ad < 135:
        return "right" if delta > 0 else "left"
    return "uturn"


def _instruction_for(maneuver: str, street: str) -> str:
    st = street or "the road"
    if maneuver == "depart":
        return f"Head on {st}"
    if maneuver == "continue":
        return f"Continue on {st}"
    if maneuver == "slight_right":
        return f"Slight right onto {st}"
    if maneuver == "slight_left":
        return f"Slight left onto {st}"
    if maneuver == "right":
        return f"Turn right onto {st}"
    if maneuver == "left":
        return f"Turn left onto {st}"
    if maneuver == "uturn":
        return f"Make a U-turn to stay on {st}"
    return f"Continue on {st}"


def _build_steps(edges_meta: List[Dict[str, Any]], cum_dist: List[float]) -> List[NavStep]:
    """Create turn-by-turn steps from edge spans (hackathon-grade but real)."""
    if not edges_meta or not cum_dist:
        return []

    steps: List[NavStep] = []

    # First step starts at edge 0 and is a "depart"
    step_start_edge = 0
    step_maneuver = "depart"
    step_delta = 0.0  # not used for depart

    def finalize_step(end_edge_idx: int, maneuver: str):
        nonlocal steps, step_start_edge
        first = edges_meta[step_start_edge]
        last = edges_meta[end_edge_idx]
        s_idx = int(first["span_start"])
        e_idx = int(last["span_end"])
        start_m = float(cum_dist[s_idx]) if s_idx < len(cum_dist) else 0.0
        end_m = float(cum_dist[e_idx]) if e_idx < len(cum_dist) else start_m
        street = str(first.get("name") or "Unnamed Road")
        instruction = _instruction_for(maneuver, street)
        steps.append(
            NavStep(
                id=len(steps),
                instruction=instruction,
                street=street,
                start_distance_m=round(start_m, 2),
                end_distance_m=round(end_m, 2),
                maneuver=maneuver,
            )
        )

    # boundary when name changes or turn angle big enough
    for i in range(1, len(edges_meta)):
        prev = edges_meta[i - 1]
        cur = edges_meta[i]
        delta = _angle_diff_deg(float(cur["bearing"]), float(prev["bearing"]))
        name_change = str(cur.get("name")) != str(prev.get("name"))
        big_turn = abs(delta) >= 35.0

        if name_change or big_turn:
            # finalize previous step up to i-1
            finalize_step(i - 1, step_maneuver)

            # start new step at i
            step_start_edge = i
            step_maneuver = _classify_maneuver(delta)

    # finalize last
    finalize_step(len(edges_meta) - 1, step_maneuver)

    # Optional: merge tiny steps (noise)
    merged: List[NavStep] = []
    for st in steps:
        if not merged:
            merged.append(st)
            continue
        prev = merged[-1]
        # merge if same street and very small segment
        if st.street == prev.street and (st.end_distance_m - st.start_distance_m) < 30:
            prev.end_distance_m = st.end_distance_m
        else:
            merged.append(st)

    # Re-assign ids
    for j, st in enumerate(merged):
        st.id = j
    return merged


# --- Nominatim helpers (async, no locks needed) ---
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_HEADERS = {"User-Agent": "vitalpath-ai/1.0"}
_NOMINATIM_MIN_INTERVAL = 1.1  # seconds between calls
_nominatim_last_call: float = 0.0

# DMV area bounding box (Washington DC, Northern Virginia, Maryland suburbs)
# Format: west, south, east, north (Nominatim viewbox)
DMV_MIN_LAT = 38.5
DMV_MAX_LAT = 39.2
DMV_MIN_LON = -77.6
DMV_MAX_LON = -76.7
_DMV_VIEWBOX = "-77.6,38.5,-76.7,39.2"

# Caches
_geocode_cache: Dict[str, Tuple[float, float]] = {}
_nominatim_cache: Dict[str, list] = {}


async def _nominatim_rate_wait() -> None:
    """Sleep just enough so consecutive Nominatim calls stay ≥1.1 s apart."""
    global _nominatim_last_call
    now = time.monotonic()
    elapsed = now - _nominatim_last_call
    if elapsed < _NOMINATIM_MIN_INTERVAL:
        await asyncio.sleep(_NOMINATIM_MIN_INTERVAL - elapsed)


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(q: str = Query(..., min_length=3)):
    """Geocode a query string by calling the Nominatim API directly via httpx."""
    global _nominatim_last_call
    import httpx

    cache_key = q.strip().lower()

    # Fast-path: cached result
    if cache_key in _geocode_cache:
        lat, lng = _geocode_cache[cache_key]
        return GeocodeResponse(lat=lat, lng=lng, display_name=q)

    try:
        await _nominatim_rate_wait()

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _NOMINATIM_URL,
                headers=_NOMINATIM_HEADERS,
                params={
                    "q": q,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "us",
                    "viewbox": _DMV_VIEWBOX,
                    "bounded": 0,
                },
            )
            _nominatim_last_call = time.monotonic()
            resp.raise_for_status()
            data = resp.json()

        if not data:
            raise HTTPException(status_code=400, detail="No addresses found in the DMV area. Try a more specific query.")

        lat, lng = float(data[0]["lat"]), float(data[0]["lon"])

        # Validate result is within DMV bounds
        if not (DMV_MIN_LAT <= lat <= DMV_MAX_LAT and DMV_MIN_LON <= lng <= DMV_MAX_LON):
            raise HTTPException(status_code=400, detail="No addresses found in the DMV area. Try a more specific query.")

        # Cache (bounded)
        if len(_geocode_cache) > 200:
            _geocode_cache.clear()
        _geocode_cache[cache_key] = (lat, lng)

        return GeocodeResponse(lat=lat, lng=lng, display_name=q)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Geocode failed: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geocode failed: {str(e)}")


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(q: str = Query(..., min_length=3)):
    """Return up to 5 address suggestions within the DMV area via Nominatim."""
    global _nominatim_last_call
    import httpx

    cache_key = q.strip().lower()

    # Fast-path: cached results
    if cache_key in _nominatim_cache:
        return AutocompleteResponse(results=_nominatim_cache[cache_key])

    try:
        await _nominatim_rate_wait()

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _NOMINATIM_URL,
                headers=_NOMINATIM_HEADERS,
                params={
                    "q": q,
                    "format": "json",
                    "limit": 10,
                    "addressdetails": 1,
                    "countrycodes": "us",
                    "viewbox": _DMV_VIEWBOX,
                    "bounded": 1,
                },
            )
            _nominatim_last_call = time.monotonic()
            resp.raise_for_status()
            data = resp.json()

        if not data:
            _nominatim_cache[cache_key] = []
            return AutocompleteResponse(results=[])

        # Post-filter: only keep results within DMV bounds
        def _in_dmv(r: dict) -> bool:
            try:
                lat, lng = float(r["lat"]), float(r["lon"])
                return DMV_MIN_LAT <= lat <= DMV_MAX_LAT and DMV_MIN_LON <= lng <= DMV_MAX_LON
            except (ValueError, KeyError):
                return False

        dmv_results = [r for r in data if _in_dmv(r)]

        # Rank results: prioritize actual addresses over named places
        query_lower = q.strip().lower()
        query_words = query_lower.split()

        def _rank(r: dict) -> int:
            addr = r.get("address", {})
            house_number = str(addr.get("house_number", "")).strip()
            road = str(addr.get("road", "")).lower()
            score = 100
            if query_words and query_words[0].isdigit():
                if house_number == query_words[0]:
                    score -= 50
                elif house_number:
                    score -= 10
            for w in query_words:
                if not w.isdigit() and w in road:
                    score -= 20
            return score

        dmv_results.sort(key=_rank)

        out = [
            AutocompleteResult(
                lat=float(r["lat"]),
                lng=float(r["lon"]),
                display_name=r.get("display_name", ""),
            )
            for r in dmv_results[:5]
        ]

        # Cache (bounded)
        if len(_nominatim_cache) > 200:
            _nominatim_cache.clear()
        _nominatim_cache[cache_key] = out

        return AutocompleteResponse(results=out)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Autocomplete failed: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Autocomplete failed: {str(e)}")


@router.post("/calculate", response_model=RouteResponse)
async def calculate_route(req: RouteRequest):
    t_total0 = time.time()

    try:
        # 1) Graph corridor
        north, south, east, west = _bbox_for_route(req.start, req.end)
        north, south, east, west = _round_bbox(north, south, east, west)
        G = _load_graph_cached(north, south, east, west)

        # 1b) Apply road closures (blocked edges) if provided
        if req.blocked_edges:
            G = _remove_blocked_edges(G, req.blocked_edges)

        # 2) Snap to nearest drivable nodes (requires scikit-learn for unprojected graphs)
        orig_node = ox.nearest_nodes(G, X=req.start.lng, Y=req.start.lat)
        dest_node = ox.nearest_nodes(G, X=req.end.lng, Y=req.end.lat)

        # 3) Shortest path (algorithm chosen by frontend)
        chosen_algo = (req.algorithm or VITALPATH_AI_ROUTE_ALGO).lower()
        explored_coords = None
        explored_count: Optional[int] = None
        network_edges_coords: Optional[List[List[List[float]]]] = None

        # If the frontend is in algo-race mode, send a faint background network so the minimap
        # reads as 'streets' even before exploration lines accumulate.
        if req.include_exploration:
            network_edges_coords = _round_segments(_sample_graph_edge_segments(G, max_n=VITALPATH_AI_MAX_NETWORK_SEGS), digits=VITALPATH_AI_COORD_ROUND_DIGITS)

        t_algo0 = time.time()

        # FAST PATH: use precomputed MSH cache for Dijkstra when destination is MSH
        # and no road closures are active
        use_msh_cache = (
            chosen_algo == "dijkstra"
            and _is_msh_destination(req.end)
            and not req.blocked_edges
        )

        if use_msh_cache:
            try:
                bbox_key = (north, south, east, west)
                msh_node, pred, dist = _get_msh_shortest_path_tree(G, bbox_key)
                path_nodes = _reconstruct_from_msh_cache(pred, orig_node, msh_node)
                # Override dest_node to the cached MSH node for consistency
                dest_node = msh_node
                algo_label = "Dijkstra (precomputed MSH cache) // OSM"
                print(f"[MSH-CACHE] Cache HIT — path reconstructed ({len(path_nodes)} nodes)")
            except RuntimeError:
                # Fallback: source node not reachable from cache, use standard Dijkstra
                print("[MSH-CACHE] Cache MISS — falling back to standard Dijkstra")
                use_msh_cache = False

        if not use_msh_cache:
            if chosen_algo == "bmsssp":
                path_nodes, explored = _bmsssp_path(G, orig_node, dest_node, include_exploration=req.include_exploration)
                algo_label = "BM-SSSP (Duan\u2013Mao et al. 2025) // OSM"
                if req.include_exploration:
                    explored_coords = explored
            else:
                if req.include_exploration:
                    path_nodes, explored = _dijkstra_with_exploration(G, orig_node, dest_node)
                    explored_coords = explored
                else:
                    path_nodes = nx.shortest_path(G, orig_node, dest_node, weight="length")
                algo_label = "Dijkstra (networkx) // OSM"

        t_algo1 = time.time()

        # Cap exploration payload size (and keep an accurate count for stats).
        if explored_coords is not None:
            explored_count = len(explored_coords)
            explored_coords = _downsample_segments(explored_coords, VITALPATH_AI_MAX_EXPLORATION_SEGS)
            explored_coords = _round_segments(explored_coords, digits=VITALPATH_AI_COORD_ROUND_DIGITS)

        algo_ms = (t_algo1 - t_algo0) * 1000.0
        total_ms = (time.time() - t_total0) * 1000.0

        # 4) Polyline + edge metadata
        route_coords, edges_meta = _route_polyline_and_edges(G, path_nodes, req.scenario_type)
        if not route_coords:
            raise RuntimeError("No route points produced.")

        # 5) Distances & ETA timeline
        cum_dist = _build_cum_distance(route_coords)
        cum_time = _build_cum_time(route_coords, cum_dist, edges_meta)
        total_dist = float(cum_dist[-1]) if cum_dist else 0.0
        total_time = float(cum_time[-1]) if cum_time else 0.0

        # 6) Steps
        steps = _build_steps(edges_meta, cum_dist)

        # 7) Pivots (demo heuristic)
        pivots = find_duan_mao_pivots(G, path_nodes)

        # Marker should start/end snapped to the road network
        snapped_start = [float(G.nodes[orig_node]["x"]), float(G.nodes[orig_node]["y"])]
        snapped_end = [float(G.nodes[dest_node]["x"]), float(G.nodes[dest_node]["y"])]


        # For demo labeling only
        dest_name = "MACKENZIE HEALTH" if "ARREST" in (req.scenario_type or "").upper() else "SCENE RE-ROUTE"

        mult = _scenario_speed_multiplier(req.scenario_type)

        return RouteResponse(
            algorithm=algo_label,
            destination=dest_name,
            execution_time_ms=round(algo_ms, 2),
            algorithm_time_ms=round(algo_ms, 2),
            total_time_ms=round(total_ms, 2),
            pivots_identified=pivots,
            path_coordinates=route_coords,
            snapped_start=snapped_start,
            snapped_end=snapped_end,
            total_distance_m=round(total_dist, 2),
            total_time_s=round(total_time, 2),
            cum_distance_m=[round(x, 3) for x in cum_dist],
            cum_time_s=[round(t, 3) for t in cum_time],
            steps=steps,
            narrative=[
                "Mission parameters uploaded to Nav-Com.",
                f"Optimized path found in {round(algo_ms, 2)}ms (pathfinding). Total pipeline: {round(total_ms, 2)}ms.",
                f"Speed profile multiplier: x{mult:.2f} (scenario={req.scenario_type}).",
            ],
            explored_coords=explored_coords,
            explored_count=explored_count,
            network_edges_coords=network_edges_coords,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Navigation Fault: {str(e)}")
