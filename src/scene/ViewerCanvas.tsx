import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { reaction } from "mobx";
import { startViewer, type SceneHandle } from "../engine";
import { useStore } from "../store";

// React Three Fiber creates the canvas. The engine draws into it, so R3F's own
// render loop is turned off (frameloop="never").
export function ViewerCanvas() {
  const store = useStore();
  const handle = useRef<SceneHandle | null>(null);

  useEffect(
    () => reaction(() => store.materials.metal, (key) => handle.current?.applyMetal(key)),
    [store],
  );
  useEffect(
    () => reaction(() => store.materials.gem, (key) => handle.current?.applyGem(key)),
    [store],
  );

  return (
    <Canvas
      frameloop="never"
      onCreated={({ gl }) => {
        startViewer(gl.domElement, store)
          .then((scene) => {
            handle.current = scene;
            // Re-apply in case the store changed while the scene was loading.
            scene.applyGem(store.materials.gem);
            scene.applyMetal(store.materials.metal);
          })
          .catch((err) => {
            console.error("Viewer failed to load:", err);
            store.viewer.fail("The viewer could not start on this device.");
          });
      }}
    />
  );
}
