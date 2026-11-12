#!/usr/bin/env node
// MCP configuration discovery (V7). Lists servers that are CONFIGURED in well-known host config files.
// "Configured" is not "connected": a script cannot see your AI host's live tool list. Always confirm by listing tools inside the host.
// Secrets in env/headers are never printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, usageAndExit, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
mcp-check.mjs - find MCP servers configured on this machine / project

  node scripts/mcp-check.mjs [--project DIR] [--json]

Scans: .mcp.json, .cursor/mcp.json, .vscode/mcp.json, opencode.json, ~/.claude.json, ~/.cursor/mcp.json,
~/.gemini/settings.json, .gemini/settings.json, ~/.codex/config.toml, ~/.config/opencode/opencode.json
`, args);

const proj = path.resolve(args.project && args.project !== true ? String(args.project) : process.cwd());
const home = os.homedir();
const files = [
  [path.join(proj, '.mcp.json'), 'Claude Code (project)'], [path.join(proj, '.cursor', 'mcp.json'), 'Cursor (project)'], [path.join(proj, '.vscode', 'mcp.json'), 'VS Code / Copilot (project)'],
  [path.join(proj, 'opencode.json'), 'opencode (project)'], [path.join(proj, '.gemini', 'settings.json'), 'Gemini CLI (project)'],
  [path.join(home, '.claude.json'), 'Claude Code (user)'], [path.join(home, '.cursor', 'mcp.json'), 'Cursor (user)'], [path.join(home, '.gemini', 'settings.json'), 'Gemini CLI (user)'],
  [path.join(home, '.config', 'opencode', 'opencode.json'), 'opencode (user)'], [path.join(home, '.codex', 'config.toml'), 'Codex (user)'],
];
const found = [];
for (const [file, host] of files) {
  if (!fs.existsSync(file)) continue;
  try {
    const raw = fs.readFileSync(file, 'utf8'); let names = [];
    if (file.endsWith('.toml')) names = [...raw.matchAll(/^\[mcp_servers\.([^\].]+)\]/gm)].map((m) => m[1]);
    else { const j = JSON.parse(raw); const sets = [j.mcpServers, j.servers, j.mcp, ...(j.projects ? Object.values(j.projects).map((p) => p?.mcpServers) : [])].filter(Boolean); names = [...new Set(sets.flatMap((s) => Object.keys(s)))]; }
    found.push({ host, file: file.replace(home, '~'), servers: names });
  } catch (e) { found.push({ host, file: file.replace(home, '~'), error: 'unreadable/unparseable: ' + String(e.message).slice(0, 60) }); }
}
if (args.json) { console.log(JSON.stringify(found, null, 2)); process.exit(0); }
if (!found.length) log('No MCP configuration files found. That is fine: use the script-based workflow (Playwright) or see mcp/README.md to add servers.');
for (const f of found) log(`${f.host}\n  ${f.file}\n  ${f.error || (f.servers.length ? f.servers.join(', ') : '(no servers)')}\n`);
log('Reminder: configured != connected. Verify live tools inside your AI host (see mcp/verification.md) before relying on any server.');
