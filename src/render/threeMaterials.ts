import { BufferGeometry, Mesh, MeshPhysicalMaterial, Scene, ShaderMaterial, Texture, WebGLRenderer } from "three";
import type { GemKey, MetalKey, MetalSpec, GemSpec } from "../types";
import { slug } from "../utils";
import {
  DIAMOND_TAG,
  applyDiamondSettings,
  bindStone,
  captureStoneNormals,
  createCaptureMaterial,
  createDiamondMaterial,
} from "./diamond";
import { computeStoneOffsets, type StoneOffsets } from "./diamondGeometry";

// Stone node names that get the white-diamond treatment (halo D4xxx, centre D5).
// Ruby band stones (D1xxx) stay as authored.
export const WHITEN_PATTERN = /^d(4\d{3}|5)$/;

// Yellow is Ring_v1's authored M1 material.
export const METALS: Record<MetalKey, MetalSpec> = {
  yellow: {
    color: [0.7835377915215659, 0.450785782828426, 0.1844749944900301],
    roughness: 0,
    ior: 1.5,
  },
};

// White matches the whitening treatment below.
export const GEMS: Record<GemKey, GemSpec> = {
  white: { color: "#e4e4e4", absorption: 1, boost: 2 },
};

export const DEFAULT_METAL: MetalKey = "yellow";
export const DEFAULT_GEM: GemKey = "white";

// Converts matching stones to the diamond shader. Each stone's facet normals are captured
// once per geometry, before the stone is first drawn.
export function whitenDiamonds(renderer: WebGLRenderer, scene: Scene, gemEnv: Texture) {
  const captureMaterial = createCaptureMaterial();
  const captured = new Map<BufferGeometry, { offsets: StoneOffsets; normals: Texture }>();

  scene.traverse((o) => {
    if (!(o instanceof Mesh) || !slug(o.name).match(WHITEN_PATTERN)) return;
    const geometry = o.geometry as BufferGeometry;
    let entry = captured.get(geometry);
    if (!entry) {
      const offsets = computeStoneOffsets(geometry);
      const target = captureStoneNormals(renderer, geometry, offsets, captureMaterial);
      entry = { offsets, normals: target.texture };
      captured.set(geometry, entry);
    }
    o.material = createDiamondMaterial(gemEnv, entry.offsets, entry.normals);
    bindStone(o, entry.offsets);
  });
}

// Returns functions that change the stones and metal of the loaded ring.
export function createMaterialHandle(scene: Scene, redraw: () => void) {
  const metals = new Set<MeshPhysicalMaterial>();
  const gems = new Set<ShaderMaterial>();
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const material = o.material;
    if (material.userData[DIAMOND_TAG]) gems.add(material as ShaderMaterial);
    else if ("metalness" in material && material.metalness === 1) metals.add(material as MeshPhysicalMaterial);
  });

  const applyMetal = (key: MetalKey) => {
    const p = METALS[key];
    for (const mat of metals) {
      mat.color.fromArray(p.color);
      mat.roughness = p.roughness;
      mat.metalness = 1;
      mat.ior = p.ior;
      mat.needsUpdate = true;
    }
    redraw();
  };

  // Every stone gets the same diamond settings, so all of them change together.
  const applyGem = (key: GemKey) => {
    const g = GEMS[key];
    for (const mat of gems) applyDiamondSettings(mat, g.color, g.absorption, g.boost);
    redraw();
  };

  return { applyMetal, applyGem };
}
