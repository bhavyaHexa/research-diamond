import {
  BufferGeometry,
  Color,
  CubeCamera,
  CubeTexture,
  DataTexture,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from "three";
import { DIAMOND_PASSES } from "../shaders/pipeline";
import { toThreeSource } from "./shaderSource";
import type { StoneOffsets } from "./diamondGeometry";

// Stone values. These match the diamond settings the viewer used before.
export const DIAMOND_SETTINGS = {
  color: 0xe4e4e4,
  refractiveIndex: 2.42,
  envMapIntensity: 1.6,
  dispersion: 0.004,
  absorptionFactor: 1,
  gammaFactor: 1.09,
  boost: 2,
  reflectivity: 0.46,
  rayBounces: 6,
  squashFactor: 0.98,
  geometryFactor: 0.5,
} as const;

const NORMAL_MAP_RES = 512;

// Diamond materials are tagged here, so the gem handle can find them.
export const DIAMOND_TAG = "isStoneDiamond";

// Engine values for the diamond shader that the pipeline does not set. The bundle used
// `PI 3.1428` as well, so the environment lookup matches the old viewer. The environment
// is a cube map (ENV_MAP_TYPE 0) or an equirect (1), as the engine picks it.
// USE_ENVMAP must be defined in the fragment stage too. Without it the shader returns the
// view direction as a colour, which is where the rainbow came from.
function diamondDefines(envMap: Texture) {
  return {
    DIA_ORIENT_ENVMAP: 0,
    RAY_BOUNCES: DIAMOND_SETTINGS.rayBounces,
    ENV_MAP_TYPE: (envMap as CubeTexture).isCubeTexture ? 0 : 1,
    USE_ENVMAP: "",
    PI: 3.1428,
  };
}

const blankTexture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blankTexture.needsUpdate = true;

// The normal-capture material is shared by every stone. Its per-stone values are set
// just before each capture.
export function createCaptureMaterial(): ShaderMaterial {
  const { vertex, fragment } = DIAMOND_PASSES.normalCapture;
  return new ShaderMaterial({
    vertexShader: toThreeSource(vertex.source, "vertex"),
    fragmentShader: toThreeSource(fragment.source, "fragment"),
    side: DoubleSide,
    uniforms: {
      offsetCenter: { value: new Vector3() },
      offsetMatrixInv: { value: new Matrix4() },
      radius: { value: 1 },
    },
  });
}

// Renders one stone into a 512 cube map of its facet normals (rgb) and distance (a).
export function captureStoneNormals(
  renderer: WebGLRenderer,
  geometry: BufferGeometry,
  offsets: StoneOffsets,
  material: ShaderMaterial,
): WebGLCubeRenderTarget {
  const target = new WebGLCubeRenderTarget(NORMAL_MAP_RES, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    type: HalfFloatType,
  });
  const cubeCamera = new CubeCamera(1e-4, 100, target);

  material.uniforms.offsetCenter.value.copy(offsets.center);
  material.uniforms.offsetMatrixInv.value.copy(offsets.offsetMatrixInv);
  material.uniforms.radius.value = offsets.radius;

  // The stone is drawn in the unit sphere by the shader, so its untransformed bounds
  // would wrongly cull it. The engine turns culling off here too.
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  cubeCamera.update(renderer, scene);
  return target;
}

// Builds the diamond material for one stone. Its per-stone values are set in onBeforeRender.
export function createDiamondMaterial(
  envMap: Texture,
  offsets: StoneOffsets,
  normals: Texture,
): ShaderMaterial {
  const { vertex, fragment } = DIAMOND_PASSES.diamond;
  const material = new ShaderMaterial({
    vertexShader: toThreeSource(vertex.source, "vertex"),
    fragmentShader: toThreeSource(fragment.source, "fragment"),
    defines: diamondDefines(envMap),
    side: DoubleSide,
    uniforms: {
      envMap: { value: envMap },
      envMapIntensity: { value: DIAMOND_SETTINGS.envMapIntensity },
      envMapRotation: { value: 0 },
      tCubeMapNormals: { value: normals },
      inverseModelMatrix: { value: new Matrix4() },
      modelOffsetMatrix: { value: new Matrix4() },
      offsetMatrixInv: { value: offsets.offsetMatrixInv },
      centerOffset: { value: offsets.centerOffset },
      radius: { value: offsets.radius },
      transmission: { value: 0 },
      transmissionSamplerSize: { value: new Vector2(1, 1) },
      transmissionSamplerMap: { value: blankTexture },
      refractiveIndex: { value: DIAMOND_SETTINGS.refractiveIndex },
      rIndexDelta: { value: DIAMOND_SETTINGS.dispersion },
      squashFactor: { value: DIAMOND_SETTINGS.squashFactor },
      geometryFactor: { value: DIAMOND_SETTINGS.geometryFactor },
      color: { value: new Color(DIAMOND_SETTINGS.color) },
      colorCorrection: { value: new Vector3(1, 1, 1) },
      boostFactors: { value: new Vector3(DIAMOND_SETTINGS.boost, DIAMOND_SETTINGS.boost, DIAMOND_SETTINGS.boost) },
      gammaFactor: { value: DIAMOND_SETTINGS.gammaFactor },
      absorptionFactor: { value: DIAMOND_SETTINGS.absorptionFactor },
      reflectivity: { value: DIAMOND_SETTINGS.reflectivity },
    },
  });
  material.userData[DIAMOND_TAG] = true;
  return material;
}

// Sets the per-frame values the diamond shader needs for one stone.
export function bindStone(mesh: Mesh, offsets: StoneOffsets) {
  const material = mesh.material as ShaderMaterial;
  mesh.onBeforeRender = () => {
    material.uniforms.inverseModelMatrix.value.copy(mesh.matrixWorld).invert();
    material.uniforms.modelOffsetMatrix.value.copy(mesh.matrixWorld).multiply(offsets.offsetMatrix);
  };
}

// Gem changes, applied to every stone material.
export function applyDiamondSettings(material: ShaderMaterial, color: string, absorption: number, boost: number) {
  material.uniforms.color.value.set(color);
  material.uniforms.absorptionFactor.value = absorption;
  material.uniforms.boostFactors.value.set(boost, boost, boost);
  material.uniforms.refractiveIndex.value = DIAMOND_SETTINGS.refractiveIndex;
  material.uniforms.envMapIntensity.value = DIAMOND_SETTINGS.envMapIntensity;
  material.uniforms.gammaFactor.value = DIAMOND_SETTINGS.gammaFactor;
  material.uniforms.reflectivity.value = DIAMOND_SETTINGS.reflectivity;
  material.uniforms.rIndexDelta.value = DIAMOND_SETTINGS.dispersion;
  material.uniforms.transmission.value = 0;
}
