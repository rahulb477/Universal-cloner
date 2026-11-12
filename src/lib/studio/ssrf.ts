import dns from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {}

function v4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Private(ip);
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (x === "::1" || x === "::") return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  if (x.startsWith("::ffff:")) return true;
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:");
}

/** Explicit allow-list for local testing only, e.g. STUDIO_ALLOW_PRIVATE_TARGETS="127.0.0.1:4599". */
export function allowListed(u: URL): boolean {
  const list = (process.env.STUDIO_ALLOW_PRIVATE_TARGETS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return list.includes(`${u.hostname.toLowerCase()}:${port}`);
}

const cache = new Map<string, { ok: boolean; reason: string; at: number }>();

/** Throws unless the URL is http(s), has no embedded credentials and resolves only to public addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError("That is not a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SsrfError("Only http and https URLs are supported.");
  if (u.username || u.password) throw new SsrfError("URLs with embedded credentials are not accepted.");
  if (allowListed(u)) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) {
    if (!hit.ok) throw new SsrfError(hit.reason);
    return u;
  }
  let reason = "";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    reason = "Local and internal hostnames are blocked.";
  } else if (net.isIP(host)) {
    if (isPrivateIp(host)) reason = "Private, loopback and link-local addresses are blocked.";
  } else {
    try {
      const addrs = await dns.lookup(host, { all: true });
      if (!addrs.length) reason = `Could not resolve ${host}.`;
      else if (addrs.some((a) => isPrivateIp(a.address))) reason = `${host} resolves to a private or internal address, which is blocked.`;
    } catch {
      reason = `Could not resolve ${host}.`;
    }
  }
  cache.set(host, { ok: !reason, reason, at: Date.now() });
  if (reason) throw new SsrfError(reason);
  return u;
}

export async function isPublicUrl(raw: string): Promise<boolean> {
  try {
    await assertPublicUrl(raw);
    return true;
  } catch {
    return false;
  }
}
