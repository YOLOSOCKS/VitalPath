"""
VitalPath telemetry simulation: temperature, shock, lid, battery, elapsed time.
Designed for organ/critical medical transport cold-chain and container monitoring.
"""
import time
import random
from typing import Optional
from pydantic import BaseModel


class TelemetryReading(BaseModel):
    """Single telemetry snapshot for cargo container / transport unit."""
    temperature_c: float
    shock_g: float
    lid_closed: bool
    battery_percent: float
    elapsed_time_s: float
    timestamp_iso: Optional[str] = None


# Default cold-chain bounds (organ transport)
TEMP_MIN_C = 2.0
TEMP_MAX_C = 8.0
BATTERY_DRAIN_PER_HOUR = 8.0  # percent
SHOCK_BASELINE_G = 0.0
SHOCK_SPIKE_PROB = 0.02  # chance per sample of a small spike


def simulate_telemetry(
    elapsed_time_s: float,
    mission_id: Optional[str] = None,
    scenario_type: str = "ROUTINE",
    seed: Optional[int] = None,
) -> TelemetryReading:
    """
    Simulate telemetry at a given elapsed time (from mission start).
    - Temperature drifts within cold-chain range with minor noise.
    - Shock has rare spikes (potholes, braking).
    - Lid stays closed unless scenario injects breach.
    - Battery drains over time with small variance.
    """
    if seed is not None:
        rng = random.Random(seed + int(elapsed_time_s))
    else:
        rng = random.Random()

    # Temperature: nominal 4–6°C with drift and noise
    base_temp = 5.0
    drift = (elapsed_time_s / 3600.0) * 0.3  # slight warming over hours
    noise = rng.gauss(0, 0.2)
    temp = max(TEMP_MIN_C, min(TEMP_MAX_C, base_temp + drift + noise))

    # Shock: mostly 0, occasional small spikes
    shock = SHOCK_BASELINE_G
    if rng.random() < SHOCK_SPIKE_PROB:
        shock = round(rng.uniform(0.5, 2.5), 2)

    # Lid: closed unless scenario says "LID_BREACH"
    lid_closed = "LID_BREACH" not in (scenario_type or "").upper()

    # Battery: linear drain + noise
    hours = elapsed_time_s / 3600.0
    drain = hours * BATTERY_DRAIN_PER_HOUR
    noise_b = rng.gauss(0, 1.0)
    battery = max(0.0, min(100.0, 100.0 - drain + noise_b))

    return TelemetryReading(
        temperature_c=round(temp, 2),
        shock_g=shock,
        lid_closed=lid_closed,
        battery_percent=round(battery, 1),
        elapsed_time_s=round(elapsed_time_s, 1),
        timestamp_iso=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
