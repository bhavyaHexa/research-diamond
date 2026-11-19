// The viewer's interface: a stage with the model and one docked panel on the right.
// Plain DOM. State lives in `viewer` and SETTINGS; the panel only reads and writes them.
import type { Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, ShaderMaterial } from "three";
import { PATHS, SCENE_ENVIRONMENTS } from "../../constants";
import { DIAMOND_TAG } from "../../render/diamond";
import { GLASS_STUDIO } from "../environments";
import { glassOf, isGlass } from "../glass";
import { SETTINGS } from "../settings";
import { LOAD_STEPS, type HexaViewer, type ModelInfo } from "../viewer";
import { icon } from "./icons";
import "./ui.css";

type Tab = "scene" | "material" | "environment" | "render";
const TABS: { id: Tab; label: string }[] = [
  { id: "scene", label: "Scene" }, { id: "material", label: "Material" },
  { id: "environment", label: "Environment" }, { id: "render", label: "Render" },
];
const VIEWS = [["beauty", "Beauty"], ["depth", "Depth"], ["normals", "Normals"], ["ao", "AO"]] as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const formatBytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const formatCount = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** One row of the Scene list: every mesh that shares a material (all diamonds count as one). */
interface Group {
  key: string;
  name: string;
  tag: "Metal" | "Gem" | "Glass" | "Standard";
  materials: Material[];
  meshes: Mesh[];
  diamond: boolean;
  visible: boolean;
}

interface Environment { id: string; name: string; chip: string; background: string; source: string | File }

const STUDIO = "linear-gradient(160deg, #E3EAF4 0%, #A9B8CE 55%, #55627A 100%)";
const WARM = "linear-gradient(160deg, #F2E6D2 0%, #B89A6A 55%, #4A3B2A 100%)";
const GLASS = "linear-gradient(90deg, #15171c 0%, #15171c 14%, #ffffff 17%, #ffffff 22%, #2a2d33 26%, #e8eaee 55%, #ffffff 68%, #15171c 80%, #15171c 90%, #cfd3da 100%)";
const COOL ="linear-gradient(160deg, #CFE3FA 0%, #8DB4DE 55%, #5F7FA3 100%)";

