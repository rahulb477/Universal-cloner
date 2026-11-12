#!/usr/bin/env node
// Asset discovery (V9): images, fonts, icons, media, inline SVGs, favicons and stylesheet inventory.
// DEFAULT = inventory only. Downloading is opt-in (--download) because assets are usually copyrighted.
// Download only assets you own or are licensed to reuse, and prefer replacing them with original/licensed ones.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, autoScroll, resolveRoutes, limitList, log, USER_AGENT,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
extract-assets.mjs - inventory (and optionally download) page assets

  node scripts/extract-assets.mjs --url https://example.com [options]

Options:
  --routes /a,/b | --routes-file FILE   default: crawl output (first 10) or the URL
  --max-routes N        default 10
  --download            Save images/fonts/media locally to <out>/files (ONLY if you are licensed to reuse them)
  --max-size-mb N       Skip files larger than N MB when downloading (default 5)
  --storage-state FILE  Authenticated session
Output: asset-inventory.json, asset-inventory.md, optional files/
Sample: node scripts/extract-assets.mjs --url http://localhost:4010 --download
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'assets');
const routes = limitList(resolveRoutes(args, base), args, 10);
const maxBytes = (Number(args['max-size-mb']) || 5) * 1024 * 1024;
const { browser, newContext } = await launch(args);
const context = await newContext('desktop');
const page = await context.newPage();
const assets = new Map();
const kindOf = (ct, url) => /image\/svg/.test(ct) || /\.svg(\?|$)/i.test(url) ? 'svg' : /^image\//.test(ct) ? 'image' : /font|woff|ttf|otf/.test(ct) || /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url) ? 'font' : /^(video|audio)\//.test(ct) ? 'media' : /css/.test(ct) ? 'stylesheet' : null;

page.on('response', async (res) => {
  try {
    const url = res.url(); if (url.startsWith('data:')) return;
    const ct = res.headers()['content-type'] || ''; const kind = kindOf(ct, url); if (!kind || kind === 'stylesheet') return;
    const len = Number(res.headers()['content-length']) || 0;
    const a = assets.get(url) || { url, kind, contentType: ct, bytes: len, pages: new Set(), thirdParty: new URL(url).origin !== new URL(base).origin };
    a.pages.add(page.url()); assets.set(url, a);
  } catch { /* ignore */ }
});

const extra = { inlineSvgs: 0, iconLinks: [], cssBackgrounds: new Set(), fontFamiliesUsed: new Set(), iconFonts: new Set(), logos: [] };
try {
  for (const url of routes) {
    try {
      await gotoSettled(page, url); await autoScroll(page, 4000); await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const abs = (v) => { try { return new URL(v, location.href).toString(); } catch { return null; } };
        const bgs = new Set(); const fams = new Set();
        document.querySelectorAll('*').forEach((el) => { const cs = getComputedStyle(el); const m = cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/g); if (m) m.forEach((x) => { const u = x.replace(/url\(["']?|["']?\)/g, ''); if (!u.startsWith('data:')) bgs.add(abs(u)); }); fams.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()); });
        const iconFonts = [...fams].filter((f) => /icon|awesome|material|glyph|symbols/i.test(f));
        const logos = [...document.querySelectorAll('img[alt*=logo i],img[src*=logo i],header img,a[href="/"] img,a[href="/"] svg')].map((e) => e.tagName === 'IMG' ? { type: 'img', src: abs(e.getAttribute('src')), alt: e.alt } : { type: 'inline-svg', width: e.getBoundingClientRect().width });
        return { inlineSvgs: document.querySelectorAll('svg').length, icons: [...document.querySelectorAll('link[rel*=icon],link[rel=manifest],link[rel=apple-touch-icon]')].map((l) => ({ rel: l.rel, href: abs(l.getAttribute('href')) })), bgs: [...bgs], fams: [...fams], iconFonts, logos };
      });
      extra.inlineSvgs = Math.max(extra.inlineSvgs, info.inlineSvgs);
      info.icons.forEach((i) => extra.iconLinks.push(i)); info.bgs.forEach((b) => extra.cssBackgrounds.add(b)); info.fams.forEach((f) => extra.fontFamiliesUsed.add(f)); info.iconFonts.forEach((f) => extra.iconFonts.add(f)); extra.logos.push(...info.logos);
      log(`scanned ${url}`);
    } catch (e) { log(`ERR ${url}: ${String(e.message).split('\n')[0]}`); }
  }
} finally { await browser.close(); }

const list = [...assets.values()].map((a) => ({ ...a, pages: [...a.pages] }));
const downloaded = [];
if (args.download) {
  const dir = path.join(out, 'files'); fs.mkdirSync(dir, { recursive: true });
  for (const a of list) {
    try {
      const r = await fetch(a.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue; const buf = Buffer.from(await r.arrayBuffer()); a.bytes = buf.length; if (buf.length > maxBytes) { a.skipped = 'too-large'; continue; }
      const ext = path.extname(new URL(a.url).pathname) || ''; const name = `${a.kind}-${crypto.createHash('sha1').update(a.url).digest('hex').slice(0, 10)}${ext}`;
      fs.writeFileSync(path.join(dir, name), buf); a.localFile = `files/${name}`; downloaded.push(name);
    } catch { a.skipped = 'download-failed'; }
  }
}
const inv = { target: base, generatedAt: new Date().toISOString(), licenceNotice: 'Inventory only unless --download was used. Reuse only assets you are licensed to use; otherwise recreate or substitute original assets.', counts: { total: list.length, images: list.filter((a) => a.kind === 'image').length, svg: list.filter((a) => a.kind === 'svg').length, fonts: list.filter((a) => a.kind === 'font').length, media: list.filter((a) => a.kind === 'media').length, thirdParty: list.filter((a) => a.thirdParty).length, inlineSvgsMax: extra.inlineSvgs, downloaded: downloaded.length }, assets: list, iconLinks: extra.iconLinks, cssBackgrounds: [...extra.cssBackgrounds], fontFamiliesUsed: [...extra.fontFamiliesUsed], iconFonts: [...extra.iconFonts], logos: extra.logos };
writeJson(path.join(out, 'asset-inventory.json'), inv);
fs.writeFileSync(path.join(out, 'asset-inventory.md'), ['# Asset inventory', '', `> ${inv.licenceNotice}`, '', `Counts: ${JSON.stringify(inv.counts)}`, '', `Font families in use: ${inv.fontFamiliesUsed.join(', ')}`, `Icon fonts: ${inv.iconFonts.join(', ') || 'none detected'}`, '', '| Kind | URL | Bytes | Third-party |', '|---|---|---|---|', ...list.map((a) => `| ${a.kind} | ${a.url} | ${a.bytes || '?'} | ${a.thirdParty ? 'yes' : 'no'} |`), ''].join('\n'));
log(`\n${list.length} assets inventoried (${downloaded.length} downloaded) -> ${out}`);
