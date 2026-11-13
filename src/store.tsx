import { createContext, useContext, type ReactNode } from "react";
import { makeAutoObservable } from "mobx";
import { DEFAULT_GEM, DEFAULT_METAL } from "./scene/materials";
import { showBuffer, type ViewMode } from "./pipeline/buffers";
import { applyManifest, captureManifest, type PipelineManifest } from "./pipeline/manifest";
import type { ControlValue } from "./pipeline/types";
import type { GemKey, MetalKey } from "./types";

// Loading state the Loader shows.
export class ViewerStore {
  status: "loading" | "ready" | "error" = "loading";
  step = "Starting the viewer";
  progress = 0;
  error = "";

  constructor() {
    makeAutoObservable(this);
  }

  setStep(step: string, progress: number) {
    this.step = step;
    this.progress = progress;
  }

  ready() {
    this.status = "ready";
    this.progress = 1;
  }

  fail(message: string) {
    this.status = "error";
    this.error = message;
  }
}

// The ring's current metal and gem. A reaction in ViewerCanvas applies changes to the engine.
export class MaterialStore {
  metal: MetalKey = DEFAULT_METAL;
  gem: GemKey = DEFAULT_GEM;

  constructor() {
    makeAutoObservable(this);
  }

  setMetal(key: MetalKey) {
    this.metal = key;
  }

  setGem(key: GemKey) {
    this.gem = key;
  }
}

export type StudioTab = "pipeline" | "light" | "materials" | "effects" | "views" | "export";

// State of the Pipeline Studio panel. The engine's own values are never stored here:
// controls read and write the engine directly (see src/pipeline), and this store only
// holds what the panel itself needs (open/closed, tab, active debug view, shipped values).
export class PipelineStore {
  ready = false;
  open = false;
  tab: StudioTab = "pipeline";
  /** Bumped when many values change at once (reset, import) so every control re-reads the engine. */
  revision = 0;
  bufferId: string | null = null;
  bufferMode: ViewMode = "pip";
  notice = "";
  private defaults: Record<string, ControlValue> = {};

  constructor() {
    makeAutoObservable(this);
  }

  /** Called once the engine has finished loading the scene: remember the shipped look. */
  markReady() {
    this.defaults = captureManifest().settings;
    this.ready = true;
    // The scene preset applies a few values (e.g. HDR rotation) just after loading, so take the
    // shipped snapshot again once they have settled, unless the user already changed something.
    setTimeout(() => {
      if (this.revision === 0) this.defaults = captureManifest().settings;
    }, 3000);
  }

  toggleOpen() {
    this.open = !this.open;
  }

  setTab(tab: StudioTab) {
    this.tab = tab;
  }

  say(message: string) {
    this.notice = message;
  }

  async showBuffer(id: string | null, mode: ViewMode = this.bufferMode) {
    this.bufferId = id;
    this.bufferMode = mode;
    await showBuffer(id, mode);
  }

  resetToShipped() {
    const result = applyManifest({ format: "hexa-pipeline-manifest", version: 1, createdAt: "", runtime: {} as never, settings: this.defaults });
    this.revision++;
    this.notice = `Restored ${result.applied} values to the shipped look.`;
  }

  importManifest(manifest: PipelineManifest) {
    const result = applyManifest(manifest);
    this.revision++;
    this.notice = `Applied ${result.applied} values${result.missing.length ? `, ${result.missing.length} unknown ids skipped` : ""}.`;
  }
}

export class RootStore {
  viewer = new ViewerStore();
  materials = new MaterialStore();
  pipeline = new PipelineStore();
}

export const rootStore = new RootStore();

const StoreContext = createContext<RootStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  return <StoreContext.Provider value={rootStore}>{children}</StoreContext.Provider>;
}

export function useStore(): RootStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
