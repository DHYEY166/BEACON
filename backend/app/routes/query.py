"""routes/query.py — POST /query"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import inference as inference_service
from app.services import rag as rag_service

router = APIRouter()


class QueryRequest(BaseModel):
    transcript: str
    language: str = "en"
    context: Optional[str] = None
    image_b64: Optional[str] = None


@router.post("/query")
async def query(req: QueryRequest):
    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="transcript must not be empty")

    if req.image_b64:
        guidance = inference_service.generate(req.transcript, context="", image_b64=req.image_b64)
        guidance["source_type"] = "api_vision"
        return guidance

    if req.context:
        context = req.context
    else:
        rag_result = rag_service.retrieve(req.transcript)
        context = rag_result["context"]

    guidance = inference_service.generate(req.transcript, context)
    guidance["source_type"] = "api"
    return guidance
