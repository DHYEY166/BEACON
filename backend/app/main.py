"""
main.py — James, Hours 2–20
FastAPI backend — development API and judge demo link only.
NOT the production system. On-device pipeline is the product.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import incidents, query, sms, transcribe
from app.services import rag as rag_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    rag_service.load_chunks()
    yield


app = FastAPI(
    title="BEACON API",
    description="Development API and judge demo link — not the production offline system.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(query.router)
app.include_router(incidents.router)
app.include_router(sms.router)
app.include_router(transcribe.router)


@app.get("/health")
async def health():
    ollama_model = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
    ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    return {
        "status": "ok",
        "model": ollama_model,
        "inference": "ollama",
        "ollama_host": ollama_host,
        "version": "0.1.0",
    }
