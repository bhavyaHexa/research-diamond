// Width-versus-height profile of the silhouette in an image (non-white pixels on a white background).
// Usage: node scripts/compare/silhouette.mjs <image> [threshold=235] [rows=24]
// Prints the bounding box and, for evenly spaced rows from the top of the object to its bottom, the width as a
// share of the object's maximum width, so two renders of different size can be compared.
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const [file, threshold = "235", rows = "24"] = process.argv.slice(2);
const src = "data:image/" + path.extname(file).slice(1).replace("jpg", "jpeg") + ";base64," + fs.readFileSync(file).toString("base64");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async (src, threshold, rows) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const solid = (x, y) => { const i = (y * c.width + x) * 4; return d[i + 3] > 20 && Math.min(d[i], d[i + 1], d[i + 2]) < threshold; };
  let top = -1, bottom = -1; const spans = [];
  for (let y = 0; y < c.height; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < c.width; x++) if (solid(x, y)) { if (l < 0) l = x; r = x; }
    spans.push(l < 0 ? null : [l, r]);
    if (l >= 0) { if (top < 0) top = y; bottom = y; }
  }
  const maxW = Math.max(...spans.filter(Boolean).map(([l, r]) => r - l));
  const table = [];
  for (let k = 0; k <= rows; k++) {
    const y = Math.min(bottom, Math.round(top + (bottom - top) * k / rows)), s = spans[y];
    table.push({ t: +(k / rows).toFixed(3), w: s ? +((s[1] - s[0]) / maxW).toFixed(3) : 0, cx: s ? +((s[0] + s[1]) / 2 / c.width).toFixed(3) : 0 });
  }
  return { size: [c.width, c.height], top, bottom, height: bottom - top, maxWidth: maxW, table };
}, src, Number(threshold), Number(rows));
console.log(JSON.stringify({ file: path.basename(file), size: out.size, top: out.top, bottom: out.bottom, height: out.height, maxWidth: out.maxWidth, aspect_h_over_w: +(out.height / out.maxWidth).toFixed(3) }));
console.log("t (0=top .. 1=bottom) : width/maxWidth");
console.log(out.table.map((r) => `${r.t.toFixed(2)}:${r.w.toFixed(2)}`).join("  "));
await browser.close();
