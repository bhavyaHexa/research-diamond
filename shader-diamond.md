# Diamond shader: process and pipeline

Written for: engineers on this repo who need to know how the diamonds are drawn, which shader runs at each pipeline stage, and where its code lives.

## 1. Summary

- The vendored engine, [public/shaders/bundle-0.8.0.mjs](public/shaders/bundle-0.8.0.mjs), holds **35 shader strings, which are 31 unique programs**. Four strings are exact duplicates: the PMREM vertex shader appears 3 times and the fullscreen vertex shader appears 3 times.
- All of them are **GLSL** (WebGL2, `#version 300 es` path through `IS_GLSL3`). The bundle has no WGSL.
- **No tessellation or geometry shaders.** The bundle contains no tessellation or geometry keywords, and WebGL2 has neither stage.
- The diamond look comes from **2 passes and 4 programs**: a normal-capture pass and the diamond material pass. The other 27 programs are the engine's post-processing, PMREM, G-buffer, line and depth passes.
- The 31 programs are split into one `.glsl` file each under [src/shaders/](src/shaders/). **[src/shaders/pipeline.ts](src/shaders/pipeline.ts) is the source of truth** for the shader programs and the stage mapping.
- **The original single bundle is gone.** Its code is now split into feature bundles in [src/engine/](src/engine/): `core`, `shared`, `diamond`, `scene` and `gold`, plus `runtime`. They are generated from the original file by [scripts/split-engine/](scripts/split-engine/). The viewer renders the same as before, with 0 of 1,024,000 pixels different from the original screenshot.
- The diamond stones and their normal-capture pass run the `pipeline.ts` GLSL. The other 27 programs are reference copies, not run directly.
- **The three.js port in [src/render/](src/render/) is not used.** It rendered a different scene (no floor, no AO, different gold), so it was set aside. It can be deleted.

## 2. Where the code lives

| Path | Role |
| --- | --- |
| [src/engine.ts](src/engine.ts) | Imports the engine from `src/engine/core.mjs`, builds the scene, and runs the load steps in order. Calls `useCaptureSource` before the ring loads. |
| [src/engine/](src/engine/) | The generated feature bundles: `core.mjs` (entry, runs every step in the original order), `shared.mjs`, `diamond.mjs`, `scene.mjs`, `gold.mjs`, and `runtime.mjs` (the webpack runtime). `core.d.mts` types the public exports loosely. |
| [scripts/split-engine/](scripts/split-engine/) | Regenerates `src/engine/` from the original bundle. See §8. |
| [src/scene/materials.ts](src/scene/materials.ts) | `useDiamondSource` and `useCaptureSource` put the `pipeline.ts` GLSL into the diamond and capture materials. `whitenDiamonds` converts the stones, and `createMaterialHandle` applies the metal and gem settings. |
| [src/shaders/pipeline.ts](src/shaders/pipeline.ts) | **Source of truth.** Manifest: one entry per stage, with each program's GLSL imported as text. |
| [src/shaders/diamond/](src/shaders/diamond/) | The 4 diamond programs (normal capture and diamond material). These run. |
| [src/shaders/vertex/](src/shaders/vertex/), [src/shaders/fragment/](src/shaders/fragment/) | 27 reference programs. The engine has its own copies of these. |
| [src/render/](src/render/) | The unused three.js port (see §8). |

## 3. Diamond frame order

Load order is in [src/engine.ts](src/engine.ts). The stone steps are in [src/scene/materials.ts](src/scene/materials.ts).

