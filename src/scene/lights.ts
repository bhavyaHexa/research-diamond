import { PATHS } from "../constants";
import type { Viewer } from "../vendor";

// Lighting: the gem environment for the diamonds and the scene's HDR environment.
export async function applyLights(manager: Viewer, viewer: Viewer) {
  // The GLB's own gem env (an EXR that isn't shipped) binds as an empty 0x0 image,
  // which renders transmission-0 diamonds black, so it is replaced here.
  const gemEnv = await manager.importer.importSinglePath(PATHS.gemEnvironment);
  viewer.plugins.Diamond.envMap = gemEnv;
  await viewer.scene.setEnvironment(await manager.importer.importSinglePath(PATHS.lightmap));
  viewer.scene.environment.rotation = 2;
}
