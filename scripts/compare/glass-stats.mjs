// Brightness statistics of the glass body in an image, to compare a render with a reference photo.
// Looks at the rows between 30% and 90% of the object's height, inside its silhouette (non-white pixels of the outline).
// Usage: node scripts/compare/glass-stats.mjs <image> [threshold=205]
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const [file, threshold = "205"] = process.argv.slice(2);
const src = "data:image/" + path.extname(file).slice(1).replace("jpg", "jpeg") + ";base64," + fs.readFileSync(file).toString("base64");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async (src, threshold) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const luma = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const spans = [];
  let top = -1, bottom = -1;
  for (let y = 0; y < c.height; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i + 3] > 20 && Math.min(d[i], d[i + 1], d[i + 2]) < threshold) { if (l < 0) l = x; r = x; } }
    spans.push(l < 0 ? null : [l, r]);
    if (l >= 0) { if (top < 0) top = y; bottom = y; }
  }
  const values = [];
  const y0 = Math.round(top + 0.3 * (bottom - top)), y1 = Math.round(top + 0.9 * (bottom - top));
  for (let y = y0; y <= y1; y++) { const s = spans[y]; if (!s) continue; for (let x = s[0]; x <= s[1]; x++) values.push(luma((y * c.width + x) * 4)); }
  values.sort((a, b) => a - b);
  const pct = (p) => values[Math.floor(p * (values.length - 1))];
  const share = (f) => values.filter(f).length / values.length;
  return { pixels: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p05: pct(0.05), p25: pct(0.25), p50: pct(0.5), p95: pct(0.95), below120: share((v) => v < 120), below200: share((v) => v < 200), above250: share((v) => v >= 250) };
}, src, Number(threshold));
const r = (x) => +x.toFixed(3);
console.log(path.basename(file), JSON.stringify({ pixels: out.pixels, mean: r(out.mean), p05: r(out.p05), p25: r(out.p25), median: r(out.p50), p95: r(out.p95), "share<120": r(out.below120), "share<200": r(out.below200), "share>=250": r(out.above250) }));
await browser.close();
