# Hexa 3D Viewer (`/hexa-viewer.html`)

A general-purpose 3D model viewer on plain three.js with a readable frame pipeline. It does not import the vendored engine. The original engine viewer (`/`) is unchanged.

## One frame (`src/hexa-viewer/pipeline.ts`)

1. **Depth/normal pre-pass** (`ssr.ts`, `shaders/depth.*`): view-space distance and normal of everything drawn, jittered like the colour frame.
2. **SSAO** (`ssao.ts`, `shaders/ssao*.glsl`): 11-sample spiral occlusion plus a bilateral blur. The metal multiplies its indirect light by it.
3. **Scene colour**: three.js draws the ring into a half-float target **that has a depth buffer**. The gold is `MeshPhysicalMaterial` patched with SSR; the stones use the diamond shader in `src/render/`; the ground only receives the shadow.
4. **Accumulate** (`shaders/accumulate.frag.glsl`): running average of 32 jittered frames (anti-aliasing, noise removal), in full-float targets. Each frame is clamped to 16, like the engine's RGBM range.
5. **Bloom** (`shaders/bloom.frag.glsl`): prefilter at threshold 2, five down/up levels.
6. **Composite** (`shaders/composite.frag.glsl`): ACES, contrast 1.12, saturation 1, sRGB, white background where nothing is drawn.

All numbers are in `src/hexa-viewer/settings.ts`.

## Lights (`src/hexa-viewer/ground.ts`)

Two directional lights, because the shipped scene lights the gold from a low side direction `(-0.9, 0.5, -1)` but its soft ground shadow falls from almost straight above:
- `light` lights the metal (colour 0xCCE5FF, intensity 1). It casts no shadow.
- `shadowLight` (intensity ~0) casts only the ground shadow, from about `(0.01, 1, 0.01)`.
- **The soft shadow is baked once in world space** (`ground.bake`, called from `viewer.ts`): the light is moved by `spread` for each of 64 shadow maps, each map is added into one 1024x1024 texture seen from straight above, and the ground shows that texture (black with the texture as alpha). The shadow therefore does not depend on the camera or on the frame accumulation: it is complete, soft and in place from the first frame after the camera moves. (It used to be jittered per frame and averaged by the accumulation, so after every camera move it restarted as one hard, off-centre shadow that drifted to the centre over 32 frames.) `shadowLight` only casts while baking. `ground.setDirection` rebakes; `scripts/compare/shadow-sync.mjs` and `shadow-bake-stats.mjs` check it.

## Things worth knowing

- **The scene render target needs a depth buffer.** It was missing at first. Without it, hidden surfaces overwrite visible ones and the gold looked like streaked, blocky noise. This was the main reason the gold did not match; fixing it dropped the per-cell gold error from about 26-40 levels to about 14-24 and made the pattern match.
- The engine's camera-fixed environment keeps reflection directions in view space and rotates them only about Y. The environment is built as `camera rotation * Y rotation(2)` (a matrix, not an Euler-component add) in `viewer.ts`; the shipped yaw is +2.
- Diamond stones include the band stones `D1xxx`, halo `D4xxx` and centre `D5`.
- Stone brightness: the stored diamond `envMapIntensity` is 1.6, but fitting the stones' average against the shipped frame gives about 1.4 (`SETTINGS.stones.envIntensity`). The reason is not known.

## Checking against the engine (headless, no preview pane)

```bash
npm run dev            # dev server on :5173
node scripts/compare/compare-own-vs-engine.mjs "base=" "ssr15=ssr.ssrIntensity.value=1.5"
node scripts/compare/capture-frames.mjs        # writes tmp-engine.png and tmp-own.png
```

Both need Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` and `puppeteer-core` (installed in `node_modules` but not listed in `package.json`; add it as a dev dependency). The compare script renders the engine once at the end-of-intro camera, renders the own viewer once per setup (each argument is `name=js`, run in the own page with `own`, `ssr` and `window.settings` available) and prints, per class of grid cells (gold, stone, shadow, all), the mean difference (own - engine) and the mean absolute difference. Cells are classified from the engine's colour.

## How the gold was matched (2026-11-13)

The method was to split the problem instead of tuning numbers (scripts in `scripts/compare/`):
1. `compare-post.mjs`: the engine's own HDR frame through our composite pass reproduces the engine's final image (mean abs 1.2 levels), so tone mapping, contrast and sRGB are correct.
2. `compare-shading.mjs`: with SSR off in both viewers, the gold matches within 2-3% (correlation 0.98), so the material, HDR environment, light and AO are correct. Only SSR differed.
3. `compare-depth.mjs`: the engine's G-buffer depth and ours agree (ground included), so the SSR inputs match.
4. `compare-ssr-history.mjs`: giving our SSR the engine's history frame did not change the result, so the difference was in the shader logic.
5. Reading the engine's compiled gold shader (`engine-gold-shader.mjs`) showed two things we had wrong: the front-ray mask has the opposite sign (`-4 * dot(viewDir, normal) + 3.8`), and a hit is accepted even when it lands slightly before the ray start (t < 0, i.e. a ray skimming its own surface hits it). The second was the main cause: it makes the engine's SSR darken the gold about twice as much at grazing angles.
Other details copied from the engine: GGX-sampled reflection direction with interleaved gradient noise, depth looked up bilinearly as sqrt(normalised depth), and the engine settles over several accumulation cycles (so measure it after at least 4-5 cycles).

## How the stones were matched

Same split method (`scripts/compare/`): the diamond shader text, uniforms, gem environment texture (512x512 half float) and stone geometry were all identical to the engine's, yet the stones' pixel correlation was only about 0.5. The cause was found by reading the engine's per-stone data:
- **The engine shares one normal-capture cube between many stones.** The cube captured from `D4001` is used by every halo stone and by the centre stone `D5`; the cube from `D1001` by all band stones. Each stone still uses its own frame (centre, alignment matrix) in the shader. We captured one cube per stone. Sharing per group (`src/render/threeMaterials.ts`, `whitenDiamonds`) raised the stone correlation from about 0.5 to 0.85 and halved the stone error. (`find-capture-source.mjs` identified D4001 by capturing every stone and correlating with the engine's cube.)
- The gem environment is used as the raw equirect texture (the engine compiles the diamond program with `ENV_MAP_TYPE 1`), and the normal cube is read with nearest filtering (`src/render/threeLights.ts`, `diamond.ts`).
- Bloom now follows the engine: per-level weights from radius 0.15 and power 7.94, prefilter threshold 2 with soft threshold 0.03, and a final 4-tap blur of the glow (`pipeline.ts`, `bloom.frag.glsl`).
- Engine and own stone frames differ by axis signs (ours negate x, sometimes y); that does not matter as long as each group's frames are consistent.

## Known differences (as measured, after the stone fix)

- Whole frame: mean absolute cell difference 1.25 of 255.
- Gold: mean difference (+2.9, +4.8, +5.8), abs 5.0.
- Stones: mean difference about 0 at `envIntensity` 1.4, abs 8.4 (was 17). The stored value is 1.6; 1.4 is a fit and the reason for the 12% gap is not known (the stone correlation is now 0.85).
- Shadow: mean difference about -2.5, abs 3.6.
- No depth of field, SSGI, bevel, contact shadows or other optional effects: the shipped scene has them off.
