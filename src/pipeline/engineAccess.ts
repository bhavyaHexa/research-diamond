// The one place the Pipeline Studio holds on to the running engine. Everything else in
// src/pipeline reads the engine through these functions, so a missing engine is a
// single check instead of a crash in every control.
import type { VendorEngine, Viewer } from "../vendor";

interface EngineContext {
  viewer: Viewer;
  /** The engine module (classes such as DebugPlugin). */
  engine: VendorEngine & Record<string, unknown>;
  /** The asset manager plugin: imports HDRs and models. */
  manager: Viewer;
  /** The loaded ring (root object). */
  model: Viewer;
}

let context: EngineContext | null = null;

export function registerEngine(next: EngineContext) {
  context = next;
}

export function isEngineReady(): boolean {
  return context !== null;
}

export function getContext(): EngineContext {
  if (!context) throw new Error("The engine is not ready yet");
  return context;
}

export function getViewer(): Viewer {
  return getContext().viewer;
}

/** Ask the engine to draw again and restart accumulation. Call after changing any value. */
export function redraw() {
  context?.viewer.setDirty();
}

/** Plugins are looked up by name and may be absent; callers must handle undefined. */
export function plugin(name: string): Viewer | undefined {
  try {
    return context?.viewer.getPlugin(name);
  } catch {
    return undefined;
  }
}

/** A render pass by id ("bloom", "ssao"…), or undefined. */
export function pass(id: string): Viewer | undefined {
  return context?.viewer.renderer.passes.find((p: Viewer) => p.passId === id);
}
