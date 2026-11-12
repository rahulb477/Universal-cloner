import fs from "node:fs";
import path from "node:path";
import { api, fail } from "@/lib/studio/http";
import { analysisDir, getProject, safeJoin } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    const name = new URL(req.url).searchParams.get("name") || "";
    if (!p || !/^[\w.-]+\.(jpg|png)$/.test(name)) return fail("Not found", 404);
    const abs = safeJoin(path.join(analysisDir(p.id), "screenshots"), name);
    if (!abs || !fs.existsSync(/*turbopackIgnore: true*/ abs)) return fail("Not found", 404);
    return new Response(new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ abs)), { headers: { "content-type": name.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "private, max-age=60", "x-content-type-options": "nosniff" } });
  });
}
