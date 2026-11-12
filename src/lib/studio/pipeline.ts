import fs from "node:fs";
import path from "node:path";
import { launchBrowser } from "./browser";
import { decrypt } from "./crypto";
import { Discovery, loadAnalysis, loadModels, routeSlug, VIEWPORTS } from "./discover";
import { generateProject, type GenerateResult } from "./generate";
import { registerRunner, STAGES, UserError, type JobContext, type Stage } from "./jobs";
import { aiPlan, buildBrief, heuristicPlan, type Plan } from "./plan";
import { GATEWAY_PORT, gatewayInfo, startPreview } from "./preview";
import { defaultProvider, getProvider } from "./providers";
import { cleanEnv, nodeSandboxArgs, runLimited } from "./sandbox";
import { analysisDir, getProject, getSettings, logActivity, readJson, siteDir, updateProject, writeJson, type ProjectAuth, type ProjectOptions } from "./store";
import { buildZip } from "./zip";

export type Verification = {
  checkedAt: string; routesOk: number; routesTotal: number; averageMismatch: number | null; worstMismatch: number | null; worstRoute: string | null;
  gateway: string; tests: { passed: number; failed: number } | null;
  routes: { route: string; status: number; mismatch: number | null; note?: string }[];
};

const planFile = (id: string) => path.join(analysisDir(id), "plan.json");
const genFile = (id: string) => path.join(analysisDir(id), "generation.json");
export const loadPlan = (id: string) => readJson<Plan | null>(planFile(id), null);
export const loadGeneration = (id: string) => readJson<GenerateResult | null>(genFile(id), null);

async function discoveryStage(ctx: JobContext) {
  const project = (await getProject(ctx.job.projectId))!;
  const options = project.options as ProjectOptions;
  const auth = project.auth as ProjectAuth;
  const settings = await getSettings();
  await updateProject(project.id, { status: "analyzing", error: null, buildStatus: "none", zip: null, verification: null, mismatchPercent: null });
  let password: string | null = null;
  if (auth.required) {
    if (!project.passwordEnc) throw new UserError("The test-account password was already wiped after the previous analysis. Enter it again in the project's sign-in settings, then re-run.");
    password = decrypt(project.passwordEnc);
  }
  const d = new Discovery(project.targetUrl, options, auth, password, settings, project.id, ctx.log, ctx.signal);
  try {
    await ctx.step("validate", async (set) => set(await d.validate().catch((e) => { throw new UserError((e as Error).message); })));
    await ctx.step("browser", async (set) => set(await d.launch()));
    await ctx.step("routes", async (set) => set(await d.crawl(set)));
    await updateProject(project.id, { routesDiscovered: d.routes.size, pagesCloned: d.pages.length });
    await ctx.step("screenshots", async (set) => set(await d.screenshots(set)));
    await ctx.step("design", async (set) => set(await d.design(set)));
    await ctx.step("functionality", async (set) => set(await d.functionality(set)));
  } finally {
    await d.close();
  }
  // The reference site's credentials are needed only while the browser is open. (If discovery fails, the job
  // queue wipes them as soon as no automatic retry is left.)
  if (project.passwordEnc) await updateProject(project.id, { passwordEnc: null });
  await updateProject(project.id, { status: "discovery_complete", routesDiscovered: d.routes.size, pagesCloned: d.pages.length });
  await logActivity("discovery", `${project.name}: discovery complete — ${d.routes.size} routes found, ${d.pages.length} captured`, project.id);
}

