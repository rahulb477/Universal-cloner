"use client";

import Link from "next/link";
import { useState } from "react";
import { duration, Empty, fmtDate, Icon, Notice, PageHead, ProgressBar, Section, Skeleton, Status, useLive, type Job } from "@/components/studio/ui";

export default function HistoryPage() {
  const { data, error, loading } = useLive<{ jobs: Job[] }>("/api/jobs", (d) => (d?.jobs.some((j) => j.status === "running" || j.status === "queued") ? 2000 : 10000));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHead eyebrow="Clone history" title="Job history" sub="Every clone, resume and rebuild run, with the real state of each of its 13 steps." />
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      <Section>
        {loading ? <Skeleton rows={5} /> : !data?.jobs.length ? (
          <Empty icon="clock" title="No jobs have run" text="Jobs appear here as soon as a clone project is started." />
        ) : (
          <ul className="divide-y divide-line">
            {data.jobs.map((j) => (
              <li key={j.id}>
                <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left hover:bg-panel2/40" aria-expanded={open === j.id} onClick={() => setOpen(open === j.id ? null : j.id)}>
                  <Icon name="chevron" size={14} className={`text-ink3 transition-transform ${open === j.id ? "rotate-90" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{j.projectName}</span>
                    <span className="mono block text-[11px] text-ink3">{j.type} · from {j.fromStage} · attempt {j.attempt} · {j.id}</span>
                  </span>
                  <span className="mono text-[11.5px] text-ink3">{fmtDate(j.createdAt)}</span>
                  <span className="mono w-16 text-right text-[11.5px] text-ink3">{duration(j.startedAt, j.finishedAt)}</span>
                  <span className="mono w-12 text-right text-[11.5px] text-ink2">{j.progress.completed}/{j.progress.total}</span>
                  <Status value={j.status} />
                </button>
                {open === j.id ? (
                  <div className="border-t border-line bg-raised px-5 py-4">
                    <ProgressBar job={j} />
                    {j.error ? <p className="mt-3 whitespace-pre-wrap text-[13px] text-bad">{j.error}</p> : null}
                    <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {j.steps.map((s, i) => (
                        <li key={s.key} className="flex items-baseline gap-2 text-[13px]">
                          <span className="mono w-5 text-[11px] text-ink3">{String(i + 1).padStart(2, "0")}</span>
                          <span className={s.status === "pending" ? "text-ink3" : "text-ink"}>{s.label}</span>
                          <span className="mono ml-auto text-[11px] text-ink3">{s.status}{s.startedAt && s.finishedAt ? ` · ${duration(s.startedAt, s.finishedAt)}` : ""}</span>
                        </li>
                      ))}
                    </ol>
                    {j.projectName !== "(deleted project)" ? <Link href={`/studio/projects/${j.projectId}?tab=logs&job=${j.id}`} className="btn btn-sm mt-4"><Icon name="list" size={13} /> Open full log</Link> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
