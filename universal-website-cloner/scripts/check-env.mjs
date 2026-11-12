#!/usr/bin/env node
// Capability check (V1/V7): verifies what is ACTUALLY available. Never assumes. Run at the start of every session.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseArgs, usageAndExit, loadPlaywright, SKILL_ROOT, writeJson, log } from './lib/common.mjs';
import path from 'node:path';

const args = parseArgs();
usageAndExit(`
check-env.mjs - report installed tools and capabilities

  node scripts/check-env.mjs [--json] [--no-browser]

Checks Node, npm, git, zip, Playwright, Chromium launch, pixelmatch/pngjs, axe-core, credentials env var NAMES (never values).
MCP servers cannot be probed from a script: use mcp-check.mjs for config files, then list tools inside your AI host.
`, args);

const require = createRequire(import.meta.url);
const results = [];
const add = (name, ok, detail = '', required = false) => { results.push({ name, ok, detail, required }); };
const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8', shell: process.platform === 'win32' }); return r.status === 0 ? (r.stdout || r.stderr).trim().split('\n')[0] : null; };

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('node', nodeMajor >= 18, `v${process.versions.node} (need >= 18.17)`, true);
for (const [n, a] of [['npm', ['-v']], ['git', ['--version']], ['zip', ['-v']], ['python3', ['--version']]]) { const v = run(n, a); add(n, !!v, v || 'not found', n === 'npm'); }
for (const p of ['playwright', 'pngjs', 'pixelmatch', 'axe-core']) { try { require.resolve(p); add(p, true, 'installed'); } catch { try { await import(p); add(p, true, 'installed'); } catch { add(p, false, p === 'axe-core' ? 'optional: enables full a11y rules' : 'run `npm run setup`', p !== 'axe-core'); } } }
if (!args['no-browser']) {
  try {
    const pw = await import('playwright'); const b = await pw.chromium.launch(); const v = b.version(); await b.close(); add('chromium launch', true, `Chromium ${v}`, true);
  } catch (e) { add('chromium launch', false, String(e.message).split('\n')[0] + ' | try: npx playwright install chromium', true); }
}
void loadPlaywright;
const names = ['SITE_USERNAME', 'SITE_PASSWORD'].map((n) => `${n}=${process.env[n] ? 'set' : 'unset'}`).join(', ');
add('credential env vars (names only)', true, names + ' (only needed for authenticated sites)');

if (args.json) { console.log(JSON.stringify(results, null, 2)); } else {
  log(`Universal Website Cloner - environment check\n`);
  for (const r of results) log(`${r.ok ? 'OK  ' : r.required ? 'MISS' : 'warn'}  ${r.name.padEnd(34)} ${r.detail}`);
  const missing = results.filter((r) => r.required && !r.ok);
  log(missing.length ? `\n${missing.length} required capability(ies) missing. Browser-based scripts will not work until fixed; use the MCP/manual fallback in workflows/fallback-no-browser.md.` : '\nAll required capabilities present for script-based browser automation.');
  log('\nMCP: not verifiable from a script. Run `node scripts/mcp-check.mjs`, then confirm tool availability inside your AI host.');
}
writeJson(path.join(SKILL_ROOT, 'clone-workspace', '_env-check.json'), { checkedAt: new Date().toISOString(), results });
process.exit(results.some((r) => r.required && !r.ok) ? 1 : 0);