async function planStage(ctx: JobContext) {
  const project = (await getProject(ctx.job.projectId))!;
  const options = project.options as ProjectOptions;
  const analysis = loadAnalysis(project.id);
  const models = loadModels(project.id);
  if (!analysis || !models.length) throw new UserError("There is no saved analysis for this project. Re-run it from discovery.");
  await ctx.step("plan", async (set) => {
    let plan: Plan;
    if (options.useAi) {
      const provider = project.providerId ? await getProvider(project.providerId) : await defaultProvider();
      if (!provider) throw new UserError("No AI provider is available. Add one under AI Providers, test the connection, and resume — or switch this project to built-in planning.");
      if (provider.status !== "connected") throw new UserError(`The AI provider "${provider.label}" has not passed a connection test. Test it under AI Providers, then resume.`);
      ctx.log(`Sending the structured analysis (${models.length} pages) to ${provider.label} / ${provider.model}. No credentials or page bodies are included.`);
      plan = await aiPlan({ id: provider.id, label: provider.label, model: provider.model }, buildBrief(analysis, models, options), ctx.log);
      set(`Plan by ${provider.label} (${provider.model}): ${plan.siteCategory} · ${plan.frontend.framework}`.slice(0, 200));
    } else {
      plan = heuristicPlan(analysis, models, options);
      set(`Built-in planning (no AI call): ${plan.siteCategory}`);
    }
    writeJson(planFile(project.id), plan);
  });
}

async function generateStage(ctx: JobContext) {
  const project = (await getProject(ctx.job.projectId))!;
  const plan = loadPlan(project.id);
  if (!plan) throw new UserError("There is no architecture plan for this project. Resume from planning.");
  await updateProject(project.id, { status: "generating" });
  await ctx.step("generate", async (set) => {
    const r = generateProject(project.id, project, project.options as ProjectOptions, plan);
    writeJson(genFile(project.id), r);
    set(`${r.files} files · ${r.pages} pages · ${r.components.length} shared components · backend ${r.features.backend ? "on" : "off"} · database ${r.features.database ? "on" : "off"} · auth ${r.features.auth ? "on" : "off"}`);
  });
}

const SAFE_DEP = /^(\^|~|>=|<=|>|<|=)?\d+(\.\d+|\.x|\.\*){0,2}(-[\w.]+)?$|^\*$|^latest$/;

