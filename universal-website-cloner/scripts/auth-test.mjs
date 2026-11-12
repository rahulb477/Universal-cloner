#!/usr/bin/env node
// Authentication flow tester (V5). Logs in with AUTHORIZED test credentials read from environment variables,
// verifies success, saves a Playwright storage state (git-ignored, chmod 600), checks protected-route behaviour
// with/without a session, session persistence in a fresh context, and optional logout.
//
// SAFETY: never bypasses CAPTCHA/MFA/paywalls — if detected, it stops and reports. Credentials are never printed,
// written to reports, or typed before the screenshot is taken. Output goes through redact().
//
// Requirements: playwright. Credentials:  SITE_USERNAME / SITE_PASSWORD (override names with --user-env / --pass-env)
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, writeJson, launch, gotoSettled, hostSlug, ensureDir, SKILL_ROOT, log, redact, die,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
auth-test.mjs - end-to-end login/logout/session/protected-route test (reference site OR your clone)

  SITE_USERNAME='user@example.com' SITE_PASSWORD='***' node scripts/auth-test.mjs --url https://app.example.com/login [options]

Options:
  --user-env NAME / --pass-env NAME   Env var names holding the credentials (default SITE_USERNAME / SITE_PASSWORD)
  --user-selector CSS    Username field selector (auto-detected otherwise)
  --pass-selector CSS    Password field selector (auto-detected otherwise)
  --submit-selector CSS  Submit button selector (auto-detected otherwise)
  --success-url REGEX    URL pattern expected after successful login
  --success-selector CSS Element expected after successful login
  --protected PATHS      Comma list of paths that must require login, e.g. /dashboard,/account
  --logout-selector CSS  Element to click to log out; then protected paths are re-checked
  --expect-failure       Test BAD credentials: expects login to be rejected (negative test); uses wrong password
  --save-state FILE      Where to store storage state (default .auth/<host>.storage-state.json)
  --no-save              Do not persist session
  --headed               Show the browser (useful when the site needs a manual MFA step by YOU)
