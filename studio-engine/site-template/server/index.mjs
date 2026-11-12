// Application server for the generated site. No dependencies: Node's http, fs and crypto only.
//   - serves the built pages (dist/) by route, plus static assets
//   - JSON API: health, search, form submissions, authentication
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from './db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Minimal .env loader (KEY=value per line). Real environment variables win.
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* no .env file */ }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function createApp(overrides = {}) {
  loadEnv();
  if (!fs.existsSync(path.join(DIST, 'site.json'))) throw new Error('dist/ is missing. Run "npm run build" first.');
  const site = JSON.parse(fs.readFileSync(path.join(DIST, 'site.json'), 'utf8'));
  const searchIndex = JSON.parse(fs.readFileSync(path.join(DIST, 'search-index.json'), 'utf8'));
  const features = site.features || {};
  const routes = new Map(site.routes.map((r) => [r.route, r]));
  const errorPage = site.routes.find((r) => r.errorPage);
  const protectMode = overrides.protectPages || process.env.PROTECT_PAGES || 'server'; // "server" | "client"
  const sessionHours = Number(process.env.SESSION_HOURS || 24 * 7);
  const store = await openStore({
    file: overrides.databaseFile || process.env.DATABASE_FILE || path.join(ROOT, 'data', 'site.sqlite'),
    migrationsDir: path.join(ROOT, 'db', 'migrations'),
    enabled: features.backend !== false && features.database !== false,
  });
  const started = Date.now();

  // Optional seeded account, e.g. for demos. Only created when both variables are set.
  if (features.auth && process.env.DEMO_USER_EMAIL && process.env.DEMO_USER_PASSWORD) {
    const id = process.env.DEMO_USER_EMAIL.trim().toLowerCase();
    if (!store.findUser(id)) store.createUser(id, 'Demo user', hashPassword(process.env.DEMO_USER_PASSWORD));
  }

  const buckets = new Map();
  function limited(key, max, windowMs) {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.t > windowMs) { buckets.set(key, { t: now, n: 1 }); return false; }
    return ++b.n > max;
  }
  setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 600000) buckets.delete(k); }, 60000).unref();

  const send = (res, status, body, headers = {}) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'content-length': buf.length, 'x-content-type-options': 'nosniff', ...headers });
    res.end(buf);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 100_000) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('Body must be valid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
  const tokenOf = (req) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([a-f0-9]{64})/);
    return m ? m[1] : null;
  };
  const currentUser = (req) => {
    const token = tokenOf(req);
    if (!token) return null;
    const s = store.findSession(sha256(token));
    return s ? store.userById(s.user_id) : null;
  };
  const publicUser = (u) => ({ id: u.id, identifier: u.identifier, name: u.name });
  function startSession(res, user) {
    const token = crypto.randomBytes(32).toString('hex');
    store.createSession(sha256(token), user.id, Date.now() + sessionHours * 3600_000);
    res.setHeader('set-cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionHours * 3600}`);
    return token;
  }

  function search(q) {
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1).slice(0, 6);
    if (!terms.length) return [];
    const out = [];
    for (const p of searchIndex) {
      const title = p.title.toLowerCase(), text = p.text.toLowerCase();
      let score = 0, at = -1;
      for (const t of terms) {
        if (title.includes(t)) score += 5;
        const i = text.indexOf(t);
        if (i >= 0) { score += 1 + Math.min(text.split(t).length - 1, 5) * 0.2; if (at < 0) at = i; }
      }
      if (score) out.push({ route: p.route, title: p.title, score: Math.round(score * 10) / 10, snippet: p.text.slice(Math.max(0, at - 60), Math.max(0, at - 60) + 180).trim() });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  function validate(form, body) {
    const errors = {}, clean = {};
    for (const f of form.fields) {
      if (!f.name || f.type === 'password' || f.type === 'file') continue;
      let v = body[f.name];
      if (Array.isArray(v)) v = v.join(', ');
      v = v === undefined || v === null ? '' : String(v).trim();
      if (f.required && !v) { errors[f.name] = 'This field is required.'; continue; }
      if (v.length > 5000) { errors[f.name] = 'Too long.'; continue; }
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { errors[f.name] = 'Enter a valid e-mail address.'; continue; }
      if (v && f.type === 'number' && !Number.isFinite(Number(v))) { errors[f.name] = 'Enter a number.'; continue; }
      if (v && f.type === 'url' && !/^https?:\/\//i.test(v)) { errors[f.name] = 'Enter a valid URL.'; continue; }
      if (v && f.options && f.options.length && !f.options.includes(v)) { errors[f.name] = 'Choose one of the listed options.'; continue; }
      clean[f.name] = v;
    }
    return { errors, clean };
  }

  async function api(req, res, p, url) {
    const ip = req.socket.remoteAddress || '';
    if (p === '/api/health') return send(res, 200, { ok: true, name: site.name, routes: site.routes.length, features, storage: store.kind, uptimeSeconds: Math.round((Date.now() - started) / 1000) });
    if (features.backend === false) return send(res, 501, { error: 'This project was generated without backend services.' });
    if (p === '/api/search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').slice(0, 100);
      return send(res, 200, { query: q, results: search(q) });
    }
    const fm = p.match(/^\/api\/forms\/([\w-]+)(\/submissions)?$/);
    if (fm) {
      const form = site.forms[fm[1]];
      if (!form) return send(res, 404, { error: 'Unknown form' });
      if (fm[2]) {
        const admin = process.env.ADMIN_TOKEN;
        if (!admin || req.headers['x-admin-token'] !== admin) return send(res, 403, { error: 'Set ADMIN_TOKEN and send it as the x-admin-token header to read submissions.' });
        return send(res, 200, { submissions: store.listSubmissions(form.id).map((s) => ({ ...s, payload: JSON.parse(s.payload) })) });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' }, { allow: 'POST' });
      if (limited(`form:${ip}`, 20, 60000)) return send(res, 429, { error: 'Too many submissions. Try again in a minute.' });
      const body = await readBody(req);
      const { errors, clean } = validate(form, body);
      if (Object.keys(errors).length) return send(res, 400, { error: 'Please correct the highlighted fields.', fields: errors });
      const id = store.addSubmission(form.id, String(body.__route || '').slice(0, 200), clean);
      return send(res, 201, { ok: true, id });
    }
    if (p.startsWith('/api/auth/')) {
      if (!features.auth) return send(res, 404, { error: 'Authentication is not enabled for this project.' });
      if (p === '/api/auth/me') {
        const u = currentUser(req);
        return u ? send(res, 200, { user: publicUser(u) }) : send(res, 401, { error: 'Not signed in' });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' }, { allow: 'POST' });
      if (p === '/api/auth/logout') {
        const t = tokenOf(req);
        if (t) store.deleteSession(sha256(t));
        return send(res, 200, { ok: true }, { 'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
      }
      if (limited(`auth:${ip}`, 15, 60000)) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' });
      const body = await readBody(req);
      const identifier = String(body.identifier || body.email || body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (p === '/api/auth/register') {
        if (process.env.ALLOW_REGISTRATION === 'false') return send(res, 403, { error: 'Registration is disabled.' });
        if (identifier.length < 3 || identifier.length > 200) return send(res, 400, { error: 'Enter an e-mail address or username.' });
        if (password.length < 8 || password.length > 200) return send(res, 400, { error: 'The password must be at least 8 characters.' });
        const id = store.createUser(identifier, String(body.name || '').slice(0, 120), hashPassword(password));
        if (!id) return send(res, 409, { error: 'An account with that e-mail address or username already exists.' });
        const user = store.userById(id);
        return send(res, 201, { ok: true, token: startSession(res, user), user: publicUser(user) });
      }
      if (p === '/api/auth/login') {
        const user = identifier ? store.findUser(identifier) : null;
        // Same message and a hash computation either way, so accounts cannot be enumerated.
        const ok = user ? verifyPassword(password, user.password_hash) : (hashPassword(password, '00'), false);
        if (!ok) return send(res, 401, { error: 'Invalid e-mail/username or password.' });
        return send(res, 200, { ok: true, token: startSession(res, user), user: publicUser(user) });
      }
    }
    return send(res, 404, { error: 'Unknown API endpoint' });
  }

  function servePage(req, res, route, status = 200) {
    const file = path.join(DIST, route.file);
    let html = fs.readFileSync(file, 'utf8');
    if (route.errorPage) {
      const depth = Math.max(0, new URL(req.url, 'http://x').pathname.split('/').length - 2);
      html = html.replaceAll('__ROOT__', depth ? '../'.repeat(depth) : './');
    }
    send(res, status, html, { 'cache-control': 'no-cache' });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p;
      try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Bad request' }); }
      p = p.replace(/\/{2,}/g, '/');
      if (p.startsWith('/api/')) return await api(req, res, p, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' }, { allow: 'GET, HEAD' });
      // Relative redirects keep working when the site is mounted under a path prefix.
      if (p.length > 1 && p.endsWith('/')) return send(res, 308, '', { location: `../${encodeURIComponent(path.posix.basename(p))}${url.search}` });
      if (p === '/' && !routes.has('/') && site.startRoute) return send(res, 302, '', { location: `.${site.startRoute}` });
      const route = routes.get(p);
      if (route && !route.errorPage) {
        if (route.protected && features.auth && protectMode === 'server' && !currentUser(req) && site.loginRoute) {
          const up = '../'.repeat(Math.max(0, p.split('/').length - 2)) || './';
          return send(res, 302, '', { location: `${up}${site.loginRoute.slice(1)}?next=${encodeURIComponent(p)}`, 'cache-control': 'no-store' });
        }
        return servePage(req, res, route);
      }
      const file = path.join(DIST, p);
      if (file.startsWith(DIST + path.sep) && !/(^|\/)(site|search-index)\.json$/.test(p) && fs.existsSync(file) && fs.statSync(file).isFile() && !routes.has(p) && path.extname(file) !== '.html') {
        const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': type, 'content-length': fs.statSync(file).size, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' });
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
      }
      if (p === '/search-index.json') return send(res, 200, searchIndex, { 'cache-control': 'no-cache' });
      if (errorPage) return servePage(req, res, errorPage, 404);
      return send(res, 404, '<!doctype html><meta charset="utf-8"><title>Not found</title><h1>404 — Not found</h1>');
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? 'Internal server error' : e.message });
      else res.end();
    }
  });
  server.on('close', () => store.close());
  return { server, site, store };
}

// Start when run directly: node server/index.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, site } = await createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => console.log(`${site.name} is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (${site.routes.length} routes)`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
