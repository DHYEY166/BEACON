"""
transcribe.py — Whisper STT endpoint for mobile voice input.
Accepts a WAV/M4A audio file, returns transcript text.
"""
import io
import os
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()


class TranscribeResponse(BaseModel):
    transcript: str
    language: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form(default="sw"),
):
    """
    Transcribe uploaded audio using OpenAI Whisper (local, offline).
    language: BCP-47 hint passed to Whisper (e.g. 'sw', 'en', 'hi').
    """
    try:
        import whisper  # type: ignore
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Whisper not installed. Run: pip install openai-whisper",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    suffix = ".m4a" if (audio.filename or "").endswith(".m4a") else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model_size = os.environ.get("WHISPER_MODEL", "base")
        model = whisper.load_model(model_size)
        result = model.transcribe(tmp_path, language=language if language != "auto" else None)
        transcript = result["text"].strip()
        detected_lang = result.get("language", language)
    finally:
        os.unlink(tmp_path)

    return TranscribeResponse(transcript=transcript, language=detected_lang)
