// Build: composes src/pages + src/components into dist/, copies styles, scripts and assets,
// writes the search index and checks every local link. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const read = (f) => fs.readFileSync(f, 'utf8');
const json = (f, fallback) => { try { return JSON.parse(read(f)); } catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Cannot read ${path.relative(ROOT, f)}: ${e.message}`); } };
const errors = [];
const warnings = [];

const site = json(path.join(SRC, 'data/site.json'));
const forms = json(path.join(SRC, 'data/forms.json'), {});
const interactions = json(path.join(SRC, 'data/interactions.json'), {});

// dist/ may be the only writable folder: empty it instead of removing it.
fs.mkdirSync(DIST, { recursive: true });
for (const e of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, e), { recursive: true, force: true });

const copyDir = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true }); };
copyDir(path.join(SRC, 'styles'), path.join(DIST, 'styles'));
copyDir(path.join(SRC, 'scripts'), path.join(DIST, 'scripts'));
copyDir(path.join(ROOT, 'public'), DIST);

function expandIncludes(html, from, depth = 0) {
  return html.replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (m, rel) => {
    const file = path.join(SRC, rel);
    if (!file.startsWith(SRC + path.sep) || !fs.existsSync(file)) { errors.push(`${from}: include not found: ${rel}`); return m; }
    return depth > 5 ? m : expandIncludes(read(file).trim(), rel, depth + 1);
  });
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const toText = (html) => html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const routes = new Set(site.routes.map((r) => r.route));
const publicSite = {
  name: site.name, startRoute: site.startRoute, loginRoute: site.loginRoute, afterLoginRoute: site.afterLoginRoute, features: site.features,
  routes: site.routes.map((r) => ({ route: r.route, title: r.title, protected: !!r.protected })),
};
const searchIndex = [];
const built = [];

for (const page of site.routes) {
  const srcFile = path.join(SRC, 'pages', page.file);
  if (!fs.existsSync(srcFile)) { errors.push(`Page source missing: src/pages/${page.file} (route ${page.route})`); continue; }
  const depth = page.file.split('/').length - 1;
  // The not-found page is served at any depth, so the server fills in the prefix per request.
  const root = page.errorPage ? '__ROOT__' : depth ? '../'.repeat(depth) : './';
  let html = expandIncludes(read(srcFile), `src/pages/${page.file}`).replaceAll('{{root}}', root);
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) { errors.push(`src/pages/${page.file}: missing </head> or </body>`); continue; }
  const runtime = {
    site: publicSite, route: page.route,
    interactions: interactions[page.route] || [],
    forms: Object.fromEntries(Object.entries(forms).map(([id, f]) => [id, { kind: f.kind }])),
  };
  const head = [
    `<meta name="uwc-root" content="${root}">`,
    `<link rel="stylesheet" href="${root}styles/uwc-runtime.css">`,
    site.features.animations === false ? `<style>*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}</style>` : '',
  ].join('\n');
  if (site.features.responsive === false) html = html.replace(/<meta name="viewport"[^>]*>/i, '<meta name="viewport" content="width=1280">');
  if (page.protected && site.features.auth) html = html.replace(/<html\b/i, '<html data-uwc-guard');
  html = html.replace(/<\/head>/i, `${head}\n</head>`);
  const data = JSON.stringify(runtime).replace(/</g, '\\u003c');
  html = html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `<script type="application/json" id="uwc-data">${data}</script>\n<script src="${root}scripts/site.js" defer></script>\n</body>`);
  const out = path.join(DIST, page.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  built.push({ page, html, depth });
  if (!page.protected && !page.errorPage) {
    const main = (html.match(/<body[\s\S]*<\/body>/i) || [''])[0];
    searchIndex.push({ route: page.route, title: page.title || page.route, text: toText(main).slice(0, 6000) });
  }
}

// Link check: every relative href/src must resolve to a built route or an existing file.
for (const { page, html, depth } of built) {
  if (page.errorPage) continue;
  const dir = path.posix.dirname('/' + page.file);
  const seen = new Set();
  for (const m of html.matchAll(/\s(?:href|src|poster)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (seen.has(raw) || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue;
    seen.add(raw);
    const target = path.posix.normalize(path.posix.join(dir, raw.split(/[?#]/)[0] || '.'));
    const route = target.length > 1 ? target.replace(/\/$/, '') : '/';
    if (routes.has(route)) continue;
    if (target.startsWith('/..')) { warnings.push(`${page.route}: link escapes the site root: ${raw}`); continue; }
    if (fs.existsSync(path.join(DIST, target)) && fs.statSync(path.join(DIST, target)).isFile()) continue;
    if (path.posix.extname(target) && !/\.html?$/i.test(target)) warnings.push(`${page.route}: missing file ${raw}`);
    else warnings.push(`${page.route}: links to ${route}, which is not part of this clone (served as 404)`);
  }
  void depth;
}

fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify(searchIndex));
fs.writeFileSync(path.join(DIST, 'site.json'), JSON.stringify({ ...publicSite, routes: site.routes, forms, builtAt: new Date().toISOString() }));

for (const w of warnings.slice(0, 60)) console.log(`warning: ${w}`);
if (warnings.length > 60) console.log(`warning: … and ${warnings.length - 60} more`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`Build failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Built ${built.length} page(s) into dist/ · ${searchIndex.length} indexed for search · ${warnings.length} warning(s)`);
