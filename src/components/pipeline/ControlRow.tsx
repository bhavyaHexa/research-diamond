import { useState } from "react";
import type { Control } from "../../pipeline/types";

function fmt(value: number, step: number): string {
  const decimals = Math.min(5, Math.max(0, Math.ceil(-Math.log10(step || 0.01))));
  return value.toFixed(decimals);
}

// One adjustable value. It reads the engine when it first appears and writes to the engine
// on every change; the panel re-creates rows (new key) when many values change at once.
export function ControlRow({ control }: { control: Control }) {
  const [value, setValue] = useState<unknown>(() => {
    try {
      return control.get();
    } catch {
      return undefined;
    }
  });

  if (value === undefined) return null;

  const change = (next: unknown) => {
    setValue(next);
    (control.set as (v: unknown) => void)(next);
  };

  switch (control.kind) {
    case "toggle":
      return (
        <label className="ctl ctl-toggle">
          <input type="checkbox" checked={!!value} onChange={(e) => change(e.target.checked)} />
          <span>{control.label}</span>
        </label>
      );

    case "slider": {
      const n = Number(value);
      return (
        <label className="ctl">
          <span className="ctl-label">{control.label}</span>
          <span className="ctl-input">
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={Number.isFinite(n) ? n : control.min}
              onChange={(e) => change(parseFloat(e.target.value))}
            />
            <output>{fmt(n, control.step)}</output>
          </span>
        </label>
      );
    }

    case "number":
      return (
        <label className="ctl">
          <span className="ctl-label">{control.label}</span>
          <input
            className="ctl-number"
            type="number"
            step={control.step}
            value={Number(value)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) change(v);
            }}
          />
        </label>
      );

    case "select":
      return (
        <label className="ctl">
          <span className="ctl-label">{control.label}</span>
          <select
            value={String(value)}
            onChange={(e) => {
              const picked = control.options.find((o) => String(o.value) === e.target.value);
              if (picked) change(picked.value);
            }}
          >
            {control.options.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );

    case "color":
      return (
        <label className="ctl">
          <span className="ctl-label">{control.label}</span>
          <input type="color" value={String(value)} onChange={(e) => change(e.target.value)} />
        </label>
      );

    case "vector": {
      const v = (value as number[]) ?? [];
      return (
        <div className="ctl">
          <span className="ctl-label">{control.label}</span>
          <span className="ctl-vector">
            {v.map((n, i) => (
              <input
                key={i}
                className="ctl-number"
                type="number"
                step={control.step}
                value={Number.isFinite(n) ? +n.toFixed(4) : 0}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isFinite(parsed)) return;
                  const next = [...v];
                  next[i] = parsed;
                  change(next);
                }}
              />
            ))}
          </span>
        </div>
      );
    }
  }
}
