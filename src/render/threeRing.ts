import { Box3, Group, Scene } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PATHS } from "../constants";

// Loads the ring GLB and adds it to the scene.
export async function loadRing(scene: Scene): Promise<Group> {
  const gltf = await new GLTFLoader().loadAsync(PATHS.ring);
  const ring = gltf.scene;
  // Oversize guard for exports left ~10x too big (e.g. missing their scale):
  // bbox half-size >= 5 -> scale to 0.1. The ring reaches ~1.5 (about 3 units tall).
  const bbox = new Box3().setFromObject(ring);
  if (bbox.max.x >= 5 || bbox.max.y >= 5) ring.scale.set(0.1, 0.1, 0.1);
  scene.add(ring);
  return ring;
}
