"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProjectActions } from "@/components/studio/ProjectActions";
import { Empty, fmtDate, Icon, jobActive, Notice, PageHead, ProgressBar, Section, Skeleton, Status, useLive, type Project } from "@/components/studio/ui";

const FILTERS = ["all", "pending", "analyzing", "discovery_complete", "generating", "building", "ready", "failed"] as const;

export default function ProjectsPage() {
  const { data, error, loading, reload } = useLive<{ projects: Project[] }>("/api/projects", (d) => (d?.projects.some((p) => jobActive(p.job)) ? 2000 : 8000));
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const list = useMemo(() => (data?.projects ?? []).filter((p) => (filter === "all" || p.status === filter) && (!q || `${p.name} ${p.targetUrl}`.toLowerCase().includes(q.toLowerCase()))), [data, q, filter]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHead eyebrow="My projects" title="Projects" sub="Stored in the database, so they survive refreshes and restarts." actions={<Link href="/studio/new" className="btn btn-primary"><Icon name="plus" size={15} /> New clone project</Link>} />
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search name or URL" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as (typeof FILTERS)[number])} aria-label="Filter by status">
          {FILTERS.map((f) => <option key={f} value={f}>{f === "all" ? "All statuses" : f.replace("_", " ")}</option>)}
        </select>
        <span className="mono ml-auto text-xs text-ink3">{list.length} of {data?.projects.length ?? 0}</span>
      </div>
      <Section>
        {loading ? <Skeleton rows={5} /> : !data?.projects.length ? (
          <Empty title="No projects yet" text="Create a clone project to see it here with its status, routes, build result, preview and ZIP." action={<Link href="/studio/new" className="btn btn-primary">New clone project</Link>} />
        ) : !list.length ? (
          <p className="px-5 py-12 text-center text-[13px] text-ink3">No project matches this filter.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/studio/projects/${p.id}`} className="truncate text-[15px] font-semibold text-ink hover:underline">{p.name}</Link>
                      <Status value={p.status} />
                    </div>
                    <p className="mono mt-0.5 truncate text-xs text-ink3">{p.targetUrl}</p>
                  </div>
                  <dl className="mono grid grid-cols-2 gap-x-5 gap-y-1 text-[11.5px] sm:grid-cols-5">
                    {([["Created", fmtDate(p.createdAt)], ["Routes", `${p.routesDiscovered} found · ${p.pagesCloned} cloned`], ["Build", <Status key="b" value={p.buildStatus} />], ["Preview", p.preview.running ? "live" : p.preview.available ? "stopped" : "not available"], ["ZIP", p.zip && p.buildStatus === "succeeded" ? "ready" : "not available"]] as const).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[10px] uppercase tracking-wider text-ink3">{k}</dt>
                        <dd className="text-ink2">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {p.job && jobActive(p.job) ? (
                  <div className="mt-3">
                    <ProgressBar job={p.job} />
                    <p className="mono mt-1.5 text-[11px] text-ink3">{p.job.progress.completed}/{p.job.progress.total} steps complete · {p.job.steps.find((x) => x.status === "running")?.label ?? "waiting in queue"}</p>
                  </div>
                ) : null}
                {p.error && p.status === "failed" ? <p className="mt-2 line-clamp-2 text-[13px] text-bad">{p.error}</p> : null}
                <div className="mt-3"><ProjectActions p={p} onChange={reload} compact /></div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
