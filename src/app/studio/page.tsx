"use client";

import Link from "next/link";
import { ago, Empty, Icon, jobActive, Notice, PageHead, ProgressBar, Section, Skeleton, Status, useLive, type Project } from "@/components/studio/ui";

type Overview = {
  stats: { projects: number; ready: number; failed: number; active: number; routes: number; pages: number; previews: number; providersConnected: number; providers: number; jobs: number };
  recentProjects: Project[];
  activity: { id: number; projectId: string | null; kind: string; message: string; createdAt: string }[];
};
const KIND_ICON: Record<string, string> = { created: "plus", job: "hammer", preview: "eye", provider: "spark", settings: "gear", edit: "code", deleted: "trash", zip: "download" };

export default function OverviewPage() {
  const { data, error, loading } = useLive<Overview>("/api/overview", (d) => (d?.stats.active ? 2500 : 10000));
  const s = data?.stats;
  const tiles: [string, number | undefined, string][] = [
    ["Projects", s?.projects, `${s?.ready ?? 0} ready · ${s?.failed ?? 0} failed`],
    ["Routes discovered", s?.routes, `${s?.pages ?? 0} pages reconstructed`],
    ["Live previews", s?.previews, "running right now"],
    ["Jobs", s?.jobs, `${s?.active ?? 0} in progress`],
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHead
        eyebrow="Overview" title="Clone workspace"
        sub="Every number on this page is read from the database and the running preview processes."
        actions={<Link href="/studio/new" className="btn btn-primary"><Icon name="plus" size={15} /> New clone project</Link>}
      />
      {error ? <div className="mb-5"><Notice tone="bad" title="Could not load the overview">{error}</Notice></div> : null}
      {s && s.providersConnected === 0 ? (
        <div className="mb-5">
          <Notice tone="warn" title={s.providers ? "No AI provider has passed a connection test" : "No AI provider configured"}>
            AI architecture planning and AI file edits stay off until a provider is connected. Cloning still works with the built-in planner.{" "}
            <Link href="/studio/providers" className="font-medium text-ink underline underline-offset-2">Set up a provider</Link>
          </Notice>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card p-4">
            <p className="label">{label}</p>
            <p className="mono mt-2 text-[30px] font-medium leading-none tracking-tight text-ink">{value ?? "–"}</p>
            <p className="mt-2 text-xs text-ink3">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Section title="Recent projects" actions={<Link href="/studio/projects" className="btn btn-sm">All projects</Link>}>
          {loading ? <Skeleton /> : !data?.recentProjects.length ? (
            <Empty title="No projects yet" text="Point the studio at a website you own or are authorised to reproduce. It crawls the routes, rebuilds them as an independent project and serves a live preview." action={<Link href="/studio/new" className="btn btn-primary">Create the first project</Link>} />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentProjects.map((p) => (
                <li key={p.id}>
                  <Link href={`/studio/projects/${p.id}`} className="block px-5 py-3.5 transition-colors hover:bg-panel2/50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                        <p className="mono truncate text-xs text-ink3">{p.targetUrl}</p>
                      </div>
                      <Status value={p.status} />
                    </div>
                    {p.job && jobActive(p.job) ? (
                      <div className="mt-2.5">
                        <ProgressBar job={p.job} />
                        <p className="mono mt-1.5 text-[11px] text-ink3">step {Math.min(p.job.progress.completed + 1, p.job.progress.total)}/{p.job.progress.total} · {p.job.steps.find((x) => x.status === "running")?.label ?? "queued"}</p>
                      </div>
                    ) : (
                      <p className="mono mt-1.5 text-[11px] text-ink3">{p.routesDiscovered} routes · {p.pagesCloned} pages · updated {ago(p.updatedAt)}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent activity" hint="Server-side event log">
          {loading ? <Skeleton /> : !data?.activity.length ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink3">Nothing has happened yet.</p>
          ) : (
            <ol className="px-5 py-3">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-3 py-2">
                  <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-md border border-line bg-raised text-ink3"><Icon name={KIND_ICON[a.kind] ?? "clock"} size={12} /></span>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug text-ink2">{a.message}</p>
                    <p className="mono text-[11px] text-ink3">{ago(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}
