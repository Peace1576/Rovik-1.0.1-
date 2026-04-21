import argparse
import json
import os
import sys
import time
import traceback

import numpy as np
import openwakeword
import openwakeword.utils
from openwakeword.model import Model


def emit(payload):
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def read_exact(stream, size):
    buffer = bytearray()
    while len(buffer) < size:
        chunk = stream.read(size - len(buffer))
        if not chunk:
            return None
        buffer.extend(chunk)
    return bytes(buffer)


def resolve_builtin_model_path(model_name):
    openwakeword.utils.download_models()
    models_dir = os.path.join(os.path.dirname(openwakeword.__file__), "resources", "models")
    candidates = []
    for filename in os.listdir(models_dir):
      if not (filename.endswith(".onnx") or filename.endswith(".tflite")):
          continue
      stem = os.path.splitext(filename)[0]
      candidates.append((stem, os.path.join(models_dir, filename)))

    normalized_target = model_name.lower().replace(".onnx", "").replace(".tflite", "")
    exact = next((path for stem, path in candidates if stem.lower() == normalized_target), None)
    if exact:
        return exact

    prefix = next(
        (path for stem, path in candidates if stem.lower().startswith(normalized_target)),
        None,
    )
    if prefix:
        return prefix

    raise FileNotFoundError(f"Could not resolve openWakeWord model '{model_name}'")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path")
    parser.add_argument("--model-name")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--vad-threshold", type=float, default=0.45)
    parser.add_argument("--label", default="Eve")
    parser.add_argument("--frame-length", type=int, default=1280)
    args = parser.parse_args()

    model_path = args.model_path
    if model_path:
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found: {model_path}")
    elif args.model_name:
        model_path = resolve_builtin_model_path(args.model_name)
    else:
        raise RuntimeError("No openWakeWord model path or model name provided")

    model = Model(
        wakeword_models=[model_path],
        vad_threshold=args.vad_threshold,
    )
    model_key = next(iter(model.models.keys()))

    emit(
        {
            "type": "ready",
            "message": f"Listening for '{args.label}' with openWakeWord",
            "model_key": model_key,
        }
    )

    frame_bytes = args.frame_length * 2
    last_emit_at = 0.0
    last_score = 0.0

    while True:
        chunk = read_exact(sys.stdin.buffer, frame_bytes)
        if chunk is None:
            return

        frame = np.frombuffer(chunk, dtype=np.int16)
        prediction = model.predict(frame)
        score = float(prediction.get(model_key, 0.0))

        now = time.time()
        if abs(score - last_score) > 0.08 or (now - last_emit_at) > 0.35:
            emit({"type": "prediction", "score": score})
            last_emit_at = now
            last_score = score

        if score >= args.threshold:
            emit(
                {
                    "type": "wake-word-detected",
                    "score": score,
                    "message": f"Wake word '{args.label}' detected",
                }
            )
            return


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({"type": "error", "message": str(exc)})
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        raise
