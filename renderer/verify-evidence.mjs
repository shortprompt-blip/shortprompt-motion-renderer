import fs from "node:fs/promises";import path from "node:path";
const d=path.resolve(process.argv[2]||"../example"),m=JSON.parse(await fs.readFile(path.join(d,"capture.json"),"utf8")),h=await fs.readFile(path.join(d,"video.html"),"utf8"),s=Array.isArray(m.sources)?m.sources:[];
if(!s.length)throw new Error("capture.json contains no sources");
for(const [i,x] of s.entries()){const id=String(x.id||`source-${i+1}`),f=x.output;if(!f)throw new Error(`Source ${id} has no output`);const st=await fs.stat(path.join(d,f)).catch(()=>null);if(!st||!st.size)throw new Error(`Missing or empty capture: ${f}`);if(h.includes(`spmotion://source/${id}`))throw new Error(`Unembedded source marker remains: ${id}`)}
if(!h.includes("data:image/png;base64,")&&!h.includes("data:image/jpeg;base64,"))throw new Error("No embedded source image data URI found");
console.log(`Verified ${s.length} source captures.`);console.log("All source images are embedded and no source markers remain.");