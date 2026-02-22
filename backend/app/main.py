from fastapi import FastAPI
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from app.algorithm import google_router as algo_router
from app.vitalpath import router as vitalpath_router
from app.services.gemini import (
    get_ai_response,
    get_cargo_integrity_response,
    get_risk_evaluate_response,
    ChatRequest,
    CargoIntegrityRequest,
    RiskEvaluateRequest,
)
from fastapi.responses import Response
from app.services.voice import generate_voice_stream

load_dotenv()


app = FastAPI(
    title="VitalPath AI API",
    description="Backend for VitalPath AI - Organ & critical medical transport. Routing, telemetry, AI cargo integrity, risk, mission logging, alerts.",
    version="0.2.0",
)

# CORS: allow common dev server ports (Vite + legacy)
# If you're using the Vite proxy (/api -> backend), CORS usually doesn't matter,
# but this keeps things working if you hit the backend directly.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",   # vite preview
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Algorithm (routing) and VitalPath (telemetry, risk, mission, alerts)
app.include_router(algo_router.router, prefix="/api/algo", tags=["algorithm"])
app.include_router(vitalpath_router.router, prefix="/api/vitalpath", tags=["vitalpath"])

@app.get("/")
def read_root():
    return {"system": "VitalPath AI", "status": "operational", "ai_link": "active"}

@app.post("/api/ai/chat")
async def chat_endpoint(req: ChatRequest):
    return await get_ai_response(req)

@app.post("/api/ai/speak")
async def speak_ai_response(req: ChatRequest):
    audio_content = generate_voice_stream(req.message)
    if audio_content:
        return Response(content=audio_content, media_type="audio/mpeg")
    return {"error": "Voice generation failed"}


# VitalPath AI: cargo integrity and risk evaluation
@app.post("/api/ai/cargo-integrity")
async def cargo_integrity_endpoint(req: CargoIntegrityRequest):
    return await get_cargo_integrity_response(req)


@app.post("/api/ai/risk-evaluate")
async def risk_evaluate_endpoint(req: RiskEvaluateRequest):
    return await get_risk_evaluate_response(req)