#!/usr/bin/env node
// Repository quality gate (V8/V10): JSON validity, script syntax, markdown links, version consistency,
// required files, agent roster, front matter, --help presence, secret scan. Dependency-free.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, usageAndExit, SKILL_ROOT, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
validate-repo.mjs - validate the skill repository itself

  node scripts/validate-repo.mjs [--json]

Exit code 1 if any check fails. Run before packaging (package-zip.mjs runs it automatically).
`, args);

const SKIP = new Set(['node_modules', '.git', 'clone-workspace', 'dist', 'artifacts', '.auth']);
const all = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } })(SKILL_ROOT);
const rel = (p) => path.relative(SKILL_ROOT, p).split(path.sep).join('/');
const results = []; const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// required files
const REQUIRED = ['SKILL.md', 'README.md', 'INSTALL.md', 'CHANGELOG.md', 'VERSION.md', 'PROMPT-START-HERE.md', 'package.json', '.gitignore', 'docs/architecture.md', 'docs/setup.md', 'docs/troubleshooting.md', 'docs/security.md', 'docs/version-history.md', 'docs/limitations.md', 'agents/README.md', 'workflows/README.md', 'mcp/README.md', 'integrations/README.md', 'scripts/lib/common.mjs', 'testing/selftest.mjs'];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(SKILL_ROOT, f)));
check('required files present', !missing.length, missing.join(', '));
const hosts = ['claude-code', 'codex', 'cursor', 'github-copilot', 'opencode', 'gemini-cli', 'hosted-builders'];
check('integration folders present', hosts.every((h) => fs.existsSync(path.join(SKILL_ROOT, 'integrations', h, 'README.md'))), hosts.filter((h) => !fs.existsSync(path.join(SKILL_ROOT, 'integrations', h, 'README.md'))).join(', '));

// JSON
const badJson = [];
for (const f of all.filter((f) => f.endsWith('.json') && !f.endsWith('package-lock.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')); } catch (e) { badJson.push(`${rel(f)}: ${e.message}`); } }
check('JSON files parse', !badJson.length, badJson.join('; '));

// script syntax + help
const mjs = all.filter((f) => f.endsWith('.mjs')); const syntax = [];
for (const f of mjs) { const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); if (r.status !== 0) syntax.push(`${rel(f)}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'syntax error'}`); }
check(`script syntax (${mjs.length} .mjs files, node --check)`, !syntax.length, syntax.join('; '));
const noHelp = mjs.filter((f) => rel(f).startsWith('scripts/') && !rel(f).startsWith('scripts/lib/') && !fs.readFileSync(f, 'utf8').includes('usageAndExit(`'));
check('every script documents --help', !noHelp.length, noHelp.map(rel).join(', '));

// markdown links
const md = all.filter((f) => f.endsWith('.md')); const broken = [];
for (const f of md) {
  const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1]; if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]); if (!clean) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), clean))) broken.push(`${rel(f)} -> ${target}`);
  }
}
check(`markdown relative links (${md.length} files)`, !broken.length, broken.join('; '));

// front matter
const skill = fs.existsSync(path.join(SKILL_ROOT, 'SKILL.md')) ? fs.readFileSync(path.join(SKILL_ROOT, 'SKILL.md'), 'utf8') : '';
const fm = (skill.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
check('SKILL.md front matter (name, description)', /^name:\s*\S+/m.test(fm) && /^description:\s*\S+/m.test(fm));

// agents
const agentsReadme = fs.existsSync(path.join(SKILL_ROOT, 'agents/README.md')) ? fs.readFileSync(path.join(SKILL_ROOT, 'agents/README.md'), 'utf8') : '';
const agentFiles = fs.existsSync(path.join(SKILL_ROOT, 'agents')) ? fs.readdirSync(path.join(SKILL_ROOT, 'agents')).filter((n) => /^\d\d-.*\.md$/.test(n)) : [];
check('15 agent definitions, all referenced in agents/README.md', agentFiles.length === 15 && agentFiles.every((n) => agentsReadme.includes(n)), `found ${agentFiles.length}`);

// version consistency
let version = null; try { version = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'package.json'), 'utf8')).version; } catch { /* reported above */ }
const versionMd = fs.existsSync(path.join(SKILL_ROOT, 'VERSION.md')) ? fs.readFileSync(path.join(SKILL_ROOT, 'VERSION.md'), 'utf8') : '';
const changelog = fs.existsSync(path.join(SKILL_ROOT, 'CHANGELOG.md')) ? fs.readFileSync(path.join(SKILL_ROOT, 'CHANGELOG.md'), 'utf8') : '';
check('version consistent (package.json / VERSION.md / CHANGELOG.md)', !!version && versionMd.includes(version) && changelog.includes(`[${version}]`), `package.json=${version}`);

// secrets
const sec = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts/scan-secrets.mjs'), SKILL_ROOT], { encoding: 'utf8' });
check('no secrets / session files in repo', sec.status === 0, (sec.stderr || '').split('\n').slice(0, 4).join(' | '));

const failed = results.filter((r) => !r.ok);
if (args.json) console.log(JSON.stringify(results, null, 2));
else { for (const r of results) log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n        ' + r.detail}`); log(`\n${results.length - failed.length}/${results.length} checks passed.`); }
process.exit(failed.length ? 1 : 0);
