import { api, body, json } from "@/lib/studio/http";
import { deleteProvider, publicProvider, saveProvider } from "@/lib/studio/providers";
import { logActivity } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return api(req, async () => {
    try {
      const p = await saveProvider({ ...(await body(req)), id: (await params).id });
      return json({ provider: publicProvider(p) });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return api(req, async () => {
    await deleteProvider((await params).id);
    await logActivity("provider", "AI provider deleted; its stored key was erased");
    return json({ ok: true });
  });
}
