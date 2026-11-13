import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { captureFrame, downloadManifest, type PipelineManifest } from "../../pipeline/manifest";
import { useStore } from "../../store";

// Save, restore and compare the whole look.
export const ExportTab = observer(function ExportTab() {
  const { pipeline } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    setBusy(true);
    pipeline.say("Waiting for the accumulation to finish, then saving the frame…");
    await pipeline.showBuffer(null);
    const stats = await captureFrame();
    setBusy(false);
    pipeline.say(
      `Saved ${stats.width}×${stats.height} PNG${stats.converged ? "" : " (not fully converged)"}; mean colour ${stats.mean.join(", ")}.`,
    );
  };

  return (
    <div>
      <p className="studio-note">
        The manifest is every setting plus how the frame is built (pass order, target formats, shader switches) in one JSON file.
        Keep one per look, and use the same file to check that a different renderer reproduces it.
      </p>
      <div className="studio-actions">
        <button
          onClick={() => {
            const m = downloadManifest();
            pipeline.say(`Saved ${Object.keys(m.settings).length} settings and the pass order.`);
          }}
        >
          Download manifest (JSON)
        </button>
        <button onClick={() => file.current?.click()}>Import manifest…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const parsed = JSON.parse(await f.text()) as PipelineManifest;
              if (parsed.format !== "hexa-pipeline-manifest") throw new Error("Not a pipeline manifest");
              pipeline.importManifest(parsed);
            } catch (error) {
              pipeline.say(`Could not import: ${(error as Error).message}`);
            }
          }}
        />
        <button onClick={() => void capture()} disabled={busy}>
          Save converged frame (PNG)
        </button>
        <button onClick={() => pipeline.resetToShipped()}>Reset everything to the shipped look</button>
      </div>
      {pipeline.notice && <p className="studio-notice">{pipeline.notice}</p>}
    </div>
  );
});
