# Diamond flow: from the GLB to the pixels

How the ring model is loaded, what the engine does to each stone so the diamond look can be drawn, which buffer and shader runs at each step, and what each step hands to the next.

This describes the **active code path** on branch `r3f-dev`: [src/engine.ts](src/engine.ts) driving the generated engine bundles in [src/engine/](src/engine/). The three.js port in [src/render/](src/render/) is not used (see §13).

Two kinds of statements appear below:

- **Code** means read from the source in this repo or in `src/engine/*.mjs`.
- **Measured** means read from the running viewer. The viewer was run in headless Chrome (SwiftShader, 1280×800 CSS pixels) and its renderer was inspected over the DevTools protocol (§14). Measured numbers are from one steady-state frame of the default view.

---

## 1. Summary

| Question | Answer |
| --- | --- |
| How many stones? | **45** meshes, all 318 triangles each: `D1001–D1016` (16), `D4001–D4028` (28), `D5` (1). |
| How many shader programs make the diamond? | **2 shader pairs**: normal capture (run once per unique shape, at load) and the diamond material (run every frame, per stone). |
| How many normal maps are baked? | **2** cube maps, 512² per face. One is shared by the 16 `D1` stones, one by the 28 `D4` stones plus `D5`. |
| How many materials / diamond programs? | 3 diamond materials, 2 distinct fragment sources. The 16 `D1` stones run the engine's own copy of the shader. The 29 whitened stones (`D4`, `D5`) run [diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl). Both are the same algorithm. |
| Passes registered in the frame pipeline | **15 registered, 14 in the pipeline order, 11 enabled** (§8). |
| Passes that run **before** the model is rendered | **7 slots, 5 enabled, 4 do GPU work**: `gbuffer`, `ssao`, `normalBuffer`, `ssBevel`. `ssr` is enabled but draws nothing (it runs inside the metal shader). `ssrtgi` and `velocityBuffer` are disabled. |
| Draw calls in one frame | **165** (measured). 102 of them happen before the model render pass. |
| What do the earlier passes give the diamond shader? | Only the **depth buffer** (so each stone pixel is shaded once). The diamond shader reads no AO, SSR or bevel result. It reads two textures: `tCubeMapNormals` and `envMap`. |
| What does the diamond shader output? | One RGBA value, **RGBM-encoded** (max range 16) into the composer's colour buffer. |

---

## 2. Big picture

```
 PAGE START                                  LOAD TIME (once)                                   EVERY FRAME
 ──────────                                  ───────────────                                    ───────────
 React <Canvas frameloop="never">            GLB import                                         gbuffer ─┐
   └─ gives the DOM canvas only                └─ Diamond plugin model processor:               ssao      │ 4 passes
 new ViewerApp({canvas, useRgbm:true})             ├─ per stone: compute stone frame            normalBuf │ before the
 add 40 base plugins  ──► 14-pass pipeline         ├─ per cacheKey: bake normal cube map  ──┐   ssBevel  ─┘ model render
 swap capture shader to src/shaders/…              └─ per material: make DiamondMaterial     │  render  (stones, ring, bg, ground)
 load Ring_v1.glb ────────────────────────────►                                              │  taa → progressive → bloom
 load scene preset, gem env, lightmap                                                        │  combinedPost ──► canvas
 whitenDiamonds (new material for D4/D5)                                                     │
 applyGem / applyMetal (set uniforms)                                                        ▼
 camera intro                                                                   tCubeMapNormals + envMap
                                                                                 feed diamond.frag
```

---

## 3. Startup and model load, in order

All steps run from `startViewer` in [src/engine.ts](src/engine.ts). R3F's `<Canvas frameloop="never">` ([ViewerCanvas.tsx:24](src/scene/ViewerCanvas.tsx#L24)) only supplies the canvas element. R3F's own renderer never draws. The engine creates a second `WebGLRenderer` on the same canvas (the console warns "Multiple instances of Three.js").

