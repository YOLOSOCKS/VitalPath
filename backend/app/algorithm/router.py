import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.google_places import autocomplete_places
from app.services.google_routes import compute_route

router = APIRouter()


class GeocodeResponse(BaseModel):
    lat: float
    lng: float
    display_name: str


class AutocompleteResult(BaseModel):
    lat: float
    lng: float
    display_name: str
    place_id: Optional[str] = None


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
    path_coordinates: List[List[float]]  # [lng, lat]
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


AIR_SPEED_MPS = 250.0  # ~900 km/h


def _haversine_m(a: Coordinate, b: Coordinate) -> float:
    import math

    r = 6371000.0
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _interpolate_air_path(start: Coordinate, end: Coordinate, points: int = 128) -> List[Coordinate]:
    if points < 2:
        return [start, end]
    coords: List[Coordinate] = []
    for i in range(points):
        t = i / (points - 1)
        coords.append(
            Coordinate(
                lat=start.lat + (end.lat - start.lat) * t,
                lng=start.lng + (end.lng - start.lng) * t,
            )
        )
    return coords


def _build_cum_dist(coords: List[Coordinate]) -> List[float]:
    cum = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + _haversine_m(coords[i - 1], coords[i]))
    return cum


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode(q: str = Query(..., min_length=3)):
    results = await autocomplete_places(q)
    if not results:
        raise HTTPException(status_code=400, detail="No results found.")
    top = results[0]
    return GeocodeResponse(lat=top["lat"], lng=top["lng"], display_name=top["display_name"])


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def autocomplete(q: str = Query(..., min_length=3)):
    results = await autocomplete_places(q)
    return AutocompleteResponse(results=[AutocompleteResult(**r) for r in results])


@router.post("/calculate", response_model=RouteResponse)
async def calculate(req: RouteRequest):
    try:
        started = time.perf_counter()
        coords: List[Coordinate] = []
        total_distance = 0.0
        total_time = 0.0
        steps: List[NavStep] = []

        if req.algorithm == "air":
            coords = _interpolate_air_path(req.start, req.end)
            cum_distance = _build_cum_dist(coords)
            total_distance = cum_distance[-1] if cum_distance else 0.0
            total_time = max(1.0, total_distance / AIR_SPEED_MPS) if total_distance > 0 else 0.0
            steps = [
                NavStep(
                    id=0,
                    instruction="Fly to destination",
                    street="Air corridor",
                    start_distance_m=0.0,
                    end_distance_m=total_distance,
                    maneuver="depart",
                )
            ]
        else:
            route = await compute_route(req.start.lat, req.start.lng, req.end.lat, req.end.lng, traffic=True)
            if not route["path_coordinates"]:
                raise HTTPException(status_code=400, detail="No route returned.")
            coords = [Coordinate(lat=p["lat"], lng=p["lng"]) for p in route["path_coordinates"]]
            total_distance = route["total_distance_m"] or 0.0
            total_time = route["total_time_s"] or 0.0
            cursor = 0.0
            for idx, step in enumerate(route["steps"]):
                dist = float(step.get("distance_m") or 0.0)
                instruction = step.get("instruction") or "Proceed"
                steps.append(
                    NavStep(
                        id=idx,
                        instruction=instruction,
                        street=instruction,
                        start_distance_m=cursor,
                        end_distance_m=cursor + dist,
                        maneuver="depart" if idx == 0 else "drive",
                    )
                )
                cursor += dist

        algo_time_ms = (time.perf_counter() - started) * 1000

        path_coordinates = [[p.lng, p.lat] for p in coords]
        cum_distance = _build_cum_dist(coords)
        if total_distance > 0 and total_time > 0:
            cum_time = [d / total_distance * total_time for d in cum_distance]
        else:
            cum_time = [0.0 for _ in cum_distance]

        return RouteResponse(
            algorithm="air-direct" if req.algorithm == "air" else "google-routes",
            destination="",
            execution_time_ms=algo_time_ms,
            algorithm_time_ms=algo_time_ms,
            total_time_ms=algo_time_ms,
            pivots_identified=[],
            path_coordinates=path_coordinates,
            snapped_start=[path_coordinates[0][0], path_coordinates[0][1]],
            snapped_end=[path_coordinates[-1][0], path_coordinates[-1][1]],
            total_distance_m=total_distance,
            total_time_s=total_time,
            cum_distance_m=cum_distance,
            cum_time_s=cum_time,
            steps=steps,
            narrative=["Google Routes API"],
            explored_coords=[],
            explored_count=0,
            network_edges_coords=[],
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
