// Prints the SSR / AO related uniform and define values the engine uses on the gold material.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  const v = window.viewer, cam = v.scene.activeCamera;
  cam.position.set(-6.51, 7.65, -2.74); cam.positionUpdated?.(); cam.target?.set?.(0, 0, 0); cam.setDirty?.(); v.setDirty?.();
  for (let i = 0; i < 40; i++) v._animationLoop({ time: i * 16, delta: 16, deltaTime: 16 });
  const r = v.renderer.rendererObject; let gold; v.scene.modelObject.traverse((o) => { if (!gold && o.material && o.material.metalness === 1) gold = o.material; });
  const props = r.properties.get(gold); const u = props.uniforms || {};
  const out = {};
  for (const k of Object.keys(u)) if (/ssr|objectRadius|tolerance|^radius|autoRadius|sceneBounding|frameCount|ssao|cameraPositionWorld|projection/i.test(k)) { const x = u[k].value; out[k] = x && x.toArray ? x.toArray().slice(0, 16) : (typeof x === "object" ? "[object]" : x); }
  const defs = {}; for (const k of Object.keys(gold.defines || {})) defs[k] = gold.defines[k];
  const prog = props.currentProgram; const parameters = prog && prog.parameters ? {} : null;
  return { uniforms: out, defines: defs, sceneBounding: v.scene.getBounds ? undefined : undefined };
}), null, 1));
await browser.close();
