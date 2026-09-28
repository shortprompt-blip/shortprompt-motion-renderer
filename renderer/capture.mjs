import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const projectDir = path.resolve(process.argv[2] || "../example");
const manifestPath = path.join(projectDir, "capture.json");

try {
  await fs.access(manifestPath);
} catch {
  console.log("NO CAPTURE MANIFEST: skipping research capture");
  process.exit(0);
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

if (!sources.length) {
  console.log("EMPTY CAPTURE MANIFEST: nothing to capture");
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: manifest.viewport || { width: 1440, height: 900 },
  deviceScaleFactor: manifest.deviceScaleFactor || 1
});

try {
  for (const [index, source] of sources.entries()) {
    if (!source.url) {
      throw new Error(`capture source ${index} is missing url`);
    }

    const page = await context.newPage();
    const timeout = Number(source.timeout || 30000);

    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    console.log(`CAPTURE ${index + 1}/${sources.length}: ${source.url}`);

    await page.goto(source.url, {
      waitUntil: source.waitUntil || "domcontentloaded"
    });

    if (source.waitFor) {
      await page.waitForSelector(source.waitFor, { state: "visible" });
    }

    if (source.waitMs) {
      await page.waitForTimeout(Number(source.waitMs));
    }

    for (const action of source.actions || []) {
      switch (action.type) {
        case "scroll":
          await page.evaluate(
            (y) => window.scrollTo({ top: y, behavior: "instant" }),
            Number(action.y || 0)
          );
          break;

        case "click":
          await page.locator(action.selector).first().click();
          break;

        case "type":
          await page.locator(action.selector).first().fill(String(action.text || ""));
          break;

        case "wait":
          await page.waitForTimeout(Number(action.ms || 1000));
          break;

        case "screenshot": {
          const output = path.join(
            projectDir,
            action.output || `assets/evidence/capture-${index + 1}.png`
          );

          await fs.mkdir(path.dirname(output), { recursive: true });

          await page.screenshot({
            path: output,
            fullPage: Boolean(action.fullPage),
            animations: "disabled"
          });

          console.log(`SAVED ${path.relative(projectDir, output)}`);
          break;
        }

        default:
          throw new Error(`unsupported capture action: ${action.type}`);
      }
    }

    const output = path.join(
      projectDir,
      source.output || `assets/evidence/source-${index + 1}.png`
    );

    await fs.mkdir(path.dirname(output), { recursive: true });

    await page.screenshot({
      path: output,
      fullPage: Boolean(source.fullPage),
      animations: "disabled"
    });

    console.log(`SAVED ${path.relative(projectDir, output)}`);
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
}

console.log("RESEARCH CAPTURE COMPLETE");
