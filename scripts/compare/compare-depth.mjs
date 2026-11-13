// Compares the engine G-buffer depth with the own depth pre-pass: coverage and depth differences.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(180000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = await page.evaluate(() => {
  const v = window.viewer, cam = v.scene.activeCamera;
  cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.();
  let T = 0; for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 });
  const t = v.getPlugin("GBuffer").getDepthNormal(); const r = v.renderer.rendererObject; const gl = r.getContext();
  const w = t.image.width, h = t.image.height; const buf = new Uint8Array(w * h * 4);
  // Read the texture straight through GL: attach it to a temporary framebuffer.
  const glTex = r.properties.get(t).__webglTexture; const fb = gl.createFramebuffer();
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; if (ok) gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev); gl.deleteFramebuffer(fb); const target = ok;
  const cn = v.scene.activeCamera.cameraObject; 
  return { w, h, hasTarget: !!target, data: Array.from(buf), near: cn.near, far: cn.far };
});
console.log("raw bytes corner / centre:", eng.data.slice(0,4), eng.data.slice(((450*eng.w)+720)*4, ((450*eng.w)+720)*4+4), "texIndex");
console.log("engine gbuffer", eng.w, eng.h, "target found", eng.hasTarget, "camera near/far", eng.near, eng.far);
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const own = await page.evaluate(() => {
  const o = window.hexaViewer; o.resetCamera(); for (let i = 0; i < 3; i++) o.tick();
  const g = o.pipeline.depth.target, w = g.width, h = g.height, b = new Float32Array(w * h * 4); o.renderer.readRenderTargetPixels(g, 0, 0, w, h, b);
  const range = window.ssr.ssrDepthRange.value.toArray();
  const out = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x) * 4; out[y * w + x] = b[s + 3] > 0.5 ? b[s] : -1; }
  return { w, h, z: Array.from(out), range };
});
await browser.close();
console.log("own depth", own.w, own.h, "range", own.range);
// engine decode: x = d0 + d1/255 (bytes /255), depth = x^2, viewZ = near + depth*(far-near) (positive distance)
const near = own.range[0], far = own.range[1];
const E = eng.data, n = eng.w * eng.h; let both = 0, onlyEng = 0, onlyOwn = 0, neither = 0, sumAbs = 0, big = 0;
const ez = new Float32Array(n);
for (let y = 0; y < eng.h; y++) for (let xx = 0; xx < eng.w; xx++) {
  const i = y * eng.w + xx, s = ((eng.h - 1 - y) * eng.w + xx) * 4; // readback is bottom-up
  const x = E[s] / 255 + E[s + 1] / 255 / 255, d = x * x;
  ez[i] = d > 0.999 ? -1 : near + d * (far - near);
}
let enginePlane = 0, ownPlane = 0;
for (let i = 0; i < n; i++) {
  const a = ez[i], b = own.z[i];
  if (a > 0 && b > 0) { both++; const dd = Math.abs(a - b); sumAbs += dd; if (dd > 0.05) big++; }
  else if (a > 0) onlyEng++; else if (b > 0) onlyOwn++; else neither++;
}
console.log({ both, onlyEngine: onlyEng, onlyOwn, neither, meanAbsDepthDiff: +(sumAbs / both).toFixed(4), pixelsDiffOver005: big });
