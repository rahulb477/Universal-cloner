import { getDbInfo } from "@/db";
import { gatewayInfo } from "@/lib/studio/preview";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDbInfo();
    return Response.json({ ok: true, database: db.engine, previewGateway: gatewayInfo().listening });
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
