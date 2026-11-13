# Rendering Engine Reverse Engineering

Analysis of `vendor/engine-0.8.0/bundle-0.8.0.mjs` as used by `index.html` (Hexa Jewelry Viewer).

**Evidence legend** — every technical claim in this document carries one of:

| Tag | Meaning |
|---|---|
| ✅ | **Confirmed**: read directly in the bundle source *and/or* observed at runtime (compiled shader source, uniform values, render-target state, measured pixels). |
| 🔶 | **Deduced**: follows from confirmed facts but is my interpretation (physical meaning, intent, "why"). |
| ❓ | **Unknown / not inspected**: listed again in §9. |

**Source references.** The shipped bundle is minified (405 lines, longest line ≈ 955 KB). All line numbers below refer to a prettified copy, `bundle.pretty.mjs`, produced with:

```bash
npx prettier@3.3.3 --parser babel --print-width 120 vendor/engine-0.8.0/bundle-0.8.0.mjs > bundle.pretty.mjs
```

Identifiers are minified (`ll`, `qt`, `Nt`, …); I always give the class's *semantic* name first, then the minified name and line, then a string you can grep for (e.g. `"WEBGI_materials_diamond"`). Shader text lives in string literals, so it is intact and greppable. Runtime values were read from `window.viewer` on the page served by `py -m http.server 8000`.

---

## 1. Introduction and Project Objective

**Goal.** Understand exactly how the current viewer produces (1) the gold band, (2) the diamonds, and (3) the whole frame, well enough that an engineer who never sees the bundle can rebuild equivalent functionality in an independent engine.

**What the viewer renders** (`index.html`, `assets/`):

| Item | Value | Tag |
|---|---|---|
| Model | `Ring_v1.glb`, 46 meshes: 1 metal mesh (`M1001`, material `M1`), 45 stone meshes (29 using a material named `diamond` — the whitened stones incl. the large centre stone `D5` — plus 16 using `D1`), 14,310 stone triangles (~318 per small stone) | ✅ |
| Gold material | `M1`: metalness 1, roughness 0, IOR 1.5, linear base colour (0.7835, 0.4508, 0.1845) (applied by `setMetal`, `index.html`) | ✅ |
| Diamond material | RI 2.42, rayBounces 6, dispersion 0.004, absorption 1, boost (2,2,2), gamma 1.09, reflectivity 0.46, envIntensity 1.6, colour `#e4e4e4` | ✅ |
| Environment (gold) | `lightmap-r-2b.hdr`, Radiance RGBE 1024×512, rotation 2 rad | ✅ |
| Environment (diamond) | `gem-000.hdr`, Radiance RGBE **512×512** (not 2:1), authored in Photoshop | ✅ |
| Canvas | CSS 1024×768 × `displayCanvasScaling` 1.5 = 1536×1152 backbuffer | ✅ |

**Headline findings** (details in the phases):

1. **Gold is not a custom shader.** It is a Three.js r152 `MeshPhysicalMaterial` subclass whose stock GLSL is patched at three marker points to inject screen-space reflections (SSR) and ambient occlusion (SSAO). The BRDF is stock Three r152 (GGX + Smith-correlated + Schlick, split-sum IBL with multiple-scattering compensation). The distinctive parts are the *pipeline around it*: RGBM-16 HDR storage, ACES tonemap + contrast in a late full-screen pass, camera-fixed environment, 32-frame jittered accumulation.
2. **Diamond is a fully custom `ShaderMaterial`** that approximates ray tracing inside the stone using a per-shape **distance+normal cubemap** baked once on the GPU. Each fragment marches up to `RAY_BOUNCES` internal bounces (3 cube fetches per bounce), applies Beer–Lambert absorption, Fresnel splits, total-internal-reflection and 3-sample dispersion, then samples a *non-prefiltered* HDR image. There are several hard-coded constants and conventions (§4.10) that a faithful rebuild must reproduce deliberately.
3. **The frame is a topologically-sorted chain of 14 pass slots** (11 active here) writing to **8-bit RGBM (range 16)** targets, finished by a single full-screen pass doing ACES → contrast → saturation → sRGB. Anti-aliasing is temporal-jitter accumulation, not MSAA.
4. The bundle contains a **patched Three.js r152** (render-phase flags on `renderer.userData`, custom colour-space `"rgbm-16"`); it cannot simply be swapped for stock Three.

---

## 2. Existing Bundle Architecture and Investigation Method

### 2.1 What the bundle is

| Fact | Evidence | Tag |
|---|---|---|
| Webpack ESM build, module table `__webpackgi_modules__`, public exports `__webpackgi_exports__*` | file head / tail | ✅ |
| Three.js **r152** inside (`const n = "152"`, `bundle.pretty.mjs:11433`) | source | ✅ |
| Viewer layer reports `VERSION = "0.8.0"` (`:51245`); GLB's `WEBGI_viewer` block says `0.22.0` — authored with a newer tool than the runtime | source + GLB JSON | ✅ |
| Product identity: strings `WEBGI_*` glTF extensions, `webGiViewers`, `__webpackgi_` → the commercial **WebGi** viewer SDK (built on Three.js) | source | 🔶 |
| `bundle.m.js.LICENSE.txt` / source map are referenced by the header but **not shipped** in the repo | file listing | ✅ |
| Three.js is patched: `renderer.userData` carries `opaqueRender / transparentRender / shadowMapRender / backgroundRender / transmissionRender / mainRenderPass`, toggled by helper `L()` (`:39374`); main pass logs `"threejs is not patched?"` if absent (`:43645`) | source | ✅ |

### 2.2 Layering

```
 index.html (app code, ~200 lines JS)
   └─ ViewerApp (na, :50760)  ── plugin container + animation loop + event bus
        ├─ RootScene (bt, :42735)         scene graph, env, cameras, bounds
        ├─ BaseRenderer / RenderManager (ke, :40641)
        │     ├─ THREE.WebGLRenderer (r.CP7)  [patched r152]
        │     ├─ EffectComposer (h, :38641)    pass runner
        │     └─ pass registry + dependency sorter (refreshPipeline, :40675)
        ├─ Plugins (class Rt, :43342)  each adds passes / material extensions / importers
        │     GBuffer, Progressive, CombinedPost, Tonemap, SSAO, SSReflection, Bloom,
        │     Diamond, Ground, FrameFade, TAA, … (41 plugins instantiated, see §5.1)
        └─ Material layer
              MeshStandardMaterial2 (qt, :43902) ← THREE.MeshPhysicalMaterial
              DiamondMaterial       (ll, :57327) ← THREE.ShaderMaterial
              MaterialExtension system (wt, :43000) — string-patches shaders
```

### 2.3 Method

1. Beautified the bundle (Prettier) and located classes by their string literals.
2. Cross-checked static source against **runtime**: the compiled GLSL actually uploaded to the GPU (`gl.getAttachedShaders` → `getShaderSource`), material uniforms/defines, render-target descriptors, pass order (`viewer.renderer.pipeline`).
3. Ran **controlled experiments** on the live viewer (§3.9, §4.9): change one parameter, re-render 34 frames to converge, measure mean 8-bit sRGB output over the stone region / gold pixels. Caveat: the Browser pane was hidden, so I drove frames manually (`renderer.render()` ×34) instead of `requestAnimationFrame`. Numbers are indicative (±3 levels run-to-run from stochastic SSR/jitter), not benchmarks.

### 2.4 Constant-name decoder (minified Three exports)

| Alias | Meaning | | Alias | Meaning |
|---|---|---|---|---|
| `r.jyz` | `ShaderMaterial` | | `r.cLu` | `HalfFloatType` |
| `r.EJi` | `MeshPhysicalMaterial` | | `r.ywz` | `UnsignedByteType` |
| `r.CP7` | `WebGLRenderer` | | `r.aCh` | `NoColorSpace` (`""`) |
| `r._am` | `CubeCamera` | | `r.uL9` | `NoToneMapping` |
| `r.oAp` | `WebGLCubeRenderTarget` | | `r._iA` | `PCFShadowMap` |
| `r.ehD` | `DoubleSide` | | `r.TyD` | `NearestFilter` |

---

## 3. Phase 1 — Gold / Metallic Material Rendering

### 3.1 Material architecture

**Class chain** ✅: `THREE.MeshPhysicalMaterial` → `MeshStandardMaterial2` (`qt`, `:43902`; `typeSlug "pmat"`, `isMeshStandardMaterial2 = true`). Runtime `material.type` still reports `"MeshPhysicalMaterial"`, so the Three program cache treats it as stock physical.

The subclass adds only infrastructure (no new BRDF parameters):

- `materialExtensions` — string-patch hooks (§3.3).
- `onBeforeRender` (`:44214`) — **overrides `envMapIntensity` with `scene.envMapIntensity`** unless `userData.separateEnvMapIntensity` is set; and toggles `#define FIX_ENV_DIRECTION` from `scene.fixedEnvMapDirection`.
- `onBeforeCompile` (`:44191`) — injects four marker comments (below) then runs extensions.

**The gold material at runtime** (`M1`) ✅:

| Property | Value | Notes |
|---|---|---|
| `metalness` / `roughness` | 1 / 0 | set by GLB + `setMetal()` |
| `color` (linear) | (0.7835, 0.4508, 0.1845) | sRGB ≈ `#e5b377` |
| `ior`, `specularIntensity` | 1.5, 1 | **No effect** at metalness 1 (see 3.2) |
| `clearcoat`, `sheen`, `iridescence`, `transmission` | 0 | features compiled out |
| `side` | `DoubleSide` | `DOUBLE_SIDED` define |
| `envMapIntensity` | 1 (ignored) | scene value used instead (measured, §3.9) |
| Active defines | `STANDARD, PHYSICAL, FIX_ENV_DIRECTION, SSR_ENABLED, SSAO_ENABLED, SSR_STEP_COUNT 16, SSR_INLINE 1, SSR_MASK_FRONT_RAYS 1, SSR_NON_PHYSICAL 0, SSCS_ENABLED 0, SSRTAO_ENABLED 0, USE_ENVMAP, ENVMAP_TYPE_CUBE_UV, USE_SHADOWMAP, IOR, DOUBLE_SIDED` | from compiled program |
| Program size | fragment 79,161 chars, vertex 18,614 | 13 material extensions registered |

