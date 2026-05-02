"""
train_e4b.py — Priya + Raj, Hour 6
QLoRA fine-tune of Gemma 4 E4B on reviewed BEACON training data.
Run on Google Colab Pro (A100).
"""
import json
import os
from pathlib import Path

import torch
import wandb
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainingArguments
from trl import SFTTrainer

# ── Config ────────────────────────────────────────────────────────────────────

MODEL_NAME = "google/gemma-4-e4b"
OUTPUT_DIR = "./checkpoints/beacon-e4b"
TRAINING_DATA = "training/data/training_data.jsonl"

QLORA_CONFIG = {
    "r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.1,
    "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"],
    "bias": "none",
}

TRAINING_ARGS = {
    "num_train_epochs": 3,
    "learning_rate": 2e-4,
    "per_device_train_batch_size": 4,
    "gradient_accumulation_steps": 4,
    "warmup_ratio": 0.03,
    "lr_scheduler_type": "cosine",
    "max_seq_length": 512,
    "logging_steps": 10,
    "save_steps": 100,
    "bf16": True,
    "report_to": "wandb",
}

BEACON_SYSTEM_PROMPT = (
    "You are BEACON, a decision support tool for trained community first responders. "
    "You provide structured emergency guidance based on WHO SPHERE Handbook and IMCI protocols. "
    "Always respond with valid JSON matching the exact schema in your instructions. "
    "Never name a disease in situation_summary. "
    "Always include containment_check when the query mentions multiple affected people, "
    "shared water source, or outbreak indicators."
)

# ── Formatting ────────────────────────────────────────────────────────────────

def formatting_func(example: dict) -> str:
    return (
        "<start_of_turn>system\n"
        f"{BEACON_SYSTEM_PROMPT}"
        "<end_of_turn>\n"
        "<start_of_turn>user\n"
        f"{example['instruction']}"
        "<end_of_turn>\n"
        "<start_of_turn>model\n"
        f"{example['output']}"
        "<end_of_turn>"
    )

# ── Data loading ──────────────────────────────────────────────────────────────

def load_dataset(path: str) -> Dataset:
    records = []
    with open(path) as f:
        for line in f:
            records.append(json.loads(line))
    print(f"[train_e4b] Loaded {len(records)} training pairs from {path}")
    return Dataset.from_list(records)

# ── Training ──────────────────────────────────────────────────────────────────

def train():
    wandb.init(project="beacon-e4b", name="run-1")

    # BitsAndBytes 4-bit config
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
    )
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(**QLORA_CONFIG, task_type="CAUSAL_LM")
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    dataset = load_dataset(TRAINING_DATA)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        **{k: v for k, v in TRAINING_ARGS.items() if k != "max_seq_length"},
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        formatting_func=formatting_func,
        max_seq_length=TRAINING_ARGS["max_seq_length"],
        args=training_args,
        tokenizer=tokenizer,
    )

    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"[train_e4b] Saved checkpoint → {OUTPUT_DIR}")
    wandb.finish()


if __name__ == "__main__":
    if not Path(TRAINING_DATA).exists():
        print(f"[train_e4b] {TRAINING_DATA} not found — run format_data.py first")
        raise SystemExit(1)
    train()
