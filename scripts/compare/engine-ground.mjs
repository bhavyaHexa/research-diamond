// Prints how the engine's ground plane is set up.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  const v = window.viewer; const out = [];
  v.scene.modelObject.traverse((o) => {
    if (!o.isMesh || !/ground/i.test(o.name + (o.parent ? o.parent.name : ""))) return;
    o.geometry.computeBoundingBox(); o.updateMatrixWorld(true);
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const m = o.material;
    out.push({ name: o.name, parent: o.parent && o.parent.name, bbox: [b.min.toArray().map((x) => +x.toFixed(2)), b.max.toArray().map((x) => +x.toFixed(2))], type: m.type, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, depthTest: m.depthTest, color: m.color && m.color.getHexString(), visible: o.visible, layers: o.layers.mask, castShadow: o.castShadow, receiveShadow: o.receiveShadow, side: m.side, userData: Object.keys(o.userData), matUserData: Object.keys(m.userData || {}) });
  });
  const g = v.getPlugin("Ground"); const gp = {}; if (g) for (const k of Object.keys(g)) { const x = g[k]; if (["number", "boolean", "string"].includes(typeof x)) gp[k] = x; }
  return { meshes: out, groundPlugin: gp };
}), null, 1));
await browser.close();
