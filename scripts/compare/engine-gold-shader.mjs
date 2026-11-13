// Dumps the lines of the engine's compiled gold fragment shader around SSR / AO use.
import puppeteer from "puppeteer-core";
import fs from "fs";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const src = await page.evaluate(() => {
  const v = window.viewer; for (let i = 0; i < 5; i++) v._animationLoop({ time: i * 16, delta: 16, deltaTime: 16 });
  const r = v.renderer.rendererObject; let gold; v.scene.modelObject.traverse((o) => { if (!gold && o.material && o.material.metalness === 1) gold = o.material; });
  const prog = r.properties.get(gold).currentProgram; const gl = r.getContext();
  return gl.getAttachedShaders(prog.program).map((s) => gl.getShaderSource(s));
});
await browser.close();
const frag = src.find((s) => /gl_FragColor|pc_fragColor/.test(s) && /calculateSSR/.test(s)) || src[1];
fs.writeFileSync("engine-gold-fragment.glsl", frag);
const lines = frag.split("\n");
const hits = []; lines.forEach((l, i) => { if (/ssrPower|ssrIntensity|ssrBoost|calculateSSR|ssrMaskFront|tSSRMap|ambientOcclusion|computeSpecularOcclusion/.test(l)) hits.push(i); });
const show = new Set(); hits.forEach((i) => { for (let k = i - 6; k <= i + 8; k++) show.add(k); });
console.log([...show].filter((k) => k >= 0 && k < lines.length).sort((a, b) => a - b).map((k) => `${k}: ${lines[k]}`).join("\n"));
