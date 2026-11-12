import { cookies } from "next/headers";
import { sign, unsign } from "./crypto";
import { UserError } from "./jobs";
import { SsrfError } from "./ssrf";

const COOKIE = "uwc_session";
export const passwordRequired = () => !!process.env.STUDIO_PASSWORD;

export async function isSignedIn(): Promise<boolean> {
  if (!passwordRequired()) return true;
  const v = unsign((await cookies()).get(COOKIE)?.value);
  return !!v && Number(v) > Date.now();
}
export async function signIn(req: Request) {
  const https = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol).startsWith("https");
  // SameSite=None lets the studio work when it is embedded in another site's frame (hosted previews).
  (await cookies()).set(COOKIE, sign(String(Date.now() + 7 * 864e5)), { httpOnly: true, secure: https, sameSite: https ? "none" : "lax", path: "/", maxAge: 7 * 86400 });
}
export async function signOut() {
  (await cookies()).delete(COOKIE);
}

type Bucket = { t: number; n: number };
const g = globalThis as typeof globalThis & { __uwcRate?: Map<string, Bucket> };
const buckets = (g.__uwcRate ??= new Map());
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (now - b.t > windowMs) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now - b.t > windowMs) {
    buckets.set(key, { t: now, n: 1 });
    return false;
  }
  return ++b.n > max;
}
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (message: string, status = 400) => json({ error: message }, status);

/** Same-origin check for state-changing requests: blocks cross-site form posts and sandboxed preview pages. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Wrap an API handler with authentication, CSRF protection, rate limiting and uniform error responses. */
export async function api(req: Request, fn: () => Promise<Response>, opts: { limit?: [string, number]; open?: boolean } = {}): Promise<Response> {
  try {
    const mutating = !["GET", "HEAD"].includes(req.method);
    if (mutating && !sameOrigin(req)) return fail("Cross-origin requests are not allowed.", 403);
    if (!opts.open && !(await isSignedIn())) return fail("Sign in to the studio first.", 401);
    if (mutating && rateLimited(`w:${clientIp(req)}`, 120)) return fail("Too many requests. Slow down for a minute.", 429);
    if (opts.limit && rateLimited(`${opts.limit[0]}:${clientIp(req)}`, opts.limit[1])) return fail("Rate limit reached for this action. Try again in a minute.", 429);
    return await fn();
  } catch (e) {
    if (e instanceof UserError || e instanceof SsrfError) return fail(e.message, 400);
    console.error("[studio] API error:", e);
    return fail("Unexpected server error. Check the server log.", 500);
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new UserError("Send JSON.");
  const text = await req.text();
  if (text.length > 2_000_000) throw new UserError("Request too large.");
  try {
    const j = JSON.parse(text || "{}");
    if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error();
    return j as Record<string, unknown>;
  } catch {
    throw new UserError("Invalid JSON.");
  }
}