1. **Load the engine and the scene.** The bundle is loaded, `ViewerApp` is created, and the plugins are added. `useCaptureSource` swaps the normal-capture material's GLSL to `pipeline.ts`. This happens before the ring loads, because the loader captures the normal maps during import.
2. **Load the ring and the scene.** The GLB, the scene preset, the gem environment and the lightmap load through the bundle, as before.
3. **Select and convert the stones.** `whitenDiamonds` matches node names with `WHITEN_PATTERN = /^d(4\d{3}|5)$/`. That covers the halo `D4xxx` and the centre `D5`. The ruby band `D1xxx` stays as authored. Each stone's material is converted by the bundle (`makeDiamond`), then `useDiamondSource` swaps its GLSL to `pipeline.ts`.
4. **Bake the facet normals.** `prepareDiamondMesh` runs on every mesh with `normalMapRes: 512`. It captures each stone from its centre into a cube map, using [normal-capture.vert.glsl](src/shaders/diamond/normal-capture.vert.glsl) and [normal-capture.frag.glsl](src/shaders/diamond/normal-capture.frag.glsl). Each texel writes `rgb = facet normal * 0.5 + 0.5` and `a = distance / radius`. The result is bound as `tCubeMapNormals`.
5. **Diamond pass.** [diamond.vert.glsl](src/shaders/diamond/diamond.vert.glsl) passes the world position and normal to the fragment stage. [diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl) then does the following:
   - **Reflection.** `reflect(view, normal)` is sampled from the environment map with a GGX environment BRDF, scaled by `reflectivity * 2`.
   - **Refraction.** `getRefractionColor` refracts the view ray into the stone at IOR `n1 / refractiveIndex`. Then it loops `RAY_BOUNCES` times. Each loop step:
     - finds the exit point with `intersect()`, which uses the sphere and the facet cube map;
     - attenuates the colour with `exp(-r * (1 - color))`;
     - refracts out with a separate IOR for each colour channel, `refractiveIndex ± rIndexDelta`, which gives the dispersion (fire);
     - reflects internally when the refraction fails, and multiplies by `boostFactors`.
   - **Output.** The sum of reflection and refraction, times `diffuseColor = 1`, then `pow(…, gammaFactor)`, then `#include <encodings_fragment>`. Alpha is 1.
   - The `#glMarker beforeAccumulation` line is a hook for the bundle's plugins, and the bundle fills it in.
6. **Post-processing.** The bundle runs its ground, shadow, SSAO, SSR and tone-mapping passes around the stones, as before.

### Notes for the three.js port (not active)

These changes were needed for the three.js attempt to match the old look. They are kept for when that port continues.

| Change | Why |
| --- | --- |
| `USE_ENVMAP` is defined in the fragment stage too. | Without it `sampleEnvMap` returns the view direction as a colour, which gave a rainbow. |
| The gem HDR is a cube map, and `ENV_MAP_TYPE` is chosen from the texture type. | The engine's gem environment is a cube. A square HDR read as equirectangular looked wrong. |
| `#glMarker` becomes `//`. | Three.js has no such hook. |
| `#include <encodings_fragment>` becomes `<colorspace_fragment>`. | Three.js 0.187 renamed the chunk. |
| A stub for `transmissionSamplerMapTexelToLinear` is added at the top of the diamond fragment stage. | The engine supplies this helper. Stones read it only for transmission, which is 0. |
| Frustum culling is off for the capture mesh. | The stone's untransformed bounds were culled, which left the normal map empty. |
| The normal-capture pass runs before the stones are drawn, from the same frame data. | The first draw captures the normal maps, so they must be ready then. |
| The camera's field of view is 24°, and the tone mapping is none. | These match the framing and the gold colour of the old viewer. |

## 4. Pipeline by stage

The stages follow the diagram in the request. The file references are in §5 and in [src/shaders/pipeline.ts](src/shaders/pipeline.ts).

| # | Stage | Shaders in this project | Notes |
| --- | --- | --- | --- |
| 1 | Input assembler | None. Attributes only. | Vertex and index buffers come from the GLB. Attributes used: `position`, `normal`, `uv`, `faceIndex` (PMREM), `instanceStart`/`instanceEnd` and `instanceColorStart`/`instanceColorEnd` (lines). |
| 2 | Vertex shader | 8 entries, 6 unique programs plus 2 diamond programs. | Each vertex program is listed in §5. |
| 3 | Tessellation | None | WebGL2 has no tessellation stage. |
| 4 | Geometry shader | None | WebGL2 has no geometry stage. |
| 5 | Rasterization | None. Fixed function. | Fragment programs that read `gl_FragCoord`: `ssgi` and `bevel-normal-smooth`. |
| 6 | Fragment shader | 23 entries, 21 unique programs plus 2 diamond programs. | Each fragment program is listed in §5. |
| 7 | Color blending | None. Blend state is set in JS. | The diamond program writes alpha 1, so it is opaque. Post passes use premultiplied alpha in [post-effect-premultiplied.frag.glsl](src/shaders/fragment/post-effect-premultiplied.frag.glsl). |

