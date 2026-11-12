import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { AGENTS, LEVELS, SCRIPTS, SKILL_LEVEL, SKILL_VERSION } from "@/lib/skill-data";
import { findZip, readSha, SKILL_ROOT } from "@/lib/skill-files";

export const dynamic = "force-dynamic";

function loadPrompt(): string {
  try {
    const md = fs.readFileSync(path.join(SKILL_ROOT, "PROMPT-START-HERE.md"), "utf8");
    return (md.match(/```text\n([\s\S]*?)```/) || [])[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const startup = [
  "Check real capabilities (never assume tools or MCP servers)",
  "Ask for the target URL and authorisation",
  "Ask whether login is required — credentials only if needed",
  "Inspect the complete accessible website",
  "Write the discovery report",
  "Propose the architecture",
  "Implement frontend, backend, database, auth",
  "Test every route and major interaction",
  "Compare screenshots; keep a mismatch register",
  "Fix, re-verify, then deliver an honest final report",
];

export default function Home() {
  const prompt = loadPrompt();
  const zip = findZip();
  const sha = readSha();

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.28),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-center">
          <p className="mx-auto inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-cyan-300">
            Release {SKILL_VERSION} · capability level {SKILL_LEVEL}
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-6xl">
            Give any AI agent the skill to rebuild any website — <span className="bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">with evidence</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            A complete, reusable skill repository: 15 coordinated agents, 20 Playwright-based tools, report templates, MCP guidance and integrations for seven AI hosts. It inspects first, builds an independent clone, then proves how close it is.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/api/download" className="rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
              Download the repository (.zip)
            </a>
            <Link href="/browse?path=SKILL.md" className="rounded-lg border border-white/15 px-5 py-3 font-medium text-white transition hover:bg-white/10">
              Read SKILL.md
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            {zip ? <>File: <code className="text-slate-300">{zip.name}</code>{sha ? <> · SHA-256 <code className="break-all text-slate-300">{sha.slice(0, 16)}…</code></> : null}</> : "ZIP not built yet — run npm run package in universal-website-cloner/"}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold text-white">Universal startup experience</h2>
        <p className="mt-2 max-w-2xl text-slate-400">The AI must follow this order. It never starts coding blindly.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {startup.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-300">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-white">Universal startup prompt</h2>
              <p className="text-sm text-slate-400">Paste into any AI coding agent. Self-contained — works even where files can’t be read.</p>
            </div>
            {prompt ? <CopyButton text={prompt} /> : null}
          </div>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-4 text-xs leading-relaxed text-slate-300" tabIndex={0}>
            {prompt || "Prompt file not found."}
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="text-2xl font-semibold text-white">Capability milestones V1 → V12</h2>
        <p className="mt-2 max-w-2xl text-slate-400">Consolidated into one coherent system — milestones, not duplicate folders.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((l) => (
            <article key={l.v} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-indigo-400/40">
              <span className="rounded-md bg-gradient-to-r from-indigo-500 to-cyan-400 px-2 py-0.5 text-xs font-bold text-slate-950">{l.v}</span>
              <h3 className="mt-3 font-semibold text-white">{l.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{l.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="text-2xl font-semibold text-white">15 specialised agents</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map(([name, text], i) => (
            <div key={name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs text-slate-500">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="font-medium text-white">{name} Agent</h3>
              <p className="text-sm text-slate-400">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="text-2xl font-semibold text-white">Automation scripts</h2>
        <p className="mt-2 text-slate-400">Every script has <code className="text-slate-200">--help</code>, error handling and sample commands. Verified by a self-test against a fixture site.</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Scripts and their purpose</caption>
            <thead className="bg-white/5 text-slate-300">
              <tr>
                <th scope="col" className="px-4 py-2">Script</th>
                <th scope="col" className="px-4 py-2">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {SCRIPTS.map(([n, d]) => (
                <tr key={n} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-cyan-300">{n}.mjs</td>
                  <td className="px-4 py-2 text-slate-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 sm:grid-cols-3">
        {[
          ["Verified", "20/20 self-tests and 10/10 repository checks pass in the build environment.", "/browse?path=docs/verification-report.md"],
          ["Honest about limits", "MCP servers and host integrations were not connected or run during development.", "/browse?path=docs/limitations.md"],
          ["Safe by design", "Authorised use, no bypassing, secret redaction, robots-aware crawling.", "/browse?path=docs/security.md"],
        ].map(([t, d, href]) => (
          <Link key={t} href={href} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-cyan-400/40">
            <h3 className="font-semibold text-white">{t} →</h3>
            <p className="mt-1 text-sm text-slate-400">{d}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
