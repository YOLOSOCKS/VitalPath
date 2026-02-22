import os
import requests
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
# Rachel - American female voice, urgent/expressive delivery
VOICE_ID = "21m00Tcm4TlvDq8ikWAM" 

def generate_voice_stream(text: str):
    """
    Sends text to ElevenLabs and returns the audio binary.
    """
    if not ELEVENLABS_API_KEY:
        return None

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    
    data = {
        "text": text,
        "model_id": "eleven_multilingual_v2", # Optimized for speed and free-tier compatible
        "voice_settings": {
            "stability": 0.3,
            "similarity_boost": 0.6
        }
    }

    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        return response.content
    return None