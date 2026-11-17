// Compares the per-stone values the diamond shader needs (centre, radius, alignment matrix)
// between the engine (geometry.userData.normalsCaptureOffsets) and the own viewer (computeStoneOffsets).
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
const round = (a) => Array.from(a).map((x) => +x.toFixed(4));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = await page.evaluate(() => {
  const v = window.viewer, out = {};
  v.scene.modelObject.traverse((o) => { if (o.material && o.material.isDiamondMaterial && /^D(5|4001|1001)$/i.test(o.name)) { const s = o.geometry.userData.normalsCaptureOffsets; const t = o.geometry.userData._normalsCaptureMap; out[o.name] = s ? { centerOffset: Array.from(s.centerOffset), radius: s.radius, offsetMatrix: Array.from(s.offsetMatrix), keys: Object.keys(s), captureRes: t && t.texture && t.width } : null; } });
  return out;
});
await page.goto("http://localhost:5173/hexa-viewer.html?sample&bare", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const own = await page.evaluate(async () => {
  const { computeStoneOffsets } = await import("/src/render/diamondGeometry.ts");
  const out = {};
  window.hexaViewer.scene.traverse((o) => { if (o.isMesh && /^D(5|4001|1001)$/i.test(o.name)) { const s = computeStoneOffsets(o.geometry); out[o.name] = { centerOffset: s.centerOffset.toArray(), radius: s.radius, offsetMatrix: s.offsetMatrix.toArray() }; } });
  return out;
});
await browser.close();
for (const k of Object.keys(eng)) {
  const e = eng[k], o = own[k] || own[k.toLowerCase()] || own[Object.keys(own).find((x) => x.toLowerCase() === k.toLowerCase())];
  console.log(k, "ENGINE", JSON.stringify(e && { centerOffset: round(e.centerOffset), radius: +e.radius.toFixed(4), keys: e.keys, captureRes: e.captureRes }));
  console.log(k, "OWN   ", JSON.stringify(o && { centerOffset: round(o.centerOffset), radius: +o.radius.toFixed(4) }));
  if (e && o) { const d = e.offsetMatrix.map((x, i) => Math.abs(x - o.offsetMatrix[i])); console.log(k, "offsetMatrix max abs diff", +Math.max(...d).toFixed(5), "engine", round(e.offsetMatrix), "own", round(o.offsetMatrix)); }
}
