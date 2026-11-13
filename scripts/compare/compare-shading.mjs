// Compares the accumulated HDR gold of the engine and the own viewer with effects switched off in
// both, to find which term (environment, SSR, AO) differs. Needs: dev server :5173, Chrome, puppeteer-core.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(180000);
const configs = { all: { ssr: true, ao: true }, noSsr: { ssr: false, ao: true }, dbg: { ssr: true, ao: true, debug: true } };

await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = {};
for (const [name, cfg] of Object.entries(configs)) {
  if (cfg.debug) continue;
  eng[name] = await page.evaluate((cfg) => {
    const v = window.viewer, cam = v.scene.activeCamera;
    v.plugins.SSReflection.enabled = cfg.ssr; v.plugins.SSAO.enabled = cfg.ao;
    v.renderer.refreshPipeline();
    cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.();
    // The engine reads its previous frame for SSR, so its brightness settles over several accumulation cycles.
    let T = 0; for (let cycle = 0; cycle < 5; cycle++) { cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); }
    const rt = v.getPlugin("Progressive").lastFrame, r = v.renderer.rendererObject, w = rt.width, h = rt.height;
    const buf = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, m = buf[s + 3] / 255 * 16;
      out[d] = buf[s] / 255 * m; out[d + 1] = buf[s + 1] / 255 * m; out[d + 2] = buf[s + 2] / 255 * m;
    }
    return { w, h, data: Array.from(out) };
  }, cfg);
}
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.ssr);
const ownSetup = process.argv[2] || ""; // optional JS run in the own page before measuring (own, ssr, window.settings)
const own = {};
for (const [name, cfg] of Object.entries(configs)) {
  own[name] = await page.evaluate((cfg, ownSetup) => {
    const o = window.hexaViewer;
    new Function("own", "ssr", ownSetup)(o, window.ssr);
    window.ssr.ssrIntensity.value = cfg.ssr ? 1 : 0; window.ssr.ssrDebug.value = cfg.debug ? 1 : 0;
    o.pipeline.ssao.ao.uniforms.intensity.value = cfg.ao ? 0.1 : 0;
    o.resetCamera(); o.pipeline.restart(); for (let i = 0; i < 36; i++) o.tick();
    const rt = o.pipeline.history[0], w = rt.width, h = rt.height;
    const buf = new Float32Array(w * h * 4); o.renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, a = buf[s + 3];
      out[d] = a > 0.001 ? buf[s] / a : 0; out[d + 1] = a > 0.001 ? buf[s + 1] / a : 0; out[d + 2] = a > 0.001 ? buf[s + 2] / a : 0; out[d + 3] = a;
    }
    let nz8 = null;
    if (cfg.ssr) {
      const g = o.pipeline.depth.target, gb = new Float32Array(w * h * 4); o.renderer.readRenderTargetPixels(g, 0, 0, w, h, gb);
      nz8 = new Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sIdx = ((h - 1 - y) * w + x) * 4; const nx = gb[sIdx + 1], ny = gb[sIdx + 2]; nz8[y * w + x] = Math.round(255 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))); }
    }
    return { w, h, data: Array.from(out), nz8 };
  }, cfg, ownSetup);
}
await browser.close();
for (const name of Object.keys(configs).filter((k) => !configs[k].debug)) {
  const E = eng[name].data, O = own[name].data, n = eng[name].w * eng[name].h;
  let c = 0; const se = [0, 0, 0], so = [0, 0, 0], sxy = [0, 0, 0], sxx = [0, 0, 0], syy = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const e = [E[i * 4], E[i * 4 + 1], E[i * 4 + 2]], o = [O[i * 4], O[i * 4 + 1], O[i * 4 + 2]];
    if (!(O[i * 4 + 3] > 0.99 && e[0] > 1.8 * e[2] && o[0] > 1.8 * o[2] && e[0] > 0.2)) continue;
    c++; for (let k = 0; k < 3; k++) { se[k] += e[k]; so[k] += o[k]; sxy[k] += e[k] * o[k]; sxx[k] += o[k] * o[k]; syy[k] += e[k] * e[k]; }
  }
  const me = se.map((x) => x / c), mo = so.map((x) => x / c);
  const corr = [0, 1, 2].map((k) => +(((sxy[k] / c - me[k] * mo[k])) / Math.sqrt((sxx[k] / c - mo[k] ** 2) * (syy[k] / c - me[k] ** 2))).toFixed(3));
  // own/engine red ratio by screen row band (gold pixels): shows where the difference lives
  const W = eng[name].w, H = eng[name].h, bands = 9, bs = Array.from({ length: bands }, () => ({ e: 0, o: 0, n: 0 }));
  for (let i = 0; i < n; i++) {
    const e0 = E[i * 4], e2 = E[i * 4 + 2], o0 = O[i * 4], o2 = O[i * 4 + 2];
    if (!(O[i * 4 + 3] > 0.99 && e0 > 1.8 * e2 && o0 > 1.8 * o2 && e0 > 0.2)) continue;
    const b = bs[Math.min(bands - 1, Math.floor(((i / W) | 0) / H * bands))]; b.e += e0; b.o += o0; b.n++;
  }
  console.log(name.padEnd(8), "rows", bs.map((b, k) => `${k}:${b.n ? (b.o / b.e).toFixed(2) : "-"}`).join(" "));
  console.log(name.padEnd(8), "px", c, "engine", me.map((x) => +x.toFixed(3)), "own", mo.map((x) => +x.toFixed(3)), "own/engine", me.map((x, k) => +(mo[k] / x).toFixed(3)), "corr", corr);
}

