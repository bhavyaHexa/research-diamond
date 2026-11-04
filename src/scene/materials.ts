import type { GemKey, MetalKey, MetalSpec, GemSpec } from "../types";
import type { Viewer } from "../vendor";
import { slug } from "../utils";

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

// Converts matching stones to the diamond shader. Each material is converted once,
// then every mesh gets its facet normal map (required even after makeDiamond).
export function whitenDiamonds(viewer: Viewer, model: Viewer) {
  const converted = new Set<string>();
  model.modelObject.traverse((o: Viewer) => {
    if (!o.isMesh || !o.material) return;
    if (!slug(o.name).match(WHITEN_PATTERN)) return;
    const cacheKey = "whitened-" + slug(o.name).replace(/[0-9]/g, "");
    const key = o.material.uuid || cacheKey;
    if (!converted.has(key)) {
      converted.add(key);
      viewer.plugins.Diamond.makeDiamond(
        o.material,
        { normalMapRes: 512, cacheKey },
        {
          isDiamond: true,
          color: 0xe4e4e4,
          refractiveIndex: 2.42,
          envMapIntensity: 1.6,
          dispersion: 0.004,
          absorptionFactor: 1,
          gammaFactor: 1.09,
          boostFactors: { x: 2, y: 2, z: 2, isVector3: true },
          transmission: 0,
          reflectivity: 0.46,
          rayBounces: 6,
        },
      );
    }
    viewer.plugins.Diamond.prepareDiamondMesh(o, { cacheKey, normalMapRes: 512 });
  });
}

// Returns functions that change the stones and metal of one loaded ring.
export function createMaterialHandle(viewer: Viewer, model: Viewer) {
  const metals = new Set<Viewer>();
  const gems = new Set<Viewer>();
  model.modelObject.traverse((o: Viewer) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.isDiamondMaterial) gems.add(o.material);
    else if (o.material.metalness === 1) metals.add(o.material);
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
    viewer.setDirty();
  };

  // Every stone gets the same diamond settings, so all of them change together.
  const applyGem = (key: GemKey) => {
    const g = GEMS[key];
    for (const mat of gems) {
      mat.color.set(g.color);
      mat.absorptionFactor = g.absorption;
      mat.uniforms.boostFactors.value.set(g.boost, g.boost, g.boost);
      mat.transmission = 0;
      mat.refractiveIndex = 2.42;
      mat.envMapIntensity = 1.6;
      mat.gammaFactor = 1.09;
      mat.reflectivity = 0.46;
      // Match the whitened stones, so the as-authored band stones get the same fire.
      mat.rayBounces = 6;
      mat.dispersion = 0.004;
      mat.needsUpdate = true;
      mat.setDirty?.();
    }
    viewer.setDirty();
  };

  return { applyMetal, applyGem };
}
