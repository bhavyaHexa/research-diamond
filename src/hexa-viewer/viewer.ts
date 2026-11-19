// The Hexa 3D Viewer: plain three.js scene + src/hexa-viewer/pipeline.ts for the frame.
// Nothing here touches the vendored engine. Models come from files the user gives it (or the sample ring).
import {
  Box3, CubeCamera, EquirectangularReflectionMapping, Group, HalfFloatType, Material, Matrix4, Mesh, Object3D, PCFSoftShadowMap, PMREMGenerator, PerspectiveCamera, Quaternion, Scene,
  Texture, Vector3, WebGLCubeRenderTarget, WebGLRenderer,
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
import { GLASS_STUDIO, createGlassStudio } from "./environments";
import { createGlassMaterial, glassOf, isGlass } from "./glass";
import { Pipeline } from "./pipeline";
import { PlanarReflection } from "./reflection";
import { addLightAndGround } from "./ground";
import { disposeModel, fitToReference, measureModel, placeSample, readModel, type ModelStats } from "./model";
import { enableSsr } from "./ssr";
import { SETTINGS } from "./settings";

export const LOAD_STEPS = ["Reading file", "Preparing materials", "Fitting camera and ground", "Applying glass material", "Baking ground shadow"] as const;

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
  /** Give every mesh, or only selected meshes, the glass material once loaded. */
  glass?: boolean | ((mesh: Mesh) => boolean);
  /** Name of the part to frame (a bottle in a room): the model is scaled and centred on it, and the camera orbits it. */
  focus?: string;
  /** A bottle model to stand in the room (see loadRoom): placed on the floor, framed by the camera, and every mesh of it gets the glass material. */
  bottle?: File;
}

export interface HexaViewer {
  renderer: WebGLRenderer;
  ground: ReturnType<typeof addLightAndGround>;
  envMode: { value: "camera" | "inverse" | "world" };
  pipeline: Pipeline;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  scene: Scene;
  /** The bottle standing in the room (null when the model on screen is not a room with a bottle). */
  bottle: Group | null;
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
  /** Load a room model and stand a bottle model in it. */
  loadRoom(roomUrl: string, bottleUrl: string, options?: LoadOptions): Promise<ModelInfo>;
  /** Replace the bottle of the room by another model: scaled to the bottle size, put on the floor, all its meshes made glass. */
  replaceBottle(file: File): Promise<void>;
  loadSample(options?: LoadOptions): Promise<ModelInfo>;
  /** Load a model file from a URL. `sample` keeps the file's own placement instead of fitting it (the ring). */
  loadUrl(url: string, name: string, options?: LoadOptions & { sample?: boolean }): Promise<ModelInfo>;
  /** Change Jewelry mode for the model on screen (reloads its materials). */
  setJewelryMode(on: boolean): Promise<void>;
  clearModel(): void;
  /** Give these meshes one shared glass material (their own material is kept so it can be restored). */
  applyGlass(meshes: Mesh[]): Material;
  /** Undo `applyGlass`: the meshes get their file material back . */
  restoreMaterials(meshes: Mesh[]): void;
  /** A .hdr or .exr file (or URL) lights the model and its reflections. Returns the name and pixel width. */
  setEnvironment(source: string | File | Texture): Promise<{ name: string; width: number }>;
  /** Separate option: light the glass with a cubemap of the SCENE (the room around the bottle) instead of the studio map, so the glass blends with the room. Off by default. */
  setSceneReflections(on: boolean): void;
  readonly sceneReflections: boolean;
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

  // The studio map and the cubemap of the scene (PMREM), either of which can light the glass.
  let studioEnvironment: Texture | null = null;
  let sceneEnvironment: Texture | null = null;
  let saved: { mode: typeof envMode.value; yaw: number } | null = null;

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

  // The floor reflection: mirrored glass meshes just below their own bases, drawn with a fade.
  const mirrors: Mesh[] = [];
  const clearMirrors = () => { mirrors.splice(0).forEach((m) => { m.removeFromParent(); (m.material as Material).dispose(); }); };
  const addMirrors = (meshes: Mesh[], glass: Material) => {
    clearMirrors();
    for (const mesh of meshes) {
      if (Array.isArray(mesh.material)) continue;
      mesh.updateWorldMatrix(true, false);
      const y = new Box3().setFromObject(mesh).min.y;
      const flip = new Matrix4().makeTranslation(0, y, 0).multiply(new Matrix4().makeScale(1, -1, 1)).multiply(new Matrix4().makeTranslation(0, -y, 0));
      const material = createGlassMaterial("reflection", undefined, glassOf(glass), new Vector3(y, SETTINGS.floorReflection.length, SETTINGS.floorReflection.strength));
      const mirror = new Mesh(mesh.geometry, material);
      mirror.matrixAutoUpdate = false;
      mirror.matrix.copy(flip).multiply(mesh.matrixWorld);
      mirror.frustumCulled = false;
      mirror.castShadow = false;
      mirror.userData.reflection = true;
      mirror.userData.skipDepth = true;
      scene.add(mirror);
      mirrors.push(mirror);
    }
  };

