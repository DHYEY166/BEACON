import os, json, re, threading, time, hashlib, asyncio
from json_repair import repair_json

import torch
from transformers import StoppingCriteria, StoppingCriteriaList, TextIteratorStreamer
import gradio as gr
from fastapi import Request as FastAPIRequest
from fastapi.responses import JSONResponse, StreamingResponse

HF_TOKEN = os.environ.get("HF_TOKEN")
BASE_MODEL = "google/gemma-4-E4B-it"
ADAPTER_REPO = "dhyey166/beacon-gemma4-e4b"

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

_tokenizer = None
_model = None
_lock = threading.Lock()
_cache: dict = {}
_CACHE_MAX = 60


class _JsonDoneCriteria(StoppingCriteria):
    """Stop generation when JSON closes OR <end_of_turn> is emitted."""
    def __init__(self, prompt_len: int, tokenizer):
        self._prompt_len = prompt_len
        self._tokenizer = tokenizer

    def __call__(self, input_ids, scores, **kwargs) -> bool:
        # Decode with special tokens visible so we can detect <end_of_turn>
        gen = self._tokenizer.decode(input_ids[0][self._prompt_len:], skip_special_tokens=False)
        if "<end_of_turn>" in gen:
            return True
        depth = 0
        for c in gen:
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth <= 0:
                    return True
        return False


def _load():
    global _tokenizer, _model
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import PeftModel

        print("Loading tokenizer...")
        _tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, token=HF_TOKEN)
        _tokenizer.pad_token = _tokenizer.eos_token

        # 4-bit NF4 matches the QLoRA training setup and fits in T4's 15 GB VRAM
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
        print("Loading base model in 4-bit on GPU...")
        base = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            quantization_config=bnb_config,
            device_map="auto",
            token=HF_TOKEN,
        )
        print("Applying PEFT adapter...")
        _model = PeftModel.from_pretrained(base, ADAPTER_REPO, token=HF_TOKEN)
        _model.eval()
        print("Model ready — T4 GPU, 4-bit inference.")


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


def _to_str(v) -> str:
    if isinstance(v, dict):
        return v.get("text") or v.get("step") or v.get("action") or json.dumps(v)
    return str(v) if v is not None else ""


def _to_str_list(v) -> list:
    if not isinstance(v, list):
        return []
    return [_to_str(i) for i in v if i]


def _build_out(parsed: dict) -> dict:
    if parsed.get("urgency") not in ("IMMEDIATE", "URGENT", "ROUTINE"):
        parsed["urgency"] = "URGENT"
    return {
        "urgency": str(parsed.get("urgency", "URGENT")),
        "situation_summary": _to_str(parsed.get("situation_summary", "")),
        "containment_check": _to_str(parsed["containment_check"]) if parsed.get("containment_check") else None,
        "immediate_actions": _to_str_list(parsed.get("immediate_actions")) or ["Follow standard first aid protocols"],
        "do_not": _to_str_list(parsed.get("do_not")),
        "escalate_if": _to_str_list(parsed.get("escalate_if")) or ["If condition worsens — seek medical team immediately"],
        "confidence": str(parsed.get("confidence", "MEDIUM")),
        "source": _to_str(parsed.get("source", "WHO SPHERE Handbook")),
        "source_type": "hf_space",
    }


def _run_predict(transcript: str, context: str = "") -> str:
    cache_key = hashlib.md5(transcript.strip().lower().encode()).hexdigest()
    if cache_key in _cache:
        print("[BEACON] cache hit")
        return _cache[cache_key]

    _load()  # no-op after first call — model stays in VRAM on T4

    ctx_trimmed = context[:600] if context else ""

    prompt = (
        f"<start_of_turn>system\n{SYSTEM_PROMPT}\n\n"
        f"RETRIEVED CONTEXT (from WHO/SPHERE protocols):\n{ctx_trimmed}\n\n"
        f"RESPONDER QUERY:\n{transcript}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )

    device = next(_model.parameters()).device
    inputs = _tokenizer(prompt, return_tensors="pt").to(device)
    prompt_len = inputs.input_ids.shape[1]

    with torch.no_grad():
        outputs = _model.generate(
            **inputs,
            max_new_tokens=900,
            do_sample=False,
            repetition_penalty=1.1,
            pad_token_id=_tokenizer.eos_token_id,
            stopping_criteria=StoppingCriteriaList([_JsonDoneCriteria(prompt_len, _tokenizer)]),
        )

    raw = _tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=False)
    torch.cuda.empty_cache()

    # Stop at end-of-turn token — strips hallucinated follow-up conversation
    raw = raw.split("<end_of_turn>")[0].strip()

    print(f"[BEACON raw]: {raw[:1000]}")

    json_match = re.search(r"\{[\s\S]*", raw)
    fragment = json_match.group(0) if json_match else raw

    parsed = None
    # Try repair_json first
    try:
        repaired = repair_json(fragment, return_objects=True)
        if isinstance(repaired, dict):
            parsed = repaired
    except Exception as e:
        print(f"[BEACON] repair_json error: {e}")

    # Fallback: manually extract known string fields via regex so truncation doesn't lose everything
    if not parsed:
        try:
            def _extract(key):
                m = re.search(rf'"{key}"\s*:\s*"([^"]*)"', fragment)
                return m.group(1) if m else None
            urgency = _extract("urgency")
            summary = _extract("situation_summary")
            if urgency and summary:
                parsed = {
                    "urgency": urgency,
                    "situation_summary": summary,
                    "containment_check": _extract("containment_check"),
                    "immediate_actions": re.findall(r'"([^"]{10,})"', fragment.split('"immediate_actions"')[-1].split(']')[0]) if '"immediate_actions"' in fragment else [],
                    "do_not": [],
                    "escalate_if": [],
                    "confidence": _extract("confidence") or "MEDIUM",
                    "source": _extract("source") or "WHO SPHERE Handbook",
                }
        except Exception as e:
            print(f"[BEACON] regex fallback error: {e}")

    if parsed and "urgency" in parsed and "situation_summary" in parsed:
        out = _build_out(parsed)
        result = json.dumps(out)
        if len(_cache) < _CACHE_MAX:
            _cache[cache_key] = result
        return result

    print(f"[BEACON] JSON repair failed. Raw: {raw[:400]}")
    return json.dumps(_fallback())


