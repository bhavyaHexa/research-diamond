// Runs the OWN SSR but lets it read the ENGINE's accumulated frame as its history.
// If the SSR effect now matches the engine's, the difference lies in the history content,
// otherwise in the hit logic. Needs: dev server :5173, Chrome, puppeteer-core.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(240000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const readEngine = (ssrOn) => page.evaluate((ssrOn) => {
  const v = window.viewer, cam = v.scene.activeCamera;
  v.plugins.SSReflection.enabled = ssrOn; v.renderer.refreshPipeline();
  let T = 0; for (let cycle = 0; cycle < 5; cycle++) { cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); }
  const rt = v.getPlugin("Progressive").lastFrame, r = v.renderer.rendererObject, w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, m = buf[s + 3] / 255 * 16; out[s] = buf[s] / 255 * m; out[s + 1] = buf[s + 1] / 255 * m; out[s + 2] = buf[s + 2] / 255 * m; out[s + 3] = 1; }
  return { w, h, gl: Array.from(out) }; // GL row order (bottom-up) kept for texture upload
}, ssrOn);
const engAll = await readEngine(true), engNo = await readEngine(false);
await page.goto("http://localhost:5173/hexa-viewer.html?sample&bare", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.ssr);
const runOwn = (ssrOn, useEngineHistory, hist) => page.evaluate((ssrOn, useEngineHistory, hist, w, h) => {
  const o = window.hexaViewer, ssr = window.ssr;
  ssr.ssrIntensity.value = ssrOn ? 1 : 0;
  if (useEngineHistory) { const tex = window.devTexture(new Float32Array(hist), w, h); Object.defineProperty(ssr.tSsrHistory, "value", { get: () => tex, set() {}, configurable: true }); }
  o.resetCamera(); o.pipeline.restart(); for (let i = 0; i < 36; i++) o.tick();
  const rt = o.pipeline.history[0], buf = new Float32Array(w * h * 4); o.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  const out = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const a = buf[i * 4 + 3]; out[i * 4] = a > 0.001 ? buf[i * 4] / a : 0; out[i * 4 + 1] = a > 0.001 ? buf[i * 4 + 1] / a : 0; out[i * 4 + 2] = a > 0.001 ? buf[i * 4 + 2] / a : 0; out[i * 4 + 3] = a; }
  return Array.from(out);
}, ssrOn, useEngineHistory, hist, engAll.w, engAll.h);
const ownNo = await runOwn(false, false, null);
const ownEngHist = await runOwn(true, true, engAll.gl);   // own SSR reading the engine's history
const w = engAll.w, h = engAll.h, n = w * h, bands = 9;
// Compare in GL row order consistently: own arrays are GL order too (no flip applied above).
const stat = (A, N, name) => {
  const b = Array.from({ length: bands }, () => ({ a: 0, n: 0, c: 0 }));
  for (let i = 0; i < n; i++) { if (!(ownNo[i * 4 + 3] > 0.99 && ownNo[i * 4] > 1.8 * ownNo[i * 4 + 2])) continue; const y = h - 1 - ((i / w) | 0); const k = Math.min(bands - 1, Math.floor(y / h * bands)); b[k].a += A[i * 4]; b[k].n += N[i * 4]; b[k].c++; }
  console.log(name.padEnd(26), b.map((x, k) => x.c ? `${k}:${(x.a / x.n).toFixed(3)}` : `${k}:-`).join(" "));
};
stat(engAll.gl, engNo.gl, "engine all/noSsr");
stat(ownEngHist, ownNo, "own SSR + engine history");
await browser.close();
