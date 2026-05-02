"""
convert_model.py — Raj, Hour 18
Converts fine-tuned checkpoint to deployment format.
Format locked at Hour 2: "mlc" or "llama_cpp"
"""
import argparse
import subprocess
import sys
from pathlib import Path


def convert(inference_path: str, checkpoint_dir: str, output_dir: str = "./models") -> None:
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if inference_path == "mlc":
        print(f"[convert] MLC-LLM path: {checkpoint_dir} → {output_dir}/beacon-e4b-mlc")
        result = subprocess.run([
            "mlc_llm", "convert_weight",
            checkpoint_dir,
            "--quantization", "q4f16_1",
            "--output", f"{output_dir}/beacon-e4b-mlc",
        ])
        if result.returncode != 0:
            print("[convert] mlc_llm convert_weight failed — check MLC-LLM installation")
            sys.exit(1)

        # Also compile the model library
        subprocess.run([
            "mlc_llm", "compile",
            f"{output_dir}/beacon-e4b-mlc",
            "--device", "android",
            "--output", f"{output_dir}/beacon-e4b-mlc/lib_android.tar",
        ])
        subprocess.run([
            "mlc_llm", "compile",
            f"{output_dir}/beacon-e4b-mlc",
            "--device", "iphone",
            "--output", f"{output_dir}/beacon-e4b-mlc/lib_ios.tar",
        ])
        print(f"[convert] MLC format ready → {output_dir}/beacon-e4b-mlc/")

    elif inference_path == "llama_cpp":
        out_file = f"{output_dir}/beacon-e4b.gguf"
        print(f"[convert] llama.cpp path: {checkpoint_dir} → {out_file}")
        result = subprocess.run([
            "python", "-m", "llama_cpp.convert",
            checkpoint_dir,
            "--outtype", "q4_0",
            "--outfile", out_file,
        ])
        if result.returncode != 0:
            # Try llama-cpp-python convert script if above fails
            result = subprocess.run([
                "python", "convert_hf_to_gguf.py",
                checkpoint_dir,
                "--outtype", "q4_0",
                "--outfile", out_file,
            ])
        print(f"[convert] GGUF ready → {out_file}")

    else:
        print(f"[convert] Unknown inference_path: '{inference_path}'. Use 'mlc' or 'llama_cpp'")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inference-path", required=True, choices=["mlc", "llama_cpp"],
                        help="Locked at Hour 2 — use whatever was decided then")
    parser.add_argument("--checkpoint", required=True, help="Fine-tuned checkpoint directory")
    parser.add_argument("--output-dir", default="./models")
    args = parser.parse_args()

    convert(args.inference_path, args.checkpoint, args.output_dir)
