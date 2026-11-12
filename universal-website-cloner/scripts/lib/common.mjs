// Shared helpers for all Universal Website Cloner scripts.
// Requirements: Node >= 18.17. Browser scripts additionally need `playwright`
// (run `npm run setup` in the skill root once).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  laptop: { width: 1024, height: 768, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  tablet: { width: 834, height: 1112, isMobile: false, hasTouch: true, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

export const USER_AGENT = 'UniversalWebsiteCloner/1.0 (+authorized-inspection; contact: site owner on request)';

/** Minimal argv parser: `--key value`, `--key=value`, `--flag`. Repeated keys become arrays. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    let key = a.slice(2);
    let val = true;
    const eq = key.indexOf('=');
    if (eq !== -1) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
    if (key in out) out[key] = [].concat(out[key], val);
    else out[key] = val;
  }
  return out;
}

export function usageAndExit(text, args) {
  if (args.help || args.h) { console.log(text.trim() + '\n'); process.exit(0); }
}

export function die(message, code = 1) {
  console.error(`ERROR: ${redact(String(message))}`);
  process.exit(code);
}

export function num(v, d) { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== true ? n : d; }

export function slugify(s) {
  return String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'site';
}

export function hostSlug(url) {
  try { return slugify(new URL(url).host); } catch { return slugify(url); }
}

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
export function writeJson(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); return file; }
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

/** Default evidence folder: clone-workspace/<host>/evidence/<kind> (git-ignored). */
export function outDir(args, url, kind) {
  if (args.out && args.out !== true) return ensureDir(path.resolve(String(args.out)));
  return ensureDir(path.join(SKILL_ROOT, 'clone-workspace', hostSlug(url), 'evidence', kind));
}

export function requireUrl(args, hint = '--url https://example.com') {
  const url = args.url || args._[0];
  if (!url || url === true) die(`Missing target URL. Example: ${hint}`);
  try { return new URL(String(url)).toString(); } catch { die(`Invalid URL: ${url}`); }
}

// ---------- secrets hygiene ----------
const SECRET_ENV_HINT = /(PASS(WORD)?|SECRET|TOKEN|API_?KEY|COOKIE|SESSION|CRED)/i;
export function secretValues() {
  return Object.entries(process.env)
    .filter(([k, v]) => SECRET_ENV_HINT.test(k) && v && v.length >= 4)
    .map(([, v]) => v);
}
/** Replace any known secret value (and bearer tokens) with [REDACTED] before logging. */
export function redact(text) {
  let t = String(text);
  for (const s of secretValues()) t = t.split(s).join('[REDACTED]');
  return t.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]');
}
export function log(...a) { console.log(redact(a.join(' '))); }

// ---------- URL helpers ----------
const TRACKING = /^(utm_|fbclid|gclid|mc_|_ga|ref$)/i;
export function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch { return null; }
}
export function sameOrigin(a, b) { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } }
export function routeKey(url) { const u = new URL(url); return u.pathname + (u.search || ''); }
export function fileSafe(url) {
  const u = new URL(url);
  return slugify((u.pathname === '/' ? 'home' : u.pathname) + (u.search ? '-' + u.search : '')) || 'home';
}

// ---------- robots.txt (polite crawling, V11 guardrail) ----------
export async function fetchRobots(origin) {
  try {
    const res = await fetch(origin + '/robots.txt', { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { rules: [], sitemaps: [], found: false };
    const text = await res.text();
    return { ...parseRobots(text), found: true };
  } catch { return { rules: [], sitemaps: [], found: false }; }
}
export function parseRobots(text) {
  const rules = []; const sitemaps = []; let applies = false; let seenAgent = false;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*/, '').trim(); if (!line) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase(); const v = line.slice(idx + 1).trim();
    if (k === 'sitemap') sitemaps.push(v);
    else if (k === 'user-agent') { if (seenAgent && rules.length && !applies) { /* new group */ } applies = v === '*' || /universalwebsitecloner/i.test(v); seenAgent = true; }
    else if (applies && (k === 'disallow' || k === 'allow') && v) rules.push({ type: k, path: v });
  }
  return { rules, sitemaps };
}
export function robotsAllows(robots, pathname) {
  let best = null;
  for (const r of robots.rules) {
    const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp('^' + pat).test(pathname) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.type === 'allow';
}

// ---------- Playwright ----------
export async function loadPlaywright() {
  try { return await import('playwright'); }
  catch {
    die('Playwright is not installed. Run `npm run setup` in the skill root (installs playwright + Chromium). See INSTALL.md.');
  }
}

/** Launch Chromium and return { browser, newContext(viewportName, extra) }. */
export async function launch(args = {}) {
  const pw = await loadPlaywright();
  let browser;
  try { browser = await pw.chromium.launch({ headless: !args.headed }); }
  catch (e) { die(`Could not launch Chromium: ${String(e.message).split('\n')[0]}\nTry: npx playwright install chromium  (Linux may also need: npx playwright install-deps chromium)`); }
  const storageState = args['storage-state'] && args['storage-state'] !== true ? path.resolve(String(args['storage-state'])) : undefined;
  if (storageState && !fs.existsSync(storageState)) die(`Storage state not found: ${storageState}`);
  const newContext = (viewport = 'desktop', extra = {}) => {
    const v = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    return browser.newContext({
      viewport: { width: v.width, height: v.height },
      isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor,
      userAgent: args['user-agent'] && args['user-agent'] !== true ? String(args['user-agent']) : undefined,
      storageState,
      ignoreHTTPSErrors: !!args['ignore-https-errors'],
      reducedMotion: args['reduced-motion'] ? 'reduce' : 'no-preference',
      ...extra,
    });
  };
  return { browser, newContext, pw };
}

export function viewportList(args) {
  const raw = args.viewports && args.viewports !== true ? String(args.viewports) : 'desktop,mobile';
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!VIEWPORTS[n]) die(`Unknown viewport "${n}". Valid: ${Object.keys(VIEWPORTS).join(', ')}`);
  return names;
}

/** Scroll through page to trigger lazy loading, then return to top. */
export async function autoScroll(page, maxMs = 6000) {
  await page.evaluate(async (limit) => {
    const start = Date.now();
    await new Promise((resolve) => {
      let y = 0; const step = Math.max(300, window.innerHeight * 0.8);
      const t = setInterval(() => {
        window.scrollBy(0, step); y += step;
        if (y >= document.documentElement.scrollHeight || Date.now() - start > limit) { clearInterval(t); resolve(); }
      }, 120);
    });
    window.scrollTo(0, 0);
  }, maxMs);
}

export async function gotoSettled(page, url, timeout = 30000) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  return res;
}

/** Read the route list produced by crawl.mjs, or fall back to --routes a,b,c / the base URL. */
export function resolveRoutes(args, baseUrl) {
  if (args.routes && args.routes !== true) {
    return String(args.routes).split(',').map((r) => normalizeUrl(r.trim(), baseUrl)).filter(Boolean);
  }
  const file = args['routes-file'] && args['routes-file'] !== true ? String(args['routes-file']) : path.join(outDir({}, baseUrl, 'crawl'), 'routes.json');
  if (fs.existsSync(file)) {
    const data = readJson(file);
    return (data.routes || []).filter((r) => r.status && r.status < 400 && r.sameOrigin !== false).map((r) => r.url);
  }
  return [normalizeUrl(baseUrl)];
}

export function limitList(list, args, def = 25) {
  const max = num(args['max-routes'], def);
  return list.slice(0, max);
}