There is **no `TONE_MAPPING` define** in this program ✅ — tone mapping is *not* done in the material (§3.7).

### 3.2 Mathematics actually executed ✅ (compiled shader dumped at runtime)

All of the following is the stock r152 `meshphysical` pipeline. Notation: `N` normal, `V` view dir, `L` light dir, `H = normalize(L+V)`, `ρ` roughness, `α = ρ²`, `F0` specular colour at normal incidence, `F90` grazing reflectance.

**Material setup** (`main()`, after marker `beforeAccumulation`):

```
diffuseColor_m  = baseColor · (1 − metalness)                          → 0 for gold
geomRough       = max(|dFdx(Ng)|, |dFdy(Ng)|) component-wise max       (Ng = geometry normal)
ρ               = min( max(roughness, 0.0525) + geomRough , 1 )        → ≈0.0525 for roughness 0
F90             = mix(specularIntensity, 1, metalness)                 → 1
F0              = mix( min(((ior−1)/(ior+1))² · specColor, 1)·specInt , baseColor , metalness )
                = baseColor                                            ← gold's F0 IS its base colour
```

So for a conductor the *IOR is irrelevant*; the base colour is the (linear RGB) normal-incidence reflectance. (0.784, 0.451, 0.184) is a physically plausible gold F0.

**Direct light** (one directional light, `RE_Direct_Physical`):

```
Lo_direct = (N·L)⁺ · E_light · BRDF_GGX
BRDF_GGX  = F(V·H) · Vis(α, N·L, N·V) · D(α, N·H)
F         = F0 + (F90 − F0)·2^((−5.55473·(V·H) − 6.98316)·(V·H))      ← Schlick with exp2 approximation
D         = α² / (π · ((N·H)²(α²−1) + 1)²)                            ← GGX / Trowbridge–Reitz
Vis       = 0.5 / max( (N·L)·√(α²+(1−α²)(N·V)²) + (N·V)·√(α²+(1−α²)(N·L)²), ε )   ← Smith GGX height-correlated
```

At ρ = 0.0525, α = 0.00276: D is extremely peaked → the light shows as a tiny hot highlight; the rest of the shading is IBL.

**Indirect specular** (`RE_IndirectSpecular_Physical`, split-sum + multiple scattering):

```
radiance   = textureCubeUV(env, R', ρ) · envIntensity
R          = reflect(−V, N);   R' = normalize( mix(R, N, ρ²) )          ← bend toward N with roughness
(A, B)     = DFGApprox(N·V, ρ)      Karis analytic fit:
               r = ρ·(−1, −0.0275, −0.572, 0.022) + (1, 0.0425, 1.04, −0.04)
               a = min(r.x², 2^(−9.28·N·V))·r.x + r.y
               (A,B) = (−1.04, 1.04)·a + r.zw
F_ss·E_ss  = F0·A + F90·B                                                ← single scatter
E_ss = A+B ;  E_ms = 1−E_ss ;  F_avg = F0 + (1−F0)/21                    (0.047619 = 1/21)
F_ms       = (F_ss·E_ss · F_avg) / (1 − E_ms·F_avg)                      ← Fdez-Agüera multi-scatter
indirectSpec += radiance · F_ss·E_ss  +  F_ms·E_ms · (irradiance/π)
```

`irradiance = π · textureCubeUV(env, N, 1.0) · envIntensity` (`getIBLIrradiance`) — the roughest PMREM level used as a diffuse proxy. Ambient light colour and the 9 light-probe SH coefficients are **all zero** at runtime ✅, so the only light sources are the IBL and one directional light.

**Energy conservation:** handled by the multi-scatter term (energy loss from single-scattering GGX is added back); diffuse is multiplied by `1 − max(totalScattering)`. For metals diffuse is already 0.

**Spatial correctness details that differ from "textbook":**

- Roughness floor 0.0525 + screen-space geometric roughness (Kaplanyan-style specular anti-aliasing) → never a perfect mirror ✅.
- Reflection vector *bent toward N* by `ρ²` before prefiltered lookup ✅.
- Env lookup **rotates about +Y by `envMapRotation`** (uniform = `scene.environment.rotation` = 2 rad) via a custom patched `getIBLRadiance`/`getIBLIrradiance` ✅ (seen in the runtime-dumped fragment source at character offset ≈17,000).

### 3.3 Shader implementation

**Vertex shader** — stock Three `meshphysical.vert` (18.6 KB incl. shadow-coord varyings). ✅ No gold-specific vertex logic.

**Fragment shader** — stock `meshphysical.frag` plus four injection points created by `onBeforeCompile` (`:44191-44201`) ✅:

| Marker | Inserted before | Used by |
|---|---|---|
| `mainStart` | `#include <clipping_planes_fragment>` | fragment clipping plugin |
| `beforeAccumulation` | `#include <lights_physical_fragment>` | (extension point; unused for gold here) |
| `beforeModulation` | `#include <aomap_fragment>` | **SSR blend, then SSAO multiply** |
| `afterModulation` | `vec3 totalDiffuse = ` | (extension point) |

The helper `At(src, needle, replacement, {prepend, append, replaceAll})` (`:42995`) does the string surgery; `wt.ApplyMaterialExtensions` (`:43001`) runs each extension's `parsFragmentSnippet` (prepended before `void main()`), `extraUniforms`, `extraDefines`, `shaderExtender(shader, material, renderer)` and registers `updaters` that push uniforms each draw. The program cache key is extended with `computeCacheKey`.

**Execution order inside `main()`** ✅ (read from the dumped source):

```
 diffuseColor, roughness/metalness factors          ← no maps are bound on M1
 normal (DOUBLE_SIDED: ×faceDirection)
 PhysicalMaterial setup (F0, F90, ρ + geomRough)    ← §3.2
 directional light 0: RE_Direct (+ shadow factor)
 irradiance = ambient(0) + lightProbe(0)
 iblIrradiance = PI·cubeUV(N, 1.0)·intensity
 radiance      = getIBLRadiance(V, N, ρ)
 RE_IndirectDiffuse, RE_IndirectSpecular            ← adds to reflectedLight.*
 ── SSR (marker beforeModulation) ──
 ── SSAO multiply ──
 outgoingLight = totalDiffuse + totalSpecular + emissive
 gl_FragColor  = vec4(outgoingLight, a)
 gl_FragColor  = linearToOutputTexel(gl_FragColor)  ← LinearToRGBM(·, 16)  (NOT sRGB)
```

**SSR block** (`SSR_ENABLED`, inline) ✅:

```
alpha  = (1 − clamp(0.3·ρ,0,1)) · ssrIntensity
alpha *= clamp(−4·(V·N) + (4 + ssrMaskFrontFactor), 0, 1)      ← fade rays facing the camera (maskFront = −0.2)
alpha *= edgeFade(screenPos)   (fadeStrength 0.1, pow 0.3)
if (|EnvironmentBRDF|·alpha > 0.01 && roughnessFactor < 0.9) ssr = calculateSSR(...)
indirectSpecular = mix(indirectSpecular, saturate(EnvironmentBRDF · ssr.rgb), ssr.a)
```

`calculateSSR`: importance-sample a GGX half-vector (`ComputeReflectionL`: `cosθ = u₂^(ρ⁴/(2−ρ⁴))`, `φ = 2π·u₁`) using interleaved-gradient noise seeded with `frameCount`; ray length from scene bounding radius (`autoRadius` true); 16-step linear screen-space march against the GBuffer depth (`traceRay`, tolerance 0.5·rayLen·0.125) with a refinement pass; **hit colour is read from last frame** (`tLastFrame` = the Progressive accumulation buffer) — so reflections of the ring in itself are 1 frame delayed and converge over the 32 accumulated frames. The `saturate(...)` clamps SSR radiance to ≤ 1 before multiplication.

**SSAO block** (`SSAO_ENABLED`) ✅: `ao = tSSAOMap(screen uv).r; indirectDiffuse *= ao; indirectSpecular *= computeSpecularOcclusion(N·V, ao, ρ)` where `computeSpecularOcclusion = saturate(pow(N·V + ao, exp2(−16ρ − 1)) − 1 + ao)`. The SSAO map comes from a separate pass (§5.4) with `intensity 0.1` here, so its effect on gold is minimal (measured +1 level when disabled).

### 3.4 Environment and reflection ✅

```
 lightmap-r-2b.hdr (RGBE, 1024×512)
   → RGBELoader → DataTexture RGBA HalfFloat, srgb-linear, flipY, linear filter, NO mips
   → scene.environment (EquirectangularReflectionMapping, rotation = 2)
   → Three WebGLCubeUVMaps  → PMREMGenerator.fromEquirectangular(tex)       (:19470-19500, :19895-19930)
        cubeSize = image.height/2 = 256 → "CubeUV" atlas texture 768×1024, HalfFloat
   → material uniform `envMap` (sampler2D, ENVMAP_TYPE_CUBE_UV)
```

