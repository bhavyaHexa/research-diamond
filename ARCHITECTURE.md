# Architecture: Hexa Jewelry Viewer

Written for: engineers new to this repo who need to know how the ring gets on screen and where that code lives.

## 1. What this project is

A static, no-build web page that shows a 3D diamond ring (`assets/Ring_v1.glb`) in the browser. The 3D work is done by a vendored WebGI-style engine (`vendor/engine-0.8.0/bundle-0.8.0.mjs`). The project's own code is one HTML page with an inline script, plus a small access-gate module in `auth/`.

There is no bundler, no `package.json`, and no framework. The only Node code is the build step that generates the access-gate config.

## 2. File map

| Path | Role |
| --- | --- |
| [index.html](index.html) | The whole viewer. Holds the page CSS, the `<canvas>`, and the inline module script that configures and runs the renderer. **All rendering code lives here.** |
| [vendor/engine-0.8.0/bundle-0.8.0.mjs](vendor/engine-0.8.0/bundle-0.8.0.mjs) | Minified engine. Exports `ViewerApp`, `AssetManagerPlugin`, `addBasePlugins`, `DiamondPlugin`, `FrameFadePlugin`, `SimpleTextPlugin`, `Box3`, `Vector3`, and more. Treat as a black box. |
| [assets/Ring_v1.glb](assets/Ring_v1.glb) | The ring model. It embeds its own viewer settings (`WEBGI_viewer`: environment, gem env, camera controls, SSAO, bloom, tonemap). |
| [assets/scene/designer-scene.vjson](assets/scene/designer-scene.vjson) | Scene preset: camera target, ground, and other defaults applied after the ring loads. |
| [assets/scene/lightmap-r-2b.hdr](assets/scene/lightmap-r-2b.hdr) | Scene environment light (HDR). |
| [assets/scene/gem-000.hdr](assets/scene/gem-000.hdr) | Environment map used only for the diamonds' refraction. |
| [assets/envs/](assets/envs/) | Extra HDR environments. Not referenced by `index.html` today. |
| [auth/auth.js](auth/auth.js) | Access gate: asks for a key, checks it against a salted PBKDF2 hash, and remembers the session for one hour. |
| [auth/build-auth.mjs](auth/build-auth.mjs) | Generates `auth/auth.config.js` (salt, iterations, hash) from `APP_AUTH_SECRET`. |
| [auth/auth.config.js](auth/auth.config.js) | Generated, gitignored. Never committed. |
| [.github/workflows/main.yml](.github/workflows/main.yml) | CI: on push to `main`, builds the gate config, syncs the site to S3, and invalidates CloudFront. |
| [start.md](start.md) | How to run locally: `py -m http.server 8000`. |

## 3. Layers

```
Browser page (index.html)
 ├─ HTML: <div #stage-div> > <canvas #stage-canvas>
 ├─ CSS: page layout, loader, auth form, options panel (see §7 for what is actually in the DOM)
 └─ Inline module script
      ├─ Config constants (RING, QUALITY, ZOOM, CAMERA_INTRO, METALS, GEMS)
      ├─ Engine import: vendor bundle (ViewerApp, plugins, math)
      ├─ Scene setup: viewer, plugins, ring load, environments, materials
      └─ Camera: orbit centre, zoom limits, intro animation
```

The page has no state of its own beyond these constants and the engine objects. The engine owns the WebGL/WebGPU context, the render loop, and the scene graph.

## 4. Rendering flow (runtime order)

This is the order the inline script in [index.html](index.html) runs. Line numbers refer to that file.

