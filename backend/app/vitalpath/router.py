"""
VitalPath API: telemetry simulation, risk evaluation, mission logging, scenario-driven alerts.
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.telemetry import simulate_telemetry, TelemetryReading
from app.services.risk import evaluate_risk, RiskEvaluation
from app.services.mission_log import append_log, get_log, get_mission_ids, MissionLogRequest
from app.services.alerts import evaluate_alerts, Alert

router = APIRouter()


# --- Request/response models ---
class TelemetryResponse(BaseModel):
    mission_id: Optional[str] = None
    telemetry: TelemetryReading


class RiskResponse(BaseModel):
    evaluation: RiskEvaluation


class MissionLogResponse(BaseModel):
    mission_id: str
    entries: List[dict]


class AlertsResponse(BaseModel):
    alerts: List[Alert]


@router.get("/telemetry", response_model=TelemetryResponse)
async def get_telemetry(
    elapsed_s: float = Query(..., description="Elapsed time since mission start (seconds)"),
    mission_id: Optional[str] = Query(None),
    scenario_type: str = Query("ROUTINE", description="ROUTINE / ORGAN / CRITICAL / LID_BREACH etc."),
    seed: Optional[int] = Query(None),
):
    """Simulate telemetry at given elapsed time for cargo (temperature, shock, lid, battery)."""
    telemetry = simulate_telemetry(
        elapsed_time_s=elapsed_s,
        mission_id=mission_id,
        scenario_type=scenario_type,
        seed=seed,
    )
    return TelemetryResponse(mission_id=mission_id, telemetry=telemetry)


@router.get("/risk", response_model=RiskResponse)
async def get_risk(
    elapsed_s: float = Query(..., description="Elapsed time (seconds)"),
    eta_remaining_s: Optional[float] = Query(None),
    max_safe_elapsed_s: Optional[float] = Query(None, description="Cold-chain safe window in seconds"),
    scenario_type: str = Query("ROUTINE"),
    seed: Optional[int] = Query(None),
):
    """Real-time risk evaluation from simulated telemetry and optional ETA/window."""
    telemetry = simulate_telemetry(elapsed_s, scenario_type=scenario_type, seed=seed)
    evaluation = evaluate_risk(
        telemetry=telemetry,
        eta_remaining_s=eta_remaining_s,
        max_safe_elapsed_s=max_safe_elapsed_s,
        scenario_type=scenario_type,
    )
    return RiskResponse(evaluation=evaluation)


@router.post("/mission/log", response_model=dict)
async def post_mission_log(req: MissionLogRequest):
    """Append a mission log entry (route_start, telemetry_alert, arrival, etc.)."""
    append_log(req.mission_id, req.event_type, req.message, req.payload)
    return {"ok": True, "mission_id": req.mission_id}


@router.get("/mission/log", response_model=MissionLogResponse)
async def get_mission_log(
    mission_id: str = Query(..., description="Mission ID"),
    limit: int = Query(200, le=500),
):
    """Get mission log entries for a mission."""
    entries = get_log(mission_id, limit=limit)
    return MissionLogResponse(mission_id=mission_id, entries=entries)


@router.get("/mission/ids", response_model=List[str])
async def list_mission_ids():
    """List known mission IDs (for debugging/dashboards)."""
    return get_mission_ids()


@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts(
    elapsed_s: float = Query(..., description="Elapsed time (seconds)"),
    scenario_type: str = Query("ROUTINE"),
    eta_remaining_s: Optional[float] = Query(None),
    max_safe_elapsed_s: Optional[float] = Query(None),
    seed: Optional[int] = Query(None),
):
    """Scenario-driven alerts from current simulated telemetry and time window."""
    telemetry = simulate_telemetry(elapsed_s, scenario_type=scenario_type, seed=seed)
    alerts = evaluate_alerts(
        telemetry=telemetry,
        scenario_type=scenario_type,
        eta_remaining_s=eta_remaining_s,
        max_safe_elapsed_s=max_safe_elapsed_s,
    )
    return AlertsResponse(alerts=alerts)
