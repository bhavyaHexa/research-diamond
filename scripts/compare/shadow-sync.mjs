// Checks that the ground shadow is the same in the first frames after the camera restarts as in the
// converged frame (it is baked in world space, so it should be). Prints the mean absolute difference
// (0-255) over the shadow cells and over all cells for frame 1, 4 and 12 versus frame 34.
// Needs the dev server on :5173 (override with PORT) and Chrome + puppeteer-core.
import puppeteer from "puppeteer-core";
const port = process.env.PORT || 5173;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
page.setDefaultTimeout(120000);
page.on("pageerror", (e) => console.log("pageerror", String(e)));
await page.goto(`http://localhost:${port}/hexa-viewer.html`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const out = await page.evaluate(() => {
  const o = window.hexaViewer, GX = 48, GY = 30;
  const grab = () => {
    const c = o.renderer.domElement, g = document.createElement("canvas");
    g.width = c.width; g.height = c.height;
    const x = g.getContext("2d"); x.drawImage(c, 0, 0);
    const cw = g.width / GX, ch = g.height / GY, grid = [];
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const d = x.getImageData(Math.floor(i * cw), Math.floor(j * ch), Math.floor(cw), Math.floor(ch)).data, s = [0, 0, 0], m = d.length / 4;
      for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
      grid.push(s.map((a) => a / m));
    }
    return grid;
  };
  const run = (n) => { o.resetCamera(); let g; for (let i = 1; i <= 34; i++) { o.tick(); if (n.includes(i)) g = { ...(g || {}), [i]: grab() }; } return g; };
  const frames = run([1, 4, 12, 34]);
  const ref = frames[34], mean = (c) => (c[0] + c[1] + c[2]) / 3;
  const shadow = ref.map((c, i) => (mean(c) >= 225 && mean(c) < 252 ? i : -1)).filter((i) => i >= 0);
  const diff = (a, idx) => idx.reduce((s, i) => s + (Math.abs(a[i][0] - ref[i][0]) + Math.abs(a[i][1] - ref[i][1]) + Math.abs(a[i][2] - ref[i][2])) / 3, 0) / idx.length;
  const all = ref.map((_, i) => i);
  const res = { shadowCells: shadow.length, shadowMeanLevel: +(shadow.reduce((s, i) => s + mean(ref[i]), 0) / shadow.length).toFixed(1) };
  for (const n of [1, 4, 12]) res[`frame${n}`] = { shadowAbs: +diff(frames[n], shadow).toFixed(2), allAbs: +diff(frames[n], all).toFixed(2) };
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
