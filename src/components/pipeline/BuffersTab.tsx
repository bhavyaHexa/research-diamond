import { observer } from "mobx-react-lite";
import { listBuffers } from "../../pipeline/buffers";
import { useStore } from "../../store";

// Look at the intermediate images of a frame: G-buffer, AO, accumulation history, HDR sources.
export const BuffersTab = observer(function BuffersTab() {
  const { pipeline } = useStore();
  const buffers = listBuffers();

  return (
    <div>
      <p className="studio-note">
        Pick a buffer to draw it over the canvas. Packed or HDR buffers are decoded for display. The overlay is drawn after the
        final frame, so the image underneath is unchanged.
      </p>
      <div className="studio-row">
        <label>
          <input
            type="radio"
            name="view-mode"
            checked={pipeline.bufferMode === "pip"}
            onChange={() => void pipeline.showBuffer(pipeline.bufferId, "pip")}
          />{" "}
          Corner
        </label>
        <label>
          <input
            type="radio"
            name="view-mode"
            checked={pipeline.bufferMode === "full"}
            onChange={() => void pipeline.showBuffer(pipeline.bufferId, "full")}
          />{" "}
          Full screen
        </label>
        <button className="studio-link" onClick={() => void pipeline.showBuffer(null)} disabled={!pipeline.bufferId}>
          Hide
        </button>
      </div>
      <ul className="buffers">
        {buffers.map((b) => (
          <li key={b.id} className={pipeline.bufferId === b.id ? "active" : ""}>
            <button onClick={() => void pipeline.showBuffer(b.id)}>
              <strong>{b.title}</strong>
              <span>{b.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
