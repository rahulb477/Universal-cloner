#!/usr/bin/env node
// Create a clone workspace from templates/ and a state file (V1/V12). The workspace is git-ignored.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, usageAndExit, requireUrl, SKILL_ROOT, hostSlug, ensureDir, die, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
init-project.mjs - scaffold clone-workspace/<host>/ with all report templates

  node scripts/init-project.mjs --url https://example.com [--auth required|none|unknown] [--force]

Creates: reports/*.md (from templates/), evidence/, provenance.md, state.json, project/ (where the clone code goes).
`, args);

const url = requireUrl(args);
const slug = hostSlug(url);
const ws = path.join(SKILL_ROOT, 'clone-workspace', slug);
if (fs.existsSync(ws) && !args.force) die(`Workspace exists: ${ws} (use --force to overwrite templates)`);
ensureDir(path.join(ws, 'reports')); ensureDir(path.join(ws, 'evidence')); ensureDir(path.join(ws, 'project'));
const tdir = path.join(SKILL_ROOT, 'templates');
for (const f of fs.readdirSync(tdir).filter((n) => n.endsWith('.md'))) {
  const text = fs.readFileSync(path.join(tdir, f), 'utf8').replaceAll('{{TARGET_URL}}', url).replaceAll('{{SITE_SLUG}}', slug).replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));
  fs.writeFileSync(path.join(ws, 'reports', f), text);
}
fs.writeFileSync(path.join(ws, 'provenance.md'), `# Provenance log\n\nTarget: ${url}\nStarted: ${new Date().toISOString()}\n\nRecord every authorisation statement, robots.txt decision, and asset-licence decision here.\n\n- [ ] User confirmed they own or are authorised to inspect/reproduce this site\n- [ ] robots.txt reviewed\n- [ ] Terms of service reviewed (note restrictions)\n- [ ] Branding/copy/assets: replaced with original or licensed material before any public release\n`);
const st = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts', 'state.mjs'), 'init', '--url', url, '--auth', String(args.auth || 'unknown'), '--force'], { encoding: 'utf8' });
if (st.status !== 0) die(st.stderr);
log(`Workspace ready: ${path.relative(process.cwd(), ws) || ws}\n  reports/   fill these in as you work\n  evidence/  populated by the scripts\n  project/   the independent clone lives here`);
