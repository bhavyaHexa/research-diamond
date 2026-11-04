import { createContext, useContext, type ReactNode } from "react";
import { makeAutoObservable } from "mobx";
import { DEFAULT_GEM, DEFAULT_METAL } from "./scene/materials";
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

export class RootStore {
  viewer = new ViewerStore();
  materials = new MaterialStore();
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
