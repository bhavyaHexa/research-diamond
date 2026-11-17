import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import { startHexaViewer } from "./viewer";
import { mountUi } from "./ui/ui";
import { ssrUniforms } from "./ssr";
import { SETTINGS } from "./settings";
(window as unknown as { settings: unknown }).settings = SETTINGS; // dev: tune live
(window as unknown as { devTexture: unknown }).devTexture = (data: Float32Array, w: number, h: number) => { const t = new DataTexture(data, w, h, RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.needsUpdate = true; return t; }; // dev: upload a float image
(window as unknown as { ssr: unknown }).ssr = ssrUniforms; // dev: tune live

// Development only: a generated test bottle for trying the glass material (dropped out of the production build).
if (import.meta.env.DEV) void import("./dev/testBottle").then((m) => { (window as unknown as { hexaDev: unknown }).hexaDev = { makeTestBottle: m.makeTestBottle }; });

const app = document.getElementById("app")!;
const ui = mountUi(app);

// `?sample` opens the sample ring straight away; `?bare` hides the panel so the canvas fills the window
// (both are used by the compare scripts, which need the same framing as the engine viewer).
const query = new URLSearchParams(location.search);
if (query.has("bare")) document.body.classList.add("bare");
startHexaViewer(ui.canvas).then((viewer) => {
  (window as unknown as { hexaViewer: unknown }).hexaViewer = viewer;
  ui.bind(viewer);
  if (import.meta.env.DEV) void import("./environments").then((e) => { (window as unknown as { hexaDev: Record<string, unknown> }).hexaDev.studio = (look: object) => viewer.setEnvironment(e.createGlassStudio({ ...e.DEFAULT_STUDIO, ...look })); });
  // `?sample`: the ring. `?empty`: nothing. Otherwise: the perfume bottle with glass.
  if (query.has("sample")) void ui.loadSample();
  else if (!query.has("empty")) void ui.loadDefault();
  const loop = () => {
    viewer.tick();
    ui.frame();
    requestAnimationFrame(loop);
  };
  loop();
}).catch((e) => { app.textContent = "The viewer could not start: " + e; console.error(e); });

// Dev helper: compare the converged frame with a grid saved from the engine viewer
// (localStorage "engineGrid": {GX, GY, grid[[r,g,b]...]}). Console: `await hexaViewer.compare()`.
(window as unknown as { compare: () => unknown }).compare = () => {
  const o = (window as unknown as { hexaViewer: { renderer: { domElement: HTMLCanvasElement } } }).hexaViewer;
  const E = JSON.parse(localStorage.getItem("engineGrid") ?? "null");
  if (!o || !E) return "no viewer or no engineGrid";
  const c = o.renderer.domElement;
  const g = document.createElement("canvas");
  g.width = c.width; g.height = c.height;
  const x = g.getContext("2d")!;
  x.drawImage(c, 0, 0);
  const { GX, GY } = E as { GX: number; GY: number; grid: number[][] };
  const cw = g.width / GX, ch = g.height / GY;
  let abs = 0, sh = 0, ns = 0, n = 0;
  const ring = [0, 0, 0]; let nr = 0;
  const cls: Record<string, { n: number; mine: number[]; eng: number[] }> = { gold: { n: 0, mine: [0, 0, 0], eng: [0, 0, 0] }, stone: { n: 0, mine: [0, 0, 0], eng: [0, 0, 0] } };
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const d = x.getImageData(Math.floor(i * cw), Math.floor(j * ch), Math.floor(cw), Math.floor(ch)).data;
    const s = [0, 0, 0];
    for (let k = 0; k < d.length; k += 4) { s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; }
    const m = d.length / 4, e = E.grid[j * GX + i] as number[];
    const df = s.map((a, q) => a / m - e[q]);
    const em = (e[0] + e[1] + e[2]) / 3;
    abs += (Math.abs(df[0]) + Math.abs(df[1]) + Math.abs(df[2])) / 3; n++;
    const key = e[0] - e[2] > 45 && em < 225 ? "gold" : e[0] - e[2] < 18 && em < 215 ? "stone" : null;
    if (key) { cls[key].n++; for (let q = 0; q < 3; q++) { cls[key].mine[q] += s[q] / m; cls[key].eng[q] += e[q]; } }
    if (em >= 225 && em < 252) { sh += (df[0] + df[1] + df[2]) / 3; ns++; }
    if (em < 225) { for (let q = 0; q < 3; q++) ring[q] += df[q]; nr++; }
  }
  const avg = (k: string) => ({ mine: cls[k].mine.map((a) => +(a / cls[k].n).toFixed(1)), engine: cls[k].eng.map((a) => +(a / cls[k].n).toFixed(1)) });
  return { gold: avg("gold"), stone: avg("stone"), meanAbs: +(abs / n).toFixed(2), shadowBias: +(sh / ns).toFixed(2), ringBias: ring.map((a) => +(a / nr).toFixed(1)) };
};