- Roughness → blur is **prefiltered GGX in the PMREM mip-like atlas**, sampled with `textureCubeUV(envMap, dir, roughness)`.
- **Camera-fixed environment.** The GLB's viewer config has `sceneEnvironmentFixedDirection: true` → `scene.fixedEnvMapDirection` → `#define FIX_ENV_DIRECTION`. With it, `getIBLRadiance` **skips** `inverseTransformDirection(·, viewMatrix)`; the reflection vector stays in *view space* and is looked up directly. The studio lighting therefore stays glued to the camera while the ring is orbited ✅ (confirmed by code; measured: disabling it brightens the gold ≈ +5/+8/+9 RGB).
- `envMapRotation` is applied *after* this (rotation about Y in view space).
- Environment intensity: `scene.envMapIntensity` (=1). Changing `material.envMapIntensity` has **no effect** unless `userData.separateEnvMapIntensity = true` (measured: 0.5 → 212.5 ≈ 212.1 baseline; with the flag: 197.7, identical to scene-level 0.5 → 197.0). Diamonds set that flag in their constructor.
- Direct light and IBL are simply **summed** (`indirectSpecular + directSpecular`), both in linear HDR.

### 3.5 Direct lighting & shadows ✅/🔶

Two `DirectionalLight`s exist; only one affects the camera layer:

| Light | intensity | colour | layers mask | shadow map | note |
|---|---|---|---|---|---|
| A | 1 | `#cceeff` | 1 (default) | 1024², bias −0.001, radius 2, ortho ±2, near −2/far 9 | the one compiled into the gold shader (`directionalLights[0]`) |
| B | 10 | white | 32 | 1024², radius 10 | not on layer 0 → invisible to the main camera (consumed by another system, probably ground-shadow baking) 🔶 |

Shadows: `renderer.shadowMap = { enabled: true, type: PCFShadowMap, autoUpdate: false }` (`:40790-40792`); `resetShadows()` (sets `needsUpdate`) is called whenever the scene changes **and every jitter frame** (Progressive) so shadow edges also anti-alias by accumulation ✅. `RandomizedDirectionalLight` plugin is enabled (`lightLayers 1`) — behaviour not inspected ❓.

### 3.6 Colour management ✅

| Stage | Space | Where |
|---|---|---|
| Material inputs | linear sRGB (Three ColorManagement) | uniform `diffuse` etc. |
| Env textures | `srgb-linear` HDR half-float | loader |
| Material output | **linear HDR, RGBM-encoded, max range 16** | `linearToOutputTexel` |
| Intermediate targets | 8-bit RGBA, colour-space tag `"rgbm-16"` | `composerTarget` |
| Tonemap + OETF | in `combinedPost` (§5.6) | ACES → contrast → sat → sRGB |
| `renderer.outputColorSpace` | `NoColorSpace` | `:40789` — Three does **no** sRGB conversion itself |
| `renderer.toneMapping` | `NoToneMapping`, exposure 1 | `:40787` |

RGBM-16 encode/decode (✅ in compiled source):

```
encode:  m = clamp(max(r,g,b)/16, 0, 1);  M = ceil(m·255)/255;  rgb' = rgb/(16·M);  out = (rgb', M)
decode:  rgb = rgb' · M · 16
```

Consequences: max representable radiance 16; 8-bit mantissa with an 8-bit shared exponent-like multiplier → banding in dark regions is possible because `M` is quantised upward (`ceil`). Every pass that reads/writes the scene buffer pays this encode/decode (the `…TexelToLinear` helpers generated by `S()/T()`, `:39292-39301`).

### 3.7 Why gold looks yellow / orange / dark / bright ✅🔶

- **Hue** comes from F0 = (0.784, 0.451, 0.184): R:G:B reflectance ≈ 4.3 : 2.4 : 1. A mirror-like surface returns `Env(R)·F`, so hue = environment colour × this triple.
- **Dark** areas: roughness ≈ 0.05 makes the surface a near-mirror; wherever the reflected direction hits dark parts of the HDR, the metal is dark (there is almost no diffuse term to fill in). The env map content, not the material, dominates variation.
- **Bright/clipped** areas: sun-like HDR texels reach > 1; ACES then rolls them toward white (desaturation of bright saturated colours).
- **Orange shift:** the ACES filmic transform + contrast 1.12 reduces blue and adds saturation. Measured effect on mean gold RGB: Linear tonemap (217.5, 166.2, 98.4) vs ACES (212.0, 174.5, 116.7) — ACES pulls the colour toward neutral (+18 B); removing the contrast 1.12 gives (208.5, 174.8, 126.4).
- **View dependence:** the 16-step SSR + camera-fixed env make mirror-like reflections of the ring's own stones/shank; `ssr off` shifts gold to (206.9, 171.8, 118.0) and shrinks the gold-pixel mask by ~15 % (fewer bright self-reflections).

### 3.8 Pseudocode (existing implementation, paraphrased)

```text
// once
envPMREM  = PMREM(equirect HDR)                       // cubeUV atlas, GGX prefilter
gold      = PhysicalMaterial{ base=F0, metal=1, rough=0 }
gold.defines = { FIX_ENV_DIRECTION, SSR_INLINE, SSR_STEPS=16, SSAO }
// per frame (gold fragment)
ρ        = min(max(rough, .0525) + geomRough, 1)
F0       = base ; F90 = 1
Lo       = directional(L0) * BRDF_GGX(L0,V,N)*shadow
R        = normalize(mix(reflect(-V,N), N, ρ²));  R = rotY(R, envRot)   // view space if FIX_ENV
rad      = cubeUV(envPMREM, R, ρ) * sceneEnvIntensity
spec     = rad*Fss + Fms*Ems*irr/π
ssr      = stochasticScreenSpaceRay(GGX sample, 16 steps, depth=GBuffer, color=lastFrame)
spec     = mix(spec, saturate(EnvBRDF*ssr.rgb), ssr.a)
spec    *= specOcclusion(ssaoMap)
out      = LinearToRGBM(spec + Lo, 16)                            // later: ACES, contrast, sRGB
```

### 3.9 Phase-1 experiments (mean gold RGB, 8-bit sRGB out) ✅

| Change | Gold RGB | Interpretation |
|---|---|---|
| baseline | 212.0 / 174.5 / 116.7 | |
| roughness 0.3 | 216.0 / 177.9 / 118.6 | broader, brighter reflections |
| roughness 0.6 | 219.8 / 180.5 / 119.4 | |
| `material.envMapIntensity` 0.5 or 2 | 212.5 / 174.8 / 116.8 or 212.1 / 174.6 / 116.6 | **ignored** |
| `scene.envMapIntensity` 0.5 | 197.0 / 155.6 / 95.7 | works |
| `separateEnvMapIntensity` + 0.5 | 197.7 / 156.4 / 96.2 | matches scene-level |
| `scene.envMapIntensity` 2 | 220.1 / 186.4 / 130.5 | |
| SSR off | 206.9 / 171.8 / 118.0 | |
| SSAO off | 213.1 / 176.0 / 118.1 | tiny (intensity 0.1) |
| tonemap Linear | 217.5 / 166.2 / 98.4 | |
| exposure 0.6 | 186.2 / 142.3 / 79.8 | |
| contrast 1.0 | 208.5 / 174.8 / 126.4 | |
| `fixedEnvMapDirection` off | 217.5 / 182.5 / 126.2 | |
| env rotation 0 | 215.3 / 178.2 / 119.9 | |

### 3.10 Proposed independent architecture for metals

Inputs: `baseColorF0 (vec3)`, `roughness`, optional maps; scene IBL; one directional light; GBuffer depth; last-frame colour.

1. **Env preprocessing (CPU/GPU, once per HDR):** decode RGBE → float16 equirect → cubemap → GGX-prefiltered mip chain (or the cubeUV atlas), plus either an irradiance SH-9 or the roughest mip.
2. **Material shader (GLSL ES 3.0 / WGSL):** implement §3.2 exactly: roughness clamp + geometric roughness, GGX/Smith/Schlick for the light, split-sum with `DFGApprox` (or a 32×32 DFG LUT) and Fdez-Agüera multi-scattering for IBL.
3. **View-space or world-space env switch** (`fixedEnvDirection`) + Y-rotation uniform.
4. **Hook points** (`beforeModulation`) for SSR and SSAO — implement as an *ordered list of shader snippets* rather than string `replace`.
5. **Output stage** abstracted: `encodeOutput(linearHDR)` so you may choose RGBM-16, RGBA16F, or RGB10A2 per device (see §7 for the recommendation).

Dependencies you can drop: the extension string-patcher, the 13-extension infrastructure (only SSR+SSAO matter here), clearcoat/sheen/iridescence/transmission branches.

---

## 4. Phase 2 — Diamond Rendering

### 4.1 Architecture

| Component | Identity | Source |
|---|---|---|
| Material | `DiamondMaterial` (`ll`), **`THREE.ShaderMaterial`** subclass, `typeSlug "dmat"`, `isDiamondMaterial` | `:57327` ✅ |
| Plugin | `DiamondPlugin` (`pl`, `PluginType "Diamond"`) | `:57603` ✅ |
| Normal/distance capture | `NormalsCapture` (`el`) + capture material (`tl`) | `:57027`, `:57105` ✅ |
| Shape alignment | `al()` PCA aligner, `nl()` fallback, `il/sl` volume/area | `:57123-57294` ✅ |
| glTF extension | `WEBGI_materials_diamond` (material) + same key on meshes (`cacheKey`, `normalMapRes`) | `:57897` ✅ |

It is **not** `MeshPhysicalMaterial` transmission, not `MeshRefractionMaterial`, not BVH ray tracing (no BVH, no triangle data in the shader) ✅. Everything the fragment shader knows about the stone's interior is a **single 512² × 6 half-float cubemap** (`tCubeMapNormals`) ✅ plus per-stone matrices.

