// Compares the gem environment texture of the engine with the own viewer: size, format, mean, sample values.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
const stats = `(tex) => { const im = tex.image; const d = im.data; const half = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? s * 65504 : s * Math.pow(2, e - 15) * (1 + f / 1024); }; let sum = [0,0,0], mx = 0, n = im.width * im.height; const conv = d.BYTES_PER_ELEMENT === 2 ? half : (x) => x; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = conv(d[i * 4 + k]); sum[k] += v; if (v > mx) mx = v; } const px = (x, y) => [0,1,2].map((k) => +conv(d[(y * im.width + x) * 4 + k]).toFixed(4)); return { w: im.width, h: im.height, type: tex.type, flipY: tex.flipY, colorSpace: tex.colorSpace, mean: sum.map((s) => +(s / n).toFixed(4)), max: +mx.toFixed(2), p_0_0: px(0, 0), p_256_128: px(256, 128), p_100_300: px(100, 300), p_400_50: px(400, 50) }; }`;
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log("engine", JSON.stringify(await page.evaluate((src) => { const v = window.viewer; let t; v.scene.modelObject.traverse((o) => { if (!t && o.material && o.material.isDiamondMaterial) t = o.material.uniforms.envMap.value; }); return eval(src)(t); }, stats)));
await page.goto("http://localhost:5173/hexa-viewer.html?sample&bare", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
console.log("own   ", JSON.stringify(await page.evaluate((src) => { let t; window.hexaViewer.scene.traverse((o) => { if (!t && o.material && o.material.uniforms && o.material.uniforms.tCubeMapNormals) t = o.material.uniforms.envMap.value; }); return eval(src)(t); }, stats)));
await browser.close();
