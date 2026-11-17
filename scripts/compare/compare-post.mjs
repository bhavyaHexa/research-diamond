// Feeds the ENGINE's accumulated HDR frame through the OWN composite pass and compares the result
// with the engine's final image. If they match, the post chain (tone map, contrast, sRGB) is equal
// and any remaining difference is in the scene shading. Needs: dev server :5173, Chrome, puppeteer-core.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = await page.evaluate(() => {
  const v = window.viewer, cam = v.scene.activeCamera;
  cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.();
  // The engine reads its previous frame for SSR, so its brightness settles over several accumulation cycles.
    let T = 0; for (let cycle = 0; cycle < 5; cycle++) { cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); }
  // final canvas, read in the same task as the render
  const c = document.querySelector("canvas"); const g = document.createElement("canvas"); g.width = c.width; g.height = c.height;
  const x = g.getContext("2d", { willReadFrequently: true }); x.drawImage(c, 0, 0);
  const finalPx = Array.from(x.getImageData(0, 0, g.width, g.height).data);
  const rt = v.getPlugin("Progressive").lastFrame, r = v.renderer.rendererObject, w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  const hdr = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const s = ((h - 1 - y) * w + xx) * 4, d = (y * w + xx) * 4, m = buf[s + 3] / 255 * 16;
    hdr[d] = buf[s] / 255 * m; hdr[d + 1] = buf[s + 1] / 255 * m; hdr[d + 2] = buf[s + 2] / 255 * m; hdr[d + 3] = 1;
  }
  return { w, h, finalPx, hdr: Array.from(hdr) };
});
await page.goto("http://localhost:5173/hexa-viewer.html?sample&bare", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const own = await page.evaluate((hdrArr, w, h) => {
  const o = window.hexaViewer; o.resetCamera(); for (let i = 0; i < 3; i++) o.tick();
  const P = o.pipeline;
  // upload engine HDR (flip rows back to GL order) as a float texture
  const flipped = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) flipped.set(hdrArr.slice((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const tex = window.devTexture(flipped, w, h);
  P.composite.uniforms.tScene.value = tex; P.composite.uniforms.tBloom.value = P.sceneTarget.texture;
  P.composite.uniforms.bloomIntensity.value = 0;
  P.pass(P.composite, null);
  const c = o.renderer.domElement; const g = document.createElement("canvas"); g.width = c.width; g.height = c.height;
  const x = g.getContext("2d", { willReadFrequently: true }); x.drawImage(c, 0, 0);
  return { w: g.width, h: g.height, finalPx: Array.from(x.getImageData(0, 0, g.width, g.height).data) };
}, eng.hdr, eng.w, eng.h);
await browser.close();
console.log("sizes", eng.w, eng.h, own.w, own.h);
const A = eng.finalPx, B = own.finalPx, hdr = eng.hdr, n = eng.w * eng.h;
let c = 0; const sa = [0, 0, 0], sb = [0, 0, 0]; let abs = 0;
for (let i = 0; i < n; i++) {
  const r = hdr[i * 4], b = hdr[i * 4 + 2];
  if (!(r > 1.8 * b && r > 0.2)) continue;
  c++; for (let k = 0; k < 3; k++) { sa[k] += A[i * 4 + k]; sb[k] += B[i * 4 + k]; abs += Math.abs(A[i * 4 + k] - B[i * 4 + k]) / 3; }
}
console.log("gold pixels", c, "engine final", sa.map((v) => +(v / c).toFixed(2)), "own composite of engine HDR", sb.map((v) => +(v / c).toFixed(2)), "mean abs diff", +(abs / c).toFixed(2));
