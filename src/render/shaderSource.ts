// The GLSL in src/shaders/pipeline.ts was written for the engine. Three.js 0.187 uses
// different chunk names, so these changes map it onto three.js. The program text is not
// changed otherwise.

const CHUNK_ALIASES: Record<string, string> = {
  // Three.js renamed encodings_fragment to colorspace_fragment. Both call linearToOutputTexel.
  "#include <encodings_fragment>": "#include <colorspace_fragment>",
};

// The engine supplies this helper. Stones only read it for transmission, which is 0 here.
const TRANSMISSION_HELPER = "vec4 transmissionSamplerMapTexelToLinear(vec4 texel){return texel;}\n";

// `#glMarker` lines are hooks for the engine's plugins. Three.js has no such hook, so the
// marker becomes a comment, as the engine does before it compiles.
export function toThreeSource(source: string, stage: "vertex" | "fragment"): string {
  let out = source.replaceAll("#glMarker", "//");
  for (const [from, to] of Object.entries(CHUNK_ALIASES)) out = out.replaceAll(from, to);
  return stage === "fragment" ? TRANSMISSION_HELPER + out : out;
}
