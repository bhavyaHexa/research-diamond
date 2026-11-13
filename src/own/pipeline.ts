// The frame, step by step. Reading this file top to bottom is reading the render pipeline:
//
//   1. scene    -> HDR target, camera nudged by a sub-pixel jitter
//   2. accumulate -> running average of the jittered frames (anti-aliasing, noise removal)
//   3. bloom    -> glow of values brighter than the threshold
//   4. composite -> ACES tone map, contrast, saturation, sRGB, white background
import {
  Camera, HalfFloatType, LinearFilter, Mesh, NoBlending, OrthographicCamera, PerspectiveCamera,
  PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Vector2, Vector4, WebGLRenderTarget, WebGLRenderer,
} from "three";
import fullscreenVert from "./shaders/fullscreen.vert.glsl?raw";
import accumulateFrag from "./shaders/accumulate.frag.glsl?raw";
import bloomFrag from "./shaders/bloom.frag.glsl?raw";
import compositeFrag from "./shaders/composite.frag.glsl?raw";
import { SETTINGS } from "./settings";
import { DepthPrepass, ssrUniforms } from "./ssr";
import { Ssao } from "./ssao";

const target = (w: number, h: number) =>
  new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });

/** Low-discrepancy (Halton) sequence: evenly spread sub-pixel offsets. */
export const halton = (index: number, base: number) => {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
};

export class Pipeline {
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private sceneTarget!: WebGLRenderTarget;
  private history!: [WebGLRenderTarget, WebGLRenderTarget];
  private bloomLevels: WebGLRenderTarget[] = [];
  private bloomUp: WebGLRenderTarget[] = [];
  private depth!: DepthPrepass;
  private ssao!: Ssao;
  private width = 0;
  private height = 0;
  /** Frames accumulated so far; restarts when the camera moves. */
  frame = 0;

  private readonly accumulate = this.fullscreen(accumulateFrag, { tHistory: { value: null }, tFrame: { value: null }, weight: { value: 1 } });
  private readonly bloom = [0, 1, 2].map((step) =>
    this.fullscreen(bloomFrag, {
      tSource: { value: null }, tAdd: { value: null }, texelSize: { value: new Vector2() },
      prefilter: { value: new Vector4() }, radius: { value: SETTINGS.bloom.radius },
    }, { PASS_STEP: step }));
  private readonly composite = this.fullscreen(compositeFrag, {
    tScene: { value: null }, tBloom: { value: null },
    bloomIntensity: { value: SETTINGS.bloom.intensity }, exposure: { value: SETTINGS.tone.exposure },
    contrast: { value: SETTINGS.tone.contrast }, saturation: { value: SETTINGS.tone.saturation },
    background: { value: SETTINGS.background },
  });

  constructor(private readonly renderer: WebGLRenderer) {
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private fullscreen(fragmentShader: string, uniforms: ShaderMaterial["uniforms"], defines: Record<string, number> = {}) {
    return new ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader, uniforms, defines, blending: NoBlending, depthTest: false, depthWrite: false });
  }

  private pass(material: ShaderMaterial, into: WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(into);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  resize(w: number, h: number) {
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    [this.sceneTarget, ...(this.history ?? []), ...this.bloomLevels, ...this.bloomUp].forEach((t) => t?.dispose());
    this.sceneTarget = target(w, h);
    if (this.depth) { this.depth.resize(w, h); this.ssao.resize(w, h); } else { this.depth = new DepthPrepass(w, h); this.ssao = new Ssao(w, h); }
    this.history = [target(w, h), target(w, h)];
    this.bloomLevels = []; this.bloomUp = [];
    for (let i = 0, lw = w, lh = h; i < SETTINGS.bloom.levels; i++) {
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
      this.bloomLevels.push(target(lw, lh));
      this.bloomUp.push(target(lw, lh));
    }
    this.restart();
  }

  restart() { this.frame = 0; }

  get converged() { return this.frame >= SETTINGS.accumulationFrames; }

  /** Render one more jittered frame into the running average, then present it. */
  /** Called before each jittered frame (e.g. to move the shadow light). */
  onBeforeFrame?: (n: number) => void;

  step(scene: Scene, camera: Camera) {
    const cam = camera as PerspectiveCamera;
    if (!this.converged) {
      const n = this.frame;
      this.onBeforeFrame?.(n);
      cam.setViewOffset(this.width, this.height, halton(n + 1, 2) - 0.5, halton(n + 1, 3) - 0.5, this.width, this.height);
      // Depth pre-pass and the previous accumulated frame feed the metal's screen-space reflections.
      this.depth.render(this.renderer, scene, camera);
      this.ssao.render(this.renderer, this.depth.target.texture, camera, n);
      ssrUniforms.tAo.value = this.ssao.texture;
      ssrUniforms.tSsrDepth.value = this.depth.target.texture;
      ssrUniforms.tSsrHistory.value = this.history[0].texture;
      ssrUniforms.ssrProjection.value.copy(cam.projectionMatrix);
      ssrUniforms.ssrResolution.value.set(this.width, this.height);
      ssrUniforms.ssrFrame.value = n;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setRenderTarget(this.sceneTarget);
      this.renderer.clear();
      this.renderer.render(scene, camera);
      cam.clearViewOffset();

      const [read, write] = this.history;
      this.accumulate.uniforms.tHistory.value = read.texture;
      this.accumulate.uniforms.tFrame.value = this.sceneTarget.texture;
      this.accumulate.uniforms.weight.value = 1 / (n + 1);
      this.pass(this.accumulate, write);
      this.history = [write, read];
      this.frame++;
    }
    this.present();
  }

  private runBloom(source: WebGLRenderTarget) {
    const { threshold, knee } = SETTINGS.bloom;
    const down = this.bloomLevels, up = this.bloomUp;
    let from = source;
    down.forEach((level, i) => {
      const m = this.bloom[i === 0 ? 0 : 1];
      m.uniforms.tSource.value = from.texture;
      m.uniforms.texelSize.value.set(1 / from.width, 1 / from.height);
      m.uniforms.prefilter.value.set(threshold, threshold * knee, knee, 1 / (4 * knee + 1e-5));
      this.pass(m, level);
      from = level;
    });
    // Up-sample from the smallest level, adding the level above at each step.
    let carry = down[down.length - 1];
    for (let i = down.length - 2; i >= 0; i--) {
      const m = this.bloom[2];
      m.uniforms.tSource.value = carry.texture;
      m.uniforms.tAdd.value = down[i].texture;
      m.uniforms.texelSize.value.set(1 / carry.width, 1 / carry.height);
      this.pass(m, up[i]);
      carry = up[i];
    }
    return carry;
  }

  private present() {
    const accumulated = this.history[0];
    const bloom = this.runBloom(accumulated);
    this.composite.uniforms.tScene.value = accumulated.texture;
    this.composite.uniforms.tBloom.value = bloom.texture;
    this.pass(this.composite, null);
  }
}
