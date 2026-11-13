// Screen-space reflections for the metal: a depth pre-pass, plus a patch that adds the
// reflection step to three.js's physical material (see shaders/ssr.chunk.glsl).
import {
  DoubleSide, FloatType, Matrix4, Mesh, MeshPhysicalMaterial, NearestFilter, RGBAFormat,
  Scene, ShaderMaterial, Texture, Vector2, WebGLRenderTarget, WebGLRenderer, Camera,
} from "three";
import depthVert from "./shaders/depth.vert.glsl?raw";
import depthFrag from "./shaders/depth.frag.glsl?raw";
import ssrChunk from "./shaders/ssr.chunk.glsl?raw";
import { SETTINGS } from "./settings";

/** Uniforms shared by every patched metal material. */
export const ssrUniforms = {
  tSsrDepth: { value: null as Texture | null },
  tSsrHistory: { value: null as Texture | null },
  ssrProjection: { value: new Matrix4() },
  ssrResolution: { value: new Vector2(1, 1) },
  ssrFrame: { value: 0 },
  ssrDebug: { value: 0 },
  ssrDepthRange: { value: new Vector2(1.6, 19.2) },
  ssrRayLength: { value: SETTINGS.ssr.rayLength },
  ssrTolerance: { value: SETTINGS.ssr.tolerance },
  ssrIntensity: { value: SETTINGS.ssr.intensity },
  ssrMaskFront: { value: SETTINGS.ssr.maskFront },
  ssrPower: { value: SETTINGS.ssr.power },
  tAo: { value: null as Texture | null },
};

/** Add SSR to a MeshPhysicalMaterial. The blend runs after the environment specular exists, then AO darkens it. */
export function enableSsr(material: MeshPhysicalMaterial) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ssrUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", ssrChunk + "\nvoid main() {")
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
#if defined( RE_IndirectSpecular )
  reflectedLight.indirectSpecular = ssrApply(
    reflectedLight.indirectSpecular,
    geometryPosition,
    geometryNormal,
    geometryViewDir,
    material.roughness,
    material.specularColorBlended,
    material.specularF90
  );
#endif`,
      )
      .replace(
        "#include <aomap_fragment>",
        `{
  float ao = texture2D(tAo, gl_FragCoord.xy / ssrResolution).r;
  reflectedLight.indirectDiffuse *= ao;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
  float nv = saturate(dot(geometryNormal, geometryViewDir));
  reflectedLight.indirectSpecular *= saturate(pow(nv + ao, exp2(-16.0 * material.roughness - 1.0)) - 1.0 + ao);
  #endif
}
#include <aomap_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "own-ssr-screen";
  material.needsUpdate = true;
}

/** Renders the whole scene's view-space distance into a texture, with the same jitter as the colour frame. */
export class DepthPrepass {
  readonly target: WebGLRenderTarget;
  private readonly material = new ShaderMaterial({ vertexShader: depthVert, fragmentShader: depthFrag, side: DoubleSide });

  constructor(width: number, height: number) {
    this.target = new WebGLRenderTarget(width, height, {
      type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true,
    });
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    const previous = scene.overrideMaterial;
    const hidden: Mesh[] = [];
    scene.traverse((o) => { if ((o as Mesh).isMesh && o.userData.skipDepth) { hidden.push(o as Mesh); o.visible = false; } });
    scene.overrideMaterial = this.material;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = previous;
    hidden.forEach((m) => (m.visible = true));
  }

  resize(width: number, height: number) { this.target.setSize(width, height); }
  dispose() { this.target.dispose(); }
}
