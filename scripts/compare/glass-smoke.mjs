// Drives the glass material end to end in headless Chrome: drops a generated test bottle onto the window,
// selects its glass material in the Material tab, switches it to Glass, and checks the result.
// Usage: node scripts/compare/glass-smoke.mjs [screenshot-folder]   (dev server on :5173, Chrome, puppeteer-core)
import puppeteer from "puppeteer-core";
import path from "path";
const port = process.env.PORT || 5173;
const shots = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.setDefaultTimeout(90000);
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 300)));
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/favicon|404|GPU stall/.test(m.text())) problems.push(m.type() + ": " + m.text().slice(0, 400)); });
const ok = (label, value) => console.log(label.padEnd(34), value);
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };
const settle = () => page.evaluate(() => { const v = window.hexaViewer; for (let i = 0; i < 40; i++) v.tick(); });
const stats = () => page.evaluate(() => {
  window.hexaViewer.tick(); // the canvas can only be read in the same task that drew it
  const c = window.hexaViewer.renderer.domElement, g = document.createElement("canvas");
  g.width = c.width; g.height = c.height;
  const x = g.getContext("2d"); x.drawImage(c, 0, 0);
  const at = (fx, fy) => Array.from(x.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data);
  return { centre: at(0.5, 0.5), edge: at(0.43, 0.5), base: at(0.5, 0.72), corner: at(0.02, 0.02) };
});

await page.goto(`http://localhost:${port}/hexa-viewer.html?empty`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.hexaDev);

// drop the generated bottle on the window, like a user would
await page.evaluate(async () => {
  const file = await window.hexaDev.makeTestBottle();
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => window.hexaViewer.model, { timeout: 90000 });
await settle();
ok("model", await page.evaluate(() => JSON.stringify(window.hexaViewer.model.info)));
await shot("g1-standard");
const before = await stats();

await page.click("[data-tab=scene]");
ok("scene rows", await page.$$eval("#pane-scene .mat-row", (r) => r.map((x) => x.textContent.trim().replace(/\s+/g, " ")).join(" | ")));
await page.evaluate(() => [...document.querySelectorAll("#pane-scene .mat-row")].find((r) => /Glass/.test(r.textContent)).click());
await page.waitForSelector("#pane-material:not([hidden])");
await page.click("[data-action=mat-type][data-value=glass]");
await settle();
ok("is glass now", await page.evaluate(() => { let n = 0; window.hexaViewer.scene.traverse((o) => { if (o.isMesh && o.material.userData.glass) n++; }); return n + " glass mesh(es)"; }));
ok("glass controls", await page.$$eval("#pane-material [data-slider]", (s) => s.map((x) => x.dataset.slider).join(", ")));
await shot("g2-glass");
const after = await stats();
ok("pixels before", JSON.stringify(before));
ok("pixels after", JSON.stringify(after));

// tint and index of refraction through the UI controls
await page.evaluate(() => { const s = document.querySelector("[data-slider='glass.ior']"); s.value = "1.9"; s.dispatchEvent(new Event("input", { bubbles: true })); });
await page.evaluate(() => { const c = document.querySelector("[data-color=glass]"); c.value = "#3fa66b"; c.dispatchEvent(new Event("change", { bubbles: true })); });
await settle();
await shot("g3-tinted");

// transparent background keeps alpha around and through the glass
await page.click("[data-tab=environment]");
await page.click("[data-action=seg][data-key=bg][data-value=clear]");
await settle();
ok("clear: corner / centre alpha", JSON.stringify(await stats().then((s) => [s.corner[3], s.centre[3]])));
await page.click("[data-action=seg][data-key=bg][data-value=white]");

// back to the file's own material
await page.click("[data-tab=material]");
await page.click("[data-action=mat-type][data-value=standard]");
await settle();
ok("restored", await page.evaluate(() => { let glass = 0, std = 0; window.hexaViewer.scene.traverse((o) => { if (o.isMesh && o.name === "Glass") (o.material.userData.glass ? glass++ : std++); }); return `glass=${glass} standard=${std}`; }));
ok("problems", problems.length ? "\n  " + problems.join("\n  ") : "none");
await browser.close();
