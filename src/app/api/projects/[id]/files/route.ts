import fs from "node:fs";
import path from "node:path";
import { api, fail, json } from "@/lib/studio/http";
import { getProject, siteDir } from "@/lib/studio/store";

export const dynamic = "force-dynamic";
const HIDE = new Set(["node_modules", ".sandbox-home", "data", "dist", "package-lock.json"]);

type Node = { name: string; path: string; dir: boolean; size?: number; children?: Node[] };

function tree(abs: string, rel: string, depth = 0): Node[] {
  if (depth > 8) return [];
  return fs.readdirSync(/*turbopackIgnore: true*/ abs, { withFileTypes: true })
    .filter((e) => !(depth === 0 && HIDE.has(e.name)) && !e.isSymbolicLink())
    .map((e): Node => {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const full = path.join(abs, e.name);
      return e.isDirectory() ? { name: e.name, path: r, dir: true, children: tree(full, r, depth + 1) } : { name: e.name, path: r, dir: false, size: fs.statSync(/*turbopackIgnore: true*/ full).size };
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const root = siteDir(p.id);
    if (!fs.existsSync(/*turbopackIgnore: true*/ root)) return json({ files: [], generated: false });
    return json({ files: tree(root, ""), generated: true });
  });
}
