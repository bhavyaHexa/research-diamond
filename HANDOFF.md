# Handoff notes

Branch: `shader-file-sorting`. **Nothing from this work is committed.** The user declined committing docs earlier ("Not yet") and has not asked since, so ask before committing.

Goal from the user: a complete viewer with the whole rendering pipeline (all effects, HDR/light, how the image is drawn), and then a separate viewer on readable code that renders **the same as the current one**. "Same final output" is the acceptance bar.

## Where we are

Two deliverables exist. Both build (`npm run build`, `npx tsc --noEmit`).

### A. Pipeline Studio (done): panel on the engine-backed viewer at `/`
Controls for every pass, effect, light and material, built from the engine's own `uiConfig`.
- Code: `src/pipeline/*` (only code that touches the engine; components never import it), `src/components/pipeline/*`, store additions in `src/store.tsx`, registration in `src/engine.ts`, panel mounted in `src/App.tsx`, styles in `src/index.css`.
- Tabs: Pipeline (live pass list with on/off), Light & HDR (image switch, rotation, intensity, camera-fixed, gem environment), Materials, Effects, Buffers (debug views), Export (manifest JSON, reset, converged-frame capture).
- Verified earlier in the browser: 183 settings with exact manifest round trip, 14 passes, buffer views, HDR switching.
- Changed after that and **not re-verified in the browser**: `markReady()` in `src/store.tsx` now retakes the "shipped" snapshot 3 s after load (fix for reset giving rotation 0 instead of 2).
- Golden frame: only a helper, `matchesGolden()` in `src/pipeline/manifest.ts`, and `tests/golden/README.md`. No project test runner, no stored golden file. Capture once from the Export tab and save as `tests/golden/default.json`.

### B. Own viewer (in progress): `/own.html`, code in `src/own/`
Plain three.js, no vendored engine. Full description in `OWN_VIEWER.md`. Frame: depth/normal pre-pass, SSAO, scene colour (gold patched with SSR and AO, stones use the diamond shader from `src/render/`), 32-frame jittered accumulation clamped at 16, bloom, composite (ACES, contrast 1.12, saturation 1, sRGB, white background). All numbers live in `src/own/settings.ts`.

Measured against the engine at the same camera (converged frames, 48x30 colour grid):
- Mean cell difference about 3.7 of 255.
- Ground shadow and stones match within about 3 levels.
- **Gold is off:** about (203, 182, 148) vs engine (213, 187, 147). Red is about 10 low and the per-cell pattern correlates only about 0.3. This is the main open problem.

## What is left (in suggested order)

1. **Gold mismatch.** Not found yet. Ruled out: material values (identical), tone mapping (identical ACES code), contrast/saturation order, light intensity and colour, SSR tolerance/ray length, SSR capping, ground reflection, environment rotation sign and mode (fixed, see below). Untested ideas:
   - Compare the environment map both viewers actually sample. Engine uses its own PMREM (check size, RGBM handling); three 0.187 PMREM may differ. Render both as a debug view of the same reflection direction.
   - Jitter size: engine's sub-pixel jitter may be larger/different than mine (affects blur of fine reflections).
   - Engine SSR ray logic: it marches in screen space with 1-4 passes and its own auto ray length; mine is a simplified 16-step view-space march. The engine's SSR slightly **lightens** the gold, mine darkens it. A per-pixel debug of hit rate on both would show who is wrong.
   - Whether engine SSAO/shadow affects the gold more than mine at the same settings.
   - A per-pixel (not 40 px cell) comparison with an image diff would be more informative than the grid.
2. **Pavé band stones:** included as diamonds (pattern `d(1xxx|4xxx|5)` in `src/render/threeMaterials.ts`). Looks right visually but was not measured separately.
3. **Ground shadow:** direction (-0.9, 0.5, -1) is the engine's; opacity 0.7 and spread 0.15 were tuned by eye and by the grid metric. Engine uses VSM and a baked ground; mine uses PCFSoft and a ShadowMaterial plane. Shape differs slightly.
4. **Controls for the own viewer:** none yet. The Studio only drives the engine. Next natural step is to give the own viewer a small panel (or reuse `src/pipeline` control types) so every setting in `settings.ts` can be changed live.
5. **Equivalence tests:** store a golden grid/frame for both viewers and assert the difference stays under a threshold.
6. **Stage B of the original plan** (replace engine parts with owned modules behind a `backend = engine | three` flag; later an own WebGL2 backend) is not started beyond the own viewer above.
7. **Docs to fix:** `Gold_Metal_Rendering_Complete.md` may still carry old bloom numbers (correct: iterations 5, radius 0.15, power 7.94 in this scene). `Rendering_Engine_Reverse_Engineering.md` was corrected for one occurrence only.
8. Ground group description in the Studio ("Ground & baked shadow") should mention it also holds the ground-shadow light direction.

## Findings worth keeping (cost real time)

