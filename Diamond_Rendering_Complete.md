# Diamond Rendering — Complete Reference

How the Hexa Jewelry Viewer renders its diamonds, and how to rebuild it independently.

Source analysed: `vendor/engine-0.8.0/bundle-0.8.0.mjs` (Three.js r152 core + WebGi 0.8.0 layer), used by `index.html`.
Companion documents: `Gold_Metal_Rendering_Complete.md`, `Rendering_Engine_Reverse_Engineering.md`.

**Evidence tags:** ✅ confirmed in the bundle source and/or at runtime · 🔶 deduced · ❓ not inspected.
**Source references** (`:NNNN`) are line numbers in a prettified copy of the bundle, regenerated with
`npx prettier@3.3.3 --parser babel --print-width 120 vendor/engine-0.8.0/bundle-0.8.0.mjs > bundle.pretty.mjs`.
**Reference code** in §13 is *my own independent implementation* written from this analysis. It mirrors behaviour, not the bundle's text. §15 states exactly what was machine-checked and what was not.

---

## Contents

1. [What the diamond is, in one page](#1-what-the-diamond-is-in-one-page)
2. [Parameters](#2-parameters)
3. [Data flow and coordinate frames](#3-data-flow-and-coordinate-frames)
4. [Stage 1 — Asset preparation (once per stone shape)](#4-stage-1--asset-preparation-once-per-stone-shape)
5. [Stage 2 — The distance-cube ray intersection](#5-stage-2--the-distance-cube-ray-intersection)
6. [Stage 3 — The fragment algorithm](#6-stage-3--the-fragment-algorithm)
7. [Optics: equations and worked numbers](#7-optics-equations-and-worked-numbers)
8. [The environment map](#8-the-environment-map)
9. [Geometry requirements (and the evidence)](#9-geometry-requirements-and-the-evidence)
10. [Quirks of the original and the `LEGACY_COMPAT` switch](#10-quirks-of-the-original-and-the-legacy_compat-switch)
11. [Visual effects: where sparkle, fire and darkness come from](#11-visual-effects)
12. [Performance and mobile](#12-performance-and-mobile)
13. [Reference implementation](#13-reference-implementation)
14. [How the diamond sits in the frame](#14-how-the-diamond-sits-in-the-frame)
15. [Validation: what was checked](#15-validation-what-was-checked)
16. [Open questions](#16-open-questions)

---

## 1. What the diamond is, in one page

| Question | Answer | Tag |
|---|---|---|
| Material class | `DiamondMaterial` (`ll`, `:57327`), a **`THREE.ShaderMaterial`** subclass, `typeSlug "dmat"`. Not `MeshPhysicalMaterial`, not transmission, not `MeshRefractionMaterial`. | ✅ |
| Plugin | `DiamondPlugin` (`pl`, `:57603`, `PluginType "Diamond"`), glTF extension key **`WEBGI_materials_diamond`**. | ✅ |
| Ray tracing? | Not literally. There is **no BVH and no triangle data in the shader**. Each stone has a single **6-face half-float cubemap** storing *surface normal + distance* from the stone's centre. The fragment shader intersects rays with the stone by **two refinement steps against that cube**. | ✅ |
| Bounces | `RAY_BOUNCES` compile-time loop (6 here). Each bounce: 3 cube fetches. | ✅ |
| Light model | Entry Fresnel, Snell refraction, Beer–Lambert absorption, total internal reflection, per-bounce Fresnel split, 3-channel dispersion at the exit, image-based exit lighting. **No scene lights, no shadows, no SSR/SSAO.** | ✅ |
| Environment | A separate **512×512 un-prefiltered HDR** (`gem-000.hdr`), sampled bilinear with `texture2D`, camera-fixed. | ✅ |
| Output | linear HDR, `pow(·, γ)`, then RGBM-16 into the same target as the gold. | ✅ |
| Cost | ≈ 37 texture fetches per covered pixel at 6 bounces; independent of facet count. | ✅ (counted from source) |
| Accuracy of the intersection (measured on a real stone, §15) | exit-bounce index correct for 90.5 % of rays, exit direction within 1° for 96.4 % of those; one refinement instead of two drops these to 73.6 % / 86.4 %. | ✅ (my CPU port) |

---

## 2. Parameters

Defaults are the bundle's constants (`ol`, `:57295` and the constructor); "this scene" values were read at runtime ✅.

| Parameter (uniform / define) | Default | This scene | Meaning |
|---|---|---|---|
| `refractiveIndex` (`n`) | 2.4 | **2.42** | Snell index at entry **and** exit. |
| `rayBounces` → `RAY_BOUNCES` (define) | 5 | **6** | internal bounces; changing it recompiles the program. |
| `dispersion` → `rIndexDelta` (`Δn`) | 0.012 | **0.004** | index offset for the R/B exit rays. |
| `absorptionFactor` (`κ`) | 1 | **1** | scales Beer–Lambert exponent. |
| `color` (linear) | (1,1,1) | **0.7758** (`#e4e4e4`) | **absorption tint only**; the surface is *not* multiplied by it. |
| `boostFactors` | (0.892, 0.892, 0.986) | **(2, 2, 2)** | gain on every exit contribution *and* compounding per-bounce energy compensation. |
| `gammaFactor` (`γ`) | 1 | **1.09** | `pow(rgb, γ)` on the final linear colour. |
| `reflectivity` | 0.5 | **0.46** | scale of the surface reflection term. |
| `envMapIntensity` | 1 | **1.6** | gain on all environment samples (exit + reflection). Diamonds set `separateEnvMapIntensity`, so the scene-level value does not override it. |
| `squashFactor` | 0.98 | 0.98 | divides the **canonical-y** component of rays in the proxy-ellipsoid test. |
| `geometryFactor` | 0.5 | 0.5 | scales the proxy-sphere hit distance. |
| `transmission` | 0 | 0 | screen-space see-through mix (unused here). |
| `diamondOrientedEnvMap` → `DIA_ORIENT_ENVMAP` | 0 | 0 | 0 ⇒ rotate exit directions back to world with the stone's alignment matrix. |
| `colorCorrection` | (1,1,1) | (1,1,1) | extra RGB gain. |
| `envMapRotationOffset` | 0 | 0 | extra Y rotation (added to `envMap.rotation`). |
| `envMapIndex` | 0 | 0 | which of the plugin's 3 environments. |
| `ENV_MAP_TYPE` (define) | 0 | **1** | 0 = cube sampler, 1 = equirect `sampler2D`. |
| `FIX_ENV_DIRECTION` (define) | — | **on** | env directions pushed through `viewMatrix` (camera-fixed). |
| `PI` (define) | — | **3.1428** | used only by the equirect lookup. |
| `normalMapRes` (mesh extension) | 512 | **512** | cube face resolution (UI allows 64–1024). |
| `cacheKey` (mesh extension) | — | `"D1"` etc. | identical shapes share one cube. |

The GLB's own diamond data (`D1`: colour red, RI 2.6, 5 bounces, transmission 1, dispersion 0, boost 1) is **overwritten** by `index.html`'s `setGem('white')` and the whitening `makeDiamond()` for `D4xxx`/`D5` — what you see is the viewer's values above, not the file's. ✅

Scene content ✅: 45 stone meshes (29 with a material named `diamond`, incl. the large centre stone `D5`; 16 with `D1`), **14,310 triangles in total**, 3 distinct diamond materials. `D5` itself: 597 vertices, 318 triangles, bounding-sphere radius 4.779 model units.

---

## 3. Data flow and coordinate frames

```text
 ONCE PER SHAPE (cacheKey)                                    PER DRAW                            PER FRAGMENT
 ┌──────────────────────────────────────────────┐   ┌───────────────────────────────┐   ┌───────────────────────────────────┐
 │ mesh ─► validate (closed, volume>0, flat n)  │   │ M   = object.matrixWorld      │   │ N = facet normal (world)          │
 │      ─► PCA align + unit-sphere scale  ─► A  │──►│ uWorldToCanon = A⁻¹·M⁻¹       │──►│ entry: refract, Fresnel           │
 │      ─► bbox centre  c ; centerOffset = A⁻¹c │   │ uCanonToWorld = mat3(M·A)     │   │ canonical-space bounce loop:      │
 │      ─► bake 6 faces: rgb = n·½+½ , a = |p|  │   │ uCenterOffset, bind distCube  │   │   intersect → absorb → TIR/Fresnel│
 │         (RGBA16F cube, Nearest, 512²)        │   │ envRotation, intensities      │   │   → dispersed exit env sample     │
 └──────────────────────────────────────────────┘   └───────────────────────────────┘   │ + surface reflection → γ → RGBM   │
                                                                                         └───────────────────────────────────┘
```

Three frames are involved ✅ (`onBeforeRender`, `:57334-57357`; `_computeOffsets`, `:57872`):

| Frame | Symbol | Meaning |
|---|---|---|
| model | `p_m` | the mesh's own vertex coordinates |
| world | `p_w = M·p_m` | what `vWorldPosition` holds |
| **canonical** | `p_c = A⁻¹·p_m` | stone aligned to its principal axes and scaled so its bounding sphere has radius ≈ 1 about the capture centre |

`A` (= the bundle's `offsetMatrix`) maps canonical→model: columns are the three principal axes scaled by the bounding-sphere radius `R`. The shader's three per-draw matrices:

```
offsetMatrixInv      = A⁻¹                    model → canonical
inverseModelMatrix   = M⁻¹                    world → model
modelOffsetMatrix    = M·A                    canonical → world
uWorldToCanon        = A⁻¹·M⁻¹   (= offsetMatrixInv · inverseModelMatrix)
```

Subtlety ✅: the cube is captured around the **bounding-box centre** `c` (the bake subtracts `c` before applying `A⁻¹`), but the shader transforms *without* subtracting it. So in the shader, the cube's centre is at `centerOffset = A⁻¹·c`, and every cube lookup direction is `normalize(p − centerOffset)`. Runtime check on `D5`: `c = (0.0028, 13.5511, −0.0232)`, minor axis `(−0.0005, −1, 0.0014)` ⇒ `centerOffset.z = −13.55/4.779 = −2.835`, and the bundle reports `centerOffset = (−0.001, −0.001, −2.835)`. ✅

---

## 4. Stage 1 — Asset preparation (once per stone shape)

### 4.1 Orchestration ✅

`DiamondPlugin.prepareDiamondMesh(mesh, {cacheKey, normalMapRes})` (`:57817`):

1. `cacheKey' = cacheKey + ";" + geometry.uuid` (or just the uuid).
2. `_computeOffsets(geometry)` → `geometry.userData.normalsCaptureOffsets = {center, offsetMatrix, offsetMatrixInv, radius: 1, centerOffset}`.
3. `NormalsCapture.captureNormalMap(geometry, cacheKey', res)` (`:57050`): if any key in the `;`-separated list already has a render target, reuse it; otherwise create `WebGLCubeRenderTarget(res)` (**RGBA, HalfFloat, NearestFilter, no mipmaps**), render the six faces, and cache it under every key. It re-renders on `contextRestored`, and disposes itself when its last geometry is disposed.

It runs (a) when the glTF extension marks a mesh, (b) on every `materialChanged` event for a diamond material whose mesh has no capture yet, and (c) when `makeDiamond()` converts a material.

### 4.2 Shape alignment (`al()`, `:57204`) ✅ — **reproduced independently and matched**

```text
n  = vertex count;  μ = mean of all vertex positions
C  = (1/n) Σ (p − μ)(p − μ)ᵀ                              3×3 covariance (population, 1/n)
(λ0 ≥ λ1 ≥ λ2, v0, v1, v2) = eigen-decomposition of C     (library `pca-js` → SVD; sorted descending)
com = area-weighted centroid of the triangle centroids     (the "centre of mass" of the SURFACE)
f   = normalize(com − μ)
if  f · v2 < 0 :  flip v1 and v2                           (fixes the sign of the minor axis)
R   = three.js boundingSphere.radius                       (centre = bbox centre; radius = max distance to a vertex)
A   = [ v0  v1  v2 ] · R                                   (columns; uniform scale R)
```

Fallbacks and repairs (✅):

- signed volume `V = Σ a·(b×c)/6` over triangles; **if `V < 0` every vertex normal is negated** ("Negative Volume, Fixing Normals").
- if `position.count/3 > 500` (> 1500 vertices) it falls back to `nl()` (`:57123`) — an alignment based on the mean face normal and the first sufficiently long edge — and warns that "Mirror/Topology issues will not be fixed".

For a round brilliant `λ0 ≈ λ1` (two horizontal axes) and `λ2` is the **vertical** axis. Measured on `D5`: eigenvalues **(9.046, 8.534, 1.167)**, `v2 = (−0.0005, −1, 0.0014)` (pointing along −Y in model space). ✅

**Verification of my port.** I implemented the procedure with a Jacobi eigen-solver (§13.2) and compared it with the bundle's own `normalsCaptureOffsets` for `D5` at runtime: the three axis directions agree with dot-products **1.00000, 1.00000, 1.00000**, the radius agrees (4.77922 vs 4.77922), the bounding-box centre agrees (0.0028, 13.5511, −0.0232). ✅

Consequences worth knowing:

- Canonical **z = vertical**; canonical **y = the second horizontal axis**. `squashFactor` divides the canonical-y component, so for a round stone it squashes an *arbitrary horizontal* direction, not height 🔶.
- The sign of `v0` comes from the SVD and is arbitrary; handedness of `A` is not enforced by the bundle (it happened to be right-handed on `D5`: `det = +R³`). My port enforces `v1 = v2 × v0`.
- Because the canonical frame depends on PCA, round stones have an arbitrary azimuthal orientation. This is harmless **only because** exit directions are rotated back to world space with `M·A` before the environment lookup (`DIA_ORIENT_ENVMAP = 0`) ✅.

### 4.3 The bake ✅

Capture material (`tl`, `:57105`), drawn once per cube face with a `CubeCamera` (near 1e-4, far 100) located at the origin, `side = DoubleSide`, depth test on:

```text
vertex:   vNormal   = normalize( A⁻¹ · vec4(normal, 0) ).xyz
          vecPos    = ( modelMatrix · A⁻¹ · vec4(position − center, 1) ).xyz      // capture mesh sits at the origin, identity model matrix
          gl_Position = projection · modelView · A⁻¹ · (position − center)
fragment: n = normalize(vNormal);   out = ( n·0.5 + 0.5 ,  length(vecPos)/radius )         // radius = 1
```

- Each texel stores, for direction `d` from the centre, the **nearest** surface hit seen from the centre: normal in `rgb`, distance in `a` (canonical units; `radius = 1`).
- `A⁻¹·normal` is exact because `A` is rotation × *uniform* scale; the shader re-normalises.
- HalfFloat is required: `a` is a real distance, not 8-bit.
- **Nearest filtering is deliberate** (✅ `minFilter 1003`): filtering across a facet edge would average two normals/distances.

Independent improvements (recommended, 🔶): use near ≈ 0.01 and far ≈ 4 instead of 1e-4/100 (the bundle's ratio of 10⁶ gives a depth-buffer resolution around 1.5e-4 at distance 0.5 on a 24-bit buffer; harmless in practice but needlessly coarse), and bake at 256–512.

### 4.4 Cube-face convention (important when you write your own)

The bake and the lookup must agree. Use the GL cube-map table: render face `f` with a camera at the origin looking along `forward` with `up = tcDir` (the table's `tc` axis); then `texture(cube, d)` with the plain direction `d` returns that face's texel.

| face | forward | up |
|---|---|---|
| +X | (1,0,0) | (0,−1,0) |
| −X | (−1,0,0) | (0,−1,0) |
| +Y | (0,1,0) | (0,0,1) |
| −Y | (0,−1,0) | (0,0,−1) |
| +Z | (0,0,1) | (0,−1,0) |
| −Z | (0,0,−1) | (0,−1,0) |

(Equivalent to the `sc/tc/ma` table in the Gold document §12.3. Verified on hardware, §15.)

---

## 5. Stage 2 — The distance-cube ray intersection

Goal: given a ray origin `o` (a point inside or on the stone) and direction `d`, both in **canonical** space, find where it leaves the stone. The stone is represented only by `cube(dir) = (n, dist)`.

### 5.1 Algorithm ✅ (`intersect`, shader at `:57371`)

```text
sphereGuess(o, d):                                // proxy ellipsoid around centerOffset
    o  −= centerOffset
    d.y /= squashFactor
    A = d·d ;  B = 2 o·d ;  C = o·o − radius²
    Δ = B² − 4AC
    if Δ > 0:
        t = max( (−B + √Δ), (−B − √Δ) ) · geometryFactor / A          // far root, scaled by 0.5
        d.y *= squashFactor
        return o + centerOffset + d·t
    return (0,0,0)

intersect(o, d):
    p0 = sphereGuess(o, d)
    for k in 1..2:                                                     // two refinements
        dir   = normalize(p_prev − centerOffset)
        (n, a) = cube(dir)
        plane = { point  : centerOffset + dir · a·radius ,  normal : −normalize(n·2 − 1) }
        p_prev = rayPlane(o, d, plane)                                  // o + d · (n·(P − o)) / (n·d)
    return p_prev
```

Interpretation 🔶:

1. `sphereGuess` returns a point *inside* the stone along the ray (half the way to the far side of the unit sphere).
2. That point defines a direction from the centre; the cube returns the facet the centre sees in that direction (its plane = point + normal).
3. Intersecting the *true ray* with that facet plane gives a better hit; repeat once with the new direction. It is a two-iteration fixed-point / secant-like scheme on a **distance impostor** — compare Szirmay-Kalos et al., *Approximate Ray-Tracing on the GPU with Distance Impostors* (CGF 2005), the closest published relative I know of (similarity only; I could not verify the bundle's authors drew on it).

### 5.2 Measured accuracy (my CPU port, real stone `D5`)

Setup (✅ run in the live page): stone `D5` (318 triangles), cube baked on the CPU at 128² with Nearest lookup, **3000 random entry rays** (random facet point, random inward-facing incident direction → Snell refraction, n = 2.42), compared with **exact** ray–mesh tracing (Möller–Trumbore against all 318 triangles). Path rules as in §6 (TIR/refract at each hit, 6 bounces max).

| Result | Value |
|---|---|
| exact paths that exit within 6 bounces | 2190 / 3000 (73 %) |
| exact paths still trapped after 6 bounces (they hit the TIR "dump" branch) | 810 / 3000 (27 %) |
| first-exit bounce histogram (exact), bounces 0…5 | 275, 684, 733, 252, 144, 102 |
| **2 refinements:** same first-exit bounce as exact | **90.5 %** |
| … exit direction error, median / p90 / p99 | **0° / 0.06° / 29°**; 96.4 % below 1° |
| **1 refinement:** same first-exit bounce | **73.6 %** |
| … exit direction error p90 | 16.5°; 86.4 % below 1° |

Reading: when the approximation picks the right facet the direction is essentially exact (median 0°, p90 0.06°); the residual error is a ~3.5 % tail of wrong-facet picks near facet edges. **The second refinement is essential.** More refinements (3) are a cheap candidate improvement 🔶 (not measured). Roughly a quarter of rays are still inside after six bounces — the final-bounce energy dump (§6, step 7) therefore carries real weight in the final image.

---

## 6. Stage 3 — The fragment algorithm

### 6.1 Vertex stage ✅ (`:57369`)

```text
vWorldNormal   = ( modelMatrix · vec4(normal, 0) ).xyz       // NOT inverse-transpose: assumes uniform scale
vWorldPosition = worldPosition.xyz
```
(+ `vViewPosition`, `vNormal`, `vUv`, unused by the fragment logic). `side = DoubleSide`.

### 6.2 Fragment `main()` ✅ (`:57371`)

```text
N   = normalize(vWorldNormal)                                // facet normal (interpolated; flat on well-prepared stones)
V   = normalize(vWorldPosition − cameraPosition)             // incident direction, camera → surface
f0  = ((2.4 − 1)/(2.4 + 1))² = 0.16955                        // hard-coded 2.4, independent of refractiveIndex
R   = reflect(V, N)
Fr  = F(|N·R|)                                                // §7.2, roughness 0
refl = envMapIntensity · EnvReflect(R) · Fr · reflectivity · 2
refr = refractionColor(vWorldPosition, V, N)                 // below
rgb  = refr + refl                                           // `diffuseColor` is literally vec3(1); material.color is NOT used here
rgb  = pow(rgb, γ)
gl_FragColor = LinearToRGBM(rgb, 16)
```

### 6.3 `refractionColor` ✅

```text
att = 1
d   = refract(V, N, 1/n)                                      // entering the stone
att *= 1 − F(|d·N|)                                           // transmission at entry — uses the TRANSMITTED angle (see §10)
d   = normalize( (A⁻¹·M⁻¹ · vec4(d, 0)).xyz )                 // → canonical
o   =           (A⁻¹·M⁻¹ · vec4(worldPos, 1)).xyz
out = 0
repeat RAY_BOUNCES times  (i = 0 … B−1):
    hit  = intersect(o, d)                                    // §5
    dist = hit − o
    c    = normalize(hit − centerOffset)
    Nm   = −normalize( cube(c).rgb·2 − 1 )                    // INWARD normal at the hit
    att *= exp( −(|dist|/radius) · κ · (1 − color) )          // Beer–Lambert, per RGB channel
    o    = hit ;   dOld = d
    d    = refract(dOld, Nm, n)                               // leaving: η = n/1

    if  dot(d,d) < 1e-4 :                                      // total internal reflection (GLSL refract returned 0)
        d = reflect(dOld, Nm)                                  // lossless: att unchanged
        if i == B−1:                                           // out of bounces → dump the remaining energy
            out += EnvExit(dOld) · att · cc · boost · (1 − F(|−dOld·Nm|))
    else:                                                      // some light escapes here
        T   = 1 − F(|d·Nm|)                                    // d = exit direction in air
        (transmission>0 branch omitted — unused here)
        dR  = refract(dOld, Nm, n + Δn) ;  dG = d ;  dB = refract(dOld, Nm, n − Δn)
        out += vec3( EnvExit(dR).r , EnvExit(dG).g , EnvExit(dB).b ) · T · att · cc · boost
        d    = reflect(dOld, Nm)                               // what stays inside
        att *= F(|d·Nm|) · boost                               // reflected fraction, boost-compensated
return out
```

`cc` = `colorCorrection`, `boost` = `boostFactors`, `Δn` = `rIndexDelta` = `dispersion`.

### 6.4 Environment helpers ✅

```text
rotY(d, θ):         ( cosθ·d.x + sinθ·d.z ,  d.y ,  −sinθ·d.x + cosθ·d.z )
sampleEnvMap(d):    d = rotY(d, envMapRotation) ;  d = −d                      // all three components
                    ENV_MAP_TYPE 1:  u = atan2(d.z, d.x)/(2·PI) + 0.5 ,  v = asin(d.y)/PI + 0.5 ;  texture2D(envMap, uv)
EnvReflect(d):      [FIX_ENV: d = (viewMatrix · vec4(d,0)).xyz] ;  return envMapIntensity · sampleEnvMap(d)
EnvExit(d):         [DIA_ORIENT<1: d = mat3(M·A) · d]  [FIX_ENV: d = (viewMatrix · vec4(d,0)).xyz]
                    d = normalize(d) ;  d.x *= −1 ;  d.z *= −1 ;  return envMapIntensity · sampleEnvMap(d)
```

Net effect of the sign gymnastics: `EnvReflect` samples the **negated** direction; `EnvExit` samples the direction with **only y negated** (x and z flip twice; a Y-rotation commutes with that flip). Both fetch with plain `texture2D` (no LOD, no prefilter).

### 6.5 Why the energy bookkeeping behaves as it does 🔶

- **TIR is free of loss.** Every internal hit at an angle beyond 24.4° from the facet normal reflects without touching `att`. Because entry refraction confines the first internal ray to a cone around the inward normal (§7.3), the first hit is often *inside* the critical cone and leaks light; later hits (after reflecting off other facets at steeper angles) are mostly TIR.
- **Boost compounds.** In every non-TIR bounce `att *= F·boost`; with `boost = 2` and `F ≈ 0.17–0.4` the reflected fraction is 0.35–0.8 instead of 0.17–0.4. This is an artistic energy compensation: real diamond keeps a lot of light inside.
- **Dispersion is a last-surface effect.** Only the *exit* of each bounce is split into three slightly different directions; entry and internal paths are shared by all colours.

---

## 7. Optics: equations and worked numbers

### 7.1 Snell, reflection, TIR

```
refract(I, N, η) = η·I − ( η·(N·I) + √(1 − η²(1 − (N·I)²)) )·N         zero vector if the radicand < 0
reflect(I, N)    = I − 2 (N·I) N
```

- Entering: `η = 1/n = 0.4132`. **Maximum refraction angle on entry = asin(1/n) = 24.41°** — all rays that enter a facet travel inside a cone of half-angle 24.4° around its inward normal.

| incidence (air) | 0° | 15° | 30° | 45° | 60° | 75° | 89° |
|---|---|---|---|---|---|---|---|
| refracted angle (n = 2.42) | 0 | 6.1° | 11.9° | 17.0° | 21.0° | 23.5° | 24.4° |

- Leaving: `η = n`; the radicand is negative (TIR) when the internal incidence exceeds **24.41°**.
- For an isotropic, cosine-weighted flux at a facet, `cos²(24.41°) = 83 %` is beyond the critical angle — a stone traps most light (this is the source of brilliance), and it matches the measured 27 % of paths still inside after six bounces ✅.

### 7.2 Fresnel as used ✅

`F(μ) = f0·A(μ) + B(μ)` with Karis's analytic fit at roughness 0:

```
a(μ) = min(1, 2^(−9.28·μ)) + 0.0425 ;   A = 1.04 − 1.04·a ;   B = 1.04·a − 0.04 ;   μ = |N·dir|
f0 = 0.16955  (n = 2.4 hard-coded;  the "true" f0 for n = 2.42 is 0.17239)
```

| μ = cosθ | 1.0 | 0.7 | 0.5 | 0.3 | 0.2 | 0.1 | 0.05 | 0 |
|---|---|---|---|---|---|---|---|---|
| `F` | 0.174 | 0.183 | 0.208 | 0.298 | 0.412 | 0.627 | 0.799 | **1.037** |
| `1 − F` | 0.826 | 0.817 | 0.792 | 0.702 | 0.588 | 0.373 | 0.201 | **−0.037** |

`F` slightly exceeds 1 at exact grazing (the fit is not clamped), so `1 − F` can be negative in the last few percent of grazing angles; such pixels can produce a negative `rgb`, and `pow(negative, γ)` is undefined in GLSL (NaN). The bundle does not guard this ✅; the reference code clamps (§13.6).

Where the angle is taken (✅ from the call arguments):

| Use | Direction passed as `viewDir` | Physical meaning |
|---|---|---|
| surface reflection | reflected ray `R` | incident angle in air ✓ |
| entry transmission | *refracted* ray `d` | the angle **inside** the stone (a mild under-estimate of Fresnel reflectance vs. using the air-side angle) 🔶 |
| exit transmission | exit ray `d` (in air) | angle in air = Schlick's recommended angle for dense→light interfaces ✓ |
| internal reflection (non-TIR) | reflected ray in the stone | internal-side angle 🔶 |

### 7.3 Beer–Lambert absorption

`T(path) = exp(−κ · (d/R) · (1 − color))` per channel, `d` in canonical units (`R = 1`, the bounding-sphere radius). With `color = 0.7758` (linear for `#e4e4e4`; ✅ read from the uniform) the extinction is `σ = 0.2242` per unit:

| κ \ chord length (canonical units) | 0.5 | 1 | 2 | 4 |
|---|---|---|---|---|
| 1 | 0.894 | 0.799 | 0.638 | 0.408 |
| 3 | 0.714 | 0.510 | 0.260 | 0.068 |
| 6 | 0.510 | 0.260 | 0.068 | 0.005 |

A white stone has the same σ on R, G and B; a coloured stone (`color = (1, 0.2, 0.2)` etc.) absorbs per channel, which is how rubies/sapphires/champagne are produced with this shader. ✅ (measured: κ = 6 cuts the stone's mean brightness by 51 %).

### 7.4 Dispersion as implemented

`dR = refract(dOld, Nm, n + Δn)`, `dB = refract(dOld, Nm, n − Δn)`: for `Δn = 0.004` the exit-direction difference between R and B is a fraction of a degree at ordinary facet angles and grows steeply near the critical angle. The *sign* is inverted relative to physical dispersion (blue should have the higher index) ✅🔶 — see §10. Real diamond dispersion is `n_B − n_R ≈ 0.044` between the C and G Fraunhofer lines; the viewer's total spread is `2Δn = 0.008`, a fifth of that — an art-directed, subtle fire.

---

## 8. The environment map

### 8.1 What is bound ✅

- `gem-000.hdr`: Radiance RGBE, **512×512**, "Made with Adobe Photoshop", loaded as HalfFloat RGBA, `srgb-linear`, `mapping UVMapping(300)`, LinearFilter, **no mipmaps**, `flipY`, `rotation 0`.
- Bound to `Diamond.envMap` by `index.html`; `getEnvMaps()` returns it for slot 0 (`[envMap, envMap2, envMap3]`; `forceSceneEnvMap` would return the scene environment instead).
- Interpreted as an **equirect with u = azimuth, v = elevation**, although it is square. The image content is authored for that stretch (🔶; the bundle does nothing about the aspect ratio).

### 8.2 Statistics (decoded with the §13.1 decoder; round-trip checked on real data) ✅

| | `gem-000.hdr` |
|---|---|
| mean luminance / mean RGB | 0.667 / (0.626, 0.675, 0.701) — slightly **cool** |
| median / p90 / p99 / p99.9 | 0.36 / 0.63 / 10.65 / 36.9 |
| maximum | **214.3** |
| pixels with L > 1 / 2 / 8 | 3.1 % / 2.3 % / **1.2 %** |
| share of total energy in pixels > 2 | **47.4 %** |
| upper / lower half luminance | 1.25 |

**This is a "sparkle map":** a dim background (median 0.36) with a sparse set of extremely bright points/areas (up to 214). Each exit ray is a single bilinear fetch of this map, so a ray either hits a hot spot (a white flash after tone mapping, and a candidate for bloom: the bloom threshold is 2.0) or the dim base. The statistics explain why diamonds read as "mostly dark facets with bright flashes".

### 8.3 Consequences

| Property | Effect |
|---|---|
| Resolution (512²) | one texel = 0.7° of azimuth, 0.35° of elevation. Spot sizes of 1–3 texels ⇒ sparkle size; low resolution ⇒ blocky/aliased flashes; the 32-frame jitter accumulation smooths this. |
| No prefilter / no mips | exit lookups never blur; a **minified** (far/small) stone would alias — the bundle has no mitigation. 🔶 add a small mip bias or a second pre-blurred env for small stones. |
| Camera-fixed (`FIX_ENV_DIRECTION`) | directions go through `viewMatrix`: the sparkle pattern depends on the stone's orientation *relative to the camera*, so orbiting makes facets flash as the stone turns through the fixed pattern. |
| HDR range | values up to 214 fit half-float; the RGBM output (range 16) then clips the final sum. |
| `envMapIntensity 1.6` | pure gain on both exit and reflection samples. |
| No lights needed | nothing else illuminates a diamond here. |

### 8.4 Authoring a replacement environment 🔶

Aim for the same character: dark/neutral base (0.2–0.6), 1–2 % of pixels at 10–200 as discs or soft-boxes of 2–6 texels, a few large mid-intensity regions, slightly cool tint, resolution ≥ 512×512, and keep the aspect ratio consistent with the mapping you implement. If you switch to a true 2:1 equirect, remember the u/v scaling changes the apparent spot size.

---

## 9. Geometry requirements (and the evidence)

Verified on `D5` (`window.__stone`, real runtime geometry) ✅:

| Property | `D5` measured |
|---|---|
| vertices / triangles | 597 / 318 (indexed) |
| open edges / non-manifold edges | **0 / 0** (477 unique edges = 3·318/2 ⇒ closed) |
| signed volume | **+163.27** (positive ⇒ outward winding) |
| triangles whose 3 vertex normals are identical | **314 / 318** |
| triangles whose vertex normal equals the geometric face normal (dot > 0.999) | **314 / 318** (largest deviation 0.020) |
| attributes | `position, normal, uv` |

⇒ **The stones are flat-shaded**: normals are per facet, vertices are duplicated at facet edges.

| Requirement | Why | Failure if violated | Tag |
|---|---|---|---|
| Closed (watertight), manifold | the bake looks for the *nearest* surface from the centre; volume sign relies on a closed mesh | holes ⇒ rays escape; wrong volume sign | ✅ |
| Outward winding / normals | volume check inverts normals automatically (`:57252`); the shader assumes `−n` is inward | inverted refraction | ✅ |
| **Flat per-facet normals** | entry refraction uses the interpolated `vWorldNormal`; the bake interpolates `vNormal` inside each triangle — smooth normals would round the facets | soft, "plastic" look, wrong internal paths | ✅ (measured on the real stone) |
| Star-shaped about the bbox centre | the cube holds exactly one `(n, dist)` per direction | undercuts/inclusions are invisible to rays | ✅ structure, 🔶 impact |
| Single mesh per stone, uniform scale | `vWorldNormal` is not normal-matrix corrected | skewed refraction under non-uniform scale | ✅ |
| ≤ ~1500 vertices | otherwise `al()` silently uses the weaker `nl()` alignment | misaligned canonical frame | ✅ |
| Triangle count | shading cost does **not** depend on it (only rasterisation) | — | ✅ |
| Share bakes | identical stones should share `cacheKey`; the 45 stones of this ring use 3 materials and share cubes by key | 12.6 MB per 512² cube if not shared | ✅/🔶 (arithmetic) |

Checklist validator (§13.7) automates the edge-manifold, volume, flat-normal and "facets face away from the centre" tests.

---

## 10. Quirks of the original and the `LEGACY_COMPAT` switch

Everything below is ✅ in the source. The reference shader (§13.5) reproduces them when `LEGACY_COMPAT = 1` and offers a corrected behaviour when `0`.

| # | Original behaviour | Impact | `LEGACY_COMPAT 0` |
|---|---|---|---|
| 1 | `f0` is computed from a literal `2.4`, not `refractiveIndex` | RI changes bend rays but not reflectance; small at 2.42 (0.1696 vs 0.1724) | `f0 = ((n−1)/(n+1))²` |
| 2 | `#define PI 3.1428` | 0.035 % skew of the equirect u/v | `3.14159265` |
| 3 | `diffuseColor = vec3(1)`: `color` only tints absorption | white stone can never be "coloured" on the surface | keep (it is a design feature) |
| 4 | `boost` applies to outputs *and* compounds inside `att` | big brightness lever, non-physical | keep as parameter; document |
| 5 | dispersion: R uses `n+Δn`, B uses `n−Δn` | inverted spectral order | R uses `n−Δn`, B uses `n+Δn` |
| 6 | env sign conventions differ: reflection samples `−d`, exit samples `(x,−y,z)·d` | must be copied exactly to match the same HDR | unify in one `sampleGemEnv(dir, kind)` |
| 7 | `vWorldNormal = modelMatrix·n` (no normal matrix) | wrong under non-uniform scale | use `normalMatrix` |
| 8 | `1−F` unclamped, `F` up to 1.037 | negative transmission at extreme grazing; NaN after `pow` | clamp `0…1`; clamp output ≥ 0 |
| 9 | last bounce TIR dumps energy along `dOld` (the *incoming* direction), not the reflected one | the "trapped" 27 % of paths is rendered by sampling the env in the direction the ray was *already heading* | optionally sample along the reflected direction |
| 10 | zero-vector `normalize` hazard if `refract(dOld,Nm,n±Δn)` returns 0 where `refract(dOld,Nm,n)` does not (near the critical angle) | NaN env lookup | fall back to `d` |
| 11 | entry Fresnel uses the transmitted angle (§7.2) | slightly brighter entry | use incident angle |
| 12 | `squashFactor` acts on canonical y (an arbitrary horizontal axis for round stones) | meaningless asymmetry | squash canonical **z** (vertical) or drop |
| 13 | rotation sign differs from the metal material's `rotY` (here `x' = c·x + s·z`, metal `x' = c·x − s·z`) | only matters if you share one rotation control | keep per-environment |
| 14 | `rayBounces` is a **compile-time** constant | changing quality recompiles | specialisation constant / variant cache |

---

## 11. Visual effects

| Visual | Mechanism | Evidence |
|---|---|---|
| **Brilliance / flashes** | exit rays that land on the bright 1 % of the 512² gem map; ≈ half the map's energy is above 2.0 | §8.2 |
| **Dark facets ("extinction")** | rays that exit toward dim map regions, or that stay trapped | 27 % of paths unresolved after 6 bounces ✅ |
| **Fire (colour fringes)** | R/B exit rays differ by `Δn` in direction ⇒ they hit different texels of the map | `dispersion 0.03` shifts hue, mean barely moves (195.9 vs 194.2) |
| **Surface sparkle (top reflection)** | `refl = intensity · Env(R) · F · reflectivity · 2`; `reflectivity 0 ⇒` stone mean −9.5 % | ✅ measured |
| **Depth / "inner glow"** | the loop of 6 bounces with absorption; increasing `κ` darkens strongly, increasing bounces beyond ~6 changes little | κ = 6 ⇒ −51 %; bounces 10 ≈ 6 ✅ |
| **Overall brightness** | `boost` and `envMapIntensity`; `boost 1` ⇒ −17 % | ✅ |
| **Contrast** | `γ = 1.09` ⇒ darks darker; `γ = 1` ⇒ +1.5 % | ✅ |

Measured on `D5` (mean 8-bit sRGB over a 200×200 region, 34 converged frames):

| Change | R / G / B |
|---|---|
| baseline | 194.2 / 187.5 / 176.6 |
| `rayBounces` 1 | 190.5 / 187.4 / 180.6 (cooler) |
| `rayBounces` 3 / 10 | 191.6 / 185.7 / 175.4 · 192.4 / 185.5 / 174.4 |
| `dispersion` 0.03 | 195.9 / 188.1 / 176.6 |
| `gammaFactor` 1.0 | 197.2 / 190.2 / 179.0 |
| `boostFactors` 1 | 160.8 / 155.0 / 144.3 |
| `reflectivity` 0 | 175.7 / 169.4 / 158.3 |
| `absorptionFactor` 6 | 94.8 / 88.3 / 78.2 |
| `refractiveIndex` 1.5 | 206.8 / 200.2 / 190.5 |

---

## 12. Performance and mobile

| Item | Cost (derived or measured) |
|---|---|
| Fragment fetches @ B bounces | `3·B` cube + up to `3·B` env + 1 env (reflection) ⇒ **37 at B = 6** |
| ALU per bounce | ≈ 1 sphere solve, 2 ray-plane solves, 3 `refract`, 1 `reflect`, 1 `exp(vec3)`, 3 Fresnel evaluations |
| Frame cost (hidden pane, synchronised) | 7.05 ms/frame with stones vs 5.49 ms without; `rayBounces 1` 4.89 ms, `12` 6.62 ms. Stones cover a small area here — cost scales with covered pixels (zooming in raises it) |
| Memory | one 512²×6×RGBA16F cube = 12.6 MB per distinct shape; 256² ⇒ 3.1 MB |
| Program | the fragment shader is ~10 KB of GLSL; one program per `(RAY_BOUNCES, ENV_MAP_TYPE, DIA_ORIENT, FIX_ENV)` combination |

Mobile guidance 🔶: bounces 3–4 (the measured mean converges by 3–6), cube 256², render scale 1.0, drop dispersion's 3 env fetches to one when `Δn ≈ 0` (saves 2·B fetches), fall back to a single "average" environment lookup beyond a distance threshold, and keep the accumulation (it hides the noisy facet picks).

---

## 13. Reference implementation

> Independent code. GLSL ES 3.00 / WebGL2 and plain JS. `#include` below is a convention for the files in this document; resolve it with string concatenation. Section 15 lists what was compile-checked.

### 13.1 RGBE decoding

Use `decodeRGBE` from `Gold_Metal_Rendering_Complete.md` §12.2 (verified on both `.hdr` files). For the gem map upload it so that texel row 0 = **bottom** (`v = 0`, elevation −90°), RGBA16F or RGB32F, linear filtering, no mips, `CLAMP_TO_EDGE` (U may use `REPEAT`).

### 13.2 Shape alignment (JS) — **matches the bundle's matrix on `D5` (dot products 1.0)**

```js
// stone-align.mjs
export function jacobiEigen3(S) {                    // symmetric 3×3 → eigenvalues (desc) + eigenvectors
  const a = S.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-30) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  const vals = [a[0][0], a[1][1], a[2][2]], vecs = [0, 1, 2].map(i => [V[0][i], V[1][i], V[2][i]]);
  const o = [0, 1, 2].sort((i, j) => vals[j] - vals[i]);
  return { values: o.map(i => vals[i]), vectors: o.map(i => vecs[i]) };
}

// pos: Float32Array xyz ; index: Uint16/32Array or null.  Returns everything the shader and the bake need.
export function alignStone(pos, index) {
  const n = pos.length / 3, mean = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mean[k] += pos[3 * i + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const d = [pos[3 * i] - mean[0], pos[3 * i + 1] - mean[1], pos[3 * i + 2] - mean[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r][c] += d[r] * d[c] / n;
  }
  const { values, vectors } = jacobiEigen3(C);
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], T = index ? index.length / 3 : n / 3;
  let area = 0; const com = [0, 0, 0]; let volume = 0;
  for (let t = 0; t < T; t++) {
    const [a, b, c] = (index ? [index[3 * t], index[3 * t + 1], index[3 * t + 2]] : [3 * t, 3 * t + 1, 3 * t + 2]).map(P);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ar = 0.5 * Math.hypot(...cr); for (let k = 0; k < 3; k++) com[k] += ar * (a[k] + b[k] + c[k]) / 3; area += ar;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  for (let k = 0; k < 3; k++) com[k] /= area;
  const f = [com[0] - mean[0], com[1] - mean[1], com[2] - mean[2]]; const fl = Math.hypot(...f) || 1;
  let [c0, , c2] = vectors;
  if ((f[0] * c2[0] + f[1] * c2[1] + f[2] * c2[2]) / fl < 0) c2 = c2.map(x => -x);                 // sign of the minor axis
  const c1 = [c2[1] * c0[2] - c2[2] * c0[1], c2[2] * c0[0] - c2[0] * c0[2], c2[0] * c0[1] - c2[1] * c0[0]]; // right-handed
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[3 * i + k]); mx[k] = Math.max(mx[k], pos[3 * i + k]); }
  const center = mn.map((m, k) => (m + mx[k]) / 2); let R = 0;
  for (let i = 0; i < n; i++) R = Math.max(R, Math.hypot(pos[3 * i] - center[0], pos[3 * i + 1] - center[1], pos[3 * i + 2] - center[2]));
  // A (canonical→model, column-major 4×4) = [c0 c1 c2]·R ;  A⁻¹ = [c0 c1 c2]ᵀ / R
  const A = [c0[0]*R,c0[1]*R,c0[2]*R,0,  c1[0]*R,c1[1]*R,c1[2]*R,0,  c2[0]*R,c2[1]*R,c2[2]*R,0,  0,0,0,1];
  const Ainv = [c0[0]/R,c1[0]/R,c2[0]/R,0,  c0[1]/R,c1[1]/R,c2[1]/R,0,  c0[2]/R,c1[2]/R,c2[2]/R,0,  0,0,0,1];
  const centerOffset = [0, 1, 2].map(r => [c0, c1, c2][r][0] * center[0] / R + [c0, c1, c2][r][1] * center[1] / R + [c0, c1, c2][r][2] * center[2] / R);
  return { A, Ainv, center, centerOffset, radius: 1, R, eigenvalues: values, volume, flipNormals: volume < 0 };
}
```

Per-draw uniforms (column-major 4×4 helpers assumed): `uWorldToCanon = Ainv · inverse(M)`; `uCanonToWorld = mat3(M · A)`; `uCenterOffset = centerOffset`.

### 13.3 Bake shaders

```glsl
// === FILE: bake.vert ===
#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uFaceViewProj;   // perspective(90°, 1, 0.01, 4) * lookAt(0, forward, up)  — table in §4.4
uniform mat4 uAinv;           // offsetMatrixInv  (model → canonical)
uniform vec3 uCenter;         // bbox centre in model space
out vec3 vN;
out vec3 vP;
void main() {
  vec3 p = (uAinv * vec4(aPosition - uCenter, 1.0)).xyz;     // capture frame: centred, unit-ish
  vP = p;
  vN = (uAinv * vec4(aNormal, 0.0)).xyz;                      // rotation × uniform scale ⇒ normalised later
  gl_Position = uFaceViewProj * vec4(p, 1.0);
}
```

```glsl
// === FILE: bake.frag ===
#version 300 es
precision highp float;
in vec3 vN;
in vec3 vP;
layout(location = 0) out vec4 outColor;     // RGBA16F cube face
void main() {
  // OUTWARD normal (do NOT flip by gl_FrontFacing: we look at the inside of the stone, the shader negates it later)
  outColor = vec4(normalize(vN) * 0.5 + 0.5, length(vP));   // a = distance in canonical units (radius = 1)
}
```

Host: for each of the 6 faces attach it to an RGBA16F framebuffer (cube-face target) with a depth renderbuffer, `DoubleSide` (cull off), depth test `LESS`, clear colour `(0.5,0.5,1,1)`, draw all triangles. Cube texture parameters: `NEAREST`, no mips, `CLAMP_TO_EDGE`.

### 13.4 Shared GLSL for the diamond

```glsl
// === FILE: diamond-common.glsl ===
const float RGBM_RANGE = 16.0;
float max3(vec3 v) { return max(max(v.x, v.y), v.z); }
vec4 encodeRGBM(vec3 c) {
  float m = clamp(max3(c) / RGBM_RANGE, 0.0, 1.0);
  m = ceil(m * 255.0) / 255.0;
  return vec4(c / (max(m, 1e-6) * RGBM_RANGE), m);
}
// Karis DFG at roughness 0 → Fresnel for the stone.   F(μ) = f0·A + B
float fresnelStone(float mu, float f0) {
  float a = min(1.0, exp2(-9.28 * abs(mu))) + 0.0425;
  return f0 * (1.04 - 1.04 * a) + (1.04 * a - 0.04);
}
```

### 13.5 Diamond material shader

```glsl
// === FILE: diamond.vert ===
#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMatrix;      // LEGACY: mat3(uModel)  ·  modern: inverse-transpose(mat3(uModel))
out vec3 vWorldPos;
out vec3 vWorldNormal;
void main() {
  vec4 w = uModel * vec4(aPosition, 1.0);
  vWorldPos = w.xyz;
  vWorldNormal = uNormalMatrix * aNormal;
  gl_Position = uViewProj * w;
}
```

```glsl
// === FILE: diamond.frag ===
#version 300 es
precision highp float;
precision highp int;
precision highp samplerCube;

#ifndef RAY_BOUNCES
#define RAY_BOUNCES 6
#endif
#ifndef LEGACY_COMPAT
#define LEGACY_COMPAT 1          // 1 = reproduce the original quirks (§10) ;  0 = corrected behaviour
#endif

in vec3 vWorldPos;
in vec3 vWorldNormal;
layout(location = 0) out vec4 outColor;      // RGBM-16 ; write linear into RGBA16F and drop encodeRGBM if available

// ---- per-draw -----------------------------------------------------------------------------
uniform vec3  uCameraPos;
uniform mat4  uViewMatrix;       // world → view  (camera-fixed environment)
uniform mat4  uWorldToCanon;     // A⁻¹ · M⁻¹
uniform mat3  uCanonToWorld;     // mat3(M · A)
uniform vec3  uCenterOffset;     // A⁻¹ · bboxCentre
uniform float uRadius;           // 1
uniform samplerCube uDistCube;   // rgb = outward normal·½+½ , a = distance from centre

// ---- material -----------------------------------------------------------------------------
uniform float uIor;              // 2.42
uniform float uDispersion;       // Δn = 0.004
uniform float uAbsorption;       // κ = 1
uniform vec3  uColor;            // linear absorption tint (0.7758)
uniform vec3  uBoost;            // (2,2,2)
uniform vec3  uColorCorrection;  // (1,1,1)
uniform float uReflectivity;     // 0.46
uniform float uGamma;            // 1.09
uniform float uSquash;           // 0.98
uniform float uGeomFactor;       // 0.5

// ---- environment --------------------------------------------------------------------------
uniform sampler2D uEnv;          // gem HDR, row 0 = bottom, bilinear, no mips
uniform float uEnvIntensity;     // 1.6
uniform float uEnvRotation;      // radians
uniform float uEnvFixedToView;   // 1.0

#include "diamond-common.glsl"

#if LEGACY_COMPAT
const float PI_ENV = 3.1428;
#else
const float PI_ENV = 3.141592653589793;
#endif

// ---- environment sampling (conventions of §6.4) -------------------------------------------
vec3 rotY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z); }
vec3 sampleEnv(vec3 d) {
  d = -rotY(d, uEnvRotation);
  vec2 uv = vec2(atan(d.z, d.x) / (PI_ENV * 2.0) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI_ENV + 0.5);
  return texture(uEnv, uv).rgb;
}
vec3 envReflect(vec3 d) {
  if (uEnvFixedToView > 0.5) d = (uViewMatrix * vec4(d, 0.0)).xyz;
  return uEnvIntensity * sampleEnv(d);
}
vec3 envExit(vec3 dCanon) {
  vec3 d = uCanonToWorld * dCanon;                         // DIA_ORIENT_ENVMAP = 0
  if (uEnvFixedToView > 0.5) d = (uViewMatrix * vec4(d, 0.0)).xyz;
  d = normalize(d);
  d.x = -d.x; d.z = -d.z;
  return uEnvIntensity * sampleEnv(d);
}

// ---- stone intersection (§5) --------------------------------------------------------------
vec3 sphereGuess(vec3 o, vec3 d) {
  o -= uCenterOffset;
  d.y /= uSquash;
  float A = dot(d, d), B = 2.0 * dot(o, d), C = dot(o, o) - uRadius * uRadius;
  float disc = B * B - 4.0 * A * C;
  if (disc > 0.0) {
    disc = sqrt(disc);
    float t1 = (-B + disc) * uGeomFactor / A, t2 = (-B - disc) * uGeomFactor / A;
    float t = (t1 > t2) ? t1 : t2;
    d.y *= uSquash;
    return o + uCenterOffset + d * t;
  }
#if LEGACY_COMPAT
  return vec3(0.0);
#else
  return o + uCenterOffset;
#endif
}
vec3 rayPlane(vec3 o, vec3 d, vec3 p, vec3 n) {
  float den = dot(n, d);
#if !LEGACY_COMPAT
  den = (abs(den) < 1e-6) ? 1e-6 : den;
#endif
  return d * (dot(n, p - o) / den) + o;
}
vec4 cubeFetch(vec3 d) { return texture(uDistCube, d); }
vec3 facetNormal(vec4 t) { return -normalize(t.rgb * 2.0 - 1.0); }          // inward
vec3 intersectStone(vec3 o, vec3 d) {
  vec3 hit = sphereGuess(o, d);
  for (int k = 0; k < 2; k++) {
    vec3 dir = normalize(hit - uCenterOffset);
    vec4 t = cubeFetch(dir);
    hit = rayPlane(o, d, uCenterOffset + dir * (t.a * uRadius), facetNormal(t));
  }
  return hit;
}

// ---- path through the stone (§6.3) --------------------------------------------------------
vec3 refractionColor(vec3 worldPos, vec3 V, vec3 N, float f0) {
  vec3 outC = vec3(0.0);
  vec3 att = vec3(1.0);

  vec3 d = refract(V, N, 1.0 / uIor);
  float Fin = fresnelStone(dot(d, -N), f0);                                  // transmitted-angle Fresnel (legacy)
#if !LEGACY_COMPAT
  Fin = fresnelStone(dot(-V, N), f0);                                        // incident-angle Fresnel
#endif
  att *= (1.0 - Fin);

  d = normalize((uWorldToCanon * vec4(d, 0.0)).xyz);
  vec3 o = (uWorldToCanon * vec4(worldPos, 1.0)).xyz;

  for (int i = 0; i < RAY_BOUNCES; i++) {
    vec3 hit = intersectStone(o, d);
    float dist = length(hit - o);
    vec3 c = normalize(hit - uCenterOffset);
    vec3 Nm = facetNormal(cubeFetch(c));
    att *= exp(-(dist / uRadius) * uAbsorption * (1.0 - uColor));
    o = hit;
    vec3 dOld = d;
    d = refract(dOld, Nm, uIor);

    if (dot(d, d) < 1e-4) {                                                  // total internal reflection
      d = reflect(dOld, Nm);
      if (i == RAY_BOUNCES - 1) {
        float Fr = fresnelStone(dot(-dOld, Nm), f0);
        outC += envExit(dOld) * att * uColorCorrection * uBoost * (1.0 - Fr);
      }
    } else {
      float T = 1.0 - fresnelStone(dot(d, -Nm), f0);
#if !LEGACY_COMPAT
      T = clamp(T, 0.0, 1.0);
#endif
      float dnR = uDispersion, dnB = -uDispersion;
#if !LEGACY_COMPAT
      dnR = -uDispersion; dnB = uDispersion;                                 // physical order: blue bends more
#endif
      vec3 dR = refract(dOld, Nm, uIor + dnR);
      vec3 dB = refract(dOld, Nm, uIor + dnB);
      if (dot(dR, dR) < 1e-4) dR = d;                                        // guard near the critical angle
      if (dot(dB, dB) < 1e-4) dB = d;
      outC += vec3(envExit(dR).r, envExit(d).g, envExit(dB).b) * T * att * uColorCorrection * uBoost;
      d = reflect(dOld, Nm);
      float Fr = fresnelStone(dot(d, Nm), f0);
#if !LEGACY_COMPAT
      Fr = clamp(Fr, 0.0, 1.0);
#endif
      att *= Fr * uBoost;
    }
  }
  return outC;
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vWorldPos - uCameraPos);
#if LEGACY_COMPAT
  float f0 = 0.16955;                                                        // ((2.4-1)/(2.4+1))²
#else
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
#endif
  vec3 R = reflect(V, N);
  float Fr = fresnelStone(dot(N, R), f0);
  vec3 refl = envReflect(R) * Fr * uReflectivity * 2.0;
  vec3 refr = refractionColor(vWorldPos, V, N, f0);
  vec3 rgb = max(refr + refl, vec3(0.0));                                    // guard pow() against negative values
  rgb = pow(rgb, vec3(uGamma));
  outColor = encodeRGBM(rgb);
}
```

Host values for the "as shipped" look: `uIor 2.42, uDispersion 0.004, uAbsorption 1, uColor 0.7758, uBoost (2,2,2), uReflectivity 0.46, uGamma 1.09, uEnvIntensity 1.6, uSquash 0.98, uGeomFactor 0.5, uRadius 1, RAY_BOUNCES 6, LEGACY_COMPAT 1`.

### 13.6 Per-draw uniform update (pseudocode)

```text
for each stone mesh (cube/aligned data cached by cacheKey):
    M  = mesh.matrixWorld
    uWorldToCanon = Ainv · inverse(M)
    uCanonToWorld = mat3(M · A)
    uCenterOffset = centerOffset
    uNormalMatrix = LEGACY ? mat3(M) : transpose(inverse(mat3(M)))
    uViewMatrix, uCameraPos from the camera
    uEnvRotation = env.rotation + materialOffset
    bind uDistCube (stone's cube), uEnv (gem map)
```

### 13.7 Geometry validator (JS)

```js
export function validateStone(pos, normal, index) {
  const T = index ? index.length / 3 : pos.length / 9, tri = t => index ? [index[3*t], index[3*t+1], index[3*t+2]] : [3*t, 3*t+1, 3*t+2];
  const key = i => pos[3*i].toFixed(5) + "," + pos[3*i+1].toFixed(5) + "," + pos[3*i+2].toFixed(5);
  const edges = new Map(); let flat = 0, outward = 0, volume = 0, maxDev = 0;
  const P = i => [pos[3*i], pos[3*i+1], pos[3*i+2]], N = i => [normal[3*i], normal[3*i+1], normal[3*i+2]];
  const mean = [0, 0, 0]; for (let i = 0; i < pos.length / 3; i++) for (let k = 0; k < 3; k++) mean[k] += pos[3*i+k] / (pos.length / 3);
  for (let t = 0; t < T; t++) {
    const [a, b, c] = tri(t), A = P(a), B = P(b), C = P(c);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const kk = key(p) < key(q) ? key(p) + "|" + key(q) : key(q) + "|" + key(p); edges.set(kk, (edges.get(kk) || 0) + 1); }
    const e1 = [B[0]-A[0], B[1]-A[1], B[2]-A[2]], e2 = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
    const cr = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]], l = Math.hypot(...cr) || 1, gn = cr.map(x => x / l);
    const na = N(a), nb = N(b), nc = N(c);
    const dev = Math.max(Math.hypot(na[0]-nb[0], na[1]-nb[1], na[2]-nb[2]), Math.hypot(na[0]-nc[0], na[1]-nc[1], na[2]-nc[2]));
    maxDev = Math.max(maxDev, dev); if (dev < 1e-3 && Math.abs(gn[0]*na[0] + gn[1]*na[1] + gn[2]*na[2]) > 0.999) flat++;
    const cen = [(A[0]+B[0]+C[0])/3 - mean[0], (A[1]+B[1]+C[1])/3 - mean[1], (A[2]+B[2]+C[2])/3 - mean[2]];
    if (gn[0]*cen[0] + gn[1]*cen[1] + gn[2]*cen[2] > 0) outward++;                       // facet faces away from the centre (necessary for star-shaped)
    volume += (A[0]*(B[1]*C[2]-B[2]*C[1]) - A[1]*(B[0]*C[2]-B[2]*C[0]) + A[2]*(B[0]*C[1]-B[1]*C[0])) / 6;
  }
  let open = 0, nonManifold = 0; edges.forEach(c => { if (c === 1) open++; else if (c > 2) nonManifold++; });
  return { triangles: T, flatFraction: flat / T, facesAwayFraction: outward / T, openEdges: open, nonManifoldEdges: nonManifold, volume, maxNormalDeviation: maxDev,
           ok: open === 0 && nonManifold === 0 && volume > 0 && flat / T > 0.95 };
}
```

### 13.8 CPU oracle (test harness used for §5.2)

```js
// Bakes the distance cube on the CPU and traces paths exactly vs through the cube. Triangles T = [{a,b,c,n}] are in the
// CANONICAL frame (centred at the origin, unit sphere), n = outward unit normal. N = cube resolution.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
      mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s], len=a=>Math.hypot(...a), nrm=a=>mul(a,1/(len(a)||1)), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rayTri(o,d,tr){ const e1=sub(tr.b,tr.a),e2=sub(tr.c,tr.a),p=cross(d,e2),det=dot(e1,p); if(Math.abs(det)<1e-14) return -1;
  const inv=1/det,s=sub(o,tr.a),u=dot(s,p)*inv; if(u<-1e-9||u>1+1e-9) return -1; const q=cross(s,e1),v=dot(d,q)*inv; if(v<-1e-9||u+v>1+1e-9) return -1; return dot(e2,q)*inv; }
function exact(T,o,d){ let best=1e9,bt=null; for(const tr of T){ const t=rayTri(o,d,tr); if(t>1e-6&&t<best){best=t;bt=tr;} } return bt?{p:add(o,mul(d,best)),n:bt.n}:null; }
const FACE=(f,s,t)=>{const x=2*s-1,y=2*t-1; return [[1,-y,-x],[-1,-y,x],[x,1,y],[x,-1,-y],[x,-y,1],[-x,-y,-1]][f];};
function bake(T,N){ return [0,1,2,3,4,5].map(f=>Array.from({length:N*N},(_,k)=>{ const i=k%N,j=(k/N)|0,d=nrm(FACE(f,(i+.5)/N,(j+.5)/N)),h=exact(T,[0,0,0],d); return h?{n:h.n,dist:len(h.p)}:{n:[0,0,1],dist:1}; })); }
function cubeFetch(cube,N,d){ const a=d.map(Math.abs); let f,sc,tc,ma;
  if(a[0]>=a[1]&&a[0]>=a[2]){ if(d[0]>0){f=0;sc=-d[2];tc=-d[1];} else {f=1;sc=d[2];tc=-d[1];} ma=a[0]; }
  else if(a[1]>=a[2]){ if(d[1]>0){f=2;sc=d[0];tc=d[2];} else {f=3;sc=d[0];tc=-d[2];} ma=a[1]; }
  else { if(d[2]>0){f=4;sc=d[0];tc=-d[1];} else {f=5;sc=-d[0];tc=-d[1];} ma=a[2]; }
  const i=Math.min(N-1,Math.max(0,Math.floor((sc/ma+1)/2*N))), j=Math.min(N-1,Math.max(0,Math.floor((tc/ma+1)/2*N))); return cube[f][j*N+i]; }
// intersectStone(o,d) of §5.1 with centerOffset = 0, radius = 1, squash 0.98, geometryFactor 0.5, `iters` refinements
```

---

## 14. How the diamond sits in the frame

```text
GBuffer pass : stones are drawn with the engine's override material (depth / normal / flags) like every mesh
render pass  : opaque, DoubleSide ShaderMaterial; writes RGBM-16 linear HDR  ← same target and encoding as the gold
               (no SSR / SSAO / lights / shadows are read by this shader)
Progressive  : 32-frame jittered average smooths facet-pick noise and env-map aliasing
Bloom        : threshold 2.0 (soft 0.03), 4 levels, intensity 0.36 — the 1.2 % of env texels > 8 become glints
CombinedPost : decode → ACES → contrast 1.12 → sRGB   (diamond `boost`/`gamma` were tuned against this curve)
```

Because every material is tone-mapped by the same late pass, the diamond's `boostFactors = 2`, `envMapIntensity = 1.6`, `gamma = 1.09` are **display-referred tuning knobs**, not physical quantities. An engine that changes the tone curve must retune them.

---

## 15. Validation: what was checked

| Check | Result | Tag |
|---|---|---|
| Bundle shader text, defines, uniforms (runtime `getAttachedShaders`) | read; matches static source | ✅ |
| Alignment procedure vs the bundle's `normalsCaptureOffsets` on `D5` | axis dot-products 1.0, radius and centre equal | ✅ (executed) |
| Geometry facts (§9) on the real stone | measured | ✅ (executed) |
| Distance-cube intersection accuracy (§5.2) | measured against exact tracing | ✅ (executed) |
| Optics tables (§7) | computed by script | ✅ |
| Env statistics (§8.2) | decoded with the §13.1 decoder | ✅ |
| Every shader of §13 extracted from this file, `#include`s resolved, compiled and linked in WebGL2 (`LEGACY_COMPAT` 0/1, `RAY_BOUNCES` 1/3/6/12) | all pass first time | ✅ (executed) |
| Cube-face table + camera table + `bake.vert/frag` on the GPU: bake a unit sphere (256², Nearest), sample at 2000 Fibonacci directions | stored normal vs direction: mean **0.135°**, worst **0.353°**; distance error ≤ 0.001 | ✅ (executed) |
| `diamond.frag` executed on a sphere stone baked by the above (camera, env, uniforms = shipped values) | **0 non-finite pixels** in all variants; loop is effective (mean linear luminance: 1 bounce 1.19, 3 bounces 1.36, 6 bounces 1.369, 12 bounces 1.369 — a sphere never produces TIR, so contributions decay and converge by ~6) | ✅ (executed) |
| **Not done:** a full on-GPU render of the reference diamond shader on the real `D5` stone, compared with the bundle's pixels | — | ❓ |

**Golden-image loop (recommended):** freeze the camera (position (−6.51, 7.65, −2.74), target origin, fov 25°), converge 34 frames, compare against the table in §11. Switch features on in this order: surface reflection only → one bounce → full loop → dispersion → absorption → boost/γ → bloom/tonemap. Expect small residual differences from the bake (128–512², Nearest) and from jitter-table phase.

**Debugging aids:** colour output by bounce count (the bundle carries an unused `debugBounces()` helper: red = 0, green = 1, blue = 2, yellow = 3, cyan = 4); view the cube faces (rgb = normal, a = distance); output `hit` vs exact in the CPU oracle; render the proxy-sphere hit only (set loop count to 0).

---

## 16. Open questions

| # | Item |
|---|---|
| 1 | Whether the inverted dispersion order, the constant `2.4`, `PI = 3.1428` and per-bounce `boost` compounding are intentional. |
| 2 | The `transmission > 0` branch (screen-space see-through using `transmissionSamplerMap`) — present in the shader, unused at runtime here. |
| 3 | `ThinFilmLayerPlugin` extension on the diamond material: extra `thinBaseLayerFactors / thinNoiseLayerFactors / thinColorNoiseParams / thinFilmFactor` uniforms exist (all zero); behaviour not inspected. |
| 4 | How `nl()` (the > 1500-vertex fallback alignment) behaves on real stones; only `al()` was exercised. |
| 5 | Whether a third refinement iteration or a 256² vs 512² bake changes the measured accuracy (only 128² and 1–2 iterations were measured). |
| 6 | Mobile/low-end GPU behaviour of the 37-fetch loop; GPU-side timing (only synchronised CPU timing was taken). |
| 7 | Accuracy on stones other than round brilliants (cushion, emerald, pear cuts) — and on stones that are not star-shaped about their centre. |
| 8 | The sphere test of §15 only proves the shader runs and loops correctly; it does not exercise TIR-heavy paths (a sphere never has TIR). A faceted test stone (e.g. `D5` uploaded as a mesh) is the next test. |

---

## Verification log

Produced while writing this document (all executed, not simulated):

1. **Live bundle**: compiled-shader dumps, uniforms, geometry facts of `D5` (597 verts / 318 tris / closed / volume +163.27 / 314 flat triangles), runtime `normalsCaptureOffsets`, and the §11 parameter sweeps came from the viewer at `http://localhost:8000` (see `Rendering_Engine_Reverse_Engineering.md` §2.3).
2. **PCA alignment**: the §13.2 algorithm run on the live `D5` geometry; axes equal the bundle's `offsetMatrix` columns (dot products 1.00000 ×3), `R = 4.77922`, centre `(0.0028, 13.5511, −0.0232)`, eigenvalues `(9.046, 8.534, 1.167)`.
3. **Distance-cube accuracy**: the §13.8 oracle on `D5`, 3000 random entry rays, 128² Nearest cube, 2 vs 1 refinements (results in §5.2).
4. **Optics tables** (§7): `optics.mjs` (Fresnel fit, Snell window, critical angle, Beer–Lambert).
5. **Environment statistics** (§8.2): `rgbe.mjs` + `env-stats.mjs` on `gem-000.hdr`.
6. **Shader compile + GPU tests**: `extract.mjs` + `test.html` (13 program variants, bake round-trip, sphere-stone execution).
