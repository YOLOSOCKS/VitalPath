import asyncio
import time
from typing import List, Optional, Any, Dict, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.google_routes import compute_google_route


router = APIRouter()


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
    scenario_type: str = "ROUTINE"
    algorithm: str = "google"
    blocked_edges: Optional[List[List[float]]] = None
    include_exploration: bool = False


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
    maneuver: str


class RouteResponse(BaseModel):
    algorithm: str
    destination: str
    execution_time_ms: float
    algorithm_time_ms: Optional[float] = None
    total_time_ms: Optional[float] = None
    pivots_identified: List[PivotNode]
    path_coordinates: List[List[float]]
    snapped_start: List[float]
    snapped_end: List[float]
    total_distance_m: float
    total_time_s: float
    cum_distance_m: List[float]
    cum_time_s: List[float]
    steps: List[NavStep]
    narrative: List[str]
    explored_coords: Optional[List[List[List[float]]]] = None
    explored_count: Optional[int] = None
    network_edges_coords: Optional[List[List[List[float]]]] = None


# --- Nominatim helpers (async, no locks needed) ---
_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_HEADERS = {"User-Agent": "vitalpath/1.0"}
_NOMINATIM_MIN_INTERVAL = 1.1
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
    global _nominatim_last_call
    now = time.monotonic()
    elapsed = now - _nominatim_last_call
    if elapsed < _NOMINATIM_MIN_INTERVAL:
        await asyncio.sleep(_NOMINATIM_MIN_INTERVAL - elapsed)


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(
    q: str = Query(..., min_length=3),
    scope: str = Query("dmv", description="Geocode scope: dmv or us"),
):
    """Geocode a query string by calling the Nominatim API directly via httpx."""
    global _nominatim_last_call
    import httpx

    cache_key = f"{scope}:{q.strip().lower()}"

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
                    **({"viewbox": _DMV_VIEWBOX, "bounded": 1} if scope == "dmv" else {}),
                },
            )
            _nominatim_last_call = time.monotonic()
            resp.raise_for_status()
            data = resp.json()

        if not data:
            detail = "No addresses found. Try a more specific query." if scope != "dmv" else "No addresses found in the DMV area. Try a more specific query."
            raise HTTPException(status_code=400, detail=detail)

        lat, lng = float(data[0]["lat"]), float(data[0]["lon"])

        if scope == "dmv":
            if not (DMV_MIN_LAT <= lat <= DMV_MAX_LAT and DMV_MIN_LON <= lng <= DMV_MAX_LON):
                raise HTTPException(status_code=400, detail="No addresses found in the DMV area. Try a more specific query.")

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
async def autocomplete(
    q: str = Query(..., min_length=3),
    scope: str = Query("dmv", description="Autocomplete scope: dmv or us"),
):
    """Return up to 5 address suggestions via Nominatim."""
    global _nominatim_last_call
    import httpx

    cache_key = f"{scope}:{q.strip().lower()}"

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
                    **({"viewbox": _DMV_VIEWBOX, "bounded": 1} if scope == "dmv" else {}),
                },
            )
            _nominatim_last_call = time.monotonic()
            resp.raise_for_status()
            data = resp.json()

        if not data:
            _nominatim_cache[cache_key] = []
            return AutocompleteResponse(results=[])

        if scope == "dmv":
            def _in_dmv(r: dict) -> bool:
                try:
                    lat, lng = float(r["lat"]), float(r["lon"])
                    return DMV_MIN_LAT <= lat <= DMV_MAX_LAT and DMV_MIN_LON <= lng <= DMV_MAX_LON
                except (ValueError, KeyError):
                    return False

            data = [r for r in data if _in_dmv(r)]

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

        data.sort(key=_rank)

        out = [
            AutocompleteResult(
                lat=float(r["lat"]),
                lng=float(r["lon"]),
                display_name=r.get("display_name", ""),
            )
            for r in data[:5]
        ]

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
    t0 = time.time()
    try:
        result = await compute_google_route(
            start={"lat": req.start.lat, "lng": req.start.lng},
            end={"lat": req.end.lat, "lng": req.end.lng},
        )
        exec_ms = (time.time() - t0) * 1000.0

        return RouteResponse(
            algorithm="google",
            destination=req.scenario_type,
            execution_time_ms=exec_ms,
            algorithm_time_ms=None,
            total_time_ms=None,
            pivots_identified=[],
            path_coordinates=result["path_coordinates"],
            snapped_start=result["snapped_start"],
            snapped_end=result["snapped_end"],
            total_distance_m=result["total_distance_m"],
            total_time_s=result["total_time_s"],
            cum_distance_m=result["cum_distance_m"],
            cum_time_s=result["cum_time_s"],
            steps=[NavStep(**s) for s in result["steps"]],
            narrative=[],
            explored_coords=[] if req.include_exploration else None,
            explored_count=0 if req.include_exploration else None,
            network_edges_coords=[] if req.include_exploration else None,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
