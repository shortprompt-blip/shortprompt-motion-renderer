import argparse
import wave
from pathlib import Path

import numpy as np
from kokoro import KPipeline


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    # Kokoro language is encoded in the first character of the voice:
    # a = American English, b = British English, etc.
    lang_code = args.voice[0]

    pipeline = KPipeline(lang_code=lang_code)

    text = Path(args.text).read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError("speech.txt is empty")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    written = 0

    with wave.open(str(output), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24000)

        # Split on newlines so long scripts are handled safely.
        for result in pipeline(text, voice=args.voice, speed=args.speed, split_pattern=r"\n+"):
            audio = result[2]

            if audio is None:
                continue

            # Current Kokoro returns a torch Tensor. Convert explicitly.
            if hasattr(audio, "detach"):
                audio = audio.detach().cpu().numpy()
            else:
                audio = np.asarray(audio)

            audio = np.asarray(audio, dtype=np.float32).reshape(-1)
            if audio.size == 0:
                continue

            audio = np.clip(audio, -1.0, 1.0)
            pcm = (audio * 32767.0).astype(np.int16)
            wav_file.writeframes(pcm.tobytes())
            written += len(pcm)

    if written == 0:
        raise RuntimeError(
            f"Kokoro produced no audio. voice={args.voice!r}, lang_code={lang_code!r}"
        )

    print(f"TTS OUTPUT: {output}")
    print(f"TTS SAMPLES: {written}")
    print(f"TTS DURATION: {written / 24000:.2f}s")


if __name__ == "__main__":
    main()
