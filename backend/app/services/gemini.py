import os
import json
from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel
from typing import Optional, Any, Dict

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Initialize the modern client
client = genai.Client(api_key=API_KEY) if API_KEY else None


class ChatRequest(BaseModel):
    message: str
    context: str = "general"


async def get_ai_response(request: ChatRequest):
    if not client:
        return {"response": "[SIMULATION] No Gemini Key found."}

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=request.message,
            config={
                "system_instruction": "You are VitalPath AI, an EMS Triage Assistant. Be concise. Bullet points only."
            },
        )
        return {"response": response.text or ""}
    except Exception as e:
        return {"response": f"GEMINI ERROR: {str(e)}"}


# --- VitalPath: Cargo integrity & risk AI ---
class CargoIntegrityRequest(BaseModel):
    temperature_c: float
    shock_g: float
    lid_closed: bool
    battery_percent: float
    elapsed_time_s: float
    scenario_type: str = "ROUTINE"
    optional_notes: Optional[str] = None


class RiskEvaluateRequest(BaseModel):
    telemetry_summary: Dict[str, Any]
    eta_remaining_s: Optional[float] = None
    max_safe_elapsed_s: Optional[float] = None
    scenario_type: str = "ROUTINE"


def _derive_status(text: str, keys: tuple = ("critical", "high", "medium", "low")) -> str:
    t = (text or "").lower()
    for k in keys:
        if k in t:
            return k
    return "unknown"


async def get_cargo_integrity_response(req: CargoIntegrityRequest):
    """AI assessment of cargo (organ) integrity from current telemetry."""
    if not client:
        return {"response": "[SIMULATION] No Gemini Key found.", "integrity_status": "unknown"}

    prompt = (
        "Assess cargo (organ/critical medical) integrity for transport. "
        "Given: temperature %.1f°C, shock %.2fg, lid %s, battery %.0f%%, elapsed %.0f s, scenario %s. %s\n"
        "Reply in 2–4 short bullets: viability risk level (low/medium/high/critical), main concerns, and one recommended action."
    ) % (
        req.temperature_c,
        req.shock_g,
        "closed" if req.lid_closed else "OPEN",
        req.battery_percent,
        req.elapsed_time_s,
        req.scenario_type,
        f"Notes: {req.optional_notes}" if req.optional_notes else "",
    )
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "system_instruction": "You are VitalPath cargo integrity advisor. Cold-chain 2–8°C; minimal shock; lid must stay closed. Be concise.",
            },
        )
        text = (response.text or "").strip()
        status = _derive_status(text)
        return {"response": text, "integrity_status": status}
    except Exception as e:
        return {"response": f"GEMINI ERROR: {str(e)}", "integrity_status": "error"}


async def get_risk_evaluate_response(req: RiskEvaluateRequest):
    """AI real-time risk evaluation and recommendation from telemetry + ETA."""
    if not client:
        return {"response": "[SIMULATION] No Gemini Key found.", "risk_level": "unknown"}

    prompt = (
        "Real-time risk evaluation for organ/critical medical transport. "
        "Telemetry: %s. ETA remaining: %s s. Max safe elapsed: %s s. Scenario: %s. "
        "Reply in 2–4 bullets: overall risk (low/medium/high/critical), key factors, and one clear recommendation."
    ) % (
        json.dumps(req.telemetry_summary),
        str(req.eta_remaining_s) if req.eta_remaining_s is not None else "N/A",
        str(req.max_safe_elapsed_s) if req.max_safe_elapsed_s is not None else "N/A",
        req.scenario_type,
    )
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "system_instruction": "You are VitalPath risk advisor. Consider cold-chain, shock, lid, battery, and time windows. Be concise.",
            },
        )
        text = (response.text or "").strip()
        risk_level = _derive_status(text)
        return {"response": text, "risk_level": risk_level}
    except Exception as e:
        return {"response": f"GEMINI ERROR: {str(e)}", "risk_level": "error"}