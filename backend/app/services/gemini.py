import os
from dotenv import load_dotenv
from google import genai # <--- NEW SDK
from pydantic import BaseModel

load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

# Initialize the modern client
client = genai.Client(api_key=API_KEY) if API_KEY else None

class ChatRequest(BaseModel):
    message: str
    context: str = "general"

async def get_ai_response(request: ChatRequest):
    if not client:
        return {"response": "[SIMULATION] No Gemini Key found."}

    try:
        # Using the modern SDK syntax
        response = client.models.generate_content(
            model='gemini-2.5-flash', # Upgrade to 2.0 while we are at it!
            contents=request.message,
            config={
                'system_instruction': "You are VitalPath AI, an EMS Triage Assistant. Be concise. Bullet points only."
            }
        )
        return {"response": response.text}
    except Exception as e:
        return {"response": f"GEMINI ERROR: {str(e)}"}