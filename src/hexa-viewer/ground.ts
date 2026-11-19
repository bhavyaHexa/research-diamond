// Lights and the ground that catches the ring's shadow.
//
// Two directional lights, because the shipped scene lights the gold from a low side direction but
// its soft ground shadow falls from almost straight above:
//   - `light`       lights the metal (intensity, colour, direction from the scene preset). No shadow.
//   - `shadowLight` casts the ground shadow only (its intensity is ~0, so it adds no light).
//
// The soft shadow is baked ONCE, in world space: the shadow light is moved a little for each of
// `samples` shadow maps, and every map is added into one texture seen from straight above. The
// ground then just shows that texture. Because it does not depend on the camera or on the frame
// accumulation, the shadow is complete, soft and in the same place from the first frame after
// the camera moves (a per-frame jittered shadow only became soft after the 32 frames had averaged).
import {
  AddEquation, Color, CustomBlending, DirectionalLight, HalfFloatType, LinearFilter, Mesh, MeshBasicMaterial,
  OneFactor, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShadowMaterial, SrcAlphaFactor, Vector3,
  WebGLRenderTarget, WebGLRenderer,
} from "three";
import { Caustics } from "./caustics";
import { isGlass } from "./glass";
import { halton } from "./pipeline";
import { SETTINGS } from "./settings";

const GROUND_SIZE = 8;

export interface Ground {
  /** Lights the metal. */
  light: DirectionalLight;
  /** Casts the ground shadow (only while baking). */
  shadowLight: DirectionalLight;
  /** The baked shadow (green channel = shadow darkness), null before `bake`. */
  readonly shadowTarget: WebGLRenderTarget | null;
  /** Change the direction (toward the light) of the shadow light and rebake. */
  setDirection(x: number, y: number, z: number): void;
  /** Render the soft ground shadow into a texture and show it on the ground. Call once the scene is built. */
  bake(renderer: WebGLRenderer, scene: Scene): void;
  /** Move the ground plane to the model's lowest point (call `bake` after). */
  setHeight(y: number): void;
  /** Height of the ground plane. */
  readonly height: number;
  /** Shadow darkness, 0-1. No rebake needed. */
  setOpacity(value: number): void;
  /** Caustic strength under glass (0 = off, 1 = physical). Rebake after changing it to or from 0. */
  setCaustics(value: number): void;
  setVisible(on: boolean): void;
  /** The transparent shadow plane. */
  readonly mesh: Mesh;
}

