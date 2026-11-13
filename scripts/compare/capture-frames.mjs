// Saves tmp-engine.png and tmp-<variant>.png (same camera, converged) for visual comparison.
// Needs: the dev server on http://localhost:5173, Chrome, and `npm i -D puppeteer-core`.
import puppeteer from "puppeteer-core";
import fs from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
const save = (name, u) => fs.writeFileSync(name, Buffer.from(u.split(",")[1], "base64"));
const grab = `(() => { const c = document.querySelector("canvas"); const g = document.createElement("canvas"); g.width = c.width; g.height = c.height; g.getContext("2d").drawImage(c, 0, 0); return g.toDataURL("image/png"); })()`;
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eu = await page.evaluate((grab) => {
  const v = window.viewer, cam = v.scene.activeCamera;
  cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.();
  let T = 0; for (let cycle = 0; cycle < 5; cycle++) { cam.setDirty?.(); v.setDirty?.(); for (let i = 0; i < 40; i++) v._animationLoop({ time: (T += 16), delta: 16, deltaTime: 16 }); }
  return eval(grab);
}, grab);
save("tmp-engine.png", eu);
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const variants = { own: "" }; // name -> JS setup run in the own page before the frame is captured
for (const [name, setup] of Object.entries(variants)) {
  const u = await page.evaluate((grab, setup) => { const own = window.hexaViewer; new Function("own","ssr", setup)(own, window.ssr); own.resetCamera(); for (let i = 0; i < 36; i++) own.tick(); return eval(grab); }, grab, setup);
  save(`tmp-${name}.png`, u);
}
await browser.close();
