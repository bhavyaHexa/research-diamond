import type { Viewer } from "../vendor";

// Render quality (displayCanvasScaling): higher is sharper but slower.
export const QUALITY = 1.5;

// Ground, tonemap, reflections and occlusion settings for the scene.
export function applySceneSettings(viewer: Viewer) {
  viewer.plugins.Ground.shadowBaker.groundMapMode = "map";
  viewer.plugins.Ground.groundReflection = false;
  viewer.plugins.Ground.material.transparent = true;
  viewer.plugins.Ground.material.roughness = 1;
  viewer.plugins.Tonemap.config.tonemapBackground = false;
  viewer.plugins.Ground.tonemapGround = false;
  viewer.getPlugin("SSReflection").passes.ssr.passObject.lowQualityFrames = 0;
  viewer.plugins.SSAO.passes.ssao.passObject.parameters.intensity = 0.1;
}

export function applyQuality(viewer: Viewer) {
  viewer.renderer.displayCanvasScaling = QUALITY;
}