export function addLightAndGround(scene: Scene, groundY: number): Ground {
  const { light: main, groundShadow: gs } = SETTINGS;

  const light = new DirectionalLight(new Color(main.color), main.intensity);
  light.position.set(...main.direction).normalize().multiplyScalar(main.distance);
  scene.add(light, light.target);

  const shadowLight = new DirectionalLight(0xffffff, 1e-5);
  shadowLight.castShadow = false; // switched on only while baking
  shadowLight.shadow.mapSize.set(1024, 1024);
  shadowLight.shadow.radius = 2;
  shadowLight.shadow.bias = -0.001;
  const cam = shadowLight.shadow.camera;
  cam.left = -2; cam.right = 2; cam.top = 2; cam.bottom = -2;
  cam.near = gs.distance - 2.5; cam.far = gs.distance + 2.5;
  cam.updateProjectionMatrix();
  scene.add(shadowLight, shadowLight.target);

  let groundHeight = groundY;
  let caustics: Caustics | null = null;
  const causticStrength = { value: gs.caustics };

  // Until it is baked the ground draws nothing. (Not `visible: false`: three skips such meshes
  // even when the bake pass overrides their material.)
  const ground = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  // The ground is part of the depth pre-pass, so the gold can reflect it: it shows the white
  // page (plus the shadow) in the previous frame, as it does in the shipped viewer.
  scene.add(ground);

  const toLight = new Vector3(...gs.direction).normalize();
  const place = (dir: Vector3) => shadowLight.position.copy(dir).normalize().multiplyScalar(gs.distance);
  place(toLight);

  let shadowMap: WebGLRenderTarget | null = null;
  let baked: { renderer: WebGLRenderer; scene: Scene } | null = null;

  const bake = (renderer: WebGLRenderer, bakeScene: Scene) => {
    baked = { renderer, scene: bakeScene };
    const { samples, spread, opacity, resolution } = SETTINGS.groundShadow;
    // Opaque meshes cast a full shadow; glass meshes a lighter one (clear glass does not block most of the light).
    const casters: Mesh[] = [];
    const glassCasters = new Set<Mesh>();
    bakeScene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || mesh === ground || mesh.userData.reflection) return;
      casters.push(mesh);
      if (!Array.isArray(mesh.material) && isGlass(mesh.material)) glassCasters.add(mesh);
    });
    const castOnly = (glass: boolean) => casters.forEach((m) => { m.castShadow = glassCasters.has(m) === glass; });

    shadowMap?.dispose();
    shadowMap = new WebGLRenderTarget(resolution, resolution, {
      type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false,
    });

    // Every ShadowMaterial pass adds 1/samples of shadow into the target (white * alpha into rgb,
    // alpha into alpha), so after all samples the green channel holds the mean shadow. The ground
    // material applies the opacity, so it can change without a rebake.
    const accumulating = (weight: number) => {
      // Shadow goes into the green channel; the caustics' light goes into red (see caustics.ts).
      const m = new ShadowMaterial({ color: 0x00ff00, opacity: weight / samples });
      m.blending = CustomBlending;
      m.blendEquation = AddEquation;
      m.blendSrc = SrcAlphaFactor;
      m.blendDst = OneFactor;
      m.blendSrcAlpha = OneFactor;
      m.blendDstAlpha = OneFactor;
      // The model is drawn with this material too, but it does not receive shadows, so it adds nothing.
      m.depthTest = false;
      m.depthWrite = false;
      return m;
    };
    const add = accumulating(1);
    // With caustics, glass casts a full shadow and the light that gets through is added back by the photons;
    // without, glass casts a fixed lighter shadow.
    const useCaustics = glassCasters.size > 0 && SETTINGS.groundShadow.caustics > 0;
    const addGlass = glassCasters.size ? accumulating(useCaustics ? 1 : SETTINGS.groundShadow.glass) : null;
    const glassMeshes = [...glassCasters].filter((m) => m.visible);
    if (useCaustics && glassMeshes.length) {
      caustics ??= new Caustics();
    }

    // Straight-down view of the ground. up = -Z makes screen x = world +x and screen up = world -z,
    // which is the ground plane's own uv layout.
    const half = GROUND_SIZE / 2;
    const top = new OrthographicCamera(-half, half, half, -half, 0.1, 40);
    top.up.set(0, 0, -1);
    top.position.set(0, groundHeight + 10, 0);
    top.lookAt(0, groundHeight, 0);

    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new Color());
    const previousAlpha = renderer.getClearAlpha();
    const previousOverride = bakeScene.overrideMaterial;

    const previousAutoClear = renderer.autoClear;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(shadowMap);
    renderer.clear();
    renderer.autoClear = false; // each sample is added to the previous ones
    shadowLight.castShadow = true;
    for (let i = 0; i < samples; i++) {
      const d = toLight.clone();
      d.x += (halton(i + 1, 5) - 0.5) * 2 * spread;
      d.y += (halton(i + 1, 7) - 0.5) * 2 * spread;
      d.z += (halton(i + 1, 11) - 0.5) * 2 * spread;
      place(d);
      castOnly(false);
      bakeScene.overrideMaterial = add;
      renderer.render(bakeScene, top);
      if (addGlass) {
        castOnly(true);
        bakeScene.overrideMaterial = addGlass;
        renderer.render(bakeScene, top);
        if (useCaustics && caustics && glassMeshes.length) {
          caustics.splat(renderer, bakeScene, glassMeshes, {
            toLight: d.clone().normalize(), top, groundY: groundHeight, resolution, groundSize: GROUND_SIZE, samples, sample: i,
          });
        }
      }
    }
    casters.forEach((m) => { m.castShadow = true; });
    shadowLight.castShadow = false;
    place(toLight);
    bakeScene.overrideMaterial = previousOverride;
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    add.dispose();
    addGlass?.dispose();

    // Black with the baked shadow as its alpha (alphaMap reads the green channel).
    (ground.material as MeshBasicMaterial).dispose();
    // The caustics' light (red) lifts the shadow (green) where glass lets it through.
    const material = new MeshBasicMaterial({ color: 0x000000, alphaMap: shadowMap.texture, transparent: true, opacity, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.causticStrength = causticStrength;
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform float causticStrength;\nvoid main() {")
        .replace("#include <alphamap_fragment>", "{ vec4 baked = texture2D(alphaMap, vAlphaMapUv); diffuseColor.a = max(baked.g - baked.r * causticStrength, 0.0) * opacity; }");
    };
    material.customProgramCacheKey = () => "hexa-ground-caustics";
    ground.material = material;
  };

  return {
    light,
    shadowLight,
    get shadowTarget() { return shadowMap; },
    setDirection(x, y, z) {
      toLight.set(x, y, z).normalize();
      place(toLight);
      if (baked) bake(baked.renderer, baked.scene);
    },
    bake,
    get height() { return groundHeight; },
    setHeight(y) {
      groundHeight = y;
      ground.position.y = y;
    },
    setOpacity(value) {
      SETTINGS.groundShadow.opacity = value;
      (ground.material as MeshBasicMaterial).opacity = value;
    },
    setCaustics(value) {
      SETTINGS.groundShadow.caustics = value;
      causticStrength.value = value;
    },
    setVisible(on) { ground.visible = on; },
    get mesh() { return ground; },
  };
}
