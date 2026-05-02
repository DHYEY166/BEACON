"""
services/rag.py — James, Hours 2–20
Cloud-side RAG using chunk_vectors.bin.
Same data source as on-device, different runtime (Python + numpy, no FAISS).
"""
import json
import os
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

CHUNK_DATA_PATH = os.environ.get("CHUNK_DATA_PATH", "data/outputs/chunk_metadata.json")
MODEL_NAME = "intfloat/multilingual-e5-small"

_model: SentenceTransformer | None = None
_chunk_matrix: np.ndarray | None = None
_chunks: list[dict] | None = None
_meta: dict | None = None

OUTBREAK_KEYWORDS = {"diarrhea", "diarrhoea", "vomiting", "water", "spread", "outbreak"}


def load_chunks() -> None:
    global _model, _chunk_matrix, _chunks, _meta
    path = Path(CHUNK_DATA_PATH)
    if not path.exists():
        raise FileNotFoundError(
            f"chunk_metadata.json not found at {path}. "
            "Run data/embed.py first and copy output to backend."
        )
    with open(path) as f:
        _meta = json.load(f)

    import base64
    raw = base64.b64decode(_meta["vectors_b64"])
    _chunk_matrix = np.frombuffer(raw, dtype=np.float32).reshape(_meta["n_chunks"], _meta["dim"])
    _chunks = _meta["chunks"]
    _model = SentenceTransformer(MODEL_NAME)
    print(f"[rag] Loaded {len(_chunks)} chunks, matrix shape {_chunk_matrix.shape}")


def retrieve(transcript: str, top_k: int = 5) -> dict:
    if _model is None or _chunk_matrix is None:
        raise RuntimeError("RAG not initialized — call load_chunks() at startup")

    query_vec = _model.encode([f"query: {transcript}"], normalize_embeddings=True)[0]
    scores = _chunk_matrix @ query_vec
    is_outbreak = any(kw in transcript.lower() for kw in OUTBREAK_KEYWORDS)

    # Always include priority chunks for outbreak queries
    priority_indices = [i for i, c in enumerate(_chunks) if c.get("tag") == "priority"]
    top_indices = list(np.argsort(scores)[-top_k:][::-1])

    if is_outbreak:
        final = list(dict.fromkeys(priority_indices + top_indices))[:top_k + len(priority_indices)]
    else:
        final = top_indices

    context = "\n\n---\n\n".join(_chunks[i]["text"] for i in final)
    return {"context": context, "is_outbreak": is_outbreak}
