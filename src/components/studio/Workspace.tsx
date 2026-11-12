"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectActions } from "./ProjectActions";
import { ActionButton, ago, call, CopyText, duration, Empty, fmtBytes, fmtDate, Icon, jobActive, Notice, ProgressBar, Skeleton, Status, useLive, type Project } from "./ui";

type Node = { name: string; path: string; dir: boolean; size?: number; children?: Node[] };
type FileData = { path: string; size: number; kind: "text" | "image" | "binary"; editable: boolean; content: string | null; note?: string };
type Details = {
  analysis: null | {
    targetUrl: string; analysedAt: string; browser: { source: string; version: string };
    pages: { route: string; status: number; title: string; source: string; protected?: boolean; isErrorPage?: boolean; screenshots: Record<string, string> }[];
    routes: { route: string; state: string; reason?: string; status?: number }[];
    login: { used: boolean; loginRoute: string | null; succeeded: boolean };
    design: Record<string, unknown>;
    forms: { id: string; kind: string; method: string; actionPath: string; submitLabel: string; routes: string[]; fields: { name: string; type: string; required: boolean; label: string; hidden: boolean }[] }[];
    interactions: { route: string; label: string; kind: string; viewport: string; replayable: boolean; note?: string }[];
    api: { method: string; url: string; status: number; type: string; route: string; sameOrigin: boolean }[];
    consoleErrors: { route: string; message: string }[];
    assets: { downloaded: number; bytes: number; failed: { url: string; reason: string }[] };
    capture: Record<string, unknown>; blockedRequests: number; errorPageCaptured: boolean; notes: string[];
  };
  plan: null | { source: string; provider?: { label: string; model: string }; summary: string; siteCategory: string; frontend: { framework: string; rationale: string }; components: { name: string; purpose: string }[]; backend: { needed: boolean; services: string[] }; database: { needed: boolean; entities: string[] }; auth: { needed: boolean; strategy: string }; assets: { strategy: string }; pages: { route: string; purpose: string }[]; testing: { strategy: string[] }; risks: string[] };
  generation: null | { files: number; pages: number; components: string[]; features: Record<string, unknown>; external: string[]; previewAccount: { identifier: string; password: string } | null };
};

const TABS = [["code", "Code", "code"], ["logs", "Build logs", "list"], ["analysis", "Analysis", "globe"], ["export", "Export", "download"]] as const;
type Tab = (typeof TABS)[number][0];
const CATEGORY: [RegExp, string][] = [[/^src\/pages/, "pages"], [/^src\/components/, "components"], [/^(public|src\/(assets|styles|scripts))/, "assets"], [/^server/, "backend"], [/^db/, "database"], [/^tests/, "tests"], [/^(scripts|src\/data)/, "config"]];
const category = (p: string) => CATEGORY.find(([re]) => re.test(p))?.[1] ?? null;
const DEVICES = { desktop: { w: 1440, h: 900, label: "Desktop" }, tablet: { w: 820, h: 1180, label: "Tablet" }, mobile: { w: 390, h: 844, label: "Mobile" } } as const;
type Device = keyof typeof DEVICES;

