"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, Field, Icon, Notice, PageHead, Section, ToggleRow, useLive, type Project, type Provider } from "@/components/studio/ui";

type Quick = { finalUrl: string; redirected: boolean; status: number; title: string; h1: string; hasLoginForm: boolean; loginLink: string | null; jsRendered: boolean; routes: { route: string; text: string; area: string }[]; externalLinks: number; blockedRequests: number; browser: { source: string; version: string }; screenshot: string };

export default function NewProjectPage() {
  const router = useRouter();
  const providers = useLive<{ providers: Provider[] }>("/api/providers");
  const settings = useLive<{ settings: { maxPages: number } }>("/api/settings");
  const connected = (providers.data?.providers ?? []).filter((p) => p.status === "connected");

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [login, setLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [testAccount, setTestAccount] = useState(false);

  const [scope, setScope] = useState<"entire" | "selected">("entire");
  const [selected, setSelected] = useState<string[]>([]);
  const [manualPaths, setManualPaths] = useState("");
  const [maxPages, setMaxPages] = useState<number | "">("");
  const [o, setO] = useState({ tablet: true, mobile: true, backend: true, database: true, authentication: true, animations: true, responsive: true });
  const [useAi, setUseAi] = useState<boolean | null>(null);
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ai = useAi ?? connected.length > 0;
  const set = (k: keyof typeof o) => (v: boolean) => setO((x) => ({ ...x, [k]: v }));

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setQuick(null);
    try {
      const { result } = await call<{ result: Quick }>("/api/analyze", { body: { url } });
      setQuick(result);
      if (!name && result.title) setName(result.title.slice(0, 80));
      if (result.loginLink && !loginUrl) setLoginUrl(result.loginLink);
      setSelected(result.routes.slice(0, 8).map((r) => r.route));
    } catch (e) {
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const paths = [...new Set([...selected, ...manualPaths.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)])];
      if (scope === "selected" && !paths.length) throw new Error("Selected pages: pick at least one route (run Analyze Website to list them) or type the paths.");
      const { project } = await call<{ project: Project }>("/api/projects", {
        body: {
          targetUrl: url, name, description, authorised,
          auth: { required: login, username, password, loginUrl, testAccountConfirmed: testAccount },
          options: { scope, selectedPaths: paths, maxPages: maxPages || undefined, devices: { desktop: true, tablet: o.tablet, mobile: o.mobile }, backend: o.backend, database: o.database, authentication: o.authentication, animations: o.animations, responsive: o.responsive, useAi: ai },
          providerId: ai ? providerId || undefined : undefined,
        },
      });
      router.push(`/studio/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <PageHead eyebrow="New clone project" title="Clone a website" sub="The studio opens the site in a real browser, discovers its routes automatically, and rebuilds it as an independent project you can preview and download." />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Section title="Target website" hint="Public http(s) addresses only. Private and internal network addresses are blocked.">
            <div className="space-y-4 p-5">
              <Field label="Website URL">
                <div className="flex gap-2">
                  <input className="input mono" type="text" inputMode="url" required placeholder="https://example.com" value={url} onChange={(e) => { setUrl(e.target.value); setQuick(null); }} autoComplete="url" />
                  <button type="button" className="btn flex-none" disabled={!url.trim() || analyzing} onClick={analyze}>
                    {analyzing ? <span className="spin" /> : <Icon name="globe" size={14} />} {analyzing ? "Analyzing…" : "Analyze Website"}
                  </button>
                </div>
              </Field>
              {analyzing ? <p className="mono text-xs text-ink3">Opening the page in headless Chromium. This reads one page and clicks nothing.</p> : null}
              {analyzeError ? <Notice tone="bad" title="Analysis failed">{analyzeError}</Notice> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project name" hint="Optional. Defaults to the site's host name."><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Description" hint="Optional."><input className="input" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></Field>
              </div>
            </div>
          </Section>

          <Section title="Sign-in for analysis" hint="Only for sites where pages sit behind a login you are allowed to use.">
            <div className="px-5 pb-2">
              <ToggleRow title="Login required" desc="The crawler signs in once with the test account, then also captures the signed-in pages." checked={login} onChange={setLogin} />
              {login ? (
                <div className="fade-in space-y-4 border-t border-line py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Username or e-mail"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required /></Field>
                    <Field label="Password"><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
                  </div>
                  <Field label="Login page" hint="Optional. Leave empty to let the crawler find the sign-in form."><input className="input mono" placeholder="/login" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} /></Field>
                  <label className="flex items-start gap-2.5 text-[13px] text-ink2">
                    <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={testAccount} onChange={(e) => setTestAccount(e.target.checked)} />
                    <span>This is a <strong className="text-ink">test account</strong> that I am authorised to use for this purpose.</span>
                  </label>
                  <Notice tone="info">The password is encrypted on the server, used only inside the crawler&apos;s browser, and erased when discovery ends. It is never sent to an AI provider or written to logs. CAPTCHA, MFA and paywalls are not bypassed: if the login needs them, the run stops and says so.</Notice>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Clone configuration">
            <div className="p-5">
              <p className="label mb-2">Scope</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Scope">
                {([["entire", "Entire site", "Follow internal links from the start page, up to the page limit."], ["selected", "Selected pages", "Only the start page and the routes you choose."]] as const).map(([v, t, d]) => (
                  <button type="button" key={v} role="radio" aria-checked={scope === v} onClick={() => setScope(v)} className={`rounded-lg border p-3 text-left transition-colors ${scope === v ? "border-accent bg-accentsoft" : "border-line hover:border-line2"}`}>
                    <span className="block text-sm font-medium text-ink">{t}</span>
                    <span className="block text-[12.5px] leading-snug text-ink3">{d}</span>
                  </button>
                ))}
              </div>
              {scope === "selected" ? (
                <div className="fade-in mt-3 space-y-3">
                  {quick?.routes.length ? (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
                      {quick.routes.map((r) => (
                        <label key={r.route} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-1.5 text-[13px] last:border-0 hover:bg-panel2/50">
                          <input type="checkbox" className="accent-[var(--accent)]" checked={selected.includes(r.route)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.route] : s.filter((x) => x !== r.route)))} />
                          <span className="mono truncate text-ink">{r.route}</span>
                          <span className="ml-auto truncate text-xs text-ink3">{r.text}</span>
                        </label>
                      ))}
                    </div>
                  ) : <p className="text-[13px] text-ink3">Run “Analyze Website” to list the routes linked from the start page, or type paths below.</p>}
                  <Field label="Additional paths" hint="One per line, for example /pricing"><textarea className="input mono" rows={2} value={manualPaths} onChange={(e) => setManualPaths(e.target.value)} /></Field>
                </div>
              ) : null}
              <div className="mt-4 max-w-[220px]">
                <Field label="Page limit" hint={`1–60. Studio default: ${settings.data?.settings.maxPages ?? 12}.`}><input className="input mono" type="number" min={1} max={60} placeholder={String(settings.data?.settings.maxPages ?? 12)} value={maxPages} onChange={(e) => setMaxPages(e.target.value ? Number(e.target.value) : "")} /></Field>
              </div>

              <p className="label mb-1 mt-6">Viewports to capture</p>
              <div className="divide-y divide-line">
                <ToggleRow title="Desktop · 1440 px" desc="Always captured: it is the reference for the reconstruction." checked onChange={() => {}} disabled />
                <ToggleRow title="Tablet · 820 px" desc="Screenshots and layout state at tablet width." checked={o.tablet} onChange={set("tablet")} />
                <ToggleRow title="Mobile · 390 px" desc="Screenshots, mobile navigation and menu states." checked={o.mobile} onChange={set("mobile")} />
              </div>

              <p className="label mb-1 mt-6">Reconstruction</p>
              <div className="divide-y divide-line">
                <ToggleRow title="Frontend" desc="Pages, shared components, styles, fonts and images. Always generated." checked onChange={() => {}} disabled />
                <ToggleRow title="Backend" desc="A Node server with working endpoints for the forms found on the site (contact, newsletter, search)." checked={o.backend} onChange={(v) => setO((x) => ({ ...x, backend: v, database: v && x.database, authentication: v && x.authentication }))} />
                <ToggleRow title="Database" desc="SQLite schema and storage for submitted data." checked={o.database && o.backend} onChange={set("database")} disabled={!o.backend} note={!o.backend ? "needs the backend" : undefined} />
                <ToggleRow title="Authentication" desc="Sign-up, sign-in, sessions and protected pages when the site has a login." checked={o.authentication && o.backend} onChange={set("authentication")} disabled={!o.backend} note={!o.backend ? "needs the backend" : undefined} />
                <ToggleRow title="Animations & interactions" desc="Transitions plus recorded menus, tabs, accordions and dialogs." checked={o.animations} onChange={set("animations")} />
                <ToggleRow title="Responsive behaviour" desc="Keep media queries and the mobile layout." checked={o.responsive} onChange={set("responsive")} />
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Section title="Site check">
            {quick ? (
              <div className="fade-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={quick.screenshot} alt={`Screenshot of ${quick.finalUrl}`} className="aspect-[16/10] w-full border-b border-line object-cover object-top" />
                <dl className="space-y-2 p-4 text-[13px]">
                  {([["Title", quick.title || "(none)"], ["Address", quick.finalUrl + (quick.redirected ? " (redirected)" : "")], ["HTTP status", String(quick.status)], ["Internal routes linked", String(quick.routes.length)], ["Login form", quick.hasLoginForm ? "on this page" : quick.loginLink ? `linked: ${quick.loginLink}` : "none seen"], ["Browser", `${quick.browser.source} ${quick.browser.version}`]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4"><dt className="flex-none text-ink3">{k}</dt><dd className="mono truncate text-right text-[12px] text-ink">{v}</dd></div>
                  ))}
                </dl>
                {quick.jsRendered ? <div className="px-4 pb-4"><Notice tone="warn">Very little text was rendered. The site may need longer to load or block automated browsers.</Notice></div> : null}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-ink3">Optional: “Analyze Website” loads the page once and shows what the crawler will see. Full route discovery happens when cloning starts.</p>
            )}
          </Section>

          <Section title="Architecture planning">
            <div className="space-y-3 p-5">
              {providers.loading ? <p className="text-[13px] text-ink3">Checking providers…</p> : connected.length ? (
                <>
                  <ToggleRow title="Use an AI provider" desc="The analysis summary (routes, forms, design tokens; never credentials) is sent to the provider to plan the architecture." checked={ai} onChange={setUseAi} />
                  {ai ? (
                    <Field label="Provider">
                      <select className="input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                        <option value="">Default ({connected.find((p) => p.isDefault)?.label ?? connected[0].label})</option>
                        {connected.map((p) => <option key={p.id} value={p.id}>{p.label} · {p.model}</option>)}
                      </select>
                    </Field>
                  ) : null}
                </>
              ) : (
                <Notice tone="warn" title="No connected AI provider">
                  This project will use the built-in rule-based planner. To plan with a model, <Link className="font-medium text-ink underline underline-offset-2" href="/studio/providers">add and test a provider</Link> first.
                </Notice>
              )}
            </div>
          </Section>

          <div className="card space-y-3 p-5">
            <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink2">
              <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} />
              <span>I own this website or am authorised to inspect and reproduce it.</span>
            </label>
            {error ? <Notice tone="bad">{error}</Notice> : null}
            <button className="btn btn-primary w-full py-2.5 text-[15px]" disabled={busy || !url.trim() || !authorised}>
              {busy ? <span className="spin" /> : <Icon name="play" size={14} />} Start Cloning
            </button>
            <p className="text-xs leading-relaxed text-ink3">The job runs on the server. You can close this tab and come back; progress is stored with the project.</p>
          </div>
        </div>
      </div>
    </form>
  );
}
