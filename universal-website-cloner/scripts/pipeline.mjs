#!/usr/bin/env node
// Runs the evidence-gathering scripts in order against one URL (V2-V9 convenience wrapper).
// Each step is an independent script; a failing step is recorded but does not stop later steps.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, usageAndExit, requireUrl, SKILL_ROOT, writeJson, outDir, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
pipeline.mjs - run discovery + audit scripts in sequence

  node scripts/pipeline.mjs --url https://example.com [--mode reference|clone] [--steps a,b,c] [passthrough options]

Modes:
  reference (default)  crawl, screenshots, tokens, assets, interactions, console, links, a11y, perf
  clone                crawl, screenshots(label=clone), interactions, console, links, a11y, perf
Options:
  --steps LIST   Subset: crawl,screenshots,tokens,assets,interactions,console,links,a11y,perf
  --max-pages N / --max-routes N / --storage-state FILE / --viewports LIST are passed to the steps that accept them
Output: clone-workspace/<host>/evidence/pipeline-summary.json
Sample: node scripts/pipeline.mjs --url http://localhost:3000 --mode clone --max-pages 15
`, args);

const url = requireUrl(args);
const mode = args.mode === 'clone' ? 'clone' : 'reference';
const all = { crawl: 'crawl.mjs', screenshots: 'screenshot.mjs', tokens: 'extract-design-tokens.mjs', assets: 'extract-assets.mjs', interactions: 'discover-interactions.mjs', console: 'console-errors.mjs', links: 'check-links.mjs', a11y: 'a11y-check.mjs', perf: 'perf-audit.mjs' };
const defaults = mode === 'clone' ? ['crawl', 'screenshots', 'interactions', 'console', 'links', 'a11y', 'perf'] : Object.keys(all);
const steps = args.steps && args.steps !== true ? String(args.steps).split(',').map((s) => s.trim()) : defaults;
const pass = [];
for (const k of ['storage-state', 'max-pages', 'max-routes', 'viewports', 'ignore-robots', 'exclude', 'include']) if (args[k] !== undefined) pass.push(`--${k}`, ...(args[k] === true ? [] : [String(args[k])]));

const summary = [];
for (const s of steps) {
  if (!all[s]) { log(`Unknown step "${s}"`); continue; }
  const extra = s === 'screenshots' ? ['--label', mode === 'clone' ? 'clone' : 'reference'] : [];
  log(`\n=== ${s} ===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts', all[s]), '--url', url, ...pass, ...extra], { stdio: 'inherit' });
  summary.push({ step: s, exitCode: r.status, seconds: +((Date.now() - t) / 1000).toFixed(1) });
}
const file = path.join(outDir({}, url, '').replace(/[\\/]$/, ''), '..', 'pipeline-summary.json');
writeJson(path.resolve(file), { url, mode, finishedAt: new Date().toISOString(), summary, note: 'Exit code 1 from audit steps means findings were reported, not that the script crashed. Read each report.' });
log('\nSummary:'); for (const s of summary) log(`  ${s.exitCode === 0 ? 'ok      ' : 'findings'} ${s.step} (${s.seconds}s, exit ${s.exitCode})`);
