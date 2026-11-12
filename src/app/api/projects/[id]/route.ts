import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cloneProjects } from "@/db/schema";
import { PHASES, STATUSES } from "@/lib/skill-data";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const patch: Partial<typeof cloneProjects.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.phase === "string") {
    if (!(PHASES as readonly string[]).includes(body.phase)) return Response.json({ error: "Invalid phase" }, { status: 400 });
    patch.phase = body.phase;
  }
  if (typeof body.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) return Response.json({ error: "Invalid status" }, { status: 400 });
    patch.status = body.status;
  }
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
  if (body.worstMismatchPercent === null) patch.worstMismatchPercent = null;
  else if (typeof body.worstMismatchPercent === "number" && body.worstMismatchPercent >= 0 && body.worstMismatchPercent <= 100) {
    patch.worstMismatchPercent = Math.round(body.worstMismatchPercent);
  }

  const [row] = await db.update(cloneProjects).set(patch).where(eq(cloneProjects.id, id)).returning();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ project: row });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (!id) return Response.json({ error: "Invalid id" }, { status: 400 });
  const rows = await db.delete(cloneProjects).where(eq(cloneProjects.id, id)).returning();
  if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
