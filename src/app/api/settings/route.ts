import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getDbInfo } from "@/db";
import { secretSource } from "@/lib/studio/crypto";
import { api, body, json, passwordRequired } from "@/lib/studio/http";
import { gatewayInfo, runningPreviews, stopAllPreviews } from "@/lib/studio/preview";
import { DEFAULT_SETTINGS, getSettings, logActivity, saveSettings } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

function dirSize(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      n += e.isDirectory() ? dirSize(f) : fs.statSync(/*turbopackIgnore: true*/ f).size;
    }
  } catch {
    /* missing */
  }
  return n;
}

export async function GET(req: Request) {
  return api(req, async () => {
    const db = await getDbInfo();
    return json({
      settings: await getSettings(), defaults: DEFAULT_SETTINGS,
      system: {
        database: db.engine === "postgresql" ? "PostgreSQL (DATABASE_URL)" : "Embedded PostgreSQL (PGlite, on disk)",
        secretSource: secretSource() === "env" ? "STUDIO_SECRET environment variable" : "generated key file in the data directory",
        passwordProtected: passwordRequired(), gateway: gatewayInfo(), runningPreviews: runningPreviews().length,
        dataBytes: dirSize(path.join(DATA_DIR, "projects")), node: process.version,
        privateTargetsAllowed: (process.env.STUDIO_ALLOW_PRIVATE_TARGETS || "").split(",").map((s) => s.trim()).filter(Boolean),
        localAiAllowed: process.env.STUDIO_ALLOW_LOCAL_AI === "true",
      },
    });
  });
}

export async function PUT(req: Request) {
  return api(req, async () => {
    try {
      const s = await saveSettings(await body(req));
      await logActivity("settings", "Studio settings updated");
      return json({ settings: s });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  });
}

/** Maintenance actions. */
export async function POST(req: Request) {
  return api(req, async () => {
    const { action } = await body(req);
    if (action === "stop-previews") {
      const n = runningPreviews().length;
      stopAllPreviews();
      await logActivity("preview", `All previews stopped (${n})`);
      return json({ ok: true, stopped: n });
    }
    return json({ error: "Unknown action" }, 400);
  });
}
