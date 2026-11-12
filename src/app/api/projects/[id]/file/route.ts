import fs from "node:fs";
import path from "node:path";
import { api, body, fail, json } from "@/lib/studio/http";
import { activeJob } from "@/lib/studio/jobs";
import { aiEditFile } from "@/lib/studio/plan";
import { defaultProvider, getProvider } from "@/lib/studio/providers";
import { getProject, logActivity, safeJoin, siteDir } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const TEXT = /\.(html?|css|m?js|json|md|sql|txt|svg|xml|example|gitignore|ya?ml|toml)$|^\.(gitignore|env\.example)$/i;
const IMAGE: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
const PROTECTED = /^(node_modules|\.sandbox-home|data|dist)(\/|$)/;

async function resolve(id: string, rel: string | null) {
  const p = await getProject(id);
  if (!p) return { error: fail("Project not found", 404) };
  if (!rel || PROTECTED.test(rel)) return { error: fail("File not found", 404) };
  const abs = safeJoin(siteDir(p.id), rel);
  if (!abs) return { error: fail("Invalid path", 400) };
  return { p, abs, rel };
}

export async function GET(req: Request, { params }: Ctx) {
  return api(req, async () => {
    const q = new URL(req.url).searchParams;
    const r = await resolve((await params).id, q.get("path"));
    if ("error" in r) return r.error!;
    if (!fs.existsSync(/*turbopackIgnore: true*/ r.abs) || !fs.statSync(/*turbopackIgnore: true*/ r.abs).isFile()) return fail("File not found", 404);
    const size = fs.statSync(/*turbopackIgnore: true*/ r.abs).size;
    const ext = path.extname(r.abs).toLowerCase();
    if (q.get("raw") === "1") {
      if (!IMAGE[ext]) return fail("Only images can be requested raw", 400);
      // Served as an inert image: never as a document, and never allowed to run script.
      return new Response(new Uint8Array(fs.readFileSync(/*turbopackIgnore: true*/ r.abs)), { headers: { "content-type": IMAGE[ext], "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "x-content-type-options": "nosniff", "cache-control": "no-store" } });
    }
    const isText = TEXT.test(path.basename(r.abs));
    if (!isText || size > 1_500_000) return json({ path: r.rel, size, kind: IMAGE[ext] ? "image" : "binary", editable: false, content: null, note: isText ? "File is too large to open in the editor." : undefined });
    return json({ path: r.rel, size, kind: "text", editable: true, content: fs.readFileSync(/*turbopackIgnore: true*/ r.abs, "utf8") });
  });
}

/** Save an edit. The change takes effect in the preview after a rebuild. */
export async function PUT(req: Request, { params }: Ctx) {
  return api(req, async () => {
    const b = await body(req);
    const r = await resolve((await params).id, typeof b.path === "string" ? b.path : null);
    if ("error" in r) return r.error!;
    if (await activeJob(r.p.id)) return fail("Wait for the running job to finish before editing files.", 409);
    if (typeof b.content !== "string" || b.content.length > 1_500_000) return fail("Content is missing or too large.");
    if (!TEXT.test(path.basename(r.abs)) || !fs.existsSync(/*turbopackIgnore: true*/ r.abs)) return fail("Only existing text files can be edited.");
    fs.writeFileSync(/*turbopackIgnore: true*/ r.abs, b.content);
    await logActivity("edit", `${r.p.name}: ${r.rel} edited`, r.p.id);
    return json({ ok: true, size: Buffer.byteLength(b.content) });
  });
}

/** Ask the configured AI provider to rewrite one file. Returns a proposal; nothing is saved until PUT. */
export async function POST(req: Request, { params }: Ctx) {
  return api(req, async () => {
    const b = await body(req);
    const r = await resolve((await params).id, typeof b.path === "string" ? b.path : null);
    if ("error" in r) return r.error!;
    const instruction = typeof b.instruction === "string" ? b.instruction.trim().slice(0, 2000) : "";
    if (instruction.length < 4) return fail("Describe the change you want.");
    if (typeof b.content !== "string" || b.content.length > 120_000) return fail("AI edits are limited to text files up to 120 KB.");
    const provider = (r.p.providerId ? await getProvider(r.p.providerId) : null) ?? (await defaultProvider());
    if (!provider || provider.status !== "connected") return fail("No tested AI provider is available. Configure one under AI Providers.");
    try {
      const content = await aiEditFile(provider.id, r.rel, b.content, instruction);
      return json({ content, provider: provider.label, model: provider.model });
    } catch (e) {
      return fail(`AI edit failed: ${(e as Error).message}`, 502);
    }
  }, { limit: ["ai-edit", 12] });
}
