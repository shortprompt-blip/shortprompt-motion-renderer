import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectDir = path.resolve(process.argv[2] || "../example");
const outDir = path.resolve(process.argv[3] || "./frames");
const output = path.resolve(process.argv[4] || "./visual.webm");
const audioPath = path.resolve(process.argv[5] || "./speech.wav");

const htmlPath = path.join(projectDir, "video.html");
await fs.access(htmlPath);
await fs.access(audioPath);

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file
    ], { stdio: ["ignore", "pipe", "inherit"] });

    let data = "";
    ff.stdout.on("data", chunk => data += chunk);
    ff.on("error", reject);
    ff.on("exit", code => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      const duration = Number.parseFloat(data.trim());
      if (!Number.isFinite(duration) || duration <= 0) {
        return reject(new Error(`Invalid audio duration: ${data.trim()}`));
      }
      resolve(duration);
    });
  });
}

const audioDuration = await probeDuration(audioPath);

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1
});

await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.waitForFunction(() => document.fonts?.status === "loaded");

const meta = await page.evaluate((audioDuration) => {
  const m = window.SPMOTION || {};
  const fps = Number(m.fps || 30);
  const declaredDuration = Number(m.duration);

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("SP-MOTION fps is missing or invalid");
  }

  // AUDIO IS THE MASTER CLOCK.
  // duration is optional metadata only.
  // If omitted, SPMOTION_FRAME() receives the real audio time.
  const designDuration =
    Number.isFinite(declaredDuration) && declaredDuration > 0
      ? declaredDuration
      : null;

  window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
  window.__SPMOTION_DESIGN_DURATION__ = designDuration;
  window.__SPMOTION_RENDER_MODE__ = "html-autonomous";

  return {
    width: Number(m.width || 1080),
    height: Number(m.height || 1920),
    fps,
    designDuration,
    duration: audioDuration
  };
}, audioDuration);

await page.setViewportSize({
  width: meta.width,
  height: meta.height
});

const frameCount = Math.ceil(meta.duration * meta.fps);

console.log("SP-MOTION MODE: HTML-AUTONOMOUS");
console.log(`AUDIO MASTER: ${meta.duration.toFixed(3)}s`);
console.log(
  `VISUAL TIMELINE: ${
    meta.designDuration == null
      ? "AUDIO-CLOCKED (no declared duration)"
      : meta.designDuration.toFixed(3) + "s"
  }`
);

for (let i = 0; i < frameCount; i++) {
  const actualTime = i / meta.fps;
  const localTime =
    meta.designDuration > 0
      ? actualTime % meta.designDuration
      : actualTime;

  await page.evaluate(
    ({ actualTime, localTime, audioDuration, designDuration }) => {
      window.__SPMOTION_TIME__ = actualTime;
      window.__SPMOTION_LOCAL_TIME__ = localTime;
      window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
      window.__SPMOTION_DESIGN_DURATION__ = designDuration;

      if (typeof window.SPMOTION_FRAME !== "function") {
        throw new Error("video.html must expose SPMOTION_FRAME(time)");
      }

      window.SPMOTION_FRAME(localTime);

      document.dispatchEvent(new CustomEvent("sp-motion-time", {
        detail: { time: actualTime, localTime, audioDuration, designDuration }
      }));
    },
    {
      actualTime,
      localTime,
      audioDuration: meta.duration,
      designDuration: meta.designDuration
    }
  );

  await page.evaluate(() => new Promise(requestAnimationFrame));

  await page.screenshot({
    path: path.join(outDir, `frame-${String(i).padStart(6, "0")}.png`),
    animations: "allow"
  });

  if (i % Math.max(1, Math.floor(meta.fps)) === 0) {
    process.stdout.write(`FRAME ${i + 1}/${frameCount}
`);
  }
}

await browser.close();

await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", [
    "-y",
    "-framerate", String(meta.fps),
    "-i", path.join(outDir, "frame-%06d.png"),
    "-t", meta.duration.toFixed(3),
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuv420p",
    "-b:v", "8M",
    "-deadline", "good",
    "-cpu-used", "4",
    output
  ], { stdio: "inherit" });

  ff.on("error", reject);
  ff.on("exit", code => {
    if (code === 0) resolve();
    else reject(new Error(`ffmpeg exited ${code}`));
  });
});

console.log(`AUDIO MASTER DURATION: ${meta.duration.toFixed(3)}s`);
console.log(`VISUAL OUTPUT: ${output}`);
