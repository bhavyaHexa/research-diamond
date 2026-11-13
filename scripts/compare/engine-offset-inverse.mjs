import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 600 });
await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
page.setDefaultTimeout(120000);
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await page.waitForSelector(".loader.done");
console.log(JSON.stringify(await page.evaluate(() => {
  let m; window.viewer.scene.modelObject.traverse((o) => { if (!m && o.material && o.material.isDiamondMaterial && /^D5$/i.test(o.name)) m = o; });
  const s = m.geometry.userData.normalsCaptureOffsets; const A = s.offsetMatrix, B = s.offsetMatrixInv;
  // multiply B * A (column-major 4x4)
  const mul = (a, b) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k]; return r; };
  return { offsetMatrix: Array.from(A).map((x) => +x.toFixed(4)), offsetMatrixInv: Array.from(B).map((x) => +x.toFixed(4)), product: mul(Array.from(B), Array.from(A)).map((x) => +x.toFixed(3)), center: Array.from(s.center), centerOffset: Array.from(s.centerOffset), radius: s.radius };
})));
await browser.close();
