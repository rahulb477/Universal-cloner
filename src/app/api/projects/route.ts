import { api, body, json } from "@/lib/studio/http";
import { listJobs } from "@/lib/studio/jobs";
import { createProject, projectView, startJob } from "@/lib/studio/projects";
import { listProjects } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, async () => {
    const [rows, jobs] = [await listProjects(), await listJobs(undefined, 500)];
    const latest = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) if (!latest.has(j.projectId)) latest.set(j.projectId, j);
    return json({ projects: await Promise.all(rows.map((p) => projectView(p, req.headers, latest.get(p.id)))) });
  });
}

export async function POST(req: Request) {
  return api(req, async () => {
    const input = await body(req);
    const project = await createProject(input);
    const job = input.start === false ? null : await startJob(project.id, "start");
    return json({ project: await projectView(project, req.headers, job) }, 201);
  }, { limit: ["create", 10] });
}
