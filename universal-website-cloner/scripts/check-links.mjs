#!/usr/bin/env node
// Link validation + broken asset detection (V8). Works on the reference site or on the local clone.
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, resolveRoutes, limitList,
  normalizeUrl, sameOrigin, log, USER_AGENT, num,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
check-links.mjs - find broken links, images, scripts, stylesheets and fonts

  node scripts/check-links.mjs --url http://localhost:3000 [options]

Options:
  --routes /a,/b | --routes-file FILE   Pages to scan (default: crawl output or the URL)
  --max-routes N       Cap pages (default 25)
  --external           Also check external links (HEAD, then GET fallback); off by default
  --concurrency N      Parallel checks (default 6)
  --storage-state FILE Authenticated session
Exit code: 1 when broken internal links/assets are found.
Output: link-report.json, link-report.md
Sample: node scripts/check-links.mjs --url http://localhost:3000 --routes /,/pricing
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'links');
const routes = limitList(resolveRoutes(args, base), args);
const concurrency = num(args.concurrency, 6);
const { browser, newContext } = await launch(args);
const context = await newContext('desktop');
const page = await context.newPage();

const targets = new Map(); // url -> {kinds:Set, pages:Set}
function add(url, kind, from) {
  const n = normalizeUrl(url); if (!n) return;
  if (!args.external && !sameOrigin(n, base)) return;
  const t = targets.get(n) || { kinds: new Set(), pages: new Set() };
  t.kinds.add(kind); t.pages.add(from); targets.set(n, t);
}

try {
  for (const url of routes) {
    try {
      await gotoSettled(page, url);
      const found = await page.evaluate(() => {
        const abs = (v) => { try { return new URL(v, location.href).toString(); } catch { return null; } };
        const pick = (sel, attr, kind) => [...document.querySelectorAll(sel)].map((e) => ({ url: abs(e.getAttribute(attr) || ''), kind })).filter((x) => x.url);
        return [
          ...pick('a[href]', 'href', 'link'), ...pick('img[src]', 'src', 'image'), ...pick('script[src]', 'src', 'script'),
          ...pick('link[rel=stylesheet][href]', 'href', 'stylesheet'), ...pick('link[rel*=icon][href]', 'href', 'icon'),
          ...pick('source[src]', 'src', 'media'), ...pick('video[src],audio[src]', 'src', 'media'), ...pick('link[rel=preload][as=font][href]', 'href', 'font'),
        ];
      });
      for (const f of found) add(f.url, f.kind, url);
      // Fragment anchors that point nowhere on the same page
      const badAnchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1 && !document.getElementById(h.slice(1)) && !document.getElementsByName(h.slice(1)).length));
      for (const h of badAnchors) add(url + h, 'anchor-missing', url);
      log(`scanned ${url}`);
    } catch (e) { log(`ERR scanning ${url}: ${String(e.message).split('\n')[0]}`); }
  }
} finally { await browser.close(); }

const results = [];
const list = [...targets.entries()].filter(([u, t]) => !t.kinds.has('anchor-missing') || t.kinds.size > 1 || true);
async function check([url, t]) {
  if (t.kinds.has('anchor-missing')) { results.push({ url, kinds: [...t.kinds], pages: [...t.pages], status: 'missing-anchor', ok: false }); return; }
  const tryFetch = async (method) => fetch(url, { method, redirect: 'follow', headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(12000) });
  try {
    let r = await tryFetch('HEAD');
    if (r.status === 405 || r.status === 403 || r.status === 501) r = await tryFetch('GET');
    results.push({ url, kinds: [...t.kinds], pages: [...t.pages].slice(0, 5), status: r.status, ok: r.status < 400 });
  } catch (e) { results.push({ url, kinds: [...t.kinds], pages: [...t.pages].slice(0, 5), status: 'network-error', error: String(e.message).split('\n')[0], ok: false }); }
}
let i = 0;
await Promise.all(Array.from({ length: concurrency }, async () => { while (i < list.length) await check(list[i++]); }));

const broken = results.filter((r) => !r.ok).sort((a, b) => a.url.localeCompare(b.url));
const internalBroken = broken.filter((r) => sameOrigin(r.url, base));
writeJson(path.join(out, 'link-report.json'), { target: base, checked: results.length, broken, generatedAt: new Date().toISOString() });
import('node:fs').then((fs) => fs.writeFileSync(path.join(out, 'link-report.md'), ['# Link & asset report', '', `Checked ${results.length} unique URLs across ${routes.length} pages. Broken: ${broken.length}.`, '', '| URL | Kind | Status | Found on |', '|---|---|---|---|', ...broken.map((b) => `| ${b.url} | ${b.kinds.join(',')} | ${b.status} | ${b.pages[0]} |`), ''].join('\n')));
log(`\nChecked ${results.length} URLs; broken: ${broken.length} (internal ${internalBroken.length}) -> ${out}`);
for (const b of broken.slice(0, 30)) log(`  BROKEN [${b.status}] ${b.kinds.join(',')} ${b.url}  (on ${b.pages[0]})`);
process.exit(internalBroken.length ? 1 : 0);
