// Puts two images side by side (the reference on the left, our render on the right) for comparison.
// Usage: node scripts/compare/side-by-side.mjs <left> <right> <out.png> [height]
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const [left, right, out, height = "700"] = process.argv.slice(2);
const toUrl = (p) => "data:image/" + path.extname(p).slice(1).replace("jpg", "jpeg") + ";base64," + fs.readFileSync(p).toString("base64");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 2400, height: Number(height) });
await page.setContent(`<body style="margin:0;display:flex;gap:8px;background:#888"><img id=a style="height:${height}px" src="${toUrl(left)}"><img id=b style="height:${height}px" src="${toUrl(right)}"></body>`);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
const box = await page.evaluate(() => { const b = document.getElementById("b").getBoundingClientRect(); return { width: Math.ceil(b.right) }; });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: box.width, height: Number(height) } });
await browser.close();
console.log("saved", out);
