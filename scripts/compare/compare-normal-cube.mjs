// Compares the normal+distance cube capture of one stone (D5): engine vs own, using the ENGINE's frame
// (centre / alignment matrix) for both, face by face and under the 8 flips/rotations of a face.
// Finds whether the two renderers lay the cube faces out differently.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(240000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const eng = await page.evaluate(() => {
  const v = window.viewer, r = v.renderer.rendererObject; let mesh; v.scene.modelObject.traverse((o) => { if (!mesh && o.material && o.material.isDiamondMaterial && /^D5$/i.test(o.name)) mesh = o; });
  const g = mesh.geometry, s = g.userData.normalsCaptureOffsets, rt = g.userData._normalsCaptureMap, N = rt.width;
  const half = (h) => { const sg = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? sg * Math.pow(2, -14) * (f / 1024) : sg * Math.pow(2, e - 15) * (1 + f / 1024); };
  const faces = [];
  for (let f = 0; f < 6; f++) { const buf = new Uint16Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, buf, f); const a = new Float32Array(N * N * 4); for (let i = 0; i < buf.length; i++) a[i] = half(buf[i]); faces.push(Array.from(a)); }
  return { N, offsets: { center: Array.from(s.center), centerOffset: Array.from(s.centerOffset), offsetMatrix: Array.from(s.offsetMatrix), radius: s.radius }, faces, type: rt.texture.type };
});
console.log("engine capture", eng.N, "type", eng.type);
await page.goto("http://localhost:5173/hexa-viewer.html?sample&bare", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
const own = await page.evaluate(async (e) => {
  const THREE = await import("/node_modules/.vite/deps/three.js"); const D = await import("/src/render/diamond.ts");
  let mesh; window.hexaViewer.scene.traverse((o) => { if (!mesh && o.isMesh && /^D5$/i.test(o.name)) mesh = o; });
  const m = new THREE.Matrix4().fromArray(e.offsets.offsetMatrix);
  const offsets = { center: new THREE.Vector3().fromArray(e.offsets.center), offsetMatrix: m, offsetMatrixInv: m.clone().invert(), centerOffset: new THREE.Vector3().fromArray(e.offsets.centerOffset), radius: e.offsets.radius };
  const rt = D.captureStoneNormals(window.hexaViewer.renderer, mesh.geometry, offsets, D.createCaptureMaterial());
  const N = rt.width, r = window.hexaViewer.renderer; const faces = [];
  for (let f = 0; f < 6; f++) { const buf = new Uint16Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, buf, f); const half = (h) => { const sg = (h & 0x8000) ? -1 : 1, ee = (h >> 10) & 0x1f, ff = h & 0x3ff; return ee === 0 ? sg * Math.pow(2, -14) * (ff / 1024) : sg * Math.pow(2, ee - 15) * (1 + ff / 1024); }; const a = new Float32Array(N * N * 4); for (let i = 0; i < buf.length; i++) a[i] = half(buf[i]); faces.push(Array.from(a)); }
  return { N, faces, type: rt.texture.type };
}, eng);

const names = ["+x", "-x", "+y", "-y", "+z", "-z"];
const own2 = await page.evaluate(async (e) => {
  const THREE = await import("/node_modules/.vite/deps/three.js"); const D = await import("/src/render/diamond.ts");
  let mesh; window.hexaViewer.scene.traverse((o) => { if (!mesh && o.isMesh && /^D5$/i.test(o.name)) mesh = o; });
  const m = new THREE.Matrix4().fromArray(e.offsets.offsetMatrix); const inv = m.clone().invert();
  const mat = D.createCaptureMaterial(); mat.uniforms.offsetCenter.value.fromArray(e.offsets.center); mat.uniforms.offsetMatrixInv.value.copy(inv); mat.uniforms.radius.value = e.offsets.radius;
  const scene = new THREE.Scene(); const cm = new THREE.Mesh(mesh.geometry, mat); cm.frustumCulled = false; scene.add(cm);
  const N = e.N; const rt = new THREE.WebGLCubeRenderTarget(N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, type: THREE.HalfFloatType });
  // three r152 CubeCamera face orientations
  const defs = [[[0, -1, 0], [1, 0, 0]], [[0, -1, 0], [-1, 0, 0]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, -1, 0]], [[0, -1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]]];
  const r = window.hexaViewer.renderer; const prevRT = r.getRenderTarget();
  r.setClearColor(0x000000, 0);
  defs.forEach(([up, look], i) => { const c = new THREE.PerspectiveCamera(90, 1, 1e-4, 100); c.up.set(...up); c.lookAt(...look); c.updateMatrixWorld(true); r.setRenderTarget(rt, i); r.clear(); r.render(scene, c); });
  r.setRenderTarget(prevRT);
  const half = (h) => { const sg = (h & 0x8000) ? -1 : 1, ee = (h >> 10) & 0x1f, ff = h & 0x3ff; return ee === 0 ? sg * Math.pow(2, -14) * (ff / 1024) : sg * Math.pow(2, ee - 15) * (1 + ff / 1024); };
  const faces = []; for (let f = 0; f < 6; f++) { const buf = new Uint16Array(N * N * 4); r.readRenderTargetPixels(rt, 0, 0, N, N, buf, f); const a = new Float32Array(N * N * 4); for (let i = 0; i < buf.length; i++) a[i] = half(buf[i]); faces.push(Array.from(a)); }
  return { N, faces };
}, eng);
{
  const N2 = eng.N; const c2 = (A, B) => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let i = 0; i < N2 * N2; i += 3) { const a = A[i * 4 + 3], b = B[i * 4 + 3]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; } return (sab / n - sa / n * sb / n) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2)); };
  const mean = (F) => { let s = 0; for (let i = 0; i < N2 * N2; i++) s += F[i * 4 + 3]; return (s / (N2 * N2)).toFixed(3); };
  console.log("r152-style cameras vs engine, identity per face (corr, mean alpha engine/own2):", names.map((nm, f) => `${nm} ${c2(eng.faces[f], own2.faces[f]).toFixed(3)} (${mean(eng.faces[f])}/${mean(own2.faces[f])})`).join(" | "));
}
await browser.close();
const N = eng.N;
const tr = (t, x, y) => { switch (t) { case 0: return [x, y]; case 1: return [N - 1 - x, y]; case 2: return [x, N - 1 - y]; case 3: return [N - 1 - x, N - 1 - y]; case 4: return [y, x]; case 5: return [N - 1 - y, x]; case 6: return [y, N - 1 - x]; default: return [N - 1 - y, N - 1 - x]; } };
const tn = ["id", "flipX", "flipY", "rot180", "transpose", "rot90a", "rot90b", "antitranspose"];
const chan = 3; // alpha = distance
const corr = (A, B, t) => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) { const [u, v] = tr(t, x, y); const a = A[(y * N + x) * 4 + chan], b = B[(v * N + u) * 4 + chan]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; } const cov = sab / n - (sa / n) * (sb / n); const d = Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2)); return d > 1e-9 ? cov / d : 0; };
for (let f = 0; f < 6; f++) {
  let best = { c: -2 };
  for (let g = 0; g < 6; g++) for (let t = 0; t < 8; t++) { const c = corr(eng.faces[f], own.faces[g], t); if (c > best.c) best = { c, g, t }; }
  const same = corr(eng.faces[f], own.faces[f], 0);
  console.log(`engine face ${names[f]}: same face/identity corr ${same.toFixed(3)} | best match = own ${names[best.g]} with ${tn[best.t]} corr ${best.c.toFixed(3)}`);
}

