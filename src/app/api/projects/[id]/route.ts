import { api, body, fail, json } from "@/lib/studio/http";
import { deleteProject, projectView, setProjectPassword } from "@/lib/studio/projects";
import { getProject, latestJob, updateProject } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    return json({ project: await projectView(p, req.headers, await latestJob(p.id)) });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const b = await body(req);
    const patch: { name?: string; description?: string } = {};
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 120);
    if (typeof b.description === "string") patch.description = b.description.trim().slice(0, 2000);
    if (Object.keys(patch).length) await updateProject(p.id, patch);
    if (typeof b.password === "string") await setProjectPassword(p.id, b.password);
    return json({ project: await projectView((await getProject(p.id))!, req.headers, await latestJob(p.id)) });
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return api(req, async () => {
    await deleteProject((await params).id);
    return json({ ok: true });
  });
}
