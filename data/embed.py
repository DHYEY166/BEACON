"""
embed.py — Sofia, Hours 2–6
Computes L6 embeddings for all chunks on Colab (full model, no device constraint).
Outputs:
  - chunk_vectors.bin  (~7MB for ~4,400 chunks)
  - chunk_metadata.json (base64 vectors + text + tags — shipped as mobile asset)
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL_NAME = "intfloat/multilingual-e5-small"
OUTPUTS = Path("outputs")


def compute_and_save_embeddings(chunks: list[dict]) -> None:
    print(f"[embed] Loading {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # e5 models require "passage: " prefix on corpus texts (queries use "query: " at retrieval time)
    texts = [f"passage: {c['text']}" for c in chunks]
    print(f"[embed] Embedding {len(texts)} chunks...")
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True, batch_size=64)
    # shape: [N_chunks × 384], dtype float32

    OUTPUTS.mkdir(parents=True, exist_ok=True)

    # Binary file for backend Python RAG
    bin_path = OUTPUTS / "chunk_vectors.bin"
    embeddings.astype("float32").tofile(str(bin_path))
    print(f"[embed] chunk_vectors.bin: {bin_path.stat().st_size / 1e6:.1f} MB")

    # JSON asset for React Native
    vectors_b64 = base64.b64encode(embeddings.tobytes()).decode()
    metadata = {
        "n_chunks": len(chunks),
        "dim": 384,
        "vectors_b64": vectors_b64,
        "chunks": [{"text": c["text"], "tag": c["tag"], "id": c.get("id")} for c in chunks],
    }
    json_path = OUTPUTS / "chunk_metadata.json"
    with open(json_path, "w") as f:
        json.dump(metadata, f, ensure_ascii=False)
    print(f"[embed] chunk_metadata.json: {json_path.stat().st_size / 1e6:.1f} MB")

    # Sanity-check: verify ORT and containment chunks are top-1 for their queries
    _verify_priority_retrieval(model, embeddings, chunks)


def _verify_priority_retrieval(model, chunk_matrix: np.ndarray, chunks: list[dict]) -> None:
    test_queries = {
        "ORT_FORMULA": "how to make oral rehydration solution sugar salt water",
        "CONTAINMENT_CHECK": "how many people have same symptoms outbreak spread",
    }
    for expected_id, query in test_queries.items():
        q_vec = model.encode([query], normalize_embeddings=True)[0]
        scores = chunk_matrix @ q_vec
        top_idx = int(np.argmax(scores))
        top_chunk = chunks[top_idx]
        status = "✓" if top_chunk.get("id") == expected_id else "✗ MISMATCH"
        print(f"[embed] {status} '{expected_id}' top-1 for '{query[:50]}...' → id={top_chunk.get('id')}")


if __name__ == "__main__":
    chunks_path = Path("outputs/plain_language_chunks.jsonl")
    if not chunks_path.exists():
        print(f"[embed] {chunks_path} not found — run chunk.py first")
        sys.exit(1)

    chunks = []
    with open(chunks_path) as f:
        for line in f:
            chunks.append(json.loads(line))

    compute_and_save_embeddings(chunks)

    # Copy JSON to mobile assets
    mobile_assets = Path("../mobile/assets/chunk_metadata.json")
    mobile_assets.parent.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy(OUTPUTS / "chunk_metadata.json", mobile_assets)
    print(f"[embed] Copied chunk_metadata.json → {mobile_assets}")
