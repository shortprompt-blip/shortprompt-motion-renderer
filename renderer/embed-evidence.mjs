import fs from "node:fs/promises";
import path from "node:path";
const projectDir=path.resolve(process.argv[2]||"../example");
const manifest=JSON.parse(await fs.readFile(path.join(projectDir,"capture.json"),"utf8"));
let html=await fs.readFile(path.join(projectDir,"video.html"),"utf8");
for(const [i,s] of (manifest.sources||[]).entries()){
 const id=String(s.id||`source-${i+1}`), file=path.join(projectDir,s.output);
 const bytes=await fs.readFile(file), ext=path.extname(file).toLowerCase();
 const mime=ext===".jpg"||ext===".jpeg"?"image/jpeg":"image/png";
 const data=`data:${mime};base64,${bytes.toString("base64")}`, marker=`spmotion://source/${id}`;
 if(!html.includes(marker)) throw new Error(`Missing marker: ${marker}`);
 html=html.split(marker).join(data); console.log(`Embedded ${id}`);
}
await fs.writeFile(path.join(projectDir,"video.html"),html,"utf8");console.log("All source captures embedded.");
