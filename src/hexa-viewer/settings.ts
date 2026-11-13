// Every number the own viewer uses to match the shipped look, in one place.
export const SETTINGS = {
  /** Jittered frames averaged into the final image (replaces MSAA). */
  accumulationFrames: 32,
  /** Shifts the sub-pixel jitter sequence (tuning only: shows how much of a difference is just sampling noise). */
  jitterOffset: 0,
  /** Render scale on top of devicePixelRatio. */
  pixelRatioScale: 1.5,
  /** Bloom: threshold/knee (soft threshold), final intensity, how the five mip levels are weighted (radius, power). */
  bloom: { threshold: 2.0, knee: 0.03, intensity: 0.36, radius: 0.15, power: 7.94, levels: 5 },
  tone: { exposure: 1, contrast: 1.12, saturation: 1 },
  /** Scene environment: Y rotation in radians (the shipped value), intensity multiplier. */
  environment: { rotationY: 2, intensity: 1 },
  /** Main directional light (direction points toward the light) and its soft shadow. */
  light: { color: 0xcce5ff, intensity: 1, direction: [-0.9, 0.5, -1] as [number, number, number], distance: 3 },
  /** Soft ground shadow: cast from almost straight above (tuned against the shipped frame).
   *  Baked once in world space: `samples` shadow maps with the light moved by `spread` are averaged
   *  into a `resolution` x `resolution` texture on the ground. */
  groundShadow: { direction: [0.01, 1, 0.01] as [number, number, number], distance: 3, spread: 0.5, opacity: 0.45, samples: 64, resolution: 1024 },
  /** Diamond environment intensity. The stored material value is 1.6, but fitting the stones'
   *  average brightness against the shipped frame gives about 1.4. */
  stones: { envIntensity: 1.4 },
  /** Screen-space reflections on the metal. rayLength is the scene bounding radius;
   *  the march distance is computed from the camera. tolerance 0.5 is the shipped hit thickness. */
  ssr: { intensity: 1, power: 1, tolerance: 0.5, maskFront: -0.2, rayLength: 5.85 },
  /** Ambient occlusion (shipped values: the app lowers the intensity to 0.1). */
  ssao: { radius: 1, intensity: 0.1, bias: 0.001, epsilon: 0.001, falloff: 1.6, edgeSharpness: 0.1 },
  /** Page background (linear 1 = white), shown where the ring is not drawn. */
  background: [1, 1, 1] as [number, number, number],
};
