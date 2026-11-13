// The pipeline manifest: every setting plus the facts about how this frame is built,
// as one JSON document. Use it to save a look, to restore it, and as the contract a
// replacement renderer must reproduce.
import type { Viewer } from "../vendor";
import { getViewer, plugin } from "./engineAccess";
import { listPasses } from "./passes";
import { allControls, allGroups, findControl } from "./registry";
import type { ControlValue } from "./types";

export interface PipelineManifest {
  format: "hexa-pipeline-manifest";
  version: 1;
  createdAt: string;
  /** How the frame is built right now (read-only facts). */
  runtime: {
    passOrder: string[];
    passes: Record<string, boolean>;
    canvas: { width: number; height: number; pixelRatio: number };
    targets: Record<string, { width: number; height: number; type: string; colorSpace: string } | null>;
    materialDefines: { gold: Record<string, unknown> | null; diamond: Record<string, unknown> | null };
    accumulation: { frames: number; converged: boolean };
  };
  /** Every adjustable value, keyed by control id. Restoring these reproduces the look. */
  settings: Record<string, ControlValue>;
}

const TYPE_NAMES: Record<number, string> = { 1009: "UnsignedByte", 1016: "HalfFloat", 1015: "Float" };

function describeTarget(rt: Viewer | null | undefined) {
  const texture = rt?.texture ?? rt;
  if (!texture) return null;
  const image = texture.image ?? {};
  return {
    width: rt?.width ?? image.width ?? 0,
    height: rt?.height ?? image.height ?? 0,
    type: TYPE_NAMES[texture.type] ?? String(texture.type),
    colorSpace: texture.colorSpace || "none",
  };
}

function firstMaterialDefines(select: (m: Viewer) => boolean): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  getViewer().scene.modelRoot.modelObject.traverse((o: Viewer) => {
    if (found || !o.isMesh || !o.material) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (select(m)) found = { ...m.defines };
  });
  return found;
}

export function captureManifest(): PipelineManifest {
  const viewer = getViewer();
  const renderer = viewer.renderer;
  const settings: Record<string, ControlValue> = {};
  for (const control of allControls()) {
    try {
      settings[control.id] = control.get();
    } catch {
      /* a value the engine cannot read right now is simply not recorded */
    }
  }
  const progressive = plugin("Progressive");
  const canvas = viewer.canvas as HTMLCanvasElement;
  return {
    format: "hexa-pipeline-manifest",
    version: 1,
    createdAt: new Date().toISOString(),
    runtime: {
      passOrder: [...(renderer.pipeline ?? [])],
      passes: Object.fromEntries(listPasses().map((p) => [p.id, p.enabled])),
      canvas: { width: canvas.width, height: canvas.height, pixelRatio: renderer.displayCanvasScaling },
      targets: {
        composer: describeTarget(renderer.composerTarget),
        gbufferDepthNormal: describeTarget(viewer.getPlugin("GBuffer")?.getDepthNormal()),
        gbufferFlags: describeTarget(viewer.getPlugin("GBuffer")?.getFlagsTexture()),
        ao: describeTarget(viewer.getPlugin("SSAO")?._aoTarget),
        history: describeTarget(progressive?.lastFrame),
      },
      materialDefines: {
        gold: firstMaterialDefines((m) => m.metalness === 1 && !m.isDiamondMaterial),
        diamond: firstMaterialDefines((m) => !!m.isDiamondMaterial),
      },
      accumulation: { frames: renderer.frameCount ?? 0, converged: !!progressive?.isConverged?.(true) },
    },
    settings,
  };
}

/** Restore settings from a manifest. Unknown ids are reported, never fatal. */
export function applyManifest(manifest: PipelineManifest): { applied: number; missing: string[]; failed: string[] } {
  const controls = allControls(allGroups());
  const missing: string[] = [];
  const failed: string[] = [];
  let applied = 0;
  for (const [id, value] of Object.entries(manifest.settings ?? {})) {
    const control = findControl(id, controls);
    if (!control) {
      missing.push(id);
      continue;
    }
    try {
      (control.set as (v: ControlValue) => void)(value);
      applied++;
    } catch {
      failed.push(id);
    }
  }
  return { applied, missing, failed };
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadManifest() {
  const manifest = captureManifest();
  download("pipeline-manifest.json", new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
  return manifest;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until the accumulation buffer has averaged all its frames (or the timeout passes). */
export async function waitUntilConverged(timeoutMs = 30000): Promise<boolean> {
  const progressive = plugin("Progressive");
  const start = performance.now();
  while (!progressive?.isConverged?.(true)) {
    if (performance.now() - start > timeoutMs) return false;
    await sleep(100);
  }
  await sleep(150);
  return true;
}

export interface FrameStats {
  width: number;
  height: number;
  mean: [number, number, number];
}

/** Save the converged frame as a PNG and return its mean colour (a cheap regression number). */
export async function captureFrame(): Promise<FrameStats & { converged: boolean }> {
  const converged = await waitUntilConverged();
  const canvas = getViewer().canvas as HTMLCanvasElement;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
  const sum = [0, 0, 0];
  const pixels = copy.width * copy.height;
  for (let i = 0; i < data.length; i += 4) {
    sum[0] += data[i];
    sum[1] += data[i + 1];
    sum[2] += data[i + 2];
  }
  const blob: Blob = await new Promise((resolve) => copy.toBlob((b) => resolve(b!), "image/png"));
  download("pipeline-frame.png", blob);
  return {
    width: copy.width,
    height: copy.height,
    mean: sum.map((s) => +(s / pixels).toFixed(2)) as [number, number, number],
    converged,
  };
}

/** Golden-frame check: is the current mean colour within `tolerance` levels of a stored one? */
export function matchesGolden(current: FrameStats, golden: FrameStats, tolerance = 3) {
  const diff = current.mean.map((v, i) => +(v - golden.mean[i]).toFixed(2));
  return { ok: diff.every((d) => Math.abs(d) <= tolerance), diff };
}
