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

async function probeDuration(file) {
  return await new Promise((resolve, reject) => {
    const ff = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { stdio: ["ignore", "pipe", "inherit"] });
    let data = "";
    ff.stdout.on("data", chunk => data += chunk);
    ff.on("error", reject);
    ff.on("exit", code => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      const duration = Number.parseFloat(data.trim());
      if (!Number.isFinite(duration) || duration <= 0) return reject(new Error(`Invalid audio duration: ${data.trim()}`));
      resolve(duration);
    });
  });
}

const audioDuration = await probeDuration(audioPath);

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.waitForFunction(() => document.fonts?.status === "loaded");

const meta = await page.evaluate((audioDuration) => {
  const m = window.SPMOTION || {};
  const designDuration = Number(m.duration || 30);
  const fps = Number(m.fps || 30);
  window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
  window.__SPMOTION_DESIGN_DURATION__ = designDuration;
  return {
    width: Number(m.width || 1080),
    height: Number(m.height || 1920),
    fps,
    designDuration,
    duration: audioDuration
  };
}, audioDuration);

if (!Number.isFinite(meta.fps) || meta.fps <= 0) throw new Error("Invalid fps");
if (!Number.isFinite(meta.designDuration) || meta.designDuration <= 0) throw new Error("Invalid design duration");

await page.setViewportSize({ width: meta.width, height: meta.height });

// Audio is the master clock. The author's timeline is normalized to the
// measured Kokoro duration so visual end-state and speech end together.
const frameCount = Math.ceil(meta.duration * meta.fps);
const scale = meta.designDuration / meta.duration;

for (let i = 0; i < frameCount; i++) {
  const actualTime = i / meta.fps;
  const designTime = Math.min(meta.designDuration, actualTime * scale);

  await page.evaluate(({ actualTime, designTime, audioDuration }) => {
    window.__SPMOTION_TIME__ = actualTime;
    window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
    window.__SPMOTION_DESIGN_TIME__ = designTime;
    if (typeof window.SPMOTION_RENDER === "function") window.SPMOTION_RENDER(designTime);
    document.dispatchEvent(new CustomEvent("sp-motion-time", { detail: { time: actualTime, designTime, audioDuration } }));
  }, { actualTime, designTime, audioDuration });

  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path: path.join(outDir, `frame-${String(i).padStart(6, "0")}.png`), animations: "disabled" });

  if (i % Math.max(1, Math.floor(meta.fps)) === 0) process.stdout.write(`FRAME ${i + 1}/${frameCount}\n`);
}

await browser.close();

await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", [
    "-y", "-framerate", String(meta.fps), "-i", path.join(outDir, "frame-%06d.png"),
    "-t", audioDuration.toFixed(3), "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "8M", "-deadline", "good", "-cpu-used", "4", output
  ], { stdio: "inherit" });
  ff.on("error", reject);
  ff.on("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
});

console.log(`AUDIO MASTER DURATION: ${audioDuration.toFixed(3)}s`);
console.log(`VISUAL OUTPUT: ${output}`);
