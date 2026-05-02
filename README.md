# BEACON

**AI-powered emergency decision support for community first responders.**

BEACON puts WHO/SPHERE/IMCI emergency protocols in the hands of frontline responders — via voice, photo, or text — in 6 languages, with spoken guidance. Fine-tuned Gemma 4 E4B, offline-capable RAG, zero clinical jargon.

**Live demo:** https://web-ten-delta-62.vercel.app  
**Model:** https://huggingface.co/dhyey166/beacon-gemma4-e4b

---

## What it does

A responder in the field describes a situation — by typing, speaking, or photographing — and BEACON returns:

- **Urgency level** (IMMEDIATE / URGENT / ROUTINE)
- **Immediate actions** — step-by-step, plain language
- **Do not** — common dangerous mistakes to avoid
- **Escalate if** — signs that require referral
- **Spoken audio guidance** — auto-read aloud so hands stay free

All output is auto-translated and spoken in the responder's language.

---

## Languages

English · Swahili · Hindi · French · Arabic · Hausa

Language is auto-detected from input. UI labels, guidance, and audio all shift to match.

---

## Architecture

```
beacon/
├── data/           Corpus ingestion, chunking, BM25 embedding pipeline
├── training/       Gemma 4 E4B QLoRA fine-tuning (Colab A100)
├── backend/        FastAPI inference server + RAG (Docker)
├── hf_space/       HuggingFace Space deployment (public API)
├── mobile/         React Native app — on-device offline RAG
└── web/            Next.js web app — deployed on Vercel
```

---

## Model

**Base:** Gemma 4 E4B (gemma-4-e4b-it)  
**Method:** QLoRA fine-tuning via Unsloth + TRL (SFTTrainer)  
**Hardware:** Colab A100  
**Dataset:** 700 instruction pairs generated from WHO/SPHERE, IMCI, Red Cross, UNHCR field manuals  
**Final loss:** 0.018  
**Published:** https://huggingface.co/dhyey166/beacon-gemma4-e4b

---

## Data Pipeline

Source documents (all public domain / open license):
- WHO/SPHERE Humanitarian Standards Handbook (2018)
- IMCI Emergency Protocols
- Red Cross First Aid Manual
- UNHCR Field Operations Guide

Pipeline: `ingest.py` → `chunk.py` → `embed.py` → BM25 index

```bash
cd data
pip install -r requirements.txt
python ingest.py
python chunk.py
python embed.py
```

Outputs land in `data/outputs/` and are copied to `mobile/assets/` and `backend/data/outputs/`.

---

## Training

```bash
cd training
pip install -r requirements.txt
python generate_training_data.py   # generates training_data.jsonl
python format_data.py              # formats for SFTTrainer
python train_e4b.py                # QLoRA fine-tune on Colab A100
python evaluate.py                 # benchmark against base model
```

The Colab notebook (`BEACON_Finetune_Colab.ipynb`) is self-contained and reproducible.

---

## Backend

FastAPI server wrapping the fine-tuned model via Ollama + RAG retrieval.

```bash
cd backend
cp .env.example .env   # set OLLAMA_HOST, OLLAMA_MODEL
docker-compose up
```

API runs on `http://localhost:8000` locally. In production, deployed on HuggingFace Spaces with T4 Small GPU hardware.

---

## Web App

Next.js app with voice input, photo triage, streaming guidance, and TTS audio.

```bash
cd web
npm install
echo "NEXT_PUBLIC_OPENAI_KEY=your_key_here" > .env.local
npm run dev
```

Deployed at: https://web-ten-delta-62.vercel.app

**Input modes:**
- Type a description
- Speak (browser Speech Recognition, language-selectable)
- Upload a photo (GPT-4o vision describes the medical scene)

---

## Mobile App

React Native (Expo) app with fully on-device RAG — no internet required after initial setup.

```bash
cd mobile
npm install
npx expo run:ios   # requires Xcode
```

On-device pipeline: BM25 retrieval from `assets/chunk_metadata.json` → Gemma 4 E4B inference via the backend API.

---

## Evaluation Criteria Alignment

| Criterion | How BEACON addresses it |
|---|---|
| Health & Sciences | WHO/IMCI protocol grounding, urgency triage, do-not guidance |
| Global Resilience | Offline-capable mobile app, works without clinic or data center |
| Digital Equity | 6 languages, auto-detected, voice-first for low-literacy contexts |
| Gemma 4 usage | Fine-tuned E4B (edge model), on-device inference, multimodal input |

