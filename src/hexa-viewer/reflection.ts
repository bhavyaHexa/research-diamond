// Planar reflection for the floor of a room model.
//
// The room's floor is baked light (emissive, black base colour), so it has no reflections of its own, and it is not one
// object: a marble slab under the bottle and the floor of the room itself, with the same marble material. So the
// reflection is attached to the MATERIAL, not to a mesh: the scene is drawn once more from a camera mirrored in the floor
// plane, and every floor material adds that picture, weighted by Fresnel (a polished dielectric reflects about 4% face-on
// and a lot at grazing angles), where it is drawn.
//
//   - the mirrored camera uses an oblique near plane, so nothing below the floor is drawn (no extra shader variants)
//   - the glass is drawn in that pass with three's own transmission material (the full glass pass is far too costly for
//     it): the room seen through the bottle, its edges and its base give the bottle its reflection in the marble
//   - the reflection is a little soft (9 taps), as in polished stone
import {
  Camera, Material, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Plane, Scene, Vector2, Vector3, Vector4,
  WebGLRenderTarget, WebGLRenderer, HalfFloatType, LinearFilter, RGBAFormat, DataTexture,
} from "three";
import { isGlass } from "./glass";

export class PlanarReflection {
  /** Height of the floor in world units. */
  planeY = 0;
  /** Reflection strength (1 = physical for polished stone). */
  strength = 1.6;
  /** Reflectance of the floor face-on (polished marble about 0.05). */
  f0 = 0.05;
  private target: WebGLRenderTarget;
  private readonly uniforms = {
    tFloorReflection: { value: null as WebGLRenderTarget["texture"] | null },
    floorReflectionMatrix: { value: new Matrix4() },
    floorReflectionStrength: { value: 1 },
    floorReflectionF0: { value: 0.05 },
    floorReflectionTexel: { value: new Vector2(1, 1) },
  };
  private readonly virtual = new PerspectiveCamera();
  // While the mirror is drawn, the floor materials must not read the texture being drawn into.
  private readonly blank = Object.assign(new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1), { needsUpdate: true });
  // three's own transmission is enough for the mirror image: it shows the room through the bottle, and its edges.
  private readonly ghost = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 1, ior: 1.5, thickness: 0.6 });
  private readonly floors = new Set<Material>();
  /** Everything that must not appear in the mirror (the shadow plane, mirrored glass copies...). */
  hide: Object3D[] = [];

  constructor(width: number, height: number) {
    this.target = new WebGLRenderTarget(width, height, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
    this.uniforms.tFloorReflection.value = this.target.texture;
    this.uniforms.floorReflectionTexel.value.set(1 / width, 1 / height);
  }

  dispose() { this.target.dispose(); this.blank.dispose(); this.ghost.dispose(); }

  resize(width: number, height: number) {
    this.target.setSize(width, height);
    this.uniforms.floorReflectionTexel.value.set(1 / width, 1 / height);
  }

  /** Make a material show the reflection (call once per floor material, before its first render). */
  patch(material: Material) {
    const m = material as MeshStandardMaterial;
    this.floors.add(m);
    const previous = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      previous?.call(m, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "uniform mat4 floorReflectionMatrix;\nvarying vec4 vFloorUv;\nvoid main() {")
        .replace("#include <project_vertex>", "#include <project_vertex>\n  vFloorUv = floorReflectionMatrix * (modelMatrix * vec4(transformed, 1.0));");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `uniform sampler2D tFloorReflection;
uniform float floorReflectionStrength;
uniform float floorReflectionF0;
uniform vec2 floorReflectionTexel;
varying vec4 vFloorUv;
void main() {`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  {
    float floorCos = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float floorFresnel = floorReflectionF0 + (1.0 - floorReflectionF0) * pow(1.0 - floorCos, 5.0);
    vec2 floorUv = vFloorUv.xy / vFloorUv.w;
    vec3 floorSeen = vec3(0.0);
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0);
      floorSeen += w * texture2D(tFloorReflection, floorUv + vec2(float(i), float(j)) * floorReflectionTexel * 1.5).rgb;
    }
    totalEmissiveRadiance += floorSeen / 16.0 * floorFresnel * floorReflectionStrength;
  }`);
    };
    const key = m.customProgramCacheKey?.bind(m);
    m.customProgramCacheKey = () => (key ? key() : "") + "-floor-reflection";
    m.needsUpdate = true;
  }

  /** Draw the mirror image. Call with the camera as it will be used for the frame (jitter included). */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.uniforms.floorReflectionStrength.value = this.strength;
    this.uniforms.floorReflectionF0.value = this.f0;
    const normal = new Vector3(0, 1, 0), planePos = new Vector3(0, this.planeY, 0);
    const v = this.virtual;
    const camPos = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rotation = new Matrix4().extractRotation(camera.matrixWorld);
    const lookAt = new Vector3(0, 0, -1).applyMatrix4(rotation).add(camPos);
    const view = planePos.clone().sub(camPos).reflect(normal).negate().add(planePos);
    const target = planePos.clone().sub(lookAt).reflect(normal).negate().add(planePos);
    v.position.copy(view);
    v.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    v.lookAt(target);
    v.near = (camera as PerspectiveCamera).near; v.far = (camera as PerspectiveCamera).far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix);
    // Texture matrix: world position -> mirrored-camera screen -> 0..1
    const m = this.uniforms.floorReflectionMatrix.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);
    // Oblique near plane: clip everything below the floor
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(v.matrixWorldInverse);
    const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = v.projectionMatrix;
    const q = new Vector4((Math.sign(clip.x) + p.elements[8]) / p.elements[0], (Math.sign(clip.y) + p.elements[9]) / p.elements[5], -1, (1 + p.elements[10]) / p.elements[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    p.elements[2] = clip.x; p.elements[6] = clip.y; p.elements[10] = clip.z + 1 - 0.003; p.elements[14] = clip.w;

    // Glass becomes a ghost; the things that must not be mirrored are hidden
    const swapped: [Mesh, Material | Material[]][] = [];
    const hidden: [Object3D, boolean][] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.reflection) { hidden.push([mesh, mesh.visible]); mesh.visible = false; return; }
      if (!Array.isArray(mesh.material) && isGlass(mesh.material)) { swapped.push([mesh, mesh.material]); mesh.material = this.ghost; hidden.push([mesh, mesh.visible]); mesh.visible = true; }
    });
    for (const o of this.hide) { hidden.push([o, o.visible]); o.visible = false; }
    // The floor itself is not drawn in the mirror (it is double sided in some files, and would hide everything behind it).
    const floorState = [...this.floors].map((m) => [m, m.colorWrite, m.depthWrite] as const);
    for (const m of this.floors) { m.colorWrite = false; m.depthWrite = false; }
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    this.uniforms.tFloorReflection.value = this.blank;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(scene, v);
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    this.uniforms.tFloorReflection.value = this.target.texture;
    for (const [m, color, depth] of floorState) { m.colorWrite = color; m.depthWrite = depth; }
    for (const [mesh, material] of swapped) mesh.material = material;
    for (const [o, visible] of hidden) o.visible = visible;
  }
}
