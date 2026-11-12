import Link from "next/link";
import { listDir, readTextFile } from "@/lib/skill-files";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ path?: string }> };

function crumbs(p: string) {
  const parts = p.split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, href: parts.slice(0, i + 1).join("/") }));
}

function fmt(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export default async function BrowsePage({ searchParams }: Props) {
  const sp = await searchParams;
  const rel = (sp.path ?? "").replace(/^\/+|\/+$/g, "");
  const file = rel ? readTextFile(rel) : null;
  const dirPath = file ? rel.split("/").slice(0, -1).join("/") : rel;
  const entries = listDir(dirPath);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-semibold text-white">Browse the repository</h1>
      <nav aria-label="Breadcrumb" className="mt-3 flex flex-wrap items-center gap-1 text-sm text-slate-400">
        <Link href="/browse" className="hover:text-white">universal-website-cloner</Link>
        {crumbs(rel).map((c) => (
          <span key={c.href} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link href={`/browse?path=${encodeURIComponent(c.href)}`} className="hover:text-white">{c.name}</Link>
          </span>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside aria-label="Files" className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
          {entries === null ? (
            <p className="p-3 text-sm text-slate-400">Not found.</p>
          ) : (
            <ul className="max-h-[70vh] overflow-auto text-sm">
              {dirPath ? (
                <li>
                  <Link href={`/browse?path=${encodeURIComponent(dirPath.split("/").slice(0, -1).join("/"))}`} className="block rounded-md px-3 py-1.5 text-slate-400 hover:bg-white/10">
                    ↑ ..
                  </Link>
                </li>
              ) : null}
              {entries.map((e) => (
                <li key={e.rel}>
                  <Link
                    href={`/browse?path=${encodeURIComponent(e.rel)}`}
                    aria-current={e.rel === rel ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 hover:bg-white/10 ${e.rel === rel ? "bg-indigo-500/20 text-white" : "text-slate-300"}`}
                  >
                    <span className="truncate">{e.isDir ? "📁" : "📄"} {e.name}</span>
                    {!e.isDir ? <span className="shrink-0 text-xs text-slate-500">{fmt(e.size)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section aria-label="File content" className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03]">
          {file ? (
            <>
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm text-slate-400">
                <span className="font-mono">{rel}</span>
                {file.truncated ? <span className="text-amber-300">truncated</span> : null}
              </div>
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-4 text-[13px] leading-relaxed text-slate-200" tabIndex={0}>
                {file.content}
              </pre>
            </>
          ) : rel && !entries ? (
            <p className="p-6 text-slate-400">That path does not exist or is not viewable.</p>
          ) : rel && !file && entries ? (
            <p className="p-6 text-slate-400">Select a file to read it.</p>
          ) : (
            <div className="p-6 text-slate-300">
              <p>Select a file on the left. Good places to start:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {["SKILL.md", "PROMPT-START-HERE.md", "agents/README.md", "workflows/00-master-workflow.md", "mcp/README.md", "docs/verification-report.md"].map((f) => (
                  <li key={f}>
                    <Link className="text-cyan-300 hover:underline" href={`/browse?path=${encodeURIComponent(f)}`}>{f}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
