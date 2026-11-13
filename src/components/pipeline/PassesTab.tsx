import { useReducer } from "react";
import { observer } from "mobx-react-lite";
import { listPasses, setPassEnabled } from "../../pipeline/passes";
import { useStore } from "../../store";

// The frame, pass by pass, in the order the engine runs it.
export const PassesTab = observer(function PassesTab() {
  const { pipeline } = useStore();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const passes = listPasses();

  return (
    <div>
      <p className="studio-note">
        One frame, in the order the engine runs it. Each step reads earlier results and writes the next. Switch optional passes off
        to see what they contribute; open a pass's output to see its buffer.
      </p>
      <ol className="flow">
        {passes.map((p) => (
          <li key={p.id} className={p.enabled ? "flow-item" : "flow-item off"}>
            <div className="flow-head">
              <span className="flow-order">{p.order >= 0 ? p.order + 1 : "–"}</span>
              <strong>{p.info.title}</strong>
              <code>{p.id}</code>
              {!p.info.locked && (
                <label className="flow-switch" title={p.enabled ? "Switch off" : "Switch on"}>
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => {
                      setPassEnabled(p.id, e.target.checked);
                      refresh();
                    }}
                  />
                  <span>{p.enabled ? "on" : "off"}</span>
                </label>
              )}
            </div>
            <p>{p.info.does}</p>
            <div className="flow-io">
              <span>reads: {p.info.reads}</span>
              <span>writes: {p.info.writes}</span>
            </div>
            {p.info.buffer && (
              <button className="studio-link" onClick={() => void pipeline.showBuffer(p.info.buffer!, "pip")}>
                View output
              </button>
            )}
          </li>
        ))}
      </ol>
      <p className="studio-note">
        Then the browser shows the canvas. The very last step (final composite) decodes the HDR, applies tone mapping and the other
        post effects, and writes sRGB.
      </p>
    </div>
  );
});
