// Every number the own viewer uses to match the shipped look, in one place.
export const SETTINGS = {
  /** Jittered frames averaged into the final image (replaces MSAA). */
  accumulationFrames: 32,
  /** Render scale on top of devicePixelRatio. */
  pixelRatioScale: 1.5,
  bloom: { threshold: 2.0, knee: 0.03, intensity: 0.36, radius: 0.15, levels: 5 },
  tone: { exposure: 1, contrast: 1.12, saturation: 1 },
  /** Scene environment: Y rotation in radians, intensity multiplier. The engine rotates with the
   *  opposite sign to three.js, so its shipped value 2 is -2 here. */
  environment: { rotationY: -2, intensity: 1 },
  /** Main directional light (direction points toward the light) and its soft shadow. */
  light: { color: 0xcce5ff, intensity: 1, direction: [-0.9, 0.5, -1] as [number, number, number], distance: 3, spread: 0.15, shadowOpacity: 0.7 },
  /** Screen-space reflections on the metal (values from the shipped scene preset). */
  ssr: { intensity: 1, tolerance: 0.2, maskFront: -0.2, rayLength: 5.85 },
  /** Ambient occlusion (shipped values: the app lowers the intensity to 0.1). */
  ssao: { radius: 1, intensity: 0.1, bias: 0.001, epsilon: 0.001, falloff: 1.6, edgeSharpness: 0.1 },
  /** Page background (linear 1 = white), shown where the ring is not drawn. */
  background: [1, 1, 1] as [number, number, number],
};