Exit codes: 0 pass, 1 test failure, 3 blocked (CAPTCHA/MFA/credentials missing).
Output: clone-workspace/<host>/evidence/auth/auth-report.json (contains no secrets)
`, args);

const loginUrl = requireUrl(args, '--url https://app.example.com/login');
const origin = new URL(loginUrl).origin;
const userVar = args['user-env'] && args['user-env'] !== true ? String(args['user-env']) : 'SITE_USERNAME';
const passVar = args['pass-env'] && args['pass-env'] !== true ? String(args['pass-env']) : 'SITE_PASSWORD';
const username = process.env[userVar]; let password = process.env[passVar];
if (!args['expect-failure'] && (!username || !password)) { console.error(`Credentials missing. Set ${userVar} and ${passVar} in your shell (never commit them). Ask the user for AUTHORIZED test credentials.`); process.exit(3); }
if (args['expect-failure']) password = (password || 'x') + '-definitely-wrong-0';
const user = username || 'nobody@example.invalid';

const outPath = ensureDir(path.join(SKILL_ROOT, 'clone-workspace', hostSlug(loginUrl), 'evidence', 'auth'));
const statePath = args['save-state'] && args['save-state'] !== true ? path.resolve(String(args['save-state'])) : path.join(SKILL_ROOT, '.auth', `${hostSlug(loginUrl)}.storage-state.json`);
const checks = []; const record = (name, pass, detail = '') => { checks.push({ name, pass, detail: redact(detail) }); log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };
const protectedPaths = args.protected && args.protected !== true ? String(args.protected).split(',').map((s) => s.trim()).filter(Boolean) : [];

const { browser, newContext } = await launch({ ...args, 'storage-state': undefined });
let blocked = null;
try {
  const context = await newContext('desktop'); const page = await context.newPage();

  // 1. Protected routes must reject anonymous visitors
  const anonCheck = async (label) => {
    for (const p of protectedPaths) {
      const pg = await (await newContext('desktop')).newPage();
      const res = await pg.goto(new URL(p, origin).toString(), { waitUntil: 'domcontentloaded' }).catch(() => null);
      await pg.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const final = pg.url(); const hasPw = await pg.locator('input[type=password]').count();
      const blockedAnon = (res && [401, 403].includes(res.status())) || !final.includes(p) || hasPw > 0;
      record(`${label}: anonymous access to ${p} is blocked`, blockedAnon, `final=${new URL(final).pathname} status=${res?.status()}`);
      await pg.context().close();
    }
  };
  await anonCheck('before login');

  // 2. Open login page and detect blockers
  await gotoSettled(page, loginUrl);
  const html = (await page.content()).toLowerCase();
  if (/g-recaptcha|h-captcha|hcaptcha|cf-turnstile|captcha/.test(html)) blocked = 'CAPTCHA detected on login page. Not bypassing. Ask the user for an authorized test route/account without CAPTCHA, or run with --headed and let the user solve it.';
  if (blocked) throw Object.assign(new Error(blocked), { blocked: true });
  const shot = path.join(outPath, 'login-page.png'); await page.screenshot({ path: shot }); // taken BEFORE any credential is typed
  record('login page reachable', true, new URL(page.url()).pathname);

  // 3. Fill + submit
  const pwField = page.locator(args['pass-selector'] && args['pass-selector'] !== true ? String(args['pass-selector']) : 'input[type=password]').first();
  if (!(await pwField.count())) { record('password field found', false, 'No password input on page; pass --pass-selector'); throw new Error('no password field'); }
  const userField = args['user-selector'] && args['user-selector'] !== true ? page.locator(String(args['user-selector'])).first()
    : page.locator('input[type=email], input[autocomplete=username], input[name*=user i], input[name*=email i], input[id*=email i], input[id*=user i], input[type=text]').first();
  await userField.fill(user); await pwField.fill(password);
  const submit = args['submit-selector'] && args['submit-selector'] !== true ? page.locator(String(args['submit-selector'])).first() : page.locator('button[type=submit], input[type=submit], form button').first();
  await Promise.all([page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}), (await submit.count()) ? submit.click() : pwField.press('Enter')]);
  await page.waitForTimeout(800);

  const afterHtml = (await page.content()).toLowerCase();
  if (/one-time|verification code|two-factor|2fa|authenticator app|mfa/.test(afterHtml) && !args['expect-failure']) { blocked = 'MFA / verification step detected. Not bypassing. Ask the user for an authorized test account without MFA or a pre-authenticated storage state.'; throw Object.assign(new Error(blocked), { blocked: true }); }
  const stillOnLogin = (await page.locator('input[type=password]').count()) > 0;
  const urlOk = args['success-url'] && args['success-url'] !== true ? new RegExp(String(args['success-url'])).test(page.url()) : null;
  const selOk = args['success-selector'] && args['success-selector'] !== true ? (await page.locator(String(args['success-selector'])).count()) > 0 : null;
  const errorText = await page.locator('[role=alert], .error, .alert-danger, [class*=error i], [data-error]').first().textContent({ timeout: 800 }).catch(() => null);
  const loggedIn = urlOk !== null || selOk !== null ? (urlOk ?? true) && (selOk ?? true) : !stillOnLogin;

  if (args['expect-failure']) {
    record('invalid credentials are rejected', !loggedIn, errorText ? `error shown: "${errorText.trim().slice(0, 80)}"` : 'no visible error message');
    record('error message is shown to user', !!errorText);
  } else {
    record('login succeeds', loggedIn, `url=${new URL(page.url()).pathname}${errorText ? ' error="' + errorText.trim().slice(0, 80) + '"' : ''}`);
    if (!loggedIn) throw new Error('login failed');
    await page.screenshot({ path: path.join(outPath, 'after-login.png') });

    // 4. Persist session + verify in fresh context
    if (!args['no-save']) {
      ensureDir(path.dirname(statePath)); await context.storageState({ path: statePath }); try { fs.chmodSync(statePath, 0o600); } catch { /* windows */ }
      record('session saved (git-ignored)', true, path.relative(SKILL_ROOT, statePath));
      const ctx2 = await newContext('desktop', { storageState: statePath }); const p2 = await ctx2.newPage();
      await p2.goto(protectedPaths[0] ? new URL(protectedPaths[0], origin).toString() : page.url(), { waitUntil: 'domcontentloaded' }); await p2.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      record('session persists in a new browser context', (await p2.locator('input[type=password]').count()) === 0, new URL(p2.url()).pathname); await ctx2.close();
    }
    // 5. Authenticated access to protected routes
    for (const p of protectedPaths) { const res = await page.goto(new URL(p, origin).toString(), { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); record(`authenticated access to ${p}`, !!res && res.status() < 400 && (await page.locator('input[type=password]').count()) === 0, `status=${res?.status()}`); }
    // 6. Logout
    if (args['logout-selector'] && args['logout-selector'] !== true) {
      await page.goto(page.url()); const lo = page.locator(String(args['logout-selector'])).first();
      if (await lo.count()) { await Promise.all([page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}), lo.click()]); await page.waitForTimeout(600); record('logout completes', true, new URL(page.url()).pathname); await context.clearCookies(); await anonCheck('after logout'); }
      else record('logout control found', false, args['logout-selector']);
    }
  }
} catch (e) {
  if (e.blocked) { record('flow not blocked by CAPTCHA/MFA', false, e.message); }
  else if (!checks.some((c) => !c.pass)) record('unexpected error', false, e.message.split('\n')[0]);
} finally { await browser.close(); }

const failed = checks.filter((c) => !c.pass);
writeJson(path.join(outPath, 'auth-report.json'), { target: loginUrl, generatedAt: new Date().toISOString(), credentialsSource: `env:${userVar}/${passVar} (values not recorded)`, blocked, checks, passed: !failed.length });
log(`\nAuth test ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length}) -> ${outPath}`);
void die;
process.exit(blocked ? 3 : failed.length ? 1 : 0);
