// The viewer's shader pipeline, one entry per stage of the graphics pipeline.
// Each program's GLSL is a file in this folder, copied from public/shaders/bundle-0.8.0.mjs.
// The diamond and normal-capture programs run from here (src/render/diamond.ts). The bundle
// is no longer loaded, so the other programs are reference copies; see shader-diamond.md.

import diamondVert from "./diamond/diamond.vert.glsl?raw";
import diamondFrag from "./diamond/diamond.frag.glsl?raw";
import normalCaptureVert from "./diamond/normal-capture.vert.glsl?raw";
import normalCaptureFrag from "./diamond/normal-capture.frag.glsl?raw";

import pmremCubeVert from "./vertex/pmrem-cube.vert.glsl?raw";
import fullscreenVert from "./vertex/fullscreen.vert.glsl?raw";
import lineSegmentsVert from "./vertex/line-segments.vert.glsl?raw";
import gbufferVert from "./vertex/gbuffer.vert.glsl?raw";
import depthPackVert from "./vertex/depth-pack.vert.glsl?raw";
import velocityVert from "./vertex/velocity.vert.glsl?raw";

import pmremBlurFrag from "./fragment/pmrem-blur.frag.glsl?raw";
import pmremEquirectFrag from "./fragment/pmrem-equirect.frag.glsl?raw";
import pmremCubeFrag from "./fragment/pmrem-cube.frag.glsl?raw";
import fullscreenCopyFrag from "./fragment/fullscreen-copy.frag.glsl?raw";
import gbufferFrag from "./fragment/gbuffer.frag.glsl?raw";
import depthPackFrag from "./fragment/depth-pack.frag.glsl?raw";
import velocityFrag from "./fragment/velocity.frag.glsl?raw";
import postEffectFrag from "./fragment/post-effect.frag.glsl?raw";
import postEffectPremultipliedFrag from "./fragment/post-effect-premultiplied.frag.glsl?raw";
import transparencyCompositeFrag from "./fragment/transparency-composite.frag.glsl?raw";
import saoFrag from "./fragment/sao.frag.glsl?raw";
import ssgiFrag from "./fragment/ssgi.frag.glsl?raw";
import aoTemporalFrag from "./fragment/ao-temporal.frag.glsl?raw";
import normalDepthFrag from "./fragment/normal-depth.frag.glsl?raw";
import bevelNormalSmoothFrag from "./fragment/bevel-normal-smooth.frag.glsl?raw";
import cocBlurFrag from "./fragment/coc-blur.frag.glsl?raw";
import depthBlurFrag from "./fragment/depth-blur.frag.glsl?raw";
import maskBlurFrag from "./fragment/mask-blur.frag.glsl?raw";
import gaussianBlurHFrag from "./fragment/gaussian-blur-horizontal.frag.glsl?raw";
import gaussianBlurVFrag from "./fragment/gaussian-blur-vertical.frag.glsl?raw";
import lineSegmentsFrag from "./fragment/line-segments.frag.glsl?raw";

export interface ShaderProgram {
  // File name without the extension, unique within the pipeline.
  id: string;
  // Path under src/shaders/.
  file: string;
  source: string;
  // The pass or material that runs this program.
  usedBy: string;
}

