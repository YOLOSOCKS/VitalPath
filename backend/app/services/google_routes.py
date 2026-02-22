import math
import os
from typing import Any, Dict, List, Tuple

import httpx


GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def _parse_duration_seconds(duration: str) -> float:
    if not duration:
        return 0.0
    if duration.endswith("s"):
        duration = duration[:-1]
    try:
        return float(duration)
    except ValueError:
        return 0.0


def _decode_polyline(encoded: str) -> List[Tuple[float, float]]:
    if not encoded:
        return []
    points: List[Tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift = 0
        result = 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        points.append((lat / 1e5, lng / 1e5))

    return points


def _haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lng1 = a
    lat2, lng2 = b
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    x = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2.0 * r * math.asin(min(1.0, math.sqrt(x)))


async def compute_google_route(
    start: Dict[str, float],
    end: Dict[str, float],
    travel_mode: str = "DRIVE",
    routing_preference: str = "TRAFFIC_AWARE",
) -> Dict[str, Any]:
    api_key = os.getenv("GOOGLE_MAPS_SERVER_KEY")
    if not api_key:
        raise RuntimeError("Missing GOOGLE_MAPS_SERVER_KEY in backend/.env")

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "routes.duration,"
            "routes.distanceMeters,"
            "routes.polyline.encodedPolyline,"
            "routes.legs.steps.navigationInstruction,"
            "routes.legs.steps.distanceMeters"
        ),
    }

    body = {
        "origin": {"location": {"latLng": {"latitude": start["lat"], "longitude": start["lng"]}}},
        "destination": {"location": {"latLng": {"latitude": end["lat"], "longitude": end["lng"]}}},
        "travelMode": travel_mode,
        "routingPreference": routing_preference,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(GOOGLE_ROUTES_URL, headers=headers, json=body)
    if res.status_code != 200:
        raise RuntimeError(res.text)

    data = res.json()
    routes = data.get("routes") or []
    if not routes:
        raise RuntimeError("Google Routes API returned no routes.")

    route = routes[0]
    encoded = route.get("polyline", {}).get("encodedPolyline", "")
    decoded = _decode_polyline(encoded)
    if not decoded:
        raise RuntimeError("Google Routes API returned empty polyline.")

    # decoded is list of (lat, lng); convert to [lng, lat]
    path_coordinates: List[List[float]] = [[lng, lat] for lat, lng in decoded]

    total_distance_m = float(route.get("distanceMeters") or 0.0)
    total_time_s = _parse_duration_seconds(route.get("duration", ""))

    cum_distance_m: List[float] = [0.0]
    for i in range(1, len(decoded)):
        seg = _haversine_m(decoded[i - 1], decoded[i])
        cum_distance_m.append(cum_distance_m[-1] + seg)

    if total_distance_m <= 0:
        total_distance_m = cum_distance_m[-1] if cum_distance_m else 0.0

    cum_time_s: List[float] = []
    if total_distance_m > 0 and total_time_s > 0:
        for d in cum_distance_m:
            cum_time_s.append((d / total_distance_m) * total_time_s)
    else:
        cum_time_s = [0.0 for _ in cum_distance_m]

    steps_out: List[Dict[str, Any]] = []
    steps_in = (route.get("legs") or [{}])[0].get("steps") or []
    step_cursor = 0.0
    for idx, step in enumerate(steps_in):
        distance_m = float(step.get("distanceMeters") or 0.0)
        nav = step.get("navigationInstruction") or {}
        instruction = nav.get("instructions") or "Proceed"
        maneuver = nav.get("maneuver")
        maneuver = (str(maneuver).lower() if maneuver else "continue")
        if idx == 0:
            maneuver = "depart"
        steps_out.append(
            {
                "id": idx,
                "instruction": instruction,
                "street": instruction,
                "start_distance_m": step_cursor,
                "end_distance_m": step_cursor + distance_m,
                "maneuver": maneuver,
            }
        )
        step_cursor += distance_m

    return {
        "path_coordinates": path_coordinates,
        "cum_distance_m": cum_distance_m,
        "cum_time_s": cum_time_s,
        "total_distance_m": total_distance_m,
        "total_time_s": total_time_s,
        "steps": steps_out,
        "snapped_start": [start["lng"], start["lat"]],
        "snapped_end": [end["lng"], end["lat"]],
    }
