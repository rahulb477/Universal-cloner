#!/usr/bin/env node
// Package the repository into one ZIP (without node_modules, workspaces, sessions or secrets).
// Uses the `zip` CLI if present, then python3's zipfile, then PowerShell Compress-Archive.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseArgs, usageAndExit, SKILL_ROOT, ensureDir, readJson, die, log } from './lib/common.mjs';

const args = parseArgs();
usageAndExit(`
package-zip.mjs - build dist/universal-website-cloner-v<version>.zip

  node scripts/package-zip.mjs [--out FILE] [--skip-validate]

Runs validate-repo.mjs first (unless --skip-validate), stages a clean copy, zips it, writes a .sha256 file.
Excluded: node_modules, clone-workspace, .auth, dist, artifacts, *.log, .env*, *storage-state.json
`, args);

if (!args['skip-validate']) {
  const v = spawnSync(process.execPath, [path.join(SKILL_ROOT, 'scripts/validate-repo.mjs')], { stdio: 'inherit' });
  if (v.status !== 0) die('Validation failed; fix the repository before packaging.');
}
const version = readJson(path.join(SKILL_ROOT, 'package.json')).version;
const outFile = path.resolve(args.out && args.out !== true ? String(args.out) : path.join(SKILL_ROOT, 'dist', `universal-website-cloner-v${version}.zip`));
ensureDir(path.dirname(outFile)); fs.rmSync(outFile, { force: true });

const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uwc-'));
const stage = path.join(stageRoot, 'universal-website-cloner');
const EXCLUDE_DIRS = new Set(['node_modules', 'clone-workspace', '.auth', 'dist', 'artifacts', '.git']);
fs.cpSync(SKILL_ROOT, stage, { recursive: true, filter: (src) => { const b = path.basename(src); return !EXCLUDE_DIRS.has(b) && !/\.log$/.test(b) && !/storage-state\.json$/.test(b) && !(b.startsWith('.env') && b !== '.env.example'); } });

let ok = false; let tool = '';
if (spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0) { tool = 'zip'; ok = spawnSync('zip', ['-r', '-q', outFile, 'universal-website-cloner'], { cwd: stageRoot }).status === 0; }
if (!ok && spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0) {
  tool = 'python3 zipfile';
  const py = `import zipfile,os,sys\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)\nfor r,d,f in os.walk('universal-website-cloner'):\n  for n in f: z.write(os.path.join(r,n))\nz.close()`;
  ok = spawnSync('python3', ['-c', py, outFile], { cwd: stageRoot }).status === 0;
}
if (!ok && process.platform === 'win32') { tool = 'PowerShell'; ok = spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}' -DestinationPath '${outFile}'`]).status === 0; }
fs.rmSync(stageRoot, { recursive: true, force: true });
if (!ok) die('No zip tool available (tried zip, python3, PowerShell). Zip the folder manually, excluding node_modules and clone-workspace.');
const sha = crypto.createHash('sha256').update(fs.readFileSync(outFile)).digest('hex');
fs.writeFileSync(outFile + '.sha256', `${sha}  ${path.basename(outFile)}\n`);
log(`Created ${outFile} via ${tool} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)\nSHA-256 ${sha}`);
