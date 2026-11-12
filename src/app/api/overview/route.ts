import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { activity } from "@/db/schema";
import { api, json } from "@/lib/studio/http";
import { listJobs } from "@/lib/studio/jobs";
import { runningPreviews } from "@/lib/studio/preview";
import { projectView } from "@/lib/studio/projects";
import { listProviders } from "@/lib/studio/providers";
import { listProjects } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, async () => {
    const db = await getDb();
    const [projects, jobs, providers, recent] = [await listProjects(), await listJobs(undefined, 500), await listProviders(), await db.select().from(activity).orderBy(desc(activity.id)).limit(14)];
    const latest = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) if (!latest.has(j.projectId)) latest.set(j.projectId, j);
    return json({
      stats: {
        projects: projects.length, ready: projects.filter((p) => p.status === "ready").length, failed: projects.filter((p) => p.status === "failed").length,
        active: jobs.filter((j) => j.status === "running" || j.status === "queued").length, routes: projects.reduce((s, p) => s + p.routesDiscovered, 0),
        pages: projects.reduce((s, p) => s + p.pagesCloned, 0), previews: runningPreviews().length,
        providersConnected: providers.filter((p) => p.status === "connected").length, providers: providers.length, jobs: jobs.length,
      },
      recentProjects: await Promise.all(projects.slice(0, 5).map((p) => projectView(p, req.headers, latest.get(p.id)))),
      activity: recent,
    });
  });
}
