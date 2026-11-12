"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* ---------- data ---------- */
export async function call<T = Record<string, unknown>>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  // Session expired: a full reload on purpose so the server decides what to render.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Request failed (HTTP ${res.status})`);
  return data as T;
}

/** Fetch JSON and keep it fresh. `interval` may depend on the latest data (e.g. poll faster while a job runs). */
export function useLive<T>(url: string | null, interval: number | ((d: T | null) => number) = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef<T | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const d = await call<T>(url);
      latest.current = d;
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await reload();
      if (stop) return;
      const ms = typeof interval === "function" ? interval(latest.current) : interval;
      if (ms > 0) timer = setTimeout(loop, document.hidden ? Math.max(ms, 5000) : ms);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/* ---------- formatting ---------- */
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export function ago(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export function duration(a?: string | Date | null, b?: string | Date | null): string {
  if (!a) return "—";
  const s = Math.max(0, Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/* ---------- icons (24px stroke) ---------- */
const P: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  plus: "M12 5v14M5 12h14",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  spark: "M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  key: "M15 7a4 4 0 1 1-3.9 5H8v3H5v3H2v-3l7.1-7.1A4 4 0 0 1 15 7zM16.5 8.5h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  menu: "M3 6h18M3 12h18M3 18h18",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5",
  play: "M6 4l14 8-14 8z",
  stop: "M6 6h12v12H6z",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
  chevron: "M9 6l6 6-6 6",
  desktop: "M3 4h18v12H3zM8 20h8M12 16v4",
  tablet: "M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  mobile: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shield: "M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  hammer: "M14 6l4 4M3 21l9-9M12.5 3.5l8 8-2.5 2.5-8-8z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  logout: "M9 4H5v16h4M15 8l4 4-4 4M19 12H9",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
};
export function Icon({ name, size = 16, className = "" }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`} aria-hidden="true">
      <path d={P[name] ?? P.file} />
    </svg>
  );
}

/* ---------- status ---------- */
const STATUS: Record<string, [string, string]> = {
  pending: ["Pending", ""], analyzing: ["Analyzing", "run"], discovery_complete: ["Discovery complete", "info"], generating: ["Generating", "run"],
  building: ["Building", "run"], ready: ["Ready", "ok"], failed: ["Failed", "bad"],
  queued: ["Queued", "info"], running: ["Running", "run"], succeeded: ["Succeeded", "ok"], cancelled: ["Cancelled", "warn"],
  none: ["Not built", ""], connected: ["Connected", "ok"], untested: ["Not tested", "warn"], needs_model: ["Key valid · choose model", "info"],
  done: ["Done", "ok"], skipped: ["Skipped", ""],
};
export function Status({ value }: { value: string }) {
  const [label, tone] = STATUS[value] ?? [value, ""];
  return (
    <span className="badge" data-tone={tone}>
      <i />
      {label}
    </span>
  );
}

/* ---------- primitives ---------- */
export function PageHead({ title, sub, actions, eyebrow }: { title: string; sub?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="label mb-1.5">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {sub ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink2">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({ title, hint, children, actions, className = "" }: { title?: string; hint?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {hint ? <p className="mt-0.5 text-[13px] text-ink3">{hint}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs leading-relaxed text-ink3">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="switch" onClick={() => onChange(!checked)} />;
}

export function ToggleRow({ title, desc, checked, onChange, disabled, note }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-[13px] leading-relaxed text-ink3">{desc}</p>
        {note ? <p className="mono mt-1 text-[11px] text-warn">{note}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export function Empty({ icon = "folder", title, text, action }: { icon?: string; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-line bg-raised text-ink3">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink3">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "bad" | "warn" | "ok"; children: ReactNode; title?: string }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : tone === "ok" ? "var(--ok)" : "var(--info)";
  return (
    <div role={tone === "bad" ? "alert" : "status"} className="flex gap-3 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed" style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
      <span style={{ color }} className="mt-0.5">
        <Icon name={tone === "ok" ? "check" : tone === "info" ? "shield" : "alert"} size={15} />
      </span>
      <div className="min-w-0 text-ink2">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-panel2" style={{ width: `${90 - i * 14}%` }} />
      ))}
    </div>
  );
}

/** Button that runs an async action, shows a spinner and surfaces the error. */
export function ActionButton({ onAct, children, className = "btn", confirm: confirmText, disabled, title, onError }: { onAct: () => Promise<unknown>; children: ReactNode; className?: string; confirm?: string; disabled?: boolean; title?: string; onError?: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button" className={className} disabled={disabled || busy} title={title}
      onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true);
        try {
          await onAct();
        } catch (e) {
          if (onError) onError((e as Error).message);
          else window.alert((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spin" /> : null}
      {children}
    </button>
  );
}

export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button" className="btn btn-sm" title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      <Icon name={ok ? "check" : "copy"} size={13} />
      {ok ? "Copied" : label}
    </button>
  );
}

/* ---------- shared types ---------- */
export type Step = { key: string; label: string; stage: string; status: string; detail?: string; startedAt?: string; finishedAt?: string };
export type Job = { id: string; projectId: string; type: string; status: string; fromStage: string; attempt: number; error: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; steps: Step[]; progress: { completed: number; total: number; current: string | null }; projectName?: string };
export type Project = {
  id: string; name: string; description: string; targetUrl: string; status: string; buildStatus: string;
  options: { scope: string; selectedPaths: string[]; maxPages: number; devices: { desktop: boolean; tablet: boolean; mobile: boolean }; backend: boolean; database: boolean; authentication: boolean; animations: boolean; responsive: boolean; useAi: boolean };
  auth: { required: boolean; loginUrl: string; username: string; notes: string; passwordStored: boolean };
  providerId: string | null; routesDiscovered: number; pagesCloned: number; error: string | null; mismatchPercent: number | null;
  verification: { checkedAt: string; routesOk: number; routesTotal: number; averageMismatch: number | null; worstMismatch: number | null; worstRoute: string | null; gateway: string; tests: { passed: number; failed: number } | null; routes: { route: string; status: number; mismatch: number | null; note?: string }[] } | null;
  createdAt: string; updatedAt: string;
  preview: { available: boolean; running: boolean; url: string | null; mode: string | null; startedAt?: string; expiresAt?: string };
  zip: { name: string; bytes: number; sha256: string; entries: number; createdAt: string; checks: { name: string; ok: boolean; detail: string }[]; warnings: string[]; external: string[] } | null;
  job: Job | null;
};
export type Provider = { id: string; kind: string; kindName: string; label: string; endpoint: string; model: string; models: string[]; hasKey: boolean; keyHint: string; isDefault: boolean; status: string; lastTestedAt: string | null; lastError: string | null; usage: { requests?: number; inputTokens?: number; outputTokens?: number; errors?: number; lastUsedAt?: string }; updatedAt: string };
export const jobActive = (j: Job | null | undefined) => !!j && (j.status === "running" || j.status === "queued");

/** Step-based progress bar. Width comes from completed step count, never from a timer. */
export function ProgressBar({ job }: { job: Job }) {
  const pct = Math.round((job.progress.completed / job.progress.total) * 100);
  const tone = job.status === "failed" ? "var(--bad)" : job.status === "cancelled" ? "var(--warn)" : "var(--accent)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuemin={0} aria-valuemax={job.progress.total} aria-valuenow={job.progress.completed} aria-label={`${job.progress.completed} of ${job.progress.total} steps complete`}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}
