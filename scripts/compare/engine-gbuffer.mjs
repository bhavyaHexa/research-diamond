// Prints the engine G-buffer target sizes and filters, and the tLastFrame / history filters.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  const v = window.viewer; const g = v.getPlugin("GBuffer"); const out = {};
  const desc = (t) => t && ({ w: t.image && t.image.width, h: t.image && t.image.height, type: t.type, format: t.format, min: t.minFilter, mag: t.magFilter });
  out.depthNormal = desc(g.getDepthNormal()); out.flags = desc(g.getFlagsTexture && g.getFlagsTexture());
  const p = v.getPlugin("Progressive"); out.lastFrame = desc(p.lastFrame && p.lastFrame.texture);
  out.gbufferKeys = Object.keys(g).filter((k) => /scale|size|res|jitter|mode|depth/i.test(k)).slice(0, 20);
  out.gProps = {}; for (const k of out.gbufferKeys) { const x = g[k]; if (["number", "boolean", "string"].includes(typeof x)) out.gProps[k] = x; }
  out.canvas = [v.canvas.width, v.canvas.height]; out.dcs = v.renderer.displayCanvasScaling;
  return out;
}), null, 1));
await browser.close();
