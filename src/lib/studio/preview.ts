import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { cleanEnv, killTree, nodeSandboxArgs } from "./sandbox";
import { getProject, getProjectByToken, getSettings, logsDir, siteDir } from "./store";

type Entry = { projectId: string; port: number; proc: ChildProcess; startedAt: number; lastHit: number };
type State = { previews: Map<string, Entry>; gateway: http.Server | null; gatewayPort: number | null; gatewayError: string | null; sweeper: NodeJS.Timeout | null; starting: Promise<void> | null };
const g = globalThis as typeof globalThis & { __uwcPreview?: State };
const st: State = (g.__uwcPreview ??= { previews: new Map(), gateway: null, gatewayPort: null, gatewayError: null, sweeper: null, starting: null });

export const GATEWAY_PORT = Number(process.env.PREVIEW_PORT || 4100);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

export function stopPreview(projectId: string): boolean {
  const e = st.previews.get(projectId);
  if (!e) return false;
  st.previews.delete(projectId);
  killTree(e.proc);
  return true;
}
export function stopAllPreviews() {
  for (const id of [...st.previews.keys()]) stopPreview(id);
}

export async function previewStatus(projectId: string) {
  const e = st.previews.get(projectId);
  if (!e) return { running: false as const };
  const { previewIdleMinutes } = await getSettings();
  return { running: true as const, startedAt: new Date(e.startedAt).toISOString(), lastRequestAt: new Date(e.lastHit).toISOString(), expiresAt: new Date(e.lastHit + previewIdleMinutes * 60_000).toISOString(), internalPort: e.port };
}
export const runningPreviews = () => [...st.previews.keys()];
export const previewPort = (projectId: string) => st.previews.get(projectId)?.port ?? null;

/**
 * Start the generated project's own server as a separate, confined OS process on a loopback port.
 * It never runs inside the studio process and inherits none of its environment.
 */
export async function startPreview(projectId: string, extraEnv: Record<string, string> = {}, onLog?: (l: string) => void): Promise<number> {
  ensureGateway();
  stopPreview(projectId);
  const cwd = siteDir(projectId);
  if (!fs.existsSync(/*turbopackIgnore: true*/ path.join(cwd, "dist", "site.json"))) throw new Error("The project has not been built yet.");
  const settings = await getSettings();
  // Respect the concurrent preview limit by stopping the least recently used one.
  while (st.previews.size >= settings.maxPreviews) {
    const oldest = [...st.previews.values()].sort((a, b) => a.lastHit - b.lastHit)[0];
    stopPreview(oldest.projectId);
  }
  const port = await freePort();
  const logFile = path.join(logsDir(projectId), "preview.log");
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(logFile), { recursive: true });
  const out = fs.createWriteStream(/*turbopackIgnore: true*/ logFile, { flags: "a" });
  out.write(`\n--- preview start ${new Date().toISOString()} (port ${port}) ---\n`);
  const proc = spawn(process.execPath, [...nodeSandboxArgs(cwd, settings.memoryMb, ["data"]), "server/index.mjs"], {
    cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: cleanEnv(cwd, { PORT: String(port), HOST: "127.0.0.1", PROTECT_PAGES: "client", DATABASE_FILE: path.join(cwd, "data", "preview.sqlite"), ...extraEnv }),
  });
  let tail = "";
  const onData = (d: Buffer) => {
    const s = d.toString();
    out.write(s);
    tail = (tail + s).slice(-2000);
    for (const l of s.split("\n")) if (l.trim()) onLog?.(`[preview] ${l}`);
  };
  proc.stdout!.on("data", onData);
  proc.stderr!.on("data", onData);
  const entry: Entry = { projectId, port, proc, startedAt: Date.now(), lastHit: Date.now() };
  let exited: number | null | "pending" = "pending";
  proc.on("exit", (code) => {
    exited = code;
    out.end(`--- preview exited with code ${code} ---\n`);
    if (st.previews.get(projectId) === entry) st.previews.delete(projectId);
  });
  // Wait until the server answers its own health check.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (exited !== "pending") throw new Error(`The preview server exited during start-up (code ${exited}). ${tail.trim().split("\n").slice(-4).join(" | ")}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        st.previews.set(projectId, entry);
        return port;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  killTree(proc);
  throw new Error("The preview server did not become healthy within 15 seconds.");
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;font:16px/1.5 system-ui,sans-serif;background:#0d1117;color:#c9d1d9"><div style="max-width:440px;padding:32px;text-align:center"><h1 style="font-size:20px;color:#fff;margin:0 0 8px">${title}</h1><p style="margin:0;color:#8b949e">${body}</p></div>`;

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-authorization", "proxy-authenticate", "te", "trailer"]);

