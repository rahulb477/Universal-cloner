#!/usr/bin/env node
// Console error / page error / failed request detection (V8).
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, autoScroll, resolveRoutes, limitList,
  viewportList, log,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
console-errors.mjs - collect console errors, uncaught exceptions, failed requests and HTTP >= 400

  node scripts/console-errors.mjs --url http://localhost:3000 [options]

Options:
  --routes /a,/b | --routes-file FILE   Pages to load (default: crawl output or the URL)
  --viewports LIST     default desktop,mobile
  --max-routes N       default 25
  --warnings           Include console warnings
  --storage-state FILE Authenticated session
Exit code: 1 when any error was captured on a same-origin page.
Output: console-report.json
Sample: node scripts/console-errors.mjs --url http://localhost:3000 --viewports desktop
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'console');
const routes = limitList(resolveRoutes(args, base), args);
const { browser, newContext } = await launch(args);
const findings = [];

try {
  for (const vp of viewportList(args)) {
    const context = await newContext(vp);
    for (const url of routes) {
      const page = await context.newPage();
      const add = (type, detail) => findings.push({ url, viewport: vp, type, ...detail });
      page.on('console', (m) => { if (m.type() === 'error' || (args.warnings && m.type() === 'warning')) add('console.' + m.type(), { text: m.text().slice(0, 500), location: m.location()?.url }); });
      page.on('pageerror', (e) => add('pageerror', { text: String(e.message).slice(0, 500) }));
      page.on('requestfailed', (r) => add('requestfailed', { text: `${r.method()} ${r.url()}`, reason: r.failure()?.errorText }));
      page.on('response', (r) => { if (r.status() >= 400) add('http-' + r.status(), { text: `${r.request().method()} ${r.url()}` }); });
      try { await gotoSettled(page, url); await autoScroll(page, 3000); await page.waitForTimeout(500); }
      catch (e) { add('navigation', { text: String(e.message).split('\n')[0] }); }
      await page.close();
      log(`checked ${vp.padEnd(7)} ${url}`);
    }
    await context.close();
  }
} finally { await browser.close(); }

writeJson(path.join(out, 'console-report.json'), { target: base, generatedAt: new Date().toISOString(), count: findings.length, findings });
log(`\n${findings.length} findings -> ${path.join(out, 'console-report.json')}`);
for (const f of findings.slice(0, 40)) log(`  [${f.viewport}] ${f.type} ${f.url}\n      ${f.text}`);
process.exit(findings.length ? 1 : 0);
