"use client";

import Link from "next/link";
import { ActionButton, ago, call, CopyText, Empty, fmtDate, Icon, Notice, PageHead, Section, Skeleton, useLive, type Project } from "@/components/studio/ui";

export default function PreviewsPage() {
  const { data, error, loading, reload } = useLive<{ projects: Project[] }>("/api/projects", 4000);
  const built = (data?.projects ?? []).filter((p) => p.preview.available);
  const act = (id: string, action: string) => async () => {
    await call(`/api/projects/${id}/actions`, { body: { action } });
    await reload();
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHead
        eyebrow="Live previews" title="Preview servers"
        sub="Each successfully built project runs as its own sandboxed process behind an unguessable address. Idle previews stop automatically."
        actions={built.some((p) => p.preview.running) ? <ActionButton className="btn btn-danger" confirm="Stop every running preview?" onAct={async () => { await call("/api/settings", { body: { action: "stop-previews" } }); await reload(); }}><Icon name="stop" size={13} /> Stop all</ActionButton> : null}
      />
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      {loading ? <Section><Skeleton /></Section> : !built.length ? (
        <Section><Empty icon="eye" title="No previews available" text="A preview address is created only after a project has been generated, built and tested successfully." action={<Link href="/studio/new" className="btn btn-primary">New clone project</Link>} /></Section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {built.map((p) => (
            <article key={p.id} className="card overflow-hidden">
              <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-panel2">
                {p.preview.url ? (
                  <iframe src={p.preview.url} title={`Preview of ${p.name}`} sandbox="allow-scripts allow-forms allow-same-origin" loading="lazy" tabIndex={-1} className="pointer-events-none absolute left-0 top-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0 bg-white" />
                ) : (
                  <div className="grid h-full place-items-center text-[13px] text-ink3">Preview server is stopped</div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/studio/projects/${p.id}`} className="truncate font-semibold text-ink hover:underline">{p.name}</Link>
                  <span className="badge" data-tone={p.preview.running ? "ok" : ""}><i />{p.preview.running ? "Live" : "Stopped"}</span>
                </div>
                {p.preview.url ? (
                  <>
                    <p className="mono mt-2 truncate rounded-md border border-line bg-raised px-2.5 py-1.5 text-[11.5px] text-ink2">{p.preview.url}</p>
                    <p className="mono mt-1.5 text-[11px] text-ink3">started {ago(p.preview.startedAt)} · stops when idle after {fmtDate(p.preview.expiresAt)}</p>
                  </>
                ) : <p className="mt-2 text-[13px] text-ink3">Start the server to get the preview address.</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.preview.url ? (
                    <>
                      <a className="btn btn-sm btn-primary" href={p.preview.url} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} /> Open</a>
                      <CopyText text={p.preview.url} label="Copy URL" />
                      <ActionButton className="btn btn-sm" onAct={act(p.id, "preview-stop")}><Icon name="stop" size={12} /> Stop</ActionButton>
                    </>
                  ) : <ActionButton className="btn btn-sm btn-primary" onAct={act(p.id, "preview-start")}><Icon name="play" size={12} /> Start preview</ActionButton>}
                  <ActionButton className="btn btn-sm" onAct={act(p.id, "preview-rotate")} confirm="Replace the preview address? The current link stops working immediately." title="Revoke the current link and issue a new one"><Icon name="refresh" size={13} /> New address</ActionButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
