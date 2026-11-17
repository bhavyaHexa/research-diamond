// Screenshot of a viewer URL once it has converged.
// Usage: node scripts/compare/page-shot.mjs <out.png> [query] [WxH]    e.g. out.png "?bare" 1000x900
import puppeteer from "puppeteer-core";
const [out, query = "", size = "1440x900", setup = ""] = process.argv.slice(2); // setup: JS run in the page first, with `viewer`
const [width, height] = size.split("x").map(Number);
const port = process.env.PORT || 5173;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--use-gl=angle", "--enable-webgl"] });
const page = await browser.newPage();
await page.setViewport({ width, height });
page.setDefaultTimeout(90000);
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 300)));
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/favicon|404|GPU stall/.test(m.text())) problems.push(m.type() + ": " + m.text().slice(0, 500)); });
await page.goto(`http://localhost:${port}/hexa-viewer.html${query}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.hexaViewer && window.hexaViewer.model, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500)); // the default page swaps the environment right after the model loads
const result = await page.evaluate((js) => { const viewer = window.hexaViewer; let out; if (js) { out = new Function("viewer", js)(viewer); viewer.pipeline.restart(); } for (let i = 0; i < 40; i++) viewer.tick(); return out; }, setup);
if (result !== undefined) console.log("setup returned", result);
await page.screenshot({ path: out });
console.log("model", await page.evaluate(() => JSON.stringify(window.hexaViewer.model.info)));
console.log("problems", problems.length ? "\n  " + problems.join("\n  ") : "none");
await browser.close();
