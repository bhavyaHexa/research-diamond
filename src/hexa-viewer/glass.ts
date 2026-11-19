// Glass for the viewer: a physical material patched with the shader in shaders/glass.chunk.glsl, and the extra passes
// it needs: the scene without glass (to refract), and four layers of the glass geometry seen from the camera.
//
// The glass model is hollow (a real wall, modelled in the file), so a view ray meets
//   front 1 (outer, nearest) -> back 1 (the cavity's near side) -> front 2 (the cavity's far side) -> back 2 (outer, far)
// The four layers are found by depth peeling and the shader walks the ray through them.
import {
  BackSide, Box3, Color, FrontSide, HalfFloatType, LinearFilter, Matrix4, Mesh, MeshPhysicalMaterial, NearestFilter, NoBlending,
  OrthographicCamera, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget,
  WebGLRenderer, Camera,
} from "three";
import copyFrag from "./shaders/copy.frag.glsl?raw";
import depthVert from "./shaders/depth.vert.glsl?raw";
import fullscreenVert from "./shaders/fullscreen.vert.glsl?raw";
import glassChunk from "./shaders/glass.chunk.glsl?raw";
import glassLayerFrag from "./shaders/glasslayer.frag.glsl?raw";

export interface GlassSettings {
  ior: number;
  /** Colour of the glass where it is thick (white = clear). */
  tint: string;
  /** How quickly the tint builds up with thickness. */
  density: number;
  /** Secondary internal reflections (second images). */
  bounces: number;
  /** Crisp lines along bevels and facet edges. */
  crease: number;
  /** Softness of the reflections inside the glass: 0 mirrors the environment sharply, higher scatters it. */
  blur: number;
  /** Frosting: blurs the reflection. */
  roughness: number;
  reflection: number;
  /** How far behind the glass the refracted ray looks. 0 = no distortion. */
  refraction: number;
}

export const DEFAULT_GLASS: GlassSettings = { ior: 1.5, tint: "#ffffff", density: 1.5, bounces: 0.8, crease: 0.25, blur: 0.12, roughness: 0, reflection: 1, refraction: 1 };

/** Uniforms shared by every glass material (set by the pipeline each frame). */
export const glassUniforms = {
  tGlassBack: { value: null as WebGLRenderTarget["texture"] | null },   // back 1
  tFront2: { value: null as WebGLRenderTarget["texture"] | null },
  tBack2: { value: null as WebGLRenderTarget["texture"] | null },
  tRefraction: { value: null as WebGLRenderTarget["texture"] | null },
  glassResolution: { value: new Vector2(1, 1) },
  glassProjection: { value: new Matrix4() },
  glassPage: { value: new Vector3(1, 1, 1) },
  /** Layer depths are stored relative to this view depth, to keep the half floats precise. */
  glassDepthRef: { value: 10 },
};

/** The per-material uniforms, kept in `material.userData.glass` so the UI can change them live. */
export interface GlassUniforms {
  glassTint: { value: Color };
  glassDensity: { value: number };
  glassBounces: { value: number };
  glassCrease: { value: number };
  glassBlur: { value: number };
  glassIor: { value: number };
  glassRefraction: { value: number };
  glassReflection: { value: number };
  glassFade: { value: Vector3 };
}

export const isGlass = (m: { userData: Record<string, unknown> }) => !!m.userData.glass;
export const glassOf = (m: { userData: Record<string, unknown> }) => m.userData.glass as GlassUniforms;

/** `share`: use another glass material's uniforms (so the UI changes both); `fade`: make it a floor reflection (see glassFade). */
export function createGlassMaterial(name: string, s: GlassSettings = DEFAULT_GLASS, share?: GlassUniforms, fade?: Vector3): MeshPhysicalMaterial {
  const own: GlassUniforms = share ? { ...share, glassFade: { value: fade ?? new Vector3() } } : {
    glassTint: { value: new Color(s.tint) },
    glassDensity: { value: s.density },
    glassBounces: { value: s.bounces },
    glassCrease: { value: s.crease },
    glassBlur: { value: s.blur },
    glassIor: { value: s.ior },
    glassRefraction: { value: s.refraction },
    glassReflection: { value: s.reflection },
    glassFade: { value: new Vector3() },
  };
  // Black diffuse, no metal: only the specular reflection survives from the material's own lighting.
  const material = new MeshPhysicalMaterial({ name, color: 0x000000, metalness: 0, roughness: s.roughness, ior: s.ior });
  material.userData.glass = own;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glassUniforms, own);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", glassChunk + "\nvoid main() {")
      .replace(
        "#include <opaque_fragment>",
        "gl_FragColor = glassShade(reflectedLight.directSpecular + reflectedLight.indirectSpecular, normalize(geometryNormal), -vViewPosition);",
      );
  };
  material.customProgramCacheKey = () => "hexa-glass";
  return material;
}

