// Debug views: look at what the intermediate render targets of a frame actually contain.
//
// The engine already has a DebugPlugin that draws any texture into a rectangle of the
// canvas after the frame. Most targets are packed (depth+normal in 8-bit channels) or
// HDR stored as RGBM, so each view carries a small fragment shader that decodes it for display.
import type { Viewer } from "../vendor";
import { getContext, getViewer, redraw } from "./engineAccess";

export type ViewMode = "full" | "pip";

export interface BufferView {
  id: string;
  title: string;
  /** What you are looking at and how to read it. */
  description: string;
  texture(viewer: Viewer): Viewer | null | undefined;
  /** GLSL fragment shader that turns the stored values into a picture. */
  fragment: string;
}

// Every shader below reads `tDiffuse` and writes display-ready colour straight to the canvas.
const HEADER = "varying vec2 vUv;\nuniform sampler2D tDiffuse;\nuniform float opacity;\n";

const toDisplay = "c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));";

/** HDR stored as RGBM (range 16): decode, compress with Reinhard so highlights stay visible, gamma. */
const RGBM = `${HEADER}void main(){
  vec4 t = texture2D(tDiffuse, vUv);
  vec3 c = t.rgb * t.a * 16.0;
  c = c / (1.0 + c);
  ${toDisplay}
  gl_FragColor = vec4(c, 1.0);
}`;

/** Plain linear HDR (half-float environment maps). */
const HDR_LINEAR = `${HEADER}void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  c = c / (1.0 + c);
  ${toDisplay}
  gl_FragColor = vec4(c, 1.0);
}`;

/** G-buffer target 0: xy = linear depth packed in 16 bits (as sqrt), zw = packed normal. */
const GBUFFER_DEPTH = `${HEADER}void main(){
  vec4 t = texture2D(tDiffuse, vUv);
  float d = t.x + t.y / 255.0;
  d = d * d;
  gl_FragColor = vec4(vec3(1.0 - d), 1.0);
}`;

