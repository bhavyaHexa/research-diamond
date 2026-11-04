import { NoToneMapping, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { GemKey, MetalKey } from "../types";
import type { RootStore } from "../store";
import { loadRing } from "./threeRing";
import { applyLights } from "./threeLights";
import { applyQuality } from "./threeSetup";
import { createMaterialHandle, whitenDiamonds } from "./threeMaterials";
import { FOV, createControls, playCameraIntro, ringCentre } from "./threeCamera";

export interface SceneHandle {
  applyGem(key: GemKey): void;
  applyMetal(key: MetalKey): void;
}

// Builds the ring scene on the renderer's canvas. The diamonds use the shaders in
// src/shaders/pipeline.ts. The ring, the lights and the camera use three.js directly.
// Not active: the viewer renders with the bundle (src/engine.ts).
export async function startViewer(gl: WebGLRenderer, store: RootStore): Promise<SceneHandle> {
  const { viewer: status } = store;
  const canvas = gl.domElement;

  status.setStep("Starting the viewer", 0.1);
  gl.setClearColor(0xffffff, 1);
  gl.toneMapping = NoToneMapping;
  applyQuality(gl);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
  const redraw = () => gl.render(scene, camera);

  status.setStep("Loading the ring", 0.3);
  const ring = await loadRing(scene);
  status.setStep("Loading the scene", 0.6);
  const gemEnv = await applyLights(gl, scene);
  whitenDiamonds(gl, scene, gemEnv);

  const handle = createMaterialHandle(scene, redraw);
  handle.applyGem(store.materials.gem);
  handle.applyMetal(store.materials.metal);

  const centre = ringCentre(ring);
  const controls = createControls(camera, canvas, centre, redraw);
  new ResizeObserver(() => {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    redraw();
  }).observe(canvas);

  status.ready();
  await playCameraIntro(camera, controls, centre, redraw);
  return handle;
}
