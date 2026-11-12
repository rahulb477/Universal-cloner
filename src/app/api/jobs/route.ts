import { api, json } from "@/lib/studio/http";
import { listJobs } from "@/lib/studio/jobs";
import { jobView } from "@/lib/studio/projects";
import { listProjects } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, async () => {
    const names = new Map((await listProjects()).map((p) => [p.id, p.name]));
    return json({ jobs: (await listJobs(undefined, 200)).map((j) => ({ ...jobView(j), projectName: names.get(j.projectId) ?? "(deleted project)" })) });
  });
}
