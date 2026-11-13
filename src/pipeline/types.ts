// The vocabulary the Pipeline Studio uses. A Control is one adjustable value, wherever
// it lives in the engine. The UI renders Controls without knowing anything about the engine.

export type ControlValue = boolean | number | string | number[];

interface ControlBase {
  /** Stable id, e.g. "bloom.intensity". Used for presets and the exported manifest. */
  id: string;
  label: string;
}

export interface ToggleControl extends ControlBase {
  kind: "toggle";
  get(): boolean;
  set(value: boolean): void;
}

export interface SliderControl extends ControlBase {
  kind: "slider";
  min: number;
  max: number;
  step: number;
  get(): number;
  set(value: number): void;
}

export interface NumberControl extends ControlBase {
  kind: "number";
  step: number;
  get(): number;
  set(value: number): void;
}

export interface SelectControl extends ControlBase {
  kind: "select";
  options: { label: string; value: string | number }[];
  get(): string | number;
  set(value: string | number): void;
}

export interface ColorControl extends ControlBase {
  kind: "color";
  /** "#rrggbb" in display (sRGB) space. */
  get(): string;
  set(value: string): void;
}

export interface VectorControl extends ControlBase {
  kind: "vector";
  size: 2 | 3 | 4;
  step: number;
  get(): number[];
  set(value: number[]): void;
}

export type Control =
  | ToggleControl
  | SliderControl
  | NumberControl
  | SelectControl
  | ColorControl
  | VectorControl;

/** A named bundle of controls: one effect, one plugin, one part of the scene. */
export interface ControlGroup {
  id: string;
  title: string;
  /** Where this sits in the frame, used to sort groups into sections. */
  section: GroupSection;
  /** One or two sentences: what it does in the frame. */
  description: string;
  controls(): Control[];
}

export type GroupSection = "Scene & light" | "Materials" | "Screen-space" | "Post-processing" | "Ground & shadows" | "Other plugins";
