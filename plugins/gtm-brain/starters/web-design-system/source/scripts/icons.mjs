/**
 * npm run icons
 * Writes every icon browsers and phones ask for from one source,
 * src/assets/brand/icon.svg: favicon.svg, apple-touch-icon.png (180, on white, because
 * an iPhone fills transparency with black), icon-192.png and icon-512.png (Android, via
 * site.webmanifest). Run it again after changing the icon. Needs Chromium
 * (`npx playwright install chromium`, once).
 */
import { copyFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const source = "src/assets/brand/icon.svg";
const svg = readFileSync(source, "utf8");
copyFileSync(source, "public/favicon.svg");

const sizes = [
  { file: "apple-touch-icon.png", size: 180, background: "white" },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

const browser = await chromium.launch();
for (const { file, size, background } of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<body style="margin:0;background:${background ?? "transparent"}">${sized}</body>`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: !background });
  await page.close();
  console.log(`public/${file}`);
}
await browser.close();
console.log("public/favicon.svg");
