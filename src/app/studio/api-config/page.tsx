"use client";

import Link from "next/link";
import { SettingsForm, type FieldDef } from "@/components/studio/SettingsForm";
import { ActionButton, ago, call, Icon, Notice, PageHead, Section, Skeleton, Status, useLive, type Provider } from "@/components/studio/ui";

type S = { settings: Record<string, number | boolean>; defaults: Record<string, number | boolean>; system: { secretSource: string; localAiAllowed: boolean } };
const FIELDS: FieldDef[] = [
  { key: "aiTemperature", label: "Temperature", hint: "0–1. Lower is more deterministic.", step: 0.05, min: 0, max: 1 },
  { key: "aiMaxTokens", label: "Max output tokens", hint: "500–32000 per request.", min: 500, max: 32000 },
  { key: "aiTimeoutSec", label: "Request timeout (seconds)", hint: "10–600.", min: 10, max: 600 },
];

export default function ApiConfigPage() {
  const s = useLive<S>("/api/settings");
  const p = useLive<{ providers: Provider[] }>("/api/providers");
  const list = p.data?.providers ?? [];
  const def = list.find((x) => x.isDefault && x.status === "connected");
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <PageHead eyebrow="API configuration" title="How the studio calls AI APIs" sub="Request parameters, the default connection, key storage and measured usage. Keys themselves are managed under AI Providers." actions={<Link className="btn" href="/studio/providers"><Icon name="spark" size={14} /> Manage providers</Link>} />
      {s.error || p.error ? <div className="mb-4"><Notice tone="bad">{s.error || p.error}</Notice></div> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Default connection" hint="Used for new projects and AI file edits unless a project picks another.">
          {p.loading ? <Skeleton /> : !list.length ? (
            <div className="p-5"><Notice tone="warn" title="Nothing configured">Add a provider and run its connection test. Until then the studio uses the built-in planner and makes no AI calls.</Notice></div>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{x.label}</p>
                    <p className="mono truncate text-[11.5px] text-ink3">{x.model || "no model"} · {x.keyHint || "no key"}</p>
                  </div>
                  <Status value={x.status} />
                  {x.isDefault && x.status === "connected" ? <span className="badge" data-tone="info">Default</span> : (
                    <ActionButton className="btn btn-sm" disabled={x.status !== "connected"} title={x.status !== "connected" ? "Test the connection first" : ""} onAct={async () => { await call(`/api/providers/${x.id}/default`, { method: "POST", body: {} }); await p.reload(); }}>Make default</ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {list.length && !def ? <div className="px-5 pb-5 pt-2"><Notice tone="warn">No connected default. AI planning is unavailable until a provider passes its test.</Notice></div> : null}
        </Section>

        <Section title="Request parameters" hint="Applied to every planning and edit request.">
          {s.data ? <SettingsForm fields={FIELDS} values={s.data.settings} defaults={s.data.defaults} onSaved={s.reload} /> : <Skeleton />}
        </Section>

        <Section title="Usage" hint="Counted on the server from provider responses." className="lg:col-span-2">
          {p.loading ? <Skeleton /> : !list.length ? <p className="px-5 py-8 text-center text-[13px] text-ink3">No providers, no usage.</p> : (
            <div className="overflow-x-auto">
              <table className="tbl w-full">
                <thead><tr><th>Provider</th><th>Model</th><th className="text-right">Requests</th><th className="text-right">Input tokens</th><th className="text-right">Output tokens</th><th className="text-right">Errors</th><th>Last used</th><th>Last error</th></tr></thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id}>
                      <td className="font-medium text-ink">{x.label}</td>
                      <td className="mono text-xs">{x.model || "—"}</td>
                      <td className="mono text-right">{x.usage.requests ?? 0}</td>
                      <td className="mono text-right">{x.usage.inputTokens ?? 0}</td>
                      <td className="mono text-right">{x.usage.outputTokens ?? 0}</td>
                      <td className="mono text-right">{x.usage.errors ?? 0}</td>
                      <td className="mono text-xs">{x.usage.lastUsedAt ? ago(x.usage.lastUsedAt) : "never"}</td>
                      <td className="max-w-[260px] truncate text-xs text-bad" title={x.lastError ?? ""}>{x.status === "failed" ? x.lastError : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Key handling" className="lg:col-span-2">
          <ul className="grid gap-x-8 gap-y-3 p-5 text-[13px] leading-relaxed text-ink2 sm:grid-cols-2">
            <li><strong className="text-ink">Encrypted at rest.</strong> AES-256-GCM. Encryption key source: <span className="mono text-xs">{s.data?.system.secretSource ?? "…"}</span>.</li>
            <li><strong className="text-ink">Never returned.</strong> The API only ever sends a masked hint such as <span className="mono text-xs">••••••••1a2b</span> to the browser.</li>
            <li><strong className="text-ink">Server-side calls only.</strong> The browser never talks to a provider, and keys never appear in URLs or logs.</li>
            <li><strong className="text-ink">Never sent to the target site,</strong> and never written into generated projects or ZIP exports. Each export is scanned for stored secrets before download.</li>
            <li><strong className="text-ink">What providers receive.</strong> A structural summary of the analysed site (routes, headings, form fields, design tokens). No credentials, cookies or storage state.</li>
            <li><strong className="text-ink">Endpoint safety.</strong> Custom endpoints must be public addresses{s.data?.system.localAiAllowed ? " (local addresses are currently allowed by STUDIO_ALLOW_LOCAL_AI)" : ""}.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