**Per-material parameters** (defaults `ol`, `:57295`; runtime values for this scene):

| Parameter | Default | Runtime | Role |
|---|---|---|---|
| `refractiveIndex` | 2.4 | 2.42 | entry/exit Snell **and** internal refraction eta |
| `rayBounces` → `RAY_BOUNCES` define | 5 (ctor) | 6 | loop count; changing it recompiles |
| `dispersion` → `rIndexDelta` uniform | 0.012 | 0.004 | ±Δn for R/B exit rays |
| `absorptionFactor` | 1 | 1 | scales Beer–Lambert exponent |
| `color` (linear) | 1 | 0.7758 (`#e4e4e4`) | **absorption tint only** (not a surface colour; §4.3) |
| `boostFactors` | (0.892,0.892,0.986) | (2,2,2) | per-channel gain *and* per-bounce energy compensation |
| `gammaFactor` | 1 | 1.09 | `pow(rgb, γ)` on the linear result |
| `reflectivity` | 0.5 | 0.46 | scale of the surface reflection |
| `envMapIntensity` | 1 | 1.6 | exit and reflection env gain |
| `squashFactor` | 0.98 | 0.98 | Y-axis squash of the proxy sphere |
| `geometryFactor` | 0.5 | 0.5 | scales the proxy-sphere hit distance |
| `transmission` | 0 | 0 | screen-space "see-through" mix (unused here) |
| `diamondOrientedEnvMap` → `DIA_ORIENT_ENVMAP` | 0 | 0 | whether exit dirs are rotated by the stone's alignment matrix |
| `envMapRotationOffset` | 0 | 0 | extra Y rotation |
| `colorCorrection` | (1,1,1) | (1,1,1) | extra per-channel gain |

Compile-time: `RAY_BOUNCES=6, ENV_MAP_TYPE=1 (sampler2D equirect), DIA_ORIENT_ENVMAP=0, FIX_ENV_DIRECTION=1, PI=3.1428` ✅.

**Geometry-type variants** ✅: normal-map resolution (`normalMapRes`, 64–1024 via UI; 512 here), `cacheKey` so identical stone shapes share one cube RT (`_normalsCache`), and a fallback alignment `nl()` for meshes with > 1,500 position vertices (`position.count/3 > 500`, with a console warning, `:57207`).

### 4.2 Baking pass (outside the shader, once per distinct shape) ✅

`DiamondPlugin.prepareDiamondMesh` (`:57817`) → `_computeOffsets` (`:57872`) → `NormalsCapture.captureNormalMap` (`:57050`).

```text
_computeOffsets(geometry):
   center   = bbox.center
   A        = al(geometry)        // 4×4: columns = PCA eigenvectors of vertex cloud, then × boundingSphereRadius
   Ainv     = inverse(A)          // "offsetMatrixInv": model → canonical (unit-ish) frame
   centerOffset = Ainv · center   // canonical coords of the bbox centre
   radius   = 1

al(geometry):
   volume  = Σ triangle signed volumes;  if volume<0 → flip every vertex normal   // auto-fix inverted normals
   axes    = eigenvectors of vertex covariance (library module 654)
   flip axes 1 & 2 if (centreOfMass − bboxCentre) · axis2 < 0                      // disambiguate up/down
   return axes · scale(boundingSphere.radius)

captureNormalMap(geometry):
   rt = WebGLCubeRenderTarget(res×res×6, RGBA, HalfFloat, Nearest, no mips)       // createTargetCustom(:40952)
   mesh.geometry = geometry ; CubeCamera(near 1e-4, far 100, rt) at origin
   capture material:
      vNormal   = normalize( Ainv · normal )
      vecPos    = modelMatrix · Ainv · (position − center)
      out.rgb   = normalize(vNormal)·0.5 + 0.5
      out.a     = length(vecPos) / radius                    // distance from the centre, unit radius
   side = DoubleSide ; depth test keeps the NEAREST surface along each cube direction
```

The cube RT stores, for each direction `d` from the stone's centre: **surface normal (rgb)** and **distance (a)**. Rebuilt on `contextRestored`; shared across meshes by `cacheKey`; auto-disposed when its last geometry disposes (`:57088-57099`).

Runtime check ✅: stone `D5` cube RT = 512², `isWebGLCubeRenderTarget`, HalfFloat, RGBA, NearestFilter, 1 attached geometry; `normalsCaptureOffsets.radius = 1`.

Per-draw (`onBeforeRender`, `:57334`) ✅: sets `inverseModelMatrix = (object.matrixWorld)⁻¹`, `modelOffsetMatrix = matrixWorld · offsetMatrix`, `offsetMatrixInv`, `centerOffset`, `radius`, `envMapRotation = envMap.rotation + offset`, binds the geometry's cube RT texture to `tCubeMapNormals`.

### 4.3 Shader pipeline (verbatim logic, paraphrased) ✅

**Vertex** (`:57369`): `vWorldNormal = (modelMatrix · vec4(normal,0)).xyz` (⚠ not inverse-transpose; assumes uniform scale), `vWorldPosition`, `vViewPosition`, `vNormal`, `vUv`. Everything is **per-fragment** thereafter; nothing heavy is per-vertex.

**Fragment `main()`** (`:57371`):

```text
N       = normalize(vWorldNormal)                      // FACET normal (interpolated; requires flat normals)
V       = normalize(vWorldPosition − cameraPosition)   // incident direction (camera → surface)
f0      = ((2.4 − 1)/(2.4 + 1))² = 0.16955             // HARD-CODED 2.4, independent of refractiveIndex
R       = reflect(V, N)
Fr      = BRDF_Specular_GGX_Environment(R, N, f0, roughness=0)      // Karis DFG analytic, ρ=0
refl    = envMapIntensity · Env_reflect(R) · Fr · reflectivity · 2
refr    = getRefractionColor(vWorldPosition, V, N)
rgb     = (refr + refl) · 1.0                          // `diffuseColor` is literally vec3(1): material.color NOT multiplied
rgb     = pow(rgb, γ)
gl_FragColor = LinearToRGBM(rgb, 16)                    // via #include <encodings_fragment>
```

**`getRefractionColor(origin, dir, N)`**:

```text
att   = 1
d     = refract(dir, N, 1/n)                                   // Snell, entering: η = 1/n
att  *= 1 − Fr(d, −N, f0, ρ=0)                                 // Fresnel transmission at entry
d     = normalize( Ainv · M⁻¹ · d.xyz0 )                       // world → model → canonical (direction)
o     =              Ainv · M⁻¹ · origin.xyz1                  // … and position

for i in 0 .. RAY_BOUNCES−1:
    hit  = intersect(o, d)                                     // §4.4
    dist = hit − o
    c    = normalize(hit − centerOffset)
    Nm   = −normalize( cube(c).rgb·2 − 1 )                     // INWARD normal at hit
    att *= exp( −(|dist|/radius)·absorptionFactor·(1 − color) )  // Beer–Lambert, per channel
    o    = hit
    dOld = d
    d    = refract(dOld, Nm, n)                                // η = n/1 : leaving the dense medium

    if dot(d,d) < 1e-4:                                        // TIR (GLSL refract returned 0)
        d = reflect(dOld, Nm)
        if i == last:                                          // out of bounces: dump remaining energy
            out += EnvContribution(dOld) · att · colorCorrection · boost · (1 − Fr(−dOld, Nm))
    else:
        T    = 1 − Fr(d, −Nm, f0, 0)                           // transmitted fraction at exit
        d1   = normalize( mat3(modelOffsetMatrix) · d )        // exit dir back to world
        cosT = 1 − dot(dir, d1)
        if transmission>0 && cosT<transmission:
            out += SSMap(project(world(o)+0.5·d1·cosT)) · T · att · cc · boost
        else:                                                  // spectral exit
            d0 = d
            dR = refract(dOld, Nm, n + Δn)
            dB = refract(dOld, Nm, n − Δn)
            out += vec3( EnvC(dR).r , EnvC(d0).g , EnvC(dB).b ) · T · att · cc · boost
        d    = reflect(dOld, Nm)                               // continue inside
        att *= Fr(d, Nm, f0, 0) · boost                        // reflected energy, boost-compensated
```

(`cc` = `colorCorrection`, `boost` = `boostFactors`, `Δn` = `rIndexDelta` = `dispersion`.)

**Environment lookups** — two helpers with *different* conventions ✅:

```text
EnvReflect(dir):  [if FIX_ENV: dir = viewMatrix·dir]          sampleEnvMap(dir)·intensity
EnvC(dir):        [if DIA_ORIENT_ENVMAP<1: dir = mat3(modelOffsetMatrix)·dir]
                  [if FIX_ENV: dir = viewMatrix·dir]
                  dir = normalize(dir); dir.x *= −1; dir.z *= −1
                  sampleEnvMap(dir)·intensity
sampleEnvMap(dir): rotate (x,z) by envMapRotation about Y;  dir = −dir (all three components);
                   ENV_MAP_TYPE 0: textureCube(envMap, dir)
                   ENV_MAP_TYPE 1: texture2D(envMap, (atan(dir.z,dir.x)/2π + 0.5 , asin(dir.y)/π + 0.5))
```

Net effect: `EnvReflect` samples the *negated* direction; `EnvC` negates only **y** overall (x and z flip twice). Both look up with `texture2D` — **no mip/LOD, no prefilter**, bilinear only (`gem-000.hdr`, 512², HalfFloat, `minFilter LinearFilter`, no mipmaps) ✅.

### 4.4 Ray / stone intersection (`intersect`, `:57371`) ✅

Goal: the point where a ray starting at `o` along `d` (both in canonical space, origin inside the stone) leaves the stone surface, using only the cube map. Two-stage distance-impostor refinement:

