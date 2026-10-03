import fs from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] || "../example");
const manifestPath = path.join(projectDir, "capture.json");
const htmlPath = path.join(projectDir, "video.html");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const html = await fs.readFile(htmlPath, "utf8");
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

if (!sources.length) throw new Error("capture.json contains no sources");

for (const [index, source] of sources.entries()) {
  const id = String(source.id || `source-${index + 1}`);
  const output = source.output;
  if (!output) throw new Error(`Source ${id} has no output`);

  const imagePath = path.join(projectDir, output);
  const stat = await fs.stat(imagePath).catch(() => null);
  if (!stat || stat.size === 0) {
    throw new Error(`Missing or empty capture: ${output}`);
  }

  const marker = `spmotion://source/${id}`;
  if (html.includes(marker)) {
    throw new Error(`Unembedded source marker remains: ${marker}`);
  }
}

if (!html.includes("data:image/png;base64,") && !html.includes("data:image/jpeg;base64,")) {
  throw new Error("No embedded image data URI found in video.html");
}

console.log(`Verified ${sources.length} source captures.`);
console.log("All source images are embedded and no source markers remain.");