/* ------------------------------------------------------------------ steps */
function Steps({ p }: { p: Project }) {
  const job = p.job;
  if (!job) return <p className="px-4 py-6 text-[13px] text-ink3">No job has run for this project yet.</p>;
  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="mono text-[11.5px] text-ink2">{job.progress.completed}/{job.progress.total} steps · {job.type} · attempt {job.attempt}</p>
        <Status value={job.status} />
      </div>
      <ProgressBar job={job} />
      <ol className="mt-3 space-y-px">
        {job.steps.map((s, i) => {
          const tone = s.status === "done" ? "text-ok" : s.status === "failed" ? "text-bad" : s.status === "running" ? "text-accent" : "text-ink3";
          return (
            <li key={s.key} className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5" aria-current={s.status === "running" ? "step" : undefined}>
              <span className={`mt-0.5 grid h-4 w-4 flex-none place-items-center ${tone}`}>
                {s.status === "running" ? <span className="spin" style={{ width: 12, height: 12 }} /> : s.status === "done" ? <Icon name="check" size={13} /> : s.status === "failed" ? <Icon name="x" size={13} /> : <span className="mono text-[10px]">{String(i + 1).padStart(2, "0")}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] leading-tight ${s.status === "pending" || s.status === "skipped" ? "text-ink3" : "text-ink"}`}>{s.label}{s.status === "skipped" ? " (kept from earlier run)" : ""}</span>
                {s.detail ? <span className="mono block break-words text-[11px] leading-snug text-ink3">{s.detail}</span> : null}
              </span>
              {s.startedAt ? <span className="mono flex-none text-[10.5px] text-ink3">{duration(s.startedAt, s.finishedAt ?? (s.status === "running" ? null : s.startedAt))}</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* --------------------------------------------------------------- explorer */
function Tree({ nodes, open, toggle, active, onPick, depth = 0 }: { nodes: Node[]; open: Set<string>; toggle: (p: string) => void; active: string | null; onPick: (p: string) => void; depth?: number }) {
  return (
    <ul role={depth ? "group" : "tree"}>
      {nodes.map((n) => {
        const cat = n.dir ? category(n.path) : null;
        return (
          <li key={n.path} role="treeitem" aria-expanded={n.dir ? open.has(n.path) : undefined} aria-selected={active === n.path}>
            <button
              className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[12.5px] hover:bg-panel2 ${active === n.path ? "bg-panel2 text-ink" : "text-ink2"}`}
              style={{ paddingLeft: 8 + depth * 12 }} onClick={() => (n.dir ? toggle(n.path) : onPick(n.path))} title={n.path}
            >
              {n.dir ? <Icon name="chevron" size={11} className={`text-ink3 transition-transform ${open.has(n.path) ? "rotate-90" : ""}`} /> : <span className="w-[11px]" />}
              <Icon name={n.dir ? "folder" : "file"} size={13} className={n.dir ? "text-accent" : "text-ink3"} />
              <span className="mono truncate">{n.name}</span>
              {cat && (depth <= 1) ? <span className="mono ml-auto flex-none rounded bg-panel2 px-1 text-[9.5px] uppercase tracking-wider text-ink3">{cat}</span> : null}
            </button>
            {n.dir && open.has(n.path) && n.children?.length ? <Tree nodes={n.children} open={open} toggle={toggle} active={active} onPick={onPick} depth={depth + 1} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- editor */
function Editor({ p, path, onSaved, busyJob }: { p: Project; path: string | null; onSaved: () => void; busyJob: boolean }) {
  const [file, setFile] = useState<FileData | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ loading?: boolean; error?: string; saving?: boolean; note?: string }>({ loading: !!path });
  const [instruction, setInstruction] = useState("");
  const [ai, setAi] = useState<{ busy?: boolean; error?: string; before?: string; by?: string }>({});
  const gutter = useRef<HTMLDivElement>(null);
  const dirty = !!file?.editable && text !== file.content;

  useEffect(() => {
    if (!path) return;
    let stale = false;
    call<FileData>(`/api/projects/${p.id}/file?path=${encodeURIComponent(path)}`)
      .then((f) => { if (!stale) { setFile(f); setText(f.content ?? ""); setState({}); } })
      .catch((e) => { if (!stale) { setFile(null); setState({ error: (e as Error).message }); } });
    return () => { stale = true; };
  }, [p.id, path]);

  const save = useCallback(async (rebuild: boolean) => {
    if (!file) return;
    setState({ saving: true });
    try {
      await call(`/api/projects/${p.id}/file`, { method: "PUT", body: { path: file.path, content: text } });
      setFile({ ...file, content: text, size: new Blob([text]).size });
      setAi({});
      if (rebuild) await call(`/api/projects/${p.id}/actions`, { body: { action: "rebuild" } });
      setState({ note: rebuild ? "Saved. Rebuild queued." : "Saved. Rebuild to see it in the preview." });
      onSaved();
    } catch (e) {
      setState({ error: (e as Error).message });
    }
  }, [file, text, p.id, onSaved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && dirty) { e.preventDefault(); void save(false); }
    };
    const guard = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", guard);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", guard); };
  }, [dirty, save]);

  const lines = useMemo(() => text.split("\n").length, [text]);

  if (!path) return <Empty icon="code" title="Select a file" text="Choose a file in the explorer to view or edit the generated source." />;
  if (state.loading) return <Skeleton rows={6} />;
  if (!file) return <div className="p-4"><Notice tone="bad">{state.error ?? "Could not open the file."}</Notice></div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="mono min-w-0 flex-1 truncate text-[12px] text-ink">{file.path}{dirty ? <span className="text-warn"> ● unsaved</span> : null}</span>
        <span className="mono text-[11px] text-ink3">{fmtBytes(file.size)}{file.editable ? ` · ${lines} lines` : ""}</span>
        {file.editable ? (
          <>
            <button className="btn btn-sm" disabled={!dirty || state.saving} onClick={() => void save(false)} title="Ctrl/⌘ + S">{state.saving ? <span className="spin" /> : null}Save</button>
            <button className="btn btn-sm btn-primary" disabled={state.saving || busyJob || (!dirty && !state.note)} onClick={() => void save(true)} title={busyJob ? "A job is already running" : "Save, then install, build, test and serve again"}><Icon name="hammer" size={13} /> Save &amp; rebuild</button>
          </>
        ) : null}
      </div>
      {state.error ? <div className="p-3"><Notice tone="bad">{state.error}</Notice></div> : null}
      {state.note && !dirty ? <p className="mono border-b border-line bg-raised px-3 py-1.5 text-[11.5px] text-ok">{state.note}</p> : null}
      {ai.before !== undefined ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accentsoft px-3 py-1.5 text-[12.5px] text-ink">
          <Icon name="spark" size={13} /> Proposal from {ai.by} loaded into the editor. Nothing is saved yet.
          <button className="btn btn-sm ml-auto" onClick={() => { setText(ai.before!); setAi({}); }}>Discard proposal</button>
        </div>
      ) : null}

      {file.kind === "image" ? (
        <div className="grid flex-1 place-items-center overflow-auto bg-raised p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/projects/${p.id}/file?path=${encodeURIComponent(file.path)}&raw=1`} alt={file.path} className="max-h-full max-w-full rounded border border-line bg-white" />
        </div>
      ) : !file.editable ? (
        <Empty icon="file" title="Not editable here" text={file.note ?? "This is a binary file. It is included in the build and the ZIP as it is."} />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 bg-raised">
            <div ref={gutter} aria-hidden="true" className="mono w-11 flex-none select-none overflow-hidden border-r border-line py-3 pr-2 text-right text-[12px] leading-[19px] text-ink3">
              {Array.from({ length: Math.min(lines, 20000) }, (_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea
              aria-label={`Contents of ${file.path}`} spellCheck={false} wrap="off" value={text}
              onChange={(e) => { setText(e.target.value); if (state.note) setState({}); }}
              onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const { selectionStart: a, selectionEnd: b } = t;
                  setText(text.slice(0, a) + "  " + text.slice(b));
                  requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
                }
              }}
              className="mono min-h-0 flex-1 resize-none bg-transparent px-3 py-3 text-[12px] leading-[19px] text-ink outline-none"
              style={{ tabSize: 2 }}
            />
          </div>
          <form
            className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setAi({ busy: true });
              try {
                const r = await call<{ content: string; provider: string; model: string }>(`/api/projects/${p.id}/file`, { body: { path: file.path, content: text, instruction } });
                setAi({ before: text, by: `${r.provider} (${r.model})` });
                setText(r.content);
                setInstruction("");
              } catch (err) {
                setAi({ error: (err as Error).message });
              }
            }}
          >
            <Icon name="spark" size={14} className="text-accent" />
            <input className="input min-w-[180px] flex-1 !py-1.5 text-[13px]" placeholder="Ask AI to change this file, e.g. “make the hero heading shorter”" value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="AI edit instruction" />
            <button className="btn btn-sm" disabled={ai.busy || instruction.trim().length < 4}>{ai.busy ? <span className="spin" /> : null}{ai.busy ? "Waiting for model…" : "Propose edit"}</button>
            {ai.error ? <p role="alert" className="w-full text-[12.5px] text-bad">{ai.error}{/provider/i.test(ai.error) ? <> <Link href="/studio/providers" className="underline">Open AI Providers</Link></> : null}</p> : null}
          </form>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- logs */
