import fs from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] || "../example");
const manifest = JSON.parse(await fs.readFile(path.join(projectDir, "capture.json"), "utf8"));
let html = await fs.readFile(path.join(projectDir, "video.html"), "utf8");

for (const [index, source] of (manifest.sources || []).entries()) {
  const id = String(source.id || `source-${index + 1}`);
  const imagePath = path.join(projectDir, source.output);
  const bytes = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const marker = `spmotion://source/${id}`;
  if (!html.includes(marker)) throw new Error(`Source marker not found: ${marker}`);
  html = html.split(marker).join(`data:${mime};base64,${bytes.toString("base64")}`);
  console.log(`Embedded ${id}`);
}

await fs.writeFile(path.join(projectDir, "video.html"), html, "utf8");
console.log("All source captures embedded.");
