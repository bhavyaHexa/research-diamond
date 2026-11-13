// Resolution and frame cost. These are the knobs that trade sharpness for speed.
import { getViewer, redraw } from "./engineAccess";
import type { ControlGroup } from "./types";

export function qualityGroups(): ControlGroup[] {
  return [
    {
      id: "quality",
      title: "Resolution",
      section: "Post-processing",
      description:
        "Canvas pixels per CSS pixel. The shipped viewer renders at 1.5×, which over-samples on a normal display. Every screen-space pass and render target scales with it.",
      controls: () => [
        {
          kind: "slider", id: "quality.pixelRatio", label: "Render scale (displayCanvasScaling)", min: 0.5, max: 3, step: 0.25,
          get: () => getViewer().renderer.displayCanvasScaling,
          set: (v) => { getViewer().renderer.displayCanvasScaling = v; redraw(); },
        },
      ],
    },
  ];
}