const cov = (F) => { let c = 0, sum = 0, mn = 1e9, mx = -1e9; for (let i = 0; i < N * N; i++) { const a = F[i * 4 + 3]; if (a > 0) c++; sum += a; mn = Math.min(mn, a); mx = Math.max(mx, a); } return `cov ${(c / (N * N)).toFixed(3)} meanA ${(sum / (N * N)).toFixed(3)} min ${mn.toFixed(3)} max ${mx.toFixed(3)}`; };
for (let f = 0; f < 6; f++) console.log(names[f], "engine:", cov(eng.faces[f]), "| own:", cov(own.faces[f]));

// Which signed axis permutation T maps engine cube directions onto own cube directions?
// For each engine texel (direction d) compare its distance with the own cube sampled at T*d.
const dirOf = (f, x, y) => { const sc = 2 * (x + 0.5) / N - 1, tc = 2 * (y + 0.5) / N - 1; switch (f) { case 0: return [1, -tc, -sc]; case 1: return [-1, -tc, sc]; case 2: return [sc, 1, tc]; case 3: return [sc, -1, -tc]; case 4: return [sc, -tc, 1]; default: return [-sc, -tc, -1]; } };
const texelOf = (d) => { const [rx, ry, rz] = d, ax = Math.abs(rx), ay = Math.abs(ry), az = Math.abs(rz); let f, sc, tc, ma; if (ax >= ay && ax >= az) { ma = ax; if (rx > 0) { f = 0; sc = -rz; tc = -ry; } else { f = 1; sc = rz; tc = -ry; } } else if (ay >= az) { ma = ay; if (ry > 0) { f = 2; sc = rx; tc = rz; } else { f = 3; sc = rx; tc = -rz; } } else { ma = az; if (rz > 0) { f = 4; sc = rx; tc = -ry; } else { f = 5; sc = -rx; tc = -ry; } } const x = Math.min(N - 1, Math.max(0, Math.floor((sc / ma + 1) / 2 * N))), y = Math.min(N - 1, Math.max(0, Math.floor((tc / ma + 1) / 2 * N))); return [f, x, y]; };
const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const results = [];
for (const p of perms) for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let f = 0; f < 6; f++) for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x += 4) {
    const d = dirOf(f, x, y), q = [sx * d[p[0]], sy * d[p[1]], sz * d[p[2]]]; const [g, u, v] = texelOf(q);
    const a = eng.faces[f][(y * N + x) * 4 + 3], b = own.faces[g][(v * N + u) * 4 + 3];
    n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  const cov = sab / n - (sa / n) * (sb / n), c = cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
  results.push({ c, map: `x'=${sx > 0 ? "+" : "-"}${"xyz"[p[0]]} y'=${sy > 0 ? "+" : "-"}${"xyz"[p[1]]} z'=${sz > 0 ? "+" : "-"}${"xyz"[p[2]]}` });
}
results.sort((a, b) => b.c - a.c);
console.log("best direction mappings (distance correlation, 1 = same):", results.slice(0, 5).map((r) => `${r.map} ${r.c.toFixed(3)}`).join(" | "));
console.log("identity:", results.find((r) => r.map === "x'=+x y'=+y z'=+z").c.toFixed(3));

// Dump alpha (distance) of every face for both captures as one grey image: row 1 engine, row 2 own.
{
  const fs = await import("fs"); const W = N * 6, H = N * 2; const buf = Buffer.alloc(W * H * 3);
  for (let row = 0; row < 2; row++) for (let f = 0; f < 6; f++) { const F = (row === 0 ? eng : own).faces[f]; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = F[(y * N + x) * 4 + 3]; const v = Math.max(0, Math.min(255, Math.round((a - 0.35) / 0.65 * 255))); const o = ((row * N + (N - 1 - y)) * W + f * N + x) * 3; buf[o] = buf[o + 1] = buf[o + 2] = v; } }
  fs.writeFileSync("cube-faces.ppm", Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
}
