import { loadAnalysis } from "@/lib/studio/discover";
import { api, fail, json } from "@/lib/studio/http";
import { loadGeneration, loadPlan } from "@/lib/studio/pipeline";
import { getProject } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const a = loadAnalysis(p.id);
    const gen = loadGeneration(p.id);
    return json({
      analysis: a ? { targetUrl: a.targetUrl, analysedAt: a.analysedAt, browser: a.browser, pages: a.pages, routes: a.routes, login: a.login, design: a.design, forms: a.forms, interactions: a.interactions, api: a.api.slice(0, 100), consoleErrors: a.consoleErrors.slice(0, 50), assets: a.assets, capture: a.capture, blockedRequests: a.blockedRequests, errorPageCaptured: a.errorPageCaptured, notes: a.notes } : null,
      plan: loadPlan(p.id),
      generation: gen ? { files: gen.files, pages: gen.pages, components: gen.components, features: gen.features, external: gen.external, previewAccount: gen.previewAccount } : null,
    });
  });
}
