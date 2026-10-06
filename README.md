# SP-MOTION HTML Renderer

## Audio-master timing contract

The final video duration is determined exclusively by `speech.wav`.

`video.html` does not need to declare a duration.

Required:

```js
window.SPMOTION = {
  width: 1080,
  height: 1920,
  fps: 30
};
```

Optional legacy compatibility:

```js
duration: 30
```

If `duration` is omitted, `SPMOTION_FRAME(time)` receives the real audio time directly.

If `duration` is present and valid, it is used only as the visual loop period.

The voiceover is never stretched, shortened, looped, or cut by the renderer.
