"""
chunk.py — Sofia, Hours 2–6
80-word chunking with 12-word overlap.
L6 max_seq_length = 128 tokens. At ~1.3 tokens/word, 80 words ≈ 104 tokens — safely under limit.
400-word chunks (520 tokens) would silently truncate to 25% of content during embedding.
"""
import json
from pathlib import Path

CHUNK_SIZE = 80    # words
OVERLAP = 12       # words
STEP = CHUNK_SIZE - OVERLAP  # 68

PRIORITY_CHUNKS = [
    {
        "text": (
            "Oral rehydration: 1 litre boiled or treated water + "
            "6 level teaspoons sugar + half level teaspoon salt."
        ),
        "tag": "priority",
        "id": "ORT_FORMULA",
    },
    {
        "text": (
            "For any outbreak: first ask how many others nearby "
            "have the same symptoms and whether they share a water source."
        ),
        "tag": "priority",
        "id": "CONTAINMENT_CHECK",
    },
]


def _infer_tag(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["child", "infant", "newborn", "pediatric", "under 5"]):
        return "pediatric"
    if any(w in t for w in ["diarrhea", "diarrhoea", "vomiting", "outbreak", "spread", "containment"]):
        return "outbreak"
    if any(w in t for w in ["bleeding", "fracture", "wound", "burn", "crush", "trauma"]):
        return "trauma"
    if any(w in t for w in ["flood", "hypothermia", "contaminated", "evacuation", "exposure"]):
        return "flood"
    if any(w in t for w in ["supply", "stock", "resource", "count", "allocation"]):
        return "resource"
    if any(w in t for w in ["sms", "report", "communicate", "notify"]):
        return "communication"
    return "triage"


def chunk_text_into_segments(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[dict]:
    words = text.split()
    step = max(1, chunk_size - overlap)
    segments = []
    i = 0
    while i < len(words):
        segment_words = words[i : i + chunk_size]
        segment_text = " ".join(segment_words)
        segments.append({"text": segment_text, "tag": _infer_tag(segment_text), "id": None})
        i += step
    return segments


def chunk_document(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[dict]:
    return PRIORITY_CHUNKS + chunk_text_into_segments(text, chunk_size, overlap)


def chunk_all_documents(documents: list[dict]) -> list[dict]:
    all_chunks = list(PRIORITY_CHUNKS)  # always first
    seen_ids = {c["id"] for c in PRIORITY_CHUNKS}

    for doc in documents:
        segments = chunk_text_into_segments(doc["text"])
        for seg in segments:
            all_chunks.append(seg)

    print(f"[chunk] {len(all_chunks)} total chunks ({len(PRIORITY_CHUNKS)} priority + {len(all_chunks) - len(PRIORITY_CHUNKS)} content)")
    return all_chunks


if __name__ == "__main__":
    import sys

    ingested_path = Path("outputs/ingested_documents.jsonl")
    if not ingested_path.exists():
        print(f"[chunk] {ingested_path} not found — run ingest.py first")
        sys.exit(1)

    documents = []
    with open(ingested_path) as f:
        for line in f:
            documents.append(json.loads(line))

    chunks = chunk_all_documents(documents)

    out = Path("outputs/plain_language_chunks.jsonl")
    with open(out, "w") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk) + "\n")
    print(f"[chunk] Wrote {len(chunks)} chunks → {out}")
