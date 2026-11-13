// The engine shares one normal-capture cube between many stones. Find which stone's capture it is:
// capture every candidate stone with the engine's own frame and correlate with the shared map.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(240000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = await page.evaluate(() => {
  const v = window.viewer, r = v.renderer.rendererObject; const half = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? sg * Math.pow(2, -14) * (f / 1024) : sg * Math.pow(2, e - 15) * (1 + f / 1024); };
  const offsets = {}, groups = {}; let sample;
  const order = [];
  v.scene.modelObject.traverse((o) => { if (o.material && o.material.isDiamondMaterial) { const s = o.geometry.userData.normalsCaptureOffsets, t = o.geometry.userData._normalsCaptureMap; order.push(o.name); offsets[o.name] = { center: Array.from(s.center), offsetMatrix: Array.from(s.offsetMatrix), radius: s.radius }; const k = String(t.id ?? t.uuid ?? "?"); (groups[k] = groups[k] || []).push(o.name); if (/^D5$/i.test(o.name)) sample = t; } });
  const N = sample.width, faces = []; for (let f = 0; f < 6; f++) { const buf = new Uint16Array(N * N * 4); r.readRenderTargetPixels(sample, 0, 0, N, N, buf, f); const a = new Float32Array(N * N); for (let i = 0; i < N * N; i++) a[i] = half(buf[i * 4 + 3]); faces.push(Array.from(a)); }
  return { N, offsets, groups, order, faces };
});
await page.goto("http://localhost:5173/hexa-viewer.html", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const res = await page.evaluate(async (e) => {
  const THREE = await import("/node_modules/.vite/deps/three.js"); const D = await import("/src/render/diamond.ts");
  const r = window.hexaViewer.renderer, N = e.N, mat = D.createCaptureMaterial(); const half = (h) => { const sg = (h & 0x8000) ? -1 : 1, ee = (h >> 10) & 0x1f, ff = h & 0x3ff; return ee === 0 ? sg * Math.pow(2, -14) * (ff / 1024) : sg * Math.pow(2, ee - 15) * (1 + ff / 1024); };
  const corr = (A, B) => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < N * N; i += 3) { const a = A[i], b = B[i]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; } return (sab / n - sa / n * sb / n) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2) + 1e-12); };
  const out = []; const seen = new Set();
  window.hexaViewer.scene.traverse((o) => {
    if (!o.isMesh || !o.material.uniforms || !o.material.uniforms.tCubeMapNormals) return;
    const off = e.offsets[o.name] || e.offsets[Object.keys(e.offsets).find((k) => k.toLowerCase() === o.name.toLowerCase())]; if (!off || seen.has(o.geometry)) return; seen.add(o.geometry);
    const m = new THREE.Matrix4().fromArray(off.offsetMatrix);
    const offsets = { center: new THREE.Vector3().fromArray(off.center), offsetMatrix: m, offsetMatrixInv: m.clone().invert(), centerOffset: new THREE.Vector3(), radius: off.radius };
    const rt = D.captureStoneNormals(r, o.geometry, offsets, mat);
    let sum = 0; for (let f = 0; f < 6; f++) { const buf = new Uint16Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, buf, f); const a = new Float32Array(N * N); for (let i = 0; i < N * N; i++) a[i] = half(buf[i * 4 + 3]); sum += corr(e.faces[f], Array.from(a)); }
    out.push({ name: o.name, meanFaceCorr: +(sum / 6).toFixed(3) }); rt.dispose();
  });
  return out;
}, eng);
await browser.close();
console.log("traversal order (engine), first 6:", eng.order.slice(0, 6).join(","));
console.log("groups sharing a map:", Object.values(eng.groups).map((g) => `${g.length}: ${g.slice(0, 4).join(",")}...`).join(" | "));
res.sort((a, b) => b.meanFaceCorr - a.meanFaceCorr);
console.log("best candidates for the shared D5 map:", res.slice(0, 6).map((x) => `${x.name} ${x.meanFaceCorr}`).join(" | "));
