// Every fixed URL or file path the viewer uses. Nothing else writes a path as a string.
// Paths are served from public/, so they start at the site root.
export const PATHS = {
  ring: "/assets/Ring_v1.glb",
  bottle: "/assets/Glass_With_Room.glb",
  scenePreset: "/assets/scene/designer-scene.vjson",
  gemEnvironment: "/assets/scene/gem-000.hdr",
  lightmap: "/assets/scene/lightmap-r-2b.hdr",
} as const;

// HDR environments the Pipeline Studio can switch between. Files live in public/assets.
export const SCENE_ENVIRONMENTS = [
  { id: "lightmap", label: "Studio lightmap (shipped)", url: "/assets/scene/lightmap-r-2b.hdr" },
  { id: "metal001", label: "Metal environment 001", url: "/assets/envs/env_metal_001_d01c4504e0.hdr" },
] as const;

// Environments for the diamonds' refraction (read raw, no blur, so sharp bright spots matter).
export const GEM_ENVIRONMENTS = [
  { id: "gem000", label: "Gem sparkle map (shipped)", url: "/assets/scene/gem-000.hdr" },
  { id: "metal001", label: "Metal environment 001", url: "/assets/envs/env_metal_001_d01c4504e0.hdr" },
] as const;
