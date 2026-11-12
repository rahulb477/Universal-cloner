#!/usr/bin/env node
// End-to-end self-test of the scripts against the local fixture site. Proves detectors detect and passes pass.
// Requires: `npm run setup` (playwright + chromium). Prints an honest PASS/FAIL/SKIP table; nothing is faked.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { FIXTURE_USER, FIXTURE_CRED } from './fixture-site/server.mjs';
import { SKILL_ROOT, hostSlug, parseArgs, usageAndExit } from '../scripts/lib/common.mjs';

const args = parseArgs();
usageAndExit(`
selftest.mjs - run every automation script against testing/fixture-site

  node testing/selftest.mjs [--only "crawl|screenshot"] [--keep]     (--only = '|'-separated test-name prefixes)

--keep leaves clone-workspace/<fixture> evidence on disk for inspection.
`, args);

const require = createRequire(import.meta.url);
const results = [];
const only = args.only && args.only !== true ? String(args.only).split('|') : null; // '|'-separated name prefixes
const S = (f) => path.join(SKILL_ROOT, 'scripts', f);
const run = (script, a, env = {}) => { const r = spawnSync(process.execPath, [S(script), ...a], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 170000 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const test = async (name, fn) => {
  if (only && !only.some((o) => name.startsWith(o))) return;
  try { const r = await fn(); if (r === 'SKIP') results.push([name, 'SKIP', 'prerequisite missing']); else results.push([name, r === true || r === undefined ? 'PASS' : 'FAIL', r === true || r === undefined ? '' : String(r)]); }
  catch (e) { results.push([name, 'FAIL', String(e.message).split('\n')[0]]); }
  const last = results[results.length - 1]; console.log(`${last[1].padEnd(4)} ${last[0]} ${last[2] ? '- ' + last[2] : ''}`);
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// Pre-flight: can we launch a browser?
let browserOk = false;
try { const pw = await import('playwright'); const b = await pw.chromium.launch(); await b.close(); browserOk = true; } catch (e) { console.log('Browser unavailable: ' + String(e.message).split('\n')[0]); }

// The fixture runs in a CHILD process: tests use spawnSync, which would block an in-process server.
const port = 4100 + Math.floor(Math.random() * 800);
const fixture = spawn(process.execPath, [path.join(SKILL_ROOT, 'testing', 'fixture-site', 'server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const server = { close: () => fixture.kill() };
const url = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(url + '/api/health')).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 100)); }
const slug = hostSlug(url);
const ws = path.join(SKILL_ROOT, 'clone-workspace', slug);
const ev = (k) => path.join(ws, 'evidence', k);
console.log(`Fixture at ${url}\n`);
const needsBrowser = (fn) => async () => (browserOk ? fn() : 'SKIP');

try {
  await test('validate-repo', () => { const r = run('validate-repo.mjs', []); expect(r.code === 0, r.out.split('\n').filter((l) => /FAIL/.test(l)).join(' | ') || `exit ${r.code}`); });
  await test('scan-secrets (clean)', () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-')); fs.writeFileSync(path.join(d, 'a.txt'), 'hello'); expect(run('scan-secrets.mjs', [d]).code === 0, 'clean dir flagged'); });
  await test('scan-secrets (detects)', () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-')); fs.writeFileSync(path.join(d, 'a.js'), 'const key = "AKIA' + 'ABCDEFGHIJKLMNOP";'); fs.writeFileSync(path.join(d, 'x.storage-state.json'), '{}'); const r = run('scan-secrets.mjs', [d]); expect(r.code === 1 && /aws-access-key/.test(r.out) && /storage-state/.test(r.out), 'did not detect'); });
  await test('init-project + state', () => {
    expect(run('init-project.mjs', ['--url', url, '--force']).code === 0, 'init failed');
    expect(fs.existsSync(path.join(ws, 'reports', 'discovery-report.md')), 'template not copied');
    expect(run('state.mjs', ['phase', '--site', slug, '--name', 'startup', '--status', 'done']).code === 0, 'phase failed');
    const n = run('state.mjs', ['next', '--site', slug]); expect(/discovery/.test(n.out), 'next phase wrong: ' + n.out);
  });
  await test('mcp-check', () => { expect(run('mcp-check.mjs', ['--project', os.tmpdir()]).code === 0, 'mcp-check failed'); });

  await test('crawl (routes, sitemap, robots, auth redirect)', needsBrowser(() => {
    const r = run('crawl.mjs', ['--url', url, '--max-pages', '30', '--delay', '50']); expect(r.code === 0, r.out.slice(-300));
    const data = JSON.parse(fs.readFileSync(path.join(ev('crawl'), 'routes.json'), 'utf8')); const by = (p) => data.routes.find((x) => x.route === p);
    expect(['/', '/about', '/pricing', '/login', '/ui', '/terms'].every((p) => by(p)?.status === 200), 'expected routes missing');
    expect(by('/sitemap-only')?.status === 200, 'sitemap-only route not discovered via sitemap.xml');
    expect(by('/private')?.skipped === 'robots.txt', '/private should be skipped by robots.txt');
    expect(by('/dashboard')?.requiresAuth === true, '/dashboard should be flagged requiresAuth');
    expect(by('/missing')?.status === 404, '404 route not recorded');
  }));
  await test('screenshot (desktop+mobile)', needsBrowser(() => {
    const r = run('screenshot.mjs', ['--url', url, '--label', 'reference', '--routes', '/,/about,/pricing', '--viewports', 'desktop,mobile', '--freeze-animations']); expect(r.code === 0, r.out.slice(-300));
    const m = JSON.parse(fs.readFileSync(path.join(ev('screenshots'), 'reference', 'manifest.json'), 'utf8')); expect(m.shots.length === 6 && !m.failures.length, `shots=${m.shots.length} failures=${m.failures.length}`);
  }));
  await test('visual-diff (identical passes, altered fails)', needsBrowser(() => {
    const ref = path.join(ev('screenshots'), 'reference'); const { PNG } = require('pngjs');
    const same = run('visual-diff.mjs', ['--reference', ref, '--candidate', ref, '--out', path.join(ws, 'vd-same'), '--max-mismatch', '0.1']); expect(same.code === 0, 'identical images should pass: ' + same.out.slice(-200));
    const cand = path.join(ws, 'vd-cand'); fs.cpSync(ref, cand, { recursive: true });
    const f = path.join(cand, 'desktop', 'about.png'); const img = PNG.sync.read(fs.readFileSync(f));
    for (let y = 100; y < Math.min(400, img.height); y++) for (let x = 0; x < img.width; x++) { const i = (img.width * y + x) * 4; img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 0; }
    fs.writeFileSync(f, PNG.sync.write(img));
    const diff = run('visual-diff.mjs', ['--reference', ref, '--candidate', cand, '--out', path.join(ws, 'vd-diff'), '--max-mismatch', '1']); expect(diff.code === 1 && /FAIL/.test(diff.out), 'altered image should fail');
  }));
  await test('regression (baseline then pass)', needsBrowser(() => {
    const a = ['--url', url, '--routes', '/about', '--viewports', 'desktop'];
    expect(run('regression.mjs', [...a, '--update']).code === 0, 'baseline creation failed');
    const r = run('regression.mjs', a); expect(r.code === 0, 'unchanged site should pass regression: ' + r.out.slice(-200));
  }));
  await test('check-links (finds broken link)', needsBrowser(() => {
    const r = run('check-links.mjs', ['--url', url, '--routes', '/']); expect(r.code === 1, `expected exit 1, got ${r.code}`);
    expect(/\/missing/.test(r.out), 'broken /missing not reported');
    const ok = run('check-links.mjs', ['--url', url, '--routes', '/about']); expect(ok.code === 0, 'clean page should pass: ' + ok.out.slice(-200));
  }));
  await test('console-errors (detects, and clean passes)', needsBrowser(() => {
    const bad = run('console-errors.mjs', ['--url', url, '--routes', '/buggy', '--viewports', 'desktop']); expect(bad.code === 1 && /deliberate console error/.test(bad.out), 'did not detect console error');
    const good = run('console-errors.mjs', ['--url', url, '--routes', '/about', '--viewports', 'desktop']); expect(good.code === 0, 'clean page flagged: ' + good.out.slice(-200));
  }));
  await test('a11y-check (detects, clean passes)', needsBrowser(() => {
    const bad = run('a11y-check.mjs', ['--url', url, '--routes', '/a11y-bad', '--tabs', '5']); expect(bad.code === 1, 'violations not detected');
    const rep = JSON.parse(fs.readFileSync(path.join(ev('a11y'), 'a11y-report.json'), 'utf8')); const rules = rep.report[0].heuristics.map((h) => h.rule); expect(['img-alt', 'form-label', 'button-name'].every((x) => rules.includes(x)), 'rules missing: ' + rules.join(','));
    const good = run('a11y-check.mjs', ['--url', url, '--routes', '/about', '--tabs', '5']); expect(good.code === 0, 'clean page flagged: ' + good.out.slice(-300));
  }));
  await test('perf-audit', needsBrowser(() => { const r = run('perf-audit.mjs', ['--url', url, '--routes', '/', '--runs', '1', '--viewports', 'desktop']); expect(r.code === 0, r.out.slice(-300)); expect(fs.existsSync(path.join(ev('perf'), 'perf-report.json')), 'no report'); }));
  await test('extract-design-tokens', needsBrowser(() => {
    expect(run('extract-design-tokens.mjs', ['--url', url, '--routes', '/']).code === 0, 'failed');
    const t = JSON.parse(fs.readFileSync(path.join(ev('tokens'), 'design-tokens.json'), 'utf8'));
    expect(t.cssVariables['--brand'] === '#4f46e5', 'CSS variable --brand not found'); expect(t.breakpoints.some((b) => /640px/.test(b.value)), 'breakpoint 640px not found'); expect(t.keyframes.some((k) => k.value === 'fadein'), 'keyframes not found');
  }));
  await test('extract-assets', needsBrowser(() => {
    expect(run('extract-assets.mjs', ['--url', url, '--routes', '/']).code === 0, 'failed');
    const inv = JSON.parse(fs.readFileSync(path.join(ev('assets'), 'asset-inventory.json'), 'utf8')); expect(inv.assets.some((a) => /logo\.svg/.test(a.url)), 'logo.svg not inventoried');
  }));
  await test('discover-interactions', needsBrowser(() => {
    expect(run('discover-interactions.mjs', ['--url', url, '--routes', '/ui,/login']).code === 0, 'failed');
    const inv = JSON.parse(fs.readFileSync(path.join(ev('interactions'), 'interaction-inventory.json'), 'utf8')); const ui = inv.pages.find((p) => p.url.endsWith('/ui')); const login = inv.pages.find((p) => p.url.endsWith('/login'));
    expect(ui.tabs === 2 && ui.searchInputs >= 1, 'tabs/search not found'); expect(ui.probes.length >= 2, 'state-change probes not recorded: ' + JSON.stringify(ui.probes));
    expect(login.forms[0]?.fields.some((f) => f.type === 'password' && f.required), 'login form fields not captured'); expect(login.skippedRisky.length >= 1, 'submit button should be skipped as risky');
  }));
  await test('auth-test (missing credentials -> exit 3)', needsBrowser(() => { const r = run('auth-test.mjs', ['--url', url + '/login'], { SITE_USERNAME: '', SITE_PASSWORD: '' }); expect(r.code === 3, `expected 3, got ${r.code}`); }));
  await test('auth-test (valid login, persistence, protected, logout)', needsBrowser(() => {
    const st = path.join(os.tmpdir(), `uwc-${Date.now()}.storage-state.json`);
    const r = run('auth-test.mjs', ['--url', url + '/login', '--protected', '/dashboard', '--logout-selector', '#logout', '--success-url', '/dashboard', '--save-state', st], { SITE_USERNAME: FIXTURE_USER, SITE_PASSWORD: FIXTURE_CRED });
    expect(r.code === 0, r.out.slice(-600)); expect(!r.out.includes(FIXTURE_CRED), 'password leaked into output'); expect(fs.existsSync(st), 'state not saved');
    const rep = fs.readFileSync(path.join(ev('auth'), 'auth-report.json'), 'utf8'); expect(!rep.includes(FIXTURE_CRED), 'password leaked into report'); fs.rmSync(st, { force: true });
  }));
  await test('auth-test (wrong credentials rejected)', needsBrowser(() => { const r = run('auth-test.mjs', ['--url', url + '/login', '--expect-failure', '--no-save'], { SITE_USERNAME: FIXTURE_USER, SITE_PASSWORD: FIXTURE_CRED }); expect(r.code === 0, r.out.slice(-400)); }));
  await test('pipeline (clone mode, subset)', needsBrowser(() => { const r = run('pipeline.mjs', ['--url', url, '--mode', 'clone', '--steps', 'crawl,screenshots', '--max-pages', '8', '--viewports', 'desktop']); expect(r.code === 0 && /ok\s+crawl/.test(r.out), r.out.slice(-300)); }));
} finally {
  server.close();
  if (!args.keep) fs.rmSync(ws, { recursive: true, force: true });
}

const pass = results.filter((r) => r[1] === 'PASS').length; const fail = results.filter((r) => r[1] === 'FAIL').length; const skip = results.filter((r) => r[1] === 'SKIP').length;
console.log(`\nSelf-test: ${pass} passed, ${fail} failed, ${skip} skipped (of ${results.length})`);
if (skip) console.log('SKIPPED tests need a working Chromium: run `npm run setup` (and `npx playwright install-deps chromium` on Linux).');
process.exit(fail ? 1 : 0);
