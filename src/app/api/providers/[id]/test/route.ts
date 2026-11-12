import { api, json } from "@/lib/studio/http";
import { publicProvider, testProvider } from "@/lib/studio/providers";
import { logActivity } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    try {
      const p = await testProvider((await params).id);
      await logActivity("provider", `Connection test for "${p.label}": ${p.status === "connected" ? "connected" : p.status === "needs_model" ? "key accepted, model needed" : "failed"}`);
      return json({ provider: publicProvider(p) });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }, { limit: ["provider-test", 12] });
}