```text
intersectSphere(o, d):                     // proxy ellipsoid
    o -= centerOffset ; d.y /= squash
    A = d·d ; B = 2·o·d ; C = o·o − radius²
    if B²−4AC > 0:   t = max( (−B+√Δ), (−B−√Δ) ) · geometryFactor / A     // far root × 0.5 !!
                     d.y *= squash ; return o + centerOffset + d·t
    else return (0,0,0)

intersect(o, d):
    p0   = intersectSphere(o,d)
    c1   = normalize(p0 − centerOffset)
    (n1, r1) = cube(c1)   → plane P1 = { point centerOffset + c1·r1·radius ; normal −normalize(n1·2−1) }
    p1   = rayPlane(o, d, P1)
    c2   = normalize(p1 − centerOffset)
    (n2, r2) = cube(c2)   → plane P2
    return rayPlane(o, d, P2)             // two Newton-like refinements
```

So each bounce uses **3 cube fetches** (2 in `intersect`, 1 for `Nm`). Quality depends on: the stone being (nearly) **star-shaped/convex about its centre**, and the proxy hit being close enough to converge. For a convex round-brilliant, two refinements land on the correct facet in most rays; wrong facet selection near facet edges produces the characteristic noisy "facet pop" at grazing rays 🔶. `geometryFactor = 0.5` biases the initial guess to the *interior* (half of the far-hit distance) rather than the far surface 🔶.

### 4.5 Optics maths and mapping to code

| Concept | Equation | Code behaviour |
|---|---|---|
| Snell (vector form) | `T = η I − (η(N·I) + √(1 − η²(1−(N·I)²))) N` | GLSL `refract(I, N, η)`; entering η = 1/n; exiting η = n |
| TIR | radicand < 0 ⇒ `refract` returns 0 | detected as `dot(d,d) < 1e-4`; critical angle asin(1/2.42) ≈ 24.4° → most internal hits are TIR ✅ |
| Fresnel | Schlick-style: `F = f0·A(μ) + B(μ)` (Karis DFG at ρ=0): `a = min(1, 2^(−9.28μ)) + 0.0425; A = 1.04(1−a); B = 1.04a − 0.04` | `BRDF_Specular_GGX_Environment`; F(μ=1) ≈ 0.174, grazing ≈ 1.037 (no clamp ⇒ `1−F` can go slightly **negative**) 🔶 |
| Reflection | `R = I − 2(N·I)N` | `reflect()` |
| Absorption (Beer–Lambert) | `T(λ) = exp(−κ·(d/R)·(1 − color_λ))` | `color`=0.7758 ⇒ σ = 1−0.7758 = 0.224 per canonical unit (1 unit = bounding-sphere radius), so a 1-radius chord keeps ≈ 80 % and a 2-radius chord ≈ 64 % per channel at κ=1 (path lengths themselves were not measured) |
| Dispersion | different `n` per channel | **only** at each bounce's exit ray: `n+Δn` → R, `n` → G, `n−Δn` → B. Note the sign: physically blue has the *higher* index, here red gets it 🔶 (inverted spectral order; may be intentional/arbitrary) |
| Energy | transmitted = `1−F`, reflected = `F` | explicit at each interface; reflected path multiplied by `boost` each bounce → effectively boosts internal light by `2^k` for `boost=2` 🔶 |

### 4.6 What is per-vertex / per-fragment / outside the shader

| Stage | Work | Where |
|---|---|---|
| Outside shader (once/shape) | PCA alignment, volume/normal fix, cube bake, matrices | JS + one 6-face draw |
| Outside shader (per draw) | upload 4 matrices, cube texture, env rotation | `onBeforeRender` |
| Per-vertex | transform, pass world normal/position | VS (trivial) |
| Per-fragment | everything else: ~`3·B` cube fetches + up to `3·B` env fetches + 1 reflection fetch (B = bounces); 3× `refract` + 1 `reflect` + 1 `exp` per bounce | FS |

### 4.7 Geometry dependency ✅🔶

| Requirement | Why | Evidence |
|---|---|---|
| **Closed / watertight** | signed volume (`il`) decides inside/outside; bake uses nearest hit from the centre | ✅ volume check + normal auto-flip (`:57252`) |
| **Outward-facing normals** | wrong sign ⇒ inverted refraction; plugin repairs negative total volume by negating all normals | ✅ |
| **Flat per-facet normals** | entry refraction uses interpolated `vWorldNormal`; the bake interpolates `vNormal` inside each triangle — smooth normals would blur facets | 🔶 (stones: 644 verts/318 tris ⇒ split vertices) |
| **Star-shaped about bbox centre** | the cube stores **one** distance+normal per direction | ✅ (structure) 🔶 (consequence): overhangs/inclusions are lost |
| Reasonable vertex count | `al()` falls back to `nl()` (normals-based) when `position.count/3 > 500` | ✅ |
| Consistent scale | `vWorldNormal` ignores non-uniform scale | ✅ |
| Same shape ⇒ same `cacheKey` | share the cube | ✅ |
| Symmetry | PCA axes ambiguous for round shapes; compensated by transforming exit directions back via `modelOffsetMatrix` when `DIA_ORIENT_ENVMAP=0` | 🔶 |

Complexity: cost is **independent of triangle count** at shading time (the mesh only provides silhouette + entry normal); cost is proportional to covered pixels × bounces.

### 4.8 Environment & lighting for diamonds ✅

- A **separate environment** is used: `DiamondPlugin.getEnvMaps()` returns `[envMap, envMap2, envMap3]` (or the scene env ×3 if `forceSceneEnvMap`); in this app `index.html` sets `viewer.plugins.Diamond.envMap = gem-000.hdr`, material `envMapIndex 0`.
- Sampled **un-prefiltered, bilinear, with `texture2D`** → the resolution of the HDR (512²) directly controls the sparkle sharpness and aliasing; bright pixels in `gem-000.hdr` become the bright flashes ("fire" colour comes from per-channel dispersion sampling the same map with slightly different directions).
- **No scene lights, no shadows, no SSR/SSAO** affect the stone shader; it is image-based only. It does write into the GBuffer (depth/normal/flags via the override material), so other effects see it.
- Environment is `FIX_ENV_DIRECTION` (camera-fixed) exactly like the metal ✅.
- Env brightness: `envMapIntensity 1.6` plus `boost`/`gamma`; transmission/`transmissionSamplerMap` path unused (transmission 0) — note the GLB's own `D1` has `transmission:1, RI 2.6, colour red, 5 bounces`, which `index.html` overwrites with `setGem('white')`.

### 4.9 Visual-effect attribution & measurements ✅

Mean 8-bit sRGB over a 200×200 box centred on the large centre stone (`D5`), 34-frame convergence each:

| Change | Stone mean RGB | Reading |
|---|---|---|
| baseline | 194.2 / 187.5 / 176.6 | |
| `rayBounces` 1 | 190.5 / 187.4 / 180.6 | single-bounce looks bluer/cooler; deeper light paths add warm/neutral energy |
| `rayBounces` 3 | 191.6 / 185.7 / 175.4 | |
| `rayBounces` 10 | 192.4 / 185.5 / 174.4 | converges; >6 changes little |
| `dispersion` 0.03 | 195.9 / 188.1 / 176.6 | mean barely moves (it redistributes hue, not energy) |
| `gammaFactor` 1.0 | 197.2 / 190.2 / 179.0 | γ>1 darkens/contrasts |
| `boostFactors` 1 | 160.8 / 155.0 / 144.3 | **−17 %** brightness: boost is a major brightness control |
| `reflectivity` 0 | 175.7 / 169.4 / 158.3 | surface reflection ≈ +10 % |
| `absorptionFactor` 6 | 94.8 / 88.3 / 78.2 | **−51 %**: strongest darkening control |
| `refractiveIndex` 1.5 | 206.8 / 200.2 / 190.5 | lower n ⇒ fewer TIR, more leaks ⇒ more bright, less "dark facets" |

Performance (hidden pane, one GPU, `readPixels` sync; indicative only) ✅: whole frame 7.05 ms avg; 45 stones hidden 5.49 ms (stones ≈ 22 %); `rayBounces` 1: 4.89 ms vs 12: 6.62 ms. Stones cover few pixels here — cost scales with screen coverage, so zooming in raises it. `renderer.info`: 27 textures, 61 geometries, 49 programs.

**Per-fragment texture fetches at 6 bounces ≈ 6×3 cube + ≤6×3 env + 1 ≈ 37** ✅ (derived from source). Mobile: the loop is fixed-length (`RAY_BOUNCES` define); the only dynamic early-out is none, so low-end devices should reduce `rayBounces` and `normalMapRes` and the render scale 🔶.

### 4.10 Quirks a faithful rebuild must decide on (✅ in code, 🔶 meaning)

1. `f0` uses a literal `2.4`, ignoring `refractiveIndex` (changing RI does not change Fresnel).
2. `#define PI 3.1428` (not 3.14159) — only used in `cartesianToPolar`, producing a ≈0.04 % u/v skew.
3. `color` is only an absorption tint; surface/refraction is not multiplied by it.
4. `colorCorrection` and `boostFactors` multiply outputs *and* `boost` compounds per bounce inside `attenuationFactor`.
5. Dispersion sign inverted vs physics; applied only at exit.
6. Env sign conventions differ between reflection and contribution lookups (§4.3).
7. `vWorldNormal` not normal-matrix-corrected.
8. `1−F` can be negative at grazing angles (no clamp).
9. TIR on the *final* bounce samples the environment along the incoming direction `dOld` rather than the reflected one.
10. Non-2:1 equirect (`512×512`) is accepted as-is; the content is authored for it.

