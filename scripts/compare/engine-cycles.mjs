// How stable is the engine's gold brightness across accumulation cycles at a fixed camera?
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(180000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  const v = window.viewer, cam = v.scene.activeCamera, res = [];
  const read = () => { const rt = v.getPlugin("Progressive").lastFrame, r = v.renderer.rendererObject, w = rt.width, h = rt.height; const b = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, b); let n = 0, s = 0; for (let i = 0; i < w * h; i++) { const m = b[i * 4 + 3] / 255 * 16, R = b[i * 4] / 255 * m, B = b[i * 4 + 2] / 255 * m; if (R > 1.8 * B && R > 0.2) { n++; s += R; } } return { n, meanR: +(s / n).toFixed(4) }; };
  let T = 0;
  for (let cycle = 0; cycle < 6; cycle++) {
    cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.setDirty?.(); v.setDirty?.();
    for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 });
    res.push({ cycle, ...read(), frame: v.getPlugin("Progressive").frameCount ?? null });
  }
  return res;
}), null, 0));
await browser.close();
