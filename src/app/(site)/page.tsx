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

const pipeline = [
  "Validating URL", "Launching browser", "Discovering routes", "Capturing screenshots", "Analyzing design", "Mapping functionality", "Planning architecture",
  "Generating source code", "Installing dependencies", "Building project", "Running tests", "Starting preview server", "Preparing ZIP",
];
const studio: [string, string][] = [
  ["Automatic route discovery", "Follows navigation, footer and in-page links plus the sitemap, at desktop, tablet and mobile widths. Unsafe routes such as logout or delete are skipped."],
  ["Functional reconstruction", "Menus, tabs, accordions and dialogs are recorded and replayed. Forms get working endpoints, storage and, where the site has a login, real sessions."],
  ["Live preview per project", "Each build runs as its own sandboxed process behind an unguessable address. No address exists until the build and its tests have passed."],
  ["Builder workspace", "File explorer, code editor with AI-proposed edits, step-by-step job state, build logs and a device-sized preview side by side."],
  ["Verified ZIP export", "Source, assets, backend, schema, README and .env.example. Checked for integrity and scanned for secrets before download."],
  ["Honest by design", "Progress is the real job state. Providers count as connected only after a test call. CAPTCHA, MFA and paywalls are never bypassed."],
];

export default function Home() {
  const prompt = loadPrompt();
  const zip = findZip();
  const sha = readSha();

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#c6f04d]">Universal Website Cloner Studio</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-[54px]">
              Paste a URL. Get a working project, a live preview and a ZIP.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
              The Studio opens a site you are authorised to reproduce in a real browser, maps its routes and behaviour, and rebuilds it as an independent project with its own backend. Then it builds it, tests it and serves it for you to check.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/studio/new" className="rounded-lg bg-[#c6f04d] px-5 py-3 font-semibold text-slate-950 transition hover:bg-[#d4f570] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                Start a clone project
              </Link>
              <Link href="/studio" className="rounded-lg border border-white/15 px-5 py-3 font-medium text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c6f04d]">
                Open the dashboard
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">Works without an AI key. Add Anthropic, Gemini, OpenAI, OpenRouter or a compatible endpoint for AI planning and edits.</p>
          </div>
          <ol className="rounded-2xl border border-white/10 bg-white/[0.03] p-2 font-mono text-[13px]">
            {pipeline.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-lg px-3 py-[7px] text-slate-300 odd:bg-white/[0.03]">
                <span className="w-5 text-right text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold text-white">What the Studio does</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studio.map(([t, d]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="skill" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-12">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#c6f04d]">Also included · release {SKILL_VERSION} · level {SKILL_LEVEL}</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">The agent skill repository</h2>
            <p className="mt-2 text-slate-400">The original skill for AI coding agents: 15 coordinated agents, 20 Playwright-based tools, report templates and integrations for seven AI hosts.</p>
            <p className="mt-3 text-xs text-slate-500">
              {zip ? <>File: <code className="text-slate-300">{zip.name}</code>{sha ? <> · SHA-256 <code className="break-all text-slate-300">{sha.slice(0, 16)}…</code></> : null}</> : "ZIP not built yet: run npm run package in universal-website-cloner/"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/api/download" className="rounded-lg border border-[#c6f04d]/50 px-5 py-3 font-medium text-[#c6f04d] transition hover:bg-[#c6f04d]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Download the skill (.zip)</a>
            <Link href="/browse?path=SKILL.md" className="rounded-lg border border-white/15 px-5 py-3 font-medium text-white transition hover:bg-white/10">Read SKILL.md</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold text-white">Universal startup experience</h2>
        <p className="mt-2 max-w-2xl text-slate-400">The AI must follow this order. It never starts coding blindly.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {startup.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#c6f04d]/15 text-sm font-semibold text-[#c6f04d]">{i + 1}</span>
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
            <article key={l.v} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#c6f04d]/40">
              <span className="rounded-md bg-[#c6f04d] px-2 py-0.5 text-xs font-bold text-slate-950">{l.v}</span>
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
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-[#c6f04d]">{n}.mjs</td>
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
          <Link key={t} href={href} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#c6f04d]/40">
            <h3 className="font-semibold text-white">{t} →</h3>
            <p className="mt-1 text-sm text-slate-400">{d}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
