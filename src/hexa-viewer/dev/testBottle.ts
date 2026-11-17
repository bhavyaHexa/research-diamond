// Development helper (not part of the app bundle): a simple perfume bottle as a GLB file, for testing the glass.
// Thick glass shell with a closed cavity inside it, a liquid mesh in the cavity, and no cap.
import { BufferGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Profile = [radius: number, height: number][];

/** A surface of revolution whose normals point away from the axis (`outward`) or toward it. */
function lathe(profile: Profile, outward: boolean): BufferGeometry {
  const g = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 96);
  const j = profile.findIndex(([r]) => r > 0.1);
  const p = g.attributes.position, n = g.attributes.normal;
  const radial = p.getX(j) * n.getX(j) + p.getZ(j) * n.getZ(j);
  if (radial > 0 !== outward) {
    const index = g.index!;
    for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return g;
}

export async function makeTestBottle(): Promise<File> {
  const outer = lathe([[0, -1.5], [0.9, -1.5], [1.05, -1.4], [1.1, -1.2], [1.1, 0.7], [1.0, 0.95], [0.5, 1.15], [0.38, 1.25], [0.38, 1.5], [0, 1.5]], true);
  const cavity = lathe([[0, -1.15], [0.8, -1.15], [0.88, -1.05], [0.9, -0.9], [0.9, 0.5], [0.8, 0.7], [0.25, 0.9], [0.2, 1.0], [0.2, 1.3], [0, 1.3]], false);
  const glass = new Mesh(mergeGeometries([outer, cavity])!, new MeshStandardMaterial({ name: "Glass", color: "#dfeeee", roughness: 0.05 }));
  glass.name = "Glass";
  const liquid = new Mesh(lathe([[0, -1.1], [0.86, -1.1], [0.88, -1.0], [0.88, 0.3], [0, 0.3]], true), new MeshStandardMaterial({ name: "Liquid", color: "#c26a0a", roughness: 0.15 }));
  liquid.name = "Liquid";
  const root = new Group();
  root.add(glass, liquid);
  const data = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  return new File([data], "perfume-test.glb", { type: "model/gltf-binary" });
}
