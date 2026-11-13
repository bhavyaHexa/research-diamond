// Turns the engine's own parameter descriptions (`plugin.uiConfig`) into Controls.
//
// Every engine plugin describes its settings as a tree of items such as
//   { type: "slider", label: "Intensity", property: [target, "intensity"], bounds: [0, 3] }
// Reading that tree gives us the exact property names, ranges and steps the engine
// authors intended, so every effect is available without hand-wiring each number.
import type { Viewer } from "../vendor";
import { redraw } from "./engineAccess";
import type { Control } from "./types";

interface UiItem {
  type?: string;
  label?: string;
  property?: [Viewer, string];
  getValue?: () => unknown;
  setValue?: (value: unknown) => void;
  bounds?: [number, number];
  stepSize?: number;
  children?: UiItem[];
  onChange?: (value: unknown) => void;
  hidden?: () => boolean;
  disabled?: boolean | (() => boolean);
}

export interface FromUiConfigOptions {
  /** Property keys to leave out. */
  skip?: string[];
  /** Replace an engine label with a clearer one, by property key. */
  labels?: Record<string, string>;
}

/** Flatten folders; the Studio groups by plugin, not by the engine's folder layout. */
function leaves(config: UiItem | undefined, out: UiItem[] = []): UiItem[] {
  for (const child of config?.children ?? []) {
    if (!child) continue;
    if (child.type === "folder") leaves(child, out);
    else out.push(child);
  }
  return out;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === "number");
}

function readVector(value: unknown): number[] | null {
  if (isNumberArray(value)) return value;
  const v = value as { x?: number; y?: number; z?: number; w?: number } | null;
  if (v && typeof v === "object" && typeof v.x === "number" && typeof v.y === "number") {
    const out = [v.x, v.y];
    if (typeof v.z === "number") out.push(v.z);
    if (typeof v.w === "number") out.push(v.w);
    return out;
  }
  return null;
}

function niceStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return 0.01;
  const raw = span / 200;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.max(pow, 1e-5);
}

/**
 * Build Controls for one plugin's uiConfig.
 * @param idPrefix  stable id prefix, e.g. "bloom"
 */
export function controlsFromUiConfig(
  config: UiItem | undefined,
  idPrefix: string,
  options: FromUiConfigOptions = {},
): Control[] {
  const controls: Control[] = [];
  const used = new Map<string, number>();

  for (const item of leaves(config)) {
    const target = item.property?.[0];
    const key = item.property?.[1];
    // Engine items bind either to [object, key] or to a getValue/setValue pair.
    const read = (): unknown => (target && key ? target[key] : item.getValue?.());
    const write = (value: unknown) => {
      if (target && key) target[key] = value;
      else item.setValue?.(value);
      // Some engine items carry an `onChange` that is not a function; only call real ones.
      if (typeof item.onChange === "function") item.onChange(value);
      redraw();
    };
    if (!(target && key) && !(item.getValue && item.setValue)) continue;
    if (key && options.skip?.includes(key)) continue;

    const baseName = key ?? item.label ?? "value";
    const count = used.get(baseName) ?? 0;
    used.set(baseName, count + 1);
    const id = `${idPrefix}.${baseName}${count ? `_${count}` : ""}`;
    const label = (key && options.labels?.[key]) || item.label || key || "Value";

    let current: unknown;
    try {
      current = read();
    } catch {
      continue;
    }

    switch (item.type) {
      case "checkbox":
        controls.push({ kind: "toggle", id, label, get: () => !!read(), set: (v) => write(v) });
        break;

      case "slider": {
        const [min, max] = item.bounds ?? [0, 1];
        controls.push({
          kind: "slider",
          id,
          label,
          min,
          max,
          step: item.stepSize ?? niceStep(min, max),
          get: () => Number(read()),
          set: (v) => write(v),
        });
        break;
      }

      case "input": {
        const vec = readVector(current);
        if (typeof current === "number") {
          controls.push({ kind: "number", id, label, step: item.stepSize ?? 1, get: () => Number(read()), set: (v) => write(v) });
        } else if (vec && vec.length >= 2 && vec.length <= 4) {
          controls.push({
            kind: "vector",
            id,
            label,
            size: vec.length as 2 | 3 | 4,
            step: item.stepSize ?? 0.01,
            get: () => readVector(read()) ?? vec,
            set: (v) => write(v),
          });
        }
        break;
      }

      case "dropdown": {
        const options = (item.children ?? [])
          .map((c) => ({ label: String(c.label ?? (c as { value?: unknown }).value), value: ((c as { value?: unknown }).value ?? c.label) as string | number }))
          .filter((o) => o.value !== undefined);
        if (options.length) controls.push({ kind: "select", id, label, options, get: () => read() as string | number, set: (v) => write(v) });
        break;
      }

      case "color": {
        const toHex = (value: unknown): string => {
          const c = value as { getHexString?: () => string } | string | number | null;
          if (c && typeof c === "object" && c.getHexString) return "#" + c.getHexString();
          if (typeof c === "string") return c;
          if (typeof c === "number") return "#" + c.toString(16).padStart(6, "0");
          return "#000000";
        };
        controls.push({
          kind: "color",
          id,
          label,
          get: () => toHex(read()),
          set: (hex) => {
            const existing = read() as { clone?: () => { set: (v: string) => void } } | null;
            if (existing?.clone) {
              const next = existing.clone();
              next.set(hex);
              write(next);
            } else write(hex);
          },
        });
        break;
      }

      case "vec2":
      case "vec3":
      case "vec4":
      case "vec": {
        const vec = readVector(current);
        if (!vec) break;
        controls.push({
          kind: "vector",
          id,
          label,
          size: vec.length as 2 | 3 | 4,
          step: item.stepSize ?? 0.01,
          get: () => readVector(read()) ?? vec,
          set: (v) => {
            const existing = read() as { set?: (...n: number[]) => void; clone?: () => { set: (...n: number[]) => void } } | null;
            if (existing?.clone) {
              const next = existing.clone();
              next.set(...v);
              write(next);
            } else write(v);
          },
        });
        break;
      }

      default:
        break; // image, button, folder: not adjustable as a number
    }
  }
  return controls;
}
