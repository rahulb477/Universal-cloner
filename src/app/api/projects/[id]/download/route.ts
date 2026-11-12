import fs from "node:fs";
import { Readable } from "node:stream";
import { api, fail } from "@/lib/studio/http";
import { exportsDir, getProject, logActivity } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

/** Streams the verified ZIP. The file path comes from the database record, never from the request. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const zip = p.zip as { file: string; name: string; bytes: number; sha256: string } | null;
    if (!zip || p.buildStatus !== "succeeded") return fail("No verified ZIP is available. Build the project successfully first.", 409);
    if (!zip.file.startsWith(exportsDir(p.id)) || !fs.existsSync(/*turbopackIgnore: true*/ zip.file)) return fail("The ZIP file is missing on disk. Rebuild the project to create it again.", 410);
    if (fs.statSync(/*turbopackIgnore: true*/ zip.file).size !== zip.bytes) return fail("The ZIP on disk does not match the verified export. Rebuild the project.", 409);
    await logActivity("download", `${p.name}: ZIP downloaded`, p.id);
    const stream = Readable.toWeb(fs.createReadStream(/*turbopackIgnore: true*/ zip.file)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "content-type": "application/zip", "content-length": String(zip.bytes), "content-disposition": `attachment; filename="${zip.name.replace(/[^\w.-]/g, "_")}"`,
        "cache-control": "no-store", "x-content-type-options": "nosniff", "x-checksum-sha256": zip.sha256,
      },
    });
  }, { limit: ["download", 30] });
}
