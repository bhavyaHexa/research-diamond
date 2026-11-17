// Ambient occlusion pass: reads the G-buffer, writes one AO value per pixel, then blurs it.
// The metal shader multiplies its indirect light by this map (ssr.ts patches the shader).
import {
  Camera, HalfFloatType, Matrix4, Mesh, NearestFilter, NoBlending, OrthographicCamera, PerspectiveCamera,
  PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Texture, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer,
} from "three";
import fullscreenVert from "./shaders/fullscreen.vert.glsl?raw";
import ssaoFrag from "./shaders/ssao.frag.glsl?raw";
import blurFrag from "./shaders/ssao-blur.frag.glsl?raw";
import { SETTINGS } from "./settings";

const target = (w: number, h: number) =>
  new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });

export class Ssao {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private a!: WebGLRenderTarget;
  private b!: WebGLRenderTarget;
  /** The finished (blurred) map. */
  private result!: WebGLRenderTarget;
  private readonly ao = this.material(ssaoFrag, {
    tGBuffer: { value: null }, projection: { value: new Matrix4() }, screenSize: { value: new Vector2() }, frame: { value: 0 },
    radius: { value: SETTINGS.ssao.radius }, intensity: { value: SETTINGS.ssao.intensity },
    biasEpsilonFalloff: { value: new Vector3(SETTINGS.ssao.bias, SETTINGS.ssao.epsilon, SETTINGS.ssao.falloff) },
  });
  private readonly blur = this.material(blurFrag, {
    tAo: { value: null }, tGBuffer: { value: null }, direction: { value: new Vector2() }, edgeSharpness: { value: SETTINGS.ssao.edgeSharpness },
  });

  constructor(width: number, height: number) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.resize(width, height);
  }

  private material(fragmentShader: string, uniforms: ShaderMaterial["uniforms"]) {
    return new ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader, uniforms, blending: NoBlending, depthTest: false, depthWrite: false });
  }

  resize(w: number, h: number) {
    this.a?.dispose();
    this.b?.dispose();
    this.a = target(w, h);
    this.b = target(w, h);
    this.result = this.a;
  }

  get texture(): Texture { return this.result.texture; }

  /** Copy the current SETTINGS.ssao values into the shader. */
  applySettings() {
    const s = SETTINGS.ssao;
    this.ao.uniforms.radius.value = s.radius;
    this.ao.uniforms.intensity.value = s.intensity;
    this.ao.uniforms.biasEpsilonFalloff.value.set(s.bias, s.epsilon, s.falloff);
    this.blur.uniforms.edgeSharpness.value = s.edgeSharpness;
  }

  render(renderer: WebGLRenderer, gbuffer: Texture, camera: Camera, frame: number) {
    const w = this.a.width, h = this.a.height;
    const draw = (m: ShaderMaterial, into: WebGLRenderTarget) => {
      this.quad.material = m;
      renderer.setRenderTarget(into);
      renderer.render(this.scene, this.camera);
    };
    this.ao.uniforms.tGBuffer.value = gbuffer;
    this.ao.uniforms.projection.value.copy((camera as PerspectiveCamera).projectionMatrix);
    this.ao.uniforms.screenSize.value.set(w, h);
    this.ao.uniforms.frame.value = frame;
    draw(this.ao, this.a); // raw occlusion
    this.blur.uniforms.tGBuffer.value = gbuffer;
    this.blur.uniforms.tAo.value = this.a.texture;
    this.blur.uniforms.direction.value.set(1 / w, 0);
    draw(this.blur, this.b); // horizontal blur
    this.blur.uniforms.tAo.value = this.b.texture;
    this.blur.uniforms.direction.value.set(0, 1 / h);
    draw(this.blur, this.a); // vertical blur
    this.result = this.a;
  }
}