### 4.11 Proposed independent diamond architecture

```text
          (offline/at load)                                (per frame, per stone)
 mesh ─► [validate: closed, volume>0, flat normals]                 ┌───────────────────────────┐
      ─► [PCA align + scale to unit sphere]──► offsetMatrix ───────►│ uniforms: M⁻¹, A⁻¹, A·M,  │
      ─► [bake 6 faces: rgb=normal, a=dist]──► distCube (RGBA16F)──►│ centerOffset, n, κ, color,│
                                                                    │ Δn, boost, γ, bounces     │
 gem HDR ──► float16 2D (equirect) ─────────────────────────────────►│ envGem (bilinear)         │
                                                                    └──────────┬────────────────┘
                                                      fragment: entry refract → loop{intersect via cube, absorb,
                                                      refract/TIR, Fresnel split, dispersed env sample} → +surface reflect
```

Design decisions (recommended):

- Keep the **distance-cube** approach (cost independent of facet count, proven look). Make the stone data a first-class asset: `{distCube, A, A⁻¹, centreOffset}`.
- Expose `n` consistently (use it in `f0` too); make dispersion physically ordered; clamp `1−F`; use a proper normal matrix. Keep switches (`legacyCompat`) to reproduce the current look for A/B validation.
- Replace `PI 3.1428`, make env conventions explicit in one function `sampleGemEnv(dir)`.
- Optionally add a `mip bias` / pre-blurred second env for far-field to reduce aliasing at small sizes.
- Bounce count as specialization constant per quality tier; interleave bounces across jittered frames (the accumulation buffer makes this cheap) as an advanced optimization.
- Validation: reproduce the numbers in §4.9 within ±3 levels with `legacyCompat` on.

---

## 5. Phase 3 — Complete Scene Setup and Rendering Pipeline

### 5.1 Initialisation sequence (app → engine) ✅

```text
index.html
 ├─ new ViewerApp({canvas, useRgbm:true})                                  (:50773)
 │    ├─ RootScene(camera Ds{fov 25})   background colour #ffffff
 │    ├─ BaseRenderer: WebGLRenderer{antialias:false, alpha:true, premultipliedAlpha:true,
 │    │       preserveDrawingBuffer:true, powerPreference:high-performance}      (:40765)
 │    │       toneMapping=None, outputColorSpace=NoColorSpace, shadowMap{PCF, autoUpdate:false}
 │    │       composerTarget = RGBA8, colorSpace "rgbm-16", no MSAA, depth NOT attached (uses GBuffer depth)
 │    └─ passes "render", "screen"; pipeline=["render","screen"]
 ├─ addPlugin(AssetManagerPlugin)                                           importer/exporter/processors
 ├─ addBasePlugins(viewer)                                                  (export alias of `Ng`, :69604) → 41 plugins in total at runtime:
 │      GBuffer, FullScreen, Progressive(32), CombinedPost, ChromaticAberration, Tonemap(depth-aware),
 │      LUT, Vignette, FilmicGrain, GammaCorrection, SSReflection, SSAO, Diamond, FrameFade, GLTFAnimation,
 │      Anisotropy, TriplanarUV, ThinFilm, FragmentClipping, NoiseBump, CustomBump, ClearcoatTint,
 │      MaterialVariants, VelocityBuffer(off), TAA, CameraViews, RandomizedDirectionalLight, HDRiGround,
 │      DepthOfField(off), SSContactShadows(off), SSGI(off), NormalBuffer, SSBevel, KTX2, Ground, Bloom, …
 ├─ renderer.refreshPipeline()                                              topological sort (:40675)
 ├─ AssetManager.addFromPath("Ring_v1.glb")                                 → applies embedded WEBGI_viewer config
 │       (env, tonemap ACES, SSAO, bloom, camera controls …) then diamond processor runs for each node
 ├─ importSinglePath(designer-scene.vjson)                                  → overrides plugin settings
 ├─ import gem-000.hdr   → Diamond.envMap ;   import lightmap-r-2b.hdr → scene.environment
 └─ app-level tweaks: ground, controls, SSR/SSAO, whiten D4xxx/D5, setGem/setMetal, camera intro
```

Graphics API: **WebGL2** (`isWebGL2 true`), no WebGPU ✅. Extensions present at runtime: `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `OES_texture_float_linear`, `EXT_float_blend` ✅.

### 5.2 Scene, camera, controls ✅

- `RootScene` (`:42735`) extends `THREE.Scene`; holds `modelRoot` (`"Scene"`), default camera, env, background, `envMapIntensity`, `fixedEnvMapDirection`, bounds + bounding radius (used by SSR/SSAO uniforms). All meshes get `castShadow = receiveShadow = true` on add (`:42828`).
- Camera: `scene.activeCamera` is the wrapper class `gt` (`:42350`); its `cameraObject` is a `PerspectiveCamera` subclass (runtime constructor name `Ds`), fov 25°, aspect = canvas aspect, **near/far recomputed every update** from scene bounds (`refreshActiveCameraNearFar`, `:42933`): `near = max(0.2, cosθ·(dist − 1.5·halfDiag))`, `far = min(max(near+1, cosθ·(dist + r)), 1000)` → runtime near 1.635 / far 19.19 for a camera at (−6.51, 7.65, −2.74) looking at the origin.
- Controls: orbit-style with damping 0.08, `rotateSpeed 2`, `minDistance 6.5`, `maxDistance 15.6`, polar clamp [−0.001, π/2], pan enabled (`index.html` + engine). Controls are updated in `postFrame`.
- Coordinate system: right-handed, Y-up (Three). Model scale: the oversize guard in `index.html` scales ×0.1 if bbox ≥ 5.
- Camera **jitter**: Progressive calls `setViewOffset` with a 17-entry sub-pixel table (`za`, `:52389`) each frame after frame 1, also for shadow cameras; cleared in `postRender` ✅.

### 5.3 Frame loop ✅

```text
ViewerApp._animationLoop (:50922)  [driven by renderer.setAnimationLoop]
  if _needsReset: renderer.reset() → frameCount = 0
  if _needsResize: renderer.setSize(clientW, clientH)   // pixelRatio = displayCanvasScaling (1.5)
  dispatch preFrame; collect dirty plugins → setDirty
  if renderer.dirty:
       dispatch preRender   ← Progressive jitter (frame>1)
       renderer.render():   (:40877)
            for each pass: pass.update()
            composer.render()      // passes in pipeline order
            frameCount++
       dispatch postRender  ← clear jitter
  dispatch postFrame        ← camera controls update, recorder hooks
```

The viewer **only redraws when dirty**: after camera/material change it renders until `Progressive.isConverged` (32 frames); then the GPU idles ✅.

### 5.4 Render pass pipeline (runtime-verified) ✅

`viewer.renderer.pipeline` at runtime:

```text
gbuffer → ssrtgi(off) → ssr → ssao → velocityBuffer(off) → normalBuffer → ssBevel
        → render → frameFade → depthOfField(off) → taa(taaEnabled=false) → progressive → bloom → combinedPost
```

Order is solved from each pass's `after/before/required` lists by `refreshPipeline()` (`:40675`); cycles throw `"Cyclic dependency"`.

| Pass | Class / line | Inputs → outputs | Notes |
|---|---|---|---|
| **gbuffer** | `Ft` `:43522`, material `Pt` `:43284` | scene → MRT RGBA8 ×2 + depth | RT0: `xy = pack16(√linearZ)`, `zw = packNormal(n)`; RT1: flags (`z = matId/255`, `w` bit1 = "participates in tonemap"). Depth renderbuffer is **reused by the main pass** (`framebufferRenderbuffer` hack, `:43237`) so the colour pass has a free depth prepass |
| ssr | `Uc` `:56161` | – | Inline SSR is in the material (`SSR_INLINE=1`); what this pass still does when inline is ❓ |
| **ssao** | `Ia` `:51899` | GBuffer → AO map | SAO-style: 11 taps, 3 spiral turns, per-pixel angle random (`frameCount`), `ao = max((N·d + z·bias)/(falloff·d² + ε), 0)`; intensity 0.1, radius 1, bias 0.001, falloff 1.6 |
| normalBuffer / ssBevel | `yc` / `uh` | – | present & enabled; SSBevel disabled in GLB config (`ssbevelEnabled:false`); internals ❓ |
| **render** | `Nt` `:43607` | scene → `composerTarget` (RGBM) | sub-phases: ① shadows + background + opaque; ② transparent into a separate half-float RT then alpha-blended (`It` blend pass); ③ transmission pass; `needsSwap` managed |
| frameFade | `Va` `:52509` | – | cross-fade on scene/material/camera updates (`fadeOnSceneUpdate` disabled by the app) |
| taa | `Jp` `:60780` | – | enabled but `taaEnabled:false` ❓ unused |
| **progressive** | `Ga` `:52408` | frame + `lastFrame` → blended | **running mean**: `out = (1/(n+1))·cur + (1 − 1/(n+1))·last`, 32 frames, jitter table 17 entries; result copied to `lastFrame` (also the SSR history) ✅ |
| **bloom** | `Ra` `:52006`, `Da` `:52151` | frame → frame + glow | dual-filter pyramid (§5.5) |
| **combinedPost** | `oa` `:51293`, `aa` `:51262` | frame → screen | decode RGBM → ACES → contrast → saturation → sRGB → premultiply (§5.6). Disables the default `screen` pass |

### 5.5 Post-processing, verified order & parameters ✅

- **Bloom**: 4 iterations on half-float temp targets (first at ½ res: 768×576). `Prefilter`: soft-knee threshold with `x = threshold (2.0)`, `y = softThreshold (0.03)`, `z = 2xy`, `w = 0.125/(z+1e-5)`; early exit for background (depth > 0.999). Down-sample with 4-tap box (`SampleBox(delta 1)`), up-sample additively (`delta 0.5`, additive blend), weights from `radius 0.6 / power 1`, final `texel += intensity(0.36)·bloom`, `alpha += max(bloom)`. Threshold 2.0 means only HDR highlights > 2 (e.g., diamond flashes) bloom.
- **Active vs inactive post effects** (runtime compiled `combinedPost` shader contains only tonemap+sRGB): Chromatic aberration, LUT, Vignette, Film grain and the standalone Gamma plugin are **enabled as plugins but inactive in the final shader** (`USE_LUT=0`, no vignette/grain code). Depth of field, SSGI, TAA, velocity are off ✅.
- **Anti-aliasing**: no MSAA (`antialias:false`, `samples 0`); AA comes entirely from sub-pixel jitter + accumulation (32 samples of the 17-point pattern) ✅.

### 5.6 Final tonemap/OETF (`combinedPost` fragment, dumped at runtime) ✅

```text
c      = RGBMToLinear(texture(tDiffuse), 16)
c     *= opacity
doTM   = gbufferFlags.a bit1   &&   !(depth>0.99 && transparent.a<0.001)      // background excluded (tonemapBackground=false)
if doTM:
    c = ACESFilmic(c)                       // Three r152 ACES: c·exposure/0.6 → ACESInputMat → RRTAndODTFit → ACESOutputMat → saturate
    c = (c − 0.5)·contrast + 0.5            // contrast 1.12
    c = mix(luma(c), c, saturation)         // saturation 1.0, luma weights (0.2125,0.7154,0.0721)
