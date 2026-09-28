# Gemini 4 — Real Demo Capture Short

This package follows @SP-MOTION V1.4 HTML-FIRST.

IMPORTANT:
- The video does NOT recreate the demos.
- `capture/capture.mjs` uses Playwright to open the real source pages and create the evidence screenshots.
- `video.html` only references those local captures.
- If a capture is missing, the video displays a visible "REAL CAPTURE MISSING" warning instead of fabricating an image.

## GitHub Actions order

1. Install Node dependencies.
2. Install Playwright Chromium.
3. Run `node capture/capture.mjs`.
4. Run the existing ShortPrompt Motion renderer against `video.html`.
5. Run the existing Kokoro/FFmpeg stages.

Do not replace the renderer with a custom renderer.

## Sources

Primary reporting source:
https://atoms.dev/blog/gemini-4-pro-examples

Official Google DeepMind comparison/evidence:
https://deepmind.google/models/gemini/flash/

The reported Gemini 4 attribution must remain labelled as unconfirmed.