| # | Step | Where | What happens |
| --- | --- | --- | --- |
| 1 | Create the viewer | [engine.ts:22](src/engine.ts#L22) | `new ViewerApp({ canvas, useRgbm: true })`. Defaults that matter: **no MSAA** (`isAntialiased=false`), **depth pre-pass on** (`useGBufferDepth=true`). The renderer's registered passes are just `render` and `screen`. |
| 2 | Add plugins | [engine.ts:26](src/engine.ts#L26) | `AssetManagerPlugin` is added first, then `addBasePlugins` adds the rest in a fixed order (40 plugins in total, listed in §8.1). Each pass-owning plugin registers its pass. `refreshPipeline()` sorts the passes into order. |
| 3 | Swap the capture shader | [materials.ts:40](src/scene/materials.ts#L40), called at [engine.ts:29](src/engine.ts#L29) | The Diamond plugin's shared normal-capture material gets its GLSL replaced by [src/shaders/diamond/normal-capture.*.glsl](src/shaders/diamond/). It must happen **before the ring loads**, because the normal maps are baked during import (step 4). |
| 4 | Load the ring | [ring.ts:6](src/scene/ring.ts#L6) | `AssetManager.addFromPath("/assets/Ring_v1.glb")`. The importer runs the Diamond plugin's **model processor** (§4). When this returns, the stones already have their frames, their normal cube maps and a `DiamondMaterial`. |
| 5 | Scene preset | [ring.ts:22](src/scene/ring.ts#L22) | Imports `designer-scene.vjson` (camera target, ground). The ground plane comes from here, not from the GLB. |
| 6 | Lights | [lights.ts:5](src/scene/lights.ts#L5) | `gem-000.hdr` becomes `Diamond.envMap` (the stones' environment). `lightmap-r-2b.hdr` becomes the scene environment (used by the metal and ground). The `environmentChanged` event makes the Diamond plugin push the env map into every diamond material. |
| 7 | Scene settings | [setup.ts:7](src/scene/setup.ts#L7) | SSAO intensity 0.1, SSR `lowQualityFrames = 0`, ground settings, tone-map background off. |
| 8 | Whiten stones | [materials.ts:51](src/scene/materials.ts#L51) | For nodes matching `/^d(4\d{3}|5)$/` (`D4xxx`, `D5`): `makeDiamond` builds a **new** `DiamondMaterial` with the white-diamond values, and `useDiamondSource` swaps in [diamond.vert/frag.glsl](src/shaders/diamond/). `prepareDiamondMesh` runs again but does not bake again (the map exists from step 4). |
| 9 | Gem and metal values | [materials.ts:84](src/scene/materials.ts#L84) | `applyGem` writes the diamond parameters to **every** diamond material (all 45 stones). `applyMetal` sets the ring metal. |
| 10 | Frame the ring and set quality | [camera.ts:29](src/scene/camera.ts#L29), [setup.ts:18](src/scene/setup.ts#L18) | `displayCanvasScaling = 1.5`: the render size is the CSS size × 1.5 (1280×800 → 1920×1200). The device pixel ratio is not used. |
| 11 | Intro | [camera.ts:44](src/scene/camera.ts#L44) | 2.8 s camera orbit. Every frame calls `setDirty`, which restarts the progressive accumulation (§9). |

---

## 4. What the GLB contains, and what the engine does with it on import

### 4.1 GLB contents (Code, read from the file)

`Ring_v1.glb`: 3,565,520 bytes, glTF 2.0, one 3,449,228-byte buffer, no images or textures. 50 nodes, 46 meshes, 5 materials, 184 accessors.

Extensions used: `WEBGI_materials_diamond`, `WEBGI_viewer`, `WEBGI_material_extras`, `WEBGI_materials_displacementmap`, `WEBGI_materials_lightmap`, `WEBGI_object3d_extras`, `KHR_materials_ior`.

| Mesh | Count | Vertex buffer (per mesh) | Index buffer | Material | Diamond mesh extension |
| --- | --- | --- | --- | --- | --- |
| `D1001`–`D1016` | 16 | `POSITION` vec3 f32, `NORMAL` vec3 f32, `TEXCOORD_0` vec2 f32. 644–687 vertices. | `u16`, 954 indices = **318 triangles** | material 1 (diamond) | `{ cacheKey: "D1" }` |
| `D4001`–`D4028` | 28 | same layout, 594–651 vertices | `u16`, 954 indices | material 3 (diamond) | `{ normalMapRes: 512, cacheKey: "1" }` |
| `D5` | 1 | same layout, 597 vertices | `u16`, 954 indices | material 4 (diamond) | `{ normalMapRes: 512, cacheKey: "1" }` |
| `M1001` (ring metal) | 1 | same layout, 60,275 vertices | `u16`, 255,891 indices = 85,297 triangles | material 2 (`M1`, metal 1, rough 0) | none |

Every stone has its own `BufferGeometry` (45 unique geometries, measured). The only vertex attributes the diamond shaders use are `position` and `normal`. `uv` is passed through as `vUv` and never read.

The authored diamond material (`D1`) is red (`0xFF0000`), IOR 2.6, 5 ray bounces, transmission 1. `applyGem` overwrites these (§12).

### 4.2 The Diamond plugin's model processor (Code, [diamond.mjs](src/engine/diamond.mjs))

When the importer finishes a model, the plugin walks every node twice.

1. **Per mesh with a `WEBGI_materials_diamond` extension** → `prepareDiamondMesh(mesh, { cacheKey, normalMapRes })`:
   1. `_computeOffsets(geometry)`: computes the **stone frame** (§5) and stores it in `geometry.userData.normalsCaptureOffsets`.
   2. `captureNormalMap(geometry, cacheKey, res)`: bakes the facet-normal cube map (§6), or reuses one already baked under the same `cacheKey`.
2. **Per material with the extension** → `_convertToDiamondMaterial`: builds a `DiamondMaterial` from the `diamond` material template, copies the authored values and assigns it to every mesh that used the old material.

### 4.3 Normal-map sharing (Measured)

The cache is keyed by `cacheKey`, not by geometry. The first stone with a key is rendered; every later stone with that key reuses its texture even though each stone has its own geometry.

| cacheKey | Stones | Baked from | Result |
| --- | --- | --- | --- |
| `D1` | `D1001`–`D1016` (16) | `D1001` | 1 cube map |
| `1` | `D4001`–`D4028`, `D5` (29) | `D4001` | 1 cube map |

So only **2 bakes** happen for 45 stones. Each stone still gets its **own frame** (§5), which is how the shared map lands on each stone correctly. `whitenDiamonds` later sets the cache key to `whitened-d`, but the maps already exist, so nothing is baked again.

---

## 5. The stone frame (the offsets)

Both the capture pass and the diamond pass work in a per-stone frame where the stone fits inside the unit sphere. It is built once per geometry by `al()` in [diamond.mjs](src/engine/diamond.mjs) and cached in `geometry.userData.normalsCaptureOffsets`.

| Field | Meaning |
| --- | --- |
| `center` | Centre of the geometry's bounding box, in geometry space. |
| `offsetMatrix` | A matrix whose columns are the stone's principal axes (from an SVD of its vertices), scaled by the bounding-sphere radius. The second and third axes are flipped when the centre of mass lies on the other side of the third axis. If the signed volume is negative the normals are flipped first. |
| `offsetMatrixInv` | The inverse of `offsetMatrix`. |
| `centerOffset` | `center` transformed by `offsetMatrixInv`. |
| `radius` | Always `1`. The scale is already inside `offsetMatrix`. |

All 45 stones take the `al()` path because they have well under 500 triangles. The large-mesh path (`nl()`) is not used.

---

## 6. Pass 0: the normal capture (once per shape, at load)

**Shaders**: [normal-capture.vert.glsl](src/shaders/diamond/normal-capture.vert.glsl) and [normal-capture.frag.glsl](src/shaders/diamond/normal-capture.frag.glsl).

**How it runs** (Code, `el.captureNormalMap`): a three.js `CubeCamera(near 1e-4, far 100)` sits at the origin and renders a scene holding one mesh, the stone, with the capture material. The camera produces 6 views, so each bake is **6 draws of one stone**. The stone is `DoubleSide` and is drawn translated and scaled into its frame, so the camera is inside it.

| | Value |
| --- | --- |
| Inputs, per vertex | `position`, `normal` (from the GLB vertex buffer) |
| Uniforms | `offsetMatrixInv` (mat4), `offsetCenter` (vec3, = `center`), `radius` (float, 1) |
| Vertex output | `gl_Position = projection · modelView · offsetMatrixInv · (position − offsetCenter)`; `vNormal = normalize(offsetMatrixInv · normal)`; `vecPosition = model · offsetMatrixInv · (position − offsetCenter)` |
| Fragment output | `rgb = normalize(vNormal) * 0.5 + 0.5` (the facet normal), `a = length(vecPosition) / radius` (distance from the stone centre to that facet) |
| Render target | `WebGLCubeRenderTarget`, **512×512 per face**, RGBA, **HalfFloat**, **Nearest** min/mag filter, no mipmaps, no colour encoding (raw values) |
| Memory | 512 × 512 × 8 bytes × 6 faces = **12 MiB per map**, 24 MiB for both (computed) |
| Output goes to | `geometry.userData._normalsCaptureMap`. The material binds it as the uniform `tCubeMapNormals` (set in `DiamondMaterial.onBeforeRender`). |

In plain terms, the map answers "looking from the stone's centre in direction `d`, which facet do I hit, how far away is it, and which way does it face". The diamond shader uses that answer to trace light inside the stone without any real geometry.

---

## 7. The diamond material

### 7.1 Setup (Code + Measured)

- Class `ll` (`DiamondMaterial`) in [diamond.mjs](src/engine/diamond.mjs), a `ShaderMaterial`. Measured on all three materials: `side: DoubleSide`, `transparent: false`, `depthTest: true`, `depthWrite: true`, `depthFunc: 3` (`LessEqual`).
- **Shader defines** (Measured on the compiled program):

| Define | Value | Meaning |
| --- | --- | --- |
| `RAY_BOUNCES` | `6` | Loop count in the refraction trace. Set from `rayBounces` (the engine default is 5). |
| `ENV_MAP_TYPE` | `1` | The gem environment is a 2D texture, sampled by `cartesianToPolar` (lat-long maths in the shader). It is **not** a cube map. |
| `DIA_ORIENT_ENVMAP` | `0` | The env direction is rotated by `modelOffsetMatrix` before lookup. |
| `PI` | `3.1428` | The engine's value, kept so the look matches. |
| `FIX_ENV_DIRECTION` | `1` | Added because `scene.fixedEnvMapDirection` is `true`. Env directions are multiplied by `viewMatrix`, so the lookup is in camera space. |
| `USE_ENVMAP`, `OPAQUE`, `DOUBLE_SIDED`, `SHADOWMAP_TYPE_PCF` | set | Standard three.js defines. |

- The `#glMarker beforeAccumulation` line is turned into a comment when the program compiles. The `#include <encodings_fragment>` line becomes `gl_FragColor = linearToOutputTexel(gl_FragColor)`, and in this build `linearToOutputTexel` is **`LinearToRGBM(value, 16.0)`** (Measured).

### 7.2 Material groups (Measured)

| Material | Stones | Fragment source | Notes |
| --- | --- | --- | --- |
| authored `D1` (uuid `57fcf3a2…`) | `D1001`–`D1016` | Engine's minified copy (7,982 chars) | Same algorithm as the repo copy. |
| new, from `whitenDiamonds` | `D4001`–`D4028` | [diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl) (8,837 chars) | One material shared by 28 stones. |
| new, from `whitenDiamonds` | `D5` | [diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl) | Its own material. |

### 7.3 Uniform values on all three materials (Measured, after `applyGem`)

| Uniform | Value | Source |
| --- | --- | --- |
| `color` | `0xe4e4e4` | `GEMS.white` |
| `refractiveIndex` | `2.42` | `applyGem` |
| `rIndexDelta` (dispersion) | `0.004` | `applyGem` |
| `absorptionFactor` | `1` | `GEMS.white` |
| `boostFactors` | `(2, 2, 2)` | `GEMS.white` |
| `gammaFactor` | `1.09` | `applyGem` |
| `reflectivity` | `0.46` | `applyGem` |
| `envMapIntensity` | `1.6` | `applyGem` |
| `transmission` | `0` | `applyGem` (turns off the transmission-sampler branch) |
| `squashFactor` | `0.98` | engine default |
| `geometryFactor` | `0.5` | engine default |
| `colorCorrection` | `(1, 1, 1)` | engine default |
| `envMap` | 512×512 RGBA half-float, linear, from `gem-000.hdr` | `Diamond.envMap` |
| `tCubeMapNormals` | the baked cube map (§6) | per stone |
| `envMapRotation` | `envMap.rotation + envMapRotationOffset` = 0 | `onBeforeRender` |

### 7.4 Values set per stone per draw (Code, `ll.onBeforeRender`)

| Uniform | Value |
| --- | --- |
| `inverseModelMatrix` | `inverse(mesh.matrixWorld)` |
| `modelOffsetMatrix` | `offsetMatrix` premultiplied by `mesh.matrixWorld` |
| `offsetMatrixInv`, `centerOffset`, `radius` | from the stone's `normalsCaptureOffsets` |
| `tCubeMapNormals` | `geometry.userData._normalsCaptureMap.texture` |

---

## 8. The frame pipeline

### 8.1 How the pipeline is built

`addBasePlugins` ([core.mjs](src/engine/core.mjs), function `Ng`) adds these plugins, in this order (AssetManager was already added by `engine.ts`). Plugin names are from `PluginType`.

1. AssetManager, GBuffer, FullScreen, Progressive, CombinedPost, ChromaticAberration, Tonemap, LUT, Vignette, FilmicGrain, GammaCorrection
2. SSReflection, SSAO, **Diamond**, FrameFade, GLTFAnimation, Anisotropy, TriplanarUV, ThinFilm, FragmentClipping, NoiseBump, CustomBump, ClearcoatTint, MaterialVariants
3. VelocityBuffer, TAA, CameraViews, RandomizedDirectionalLight, HDRiGround, DepthOfField, SSContactShadows, SSGI, NormalBuffer, SSBevel, KTX2Load, PresetLibrary, SceneLoop, ParallaxCamera, Ground, Bloom

The code adds eight of these with an initial `false`: VelocityBuffer, RandomizedDirectionalLight, HDRiGround, DepthOfField, SSContactShadows, SSGI, NormalBuffer and SSBevel. The state after load is what matters, and it is the Measured table in §8.2. SSBevel and NormalBuffer end up **enabled** (SSBevel switches NormalBuffer on because it requires it). What switches SSBevel on during load was not traced; the GLB's embedded `WEBGI_viewer` settings are the likely source. VelocityBuffer, DepthOfField and SSGI stay disabled.

`refreshPipeline()` orders the registered passes using each pass's `after`, `before` and `required` lists. Each frame, `render()` calls `update()` on every enabled pass and then runs the composer through the pass list in order. A pass with `enabled=false` is skipped.

### 8.2 The passes, in order (Measured)

| # | Pass | Enabled | Draws | Reads | Writes |
| --- | --- | --- | --- | --- | --- |
| 1 | `gbuffer` | yes | 47 | scene geometry | G-buffer MRT + depth (§8.3) |
| 2 | `ssrtgi` | **no** | – | – | – |
| 3 | `ssr` | yes, **no work** | 0 | – | – (runs inline in the metal shader, §8.4) |
| 4 | `ssao` | yes | 4 | G-buffer | `aoTarget` |
| 5 | `velocityBuffer` | **no** | – | – | – |
| 6 | `normalBuffer` | yes | 47 | scene geometry | `normalBuffer` |
| 7 | `ssBevel` | yes | 4 | G-buffer, `normalBuffer` | `bevelBuffer` |
| 8 | **`render`** | yes | 49 | G-buffer depth, env maps, `tCubeMapNormals`, `aoTarget`, `bevelBuffer` | composer colour buffer |
| 9 | `frameFade` | yes | 0 in steady state | – | – |
| 10 | `depthOfField` | **no** | – | – | – |
| 11 | `taa` | yes | 1 | colour, G-buffer depth | colour |
| 12 | `progressive` | yes | 2 | colour, accumulation target | colour |
| 13 | `bloom` | yes | 10 | colour, G-buffer depth | colour |
| 14 | `combinedPost` | yes | 1 | colour, transparent layer, G-buffer | **canvas** |

**Registered 15** (the 14 above plus `screen`, which is disabled). **Enabled 11.** **Draw calls 165** (47 + 4 + 47 + 4 + 49 + 1 + 2 + 10 + 1). A frame during the first 32 accumulated frames repeats all of this.

### 8.3 Before the model render pass: the four passes that do work

These run before `render`. Their job is to give the later shaders scene information they cannot compute themselves.

#### Pass 1: `gbuffer`

| | |
| --- | --- |
| Programs | [gbuffer.vert.glsl](src/shaders/vertex/gbuffer.vert.glsl) + [gbuffer.frag.glsl](src/shaders/fragment/gbuffer.frag.glsl) |
| What is drawn | Every opaque mesh with an override material. Counted: 45 stones + ring + ground plane = 47 draws. Stones are drawn with this shader, **not** the diamond shader. |
| Target | One multi-render-target: 2 colour textures plus a depth renderbuffer, 1920×1200 |
| Texture 0 `gbufferDepthNormal` | RGBA 8-bit. `xy` = 16-bit packed `sqrt(linearDepth)` (high byte, low byte), `zw` = packed view normal (`n.xy / sqrt(n.z*8+8) + 0.5`). `linearDepth = (viewDepth − near) / (far − near)`. |
| Texture 1 `gbufferFlags` | RGBA 8-bit, the per-material `flags` vec4. Bits in `a` that the later shaders read: bit 1 = tone-map this pixel (`combinedPost`), bit 2 = named `disableAO` in the SAO shader (the SAO shader computes it but does not use it in its output). |
| Depth renderbuffer | Depth only, no stencil, not a texture. **It is reused by the `render` pass as its depth buffer.** |
| Consumers | SAO, bilateral AO, bevel passes, TAA, bloom prefilter, `combinedPost`, and the metal shader's inline SSR |

**What it gives the diamond:** the filled depth buffer. In the `render` pass the depth is not cleared (the pass sets `autoClearDepth = false` while `useGBufferDepth` is on), and all three diamond materials use depth function `LessEqual` (Measured: `depthFunc: 3`, depth test and depth write on). A stone pixel therefore passes the depth test only on its nearest surface, and the expensive diamond shader runs once per screen pixel rather than once per overlapping face. Both faces are enabled (`DoubleSide`), so without this the back faces would also be shaded.

#### Pass 4: `ssao`

| | |
| --- | --- |
| Programs | A copy ([fullscreen-copy.frag.glsl](src/shaders/fragment/fullscreen-copy.frag.glsl)), then [sao.frag.glsl](src/shaders/fragment/sao.frag.glsl), then a bilateral AO blur run twice (horizontal and vertical). The blur program is built from a template inside the bundle and has no copy in `src/shaders/`. |
| Draws | 4 fullscreen draws |
| Settings | 11 samples, 3 spiral turns, intensity 0.1 (set by [setup.ts](src/scene/setup.ts)), radius 1, bias 0.001, falloff 1.6, bilateral smoothing on |
| Reads | `gbufferDepthNormal`, `gbufferFlags`, its own previous result (`tLastThis`) |
| Target `aoTarget` | RGBA 8-bit, 1920×1200. `r` = occlusion, `gba` = packed depth for the blur. |
| Consumer | The **SSAO material extension**, which is compiled into `isMeshStandardMaterial2` materials only (ring metal and ground). It does `indirectDiffuse *= ao` and applies specular occlusion. **The diamond material is not compatible with it, so stones ignore AO.** |

The stones are still in the G-buffer, so they occlude the metal around them in the AO result.

#### Pass 6: `normalBuffer`

| | |
| --- | --- |
| Programs | three.js `MeshNormalMaterial` as an override (two compiled variants). No copy in `src/shaders/`. |
| Draws | 47 |
| Target `normalBuffer` | RGBA **HalfFloat**, 1920×1200. Normals are stored as `n * 0.5 + 0.5` (the readers decode `2·rgb − 1`). |
| Consumers | The bevel passes (`tNormalBuffer`). It exists because `ssBevel` requires it. |

#### Pass 7: `ssBevel`

| | |
| --- | --- |
| Programs | [normal-depth.frag.glsl](src/shaders/fragment/normal-depth.frag.glsl) (edge mask from depth, normal and flags differences), [mask-blur.frag.glsl](src/shaders/fragment/mask-blur.frag.glsl) (a blur at half resolution, 960×600), then [bevel-normal-smooth.frag.glsl](src/shaders/fragment/bevel-normal-smooth.frag.glsl) |
| Draws | 4 |
| Reads | `gbufferDepthNormal`, `gbufferFlags`, `normalBuffer` |
| Target `bevelBuffer` | RGBA **HalfFloat**, Nearest filter, 1920×1200 |
| Consumer | The material extension that the pass registers, for standard materials (ring metal). Not the diamond material. |

### 8.4 The two enabled passes that do nothing visible before `render`

- **`ssr`** is registered and enabled but makes **0 draws**. `inlineSSR = true`, so screen-space reflection is computed inside the standard-material shader (`calculateSSR`, using `tNormalDepth` and the previous frame's colour `tLastFrame`). The compiled ring and ground programs contain `calculateSSR`. **The diamond programs do not.**
- **`frameFade`** makes no draws once a fade has finished. `engine.ts` sets `fadeOnSceneUpdate = false` and starts a zero-length transition on each scene update.

### 8.5 Pass 8: `render` (the model)

This is the `Nt` pass in RGBM mode. It splits one scene render into stages. All of it uses the G-buffer's depth renderbuffer.

| Stage | What is drawn | Shader programs | Target |
| --- | --- | --- | --- |
| 1. Background | Clear colour `#ffffff` (1 draw) | the engine's background program (`backgroundColor * backgroundIntensity`, then RGBM out) | composer target `rt2` (the pass's read buffer) |
| 2. Opaque | **45 stones** with the diamond programs, the ring with the engine's `MeshPhysicalMaterial` program (≈79k characters, with SSR, SSAO, shadows, bevel) | **diamond** (two variants: `D1` engine copy, `D4`/`D5` repo copy) + **ring metal** | composer target `rt2` (RGBM) |
| 3. Transparent | Ground plane (1 draw; it is transparent, so it is held out of the opaque stage) | ground physical program (`MeshPhysicalMaterial` with a baked ground map) | a temporary half-float RGBA target (no depth) |
| 4. Blend | Merges the transparent layer into the opaque image (1 draw) | blend program: `a.rgb * (1 − b.a) + b.rgb * b.a` | composer target `rt1`, which then becomes the read buffer for the next pass |
| 5. Transmission | Nothing. Stones have `transmission = 0`, and `userData.renderTransmissionPass` is `false`. | – | – |

Stage 2 is where the diamond shader runs. Its inputs and output are in §10.

### 8.6 After the model render

| Pass | What it does | Program notes |
| --- | --- | --- |
| `taa` | Temporal anti-aliasing. Finds the closest-depth fragment in a 3×3 neighbourhood, derives screen velocity from depth (`HAS_VELOCITY_BUFFER = 0`), reprojects the previous frame. 1 draw. | Not in `src/shaders/`. |
| `progressive` | Running average of the jittered frames, up to **32** (`maxFrameCount`). `texel = clamp(weight·current + weight2·accumulated, 0, 8)` in RGBM. 2 draws (blend + copy to keep the result). | Not in `src/shaders/`. |
| `bloom` | 5 mip levels (960×600 down to 60×37), then a composite. **Prefilter threshold 2.0** (soft 0.03), radius 0.15, intensity 0.36. 10 draws. | Programs differ by `PASS_STEP` 0–3. Not in `src/shaders/`. |
| `combinedPost` | Final pass, draws to the **canvas**. Decodes RGBM, applies **ACES filmic tone mapping** (contrast 1.12, saturation 1, exposure 1) only to pixels whose G-buffer flag bit is set and that are not background (tone-mapping of the background is off), then `LinearTosRGB`, then premultiplies alpha. 1 draw. | The compiled program holds only tone mapping and `LinearTosRGB`. The vignette, grain, LUT and chromatic-aberration plugins are enabled but add no code to it. |

Bloom's threshold of 2.0 matters for stones: only linear values above 2.0 bloom, which is what bright facets reach with `boostFactors = 2`.

---

## 9. Frame timing: jitter, accumulation and the intro

- `Progressive.jitter = true` and `maxFrameCount = 32`. The camera projection is jittered each frame, and `progressive` averages up to 32 frames.
- Any `setDirty()` resets `frameCount` to 0. During the 2.8 s intro every frame is dirty, so each presented frame is a single jittered frame run through TAA. When the camera stops, the next 32 frames accumulate (every enabled pass runs each time) and the image converges. After that the viewer idles.
- The G-buffer, SSAO, normal and bevel passes re-run on every one of those frames. The stone normal maps are **not** re-baked.

---

## 10. The diamond fragment shader: inputs, steps, output

File: [diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl). Vertex file: [diamond.vert.glsl](src/shaders/diamond/diamond.vert.glsl).

### 10.1 Vertex stage

| Input | Output (varying) |
| --- | --- |
| `position`, `normal`, `uv` from the stone's vertex buffer; `modelMatrix`, `viewMatrix`, `projectionMatrix`, `normalMatrix` | `vWorldPosition`, `vWorldNormal = modelMatrix · normal` (note: uses the model matrix, not the normal matrix), `vNormal`, `vViewPosition`, `vUv` |

### 10.2 Fragment stage, step by step

1. **Surface reflection.** `reflect(viewVector, vWorldNormal)`, one environment lookup, weighted by the GGX environment BRDF and `reflectivity * 2`. The Fresnel base `f0` is computed from a fixed 2.4, not from `refractiveIndex`.
2. **Enter the stone.** `refract(view, normal, 1 / refractiveIndex)`. The entry loss is `1 − BRDF`. The ray origin and direction are moved into the stone frame with `offsetMatrixInv · inverseModelMatrix`.
3. **Trace, `RAY_BOUNCES = 6` times.** Each bounce:
   1. `intersect(origin, dir)`: ray against the unit sphere (squashed in y by `squashFactor`, scaled by `geometryFactor`), then **two** refinement steps. Each step samples `tCubeMapNormals` in the hit direction, reads the facet's distance (`a`) and normal (`rgb`), and intersects the ray with that facet's plane. That is 2 cube fetches.
   2. One more `tCubeMapNormals` fetch at the final hit gives the exit normal `mappedNormal` (sign-flipped so it faces inward).
   3. **Absorption**: `attenuation *= exp(−distance/radius · absorptionFactor · (1 − color))`.
   4. **Refract out.** If the refraction exists, the light that leaves is added to the output now. Dispersion: the red, green and blue channels each use a different IOR (`refractiveIndex + rIndexDelta`, `refractiveIndex`, `refractiveIndex − rIndexDelta`), so there are **3 environment lookups**, one per channel. The contribution is multiplied by `(1 − BRDF)`, `attenuation`, `colorCorrection` and `boostFactors`.
   5. **Continue inside.** The ray reflects off the facet and `attenuation *= BRDF_reflected * boostFactors`.
   6. If refraction fails (total internal reflection), the ray just reflects. On the last bounce only, the leftover light is read from the environment once.
4. **Combine.** `rgb = (refraction + reflection) * diffuseColor(1)`, then `pow(rgb, gammaFactor)`.
5. **Encode.** `gl_FragColor = linearToOutputTexel(...)`, which is `LinearToRGBM(rgb, 16.0)`; alpha is 1 before encoding.

**Worst-case cost per pixel:** 1 reflection lookup + 6 × (3 cube fetches + 3 environment fetches) = **37 texture fetches** (18 from `tCubeMapNormals`, 19 from `envMap`). Computed from the code.

### 10.3 What the shader reads and writes

| Direction | Name | What it is | Comes from |
| --- | --- | --- | --- |
| In | `tCubeMapNormals` | 512² cube, RGBA half-float: facet normal + distance | Pass 0 (§6) |
| In | `envMap` | 512² RGBA half-float, polar-mapped | `gem-000.hdr` via `Diamond.envMap` |
| In | `transmissionSamplerMap` | blank | unused (`transmission = 0`) |
| In | the uniforms in §7.3 and §7.4 | – | `applyGem`, `onBeforeRender` |
| In (indirect) | depth buffer | filled by `gbuffer` | Pass 1 |
| Not read | `tNormalDepth`, `tSSAOMap`, `tLastFrame`, bevel and normal buffers | – | The diamond programs do not declare them. |
| **Out** | `pc_fragColor` | RGBA 8-bit, **RGBM** (`rgb / (M·16)`, `a = M`) | Composer colour buffer A, 1920×1200 |

RGBM with a maximum of 16 means very bright facets are clamped at 16 and the multiplier `M` is quantised to 8 bits.

---

## 11. Who hands what to whom

```
 GLB vertex + index buffers ──► Diamond plugin ──► stone frame ───────────────┐
        │                              │                                      │ (uniforms)
        │                              └─ cubemap bake (6 draws) ► tCubeMapNormals ─┐
        │                                                                          │
        ├────────────► gbuffer ─► gbufferDepthNormal ─► SAO ─► bilateral ─► aoTarget ──► metal + ground only
        │                  │      gbufferFlags ──────────────────────────────────────────► combinedPost, SAO, bevel
        │                  │      depth renderbuffer ──────────────────────────────────┐
        ├────────────► normalBuffer ─► bevel ─► bevelBuffer ───────────────────────────► metal only
        │                                                                              │
        │       gem-000.hdr ► envMap ─────────────────────────────┐                    │
        └────────────► render pass:  diamond.frag  ◄──── tCubeMapNormals ◄──────────────┘ depth test
                                       │   (RGBM)
                                       ▼
                        composer buffer ─► blend ground ─► taa ─► progressive ─► bloom ─► combinedPost ─► canvas
```

| Producer | Buffer it writes | Consumers |
| --- | --- | --- |
| normal-capture shader | `tCubeMapNormals` (cube, RGBA16F, 512²) | diamond fragment shader only |
| gbuffer shader | `gbufferDepthNormal`, `gbufferFlags` (RGBA8) | SAO, bilateral AO, bevel passes, TAA, bloom, `combinedPost`, metal's inline SSR |
| gbuffer shader | depth renderbuffer | the `render` pass depth test (stones, ring) |
| SAO + bilateral | `aoTarget` (RGBA8) | metal and ground shaders (not stones) |
| `MeshNormalMaterial` | `normalBuffer` (RGBA16F) | bevel passes |
| bevel passes | `bevelBuffer` (RGBA16F) | metal shader (via the pass's material extension) |
| **diamond shader** | composer colour buffer (RGBM, 8-bit) | blend → TAA → progressive → bloom → `combinedPost` |
| `combinedPost` | the canvas (sRGB, premultiplied) | the browser |

---

## 12. Things worth knowing (including where other docs and comments differ)

1. **All 45 stones end up white.** The comment on [WHITEN_PATTERN](src/scene/materials.ts#L5) says the ruby `D1xxx` stones "stay as authored". But `applyGem` ([materials.ts:84](src/scene/materials.ts#L84)) writes the white values to every diamond material, `D1` included. Measured: all three diamond materials report colour `e4e4e4`, IOR 2.42 and 6 bounces. `whitenDiamonds` only decides which stones get a **new material and the repo's shader source**.
2. **The gem environment is not a cube map.** [shader-diamond.md](shader-diamond.md) (the three.js-port notes) says it is a cube. In the running engine it is a 512×512 2D half-float texture, `ENV_MAP_TYPE = 1`.
3. **Normal-capture filter.** The engine bakes with **Nearest** filtering. The unused three.js port in [src/render/diamond.ts](src/render/diamond.ts) uses Linear.
4. **Stones share a normal map by `cacheKey`**, not by geometry. This works because all stones are the same cut. A stone with a different cut would need its own key.
5. **Stones skip AO, SSR and bevel.** Those effects reach the stones only indirectly: through the depth buffer, and through the neighbouring metal (which is shaded using the G-buffer that includes the stones).
6. **`f0` is hard-coded.** Both the reflection term and the refraction term use `f0` from `2.4`, not from `refractiveIndex`.
7. **Render resolution** is CSS size × 1.5, independent of `devicePixelRatio`.
8. **The `ssr` pass shows as enabled but is inactive.** Check for `calculateSSR` in the materials, not for draws in the `ssr` pass.

---

## 13. Code that is not on this path

- [src/render/](src/render/) (the three.js port, `threeEngine.ts` and friends) is not imported. [src/engine.ts](src/engine.ts) does not call it.
- 27 of the 31 programs in [src/shaders/](src/shaders/) are reference copies. Only the four diamond programs run from `pipeline.ts`. Editing the others changes nothing on screen.
- [ARCHITECTURE.md](ARCHITECTURE.md) and [FOLDERS.md](FOLDERS.md) describe an earlier no-build version of the project.

---

## 14. How the measurements were taken

1. Started `vite` and opened the page in headless Chrome (Chrome 152, ANGLE/SwiftShader) at 1280×800, device pixel ratio 1.
2. Waited for `window.viewer` (the debugging hook in [engine.ts](src/engine.ts)) to render, then waited for the intro to finish.
3. Read the renderer state through the DevTools protocol: `viewer.renderer.pipeline`, each pass's `enabled`, the plugin list, render-target sizes and formats, the diamond materials' uniforms and defines, the compiled shader source of the diamond program, and each stone's `userData`.
4. For the per-pass draw counts, wrapped each composer pass's `render` and the WebGL `draw*` calls for one frame, and recorded the render target bound at each draw.

Not measured: timing (SwiftShader is not representative of a real GPU), other cameras and zoom levels, and other devices. Draw counts and target sizes will change with the stone and mesh count and with the canvas size. The pass enable states can change if the GLB's embedded `WEBGI_viewer` settings or the scene preset change them.
