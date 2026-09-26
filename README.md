# SP-MOTION HTML Renderer

HTML-first rendering pipeline for ShortPrompt Motion.

## New contract

A video project consists of:

```text
video.html
speech.txt
assets/
```

There is no scene JSON.

`video.html` owns the complete visual experience: HTML, CSS, JavaScript, scenes,
timeline, animations, charts, browser/IDE simulations, transitions, etc.

The renderer only provides a deterministic clock and captures the page.

### Minimal render API

Expose:

```js
window.SPMOTION = {
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 30
};

window.SPMOTION_RENDER = function(time) {
  // Update your complete HTML visual state for `time` seconds.
};
```

For normal browser preview, the HTML can run its own animation loop. During
export, Playwright calls `SPMOTION_RENDER(time)` for every frame.

If `SPMOTION_RENDER` is not present, the renderer falls back to real-time
browser playback for preview-oriented assets.

## Local preview

Open `example/video.html` in a browser.

## GitHub Actions render

Push a project containing `video.html` and `speech.txt` to a repository.
The workflow renders the visual layer with Chromium, generates Kokoro speech,
and muxes the WAV into the final WebM.

The workflow accepts:

- `voice`: `af_heart`, `am_adam`, `bf_emma`, `bm_george`
- `speed`: `0.75`–`1.25`

The final artifact is:

```text
sp-motion-output/final.webm
```

## Important design rule

The HTML is rendered in an isolated Chromium page. It is never injected into
the SP-MOTION editor DOM. This eliminates CSS/UI collisions with the editor.
