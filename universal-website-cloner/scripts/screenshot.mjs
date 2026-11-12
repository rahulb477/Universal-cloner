#!/usr/bin/env node
// Screenshot capture for desktop/tablet/mobile (V2). Credentials are never typed here;
// use --storage-state (produced by auth-test.mjs) for authenticated pages.
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, autoScroll, resolveRoutes,
  limitList, viewportList, fileSafe, log, VIEWPORTS,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
screenshot.mjs - capture full-page screenshots per route and viewport

  node scripts/screenshot.mjs --url https://example.com [options]

Options:
  --routes /a,/b          Explicit routes (otherwise uses crawl output routes.json, else the URL itself)
  --routes-file FILE      Path to a routes.json from crawl.mjs
  --viewports LIST        desktop,laptop,tablet,mobile (default desktop,mobile)
  --max-routes N          Cap routes (default 25)
  --storage-state FILE    Authenticated session (never commit this file)
  --label NAME            Sub-folder label, e.g. reference or clone (default reference)
  --viewport-only         Capture the first viewport only (not full page)
  --reduced-motion        Emulate prefers-reduced-motion
  --freeze-animations     Disable CSS animations/transitions for stable diffs
  --out DIR               Output folder

Output: <out>/<label>/<viewport>/<route>.png and manifest.json
Sample: node scripts/screenshot.mjs --url http://localhost:3000 --label clone --viewports desktop,mobile
`, args);

const base = requireUrl(args);
const label = args.label && args.label !== true ? String(args.label) : 'reference';
const root = path.join(outDir(args, base, 'screenshots'), label);
const routes = limitList(resolveRoutes(args, base), args);
const viewports = viewportList(args);
const { browser, newContext } = await launch(args);
const manifest = { target: base, label, capturedAt: new Date().toISOString(), shots: [], failures: [] };

try {
  for (const vp of viewports) {
    const context = await newContext(vp);
    const page = await context.newPage();
    for (const url of routes) {
      try {
        const res = await gotoSettled(page, url);
        if (args['freeze-animations']) await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
        if (!args['viewport-only']) await autoScroll(page);
        await page.waitForTimeout(300);
        const file = path.join(root, vp, `${fileSafe(url)}.png`);
        await import('node:fs').then((fs) => fs.mkdirSync(path.dirname(file), { recursive: true }));
        await page.screenshot({ path: file, fullPage: !args['viewport-only'] });
        manifest.shots.push({ url, viewport: vp, size: VIEWPORTS[vp], status: res?.status() ?? null, file: path.relative(root, file) });
        log(`ok  ${vp.padEnd(7)} ${url}`);
      } catch (e) {
        manifest.failures.push({ url, viewport: vp, error: String(e.message).split('\n')[0] });
        log(`ERR ${vp.padEnd(7)} ${url}: ${String(e.message).split('\n')[0]}`);
      }
    }
    await context.close();
  }
} finally { await browser.close(); }

writeJson(path.join(root, 'manifest.json'), manifest);
log(`\n${manifest.shots.length} screenshots, ${manifest.failures.length} failures -> ${root}`);
if (manifest.failures.length && !manifest.shots.length) process.exit(2);
