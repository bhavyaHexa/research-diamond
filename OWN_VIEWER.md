# Own viewer (`/own.html`)

A separate viewer on plain three.js with a readable frame pipeline. It does not import the vendored engine. The original viewer (`/`) is unchanged.

## One frame (`src/own/pipeline.ts`)

1. **Depth/normal pre-pass** (`ssr.ts`, `shaders/depth.*`): view-space distance and normal of everything drawn, jittered like the colour frame.
2. **SSAO** (`ssao.ts`, `shaders/ssao*.glsl`): 11-sample spiral occlusion plus a bilateral blur. The metal multiplies its indirect light by it.
3. **Scene colour**: three.js draws the ring into a half-float target. The gold is `MeshPhysicalMaterial` patched with SSR; the stones use the diamond shader in `src/render/`; the ground only receives the shadow.
4. **Accumulate** (`shaders/accumulate.frag.glsl`): running average of 32 jittered frames (anti-aliasing, noise removal). Each frame is clamped to 16, like the engine's RGBM range.
5. **Bloom** (`shaders/bloom.frag.glsl`): prefilter at threshold 2, five down/up levels.
6. **Composite** (`shaders/composite.frag.glsl`): ACES, contrast 1.12, saturation 1, sRGB, white background where nothing is drawn.

All numbers are in `src/own/settings.ts`.

## Things worth knowing

- The engine's camera-fixed environment keeps reflection directions in view space and rotates them only about Y, with the opposite sign to three.js. Shipped rotation 2 is `-2` here, and the environment is turned by the inverse camera rotation to cancel three.js's view-to-world step (`viewer.ts`).
- The engine's scene environment intensity overrides each material's own value, so the stones' stored 1.6 never applies: they are lit at 1.
- Diamond stones include the band stones `D1xxx`, halo `D4xxx` and centre `D5`.

## Checking against the engine

Save a converged engine frame as a colour grid in `localStorage["engineGrid"]` (see `src/own/main.ts`), then run `own.compare()` in the own viewer's console. It prints the mean cell difference and the gold, stone and shadow averages. Compare converged frames only.

## Known differences (as measured)

- Mean cell difference about 3.7 levels out of 255.
- Gold is about 10 levels less red than the engine's, and its reflection pattern correlates only about 0.3 per cell. Cause not found. Ruled out: material values, tone mapping, light, grading order, SSR parameters.
- Stones and ground shadow match within about 3 levels.
- No depth of field, SSGI, bevel, contact shadows or other optional effects: the shipped scene has them off.
