// Which stone geometries share a normal-capture map in the engine?
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  const rows = [], maps = {}, geos = {};
  window.viewer.scene.modelObject.traverse((o) => { if (o.material && o.material.isDiamondMaterial) { const g = o.geometry, t = g.userData._normalsCaptureMap; const mk = t ? String(t.id ?? t.texture?.uuid ?? t.uuid ?? "obj").slice(0, 6) : "none", gk = String(g.uuid).slice(0, 4); rows.push({ name: o.name, geo: gk, map: mk, verts: g.attributes.position.count, r: g.userData.normalsCaptureOffsets && +g.userData.normalsCaptureOffsets.radius.toFixed(3) }); maps[mk] = (maps[mk] || 0) + 1; geos[gk] = (geos[gk] || 0) + 1; } });
  return { count: rows.length, uniqueMaps: Object.keys(maps).length, uniqueGeometries: Object.keys(geos).length, mapUsers: maps, sample: rows.filter((r) => /^D(5|4001|4002|1001)$/i.test(r.name)) };
}), null, 1));
await browser.close();
