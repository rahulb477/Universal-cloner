import crypto from "node:crypto";
import { api, body, fail, json, passwordRequired, signIn, signOut } from "@/lib/studio/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(req, async () => {
    if (!passwordRequired()) return json({ ok: true });
    const { password } = await body(req);
    const a = crypto.createHash("sha256").update(String(password ?? "")).digest();
    const b = crypto.createHash("sha256").update(process.env.STUDIO_PASSWORD!).digest();
    if (!crypto.timingSafeEqual(a, b)) return fail("Wrong password.", 401);
    await signIn(req);
    return json({ ok: true });
  }, { open: true, limit: ["login", 8] });
}

export async function DELETE(req: Request) {
  return api(req, async () => {
    await signOut();
    return json({ ok: true });
  }, { open: true });
}