/** The extra render targets and passes for glass. Created by the Pipeline at its size. */
export class GlassPass {
  private front1!: WebGLRenderTarget;
  private back1!: WebGLRenderTarget;
  private front2!: WebGLRenderTarget;
  private back2!: WebGLRenderTarget;
  private refraction!: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private readonly copy = new ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader: copyFrag, uniforms: { tSource: { value: null } }, blending: NoBlending, depthTest: false, depthWrite: false });
  private readonly layerUniforms = { depthRef: { value: 10 }, resolution: { value: new Vector2(1, 1) } };
  private readonly layer = (side: typeof FrontSide | typeof BackSide, peel: boolean) =>
    new ShaderMaterial({
      vertexShader: depthVert, fragmentShader: glassLayerFrag, side,
      defines: peel ? { PEEL: 1 } : {},
      uniforms: { ...this.layerUniforms, tPrev: { value: null as WebGLRenderTarget["texture"] | null } },
    });
  private readonly front1Material = this.layer(FrontSide, false);
  private readonly back1Material = this.layer(BackSide, false);
  private readonly front2Material = this.layer(FrontSide, true);
  private readonly back2Material = this.layer(BackSide, true);

  constructor(width: number, height: number) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.resize(width, height);
  }

  resize(w: number, h: number) {
    [this.front1, this.back1, this.front2, this.back2, this.refraction].forEach((t) => t?.dispose());
    const layer = () => new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
    this.front1 = layer(); this.back1 = layer(); this.front2 = layer(); this.back2 = layer();
    this.refraction = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
    this.layerUniforms.resolution.value.set(w, h);
  }

  /** The visible meshes that use a glass material. */
  static meshes(scene: Scene): Mesh[] {
    const found: Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh.visible && !Array.isArray(mesh.material) && isGlass(mesh.material)) found.push(mesh);
    });
    return found;
  }

  /** Draw with only `keep` visible. */
  private only(scene: Scene, keep: Set<Mesh>, draw: () => void) {
    const hidden: Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh.visible && !keep.has(mesh)) { mesh.visible = false; hidden.push(mesh); }
    });
    draw();
    hidden.forEach((m) => (m.visible = true));
  }

  /**
   * `sceneTarget` holds the scene drawn WITHOUT the glass meshes. Copy it, find the four glass layers, then draw the
   * glass meshes into `sceneTarget` (kept depth, so opaque things in front of the glass still hide it).
   */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, glass: Mesh[], sceneTarget: WebGLRenderTarget) {
    const keep = new Set(glass);
    const layered = glass.filter((mesh) => !mesh.userData.reflection);
    const bounds = new Box3();
    layered.forEach((m) => bounds.expandByObject(m));
    const depthRef = camera.position.distanceTo(bounds.getCenter(new Vector3()));
    glassUniforms.glassDepthRef.value = depthRef;
    this.layerUniforms.depthRef.value = depthRef;

    this.quad.material = this.copy;
    this.copy.uniforms.tSource.value = sceneTarget.texture;
    renderer.setRenderTarget(this.refraction);
    renderer.render(this.scene, this.camera);

    // Depth peeling: nearest front and back faces, then the next ones behind them.
    this.front2Material.uniforms.tPrev.value = this.front1.texture;
    this.back2Material.uniforms.tPrev.value = this.back1.texture;
    renderer.setClearColor(0x000000, 0);
    const previousOverride = scene.overrideMaterial;
    this.only(scene, new Set(layered), () => {
      for (const [target, material] of [
        [this.front1, this.front1Material], [this.back1, this.back1Material],
        [this.front2, this.front2Material], [this.back2, this.back2Material],
      ] as const) {
        renderer.setRenderTarget(target);
        renderer.clear();
        scene.overrideMaterial = material;
        renderer.render(scene, camera);
      }
    });
    scene.overrideMaterial = previousOverride;

    glassUniforms.tGlassBack.value = this.back1.texture;
    glassUniforms.tFront2.value = this.front2.texture;
    glassUniforms.tBack2.value = this.back2.texture;
    glassUniforms.tRefraction.value = this.refraction.texture;
    glassUniforms.glassResolution.value.set(this.back1.width, this.back1.height);
    glassUniforms.glassProjection.value.copy((camera as PerspectiveCamera).projectionMatrix);
    renderer.setRenderTarget(sceneTarget);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.only(scene, keep, () => renderer.render(scene, camera));
    renderer.autoClear = autoClear;
  }
}