async function buildStage(ctx: JobContext) {
  const project = (await getProject(ctx.job.projectId))!;
  const cwd = siteDir(project.id);
  if (!fs.existsSync(/*turbopackIgnore: true*/ path.join(cwd, "package.json"))) throw new UserError("No generated project exists yet. Run the clone from the generation stage.");
  const settings = await getSettings();
  const gen = loadGeneration(project.id);
  const analysis = loadAnalysis(project.id);
  await updateProject(project.id, { status: "building", buildStatus: "building", error: null, zip: null });
  const fail = async (e: unknown) => {
    await updateProject(project.id, { buildStatus: "failed" });
    throw e;
  };
  const tail = (s: string) => s.trim().split("\n").filter((l) => l.trim()).slice(-6).join(" | ").slice(0, 600);

  await ctx.step("install", async (set) => {
    const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null>(path.join(cwd, "package.json"), null);
    if (!pkg) throw new UserError("package.json is not valid JSON.");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    // Only registry packages with plain version ranges; no git/http/file sources, and install scripts never run.
    for (const [name, spec] of Object.entries(deps)) {
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name) || !SAFE_DEP.test(String(spec).trim())) {
        throw new UserError(`Dependency "${name}": "${spec}" is not allowed. Only npm registry packages with a version range can be installed.`);
      }
    }
    if (Object.keys(deps).length > 40) throw new UserError("Too many dependencies (limit: 40).");
    const r = await runLimited({ cmd: "npm", args: ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=optional", "--registry=https://registry.npmjs.org/"], cwd, env: cleanEnv(cwd), timeoutSec: Math.max(settings.buildTimeoutSec, 120), signal: ctx.signal, onLine: (l) => ctx.log(`[npm] ${l}`) });
    if (r.timedOut) throw new Error("npm install exceeded the time limit.");
    if (r.code !== 0) throw new UserError(`npm install failed (exit ${r.code}): ${tail(r.output)}`);
    set(`${Object.keys(deps).length} package(s) declared · install scripts disabled · ${tail(r.output).split(" | ").pop()}`);
  }).catch(fail);

  await ctx.step("build", async (set) => {
    const r = await runLimited({ cmd: process.execPath, args: [...nodeSandboxArgs(cwd, settings.memoryMb, ["dist"]), "scripts/build.mjs"], cwd, env: cleanEnv(cwd), timeoutSec: settings.buildTimeoutSec, signal: ctx.signal, onLine: (l) => ctx.log(`[build] ${l}`) });
    if (r.timedOut) throw new UserError(`The build exceeded the ${settings.buildTimeoutSec}s limit.`);
    if (r.code !== 0) throw new UserError(`Build failed (exit ${r.code}): ${tail(r.output)}`);
    set(tail(r.output).split(" | ").pop() || "built");
  }).catch(fail);

  let tests: Verification["tests"] = null;
  await ctx.step("test", async (set) => {
    const r = await runLimited({ cmd: process.execPath, args: [...nodeSandboxArgs(cwd, settings.memoryMb, ["data"]), "tests/smoke.test.mjs"], cwd, env: cleanEnv(cwd), timeoutSec: settings.buildTimeoutSec, signal: ctx.signal, onLine: (l) => ctx.log(`[test] ${l}`) });
    const num = (k: string) => Number((r.output.match(new RegExp(`^[#ℹ] ${k} (\\d+)`, "m")) || [])[1] ?? NaN);
    tests = { passed: num("pass"), failed: num("fail") };
    if (r.timedOut) throw new UserError("The tests exceeded the time limit.");
    if (r.code !== 0 || !(tests.failed === 0)) {
      const failing = [...r.output.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).slice(0, 5).join("; ");
      throw new UserError(`Tests failed (${Number.isFinite(tests.failed) ? tests.failed : "?"} failing): ${failing || tail(r.output)}`);
    }
    for (const f of fs.readdirSync(/*turbopackIgnore: true*/ path.join(cwd, "data"))) if (f.startsWith("test-")) fs.rmSync(/*turbopackIgnore: true*/ path.join(cwd, "data", f), { force: true });
    const skipped = num("skipped");
    set(`${tests.passed} passed · 0 failed${skipped ? ` · ${skipped} skipped (feature not in this project)` : ""}`);
  }).catch(fail);

  await ctx.step("preview", async (set) => {
    const account = gen?.previewAccount;
    const port = await startPreview(project.id, account ? { DEMO_USER_EMAIL: account.identifier, DEMO_USER_PASSWORD: account.password } : {}, (l) => ctx.log(l));
    ctx.log(`Preview process listening on 127.0.0.1:${port} (isolated: fs limited to the project, no child processes, ${settings.memoryMb} MB heap)`);
    const v = await verifyPreview(ctx, project.id, port, project.previewToken, account ?? null);
    v.tests = tests;
    await updateProject(project.id, { verification: v, mismatchPercent: v.worstMismatch });
    if (v.routesOk === 0) throw new Error("The preview started but no route rendered successfully.");
    set(`${v.routesOk}/${v.routesTotal} routes render in a real browser${v.averageMismatch !== null ? ` · visual difference avg ${v.averageMismatch}% / worst ${v.worstMismatch}% (${v.worstRoute})` : ""} · ${v.gateway}`);
  }).catch(fail);

  await ctx.step("zip", async (set) => {
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "cloned-site";
    const info = await buildZip(project.id, slug, [], gen?.external ?? []);
    await updateProject(project.id, { zip: info });
    set(`${info.name} · ${(info.bytes / 1024).toFixed(0)} KB · ${info.entries} files · ${info.checks.length} checks passed · sha256 ${info.sha256.slice(0, 12)}…`);
  }).catch(fail);

  await updateProject(project.id, { status: "ready", buildStatus: "succeeded", error: null, pagesCloned: gen?.pages ?? analysis?.pages.length ?? project.pagesCloned });
  await logActivity("ready", `${project.name}: build verified, preview running, ZIP ready`, project.id);
}