## 5. Program inventory

The "offset" column is the character index of the `vertexShader:` or `fragmentShader:` property in the bundle. It is a JS string index, not a byte offset. "Used by" names the pass or material where it is known. For the engine's post passes it is inferred from the uniforms and code, because the bundle does not name them.

### Diamond (stages 2 and 6)

| File | Stage | Used by | Offset |
| --- | --- | --- | --- |
| [diamond/normal-capture.vert.glsl](src/shaders/diamond/normal-capture.vert.glsl) | vertex | Diamond normal capture (class `tl`) | 1454300 |
| [diamond/normal-capture.frag.glsl](src/shaders/diamond/normal-capture.frag.glsl) | fragment | Diamond normal capture (class `tl`) | 1454656 |
| [diamond/diamond.vert.glsl](src/shaders/diamond/diamond.vert.glsl) | vertex | Diamond material (class `ll`) | 1461500 |
| [diamond/diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl) | fragment | Diamond material (class `ll`) | 1461938 |

### Vertex (stage 2)

| File | Used by | Offset |
| --- | --- | --- |
| [vertex/pmrem-cube.vert.glsl](src/shaders/vertex/pmrem-cube.vert.glsl) | PMREM prefilter (3 copies in the bundle) | 567519, 573214, 574941 |
| [vertex/fullscreen.vert.glsl](src/shaders/vertex/fullscreen.vert.glsl) | Every fullscreen pass (3 copies) | 955076, 2144242, 2145386 |
| [vertex/gbuffer.vert.glsl](src/shaders/vertex/gbuffer.vert.glsl) | Scene G-buffer (class `Pt`) | 1064584 |
| [vertex/velocity.vert.glsl](src/shaders/vertex/velocity.vert.glsl) | Per-pixel velocity (class `Dp`) | 1524402 |
| [vertex/line-segments.vert.glsl](src/shaders/vertex/line-segments.vert.glsl) | Line2 / LineSegments2 (class `ho`) | 1322654 |
| [vertex/depth-pack.vert.glsl](src/shaders/vertex/depth-pack.vert.glsl) | 16-bit depth packing (class `Yx`) | 2101303 |

### Fragment (stage 6)