async function gatewayHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  const html = (code: number, title: string, body: string) => {
    res.writeHead(code, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" });
    res.end(page(title, body));
  };
  try {
    const url = new URL(req.url || "/", "http://gateway");
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, previews: st.previews.size }));
    }
    const m = url.pathname.match(/^\/preview\/([a-f0-9]{16,64})(\/.*)?$/);
    if (!m) return html(404, "Preview gateway", "Open a preview from the studio workspace. Preview addresses look like /preview/&lt;token&gt;/.");
    if (!m[2]) {
      res.writeHead(308, { location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    const project = await getProjectByToken(m[1]);
    if (!project) return html(404, "Preview not found", "This preview link is not valid. It may have been revoked or the project was deleted.");
    const entry = st.previews.get(project.id);
    if (!entry) return html(503, "Preview is not running", "It was stopped or expired after a period of inactivity. Start it again from the project workspace in the studio.");
    entry.lastHit = Date.now();
    const headers: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && k !== "cookie" && k !== "host" && !k.startsWith("x-forwarded")) headers[k] = v;
    headers.host = `127.0.0.1:${entry.port}`;
    const up = http.request({ host: "127.0.0.1", port: entry.port, method: req.method, path: m[2] + url.search, headers, timeout: 30000 }, (r) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(r.headers)) if (!HOP.has(k) && k !== "set-cookie") out[k] = v;
      out["x-robots-tag"] = "noindex";
      out["referrer-policy"] = "no-referrer";
      res.writeHead(r.statusCode || 502, out);
      r.pipe(res);
    });
    up.on("timeout", () => up.destroy(new Error("timeout")));
    up.on("error", () => {
      if (!res.headersSent) html(502, "Preview unavailable", "The preview server did not answer. Check the build log and rebuild the project.");
      else res.end();
    });
    req.pipe(up);
  } catch {
    if (!res.headersSent) html(500, "Preview gateway error", "Something went wrong while routing this request.");
  }
}

/** The gateway is a separate listener (its own origin), so preview pages can never read studio cookies or storage. */
export function ensureGateway() {
  if (st.gateway || st.gatewayError) return;
  if (process.env.PREVIEW_GATEWAY === "off") {
    st.gatewayError = "disabled by PREVIEW_GATEWAY=off";
    return;
  }
  const server = http.createServer((req, res) => void gatewayHandler(req, res));
  st.gateway = server;
  server.on("error", (e) => {
    st.gatewayError = (e as Error).message;
    st.gateway = null;
    st.gatewayPort = null;
    console.error(`[studio] preview gateway could not listen on ${GATEWAY_PORT}: ${(e as Error).message}. Falling back to same-origin previews.`);
  });
  server.listen(GATEWAY_PORT, process.env.PREVIEW_HOST || "0.0.0.0", () => {
    st.gatewayPort = GATEWAY_PORT;
    console.log(`[studio] preview gateway listening on :${GATEWAY_PORT}`);
  });
  if (!st.sweeper) {
    st.sweeper = setInterval(() => void sweep(), 30_000);
    st.sweeper.unref();
  }
}

/** Stop previews that have been idle longer than the configured expiry. */
async function sweep() {
  if (!st.previews.size) return;
  const { previewIdleMinutes } = await getSettings();
  for (const e of [...st.previews.values()]) {
    if (Date.now() - e.lastHit > previewIdleMinutes * 60_000 || !(await getProject(e.projectId))) stopPreview(e.projectId);
  }
}

export const gatewayInfo = () => ({ listening: st.gatewayPort !== null, port: st.gatewayPort, error: st.gatewayError });

/** Public address of a preview, derived from how the studio itself was reached. */
export function publicPreviewUrl(h: Headers, token: string): { url: string; mode: "gateway" | "same-origin" } {
  const fixed = process.env.PREVIEW_PUBLIC_ORIGIN?.replace(/\/+$/, "");
  if (fixed) return { url: `${fixed}/preview/${token}/`, mode: "gateway" };
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost:3000").split(",")[0].trim();
  const bare = host.replace(/:\d+$/, "");
  const local = bare === "localhost" || /^[\d.]+$/.test(bare) || bare.startsWith("[");
  const proto = (h.get("x-forwarded-proto") || (local ? "http" : "https")).split(",")[0].trim();
  if (st.gatewayPort !== null) {
    const sub = host.match(/^(\d{2,5})-(.+)$/); // hosts that expose each port as <port>-<id>.domain
    if (sub) return { url: `${proto}://${st.gatewayPort}-${sub[2]}/preview/${token}/`, mode: "gateway" };
    if (/:\d+$/.test(host)) return { url: `${proto}://${bare}:${st.gatewayPort}/preview/${token}/`, mode: "gateway" };
  }
  // Single-port hosting: served by the studio itself under /preview/<token>/ with a sandboxing CSP.
  return { url: `${proto}://${host}/preview/${token}/`, mode: "same-origin" };
}

/** Same-origin fallback used by the Next.js route when no separate gateway origin is reachable. */
export async function proxyFetch(token: string, subpath: string, req: Request): Promise<Response> {
  const html = (code: number, title: string, body: string) => new Response(page(title, body), { status: code, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  const project = await getProjectByToken(token);
  if (!project) return html(404, "Preview not found", "This preview link is not valid.");
  const entry = st.previews.get(project.id);
  if (!entry) return html(503, "Preview is not running", "Start it again from the project workspace in the studio.");
  entry.lastHit = Date.now();
  const url = new URL(req.url);
  const headers = new Headers();
  for (const k of ["accept", "content-type", "authorization", "accept-language"]) if (req.headers.get(k)) headers.set(k, req.headers.get(k)!);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
  let r: Response;
  try {
    r = await fetch(`http://127.0.0.1:${entry.port}/${subpath}${url.search}`, { method: req.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(30000) });
  } catch {
    return html(502, "Preview unavailable", "The preview server did not answer.");
  }
  const out = new Headers();
  for (const k of ["content-type", "cache-control", "location", "allow"]) if (r.headers.get(k)) out.set(k, r.headers.get(k)!);
  // An opaque origin: generated pages cannot touch the studio's cookies, storage or API.
  out.set("content-security-policy", "sandbox allow-scripts allow-forms allow-popups allow-modals");
  out.set("access-control-allow-origin", "*");
  out.set("x-robots-tag", "noindex");
  return new Response(r.body, { status: r.status, headers: out });
}
