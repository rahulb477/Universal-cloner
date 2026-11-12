import { proxyFetch } from "@/lib/studio/preview";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; path?: string[] }> };

/**
 * Same-origin preview fallback for single-port hosting. Responses carry a sandboxing CSP, so the
 * generated site runs in an opaque origin. The separate preview gateway is used whenever it is reachable.
 */
async function handle(req: Request, { params }: Ctx) {
  const { token, path } = await params;
  const url = new URL(req.url);
  if (!path?.length && !url.pathname.endsWith("/")) return new Response(null, { status: 308, headers: { location: `${url.pathname}/${url.search}` } });
  return proxyFetch(token, (path ?? []).map(encodeURIComponent).join("/"), req);
}

export { handle as GET, handle as POST, handle as HEAD };