| File | Used by | Offset |
| --- | --- | --- |
| [diamond/diamond.frag.glsl](src/shaders/diamond/diamond.frag.glsl) | Diamond material | 1461938 |
| [diamond/normal-capture.frag.glsl](src/shaders/diamond/normal-capture.frag.glsl) | Diamond normal capture | 1454656 |
| [fragment/gbuffer.frag.glsl](src/shaders/fragment/gbuffer.frag.glsl) | Scene G-buffer, MRT for normal, depth and flags (class `Pt`) | 1065394 |
| [fragment/velocity.frag.glsl](src/shaders/fragment/velocity.frag.glsl) | Per-pixel velocity (class `Dp`) | 1525276 |
| [fragment/line-segments.frag.glsl](src/shaders/fragment/line-segments.frag.glsl) | Line2 / LineSegments2 (class `ho`) | 1328552 |
| [fragment/depth-pack.frag.glsl](src/shaders/fragment/depth-pack.frag.glsl) | 16-bit depth packing (class `Yx`) | 2101822 |
| [fragment/pmrem-blur.frag.glsl](src/shaders/fragment/pmrem-blur.frag.glsl) | PMREM roughness blur | 568693 |
| [fragment/pmrem-equirect.frag.glsl](src/shaders/fragment/pmrem-equirect.frag.glsl) | PMREM from an equirect map | 574388 |
| [fragment/pmrem-cube.frag.glsl](src/shaders/fragment/pmrem-cube.frag.glsl) | PMREM from a cube map | 576115 |
| [fragment/sao.frag.glsl](src/shaders/fragment/sao.frag.glsl) | Scalable ambient obscurance | 1264059 |
| [fragment/ssgi.frag.glsl](src/shaders/fragment/ssgi.frag.glsl) | Screen-space global illumination | 1388338 |
| [fragment/ao-temporal.frag.glsl](src/shaders/fragment/ao-temporal.frag.glsl) | Temporal filter for AO and SSGI | 1411634 |
| [fragment/normal-depth.frag.glsl](src/shaders/fragment/normal-depth.frag.glsl) | Normal and depth reader for the AO passes | 1579301 |
| [fragment/bevel-normal-smooth.frag.glsl](src/shaders/fragment/bevel-normal-smooth.frag.glsl) | Bevel-aware normal smoothing | 1575427 |
| [fragment/coc-blur.frag.glsl](src/shaders/fragment/coc-blur.frag.glsl) | Depth of field, circle-of-confusion blur | 1282234 |
| [fragment/depth-blur.frag.glsl](src/shaders/fragment/depth-blur.frag.glsl) | Packed-depth blur | 1796444 |
| [fragment/mask-blur.frag.glsl](src/shaders/fragment/mask-blur.frag.glsl) | Mask-aware blur | 1581817 |
| [fragment/gaussian-blur-horizontal.frag.glsl](src/shaders/fragment/gaussian-blur-horizontal.frag.glsl) | 9-tap Gaussian, horizontal (vertex: fullscreen) | 2144413 |
| [fragment/gaussian-blur-vertical.frag.glsl](src/shaders/fragment/gaussian-blur-vertical.frag.glsl) | 9-tap Gaussian, vertical (vertex: fullscreen) | 2145557 |
| [fragment/fullscreen-copy.frag.glsl](src/shaders/fragment/fullscreen-copy.frag.glsl) | Copy with opacity (3 uses of the fullscreen vertex) | 955247 |
| [fragment/post-effect.frag.glsl](src/shaders/fragment/post-effect.frag.glsl) | Post-effect base template | 1245398 |
| [fragment/post-effect-premultiplied.frag.glsl](src/shaders/fragment/post-effect-premultiplied.frag.glsl) | Post-effect base template, premultiplied | 1246116 |
| [fragment/transparency-composite.frag.glsl](src/shaders/fragment/transparency-composite.frag.glsl) | Composite transparent layer over depth | 2126224 |

## 6. Diamond values: JS to shader

Values come from `DIAMOND_SETTINGS` in [src/render/diamond.ts](src/render/diamond.ts) and from `GEMS` in [src/scene/materials.ts](src/scene/materials.ts). They are the same values the old viewer passed to `makeDiamond`. The names are the bundle's property names, verified in the minified JS.

| JS property | Value | Shader symbol | Role |
| --- | --- | --- | --- |
| `color` | `0xe4e4e4` | `color` | Per-channel absorption tint. |
| `refractiveIndex` | `2.42` | `refractiveIndex` | IOR of the stone. |
| `dispersion` | `0.004` | `rIndexDelta` | Separate IOR per channel, `refractiveIndex ± rIndexDelta`. |
| `absorptionFactor` | `1` | `absorptionFactor` | Strength of the `exp(-r * (1 - color))` term. |
| `boostFactors` | `{2, 2, 2}` | `boostFactors` | Per-channel gain on each bounce. |
| `gammaFactor` | `1.09` | `gammaFactor` | Applied to the output with `pow`. |
| `reflectivity` | `0.46` | `reflectivity` | Scale on the reflection term. |
| `envMapIntensity` | `1.6` | `envMapIntensity` | Scale on the environment map. |
| `transmission` | `0` | `transmission` | Turns the transmission-sampler branch off. |
| `rayBounces` | `6` | define `RAY_BOUNCES` | Loop count in the refraction trace. The bundle default is 5. |
| `normalMapRes` | `512` | not a shader | Resolution of the baked facet normal map. |

