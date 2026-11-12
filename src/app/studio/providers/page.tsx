"use client";

import { useState } from "react";
import { ActionButton, ago, call, Empty, Field, Icon, Notice, PageHead, Section, Skeleton, Status, useLive, type Provider } from "@/components/studio/ui";

type Kind = { id: string; name: string; endpoint: string; endpointEditable: boolean; discovery: boolean; keyUrl: string };
type Data = { providers: Provider[]; kinds: Kind[]; localEndpointsAllowed: boolean };

function ProviderForm({ kinds, existing, onDone, onCancel }: { kinds: Kind[]; existing?: Provider; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState(existing?.kind ?? kinds[0].id);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(existing?.model ?? "");
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? "");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [error, setError] = useState<string | null>(null);
  const meta = kinds.find((k) => k.id === kind)!;
  const models = existing?.models ?? [];

  async function save(thenTest: boolean) {
    setBusy(thenTest ? "test" : "save");
    setError(null);
    try {
      const payload = { kind, label, model, endpoint: meta.endpointEditable ? endpoint : undefined, apiKey: apiKey || undefined };
      const { provider } = existing ? await call<{ provider: Provider }>(`/api/providers/${existing.id}`, { method: "PATCH", body: payload }) : await call<{ provider: Provider }>("/api/providers", { body: payload });
      if (thenTest) await call(`/api/providers/${provider.id}/test`, { method: "POST", body: {} });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <form className="fade-in space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
      {!existing ? (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink">Provider</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Provider">
            {kinds.map((k) => (
              <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={`rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${kind === k.id ? "border-accent bg-accentsoft text-ink" : "border-line text-ink2 hover:border-line2"}`}>{k.name}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" hint="How this connection is shown in the studio."><input className="input" value={label} maxLength={80} placeholder={meta.name} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label="API key" hint={existing?.hasKey ? `Stored key ${existing.keyHint}. Leave empty to keep it.` : meta.keyUrl ? <>Create one at <a className="underline" href={meta.keyUrl} target="_blank" rel="noopener noreferrer">{new URL(meta.keyUrl).host}</a>.</> : "Optional for endpoints that need no key."}>
          <input className="input mono" type="password" autoComplete="off" spellCheck={false} value={apiKey} placeholder={existing?.hasKey ? existing.keyHint : "paste key"} onChange={(e) => setApiKey(e.target.value)} />
        </Field>
        <Field label="API endpoint" hint={meta.endpointEditable ? "Base URL of an OpenAI-compatible API, ending in /v1 where applicable." : "Fixed for this provider."}>
          <input className="input mono" value={meta.endpointEditable ? endpoint : meta.endpoint} disabled={!meta.endpointEditable} required={meta.endpointEditable} placeholder="https://api.example.com/v1" onChange={(e) => setEndpoint(e.target.value)} />
        </Field>
        <Field label="Model" hint={models.length ? `${models.length} models discovered from the provider.` : "Save and test the key first to discover models, or type a model id."}>
          <input className="input mono" list={`models-${existing?.id ?? "new"}`} value={model} placeholder={models.length ? "choose or type" : "model id"} onChange={(e) => setModel(e.target.value)} />
          <datalist id={`models-${existing?.id ?? "new"}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={!!busy}>{busy === "save" ? <span className="spin" /> : null}Save</button>
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void save(true)}>{busy === "test" ? <span className="spin" /> : <Icon name="check" size={14} />}Save &amp; Test Connection</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ProvidersPage() {
  const { data, error, loading, reload } = useLive<Data>("/api/providers");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const list = data?.providers ?? [];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <PageHead
        eyebrow="AI providers" title="Model connections"
        sub="Keys are encrypted on the server (AES-256-GCM), shown only as a masked hint, and used only for server-side calls. A provider counts as connected only after a real test request succeeds."
        actions={!adding && data ? <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} /> Add provider</button> : null}
      />
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      {adding && data ? (
        <Section title="Add a provider" className="mb-5"><ProviderForm kinds={data.kinds} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} /></Section>
      ) : null}
      {loading ? <Section><Skeleton /></Section> : !list.length && !adding ? (
        <Section>
          <Empty icon="spark" title="Connect an AI provider" text="Anthropic Claude, Google Gemini, OpenAI, OpenRouter or any OpenAI-compatible endpoint. Until one is connected, projects use the built-in planner and AI file edits are unavailable." action={<button className="btn btn-primary" onClick={() => setAdding(true)}>Add provider</button>} />
        </Section>
      ) : (
        <div className="space-y-4">
          {list.map((p) => (
            <Section key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-ink">{p.label}</h2>
                    <Status value={p.status} />
                    {p.isDefault ? <span className="badge" data-tone="info"><Icon name="star" size={10} /> Default</span> : null}
                  </div>
                  <p className="mono mt-1 text-xs text-ink3">{p.kindName} · {p.endpoint || "no endpoint"}</p>
                  <dl className="mono mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
                    {([["Key", p.hasKey ? p.keyHint : "none"], ["Model", p.model || "not selected"], ["Last test", p.lastTestedAt ? ago(p.lastTestedAt) : "never"], ["Usage", `${p.usage.requests ?? 0} req · ${(p.usage.inputTokens ?? 0) + (p.usage.outputTokens ?? 0)} tok · ${p.usage.errors ?? 0} err`]] as const).map(([k, v]) => (
                      <div key={k} className="min-w-0"><dt className="text-[10px] uppercase tracking-wider text-ink3">{k}</dt><dd className="truncate text-ink2">{v}</dd></div>
                    ))}
                  </dl>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <ActionButton className="btn btn-sm btn-primary" onError={(m) => setMsg({ id: p.id, text: m })} onAct={async () => { setMsg(null); await call(`/api/providers/${p.id}/test`, { method: "POST", body: {} }); await reload(); }}><Icon name="check" size={13} /> Test Connection</ActionButton>
                  <button className="btn btn-sm" onClick={() => { setEditing(editing === p.id ? null : p.id); setAdding(false); }}><Icon name="gear" size={13} /> {editing === p.id ? "Close" : "Edit"}</button>
                  <ActionButton className="btn btn-sm" disabled={p.isDefault || p.status !== "connected"} title={p.status !== "connected" ? "Only a connected provider can be the default" : ""} onError={(m) => setMsg({ id: p.id, text: m })} onAct={async () => { await call(`/api/providers/${p.id}/default`, { method: "POST", body: {} }); await reload(); }}><Icon name="star" size={13} /> Make default</ActionButton>
                  <ActionButton className="btn btn-sm btn-danger" confirm={`Delete "${p.label}"? The stored key is erased.`} onAct={async () => { await call(`/api/providers/${p.id}`, { method: "DELETE" }); await reload(); }}><Icon name="trash" size={13} /> Delete</ActionButton>
                </div>
              </div>
              {p.lastError || msg?.id === p.id ? (
                <div className="px-5 pb-4"><Notice tone={p.status === "needs_model" && msg?.id !== p.id ? "info" : "bad"}>{msg?.id === p.id ? msg.text : p.lastError}</Notice></div>
              ) : null}
              {editing === p.id && data ? <div className="border-t border-line"><ProviderForm kinds={data.kinds} existing={p} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); void reload(); }} /></div> : null}
            </Section>
          ))}
        </div>
      )}
      {data?.localEndpointsAllowed ? <p className="mono mt-4 text-[11px] text-warn">STUDIO_ALLOW_LOCAL_AI=true: custom endpoints on local/private addresses are permitted.</p> : null}
    </div>
  );
}