# No @spaces.GPU on T4 — dedicated GPU is always available
def predict(transcript: str, context: str = "") -> str:
    return _run_predict(transcript, context)


def beacon_infer(transcript: str, context: str = "") -> str:
    return _run_predict(transcript, context)


with gr.Blocks(title="BEACON — Emergency Field Guidance") as demo:
    gr.Markdown(
        "## BEACON\n"
        "**Emergency decision support for trained community first responders.**  \n"
        "Fine-tuned Gemma 4 E4B · WHO SPHERE Handbook · IMCI Protocols\n\n"
        "> Decision support only — not a replacement for clinical judgment."
    )
    transcript_input = gr.Textbox(
        label="Field Report",
        placeholder="Describe the situation — symptoms, patient count, location...",
        lines=4,
    )
    context_input = gr.Textbox(label="Context (optional)", visible=False, value="")
    btn = gr.Button("Get Guidance", variant="primary")
    output = gr.Code(label="BEACON Guidance (JSON)", language="json")

    btn.click(
        fn=predict,
        inputs=[transcript_input, context_input],
        outputs=output,
        api_name="predict",
    )

demo.launch(ssr_mode=False, prevent_thread_lock=True)

@demo.server_app.post("/api/predict")
async def api_predict_endpoint(request: FastAPIRequest):
    try:
        body = await request.json()
        transcript = body.get("transcript", "")
        context = body.get("context", "")
        result = beacon_infer(transcript, context)
        return JSONResponse(content=json.loads(result))
    except Exception as e:
        print(f"[/api/predict error]: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@demo.server_app.post("/api/stream")
async def api_stream_endpoint(request: FastAPIRequest):
    body = await request.json()
    transcript = body.get("transcript", "")
    context = body.get("context", "")

    # Cache hit — send full result immediately
    cache_key = hashlib.md5(transcript.strip().lower().encode()).hexdigest()
    if cache_key in _cache:
        cached = _cache[cache_key]
        async def _cached():
            yield f"data: {json.dumps({'done': True, 'result': json.loads(cached)})}\n\n"
        return StreamingResponse(_cached(), media_type="text/event-stream")

    _load()

    ctx_trimmed = context[:600] if context else ""
    prompt = (
        f"<start_of_turn>system\n{SYSTEM_PROMPT}\n\n"
        f"RETRIEVED CONTEXT (from WHO/SPHERE protocols):\n{ctx_trimmed}\n\n"
        f"RESPONDER QUERY:\n{transcript}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )
    device = next(_model.parameters()).device
    inputs = _tokenizer(prompt, return_tensors="pt").to(device)
    prompt_len = inputs.input_ids.shape[1]

    streamer = TextIteratorStreamer(_tokenizer, skip_prompt=True, skip_special_tokens=True, timeout=120)
    gen_kwargs = dict(
        **inputs,
        max_new_tokens=900,
        do_sample=False,
        repetition_penalty=1.1,
        pad_token_id=_tokenizer.eos_token_id,
        streamer=streamer,
        stopping_criteria=StoppingCriteriaList([_JsonDoneCriteria(prompt_len, _tokenizer)]),
    )
    threading.Thread(target=_model.generate, kwargs=gen_kwargs, daemon=True).start()

    async def _token_stream():
        full = ""
        try:
            for token in streamer:
                full += token
                yield f"data: {json.dumps({'token': token})}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Strip hallucinated follow-up turns, then parse
        full = full.split("<end_of_turn>")[0].strip()
        json_match = re.search(r"\{[\s\S]*", full)
        fragment = json_match.group(0) if json_match else full
        parsed = None
        try:
            repaired = repair_json(fragment, return_objects=True)
            if isinstance(repaired, dict):
                parsed = repaired
        except Exception:
            pass
        if not parsed:
            try:
                def _ex(k):
                    m = re.search(rf'"{k}"\s*:\s*"([^"]*)"', fragment)
                    return m.group(1) if m else None
                u, s = _ex("urgency"), _ex("situation_summary")
                if u and s:
                    parsed = {"urgency": u, "situation_summary": s,
                              "containment_check": _ex("containment_check"),
                              "immediate_actions": [], "do_not": [],
                              "escalate_if": [], "confidence": _ex("confidence") or "MEDIUM",
                              "source": _ex("source") or "WHO SPHERE Handbook"}
            except Exception:
                pass

        if parsed and "urgency" in parsed and "situation_summary" in parsed:
            out = _build_out(parsed)
            result_str = json.dumps(out)
            if len(_cache) < _CACHE_MAX:
                _cache[cache_key] = result_str
            yield f"data: {json.dumps({'done': True, 'result': out})}\n\n"
        else:
            yield f"data: {json.dumps({'done': True, 'result': _fallback()})}\n\n"

    return StreamingResponse(_token_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


print("[BEACON] /api/predict + /api/stream registered. Loading model at startup...")

# Load model once now — stays in VRAM for the lifetime of this Space instance
threading.Thread(target=_load, name="startup-load", daemon=True).start()

while True:
    time.sleep(60)