## 7. How the files were produced

1. **Locate the shaders.** Searched the bundle for the diamond names (`isDiamondMaterial`, `makeDiamond`, `prepareDiamondMesh`, `DiamondPlugin`, `rayBounces`) to find the diamond region of the file.
2. **Read the diamond program.** Parsed the `vertexShader` and `fragmentShader` string literals of the diamond material class with a small Node script that decodes JS escapes. This avoids reading the escapes by hand.
3. **Inventory every program.** Ran the same parser over the whole bundle. It found 35 literals with `vertexShader:` or `fragmentShader:`, and the owning class for each where one could be found. It also counted keywords to confirm there is no WGSL, no tessellation and no geometry stage. Template literals with `${…}` placeholders were kept as written.
4. **Identify each program.** Each program was named from its code and uniforms. For example, `tCubeMapNormals` and `getNormalDistance` identify the diamond pair; `saoData` identifies SAO; `frameCount2`, `rayCount` and `objectRadius` identify SSGI. Names for post passes are therefore inferred.
5. **Remove duplicates.** Compared the programs by hash. The PMREM vertex and fullscreen vertex each appear 3 times, which leaves 31 unique programs.
6. **Write the files.** Each unique program was written to one file under [src/shaders/](src/shaders/), grouped by stage. The header gives the stage, the user and the bundle offset. The body is the program text from the bundle.
7. **Reflow the diamond files.** The four diamond programs are one minified line each. Line breaks and indentation were added after `;`, `{` and `}`, outside parentheses. The tokens were checked by stripping all whitespace from both versions and comparing them. They matched.
8. **Write the manifest.** [src/shaders/pipeline.ts](src/shaders/pipeline.ts) imports each file with Vite's `?raw` and groups them by stage. `npx tsc --noEmit` passes.

## 8. Limits and open items

- **How the split works.** Each top-level statement of the original engine became a unit. A dependency graph of units and vendor modules was built with a parser (acorn). Each unit gets the set of feature roots that reach it (diamond, scene, gold). Units with the same set go in one bundle, and units used by several features go in `shared`. Declarations stay at module scope. Statements with load-time effects become steps, and `core` runs them in the original order.
- **Regenerating.** The original file is in git history at `HEAD` (`public/shaders/bundle-0.8.0.mjs`). Run `npm install` in [scripts/split-engine/](scripts/split-engine/), then `node scripts/split-engine/split.mjs <bundle path> src/engine`. The output matches the committed files byte for byte.
- **Feature roots are hand-picked.** The lists of diamond, scene and gold plugins are in `FEATURES` in [split.mjs](scripts/split-engine/split.mjs). A plugin not on a list ends up in `core`, which still works, but it is not split by feature.
- **Only the 4 diamond programs run from `pipeline.ts`.** The other 27 files in `src/shaders/` are reference copies. The engine has its own copies, so editing them changes nothing on screen.
- **Bundles are not optimised.** The generated code is minified and not formatted. Nothing has been tree-shaken or deduplicated across bundles.
- **Checked on one scene only.** The match was checked against one headless screenshot of the default view, with the intro finished. Other views, metals, gems and interactions were not compared.
- **The stone frame is a port, not a copy.** `diamondGeometry.ts` follows the bundle's `al` function. Its eigenvector solver is a Jacobi solver, not the bundle's SVD, so the sign of the axes can differ in degenerate cases. The screenshot matches, but the frame has not been compared numerically with the bundle.
- **The large-mesh path is not verified.** `normalSumFrame` ports the bundle's `nl` function for meshes over 500 triangles. The bundle's version has an index loop that stops early, and this port does not copy that. No stone in this GLB takes this path.
- **The GLB's embedded viewer settings are ignored.** The bundle read `WEBGI_viewer` and the diamond extension. Three.js does not, so any values that were only set there are not applied.
- **Visual check only.** The match was checked by headless Chrome screenshots against the old viewer. Nothing else was compared.
