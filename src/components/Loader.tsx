import { observer } from "mobx-react-lite";
import { useStore } from "../store";

// Covers the viewer until the first frames are drawn.
export const Loader = observer(function Loader() {
  const { viewer } = useStore();
  const { status, step, progress, error } = viewer;
  const classes = ["loader", status === "ready" && "done", status === "error" && "error"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="loader-card">
        <svg className="loader-icon" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="20.5" r="9" fill="none" stroke="#7a5418" strokeWidth="5" />
          <circle cx="16" cy="20.5" r="9" fill="none" stroke="#e8b34b" strokeWidth="3" />
          <path
            d="M11 1.5h10l3.5 4L16 12 7.5 5.5z"
            fill="#eef6ff"
            stroke="#5b6b80"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M7.5 5.5h17M13 5.5 16 12l3-6.5" fill="none" stroke="#9fb3c8" strokeWidth="0.9" />
        </svg>
        <div className="loader-title">Hexa Jewelry</div>
        <div className="loader-step">{status === "error" ? error : step}</div>
        <div className="loader-bar">
          <div className="loader-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="loader-pct">{Math.round(progress * 100)}%</div>
        {status === "error" && (
          <button className="loader-retry" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
});
