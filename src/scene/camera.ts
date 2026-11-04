import type { Orbit, Point } from "../types";
import type { VendorEngine, Viewer } from "../vendor";
import { easeInOut, orbitPoint, toOrbit } from "../utils";

// Zoom limits: distance from the ring centre (the ring is ~3 units tall; the page opens
// at ~7.7). min = closest zoom-in, max = furthest zoom-out.
export const ZOOM = { min: 6.5, max: 15.6 };

// Intro: the camera starts at `from`, circles the ring centre (shortest way round)
// to `to`, easing distance and height on the way. Positions are world x, y, z.
export const CAMERA_INTRO = {
  from: { x: 11.12, y: 7.38, z: -8.08 },
  to: { x: -6.51, y: 7.65, z: -2.74 },
  duration: 2800,
};

// Orbit controls: pan on, faster rotate, limited to the horizon range.
export function applyControls(viewer: Viewer) {
  const controls = viewer.scene.activeCamera.controls;
  controls.enablePan = true;
  controls.rotateSpeed = 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minPolarAngle = -0.001;
}

// The scene preset's camera target is off-centre, so the target and camera are shifted
// by the same offset: same opening view and distance, but orbiting the ring.
// Returns the ring centre.
export function frameRing(W: VendorEngine, viewer: Viewer, model: Viewer): Point {
  const cam = viewer.scene.activeCamera;
  const ringCenter = new W.Box3().setFromObject(model.modelObject).getCenter(new W.Vector3());
  const offset = ringCenter.clone().sub(cam.controls.target);
  cam.position = cam.cameraObject.position.clone().add(offset);
  cam.target = ringCenter.clone();
  cam.setDirty?.();
  // Zoom limits go after the ring loads: the GLB's embedded config resets the controls.
  cam.controls.minDistance = ZOOM.min;
  cam.controls.maxDistance = ZOOM.max;
  return ringCenter;
}

// Orbits the camera from CAMERA_INTRO.from to CAMERA_INTRO.to. Input is off while it
// plays. Reduced motion jumps straight to the end position.
export function playCameraIntro(W: VendorEngine, viewer: Viewer, centre: Point): Promise<void> {
  const cam = viewer.scene.activeCamera;
  const setCamera = (orbit: Orbit) => {
    const p = orbitPoint(orbit, centre);
    cam.position = new W.Vector3(p.x, p.y, p.z);
    cam.setDirty?.();
    viewer.setDirty();
  };

  const from = toOrbit(CAMERA_INTRO.from, centre);
  const to = toOrbit(CAMERA_INTRO.to, centre);
  let turn = to.theta - from.theta;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // shortest way round

  // The ring renders from the intro's first position.
  setCamera(from);

  return new Promise((resolve) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCamera(to);
      return resolve();
    }
    cam.controls.enabled = false;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / CAMERA_INTRO.duration);
      const k = easeInOut(t);
      setCamera({
        r: from.r + (to.r - from.r) * k,
        theta: from.theta + turn * k,
        phi: from.phi + (to.phi - from.phi) * k,
      });
      if (t < 1) requestAnimationFrame(frame);
      else {
        cam.controls.enabled = true;
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
