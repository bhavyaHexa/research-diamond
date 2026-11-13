// How light gets into the image: the HDR environment (reflections and ambient light) and
// the separate environment the diamonds refract. The directional light is controlled by the
// engine's own RandomizedDirectionalLight plugin (see effects.ts, group "mainLight"); it
// re-applies its own direction every frame, so writing the light object directly does nothing.
import { GEM_ENVIRONMENTS, SCENE_ENVIRONMENTS } from "../constants";
import type { Viewer } from "../vendor";
import { getContext, getViewer, plugin, redraw } from "./engineAccess";
import type { ControlGroup } from "./types";

const TWO_PI = Math.PI * 2;

// ---------- HDR environment switching ----------
// Textures are loaded once and kept, so switching back is instant.
const loaded = new Map<string, Viewer>();
let currentScene: string = SCENE_ENVIRONMENTS[0].id;
let currentGem: string = GEM_ENVIRONMENTS[0].id;

async function loadHdr(url: string): Promise<Viewer> {
  const cached = loaded.get(url);
  if (cached) return cached;
  const texture = await getContext().manager.importer.importSinglePath(url);
  loaded.set(url, texture);
  return texture;
}

async function setSceneEnvironment(id: string) {
  const entry = SCENE_ENVIRONMENTS.find((e) => e.id === id);
  if (!entry || id === currentScene) return;
  const viewer = getViewer();
  const texture = await loadHdr(entry.url);
  // Read the rotation only after the (asynchronous) load, so a rotation set while the image
  // was loading is kept, not overwritten with a stale value.
  texture.rotation = viewer.scene.environment?.rotation ?? 0;
  await viewer.scene.setEnvironment(texture);
  currentScene = id;
  redraw();
}

async function setGemEnvironment(id: string) {
  const entry = GEM_ENVIRONMENTS.find((e) => e.id === id);
  if (!entry || id === currentGem) return;
  const texture = await loadHdr(entry.url);
  texture.rotation = plugin("Diamond")?.envMap?.rotation ?? 0;
  getViewer().plugins.Diamond.envMap = texture;
  currentGem = id;
  redraw();
}

export function lightingGroups(): ControlGroup[] {
  return [
    {
      id: "environment",
      title: "Environment (HDR light)",
      section: "Scene & light",
      description:
        "The HDR image is the main light source. It is pre-blurred into a roughness ladder (PMREM) and sampled in the reflection direction by the gold. With 'camera-fixed' on, the direction is kept in view space, so the lighting stays with the camera when you orbit.",
      controls: () => {
        const scene = getViewer().scene;
        return [
          {
            kind: "select", id: "environment.image", label: "Environment image",
            options: SCENE_ENVIRONMENTS.map((e) => ({ label: e.label, value: e.id })),
            get: () => currentScene,
            set: (v) => void setSceneEnvironment(String(v)),
          },
          {
            kind: "slider", id: "environment.rotation", label: "Rotation", min: 0, max: TWO_PI, step: 0.01,
            get: () => scene.environment?.rotation ?? 0,
            set: (v) => { if (scene.environment) scene.environment.rotation = v; scene.setDirty?.(); redraw(); },
          },
          {
            kind: "slider", id: "environment.intensity", label: "Intensity", min: 0, max: 5, step: 0.01,
            get: () => scene.envMapIntensity,
            set: (v) => { scene.envMapIntensity = v; redraw(); },
          },
          {
            kind: "toggle", id: "environment.cameraFixed", label: "Camera-fixed environment",
            get: () => !!scene.fixedEnvMapDirection,
            set: (v) => { scene.fixedEnvMapDirection = v; redraw(); },
          },
          {
            kind: "color", id: "environment.background", label: "Background colour",
            get: () => "#" + (scene.backgroundColor?.getHexString?.() ?? "ffffff"),
            set: (hex) => { scene.setBackgroundColor(hex); redraw(); },
          },
          {
            kind: "slider", id: "environment.backgroundIntensity", label: "Background intensity", min: 0, max: 4, step: 0.01,
            get: () => scene.backgroundIntensity ?? 1,
            set: (v) => { scene.backgroundIntensity = v; redraw(); },
          },
        ];
      },
    },
    {
      id: "gemEnvironment",
      title: "Gem environment (diamond light)",
      section: "Scene & light",
      description:
        "Diamonds do not use scene lights. Light that leaves the stone is read straight from this separate 512² HDR image with no blur, so its few extremely bright spots become the sparkle.",
      controls: () => [
        {
          kind: "select", id: "gemEnvironment.image", label: "Gem environment image",
          options: GEM_ENVIRONMENTS.map((e) => ({ label: e.label, value: e.id })),
          get: () => currentGem,
          set: (v) => void setGemEnvironment(String(v)),
        },
        {
          kind: "slider", id: "gemEnvironment.rotation", label: "Rotation", min: 0, max: TWO_PI, step: 0.01,
          get: () => plugin("Diamond")?.envMapRotation ?? 0,
          set: (v) => { const d = plugin("Diamond"); if (d) d.envMapRotation = v; redraw(); },
        },
      ],
    },
  ];
}
