// "Harbor & Pine" — a small demo website you are authorised to clone. It exists so the studio can be
// tested end-to-end without touching anyone else's site. Run: node studio-engine/demo-site/server.mjs [port]
// Demo account (public, meaningless): demo@harbor.test / harbor-demo-1
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEMO_USER = 'demo@harbor.test';
export const DEMO_PASS = 'harbor-demo-1';

const css = `
@import url("/static/type.css");
:root{--ink:#1c2321;--muted:#5d6b66;--paper:#f6f3ec;--card:#fffdf8;--pine:#1f5c4a;--pine-dark:#15463a;--amber:#d98e2b;--line:#e2dccd;--radius:14px}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:"Demo Sans",ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
a{color:var(--pine)}img{max-width:100%;display:block}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.site-header{position:sticky;top:0;z-index:20;background:rgba(246,243,236,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.site-header .wrap{display:flex;align-items:center;gap:24px;height:68px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;color:var(--ink);text-decoration:none;letter-spacing:-.01em}
.brand img{width:32px;height:32px}
.nav{display:flex;gap:4px;margin-left:auto}
.nav a{padding:8px 12px;border-radius:999px;color:var(--ink);text-decoration:none;font-size:15px;transition:background .18s ease,color .18s ease}
.nav a:hover{background:#e9e3d3}.nav a.active{background:var(--pine);color:#fff}
.menu-btn{display:none;margin-left:auto;background:none;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer}
.hero{padding:88px 0 72px;background:url("/static/waves.svg") bottom center/cover no-repeat}
.hero h1{font-size:clamp(36px,6vw,64px);line-height:1.05;letter-spacing:-.03em;margin:0 0 18px;max-width:14ch}
.hero p{font-size:19px;color:var(--muted);max-width:52ch;margin:0 0 28px}
.btn{display:inline-block;background:var(--pine);color:#fff;border:0;border-radius:999px;padding:12px 22px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .15s ease,background .15s ease}
.btn:hover{background:var(--pine-dark);transform:translateY(-1px)}.btn.ghost{background:transparent;color:var(--pine);box-shadow:inset 0 0 0 1.5px var(--pine)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:40px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:0 1px 0 rgba(0,0,0,.03),0 12px 32px -18px rgba(28,35,33,.25);animation:rise .5s ease both}
.card:nth-child(2){animation-delay:.08s}.card:nth-child(3){animation-delay:.16s}
.card h3{margin:0 0 6px;font-size:19px}.card p{margin:0;color:var(--muted)}.price{font-size:34px;font-weight:700;letter-spacing:-.02em}
section{padding:56px 0}h2{font-size:30px;letter-spacing:-.02em;margin:0 0 8px}.lede{color:var(--muted);margin:0 0 20px}
.tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin-bottom:18px}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:10px 14px;font:inherit;cursor:pointer;color:var(--muted)}
.tabs button[aria-selected=true]{color:var(--pine);border-color:var(--pine);font-weight:600}
[role=tabpanel][hidden]{display:none}
.faq button{width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font:inherit;font-weight:600;cursor:pointer;margin-top:10px;display:flex;justify-content:space-between}
.faq button[aria-expanded=true] span{transform:rotate(45deg)}.faq button span{transition:transform .2s ease}
.faq .answer{padding:12px 16px;color:var(--muted)}.faq .answer.closed{display:none}
form.stack{display:grid;gap:14px;max-width:520px}label{font-weight:600;font-size:14px;display:grid;gap:6px}
input,textarea,select{font:inherit;padding:11px 13px;border:1px solid #cfc8b6;border-radius:10px;background:#fff;color:var(--ink)}
input:focus,textarea:focus,select:focus,button:focus-visible,a:focus-visible{outline:3px solid var(--amber);outline-offset:2px}
[role=alert]{color:#a4161a;font-weight:600;min-height:1.2em}
.site-footer{margin-top:40px;background:var(--ink);color:#cfd6d3;padding:40px 0}
.site-footer .wrap{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:center}
.site-footer a{color:#fff}.news{display:flex;gap:8px}.news input{min-width:220px}
dialog{border:0;border-radius:18px;padding:28px;max-width:420px;box-shadow:0 30px 80px rgba(0,0,0,.35)}dialog::backdrop{background:rgba(20,26,24,.55)}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (max-width:760px){.grid{grid-template-columns:1fr}.menu-btn{display:block}.nav{display:none;position:absolute;top:68px;left:0;right:0;flex-direction:column;background:var(--paper);border-bottom:1px solid var(--line);padding:12px 24px}.nav.open{display:flex}.hero{padding:56px 0}}
`;
const typeCss = `@font-face{font-family:"Demo Sans";src:local("Inter"),local("Helvetica Neue"),local("Arial");font-weight:400 700;font-display:swap}\n.eyebrow{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#d98e2b;font-weight:700}`;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1f5c4a"/><path d="M32 12l14 24H18z" fill="#f6f3ec"/><path d="M32 26l12 20H20z" fill="#d98e2b"/><rect x="29" y="44" width="6" height="9" fill="#f6f3ec"/></svg>`;
const waves = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 400" preserveAspectRatio="none"><rect width="1440" height="400" fill="#f6f3ec"/><path d="M0 300 C240 240 480 360 720 300 S1200 240 1440 300 V400 H0Z" fill="#e7efe9"/><path d="M0 340 C240 290 480 390 720 340 S1200 290 1440 340 V400 H0Z" fill="#d5e5dc"/></svg>`;
const photo = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,62%)"/><stop offset="1" stop-color="hsl(${hue + 40},50%,34%)"/></linearGradient></defs><rect width="600" height="360" fill="url(#g)"/><circle cx="470" cy="90" r="46" fill="rgba(255,255,255,.55)"/><path d="M0 280 L160 170 L290 250 L420 150 L600 270 V360 H0Z" fill="rgba(20,40,34,.45)"/></svg>`;

const NAV = [['/', 'Home'], ['/cabins', 'Cabins'], ['/pricing', 'Pricing'], ['/journal', 'Journal'], ['/contact', 'Contact'], ['/login', 'Sign in']];
const layout = (route, title, body, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Harbor &amp; Pine</title><meta name="description" content="Quiet waterside cabins for slow weekends. ${title}."><link rel="icon" href="/static/logo.svg"><link rel="stylesheet" href="/static/site.css"></head><body>
<header class="site-header"><div class="wrap"><a class="brand" href="/"><img src="/static/logo.svg" alt="Harbor &amp; Pine logo">Harbor &amp; Pine</a><button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="mainNav">Menu</button><nav class="nav" id="mainNav" aria-label="Main">${NAV.map(([h, t]) => `<a href="${h}"${h === route ? ' class="active" aria-current="page"' : ''}>${t}</a>`).join('')}</nav></div></header>
<main>${body}</main>
<footer class="site-footer"><div class="wrap"><div><strong>Harbor &amp; Pine</strong><br><a href="/terms">Terms</a> · <a href="/contact">Contact</a> · <a href="/members">Members</a></div><form class="news" id="newsForm"><label class="sr" for="newsEmail" style="display:none">Email</label><input id="newsEmail" name="email" type="email" required placeholder="you@example.com" aria-label="Email address"><button class="btn" type="submit">Get the newsletter</button></form></div></footer>
<script>document.getElementById('menuBtn').addEventListener('click',function(){var n=document.getElementById('mainNav');var o=n.classList.toggle('open');this.setAttribute('aria-expanded',o)});
document.getElementById('newsForm').addEventListener('submit',function(e){e.preventDefault();fetch('/api/newsletter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:newsEmail.value})}).then(function(){alert('Subscribed')})});</script>${script}</body></html>`;

const pages = {
  '/': () => layout('/', 'Cabins by the water', `<section class="hero"><div class="wrap"><p class="eyebrow">Open all year</p><h1>Slow weekends on the quiet side of the bay.</h1><p>Six timber cabins, a cedar sauna and nothing on the schedule. Two hours from the city, a world away from your inbox.</p><a class="btn" href="/cabins">See the cabins</a> <a class="btn ghost" href="/pricing">Pricing</a></div></section>
<section><div class="wrap"><h2>Why people come back</h2><p class="lede">Small on purpose.</p><div class="grid"><article class="card"><img src="/static/photo-1.svg" alt="Cabin at dawn" width="600" height="360"><h3>Wood-fired everything</h3><p>Stove, sauna and hot tub, with dry birch stacked by the door.</p></article><article class="card"><img src="/static/photo-2.svg" alt="Kayaks on the shore" width="600" height="360"><h3>Boats included</h3><p>Two kayaks and a rowing boat wait at every jetty.</p></article><article class="card"><img src="/static/photo-3.svg" alt="Forest path" width="600" height="360"><h3>No signal, by design</h3><p>There is Wi-Fi in the boathouse if you really need it.</p></article></div>
<form role="search" id="siteSearch" style="display:flex;gap:8px;max-width:480px"><input type="search" name="q" aria-label="Search the site" placeholder="Search cabins, pricing…" style="flex:1"><button class="btn" type="submit">Search</button></form></div></section>`),
  '/cabins': () => layout('/cabins', 'Cabins', `<section><div class="wrap"><h1>Cabins</h1><p class="lede">Pick a size. Every cabin has a jetty and a stove.</p>
<div class="tabs" role="tablist" aria-label="Cabin sizes"><button role="tab" id="tab-two" aria-selected="true" aria-controls="panel-two">For two</button><button role="tab" id="tab-four" aria-selected="false" aria-controls="panel-four">For four</button><button role="tab" id="tab-six" aria-selected="false" aria-controls="panel-six">For six</button></div>
<div role="tabpanel" id="panel-two" aria-labelledby="tab-two"><div class="card"><h3>Heron</h3><p>One room, one view. A loft bed over the water and a deck for morning coffee.</p></div></div>
<div role="tabpanel" id="panel-four" aria-labelledby="tab-four" hidden><div class="card"><h3>Osprey</h3><p>Two bedrooms and a long table. The sauna is ten steps from the door.</p></div></div>
<div role="tabpanel" id="panel-six" aria-labelledby="tab-six" hidden><div class="card"><h3>Kingfisher</h3><p>Three bedrooms, a bunk room and its own little beach.</p></div></div>
<h2 style="margin-top:40px">Questions</h2><div class="faq"><button id="faq1" aria-expanded="false" aria-controls="ans1">Can we bring a dog? <span>+</span></button><div class="answer closed" id="ans1">Yes. Dogs stay free and there are towels for muddy paws.</div><button id="faq2" aria-expanded="false" aria-controls="ans2">Is bedding included? <span>+</span></button><div class="answer closed" id="ans2">Linen, towels and firewood are all included.</div></div>
<p style="margin-top:28px"><button class="btn ghost" id="openMap" aria-haspopup="dialog">How to find us</button></p><dialog id="mapDialog" aria-labelledby="mapTitle"><h2 id="mapTitle">Getting here</h2><p>Take the coast road north, turn left at the red boathouse and follow the gravel track to the end.</p><button class="btn" id="closeMap">Close</button></dialog></div></section>`,
  `<script>(function(){var tabs=[].slice.call(document.querySelectorAll('[role=tab]'));tabs.forEach(function(t){t.addEventListener('click',function(){tabs.forEach(function(o){var on=o===t;o.setAttribute('aria-selected',on);document.getElementById(o.getAttribute('aria-controls')).hidden=!on})})});
[].forEach.call(document.querySelectorAll('.faq button'),function(b){b.addEventListener('click',function(){var a=document.getElementById(b.getAttribute('aria-controls'));var open=a.classList.toggle('closed');b.setAttribute('aria-expanded',!open)})});
openMap.onclick=function(){mapDialog.showModal()};closeMap.onclick=function(){mapDialog.close()}})()</script>`),
  '/pricing': () => layout('/pricing', 'Pricing', `<section><div class="wrap"><h1>Pricing</h1><p class="lede">Per cabin, per night. Firewood, linen and boats included.</p><div class="grid"><div class="card"><h3>Heron</h3><p class="price">€140</p><p>Sleeps two</p></div><div class="card"><h3>Osprey</h3><p class="price">€210</p><p>Sleeps four</p></div><div class="card"><h3>Kingfisher</h3><p class="price">€290</p><p>Sleeps six</p></div></div><table><caption style="text-align:left;font-weight:700;padding:8px 0">Seasonal rates</caption><thead><tr><th scope="col">Season</th><th scope="col">Dates</th><th scope="col">Rate</th></tr></thead><tbody><tr><td>Quiet</td><td>November – March</td><td>−20%</td></tr><tr><td>Shoulder</td><td>April, May, October</td><td>Standard</td></tr><tr><td>Summer</td><td>June – September</td><td>+15%</td></tr></tbody></table></div></section>`),
  '/journal': () => layout('/journal', 'Journal', `<section><div class="wrap"><h1>Journal</h1><p class="lede">Notes from the shore.</p><div class="grid"><article class="card"><h3><a href="/journal/first-frost">First frost on the jetty</a></h3><p>The bay went still overnight. We lit the sauna early.</p></article><article class="card"><h3><a href="/journal/sauna-season">Sauna season, explained</a></h3><p>How hot, how long, and when to jump in the water.</p></article><article class="card"><h3>Coming soon</h3><p>The spring opening weekend.</p></article></div></div></section>`),
  '/journal/first-frost': () => layout('/journal', 'First frost on the jetty', `<section><div class="wrap" style="max-width:720px"><p class="eyebrow">Journal</p><h1>First frost on the jetty</h1><img src="/static/photo-1.svg" alt="Frost at dawn" width="600" height="360" style="border-radius:14px;margin:16px 0"><p>The bay went still overnight. By six the boards were white and the herons had the water to themselves. We lit the sauna early and carried coffee down in mittens.</p><p><a href="/journal">Back to the journal</a></p></div></section>`),
  '/journal/sauna-season': () => layout('/journal', 'Sauna season, explained', `<section><div class="wrap" style="max-width:720px"><p class="eyebrow">Journal</p><h1>Sauna season, explained</h1><p>Eighty degrees, fifteen minutes, then the lake. Repeat until dinner. Birch whisks are in the basket by the door.</p><p><a href="/journal">Back to the journal</a></p></div></section>`),
  '/contact': () => layout('/contact', 'Contact', `<section><div class="wrap"><h1>Contact</h1><p class="lede">Ask about dates, dogs or directions. We answer within a day.</p><form class="stack" id="contactForm"><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Cabin<select name="cabin"><option value="heron">Heron</option><option value="osprey">Osprey</option><option value="kingfisher">Kingfisher</option></select></label><label>Message<textarea name="message" rows="5" required></textarea></label><button class="btn" type="submit">Send message</button><div role="alert" id="contactMsg"></div></form></div></section>`,
  `<script>contactForm.addEventListener('submit',function(e){e.preventDefault();fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(contactForm)))}).then(function(r){contactMsg.textContent=r.ok?'Thanks, we will be in touch.':'Something went wrong.'})})</script>`),
  '/terms': () => layout('/terms', 'Terms', `<section><div class="wrap" style="max-width:720px"><h1>Terms</h1><p>Check-in from 15:00, check-out by 11:00. Free cancellation up to seven days before arrival. Please leave the firewood basket full.</p></div></section>`),
  '/login': () => layout('/login', 'Sign in', `<section><div class="wrap"><h1>Sign in</h1><p class="lede">Members can see their bookings.</p><form class="stack" id="loginForm"><label>Email<input id="email" name="email" type="email" required autocomplete="username"></label><label>Password<input id="password" name="password" type="password" required autocomplete="current-password"></label><button class="btn" type="submit">Sign in</button><div role="alert" id="loginErr"></div></form></div></section>`,
  `<script>loginForm.addEventListener('submit',function(e){e.preventDefault();fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.value,password:password.value})}).then(function(r){if(r.ok)location.href='/members';else loginErr.textContent='Invalid email or password'})})</script>`),
  '/members': () => layout('/members', 'Your bookings', `<section><div class="wrap"><h1>Your bookings</h1><p class="lede">Welcome back.</p><table><thead><tr><th scope="col">Cabin</th><th scope="col">Arrive</th><th scope="col">Nights</th><th scope="col">Status</th></tr></thead><tbody id="rows"><tr><td colspan="4">Loading…</td></tr></tbody></table><p style="margin-top:20px"><a class="btn ghost" href="/logout">Sign out</a></p></div></section>`,
  `<script>fetch('/api/bookings').then(function(r){return r.json()}).then(function(d){rows.innerHTML=d.bookings.map(function(b){return '<tr><td>'+b.cabin+'</td><td>'+b.arrive+'</td><td>'+b.nights+'</td><td>'+b.status+'</td></tr>'}).join('')})</script>`),
};
const statics = { '/static/site.css': ['text/css', css], '/static/type.css': ['text/css', typeCss], '/static/logo.svg': ['image/svg+xml', logo], '/static/waves.svg': ['image/svg+xml', waves], '/static/photo-1.svg': ['image/svg+xml', photo(150)], '/static/photo-2.svg': ['image/svg+xml', photo(200)], '/static/photo-3.svg': ['image/svg+xml', photo(95)] };

export function startDemo(port = 0, host = '127.0.0.1') {
  const writes = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
    const authed = /(?:^|;\s*)hp_session=ok/.test(req.headers.cookie || '');
    const send = (code, type, body, headers = {}) => { res.writeHead(code, { 'content-type': type, ...headers }); res.end(body); };
    const body = () => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
    if (statics[p]) return send(200, statics[p][0], statics[p][1], { 'cache-control': 'max-age=60' });
    if (p === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nDisallow: /staff\n');
    if (p === '/sitemap.xml') return send(200, 'application/xml', `<?xml version="1.0"?><urlset>${['/', '/cabins', '/pricing', '/journal', '/terms'].map((r) => `<url><loc>http://${req.headers.host}${r}</loc></url>`).join('')}</urlset>`);
    if (p === '/api/login' && req.method === 'POST') return void body().then((j) => (j.email === DEMO_USER && j.password === DEMO_PASS ? send(200, 'application/json', '{"ok":true}', { 'set-cookie': 'hp_session=ok; Path=/; HttpOnly; SameSite=Lax' }) : send(401, 'application/json', '{"ok":false}')));
    if ((p === '/api/contact' || p === '/api/newsletter') && req.method === 'POST') return void body().then((j) => { writes.push({ path: p, body: j }); send(201, 'application/json', '{"ok":true}'); });
    if (p === '/api/bookings') return authed ? send(200, 'application/json', JSON.stringify({ bookings: [{ cabin: 'Heron', arrive: '2026-12-12', nights: 2, status: 'Confirmed' }, { cabin: 'Osprey', arrive: '2027-02-06', nights: 3, status: 'Deposit paid' }] })) : send(401, 'application/json', '{"error":"sign in"}');
    if (p === '/logout') return send(302, 'text/plain', '', { location: '/login', 'set-cookie': 'hp_session=; Path=/; Max-Age=0' });
    if (p === '/members' && !authed) return send(302, 'text/plain', '', { location: '/login' });
    if (p === '/staff') return send(200, 'text/html; charset=utf-8', layout('/staff', 'Staff', '<section><div class="wrap"><h1>Staff</h1></div></section>'));
    if (pages[p]) return send(200, 'text/html; charset=utf-8', pages[p]());
    return send(404, 'text/html; charset=utf-8', layout('', 'Page not found', `<section><div class="wrap"><p class="eyebrow">404</p><h1>We could not find that page</h1><p class="lede">The path may have washed away. <a href="/">Head back to the shore.</a></p></div></section>`));
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, port: server.address().port, writes })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startDemo(Number(process.argv[2] || process.env.PORT || 4599), process.env.HOST || '127.0.0.1');
  console.log(`Harbor & Pine demo site on http://127.0.0.1:${port}  (account: ${DEMO_USER} / ${DEMO_PASS})`);
}
