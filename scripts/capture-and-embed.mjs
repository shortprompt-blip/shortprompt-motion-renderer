import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectDir = path.resolve(process.argv[2] || '../example');
const manifestPath = path.join(projectDir, 'capture.json');
const htmlPath = path.join(projectDir, 'video.html');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const htmlOriginal = await fs.readFile(htmlPath, 'utf8');

if (!Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error('capture.json has no sources');
if (!htmlOriginal.includes('__SPMOTION_EVIDENCE_')) throw new Error('video.html has no evidence placeholders');

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({
  viewport: {width:Number(manifest.viewport?.width||1920), height:Number(manifest.viewport?.height||1080)},
  deviceScaleFactor: Number(manifest.viewport?.deviceScaleFactor || 1)
});

try {
  let html = htmlOriginal;
  for (const [index, source] of manifest.sources.entries()) {
    if (!source.id || !source.url || !source.output) throw new Error(`Invalid source ${index+1}`);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(Number(source.timeout||45000));
    console.log(`CAPTURE ${index+1}/${manifest.sources.length}: ${source.url}`);
    await page.goto(source.url, {waitUntil:source.waitUntil||'domcontentloaded'});
    if (source.waitFor) await page.waitForSelector(source.waitFor, {state:'visible'});
    if (source.waitMs) await page.waitForTimeout(Number(source.waitMs));
    const output = path.join(projectDir, source.output);
    await fs.mkdir(path.dirname(output), {recursive:true});
    await page.screenshot({path:output, fullPage:source.fullPage !== false, animations:'disabled', scale:'css'});
    const stat = await fs.stat(output);
    if (!stat.size) throw new Error(`Empty screenshot: ${output}`);
    const bytes = await fs.readFile(output);
    const b64 = bytes.toString('base64');
    const token = `__SPMOTION_EVIDENCE_${source.id}__`;
    if (!html.includes(token)) throw new Error(`Missing HTML placeholder for ${source.id}`);
    html = html.split(token).join(b64);
    await page.close();
    console.log(`EMBED ${source.id}: ${Math.round(stat.size/1024)} KB`);
  }
  if (html.includes('__SPMOTION_EVIDENCE_')) throw new Error('Unresolved evidence placeholders remain');
  await fs.writeFile(htmlPath, html, 'utf8');
  console.log('DONE: screenshots embedded directly into video.html');
} finally {
  await context.close();
  await browser.close();
}
