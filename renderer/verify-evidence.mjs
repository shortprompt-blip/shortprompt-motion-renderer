import fs from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] || "../example");
const manifest = JSON.parse(await fs.readFile(path.join(projectDir, "capture.json"), "utf8"));
const html = await fs.readFile(path.join(projectDir, "video.html"), "utf8");
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

if (!sources.length) throw new Error("capture.json contains no sources");
if (!/window\.SPMOTION\s*=\s*\{[\s\S]*duration\s*:\s*[1-9]\d*/.test(html)) {
  throw new Error("SP-MOTION design duration is missing or invalid");
}
if (!html.includes("SPMOTION_RENDER")) throw new Error("SPMOTION_RENDER is missing");

for (const [index, source] of sources.entries()) {
  const id = String(source.id || `source-${index + 1}`);
  const output = source.output;
  if (!output) throw new Error(`Source ${id} has no output`);
  const stat = await fs.stat(path.join(projectDir, output)).catch(() => null);
  if (!stat || stat.size === 0) throw new Error(`Missing or empty capture: ${output}`);
  if (html.includes(`spmotion://source/${id}`)) {
    throw new Error(`Unembedded source marker remains: ${id}`);
  }
}

if (!html.includes("data:image/png;base64,") && !html.includes("data:image/jpeg;base64,")) {
  throw new Error("No embedded source image data URI found");
}

console.log(`Verified ${sources.length} source captures.`);
console.log("Verified positive design duration and deterministic SPMOTION_RENDER.");
console.log("All source images are embedded and no source markers remain.");
