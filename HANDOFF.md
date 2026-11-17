# Handoff notes

Branch: `shader-file-sorting`. The Studio and the first own-viewer version were committed by the user (`688c785`, then `e82b854`). Everything after that (depth-buffer fix, two-light shadow, SSR/env rewrite by an earlier parallel session, scripts, docs) is **uncommitted**; ask before committing.

**Update 2026-11-13 (UI, latest):** the Hexa 3D Viewer now has the approved UI: empty state, drag-and-drop / file / link upload (GLB, GLTF, Draco, Meshopt), one docked 440 px panel (Scene, Material, Environment, Render tabs; view modes; export), HDR/EXR upload, Clear background, mobile layout. The sample ring is `?sample`; compare scripts use `?sample&bare`. Sample match vs the engine unchanged (frame 1.17, gold 4.9, shadow 3.5, stones 8.2). Not done: OBJ/FBX/STL, non-GLB environments by URL, thumbnails for built-in HDRs (gradients), generic-model quality tuning (SSR/SSAO were tuned on the ring), controls for stone/SSR fine settings beyond the Render tab. See `HEXA_3D_VIEWER.md` ("Using it"). Uncommitted: all UI work.

**Update 2026-11-13:** the gold now matches closely. Two causes were fixed: the scene render target had no depth buffer, and the SSR port differed from the engine (mask sign, hits at t < 0). Stones now also match (shared normal capture per group, engine-style bloom). Whole-frame mean abs difference is 1.25 of 255; gold abs 5.0, stones abs 8.4, shadow abs 3.6. See `HEXA_3D_VIEWER.md`. Viewer rebranded as "Hexa 3D Viewer" (a general-purpose 3D model renderer, not jewelry-specific).

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

### B. Hexa 3D Viewer (in progress): `/hexa-viewer.html`, code in `src/hexa-viewer/`
Plain three.js, no vendored engine. General-purpose 3D model viewer. Full description in `HEXA_3D_VIEWER.md`. Frame: depth/normal pre-pass, SSAO, scene colour (gold patched with SSR and AO, stones use the diamond shader from `src/render/`), 32-frame jittered accumulation clamped at 16, bloom, composite (ACES, contrast 1.12, saturation 1, sRGB, white background). All numbers live in `src/hexa-viewer/settings.ts`.

Measured against the engine at the same camera (converged frames, 48x30 colour grid; details in `HEXA_3D_VIEWER.md`):
- Whole frame: mean abs cell difference about 1.65 of 255 (was about 3.7).
- Shadow close (abs about 5-7); stones match on average (abs about 17, facet pattern differs, ours greyer).
- **Gold:** mean difference (+2.6, +4.2, +4.4), abs 5.1 after the SSR fix.

## What is left (in suggested order)

1. **Remaining small gaps:** the stone `envIntensity` is a fit (1.4 vs the stored 1.6); gold is still about 3-6 levels pale; the ground shadow is a little harder than the engine's. Method for each: switch terms off in both viewers and compare (`scripts/compare/`). Beyond that: controls for the Hexa 3D Viewer, an automated equivalence test, then the larger Stage B items below.
2. **Pavé band stones:** included as diamonds (pattern `d(1xxx|4xxx|5)` in `src/render/threeMaterials.ts`). Looks right visually but was not measured separately.
3. **Ground shadow:** a separate near-overhead shadow-only light (`SETTINGS.groundShadow`: direction (0.01,1,0.01), spread 0.5, opacity 0.45), now **baked once in world space** into a texture (64 samples, 1024²; see `HEXA_3D_VIEWER.md`), so it is identical in every frame and camera angle (fixed 2026-11-13: it was jittered per frame, so after a camera move it was one hard off-centre shadow that drifted). Matches the engine at shadow abs 3.5. Engine uses VSM and a baked ground; mine uses PCFSoft shadow maps averaged by the bake. The engine's is a little softer.
   3b. **Stones:** facet pattern differs (abs about 17); engine stones look whiter and brighter. Untested: diamond uniforms such as `reflectivity`, `gammaFactor` under the corrected pipeline; stone `envIntensity` 1.4 is a fit, not a derived value.
4. **Controls for the Hexa 3D Viewer:** done (docked panel, see the UI update at the top). Remaining ideas: light direction and colour, SSR/SSAO fine settings, camera presets, more import formats.
5. **Equivalence tests:** store a golden grid/frame for both viewers and assert the difference stays under a threshold.
6. **Stage B of the original plan** (replace engine parts with owned modules behind a `backend = engine | three` flag; later an own WebGL2 backend) is not started beyond the own viewer above.
7. **Docs to fix:** `Gold_Metal_Rendering_Complete.md` may still carry old bloom numbers (correct: iterations 5, radius 0.15, power 7.94 in this scene). `Rendering_Engine_Reverse_Engineering.md` was corrected for one occurrence only.
8. Ground group description in the Studio ("Ground & baked shadow") should mention it also holds the ground-shadow light direction.

## Findings worth keeping (cost real time)

