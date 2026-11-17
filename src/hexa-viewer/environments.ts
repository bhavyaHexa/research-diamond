// Procedural environments. The page behind the model stays white; this is what the glass REFLECTS and what rays
// bent far off the view direction see (glass.chunk.glsl).
//
// Clear glass on a white product shot looks the way it does because of what it mirrors: a big bright tent behind and
// around it, a softly lit floor, soft strips for the highlights along its edges, and the dimmer room behind the camera,
// which is what the front surfaces reflect and what makes the glass a little darker than the backdrop.
import { DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, RGBAFormat } from "three";

/** Pass this to `viewer.setEnvironment` to get the glass studio. */
export const GLASS_STUDIO = "procedural:glass-studio";

export interface StudioLook {
  /** Radiance of the room behind the camera (what front surfaces mirror). The white backdrop is about 3. */
  room: number;
  /** Radiance of the bright tent behind the model, and its width (radians each side of straight behind). */
  tent: number;
  tentWidth: number;
  /** Overhead softbox and the floor. */
  top: number;
  /** Elevation (radians) where the overhead light starts; lower means a wider bright ceiling. */
  topStart: number;
  floor: number;
  /** Darker bands at the sides (flags): how dark (1 = no band) and how soft their edges are (radians). */
  side: number;
  sideSoft: number;
  /** The two strips that make highlights along the edges: radiance and softness (radians). */
  strip: number;
  stripSoft: number;
  /** Share of the floor's brightness kept on the camera's side (1 = an even floor); a darker near floor draws dark rings where bent rays look down. */
  floorFront: number;
  /** Darkening of the horizon line (0 = none, 1 = black): the dark line where floor and backdrop meet. */
  horizon: number;
}

export const DEFAULT_STUDIO: StudioLook = { room: 0.15, tent: 1.2, tentWidth: 1.5, top: 1.6, topStart: 0.6, floor: 0.96, side: 0.15, sideSoft: 0.5, strip: 6, stripSoft: 0.14, floorFront: 0.3, horizon: 0.7 };

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
/** Signed shortest angle difference. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 1 inside the angular rectangle (azimuth around `azimuth`, elevation between `low` and `high`), soft at the edges. */
function box(a: number, e: number, azimuth: number, halfWidth: number, low: number, high: number, edge: number) {
  return (1 - smooth(halfWidth - edge, halfWidth + edge, Math.abs(wrap(a - azimuth)))) * smooth(low - edge, low + edge, e) * (1 - smooth(high - edge, high + edge, e));
}

/** Radiance (linear) looking along azimuth `a` and elevation `e`, both in radians. */
function studio(a: number, e: number, look: StudioLook): number {
  let radiance = look.room;
  radiance = Math.max(radiance, look.tent * box(a, e, Math.PI, look.tentWidth, -0.3, 1.1, 0.35));      // bright tent behind
  const front = 1 - smooth(0.8, 1.8, Math.abs(wrap(a)));                                                  // camera side
  radiance = Math.max(radiance, look.floor * (1 - (1 - look.floorFront) * front) * smooth(-0.02, -0.3, e));   // lit floor
  radiance = Math.max(radiance, look.top * smooth(look.topStart, look.topStart + 0.3, e));                                         // overhead softbox
  // Soft darker bands at the sides: they give the glass its grey edges.
  const band = Math.max(box(a, e, Math.PI / 2, 0.45, -0.5, 1.0, look.sideSoft), box(a, e, -Math.PI / 2, 0.45, -0.5, 1.0, look.sideSoft));
  radiance *= 1 - (1 - look.side) * band;
  radiance *= 1 - look.horizon * Math.exp(-((e / 0.07) ** 2));
  radiance = Math.max(radiance, look.strip * box(a, e, -0.6, 0.1, -0.2, 0.9, look.stripSoft));          // key strip
  radiance = Math.max(radiance, look.strip * 0.5 * box(a, e, 0.8, 0.14, -0.1, 0.8, look.stripSoft));    // fill strip
  return radiance;
}

/** Half-float equirectangular map of the glass studio. */
export function createGlassStudio(look: StudioLook = DEFAULT_STUDIO, width = 1024, height = 512): DataTexture {
  const data = new Uint16Array(width * height * 4);
  const one = DataUtils.toHalfFloat(1);
  for (let j = 0; j < height; j++) {
    const e = ((j + 0.5) / height - 0.5) * Math.PI;                      // row 0 looks straight down
    for (let i = 0; i < width; i++) {
      const a = ((i + 0.5) / width - 0.5) * 2 * Math.PI;
      const v = DataUtils.toHalfFloat(studio(a, e, look));
      const k = (j * width + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = v;
      data[k + 3] = one;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
