"use client";

import { useState } from "react";
import { CATEGORIES, PHASES, STATUSES } from "@/lib/skill-data";

type Project = {
  id: number;
  name: string;
  targetUrl: string;
  category: string;
  authRequired: boolean;
  authorised: boolean;
  phase: string;
  status: string;
  worstMismatchPercent: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const statusColor: Record<string, string> = {
  pending: "bg-slate-500/20 text-slate-300",
  "in-progress": "bg-cyan-500/20 text-cyan-300",
  done: "bg-emerald-500/20 text-emerald-300",
  blocked: "bg-rose-500/20 text-rose-300",
};

const input =
  "w-full rounded-md border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400";

export default function ProjectsClient({ initial }: { initial: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", targetUrl: "", category: "web app", authRequired: false, authorised: false, notes: "" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create project");
      setProjects((p) => [data.project, ...p]);
      setForm({ name: "", targetUrl: "", category: "web app", authRequired: false, authorised: false, notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "Update failed");
    setProjects((p) => p.map((x) => (x.id === id ? data.project : x)));
  }

  async function remove(id: number) {
    if (!confirm("Delete this project from the tracker?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) return setError("Delete failed");
    setProjects((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
      <form onSubmit={create} className="h-fit space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5" aria-label="New project">
        <h2 className="font-semibold text-white">New clone project</h2>
        <div>
          <label htmlFor="url" className="mb-1 block text-sm text-slate-300">Target URL</label>
          <input id="url" type="url" required placeholder="https://example.com" className={input} value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm text-slate-300">Name (optional)</label>
          <input id="name" className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="cat" className="mb-1 block text-sm text-slate-300">Category</label>
          <select id="cat" className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="notes" className="mb-1 block text-sm text-slate-300">Notes</label>
          <textarea id="notes" rows={3} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.authRequired} onChange={(e) => setForm({ ...form, authRequired: e.target.checked })} /> Login required
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={form.authorised} onChange={(e) => setForm({ ...form, authorised: e.target.checked })} />
          I own this site or have permission to inspect and reproduce it.
        </label>
        {error ? <p role="alert" className="text-sm text-rose-400">{error}</p> : null}
        <button disabled={busy} className="w-full rounded-md bg-indigo-500 px-4 py-2 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
          {busy ? "Adding…" : "Add project"}
        </button>
      </form>

      <div className="space-y-4">
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-slate-400">
            No projects yet. Add one, then run <code className="text-slate-200">node scripts/init-project.mjs --url …</code> in the skill folder.
          </div>
        ) : (
          projects.map((p) => (
            <article key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-white">{p.name}</h3>
                  <a href={p.targetUrl} target="_blank" rel="noreferrer noopener" className="break-all text-sm text-cyan-300 hover:underline">{p.targetUrl}</a>
                  <p className="mt-1 text-xs text-slate-500">{p.category}{p.authRequired ? " · login required" : ""} · updated {new Date(p.updatedAt).toLocaleString()}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[p.status] ?? statusColor.pending}`}>{p.status}</span>
              </div>

              <ol className="mt-4 flex flex-wrap gap-1" aria-label="Phase progress">
                {PHASES.map((ph, i) => {
                  const cur = PHASES.indexOf(p.phase as (typeof PHASES)[number]);
                  return (
                    <li key={ph} className={`rounded px-2 py-0.5 text-xs ${i < cur ? "bg-emerald-500/20 text-emerald-300" : i === cur ? "bg-indigo-500/30 text-white" : "bg-white/5 text-slate-500"}`}>
                      {ph}
                    </li>
                  );
                })}
              </ol>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={`ph-${p.id}`} className="mb-1 block text-xs text-slate-400">Phase</label>
                  <select id={`ph-${p.id}`} className={input} value={p.phase} onChange={(e) => patch(p.id, { phase: e.target.value })}>
                    {PHASES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`st-${p.id}`} className="mb-1 block text-xs text-slate-400">Status</label>
                  <select id={`st-${p.id}`} className={input} value={p.status} onChange={(e) => patch(p.id, { status: e.target.value })}>
                    {STATUSES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`mm-${p.id}`} className="mb-1 block text-xs text-slate-400">Worst visual mismatch %</label>
                  <input
                    id={`mm-${p.id}`}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="not measured"
                    className={input}
                    defaultValue={p.worstMismatchPercent ?? ""}
                    onBlur={(e) => patch(p.id, { worstMismatchPercent: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>

              <label htmlFor={`nt-${p.id}`} className="mb-1 mt-3 block text-xs text-slate-400">Notes</label>
              <textarea id={`nt-${p.id}`} rows={2} className={input} defaultValue={p.notes} onBlur={(e) => e.target.value !== p.notes && patch(p.id, { notes: e.target.value })} />

              <div className="mt-3 flex justify-end">
                <button onClick={() => remove(p.id)} className="rounded-md border border-rose-400/30 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
