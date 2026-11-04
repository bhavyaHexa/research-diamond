import { Box3, Group, PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Orbit, Point } from "../types";
import { easeInOut, orbitPoint, toOrbit } from "../utils";

// Vertical field of view, in degrees.
export const FOV = 24;

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

// The ring's bounding-box centre, which the camera orbits.
export function ringCentre(ring: Group): Point {
  return new Box3().setFromObject(ring).getCenter(new Vector3());
}

// Orbit controls: pan on, faster rotate, limited to the horizon range.
export function createControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement, centre: Point, redraw: () => void) {
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(centre.x, centre.y, centre.z);
  controls.enablePan = true;
  controls.rotateSpeed = 2;
  controls.maxPolarAngle = Math.PI / 2;
  controls.minPolarAngle = -0.001;
  // Zoom limits go after the ring loads, so they are set here.
  controls.minDistance = ZOOM.min;
  controls.maxDistance = ZOOM.max;
  controls.addEventListener("change", redraw);
  return controls;
}

// Orbits the camera from CAMERA_INTRO.from to CAMERA_INTRO.to. Input is off while it
// plays. Reduced motion jumps straight to the end position.
export function playCameraIntro(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  centre: Point,
  redraw: () => void,
): Promise<void> {
  const setCamera = (orbit: Orbit) => {
    const p = orbitPoint(orbit, centre);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(centre.x, centre.y, centre.z);
    redraw();
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
      controls.update();
      return resolve();
    }
    controls.enabled = false;
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
        controls.enabled = true;
        controls.update();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
