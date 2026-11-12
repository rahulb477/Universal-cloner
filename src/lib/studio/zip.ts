import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { allSecretsForScan } from "./providers";
import { exportsDir, siteDir } from "./store";

export type ZipInfo = {
  file: string; name: string; bytes: number; sha256: string; entries: number; createdAt: string;
  checks: { name: string; ok: boolean; detail: string }[]; warnings: string[]; external: string[];
};

const EXCLUDE_DIRS = new Set(["node_modules", "dist", "data", ".sandbox-home", ".git", ".auth"]);
const EXCLUDE_FILE = /^(\.env(\..*)?|.*\.sqlite(-wal|-shm)?|.*\.log|.*storage-state.*\.json|cookies.*\.json|\.DS_Store|\.npmrc)$/i;
const ESSENTIAL = ["package.json", "README.md", ".env.example", ".gitignore", "scripts/build.mjs", "server/index.mjs", "server/db.mjs", "src/data/site.json", "src/scripts/site.js", "tests/smoke.test.mjs", "db/schema.sql", "docs/ARCHITECTURE.md", "docs/CONFIGURATION.md", "docs/TESTING.md", "docs/LIMITATIONS.md"];
const TEXT = /\.(html?|css|m?js|json|md|sql|txt|svg|xml|example|gitignore)$/i;
const KEY_PATTERNS: [string, RegExp][] = [
  ["OpenAI/Anthropic-style secret key", /\bsk-(?:ant-|proj-|or-)?[A-Za-z0-9_-]{24,}\b/],
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
];

/** Package the generated project, then reopen the archive and verify it before it can be downloaded. */
export async function buildZip(projectId: string, slug: string, extraSecrets: string[], external: string[]): Promise<ZipInfo> {
  const root = siteDir(projectId);
  const dir = exportsDir(projectId);
  fs.rmSync(/*turbopackIgnore: true*/ dir, { recursive: true, force: true });
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  const zip = new AdmZip();
  const prefix = `${slug}/`;
  const added: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(/*turbopackIgnore: true*/ abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!(rel === "" && EXCLUDE_DIRS.has(e.name)) && e.name !== "node_modules" && e.name !== ".git") walk(path.join(abs, e.name), r);
      } else if (e.name === ".env.example" || !EXCLUDE_FILE.test(e.name)) {
        zip.addFile(prefix + r, fs.readFileSync(/*turbopackIgnore: true*/ path.join(abs, e.name)));
        added.push(r);
      }
    }
  };
  walk(root, "");
  const name = `${slug}.zip`;
  const file = path.join(dir, name);
  zip.writeZip(file);

  /* ---- verification on the written file ---- */
  const checks: ZipInfo["checks"] = [];
  const warnings: string[] = [];
  const back = new AdmZip(file);
  const entries = back.getEntries().filter((e) => !e.isDirectory);
  let crcOk = true;
  try {
    crcOk = back.test();
  } catch {
    crcOk = false;
  }
  checks.push({ name: "Archive integrity (CRC of every entry)", ok: crcOk, detail: crcOk ? `${entries.length} entries read back` : "at least one entry failed its CRC check" });
  checks.push({ name: "Entry count matches the source", ok: entries.length === added.length, detail: `${entries.length} in archive / ${added.length} packaged` });
  const names = new Set(entries.map((e) => e.entryName.slice(prefix.length)));
  const missing = ESSENTIAL.filter((f) => !names.has(f));
  checks.push({ name: "Essential files present", ok: !missing.length, detail: missing.length ? `missing: ${missing.join(", ")}` : `${ESSENTIAL.length} required files found` });
  const pages = [...names].filter((n) => n.startsWith("src/pages/")).length;
  checks.push({ name: "Page sources included", ok: pages > 0, detail: `${pages} page source file(s)` });
  const forbidden = [...names].filter((n) => EXCLUDE_DIRS.has(n.split("/")[0]) || n.includes("node_modules/") || (EXCLUDE_FILE.test(path.basename(n)) && path.basename(n) !== ".env.example"));
  checks.push({ name: "No private files (.env, databases, sessions, node_modules)", ok: !forbidden.length, detail: forbidden.length ? forbidden.slice(0, 5).join(", ") : "none found" });

  const secrets = [...(await allSecretsForScan()), ...extraSecrets, process.env.STUDIO_SECRET || "", process.env.STUDIO_PASSWORD || "", process.env.DATABASE_URL || ""].filter((s) => s && s.length >= 8);
  const leaks: string[] = [];
  for (const e of entries) {
    if (!TEXT.test(e.entryName) || e.header.size > 3_000_000) continue;
    const text = e.getData().toString("utf8");
    if (secrets.some((s) => text.includes(s))) leaks.push(e.entryName.slice(prefix.length));
    for (const [label, re] of KEY_PATTERNS) if (re.test(text)) warnings.push(`${e.entryName.slice(prefix.length)} contains text that looks like a ${label}. It came from the cloned site's own markup; review before sharing.`);
  }
  checks.push({ name: "No studio secrets, API keys or test-account passwords", ok: !leaks.length, detail: leaks.length ? `found in: ${leaks.slice(0, 5).join(", ")}` : `${secrets.length} stored secret(s) searched for, none present` });

  const bytes = fs.statSync(/*turbopackIgnore: true*/ file).size;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(/*turbopackIgnore: true*/ file)).digest("hex");
  const info: ZipInfo = { file, name, bytes, sha256, entries: entries.length, createdAt: new Date().toISOString(), checks, warnings: [...new Set(warnings)].slice(0, 20), external };
  if (checks.some((c) => !c.ok)) {
    fs.rmSync(/*turbopackIgnore: true*/ file, { force: true });
    throw new Error(`ZIP verification failed: ${checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join("; ")}`);
  }
  return info;
}
