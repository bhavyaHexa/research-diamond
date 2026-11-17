// The Hexa 3D Viewer: plain three.js scene + src/hexa-viewer/pipeline.ts for the frame.
// Nothing here touches the vendored engine. Models come from files the user gives it (or the sample ring).
import {
  EquirectangularReflectionMapping, Group, Matrix4, Mesh, PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, Scene,
  Texture, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { PATHS } from "../constants";
import { applyLights } from "../render/threeLights";
import {
  DEFAULT_GEM, DEFAULT_METAL, WHITEN_PATTERN, createMaterialHandle, whitenDiamonds,
} from "../render/threeMaterials";
import { CAMERA_INTRO, FOV, ZOOM, createControls } from "../render/threeCamera";
import { slug } from "../utils";
import { Pipeline } from "./pipeline";
import { addLightAndGround } from "./ground";
import { disposeModel, fitToReference, measureModel, placeSample, readModel, type ModelStats } from "./model";
import { enableSsr } from "./ssr";
import { SETTINGS } from "./settings";

export const LOAD_STEPS = ["Reading file", "Preparing materials", "Fitting camera and ground", "Baking ground shadow"] as const;

export interface ModelInfo extends ModelStats {
  name: string;
  bytes: number;
  /** The file has the ring's stone names, so the diamond shader can be used. */
  jewelryAvailable: boolean;
  /** Diamond shader and metal reflections are on. */
  jewelryMode: boolean;
}

export interface LoadOptions {
  /** Called as each loading step starts (index into LOAD_STEPS). */
  onStep?: (step: number) => void;
  /** Force Jewelry mode on or off. Default: on when the file has the ring's stone names. */
  jewelry?: boolean;
}

export interface HexaViewer {
  renderer: WebGLRenderer;
  ground: ReturnType<typeof addLightAndGround>;
  envMode: { value: "camera" | "inverse" | "world" };
  pipeline: Pipeline;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  scene: Scene;
  /** The model on screen, or null. */
  model: { root: Group; info: ModelInfo } | null;
  /** Draw one frame (one more jittered sample). */
  tick(): void;
  /** Place the camera at the shipped end-of-intro position. */
  resetCamera(): void;
  /** Keep the viewing direction, return to the default distance. */
  fitCamera(): void;
  setTurntable(on: boolean): void;
  setResolutionScale(scale: number): void;
  loadFiles(files: File[], options?: LoadOptions): Promise<ModelInfo>;
  loadSample(options?: LoadOptions): Promise<ModelInfo>;
  /** Change Jewelry mode for the model on screen (reloads its materials). */
  setJewelryMode(on: boolean): Promise<void>;
  clearModel(): void;
  /** A .hdr or .exr file (or URL) lights the model and its reflections. Returns the name and pixel width. */
  setEnvironment(source: string | File): Promise<{ name: string; width: number }>;
  /** PNG of the current frame (transparent where nothing is drawn if the background is "clear"). */
  capture(): Promise<Blob>;
  /** Square data URL of the middle of the current frame, for the file card. */
  thumbnail(size: number): string;
}

const pause = (ms = 30) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const DEFAULT_DISTANCE = Math.hypot(CAMERA_INTRO.to.x, CAMERA_INTRO.to.y, CAMERA_INTRO.to.z);

export async function startHexaViewer(canvas: HTMLCanvasElement): Promise<HexaViewer> {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(window.devicePixelRatio * SETTINGS.pixelRatioScale);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = 0; // tone mapping happens once, in the composite pass

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  const pipeline = new Pipeline(renderer);

  const gemEnv = await applyLights(renderer, scene);
  scene.environmentIntensity = SETTINGS.environment.intensity;

  // Ground and lights first: the ground height moves with each model.
  const ground = addLightAndGround(scene, -1.5);
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

  // Camera-fixed environment. three turns the reflection into world space, then multiplies
  // by the inverse of environmentRotation. The engine instead keeps the reflection in view
  // space and yaws it, so environmentRotation must be camera * yaw (not an Euler-component add).
  const cameraRotation = new Matrix4();
  const yaw = new Matrix4();
  const envMode = { value: "inverse" as "inverse" | "world" };
  const applyEnvironmentRotation = () => {
    camera.updateMatrixWorld();
    cameraRotation.extractRotation(camera.matrixWorld);
    if (envMode.value === "world") cameraRotation.identity();
    yaw.makeRotationY(SETTINGS.environment.rotationY);
    cameraRotation.multiply(yaw);
    scene.environmentRotation.setFromRotationMatrix(cameraRotation);
  };

  // ---- the model on screen ----
  let current: { root: Group; info: ModelInfo; files: File[]; sample: boolean } | null = null;

  const jewelryNames = (root: Group) => {
    let found = false;
    root.traverse((o) => { if ((o as Mesh).isMesh && WHITEN_PATTERN.test(slug(o.name))) found = true; });
    return found;
  };

  /** Jewelry mode: stones get the diamond shader, metals get reflections. Otherwise every PBR material of the file gets reflections and AO. */
  const prepareMaterials = (root: Group, jewelry: boolean) => {
    if (jewelry) {
      whitenDiamonds(renderer, scene, gemEnv);
      const handle = createMaterialHandle(scene, () => {});
      handle.applyGem(DEFAULT_GEM);
      handle.applyMetal(DEFAULT_METAL);
      scene.traverse((o) => {
        const m = (o as { material?: { isMeshPhysicalMaterial?: boolean; metalness?: number } }).material;
        if (m?.isMeshPhysicalMaterial && m.metalness === 1) enableSsr(m as never);
        const u = (o as { material?: { uniforms?: { envMapIntensity?: { value: number } } } }).material?.uniforms;
        if (u?.envMapIntensity) u.envMapIntensity.value = SETTINGS.stones.envIntensity;
      });
      return;
    }
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ((m as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) enableSsr(m as never);
      }
    });
  };

  const removeCurrent = () => {
    if (!current) return;
    scene.remove(current.root);
    disposeModel(current.root);
    current = null;
  };

  const show = async (files: File[], sample: boolean, options: LoadOptions): Promise<ModelInfo> => {
    const step = async (i: number) => { options.onStep?.(i); await pause(); };
    await step(0);
    const { root, name, bytes } = await readModel(files);

    await step(1);
    const available = jewelryNames(root);
    const jewelryMode = (options.jewelry ?? available) && available;
    removeCurrent();
    scene.add(root);
    prepareMaterials(root, jewelryMode);

    await step(2);
    ground.setHeight(sample ? placeSample(root) : fitToReference(root));
    resetCamera();

    await step(3);
    ground.bake(renderer, scene);
    ground.setVisible(SETTINGS.groundShadow.enabled);
    pipeline.restart();

    const info: ModelInfo = { ...measureModel(root), name, bytes, jewelryAvailable: available, jewelryMode };
    current = { root, info, files, sample };
    viewer.model = { root, info };
    return info;
  };

  const loadEquirect = async (source: string | File) => {
    const name = typeof source === "string" ? decodeURIComponent(source.split("?")[0].split("/").pop() ?? source) : source.name;
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    try {
      const loader = /\.exr$/i.test(name) ? new EXRLoader() : new RGBELoader();
      const texture: Texture = await loader.loadAsync(url);
      texture.mapping = EquirectangularReflectionMapping;
      return { name, texture };
    } finally {
      if (typeof source !== "string") URL.revokeObjectURL(url);
    }
  };

  const viewer: HexaViewer = {
    renderer, ground, envMode, pipeline, camera, controls, scene, model: null,
    tick() {
      applyEnvironmentRotation();
      if (controls.autoRotate) controls.update();
      pipeline.step(scene, camera);
    },
    resetCamera,
    fitCamera() {
      const direction = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(direction, DEFAULT_DISTANCE);
      controls.update();
      pipeline.restart();
    },
    setTurntable(on) {
      controls.autoRotate = on;
      controls.autoRotateSpeed = 3;
      pipeline.restart();
    },
    setResolutionScale(scale) {
      SETTINGS.pixelRatioScale = scale;
      renderer.setPixelRatio(window.devicePixelRatio * scale);
      fit();
    },
    loadFiles: (files, options = {}) => show(files, false, options),
    async loadSample(options = {}) {
      const response = await fetch(PATHS.ring);
      if (!response.ok) throw new Error("The sample model could not be loaded.");
      return show([new File([await response.blob()], "ring-halo.glb")], true, options);
    },
    async setJewelryMode(on) {
      if (!current) return;
      const { files, sample } = current;
      await show(files, sample, { jewelry: on });
    },
    clearModel() {
      removeCurrent();
      viewer.model = null;
      ground.setVisible(false);
      pipeline.restart();
    },
    async setEnvironment(source) {
      const { name, texture } = await loadEquirect(source);
      const pmrem = new PMREMGenerator(renderer);
      const previous = scene.environment;
      scene.environment = pmrem.fromEquirectangular(texture).texture;
      previous?.dispose();
      pmrem.dispose();
      const width = (texture.image as { width?: number } | undefined)?.width ?? 0;
      texture.dispose();
      pipeline.restart();
      return { name, width };
    },
    capture() {
      viewer.tick();
      return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the image."))), "image/png"));
    },
    thumbnail(size) {
      const side = Math.min(canvas.width, canvas.height) * 0.7;
      const out = document.createElement("canvas");
      out.width = out.height = size;
      const g = out.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, size, size);
      g.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, size, size);
      return out.toDataURL("image/png");
    },
  };
  return viewer;
}
