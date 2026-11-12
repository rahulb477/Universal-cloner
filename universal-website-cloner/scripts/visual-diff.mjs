#!/usr/bin/env node
// Pixel-level visual comparison of two screenshot folders (V2/V8).
// Requirements: pixelmatch + pngjs (npm install). No browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs, usageAndExit, die, num, writeJson, ensureDir, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
visual-diff.mjs - compare reference vs clone screenshots

  node scripts/visual-diff.mjs --reference DIR --candidate DIR [options]

Options:
  --out DIR           Where to write diff PNGs + report (default ./visual-diff-out)
  --threshold F       pixelmatch colour threshold 0..1 (default 0.1)
  --max-mismatch PCT  Fail (exit 1) if any image mismatches more than PCT percent (default 100 = report only)
  --update-baseline   Copy candidate over reference (use deliberately, for regression baselines)

Both folders should have the layout produced by screenshot.mjs: <viewport>/<route>.png.
Images with different heights are padded (white) and the height delta is reported as a layout mismatch.
Output: report.json, report.md, <viewport>/<route>.diff.png
Sample: node scripts/visual-diff.mjs --reference .../reference --candidate .../clone --max-mismatch 5
`, args);

const refDir = args.reference && args.reference !== true ? path.resolve(String(args.reference)) : die('--reference DIR required');
const candDir = args.candidate && args.candidate !== true ? path.resolve(String(args.candidate)) : die('--candidate DIR required');
if (!fs.existsSync(refDir)) die(`Reference folder not found: ${refDir}`);
if (!fs.existsSync(candDir)) die(`Candidate folder not found: ${candDir}`);
const out = ensureDir(path.resolve(args.out && args.out !== true ? String(args.out) : 'visual-diff-out'));
const threshold = num(args.threshold, 0.1);
const maxMismatch = num(args['max-mismatch'], 100);

const require = createRequire(import.meta.url);
let PNG, pixelmatch;
try { ({ PNG } = require('pngjs')); pixelmatch = (await import('pixelmatch')).default; }
catch { die('pixelmatch/pngjs missing. Run `npm install` in the skill root.'); }

function listPngs(dir) {
  const res = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.png$/i.test(e.name) && !/\.diff\.png$/.test(e.name)) res.push(path.relative(dir, p)); } })(dir);
  return res.sort();
}
function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const o = new PNG({ width: w, height: h }); o.data.fill(255);
  PNG.bitblt(png, o, 0, 0, png.width, png.height, 0, 0); return o;
}

const refs = listPngs(refDir); const cands = new Set(listPngs(candDir));
const results = []; let worst = 0;
for (const rel of refs) {
  if (!cands.has(rel)) { results.push({ image: rel, status: 'missing-in-candidate' }); worst = 100; continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(refDir, rel)));
  const b = PNG.sync.read(fs.readFileSync(path.join(candDir, rel)));
  const w = Math.max(a.width, b.width); const h = Math.max(a.height, b.height);
  const A = pad(a, w, h); const B = pad(b, w, h);
  const diff = new PNG({ width: w, height: h });
  const px = pixelmatch(A.data, B.data, diff.data, w, h, { threshold, includeAA: false });
  const pct = +(px / (w * h) * 100).toFixed(3);
  const diffPath = path.join(out, rel.replace(/\.png$/i, '.diff.png'));
  ensureDir(path.dirname(diffPath)); fs.writeFileSync(diffPath, PNG.sync.write(diff));
  worst = Math.max(worst, pct);
  results.push({ image: rel, mismatchPercent: pct, mismatchedPixels: px, referenceSize: [a.width, a.height], candidateSize: [b.width, b.height], heightDelta: b.height - a.height, diff: path.relative(out, diffPath), status: pct <= maxMismatch ? 'pass' : 'fail' });
  log(`${pct <= maxMismatch ? 'ok  ' : 'FAIL'} ${rel}  ${pct}%  (h delta ${b.height - a.height})`);
}
for (const rel of cands) if (!refs.includes(rel)) results.push({ image: rel, status: 'extra-in-candidate' });

const report = { generatedAt: new Date().toISOString(), threshold, maxMismatch, worstMismatchPercent: worst, results,
  caveat: 'Pixel diff is evidence, not proof of equivalence. Dynamic content, fonts and animation cause noise; review diff images manually and record findings in the visual mismatch register.' };
writeJson(path.join(out, 'report.json'), report);
fs.writeFileSync(path.join(out, 'report.md'), ['# Visual diff report', '', '| Image | Mismatch % | Height delta | Status |', '|---|---|---|---|', ...results.map((r) => `| ${r.image} | ${r.mismatchPercent ?? '-'} | ${r.heightDelta ?? '-'} | ${r.status} |`), '', `> ${report.caveat}`, ''].join('\n'));
if (args['update-baseline']) { for (const rel of cands) { const dst = path.join(refDir, rel); ensureDir(path.dirname(dst)); fs.copyFileSync(path.join(candDir, rel), dst); } log('Baseline updated.'); }
log(`\nWorst mismatch: ${worst}%  -> ${path.join(out, 'report.md')}`);
if (results.some((r) => r.status === 'fail' || r.status === 'missing-in-candidate')) process.exit(1);
