// The own viewer: plain three.js scene + src/own/pipeline.ts for the frame.
// Nothing here touches the vendored engine.
import { Euler, Matrix4, PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { PATHS } from "../constants";
import { applyLights } from "../render/threeLights";
import { loadRing } from "../render/threeRing";
import { createMaterialHandle, whitenDiamonds } from "../render/threeMaterials";
import { CAMERA_INTRO, FOV, ZOOM, createControls, ringCentre } from "../render/threeCamera";
import { DEFAULT_GEM, DEFAULT_METAL } from "../render/threeMaterials";
import { Pipeline, halton } from "./pipeline";
import { addLightAndGround } from "./ground";
import { enableSsr } from "./ssr";
import { SETTINGS } from "./settings";

void PATHS;

export interface OwnViewer {
  renderer: WebGLRenderer;
  ground: ReturnType<typeof addLightAndGround>;
  envMode: { value: "camera" | "inverse" | "world" };
  pipeline: Pipeline;
  camera: PerspectiveCamera;
  scene: Scene;
  /** Draw one frame (one more jittered sample). */
  tick(): void;
  /** Place the camera at the shipped end-of-intro position. */
  resetCamera(): void;
}

export async function startOwnViewer(canvas: HTMLCanvasElement): Promise<OwnViewer> {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(window.devicePixelRatio * SETTINGS.pixelRatioScale);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = 0; // tone mapping happens once, in the composite pass

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  const pipeline = new Pipeline(renderer);

  const ring = await loadRing(scene);
  const gemEnv = await applyLights(renderer, scene);
  whitenDiamonds(renderer, scene, gemEnv);
  const handle = createMaterialHandle(scene, () => {});
  handle.applyGem(DEFAULT_GEM);
  handle.applyMetal(DEFAULT_METAL);
  scene.traverse((o) => {
    const m = (o as { material?: { isMeshPhysicalMaterial?: boolean; metalness?: number } }).material;
    if (m?.isMeshPhysicalMaterial && m.metalness === 1) enableSsr(m as never);
  });
  scene.environmentIntensity = SETTINGS.environment.intensity;
  // The engine's scene-wide environment intensity overrides each material's own value, so the
  // stones' stored 1.6 never takes effect: they are lit at the scene intensity.
  scene.traverse((o) => {
    const u = (o as { material?: { uniforms?: { envMapIntensity?: { value: number } } } }).material?.uniforms;
    if (u?.envMapIntensity) u.envMapIntensity.value = SETTINGS.environment.intensity;
  });

  // The shipped scene orbits the world origin (not the ring's bounding-box centre).
  void ringCentre(ring);
  // Ring bottom sits at y = -1.5; the ground catches its shadow there.
  const ground = addLightAndGround(scene, -1.5);
  pipeline.onBeforeFrame = (n) => ground.jitter(n, halton);
  const centre = { x: 0, y: 0, z: 0 };
  const controls = createControls(camera, canvas, centre, () => pipeline.restart());
  controls.minDistance = ZOOM.min;
  controls.maxDistance = ZOOM.max;

  const resetCamera = () => {
    camera.position.set(CAMERA_INTRO.to.x, CAMERA_INTRO.to.y, CAMERA_INTRO.to.z);
    camera.lookAt(centre.x, centre.y, centre.z);
    controls.target.set(centre.x, centre.y, centre.z);
    controls.update();
    pipeline.restart();
  };
  resetCamera();

  const fit = () => {
    const w = Math.round(canvas.clientWidth * renderer.getPixelRatio());
    const h = Math.round(canvas.clientHeight * renderer.getPixelRatio());
    if (w === 0 || h === 0) return;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    pipeline.resize(w, h);
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  // "Camera-fixed" environment (the engine's FIX_ENV_DIRECTION): reflection directions stay in
  // view space and are only rotated about Y, so the lighting stays put on screen while you
  // orbit. three.js converts view -> world first, so the environment is turned by the inverse
  // of the camera rotation to cancel that out, then by the shipped Y rotation.
  const m = new Matrix4();
  const envMode = { value: "inverse" as "camera" | "inverse" | "world" };
  const applyEnvironmentRotation = () => {
    camera.updateMatrixWorld();
    m.extractRotation(camera.matrixWorld);
    if (envMode.value === "inverse") m.invert();
    if (envMode.value === "world") m.identity();
    scene.environmentRotation.setFromRotationMatrix(m, "YXZ");
    scene.environmentRotation.y += SETTINGS.environment.rotationY;
  };
  void Euler;

  return {
    renderer, ground, envMode, pipeline, camera, scene, resetCamera,
    tick() {
      applyEnvironmentRotation();
      pipeline.step(scene, camera);
    },
  };
}
