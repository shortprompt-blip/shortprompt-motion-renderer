import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("assets/evidence");
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

async function capture(url, file, locatorText, extraScroll=0) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  if (locatorText) {
    const loc = page.getByText(locatorText, { exact: false }).first();
    if (await loc.count()) {
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1200);
    }
  }
  if (extraScroll) await page.mouse.wheel(0, extraScroll);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  console.log(`captured ${file} <- ${url}`);
}

const article = "https://atoms.dev/blog/gemini-4-pro-examples";

await capture(article, "gemini4-article.png", "6 Gemini 4 Pro Examples");
await capture(article, "gemini4-pelican.png", "A cycling pelican with working controls");
await capture(article, "gemini4-pagoda.png", "A voxel pagoda");
await capture(article, "gemini4-h145.png", "An Airbus H145 helicopter model");
await capture(article, "gemini4-flight-sim.png", "flight-simulation comparison");

await page.goto("https://deepmind.google/models/gemini/flash/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.getByText("Fully functional DOS version of Google Maps", { exact: false }).first().scrollIntoViewIfNeeded().catch(()=>{});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "official-gemini38-evidence.png"), fullPage: false });

await browser.close();