if depth < 1e-5: alpha = 0
out    = LinearTosRGB(c)  ·premultiply α     // piecewise sRGB OETF
```

Config (✅ runtime): `toneMapping = ACESFilmic (4)`, `exposure = 1`, `contrast = 1.12`, `saturation = 1`, `tonemapBackground = false`. Because the tonemap is a **screen-space pass driven by GBuffer flags**, every material (gold, diamond, ground) shares it, and any material can opt out via `userData.postTonemap = false`.

### 5.7 Lighting architecture & relation to the two materials ✅

```text
                      ┌────────────── scene.environment (lightmap-r-2b.hdr) ───┐
                      │  PMREM cubeUV (768×1024 HF)                            │
 Gold (MeshPhysical)  │  ► getIBLRadiance / getIBLIrradiance (rot Y, FIX_ENV)  │  + 1 directional + shadow
                      └────────────────────────────────────────────────────────┘
 Diamond (Shader)       gem-000.hdr  (512² HF, sampler2D, bilinear)  ► per-bounce exit samples (+1 reflection)
 both: scene.fixedEnvMapDirection = true   (environment attached to camera)
 both: write linear HDR via LinearToRGBM(·,16);  tonemap/OETF later and identically
```

- Only the **gold** (and ground) receives the directional light/shadows/SSR/SSAO. The **diamond** ignores lights entirely.
- There is no shared "light manager" abstraction beyond Three's `WebGLLights`; sharing is via (1) `scene.environment`, (2) `scene.envMapIntensity` / `fixedEnvMapDirection`, (3) GBuffer, (4) RGBM encode/decode.
- Ground (`Ug` `:69336`): `MeshPhysicalMaterial` (`BaseGroundMaterial`, metalness 0.5, roughness 1, `transparent:true`) with a **shadow baker** (`groundMapMode "map"`, `autoBakeShadows true`) so the ring's soft contact shadow is baked/accumulated onto an otherwise white background; reflections off (`groundReflection=false` in `index.html`) ✅; baker internals ❓.

### 5.8 Texture & resource management

| Topic | Finding | Tag |
|---|---|---|
| HDR formats | Radiance `.hdr` via Three RGBELoader → half-float RGBA; EXR loader plugin exists (unused) | ✅ |
| Colour spaces | env `srgb-linear`; scene buffers `rgbm-16` (custom string; helpers `E/S/T` generate `…TexelToLinear` GLSL, `:39264-39301`); GBuffer `NoColorSpace` | ✅ |
| Mips / filtering | env equirect: Linear, no mips. PMREM: built by Three. Cube normal map: **Nearest, no mips**. Targets: Linear unless specified | ✅ |
| Render-target pool | `getTempTarget/releaseTempTarget` keyed by options; `maxTempPerKey = 5` (`:41002-41017`); bloom/transparent/DoF use it | ✅ |
| Tracked targets | `createTarget` registers sizeMultiplier targets; resized on `setSize` | ✅ |
| Cache | `NormalsCapture._normalsCache` keyed by `cacheKey;geometryUUID`; `AssetManager` can use `caches.open("webgl-cache-storage")` only via `Fg.initialize` (not used here) | ✅ / ❓ |
| Disposal | cube RT auto-disposed on last geometry dispose; context-restore listeners rebuild normal caches (`contextRestored`) | ✅ |
| Memory (indicative) | 27 textures, 61 geometries, 49 programs; full-res RGBA8 ≈ 7.1 MB (1536×1152×4 B); GBuffer ×2 + depth; Progressive `lastFrame` clone; bloom pyramid half-float; env PMREM 768×1024 HF ≈ 6.3 MB; each diamond cube 512²×6×8 B ≈ 12.6 MB (shared per `cacheKey`) | 🔶 (arithmetic, not measured) |

### 5.9 Performance, fallbacks, devices

- Resolution scale: `displayCanvasScaling = QUALITY (1.5)` (set in `index.html`) — *over*-samples a 1.0 DPR display; default engine value 1 ✅.
- No MSAA, accumulation-based AA, redraw-on-demand ⇒ idle after 32 frames ✅.
- Half-float fallback: transparent target uses `HalfFloat` only if `EXT_color_buffer_half_float`, else `UnsignedByte` (`:43615`); samples forced to 0 on WebGL1 (`:40928`) ✅. RGBM storage exists precisely to avoid needing float colour attachments 🔶.
- Programs: 49 compiled at runtime (material variants, passes). Draw calls: 46 meshes (no instancing/batching) — 45 stones with 3 diamond materials ✅.
- Mobile behaviour: not tested ❓. Costs to watch: 79 KB gold fragment shader + SSR loop, up to ~37 fetches/pixel for stones, 1536×1152 targets, 5–6 MRT/RGBA8 + half-float buffers.

### 5.10 How the two materials integrate (summary)

1. Both are normal scene meshes in `RootScene`; the app assigns materials after load (`setMetal`, `setGem`, whitening via `makeDiamond`).
2. GBuffer pass draws **everything** with an override material (depth/normals/flags), so SSAO/tonemap-masks/bloom see both.
3. The **render** pass draws gold with the patched physical shader (reads SSAO map, last frame, GBuffer depth) and diamonds with the custom shader (reads cube-normal map + gem env).
4. Both outputs are RGBM-16 linear HDR into the same target; the **diamond's `boost/gamma/envIntensity` were tuned against the later ACES curve**, so the same tonemap must be reproduced for the same look.
5. Progressive accumulation smooths stochastic SSR, SSAO and jitter for the gold and edge anti-aliasing for both.

---

## 6. Comparison of Existing and Proposed Implementations

| Area | Existing (WebGi 0.8.0 / Three r152 patched) | Proposed independent engine | Why |
|---|---|---|---|
| Graphics API | WebGL2 via Three | WebGL2 first (own thin renderer), optional WebGPU backend later | feature parity today, simplest deployment |
| Metal BRDF | stock r152 physical | same equations, own GLSL; DFG LUT instead of analytic fit optional | identical look, cheaper to audit |
| IBL | Three PMREM (cubeUV atlas) | own equirect→cube→GGX-prefilter (mip chain) + SH9 diffuse | removes dependency; cubeUV atlas not required |
| Env orientation | `FIX_ENV_DIRECTION` define + Y-rotation | single `envFrame` matrix uniform (view/world) | cleaner, no recompiles |
| Diamond | custom ShaderMaterial + distance-cube | same technique, cleaned conventions, `legacyCompat` mode | proven look; keep A/B ability |
| Colour pipeline | RGBM-16 8-bit everywhere | RGBA16F where available, RGBM fallback behind one `encode/decode` interface | quality + mobile fallback |
| Post stack | ordered pass registry w/ topological sort | explicit frame graph (nodes + resources) | easier lifetime/aliasing of targets |
| SSR/SSAO injection | string patching of Three shader | first-class material hooks (named snippet slots) | maintainable |
| AA | jitter accumulation (32 fr) | same (+ optional TAA reprojection later) | keep stability |
| Tonemap | ACES (Hill fit) + contrast + sat + sRGB, GBuffer-flag masked | same, flag in a 1-bit mask | identical |
| Shadows | PCF 1024² directional + ground baker | same first; baker as accumulation of N jittered shadow renders | |
| Extensibility | plugin classes + glTF extensions | plugin interface + same glTF extension schema (`WEBGI_*` → neutral names) | |
| Licensing | proprietary SDK + MIT Three | all own code + MIT/Apache deps | independence |

---

## 7. Proposed Custom Rendering Engine Architecture

### 7.1 Recommendation

Build it in **two layers so risk stays low**:

1. **Engine core (own code, WebGL2):** resource manager, frame graph, material system, glTF loader. 
2. **Feature modules (ported from this analysis):** `MetalPBR`, `Diamond`, `IBL`, `Post(AO, SSR, Bloom, Accum, Tonemap)`.

If the real constraint is *"don't depend on the WebGi bundle"* (licence), use stock open-source **Three.js (MIT) as the base for milestone M1** (it already gives the physical shader, PMREM, loaders) and implement only the parts that were WebGi-specific (diamond, SSR/SSAO hooks, RGBM pipeline, accumulation, ACES pass). Move to a bespoke WebGL2 backend only if you need to drop Three too. The document and pseudocode apply to either.

### 7.2 Module diagram

```text
 App ─► Engine
        ├─ Platform      (canvas, context, extensions, device caps, resize, rAF-on-demand)
        ├─ Resources     (Texture/Buffer/RT pool, ref-count, context-restore, KTX2/HDR/GLB loaders)
        ├─ Scene         (nodes, transforms, bounds, lights, camera+controls, env state)
        ├─ MaterialSys   (shader library, snippet hooks, variants/defines cache)
        │     ├─ MetalPBR       (§3)
        │     └─ DiamondMat     (§4) ◄── DiamondBaker (PCA + cube bake) ◄── validator
        ├─ IBL           (equirect→cube→prefilter, SH9, rotation/frame)
        ├─ FrameGraph    (passes declare reads/writes; auto RT allocation)
        │     G-Buffer → AO → Shadow → Opaque(RGBM/F16) → Accum → Bloom → Tonemap/OETF
        └─ Tools         (debug views, golden-image harness, GPU timers)