  // Floors of a room model: every material called "Calacatta..." (the marble slab under the bottle and the floor of the room are different meshes) shows a mirror image.
  let floorReflection: PlanarReflection | null = null;
  const removeFloorReflection = () => { pipeline.reflection = null; floorReflection?.dispose(); floorReflection = null; };
  const addFloorReflection = (root: Group) => {
    const floors = new Set<Material>();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (/calacatta/i.test(m.name)) floors.add(m);
    });
    if (floors.size === 0) return;
    const [w, h] = pipeline.size;
    floorReflection = new PlanarReflection(w, h);
    floorReflection.planeY = ground.height;
    floorReflection.hide = [ground.mesh];
    floors.forEach((m) => floorReflection!.patch(m));
    pipeline.reflection = floorReflection;
    clearMirrors();            // the mirror image comes from the floor now, not from copies under the ground
  };

  // ---- a bottle standing in a room ----
  const BOTTLE_SIZE = 0.06;            // an uploaded bottle is scaled so its largest side is this (the room is built around a 5 cm bottle)
  /** Height of the floor: the top of the marble meshes of the room (outside the bottle). */
  const floorLevel = (root: Group, bottle: Group) => {
    let top = -Infinity;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (let p: Object3D | null = mesh; p; p = p.parent) if (p === bottle) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some((m) => /calacatta/i.test(m.name))) top = Math.max(top, new Box3().setFromObject(mesh).max.y);
    });
    return Number.isFinite(top) ? top : new Box3().setFromObject(root).min.y;
  };
  /** Stand the bottle on the floor at the middle of the room's reference point; `fit` scales it to BOTTLE_SIZE first. Needs the room at its own scale. */
  const placeBottle = (root: Group, bottle: Group, fit: boolean) => {
    root.updateMatrixWorld(true);
    const floor = floorLevel(root, bottle);
    bottle.position.set(0, 0, 0);
    bottle.scale.set(1, 1, 1);
    bottle.updateMatrixWorld(true);
    const box = new Box3().setFromObject(bottle);
    if (fit) {
      const size = box.getSize(new Vector3());
      bottle.scale.setScalar(BOTTLE_SIZE / Math.max(size.x, size.y, size.z, 1e-6));
      bottle.updateMatrixWorld(true);
      box.setFromObject(bottle);
    }
    const centre = box.getCenter(new Vector3());
    bottle.position.set(-centre.x, floor - box.min.y, -centre.z);
    bottle.updateMatrixWorld(true);
  };
  const addBottle = async (root: Group, file: File, fit: boolean) => {
    const { root: bottle } = await readModel([file]);
    bottle.name = "bottle";
    root.add(bottle);
    placeBottle(root, bottle, fit);
    return bottle;
  };
  const meshesOf = (group: Group) => { const out: Mesh[] = []; group.traverse((o) => { if ((o as Mesh).isMesh) out.push(o as Mesh); }); return out; };

  const removeCurrent = () => {
    if (viewer.sceneReflections) viewer.setSceneReflections(false);   // the cubemap belongs to the old scene
    clearMirrors();
    removeFloorReflection();
    viewer.bottle = null;
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
    const bottle = options.bottle ? await addBottle(root, options.bottle, false) : null;
    viewer.bottle = bottle;

    await step(2);
    const focus = bottle ?? (options.focus ? root.getObjectByName(options.focus) ?? undefined : undefined);
    ground.setHeight(sample ? placeSample(root) : fitToReference(root, focus));
    resetCamera();

    const glassOption = bottle ? true : options.glass;
    if (glassOption) {
      await step(3);
      // With a bottle in a room only the bottle is glass: every mesh of it.
      const meshes: Mesh[] = [];
      (bottle ?? root).traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && (bottle || glassOption === true || (typeof glassOption === "function" && glassOption(mesh)))) meshes.push(mesh);
      });
      viewer.applyGlass(meshes);
    }

    addFloorReflection(root);

    await step(4);
    ground.bake(renderer, scene);
    ground.setVisible(SETTINGS.groundShadow.enabled);
    pipeline.restart();

    const info: ModelInfo = { ...measureModel(root), name, bytes, jewelryAvailable: available, jewelryMode };
    current = { root, info, files, sample };
    viewer.model = { root, info };
    return info;
  };

  const loadEquirect = async (source: string | File | Texture) => {
    if (typeof source !== "string" && (source as Texture).isTexture) return { name: "Custom", texture: source as Texture };
    if (typeof source !== "string" && !(source instanceof File)) throw new Error("Unsupported environment.");
    if (source === GLASS_STUDIO) return { name: "Glass studio", texture: createGlassStudio() as Texture };
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
    renderer, ground, envMode, pipeline, camera, controls, scene, model: null, bottle: null,
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
    loadSample: (options = {}) => viewer.loadUrl(PATHS.ring, "ring-halo.glb", { ...options, sample: true }),
    async loadUrl(url, name, { sample = false, ...options } = {}) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${name} could not be loaded.`);
      return show([new File([await response.blob()], name)], sample, options);
    },
    async loadRoom(roomUrl, bottleUrl, options = {}) {
      const [room, bottle] = await Promise.all([roomUrl, bottleUrl].map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url} could not be loaded.`);
        return new File([await response.blob()], url.split("/").pop() ?? "model.glb");
      }));
      return show([room], false, { ...options, bottle });
    },
    async replaceBottle(file) {
      if (!current || !viewer.bottle) throw new Error("Load a room first.");
      const root = current.root;
      const sceneLight = viewer.sceneReflections;
      if (sceneLight) viewer.setSceneReflections(false);
      clearMirrors();
      root.remove(viewer.bottle);
      disposeModel(viewer.bottle as Group);
      // The room was scaled and moved to frame the old bottle: back to its own scale, place the new bottle, frame it.
      root.scale.set(1, 1, 1);
      root.position.set(0, 0, 0);
      const bottle = await addBottle(root, file, true);
      viewer.bottle = bottle;
      ground.setHeight(fitToReference(root, bottle));
      viewer.applyGlass(meshesOf(bottle));
      if (floorReflection) { floorReflection.planeY = ground.height; clearMirrors(); }
      ground.bake(renderer, scene);
      Object.assign(current.info, measureModel(root));
      if (sceneLight) viewer.setSceneReflections(true);
      pipeline.restart();
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
    applyGlass(meshes) {
      const glass = createGlassMaterial((meshes[0]?.material as Material | undefined)?.name || "Glass");
      for (const mesh of meshes) {
        if (Array.isArray(mesh.material)) continue;
        mesh.userData.hexaOriginal ??= mesh.material;
        mesh.material = glass;
        mesh.userData.skipDepth = true; // SSR and AO ignore glass
      }
      if (SETTINGS.floorReflection.strength > 0) addMirrors(meshes, glass);
      pipeline.restart();
      return glass;
    },
    restoreMaterials(meshes) {
      clearMirrors();
      const glass = new Set<Material>();
      for (const mesh of meshes) {
        const original = mesh.userData.hexaOriginal as Material | undefined;
        if (!original) continue;
        glass.add(mesh.material as Material);
        mesh.material = original;
        mesh.userData.skipDepth = false;
        delete mesh.userData.hexaOriginal;
      }
      glass.forEach((m) => m.dispose());
      pipeline.restart();
    },
    async setEnvironment(source) {
      const { name, texture } = await loadEquirect(source);
      const pmrem = new PMREMGenerator(renderer);
      const previous = studioEnvironment;
      studioEnvironment = pmrem.fromEquirectangular(texture).texture;
      if (!viewer.sceneReflections) scene.environment = studioEnvironment;
      previous?.dispose();
      pmrem.dispose();
      const width = (texture.image as { width?: number } | undefined)?.width ?? 0;
      texture.dispose();
      pipeline.restart();
      return { name, width };
    },
    sceneReflections: false,
    setSceneReflections(on) {
      if (on === viewer.sceneReflections) return;
      (viewer as { sceneReflections: boolean }).sceneReflections = on;
      if (on) {
        // A cubemap of the scene as seen from the middle of the focus (the bottle), without the glass, its mirror copies, the
        // shadow plane or the floor's own mirror image. The environment must then stay fixed in the world.
        saved = { mode: envMode.value, yaw: SETTINGS.environment.rotationY };
        const target = new WebGLCubeRenderTarget(512, { type: HalfFloatType, generateMipmaps: false });
        const cubeCamera = new CubeCamera(0.01, 400, target);
        cubeCamera.position.set(0, 0, 0);
        const hidden: [Object3D, boolean][] = [];
        scene.traverse((o) => {
          const mesh = o as Mesh;
          if (mesh.isMesh && ((!Array.isArray(mesh.material) && isGlass(mesh.material)) || mesh.userData.reflection)) { hidden.push([mesh, mesh.visible]); mesh.visible = false; }
        });
        hidden.push([ground.mesh, ground.mesh.visible]); ground.mesh.visible = false;
        floorReflection?.setMirrorStrength(0);
        cubeCamera.update(renderer, scene);
        for (const [o, visible] of hidden) o.visible = visible;
        const pmrem = new PMREMGenerator(renderer);
        sceneEnvironment?.dispose();
        sceneEnvironment = pmrem.fromCubemap(target.texture).texture;
        pmrem.dispose();
        target.dispose();
        envMode.value = "world";
        SETTINGS.environment.rotationY = 0;
        scene.environment = sceneEnvironment;
      } else {
        scene.environment = studioEnvironment;
        if (saved) { envMode.value = saved.mode; SETTINGS.environment.rotationY = saved.yaw; }
      }
      pipeline.restart();
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
