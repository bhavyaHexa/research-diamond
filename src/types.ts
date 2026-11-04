export type MetalKey = "yellow";
export type GemKey = "white";

export interface Point {
  x: number;
  y: number;
  z: number;
}

// Spherical position around the ring centre.
export interface Orbit {
  r: number;
  theta: number;
  phi: number;
}

export interface MetalSpec {
  color: [number, number, number];
  roughness: number;
  ior: number;
}

export interface GemSpec {
  color: string;
  absorption: number;
  boost: number;
}
