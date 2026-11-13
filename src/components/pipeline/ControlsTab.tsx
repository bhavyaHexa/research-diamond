import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { groupsBySection } from "../../pipeline/registry";
import type { GroupSection } from "../../pipeline/types";
import { useStore } from "../../store";
import { ControlRow } from "./ControlRow";

// A list of control groups (one engine effect or scene part each), grouped into sections.
export const ControlsTab = observer(function ControlsTab({ sections }: { sections: GroupSection[] }) {
  const { pipeline } = useStore();
  // Groups are rebuilt when values change in bulk, so lists such as the light list stay current.
  const shown = useMemo(
    () => groupsBySection().filter((s) => sections.includes(s.section)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pipeline.revision, sections.join("|")],
  );

  if (!shown.length) return <p className="studio-empty">Nothing adjustable here on this scene.</p>;

  return (
    <div key={pipeline.revision}>
      {shown.map(({ section, groups }) => (
        <section key={section} className="studio-section">
          <h3>{section}</h3>
          {groups.map((group) => (
            <details key={group.id} className="studio-group">
              <summary>{group.title}</summary>
              <p className="studio-note">{group.description}</p>
              {group.controls().map((control) => (
                <ControlRow key={control.id} control={control} />
              ))}
            </details>
          ))}
        </section>
      ))}
    </div>
  );
});
