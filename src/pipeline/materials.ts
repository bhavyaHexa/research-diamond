// Gold and diamond material controls. They write to every material of that kind on the ring.
import type { Viewer } from "../vendor";
import { getContext, redraw } from "./engineAccess";
import type { Control, ControlGroup } from "./types";

interface Found {
  metals: Viewer[];
  gems: Viewer[];
}

function findMaterials(): Found {
  const metals = new Set<Viewer>();
  const gems = new Set<Viewer>();
  getContext().model.modelObject.traverse((o: Viewer) => {
    if (!o.isMesh || !o.material) return;
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      if (material.isDiamondMaterial) gems.add(material);
      else if (material.metalness === 1) metals.add(material);
    }
  });
  return { metals: [...metals], gems: [...gems] };
}

/** Write one property on every material, then ask the engine to rebuild and redraw. */
function applyAll(list: Viewer[], write: (material: Viewer) => void) {
  for (const material of list) {
    write(material);
    material.needsUpdate = true;
    material.setDirty?.();
  }
  redraw();
}

function metalControls(): Control[] {
  const { metals } = findMaterials();
  const first = () => metals[0];
  const num = (id: string, label: string, key: string, min: number, max: number, step: number): Control => ({
    kind: "slider", id: `metal.${id}`, label, min, max, step,
    get: () => Number(first()?.[key] ?? 0),
    set: (v) => applyAll(metals, (m) => { m[key] = v; }),
  });
  return [
    {
      kind: "color", id: "metal.color", label: "Base colour (= reflectance F0)",
      get: () => "#" + (first()?.color?.getHexString?.() ?? "ffffff"),
      set: (hex) => applyAll(metals, (m) => m.color.set(hex)),
    },
    num("roughness", "Roughness (floored at 0.0525 in the shader)", "roughness", 0, 1, 0.005),
    num("metalness", "Metalness", "metalness", 0, 1, 0.01),
    num("ior", "IOR (no effect at metalness 1)", "ior", 1, 2.5, 0.01),
    num("specularIntensity", "Specular intensity", "specularIntensity", 0, 1, 0.01),
    num("clearcoat", "Clearcoat", "clearcoat", 0, 1, 0.01),
    num("clearcoatRoughness", "Clearcoat roughness", "clearcoatRoughness", 0, 1, 0.01),
    num("iridescence", "Iridescence", "iridescence", 0, 1, 0.01),
  ];
}

function gemControls(): Control[] {
  const { gems } = findMaterials();
  const first = () => gems[0];
  const num = (id: string, label: string, key: string, min: number, max: number, step: number): Control => ({
    kind: "slider", id: `gem.${id}`, label, min, max, step,
    get: () => Number(first()?.[key] ?? 0),
    set: (v) => applyAll(gems, (m) => { m[key] = v; }),
  });
  return [
    {
      kind: "color", id: "gem.color", label: "Absorption colour (not a surface tint)",
      get: () => "#" + (first()?.color?.getHexString?.() ?? "ffffff"),
      set: (hex) => applyAll(gems, (m) => m.color.set(hex)),
    },
    num("refractiveIndex", "Refractive index", "refractiveIndex", 1, 4, 0.01),
    num("rayBounces", "Ray bounces (rebuilds the shader)", "rayBounces", 1, 16, 1),
    num("dispersion", "Dispersion (colour fringes)", "dispersion", 0, 0.1, 0.0005),
    num("absorptionFactor", "Absorption", "absorptionFactor", 0, 15, 0.01),
    {
      kind: "slider", id: "gem.boost", label: "Boost (brightness & energy kept per bounce)", min: 0, max: 4, step: 0.01,
      get: () => first()?.boostFactors?.x ?? 1,
      set: (v) => applyAll(gems, (m) => m.boostFactors.set(v, v, v)),
    },
    num("gammaFactor", "Gamma (contrast of darks)", "gammaFactor", 0.1, 4, 0.01),
    num("reflectivity", "Surface reflectivity", "reflectivity", 0, 2, 0.01),
    num("envMapIntensity", "Environment intensity", "envMapIntensity", 0, 5, 0.01),
    num("squashFactor", "Proxy sphere squash", "squashFactor", 0.5, 1.5, 0.005),
    num("geometryFactor", "Proxy sphere guess (geometryFactor)", "geometryFactor", 0.1, 1, 0.01),
    {
      kind: "toggle", id: "gem.diamondOrientedEnvMap", label: "Orient environment with the stone",
      get: () => !!first()?.diamondOrientedEnvMap,
      set: (v) => applyAll(gems, (m) => { m.diamondOrientedEnvMap = v ? 1 : 0; }),
    },
  ];
}

export function materialGroups(): ControlGroup[] {
  return [
    {
      id: "metal",
      title: "Gold / metal material",
      section: "Materials",
      description:
        "A physically-based metal: its colour is its reflectance, there is no diffuse term, and the picture is mostly the HDR environment reflected in a near-mirror (roughness floored at 0.0525).",
      controls: metalControls,
    },
    {
      id: "gem",
      title: "Diamond material",
      section: "Materials",
      description:
        "Refraction through a baked distance cube map: bounce, absorb, total internal reflection, exit toward the gem environment. Applies to every stone on the ring.",
      controls: gemControls,
    },
  ];
}

/** Whether the ring currently has any materials of each kind (the UI hides empty groups). */
export function materialCounts() {
  const { metals, gems } = findMaterials();
  return { metals: metals.length, gems: gems.length };
}
