#!/usr/bin/env node
// Secret scanner (V11). Looks for credentials, private keys, tokens and session files in a directory
// before you commit, zip or share. Dependency-free. Pattern list is heuristic: a pass is not a guarantee.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, usageAndExit, redact } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
scan-secrets.mjs - detect leaked credentials and session artefacts

  node scripts/scan-secrets.mjs [DIR] [--allow-file PATH ...]

Default DIR is the current directory. Skips node_modules, .git, .next, dist.
Detects: private keys, AWS/GitHub/Slack/Stripe/Google/OpenAI-style tokens, JWTs, password assignments with literal values,
.env files, Playwright storage-state files, cookie dumps, HAR files.
Exit code: 1 when findings exist.
`, args);

const root = path.resolve(args._[0] || '.');
const allow = [].concat(args['allow-file'] || []).filter((x) => x !== true).map(String);
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'artifacts', 'clone-workspace']);
const PATTERNS = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['stripe-key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['openai-style-key', /\bsk-[A-Za-z0-9_-]{32,}\b/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['password-literal', /(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'$<{\s][^"']{5,}["']/i],
];
const SUSPECT_FILES = [[/(^|\/)\.env(\.|$)(?!example)/, 'env-file'], [/storage-state\.json$/, 'playwright-storage-state'], [/\.har$/, 'har-capture'], [/cookies?\.(json|txt)$/i, 'cookie-dump']];
const findings = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name); const rel = path.relative(root, p).split(path.sep).join('/');
    if (e.isDirectory()) { walk(p); continue; }
    if (allow.includes(rel)) continue;
    for (const [re, kind] of SUSPECT_FILES) if (re.test(rel) && !rel.endsWith('.env.example')) findings.push({ file: rel, kind });
    const st = fs.statSync(p); if (st.size > 2 * 1024 * 1024 || /\.(png|jpe?g|gif|webp|ico|zip|woff2?|pdf)$/i.test(e.name)) continue;
    const text = fs.readFileSync(p, 'utf8'); if (text.includes('\u0000')) continue;
    text.split(/\r?\n/).forEach((line, i) => { for (const [kind, re] of PATTERNS) if (re.test(line) && !/example|placeholder|your[-_ ]|<[a-z_ -]+>|\*{3,}|xxxx|REDACTED/i.test(line)) findings.push({ file: rel, line: i + 1, kind, excerpt: redact(line.trim().slice(0, 60)) + '…' }); });
  }
}
walk(root);
if (!findings.length) { console.log(`No secrets found under ${root} (heuristic scan).`); process.exit(0); }
console.error(`Found ${findings.length} potential secret(s):`);
for (const f of findings) console.error(`  [${f.kind}] ${f.file}${f.line ? ':' + f.line : ''} ${f.excerpt || ''}`);
process.exit(1);
