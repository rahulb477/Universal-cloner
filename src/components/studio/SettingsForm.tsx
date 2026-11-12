"use client";

import { useState } from "react";
import { call, Field, Icon, Notice, Switch } from "./ui";

export type FieldDef = { key: string; label: string; hint: string; type?: "number" | "bool"; step?: number; min?: number; max?: number };

/** Edits a subset of the studio settings and saves them through PUT /api/settings (the server clamps every value). */
export function SettingsForm({ fields, values, defaults, onSaved }: { fields: FieldDef[]; values: Record<string, number | boolean>; defaults: Record<string, number | boolean>; onSaved: () => void }) {
  const [v, setV] = useState(values);
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});
  // Re-sync when the saved values change on the server (compared by content, so polling does not wipe edits).
  const sig = JSON.stringify(fields.map((f) => values[f.key]));
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setV(values);
  }
  const dirty = fields.some((f) => v[f.key] !== values[f.key]);
  return (
    <form
      className="p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ busy: true });
        try {
          await call("/api/settings", { method: "PUT", body: Object.fromEntries(fields.map((f) => [f.key, v[f.key]])) });
          setState({ saved: true });
          onSaved();
        } catch (err) {
          setState({ error: (err as Error).message });
        }
      }}
    >
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {fields.map((f) => f.type === "bool" ? (
          <div key={f.key} className="flex items-start justify-between gap-4 sm:col-span-2">
            <div><p className="text-[13px] font-medium text-ink">{f.label}</p><p className="text-xs text-ink3">{f.hint}</p></div>
            <Switch label={f.label} checked={v[f.key] === true} onChange={(x) => { setV({ ...v, [f.key]: x }); setState({}); }} />
          </div>
        ) : (
          <Field key={f.key} label={f.label} hint={`${f.hint} Default ${defaults[f.key]}.`}>
            <input className="input mono" type="number" step={f.step ?? 1} min={f.min} max={f.max} value={String(v[f.key] ?? "")} onChange={(e) => { setV({ ...v, [f.key]: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value) }); setState({}); }} required />
          </Field>
        ))}
      </div>
      {state.error ? <div className="mt-4"><Notice tone="bad">{state.error}</Notice></div> : null}
      <div className="mt-5 flex items-center gap-3">
        <button className="btn btn-primary" disabled={!dirty || state.busy}>{state.busy ? <span className="spin" /> : null}Save changes</button>
        <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => setV(values)}>Discard</button>
        {state.saved && !dirty ? <span className="flex items-center gap-1.5 text-[13px] text-ok"><Icon name="check" size={14} /> Saved</span> : null}
      </div>
    </form>
  );
}
