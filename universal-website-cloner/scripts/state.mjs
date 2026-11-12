#!/usr/bin/env node
// Resumable project state + cross-agent handoff log (V12). Plain JSON in clone-workspace/<host>/state.json so any
// agent (or a different AI host) can resume exactly where the previous one stopped.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, usageAndExit, SKILL_ROOT, hostSlug, writeJson, readJson, die, log } from './lib/common.mjs';

export const PHASES = ['startup', 'discovery', 'architecture', 'implementation', 'qa', 'refinement', 'final-report'];
const args = parseArgs();
usageAndExit(`
state.mjs - resumable project state

  node scripts/state.mjs init --url https://example.com [--auth required|none|unknown]
  node scripts/state.mjs show --site example-com
  node scripts/state.mjs phase --site example-com --name discovery --status done
  node scripts/state.mjs note  --site example-com --agent frontend "Built dashboard shell"
  node scripts/state.mjs next  --site example-com        # prints the next unfinished phase
  node scripts/state.mjs list

Statuses: pending | in-progress | done | blocked
`, args);

const cmd = args._[0];
const file = (site) => path.join(SKILL_ROOT, 'clone-workspace', site, 'state.json');
const site = args.site && args.site !== true ? String(args.site) : args.url && args.url !== true ? hostSlug(String(args.url)) : null;
const load = () => { if (!site) die('--site <slug> (or --url) required'); if (!fs.existsSync(file(site))) die(`No state for "${site}". Run: init --url <url>`); return readJson(file(site)); };

if (cmd === 'init') {
  if (!args.url || args.url === true) die('init requires --url');
  if (fs.existsSync(file(site)) && !args.force) die(`State exists for ${site}. Use --force to overwrite.`);
  writeJson(file(site), { site, url: String(args.url), createdAt: new Date().toISOString(), auth: args.auth || 'unknown', phases: Object.fromEntries(PHASES.map((p) => [p, { status: 'pending' }])), log: [], decisions: [], openIssues: [] });
  log(`Initialised ${file(site)}`);
} else if (cmd === 'show') {
  const s = load(); log(JSON.stringify(s, null, 2));
} else if (cmd === 'phase') {
  const s = load(); const name = args.name; if (!PHASES.includes(name)) die(`--name must be one of ${PHASES.join(', ')}`);
  if (!['pending', 'in-progress', 'done', 'blocked'].includes(args.status)) die('--status must be pending|in-progress|done|blocked');
  s.phases[name] = { status: args.status, updatedAt: new Date().toISOString(), note: args.note && args.note !== true ? String(args.note) : undefined };
  s.log.push({ at: new Date().toISOString(), agent: 'orchestrator', message: `phase ${name} -> ${args.status}` }); writeJson(file(site), s); log(`phase ${name}: ${args.status}`);
} else if (cmd === 'note') {
  const s = load(); const msg = args._.slice(1).join(' '); if (!msg) die('Provide a note text'); s.log.push({ at: new Date().toISOString(), agent: args.agent && args.agent !== true ? String(args.agent) : 'unknown', message: msg });
  if (args.issue) s.openIssues.push({ at: new Date().toISOString(), issue: msg }); writeJson(file(site), s); log('noted');
} else if (cmd === 'next') {
  const s = load(); const n = PHASES.find((p) => s.phases[p].status !== 'done'); log(n ? `Next phase: ${n} (${s.phases[n].status})` : 'All phases done.');
} else if (cmd === 'list') {
  const dir = path.join(SKILL_ROOT, 'clone-workspace'); if (!fs.existsSync(dir)) { log('No projects yet.'); process.exit(0); }
  for (const d of fs.readdirSync(dir)) if (fs.existsSync(file(d))) { const s = readJson(file(d)); log(`${d}  ${s.url}  next=${PHASES.find((p) => s.phases[p].status !== 'done') || 'complete'}`); }
} else die('Unknown command. Use --help.');
