// Measures the own viewer against the engine viewer at the same camera, headless.
// Needs: the dev server on http://localhost:5173, Chrome, and `npm i -D puppeteer-core`.
// Prints per-class (gold, stone, shadow, all) mean difference (own - engine) and mean abs difference
// over a 48x30 grid of cell averages. Compare converged frames only.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const GX = 48, GY = 30;

function stats(engine, own) {
  const classes = { gold: [], shadow: [], stone: [], all: [] };
  for (let i = 0; i < engine.length; i++) {
    const e = engine[i], o = own[i];
    const em = (e[0] + e[1] + e[2]) / 3;
    const cell = { e, o, d: e.map((v, k) => o[k] - v) };
    classes.all.push(cell);
    if (e[0] - e[2] > 45 && em < 225) classes.gold.push(cell);
    else if (e[0] - e[2] < 18 && em < 215) classes.stone.push(cell);
    else if (em >= 215 && em < 252) classes.shadow.push(cell);
  }
  const mean = (cells, pick) => [0, 1, 2].map((c) => +(cells.reduce((s, x) => s + pick(x)[c], 0) / (cells.length || 1)).toFixed(2));
  const out = {};
  for (const [k, cells] of Object.entries(classes)) {
    const d = mean(cells, (x) => x.d);
    const abs = +(cells.reduce((s, x) => s + (Math.abs(x.d[0]) + Math.abs(x.d[1]) + Math.abs(x.d[2])) / 3, 0) / (cells.length || 1)).toFixed(2);
    out[k] = { n: cells.length, delta: d, abs };
  }
  return { own: mean(classes.gold, (x) => x.o), engine: mean(classes.gold, (x) => x.e), delta: out.gold.delta, deltaStd: [0,0,0], classes: out };
}

async function grid(page) {
  return page.evaluate((GX, GY) => {
    const c = document.querySelector("canvas");
    const g = document.createElement("canvas");
    g.width = c.width; g.height = c.height;
    const x = g.getContext("2d", { willReadFrequently: true });
    x.drawImage(c, 0, 0);
    const cw = g.width / GX, ch = g.height / GY;
    const out = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const d = x.getImageData(Math.floor(i * cw), Math.floor(j * ch), Math.max(1, Math.floor(cw)), Math.max(1, Math.floor(ch))).data;
      const s = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
      const m = d.length / 4;
      out.push([s[0] / m, s[1] / m, s[2] / m]);
    }
    return { w: c.width, h: c.height, grid: out };
  }, GX, GY);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-gl=angle", "--enable-webgl"],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);

const engineInfo = await (async () => {
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
  await page.waitForSelector(".loader.done");
  return page.evaluate((GX, GY) => {
    const v = window.viewer;
    const cam = v.scene.activeCamera;
    cam.position.set(-6.51, 7.65, -2.74);
    cam.positionUpdated?.();
    cam.target?.set?.(0, 0, 0);
    cam.setDirty?.();
    v.setDirty?.();
    let T = 0; for (let cycle = 0; cycle < 5; cycle++) { cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); }
    const c = document.querySelector("canvas");
    const g = document.createElement("canvas");
    g.width = c.width; g.height = c.height;
    const x = g.getContext("2d", { willReadFrequently: true });
    x.drawImage(c, 0, 0);
    const cw = g.width / GX, ch = g.height / GY;
    const cells = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const d = x.getImageData(Math.floor(i * cw), Math.floor(j * ch), Math.max(1, Math.floor(cw)), Math.max(1, Math.floor(ch))).data;
      const s = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
      const m = d.length / 4;
      cells.push([s[0] / m, s[1] / m, s[2] / m]);
    }
    const ssr = v.getPlugin("SSReflection");
    const light = v.getPlugin("RandomizedDirectionalLight");
    const nums = (o) => {
      const out = {};
      if (!o) return out;
      for (const k of Object.keys(o)) {
        const val = o[k];
        if (typeof val === "number" || typeof val === "boolean" || typeof val === "string") out[k] = val;
      }
      return out;
    };
    const lights = [];
    v.scene.traverse?.((o) => {
      if (o.isDirectionalLight) lights.push({ color: o.color?.getHexString?.(), intensity: o.intensity, visible: o.visible });
    });
    let metal = null;
    v.scene.traverse?.((o) => {
      const m = o.material;
      if (!metal && m?.metalness === 1 && m?.color) metal = { color: [m.color.r, m.color.g, m.color.b], roughness: m.roughness, metalness: m.metalness, ior: m.ior, env: m.envMapIntensity };
    });
    return {
      envRotation: v.scene.environment?.rotation,
      fixedEnv: v.scene.fixedEnvMapDirection,
      envIntensity: v.scene.envMapIntensity,
      ssr: nums(ssr),
      lightPlugin: nums(light),
      lights,
      metal,
      output: v.renderer.outputColorSpace,
      tone: v.renderer.toneMapping,
      w: c.width, h: c.height, grid: cells,
    };
  }, GX, GY);
})();

const own = await (async () => {
  await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.hexaViewer && window.ssr);
  const run = (setup) => page.evaluate((setupSrc, GX, GY) => {
    const own = window.hexaViewer;
    const evalSetup = new Function("own", "ssr", setupSrc);
    own.resetCamera();
    evalSetup(own, window.ssr);
    for (let i = 0; i < 36; i++) own.tick();
    const c = own.renderer.domElement;
    const g = document.createElement("canvas");
    g.width = c.width; g.height = c.height;
    const x = g.getContext("2d", { willReadFrequently: true });
    x.drawImage(c, 0, 0);
    const cw = g.width / GX, ch = g.height / GY;
    const cells = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const d = x.getImageData(Math.floor(i * cw), Math.floor(j * ch), Math.max(1, Math.floor(cw)), Math.max(1, Math.floor(ch))).data;
      const s = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
      const m = d.length / 4;
      cells.push([s[0] / m, s[1] / m, s[2] / m]);
    }
    const r = own.renderer;
    return {
      w: c.width, h: c.height, grid: cells,
      output: r.outputColorSpace,
      drawing: r.getContext().drawingBufferColorSpace,
      light: own.ground.light.color.getHexString(),
      yaw: own.scene.environmentRotation.y,
      order: own.scene.environmentRotation.order,
    };
  }, setup, GX, GY);
  const out = {};
  // Setups to compare: name -> JS run in the own viewer page (own, ssr, window.settings available).
  // Pass your own on the command line: node scripts/compare/compare-own-vs-engine.mjs "name=js" ...
  const cli = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }));
  const defs = Object.keys(cli).length ? cli : { base: "" };
  for (const [k, v] of Object.entries(defs)) out[k] = await run(v);
  return out;
})();

const { grid: engineGrid, ...engineMeta } = engineInfo;
const res = {};
for (const k of Object.keys(own)) { const st = stats(engineGrid, own[k].grid); res[k] = st.classes; }
console.log("engine", JSON.stringify(engineInfo.grid ? stats(engineGrid, engineGrid).engine : null));
console.log(JSON.stringify(res));
await browser.close();
