// Tiny deterministic demo website used ONLY to self-test the cloner scripts.
// It contains deliberate defects (broken link, console error, a11y violations, robots-disallowed route)
// so we can prove the detectors actually detect. Fixture credentials are public and meaningless.
import http from 'node:http';

export const FIXTURE_USER = 'demo@example.test';
export const FIXTURE_CRED = 'fixture-only-value-1';

const css = `
:root{--brand:#4f46e5;--ink:#111827;--muted:#4b5563;--bg:#ffffff;--card:#f3f4f6}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{display:flex;gap:16px;align-items:center;padding:16px 32px;background:var(--brand)}
header a{color:#fff;text-decoration:none;padding:6px 10px;border-radius:8px;transition:background .2s ease}
header a:hover{background:rgba(255,255,255,.25)} header a:focus{outline:2px solid #fff}
main{max-width:960px;margin:32px auto;padding:0 24px} h1{font-size:40px;margin:0 0 12px}
.card{background:var(--card);border-radius:12px;padding:20px;box-shadow:0 4px 12px rgba(0,0,0,.08);margin:16px 0}
button,input{font:inherit;padding:10px 14px;border-radius:8px;border:1px solid #9ca3af} button{background:var(--brand);color:#fff;border-color:var(--brand);cursor:pointer}
button:focus,input:focus,a:focus{outline:3px solid #f59e0b} footer{padding:24px 32px;color:var(--muted)} footer a{color:#1f2937}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d1d5db;padding:8px;text-align:left}
@keyframes fadein{from{opacity:0}to{opacity:1}} .fade{animation:fadein .4s ease}
@media (max-width:640px){header{flex-wrap:wrap;padding:12px}h1{font-size:28px}}
[role=tabpanel][hidden]{display:none} [role=alert]{color:#b91c1c;margin-top:8px}`;

const layout = (title, body, extraHead = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="generator" content="fixture-site"><style>${css}</style>${extraHead}</head><body>
<header><strong style="color:#fff">Fixture Co</strong><nav aria-label="Main" style="display:flex;gap:8px"><a href="/">Home</a><a href="/about">About</a><a href="/pricing">Pricing</a><a href="/ui">UI</a><a href="/dashboard">Account</a><a href="/login">Login</a></nav></header>
<main class="fade">${body}</main><footer><a href="/terms">Terms</a> · <a href="/private">Private area</a></footer></body></html>`;

const pages = {
  '/': () => layout('Home - Fixture Co', `<h1>Build faster with Fixture Co</h1><p>A demo landing page.</p><img src="/logo.svg" alt="Fixture logo" width="64" height="64"><div class="card"><a href="/about">About us</a> · <a href="/missing">Docs (broken link)</a> · <a href="/a11y-bad">Legacy page</a> · <a href="/buggy">Status page</a></div>`),
  '/about': () => layout('About - Fixture Co', `<h1>About</h1><p>We make demo sites for testing automation scripts.</p>`),
  '/pricing': () => layout('Pricing - Fixture Co', `<h1>Pricing</h1><table><caption>Plans</caption><thead><tr><th scope="col">Plan</th><th scope="col">Price</th></tr></thead><tbody><tr><td>Free</td><td>$0</td></tr><tr><td>Pro</td><td>$12</td></tr></tbody></table>`),
  '/terms': () => layout('Terms - Fixture Co', `<h1>Terms</h1><p>Demo terms.</p>`),
  '/private': () => layout('Private - Fixture Co', `<h1>Private</h1><p>Disallowed in robots.txt.</p>`),
  '/sitemap-only': () => layout('Sitemap only - Fixture Co', `<h1>Sitemap only</h1><p>Reachable only through sitemap.xml.</p>`),
  '/login': () => layout('Login - Fixture Co', `<h1>Sign in</h1><form id="f" class="card" novalidate><label for="email">Email</label><br><input id="email" name="email" type="email" required autocomplete="username"><br><br><label for="pw">Password</label><br><input id="pw" name="password" type="password" required autocomplete="current-password"><br><br><button type="submit">Sign in</button><div id="err" role="alert"></div></form>
<script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.value,password:pw.value})});if(r.ok){location.href='/dashboard'}else{err.textContent='Invalid email or password'}})</script>`),
  '/dashboard': () => layout('Dashboard - Fixture Co', `<h1>Dashboard</h1><div class="card">Welcome back. <a id="logout" href="/logout">Log out</a></div>`),
  '/ui': () => layout('UI - Fixture Co', `<h1>UI patterns</h1>