```

### 7.3 Frame execution (target)

```text
if (!dirty && accumFrames ≥ N) idle
jitter(camera, shadowCams, frame)
GBuffer pass   → depthNormal (RGBA8) + flags (RGBA8) + shared depth
AO pass        → aoTex
Shadow pass    → shadowMap (jittered)
Colour pass    → hdr (RGBA16F | RGBM16)   [Metal: IBL+dir+SSR(prevFrame)+AO ; Diamond: distCube+gemEnv]
Accum pass     → blend(hdr, history, 1/(n+1)) → history
Bloom pass     → pyramid, additive
Final pass     → decode → ACES(exposure) → contrast → sat → sRGB → present
```

### 7.4 Interfaces (sketch)

```ts
interface Material { vertex(): string; fragment(): string; hooks: Record<HookSlot,string>; bind(ctx: DrawCtx): void; }
interface IBL { specularCube: Tex; irradianceSH: Vec3[9]; frame: "view"|"world"; rotationY: number; intensity: number; }
interface DiamondAsset { distCube: Tex; offsetMatrix: Mat4; offsetInv: Mat4; centerOffset: Vec3; radius: 1; }
interface Pass { reads: ResId[]; writes: ResId[]; exec(ctx): void; }
```

---

## 8. Implementation Roadmap and Dependencies

| Milestone | Deliverable | Validation | Rough effort |
|---|---|---|---|
| M0 | Golden-image harness: capture this viewer's converged frame for 6 fixed cameras + the numbers in §3.9/§4.9 | pixel-diff tool | 1–2 d |
| M1 | Loader (GLB incl. `WEBGI_*` extension parsing, RGBE) + scene + camera/controls | model renders unlit | 3–4 d |
| M2 | IBL (equirect→GGX cube, SH9) + MetalPBR + direct light + PCF shadow | gold mean within ±4/255 of §3.9 baseline (no SSR/SSAO) | 5–7 d |
| M3 | Output pipeline: RGBM/F16 target, ACES+contrast+sat+sRGB final pass, GBuffer flags | matches §3.6/§5.6 | 3 d |
| M4 | DiamondBaker + DiamondMat (`legacyCompat`) | stone mean within ±4 for all rows in §4.9 | 7–10 d |
| M5 | AO (SAO) + SSR (stochastic GGX, 16 steps, history) | gold deltas of §3.9 "SSR off/SSAO off" reproduced | 5–7 d |
| M6 | Accumulation + jitter (32 frames) + Bloom (4-level, thresholds) | converged diff vs golden < noise floor | 3–4 d |
| M7 | Ground shadow baking + background/alpha handling | contact shadow parity | 3–4 d |
| M8 | Perf tiers (mobile): half-res AO/SSR, bounces 3–4, cube 256, no bloom, F16/RGBM fallback | frame-time budget | 4–5 d |
| M9 | Cleanup of quirks (physically-ordered dispersion, `f0` from RI, normal matrix) behind a "modern" switch | designer sign-off | 2–3 d |

**Dependencies**: WebGL2 (+ `EXT_color_buffer_float`/half-float; RGBM fallback), glTF 2.0 parser (own or MIT), Draco/meshopt/KTX2 decoders if assets use them (this GLB does not), eigen-decomposition (≈50 lines for 3×3 covariance; the bundle uses an embedded module 654), RGBE decoder (≈80 lines), pixel-diff test tooling, optional `three` (MIT).

**Licensing caution** ❓: the bundle's licence text is not in the repo. The `WEBGI_*`-prefixed code appears to be a commercial SDK; Three.js (MIT) portions are free to reuse with notice. This document describes behaviour and mathematics for an independent implementation; it deliberately paraphrases rather than copies shader source. Have the licence terms of the original SDK reviewed before relying on any of its distributed code or assets (including `Ring_v1.glb`'s embedded extension data and the `.hdr` files).

---

## 9. Open Questions and Unverified Areas

| # | Item | Why it matters |
|---|---|---|
| 1 | What the standalone `ssr` pass renders when `SSR_INLINE=1` | possible wasted pass |
| 2 | `FrameFade`, `TAA`, `VelocityBuffer`, `SSBevel`, `NormalBuffer` internals | only existence/enabled-state verified |
| 3 | `RandomizedDirectionalLight` and the intensity-10 layer-32 light; Ground shadow baker algorithm | shadows/ground parity |
| 4 | `ThinFilmLayerPlugin` extension on the diamond material (extra `thin*` uniforms exist, factors = 0) | unused here; documented only by uniforms |
| 5 | Camera/controls class `gt`/`Ds` details (inertia, zoom maths) | feel parity |
| 6 | Mobile/low-end behaviour; GPU time breakdown (only CPU+sync timing measured, hidden pane) | tier design |
| 7 | Whether `PI = 3.1428`, hard-coded `2.4`, inverted dispersion, per-bounce `boost` compounding are intentional | decides whether to keep `legacyCompat` |
| 8 | Why `SSAO` samples `viewToScreen(vViewPosition)` where `vViewPosition = −mvPosition` | possible sign quirk; visual impact small (intensity 0.1) |
| 9 | Exact behaviour with `transmission > 0` (screen-space see-through) | unused in this app |
| 10 | Draco/KTX2/meshopt paths; GLB/`vjson` preset merge order details | asset pipeline |
| 11 | Original SDK licence terms | legal |
| 12 | Whether the diamond cube bake is sensitive to the *aligned* axis for non-symmetric stones (only round stones in this model) | generality |

Additional notes on method limits: the runtime experiments sample mean colour over rectangular regions; they demonstrate *direction and magnitude* of effects but are not substitutes for the golden-image harness proposed in M0.

---

## 10. Technical References

**Source locations** (prettified bundle, see header for regeneration): Three r152 `:11433`; ShaderChunk `encodings_fragment` `:18375`; PMREM/CubeUV maps `:19470`, `:19895`; colour helpers `:39263-39301`; render-phase flags `L()` `:39374`; BaseRenderer `:40641`; `refreshPipeline` `:40675`; RootScene `:42735`; MaterialExtension `:43000`; GBuffer `:43284`, `:43522`; Render pass `:43607`; MeshStandardMaterial2 `:43902`; ViewerApp `:50760`; CombinedPost `:51293`; Tonemap `:51435`, ACES/Uncharted patch `:51613`; SSAO `:51899`; Bloom `:52006`; Progressive `:52408`; SSReflection `:56161`; NormalsCapture `:57027`; capture material `:57105`; alignment `:57123-57294`; DiamondMaterial `:57327`; DiamondPlugin `:57603`; Ground `:69336`; `addBasePlugins` (`Ng`) `:69604`.

**Runtime probes used:** `viewer.renderer.pipeline`, `renderer.rendererObject.properties.get(material).currentProgram`, `getAttachedShaders/getShaderSource`, `material.uniforms/defines`, `scene.environment`, `geometry.userData._normalsCaptureMap`, `renderer.info`.

**Published techniques that the implementation matches** (my identification; the bundle cites none):

- Karis, *Real Shading in Unreal Engine 4* (SIGGRAPH 2013) — GGX, Schlick, split-sum, analytic DFG fit.
- Heitz, *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* (JCGT 2014) — height-correlated Smith.
- Fdez-Agüera, *A Multiple-Scattering Microfacet Model for Real-Time Image-based Lighting* (JCGT 2019).
- Kaplanyan / Tokuyoshi — specular anti-aliasing via normal-derivative roughness.
- Hill (RRT+ODT fit) and Narkowicz — ACES filmic approximations; Three.js `ACESFilmicToneMapping`.
- McGuire & Mara, *Efficient GPU Screen-Space Ray Tracing* (JCGT 2014); Jimenez, *Interleaved Gradient Noise* (SIGGRAPH 2014, CoD:AW).
- McGuire, Osman, Bukowski, Hennessy, *The Alchemy Screen-Space Ambient Obstruction* / *Scalable Ambient Obstruction* (2011–2012) — the SSAO form.
- Szirmay-Kalos et al., *Approximate Ray-Tracing on the GPU with Distance Impostors* (CGF 2005) — closest published relative of the distance-cubemap intersection (🔶 similarity, not verified as the origin).
- Karis, RGBM encoding blog post; Radiance RGBE format (Ward).
- Beer–Lambert law; Snell's law / Fresnel equations (any optics text).
- Three.js documentation and source (MIT): `MeshPhysicalMaterial`, `PMREMGenerator`, `WebGLCubeRenderTarget`, `CubeCamera`, `RGBELoader`.
