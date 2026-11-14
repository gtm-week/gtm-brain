/**
 * npm run shots -- /design-system/components [/another/path ...]
 * Screenshots each page at 375, 768 and 1440 into .shots/, so you (or your agent)
 * look before saying "done". Needs the site running (`npm run dev`) and Chromium
 * (`npx playwright install chromium`, once).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SHOTS_URL ?? "http://localhost:4321";
const WIDTHS = [375, 768, 1440];
const paths = process.argv.slice(2);
if (paths.length === 0) paths.push("/");

try {
  await fetch(BASE);
} catch {
  console.error(`Nothing answers at ${BASE}. Start the site first with: npm run dev`);
  process.exit(1);
}

mkdirSync(".shots", { recursive: true });
const browser = await chromium.launch().catch((error) => {
  console.error("Chromium is not installed. Run once: npx playwright install chromium");
  throw error;
});
for (const path of paths) {
  const name = path.replace(/^\/|\/$/g, "").replaceAll("/", "-") || "home";
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(new URL(path, BASE).href, { waitUntil: "networkidle" });
    // Scroll to the bottom and back, so images that load on scroll are in the shot.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((done) => setTimeout(done, 100));
      }
      scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const file = `.shots/${name}-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file}${overflow ? "  ⚠ scrolls sideways at this width" : ""}`);
    await page.close();
  }
}
await browser.close();
