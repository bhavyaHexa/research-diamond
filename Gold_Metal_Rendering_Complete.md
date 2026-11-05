# Gold / Metal Rendering — Complete Reference

How the Hexa Jewelry Viewer renders its gold band, and how to rebuild it independently.

Source analysed: `vendor/engine-0.8.0/bundle-0.8.0.mjs` (Three.js r152 core + WebGi 0.8.0 layer), used by `index.html`.
Companion document: `Diamond_Rendering_Complete.md`. Whole-engine analysis: `Rendering_Engine_Reverse_Engineering.md`.

**Evidence tags:** ✅ confirmed in bundle source and/or at runtime · 🔶 deduced · ❓ not inspected.
**Source references** (`:NNNN`) are line numbers in a prettified copy of the bundle, regenerated with
`npx prettier@3.3.3 --parser babel --print-width 120 vendor/engine-0.8.0/bundle-0.8.0.mjs > bundle.pretty.mjs`.
**Reference code** in §12 is *my own independent implementation* written from this analysis (GLSL ES 3.00). It mirrors the behaviour, not the bundle's text. §14 states exactly what of it was machine-checked.

---

## Contents

1. [What "gold" is in this viewer](#1-what-gold-is-in-this-viewer)
2. [Inputs: every parameter that changes the result](#2-inputs-every-parameter-that-changes-the-result)
3. [End-to-end data flow](#3-end-to-end-data-flow)
4. [Shading model — equations](#4-shading-model--equations)
5. [Environment lighting](#5-environment-lighting)
6. [Direct light and shadows](#6-direct-light-and-shadows)
7. [Screen-space terms: SSR and SSAO](#7-screen-space-terms-ssr-and-ssao)
8. [Output encoding, tone mapping, colour management](#8-output-encoding-tone-mapping-colour-management)
9. [Why gold looks the way it does](#9-why-gold-looks-the-way-it-does)
10. [Quirks and traps](#10-quirks-and-traps)
11. [Measurements](#11-measurements)
12. [Reference implementation (GLSL + JS)](#12-reference-implementation)
13. [Performance and mobile](#13-performance-and-mobile)
14. [Validation plan and what was verified](#14-validation-plan-and-what-was-verified)
15. [Open questions](#15-open-questions)

---

## 1. What "gold" is in this viewer

| Question | Answer | Tag |
|---|---|---|
| Which material class? | `MeshStandardMaterial2` (`qt`, `:43902`) extends `THREE.MeshPhysicalMaterial` (r152). Runtime `type` is still `"MeshPhysicalMaterial"`. | ✅ |
| Custom BRDF? | **No.** The compiled fragment shader is stock r152 `meshphysical` (GGX / Smith-correlated / Schlick, split-sum IBL, multi-scatter). | ✅ (dumped from the live GPU program) |
| What is custom? | (a) shader patching at 4 marker points for SSR + SSAO, (b) camera-fixed environment with a Y-rotation, (c) `envMapIntensity` taken from the scene, (d) RGBM-16 output instead of sRGB, (e) tone mapping moved to a later full-screen pass. | ✅ |
| Which mesh? | One mesh `M1001`, material `M1`. | ✅ |
| Gold parameters | `metalness 1`, `roughness 0`, base colour (linear) **(0.7835, 0.4508, 0.1845)**, `ior 1.5` (irrelevant at metalness 1) | ✅ |
| Lights | one directional light (+ shadow) and one image-based light. Ambient = 0, light probe = 0. | ✅ |

The metal is therefore **"a very smooth coloured mirror lit by an HDR studio map"**. Almost every visible feature of the gold comes from (i) the colour of F0, (ii) what the environment map contains in the reflected direction, (iii) the late ACES tone curve.

---

## 2. Inputs: every parameter that changes the result

### 2.1 Material

| Parameter | Value here | Role | Where set |
|---|---|---|---|
| `baseColor` (linear RGB) | (0.7835, 0.4508, 0.1845) ≈ sRGB `#e5b377` | **F0** of the conductor (and F90 = 1) | `METALS.yellow` in `index.html` via `setMetal()` |
| `metalness` | 1 | blends dielectric ↔ conductor | GLB + `setMetal` |
| `roughness` | 0 → clamped to 0.0525 inside the shader | lobe width | GLB + `setMetal` |
| `ior` | 1.5 | only used for the dielectric part (weight 1−metalness = 0) | GLB (`KHR_materials_ior`) |
| `specularIntensity` | 1 | dielectric specular scale; F90 mix | default |
| `side` | DoubleSide | back faces flip the normal | ✅ define `DOUBLE_SIDED` |
| `envMapIntensity` | 1 (**ignored**, see §10) | — | — |
| maps | none bound on `M1` | — | ✅ |

### 2.2 Scene-level

| Parameter | Value | Meaning | Tag |
|---|---|---|---|
| `scene.environment` | `lightmap-r-2b.hdr`, 1024×512 RGBE → half-float equirect → PMREM | IBL source | ✅ |
| `scene.environment.rotation` | 2 rad | Y rotation applied to lookups | ✅ (`index.html`) |
| `scene.envMapIntensity` | 1 | the **actual** env gain for the gold | ✅ |
| `scene.fixedEnvMapDirection` | true (from GLB `sceneEnvironmentFixedDirection`) | environment is attached to the camera | ✅ |
| directional light A | intensity 1, colour `#cceeff` (sRGB hex), layer mask 1, shadow 1024² | only light in the gold shader | ✅ |
| directional light B | intensity 10, white, layer mask 32 | not visible to the main camera layer | ✅ / 🔶 (purpose) |
| ambient / light-probe | 0 / 9×(0,0,0) | none | ✅ |

### 2.3 Pipeline

| Parameter | Value | Tag |
|---|---|---|
| render buffer | RGBA8, colour space `"rgbm-16"` (RGBM, range 16) | ✅ |
| `renderer.toneMapping` / `outputColorSpace` | `NoToneMapping` / `NoColorSpace` | ✅ |
| final tonemap | ACESFilmic, exposure 1, **contrast 1.12**, saturation 1, `tonemapBackground = false` | ✅ |
| SSAO | intensity 0.1, radius 1, bias 0.001, falloff 1.6, 11 samples, 3 spiral turns | ✅ |
| SSR | inline in the material; 16 steps; intensity 1; boost (1,1,1); maskFront −0.2; tolerance 0.5; `autoRadius` true; `objectRadius` 1; `sceneBoundingRadius` 5.85 | ✅ |
| accumulation | 32 frames, 17-sample sub-pixel jitter table; no MSAA | ✅ |
| pixel ratio | 1.5 (CSS 1024×768 → 1536×1152) | ✅ |

---

## 3. End-to-end data flow

```text
LOAD TIME
  lightmap-r-2b.hdr (RGBE) ─► RGBELoader ─► HalfFloat equirect 1024×512 (srgb-linear)
                                         └► PMREM (cube 256) ─► "CubeUV" atlas 768×1024 HalfFloat ──┐
  Ring_v1.glb  ─► M1 = MeshStandardMaterial2 ◄── index.html setMetal(): colour/roughness/metal      │
                                                                                                    │
PER FRAME (only while "dirty"; stops after 32 converged frames)                                     │
  jitter camera + shadow cameras (sub-pixel)                                                        │
  ┌─ GBuffer pass: depth (+normal, flags) of everything ───────────────┐                            │
  │   └─► SSAO pass ─► AO map (R8) ─────────────────────────────────┐  │                            │
  │                                                                   ▼  ▼                           │
  └─ Render pass: M1 fragment shader                                                                  │
        direct   = (N·L)·E_L·shadow · GGX(F0,ρ)            ◄── directional light A                   │
        indirect = env(R,ρ)·[F_ss] + F_ms·E_ms·irr/π     ◄─────────────────────────────────────────┘
        SSR      = last accumulated frame, GGX-sampled ray, 16 steps, blended over `indirect`
        AO       = AO map · (diffuse) , specularOcclusion(N·V, AO, ρ) · (specular)
        out      = LinearToRGBM(direct+indirect, 16)   →  composer target (RGBA8)
  Progressive : history = mix(history, frame, 1/(n+1))             (also the SSR input next frame)
  Bloom       : threshold 2.0, 4 levels, intensity 0.36 (adds to bright highlights)
  CombinedPost: RGBM→linear · ACES · contrast 1.12 · saturation · sRGB OETF · (background masked)
```

The ✅ pass order was read from `viewer.renderer.pipeline` at runtime:
`gbuffer → ssrtgi(off) → ssr → ssao → velocityBuffer(off) → normalBuffer → ssBevel → render → frameFade → depthOfField(off) → taa(off) → progressive → bloom → combinedPost`.

---

## 4. Shading model — equations

Notation: `N` shading normal, `V` unit vector to the eye, `L` unit vector to the light, `H = normalize(L+V)`, `ρ` roughness, `α = ρ²`, `F0` normal-incidence reflectance (RGB), `F90` grazing reflectance, `⁺` = clamp to ≥ 0.

All shading happens in **view space** (`P = −vViewPosition`, `V = normalize(vViewPosition)`, ✅ `geometry.viewDir`), which is why the environment direction can stay in view space.

### 4.1 Material setup ✅ (compiled shader)

```
diffuseColor  = baseColor · (1 − metalness)                         = 0 for gold
Ng            = geometry normal (before any normal map)
g             = max component of max(|dFdx Ng|, |dFdy Ng|)          geometric roughness
ρ             = min( max(roughness, 0.0525) + g , 1 )                ← floor + specular anti-aliasing
F0            = mix( min(((ior−1)/(ior+1))², 1)·specIntensity ,  baseColor ,  metalness )
              = baseColor                                            for metalness = 1
F90           = mix(specularIntensity, 1, metalness) = 1
```

A conductor's "colour" is the *reflectance spectrum itself*. Physically F0(λ) = ((n−1)² + k²)/((n+1)² + k²) per wavelength with complex index n + ik; `baseColor` plays the role of that triple.

### 4.2 Direct light ✅

```
Lo_direct = (N·L)⁺ · E_L · shadow · [ F(V·H) · Vis · D ]  +  (N·L)⁺ · E_L · shadow · diffuseColor/π
F(c)  = F0 + (F90 − F0)·2^((−5.55473·c − 6.98316)·c)                   (Schlick, exp2 form)
D     = α² / ( π · ((N·H)²·(α² − 1) + 1)² )                            (GGX / Trowbridge–Reitz)
Vis   = 0.5 / max( (N·L)·√(α² + (1−α²)(N·V)²) + (N·V)·√(α² + (1−α²)(N·L)²), ε )   (Smith GGX, height-correlated)
```

Three r152 with `useLegacyLights = false` (✅ `:40773`) does not multiply light intensity by π; `E_L` = colour × intensity.

At ρ = 0.0525: α = 0.00276, D is a spike of width ≈ 0.003 rad — the directional light shows as a tiny glint. Everything else is image-based.

### 4.3 Image-based specular (split-sum) ✅

```
R      = reflect(−V, N)
R'     = normalize( mix(R, N, ρ²) )                 ← bend reflection toward the normal as roughness rises
radiance(R',ρ) = prefilteredEnv(R', ρ) · envIntensity
(A,B)  = DFG(N·V, ρ)           // Karis analytic fit:
           r = ρ·(−1, −0.0275, −0.572, 0.022) + (1, 0.0425, 1.04, −0.04)
           a = min(r.x², 2^(−9.28·N·V))·r.x + r.y
           (A,B) = (−1.04, 1.04)·a + (r.z, r.w)
```

### 4.4 Multiple-scattering compensation ✅ (Fdez-Agüera, as in r152)

```
Fss·Ess = F0·A + F90·B                   (single-scatter specular albedo)
Ess     = A + B ;   Ems = 1 − Ess
Favg    = F0 + (1 − F0)/21               (the constant 0.047619 = 1/21)
Fms     = (Fss·Ess)·Favg / (1 − Ems·Favg)
single  = Fss·Ess ;    multi = Fms·Ems
irradiance E(N) = π · radiance(N, ρ=1) · envIntensity            (the *roughest* PMREM level as a diffuse proxy)
cosIrr  = E(N)/π
indirectSpecular += radiance·single  +  multi·cosIrr
indirectDiffuse  += diffuseColor·(1 − max(single+multi))·cosIrr        (0 for gold)
```

For a rough metal the single-scatter GGX loses energy to multiple bounces; `multi·cosIrr` adds that back as a diffuse-like term coloured by `F0`. For this viewer (ρ ≈ 0.05) `Ems` is small, so the term is minor but real.

### 4.5 Putting the lighting together

```
Lo = directSpecular + indirectSpecular        (diffuse terms vanish for metalness = 1)
   → SSR blend → SSAO → emissive(0)
```

---

## 5. Environment lighting

### 5.1 What the bundle does ✅

```text
lightmap-r-2b.hdr           Radiance RGBE, 1024×512, GAMMA=1
  └ RGBELoader              → DataTexture RGBA, HalfFloat, srgb-linear, linear filter, no mips, flipY
    └ scene.environment     mapping = EquirectangularReflection, rotation = 2
      └ WebGLCubeUVMaps     (:19470-19500, :19895-19930) → PMREMGenerator.fromEquirectangular
           cubeSize = image.height/2 = 256 → "CubeUV" atlas 768×1024, HalfFloat
      └ uniform envMap (sampler2D, define ENVMAP_TYPE_CUBE_UV)
```

The material's patched `getIBLRadiance` / `getIBLIrradiance` (✅, in the dumped shader):

```text
radiance(viewDir, N, ρ):
    R = reflect(−viewDir, N);  R = normalize(mix(R, N, ρ²))
    if (!FIX_ENV_DIRECTION)  R = inverseTransformDirection(R, viewMatrix)      // view → world
    R = rotY(R, envMapRotation)
    return textureCubeUV(envMap, R, ρ) · envMapIntensity
irradiance(N):
    N' = FIX_ENV_DIRECTION ? N : view→world(N);  N' = rotY(N', envMapRotation)
    return π · textureCubeUV(envMap, N', 1.0) · envMapIntensity
```

`rotY` is Three's `rotationMatrix(vec3(0,1,0), θ)` ✅ (body dumped) applied as `transformDirection(dir, M)`:

```
x' = cosθ·x − sinθ·z
y' = y
z' = sinθ·x + cosθ·z
```

i.e. the **lookup direction** is turned by −θ about +Y (right-handed). The map's *content* therefore appears rotated by +θ.

Equirect convention (stock Three, ✅ dumped `equirectUv`):

```
u = atan2(d.z, d.x)/(2π) + 0.5          v = asin(clamp(d.y,−1,1))/π + 0.5          (v = 1 at +Y, up)
```

### 5.2 `FIX_ENV_DIRECTION` — the environment moves with the camera ✅

`scene.fixedEnvMapDirection = true` → `#define FIX_ENV_DIRECTION` on the gold material (set in `onBeforeRender`, `:44220-44225`). The reflection vector is **not** converted back to world space; the view-space vector indexes the map directly, then `rotY`. Orbiting the camera therefore does not slide the reflections across the metal the way a world-fixed environment would; the "studio" stays aligned with the viewer. Measured: turning it off changes mean gold by (+5.5, +8.0, +9.5) levels.

### 5.3 Independent preprocessing pipeline (what to build)

1. **Decode RGBE** → Float32 RGB (JS, §12.2).
2. **Equirect → cube** (256² per face; GL cube-face table, §12.3) into RGBA16F.
3. **GGX prefilter** each mip with roughness `ρ_i = i / maxLod` (§12.4), 9 mips for 256² (maxLod = 8).
4. **Irradiance**: SH9 from the *source equirect* (JS, §12.5) — or reuse the roughest mip (the bundle's approach). SH9 is cheaper at runtime (no fetch) and smoother.
5. Sample with `textureLod(env, dir, ρ·maxLod)`.

Design differences vs Three's PMREM that you should expect (🔶): Three maps roughness→level with its own non-linear table and stores a CubeUV atlas; mine uses a plain mip chain with linear `ρ→lod`. Calibrate with the golden-image harness (§14) — expect small differences in blur falloff at mid roughness; at ρ≈0.05 (this viewer) the result is effectively LOD ≈ 0.4 and indistinguishable.

### 5.4 Facts about the environment *content* (decoded from the `.hdr`) ✅

Decoded with the JS decoder in §12.2 (round-trip verified, §14):

| | `lightmap-r-2b.hdr` (gold IBL) | `gem-000.hdr` (diamond) |
|---|---|---|
| size | 1024×512 | 512×512 |
| mean luminance | 1.64 | 0.67 |
| mean RGB | (1.643, 1.643, 1.643) — **perfectly neutral grey** | (0.626, 0.675, 0.701) slightly cool |
| median / 90 % / 99 % | 1.07 / 3.08 / 9.94 | 0.36 / 0.63 / 10.65 |
| max | 39.5 | 214.3 |
| pixels with L > 1 / > 2 / > 8 | 58 % / 17.6 % / 1.5 % | 3.1 % / 2.3 % / 1.2 % |
| energy share from L > 2 | 48.7 % | 47.4 % |
| upper-half / lower-half luminance | 1.51 | 1.25 |

**Consequence:** the gold IBL map has **no colour of its own**. All of the gold's hue comes from `F0`; the environment only supplies a *grey* luminance pattern (soft-box lighting, 17 % of the sphere above 2.0).

---

## 6. Direct light and shadows

- One directional light is compiled in (`directionalLights[0]`); its view-space direction uniform at runtime was (−0.400, −0.388, 0.830) ✅ (it changes with the camera because it is stored in view space).
- Shadow map: 1024², `PCFShadowMap`, `autoUpdate = false`, re-rendered on every scene change **and every jitter frame** (so the shadow edge is anti-aliased by accumulation). Ortho frustum ±2, near −2, far 9; bias −0.001; radius 2. ✅
- Gold is `castShadow = receiveShadow = true` (set when added to the scene, `:42828`). ✅
- A second light (intensity 10, layer 32) exists but is excluded from the main camera's layer mask; 🔶 it feeds the ground-shadow baking plugin (`RandomizedDirectionalLight` / `Ground`), ❓ not inspected.

Independent implementation: a 3×3 PCF with a hardware-compare `sampler2DShadow`, jitter the light's projection by the same sub-pixel offsets as the camera, and let accumulation do the softening.

---

## 7. Screen-space terms: SSR and SSAO

Both are injected by `onBeforeCompile` at `beforeModulation` (after `RE_IndirectSpecular`, before the totals are summed).

### 7.1 SSR — inline, stochastic, history-fed ✅

From the dumped fragment shader:

```text
screenPos = viewToScreen(P)               // xy ∈ [0,1], z = view depth
a  = (1 − clamp(0.3·ρ, 0, 1)) · ssrIntensity
a *= clamp(−4·(V·N) + (4 + maskFront), 0, 1)            // maskFront = −0.2 ; kills rays aimed back at the camera
a *= edgeFade(screenPos)                                // dist = min distance to a screen edge
                                                        //   fade = clamp(dist²/(0.1+0.001), 0, 1)^0.3
S  = EnvironmentBRDF(N, V, F0, F90, ρ)                  // = F0·A + F90·B
if ( |S|·a > 0.01  &&  roughnessFactor < 0.9 )
        ssr = calculateSSR(...)                          // rgb = history colour at the hit, a = 1 on hit
ssr.rgb *= ssrBoost ;  ssr.a = min(ssr.a·a, 1)
indirectSpecular = mix( indirectSpecular , saturate(S · ssr.rgb) , ssr.a )
```

`calculateSSR` (✅):

```text
E        = (ign(fragCoord, frame·117), fract(ign·38.65435) mixed toward 1 by 0.7)      // 2 noise values
L        = GGX-style half-vector sample around N:   φ = 2π·E.x ;  cosθ = E.y^( ρ⁴/(2−ρ⁴) )
           ray = 2(V·H)H − V
R_scene  = objectRadius · sceneBoundingRadius                         (5.85 here)
rayLen   = autoRadius ?  mix( (camDist+R_scene) + P.z , −P.z − max(0, camDist − R_scene) , L.z·0.5+0.5 )
                      :  R_scene                                      (autoRadius = true here)
steps    = SSR_STEP_COUNT (16) ;  march in screen space (linear in xy and w) against the GBuffer depth
           start offset jitter = (ign(fragCoord, frame+seed)+0.5)/steps ;  hit when |ΔdepthBehind| < tolerance·rayLen·0.125
           if the first pass finds nothing and steps > 8 → a second (offset) pass ; > 15 → third ; > 23 → fourth
colour   = tLastFrame at the hit (the *Progressive* accumulation buffer, RGBM-decoded)
```

Properties to preserve: (a) one noisy ray per pixel per frame — the 32-frame accumulation turns it into a smooth blur; (b) the **history buffer is the colour source**: the ring's own stones and shank show up in the gold with one frame of latency, and the reflection of a reflection is naturally included because the history already contains last frame's SSR; (c) the colour is `saturate`d (≤ 1) before use, so SSR reflections cannot exceed 1.0 × S — they cannot show HDR highlights.

Effect on the image (measured): disabling SSR → gold (212.0, 174.5, 116.7) → (206.9, 171.8, 118.0) and gold-pixel count −15 %.

### 7.2 SSAO — SAO-style ✅

Separate pass before `render`; result `tSSAOMap` read by the material at `viewToScreen(vViewPosition)`:

```text
rPx   = 200·radius / (−P.z)                              // pixels
φ0    = 6.2·hash(uv, frame·0.1)
for i in 0..10:
    s   = (i + fract(φ0) + 0.5)/11
    φ   = s·(3 turns · 6.28) + φ0 ;   r = s·rPx
    uv' = uv + floor(r·(cosφ, sinφ))/res
    P'  = viewPos(uv', depth(uv')) ;  d = P' − P
    ao_i = max( ( N·d + P.z·bias ) / ( falloff·|d|² + ε ) , 0 )          bias=0.001, ε=0.001, falloff=1.6
AO    = clamp( 1 − (Σ ao_i)·intensity/11 , 0 , 1 )                       intensity = 0.1
```

Use in the material: `indirectDiffuse *= AO; indirectSpecular *= specOcc(N·V, AO, ρ)` with

```
specOcc = saturate( (N·V + AO)^( 2^(−16ρ − 1) ) − 1 + AO )
```

At intensity 0.1 the AO contribution on gold is tiny (measured: disabling it changes the mean by ~+1 level), so a first implementation may skip SSAO entirely for metals.

---

## 8. Output encoding, tone mapping, colour management

### 8.1 RGBM-16 ✅

The material writes **linear HDR as RGBM** into an 8-bit RGBA target:

```
encode(c):  m = clamp(max(c.r,c.g,c.b)/16, 0, 1);  M = ceil(m·255)/255;  out = ( c/(16·M) , M )
decode(t):  c = t.rgb · t.a · 16
```

Range 16, `ceil` quantisation → values are never under-estimated; the scene cannot exceed 16.0. The bundle's `linearToOutputTexel` = this encode ✅ (`:` shader text) and every pass that reads the scene applies the matching decode. In your engine use RGBA16F if available (no encode/decode needed) and keep RGBM only as a fallback.

### 8.2 Final composite (`combinedPost`) ✅ dumped from runtime

```text
c = decodeRGBM(tDiffuse)
c *= opacity (1)
doTonemap = flagsTonemapBit  &&  !(depth > 0.99 && transparent.a < 0.001)       // background is excluded
if doTonemap:
    c = ACESFilmic(c)                                   // see below
    c = (c − 0.5)·contrast + 0.5                        // contrast = 1.12
    c = mix( dot(c, (0.2125,0.7154,0.0721)) , c , saturation )        // saturation = 1
if depth < 1e-5: alpha = 0
out = sRGB_OETF(c) ; out.rgb *= out.a                   // premultiplied alpha
```

ACESFilmic (Three r152, ✅ dumped constants):

```
c   *= exposure / 0.6
c    = ACESInputMat · c
c    = (c·(c + 0.0245786) − 0.000090537) / (c·(0.983729·c + 0.4329510) + 0.238081)       // RRT+ODT fit
c    = ACESOutputMat · c ;   c = saturate(c)
ACESInputMat  = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]]   (rows)
ACESOutputMat = [[ 1.60475, −0.53108, −0.07367], [−0.10208, 1.10813, −0.00605], [−0.00327, −0.07276, 1.07602]] (rows)
```

(The GLSL `mat3(vec3,vec3,vec3)` constructor takes *columns*; §12.7 writes them accordingly.)

sRGB OETF: `c ≤ 0.0031308 ? 12.92·c : 1.055·c^(1/2.4) − 0.055` (the bundle uses exponent 0.41666).

**Important:** the white page background must be **excluded** from tone mapping. ACES maps a linear 1.0 to ≈ 0.79 linear (sRGB 230/255 — measured on the GPU test in §14.3), which would turn the white background light grey. The bundle masks it via a GBuffer flag + depth test (`tonemapBackground = false`). An independent engine needs an equivalent mask (e.g. stencil, alpha, or a "background" bit).

### 8.3 Colour-space summary

| Data | Space |
|---|---|
| Authoring `#e5b377` | sRGB (display) |
| `material.color` / `diffuse` uniform | linear (0.7835, 0.4508, 0.1845) |
| HDR textures | linear |
| Scene buffer | linear HDR packed as RGBM-16 |
| Tone map input | linear, display-referred after ACES |
| Canvas | sRGB, premultiplied alpha |

---

## 9. Why gold looks the way it does

**Hue (yellow-orange).** F0 = (0.784, 0.451, 0.184): reflectance ratio R : G : B ≈ 4.3 : 2.4 : 1. Because the gold IBL map is *perfectly neutral grey* (§5.4), a mirror reflecting it returns exactly `F · L_grey`, i.e. a pure scaling of that RGB triple. All hue variation therefore comes from Fresnel (F rises to F90 = 1 at grazing → edges whiten) and from the tone curve.

**Grazing whitening.** F(c) → F90 = 1 on all channels as N·V → 0: silhouettes of the band shift toward white/grey.

**Dark regions.** With ρ ≈ 0.05 there is almost no blur; where the reflection vector hits dark parts of the environment (lower half is 1.5× darker, with 58 % of pixels > 1 but a long tail of values < 0.5) the metal is dark. There is no diffuse fill (metalness 1). Ambient and light-probe are 0.

**Bright / hot.** Environment texels up to 39.5 (soft-box cores). Those reach the tone map as 40× the mid-grey input and ACES shoulders them toward white, desaturating them (bright gold → near-white highlights). The RGBM encode clips at 16.

**Orange shift from the tone curve.** Measured: Linear (217.5, 166.2, 98.4) vs ACES (212.0, 174.5, 116.7) — ACES lifts blue and compresses red, making the gold paler; the contrast (1.12) then pulls it back toward saturated (removing it → B 126.4).

**Brightness controls and their sensitivity** (measured): scene env intensity 0.5/1/2 → R 197/212/220; exposure 0.6 → R 186; roughness 0.3 → R +4. Material `envMapIntensity` has *no* effect.

**Physical comparison (illustrative, from approximate optical constants, not from the project ❓).** Using F0 = ((n−1)²+k²)/((n+1)²+k²) with textbook-order optical constants for gold (n,k ≈ 0.14,3.7 @ 650 nm; 0.43,2.45 @ 550 nm; 1.4,1.9 @ 450 nm) gives F0 ≈ (0.96, 0.79, 0.40). The viewer's (0.78, 0.45, 0.18) is darker and more saturated — a stylised "richer yellow gold" 🔶. If you want a different alloy, change *only* `baseColor`.

---

## 10. Quirks and traps

| # | Quirk | Evidence | What to do |
|---|---|---|---|
| 1 | `material.envMapIntensity` is **overwritten** by `scene.envMapIntensity` every draw unless `userData.separateEnvMapIntensity` | `:44214-44219`; measured: 0.5/2 on material = no change; with flag = same as scene 0.5 | expose *one* env-intensity control; decide per-material override explicitly |
| 2 | `ior`/`specularIntensity` have no effect at metalness 1 | shader math | don't expose them for metals |
| 3 | roughness 0 is clamped to 0.0525, plus geometric roughness | shader | keep, or highlights alias |
| 4 | env direction is **view-space** (camera-fixed) | `FIX_ENV_DIRECTION` | store as `envFrame` matrix (§12) |
| 5 | rotation sense: lookup direction rotated by −θ about +Y | dumped `rotationMatrix` | calibrate sign with a test map |
| 6 | SSR colour is saturated to ≤ 1 and comes from the previous accumulated frame (RGBM-decoded) | shader | keep history in linear HDR; clamp deliberately |
| 7 | SSR/SSAO require the GBuffer depth; the main pass re-uses the GBuffer's depth renderbuffer | `:43237`, `useGBufferDepth` | allocate one shared depth attachment |
| 8 | Tonemap is **not** in the material (`TONE_MAPPING` undefined) | dumped program | a second pass is mandatory; HDR → RGBM → ACES |
| 9 | White background must bypass ACES | `ToneMapping()` source | mask |
| 10 | `renderer.outputColorSpace = NoColorSpace`: nothing converts to sRGB except the last pass | `:40789` | don't double-apply an sRGB framebuffer |
| 11 | Accumulation (32 frames) hides the stochastic SSR noise — a *single* frame looks noisy/speckled | design | provide a converged "still" mode and a fast-interaction mode |

---

## 11. Measurements

Mean 8-bit sRGB RGB over gold pixels (mask `R−B > 60 && R > G`), after 34 converged frames; run-to-run noise ≈ ±3 levels. ✅

| Change | Gold RGB |
|---|---|
| baseline | 212.0 / 174.5 / 116.7 |
| roughness 0.3 / 0.6 | 216.0 / 177.9 / 118.6 · 219.8 / 180.5 / 119.4 |
| material envMapIntensity 0.5 / 2 | 212.5 / 174.8 / 116.8 · 212.1 / 174.6 / 116.6 (ignored) |
| scene envMapIntensity 0.5 / 2 | 197.0 / 155.6 / 95.7 · 220.1 / 186.4 / 130.5 |
| `separateEnvMapIntensity` + material 0.5 | 197.7 / 156.4 / 96.2 |
| SSR off | 206.9 / 171.8 / 118.0 (mask −15 %) |
| SSAO off | 213.1 / 176.0 / 118.1 |
| tone map Linear | 217.5 / 166.2 / 98.4 |
| exposure 0.6 | 186.2 / 142.3 / 79.8 |
| contrast 1.0 | 208.5 / 174.8 / 126.4 |
| fixed-env off | 217.5 / 182.5 / 126.2 |
| env rotation 0 (vs 2) | 215.3 / 178.2 / 119.9 |
| base colour (1,1,1) | ≈ (240, 194, 168) over only 5 pixels (not meaningful) |

Frame cost (hidden pane, readPixels-synchronised; indicative only): 7.05 ms/frame total at 1536×1152 with 45 stones; 5.49 ms with stones hidden.

---

## 12. Reference implementation

> Written independently from the analysis above. **GLSL ES 3.00 / WebGL2.** Host code prepends `#define USE_SSR`, `USE_SSAO`, `USE_SHADOW` as needed. Section 14 lists what was compile-checked.

### 12.1 Shared GLSL snippets (`common.glsl`, included by the shaders below)

```glsl
// === FILE: common.glsl ===
const float PI = 3.141592653589793;
const float RECIPROCAL_PI = 0.3183098861837907;
const float RGBM_RANGE = 16.0;

float sq(float x) { return x * x; }
float saturate1(float x) { return clamp(x, 0.0, 1.0); }
vec3  saturate3(vec3 x) { return clamp(x, 0.0, 1.0); }
float max3(vec3 v) { return max(max(v.x, v.y), v.z); }

vec3 decodeRGBM(vec4 t) { return t.rgb * t.a * RGBM_RANGE; }
vec4 encodeRGBM(vec3 c) {
  float m = clamp(max3(c) / RGBM_RANGE, 0.0, 1.0);
  m = ceil(m * 255.0) / 255.0;
  return vec4(c / (max(m, 1e-6) * RGBM_RANGE), m);
}

// Karis analytic DFG fit: returns (A, B) so that  F0*A + F90*B  is the split-sum specular albedo
vec2 dfgApprox(float NoV, float rough) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}
vec3 fSchlick(vec3 F0, float F90, float VoH) {
  float f = exp2((-5.55473 * VoH - 6.98316) * VoH);
  return F0 * (1.0 - f) + vec3(F90) * f;
}
float dGGX(float alpha, float NoH) {
  float a2 = alpha * alpha;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return RECIPROCAL_PI * a2 / (d * d);
}
float vSmithGGXCorrelated(float alpha, float NoL, float NoV) {
  float a2 = alpha * alpha;
  float gv = NoL * sqrt(a2 + (1.0 - a2) * NoV * NoV);
  float gl = NoV * sqrt(a2 + (1.0 - a2) * NoL * NoL);
  return 0.5 / max(gv + gl, 1e-6);
}
// Interleaved gradient noise (Jimenez 2014); `frame` decorrelates frames
float ign(vec2 p, float frame) {
  p += 5.588238 * frame;
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
```

### 12.2 RGBE decoder and GPU upload (JS) — executed and verified against both project HDRs

```js
// rgbe.mjs — Radiance .hdr → Float32 RGB. Row 0 of the result is the TOP of the image (file order).
export function decodeRGBE(buf) {
  let pos = 0;
  const readLine = () => { let s = ""; while (pos < buf.length && buf[pos] !== 0x0a) s += String.fromCharCode(buf[pos++]); pos++; return s; };
  if (!readLine().startsWith("#?")) throw new Error("not a Radiance file");
  while (readLine() !== "") { if (pos >= buf.length) throw new Error("header overrun"); }
  const m = readLine().match(/^([-+])Y (\d+) ([-+])X (\d+)$/);
  if (!m) throw new Error("unsupported resolution line");
  const flipY = m[1] === "+", height = +m[2], flipX = m[3] === "-", width = +m[4];
  const out = new Float32Array(width * height * 3), scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    const rle = width >= 8 && width < 32768 && buf[pos] === 2 && buf[pos + 1] === 2 && (buf[pos + 2] & 0x80) === 0 &&
                ((buf[pos + 2] << 8) | buf[pos + 3]) === width;
    if (rle) {
      pos += 4;
      for (let c = 0; c < 4; c++) for (let x = 0; x < width;) {
        let n = buf[pos++];
        if (n > 128) { n -= 128; const v = buf[pos++]; while (n--) scan[4 * x++ + c] = v; }
        else while (n--) scan[4 * x++ + c] = buf[pos++];
      }
    } else for (let i = 0; i < width * 4; i++) scan[i] = buf[pos++];
    const row = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      const e = scan[4 * x + 3], f = e === 0 ? 0 : Math.pow(2, e - 136);   // 2^(e−128)/256
      const o = (row * width + (flipX ? width - 1 - x : x)) * 3;
      out[o] = scan[4 * x] * f; out[o + 1] = scan[4 * x + 1] * f; out[o + 2] = scan[4 * x + 2] * f;
    }
  }
  return { width, height, data: out };
}
// For GL upload use texel row 0 = SOUTH pole (v = 0). Reverse the rows; RGB32F→RGBA16F conversion is done by the driver
// if you upload RGB32F with gl.texImage2D(..., gl.RGB32F, w, h, 0, gl.RGB, gl.FLOAT, data) (RGBA16F target via render-to-texture).
export function bottomFirst({ width, height, data }) {
  const out = new Float32Array(data.length), rowLen = width * 3;
  for (let y = 0; y < height; y++) out.set(data.subarray(y * rowLen, (y + 1) * rowLen), (height - 1 - y) * rowLen);
  return { width, height, data: out };
}
```

### 12.3 Fullscreen vertex + cube-face basis + equirect→cube (`equirect2cube.frag`)

GL cube-face table (`s` = texture column direction, `t` = row direction, rendering into a face with `st = gl_FragCoord.xy/size` writes texel `(s,t)` directly):

| face | `ma` (forward) | `sc` | `tc` | direction for `c = 2·st − 1` |
|---|---|---|---|---|
| +X | +x | −z | −y | (1, −c.y, −c.x) |
| −X | −x | +z | −y | (−1, −c.y, c.x) |
| +Y | +y | +x | +z | (c.x, 1, c.y) |
| −Y | −y | +x | −z | (c.x, −1, −c.y) |
| +Z | +z | +x | −y | (c.x, −c.y, 1) |
| −Z | −z | −x | −y | (−c.x, −c.y, −1) |

```glsl
// === FILE: fullscreen.vert ===
#version 300 es
out vec2 vST;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));   // fullscreen triangle, no VBO
  vST = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
```

```glsl
// === FILE: cubeface.glsl ===
vec3 cubeFaceDir(int face, vec2 st) {
  vec2 c = st * 2.0 - 1.0;
  if (face == 0) return vec3( 1.0, -c.y, -c.x);
  if (face == 1) return vec3(-1.0, -c.y,  c.x);
  if (face == 2) return vec3( c.x,  1.0,  c.y);
  if (face == 3) return vec3( c.x, -1.0, -c.y);
  if (face == 4) return vec3( c.x, -c.y,  1.0);
  return vec3(-c.x, -c.y, -1.0);
}
```

```glsl
// === FILE: equirect2cube.frag ===
#version 300 es
precision highp float;
in vec2 vST;
out vec4 outColor;
uniform sampler2D uEquirect;   // row 0 = south pole (v = 0), RGBA16F/32F, linear filter
uniform int uFace;
#include "cubeface.glsl"
void main() {
  vec3 d = normalize(cubeFaceDir(uFace, vST));
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * 3.141592653589793) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.141592653589793 + 0.5);
  outColor = vec4(texture(uEquirect, uv).rgb, 1.0);
}
```

### 12.4 GGX prefilter (`prefilter.frag`) — one draw per (mip, face)

```glsl
// === FILE: prefilter.frag ===
#version 300 es
precision highp float;
in vec2 vST;
out vec4 outColor;
uniform samplerCube uSource;   // full-mip source cube (generateMipmap first)
uniform float uRoughness;      // mip i → i/maxLod
uniform int uFace;
uniform float uSourceSize;     // face resolution of the source (256)
#include "cubeface.glsl"
const float PI = 3.141592653589793;
const uint SAMPLES = 512u;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}
vec2 hammersley(uint i, uint n) { return vec2(float(i) / float(n), radicalInverse(i)); }
float dGGX(float a, float NoH) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }

void main() {
  vec3 N = normalize(cubeFaceDir(uFace, vST));
  float alpha = uRoughness * uRoughness;
  if (uRoughness < 1e-3) { outColor = vec4(textureLod(uSource, N, 0.0).rgb, 1.0); return; }
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, N)), B = cross(N, T);
  float texelSolidAngle = 4.0 * PI / (6.0 * uSourceSize * uSourceSize);
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for (uint i = 0u; i < SAMPLES; i++) {
    vec2 xi = hammersley(i, SAMPLES);
    float cosT = sqrt((1.0 - xi.y) / (1.0 + (alpha * alpha - 1.0) * xi.y));       // GGX importance sampling
    float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
    float phi = 2.0 * PI * xi.x;
    vec3 H = normalize(T * (sinT * cos(phi)) + B * (sinT * sin(phi)) + N * cosT);
    vec3 L = normalize(2.0 * dot(N, H) * H - N);                                   // N = V = R assumption
    float NoL = dot(N, L);
    if (NoL > 0.0) {
      float NoH = max(dot(N, H), 0.0);
      float pdf = dGGX(alpha, NoH) / 4.0 + 1e-6;                                   // D·NoH/(4·VoH), VoH = NoH
      float sampleSolidAngle = 1.0 / (float(SAMPLES) * pdf);
      float lod = max(0.5 * log2(sampleSolidAngle / texelSolidAngle) + 1.0, 0.0);   // filtered importance sampling
      sum += textureLod(uSource, L, lod).rgb * NoL;
      wsum += NoL;
    }
  }
  outColor = vec4(sum / max(wsum, 1e-4), 1.0);
}
```

### 12.5 SH9 irradiance from the equirect (JS) + shader evaluation

```js
// Projects an equirect (row 0 = TOP, as returned by decodeRGBE) onto 9 real SH coefficients.
export function projectSH9({ width: W, height: H, data }) {
  const L = Array.from({ length: 9 }, () => [0, 0, 0]);
  for (let r = 0; r < H; r++) {
    const phi = (0.5 - (r + 0.5) / H) * Math.PI;           // elevation, +π/2 at the top row
    const dOmega = (2 * Math.PI / W) * (Math.PI / H) * Math.cos(phi);
    for (let c = 0; c < W; c++) {
      const th = ((c + 0.5) / W - 0.5) * 2 * Math.PI;      // u = atan2(z,x)/2π + 0.5
      const x = Math.cos(phi) * Math.cos(th), y = Math.sin(phi), z = Math.cos(phi) * Math.sin(th);
      const Y = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z,
                 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
      const o = (r * W + c) * 3;
      for (let k = 0; k < 9; k++) for (let ch = 0; ch < 3; ch++) L[k][ch] += data[o + ch] * Y[k] * dOmega;
    }
  }
  return L;   // upload as vec3 uEnvSH[9]
}
```

```glsl
// === FILE: sh9.glsl ===
// Irradiance E(n) (= π · average cosine-weighted radiance) from SH9 radiance coefficients (Ramamoorthi & Hanrahan).
vec3 shIrradiance(vec3 n, vec3 L[9]) {
  const float c1 = 0.429043, c2 = 0.511664, c3 = 0.743125, c4 = 0.886227, c5 = 0.247708;
  return c1 * L[8] * (n.x * n.x - n.y * n.y) + c3 * L[6] * n.z * n.z + c4 * L[0] - c5 * L[6]
       + 2.0 * c1 * (L[4] * n.x * n.y + L[7] * n.x * n.z + L[5] * n.y * n.z)
       + 2.0 * c2 * (L[3] * n.x + L[1] * n.y + L[2] * n.z);
}
```

### 12.6 Metal material shader

```glsl
// === FILE: metal.vert ===
#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix;        // inverse-transpose(modelView) upper 3×3
uniform mat4 uModelToShadow;       // lightViewProj * model (optional)
out vec3 vPosV;
out vec3 vNormalV;
out vec4 vShadowCoord;
void main() {
  vec4 pv = uModelView * vec4(aPosition, 1.0);
  vPosV = pv.xyz;
  vNormalV = uNormalMatrix * aNormal;
  vShadowCoord = uModelToShadow * vec4(aPosition, 1.0);
  gl_Position = uProjection * pv;
}
```

```glsl
// === FILE: metal.frag ===
#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;

in vec3 vPosV;
in vec3 vNormalV;
in vec4 vShadowCoord;
layout(location = 0) out vec4 outColor;      // RGBM-16 (or write linear HDR into RGBA16F and drop encodeRGBM)

// ---- material -----------------------------------------------------------------------------
uniform vec3  uBaseColor;           // linear; F0 for metals
uniform float uMetalness;           // 1 for gold
uniform float uRoughness;           // 0..1 (0 → clamped)
uniform float uSpecularIntensity;   // 1
uniform float uIor;                 // 1.5 (dielectric branch only)

// ---- environment --------------------------------------------------------------------------
uniform samplerCube uEnvSpec;       // GGX-prefiltered, mip i ↔ roughness i/uEnvMaxLod
uniform float uEnvMaxLod;           // 8 for a 256² base
uniform vec3  uEnvSH[9];            // radiance SH9 of the same environment
uniform mat3  uEnvFromView;         // view-space direction → environment space (includes the Y rotation;
                                    //   if the env is world-fixed also includes inverse(viewRotation))
uniform float uEnvIntensity;

// ---- direct light -------------------------------------------------------------------------
uniform vec3  uLightDirV;           // toward the light, view space (unit)
uniform vec3  uLightColor;          // linear · intensity
#ifdef USE_SHADOW
uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;         // 1/shadowMapSize
#endif

// ---- screen-space -------------------------------------------------------------------------
uniform vec2  uResolution;          // render-target size in pixels
uniform mat4  uProjection;
uniform float uFrame;
#ifdef USE_SSAO
uniform sampler2D uAOMap;           // R = AO (1 = unoccluded)
#endif
#ifdef USE_SSR
uniform sampler2D uViewDepth;       // R = positive linear view depth
uniform sampler2D uHistory;         // previous accumulated frame, RGBM-16
uniform float uNear;
uniform float uSceneRadius;         // objectRadius * sceneBoundingRadius
uniform float uCameraDist;          // length(cameraPositionWorld)  (scene assumed centred on the origin)
uniform float uSSRIntensity;        // 1
uniform float uSSRMaskFront;        // -0.2
uniform float uSSRTolerance;        // 0.5
uniform vec3  uSSRBoost;            // (1,1,1)
#endif

#include "common.glsl"
#include "sh9.glsl"

// ------------------------------------------------------------------------------------------
vec3 envSpec(vec3 dirV, float rough) {
  return textureLod(uEnvSpec, normalize(uEnvFromView * dirV), rough * uEnvMaxLod).rgb * uEnvIntensity;
}
vec3 envIrradiance(vec3 nV) {
  vec3 L[9] = vec3[9](uEnvSH[0], uEnvSH[1], uEnvSH[2], uEnvSH[3], uEnvSH[4], uEnvSH[5], uEnvSH[6], uEnvSH[7], uEnvSH[8]);
  return max(shIrradiance(normalize(uEnvFromView * nV), L), vec3(0.0)) * uEnvIntensity;
}

#ifdef USE_SHADOW
float shadowFactor() {
  vec3 c = vShadowCoord.xyz / vShadowCoord.w * 0.5 + 0.5;
  if (c.z > 1.0 || any(lessThan(c.xy, vec2(0.0))) || any(greaterThan(c.xy, vec2(1.0)))) return 1.0;
  float s = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
      s += texture(uShadowMap, vec3(c.xy + vec2(float(x), float(y)) * uShadowTexel, c.z - 0.001));
  return s / 9.0;
}
#endif

#ifdef USE_SSR
vec3 viewToScreen(vec3 p) {                       // xy in [0,1], z = positive view depth
  vec4 c = uProjection * vec4(p, 1.0);
  return vec3(0.5 + 0.5 * c.xy / c.w, c.w);
}
// Screen-space march along view-space segment P0 → P0 + dir*len. Returns hit uv in .xy, hit flag in .z.
vec3 traceSSR(vec3 P0, vec3 dir, float len, float jitter, float thickness) {
  if (P0.z + dir.z * len > -uNear) len = (-uNear - P0.z) / dir.z;            // clip against the near plane
  if (len <= 0.0) return vec3(0.0);
  vec3 s0 = viewToScreen(P0), s1 = viewToScreen(P0 + dir * len);
  float k0 = 1.0 / s0.z, k1 = 1.0 / s1.z;                                   // 1/depth is linear in screen space
  const int STEPS = 16;
  float prevT = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + jitter + 0.5) / float(STEPS);
    vec2 uv = mix(s0.xy, s1.xy, t);
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
    float rayDepth = 1.0 / mix(k0, k1, t);
    float delta = rayDepth - texture(uViewDepth, uv).r;                     // > 0 : ray is behind the surface
    if (delta > 0.0 && delta < thickness) {
      float lo = prevT, hi = t;                                             // binary refinement
      for (int j = 0; j < 4; j++) {
        float mid = 0.5 * (lo + hi);
        vec2 uvm = mix(s0.xy, s1.xy, mid);
        float dm = 1.0 / mix(k0, k1, mid) - texture(uViewDepth, uvm).r;
        if (dm > 0.0) hi = mid; else lo = mid;
      }
      return vec3(mix(s0.xy, s1.xy, hi), 1.0);
    }
    prevT = t;
  }
  return vec3(0.0);
}
vec4 calculateSSR(vec3 P, vec3 N, vec3 V, float rough, vec2 fragCoord) {
  float n0 = ign(fragCoord, uFrame * 117.0);
  vec2 E = vec2(n0, mix(fract(n0 * 38.65435), 1.0, 0.7));
  float a = rough * rough, phi = 2.0 * PI * E.x;
  float cosT = sqrt((1.0 - E.y) / (1.0 + (a * a - 1.0) * E.y));              // textbook GGX (the bundle uses a power-form variant 🔶)
  float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, N)), B = cross(N, T);
  vec3 H = T * (sinT * cos(phi)) + B * (sinT * sin(phi)) + N * cosT;
  vec3 Ldir = normalize(2.0 * dot(V, H) * H - V);
  // autoRadius: ray length from the scene bounding sphere (view-space P.z < 0)
  float rayLen = mix((uCameraDist + uSceneRadius) + P.z, -P.z - max(0.0, uCameraDist - uSceneRadius), Ldir.z * 0.5 + 0.5);
  rayLen = max(rayLen, 0.001);
  float jitter = ign(fragCoord, uFrame + 8.0);
  vec3 Po = P + N * max(-0.0001 * P.z, 0.001);                                // bias off the surface
  vec3 hit = traceSSR(Po, Ldir, rayLen, jitter, uSSRTolerance * rayLen * 0.125);
  if (hit.z < 0.5) return vec4(0.0);
  return vec4(decodeRGBM(texture(uHistory, hit.xy)), 1.0);
}
#endif

void main() {
  // ---- geometry (view space) ----
  vec3 N = normalize(vNormalV);
  if (!gl_FrontFacing) N = -N;                                                // DoubleSide
  vec3 V = normalize(-vPosV);
  vec3 dxy = max(abs(dFdx(N)), abs(dFdy(N)));
  float geomRough = max(max(dxy.x, dxy.y), dxy.z);

  // ---- material ----
  vec3 diffuseColor = uBaseColor * (1.0 - uMetalness);
  float rough = min(max(uRoughness, 0.0525) + geomRough, 1.0);
  float f0d = sq((uIor - 1.0) / (uIor + 1.0));
  vec3 F0 = mix(vec3(min(f0d, 1.0)) * uSpecularIntensity, uBaseColor, uMetalness);
  float F90 = mix(uSpecularIntensity, 1.0, uMetalness);
  float NoV = saturate1(dot(N, V));

  // ---- direct light ----
  vec3 directDiffuse = vec3(0.0), directSpecular = vec3(0.0);
  {
    vec3 L = normalize(uLightDirV);
    float NoL = saturate1(dot(N, L));
    float sh = 1.0;
#ifdef USE_SHADOW
    sh = shadowFactor();
#endif
    vec3 E = uLightColor * NoL * sh;
    vec3 H = normalize(L + V);
    float NoH = saturate1(dot(N, H)), VoH = saturate1(dot(V, H));
    float alpha = rough * rough;
    vec3 brdf = fSchlick(F0, F90, VoH) * (vSmithGGXCorrelated(alpha, NoL, NoV) * dGGX(alpha, NoH));
    directSpecular += E * brdf;
    directDiffuse  += E * diffuseColor * RECIPROCAL_PI;
  }

  // ---- image-based light ----
  vec3 R = reflect(-V, N);
  R = normalize(mix(R, N, rough * rough));
  vec3 radiance = envSpec(R, rough);
  vec3 cosIrr = envIrradiance(N) * RECIPROCAL_PI;

  vec2 ab = dfgApprox(NoV, rough);
  vec3 Fss = F0 * ab.x + F90 * ab.y;                    // F_ss · E_ss
  float Ess = ab.x + ab.y, Ems = 1.0 - Ess;
  vec3 Favg = F0 + (1.0 - F0) * 0.047619;
  vec3 Fms = Fss * Favg / (1.0 - Ems * Favg);
  vec3 single = Fss, multi = Fms * Ems;
  vec3 diffuseIBL = diffuseColor * (1.0 - max3(single + multi));

  vec3 indirectSpecular = radiance * single + multi * cosIrr;
  vec3 indirectDiffuse  = diffuseIBL * cosIrr;

  // ---- SSR (after IBL, before AO) ----
#ifdef USE_SSR
  {
    vec3 sp = viewToScreen(vPosV);
    float a = (1.0 - clamp(rough * 0.3, 0.0, 1.0)) * uSSRIntensity;
    a *= clamp(-4.0 * dot(V, N) + (4.0 + uSSRMaskFront), 0.0, 1.0);
    float edge = min(min(1.0 - sp.x, 1.0 - sp.y), min(sp.x, sp.y));
    a *= pow(clamp(edge * edge / 0.101, 0.0, 1.0), 0.3);
    vec3 S = Fss;                                         // EnvironmentBRDF(N,V,F0,F90,ρ)
    vec4 ssr = vec4(0.0);
    if (length(S) * a > 0.01 && uRoughness < 0.9) ssr = calculateSSR(vPosV, N, V, rough, gl_FragCoord.xy);
    ssr.rgb *= uSSRBoost;
    ssr.a = min(ssr.a * a, 1.0);
    indirectSpecular = mix(indirectSpecular, saturate3(S * ssr.rgb), ssr.a);
  }
#endif

  // ---- AO ----
#ifdef USE_SSAO
  {
    float ao = texture(uAOMap, gl_FragCoord.xy / uResolution).r;
    indirectDiffuse *= ao;
    indirectSpecular *= saturate1(pow(NoV + ao, exp2(-16.0 * rough - 1.0)) - 1.0 + ao);
  }
#endif

  vec3 outgoing = directDiffuse + indirectDiffuse + directSpecular + indirectSpecular;
  outColor = encodeRGBM(outgoing);
}
```

### 12.7 SSAO pass (`ssao.frag`)

```glsl
// === FILE: ssao.frag ===
#version 300 es
precision highp float;
in vec2 vST;
out vec4 outColor;
uniform sampler2D uViewDepth;   // R = positive linear view depth
uniform sampler2D uNormalV;     // RGB = view-space normal (unit, float target)
uniform vec2  uResolution;
uniform vec2  uTanHalf;         // (tan(fovY/2)*aspect, tan(fovY/2))
uniform float uFrame;
uniform float uRadius;          // 1
uniform float uIntensity;       // 0.1
uniform float uBias;            // 0.001
uniform float uEpsilon;         // 0.001
uniform float uFalloff;         // 1.6
const int   SAMPLES = 11;
const float TURNS   = 3.0;

float hash3(vec3 v) { v = fract(v * 443.8975); v += dot(v, v.yzx + 19.19); return fract((v.x + v.y) * v.z); }
vec3 viewPos(vec2 uv, float depth) { return vec3((uv * 2.0 - 1.0) * uTanHalf * depth, -depth); }

void main() {
  float d0 = texture(uViewDepth, vST).r;
  vec3 N = texture(uNormalV, vST).xyz;
  vec3 P = viewPos(vST, d0);
  float rPx = 200.0 * uRadius / d0;
  float phi0 = 6.2 * hash3(vec3(vST, uFrame * 0.1));
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float s = (float(i) + fract(phi0) + 0.5) / float(SAMPLES);
    float ang = s * (TURNS * 6.28) + phi0;
    vec2 off = vec2(cos(ang), sin(ang));
    vec2 uv = vST + floor(s * rPx * off) / uResolution;
    vec3 Pi = viewPos(uv, texture(uViewDepth, uv).r);
    vec3 d = Pi - P;
    sum += max((dot(N, d) + P.z * uBias) / (uFalloff * dot(d, d) + uEpsilon), 0.0);
  }
  float ao = clamp(1.0 - max(sum * uIntensity / float(SAMPLES), 0.0), 0.0, 1.0);
  outColor = vec4(ao, 0.0, 0.0, 1.0);
}
```

### 12.8 Final composite (`final.frag`)

```glsl
// === FILE: final.frag ===
#version 300 es
precision highp float;
in vec2 vST;
out vec4 outColor;
uniform sampler2D uScene;        // RGBM-16 (or RGBA16F — set uIsRGBM = 0)
uniform sampler2D uBackground;   // R = 1 where the pixel is background (excluded from tone mapping)
uniform int   uIsRGBM;
uniform float uExposure;         // 1
uniform float uContrast;         // 1.12
uniform float uSaturation;       // 1
#include "common.glsl"

vec3 acesFilmic(vec3 c) {
  // column-major: each vec3 below is one COLUMN (transpose of the row tables in the document)
  const mat3 IN  = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6;
  c = IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  c = a / b;
  c = OUT * c;
  return clamp(c, 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
  vec4 t = texture(uScene, vST);
  vec3 c = (uIsRGBM == 1) ? decodeRGBM(t) : t.rgb;
  float bg = texture(uBackground, vST).r;
  if (bg < 0.5) {
    c = acesFilmic(c);
    c = (c - 0.5) * uContrast + 0.5;
    c = mix(vec3(dot(c, vec3(0.2125, 0.7154, 0.0721))), c, uSaturation);
  }
  outColor = vec4(linearToSRGB(clamp(c, 0.0, 1.0)), 1.0);
}
```

### 12.9 Frame/host responsibilities (pseudocode)

```text
init:   env = decodeRGBE → bottomFirst → texture
        cubeSrc  = equirect2cube(256², 6 faces) ; generateMipmap
        envSpec  = for mip i in 0..8: prefilter(roughness = i/8)  into cube mip i
        envSH    = projectSH9(decoded equirect)
frame:  if (!dirty && accumulated >= 32) return
        jitter = table17[frame % 17]  (camera.setViewOffset; same offsets for shadow camera)
        uEnvFromView = rotY(envRotation)                     // fixedEnvDirection = true
                     or rotY(envRotation) · inverse(mat3(viewMatrix))
        gbuffer (depth/normal) → ssao → shadow → colour (metal.frag) → accumulate → bloom → final.frag
```

---

## 13. Performance and mobile

| Cost centre | Estimate | Reduction |
|---|---|---|
| Gold fragment shader | bundle: 79 KB GLSL source after expansion (all extension hooks); mine ≈ 150 lines | drop unused branches; this is the main saving of a rebuild |
| SSR | 16 depth fetches + 4 refinement + 1 history fetch per pixel per frame | 8 steps; half-res SSR; skip when `ρ ≥ 0.9` (already) |
| SSAO | 11 depth+normal samples at full res | half-res + bilateral upsample; or omit (impact on gold ≈ 1 level at intensity 0.1) |
| Targets | 1536×1152 RGBA8 ≈ 7.1 MB each; GBuffer 2×RGBA8 + depth; history; bloom pyramid half-float | pixel-ratio 1.0 on mobile; RGBA8-RGBM only if half-float is unavailable |
| Accumulation | 32 frames to converge | 8–16 frames on mobile; interaction mode with 1 frame |
| Env | one-off: 9 mips × 6 faces × 512 samples | precompute offline into a compressed cube (KTX2/RGBM PNG) |

---

## 14. Validation plan and what was verified

### 14.1 Machine-checked for this document

| Check | Result |
|---|---|
| RGBE decoder (§12.2) executed on both `.hdr` files; statistics in §5.4 produced by it | ✅ ran, no NaN, plausible values |
| Every shader in §12 extracted from this file, `#include`s resolved, **compiled and linked** in a WebGL2 context (Chromium/ANGLE) | ✅ all pass first time, including `metal.frag` with `USE_SSR + USE_SSAO + USE_SHADOW` |
| GL cube-face table (§12.3) + bake shaders/camera table (Diamond doc §4.4) round-trip on the GPU | ✅ worst error 0.35° (§14.3) |
| GGX prefilter normalisation (`prefilter.frag`) | ✅ constant environment stays constant to ≤ 0.04 % at ρ = 0.15, 0.4, 0.7, 1.0 |
| SH9 projection + `shIrradiance` vs brute-force cosine integration of the real HDR | ✅ worst error 4.1 % (`lightmap-r-2b.hdr`) / 3.3 % (`gem-000.hdr`) over 7 normals |
| `metal.frag` energy conservation: F0 = 1, constant environment, no light ⇒ output must be exactly 1 | ✅ **1.000 in all channels at ρ = 0.05, 0.5, 1.0** |
| `final.frag` ACES/contrast/OETF vs a CPU reference using the row-major tables of §8.2 | ✅ identical 8-bit values on 5 inputs; background mask works |
| Bundle claims (shader text, defines, uniforms, pass order, measurements) | read from the live page |

### 14.2 Not verified

The reference shaders were **not** rendered against the bundle's output pixel-for-pixel; the numbers in §11 are the targets for that. SSR and SSAO were compile-checked only (they need a depth/history pipeline to exercise). Treat the code as a faithful transcription of behaviour that still needs the golden-image loop below.

### 14.3 Results of the GPU test harness

Environment: WebGL 2.0, Chromium/ANGLE, `EXT_color_buffer_float` present. All numbers below were produced by running the code from this document.

| Test | Expected | Measured |
|---|---|---|
| prefilter of a constant env (0.5, 1, 2) at ρ 0.15 / 0.4 / 0.7 / 1.0 | constant | min/max within 0.9995–1.0 of expected |
| bake unit sphere (256² cube) then sample at 2000 Fibonacci directions | stored normal = direction, distance = 1 | normal error mean **0.135°**, worst **0.353°**; distance error ≤ 0.001 |
| `metal.frag`, F0 = (1,1,1), ρ = 0.05 / 0.5 / 1.0, env = 1, no light | 1.000 | **1.000 / 1.000 / 1.000** (mean, min and max over 11,956 pixels) |
| `metal.frag`, gold F0, ρ = 0.05, env = 1 | ≈ F0·(A+B) per channel | mean (0.963, 0.906, 0.862) |
| `final.frag`, linear 0.18 grey | CPU 117 | GPU 117 |
| `final.frag`, linear 1.0 | CPU 230 (ACES) / 255 (background) | GPU 230 / 255 |
| `final.frag`, gold F0 (0.784, 0.451, 0.184) | CPU (224,193,137) | GPU (224,193,137) |

Two of these are directly useful as regression tests for your own port: the **energy-conservation test** (any error in `dfgApprox`, the multi-scatter terms, SH normalisation or RGBM encode/decode shows up as ≠ 1.000) and the **ACES grey-card values** (0.18 → 117, 1.0 → 230).

### 14.4 Golden-image loop (recommended)

1. Freeze camera (position (−6.51, 7.65, −2.74), target origin, fov 25°), disable the camera intro.
2. Capture the converged frame from the bundle (34 frames).
3. Reproduce with the rebuilt metal; diff with the mean-RGB table of §11; then per-pixel.
4. Disable stages in the *same order* on both sides (SSR → SSAO → bloom → contrast) so errors localise.
5. Expect residual differences from: PMREM-vs-mip mapping (§5.3), SSR sampling form (§7.1), SSAO radius units, jitter table phase.

---

## 15. Open questions

| # | Item |
|---|---|
| 1 | Why `viewToScreen(vViewPosition)` (sign of `vViewPosition = −mvPosition`) is used when sampling the AO map in the bundle's material — possibly a sign quirk, low impact (intensity 0.1). |
| 2 | Purpose and behaviour of light B (intensity 10, layer 32) and the Ground shadow baker. |
| 3 | What the standalone `ssr` pass does when `SSR_INLINE = 1`. |
| 4 | Exact PMREM roughness→level mapping used by Three r152 (stock; read its source if you need identical blur at mid roughness). |
| 5 | Behaviour on non-WebGL2 / mobile GPUs. |
| 6 | The Radiance GAMMA=1 / EXPOSURE header fields are ignored by the loader path used here (🔶 — both files have `GAMMA=1` or none). |
| 7 | Whether Three's PMREM roughness→level mapping differs enough from the linear `ρ → lod` used in §12 to matter at mid roughness (irrelevant at the viewer's ρ ≈ 0.05). |

---

## Verification log

Produced while writing this document (all executed, not simulated):

1. `rgbe.mjs` (§12.2) decoded `lightmap-r-2b.hdr` (1024×512) and `gem-000.hdr` (512×512): no NaN; the two statistics tables in §5.4 come from it.
2. `sh-test.mjs`: `projectSH9` + `shIrradiance` vs brute-force integration — `∫L dω` matches to 3 decimals (21.966 vs 21.966; 8.660 vs 8.660); irradiance at 7 normals within 4.1 %.
3. `extract.mjs` pulled the 15 shader files out of this document and `Diamond_Rendering_Complete.md`; `test.html` compiled/linked 13 program variants and ran the GPU tests of §14.3.
4. Bundle observations (compiled shader dumps, uniforms, measurements) were taken from the live viewer at `http://localhost:8000` as described in `Rendering_Engine_Reverse_Engineering.md` §2.3.
