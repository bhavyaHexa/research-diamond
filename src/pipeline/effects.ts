// Every effect and plugin setting, grouped by what it does in the frame.
//
// Controls come from the engine's own parameter descriptions (see controls.ts), so the
// names, ranges and starting values are exactly the engine's. This file adds what the
// engine does not say: a title, the section the effect belongs to, and a plain
// description of its job in the image.
import type { Viewer } from "../vendor";
import { controlsFromUiConfig, type FromUiConfigOptions } from "./controls";
import { pass, plugin } from "./engineAccess";
import type { ControlGroup, GroupSection } from "./types";

interface EffectDef {
  id: string;
  title: string;
  section: GroupSection;
  description: string;
  /** Returns the engine's uiConfig for this effect (or undefined if the plugin is absent). */
  ui: () => Viewer | undefined;
  options?: FromUiConfigOptions;
}

const fromPlugin = (name: string) => () => plugin(name)?.uiConfig;
const fromPass = (id: string) => () => pass(id)?.passObject?.uiConfig;

const EFFECTS: EffectDef[] = [
  // --- Screen-space ---
  {
    id: "ssao",
    title: "Ambient occlusion (SSAO)",
    section: "Screen-space",
    description: "Darkens creases using the depth buffer. Materials multiply it into their indirect light; at the shipped intensity 0.1 the effect on gold is small.",
    ui: fromPlugin("SSAO"),
  },
  {
    id: "ssr",
    title: "Reflections (SSR)",
    section: "Screen-space",
    description: "Stochastic GGX ray per pixel against the depth buffer; the colour comes from the previous accumulated frame. Lets the gold reflect the ring's own stones and shank.",
    ui: fromPlugin("SSReflection"),
  },
  {
    id: "ssgi",
    title: "Global illumination (SSGI)",
    section: "Screen-space",
    description: "One-bounce indirect light from on-screen colour. Off in the shipped scene.",
    ui: fromPlugin("SSGI"),
  },
  {
    id: "ssbevel",
    title: "Screen-space bevel",
    section: "Screen-space",
    description: "Softens hard edges so they catch light like a small bevel.",
    ui: fromPlugin("SSBevelPlugin"),
  },
  {
    id: "contactShadows",
    title: "Contact shadows (SSCS)",
    section: "Screen-space",
    description: "Short screen-space shadow rays toward the light for fine contact detail. Off in the shipped scene.",
    ui: fromPlugin("SSContactShadows"),
  },
  {
    id: "dof",
    title: "Depth of field",
    section: "Screen-space",
    description: "Blur by distance from a focus range. Off in the shipped scene.",
    ui: fromPlugin("DepthOfField"),
  },

  // --- Frame accumulation / anti-aliasing ---
  {
    id: "progressive",
    title: "Progressive accumulation",
    section: "Post-processing",
    description: "Sub-pixel jitter averaged over N frames: this is the anti-aliasing and the noise filter for SSR, AO, shadows and diamond edges. Moving the camera restarts it.",
    ui: fromPlugin("Progressive"),
  },
  {
    id: "taa",
    title: "Temporal anti-aliasing",
    section: "Post-processing",
    description: "Reprojected history blend. Present in the pipeline but inactive in the shipped scene.",
    ui: fromPlugin("TAA"),
  },
  {
    id: "framefade",
    title: "Frame fade",
    section: "Post-processing",
    description: "Cross-fades from the previous image when something changes.",
    ui: fromPlugin("FrameFade"),
  },

  // --- Post-processing, in the order the final shader applies them ---
  {
    id: "bloom",
    title: "Bloom",
    section: "Post-processing",
    description: "Glow around HDR highlights. Only pixels brighter than the threshold bloom; at the shipped threshold 2.0 that is mostly diamond flashes.",
    ui: fromPass("bloom"),
  },
  {
    id: "tonemap",
    title: "Tone mapping & grading",
    section: "Post-processing",
    description: "Squeezes HDR into 0–1 (ACES), then contrast and saturation. The white page background is excluded unless 'Tonemap background' is on.",
    ui: fromPlugin("Tonemap"),
  },
  {
    id: "chromatic",
    title: "Chromatic aberration",
    section: "Post-processing",
    description: "Splits colour channels toward the screen edges. Off in the shipped scene.",
    ui: fromPlugin("ChromaticAberration"),
  },
  {
    id: "vignette",
    title: "Vignette",
    section: "Post-processing",
    description: "Darkens or tints the screen edges. Off in the shipped scene.",
    ui: fromPlugin("Vignette"),
  },
  {
    id: "grain",
    title: "Film grain",
    section: "Post-processing",
    description: "Adds noise to the final image. Off in the shipped scene.",
    ui: fromPlugin("FilmicGrain"),
  },
  {
    id: "lut",
    title: "Colour LUT",
    section: "Post-processing",
    description: "Colour grading through a lookup table. Off in the shipped scene.",
    ui: fromPlugin("LUTPlugin1"),
  },
  {
    id: "gamma",
    title: "Gamma correction",
    section: "Post-processing",
    description: "The final linear → sRGB encode.",
    ui: fromPlugin("GammaCorrection"),
  },

  // --- Ground & shadows ---
  {
    id: "ground",
    title: "Ground & baked shadow",
    section: "Ground & shadows",
    description: "The invisible ground that receives the ring's soft contact shadow, and the light direction used to bake that shadow. The shadow is baked by accumulating many jittered shadow renders.",
    ui: fromPlugin("Ground"),
  },
  {
    id: "hdriGround",
    title: "HDRi ground projection",
    section: "Ground & shadows",
    description: "Projects the environment onto a ground plane so the horizon sits on the floor. Off in the shipped scene.",
    ui: fromPlugin("HDRiGroundPlugin"),
  },
  {
    id: "mainLight",
    title: "Main directional light",
    section: "Scene & light",
    description:
      "The one direct light the camera sees: intensity, colour, direction (toward the light) and shadow. The engine jitters its direction a little every frame (spread) so the accumulated shadow becomes soft. On the near-mirror gold it only adds a small glint; raise roughness to see it spread.",
    ui: fromPlugin("RandomizedDirectionalLight"),
  },

  // --- Material extensions ---
  {
    id: "anisotropy",
    title: "Anisotropy",
    section: "Other plugins",
    description: "Stretched highlights (brushed metal) for materials that enable it.",
    ui: fromPlugin("AnisotropyPlugin"),
  },
  {
    id: "clearcoatTint",
    title: "Clearcoat tint",
    section: "Other plugins",
    description: "Tinted clearcoat layer for materials that enable it.",
    ui: fromPlugin("ClearcoatTintPlugin"),
  },
  {
    id: "thinFilm",
    title: "Thin-film layer",
    section: "Other plugins",
    description: "Iridescent thin-film term; the diamond material carries its (zero) parameters.",
    ui: fromPlugin("ThinFilmLayerPlugin"),
  },
  {
    id: "fragmentClipping",
    title: "Fragment clipping",
    section: "Other plugins",
    description: "Clips pixels with a shape (circle, plane, sphere…) for cut-away views.",
    ui: fromPlugin("FragmentClippingExtensionPlugin1"),
  },
  {
    id: "noiseBump",
    title: "Noise bump",
    section: "Other plugins",
    description: "Procedural bump from Voronoi noise.",
    ui: fromPlugin("NoiseBumpMaterialPlugin"),
  },
  {
    id: "customBump",
    title: "Custom bump map",
    section: "Other plugins",
    description: "Bump-map extension for materials that enable it.",
    ui: fromPlugin("CustomBumpMapPlugin"),
  },
  {
    id: "triplanar",
    title: "Triplanar UV mapping",
    section: "Other plugins",
    description: "Maps textures from three axes instead of UVs.",
    ui: fromPlugin("TriplanarUVMappingPlugin"),
  },
  {
    id: "animation",
    title: "glTF animation",
    section: "Other plugins",
    description: "Playback speed and scroll/drag-driven animation.",
    ui: fromPlugin("GLTFAnimation"),
  },
  {
    id: "cameraViews",
    title: "Camera views",
    section: "Other plugins",
    description: "Saved camera views and the animation between them.",
    ui: fromPlugin("CameraViews"),
  },
];

/** All effect groups. A group appears only if its plugin exists and has adjustable values. */
export function effectGroups(): ControlGroup[] {
  return EFFECTS.map((def) => ({
    id: def.id,
    title: def.title,
    section: def.section,
    description: def.description,
    controls: () => {
      try {
        return controlsFromUiConfig(def.ui(), def.id, def.options);
      } catch (error) {
        console.warn(`Controls for "${def.id}" could not be read`, error);
        return [];
      }
    },
  }));
}
