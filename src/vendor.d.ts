// The engine bundle is minified and ships no types. These declare only the members
// the viewer uses; the engine's internal objects are typed as `any` (Viewer).
import type { Box3, Vector3 } from "three";

export type Viewer = any;

export interface VendorEngine {
  ViewerApp: new (options: { canvas: HTMLCanvasElement; useRgbm: boolean }) => Viewer;
  AssetManagerPlugin: unknown;
  FrameFadePlugin: unknown;
  SimpleTextPlugin: unknown;
  addBasePlugins: (viewer: Viewer) => Promise<void>;
  Box3: typeof Box3;
  Vector3: typeof Vector3;
}
