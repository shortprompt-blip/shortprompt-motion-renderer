import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve(process.argv[2] || "example/browser-replay.json");
const outputDir = path.resolve(process.argv[3] || "example/assets/browser-replay");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: manifest.viewport || { width: 1440, height: 900 },
  deviceScaleFactor: manifest.deviceScaleFactor || 1,
  recordVideo: { dir: outputDir, size: manifest.videoSize || { width: 1440, height: 900 } }
});

try {
  const page = await context.newPage();
  page.setDefaultTimeout(manifest.timeout || 30000);
  page.setDefaultNavigationTimeout(manifest.timeout || 30000);

  for (const [i, step] of (manifest.steps || []).entries()) {
    console.log(`[${i + 1}/${manifest.steps.length}] ${step.type}`);

    switch (step.type) {
      case "goto":
        await page.goto(step.url, { waitUntil: step.waitUntil || "domcontentloaded" });
        break;
      case "wait":
        await page.waitForTimeout(step.ms || 1000);
        break;
      case "scroll":
        await page.evaluate(({x, y}) => window.scrollTo({left:x||0, top:y||0, behavior:"instant"}), {x:step.x,y:step.y});
        break;
      case "scrollToText":
        await page.getByText(step.text, {exact:false}).first().scrollIntoViewIfNeeded();
        break;
      case "click":
        await page.locator(step.selector).first().click();
        break;
      case "clickText":
        await page.getByText(step.text, {exact:false}).first().click();
        break;
      case "highlight": {
        const locator = page.locator(step.selector).first();
        await locator.evaluate(el => { el.style.outline="3px solid #61dafb"; el.style.outlineOffset="6px"; });
        break;
      }
      case "screenshot":
        await page.screenshot({path:path.join(outputDir, step.file || `step-${i+1}.png`), fullPage:Boolean(step.fullPage), animations:"disabled"});
        break;
      case "press":
        await page.keyboard.press(step.key);
        break;
      case "back":
        await page.goBack({waitUntil:"domcontentloaded"});
        break;
      default:
        throw new Error(`Unsupported browser replay step: ${step.type}`);
    }
  }

  await page.waitForTimeout(manifest.endWaitMs || 500);
  await page.close();
} finally {
  await context.close();
  await browser.close();
}
console.log(`REAL_BROWSER_REPLAY_COMPLETE: ${outputDir}`);
