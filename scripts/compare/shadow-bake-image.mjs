// Saves the baked ground shadow as one image with three panels: shadow (green channel), caustic light (red channel,
// scaled), and the result the ground shows (shadow - light). Dark = more shadow.
// Usage: node scripts/compare/shadow-bake-image.mjs <out.png> [query] [setup-js]
import puppeteer from "puppeteer-core";
import fs from "fs";
const [out, query = "?bare", setup = ""] = process.argv.slice(2);
const port = process.env.PORT || 5173;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
page.setDefaultTimeout(90000);
await page.goto(`http://localhost:${port}/hexa-viewer.html${query}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.hexaViewer.model, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));
const result = await page.evaluate((js) => {
  const v = window.hexaViewer;
  if (js) new Function("viewer", js)(v);
  const t = v.ground.shadowTarget, n = t.width * t.height, buf = new Uint16Array(n * 4);
  v.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
  const half = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : s * 2 ** (e - 15) * (1 + f / 1024); };
  const S = 512, k = t.width / S, c = document.createElement("canvas");
  c.width = S * 3; c.height = S;
  const g = c.getContext("2d"), img = g.createImageData(S * 3, S);
  let rMax = 0, rSum = 0, gSum = 0, count = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (Math.floor((S - 1 - y) * k) * t.width + Math.floor(x * k)) * 4; // flip: texture row 0 is the bottom
    const r = half(buf[i]), gr = half(buf[i + 1]), fin = Math.max(gr - r, 0);
    rMax = Math.max(rMax, r); rSum += r; gSum += gr; count++;
    const put = (px, value) => { const o = (y * S * 3 + px) * 4; const q = 255 - Math.min(255, Math.max(0, value * 255)); img.data[o] = img.data[o + 1] = img.data[o + 2] = q; img.data[o + 3] = 255; };
    put(x, gr); put(S + x, Math.min(r, 1)); put(2 * S + x, fin);
  }
  g.putImageData(img, 0, 0);
  return { url: c.toDataURL("image/png"), rMax: +rMax.toFixed(2), rMean: +(rSum / count).toFixed(4), shadowMean: +(gSum / count).toFixed(4) };
}, setup);
fs.writeFileSync(out, Buffer.from(result.url.split(",")[1], "base64"));
console.log(JSON.stringify({ photonMax: result.rMax, photonMean: result.rMean, shadowMean: result.shadowMean }));
await browser.close();