function Logs({ p, initialJob }: { p: Project; initialJob: string | null }) {
  const [kind, setKind] = useState<"job" | "preview">("job");
  const [jobId, setJobId] = useState<string | null>(initialJob);
  const [text, setText] = useState("");
  const [jobs, setJobs] = useState<{ id: string; type: string; status: string; createdAt: string; fromStage: string }[]>([]);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLPreElement>(null);
  const latestJobId = p.job?.id ?? null;
  const pinned = useRef(!!initialJob);

  // Follow the newest job unless the user pinned an older one.
  useEffect(() => { if (!pinned.current && latestJobId) setJobId(latestJobId); }, [latestJobId]);

  useEffect(() => {
    let stop = false;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    const poll = async () => {
      try {
        const q = kind === "preview" ? "kind=preview" : jobId ? `job=${jobId}` : "";
        const r = await call<{ text: string; offset: number; jobId: string | null; jobs: typeof jobs }>(`/api/projects/${p.id}/logs?${q}&offset=${offset}`);
        if (stop) return;
        if (first || r.offset < offset) setText(r.text);
        else if (r.text) setText((t) => (t + r.text).slice(-600_000));
        first = false;
        offset = r.offset;
        setJobs(r.jobs);
        setError(null);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [p.id, kind, jobId]);

  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; }, [text, follow]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <select className="input w-auto !py-1 text-[12.5px]" value={kind} onChange={(e) => setKind(e.target.value as "job" | "preview")} aria-label="Log source">
          <option value="job">Job log</option>
          <option value="preview">Preview server log</option>
        </select>
        {kind === "job" && jobs.length ? (
          <select className="input mono w-auto !py-1 text-[12px]" value={jobId ?? jobs[0].id} onChange={(e) => { pinned.current = e.target.value !== jobs[0].id; setJobId(e.target.value); }} aria-label="Job">
            {jobs.map((j, i) => <option key={j.id} value={j.id}>{i === 0 ? "latest · " : ""}{j.type} · {j.status} · {new Date(j.createdAt).toLocaleTimeString()}</option>)}
          </select>
        ) : null}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink3"><input type="checkbox" className="accent-[var(--accent)]" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow</label>
        <CopyText text={text} label="Copy log" />
      </div>
      {error ? <div className="p-3"><Notice tone="bad">{error}</Notice></div> : null}
      <pre ref={box} tabIndex={0} aria-label="Log output" className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-raised px-3 py-3 text-[11.5px] leading-[18px] text-ink2">
        {text ? text.split("\n").map((l, i) => <div key={i} className={/ ERROR /.test(l) ? "text-bad" : / WARN /.test(l) ? "text-warn" : /[✔✓]/.test(l) ? "text-ink" : undefined}>{l || " "}</div>) : <span className="text-ink3">{kind === "preview" ? "The preview server has not written anything yet." : "No log output yet."}</span>}
      </pre>
    </div>
  );
}

/* --------------------------------------------------------------- analysis */
function H({ children, count }: { children: React.ReactNode; count?: number }) {
  return <h3 className="label mb-2 mt-6 flex items-center gap-2 first:mt-0">{children}{count !== undefined ? <span className="rounded bg-panel2 px-1.5 text-ink2">{count}</span> : null}</h3>;
}
function Analysis({ p }: { p: Project }) {
  const { data, loading, error } = useLive<Details>(`/api/projects/${p.id}/analysis`, jobActive(p.job) ? 4000 : 0);
  const [shot, setShot] = useState<string | null>(null);
  if (loading) return <Skeleton rows={6} />;
  if (error) return <div className="p-4"><Notice tone="bad">{error}</Notice></div>;
  const a = data?.analysis, plan = data?.plan, gen = data?.generation, v = p.verification;
  if (!a) return <Empty icon="globe" title="No analysis yet" text="Results appear here when the discovery steps have finished." />;
  const colors = (Array.isArray((a.design as { colors?: unknown }).colors) ? (a.design as { colors: unknown[] }).colors : []).map((c) => (typeof c === "string" ? c : (c as { value?: string; color?: string }).value ?? (c as { color?: string }).color ?? "")).filter(Boolean).slice(0, 14);
  const fonts = (Array.isArray((a.design as { fonts?: unknown }).fonts) ? (a.design as { fonts: unknown[] }).fonts : []).map((f) => (typeof f === "string" ? f : (f as { family?: string; value?: string }).family ?? (f as { value?: string }).value ?? "")).filter(Boolean).slice(0, 8);
  return (
    <div className="h-full overflow-y-auto p-4">
      <H>Discovery</H>
      <p className="mono text-[11.5px] text-ink3">analysed {fmtDate(a.analysedAt)} · {a.browser.source} {a.browser.version} · sign-in {a.login.used ? (a.login.succeeded ? `succeeded via ${a.login.loginRoute}` : "failed") : "not used"} · {a.assets.downloaded} assets ({fmtBytes(a.assets.bytes)}){a.blockedRequests ? ` · ${a.blockedRequests} requests blocked by network policy` : ""}</p>
      {a.notes.length ? <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink2">{a.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}

      <H count={a.routes.length}>Route map</H>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="tbl">
          <thead><tr><th>Route</th><th>State</th><th>Title</th><th>Found via</th><th>Screenshots</th>{v ? <th className="text-right">Visual diff</th> : null}</tr></thead>
          <tbody>
            {a.routes.map((r) => {
              const page = a.pages.find((x) => x.route === r.route);
              const ver = v?.routes.find((x) => x.route === r.route);
              return (
                <tr key={r.route}>
                  <td className="mono text-[12px] text-ink">{r.route}{page?.protected ? <span className="ml-1.5 text-warn" title="Requires sign-in"><Icon name="lock" size={11} className="inline" /></span> : null}</td>
                  <td>{r.state === "cloned" ? <span className="badge" data-tone="ok"><i />cloned</span> : <span className="badge" title={r.reason}><i />skipped</span>}{r.reason ? <span className="mt-0.5 block text-[11px] text-ink3">{r.reason}</span> : null}</td>
                  <td className="max-w-[200px] truncate text-[12.5px]">{page?.title ?? "—"}</td>
                  <td className="mono text-[11.5px] text-ink3">{page?.source ?? "—"}</td>
                  <td>
                    <div className="flex gap-1">
                      {page ? Object.entries(page.screenshots).map(([dev, name]) => <button key={dev} className="btn btn-sm !px-1.5" title={`${dev} screenshot`} aria-label={`${dev} screenshot of ${r.route}`} onClick={() => setShot(name)}><Icon name={dev} size={12} /></button>) : "—"}
                    </div>
                  </td>
                  {v ? <td className="mono text-right text-[12px]">{ver?.mismatch != null ? `${ver.mismatch}%` : ver?.note ?? "—"}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <H>Design tokens</H>
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c) => <span key={c} title={c} className="h-7 w-7 rounded-md border border-line" style={{ background: c }} />)}
        {!colors.length ? <span className="text-[12.5px] text-ink3">No colour summary recorded.</span> : null}
      </div>
      {fonts.length ? <p className="mono mt-2 text-[12px] text-ink2">{fonts.join(" · ")}</p> : null}

      <H count={a.forms.length}>Forms</H>
      {a.forms.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {a.forms.map((f) => (
            <li key={f.id} className="rounded-lg border border-line p-3">
              <p className="text-[13px] font-medium text-ink">{f.kind} <span className="mono text-[11px] font-normal text-ink3">{f.method.toUpperCase()} {f.actionPath}</span></p>
              <p className="mono mt-1 text-[11.5px] text-ink3">{f.fields.filter((x) => !x.hidden).map((x) => `${x.name}${x.required ? "*" : ""}:${x.type}`).join("  ")}</p>
              <p className="mt-1 text-[11.5px] text-ink3">on {f.routes.slice(0, 4).join(", ")}{f.routes.length > 4 ? ` +${f.routes.length - 4}` : ""}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-ink3">No forms found.</p>}

      <H count={a.interactions.length}>Interactive states</H>
      {a.interactions.length ? (
        <ul className="grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
          {a.interactions.map((x, i) => <li key={i} className="flex items-baseline gap-2"><span className={x.replayable ? "text-ok" : "text-warn"}>{x.replayable ? "●" : "○"}</span><span className="truncate text-ink2">{x.label || x.kind}</span><span className="mono ml-auto flex-none text-[11px] text-ink3">{x.kind} · {x.viewport} · {x.route}</span></li>)}
        </ul>
      ) : <p className="text-[12.5px] text-ink3">No toggles, tabs or dialogs were recorded.</p>}
      {a.interactions.some((x) => !x.replayable) ? <p className="mt-1.5 text-[11.5px] text-ink3">○ = seen but not reproducible without the original scripts.</p> : null}

      <H count={a.api.length}>Observed API calls</H>
      {a.api.length ? (
        <ul className="mono space-y-1 text-[11.5px] text-ink2">{a.api.slice(0, 40).map((x, i) => <li key={i} className="truncate"><span className="text-ink">{x.method}</span> {x.url} <span className="text-ink3">→ {x.status} · from {x.route}</span></li>)}</ul>
      ) : <p className="text-[12.5px] text-ink3">No XHR/fetch calls were observed while browsing.</p>}

      {plan ? (
        <>
          <H>Architecture plan</H>
          <div className="rounded-lg border border-line p-3.5">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="badge" data-tone={plan.source === "ai" ? "info" : ""}><Icon name={plan.source === "ai" ? "spark" : "gear"} size={10} />{plan.source === "ai" ? `AI · ${plan.provider?.label ?? ""} ${plan.provider?.model ?? ""}` : "Built-in planner (no AI call)"}</span>
              <span className="mono text-ink3">{plan.siteCategory}</span>
            </p>
            <p className="text-[13px] leading-relaxed text-ink2">{plan.summary}</p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
              <div><dt className="text-ink3">Frontend recommendation</dt><dd className="text-ink">{plan.frontend.framework}</dd><dd className="text-[11.5px] text-ink3">{plan.frontend.rationale}</dd></div>
              <div><dt className="text-ink3">Backend</dt><dd className="text-ink">{plan.backend.needed ? plan.backend.services.join(", ") || "needed" : "not needed"}</dd></div>
              <div><dt className="text-ink3">Database</dt><dd className="text-ink">{plan.database.needed ? plan.database.entities.join(", ") || "needed" : "not needed"}</dd></div>
              <div><dt className="text-ink3">Authentication</dt><dd className="text-ink">{plan.auth.needed ? plan.auth.strategy : "not needed"}</dd></div>
            </dl>
            {plan.risks.length ? <><p className="mt-3 text-[12px] text-ink3">Risks</p><ul className="list-disc pl-5 text-[12.5px] text-ink2">{plan.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></> : null}
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink3">The generator always emits a dependency-free multi-page project (HTML, CSS, a small runtime script and a Node server). The framework line above is the planner&apos;s recommendation for a future port, not what was generated.</p>
          </div>
        </>
      ) : null}

      {gen ? (
        <>
          <H>Generated project</H>
          <p className="mono text-[12px] text-ink2">{gen.files} files · {gen.pages} pages · shared components: {gen.components.join(", ") || "none"}</p>
          {gen.previewAccount ? <p className="mt-1.5 text-[12.5px] text-ink2">Preview sign-in for the clone&apos;s own auth: <span className="mono text-ink">{gen.previewAccount.identifier}</span> / <span className="mono text-ink">{gen.previewAccount.password}</span> <span className="text-ink3">(seeded demo account in the generated database, not the reference site&apos;s credentials)</span></p> : null}
        </>
      ) : null}

      {v ? (
        <>
          <H>Verification</H>
          <p className="mono text-[12px] text-ink2">{v.routesOk}/{v.routesTotal} routes served · tests {v.tests ? `${v.tests.passed} passed, ${v.tests.failed} failed` : "not run"} · visual diff avg {v.averageMismatch ?? "—"}% · worst {v.worstMismatch ?? "—"}%{v.worstRoute ? ` (${v.worstRoute})` : ""} · checked {ago(v.checkedAt)}</p>
        </>
      ) : null}

      {a.consoleErrors.length ? <><H count={a.consoleErrors.length}>Console errors on the reference site</H><ul className="mono space-y-0.5 text-[11.5px] text-ink3">{a.consoleErrors.slice(0, 12).map((c, i) => <li key={i} className="truncate">{c.route}: {c.message}</li>)}</ul></> : null}

      {shot ? (
        <div role="dialog" aria-modal="true" aria-label="Screenshot" className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4" onClick={() => setShot(null)}>
          <div className="mb-2 flex items-center justify-between text-white"><span className="mono text-xs">{shot}</span><button className="btn btn-sm" autoFocus onClick={() => setShot(null)} onKeyDown={(e) => e.key === "Escape" && setShot(null)}><Icon name="x" size={13} /> Close</button></div>
          <div className="min-h-0 flex-1 overflow-auto text-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/projects/${p.id}/screenshot?name=${encodeURIComponent(shot)}`} alt={`Reference screenshot ${shot}`} className="mx-auto max-w-full rounded" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- export */
function Export({ p }: { p: Project }) {
  const z = p.zip;
  if (!z || p.buildStatus !== "succeeded") return <Empty icon="download" title="No ZIP yet" text="The archive is created, verified and offered for download only after the project has built and passed its tests. A failed build removes the previous archive." />;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
        <div className="min-w-0">
          <p className="mono truncate text-sm text-ink">{z.name}</p>
          <p className="mono mt-1 text-[11.5px] text-ink3">{fmtBytes(z.bytes)} · {z.entries} files · created {fmtDate(z.createdAt)}</p>
          <p className="mono mt-1 break-all text-[11px] text-ink3">sha256 {z.sha256}</p>
        </div>
        <a className="btn btn-primary" href={`/api/projects/${p.id}/download`} download><Icon name="download" size={15} /> Download ZIP</a>
      </div>
      <H count={z.checks.length}>Verification before download</H>
      <ul className="space-y-1.5">
        {z.checks.map((c) => <li key={c.name} className="flex items-start gap-2 text-[13px]"><span className={c.ok ? "mt-0.5 text-ok" : "mt-0.5 text-bad"}><Icon name={c.ok ? "check" : "x"} size={14} /></span><span><span className="text-ink">{c.name}</span> <span className="text-ink3">{c.detail}</span></span></li>)}
      </ul>
      {z.warnings.length ? <><H>Warnings</H><ul className="list-disc space-y-1 pl-5 text-[13px] text-warn">{z.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></> : null}
      <H count={z.external.length}>Needs configuration outside the ZIP</H>
      {z.external.length ? <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink2">{z.external.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="text-[13px] text-ink3">Nothing: the project runs as downloaded.</p>}
      <H>Run it</H>
      <pre className="mono overflow-x-auto rounded-lg border border-line bg-raised p-3 text-[12px] leading-relaxed text-ink2">{`unzip ${z.name}\ncd ${z.name.replace(/\.zip$/, "")}\ncp .env.example .env   # optional\nnpm run build\nnpm test\nnpm start              # needs Node.js 22.5+`}</pre>
      <p className="mt-2 text-[12px] text-ink3">The archive never contains API keys, the test-account password, cookies or browser storage state.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- preview */
function Preview({ p, onChange }: { p: Project; onChange: () => void }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const [full, setFull] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const running = jobActive(p.job);
  const builtAt = p.verification?.checkedAt ?? "";
  const url = p.preview.url;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, url]);
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [full]);

  const d = DEVICES[device];
  const pad = 24;
  const scale = device === "desktop" ? Math.min(1, box.w / d.w || 1) : Math.min(1, (box.w - pad) / d.w, (box.h - pad) / d.h) || 1;
  const frameW = device === "desktop" ? Math.max(box.w / scale, 320) : d.w;
  const frameH = device === "desktop" ? box.h / scale : d.h;
  const act = (action: string) => async () => { await call(`/api/projects/${p.id}/actions`, { body: { action } }); onChange(); };

  return (
    <div className={full ? "studio fixed inset-0 z-50 flex flex-col bg-bg" : "flex h-full min-h-0 flex-col"}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <div role="radiogroup" aria-label="Device size" className="flex rounded-lg border border-line p-0.5">
          {(Object.keys(DEVICES) as Device[]).map((k) => (
            <button key={k} role="radio" aria-checked={device === k} title={`${DEVICES[k].label} · ${DEVICES[k].w}px`} aria-label={DEVICES[k].label} onClick={() => setDevice(k)} className={`rounded-md px-2 py-1 ${device === k ? "bg-panel2 text-ink" : "text-ink3 hover:text-ink"}`}><Icon name={k} size={14} /></button>
          ))}
        </div>
        <span className="mono text-[11px] text-ink3">{d.w}×{d.h}{scale < 0.995 ? ` · ${Math.round(scale * 100)}%` : ""}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button className="btn btn-sm btn-icon" disabled={!url} onClick={() => setNonce((n) => n + 1)} title="Refresh preview" aria-label="Refresh preview"><Icon name="refresh" size={13} /></button>
          <button className="btn btn-sm btn-icon" disabled={!url} onClick={() => setFull((f) => !f)} title={full ? "Exit fullscreen (Esc)" : "Fullscreen"} aria-label={full ? "Exit fullscreen" : "Fullscreen"}><Icon name={full ? "x" : "expand"} size={13} /></button>
          {url ? <a className="btn btn-sm btn-icon" href={url} target="_blank" rel="noopener noreferrer" title="Open in new tab" aria-label="Open preview in new tab"><Icon name="external" size={13} /></a> : <button className="btn btn-sm btn-icon" disabled aria-label="Open preview in new tab"><Icon name="external" size={13} /></button>}
          {url ? <CopyText text={url} label="Copy URL" /> : <button className="btn btn-sm" disabled><Icon name="copy" size={13} /> Copy URL</button>}
          <ActionButton className="btn btn-sm" disabled={running || p.pagesCloned === 0} onAct={act("rebuild")} title="Install, build, test and serve again"><Icon name="hammer" size={13} /> Rebuild</ActionButton>
          {p.zip && p.buildStatus === "succeeded" ? <a className="btn btn-sm" href={`/api/projects/${p.id}/download`} download><Icon name="download" size={13} /> ZIP</a> : <button className="btn btn-sm" disabled title="Available after a successful build"><Icon name="download" size={13} /> ZIP</button>}
        </div>
      </div>
      {url ? <p className="mono truncate border-b border-line bg-raised px-3 py-1 text-[11px] text-ink3" title={url}><span className="text-ok">●</span> {url}</p> : null}
      <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden bg-panel2">
        {url ? (
          <div className="absolute inset-0 grid place-items-center overflow-hidden">
            <div style={{ width: frameW * scale, height: frameH * scale }} className="device-frame relative">
              <iframe
                key={`${url}-${nonce}-${builtAt}`} src={url} title={`Live preview of ${p.name}`}
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                style={{ width: frameW, height: frameH, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                className={`absolute left-0 top-0 border-0 bg-white ${device === "desktop" ? "" : "rounded-[14px] shadow-[0_0_0_8px_var(--bg-raised),0_0_0_9px_var(--line-strong)]"}`}
              />
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6">
            {running ? (
              <div className="max-w-xs text-center">
                <span className="spin mx-auto" style={{ width: 22, height: 22 }} />
                <p className="mt-3 text-sm font-medium text-ink">{p.job?.steps.find((s) => s.status === "running")?.label ?? "Waiting in the queue"}</p>
                <p className="mt-1 text-[12.5px] text-ink3">The preview address is issued after the build, tests and preview server have all succeeded.</p>
              </div>
            ) : p.buildStatus === "failed" || p.status === "failed" ? (
              <div className="max-w-md">
                <Notice tone="bad" title={p.buildStatus === "failed" ? "Build failed: no preview" : "Run failed: no preview"}>
                  <p className="mono mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11.5px]">{p.error ?? p.job?.error ?? "See the build log."}</p>
                </Notice>
                <p className="mt-3 text-[12.5px] text-ink3">Open “Build logs” for the full output, fix the file in the editor, then rebuild.</p>
              </div>
            ) : p.preview.available ? (
              <div className="text-center">
                <p className="text-sm font-medium text-ink">Preview server is stopped</p>
                <p className="mt-1 text-[12.5px] text-ink3">Idle previews stop automatically. The last successful build is still on disk.</p>
                <ActionButton className="btn btn-primary mt-4" onAct={act("preview-start")}><Icon name="play" size={13} /> Start preview</ActionButton>
              </div>
            ) : (
              <Empty icon="eye" title="No preview yet" text="This project has not been built successfully. Start or resume the clone job to generate, build and serve it." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sign-in */
function PasswordPrompt({ p, onDone }: { p: Project; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  if (!p.auth.required || p.auth.passwordStored) return null;
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-line bg-raised px-4 py-2 text-[12.5px] text-ink2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ busy: true });
        try {
          await call(`/api/projects/${p.id}`, { method: "PATCH", body: { password: pw } });
          setPw("");
          setState({});
          onDone();
        } catch (err) {
          setState({ error: (err as Error).message });
        }
      }}
    >
      <Icon name="lock" size={13} />
      <span>The test-account password for <span className="mono text-ink">{p.auth.username}</span> was erased after discovery. Re-enter it only if you want to analyse the site again:</span>
      <input className="input !py-1 text-[12.5px]" style={{ width: 176 }} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Test-account password" required />
      <button className="btn btn-sm" disabled={state.busy}>Store for next run</button>
      {state.error ? <span className="text-bad">{state.error}</span> : null}
    </form>
  );
}

/* -------------------------------------------------------------- workspace */
export default function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useLive<{ project: Project }>(`/api/projects/${id}`, (d) => (jobActive(d?.project.job) ? 1200 : 5000));
  const p = data?.project;
  // Nothing below is rendered until the project has loaded on the client, so reading the URL here cannot mismatch.
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(location.search).get("tab");
    return TABS.some((x) => x[0] === t) ? (t as Tab) : "code";
  });
  const [initialJob] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(location.search).get("job")));
  const [picked, setFile] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["src", "src/pages"]));
  const [pane, setPane] = useState<"files" | "main" | "preview">("main");
  const [stepsPref, setShowSteps] = useState<boolean | null>(null);
  const filesKey = `${p?.job?.id ?? ""}:${p?.job?.progress.completed ?? 0}:${p?.status ?? ""}`;
  const files = useLive<{ files: Node[]; generated: boolean }>(p ? `/api/projects/${id}/files?k=${encodeURIComponent(filesKey)}` : null);

  // Until a file is picked, show the home page source once files exist.
  const file = useMemo(() => {
    if (picked || !files.data?.generated) return picked;
    const pages = files.data.files.find((n) => n.name === "src")?.children?.find((n) => n.name === "pages")?.children;
    return (pages?.find((n) => n.name === "index.html") ?? pages?.find((n) => !n.dir))?.path ?? null;
  }, [picked, files.data]);
  const pickTab = (t: Tab) => {
    setTab(t);
    setPane("main");
    const u = new URL(location.href);
    u.searchParams.set("tab", t);
    history.replaceState(null, "", u);
  };

  if (loading) return <div className="p-8"><Skeleton rows={6} /></div>;
  if (!p) return (
    <div className="mx-auto max-w-lg p-8">
      <Notice tone="bad" title="Project not available">{error ?? "This project does not exist."}</Notice>
      <Link href="/studio/projects" className="btn mt-4">Back to projects</Link>
    </div>
  );
  const running = jobActive(p.job);
  // The step list is open while a job runs or has failed; otherwise it stays out of the way unless opened.
  const showSteps = stepsPref ?? (running || p.status === "failed" || !p.job);
  const restart = async () => { await call(`/api/projects/${p.id}/actions`, { body: { action: "restart" } }); await reload(); };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[560px] flex-col bg-bg">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href="/studio/projects" className="text-ink3 hover:text-ink" aria-label="Back to projects"><Icon name="chevron" size={14} className="rotate-180" /></Link>
            <h1 className="truncate text-[15px] font-semibold text-ink">{p.name}</h1>
            <Status value={p.status} />
          </div>
          <p className="mono truncate pl-[22px] text-[11.5px] text-ink3">{p.targetUrl} · {p.routesDiscovered} routes · {p.pagesCloned} pages · build {p.buildStatus}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProjectActions p={p} onChange={reload} compact onDeleted={() => router.push("/studio/projects")} />
          {!running ? <ActionButton className="btn btn-sm" onAct={restart} confirm="Run the whole clone again from discovery? Generated source and manual edits are replaced." title="Re-analyse the website and regenerate everything"><Icon name="refresh" size={13} /> Re-clone</ActionButton> : null}
        </div>
      </div>
      {error ? <div className="px-4 pt-2"><Notice tone="warn">Connection problem: {error}. Retrying…</Notice></div> : null}
      {p.status === "failed" && p.error && !running ? <div className="border-b border-line px-4 py-2"><p role="alert" className="line-clamp-3 text-[12.5px] text-bad"><strong>Failed:</strong> {p.error}</p></div> : null}
      <PasswordPrompt p={p} onDone={reload} />

      {/* mobile pane switch */}
      <div className="flex border-b border-line lg:hidden" role="tablist" aria-label="Workspace panes">
        {(["files", "main", "preview"] as const).map((k) => <button key={k} role="tab" aria-selected={pane === k} className="tab flex-1 capitalize" onClick={() => setPane(k)}>{k === "main" ? "Workspace" : k}</button>)}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[232px_minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* explorer */}
        <aside className={`min-h-0 flex-col border-r border-line ${pane === "files" ? "flex" : "hidden"} lg:flex`} aria-label="File explorer">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="label">Explorer</span>
            <button className="text-ink3 hover:text-ink" onClick={() => void files.reload()} aria-label="Reload file list" title="Reload"><Icon name="refresh" size={12} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
            {files.loading ? <Skeleton /> : !files.data?.generated || !files.data.files.length ? (
              <p className="px-3 py-6 text-[12.5px] leading-relaxed text-ink3">{running ? "Source files appear here when the “Generating source code” step completes." : "No source has been generated yet."}</p>
            ) : (
              <Tree nodes={files.data.files} open={open} active={file} toggle={(x) => setOpen((s) => { const n = new Set(s); if (n.has(x)) n.delete(x); else n.add(x); return n; })} onPick={(x) => { setFile(x); pickTab("code"); }} />
            )}
          </div>
        </aside>

        {/* main */}
        <section className={`min-h-0 min-w-0 flex-col border-r border-line ${pane === "main" ? "flex" : "hidden"} lg:flex`}>
          <div className="border-b border-line">
            <button className="flex w-full items-center gap-2 px-4 py-2 text-left" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
              <Icon name="chevron" size={12} className={`text-ink3 transition-transform ${showSteps ? "rotate-90" : ""}`} />
              <span className="label">Pipeline</span>
              {p.job ? <span className="mono text-[11px] text-ink2">{p.job.progress.completed}/{p.job.progress.total}{running ? ` · ${p.job.steps.find((s) => s.status === "running")?.label ?? "queued"}` : ` · ${p.job.status}`}</span> : null}
              {p.job ? <span className="ml-auto w-24"><ProgressBar job={p.job} /></span> : null}
            </button>
            {showSteps ? <div className="max-h-[38vh] overflow-y-auto border-t border-line"><Steps p={p} /></div> : null}
          </div>
          <div className="flex overflow-x-auto border-b border-line px-2" role="tablist" aria-label="Workspace views">
            {TABS.map(([k, label, icon]) => <button key={k} role="tab" aria-selected={tab === k} className="tab flex items-center gap-1.5" onClick={() => pickTab(k)}><Icon name={icon} size={13} />{label}</button>)}
          </div>
          <div className="min-h-0 flex-1" role="tabpanel">
            {tab === "code" ? <Editor key={file ?? "none"} p={p} path={file} onSaved={() => { void reload(); void files.reload(); }} busyJob={running} /> : null}
            {tab === "logs" ? <Logs p={p} initialJob={initialJob} /> : null}
            {tab === "analysis" ? <Analysis p={p} /> : null}
            {tab === "export" ? <Export p={p} /> : null}
          </div>
        </section>

        {/* preview */}
        <section className={`min-h-0 min-w-0 ${pane === "preview" ? "block" : "hidden"} lg:block`} aria-label="Live preview">
          <Preview p={p} onChange={reload} />
        </section>
      </div>
    </div>
  );
}
