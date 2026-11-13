// Compares the accumulated HDR frame (before bloom, tone mapping, sRGB) of the engine and the own viewer.
// This separates scene shading (material, environment, SSR, AO) from the post chain.
// Needs: dev server on :5173, Chrome, puppeteer-core.
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
  const rt = v.getPlugin("Progressive").lastFrame;
  const r = v.renderer.rendererObject;
  const w = rt.width, h = rt.height;
  const buf = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  // RGBM range 16 -> linear float, top row first
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
    const m = buf[s + 3] / 255 * 16;
    out[d] = buf[s] / 255 * m; out[d + 1] = buf[s + 1] / 255 * m; out[d + 2] = buf[s + 2] / 255 * m; out[d + 3] = buf[s + 3] / 255;
  }
  const offsets = {}; v.scene.modelObject.traverse((o) => { if (o.material && o.material.isDiamondMaterial) { const t = o.geometry.userData.normalsCaptureOffsets; if (t) offsets[o.name.toLowerCase()] = { centerOffset: Array.from(t.centerOffset), radius: t.radius, offsetMatrix: Array.from(t.offsetMatrix), center: Array.from(t.center) }; } });
  return { w, h, type: rt.texture.type, data: Array.from(out), offsets };
});
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.ssr);
// Setups to try in the own viewer: node compare-history.mjs "name=js" ... (default: just the baseline).
const cli = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }));
const setups = Object.keys(cli).length ? cli : { base: "" };
await page.evaluate((o) => { window.__engineOffsets = o; }, eng.offsets);
const owns = {};
for (const [name, setup] of Object.entries(setups)) {
  owns[name] = await page.evaluate(async (setup) => {
    const o = window.hexaViewer;
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("own", "ssr", setup)(o, window.ssr);
    o.resetCamera(); o.pipeline.restart(); for (let i = 0; i < 36; i++) o.tick();
    const rt = o.pipeline.history[0]; const w = rt.width, h = rt.height;
    const buf = new Float32Array(w * h * 4);
    o.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, a = buf[s + 3];
      out[d] = a > 0.001 ? buf[s] / a : 0; out[d + 1] = a > 0.001 ? buf[s + 1] / a : 0; out[d + 2] = a > 0.001 ? buf[s + 2] / a : 0; out[d + 3] = a;
    }
    return { w, h, data: Array.from(out) };
  }, setup);
}
await browser.close();
console.log("engine target", eng.w, eng.h, "type", eng.type);
const E = eng.data, n = eng.w * eng.h;
for (const [name, own] of Object.entries(owns)) {
  if (eng.w !== own.w || eng.h !== own.h) { console.log(name, "size mismatch"); continue; }
  const O = own.data;
  const stats = (mask) => {
    let c = 0; const se = [0, 0, 0], so = [0, 0, 0]; const sxy = [0, 0, 0], sxx = [0, 0, 0], syy = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const e = [E[i * 4], E[i * 4 + 1], E[i * 4 + 2]], o = [O[i * 4], O[i * 4 + 1], O[i * 4 + 2]];
      if (!mask(e, o, O[i * 4 + 3])) continue;
      c++;
      for (let k = 0; k < 3; k++) { se[k] += e[k]; so[k] += o[k]; sxy[k] += e[k] * o[k]; sxx[k] += o[k] * o[k]; syy[k] += e[k] * e[k]; }
    }
    const f = (v) => v.map((x) => +(x / c).toFixed(4));
    const me = f(se), mo = f(so);
    const corr = [0, 1, 2].map((k) => { const cov = sxy[k] / c - me[k] * mo[k]; const vx = sxx[k] / c - mo[k] ** 2, vy = syy[k] / c - me[k] ** 2; return +(cov / Math.sqrt(vx * vy)).toFixed(3); });
    return { px: c, engine: me, own: mo, ownOverEngine: me.map((v, k) => +(mo[k] / v).toFixed(3)), corr };
  };
  console.log(name, "GOLD", JSON.stringify(stats((e, o, a) => a > 0.99 && e[0] > 1.8 * e[2] && o[0] > 1.8 * o[2] && e[0] > 0.2)));
  // Ratio own/engine by engine brightness (red channel): constant = pure gain, varying = shape difference.
  const edges = [0.2, 0.4, 0.6, 0.8, 1.0, 1.3, 1.8, 100];
  const bins = edges.map(() => ({ n: 0, e: 0, o: 0 }));
  for (let i = 0; i < n; i++) {
    const e = E[i * 4], o = O[i * 4], eb = E[i * 4 + 2], ob = O[i * 4 + 2];
    if (!(O[i * 4 + 3] > 0.99 && e > 1.8 * eb && o > 1.8 * ob && e > 0.2)) continue;
    const b = bins[edges.findIndex((x) => e < x)]; b.n++; b.e += e; b.o += o;
  }
  console.log(name, "BY-BRIGHTNESS", bins.map((b, k) => `<${edges[k]}: n=${b.n} own/eng=${(b.o / b.e).toFixed(3)}`).join(" | "));
  // Background / ground (own coverage near 0 or only shadow): what colour does each history hold there?
  let bn = 0; const be = [0, 0, 0], bo = [0, 0, 0]; let sn = 0; const se2 = [0, 0, 0], so2 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = O[i * 4 + 3];
    if (a < 0.02) { bn++; for (let k = 0; k < 3; k++) { be[k] += E[i * 4 + k]; bo[k] += 1; } }
    else if (a < 0.6) { sn++; for (let k = 0; k < 3; k++) { se2[k] += E[i * 4 + k]; so2[k] += O[i * 4 + k] * a + (1 - a); } }
  }
  console.log(name, "BACKGROUND (own coverage<0.02) engine mean", be.map((x) => +(x / bn).toFixed(3)), "own", bo.map((x) => +(x / bn).toFixed(3)), "n", bn);
  console.log(name, "SHADOW-ish (own coverage 0.02-0.6) engine mean", se2.map((x) => +(x / sn).toFixed(3)), "own (over white)", so2.map((x) => +(x / sn).toFixed(3)), "n", sn);
  console.log(name, "STONE", JSON.stringify(stats((e, o, a) => a > 0.99 && Math.abs(e[0] - e[2]) < 0.15 * e[0] && e[0] > 0.3 && e[0] < 20)));
}
