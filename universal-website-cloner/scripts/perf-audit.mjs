#!/usr/bin/env node
// Lightweight performance audit (V8): navigation timing, FCP, LCP, CLS, request counts and transfer weight.
// This is a lab measurement from one machine, not a Lighthouse replacement. Use Lighthouse / chrome-devtools MCP for deeper traces.
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, resolveRoutes, limitList, viewportList, log, num,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
perf-audit.mjs - measure load performance per route

  node scripts/perf-audit.mjs --url http://localhost:3000 [options]

Options:
  --routes /a,/b | --routes-file FILE   default: crawl output or the URL
  --viewports LIST       default desktop,mobile
  --runs N               Repetitions per route; median reported (default 3)
  --budget-lcp MS        Fail if median LCP exceeds this (default 4000)
  --budget-cls F         Fail if median CLS exceeds this (default 0.25)
  --max-routes N         default 10
Output: perf-report.json, perf-report.md
Sample: node scripts/perf-audit.mjs --url http://localhost:3000 --runs 3
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'perf');
const routes = limitList(resolveRoutes(args, base), args, 10);
const runs = num(args.runs, 3);
const budgetLcp = num(args['budget-lcp'], 4000);
const budgetCls = num(args['budget-cls'], 0.25);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

const { browser, newContext } = await launch(args);
const rows = [];
try {
  for (const vp of viewportList(args)) {
    for (const url of routes) {
      const samples = [];
      for (let i = 0; i < runs; i++) {
        const context = await newContext(vp);
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.__perf = { lcp: 0, cls: 0, fcp: 0 };
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
        });
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 45000 });
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
          samples.push(await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource');
            const byType = {}; let bytes = 0;
            for (const r of res) { byType[r.initiatorType] = (byType[r.initiatorType] || 0) + 1; bytes += r.transferSize || 0; }
            return { ttfb: nav ? nav.responseStart : null, domContentLoaded: nav ? nav.domContentLoadedEventEnd : null, load: nav ? nav.loadEventEnd : null, ...window.__perf, requests: res.length, transferKB: Math.round(bytes / 1024), byType, domNodes: document.getElementsByTagName('*').length };
          }));
        } catch (e) { samples.push({ error: String(e.message).split('\n')[0] }); }
        await context.close();
      }
      const ok = samples.filter((s) => !s.error);
      const row = { url, viewport: vp, runs: samples.length, failedRuns: samples.length - ok.length };
      for (const k of ['ttfb', 'fcp', 'lcp', 'cls', 'load', 'requests', 'transferKB', 'domNodes']) row[k] = ok.length ? +median(ok.map((s) => s[k] ?? 0)).toFixed(k === 'cls' ? 3 : 0) : null;
      row.budgetOk = ok.length > 0 && row.lcp <= budgetLcp && row.cls <= budgetCls;
      rows.push(row); log(`${vp.padEnd(7)} ${url}  LCP ${row.lcp}ms  CLS ${row.cls}  ${row.requests} req  ${row.transferKB}KB`);
    }
  }
} finally { await browser.close(); }

writeJson(path.join(out, 'perf-report.json'), { target: base, generatedAt: new Date().toISOString(), runs, budgets: { lcp: budgetLcp, cls: budgetCls }, rows, caveat: 'Single-machine lab data; localhost removes network latency.' });
import('node:fs').then((fs) => fs.writeFileSync(path.join(out, 'perf-report.md'), ['# Performance report', '', '| Route | VP | TTFB | FCP | LCP | CLS | Req | KB | Budget |', '|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.url} | ${r.viewport} | ${r.ttfb} | ${r.fcp} | ${r.lcp} | ${r.cls} | ${r.requests} | ${r.transferKB} | ${r.budgetOk ? 'pass' : 'FAIL'} |`), ''].join('\n')));
process.exit(rows.some((r) => !r.budgetOk) ? 1 : 0);
