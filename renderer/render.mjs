import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const projectDir = path.resolve(process.argv[2] || "../example");
const _legacyOutDir = process.argv[3];
const output = path.resolve(process.argv[4] || "./visual.webm");
const audioPath = path.resolve(process.argv[5] || "./speech.wav");
const htmlPath = path.join(projectDir, "video.html");
await Promise.all([fs.access(htmlPath), fs.access(audioPath)]);

function probeDuration(file) {
  return new Promise((resolve, reject) => {
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

function waitForDrain(stream) {
  return new Promise((resolve, reject) => {
    stream.once("drain", resolve);
    stream.once("error", reject);
  });
}

const startedAt = performance.now();
const audioDuration = await probeDuration(audioPath);
const browserStartedAt = performance.now();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
let ffmpeg;
let ffmpegExit;

try {
  // Export mode is set before page scripts to prevent a second preview clock.
  await page.addInitScript(() => {
    window.__SPMOTION_RENDER_MODE__ = "html-autonomous";
    window.__SPMOTION_EXPORT__ = true;
  });
  const htmlUrl = pathToFileURL(htmlPath);
  htmlUrl.searchParams.set("export", "1");
  await page.goto(htmlUrl.href, { waitUntil: "load" });
  await page.waitForFunction(() => document.fonts?.status === "loaded");

  const meta = await page.evaluate((audioDuration) => {
    const m = window.SPMOTION || {};
    const fps = Number(m.fps || 30);
    const declaredDuration = Number(m.duration);
    if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error("SP-MOTION fps is invalid (expected 0 < fps <= 120)");
    const width = Number(m.width || 1080);
    const height = Number(m.height || 1920);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("SP-MOTION width/height must be positive integers");
    if (!Number.isFinite(declaredDuration) || declaredDuration <= 0) throw new Error("video.html must declare window.SPMOTION.duration > 0");

    // AUDIO IS MASTER: never fail because HTML and voiceover durations differ.
    // Map the entire authored visual timeline onto the exact WAV duration.
    const timelineScale = declaredDuration / audioDuration;
    window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
    window.__SPMOTION_DESIGN_DURATION__ = declaredDuration;
    window.__SPMOTION_TIMELINE_SCALE__ = timelineScale;
    return { width, height, fps, designDuration: declaredDuration, duration: audioDuration, timelineScale, timelineDelta: Math.abs(declaredDuration - audioDuration) };
  }, audioDuration);

  await page.setViewportSize({ width: meta.width, height: meta.height });
  const frameCount = Math.ceil(meta.duration * meta.fps);
  ffmpeg = spawn("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-f", "image2pipe", "-vcodec", "png", "-framerate", String(meta.fps), "-i", "pipe:0",
    "-an", "-t", meta.duration.toFixed(6), "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
    "-b:v", "8M", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", output
  ], { stdio: ["pipe", "inherit", "inherit"] });
  let ffmpegError = null;
  ffmpeg.on("error", error => { ffmpegError = error; });
  ffmpegExit = new Promise((resolve, reject) => ffmpeg.on("close", code => code === 0 ? resolve() : reject(ffmpegError || new Error(`ffmpeg exited with code ${code}`))));

  console.log("SP-MOTION MODE: HTML-AUTONOMOUS / SINGLE TIMELINE / STREAMING FRAMES");
  console.log("EXPORT MODE: ENABLED BEFORE HTML SCRIPTS");
  console.log(`AUDIO MASTER: ${meta.duration.toFixed(3)}s`);
  console.log(`HTML DESIGN TIMELINE: ${meta.designDuration.toFixed(3)}s`);
  console.log(`VISUAL TIMELINE SCALE: ${meta.timelineScale.toFixed(6)}x (delta ${meta.timelineDelta.toFixed(3)}s; mismatch is auto-aligned)`);
  console.log(`FRAME COUNT: ${frameCount} at ${meta.fps} fps`);
  console.log(`FRAME SIZE: ${meta.width}x${meta.height}`);
  console.log(`BROWSER STARTUP: ${((performance.now() - browserStartedAt) / 1000).toFixed(2)}s`);

  const captureStartedAt = performance.now();
  for (let i = 0; i < frameCount; i++) {
    const actualTime = Math.min(i / meta.fps, meta.duration);
    const localTime = Math.min(actualTime * meta.timelineScale, meta.designDuration);
    await page.evaluate(({ actualTime, localTime, audioDuration, designDuration }) => {
      window.__SPMOTION_TIME__ = actualTime;
      window.__SPMOTION_LOCAL_TIME__ = localTime;
      window.__SPMOTION_AUDIO_DURATION__ = audioDuration;
      window.__SPMOTION_DESIGN_DURATION__ = designDuration;
      if (typeof window.SPMOTION_FRAME !== "function") throw new Error("video.html must expose SPMOTION_FRAME(time)");
      window.SPMOTION_FRAME(localTime);
      document.dispatchEvent(new CustomEvent("sp-motion-time", { detail: { time: actualTime, localTime, audioDuration, designDuration } }));
    }, { actualTime, localTime, audioDuration: meta.duration, designDuration: meta.designDuration });

    await page.evaluate(() => new Promise(requestAnimationFrame));
    const png = await page.screenshot({ type: "png", animations: "allow" });
    if (!ffmpeg.stdin.write(png)) await waitForDrain(ffmpeg.stdin);
    if ((i + 1) % Math.max(1, Math.floor(meta.fps)) === 0 || i === frameCount - 1) {
      const elapsed = (performance.now() - captureStartedAt) / 1000;
      process.stdout.write(`FRAME ${i + 1}/${frameCount} — ${((i + 1) / Math.max(elapsed, 0.001)).toFixed(1)} fps capture rate\n`);
    }
  }

  ffmpeg.stdin.end();
  await ffmpegExit;
  console.log(`CAPTURE + ENCODE: ${((performance.now() - captureStartedAt) / 1000).toFixed(2)}s`);
  console.log(`TOTAL RENDER: ${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
  console.log(`AUDIO MASTER DURATION: ${meta.duration.toFixed(3)}s`);
  console.log(`VISUAL OUTPUT: ${output}`);
} catch (error) {
  if (ffmpeg && !ffmpeg.stdin.destroyed) ffmpeg.stdin.destroy();
  throw error;
} finally {
  await browser.close();
}
