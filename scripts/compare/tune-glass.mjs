// Tries several looks of the glass in one browser session and scores each against a reference photo.
// A variant is { name, studio?: {...StudioLook}, glass?: {glassReflection: 1, ...}, js?: "code with viewer" }.
// Usage: node scripts/compare/tune-glass.mjs <reference-image> <variants.json> [save-folder]
// Each render is the front view at the reference's framing; the score compares brightness inside the silhouette
// (rows 30%-90% of the height): mean, 5th percentile, median and the shares below 120, below 200 and at least 250.
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
const [reference, variantsFile, saveDir] = process.argv.slice(2);
const variants = JSON.parse(fs.readFileSync(variantsFile, "utf8"));
const port = process.env.PORT || 5173;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1000 });
page.setDefaultTimeout(120000);
const problems = [];
page.on("pageerror", (e) => problems.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) problems.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/hexa-viewer.html?bare`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.hexaViewer.model && window.hexaDev && window.hexaDev.studio, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));

const refSrc = "data:image/" + path.extname(reference).slice(1) + ";base64," + fs.readFileSync(reference).toString("base64");
const statsOf = `
  const statsOf = (d, w, h, threshold) => {
    const luma = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const spans = []; let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 20 && Math.min(d[i], d[i + 1], d[i + 2]) < threshold) { if (l < 0) l = x; r = x; } } spans.push(l < 0 ? null : [l, r]); if (l >= 0) { if (top < 0) top = y; bottom = y; } }
    const v = []; const y0 = Math.round(top + 0.3 * (bottom - top)), y1 = Math.round(top + 0.9 * (bottom - top));
    for (let y = y0; y <= y1; y++) { const s = spans[y]; if (!s) continue; for (let x = s[0]; x <= s[1]; x++) v.push(luma((y * w + x) * 4)); }
    v.sort((a, b) => a - b); const pct = (p) => v[Math.floor(p * (v.length - 1))]; const share = (f) => v.filter(f).length / v.length;
    return { mean: v.reduce((a, b) => a + b, 0) / v.length, p05: pct(0.05), median: pct(0.5), s120: share((q) => q < 120), s200: share((q) => q < 200), s250: share((q) => q >= 250) };
  };`;
const target = await page.evaluate(async (src, code) => {
  eval(code + "; window.__statsOf = statsOf;");
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  return window.__statsOf(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 215);
}, refSrc, statsOf);
const fmt = (s) => `mean ${s.mean.toFixed(1)}  p05 ${s.p05.toFixed(0)}  median ${s.median.toFixed(0)}  <120 ${(s.s120 * 100).toFixed(1)}%  <200 ${(s.s200 * 100).toFixed(1)}%  >=250 ${(s.s250 * 100).toFixed(1)}%`;
console.log("reference".padEnd(24), fmt(target));
const score = (s) => Math.abs(s.mean - target.mean) / 20 + Math.abs(s.p05 - target.p05) / 30 + Math.abs(s.median - target.median) / 15 + Math.abs(s.s120 - target.s120) * 10 + Math.abs(s.s200 - target.s200) * 5 + Math.abs(s.s250 - target.s250) * 5;

for (const variant of variants) {
  if (variant.studio) await page.evaluate((look) => window.hexaDev.studio(look), variant.studio);
  const out = await page.evaluate(async (variant, code) => {
    const viewer = window.hexaViewer;
    viewer.scene.traverse((o) => { if (o.isMesh && o.material.userData.glass && variant.glass) Object.entries(variant.glass).forEach(([k, val]) => { const u = o.material.userData.glass[k]; if (u) u.value = val; }); });
    if (variant.js) new Function("viewer", variant.js)(viewer);
    viewer.controls.minDistance = 0; viewer.camera.position.set(...(variant.camera || [0, 3.2, 10.2])); viewer.controls.update();
    viewer.pipeline.restart();
    for (let i = 0; i < 40; i++) viewer.tick();
    viewer.tick();
    eval(code + "; window.__statsOf = statsOf;");
    const canvas = viewer.renderer.domElement, c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext("2d"); g.drawImage(canvas, 0, 0);
    return { stats: window.__statsOf(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, 215), url: c.toDataURL("image/png") };
  }, variant, statsOf);
  if (saveDir) fs.writeFileSync(path.join(saveDir, variant.name + ".png"), Buffer.from(out.url.split(",")[1], "base64"));
  console.log(variant.name.padEnd(24), fmt(out.stats), "  score", score(out.stats).toFixed(2));
}
if (problems.length) console.log("problems:", problems.join(" | "));
await browser.close();
