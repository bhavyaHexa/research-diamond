import type { WebGLRenderer } from "three";

// Render quality (pixel ratio multiplier): higher is sharper but slower.
export const QUALITY = 1.5;

export function applyQuality(renderer: WebGLRenderer) {
  renderer.setPixelRatio(window.devicePixelRatio * QUALITY);
}
