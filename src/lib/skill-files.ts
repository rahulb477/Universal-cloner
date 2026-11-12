import fs from "node:fs";
import path from "node:path";

export const SKILL_ROOT = path.join(process.cwd(), "universal-website-cloner");
const HIDDEN = new Set(["node_modules", "clone-workspace", ".auth", "dist", ".git", "package-lock.json"]);
const TEXT_EXT = /\.(md|mjs|js|json|toml|mdc|txt|yml|yaml|gitignore)$/i;
const MAX_BYTES = 300 * 1024;

export type Entry = { name: string; rel: string; isDir: boolean; size: number };

export function safeResolve(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(SKILL_ROOT, clean);
  if (abs !== SKILL_ROOT && !abs.startsWith(SKILL_ROOT + path.sep)) return null;
  const parts = path.relative(SKILL_ROOT, abs).split(path.sep);
  if (parts.some((p) => HIDDEN.has(p))) return null;
  return abs;
}

export function listDir(rel: string): Entry[] | null {
  const abs = safeResolve(rel);
  if (!abs || !fs.existsSync(/*turbopackIgnore: true*/ abs) || !fs.statSync(/*turbopackIgnore: true*/ abs).isDirectory()) return null;
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => !HIDDEN.has(e.name))
    .map((e) => {
      const full = path.join(/*turbopackIgnore: true*/ abs, e.name);
      return {
        name: e.name,
        rel: path.relative(SKILL_ROOT, full).split(path.sep).join("/"),
        isDir: e.isDirectory(),
        size: e.isDirectory() ? 0 : fs.statSync(/*turbopackIgnore: true*/ full).size,
      };
    })
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export function readTextFile(rel: string): { content: string; truncated: boolean } | null {
  const abs = safeResolve(rel);
  if (!abs || !fs.existsSync(/*turbopackIgnore: true*/ abs) || !fs.statSync(/*turbopackIgnore: true*/ abs).isFile()) return null;
  if (!TEXT_EXT.test(abs) && !/\.gitignore$/.test(abs)) return null;
  const buf = fs.readFileSync(/*turbopackIgnore: true*/ abs);
  return { content: buf.subarray(0, MAX_BYTES).toString("utf8"), truncated: buf.length > MAX_BYTES };
}

export function findZip(): { file: string; name: string } | null {
  const dist = path.join(SKILL_ROOT, "dist");
  if (!fs.existsSync(/*turbopackIgnore: true*/ dist)) return null;
  const zips = fs.readdirSync(/*turbopackIgnore: true*/ dist).filter((f) => f.endsWith(".zip")).sort();
  const name = zips[zips.length - 1];
  return name ? { file: path.join(dist, name), name } : null;
}

export function readSha(): string | null {
  const z = findZip();
  if (!z) return null;
  const p = z.file + ".sha256";
  return fs.existsSync(/*turbopackIgnore: true*/ p) ? fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8").split(/\s+/)[0] : null;
}