1. **Page paint.** The browser lays out `#stage-div` as a flex child filling the viewport, with `#stage-canvas` at 100% width and height ([index.html:31-43](index.html#L31-L43)). `touch-action: none` on the canvas keeps touch gestures for rotate and zoom, so the page does not scroll.

2. **Config constants** ([index.html:398-432](index.html#L398-L432)).
   - `RING.url` points at the GLB. `RING.whiten` is a regex for stone node names that get the white-diamond treatment (halo `D4xxx` and center `D5`).
   - `QUALITY = 1.5` sets `displayCanvasScaling`, which trades speed for sharpness.
   - `ZOOM` sets the min and max camera distance from the ring centre.
   - `CAMERA_INTRO` sets the start and end positions and duration of the opening orbit.
   - `METALS.yellow` and `GEMS.white` hold the material values applied later.

3. **Engine import** ([index.html:435](index.html#L435)). `await import(".../bundle-0.8.0.mjs")`. Everything below runs inside a `try`. If the import or any step throws, the error is logged to the console and the canvas stays blank.

4. **Viewer creation** ([index.html:438-441](index.html#L438-L441)). `new W.ViewerApp({ canvas, useRgbm: true })` binds the engine to the canvas. The page does not pick a renderer. The bundle includes a WebGL context path (tries `webgl2`, then `webgl`) and a `WebGPURenderer`, but which one `ViewerApp` uses by default was not verified from the minified code.

5. **Plugins** ([index.html:443-450](index.html#L443-L450)).
   - `AssetManagerPlugin` loads files (GLB, HDR, vjson).
   - `addBasePlugins` adds the standard set (ground, tonemap, SSAO, SSR, and so on).
   - `refreshPipeline()` rebuilds the render pipeline after the plugins are in.
   - `FrameFadePlugin.fadeOnSceneUpdate = false` turns off the automatic fade. A `sceneUpdate` listener starts the fade transition by hand instead.
   - `SimpleTextPlugin` is added last.

6. **Ring load** ([index.html:456-462](index.html#L456-L462)). `AssetManager.addFromPath(RING.url, …)` loads the GLB. Auto-center and auto-scale are off, so the file's own size and origin are kept.
   - The GLB's embedded `WEBGI_viewer` settings are applied at this point. Anything set later overrides them, which is why zoom limits are set after this step ([index.html:595-598](index.html#L595-L598)).

7. **Oversize guard** ([index.html:463-467](index.html#L463-L467)). If the bounding box's max x or y is 5 or more, the model is scaled by 0.1. The ring is about 3 units tall when correct, so this catches exports that are about 10x too large.

8. **Scene settings** ([index.html:469-497](index.html#L469-L497)). These override the GLB's embedded settings.
   - `designer-scene.vjson` is imported with `processImported: true`.
   - `gem-000.hdr` replaces the GLB's gem environment. The GLB's own one points to an EXR that is not shipped, which would render the diamonds black.
   - `lightmap-r-2b.hdr` becomes the scene environment, rotated by 2.
   - Ground: shadow map mode, no ground reflection, transparent, roughness 1, not tonemapped.
   - Tonemap: background not tonemapped.
   - Camera controls: pan on, rotate speed 2, polar angle limited to the horizon range.
   - SSR and SSAO are tuned (`intensity = 0.1` for SSAO).

9. **Diamond whitening** ([index.html:501-539](index.html#L501-L539)). For each mesh whose slugified name matches `RING.whiten`, the page calls `Diamond.makeDiamond` once per material group, then `Diamond.prepareDiamondMesh` on every mesh. `prepareDiamondMesh` is required even when `makeDiamond` has run, because it bakes the per-geometry facet normal map. Other materials stay as authored.

10. **Material collection** ([index.html:544-548](index.html#L544-L548)). Meshes are sorted into two sets: diamond materials (`isDiamondMaterial`) and fully metallic ones (`metalness === 1`).

11. **Apply defaults** ([index.html:549-582](index.html#L549-L582)).
    - `setGem("white")` writes color, absorption, boost, refraction index (2.42), dispersion, ray bounces, and so on to every diamond material.
    - `setMetal("yellow")` writes color, roughness, metalness, and IOR to every metal material.
    - Both call `setDirty()` so the engine redraws.
    - These two functions are the only things that change appearance after load. Nothing in the current page calls them except at startup (see §7).

12. **Camera framing** ([index.html:584-598](index.html#L584-L598)). The scene preset's camera target is off-centre. The page measures the ring's bounding-box centre and shifts both camera position and target by the same offset. This keeps the opening distance but orbits the ring. Zoom limits are applied last.

13. **Intro animation** ([index.html:600-652](index.html#L600-L652)).
    - `setCamera(introFrom)` places the camera before the first frame.
    - `playCameraIntro()` moves the camera along a spherical orbit (`r`, `theta`, `phi`) from `from` to `to`. It takes the shorter way round, eases with an in-out cubic over `duration` ms, and runs on `requestAnimationFrame`.
    - Controls are disabled during the intro (`cam.controls.enabled = false`) and re-enabled at the end.
    - With `prefers-reduced-motion`, the camera jumps straight to the end position.

14. **Render loop.** After setup, the page calls `renderer.displayCanvasScaling = QUALITY` and `viewer.setDirty()`. After this the page only calls `setDirty()` when it changes something (materials, camera). The page does not drive its own `requestAnimationFrame` loop for rendering; the redraw timing is up to the engine (not verified in the minified bundle).

15. **Errors.** Any throw in steps 3 to 13 is caught at [index.html:653-655](index.html#L653-L655) and logged. There is no UI for it.

## 5. Public hooks

- `window.viewer` ([index.html:442](index.html#L442)) exposes the viewer for debugging from the browser console.
- `setMetal(key)` and `setGem(key)` are defined inside the script and take a key from `METALS` or `GEMS`. They are not exported and not reachable from outside the module. Adding a UI means moving them to module scope or attaching them to `window`.

## 6. Access gate (auth)

Intended flow, implemented in [auth/auth.js](auth/auth.js):

1. Build time (CI, or locally with `APP_AUTH_SECRET` in `.env`): [auth/build-auth.mjs](auth/build-auth.mjs) draws a random 16-byte salt and runs PBKDF2-SHA-256 (210,000 iterations, 32 bytes) on the secret. It writes `auth/auth.config.js` with `{ salt, iterations, hash }`. The secret itself is never shipped.
2. Page load: `unlock()` imports `auth.config.js`. If that fails, the gate shows "Access isn't set up on this server yet" and nothing behind it loads. If `crypto.subtle` is missing (not https or localhost), it shows a message to use https.
3. A valid session in `localStorage` (`hexa_auth`, with `hash` and `expires`, one hour) skips the form.
4. Otherwise the form is shown. On submit, the entered key is hashed with the same parameters and compared to `hash`. A match stores the session and opens the gate. A mismatch shows an error.
5. When the session expires, the page reloads. This is checked on a timer and again when the tab becomes visible.

Note: `unlock()` must run before the viewer starts for the gate to protect anything. In the current `index.html` it is not called (see §7).

## 7. Known gaps (current state of the code)

These come from reading the code. They are facts about the repo as it is now.

1. **The gate is not wired into the page.** [auth/auth.js](auth/auth.js) exports `unlock()`, but `index.html` never imports it. The page body has only `#stage-div`. There is no `#auth` form, no `#auth-key` input, and no `#auth-submit` button. The viewer script runs without any check, so the gate does not protect the page yet.
2. **The options panel and loader are styled but not present.** The CSS defines `.loader`, `.auth`, and `.panel` with their states (`.ready`, `.done`, `.locked`), but no matching elements exist in the body. Nothing toggles `.loader.done`.
3. **`setGem` and `setMetal` have no caller besides startup.** The gem and metal tile markup they were built for is absent, so the viewer always shows the defaults (white diamonds, yellow gold).
4. **`auth.config.js` is absent from git by design.** Running the page locally with the gate wired would need `node auth/build-auth.mjs` first. Without it, `unlock()` would show the "not set up" message.
5. **Renderer choice is implicit.** The folder name says WebGPU, but the page does not select a renderer. Which one runs depends on the engine's default.

## 8. Deploy flow

1. Push to `main`.
2. GitHub Actions ([.github/workflows/main.yml](.github/workflows/main.yml)) runs `node auth/build-auth.mjs` with the `APP_AUTH_SECRET` secret. The job fails if the secret is missing.
3. AWS credentials are configured from secrets.
4. `aws s3 sync . s3://<bucket> --delete` uploads the site. These paths are excluded: `.git`, `.github`, `.gitignore`, `.env*`, and `auth/build-auth.mjs`.
5. A CloudFront invalidation for `/*` clears the cache.

Because the site is static, there is no server-side rendering or API. The S3 bucket and CloudFront serve the same files as the local dev server.

## 9. Running locally

From the project folder:

```powershell
py -m http.server 8000
```

Open http://localhost:8000. The viewer runs straight away, since the gate is not wired in (§7). Any change to `index.html` takes effect on reload. There is no build step.
