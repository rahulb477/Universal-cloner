import { quickAnalyze } from "@/lib/studio/discover";
import { api, body, fail, json } from "@/lib/studio/http";
import { UserError } from "@/lib/studio/jobs";
import { SsrfError } from "@/lib/studio/ssrf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Analyze website": a quick, read-only look at one URL (no crawl, nothing clicked). */
export async function POST(req: Request) {
  return api(req, async () => {
    const b = await body(req);
    const raw = typeof b.url === "string" ? b.url.trim() : "";
    if (!raw) return fail("Enter a URL.");
    try {
      return json({ result: await quickAnalyze(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) });
    } catch (e) {
      if (e instanceof SsrfError || e instanceof UserError) throw e;
      return fail(`Could not open the website: ${(e as Error).message.split("\n")[0].slice(0, 200)}`, 502);
    }
  }, { limit: ["analyze", 8] });
}
