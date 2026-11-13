// The render passes of one frame, in the order the engine runs them, with a plain
// description of what each reads and writes. The order and the enabled flags are read
// live from the engine; the descriptions are ours (the bundle is minified).
import { getViewer, plugin, pass, redraw } from "./engineAccess";

export interface PassInfo {
  title: string;
  /** What this pass does in one or two sentences. */
  does: string;
  reads: string;
  writes: string;
  /** Buffer id (see buffers.ts) that shows this pass's result, if it has one. */
  buffer?: string;
  /** Name of the engine plugin that owns this pass, used to switch it on and off. */
  plugin?: string;
  /** Never switched off from the UI: other passes or the final image depend on it. */
  locked?: boolean;
}

// Keyed by the engine's pass id.
export const PASS_INFO: Record<string, PassInfo> = {
  gbuffer: {
    title: "G-buffer",
    does: "Draws every mesh once into two 8-bit targets: packed linear depth + normal, and flag bits (for example 'take part in tone mapping'). SSAO, SSR, bloom and the tone-map mask all read it. Its depth buffer is reused by the colour pass.",
    reads: "scene geometry",
    writes: "gbufferDepthNormal, gbufferFlags, depth",
    buffer: "gbuffer-depth",
    locked: true,
  },
  ssrtgi: {
    title: "SSGI",
    does: "Screen-space global illumination: one-bounce indirect light from what is already on screen.",
    reads: "G-buffer, previous frame",
    writes: "GI map",
    plugin: "SSGI",
  },
  ssr: {
    title: "Screen-space reflections",
    does: "The reflections themselves are computed inside the gold shader (inline SSR): one stochastic ray per pixel against the G-buffer depth, reading colour from the previous accumulated frame.",
    reads: "G-buffer, previous accumulated frame",
    writes: "(inline in the material)",
    plugin: "SSReflection",
  },
  ssao: {
    title: "Ambient occlusion (SAO)",
    does: "Samples the depth buffer around each pixel in a spiral (11 taps) to darken creases, then blurs the result with a depth-aware filter. Materials multiply it into their indirect light.",
    reads: "G-buffer",
    writes: "AO map",
    buffer: "ao",
    plugin: "SSAO",
  },
  velocityBuffer: {
    title: "Velocity buffer",
    does: "Per-pixel motion vectors from the previous and current camera/object matrices. Only needed for temporal anti-aliasing.",
    reads: "scene geometry, previous matrices",
    writes: "velocity target",
    plugin: "VelocityBuffer",
  },
  normalBuffer: {
    title: "Normal buffer",
    does: "Extra view-space normal target for effects that need exact normals.",
    reads: "scene geometry",
    writes: "normal target",
    plugin: "NormalBufferPlugin",
  },
  ssBevel: {
    title: "Screen-space bevel",
    does: "Detects hard edges in the G-buffer and softens their normals so edges catch light like a small bevel.",
    reads: "G-buffer",
    writes: "bevel normal map",
    buffer: "bevel",
    plugin: "SSBevelPlugin",
  },
  render: {
    title: "Colour pass",
    does: "The main draw. Opaque meshes are shaded with image-based light (the HDR environment), the directional light and its shadow, SSR and AO (gold) or the refraction loop (diamonds). Output is HDR packed as RGBM (range 16) into an 8-bit target. Transparent and transmissive objects are drawn afterwards and blended in.",
    reads: "scene, environment HDR, lights, shadow maps, AO map, G-buffer depth, previous frame",
    writes: "composer target (RGBM)",
    buffer: "composer",
    locked: true,
  },
  frameFade: {
    title: "Frame fade",
    does: "Cross-fades from the previous image when the scene, a material or the camera changes, so edits do not pop.",
    reads: "composer target, previous image",
    writes: "composer target",
    plugin: "FrameFade",
  },
  depthOfField: {
    title: "Depth of field",
    does: "Blurs by distance from the focus range using a circle-of-confusion map and a separable blur.",
    reads: "composer target, G-buffer depth",
    writes: "composer target",
    plugin: "DepthOfField",
  },
  taa: {
    title: "Temporal anti-aliasing",
    does: "Blends the current frame with reprojected history. Present in the pipeline, but inactive in the shipped scene (accumulation does the anti-aliasing).",
    reads: "composer target, velocity",
    writes: "composer target",
    plugin: "TAA",
  },
  progressive: {
    title: "Progressive accumulation",
    does: "Each frame the camera is shifted by a sub-pixel amount; the result is averaged into a history buffer with weight 1/(n+1) for 32 frames. This is the anti-aliasing, and it also cleans up the noisy SSR, SSAO, shadows and diamond edges. The history is also what SSR reads next frame.",
    reads: "composer target, history",
    writes: "history (accumulated HDR)",
    buffer: "history",
    plugin: "Progressive",
  },
  bloom: {
    title: "Bloom",
    does: "Keeps only the brightest HDR pixels (soft threshold), blurs them through a down/up-sample pyramid and adds the glow back.",
    reads: "accumulated HDR",
    writes: "composer target",
    plugin: "Bloom",
  },
  combinedPost: {
    title: "Final composite",
    does: "One full-screen shader that decodes RGBM, then applies the post effects in order: tone mapping (ACES), contrast, saturation, optional chromatic aberration / vignette / grain / LUT, then sRGB encoding. The white background is excluded from tone mapping by a G-buffer mask. Writes to the screen.",
    reads: "composer target, G-buffer flags + depth",
    writes: "canvas",
    locked: true,
  },
};

/** The order the engine runs the passes in the shipped scene (used for passes that are currently off). */
const DEFAULT_ORDER = [
  "gbuffer", "ssrtgi", "ssr", "ssao", "velocityBuffer", "normalBuffer", "ssBevel", "render",
  "frameFade", "depthOfField", "taa", "progressive", "bloom", "combinedPost",
];

export interface PassState {
  id: string;
  info: PassInfo;
  enabled: boolean;
  /** Position in the live pipeline, or -1 when the pass is off. */
  order: number;
}

export function listPasses(): PassState[] {
  const viewer = getViewer();
  const live: string[] = viewer.renderer.pipeline ?? [];
  const known = new Set([...DEFAULT_ORDER, ...live]);
  const ids = [...DEFAULT_ORDER, ...[...known].filter((id) => !DEFAULT_ORDER.includes(id))].filter((id) => id !== "screen");
  return ids.map((id) => {
    const info = PASS_INFO[id] ?? { title: id, does: "", reads: "", writes: "" };
    return { id, info, enabled: isPassEnabled(id), order: live.indexOf(id) };
  });
}

export function isPassEnabled(id: string): boolean {
  const info = PASS_INFO[id];
  const owner = info?.plugin ? plugin(info.plugin) : undefined;
  if (owner && "enabled" in owner) return !!owner.enabled;
  return !!pass(id)?.passObject?.enabled;
}

export function setPassEnabled(id: string, enabled: boolean) {
  const info = PASS_INFO[id];
  if (info?.locked) return;
  const owner = info?.plugin ? plugin(info.plugin) : undefined;
  if (owner && "enabled" in owner) owner.enabled = enabled;
  const p = pass(id);
  if (p?.passObject) p.passObject.enabled = enabled;
  // The engine orders passes from their flags, so rebuild the list after a change.
  try {
    getViewer().renderer.refreshPipeline();
  } catch (error) {
    console.warn("refreshPipeline failed", error);
  }
  redraw();
}
