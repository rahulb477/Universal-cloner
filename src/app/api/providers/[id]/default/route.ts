import { api, json } from "@/lib/studio/http";
import { listProviders, publicProvider, setDefaultProvider } from "@/lib/studio/providers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    try {
      await setDefaultProvider((await params).id);
      return json({ providers: (await listProviders()).map(publicProvider) });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  });
}
