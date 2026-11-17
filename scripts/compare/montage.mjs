// Puts any number of images side by side (the reference first) for comparison.
// Usage: node scripts/compare/montage.mjs <out.png> <height> <image> <image> ...
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const [out, height, ...images] = process.argv.slice(2);
const toUrl = (p) => "data:image/" + path.extname(p).slice(1).replace("jpg", "jpeg") + ";base64," + fs.readFileSync(p).toString("base64");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 4800, height: Number(height) });
await page.setContent(`<body style="margin:0;display:flex;gap:6px;background:#777">${images.map((p, i) => `<img id=i${i} style="height:${height}px" src="${toUrl(p)}">`).join("")}</body>`);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
const width = await page.evaluate((n) => Math.ceil(document.getElementById("i" + (n - 1)).getBoundingClientRect().right), images.length);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height: Number(height) } });
await browser.close();
console.log("saved", out);