const program = (file: string, source: string, usedBy: string): ShaderProgram => ({
  id: file.replace(/^.*\//, "").replace(/\.glsl$/, ""),
  file,
  source,
  usedBy,
});

// Diamond passes, in the order the frame runs them.
// 1. normal-capture writes each stone's facet normals and distance into a cube map (tCubeMapNormals).
// 2. diamond reads that cube map to trace the stone and output the colour.
export const DIAMOND_PASSES = {
  normalCapture: {
    vertex: program("diamond/normal-capture.vert.glsl", normalCaptureVert, "Diamond normal capture pass"),
    fragment: program("diamond/normal-capture.frag.glsl", normalCaptureFrag, "Diamond normal capture pass"),
    writes: "tCubeMapNormals (rgb = facet normal, a = distance / radius)",
  },
  diamond: {
    vertex: program("diamond/diamond.vert.glsl", diamondVert, "Diamond material (DiamondPlugin)"),
    fragment: program("diamond/diamond.frag.glsl", diamondFrag, "Diamond material (DiamondPlugin)"),
    reads: ["tCubeMapNormals", "envMap", "transmissionSamplerMap"],
  },
} as const;

export const PIPELINE = {
  // Stage 1. Not a shader. The vertex and index buffers come from the GLB, and these attributes reach the vertex shaders.
  inputAssembler: {
    attributes: [
      "position",
      "normal",
      "uv",
      "faceIndex",
      "instanceStart",
      "instanceEnd",
      "instanceColorStart",
      "instanceColorEnd",
    ],
  },

  // Stage 2.
  vertex: [
    program("diamond/diamond.vert.glsl", diamondVert, "Diamond material"),
    program("diamond/normal-capture.vert.glsl", normalCaptureVert, "Diamond normal capture"),
    program("vertex/gbuffer.vert.glsl", gbufferVert, "Scene G-buffer (normal, depth, flags)"),
    program("vertex/velocity.vert.glsl", velocityVert, "Per-pixel velocity"),
    program("vertex/line-segments.vert.glsl", lineSegmentsVert, "Line2 / LineSegments2"),
    program("vertex/depth-pack.vert.glsl", depthPackVert, "16-bit depth packing"),
    program("vertex/pmrem-cube.vert.glsl", pmremCubeVert, "PMREM environment prefilter"),
    program("vertex/fullscreen.vert.glsl", fullscreenVert, "Every fullscreen post pass"),
  ],

  // Stage 3. WebGL2 has no tessellation stage, and the bundle has no tessellation shaders.
  tessellation: null,

  // Stage 4. WebGL2 has no geometry stage, and the bundle has no geometry shaders.
  geometry: null,

  // Stage 5. Fixed function, so there are no shaders. Some fragment programs read gl_FragCoord.
  rasterization: {
    note: "Fixed function. ssgi and bevel-normal-smooth read gl_FragCoord.",
  },

  // Stage 6.
  fragment: [
    program("diamond/diamond.frag.glsl", diamondFrag, "Diamond material"),
    program("diamond/normal-capture.frag.glsl", normalCaptureFrag, "Diamond normal capture"),
    program("fragment/gbuffer.frag.glsl", gbufferFrag, "Scene G-buffer (MRT)"),
    program("fragment/velocity.frag.glsl", velocityFrag, "Per-pixel velocity"),
    program("fragment/line-segments.frag.glsl", lineSegmentsFrag, "Line2 / LineSegments2"),
    program("fragment/depth-pack.frag.glsl", depthPackFrag, "16-bit depth packing"),
    program("fragment/pmrem-blur.frag.glsl", pmremBlurFrag, "PMREM environment prefilter"),
    program("fragment/pmrem-equirect.frag.glsl", pmremEquirectFrag, "PMREM from equirect"),
    program("fragment/pmrem-cube.frag.glsl", pmremCubeFrag, "PMREM from cube"),
    program("fragment/sao.frag.glsl", saoFrag, "SAO ambient occlusion"),
    program("fragment/ssgi.frag.glsl", ssgiFrag, "SSGI global illumination"),
    program("fragment/ao-temporal.frag.glsl", aoTemporalFrag, "Temporal AO / SSGI filter"),
    program("fragment/normal-depth.frag.glsl", normalDepthFrag, "AO normal and depth reader"),
    program("fragment/bevel-normal-smooth.frag.glsl", bevelNormalSmoothFrag, "Bevel-aware normal smoothing"),
    program("fragment/coc-blur.frag.glsl", cocBlurFrag, "Depth of field (circle of confusion blur)"),
    program("fragment/depth-blur.frag.glsl", depthBlurFrag, "Packed-depth blur"),
    program("fragment/mask-blur.frag.glsl", maskBlurFrag, "Mask-aware blur"),
    program("fragment/gaussian-blur-horizontal.frag.glsl", gaussianBlurHFrag, "Gaussian blur, horizontal"),
    program("fragment/gaussian-blur-vertical.frag.glsl", gaussianBlurVFrag, "Gaussian blur, vertical"),
    program("fragment/fullscreen-copy.frag.glsl", fullscreenCopyFrag, "Copy and opacity"),
    program("fragment/post-effect.frag.glsl", postEffectFrag, "Post-effect base template"),
    program("fragment/post-effect-premultiplied.frag.glsl", postEffectPremultipliedFrag, "Post-effect base template, premultiplied"),
    program("fragment/transparency-composite.frag.glsl", transparencyCompositeFrag, "Transparent layer composite"),
  ],

  // Stage 7. Blend state is set by the engine's JS, not in GLSL. The diamond fragment writes alpha 1.
  colorBlending: {
    note: "Blend state is set in JS. The diamond program writes alpha 1 (opaque).",
  },
} as const;
