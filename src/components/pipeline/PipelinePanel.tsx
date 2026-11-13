import { observer } from "mobx-react-lite";
import { useStore, type StudioTab } from "../../store";
import { BuffersTab } from "./BuffersTab";
import { ControlsTab } from "./ControlsTab";
import { ExportTab } from "./ExportTab";
import { PassesTab } from "./PassesTab";

const TABS: { id: StudioTab; label: string }[] = [
  { id: "pipeline", label: "Pipeline" },
  { id: "light", label: "Light & HDR" },
  { id: "materials", label: "Materials" },
  { id: "effects", label: "Effects" },
  { id: "views", label: "Buffers" },
  { id: "export", label: "Export" },
];

// The Pipeline Studio: every pass, effect, light and material of the engine, in one panel.
export const PipelinePanel = observer(function PipelinePanel() {
  const { pipeline, viewer } = useStore();
  if (viewer.status !== "ready" || !pipeline.ready) return null;

  if (!pipeline.open) {
    return (
      <button className="studio-toggle" onClick={() => pipeline.toggleOpen()}>
        Pipeline Studio
      </button>
    );
  }

  return (
    <aside className="studio" aria-label="Pipeline Studio">
      <header className="studio-head">
        <strong>Pipeline Studio</strong>
        <button className="studio-close" onClick={() => pipeline.toggleOpen()} aria-label="Close">
          ×
        </button>
      </header>
      <nav className="studio-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={pipeline.tab === t.id}
            className={pipeline.tab === t.id ? "active" : ""}
            onClick={() => pipeline.setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="studio-body">
        {pipeline.tab === "pipeline" && <PassesTab />}
        {pipeline.tab === "light" && <ControlsTab sections={["Scene & light"]} />}
        {pipeline.tab === "materials" && <ControlsTab sections={["Materials"]} />}
        {pipeline.tab === "effects" && (
          <ControlsTab sections={["Screen-space", "Post-processing", "Ground & shadows", "Other plugins"]} />
        )}
        {pipeline.tab === "views" && <BuffersTab />}
        {pipeline.tab === "export" && <ExportTab />}
      </div>
    </aside>
  );
});
