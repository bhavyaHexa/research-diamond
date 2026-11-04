import type { Orbit, Point } from "./types";

// Slugifies a node name ("D4 Halo" -> "d4-halo") so names can be matched by pattern.
export const slug = (s: string | undefined) =>
  (s || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Converts a point into spherical coordinates around `centre`.
export const toOrbit = (p: Point, centre: Point): Orbit => {
  const x = p.x - centre.x;
  const y = p.y - centre.y;
  const z = p.z - centre.z;
  const r = Math.hypot(x, y, z);
  return { r, theta: Math.atan2(x, z), phi: Math.acos(y / r) };
};

export const orbitPoint = ({ r, theta, phi }: Orbit, centre: Point): Point => ({
  x: r * Math.sin(phi) * Math.sin(theta) + centre.x,
  y: r * Math.cos(phi) + centre.y,
  z: r * Math.sin(phi) * Math.cos(theta) + centre.z,
});

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
