// Every fixed URL or file path the viewer uses. Nothing else writes a path as a string.
// Paths are served from public/, so they start at the site root.
export const PATHS = {
  ring: "/assets/Ring_v1.glb",
  scenePreset: "/assets/scene/designer-scene.vjson",
  gemEnvironment: "/assets/scene/gem-000.hdr",
  lightmap: "/assets/scene/lightmap-r-2b.hdr",
  vendorBundle: "/shaders/bundle-0.8.0.mjs",
} as const;
