"""
ingest.py — Sofia, Hours 2–6
Loads source PDFs and applies Nour's clinical term replacements.
"""
import json
import re
from pathlib import Path

SOURCES = [
    "WHO_SPHERE_Handbook_2018.pdf",
    "IMCI_Emergency_Protocols.pdf",
    "RedCross_FirstAid_Manual.pdf",
    "UNHCR_Field_Operations_Guide.pdf",
    "seed_corpus.txt",
]


def load_replacements(path: str = "data/clinical_term_replacements.md") -> dict:
    """
    Parse Nour's replacement map from markdown.
    Expected format:  | clinical term | plain-language replacement |
    """
    replacements = {}
    try:
        with open(path) as f:
            for line in f:
                if "|" in line:
                    parts = [p.strip() for p in line.split("|") if p.strip()]
                    if len(parts) == 2:
                        replacements[parts[0].lower()] = parts[1]
    except FileNotFoundError:
        print(f"[ingest] {path} not found — running without replacements")
    return replacements


def replace_clinical_terms(text: str, replacements: dict) -> str:
    for clinical_term, plain_term in replacements.items():
        text = re.sub(re.escape(clinical_term), plain_term, text, flags=re.IGNORECASE)
    return text


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract raw text from a PDF. Uses pypdf (pip install pypdf).
    Falls back to a plain-text file with the same stem if PDF not found
    (useful for testing with pre-extracted .txt files).
    """
    path = Path(pdf_path)
    txt_fallback = path.with_suffix(".txt")

    if txt_fallback.exists():
        return txt_fallback.read_text(encoding="utf-8")

    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception as e:
        print(f"[ingest] Could not read {pdf_path}: {e}")
        return ""


def ingest_all(sources: list[str], replacements_path: str = "data/clinical_term_replacements.md") -> list[dict]:
    """
    Returns list of dicts: {"source": filename, "text": plain_language_text}
    """
    replacements = load_replacements(replacements_path)
    documents = []
    for source in sources:
        raw = extract_text_from_pdf(source)
        if not raw.strip():
            print(f"[ingest] Skipping empty source: {source}")
            continue
        clean = replace_clinical_terms(raw, replacements)
        documents.append({"source": source, "text": clean})
        print(f"[ingest] {source}: {len(clean.split())} words after replacement")
    return documents


if __name__ == "__main__":
    docs = ingest_all(SOURCES)
    out = Path("outputs/ingested_documents.jsonl")
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        for doc in docs:
            f.write(json.dumps(doc) + "\n")
    print(f"[ingest] Wrote {len(docs)} documents → {out}")