<div role="tablist" aria-label="Sections"><button role="tab" id="t1" aria-selected="true" aria-controls="p1">One</button> <button role="tab" id="t2" aria-selected="false" aria-controls="p2">Two</button></div>
<div role="tabpanel" id="p1" aria-labelledby="t1">Panel one</div><div role="tabpanel" id="p2" aria-labelledby="t2" hidden>Panel two</div>
<details class="card"><summary>FAQ: what is this?</summary>A test fixture.</details>
<button id="openDlg" aria-haspopup="dialog">Open dialog</button><dialog id="dlg" aria-labelledby="dt"><h2 id="dt">Hello</h2><button id="closeDlg">Close</button></dialog>
<form role="search"><label for="q">Search</label> <input id="q" type="search" name="q"></form>
<script>t1.onclick=()=>{p1.hidden=false;p2.hidden=true;t1.ariaSelected='true';t2.ariaSelected='false'};t2.onclick=()=>{p2.hidden=false;p1.hidden=true;t2.ariaSelected='true';t1.ariaSelected='false'};openDlg.onclick=()=>dlg.showModal();closeDlg.onclick=()=>dlg.close()</script>`),
  '/buggy': () => layout('Status - Fixture Co', `<h1>Status</h1><p>Loading status…</p><script>console.error('Fixture: deliberate console error');fetch('/api/nope')</script>`),
  '/a11y-bad': () => layout('Legacy - Fixture Co', `<h1>Legacy</h1><h3>Skipped heading level</h3><img src="/logo.svg"><input name="orphan" type="text"><button></button>`),
};

export function startFixture(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
    const authed = /(?:^|;\s*)sid=ok/.test(req.headers.cookie || '');
    const send = (code, type, body, headers = {}) => { res.writeHead(code, { 'content-type': type, ...headers }); res.end(body); };
    if (p === '/robots.txt') return send(200, 'text/plain', `User-agent: *\nDisallow: /private\nSitemap: http://${req.headers.host}/sitemap.xml\n`);
    if (p === '/sitemap.xml') return send(200, 'application/xml', `<?xml version="1.0"?><urlset><url><loc>http://${req.headers.host}/sitemap-only</loc></url><url><loc>http://${req.headers.host}/about</loc></url></urlset>`);
    if (p === '/logo.svg') return send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#4f46e5"/></svg>');
    if (p === '/api/health') return send(200, 'application/json', '{"ok":true}');
    if (p === '/api/login' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { const j = JSON.parse(b); if (j.email === FIXTURE_USER && j.password === FIXTURE_CRED) return send(200, 'application/json', '{"ok":true}', { 'set-cookie': 'sid=ok; Path=/; HttpOnly; SameSite=Lax' }); } catch { /* fallthrough */ } send(401, 'application/json', '{"ok":false}'); }); return;
    }
    if (p === '/logout') return send(302, 'text/plain', '', { location: '/login', 'set-cookie': 'sid=; Path=/; Max-Age=0' });
    if (p === '/dashboard' && !authed) return send(302, 'text/plain', '', { location: '/login' });
    if (pages[p]) return send(200, 'text/html; charset=utf-8', pages[p]());
    send(404, 'text/html; charset=utf-8', layout('Not found', '<h1>404</h1><p>Not found.</p>'));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startFixture(Number(process.env.PORT) || 4010);
  console.log(`Fixture site running at ${url}  (login: ${FIXTURE_USER} / ${FIXTURE_CRED})`);
}
