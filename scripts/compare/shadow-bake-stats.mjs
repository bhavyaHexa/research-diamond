// Prints statistics of the baked ground shadow texture (green channel): max, mean, share of texels above 1%.
import puppeteer from "puppeteer-core";
const port = process.env.PORT || 5173;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
page.setDefaultTimeout(120000);
page.on("pageerror", (e) => console.log("pageerror", String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(m.type(), m.text().slice(0, 300)); });
await page.goto(`http://localhost:${port}/hexa-viewer.html?sample&bare`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
console.log(JSON.stringify(await page.evaluate(() => {
  const o = window.hexaViewer, t = o.ground.shadowTarget;
  if (!t) return "no shadowTarget";
  const n = t.width * t.height, buf = new Uint16Array(n * 4);
  o.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf);
  const half = (h) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : s * 2 ** (e - 15) * (1 + f / 1024); };
  let max = 0, sum = 0, over = 0, sumA = 0;
  for (let i = 0; i < n; i++) { const g = half(buf[i * 4 + 1]); sum += g; sumA += half(buf[i * 4 + 3]); if (g > max) max = g; if (g > 0.01) over++; }
  return { size: t.width, maxG: +max.toFixed(3), meanG: +(sum / n).toFixed(4), meanA: +(sumA / n).toFixed(4), shareOver1pct: +(over / n).toFixed(4) };
})));
await browser.close();