const GBUFFER_NORMAL = `${HEADER}void main(){
  vec4 t = texture2D(tDiffuse, vUv);
  float depth = t.x + t.y / 255.0;
  if (depth * depth > 0.9999) { gl_FragColor = vec4(vec3(0.5), 1.0); return; } // nothing drawn here
  vec2 enc = t.zw * 4.0 - 2.0;
  float f = dot(enc, enc);
  float g = sqrt(max(1.0 - f / 4.0, 0.0));
  vec3 n = vec3(enc * g, 1.0 - f / 2.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;

const RGB_AS_IS = `${HEADER}void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`;

const RED_AS_GREY = `${HEADER}void main(){ gl_FragColor = vec4(vec3(texture2D(tDiffuse, vUv).r), 1.0); }`;

/** Shadow maps store depth packed into RGBA8. */
const SHADOW_DEPTH = `#include <packing>\n${HEADER}void main(){
  float d = unpackRGBAToDepth(texture2D(tDiffuse, vUv));
  gl_FragColor = vec4(vec3(d), 1.0);
}`;

const firstDirectionalShadow = (viewer: Viewer): Viewer | null => {
  let found: Viewer | null = null;
  viewer.scene.modelObject.traverse((o: Viewer) => {
    if (!found && o.isDirectionalLight && o.shadow?.map) found = o.shadow.map.texture;
  });
  return found;
};

export const BUFFER_VIEWS: BufferView[] = [
  {
    id: "gbuffer-depth",
    title: "G-buffer: depth",
    description: "Linear depth, near = white. Read by SSAO, SSR, bloom (to skip the background) and the tone-map mask.",
    texture: (v) => v.getPlugin("GBuffer")?.getDepthNormal(),
    fragment: GBUFFER_DEPTH,
  },
  {
    id: "gbuffer-normal",
    title: "G-buffer: normals",
    description: "View-space normals, packed into two 8-bit channels and unpacked here (x,y,z → r,g,b).",
    texture: (v) => v.getPlugin("GBuffer")?.getDepthNormal(),
    fragment: GBUFFER_NORMAL,
  },
  {
    id: "gbuffer-flags",
    title: "G-buffer: flags",
    description: "Per-pixel flag bits: material id, and whether the pixel takes part in tone mapping (the white background does not).",
    texture: (v) => v.getPlugin("GBuffer")?.getFlagsTexture(),
    fragment: RGB_AS_IS,
  },
  {
    id: "ao",
    title: "Ambient occlusion map",
    description: "White = open, dark = occluded. Gold multiplies its indirect light by this; shown at the shipped low intensity it is nearly white.",
    texture: (v) => v.getPlugin("SSAO")?._aoTarget?.texture,
    fragment: RED_AS_GREY,
  },
  {
    id: "bevel",
    title: "Screen-space bevel map",
    description: "Softened edge normals produced by the bevel pass.",
    texture: (v) => v.getPlugin("SSBevelPlugin")?.passes?.ssBevel?.passObject?._target?.texture,
    fragment: RGB_AS_IS,
  },
  {
    id: "composer",
    title: "Frame buffer (latest pass output, HDR)",
    description: "The colour-pass result before accumulation: noisy SSR/AO and un-averaged edges are visible here. RGBM decoded, then compressed for display.",
    texture: (v) => v.renderer.composer?.readBuffer?.texture,
    fragment: RGBM,
  },
  {
    id: "history",
    title: "Accumulated history (HDR)",
    description: "The running average of up to 32 jittered frames. Anti-aliased and de-noised; SSR reads this next frame. Before tone mapping and bloom.",
    texture: (v) => v.getPlugin("Progressive")?.lastFrame?.texture,
    fragment: RGBM,
  },
  {
    id: "env-scene",
    title: "Scene environment (source HDR)",
    description: "The equirect image that lights the gold (before PMREM blurring). Compressed for display; real values reach ~40.",
    texture: (v) => v.scene.environment,
    fragment: HDR_LINEAR,
  },
  {
    id: "env-gem",
    title: "Gem environment (source HDR)",
    description: "What the diamonds see. Mostly dim, with a few extremely bright spots (peak ~214): those become the flashes.",
    texture: (v) => v.getPlugin("Diamond")?.envMap,
    fragment: HDR_LINEAR,
  },
  {
    id: "shadow",
    title: "Light 1 shadow map",
    description: "Depth from the directional light, 1024². Dark = near the light.",
    texture: firstDirectionalShadow,
    fragment: SHADOW_DEPTH,
  },
];

export function listBuffers(): BufferView[] {
  const viewer = getViewer();
  return BUFFER_VIEWS.filter((b) => {
    try {
      return !!b.texture(viewer);
    } catch {
      return false;
    }
  });
}

const KEY = "pipeline-studio-view";

async function debugPlugin(): Promise<Viewer> {
  const { viewer, engine } = getContext();
  return (
    viewer.getPluginByType("debug") ?? (await viewer.addPlugin(engine.DebugPlugin as unknown as new () => Viewer))
  );
}

function rectFor(mode: ViewMode): [number, number, number, number] {
  const canvas = getViewer().canvas as HTMLCanvasElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (mode === "full") return [0, 0, w, h];
  const pw = Math.min(380, Math.round(w * 0.32));
  return [16, 16, pw, Math.round((pw * h) / w)];
}

/** Draw a buffer over the canvas, or clear the overlay with `null`. */
export async function showBuffer(id: string | null, mode: ViewMode = "pip") {
  const debug = await debugPlugin();
  debug.removeTexture(KEY);
  const def = id ? BUFFER_VIEWS.find((b) => b.id === id) : undefined;
  if (def) debug.addTexture(KEY, (v: Viewer) => def.texture(v), rectFor(mode), undefined, def.fragment, "postRender", false);
  redraw();
}
