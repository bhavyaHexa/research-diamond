// Dumps the engine's compiled DIAMOND fragment shader to engine-diamond-fragment.glsl, plus the
// material's uniform values and defines, so they can be compared with src/shaders/diamond/*.
import puppeteer from "puppeteer-core";
import fs from "fs";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
const out = await page.evaluate(() => {
  const v = window.viewer;
  for (let i = 0; i < 5; i++) v._animationLoop({ time: i * 16, delta: 16, deltaTime: 16 });
  const r = v.renderer.rendererObject; let d;
  v.scene.modelObject.traverse((o) => { if (!d && o.material && o.material.isDiamondMaterial && /^D5/i.test(o.name)) d = o.material; });
  if (!d) v.scene.modelObject.traverse((o) => { if (!d && o.material && o.material.isDiamondMaterial) d = o.material; });
  const props = r.properties.get(d); const prog = props.currentProgram; const gl = r.getContext();
  const sources = gl.getAttachedShaders(prog.program).map((s) => gl.getShaderSource(s));
  const u = {};
  for (const k of Object.keys(props.uniforms || {})) {
    const x = props.uniforms[k].value;
    u[k] = x && x.toArray ? x.toArray().slice(0, 16) : (x && x.isTexture ? `[texture ${x.constructor.name} ${x.image && x.image.width}x${x.image && x.image.height} type ${x.type} min ${x.minFilter} mag ${x.magFilter}]` : (typeof x === "object" ? "[object]" : x));
  }
  return { sources, uniforms: u, defines: d.defines, extra: { transparent: d.transparent, side: d.side, blending: d.blending, depthWrite: d.depthWrite, toneMapped: d.toneMapped } };
});
await browser.close();
const frag = out.sources.find((s) => /gl_FragColor|pc_fragColor/.test(s)) || out.sources[1];
fs.writeFileSync("engine-diamond-fragment.glsl", frag);
console.log("defines", JSON.stringify(out.defines));
console.log("uniforms", JSON.stringify(out.uniforms));
console.log("material", JSON.stringify(out.extra));
