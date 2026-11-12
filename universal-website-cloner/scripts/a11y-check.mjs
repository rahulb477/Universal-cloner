#!/usr/bin/env node
// Basic accessibility checks (V8). Heuristic DOM rules always run; if `axe-core` is installed
// (optionalDependency) the full axe rule set also runs. Automated checks catch only a portion of
// real issues: manual keyboard + screen-reader review is still required (see checklists/accessibility.md).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, resolveRoutes, limitList, log,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
a11y-check.mjs - heuristic + axe-core accessibility audit and keyboard focus walk

  node scripts/a11y-check.mjs --url http://localhost:3000 [options]

Options:
  --routes /a,/b | --routes-file FILE   default: crawl output or the URL
  --max-routes N          default 25
  --tabs N                Tab presses for the keyboard walk (default 25)
  --no-axe                Skip axe-core even if installed
  --storage-state FILE    Authenticated session
Exit code: 1 when serious/critical axe violations or heuristic errors are found.
Output: a11y-report.json, a11y-report.md
Sample: node scripts/a11y-check.mjs --url http://localhost:3000 --routes /,/login
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'a11y');
const routes = limitList(resolveRoutes(args, base), args);
const tabs = Number(args.tabs) || 25;
const require = createRequire(import.meta.url);
let axeSource = null;
if (!args['no-axe']) { try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { log('axe-core not installed; running heuristic checks only.'); } }

const { browser, newContext } = await launch(args);
const context = await newContext('desktop');
const page = await context.newPage();
const report = [];

try {
  for (const url of routes) {
    const entry = { url, heuristics: [], axe: null, keyboard: null };
    try {
      await gotoSettled(page, url);
      entry.heuristics = await page.evaluate(() => {
        const issues = []; const add = (sev, rule, el, msg) => issues.push({ severity: sev, rule, element: el ? (el.outerHTML || '').slice(0, 140) : null, message: msg });
        if (!document.documentElement.lang) add('error', 'html-lang', null, '<html> has no lang attribute');
        if (!document.title.trim()) add('error', 'document-title', null, 'Page has no <title>');
        const h1 = document.querySelectorAll('h1'); if (h1.length !== 1) add('warning', 'h1-count', null, `Expected exactly one <h1>, found ${h1.length}`);
        let prev = 0; document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => { const l = +h.tagName[1]; if (prev && l > prev + 1) add('warning', 'heading-order', h, `Heading jumps from h${prev} to h${l}`); prev = l; });
        document.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('alt')) add('error', 'img-alt', i, 'Image missing alt attribute'); });
        document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea').forEach((f) => {
          const labelled = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) || f.closest('label') || f.getAttribute('title');
          if (!labelled) add('error', 'form-label', f, 'Form control has no accessible label');
        });
        document.querySelectorAll('button,[role=button]').forEach((b) => { if (!(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title') && !b.querySelector('img[alt]')) add('error', 'button-name', b, 'Button has no accessible name'); });
        document.querySelectorAll('a[href]').forEach((a) => { if (!(a.textContent || '').trim() && !a.getAttribute('aria-label') && !a.getAttribute('title') && !a.querySelector('img[alt]:not([alt=""])')) add('error', 'link-name', a, 'Link has no accessible name'); });
        const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.entries(ids).filter(([, c]) => c > 1).forEach(([id]) => add('error', 'duplicate-id', null, `Duplicate id "${id}"`));
        if (!document.querySelector('main,[role=main]')) add('warning', 'landmark-main', null, 'No <main> landmark');
        if (!document.querySelector('meta[name=viewport]')) add('warning', 'viewport-meta', null, 'No viewport meta tag');
        document.querySelectorAll('[tabindex]').forEach((e) => { if (+e.getAttribute('tabindex') > 0) add('warning', 'tabindex-positive', e, 'Positive tabindex disrupts natural order'); });
        return issues;
      });
      if (axeSource) {
        await page.evaluate(axeSource);
        entry.axe = await page.evaluate(async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.html?.slice(0, 140) })); });
      }
      // Keyboard walk: Tab through, record focus order and visible-focus heuristic.
      await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
      const stops = [];
      for (let i = 0; i < tabs; i++) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), name: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 40), visibleFocus: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' }; });
        if (s) stops.push(s);
      }
      entry.keyboard = { focusStops: stops.length, withoutVisibleFocus: stops.filter((s) => !s.visibleFocus).length, order: stops.map((s) => `${s.tag}:${s.name}`) };
    } catch (e) { entry.error = String(e.message).split('\n')[0]; }
    report.push(entry);
    log(`audited ${url}`);
  }
} finally { await browser.close(); }

writeJson(path.join(out, 'a11y-report.json'), { target: base, generatedAt: new Date().toISOString(), axe: !!axeSource, report });
const lines = ['# Accessibility report', '', 'Automated checks are partial; manual review required.', ''];
let failing = 0;
for (const r of report) {
  const errs = r.heuristics.filter((h) => h.severity === 'error'); const serious = (r.axe || []).filter((v) => ['serious', 'critical'].includes(v.impact));
  failing += errs.length + serious.length;
  lines.push(`## ${r.url}`, `- Heuristic errors: ${errs.length}, warnings: ${r.heuristics.length - errs.length}`, `- axe serious/critical: ${r.axe ? serious.length : 'n/a'}`, `- Keyboard: ${r.keyboard ? `${r.keyboard.focusStops} stops, ${r.keyboard.withoutVisibleFocus} without visible focus indicator` : 'n/a'}`);
  for (const h of r.heuristics.slice(0, 15)) lines.push(`  - [${h.severity}] ${h.rule}: ${h.message}`);
  for (const v of (r.axe || []).slice(0, 15)) lines.push(`  - [axe ${v.impact}] ${v.id}: ${v.help} (${v.nodes} nodes)`);
  lines.push('');
}
fs.writeFileSync(path.join(out, 'a11y-report.md'), lines.join('\n'));
log(`\nA11y blocking findings: ${failing} -> ${path.join(out, 'a11y-report.md')}`);
process.exit(failing ? 1 : 0);
