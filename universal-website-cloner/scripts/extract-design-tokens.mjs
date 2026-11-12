#!/usr/bin/env node
// Design token extraction (V6/V9): colours, typography, spacing, radii, shadows, CSS variables,
// breakpoints, transitions and keyframe names, measured from computed styles.
// Output is a *measurement* to guide an independent implementation; never copy proprietary CSS verbatim.
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, resolveRoutes, limitList, log,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
extract-design-tokens.mjs - measure the design system actually rendered on the page

  node scripts/extract-design-tokens.mjs --url https://example.com [options]

Options:
  --routes /a,/b | --routes-file FILE   default: crawl output (first 5) or the URL
  --max-routes N         default 5
  --viewports LIST       desktop,mobile (default desktop)
  --storage-state FILE   Authenticated session
Output: design-tokens.json, design-tokens.md (frequency-ranked)
Sample: node scripts/extract-design-tokens.mjs --url http://localhost:4010
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'tokens');
const routes = limitList(resolveRoutes(args, base), args, 5);
const vps = (args.viewports && args.viewports !== true ? String(args.viewports) : 'desktop').split(',');
const { browser, newContext } = await launch(args);
const agg = { colors: {}, backgrounds: {}, borders: {}, fontFamilies: {}, fontSizes: {}, fontWeights: {}, lineHeights: {}, letterSpacings: {}, radii: {}, shadows: {}, spacing: {}, transitions: {}, cssVariables: {}, breakpoints: {}, keyframes: {}, fontFaces: [], zIndexes: {} };
const bump = (o, k) => { if (k && k !== 'none' && k !== 'normal' && k !== '0px') o[k] = (o[k] || 0) + 1; };

try {
  for (const vp of vps) {
    const context = await newContext(vp);
    const page = await context.newPage();
    for (const url of routes) {
      try {
        await gotoSettled(page, url);
        const data = await page.evaluate(() => {
          const r = { colors: [], backgrounds: [], borders: [], fontFamilies: [], fontSizes: [], fontWeights: [], lineHeights: [], letterSpacings: [], radii: [], shadows: [], spacing: [], transitions: [], zIndexes: [], cssVariables: {}, breakpoints: [], keyframes: [], fontFaces: [] };
          const els = [...document.querySelectorAll('body, body *')].slice(0, 2500);
          for (const el of els) {
            const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
            if (hasText) { r.colors.push(cs.color); r.fontFamilies.push(cs.fontFamily); r.fontSizes.push(cs.fontSize); r.fontWeights.push(cs.fontWeight); r.lineHeights.push(cs.lineHeight); r.letterSpacings.push(cs.letterSpacing); }
            if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') r.backgrounds.push(cs.backgroundColor);
            if (cs.backgroundImage.includes('gradient')) r.backgrounds.push(cs.backgroundImage.slice(0, 160));
            if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') r.borders.push(`${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`);
            r.radii.push(cs.borderTopLeftRadius); r.shadows.push(cs.boxShadow);
            for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) r.spacing.push(cs[p]);
            if (cs.transitionDuration !== '0s') r.transitions.push(`${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}`);
            if (cs.zIndex !== 'auto') r.zIndexes.push(cs.zIndex);
          }
          const rootCs = getComputedStyle(document.documentElement);
          for (const sheet of [...document.styleSheets]) {
            let rules; try { rules = sheet.cssRules; } catch { continue; }
            for (const rule of rules) {
              if (rule.type === CSSRule.MEDIA_RULE) { const m = rule.conditionText.match(/\((?:min|max)-width:\s*([\d.]+(?:px|em|rem))\)/g); if (m) r.breakpoints.push(...m.map((x) => x.replace(/[()]/g, ''))); }
              if (rule.type === CSSRule.KEYFRAMES_RULE) r.keyframes.push(rule.name);
              if (rule.type === CSSRule.FONT_FACE_RULE) r.fontFaces.push({ family: rule.style.getPropertyValue('font-family'), weight: rule.style.getPropertyValue('font-weight'), style: rule.style.getPropertyValue('font-style'), display: rule.style.getPropertyValue('font-display') });
              if (rule.selectorText === ':root' || rule.selectorText === 'html') for (const p of rule.style) if (p.startsWith('--')) r.cssVariables[p] = rootCs.getPropertyValue(p).trim().slice(0, 100);
            }
          }
          return r;
        });
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v) && k !== 'fontFaces') v.forEach((x) => bump(agg[k] ||= {}, x));
          else if (k === 'fontFaces') agg.fontFaces.push(...v);
          else Object.assign(agg.cssVariables, v);
        }
        log(`measured ${vp} ${url}`);
      } catch (e) { log(`ERR ${url}: ${String(e.message).split('\n')[0]}`); }
    }
    await context.close();
  }
} finally { await browser.close(); }

const top = (o, n = 12) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));
const result = { target: base, generatedAt: new Date().toISOString() };
for (const k of Object.keys(agg)) result[k] = k === 'fontFaces' ? [...new Map(agg.fontFaces.map((f) => [JSON.stringify(f), f])).values()] : k === 'cssVariables' ? agg.cssVariables : top(agg[k], k === 'spacing' ? 16 : 12);
writeJson(path.join(out, 'design-tokens.json'), result);
const section = (t, list) => [`## ${t}`, ...(list.length ? list.map((x) => `- \`${x.value}\` x${x.count}`) : ['- none detected']), ''];
fs.writeFileSync(path.join(out, 'design-tokens.md'), ['# Design tokens (measured)', '', `Source: ${base}`, '', ...section('Text colours', result.colors), ...section('Backgrounds', result.backgrounds), ...section('Borders', result.borders), ...section('Font families', result.fontFamilies), ...section('Font sizes', result.fontSizes), ...section('Font weights', result.fontWeights), ...section('Line heights', result.lineHeights), ...section('Radii', result.radii), ...section('Shadows', result.shadows), ...section('Spacing values', result.spacing), ...section('Transitions', result.transitions), ...section('Breakpoints', result.breakpoints), ...section('Keyframes', result.keyframes), '## CSS variables (:root)', ...Object.entries(result.cssVariables).slice(0, 80).map(([k, v]) => `- \`${k}: ${v}\``), '', '## @font-face', ...result.fontFaces.map((f) => `- ${f.family} ${f.weight} ${f.style}`), ''].join('\n'));
log(`\nTokens -> ${out}`);