// How much does SSR change the gold, per screen band? (all / noSsr, red channel, same pixels in both viewers)
{
  const Ea = eng.all.data, En = eng.noSsr.data, Oa = own.all.data, On = own.noSsr.data, W = eng.all.w, H = eng.all.h, n = W * H, bands = 9;
  const b = Array.from({ length: bands }, () => ({ ea: 0, en: 0, oa: 0, on: 0, n: 0 }));
  for (let i = 0; i < n; i++) {
    const e = En[i * 4], eb = En[i * 4 + 2], o = On[i * 4], ob = On[i * 4 + 2];
    if (!(On[i * 4 + 3] > 0.99 && e > 1.8 * eb && o > 1.8 * ob && e > 0.2)) continue;
    const k = Math.min(bands - 1, Math.floor(((i / W) | 0) / H * bands));
    b[k].ea += Ea[i * 4]; b[k].en += e; b[k].oa += Oa[i * 4]; b[k].on += o; b[k].n++;
  }
  console.log("SSR effect (all/noSsr) by row band: engine | own");
  b.forEach((x, k) => x.n && console.log(" band", k, "n", x.n, "engine", (x.ea / x.en).toFixed(3), "own", (x.oa / x.on).toFixed(3)));
}

// Write the SSR effect (all / noSsr, red) as grey images for both viewers: ssr-effect-engine.ppm / ssr-effect-own.ppm
{
  const fs = await import("fs");
  const W = eng.all.w, H = eng.all.h;
  const mk = (A, N, name, mask) => {
    const buf = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      let v = 255;
      if (mask(i)) { const r = N[i * 4] > 0.05 ? A[i * 4] / N[i * 4] : 1; v = Math.max(0, Math.min(255, Math.round(255 * (r - 0.4) / 0.8))); }
      buf[i * 3] = buf[i * 3 + 1] = buf[i * 3 + 2] = v;
    }
    fs.writeFileSync(name, Buffer.concat([Buffer.from(`P6
${W} ${H}
255
`), buf]));
  };
  const On = own.noSsr.data;
  const mask = (i) => On[i * 4 + 3] > 0.99 && On[i * 4] > 1.8 * On[i * 4 + 2];
  mk(eng.all.data, eng.noSsr.data, "ssr-effect-engine.ppm", mask);
  mk(own.all.data, own.noSsr.data, "ssr-effect-own.ppm", mask);
}

// SSR effect (all / noSsr, red) against how much the surface faces the camera (nz of the view-space normal).
{
  const Ea = eng.all.data, En = eng.noSsr.data, Oa = own.all.data, On = own.noSsr.data, nz = own.all.nz8, n = eng.all.w * eng.all.h;
  const edges = [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.01], b = edges.map(() => ({ ea: 0, en: 0, oa: 0, on: 0, n: 0 }));
  for (let i = 0; i < n; i++) {
    if (!(On[i * 4 + 3] > 0.99 && On[i * 4] > 1.8 * On[i * 4 + 2] && En[i * 4] > 0.2)) continue;
    const k = edges.findIndex((x) => nz[i] / 255 < x); b[k].ea += Ea[i * 4]; b[k].en += En[i * 4]; b[k].oa += Oa[i * 4]; b[k].on += On[i * 4]; b[k].n++;
  }
  console.log("SSR effect (all/noSsr) by facing (nz): engine | own");
  b.forEach((x, k) => x.n && console.log(" nz <", edges[k], "n", x.n, "engine", (x.ea / x.en).toFixed(3), "own", (x.oa / x.on).toFixed(3)));
}

// Own SSR hit probability x weight (debug render) over the gold mask, by row band and by facing.
{
  const D = own.dbg.data, On = own.noSsr.data, W = eng.all.w, H = eng.all.h, n = W * H, nz = own.all.nz8, bands = 9;
  const bb = Array.from({ length: bands }, () => ({ s: 0, n: 0 })), edges = [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.01], bn = edges.map(() => ({ s: 0, n: 0 }));
  for (let i = 0; i < n; i++) {
    if (!(On[i * 4 + 3] > 0.99 && On[i * 4] > 1.8 * On[i * 4 + 2])) continue;
    const k = Math.min(bands - 1, Math.floor(((i / W) | 0) / H * bands)); bb[k].s += D[i * 4]; bb[k].n++;
    const q = edges.findIndex((x) => nz[i] / 255 < x); bn[q].s += D[i * 4]; bn[q].n++;
  }
  console.log("own SSR hit x weight by band:", bb.map((x, k) => x.n ? `${k}:${(x.s / x.n).toFixed(2)}` : `${k}:-`).join(" "));
  console.log("own SSR hit x weight by nz:", bn.map((x, k) => x.n ? `<${edges[k]}:${(x.s / x.n).toFixed(2)}` : "-").join(" "));
}
