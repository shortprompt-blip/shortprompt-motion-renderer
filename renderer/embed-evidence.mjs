import fs from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] || "../example");
const manifestPath = path.join(projectDir, "capture.json");
const htmlPath = path.join(projectDir, "video.html");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
let html = await fs.readFile(htmlPath, "utf8");
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

if (!sources.length) {
  console.log("EMPTY CAPTURE MANIFEST: nothing to embed");
  process.exit(0);
}

for (const [index, source] of sources.entries()) {
  const id = String(source.id || `source-${index + 1}`);
  const output = source.output || `assets/evidence/source-${index + 1}.png`;
  const imagePath = path.join(projectDir, output);
  const bytes = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = source.mime || (ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png");
  const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;
  const marker = `spmotion://source/${id}`;

  if (!html.includes(marker)) {
    throw new Error(`embedded source marker not found in video.html: ${marker}`);
  }

  html = html.split(marker).join(dataUri);
  console.log(`EMBEDDED ${id} <- ${output}`);
}

await fs.writeFile(htmlPath, html, "utf8");
console.log("SOURCE EVIDENCE EMBED COMPLETE");
