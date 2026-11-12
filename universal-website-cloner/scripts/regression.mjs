#!/usr/bin/env node
// Visual regression runner (V8): captures current screenshots of the clone and diffs them against a stored baseline.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, usageAndExit, requireUrl, SKILL_ROOT, hostSlug, ensureDir, log, die } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
regression.mjs - screenshot the clone and compare with a baseline

  node scripts/regression.mjs --url http://localhost:3000 [options]

Options:
  --baseline DIR      Baseline folder (default clone-workspace/<host>/baseline)
  --update            Create/refresh the baseline from the current run (do this only after review)
  --max-mismatch PCT  Fail threshold per image (default 1)
  --routes / --viewports / --max-routes / --storage-state are passed to screenshot.mjs
Exit code: 0 pass, 1 regressions found.
Sample: node scripts/regression.mjs --url http://localhost:3000 --update   # first run, then later without --update
`, args);

const url = requireUrl(args);
const work = path.join(SKILL_ROOT, 'clone-workspace', hostSlug(url));
const baseline = args.baseline && args.baseline !== true ? path.resolve(String(args.baseline)) : path.join(work, 'baseline');
const current = ensureDir(path.join(work, 'regression', 'current'));
const diffOut = path.join(work, 'regression', 'diff');
fs.rmSync(path.join(current, 'current'), { recursive: true, force: true });
const pass = [];
for (const k of ['routes', 'viewports', 'max-routes', 'storage-state', 'routes-file']) if (args[k] !== undefined && args[k] !== true) pass.push(`--${k}`, String(args[k]));

const shot = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts', 'screenshot.mjs'), '--url', url, '--out', current, '--label', 'current', '--freeze-animations', ...pass], { stdio: 'inherit' });
if (shot.status !== 0) die('Screenshot capture failed; cannot run regression.', 2);
const currentDir = path.join(current, 'current');
if (args.update || !fs.existsSync(baseline)) {
  ensureDir(baseline); fs.cpSync(currentDir, baseline, { recursive: true });
  log(`Baseline ${args.update ? 'updated' : 'created (none existed)'} at ${baseline}`); process.exit(0);
}
const d = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts', 'visual-diff.mjs'), '--reference', baseline, '--candidate', currentDir, '--out', diffOut, '--max-mismatch', String(args['max-mismatch'] ?? 1)], { stdio: 'inherit' });
process.exit(d.status ?? 1);
