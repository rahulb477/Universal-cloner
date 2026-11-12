import { api, body, fail, json } from "@/lib/studio/http";
import { activeJob, requestCancel } from "@/lib/studio/jobs";
import { stopPreview } from "@/lib/studio/preview";
import { ensurePreview, projectView, rotatePreviewToken, startJob } from "@/lib/studio/projects";
import { getProject, latestJob, logActivity } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const { action } = await body(req);
    switch (action) {
      case "start":
      case "restart":
      case "resume":
      case "rebuild":
        await startJob(p.id, action);
        break;
      case "cancel": {
        const j = await activeJob(p.id);
        if (!j) return fail("No job is running for this project.");
        await requestCancel(j.id);
        break;
      }
      case "preview-start":
        await ensurePreview(p.id);
        await logActivity("preview", `${p.name}: preview started`, p.id);
        break;
      case "preview-stop":
        stopPreview(p.id);
        await logActivity("preview", `${p.name}: preview stopped`, p.id);
        break;
      case "preview-rotate":
        await rotatePreviewToken(p.id);
        await logActivity("preview", `${p.name}: preview link revoked and replaced`, p.id);
        break;
      default:
        return fail("Unknown action");
    }
    return json({ project: await projectView((await getProject(p.id))!, req.headers, await latestJob(p.id)) });
  }, { limit: ["action", 40] });
}
