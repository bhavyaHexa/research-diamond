import { PATHS } from "../constants";
import type { Viewer, VendorEngine } from "../vendor";

// Loads the ring GLB. Its embedded viewer settings are applied here, so every scene
// step after this one overrides them.
export async function loadRing(W: VendorEngine, viewer: Viewer) {
  const model = (
    await viewer.plugins.AssetManager.addFromPath(PATHS.ring, {
      pseudoCenter: false,
      autoCenter: false,
      autoScale: false,
    })
  )[0];
  // Oversize guard for exports left ~10x too big (e.g. missing their scale):
  // bbox half-size >= 5 -> scale to 0.1. The ring reaches ~1.5 (about 3 units tall).
  const bbox = new W.Box3().expandByObject(model.modelObject);
  if (bbox.max.x >= 5 || bbox.max.y >= 5) model.modelObject.scale.set(0.1, 0.1, 0.1);
  return model;
}

// The scene preset (camera target, ground and other defaults).
export async function loadScenePreset(manager: Viewer) {
  await manager.importer.importSinglePath(PATHS.scenePreset, { processImported: true });
}
