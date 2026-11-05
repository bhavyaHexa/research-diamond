# Diamond Shader Walkthrough — the four GLSL files, line by line

This explains the diamond **on the shader side only**, using the exact files in this branch (`r3f-dev`):

| File | Lines | Role |
|---|---|---|
| `src/shaders/diamond/normal-capture.vert.glsl` | 11 | bake pass, vertex |
| `src/shaders/diamond/normal-capture.frag.glsl` | 10 | bake pass, fragment |
| `src/shaders/diamond/diamond.vert.glsl` | 20 | stone material, vertex |
| `src/shaders/diamond/diamond.frag.glsl` | 227 | stone material, fragment — **where everything happens** |

All four are byte-for-byte the engine's shaders (token-identical to `bundle-0.8.0.mjs`; whitespace/comments differ only). Line numbers below are the line numbers of those files. For the derivations, measurements and a re-implementation see `Diamond_Rendering_Complete.md`; this document is the "how to read the code" companion.

Evidence tags: ✅ read in the code or measured · 🔶 my inference (marked where it matters).

---

## 1. The idea in six sentences

1. A diamond is a closed, convex-ish solid with an index of refraction of 2.42. Light entering it bounces around many times before leaving.
2. Ray-tracing the facets per pixel would be too slow, so the stone's **shape is baked once into a cubemap** (`normal-capture.*`): for every direction seen from the stone's centre, it stores *the facet normal* and *how far away the surface is*.
3. For each pixel the fragment shader refracts the camera ray into the stone, then loops `RAY_BOUNCES` (6) times: *find where the ray hits the inside surface* (using the cube, not triangles), *absorb a bit of light*, then either **bounce** (total internal reflection) or **let some light out** toward the environment image.
4. Light that leaves is read from a 512×512 HDR picture (`envMap`) in the exit direction; three slightly different directions give the R, G and B channels (dispersion = "fire").
5. A small mirror-like reflection of the same environment off the front surface is added.
6. The result is gamma-shaped (`pow`), packed as RGBM, and the *later* tone-mapping pass turns it into the final colour.

```text
 stone mesh ──► [normal-capture.vert/frag] ──► cube: rgb = facet normal, a = distance from centre    (once per stone shape)
                                                     │  tCubeMapNormals
 camera ray ──► [diamond.vert] ─► [diamond.frag]: main()
                                    ├─ reflectionColor  = Fresnel · env(reflect(view, N))                       (lines 217-219)
                                    ├─ refractionColor  = getRefractionColor(...)   ← the loop                  (line 220 → 151-208)
                                    └─ rgb = (refraction + reflection) → pow(γ) → RGBM encode                   (224-226)
```

---

## 2. The bake: `normal-capture.vert/frag`

Drawn six times (once per cube face) by the engine's `DiamondPlugin` with the stone mesh at the origin, double-sided, depth test on.

**`normal-capture.vert.glsl`**

| Line | Code | Meaning |
|---|---|---|
| 25 | `uniform mat4 offsetMatrixInv` | `A⁻¹`: model space → the stone's *canonical* frame (axes aligned to the stone's principal axes, scaled so its bounding sphere has radius ≈ 1). Computed in JS from PCA. |
| 26 | `uniform vec3 offsetCenter` | the stone's bounding-box centre in model space |
| 28 | `vNormal = normalize((offsetMatrixInv*vec4(normal,0.)).xyz)` | rotate the facet normal into the canonical frame. Correct because `A` is rotation × *uniform* scale (no inverse-transpose needed). |
| 29 | `vecPosition = (modelMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.)).xyz` | the vertex position **relative to the stone's centre**, in canonical units. (`modelMatrix` is the identity of the capture mesh.) |
| 30 | `gl_Position = projectionMatrix*modelViewMatrix*offsetMatrixInv*vec4(position-offsetCenter,1.)` | project it from a camera sitting **at the centre** (the cube camera is at the origin). |

**`normal-capture.frag.glsl`**

| Line | Code | Meaning |
|---|---|---|
| 38-39 | `color = normalize(vNormal); color = color*0.5+0.5;` | pack the normal from [−1,1] to [0,1] into **rgb** |
| 40 | `gl_FragColor = vec4(color, length(vecPosition)/radius)` | **alpha = distance from the centre to this surface point** (`radius` = 1) |

