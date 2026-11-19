// The baked hotel room (from the rug configurator) as an optional scene around the glass bottle.
// Room lighting is baked: each mesh's second UV set (uv1) samples a lightmap that is overlaid on the base colour.
// See ROOM_TRANSFER.md in demo-rug-configurator for the source of these rules.
import { Box3, ClampToEdgeWrapping, Group, Material, Mesh, MeshStandardMaterial, NoColorSpace, Object3D, SRGBColorSpace, Texture, TextureLoader, Vector3 } from "three";
import { PATHS } from "../constants";
import { readModel } from "./model";

const norm = (name: string) => name.replace(/ /g, "_");
const MULTIPLY_MESH = "EGE_Texture_Atlas_1_Room_1#EGE_Texture_Atlas_1_Room_1";
/** The room is lit by its baked lightmaps, not by the viewer lights: the baked colour is added as emitted light. */
const BAKE_GAIN = 0.8;
const SHADOW_LIFT = 0.15;   // mixes the lightmap 15% toward white
const MULTIPLY_FACTOR = 0.7;
/** Height of the bottle in the room, in metres (the room is built in metres). */
const BOTTLE_HEIGHT = 0.2;
/** Where on the tabletop (metres from its centre) the bottle stands: clear of the vase (left, behind) and the books (in front). */
const BOTTLE_OFFSET = { x: 0.2, z: 0.02 };

/** Blend a baked lightmap (uv1) over the material's base colour. Overlay by default, multiply for the one atlas that needs it. */
function applyLightmapOverlay(material: MeshStandardMaterial, lightMap: Texture, multiply: boolean) {
  const map = multiply ? lightMap.clone() : lightMap;
  map.flipY = false;
  map.colorSpace = multiply ? NoColorSpace : SRGBColorSpace;
  map.needsUpdate = true;
  material.lightMap = null;
  material.envMapIntensity = 0;     // the room has no environment reflections
  material.defines = { ...material.defines, USE_UV1: "" };
  material.userData.baked = true;   // the viewer must not patch this material with SSR (it would replace this shader patch)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lightMapOverlay = { value: map };
    shader.vertexShader = shader.vertexShader
      .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying vec2 vLmUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLmUv = uv1;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <map_pars_fragment>", "#include <map_pars_fragment>\nuniform sampler2D lightMapOverlay;\nvarying vec2 vLmUv;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * ${BAKE_GAIN.toFixed(3)};`)
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 lm = texture2D(lightMapOverlay, vLmUv).rgb;
        ${multiply
          ? `diffuseColor.rgb *= mix(vec3(1.0), lm, ${MULTIPLY_FACTOR.toFixed(4)});`
          : `lm = mix(lm, vec3(1.0), ${SHADOW_LIFT.toFixed(4)});
        vec3 b = diffuseColor.rgb;
        diffuseColor.rgb = mix(2.0 * b * lm, 1.0 - 2.0 * (1.0 - b) * (1.0 - lm), step(0.5, b));`}`);
  };
  material.customProgramCacheKey = () => (multiply ? `room-lm-multiply-${MULTIPLY_FACTOR}-${BAKE_GAIN}` : `room-lm-overlay-${SHADOW_LIFT}-${BAKE_GAIN}`);
  material.needsUpdate = true;
}

const hidden = (mesh: Mesh) =>
  [mesh.name, mesh.geometry.name].filter(Boolean).some((n) => {
    const s = norm(n).toLowerCase();
    return s.includes("blocker") || s.includes("carpet") || s === "plane.001" || s === "plane001";
  });

const namesOf = (o: Object3D) => [o.name, (o as Mesh).geometry?.name, o.userData?.name].filter(Boolean).map(norm);

/** Load the lightmaps, put them on the room's meshes, hide the helper planes, and stand the glass bottle on the table. Called on the room GLB root. */
export async function decorateRoom(root: Group): Promise<void> {
  const raw = (await (await fetch(PATHS.roomLightMapConfig)).json()) as Record<string, string>;
  const config = new Map(Object.entries(raw).map(([k, f]) => [norm(k.trim()), f]));
  const loader = new TextureLoader();
  const maps = new Map<string, Texture>();
  await Promise.all([...new Set(config.values())].map(async (f) => {
    const t = await loader.loadAsync(encodeURI(`${PATHS.roomLightMaps}${f}`));
    t.colorSpace = SRGBColorSpace; t.flipY = false; t.anisotropy = 16; t.wrapS = t.wrapT = ClampToEdgeWrapping;
    maps.set(f, t);
  }));

  const assigned = new Map<Material, string>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = false;
    if (hidden(mesh)) { mesh.visible = false; return; }
    let file: string | undefined, multiply = false;
    for (let c: Object3D | null = mesh; c; c = c.parent) for (const n of namesOf(c)) { file ??= config.get(n.trim()); multiply ||= n === MULTIPLY_MESH; }
    const lightMap = file ? maps.get(file) : undefined;
    if (!file || !lightMap) return;
    const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      if (!(m as MeshStandardMaterial).isMeshStandardMaterial) return m;
      const used = assigned.get(m);
      if (used === file) return m;
      const mat = (used ? m.clone() : m) as MeshStandardMaterial;   // a material shared by meshes with different lightmaps is cloned
      applyLightmapOverlay(mat, lightMap, multiply);
      assigned.set(mat, file!);
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? list : list[0];
  });

  // The same glass bottle as the default page, on the round table.
  const bottleGltf = await (await fetch(PATHS.bottleOnly)).blob();
  const { root: bottle } = await readModel([new File([bottleGltf], "bottle-glass.glb")]);
  bottle.name = "bottle_root";
  const size = new Box3().setFromObject(bottle).getSize(new Vector3());
  bottle.scale.setScalar(BOTTLE_HEIGHT / size.y);
  bottle.updateMatrixWorld(true);
  let table: Object3D | undefined;   // GLTFLoader turns the trailing space of "table_wood " into "_"
  root.traverse((o) => { if (!table && (o as Mesh).isMesh && norm(o.name).replace(/_+$/, "") === "table_wood") table = o; });
  root.updateMatrixWorld(true);
  const top = new Box3().setFromObject(table ?? root);
  const bb = new Box3().setFromObject(bottle);
  const centre = top.getCenter(new Vector3());
  bottle.position.set(centre.x + BOTTLE_OFFSET.x - (bb.min.x + bb.max.x) / 2, top.max.y - bb.min.y, centre.z + BOTTLE_OFFSET.z - (bb.min.z + bb.max.z) / 2);
  root.add(bottle);
}
