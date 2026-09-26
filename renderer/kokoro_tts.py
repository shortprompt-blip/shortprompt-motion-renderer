import argparse
import numpy as np
import soundfile as sf
from kokoro import KPipeline

p = argparse.ArgumentParser()
p.add_argument("--text", required=True)
p.add_argument("--output", required=True)
p.add_argument("--voice", default="af_heart")
p.add_argument("--speed", type=float, default=1.0)
args = p.parse_args()

pipeline = KPipeline(lang_code="a")
chunks = []

for _, _, audio in pipeline(args.text, voice=args.voice, speed=args.speed):
    if audio is not None:
        chunks.append(np.asarray(audio, dtype=np.float32))

if not chunks:
    raise RuntimeError("Kokoro produced no audio")

audio = np.concatenate(chunks)
sf.write(args.output, audio, 24000, subtype="PCM_16")
print(f"TTS OUTPUT: {args.output}")