Because the depth test keeps the *nearest* surface along each ray from the centre, each cube texel ends up holding `(normal, distance)` of **the facet you see looking outward from the centre in that direction**. The cube is half-float RGBA, **NEAREST**-filtered (never blended across a facet edge), 512² per face. ✅ (`normalMapRes 512`, runtime-verified.)

Two facts that matter later: the normal is stored **outward** (the fragment shader negates it); and one texel stores *one* surface per direction, so the stone must be star-shaped about its centre (round brilliants are).

---

## 3. `diamond.vert.glsl` (20 lines)

| Line | Code | What it does |
|---|---|---|
| 3-5 | `#ifndef USE_ENVMAP / #define USE_ENVMAP / #endif` | makes sure `USE_ENVMAP` exists in the vertex stage. 🔶 Three's `worldpos_vertex` chunk only computes `worldPosition` when `USE_ENVMAP` (or shadows etc.) is defined — this guard guarantees line 19 compiles. |
| 6-10 | `varying …` | five varyings; only `vWorldPosition` and `vWorldNormal` are *used* by the fragment shader. `vViewPosition`, `vNormal`, `vUv` are left over (declared and written, never read in a way that matters). |
| 12 | `vWorldNormal = (modelMatrix*vec4(normal,0.)).xyz` | world-space **facet normal**. Not normalised here and *not* inverse-transposed → assumes uniform scale. The stones are flat-shaded (314 of `D5`'s 318 triangles have identical vertex normals), so this is the true facet normal. ✅ |
| 13-14 | `#include <begin_vertex>`, `<project_vertex>` | Three chunks: `transformed = position`, then `mvPosition = modelViewMatrix*…` and `gl_Position = projectionMatrix*mvPosition`. |
| 15 | `vViewPosition = -mvPosition.xyz` | view-space position (unused later) |
| 16-17 | `vNormal`, `vUv` | unused later |
| 18-19 | `worldpos_vertex`, `vWorldPosition = worldPosition.xyz` | world-space position of the vertex (interpolated per pixel) |

So the vertex shader's only real job is: **hand the fragment shader the world position and the facet normal of the surface point the pixel is looking at.** Everything else is in `diamond.frag`.

---

## 4. `diamond.frag.glsl` — uniforms and defines

### 4.1 Compile-time defines (not in the file; set by the material)

| Define | Value here | Used at | Meaning |
|---|---|---|---|
| `RAY_BOUNCES` | 6 | line 165, 180 | number of internal bounces (the loop is unrolled by the compiler — changing it recompiles) |
| `ENV_MAP_TYPE` | 1 (`sampler2D`) | 10-14, 63-67 | 0 = cube environment, 1 = equirect image |
| `DIA_ORIENT_ENVMAP` | 0 | 78 | 0 ⇒ rotate exit directions back to world with `modelOffsetMatrix` |
| `FIX_ENV_DIRECTION` | on | 72, 81 | environment is fixed to the **camera** (directions go through `viewMatrix`) |
| `USE_ENVMAP` | on | 52 | if undefined, `sampleEnvMap` returns the direction as a colour (the "rainbow" bug the Three-native port had to fix) |
| `PI` | 3.1428 | 47-48 | (sic) a slightly-off π used only for the equirect lookup |

### 4.2 Uniforms (lines 8-35)

| Uniform | Value here | Set by | Used in |
|---|---|---|---|
| `tCubeMapNormals` | the stone's baked cube | engine (per mesh, `onBeforeRender`) | 117 (`getNormalDistance`) |
| `envMap` | `gem-000.hdr` (512², half-float) | engine (`Diamond.envMap`) | 64 / 66 |
| `envMapIntensity` | 1.6 | material | 75, 87 |
| `envMapRotation` | 0 | engine, per draw | 55-59 |
| `modelMatrix` | object → world | three | declared, unused |
| `inverseModelMatrix` | world → model | engine, per draw | 162, 164 |
| `offsetMatrixInv` | `A⁻¹` (model → canonical) | engine, per shape | 162, 164 |
| `modelOffsetMatrix` | `M·A` (canonical → world) | engine, per draw | 79, 175, 182, 190 |
| `centerOffset` | `A⁻¹·bboxCentre` — where the cube's centre is in the shader's canonical frame | engine, per shape | 97, 109, 126, 129, 132, 135, 168 |
| `radius` | 1 | engine | 101, 128, 134, 172 |
| `refractiveIndex` | 2.42 | material | 158, 177, 197-198 |
| `rIndexDelta` | 0.004 (= `dispersion`) | material | 197-198 |
| `absorptionFactor` | 1 | material | 172 |
| `color` | 0.7758 (linear `#e4e4e4`) | material | 173 — **absorption tint only** |
| `colorCorrection` | (1,1,1) | material | 185, 193, 199 |
| `boostFactors` | (2,2,2) | material | 185, 193, 199, 203 |
| `reflectivity` | 0.46 | material | 219 |
| `gammaFactor` | 1.09 | material | 225 |
| `squashFactor` / `geometryFactor` | 0.98 / 0.5 | material | 98, 105-106, 108 |
| `transmission`, `transmissionSamplerMap/Size` | 0 / blank | material | 185, 192 (the see-through path; **never taken here**) |
| `projectionMatrix` | camera | three | only inside `SampleSpecularContributionRef` (dead path) |
| `viewMatrix`, `cameraPosition` | camera | three (built-in for ShaderMaterial) | 73, 82, 211 |

Three **frames** appear everywhere; keep them straight:

| Frame | Meaning | Where you meet it |
|---|---|---|
| world | what `vWorldPosition` is in | `main()` lines 210-220 |
| model | the mesh's own coordinates | only as a stepping stone |
| **canonical** | stone aligned to its principal axes, bounding sphere ≈ unit | the whole loop, lines 162-206 |

World → canonical is `offsetMatrixInv * inverseModelMatrix` (lines 162-164). Canonical → world is `mat3(modelOffsetMatrix)` (lines 79, 182, 190).

---

## 5. `diamond.frag.glsl` — function by function

### 5.1 `BRDF_Specular_GGX_Environment` (36-44) — the Fresnel helper

Despite the name this is only **Fresnel at roughness 0** here (every call passes `roughness = 0.`).

```text
dotNV = |N·V|                                   (line 37, abs → sign of the normal doesn't matter)
r  = roughness*c0 + c1 = c1 = (1, 0.0425, 1.04, −0.04)       (38-40, because roughness = 0)
a  = min(1, 2^(−9.28·dotNV)) + 0.0425            (41)
A  = 1.04 − 1.04a ;  B = 1.04a − 0.04            (42)
return specularColor·A + B                       (43)
```

That is Karis's analytic fit of "how much light a smooth dielectric reflects at this angle". With `specularColor = f0 = 0.16955` it returns: **0.174** looking straight on, 0.21 at 60° from the normal, 0.41 at 78°, 0.63 at 84°, and ≈ 1 at grazing. Used both as *reflectance* `F` and as *transmittance* `1 − F`.

### 5.2 Environment lookups (45-88)

`cartesianToPolar` (45-50): direction → equirect UV: `u = atan(z,x)/(2π)+0.5`, `v = asin(y)/π+0.5` (with the sloppy `PI = 3.1428`).

`sampleEnvMap` (51-70): `#if !defined(USE_ENVMAP)` returns the direction itself as a colour (debug fallback). Otherwise: rotate the direction about Y by `envMapRotation` (55-59), then **negate x, y and z** (60-62), then `texture2D(envMap, cartesianToPolar(dir))` (66) — **plain bilinear fetch, no mip level, no blur**.

`SampleSpecularReflection` (71-76) — used for the *surface reflection*: [if camera-fixed] turn the world direction into view space (73) → `envMapIntensity × sampleEnvMap`.

`SampleSpecularContribution` (77-88) — used for **light leaving the stone**: [if `DIA_ORIENT_ENVMAP < 1`] canonical → world via `mat3(modelOffsetMatrix)` (79) → [camera-fixed] world → view (82) → `normalize` (84) → flip **x and z** (85-86) → `sampleEnvMap` (which negates all three again) → `× envMapIntensity`.

> Net sign effect (✅): reflection samples `−d`; exit samples `(x, −y, z)·d` (x and z are flipped twice). The two lookups use different conventions — copy them exactly if you need the same picture.

`SampleSpecularContributionRef` (89-95): projects a world point to the screen and reads `transmissionSamplerMap`. Used only when `transmission > 0` — **dead code in this app** (transmission = 0), but still compiled.

### 5.3 Ray ↔ stone intersection (96-140)

This is the heart. The stone is represented only by the cube `(normal, distance)`.

**`intersectSphere`** (96-112) — a cheap *first guess* inside the stone:

```text
o −= centerOffset ; d.y /= squashFactor                      (97-98: squash the y axis a little)
A = d·d ; B = 2 o·d ; C = o·o − radius²                      (99-101)
disc = B² − 4AC                                              (102)
if disc > 0:   t = max(t1, t2) × geometryFactor              (103-107: far root of the unit sphere, ×0.5)
               return o + centerOffset + d·t                 (108-109)
else           return (0,0,0)                                (111)
```

Because the ray starts on/inside the unit sphere, it always has two roots; taking the far one and multiplying by `0.5` gives a point roughly *half-way along the chord* — an interior point, near enough to the real hit to seed the search. (Squash is applied to canonical **y**, which for a round stone is an arbitrary horizontal axis — 🔶 effectively a no-op tweak.)

**`linePlaneIntersect`** (113-115): standard `o + d·(n·(p−o))/(n·d)`.

**`getNormalDistance`** (116-118): `textureCube(tCubeMapNormals, d)` → `(normal·½+½ , distance)`.

**`getSurfaceNormal`** (119-123): unpack `n = rgb·2−1` and return **−normalize(n)** → the **inward** normal (the cube stored the outward one).

**`intersect`** (124-140) — two refinement steps:

```text
s       = intersectSphere(o, d)                                        // guess
dir1    = normalize(s − centerOffset)                                  // direction from the stone's centre to the guess
(n1,a1) = cube(dir1)                                                    // the facet the centre sees that way
plane1  = { point: centerOffset + dir1·a1·radius , normal: −n1 }
hit1    = rayPlane(o, d, plane1)                                        // true ray ∩ that facet's plane      (lines 125-131)
dir2    = normalize(hit1 − centerOffset)                                // re-aim with the better point
(n2,a2) = cube(dir2) → plane2
hit     = rayPlane(o, d, plane2)                                        // (132-138)   ← returned (139)
```

Each `intersect` call costs **2 cube fetches**; the caller does a third one for the normal at the final hit. The second refinement matters: on `D5` it raises the share of rays whose first exit bounce is right from 73.6 % to 90.5 % (my CPU measurement, see `Diamond_Rendering_Complete.md` §5.2).

`debugBounces` (141-150): a colour-per-bounce-count helper (red 0, green 1, blue 2, yellow 3, cyan 4). **Never called.**

### 5.4 `getRefractionColor` (151-208) — the loop, in 6 steps

**Setup (152-164)**

| Lines | Code | Meaning |
|---|---|---|
| 153 | `n1 = 1` | refractive index of air |
| 155-156 | `f0 = ((2.4−1)/(2.4+1))²` | = 0.16955. ✅ Hard-coded `2.4`; **not** derived from `refractiveIndex` (2.42 would give 0.1724). |
| 157 | `attenuationFactor = (1,1,1)` | the light still "alive" along the path; every loss multiplies into it |
| 158 | `newDirection = refract(direction, normal, n1/refractiveIndex)` | **Snell entering the stone** (η = 1/2.42). All entry rays end up inside a 24.4° cone around the inward facet normal. |
| 159-160 | `attenuation *= 1 − F(newDirection, −normal)` | the part that wasn't reflected at entry. (Evaluated with the *refracted* angle — slightly different from using the air-side angle.) |
| 162-164 | direction and origin → canonical | `offsetMatrixInv * inverseModelMatrix`; direction is normalised |

**One loop pass (165-206), `i = 0 … 5`:**

| Lines | Step | Meaning |
|---|---|---|
| 166 | `intersectedPos = intersect(origin, newDirection)` | where the ray leaves the stone (§5.3) |
| 167-168 | `dist`, `d = normalize(intersectedPos − centerOffset)` | path length; direction from centre to the hit |
| 169-171 | `mappedNormal` | third cube fetch; **inward** facet normal at the hit |
| 172-173 | `r = length(dist)/radius·absorptionFactor;  attenuation *= exp(−r·(1−color))` | **Beer–Lambert**: with `color = 0.7758` each channel keeps `exp(−0.2242·r)` per canonical unit. A white stone absorbs equally in R,G,B; a coloured stone absorbs unequally. |
| 174-176 | `origin = intersectedPos`, `origin2`, `oldDir = newDirection` | move the ray to the hit; remember the incoming direction |
| 177 | `newDirection = refract(newDirection, mappedNormal, refractiveIndex/n1)` | **try to leave** (η = 2.42). GLSL returns the zero vector when the angle exceeds the critical angle. |
| 178 | `if (dot(newDirection,newDirection) < epsilon)` | → **total internal reflection** branch (179-187) |
| 179 | `newDirection = reflect(oldDir, mappedNormal)` | bounce, **no energy lost** |
| 180-186 | `if (i == RAY_BOUNCES−1)` | out of bounces: add `Env(oldDir) × attenuation × colorCorrection × boost × (1−F)` (using the *incoming* direction `oldDir`, not the reflected one) |
| 188 | `else` | the ray can leave: some light escapes, some reflects (189-204) |
| 189 | `brdfRefracted = 1 − F(newDirection, −mappedNormal)` | fraction transmitted (exit angle in air) |
| 190-191 | `d1`, `cosT` | world exit direction and a see-through parameter (only used when `transmission > 0`) |
| 192-194 | transmission branch | screen-space see-through. **Not taken (transmission = 0).** |
| 196-199 | **dispersion**: `dir0 = newDirection`, `dir1 = refract(oldDir,N, n+Δn)`, `dir2 = refract(oldDir,N, n−Δn)` then `outColor += vec3( Env(dir1).r, Env(dir0).g, Env(dir2).b ) × brdfRefracted × attenuation × colorCorrection × boost` | the exit light: **three slightly different directions → three separate environment fetches → R, G, B**. This is the "fire". `Δn = 0.004`. (R uses the *higher* index, the reverse of physical dispersion.) |
| 201 | `newDirection = reflect(oldDir, mappedNormal)` | what stays inside continues |
| 202-203 | `attenuation *= F(newDirection, mappedNormal) × boostFactors` | only the *reflected fraction* survives; multiplied by `boost` each time (an artistic energy compensation, not physics) |
| 204 | `count++` | unused |

`return outColor` (207): the **sum over all bounces of the light that left the stone**, each already weighted by transmission, absorption and boost.

### 5.5 `main()` (209-227)

| Lines | Code | Meaning |
|---|---|---|
| 210 | `N = normalize(vWorldNormal)` | the facet normal of the front surface |
| 211 | `V = normalize(vWorldPosition − cameraPosition)` | camera → surface (note the direction: *incident* ray) |
| 214-215 | `f0` | same `0.16955` |
| 217 | `reflectedDirection = reflect(V, N)` | mirror direction |
| 218 | `brdfReflected = F(R, N)` | Fresnel for the front-surface reflection (≈ 0.17 head-on) |
| 219 | `reflectionColor = Env_reflect(R) × brdfReflected × reflectivity × 2` | the glossy top reflection (`0.46 × 2 = 0.92`× Fresnel × environment). |
| 220 | `refractionColor = getRefractionColor(vWorldPosition, V, N)` | the whole interior (the loop) |
| 221-222 | `normal`, `diffuseColor = vec3(1)` | **`diffuseColor` is literally 1** — `color` is never multiplied onto the result |
| 223 | `#glMarker beforeAccumulation` | engine hook (becomes a comment) |
| 224 | `gl_FragColor = vec4((refractionColor + reflectionColor)*diffuseColor, 1.)` | the final sum, alpha 1 |
| 225 | `pow(rgb, gammaFactor)` | `γ = 1.09`: slightly darkens/contrasts; a negative `rgb` would give NaN (the code does not guard) |
| 226 | `#include <encodings_fragment>` | `gl_FragColor = linearToOutputTexel(gl_FragColor)` — **RGBM-16 encoding** (in the Three-native port renamed `colorspace_fragment`) |

---

## 6. A real pixel, traced through these lines

Computed with my CPU emulation of exactly the logic above on the real `D5` geometry (`public/assets/Ring_v1.glb`), the real `gem-000.hdr`, shipped uniform values (`n 2.42, Δn 0.004, boost 2, γ 1.09, env 1.6, 6 bounces`), camera 20° off the table normal, ray aimed at a table point 0.35 R from the centre, camera-fixed environment. (Cube baked at 256² Nearest for speed; the engine uses 512².)

**Entry (lines 210-220, 158-160)**

- incidence on the table: **20.0°**; refracted angle **8.11°** (inside the 24.41° Snell window)
- entry transmission `1 − F` = **0.8255**
- surface reflection term (lines 217-219): F = 0.1751 at |N·R| = 0.94 → `reflectionColor` = **(0.024, 0.033, 0.048)** (the environment looks dim and slightly cool there)

**The six bounces (lines 165-206)** — `dist` in canonical units; `trans` = Beer–Lambert transmittance of that segment (red channel); `inc` = angle between the ray and the facet normal at the hit; critical angle = **24.41°**:

| i | dist | trans | inc at hit | what happens (line) | light added to `outColor` (R,G,B) | `attenuation` (R) after |
|---|---|---|---|---|---|---|
| 0 | 0.977 | 0.803 | **33.9°** | > 24.4° → **TIR** (179), lossless | — | unchanged |
| 1 | 0.772 | 0.841 | **64.1°** | **TIR** | — | unchanged |
| 2 | 0.678 | 0.859 | **14.8°** | < 24.4° → **exit** (189-203), T = 0.821; env sample ≈ 0.06 (dark spot) | (0.045, 0.045, 0.043) | **0.167** |
| 3 | 1.104 | 0.781 | **51.4°** | **TIR** | — | unchanged |
| 4 | 0.648 | 0.865 | **69.2°** | **TIR** | — | unchanged |
| 5 | 0.677 | 0.859 | **20.6°** | **exit**, T = 0.798; env ≈ 0.63–0.66 (brighter spot) | (0.097, 0.084, 0.072) | 0.034 |

Reading it:

- Six segments of 0.65–1.10 units each cost `0.80·0.84·0.86·0.78·0.87·0.86 ≈ 0.34` of the light from absorption alone (white stone, κ = 1).
- TIR bounces (0, 1, 3, 4) are **free**; light only escapes where the ray meets a facet *within* 24.4° of its normal (bounces 2 and 5).
- At each escape, only `T ≈ 0.8` leaves; what stays inside is multiplied by `F·boost ≈ 0.175 × 2 = 0.35` (line 203). That is why `attenuation` drops from ≈ 0.48 (entry 0.8255 × three absorbed segments) to **0.167** after bounce 2, and to **0.034** after bounce 5: the second exit is weak in energy but happened to look at a much brighter environment texel (0.63 vs 0.06), so it still contributes more (0.097 vs 0.045).
- Note the **R/G/B differences** in the exit lines (0.097, 0.084, 0.072): partly the environment's cool tint, partly dispersion sampling slightly different texels.

**Totals**

| Stage | R, G, B |
|---|---|
| sum of exit contributions (`outColor`, line 207) | (0.142, 0.129, 0.115) |
| + surface reflection (219) | (0.024, 0.033, 0.048) |
| = `refraction + reflection` (224) | (0.166, 0.162, 0.164) |
| after `pow(·, 1.09)` (225) | (0.141, 0.138, 0.139) |
| after RGBM-16 round trip (226) | (0.141, 0.138, 0.139) |
| **final sRGB** after ACES + contrast 1.12 (later pass) | **(94, 92, 93)** — a mid-dark grey facet |

That is a typical "dark facet" pixel. A neighbouring pixel whose exit rays hit the environment's bright points (values up to 214, see `Diamond_Rendering_Complete.md` §8.2) would instead clip towards white — that contrast between pixels is what you see as sparkle.

**One honest observation from this trace** ✅: the cube-based `intersect` is an approximation. Comparing each bounce's hit against an exact ray–mesh intersection from the same origin: bounces 0, 2, 3, 5 are within **0.0002–0.0036** units, but at **bounces 1 and 4** (the 64° and 69° near-grazing TIR hits) the cube picked a **different facet** (0.77 and 0.64 units away). That is the known failure mode (≈ 10 % of first exits in my 3000-ray test) and why stones shimmer a little at facet edges; the 32-frame accumulation averages it.

---

## 7. What is dead, unused or surprising in the file

| Item | Lines | Status |
|---|---|---|
| `varying vViewPosition, vNormal, vUv` | 5-7 | declared; effectively unused |
| `uniform modelMatrix` | 16 | declared, unused |
| `SampleSpecularContributionRef` | 89-95 | only reachable when `transmission > 0` — never here |
| `debugBounces` | 141-150 | never called |
| `count`, `normal`, `diffuseColor`, `attenuationFactor` in `main` | 161, 204, 216, 221-222 | unused or constant |
| `n1`, `epsilon` | 153-154 | constants |
| `#glMarker beforeAccumulation` | 223 | engine plugin hook; no-op |
| `f0` hard-coded `2.4` | 155, 214 | independent of `refractiveIndex` |
| `PI` = 3.1428 | 47-48 | not π |
| `color` as absorption only | 173 | `diffuseColor` = 1 |
| dispersion sign | 197-198 | R gets `n+Δn` (reverse of physical) |
| `(1 − F)` can go slightly negative at exact grazing | 160, 189 | F fit reaches 1.037; `pow` of a negative → NaN, unguarded |
| env sign conventions differ | 60-62, 85-86 | reflection `−d`; exit `(x,−y,z)` |
| TIR dump uses `oldDir` | 185 | incoming direction, not the reflected one |

---

## 8. What each knob visibly does

Measured on `D5` (mean over the stone, 34 converged frames):

| Knob (uniform) | Effect | Measured |
|---|---|---|
| `absorptionFactor` ↑ | stone gets darker/deeper | 6 → mean 194 → **95** |
| `boostFactors` | global brightness *and* how much survives each internal reflection | 2 → 1: 194 → **161** |
| `reflectivity` | the front-surface sparkle layer | 0.46 → 0: 194 → **176** |
| `refractiveIndex` ↓ | fewer TIR, more light leaks through | 2.42 → 1.5: 194 → **207** |
| `rayBounces` | depth of the path; converges by ~6 | 1 → 190 (cooler), 10 ≈ 6 |
| `dispersion` | colour fringes, almost no change in mean | 0.004 → 0.03: 194 → 196 |
| `gammaFactor` | contrast of darks | 1.09 → 1.0: +3 |
| `envMapIntensity` | brightness of everything the stone sees | linear gain on every exit and the reflection |
| `color` | **absorption colour only** (not a surface tint) | `#e4e4e4` ≈ white stone |

---

## 9. Quick answers

- **Is it ray tracing?** A ray-marching *approximation* through a distance cubemap: no triangles in the shader, two refinement steps per bounce.
- **Where does sparkle come from?** The exit rays read a sparse HDR picture where 1.2 % of texels are > 8 (peak 214).
- **Where does colour fire come from?** Three exit directions per bounce (`n±Δn`) → three texel fetches → R, G, B.
- **Why does the stone look dark in places?** Light that exits towards the dim parts of the map (median 0.36), or never exits within 6 bounces (≈ 27 % of paths on `D5`).
- **Does this file need lights?** No. The only light is the environment image (`envMap`).
- **Which part depends on the mesh?** Only line 12 (facet normal) and the baked cube; the shader never sees triangles.
- **Which parts are set from JS?** All uniforms in §4.2; `inverseModelMatrix` / `modelOffsetMatrix` per draw; `offsetMatrixInv`, `centerOffset`, `radius` and the cube per stone. On this branch the **engine** does that (`src/engine/diamond.mjs`); the Three-native equivalent in `src/render/diamond.ts` is not active.

Reproduction: the worked example in §6 comes from a standalone script (`trace-pixel.mjs`, kept in the session scratchpad, not in the repo). It reads `Ring_v1.glb` and `gem-000.hdr` and mirrors lines 96-226 of `diamond.frag.glsl`; ask if you want it added to `scripts/`.
