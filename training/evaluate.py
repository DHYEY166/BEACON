"""
evaluate.py — Marcus, Hours 5–6 + 10 + 16 + 22
206-scenario evaluation harness.
Nour delivers eval_labels.jsonl by Hour 5.
Run at hours 10, 16, 22 against each fine-tuning checkpoint.
"""
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import wandb

EVAL_LABELS_PATH = "training/data/eval_labels.jsonl"

# ── Disease name denylist ─────────────────────────────────────────────────────
# Defined before evaluate_model — must be in scope during the evaluation loop.

DISEASE_NAMES = {
    "cholera", "typhoid", "typhus", "malaria", "measles",
    "ebola", "dysentery", "covid", "dengue", "hepatitis",
    "meningitis", "tuberculosis", "tb", "polio",
}

def contains_disease_name(text: str) -> bool:
    t = text.lower()
    return any(name in t for name in DISEASE_NAMES)

# ── Scenario dataclass ────────────────────────────────────────────────────────

@dataclass
class EvalScenario:
    id: str
    input: str
    language: str
    scenario_type: str       # triage|outbreak|trauma|pediatric|resource|multi|flood
    patient_age: str         # adult|pediatric
    patient_gender: str      # male|female
    geography: str           # flood_camp|earthquake_zone|drought|urban_outbreak
    expected_urgency: str    # IMMEDIATE|URGENT|ROUTINE
    expected_actions_keywords: list[str]   # at least 2 must appear in output
    must_contain_containment: bool         # True for outbreak scenarios
    must_not_contain_disease_name: bool = True  # always True

# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate_model(model_fn: Callable[[str, str], str], scenarios: list[EvalScenario]) -> dict:
    results = {
        "total": 0, "pass": 0,
        "by_type": {}, "by_language": {},
        "failures": [],
    }

    for scenario in scenarios:
        output_str = model_fn(scenario.input, scenario.language)

        try:
            output = json.loads(output_str)
        except json.JSONDecodeError:
            results["total"] += 1
            results["failures"].append({"id": scenario.id, "reason": "json_parse_failure", "output": output_str[:200]})
            continue

        checks = {
            "urgency": output.get("urgency") == scenario.expected_urgency,
            "keywords": all(kw.lower() in output_str.lower() for kw in scenario.expected_actions_keywords),
            "containment": not scenario.must_contain_containment or "containment_check" in output,
            "no_disease": not scenario.must_not_contain_disease_name or not contains_disease_name(output_str),
        }
        passed = all(checks.values())

        results["total"] += 1
        if passed:
            results["pass"] += 1
        else:
            failed_checks = [k for k, v in checks.items() if not v]
            results["failures"].append({"id": scenario.id, "failed_checks": failed_checks, "urgency_got": output.get("urgency"), "urgency_expected": scenario.expected_urgency})

        t, l = scenario.scenario_type, scenario.language
        results["by_type"].setdefault(t, {"pass": 0, "total": 0})
        results["by_language"].setdefault(l, {"pass": 0, "total": 0})
        results["by_type"][t]["total"] += 1
        results["by_language"][l]["total"] += 1
        if passed:
            results["by_type"][t]["pass"] += 1
            results["by_language"][l]["pass"] += 1

    results["overall_accuracy"] = results["pass"] / results["total"] if results["total"] > 0 else 0.0
    return results


def load_scenarios(path: str = EVAL_LABELS_PATH) -> list[EvalScenario]:
    scenarios = []
    with open(path) as f:
        for line in f:
            d = json.loads(line)
            scenarios.append(EvalScenario(**d))
    print(f"[evaluate] Loaded {len(scenarios)} scenarios from {path}")
    return scenarios


def print_report(results: dict, run_name: str = "eval") -> None:
    acc = results["overall_accuracy"]
    print(f"\n{'='*50}")
    print(f"  {run_name}  |  Overall: {acc:.1%}  ({results['pass']}/{results['total']})")
    print(f"{'='*50}")
    print("\nBy scenario type:")
    for t, r in sorted(results["by_type"].items()):
        pct = r["pass"] / r["total"] if r["total"] > 0 else 0
        bar = "█" * int(pct * 20) + "░" * (20 - int(pct * 20))
        print(f"  {t:<20} {bar} {pct:.1%}  ({r['pass']}/{r['total']})")
    print("\nBy language:")
    for l, r in sorted(results["by_language"].items()):
        pct = r["pass"] / r["total"] if r["total"] > 0 else 0
        print(f"  {l:<10} {pct:.1%}  ({r['pass']}/{r['total']})")
    if results["failures"]:
        print(f"\nFirst 5 failures:")
        for f in results["failures"][:5]:
            print(f"  {f}")
    print()


def log_to_wandb(results: dict, run_name: str, checkpoint: str) -> None:
    wandb.init(project="beacon-eval", name=run_name, reinit=True)
    wandb.log({
        "overall_accuracy": results["overall_accuracy"],
        "checkpoint": checkpoint,
        **{f"type/{t}": r["pass"]/r["total"] for t, r in results["by_type"].items() if r["total"] > 0},
        **{f"lang/{l}": r["pass"]/r["total"] for l, r in results["by_language"].items() if r["total"] > 0},
    })
    wandb.finish()


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, help="Path to fine-tuned checkpoint or HF model ID")
    parser.add_argument("--run-name", default="eval", help="W&B run name")
    parser.add_argument("--labels", default=EVAL_LABELS_PATH)
    args = parser.parse_args()

    if not Path(args.labels).exists():
        print(f"[evaluate] {args.labels} not found — Nour must deliver eval_labels.jsonl by Hour 5")
        sys.exit(1)

    print(f"[evaluate] Loading model from {args.checkpoint}...")
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint)
    model = AutoModelForCausalLM.from_pretrained(args.checkpoint, device_map="auto")
    pipe = pipeline("text-generation", model=model, tokenizer=tokenizer, max_new_tokens=600)

    SYSTEM = (
        "You are BEACON, a decision support tool for trained community first responders. "
        "Always respond with valid JSON."
    )

    def model_fn(transcript: str, language: str) -> str:
        prompt = f"<start_of_turn>system\n{SYSTEM}<end_of_turn>\n<start_of_turn>user\n{transcript}<end_of_turn>\n<start_of_turn>model\n"
        out = pipe(prompt, do_sample=False, temperature=0.1)[0]["generated_text"]
        # Extract only the model's response
        return out.split("<start_of_turn>model\n")[-1].split("<end_of_turn>")[0].strip()

    scenarios = load_scenarios(args.labels)
    results = evaluate_model(model_fn, scenarios)
    print_report(results, args.run_name)
    log_to_wandb(results, args.run_name, args.checkpoint)
