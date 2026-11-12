// Smoke tests for the built site: every route, its local assets, and each API.
// Run with: npm test   (requires `npm run build` first)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Read at load time so tests can be skipped by feature.
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'site.json'), 'utf8'));
let server, base;

before(async () => {
  const app = await createApp({ databaseFile: path.join(ROOT, 'data', `test-${Date.now()}.sqlite`), protectPages: 'client' });
  server = app.server;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

const get = (p, init) => fetch(base + p, { redirect: 'manual', ...init });
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health endpoint reports the site', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.routes, site.routes.length);
});

test('every route renders an HTML document with the runtime attached', async () => {
  for (const route of site.routes.filter((r) => !r.errorPage)) {
    const r = await get(route.route);
    assert.equal(r.status, 200, `GET ${route.route}`);
    const html = await r.text();
    assert.match(html, /<html[\s>]/i, `${route.route} is an HTML document`);
    assert.match(html, /id="uwc-data"/, `${route.route} carries runtime data`);
    assert.doesNotMatch(html, /\{\{root\}\}|__UWC_\d+__|@include/, `${route.route} has no unresolved placeholders`);
  }
});

test('local stylesheets, scripts and images referenced by each page exist', async () => {
  const checked = new Set();
  for (const route of site.routes.filter((r) => !r.errorPage)) {
    const html = await (await get(route.route)).text();
    for (const m of html.matchAll(/<(?:link|script|img)\b[^>]*?\s(?:href|src)="([^"]+)"/g)) {
      const raw = m[1].replace(/&amp;/g, '&');
      if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
      const u = new URL(raw, base + route.route);
      if (checked.has(u.pathname) || site.routes.some((x) => x.route === u.pathname)) continue;
      checked.add(u.pathname);
      const r = await get(u.pathname);
      assert.equal(r.status, 200, `${route.route} -> ${raw}`);
      await r.arrayBuffer();
    }
  }
});

test('unknown URLs return 404', async () => {
  const r = await get('/definitely/not-a-real-page');
  assert.equal(r.status, 404);
  await r.text();
});

test('trailing slashes redirect to the canonical route', async () => {
  const route = site.routes.find((r) => r.route !== '/' && !r.errorPage);
  if (!route) return;
  const r = await get(route.route + '/');
  assert.equal(r.status, 308);
});

test('search finds a page by a word from its title', { skip: site.features.backend === false }, async () => {
  const page = site.routes.find((r) => !r.protected && !r.errorPage && /[A-Za-z]{4,}/.test(r.title || ''));
  if (!page) return;
  const word = page.title.match(/[A-Za-z]{4,}/)[0];
  const j = await (await get('/api/search?q=' + encodeURIComponent(word))).json();
  assert.ok(j.results.length > 0, `results for "${word}"`);
});

const dataForms = Object.values(site.forms || {}).filter((f) => !['login', 'register', 'search'].includes(f.kind) || !site.features.auth && f.kind !== 'search');
test('form submissions are validated and stored', { skip: site.features.backend === false || dataForms.length === 0 }, async () => {
  const form = dataForms[0];
  const body = {};
  for (const f of form.fields) {
    if (!f.name || f.type === 'password' || f.type === 'file') continue;
    body[f.name] = f.options?.length ? f.options.find(Boolean) ?? f.options[0] : f.type === 'email' ? 'tester@example.test' : f.type === 'number' ? '3' : f.type === 'url' ? 'https://example.test' : f.type === 'tel' ? '5550100' : 'Smoke test';
  }
  const ok = await post(`/api/forms/${form.id}`, body);
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).ok, true);
  const required = form.fields.find((f) => f.required && f.name && f.type !== 'password' && f.type !== 'file');
  if (required) {
    const bad = await post(`/api/forms/${form.id}`, { ...body, [required.name]: '' });
    assert.equal(bad.status, 400);
    assert.ok((await bad.json()).fields[required.name]);
  }
  assert.equal((await post('/api/forms/does-not-exist', {})).status, 404);
});

test('accounts: register, sign in, session check, sign out', { skip: !site.features.auth || site.features.backend === false }, async () => {
  const identifier = `user${Date.now()}@example.test`;
  const reg = await post('/api/auth/register', { identifier, password: 'correct horse battery' });
  assert.equal(reg.status, 201);
  assert.equal((await post('/api/auth/register', { identifier, password: 'correct horse battery' })).status, 409);
  assert.equal((await post('/api/auth/login', { identifier, password: 'wrong password' })).status, 401);
  const login = await post('/api/auth/login', { identifier, password: 'correct horse battery' });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.match(token, /^[a-f0-9]{64}$/);
  const me = await get('/api/auth/me', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.identifier, identifier);
  assert.equal((await get('/api/auth/me')).status, 401);
  await post('/api/auth/logout', {}, { authorization: `Bearer ${token}` });
  assert.equal((await get('/api/auth/me', { headers: { authorization: `Bearer ${token}` } })).status, 401);
});
