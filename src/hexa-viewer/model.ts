// Reading a model file into a three.js Group, measuring it, and placing it in the scene.
// GLB, and GLTF with its separate .bin / textures (drop all the files together). Everything is read in the browser.
import { Box3, BufferGeometry, Group, LoadingManager, Material, Mesh, Object3D, Texture, Vector3 } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const MODEL_FILE = /\.(glb|gltf)$/i;

/** Longest side of every uploaded model after fitting. The sample ring is about this big, so the camera, shadow and SSR settings tuned on it fit any model. */
const REFERENCE_SIZE = 3;

export interface ModelStats {
  triangles: number;
  meshes: number;
  materials: number;
}

const dracoLoader = new DRACOLoader().setDecoderPath("/draco/");

export async function readModel(files: File[]): Promise<{ root: Group; name: string; bytes: number }> {
  const main = files.find((f) => MODEL_FILE.test(f.name));
  if (!main) throw new Error("Choose a .glb or .gltf file.");

  // A .gltf points at its .bin and textures by relative path: serve the dropped files under their own names.
  const urls = new Map(files.map((f) => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    const name = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "").toLowerCase();
    return urls.get(name) ?? url;
  });
  const loader = new GLTFLoader(manager).setDRACOLoader(dracoLoader).setMeshoptDecoder(MeshoptDecoder);

  try {
    const data = await main.arrayBuffer();
    const gltf = await loader.parseAsync(/\.glb$/i.test(main.name) ? data : new TextDecoder().decode(data), "");
    return { root: gltf.scene, name: main.name, bytes: files.reduce((sum, f) => sum + f.size, 0) };
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
}

export function measureModel(root: Group): ModelStats {
  let triangles = 0, meshes = 0;
  const materials = new Set<Material>();
  root.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const mesh = o as Mesh;
    meshes++;
    const g = mesh.geometry as BufferGeometry;
    triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
  });
  return { triangles: Math.round(triangles), meshes, materials: materials.size };
}

/** Scale the model so its longest side is REFERENCE_SIZE, put its centre at the origin (the camera orbits the origin) and return the height of its lowest point. */
export function fitToReference(root: Group, focus?: Object3D): number {
  // `focus`: fit and centre on this part only (the bottle in a room), so the camera frames it and the rest of the model is just around it.
  const target = focus ?? root;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(target);
  const size = box.getSize(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (longest > 0) root.scale.multiplyScalar(REFERENCE_SIZE / longest);
  root.updateMatrixWorld(true);
  box.setFromObject(target);
  root.position.sub(box.getCenter(new Vector3()));
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(target).min.y;
}

/** The sample ring keeps its authored placement; this only undoes an export made ~10x too big. */
export function placeSample(root: Group): number {
  const box = new Box3().setFromObject(root);
  if (box.max.x >= 5 || box.max.y >= 5) root.scale.set(0.1, 0.1, 0.1);
  return -1.5;
}

export function disposeModel(root: Group) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material)) if ((value as Texture)?.isTexture) (value as Texture).dispose();
      material.dispose();
    }
  });
}
