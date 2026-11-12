#!/usr/bin/env node
// Interaction discovery + safe state testing (V3). Enumerates forms, buttons, tabs, menus, dialogs,
// accordions, search boxes, filters and pagination, then performs SAFE interactions (hover, open tabs/accordions/menus,
// open-and-close dialogs) and records what changed. Destructive-looking controls are never clicked
// unless --allow-mutations is passed AND the site owner authorised it. Form values are never submitted.
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, usageAndExit, requireUrl, outDir, writeJson, launch, gotoSettled, resolveRoutes, limitList, fileSafe, log,
} from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
discover-interactions.mjs - inventory interactive elements and probe safe state changes

  node scripts/discover-interactions.mjs --url https://example.com [options]

Options:
  --routes /a,/b | --routes-file FILE   default: crawl output (first 10) or the URL
  --max-routes N          default 10
  --max-probes N          Max interactive probes per page (default 25)
  --allow-mutations       Also click controls that look destructive/submitting (needs explicit authorisation)
  --shots                 Save a screenshot after each state change
  --storage-state FILE    Authenticated session
Output: interaction-inventory.json, interaction-inventory.md, shots/
Sample: node scripts/discover-interactions.mjs --url http://localhost:4010 --shots
`, args);

const base = requireUrl(args);
const out = outDir(args, base, 'interactions');
const routes = limitList(resolveRoutes(args, base), args, 10);
const maxProbes = Number(args['max-probes']) || 25;
const RISKY = /(delete|remove|destroy|pay|purchase|buy|order|checkout|confirm|submit|send|logout|log out|sign out|unsubscribe|cancel subscription|deactivate|reset)/i;
const { browser, newContext } = await launch(args);
const context = await newContext('desktop');
const page = await context.newPage();
const inventory = [];

try {
  for (const url of routes) {
    const rec = { url, forms: [], buttons: [], tabs: 0, dialogs: 0, selects: 0, searchInputs: 0, pagination: false, tables: 0, accordions: 0, fileInputs: 0, probes: [], skippedRisky: [] };
    try {
      await gotoSettled(page, url);
      Object.assign(rec, await page.evaluate(() => {
        const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.value || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        const fieldLabel = (f) => (f.labels?.[0]?.textContent || f.getAttribute('aria-label') || f.getAttribute('placeholder') || f.name || f.id || '').trim().slice(0, 60);
        return {
          forms: [...document.querySelectorAll('form')].map((f) => ({ action: f.getAttribute('action'), method: (f.method || 'get').toUpperCase(), fields: [...f.querySelectorAll('input,select,textarea')].filter((i) => i.type !== 'hidden').map((i) => ({ tag: i.tagName.toLowerCase(), type: i.type, name: i.name || i.id, label: fieldLabel(i), required: i.required, pattern: i.pattern || undefined, min: i.min || undefined, max: i.max || undefined, minLength: i.minLength > 0 ? i.minLength : undefined, autocomplete: i.autocomplete || undefined })), submit: [...f.querySelectorAll('button,[type=submit]')].map(label) })),
          buttons: [...document.querySelectorAll('button,[role=button],input[type=button],input[type=submit]')].map((b) => ({ label: label(b), type: b.type, disabled: b.disabled, expanded: b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup'), controls: b.getAttribute('aria-controls') })).slice(0, 80),
          tabs: document.querySelectorAll('[role=tab]').length, dialogs: document.querySelectorAll('dialog,[role=dialog],[aria-modal=true]').length,
          selects: document.querySelectorAll('select,[role=combobox],[role=listbox]').length, searchInputs: document.querySelectorAll('input[type=search],input[name*=search i],input[placeholder*=search i],[role=search]').length,
          pagination: !!document.querySelector('[aria-label*=pagination i],nav.pagination,.pagination,a[rel=next]'), tables: document.querySelectorAll('table,[role=grid],[role=table]').length,
          accordions: document.querySelectorAll('details,[data-accordion],[aria-expanded]').length, fileInputs: document.querySelectorAll('input[type=file]').length,
        };
      }));

      // Safe probes: hover on nav items, activate tabs, toggle aria-expanded, open dialogs (then Escape)
      const candidates = page.locator('[role=tab], [aria-expanded], [aria-haspopup], summary, nav a, header button, button');
      const count = Math.min(await candidates.count(), 120); let probes = 0;
      for (let i = 0; i < count && probes < maxProbes; i++) {
        const el = candidates.nth(i);
        const meta = await el.evaluate((e) => ({ text: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), href: e.getAttribute('href'), type: e.getAttribute('type'), visible: !!(e.offsetWidth || e.offsetHeight), inForm: !!e.closest('form') })).catch(() => null);
        if (!meta || !meta.visible) continue;
        if (meta.tag === 'a' && meta.href && !meta.href.startsWith('#')) { // navigation links: hover only
          const before = await el.evaluate((e) => getComputedStyle(e).color + getComputedStyle(e).textDecorationLine + getComputedStyle(e).backgroundColor).catch(() => '');
          await el.hover({ timeout: 1500 }).catch(() => {}); const after = await el.evaluate((e) => getComputedStyle(e).color + getComputedStyle(e).textDecorationLine + getComputedStyle(e).backgroundColor).catch(() => '');
          if (before !== after) { rec.probes.push({ action: 'hover', target: meta.text, effect: 'style-change' }); probes++; }
          continue;
        }
        if (!args['allow-mutations'] && (RISKY.test(meta.text) || (meta.inForm && (meta.type === 'submit' || meta.type === null) && meta.tag === 'button'))) { rec.skippedRisky.push(meta.text || meta.tag); continue; }
        const snap = () => page.evaluate(() => ({ url: location.href, dialogs: document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]').length, expanded: document.querySelectorAll('[aria-expanded=true]').length, selected: [...document.querySelectorAll('[aria-selected=true]')].map((e) => e.id || (e.textContent || '').trim()).join('|'), textLen: document.body.innerText.length, details: document.querySelectorAll('details[open]').length, nodes: document.getElementsByTagName('*').length, hash: location.hash }));
        const before = await snap();
        try { await el.click({ timeout: 2000, trial: false }); await page.waitForTimeout(250); } catch { continue; }
        const after = await snap();
        const changed = Object.keys(before).filter((k) => before[k] !== after[k] && k !== 'nodes');
        const nodeDelta = after.nodes - before.nodes;
        if (changed.length || Math.abs(nodeDelta) > 3) {
          rec.probes.push({ action: 'click', target: meta.text || meta.tag, role: meta.role, changed, nodeDelta });
          if (args.shots) { const f = path.join(out, 'shots', `${fileSafe(url)}-${probes}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f }).catch(() => {}); }
          probes++;
        }
        if (after.url !== before.url && !after.hash) { await gotoSettled(page, url); continue; }
        if (after.dialogs > before.dialogs) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
      }
      log(`probed ${url}: ${rec.forms.length} forms, ${rec.buttons.length} buttons, ${rec.probes.length} state changes`);
    } catch (e) { rec.error = String(e.message).split('\n')[0]; log(`ERR ${url}: ${rec.error}`); }
    inventory.push(rec);
  }
} finally { await browser.close(); }

writeJson(path.join(out, 'interaction-inventory.json'), { target: base, generatedAt: new Date().toISOString(), mutationsAllowed: !!args['allow-mutations'], pages: inventory });
fs.writeFileSync(path.join(out, 'interaction-inventory.md'), ['# Interaction inventory', '', ...inventory.flatMap((r) => [`## ${r.url}`, `Forms: ${r.forms.length} | Buttons: ${r.buttons.length} | Tabs: ${r.tabs} | Dialogs: ${r.dialogs} | Selects: ${r.selects} | Search inputs: ${r.searchInputs} | Tables: ${r.tables} | Pagination: ${r.pagination} | File inputs: ${r.fileInputs}`, ...r.forms.map((f, i) => `- Form ${i + 1} ${f.method} ${f.action || '(self)'}: ${f.fields.map((x) => `${x.label || x.name}[${x.type}${x.required ? ',req' : ''}]`).join(', ')}`), ...r.probes.map((p) => `- probe ${p.action} "${p.target}" -> ${(p.changed || [p.effect]).join(',')}`), r.skippedRisky.length ? `- skipped risky controls: ${r.skippedRisky.join('; ')}` : '', ''])].join('\n'));
log(`\nInteraction inventory -> ${out}`);
