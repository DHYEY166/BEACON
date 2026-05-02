"""
train_e2b.py — Raj, Hour 18 (starts after E4B checkpoint selected)
Same config as E4B, smaller model — trains faster, targets completion by Hour 22.
Mandatory: devices with <8GB RAM (Galaxy A14, $50 tablets) must not run untuned baseline.
"""
import train_e4b

# Only overrides — everything else inherited from train_e4b
train_e4b.MODEL_NAME = "google/gemma-4-e2b"
train_e4b.OUTPUT_DIR = "./checkpoints/beacon-e2b"

import wandb

def train():
    wandb.init(project="beacon-e2b", name="run-1")
    # Reuse train_e4b.train() logic with updated MODEL_NAME and OUTPUT_DIR
    train_e4b.train()

if __name__ == "__main__":
    from pathlib import Path
    if not Path(train_e4b.TRAINING_DATA).exists():
        print(f"[train_e2b] {train_e4b.TRAINING_DATA} not found — run format_data.py first")
        raise SystemExit(1)
    train()