export function mountUi(app: HTMLElement) {
  app.innerHTML = `
    <main id="stage">
      <canvas id="view"></canvas>
      <div class="empty" id="empty">
        <div class="empty-inner">
          <div class="drop">
            <div class="badge">${icon("cube", 28, 1.6)}</div>
            <h1>Drop a 3D model to begin</h1>
            <p>Drag a file anywhere into this window. Textures packed inside the file load with it.</p>
            <div class="row">
              <button class="btn primary" data-action="browse">${icon("upload", 16, 2)}Browse files</button>
              <button class="btn" data-action="link">${icon("link")}Paste a link</button>
            </div>
            <div class="link-row" id="link-row" hidden>
              <input id="link-input" type="url" placeholder="https://example.com/model.glb" aria-label="Model link">
              <button class="btn primary" data-action="load-link">Load</button>
            </div>
            <div class="chips">
              <span class="chip">GLB</span><span class="chip">GLTF</span><span class="chip">Draco</span>
              <span class="chip soon">OBJ soon</span><span class="chip soon">FBX soon</span><span class="chip soon">STL soon</span>
            </div>
            <span class="note">${icon("lock", 13, 2)}Files stay in your browser and are never sent to a server.</span>
          </div>
          <button class="sample" data-action="sample">
            <span class="thumb" style="background-image:url(/assets/sample-thumb.png)"></span>
            <span class="meta"><span class="tag">Sample</span><b>Halo diamond ring</b><span>Gold band, 45 diamonds · 3.6 MB · opens in Jewelry mode</span></span>
            ${icon("chevron", 18, 2)}
          </button>
        </div>
      </div>
      <div id="dragveil">Drop to load</div>
    </main>
    <aside id="panel" aria-label="Viewer controls">
      <div class="p-head">
        <div class="logo">${icon("hex", 16, 2)}</div>
        <span class="title">Hexa 3D Viewer</span>
        <button class="btn primary small" data-action="browse">${icon("upload", 15, 2)}Upload</button>
      </div>
      <div id="file-slot"></div>
      <div class="seg" id="tabs" role="tablist">${TABS.map((t) => `<button role="tab" data-action="tab" data-tab="${t.id}">${t.label}</button>`).join("")}</div>
      <div class="scroll" id="panes">
        <div class="placeholder" id="locked-note">Scene, material, environment and render settings appear here once the model is loaded.</div>
        ${TABS.map((t) => `<div class="pane" id="pane-${t.id}" hidden></div>`).join("")}
      </div>
      <div class="card dock" id="dock">
        <div class="seg small">${VIEWS.map(([id, label]) => `<button data-action="view" data-value="${id}" aria-pressed="${id === "beauty"}">${label}</button>`).join("")}</div>
        <div class="tools">
          <button class="icon-btn" data-action="reset" aria-label="Reset camera" title="Reset camera">${icon("reset", 17)}</button>
          <button class="icon-btn" data-action="fit" aria-label="Fit model to view" title="Fit model to view">${icon("fit", 17)}</button>
          <button class="icon-btn" data-action="turntable" aria-label="Turntable" aria-pressed="false" title="Turntable">${icon("play", 17)}</button>
          <button class="icon-btn" data-action="copy" aria-label="Copy image" title="Copy image">${icon("copy", 17)}</button>
          <span class="grow"></span>
          <span class="status" id="status"><i></i><span>Ready</span></span>
        </div>
        <button class="btn primary" data-action="export">${icon("download", 15, 2)}Export image</button>
      </div>
    </aside>`;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>("#view");
  const stage = $("#stage");
  const empty = $("#empty");
  const fileSlot = $("#file-slot");
  const tabsEl = $("#tabs");
  const dock = $("#dock");
  const lockedNote = $("#locked-note");
  const statusEl = $("#status");

  let viewer!: HexaViewer;
  let tab: Tab = "environment";
  let groups: Group[] = [];
  let selected: Group | null = null;
  let loading: { step: number } | null = null;
  let error: string | null = null;
  let thumb = "";
  let thumbDone = false;
  let statusText = "";
  let background: "white" | "colour" | "clear" = "white";
  let backgroundColour = "#ffffff";
  let currentEnv = SCENE_ENVIRONMENTS[0].id as string;
  const environments: Environment[] = [
    { id: "glass-studio", name: "Glass studio", chip: "Procedural", background: GLASS, source: GLASS_STUDIO },
    { id: SCENE_ENVIRONMENTS[0].id, name: "Studio", chip: "HDR", background: STUDIO, source: SCENE_ENVIRONMENTS[0].url },
    { id: SCENE_ENVIRONMENTS[1].id, name: "Metal 001", chip: "HDR", background: WARM, source: SCENE_ENVIRONMENTS[1].url },
  ];

  const fileInput = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: ".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2", hidden: true });
  const hdrInput = Object.assign(document.createElement("input"), { type: "file", accept: ".hdr,.exr", hidden: true });
  app.append(fileInput, hdrInput);

  // ---------- sliders and switches ----------
  const restart = () => viewer.pipeline.restart();
  const applyLook = () => viewer.pipeline.applySettings();
  const materialOf = () => selected?.materials[0] as (MeshStandardMaterial | undefined);
  const glassUniforms = () => (selected && isGlass(selected.materials[0]) ? glassOf(selected.materials[0]) : undefined);
  interface SliderDef { label: string; min: number; max: number; step: number; get(): number; set(v: number): void; fmt(v: number): string; commit?: boolean }
  const num = (v: number, digits = 2) => v.toFixed(digits);
  const SLIDERS: Record<string, SliderDef> = {
    "env.rotation": { label: "Rotation", min: 0, max: 360, step: 1, get: () => ((SETTINGS.environment.rotationY * 180) / Math.PI + 360) % 360, set: (v) => { SETTINGS.environment.rotationY = (v * Math.PI) / 180; restart(); }, fmt: (v) => `${Math.round(v)}°` },
    "env.intensity": { label: "Intensity", min: 0, max: 3, step: 0.01, get: () => SETTINGS.environment.intensity, set: (v) => { SETTINGS.environment.intensity = v; viewer.scene.environmentIntensity = v; restart(); }, fmt: num },
    "shadow.opacity": { label: "Opacity", min: 0, max: 1, step: 0.01, get: () => SETTINGS.groundShadow.opacity, set: (v) => { viewer.ground.setOpacity(v); restart(); }, fmt: num },
    "shadow.softness": { label: "Softness", min: 0, max: 1, step: 0.01, get: () => SETTINGS.groundShadow.spread, set: (v) => { SETTINGS.groundShadow.spread = v; if (viewer.model) viewer.ground.bake(viewer.renderer, viewer.scene); restart(); }, fmt: num, commit: true },
    "shadow.caustics": { label: "Caustics (glass)", min: 0, max: 2, step: 0.05, get: () => SETTINGS.groundShadow.caustics, set: (v) => { viewer.ground.setCaustics(v); if (viewer.model) viewer.ground.bake(viewer.renderer, viewer.scene); restart(); }, fmt: num, commit: true },
    "tone.exposure": { label: "Exposure", min: 0.2, max: 2, step: 0.01, get: () => SETTINGS.tone.exposure, set: (v) => { SETTINGS.tone.exposure = v; applyLook(); }, fmt: num },
    "tone.contrast": { label: "Contrast", min: 0.6, max: 1.6, step: 0.01, get: () => SETTINGS.tone.contrast, set: (v) => { SETTINGS.tone.contrast = v; applyLook(); }, fmt: num },
    "tone.saturation": { label: "Saturation", min: 0, max: 2, step: 0.01, get: () => SETTINGS.tone.saturation, set: (v) => { SETTINGS.tone.saturation = v; applyLook(); }, fmt: num },
    "bloom.intensity": { label: "Bloom", min: 0, max: 1.5, step: 0.01, get: () => SETTINGS.bloom.intensity, set: (v) => { SETTINGS.bloom.intensity = v; applyLook(); }, fmt: num },
    "mat.roughness": { label: "Roughness", min: 0, max: 1, step: 0.01, get: () => materialOf()?.roughness ?? 0, set: (v) => { selected?.materials.forEach((m) => { (m as MeshStandardMaterial).roughness = v; }); restart(); }, fmt: num },
    "mat.metalness": { label: "Metalness", min: 0, max: 1, step: 0.01, get: () => materialOf()?.metalness ?? 0, set: (v) => { selected?.materials.forEach((m) => { (m as MeshStandardMaterial).metalness = v; }); restart(); }, fmt: num },
    "glass.ior": { label: "Refractive index", min: 1, max: 2.33, step: 0.01, get: () => glassUniforms()?.glassIor.value ?? 1.5, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassIor.value = v; (m as MeshPhysicalMaterial).ior = v; }); restart(); }, fmt: num },
    "glass.bounces": { label: "Internal reflections", min: 0, max: 6, step: 0.05, get: () => glassUniforms()?.glassBounces.value ?? 0.8, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassBounces.value = v; }); restart(); }, fmt: num },
    "glass.crease": { label: "Edge sharpness", min: 0, max: 1.5, step: 0.01, get: () => glassUniforms()?.glassCrease.value ?? 0.25, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassCrease.value = v; }); restart(); }, fmt: num },
    "glass.blur": { label: "Internal softness", min: 0, max: 1, step: 0.01, get: () => glassUniforms()?.glassBlur.value ?? 0.12, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassBlur.value = v; }); restart(); }, fmt: num },
    "glass.density": { label: "Tint strength", min: 0, max: 4, step: 0.01, get: () => glassUniforms()?.glassDensity.value ?? 1, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassDensity.value = v; }); restart(); }, fmt: num },
    "glass.roughness": { label: "Frosting", min: 0, max: 1, step: 0.01, get: () => materialOf()?.roughness ?? 0, set: (v) => { selected?.materials.forEach((m) => { (m as MeshStandardMaterial).roughness = v; }); restart(); }, fmt: num },
    "glass.reflection": { label: "Reflection", min: 0, max: 2, step: 0.01, get: () => glassUniforms()?.glassReflection.value ?? 1, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassReflection.value = v; }); restart(); }, fmt: num },
    "glass.refraction": { label: "Refraction depth", min: 0, max: 3, step: 0.01, get: () => glassUniforms()?.glassRefraction.value ?? 1, set: (v) => { selected?.materials.forEach((m) => { glassOf(m).glassRefraction.value = v; }); restart(); }, fmt: num },
    "mat.sparkle": { label: "Sparkle intensity", min: 0, max: 3, step: 0.01, get: () => SETTINGS.stones.envIntensity, set: (v) => { SETTINGS.stones.envIntensity = v; selected?.materials.forEach((m) => { (m as ShaderMaterial).uniforms.envMapIntensity.value = v; }); restart(); }, fmt: num },
  };
  const slider = (key: string) => {
    const s = SLIDERS[key], v = s.get();
    return `<label class="field"><span class="label"><span>${s.label}</span><span data-val="${key}">${s.fmt(v)}</span></span><input type="range" data-slider="${key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" style="--p:${((v - s.min) / (s.max - s.min)) * 100}%"></label>`;
  };

  interface SwitchDef { label: string; hint?: () => string; get(): boolean; set(on: boolean): void; disabled?: () => boolean }
  const SWITCHES: Record<string, SwitchDef> = {
    "env.lock": { label: "Lock to camera", get: () => viewer.envMode.value === "inverse", set: (on) => { viewer.envMode.value = on ? "inverse" : "world"; restart(); } },
    "shadow.on": { label: "Ground shadow", get: () => SETTINGS.groundShadow.enabled, set: (on) => { SETTINGS.groundShadow.enabled = on; viewer.ground.setVisible(on); restart(); } },
    "fx.ssr": { label: "Screen-space reflections", get: () => SETTINGS.ssr.intensity > 0, set: (on) => { SETTINGS.ssr.intensity = on ? 1 : 0; applyLook(); } },
    "fx.ao": { label: "Ambient occlusion", get: () => SETTINGS.ssao.intensity > 0, set: (on) => { SETTINGS.ssao.intensity = on ? 0.1 : 0; applyLook(); } },
    jewelry: {
      label: "Jewelry mode",
      hint: () => (viewer.model?.info.jewelryAvailable ? "Diamond shader for stones, reflections for gold" : "No ring stones found in this file"),
      get: () => !!viewer.model?.info.jewelryMode, disabled: () => !viewer.model?.info.jewelryAvailable,
      set: (on) => { void run(() => viewer.setJewelryMode(on).then(() => viewer.model!.info)); },
    },
  };
  const toggle = (key: string, bare = false) => {
    const s = SWITCHES[key];
    const input = `<input class="sw" type="checkbox" data-switch="${key}" ${s.get() ? "checked" : ""} ${s.disabled?.() ? "disabled" : ""} aria-label="${esc(s.label)}">`;
    return bare ? input : `<label class="switch-row"><span>${s.label}${s.hint ? `<span class="hint">${esc(s.hint())}</span>` : ""}</span>${input}</label>`;
  };
  const seg = (key: string, options: [string, string][], current: string, extra = "") =>
    `<div class="seg ${extra}">${options.map(([v, l]) => `<button data-action="seg" data-key="${key}" data-value="${v}" aria-pressed="${v === current}">${l}</button>`).join("")}</div>`;

  // ---------- model groups ----------
  const buildGroups = (keep?: Mesh) => {
    groups = [];
    const byKey = new Map<string, Group>();
    viewer.model?.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const diamond = !!m.userData[DIAMOND_TAG];
        const key = diamond ? "diamond" : m.uuid;
        let g = byKey.get(key);
        if (!g) {
          const std = m as MeshStandardMaterial;
          const glass = isGlass(m);
          const tag = diamond ? "Gem" : glass ? "Glass" : (std.metalness ?? 0) >= 0.9 ? "Metal" : (m as { transmission?: number }).transmission || m.opacity < 1 ? "Glass" : "Standard";
          g = { key, name: diamond ? "Diamonds" : m.name || `Material ${byKey.size + 1}`, tag, materials: [], meshes: [], diamond, visible: mesh.visible };
          byKey.set(key, g);
          groups.push(g);
          if (!diamond && !glass) std.userData.hexaOriginal ??= { metalness: std.metalness, roughness: std.roughness };
        }
        g.materials.push(m);
        g.meshes.push(mesh);
      }
    });
    selected = (keep && groups.find((g) => g.meshes.includes(keep))) || groups.find((g) => g.tag === "Metal") || groups[0] || null;
  };
  const swatch = (g: Group) =>
    g.diamond ? "#f4f7fb" : isGlass(g.materials[0]) ? `#${glassOf(g.materials[0]).glassTint.value.getHexString()}` : `#${(g.materials[0] as MeshStandardMaterial).color?.getHexString() ?? "cccccc"}`;

  // ---------- rendering of the panel ----------
  const renderFile = () => {
    if (loading) {
      const pct = Math.round(((loading.step + 0.5) / LOAD_STEPS.length) * 100);
      fileSlot.innerHTML = `<div class="card progress"><div class="head"><b>Importing</b><span>${pct}%</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="steps">${LOAD_STEPS.map((s, i) => `<div class="${i < loading!.step ? "done" : i === loading!.step ? "now" : ""}">${s}</div>`).join("")}</div></div>`;
    } else if (error) {
      fileSlot.innerHTML = `<div class="card file error"><span class="meta"><b>Could not load the model</b><span>${esc(error)}</span></span><button class="btn small" data-action="dismiss">Dismiss</button></div>`;
    } else if (viewer.model) {
      const i = viewer.model.info;
      fileSlot.innerHTML = `<div class="card file"><span class="thumb" ${thumb ? `style="background-image:url(${thumb})"` : ""}></span><span class="meta"><b>${esc(i.name)}</b><span>${formatBytes(i.bytes)} · ${formatCount(i.triangles)} tris · ${i.meshes} meshes</span></span><button class="icon-btn outlined" data-action="browse" aria-label="Replace model" title="Replace model">${icon("swap")}</button></div>`;
    } else {
      fileSlot.innerHTML = `<div class="card file"><span class="meta"><b>No model loaded</b><span>Upload a GLB or GLTF to begin</span></span></div>`;
    }
  };

  const renderScene = () => {
    $("#pane-scene").innerHTML = `
      <div class="card"><h3>Materials <span style="font-weight:400;color:var(--muted);font-size:12px">${viewer.model ? `${viewer.model.info.meshes} meshes` : ""}</span></h3>
        <div>${groups.map((g) => `<div class="mat-row" role="button" tabindex="0" data-action="select" data-key="${g.key}" aria-current="${g === selected}">
          <span class="sw-dot" style="background:${swatch(g)}"></span><span class="name">${esc(g.name)}${g.meshes.length > 1 ? ` ×${g.meshes.length}` : ""}</span><span class="tag">${g.tag}</span>
          <button class="eye" data-action="eye" data-key="${g.key}" aria-pressed="${g.visible}" aria-label="Show or hide ${esc(g.name)}">${icon("eye", 15)}</button></div>`).join("")}</div>
      </div>
      <div class="card">${toggle("jewelry")}</div>`;
  };

  const renderMaterial = () => {
    const g = selected;
    if (!g) { $("#pane-material").innerHTML = `<div class="placeholder">Select a material in the Scene tab.</div>`; return; }
    const m = g.materials[0] as MeshStandardMaterial;
    const glass = isGlass(m);
    const type = g.diamond ? "gem" : glass ? "glass" : m.metalness >= 0.9 ? "metal" : "standard";
    const typeButton = (value: string, label: string, disabled = false) => `<button data-action="mat-type" data-value="${value}" aria-pressed="${type === value}" ${disabled ? "disabled" : ""}>${label}</button>`;
    const body = g.diamond
      ? `${slider("mat.sparkle")}<div class="callout">Diamonds use the refraction shader from Jewelry mode. Turn it off in the Scene tab to use the file's own materials.</div>`
      : glass
        ? `${slider("glass.bounces")}${slider("glass.crease")}${slider("glass.blur")}${slider("glass.ior")}<div class="val-row"><span>Tint colour</span><input type="color" data-color="glass" value="${swatch(g)}" aria-label="Glass tint colour"></div>${slider("glass.density")}${slider("glass.roughness")}${slider("glass.reflection")}${slider("glass.refraction")}`
        : `<div class="val-row"><span>Colour</span><input type="color" data-color="mat" value="${swatch(g)}" aria-label="Material colour"></div>${slider("mat.roughness")}${slider("mat.metalness")}`;
    $("#pane-material").innerHTML = `<div class="card">
      <h3>${esc(g.name)}<span class="val-row" style="gap:6px;font-weight:400;font-size:12px;color:var(--muted)"><span class="sw-dot" style="width:14px;height:14px;border-radius:5px;border:1px solid var(--line);background:${swatch(g)}"></span>${swatch(g).toUpperCase()}</span></h3>
      <div class="seg">${typeButton("standard", "Standard", g.diamond)}${typeButton("metal", "Metal", g.diamond)}${typeButton("glass", "Glass", g.diamond)}${g.diamond ? typeButton("gem", "Gem", true) : ""}</div>
      ${body}
    </div>`;
  };

  const renderEnvironment = () => {
    const env = environments.find((e) => e.id === currentEnv) ?? environments[0];
    $("#pane-environment").innerHTML = `
      <div class="card">
        <div class="env-preview" style="background:${env.background}"><b>${esc(env.name)}</b><span>${esc(env.chip)}</span></div>
        <div class="env-row">${environments.map((e) => `<button data-action="env" data-id="${esc(e.id)}" aria-pressed="${e.id === currentEnv}" aria-label="${esc(e.name)}" title="${esc(e.name)}" style="background:${e.background}"></button>`).join("")}<button class="add" data-action="env-upload" aria-label="Upload HDR or EXR" title="Upload .hdr or .exr">${icon("plus", 16, 2)}</button></div>
        ${slider("env.rotation")}${slider("env.intensity")}${toggle("env.lock")}
        <div class="val-row"><span>Background</span>${background === "colour" ? `<input type="color" data-color="bg" value="${backgroundColour}" aria-label="Background colour">` : ""}${seg("bg", [["white", "White"], ["clear", "Clear"], ["colour", "Colour"]], background, "small inline")}</div>
      </div>
      <div class="card"><h3>Ground shadow ${toggle("shadow.on", true)}</h3>${slider("shadow.opacity")}${slider("shadow.softness")}${slider("shadow.caustics")}</div>`;
  };

  const renderRender = () => {
    $("#pane-render").innerHTML = `
      <div class="card"><h3>Quality</h3>
        <div class="field"><span class="label"><span>Accumulated frames</span></span>${seg("frames", [["8", "8"], ["16", "16"], ["32", "32"], ["64", "64"]], String(SETTINGS.accumulationFrames), "small")}</div>
        <div class="field"><span class="label"><span>Resolution scale</span></span>${seg("scale", [["1", "1×"], ["1.5", "1.5×"], ["2", "2×"]], String(SETTINGS.pixelRatioScale), "small")}</div>
      </div>
      <div class="card"><h3>Look</h3>${slider("tone.exposure")}${slider("tone.contrast")}${slider("tone.saturation")}${slider("bloom.intensity")}</div>
      <div class="card"><h3>Effects</h3>${toggle("fx.ssr")}${toggle("fx.ao")}</div>`;
  };

  const renderers: Record<Tab, () => void> = { scene: renderScene, material: renderMaterial, environment: renderEnvironment, render: renderRender };
  const renderTabs = () => {
    const hasModel = !!viewer?.model;
    tabsEl.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    tabsEl.classList.toggle("locked", !hasModel);
    dock.classList.toggle("locked", !hasModel);
    lockedNote.hidden = hasModel;
    TABS.forEach((t) => { $(`#pane-${t.id}`).hidden = !hasModel || t.id !== tab; });
    if (hasModel) renderers[tab]();
    empty.hidden = hasModel;
    stage.classList.toggle("clear", background === "clear");
  };
  const renderAll = () => { renderFile(); renderTabs(); };

  // ---------- loading ----------
  const run = async (task: (onStep: (step: number) => void) => Promise<ModelInfo>) => {
    error = null;
    loading = { step: 0 };
    renderFile();
    try {
      await task((step) => { loading = { step }; renderFile(); });
      thumb = ""; thumbDone = false;
      buildGroups();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = null;
      renderAll();
    }
  };
  const loadFiles = (files: File[]) => run((onStep) => viewer.loadFiles(files, { onStep }));
  const download = (blob: Blob, name: string) => {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- events ----------
  const actions: Record<string, (el: HTMLElement) => void | Promise<void>> = {
    browse: () => fileInput.click(),
    sample: () => run((onStep) => viewer.loadSample({ onStep })),
    link: () => { const row = $("#link-row"); row.hidden = !row.hidden; if (!row.hidden) $<HTMLInputElement>("#link-input").focus(); },
    "load-link": () => run(async (onStep) => {
      const url = $<HTMLInputElement>("#link-input").value.trim();
      const response = await fetch(url).catch(() => { throw new Error("The link could not be reached (the server may not allow it)."); });
      if (!response.ok) throw new Error(`The link returned ${response.status}.`);
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "model.glb");
      return viewer.loadFiles([new File([await response.blob()], name)], { onStep });
    }),
    dismiss: () => { error = null; renderFile(); },
    tab: (el) => { tab = el.dataset.tab as Tab; renderTabs(); },
    select: (el) => { selected = groups.find((g) => g.key === el.dataset.key) ?? selected; tab = "material"; renderTabs(); },
    eye: (el) => {
      const g = groups.find((x) => x.key === el.dataset.key);
      if (!g) return;
      g.visible = !g.visible;
      g.meshes.forEach((m) => { m.visible = g.visible; });
      viewer.ground.bake(viewer.renderer, viewer.scene);
      restart();
      renderScene();
    },
    "mat-type": (el) => {
      const group = selected;
      if (!group) return;
      const wasGlass = group.tag === "Glass" && isGlass(group.materials[0]);
      // Glass is a different material: swap it in or out first, then rebuild the list around the same mesh.
      if (el.dataset.value === "glass") {
        if (wasGlass) return;
        viewer.applyGlass(group.meshes);
        viewer.ground.bake(viewer.renderer, viewer.scene); // glass casts a lighter shadow
        buildGroups(group.meshes[0]);
        renderScene();
        renderMaterial();
        return;
      }
      if (wasGlass) { viewer.restoreMaterials(group.meshes); viewer.ground.bake(viewer.renderer, viewer.scene); buildGroups(group.meshes[0]); renderScene(); }
      const original = (selected?.materials[0] as MeshStandardMaterial | undefined)?.userData.hexaOriginal as { metalness: number; roughness: number } | undefined;
      selected?.materials.forEach((m) => {
        const std = m as MeshStandardMaterial;
        if (el.dataset.value === "metal") { std.metalness = 1; std.roughness = Math.min(std.roughness, 0.15); } else if (original) { std.metalness = original.metalness; std.roughness = original.roughness; }
      });
      restart();
      renderMaterial();
    },
    env: async (el) => {
      const env = environments.find((e) => e.id === el.dataset.id);
      if (!env || env.id === currentEnv) return;
      currentEnv = env.id;
      renderEnvironment();
      await viewer.setEnvironment(env.source);
    },
    "env-upload": () => hdrInput.click(),
    seg: (el) => {
      const value = el.dataset.value!;
      switch (el.dataset.key) {
        case "bg": background = value as typeof background; viewer.pipeline.setBackground(background, backgroundColour); stage.classList.toggle("clear", background === "clear"); renderEnvironment(); break;
        case "frames": SETTINGS.accumulationFrames = Number(value); restart(); renderRender(); break;
        case "scale": viewer.setResolutionScale(Number(value)); renderRender(); break;
      }
    },
    view: (el) => {
      viewer.pipeline.view = el.dataset.value as HexaViewer["pipeline"]["view"];
      dock.querySelectorAll<HTMLButtonElement>("[data-action=view]").forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
    },
    reset: () => viewer.resetCamera(),
    fit: () => viewer.fitCamera(),
    turntable: (el) => { const on = el.getAttribute("aria-pressed") !== "true"; el.setAttribute("aria-pressed", String(on)); viewer.setTurntable(on); },
    copy: async (el) => {
      const blob = await viewer.capture();
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); el.title = "Copied"; setTimeout(() => (el.title = "Copy image"), 1500); } catch { download(blob, "hexa-view.png"); }
    },
    export: async () => { download(await viewer.capture(), `${(viewer.model?.info.name ?? "hexa-view").replace(/\.[^.]+$/, "")}.png`); },
  };

  app.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (el && !(el as HTMLButtonElement).disabled) void actions[el.dataset.action!]?.(el);
  });
  app.addEventListener("keydown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".mat-row");
    if (el && (e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); actions.select(el); }
  });
  app.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.slider;
    if (!key) return;
    const s = SLIDERS[key], v = Number(input.value);
    input.style.setProperty("--p", `${((v - s.min) / (s.max - s.min)) * 100}%`);
    app.querySelector(`[data-val="${key}"]`)!.textContent = s.fmt(v);
    if (!s.commit) s.set(v);
  });
  app.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.slider && SLIDERS[input.dataset.slider].commit) SLIDERS[input.dataset.slider].set(Number(input.value));
    const key = input.dataset.slider ?? "";
    // The caustics depend on the glass settings (tint, index), so they are baked again when a glass slider is released.
    if (key.startsWith("glass.") && SETTINGS.groundShadow.caustics > 0 && viewer.model) viewer.ground.bake(viewer.renderer, viewer.scene);
    if (input.dataset.switch) { SWITCHES[input.dataset.switch].set(input.checked); }
    if (input.dataset.color === "bg") { backgroundColour = input.value; viewer.pipeline.setBackground("colour", backgroundColour); }
    if (input.dataset.color === "glass" && selected) {
      selected.materials.forEach((m) => glassOf(m).glassTint.value.set(input.value));
      restart();
      renderScene();
      renderMaterial();
    }
    if (input.dataset.color === "mat" && selected) {
      selected.materials.forEach((m) => (m as MeshStandardMaterial).color.set(input.value));
      restart();
      renderScene();
    }
  });
  fileInput.addEventListener("change", () => { if (fileInput.files?.length) void loadFiles([...fileInput.files]); fileInput.value = ""; });
  hdrInput.addEventListener("change", async () => {
    const file = hdrInput.files?.[0];
    hdrInput.value = "";
    if (!file) return;
    try {
      const { width } = await viewer.setEnvironment(file);
      const id = `upload-${environments.length}`;
      environments.push({ id, name: file.name.replace(/\.[^.]+$/, ""), chip: `${width >= 1024 ? `${Math.round(width / 1024)}K` : width} · ${file.name.split(".").pop()!.toUpperCase()}`, background: COOL, source: file });
      currentEnv = id;
      renderEnvironment();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      renderFile();
    }
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("dragging");
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) void loadFiles(files);
  });

  return {
    canvas,
    /** Connect the finished viewer. */
    bind(v: HexaViewer) {
      viewer = v;
      renderAll();
    },
    /** Call once per animation frame, after `viewer.tick()`. */
    frame() {
      if (!viewer) return;
      const p = viewer.pipeline;
      const text = p.converged ? `Converged ${SETTINGS.accumulationFrames}/${SETTINGS.accumulationFrames}` : `Rendering ${p.frame}/${SETTINGS.accumulationFrames}`;
      if (text !== statusText) {
        statusText = text;
        statusEl.classList.toggle("busy", !p.converged);
        statusEl.lastElementChild!.textContent = text;
      }
      if (viewer.model && p.converged && !thumbDone && p.view === "beauty") {
        thumbDone = true;
        thumb = viewer.thumbnail(104);
        if (!loading && !error) renderFile();
      }
    },
    /** Start a load from code (used by ?sample). */
    loadSample: () => run((onStep) => viewer.loadSample({ onStep })),
    /** The page's default model: the perfume bottle, with glass applied. */
    loadDefault: async () => {
      await run((onStep) => viewer.loadUrl(PATHS.bottle, "Glass_With_Room.glb", { onStep, glass: (mesh) => mesh.name === "bottle_glass", focus: "bottle_glass" }));
      // A product-shot view: the camera a little above the bottle, so the base and the neck opening show as ellipses.
      viewer.controls.minDistance = 0;
      viewer.camera.position.set(0, 3.2, 10.2);
      viewer.controls.update();
      currentEnv = "glass-studio";
      await viewer.setEnvironment(GLASS_STUDIO);
      if (viewer.model) renderEnvironment();
    },
  };
}

export type Ui = ReturnType<typeof mountUi>;
