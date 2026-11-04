import { PATHS } from "./constants";
import type { GemKey, MetalKey } from "./types";
import type { VendorEngine, Viewer } from "./vendor";
import type { RootStore } from "./store";
import { loadRing, loadScenePreset } from "./scene/ring";
import { applyLights } from "./scene/lights";
import { applyQuality, applySceneSettings } from "./scene/setup";
import { createMaterialHandle, whitenDiamonds } from "./scene/materials";
import { applyControls, frameRing, playCameraIntro } from "./scene/camera";

export interface SceneHandle {
  applyGem(key: GemKey): void;
  applyMetal(key: MetalKey): void;
}

// The vendor bundle is loaded at runtime from public/vendor, so it stays out of the app bundle.
let engine: Promise<VendorEngine> | undefined;
// The bundle is self-contained. It is fetched as text and imported from a Blob URL,
// because Vite's dev server refuses to transform files in public/ when they are imported.
const loadEngine = () => {
  engine ??= (async () => {
    const res = await fetch(PATHS.vendorBundle);
    if (!res.ok) throw new Error(`Engine bundle request failed: ${res.status}`);
    const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/javascript" }));
    return import(/* @vite-ignore */ url) as Promise<VendorEngine>;
  })();
  return engine;
};

// Builds the scene on `canvas` in the same order as the original viewer script.
export async function startViewer(canvas: HTMLCanvasElement, store: RootStore): Promise<SceneHandle> {
  const { viewer: status } = store;
  const W = await loadEngine();

  status.setStep("Starting the viewer", 0.1);
  const viewer = new W.ViewerApp({ canvas, useRgbm: true });
  // Debugging hook: `window.viewer` in the browser console.
  (window as unknown as { viewer: Viewer }).viewer = viewer;
  const manager = await viewer.addPlugin(W.AssetManagerPlugin);
  await W.addBasePlugins(viewer);
  viewer.renderer.refreshPipeline();
  viewer.getPlugin(W.FrameFadePlugin).fadeOnSceneUpdate = false;
  viewer.scene.addEventListener("sceneUpdate", () =>
    viewer.getPlugin(W.FrameFadePlugin).startTransition(0),
  );
  await viewer.addPlugin(W.SimpleTextPlugin);

  // The ring loads before the scene settings: its embedded viewer config is applied on
  // load, and everything after this step overrides it.
  status.setStep("Loading the ring", 0.3);
  const model = await loadRing(W, viewer);
  status.setStep("Loading the scene", 0.6);
  await loadScenePreset(manager);
  await applyLights(manager, viewer);
  applySceneSettings(viewer);
  applyControls(viewer);

  whitenDiamonds(viewer, model);
  const handle = createMaterialHandle(viewer, model);
  handle.applyGem(store.materials.gem);
  handle.applyMetal(store.materials.metal);

  const centre = frameRing(W, viewer, model);
  applyQuality(viewer);
  viewer.setDirty();

  status.ready();
  await playCameraIntro(W, viewer, centre);
  return handle;
}
