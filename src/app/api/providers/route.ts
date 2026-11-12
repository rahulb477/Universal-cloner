import { api, body, json } from "@/lib/studio/http";
import { listProviders, PROVIDER_KINDS, publicProvider, saveProvider } from "@/lib/studio/providers";
import { logActivity } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, async () => json({
    providers: (await listProviders()).map(publicProvider),
    kinds: Object.entries(PROVIDER_KINDS).map(([id, k]) => ({ id, ...k })),
    localEndpointsAllowed: process.env.STUDIO_ALLOW_LOCAL_AI === "true",
  }));
}

export async function POST(req: Request) {
  return api(req, async () => {
    try {
      const p = await saveProvider(await body(req));
      await logActivity("provider", `AI provider "${p.label}" saved (not yet tested)`);
      return json({ provider: publicProvider(p) }, 201);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }, { limit: ["provider", 20] });
}
