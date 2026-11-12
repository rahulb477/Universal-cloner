import { desc } from "drizzle-orm";
import { db } from "@/db";
import { cloneProjects } from "@/db/schema";

export const dynamic = "force-dynamic";

function validUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const rows = await db.select().from(cloneProjects).orderBy(desc(cloneProjects.createdAt));
  return Response.json({ projects: rows });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const url = validUrl(body.targetUrl);
  if (!url) return Response.json({ error: "A valid http(s) target URL is required" }, { status: 400 });
  if (body.authorised !== true) {
    return Response.json(
      { error: "Confirm you own the site or have permission to inspect and reproduce it." },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : new URL(url).host;
  const [row] = await db
    .insert(cloneProjects)
    .values({
      name,
      targetUrl: url,
      category: typeof body.category === "string" ? body.category.slice(0, 60) : "web app",
      authRequired: body.authRequired === true,
      authorised: true,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "",
    })
    .returning();
  return Response.json({ project: row }, { status: 201 });
}
