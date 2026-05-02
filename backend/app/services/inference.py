"""
services/inference.py
Gemma 4 inference via Ollama (gemma4:e4b running locally).
Supports text queries and multimodal image queries.
"""
import json
import os
import re
from typing import Optional

import httpx

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT", "120"))

SYSTEM_PROMPT = (
    "You are BEACON, a decision support tool for trained community first responders.\n"
    "You provide structured emergency guidance based on WHO SPHERE Handbook and IMCI protocols.\n\n"
    "STRICT RULES — never break these:\n"
    "1. situation_summary must describe symptoms only — never name a disease\n"
    "2. Include containment_check whenever the query mentions multiple affected people, "
    "shared water source, or outbreak indicators\n"
    '3. ORT formula if applicable: use exactly — "1 litre boiled or treated water + '
    '6 level teaspoons sugar + half level teaspoon salt"\n'
    "4. Always populate the source field with a specific WHO SPHERE or IMCI section\n"
    "5. Set confidence = LOW if the query is ambiguous, out of scope, or lacks critical information\n"
    "6. If out of scope: urgency = ROUTINE, immediate_actions = "
    '["This is outside BEACON\'s scope. Seek a trained medical professional."]\n\n'
    "OUTPUT — always valid JSON matching this exact schema, nothing else:\n"
    '{"urgency":"IMMEDIATE|URGENT|ROUTINE","situation_summary":"Symptoms consistent with ...",'
    '"containment_check":"Ask: ...","immediate_actions":["..."],"do_not":["..."],'
    '"escalate_if":["..."],"confidence":"HIGH|MEDIUM|LOW","source":"WHO SPHERE Handbook §X.X"}'
)

IMAGE_PREFIX = (
    "Analyze this field image. Describe visible injuries, symptoms, or hazards. "
    "Then provide emergency guidance.\n\n"
)


def generate(transcript: str, context: str, image_b64: Optional[str] = None) -> dict:
    if image_b64:
        prompt = (
            f"<start_of_turn>system\n{SYSTEM_PROMPT}<end_of_turn>\n"
            f"<start_of_turn>user\n{IMAGE_PREFIX}{transcript}<end_of_turn>\n"
            "<start_of_turn>model\n"
        )
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
        }
    else:
        prompt = (
            f"<start_of_turn>system\n{SYSTEM_PROMPT}\n\n"
            f"RETRIEVED CONTEXT (from WHO/SPHERE protocols):\n{context}\n\n"
            f"RESPONDER QUERY:\n{transcript}<end_of_turn>\n"
            "<start_of_turn>model\n"
        )
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }

    try:
        resp = httpx.post(
            f"{OLLAMA_HOST}/api/generate",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "")
    except Exception as exc:
        print(f"[inference] Ollama error: {exc}")
        return _fallback()

    return _validate_and_parse(raw)


def _validate_and_parse(raw: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return _fallback()
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return _fallback()

    required = ["urgency", "situation_summary", "immediate_actions", "do_not", "escalate_if", "confidence", "source"]
    if not all(f in parsed for f in required):
        return _fallback()
    return parsed


def _fallback() -> dict:
    return {
        "urgency": "ROUTINE",
        "situation_summary": "Unable to parse guidance. Please repeat your query clearly.",
        "immediate_actions": ["Repeat your description clearly"],
        "do_not": [],
        "escalate_if": ["If situation is serious — seek medical team immediately"],
        "confidence": "LOW",
        "source": "BEACON system",
    }