- **Camera-fixed environment (gold):** the engine's `FIX_ENV_DIRECTION` keeps reflection directions in **view space** and rotates them only about Y, with the **opposite sign** to three.js. Shipped rotation 2 is `-2` in three. The environment is turned by the inverse camera rotation to cancel three's view-to-world step. Implemented in `src/own/viewer.ts` (`envMode = "inverse"`). Found by fitting rotations against the engine frame.
- **Scene environment intensity overrides material intensity.** The stones' stored `envMapIntensity` 1.6 never applies; they are lit at the scene value 1. Setting 1 made the stones match.
- Diamonds also use `FIX_ENV_DIRECTION` (added to the defines in `src/render/diamond.ts`); it made no measurable difference.
- **RGBM range 16:** every HDR value in the engine is capped at 16. Without the same clamp, diamond sparkle overflowed half-float and turned stones black in accumulation (`accumulate.frag.glsl`).
- Engine camera: **fov 25** (was 24 in the old port, changed in `src/render/threeCamera.ts`), orbit target is the world origin, end-of-intro position `(-6.51, 7.65, -2.74)`.
- Engine light (scene preset): colour 0xCCE5FF, intensity 1, direction (-0.9, 0.5, -1), shadow 1024, frustum 4, radius 2, bias -0.001, spread 0.01. SSAO intensity is lowered to 0.1 by `src/scene/setup.ts` (the preset says 0.3).
- Engine reflection (SSR) reads the **previous accumulated frame**, not the current one.
- `src/own/ground.ts`: the ground plane is drawn into the depth pre-pass, so the gold can reflect it; this darkened the gold, so SSR tolerance was set to 0.2.

## How to run and compare

```bash
npm run dev          # then open /  (engine viewer + Studio) and /own.html (own viewer)
npx tsc --noEmit
npm run build        # builds both pages
```

Compare method (used throughout):
1. Engine page `/`: wait for load, set the camera to the end-of-intro position, drive frames, store a 48x30 grid of average colours of the canvas in `localStorage["engineGrid"]` as `{w, h, GX, GY, grid}`.
2. Own page `/own.html` (same origin so it can read it): `own.compare()` prints mean cell difference, gold/stone averages and shadow bias.
3. Live tuning in the own page console: `settings` (the `SETTINGS` object), `ssr` (SSR uniforms), `own.ground.setDirection(x,y,z)`, `own.envMode.value`, `own.pipeline.composite.uniforms`, `own.pipeline.ssao.ao.uniforms`. Call `own.resetCamera()` and `own.pipeline.restart()` before each measurement, then `own.tick()` about 34 times.

## Environment quirks (Claude browser pane)

- Hidden preview pane: the R3F canvas stays 300x150 and the loader sticks at 0% until the viewport is resized. Nudge with `resize_window` plus `window.dispatchEvent(new Event("resize"))`, then wait about 7 s.
- `requestAnimationFrame` is throttled; drive the engine with `viewer._animationLoop({time, deltaTime})` and the own viewer with `own.tick()`.
- Screenshots lag one capture; take two when checking a change.
- **Any click or key in the preview page moves the camera** and silently invalidates comparisons (this happened). Call `own.resetCamera()` before measuring.
- The engine page's `viewer` object is `window.viewer`; its camera is `viewer.scene.activeCamera` (set `.position` then `positionUpdated()`).
- Long multi-config JS loops in one call can time out ("Internal error"); keep them to about 8 renders per call.
- Mind token use: the user complained about long browser testing. Keep tests short and numeric; avoid screenshots unless needed.

## Constraints and decisions from the user

- Foundation: "Three.js now, own backend later". Scope: whole engine. Fidelity: match the current look, fix known quirks later.
- **Licence:** the origin and licence of `bundle-0.8.0.mjs` is unknown. It contains the name "webgi" in identifiers but no licence or company text; do not describe it as a specific commercial SDK. The own viewer is written from the documented behaviour; **do not copy bundle code into new readable modules.** Some shaders under `src/shaders/` and `src/render/` are extracted from the bundle by an earlier commit; treat their provenance as unresolved and raise it before shipping.
- Keep MobX out of engine objects. Components must not import the vendor engine.
- User asked for lower effort or a cheaper model on easy steps, and for short browser tests.
- Stray keystroke messages arrived mid-turn once; they were ignored.

## Files changed or added in this work (all uncommitted)

Modified: `Rendering_Engine_Reverse_Engineering.md`, `src/App.tsx`, `src/constants.ts`, `src/engine.ts`, `src/index.css`, `src/render/diamond.ts`, `src/render/threeCamera.ts`, `src/render/threeMaterials.ts`, `src/store.tsx`, `vite.config.ts` (second page `own.html`).
New: `own.html`, `OWN_VIEWER.md`, `HANDOFF.md`, `src/own/*`, `src/pipeline/*`, `src/components/pipeline/*`, `tests/golden/README.md`, `.claude/launch.json` (dev server config for the preview pane).
Not mine, already untracked: `temporal-aa-files/`.
Earlier docs at repo root (`Gold_Metal_Rendering_Complete.md`, `Diamond_Rendering_Complete.md`, `Diamond_Shader_Walkthrough.md`, `Engine_Shaders.md`, `engine-shaders/`) hold the reverse-engineering reference; `Gold_Metal_Rendering_Complete.md` section 7 has the SSR/SSAO specs used for the own viewer.

Plan file from plan mode: `C:\Users\Amit Bhakhar\.claude\plans\now-no-code-changes-synchronous-snowglobe.md`. Full conversation transcript: `C:\Users\Amit Bhakhar\.claude\projects\D--Harshil-REA-jewelry-rendering-pipeline\1f09aa14-2caf-4de1-b9f6-bf1799bacdea.jsonl`.
