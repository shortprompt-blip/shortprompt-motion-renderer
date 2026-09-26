import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectDir = path.resolve(process.argv[2] || "../example");
const htmlPath = path.join(projectDir, "video.html");
try {
  await fs.access(htmlPath);
} catch {
  throw new Error(`SP-MOTION HTML not found: ${htmlPath}`);
}
const outDir = path.resolve(process.argv[3] || "./frames");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1
});

await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.waitForFunction(() => document.fonts?.status === "loaded");

const meta = await page.evaluate(() => {
  const m = window.SPMOTION || {};
  return {
    width: Number(m.width || 1080),
    height: Number(m.height || 1920),
    fps: Number(m.fps || 30),
    duration: Number(m.duration || 30)
  };
});

if (!Number.isFinite(meta.fps) || meta.fps <= 0) throw new Error("Invalid fps");
if (!Number.isFinite(meta.duration) || meta.duration <= 0) throw new Error("Invalid duration");

await page.setViewportSize({ width: meta.width, height: meta.height });

const frameCount = Math.ceil(meta.duration * meta.fps);

for (let i = 0; i < frameCount; i++) {
  const t = i / meta.fps;

  await page.evaluate((time) => {
    window.__SPMOTION_TIME__ = time;
    if (typeof window.SPMOTION_RENDER === "function") {
      window.SPMOTION_RENDER(time);
    }
    document.dispatchEvent(new CustomEvent("sp-motion-time", {
      detail: { time }
    }));
  }, t);

  // Let layout/paint settle without advancing the logical timeline.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({
    path: path.join(outDir, `frame-${String(i).padStart(6, "0")}.png`),
    animations: "disabled"
  });

  if (i % Math.max(1, Math.floor(meta.fps)) === 0) {
    process.stdout.write(`FRAME ${i + 1}/${frameCount}\n`);
  }
}

await browser.close();

const output = path.resolve(process.argv[4] || "./visual.webm");

await new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", [
    "-y",
    "-framerate", String(meta.fps),
    "-i", path.join(outDir, "frame-%06d.png"),
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuv420p",
    "-b:v", "8M",
    "-deadline", "good",
    "-cpu-used", "4",
    output
  ], { stdio: "inherit" });

  ff.on("error", reject);
  ff.on("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
});

console.log(`VISUAL OUTPUT: ${output}`);
