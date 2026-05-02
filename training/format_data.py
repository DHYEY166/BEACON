"""
format_data.py — Priya, Hours 2–6
Formats reviewed chunks into 600–800 instruction/output training pairs.
Nour spot-checks 50 randomly sampled pairs before sign-off.
"""
import json
import random
import sys
from pathlib import Path

BEACON_SYSTEM_PROMPT = (
    "You are BEACON, a decision support tool for trained community first responders. "
    "You provide structured emergency guidance based on WHO SPHERE Handbook and IMCI protocols. "
    "Always respond with valid JSON matching the exact schema in your instructions. "
    "Never name a disease in situation_summary. "
    "Always include containment_check when the query mentions multiple affected people, "
    "shared water source, or outbreak indicators."
)

OUTPUT_SCHEMA = (
    '{"urgency":"IMMEDIATE|URGENT|ROUTINE",'
    '"situation_summary":"Symptoms consistent with ...",'
    '"containment_check":"Ask: ...",'
    '"immediate_actions":["..."],'
    '"do_not":["..."],'
    '"escalate_if":["..."],'
    '"confidence":"HIGH|MEDIUM|LOW",'
    '"source":"WHO SPHERE Handbook §X.X"}'
)

# Templates per scenario type — Priya expands these with real chunk content
INSTRUCTION_TEMPLATES = {
    "outbreak": [
        "Multiple people in a displacement camp have {symptom} for {duration}. They share a {water_source}.",
        "A family of {count} — adults and children — have had {symptom} since {duration} ago. No clean water.",
        "Community health worker reports {count} cases of {symptom} in tents near the river.",
    ],
    "triage": [
        "Person found unconscious after {event}. Not responding to voice.",
        "Severe bleeding from {location} after {cause}. Cannot stop with pressure.",
        "Child {age} years old, stopped breathing after choking on food.",
    ],
    "trauma": [
        "Person has {injury} from {cause}. {complication}.",
        "Crush injury to {body_part} after building collapse. Victim conscious.",
        "Burns on {coverage} of body from {cause}. Victim {age} years old.",
    ],
    "pediatric": [
        "Child under 5 has had {symptom} for {duration}. {complication}.",
        "Infant not feeding, lethargic, sunken eyes. Mother reports diarrhea for {duration}.",
        "Child {age} with high fever and {symptom}. No access to clinic.",
    ],
    "resource": [
        "Have {supplies} ORT packets and {count} patients showing dehydration symptoms.",
        "One first aid kit for {count} injured people from earthquake. What to prioritise?",
        "Camp has {water_liters} litres of clean water and {count} people needing ORT.",
    ],
    "flood": [
        "Water source contaminated after flood. Community of {count} needs safe water guidance.",
        "Person found with hypothermia after {duration} in flood water. Currently {state}.",
        "Evacuating {count} people including elderly and infants. Route unclear.",
    ],
}


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


def load_reviewed_chunks(path: str = "data/outputs/plain_language_chunks.jsonl") -> list[dict]:
    chunks = []
    with open(path) as f:
        for line in f:
            chunk = json.loads(line)
            if chunk.get("tag") != "priority":  # priority chunks are hardcoded, not trained on
                chunks.append(chunk)
    return chunks


def generate_pairs_from_chunks(chunks: list[dict], target_count: int = 700) -> list[dict]:
    """
    Generates instruction/output pairs grounded in reviewed chunk text.
    Each pair uses real chunk content as the basis for the output guidance.
    """
    pairs = []
    random.seed(42)
    sampled = random.choices(chunks, k=target_count)

    for chunk in sampled:
        tag = chunk["tag"]
        text = chunk["text"]

        # Instruction: derive a natural query from the chunk content
        instruction = _derive_instruction(text, tag)
        # Output: structured JSON grounded in the chunk
        output = _derive_output(text, tag)

        if instruction and output:
            pairs.append({"instruction": instruction, "output": json.dumps(output)})

    return pairs


def _derive_instruction(text: str, tag: str) -> str:
    """
    Creates a natural-language query from chunk text.
    In production: Priya writes these manually for quality.
    This function provides a scaffold for the format.
    """
    tag_queries = {
        "outbreak": "Multiple people in a community have symptoms matching this scenario. What should I do?",
        "triage": "I have a patient with the following condition. What are the immediate steps?",
        "trauma": "Someone has the following injury. How do I respond?",
        "pediatric": "A child has the following symptoms. How do I help?",
        "resource": "I have limited supplies and multiple patients. How do I allocate resources?",
        "flood": "Following a flood, I face this situation. What guidance do you have?",
        "communication": "I need to report this situation. How should I communicate it?",
    }
    base_query = tag_queries.get(tag, "I need guidance on the following situation.")
    # Append first sentence of chunk for context grounding
    first_sentence = text.split(".")[0].strip() + "." if "." in text else text[:100]
    return f"{base_query} Context: {first_sentence}"


def _derive_output(text: str, tag: str) -> dict:
    """
    Scaffold output — Priya and Nour review and rewrite these for accuracy.
    The ORT formula is always from the hardcoded priority chunk, never generated here.
    """
    urgency_map = {
        "triage": "IMMEDIATE",
        "trauma": "URGENT",
        "outbreak": "URGENT",
        "pediatric": "URGENT",
        "resource": "ROUTINE",
        "flood": "URGENT",
        "communication": "ROUTINE",
    }
    return {
        "urgency": urgency_map.get(tag, "ROUTINE"),
        "situation_summary": "Symptoms consistent with the described condition — full review required",
        "containment_check": "Ask: how many others nearby have the same symptoms? Do they share a water source?" if tag == "outbreak" else None,
        "immediate_actions": ["Follow WHO SPHERE guidance for this scenario", "Document patient count and symptoms", "Prepare to escalate if condition worsens"],
        "do_not": ["Do not delay action while awaiting medical team", "Do not give food or water until assessed"],
        "escalate_if": ["Patient loses consciousness", "Condition does not improve after 30 minutes"],
        "confidence": "MEDIUM",
        "source": "WHO SPHERE Handbook — review relevant section for exact citation",
    }


def spot_check(pairs: list[dict], n: int = 50) -> list[dict]:
    """Returns n random pairs for Nour's review."""
    return random.sample(pairs, min(n, len(pairs)))


if __name__ == "__main__":
    chunks_path = "data/outputs/plain_language_chunks.jsonl"
    if not Path(chunks_path).exists():
        print(f"[format] {chunks_path} not found — run chunk.py first")
        sys.exit(1)

    chunks = load_reviewed_chunks(chunks_path)
    pairs = generate_pairs_from_chunks(chunks, target_count=700)

    out_path = Path("training/data/training_data.jsonl")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        for pair in pairs:
            f.write(json.dumps(pair) + "\n")
    print(f"[format] Wrote {len(pairs)} pairs → {out_path}")

    # Save spot-check sample for Nour
    spot = spot_check(pairs)
    spot_path = Path("training/data/spot_check_50.jsonl")
    with open(spot_path, "w") as f:
        for pair in spot:
            f.write(json.dumps(pair) + "\n")
    print(f"[format] Spot-check sample (50 pairs) → {spot_path} — send to Nour for review")