/** Open every route of the running preview in a real browser and compare it with the reference screenshot. */
async function verifyPreview(ctx: JobContext, projectId: string, port: number, token: string, account: { identifier: string; password: string } | null): Promise<Verification> {
  const analysis = loadAnalysis(projectId);
  const site = readJson<{ routes: { route: string; errorPage?: boolean; protected?: boolean }[] }>(path.join(siteDir(projectId), "dist", "site.json"), { routes: [] });
  const routes = site.routes.filter((r) => !r.errorPage);
  const shots = path.join(analysisDir(projectId), "screenshots");
  const out: Verification["routes"] = [];
  const base = `http://127.0.0.1:${port}`;
  let session: string | null = null;
  if (account && routes.some((r) => r.protected)) {
    const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });
    session = r.ok ? ((await r.json()) as { token: string }).token : null;
  }
  const { PNG } = await import("pngjs");
  const pixelmatch = (await import("pixelmatch")).default;
  const { browser } = await launchBrowser();
  ctx.signal.addEventListener("abort", () => void browser.close().catch(() => {}), { once: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
    if (session) await context.addInitScript(`try { localStorage.setItem('uwc-session:/', ${JSON.stringify(session)}); } catch {}`);
    const page = await context.newPage();
    for (const r of routes) {
      ctx.check();
      try {
        const res = await page.goto(base + r.route, { waitUntil: "load", timeout: 20000 });
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        await page.evaluate("document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 150)))").catch(() => {});
        const status = res?.status() ?? 0;
        const ref = analysis?.pages.find((p) => p.route === r.route)?.reference;
        let mismatch: number | null = null;
        let note: string | undefined;
        const cloneShot = path.join(shots, `${routeSlug(r.route)}-clone.png`);
        await page.screenshot({ path: cloneShot, type: "png", animations: "disabled" });
        if (ref && fs.existsSync(/*turbopackIgnore: true*/ path.join(shots, ref))) {
          const a = PNG.sync.read(fs.readFileSync(/*turbopackIgnore: true*/ path.join(shots, ref)));
          const b = PNG.sync.read(fs.readFileSync(/*turbopackIgnore: true*/ cloneShot));
          if (a.width === b.width && a.height === b.height) {
            const diff = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
            mismatch = Math.round((diff / (a.width * a.height)) * 1000) / 10;
          } else note = "screenshot sizes differ";
        } else note = "no reference screenshot";
        out.push({ route: r.route, status, mismatch, note });
        ctx.log(`  verify ${r.route}: HTTP ${status}${mismatch !== null ? `, ${mismatch}% of pixels differ from the reference` : ""}`);
      } catch (e) {
        ctx.check();
        out.push({ route: r.route, status: 0, mismatch: null, note: (e as Error).message.split("\n")[0].slice(0, 120) });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  let gateway = "served on the same origin (gateway not listening)";
  if (gatewayInfo().listening) {
    try {
      const r = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/preview/${token}/api/health`, { signal: AbortSignal.timeout(5000) });
      gateway = r.ok ? `reachable through the preview gateway (:${GATEWAY_PORT})` : `gateway answered HTTP ${r.status}`;
    } catch {
      gateway = "gateway did not answer";
    }
  }
  const measured = out.filter((r) => r.mismatch !== null);
  const worst = [...measured].sort((a, b) => b.mismatch! - a.mismatch!)[0];
  return {
    checkedAt: new Date().toISOString(), routesOk: out.filter((r) => r.status === 200).length, routesTotal: routes.length,
    averageMismatch: measured.length ? Math.round((measured.reduce((s, r) => s + r.mismatch!, 0) / measured.length) * 10) / 10 : null,
    worstMismatch: worst?.mismatch ?? null, worstRoute: worst?.route ?? null, gateway, tests: null, routes: out,
  };
}

registerRunner(async (ctx) => {
  const project = await getProject(ctx.job.projectId);
  if (!project) throw new UserError("The project no longer exists.");
  const from = STAGES.indexOf(ctx.job.fromStage as Stage);
  if (from <= 0) await discoveryStage(ctx);
  if (from <= 1) await planStage(ctx);
  if (from <= 2) await generateStage(ctx);
  await buildStage(ctx);
});

export const pipelineReady = true;
