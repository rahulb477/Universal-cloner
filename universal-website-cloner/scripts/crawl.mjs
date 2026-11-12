#!/usr/bin/env node
// Route discovery crawler (V2). Breadth-first, same-origin, robots.txt-aware, rate-limited.
// Also reads sitemap.xml and (optionally) captures nav/menu/footer links and framework hints.
// Requirements: playwright (npm run setup). Usage: see --help.
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, normalizeUrl,
  sameOrigin, fetchRobots, robotsAllows, num, log, fileSafe, USER_AGENT,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
crawl.mjs - discover routes of an AUTHORIZED website

  node scripts/crawl.mjs --url https://example.com [options]

Options:
  --max-pages N         Max pages to visit (default 40)
  --max-depth N         Max link depth (default 3)
  --delay MS            Delay between page loads (default 400)
  --storage-state FILE  Playwright storage state for authenticated crawling
  --ignore-robots       Do NOT use unless the site owner explicitly authorised it (logged in report)
  --include REGEX       Only follow URLs whose path matches
  --exclude REGEX       Skip URLs whose path matches (e.g. "logout|signout|delete")
  --out DIR             Output folder (default clone-workspace/<host>/evidence/crawl)
  --headed              Show the browser

Output: routes.json, routes.md, sitemap-urls.json, nav-structure.json
Sample: node scripts/crawl.mjs --url http://localhost:4010 --max-pages 20 --exclude "logout"
`, args);

const start = requireUrl(args);
const origin = new URL(start).origin;
const maxPages = num(args['max-pages'], 40);
const maxDepth = num(args['max-depth'], 3);
const delay = num(args.delay, 400);
const include = args.include && args.include !== true ? new RegExp(String(args.include)) : null;
const exclude = new RegExp(args.exclude && args.exclude !== true ? String(args.exclude) : '(^|/)(logout|signout|sign-out|log-out|delete|remove)(/|$|\\?)', 'i');
const out = outDir(args, start, 'crawl');

const robots = args['ignore-robots'] ? { rules: [], sitemaps: [], found: false } : await fetchRobots(origin);
if (args['ignore-robots']) log('WARNING: robots.txt ignored by explicit request; this is recorded in the report.');

async function sitemapUrls() {
  const found = new Set();
  const queue = [...new Set([...robots.sitemaps, origin + '/sitemap.xml'])];
  const seen = new Set();
  while (queue.length && seen.size < 10) {
    const sm = queue.shift(); if (seen.has(sm)) continue; seen.add(sm);
    try {
      const r = await fetch(sm, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const xml = await r.text();
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        const u = normalizeUrl(m[1]);
        if (!u) continue;
        if (/\.xml(\.gz)?$/i.test(u)) queue.push(u); else if (sameOrigin(u, origin)) found.add(u);
      }
    } catch { /* ignore */ }
  }
  return [...found];
}

const { browser, newContext } = await launch(args);
const context = await newContext('desktop', { userAgent: USER_AGENT });
const page = await context.newPage();

const visited = new Map(); // url -> record
const queue = [{ url: normalizeUrl(start), depth: 0, from: null }];
const external = new Map();
const sm = await sitemapUrls();
for (const u of sm.slice(0, maxPages * 2)) queue.push({ url: u, depth: 1, from: 'sitemap.xml' });
const navStructure = {};

try {
  while (queue.length && visited.size < maxPages) {
    const { url, depth, from } = queue.shift();
    if (!url || visited.has(url)) continue;
    const u = new URL(url);
    const routeName = u.pathname + u.search;
    if (!robotsAllows(robots, u.pathname)) { visited.set(url, { url, route: routeName, status: null, skipped: 'robots.txt', from, depth }); continue; }
    if (exclude.test(routeName) && url !== normalizeUrl(start)) { visited.set(url, { url, route: routeName, status: null, skipped: 'excluded', from, depth }); continue; }
    if (include && !include.test(u.pathname) && url !== normalizeUrl(start)) continue;

    const rec = { url, route: u.pathname + u.search, depth, from, status: null, title: null, sameOrigin: true };
    try {
      const res = await gotoSettled(page, url);
      rec.status = res ? res.status() : null;
      rec.finalUrl = page.url();
      rec.title = await page.title();
      const info = await page.evaluate(() => {
        const abs = (h) => { try { return new URL(h, location.href).toString(); } catch { return null; } };
        const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: abs(a.getAttribute('href')), text: (a.textContent || '').trim().slice(0, 80), region: a.closest('nav') ? 'nav' : a.closest('footer') ? 'footer' : a.closest('header') ? 'header' : a.closest('aside') ? 'sidebar' : 'content' })).filter((l) => l.href);
        const forms = document.querySelectorAll('form').length;
        const pw = !!document.querySelector('input[type=password]');
        const gen = document.querySelector('meta[name=generator]')?.content || null;
        const fw = [];
        if (window.__NEXT_DATA__ || document.getElementById('__next') || document.querySelector('script[src*="/_next/"]')) fw.push('Next.js');
        if (window.__NUXT__ || document.getElementById('__nuxt')) fw.push('Nuxt');
        if (window.React || document.querySelector('[data-reactroot]')) fw.push('React');
        if (window.Vue || document.querySelector('[data-v-app]')) fw.push('Vue');
        if (window.angular || document.querySelector('[ng-version]')) fw.push('Angular');
        if (document.querySelector('script[src*="wp-content"],link[href*="wp-content"]')) fw.push('WordPress');
        if (window.Shopify) fw.push('Shopify');
        if (document.querySelector('[class*="tailwind"],[class*="tw-"]')) fw.push('Tailwind-like classes');
        if (document.querySelector('link[href*="bootstrap"]')) fw.push('Bootstrap');
        return { links, forms, hasPasswordField: pw, generator: gen, frameworks: fw, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 120) || null };
      });
      Object.assign(rec, { forms: info.forms, hasPasswordField: info.hasPasswordField, generator: info.generator, frameworks: info.frameworks, h1: info.h1 });
      if (new URL(rec.finalUrl).pathname !== u.pathname && /login|signin|sign-in|auth/i.test(rec.finalUrl)) rec.requiresAuth = true;
      if (rec.status === 401 || rec.status === 403) rec.requiresAuth = true;
      navStructure[rec.route] = info.links.filter((l) => l.region !== 'content').slice(0, 200);
      for (const l of info.links) {
        const n = normalizeUrl(l.href);
        if (!n) continue;
        if (!sameOrigin(n, origin)) { external.set(n, (external.get(n) || 0) + 1); continue; }
        if (/\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|mp4|webm|css|js|woff2?|ttf)(\?|$)/i.test(n)) continue;
        if (depth + 1 <= maxDepth && !visited.has(n)) queue.push({ url: n, depth: depth + 1, from: url });
      }
      log(`[${visited.size + 1}] ${rec.status} ${rec.route}  ${rec.title || ''}`);
    } catch (e) {
      rec.error = String(e.message).split('\n')[0];
      log(`[${visited.size + 1}] ERR ${rec.route}: ${rec.error}`);
    }
    visited.set(url, rec);
    await page.waitForTimeout(delay);
  }
} finally {
  await browser.close();
}

const routes = [...visited.values()];
const result = {
  target: start, origin, crawledAt: new Date().toISOString(), tool: 'crawl.mjs',
  robots: { respected: !args['ignore-robots'], found: robots.found, ruleCount: robots.rules.length },
  limits: { maxPages, maxDepth, delay }, routes,
  external: [...external.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count).slice(0, 200),
  notes: queue.length ? `${queue.length} discovered URLs were not visited because --max-pages (${maxPages}) was reached.` : 'Crawl exhausted the discovered link graph within limits.',
};
writeJson(path.join(out, 'routes.json'), result);
writeJson(path.join(out, 'sitemap-urls.json'), sm);
writeJson(path.join(out, 'nav-structure.json'), navStructure);
const md = ['# Route inventory (auto-generated)', '', `Target: ${start}`, `Crawled: ${result.crawledAt}`, `robots.txt respected: ${result.robots.respected}`, '', '| Route | Status | Title | Auth? | Forms | Frameworks | Note |', '|---|---|---|---|---|---|---|',
  ...routes.map((r) => `| ${r.route || r.url} | ${r.status ?? '-'} | ${(r.title || '').replace(/\|/g, '/')} | ${r.requiresAuth ? 'likely' : ''}${r.hasPasswordField ? ' (password field)' : ''} | ${r.forms ?? ''} | ${(r.frameworks || []).join(', ')} | ${r.skipped || r.error || ''} |`), '', `> ${result.notes}`, ''];
import('node:fs').then((fs) => fs.writeFileSync(path.join(out, 'routes.md'), md.join('\n')));
log(`\nDone. ${routes.length} routes recorded -> ${path.join(out, 'routes.json')}`);
void fileSafe;