- **The scene render target must have a depth buffer** (`src/hexa-viewer/pipeline.ts`, `target(w, h, true)`). Without it hidden surfaces overwrite visible ones; the gold showed blocky streaks and every comparison number was dominated by that. Found by rendering the same scene directly to the canvas (smooth) and into the target (streaky) and diffing the two. Several earlier "findings" were calibrated under this bug (below).
- **Camera-fixed environment (gold):** the engine's `FIX_ENV_DIRECTION` keeps reflection directions in **view space** and rotates them only about Y. In three the environment is `camera rotation * Y rotation` as a **matrix** (`environmentRotation.setFromRotationMatrix`), with the shipped yaw **+2**. (The earlier "-2 with an Euler add" fit was an artefact of the depth bug and a different composition; the matrix form with +2 is correct and has the lowest cell variance.) `src/hexa-viewer/viewer.ts`.
- **Stone intensity:** the earlier conclusion "scene intensity overrides the stones' 1.6, use 1.0" was calibrated under the depth bug. With the fix, the stones' mean matches at about 1.4 (`SETTINGS.stones.envIntensity`), not 1.0 or 1.6.
- Diamonds also use `FIX_ENV_DIRECTION` (added to the defines in `src/render/diamond.ts`); it made no measurable difference.
- **RGBM range 16:** every HDR value in the engine is capped at 16. Without the same clamp, diamond sparkle overflowed half-float and turned stones black in accumulation (`accumulate.frag.glsl`).
- Engine camera: **fov 25** (was 24 in the old port, changed in `src/render/threeCamera.ts`), orbit target is the world origin, end-of-intro position `(-6.51, 7.65, -2.74)`.
- Engine light (scene preset): colour 0xCCE5FF, intensity 1, direction (-0.9, 0.5, -1), shadow 1024, frustum 4, radius 2, bias -0.001, spread 0.01. SSAO intensity is lowered to 0.1 by `src/scene/setup.ts` (the preset says 0.3).
- Engine reflection (SSR) reads the **previous accumulated frame**, not the current one.
- `src/hexa-viewer/ground.ts`: two lights (gold light from the preset direction, shadow-only light overhead). The ground plane is in the depth pre-pass so the gold can reflect it. SSR tolerance is the shipped 0.5.
- Accumulation targets are full float (`FloatType`), the scene and bloom targets half float.

## How to run and compare

```bash
npm run dev          # then open /  (engine viewer + Studio) and /hexa-viewer.html (Hexa 3D Viewer)
npx tsc --noEmit
npm run build        # builds both pages
```

Compare method (headless, preferred; avoids the preview pane): `node scripts/compare/compare-own-vs-engine.mjs "name=js" ...` and `node scripts/compare/capture-frames.mjs` (see `HEXA_3D_VIEWER.md`). They need Chrome and `puppeteer-core` (in `node_modules`, not in `package.json`). Live tuning in the Hexa 3D Viewer page console: `settings` (the `SETTINGS` object), `ssr` (SSR uniforms), `hexaViewer.ground.setDirection(x,y,z)`, `hexaViewer.envMode.value`, `hexaViewer.pipeline.composite.uniforms`, `hexaViewer.pipeline.ssao.ao.uniforms`. `hexaViewer.resetCamera()` then `hexaViewer.tick()` about 34 times before each measurement.

Leftover scratch files (not deleted; deleting was refused in the last session): `tmp-*.png`, `tmp-*.mjs` in the repo root (`tmp-gold-diff*.mjs` came from an earlier session; `tmp-gold-diff.mjs` was edited into a sweep script and is superseded by `scripts/compare/`). Safe to remove.

## Environment quirks (Claude browser pane)

- Hidden preview pane: the R3F canvas stays 300x150 and the loader sticks at 0% until the viewport is resized. Nudge with `resize_window` plus `window.dispatchEvent(new Event("resize"))`, then wait about 7 s.
- `requestAnimationFrame` is throttled; drive the engine with `viewer._animationLoop({time, deltaTime})` and the Hexa 3D Viewer with `hexaViewer.tick()`.
- Screenshots lag one capture; take two when checking a change.
- **Any click or key in the preview page moves the camera** and silently invalidates comparisons (this happened). Call `hexaViewer.resetCamera()` before measuring.
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

Modified: `Rendering_Engine_Reverse_Engineering.md`, `src/App.tsx`, `src/constants.ts`, `src/engine.ts`, `src/index.css`, `src/render/diamond.ts`, `src/render/threeCamera.ts`, `src/render/threeMaterials.ts`, `src/store.tsx`, `vite.config.ts` (second page `hexa-viewer.html`).
New: `hexa-viewer.html`, `HEXA_3D_VIEWER.md`, `HANDOFF.md`, `src/hexa-viewer/*`, `src/pipeline/*`, `src/components/pipeline/*`, `tests/golden/README.md`, `.claude/launch.json` (dev server config for the preview pane).
Not mine, already untracked: `temporal-aa-files/`.
Earlier docs at repo root (`Gold_Metal_Rendering_Complete.md`, `Diamond_Rendering_Complete.md`, `Diamond_Shader_Walkthrough.md`, `Engine_Shaders.md`, `engine-shaders/`) hold the reverse-engineering reference; `Gold_Metal_Rendering_Complete.md` section 7 has the SSR/SSAO specs used for the own viewer.

Plan file from plan mode: `C:\Users\Amit Bhakhar\.claude\plans\now-no-code-changes-synchronous-snowglobe.md`. Full conversation transcript: `C:\Users\Amit Bhakhar\.claude\projects\D--Harshil-REA-jewelry-rendering-pipeline\1f09aa14-2caf-4de1-b9f6-bf1799bacdea.jsonl`.
