import fs from "node:fs";
import { findZip } from "@/lib/skill-files";

export const dynamic = "force-dynamic";

export async function GET() {
  const zip = findZip();
  if (!zip) {
    return Response.json(
      { error: "ZIP not built yet. Run `npm run package` inside universal-website-cloner/." },
      { status: 404 },
    );
  }
  const data = fs.readFileSync(/*turbopackIgnore: true*/ zip.file);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${zip.name}"`,
      "Cache-Control": "no-store",
    },
  });
}
