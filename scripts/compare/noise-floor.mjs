// How similar are two renders of the SAME viewer? Gives the best correlation any match could reach.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(240000);
const corrFn = `(A, B, mask) => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < A.length / 4; i++) { if (!mask(A, B, i)) continue; const a = A[i*4+1], b = B[i*4+1]; n++; sa += a; sb += b; saa += a*a; sbb += b*b; sab += a*b; } const cov = sab/n - sa/n*sb/n; return +(cov / Math.sqrt((saa/n - (sa/n)**2) * (sbb/n - (sb/n)**2))).toFixed(3); }`;
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log("engine vs engine (green channel):", JSON.stringify(await page.evaluate((fn) => {
  const v = window.viewer, cam = v.scene.activeCamera; let T = 0;
  const read = () => { const rt = v.getPlugin("Progressive").lastFrame, r = v.renderer.rendererObject, w = rt.width, h = rt.height, b = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, b); const o = new Float32Array(w * h * 4); for (let i = 0; i < w * h; i++) { const m = b[i*4+3] / 255 * 16; o[i*4] = b[i*4]/255*m; o[i*4+1] = b[i*4+1]/255*m; o[i*4+2] = b[i*4+2]/255*m; o[i*4+3] = 1; } return o; };
  const cycle = () => { cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); };
  for (let c = 0; c < 5; c++) cycle(); const A = read(); cycle(); const B = read();
  const f = eval(fn);
  const stone = (A, B, i) => Math.abs(A[i*4] - A[i*4+2]) < 0.15 * A[i*4] && A[i*4] > 0.3 && A[i*4] < 20;
  const gold = (A, B, i) => A[i*4] > 1.8 * A[i*4+2] && A[i*4] > 0.2;
  return { stone: f(A, B, stone), gold: f(A, B, gold) };
}, corrFn)));
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
console.log("own vs own (green channel):", JSON.stringify(await page.evaluate((fn) => {
  const o = window.hexaViewer;
  const read = () => { const rt = o.pipeline.history[0], w = rt.width, h = rt.height, b = new Float32Array(w * h * 4); o.renderer.readRenderTargetPixels(rt, 0, 0, w, h, b); const out = new Float32Array(w * h * 4); for (let i = 0; i < w * h; i++) { const a = b[i*4+3]; out[i*4] = a > 0.001 ? b[i*4]/a : 0; out[i*4+1] = a > 0.001 ? b[i*4+1]/a : 0; out[i*4+2] = a > 0.001 ? b[i*4+2]/a : 0; out[i*4+3] = a; } return out; };
  const run = () => { o.resetCamera(); o.pipeline.restart(); for (let i = 0; i < 36; i++) o.tick(); };
  window.settings.jitterOffset = 0; run(); const A = read(); window.settings.jitterOffset = 13; run(); const B = read(); window.settings.jitterOffset = 0;
  const f = eval(fn);
  const stone = (A, B, i) => Math.abs(A[i*4] - A[i*4+2]) < 0.15 * A[i*4] && A[i*4] > 0.3 && A[i*4] < 20;
  const gold = (A, B, i) => A[i*4] > 1.8 * A[i*4+2] && A[i*4] > 0.2;
  return { stone: f(A, B, stone), gold: f(A, B, gold) };
}, corrFn)));
await browser.close();
