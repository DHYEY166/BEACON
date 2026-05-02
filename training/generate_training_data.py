"""
generate_training_data.py
Generates BEACON training pairs from actual corpus chunks using
Gemma 4 27B via HuggingFace Inference API.

Usage:
    export HF_TOKEN=hf_...
    python3 training/generate_training_data.py

Output: training/data/training_data.jsonl (700 pairs, same schema as before)
"""

import json
import os
import random
import time
from pathlib import Path
from openai import OpenAI

HF_TOKEN = os.environ.get("HF_TOKEN")
MODEL    = "google/gemma-4-26B-A4B-it"
TARGET   = 700
BASE_CAP = 350   # stop collecting base pairs once we hit this (augment the rest)

SYSTEM_PROMPT = """You are a medical training data generator for BEACON — an AI emergency guidance system for community first responders in low-resource settings.

Given a protocol chunk from a humanitarian health document, generate realistic field emergency scenarios a community health worker might face, along with structured guidance responses.

Each response MUST be valid JSON matching this schema exactly:
{
  "urgency": "IMMEDIATE" | "URGENT" | "ROUTINE",
  "situation_summary": "<one sentence clinical description — never name specific diseases, describe symptoms instead>",
  "containment_check": "<question to ask about spread to nearby people, or null for trauma cases>",
  "immediate_actions": ["<specific actionable step>", ...],
  "do_not": ["<specific thing to avoid>", ...],
  "escalate_if": ["<warning sign requiring referral>", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "source": "<document name and section from the chunk>"
}

Rules:
- Never name specific diseases in situation_summary (write "severe diarrhea" not "cholera")
- Instructions must be realistic field situations, written as a responder would describe them
- Include at least one non-English instruction per batch (Swahili, Hindi, French, Arabic, or Hausa)
- Actions must be specific and measurable, not vague
- immediate_actions must have at least 3 items
- do_not must have at least 2 items
- escalate_if must have at least 2 items
- Return ONLY a valid JSON array of objects: [{"instruction": "...", "output": { ... }}, ...]
- Do not include any explanation, markdown, or text outside the JSON array"""

INSTRUCTION_PREFIXES = [
    "",
    "URGENT: ",
    "Please help. ",
    "Field situation: ",
    "Need guidance now. ",
    "Emergency: ",
    "Responder query: ",
]


def load_chunks(path: Path) -> list[dict]:
    chunks = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                chunks.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return chunks


def generate_pairs(client: OpenAI, chunk: dict, n: int = 2) -> list[dict]:
    text   = chunk.get("text", "").strip()
    source = chunk.get("id", "WHO/SPHERE")
    if not text:
        return []

    user_prompt = (
        f"Protocol chunk (source: {source}):\n"
        f"---\n{text[:1800]}\n---\n\n"
        f"Generate {n} realistic field emergency scenarios based strictly on this protocol. "
        f"Return ONLY the JSON array."
    )

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "user", "content": SYSTEM_PROMPT + "\n\n" + user_prompt},
            ],
            max_tokens=2048,
            temperature=0.75,
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()

        # handle response that starts before the array
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start == -1 or end == 0:
            return []
        raw = raw[start:end]

        pairs = json.loads(raw)
        validated = []
        for pair in pairs:
            if _validate(pair):
                pair["output"] = json.dumps(pair["output"])
                validated.append(pair)
        return validated

    except Exception as e:
        print(f"    Error: {e}")
        return []


def _validate(pair: dict) -> bool:
    if not isinstance(pair.get("instruction"), str):
        return False
    if len(pair["instruction"].strip()) < 10:
        return False

    out = pair.get("output", {})
    if isinstance(out, str):
        try:
            out = json.loads(out)
        except Exception:
            return False

    required = ["urgency", "situation_summary", "immediate_actions", "do_not", "escalate_if"]
    if not all(f in out for f in required):
        return False
    if out["urgency"] not in ("IMMEDIATE", "URGENT", "ROUTINE"):
        return False
    if not isinstance(out["immediate_actions"], list) or len(out["immediate_actions"]) < 1:
        return False
    if not isinstance(out["do_not"], list) or len(out["do_not"]) < 1:
        return False
    if not isinstance(out["escalate_if"], list) or len(out["escalate_if"]) < 1:
        return False

    pair["output"] = out
    return True


def augment(pairs: list[dict], target: int) -> list[dict]:
    result = list(pairs)
    while len(result) < target:
        base   = random.choice(pairs)
        prefix = random.choice(INSTRUCTION_PREFIXES[1:])
        aug    = dict(base)
        aug["instruction"] = prefix + base["instruction"]
        result.append(aug)
    return result[:target]


if __name__ == "__main__":
    if not HF_TOKEN:
        raise EnvironmentError(
            "HF_TOKEN not set. Run: export HF_TOKEN=hf_..."
        )

    client = OpenAI(
        base_url="https://router.huggingface.co/v1",
        api_key=HF_TOKEN,
    )

    chunks_path = Path("data/outputs/plain_language_chunks.jsonl")
    if not chunks_path.exists():
        raise FileNotFoundError(f"Chunks file not found: {chunks_path}")

    chunks = load_chunks(chunks_path)
    random.shuffle(chunks)
    print(f"Loaded {len(chunks)} chunks from corpus.")

    all_pairs: list[dict] = []

    for i, chunk in enumerate(chunks):
        print(f"[{i+1}/{len(chunks)}] {chunk.get('id', '?')} ...", end=" ", flush=True)
        pairs = generate_pairs(client, chunk, n=2)
        all_pairs.extend(pairs)
        print(f"{len(pairs)} pairs (total: {len(all_pairs)})")
        time.sleep(1.2)  # stay within HF rate limits

        if len(all_pairs) >= BASE_CAP:
            print(f"\nReached {BASE_CAP} base pairs. Stopping collection.")
            break

    if len(all_pairs) < 10:
        raise RuntimeError(
            "Too few pairs generated. Check your HF_TOKEN and that you have "
            "access to google/gemma-4-27b-it on HuggingFace."
        )

    print(f"\nBase pairs: {len(all_pairs)} — augmenting to {TARGET}...")
    all_pairs = augment(all_pairs, TARGET)
    random.shuffle(all_pairs)

    out_path = Path("training/data/training_data.jsonl")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        for p in all_pairs:
            f.write(json.dumps(p) + "\n")

    print(f"Wrote {len(all_pairs)} pairs to {out_path}")

    # Sanity check
    issues = 0
    bad_terms = ["cholera", "typhoid", "malaria", "ebola", "dysentery", "measles"]
    for p in all_pairs:
        out = json.loads(p["output"]) if isinstance(p["output"], str) else p["output"]
        summary = out.get("situation_summary", "").lower()
        for term in bad_terms:
            if term in summary:
                print(f"  WARN: disease name '{term}' in situation_summary")
                issues += 1
        if out.get("urgency") not in ("IMMEDIATE", "URGENT", "ROUTINE"):
            print(f"  WARN: invalid urgency in pair: {p['instruction'][:50]}")
            issues += 1

    if issues == 0:
        print("All sanity checks passed.")
    else:
        print(f"{issues} sanity warnings — review before training.")
