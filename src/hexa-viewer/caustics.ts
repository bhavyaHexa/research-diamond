// Caustics under glass by photon splatting, used by the ground shadow bake (ground.ts).
// For each shadow sample (one light direction): draw the glass from the light into position and normal maps, then
// draw a regular grid of photons whose vertex shader (photon.vert.glsl) bends each one through the glass and places it
// where it lands on the ground. Their energy is added into the bake's red channel; the ground material subtracts it
// from the shadow (green channel), so clear glass casts a light shadow with bright and dark patches in it.
import {
  AddEquation, BufferGeometry, CustomBlending, FloatType, Float32BufferAttribute, HalfFloatType, Mesh, NearestFilter,
  OneFactor, OrthographicCamera, Points, RGBAFormat, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer, Camera,
} from "three";
import { glassOf, type GlassUniforms } from "./glass";
import { halton } from "./pipeline";
import lightviewFrag from "./shaders/lightview.frag.glsl?raw";
import lightviewVert from "./shaders/lightview.vert.glsl?raw";
import photonFrag from "./shaders/photon.frag.glsl?raw";
import photonVert from "./shaders/photon.vert.glsl?raw";

const LIGHT_VIEW_SIZE = 4.4;    // width of the light's view of the model, scene units (a model is fitted to 3 tall)
const POINT_SIZE = 4;           // photon sprite size on the ground bake, pixels

export interface CausticsFrame {
  /** Direction toward the light for this sample (unit). */
  toLight: Vector3;
  /** The ground bake's top-down camera. */
  top: Camera;
  groundY: number;
  /** Ground bake resolution (pixels) and the ground's size (scene units), and the number of samples being averaged. */
  resolution: number;
  groundSize: number;
  samples: number;
  /** Index of this sample (0 to samples - 1); it picks the offset of the photon grid. */
  sample: number;
}

export class Caustics {
  private readonly position: WebGLRenderTarget;
  private readonly normal: WebGLRenderTarget;
  private readonly camera = new OrthographicCamera(-LIGHT_VIEW_SIZE / 2, LIGHT_VIEW_SIZE / 2, LIGHT_VIEW_SIZE / 2, -LIGHT_VIEW_SIZE / 2, 0.1, 14);
  private readonly positionMaterial = new ShaderMaterial({ vertexShader: lightviewVert, fragmentShader: lightviewFrag });
  private readonly normalMaterial = new ShaderMaterial({ vertexShader: lightviewVert, fragmentShader: lightviewFrag, defines: { OUTPUT_NORMAL: 1 } });
  private readonly photonMaterial: ShaderMaterial;
  private readonly photonScene = new Scene();
  private readonly grid: number;

  constructor(grid = 320, lightViewResolution = 384) {
    this.grid = grid;
    const target = (type: typeof FloatType | typeof HalfFloatType) =>
      new WebGLRenderTarget(lightViewResolution, lightViewResolution, { type, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
    this.position = target(FloatType);
    this.normal = target(HalfFloatType);

    const positions = new Float32Array(grid * grid * 3);
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      const k = (j * grid + i) * 3;
      positions[k] = (i + 0.5) / grid;
      positions[k + 1] = (j + 0.5) / grid;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.photonMaterial = new ShaderMaterial({
      vertexShader: photonVert,
      fragmentShader: photonFrag,
      uniforms: {
        tPosition: { value: this.position.texture }, tNormal: { value: this.normal.texture },
        incident: { value: new Vector3(0, -1, 0) }, groundY: { value: -1.5 }, ior: { value: 1.5 },
        tint: { value: new Vector3(1, 1, 1) }, density: { value: 1 }, path: { value: 0.22 },
        weight: { value: 1 }, pointSize: { value: POINT_SIZE }, jitter: { value: new Vector2() }, gridSize: { value: grid },
        lightRes: { value: lightViewResolution }, lightSize: { value: LIGHT_VIEW_SIZE },
        lightRight: { value: new Vector3() }, lightUp: { value: new Vector3() },
      },
      blending: CustomBlending, blendEquation: AddEquation,
      blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    const points = new Points(geometry, this.photonMaterial);
    points.frustumCulled = false;
    this.photonScene.add(points);
  }

  /** Splat the photons of one light direction into the current render target (the ground bake). */
  splat(renderer: WebGLRenderer, scene: Scene, glass: Mesh[], frame: CausticsFrame) {
    const keep = new Set(glass);
    const settings = glassOf(glass[0].material as { userData: Record<string, unknown> }) as GlassUniforms;
    const bakeTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousOverride = scene.overrideMaterial;

    // The light looks down at the model; the glass meshes only.
    this.camera.position.copy(frame.toLight).multiplyScalar(8);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    for (const [target, material] of [[this.position, this.positionMaterial], [this.normal, this.normalMaterial]] as const) {
      renderer.setRenderTarget(target);
      renderer.clear();
      scene.overrideMaterial = material;
      const hidden: Mesh[] = [];
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && mesh.visible && !keep.has(mesh)) { mesh.visible = false; hidden.push(mesh); }
      });
      renderer.render(scene, this.camera);
      hidden.forEach((m) => (m.visible = true));
    }
    scene.overrideMaterial = previousOverride;

    // The photons, drawn onto the ground bake seen from above.
    const u = this.photonMaterial.uniforms;
    u.incident.value.copy(frame.toLight).negate();
    u.groundY.value = frame.groundY;
    u.ior.value = settings.glassIor.value;
    u.tint.value.set(settings.glassTint.value.r, settings.glassTint.value.g, settings.glassTint.value.b);
    u.density.value = settings.glassDensity.value;
    this.camera.matrixWorld.extractBasis(u.lightRight.value, u.lightUp.value, new Vector3());
    u.jitter.value.set(halton(frame.sample + 1, 2) - 0.5, halton(frame.sample + 1, 3) - 0.5);
    // One photon's energy, so that light reaching the ground unobstructed would add up to 1 per texel.
    const texelArea = (frame.groundSize / frame.resolution) ** 2;
    const photonsPerTexel = (this.grid * this.grid) / (LIGHT_VIEW_SIZE * LIGHT_VIEW_SIZE) * texelArea * frame.samples;
    const spriteWeight = (Math.PI / 3) * (POINT_SIZE / 2) ** 2;
    u.weight.value = 1 / (photonsPerTexel * spriteWeight);
    renderer.setRenderTarget(bakeTarget);
    renderer.autoClear = false;
    renderer.render(this.photonScene, frame.top);
    renderer.autoClear = previousAutoClear;
  }

  dispose() {
    this.position.dispose();
    this.normal.dispose();
  }
}
