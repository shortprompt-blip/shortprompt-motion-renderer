import { spawn } from "node:child_process";

const video = process.argv[2];
const audio = process.argv[3];
const output = process.argv[4] || "final.webm";

const args = [
  "-y",
  "-i", video,
  "-i", audio,
  "-map", "0:v:0",
  "-map", "1:a:0",
  "-c:v", "copy",
  "-c:a", "libopus",
  "-b:a", "160k",
  "-shortest",
  output
];

const ff = spawn("ffmpeg", args, { stdio: "inherit" });
ff.on("error", e => { console.error(e); process.exit(1); });
ff.on("exit", code => process.exit(code ?? 1));
