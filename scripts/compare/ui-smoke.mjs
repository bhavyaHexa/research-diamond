// End-to-end check of the viewer UI in headless Chrome: empty state, file upload through the file input,
// tabs, view modes, export, environment, and loading the same file with Jewelry mode off (the generic path).
// Usage: node scripts/compare/ui-smoke.mjs [screenshot-folder]   (dev server on :5173, Chrome, puppeteer-core)
import puppeteer from "puppeteer-core";
import path from "path";
const port = process.env.PORT || 5173;
const shots = process.argv[2];
const ring = path.resolve("public/assets/Ring_v1.glb");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.setDefaultTimeout(90000);
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) problems.push("console: " + m.text().slice(0, 200)); });
const ok = (label, value) => console.log(label.padEnd(34), value);
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };
const settle = async () => { await page.evaluate(async () => { const v = window.hexaViewer; for (let i = 0; i < 40; i++) v.tick(); }); };

await page.goto(`http://localhost:${port}/hexa-viewer.html`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer);
ok("empty overlay visible", await page.$eval("#empty", (e) => !e.hidden));
ok("tabs locked", await page.$eval("#tabs", (e) => e.classList.contains("locked")));
await shot("1-empty");

// upload through the real file input
const input = await page.$("input[type=file]");
await input.uploadFile(ring);
await page.waitForFunction(() => window.hexaViewer.model, { timeout: 90000 });
await settle();
ok("model loaded", await page.evaluate(() => JSON.stringify(window.hexaViewer.model.info)));
ok("overlay hidden after load", await page.$eval("#empty", (e) => e.hidden));
ok("material rows", await page.$$eval(".mat-row", (r) => r.length)); // scene pane is hidden until opened
await page.click("[data-tab=environment]");
await shot("2-environment");
await page.click("[data-tab=scene]");
ok("material rows (scene tab)", await page.$$eval("#pane-scene .mat-row", (r) => r.map((x) => x.textContent.trim().replace(/\s+/g, " ")).join(" | ")));
await page.click("#pane-scene .mat-row");
ok("material tab opens on select", await page.$eval("#pane-material", (e) => !e.hidden));
await page.click("[data-tab=render]");
await shot("3-render");

// view modes, export, environment switch, background
for (const v of ["depth", "normals", "ao", "beauty"]) {
  await page.click(`[data-action=view][data-value=${v}]`);
  await settle();
  if (v === "depth") await shot("4-depth");
}
ok("export blob bytes", await page.evaluate(async () => (await window.hexaViewer.capture()).size));
await page.click("[data-tab=environment]");
await page.click("[data-action=env][data-id=metal001]");
await page.waitForFunction(() => document.querySelector("[data-action=env][data-id=metal001]").getAttribute("aria-pressed") === "true");
await page.click("[data-action=seg][data-key=bg][data-value=clear]");
await settle();
ok("transparent corner alpha", await page.evaluate(() => { const c = document.createElement("canvas"), v = window.hexaViewer.renderer.domElement; c.width = c.height = 8; const g = c.getContext("2d"); g.drawImage(v, 0, 0, 8, 8, 0, 0, 8, 8); return g.getImageData(0, 0, 1, 1).data[3]; }));
await page.click("[data-action=seg][data-key=bg][data-value=white]");

// generic path: same file, Jewelry mode off (materials of the file, fitted to the reference size)
await page.click("[data-tab=scene]");
await page.evaluate(() => document.querySelector("[data-switch=jewelry]").click());
await page.waitForFunction(() => window.hexaViewer.model && !window.hexaViewer.model.info.jewelryMode, { timeout: 90000 });
await settle();
ok("generic load", await page.evaluate(() => { const i = window.hexaViewer.model.info; return `${i.name} jewelryMode=${i.jewelryMode} meshes=${i.meshes}`; }));
await shot("5-generic");

// phone width
await page.setViewport({ width: 390, height: 844 });
await new Promise((r) => setTimeout(r, 400));
await shot("6-mobile");
ok("problems", problems.length ? "\n  " + problems.join("\n  ") : "none");
await browser.close();
