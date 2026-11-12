/**
 * End-to-end test of the studio engine against the bundled demo website (no UI involved).
 *   npx tsx scripts/e2e.ts
 * Uses a throw-away data directory and a mock OpenAI-compatible server for the AI provider.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uwc-e2e-"));
process.env.STUDIO_DATA_DIR = tmp;
process.env.STUDIO_SECRET = "e2e-secret-e2e-secret-e2e";
process.env.PREVIEW_PORT = "4390";
process.env.STUDIO_ALLOW_LOCAL_AI = "true";
delete process.env.DATABASE_URL;

const results: { name: string; ok: boolean; detail: string }[] = [];
const ok = (name: string, detail = "") => { results.push({ name, ok: true, detail }); console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`); };
async function check(name: string, fn: () => Promise<string | void> | string | void) {
  try { ok(name, (await fn()) || ""); } catch (e) { results.push({ name, ok: false, detail: (e as Error).message }); console.log(`  ✖ ${name} — ${(e as Error).message}`); }
}

async function main() {
  const demo = await (await import("../studio-engine/demo-site/server.mjs" as string)).startDemo(0);
  process.env.STUDIO_ALLOW_PRIVATE_TARGETS = `127.0.0.1:${demo.port}`;
  const target = `http://127.0.0.1:${demo.port}/`;

  // Mock OpenAI-compatible AI endpoint: validates the bearer key, lists models, returns a plan.
  const AI_KEY = "sk-test-0123456789abcdefghijklmnop";
  let aiCalls = 0;
  const ai = http.createServer((req, res) => {
    const send = (c: number, j: unknown) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
    if (req.headers.authorization !== `Bearer ${AI_KEY}`) return send(401, { error: { message: "Incorrect API key provided" } });
    if (req.url === "/v1/models") return send(200, { data: [{ id: "mock-large" }, { id: "mock-small" }] });
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      aiCalls++;
      const body = JSON.parse(b) as { messages: { content: string }[] };
      const sys = body.messages[0].content;
      let content = "OK";
      if (sys.includes("senior web architect")) content = "```json\n" + JSON.stringify({ summary: "Mock plan for a cabin rental site.", siteCategory: "hospitality marketing site", frontend: { framework: "Astro", rationale: "Mostly static content." }, components: [{ name: "SiteHeader", purpose: "Navigation" }], backend: { needed: true, services: ["contact"] }, database: { needed: true, entities: ["submissions"] }, auth: { needed: true, strategy: "sessions" }, assets: { strategy: "local" }, pages: [{ route: "/", purpose: "Home" }], testing: { strategy: ["smoke"] }, risks: [] }) + "\n```";
      else if (sys.includes("edit one source file")) content = body.messages[1].content.split("----- CURRENT CONTENT -----\n")[1].replace("Slow weekends", "Unhurried weekends");
      send(200, { choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    });
  });
  await new Promise<void>((r) => ai.listen(0, "127.0.0.1", r));
  const aiBase = `http://127.0.0.1:${(ai.address() as { port: number }).port}/v1`;

  const prov = await import("../src/lib/studio/providers");
  const P = await import("../src/lib/studio/projects");
  const store = await import("../src/lib/studio/store");
  const jobsMod = await import("../src/lib/studio/jobs");
  const preview = await import("../src/lib/studio/preview");
  const ssrf = await import("../src/lib/studio/ssrf");
  const { loadAnalysis, quickAnalyze } = await import("../src/lib/studio/discover");
  const { aiEditFile } = await import("../src/lib/studio/plan");
  const { getDbInfo } = await import("../src/db");

  console.log("\n1-2. Provider configuration and API key validation");
  let providerId = "";
  await check("database boots without DATABASE_URL (embedded PGlite)", async () => (await getDbInfo()).engine);
  await check("provider saved; key is encrypted at rest and masked", async () => {
    const p = await prov.saveProvider({ kind: "custom", label: "Mock", endpoint: aiBase, apiKey: "sk-wrong-key-000000000000", model: "" });
    providerId = p.id;
    assert.ok(p.keyEnc && !p.keyEnc.includes("sk-wrong"));
    const pub = prov.publicProvider(p);
    assert.ok(!JSON.stringify(pub).includes("sk-wrong-key"));
    assert.equal(pub.status, "untested");
    return pub.keyHint;
  });
  await check("wrong key is rejected by a real connection test", async () => {
    const p = await prov.testProvider(providerId);
    assert.equal(p.status, "failed");
    assert.match(p.lastError || "", /401/);
    return p.lastError!.slice(0, 60);
  });
  await check("creating an AI project is refused while no provider is connected", async () => {
    await assert.rejects(P.createProject({ targetUrl: target, authorised: true, options: { useAi: true } }), /No tested AI provider|connection test/);
  });
  await check("correct key: models are discovered, model must be chosen", async () => {
    await prov.saveProvider({ id: providerId, apiKey: AI_KEY });
    const p = await prov.testProvider(providerId);
    assert.equal(p.status, "needs_model");
    assert.deepEqual(p.models, ["mock-large", "mock-small"]);
  });
  await check("model selected → connected and default", async () => {
    await prov.saveProvider({ id: providerId, model: "mock-large" });
    const p = await prov.testProvider(providerId);
    assert.equal(p.status, "connected");
    assert.equal(p.isDefault, true);
  });

  console.log("\n3. Target URL submission and SSRF protection");
  for (const bad of ["http://127.0.0.1:1/", "http://localhost/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "file:///etc/passwd", "http://[::1]/", "http://user:pw@example.com/"]) {
    await check(`blocked: ${bad}`, async () => { await assert.rejects(ssrf.assertPublicUrl(bad)); });
  }
  await check("authorisation confirmation is required", async () => { await assert.rejects(P.createProject({ targetUrl: target, options: { useAi: false } }), /authorised/); });
  await check("quick analysis of the target (Analyze website)", async () => {
    const q = await quickAnalyze(target);
    assert.equal(q.status, 200);
    assert.ok(q.routes.length >= 5);
    return `"${q.title}", ${q.routes.length} routes, browser ${q.browser.source}`;
  });

  console.log("\n4-14. Full clone with sign-in and AI planning");
  const project = await P.createProject({
    targetUrl: target, name: "Harbor Pine E2E", authorised: true,
    auth: { required: true, loginUrl: "/login", username: "demo@harbor.test", password: "harbor-demo-1", testAccountConfirmed: true },
    options: { useAi: true, maxPages: 15 },
  });
  const writesBefore = demo.writes.length;
  await P.startJob(project.id, "start");
  const wait = async (id: string) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const j = (await jobsMod.listJobs(id, 1))[0];
      if (!["queued", "running"].includes(j.status)) return j;
    }
  };
  let job = await wait(project.id);
  const logFile = jobsMod.jobLogFile(project.id, job.id);
  if (job.status !== "succeeded") console.log(fs.readFileSync(logFile, "utf8"));
  await check("job succeeded with all 13 steps done", () => {
    assert.equal(job.status, "succeeded", job.error || "");
    const steps = job.steps as { key: string; status: string; detail?: string }[];
    assert.equal(steps.length, 13);
    assert.ok(steps.every((s) => s.status === "done"), steps.filter((s) => s.status !== "done").map((s) => s.key).join(","));
    for (const s of steps) console.log(`      ${s.key.padEnd(13)} ${s.detail}`);
  });
  const p1 = (await store.getProject(project.id))!;
  const analysis = loadAnalysis(project.id)!;
  const site = store.siteDir(project.id);
  await check("routes discovered automatically (links + sitemap + authenticated area)", () => {
    const routes = analysis.pages.map((p) => p.route);
    for (const r of ["/", "/cabins", "/pricing", "/journal", "/journal/first-frost", "/contact", "/terms", "/login", "/members"]) assert.ok(routes.includes(r), `missing ${r}`);
    assert.ok(!routes.includes("/logout"), "logout must never be visited");
    assert.equal(analysis.routes.find((r) => r.route === "/staff"), undefined);
    return `${p1.routesDiscovered} discovered, ${p1.pagesCloned} cloned`;
  });
  await check("protected route identified; logout skipped as unsafe", () => {
    assert.equal(analysis.pages.find((p) => p.route === "/members")?.protected, true);
    assert.match(analysis.routes.find((r) => r.route === "/logout")?.reason || "", /sign-out|destructive/);
  });
  await check("screenshots captured for desktop, tablet and mobile", () => {
    const dir = path.join(store.analysisDir(project.id), "screenshots");
    for (const d of ["desktop", "tablet", "mobile"]) assert.ok(fs.statSync(path.join(dir, `index-${d}.jpg`)).size > 5000);
    return `${fs.readdirSync(dir).length} files`;
  });
  await check("no write request reached the reference site during analysis", () => { assert.equal(demo.writes.length, writesBefore); });
  await check("test-account password wiped after discovery", () => { assert.equal(p1.passwordEnc, null); });
  await check("AI provider was called for the architecture plan; usage recorded", async () => {
    assert.ok(aiCalls >= 2);
    const arch = fs.readFileSync(path.join(site, "docs/ARCHITECTURE.md"), "utf8");
    assert.match(arch, /AI provider — Mock \(mock-large\)/);
    assert.match(arch, /Astro/);
    const u = (await prov.getProvider(providerId))!.usage as { requests: number; inputTokens: number };
    assert.ok(u.requests >= 2 && u.inputTokens >= 100);
  });
  await check("generated project structure (pages, components, backend, database, docs)", () => {
    for (const f of ["package.json", "README.md", ".env.example", "src/pages/index.html", "src/pages/journal/first-frost.html", "src/components/header.html", "src/components/footer.html", "src/scripts/site.js", "server/index.mjs", "db/schema.sql", "db/migrations/001_init.sql", "tests/smoke.test.mjs", "docs/FUNCTIONALITY.md", "src/data/interactions.json"]) assert.ok(fs.existsSync(path.join(site, f)), f);
    const idx = fs.readFileSync(path.join(site, "src/pages/index.html"), "utf8");
    assert.match(idx, /@include components\/header\.html/);
    assert.doesNotMatch(idx, /<script/i);
    assert.ok(fs.readdirSync(path.join(site, "public/assets")).length >= 4);
    assert.ok(fs.readdirSync(path.join(site, "src/styles")).some((f) => f.startsWith("site-")));
  });
  await check("one shared header across all pages (active state normalised)", () => {
    assert.deepEqual(fs.readdirSync(path.join(site, "src/components")).sort(), ["footer.html", "header.html"]);
  });
  await check("CSS url() and @import rewritten to local files", () => {
    const dir = path.join(site, "src/styles");
    const main = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith("site-"))!), "utf8");
    assert.match(main, /@import "\.\/type-[a-f0-9]+\.css"/);
    assert.match(main, /url\("\.\.\/assets\/waves-[a-f0-9]+\.svg"\)/);
    assert.doesNotMatch(main, /127\.0\.0\.1/);
  });
  await check("build succeeded, tests passed, visual comparison recorded", () => {
    assert.equal(p1.status, "ready");
    assert.equal(p1.buildStatus, "succeeded");
    const v = p1.verification as { routesOk: number; routesTotal: number; worstMismatch: number; averageMismatch: number; tests: { passed: number; failed: number } };
    assert.equal(v.routesOk, v.routesTotal);
    assert.equal(v.tests.failed, 0);
    assert.ok(v.tests.passed >= 7);
    return `${v.routesOk}/${v.routesTotal} routes, avg mismatch ${v.averageMismatch}%, worst ${v.worstMismatch}%, ${v.tests.passed} tests`;
  });

  console.log("\n10-12. Live preview through the gateway");
  const gw = `http://127.0.0.1:4390/preview/${p1.previewToken}`;
  await check("preview URL serves the real generated site", async () => {
    const r = await fetch(`${gw}/`);
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /Slow weekends on the quiet side of the bay/);
    assert.match(html, /scripts\/site\.js/);
    assert.equal((await fetch(gw, { redirect: "manual" })).status, 308);
  });
  await check("wrong preview token is rejected", async () => { assert.equal((await fetch(`http://127.0.0.1:4390/preview/${"0".repeat(32)}/`)).status, 404); });
  const { launchBrowser } = await import("../src/lib/studio/browser");
  const { browser } = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await check("navigation inside the preview (relative links under the path prefix)", async () => {
      await page.goto(`${gw}/`);
      await page.click('nav a:has-text("Cabins")');
      await page.waitForURL(/\/cabins$/);
      assert.match(await page.title(), /Cabins/);
      assert.equal(await page.getAttribute('nav a[aria-current="page"]', "href"), "./cabins");
      assert.ok((await page.getAttribute('nav a[aria-current="page"]', "class"))!.includes("active"));
      await page.goto(`${gw}/journal`);
      await page.click('a:has-text("First frost")');
      await page.waitForURL(/\/journal\/first-frost$/);
      assert.ok(await page.evaluate("document.querySelector('main img').naturalWidth > 0"), "nested page image loads");
      await page.click('a.brand');
      await page.waitForURL(new RegExp(`${p1.previewToken}/$`));
    });
    await check("recorded tabs, accordion and dialog work without the original JavaScript", async () => {
      await page.goto(`${gw}/cabins`);
      assert.equal(await page.isVisible("#panel-four"), false);
      await page.click("#tab-four");
      assert.equal(await page.isVisible("#panel-four"), true);
      assert.equal(await page.isVisible("#panel-two"), false);
      await page.click("#tab-six");
      assert.equal(await page.isVisible("#panel-six"), true);
      assert.equal(await page.isVisible("#panel-four"), false);
      await page.click("#tab-two");
      assert.equal(await page.isVisible("#panel-two"), true);
      assert.equal(await page.getAttribute("#tab-two", "aria-selected"), "true");
      await page.click("#faq1");
      assert.equal(await page.isVisible("#ans1"), true);
      await page.click("#faq1");
      assert.equal(await page.isVisible("#ans1"), false);
      await page.click("#openMap");
      assert.equal(await page.isVisible("#mapDialog"), true);
      await page.click("#closeMap");
      assert.equal(await page.isVisible("#mapDialog"), false);
    });
    await check("responsive preview: mobile menu toggle recorded at the mobile viewport", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${gw}/`);
      assert.equal(await page.isVisible("#mainNav"), false);
      await page.click("#menuBtn");
      assert.equal(await page.isVisible("#mainNav"), true);
      assert.equal(await page.getAttribute("#menuBtn", "aria-expanded"), "true");
      await page.setViewportSize({ width: 1280, height: 800 });
    });
    await check("contact form posts to the clone's own backend and is validated", async () => {
      await page.goto(`${gw}/contact`);
      await page.fill('[name="name"]', "Ada");
      await page.fill('[name="email"]', "ada@example.test");
      await page.fill('[name="message"]', "Two nights in March?");
      await page.click('#contactForm button[type="submit"]');
      await page.waitForSelector('[data-uwc-note][data-kind="success"]');
      assert.equal(demo.writes.length, writesBefore, "nothing was sent to the original site");
    });
    await check("search returns results from the clone's search API", async () => {
      await page.goto(`${gw}/`);
      await page.fill('#siteSearch input[type="search"]', "sauna");
      await page.press('#siteSearch input[type="search"]', "Enter");
      await page.waitForSelector("[data-uwc-search-results] a");
      assert.ok((await page.locator("[data-uwc-search-results] a").count()) >= 1);
    });
    await check("authentication: protected page redirects, wrong password fails, sign-in works, sign-out works", async () => {
      await page.goto(`${gw}/members`);
      await page.waitForURL(/\/login\?next=/);
      await page.fill("#email", "preview@clone.test");
      await page.fill("#password", "not-the-password");
      await page.click('#loginForm button[type="submit"]');
      await page.waitForFunction("document.querySelector('#loginErr').textContent.includes('Invalid')");
      const P2 = await import("../src/lib/studio/pipeline");
      await page.fill("#password", P2.loadGeneration(project.id)!.previewAccount!.password);
      await page.click('#loginForm button[type="submit"]');
      await page.waitForURL(/\/members$/);
      await page.waitForSelector("text=Heron");
      await page.click("a[data-uwc-logout]");
      await page.waitForURL(/\/login$/);
      await page.goto(`${gw}/members`);
      await page.waitForURL(/\/login\?next=/);
    });
    await check("unknown route shows the captured 404 page with working styles", async () => {
      const r = await page.goto(`${gw}/deep/missing/page`);
      assert.equal(r!.status(), 404);
      assert.match(await page.textContent("h1") || "", /could not find/);
      assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.site-header')).position"), "sticky");
    });
    await check("no uncaught JavaScript errors in the preview", () => { assert.deepEqual(errors, []); });
  } finally {
    await browser.close();
  }
  await check("preview process is isolated (cannot read outside its project)", async () => {
    // Inject a hostile edit, rebuild is not needed: run the same sandbox flags directly.
    const { nodeSandboxArgs, cleanEnv, runLimited } = await import("../src/lib/studio/sandbox");
    fs.writeFileSync(path.join(site, "probe.mjs"), `import fs from 'node:fs'; import cp from 'node:child_process';
let a='read-allowed', b='spawn-allowed', c='env-leak';
try { fs.readFileSync('/etc/passwd') } catch (e) { a = e.code }
try { cp.execSync('id') } catch (e) { b = e.code }
if (!process.env.STUDIO_SECRET && !process.env.DATABASE_URL) c = 'env-clean';
console.log([a,b,c].join(','));`);
    const r = await runLimited({ cmd: process.execPath, args: [...nodeSandboxArgs(site, 128), "probe.mjs"], cwd: site, env: cleanEnv(site), timeoutSec: 20 });
    fs.rmSync(path.join(site, "probe.mjs"));
    assert.match(r.output, /ERR_ACCESS_DENIED,ERR_ACCESS_DENIED,env-clean/, r.output);
    return r.output.trim();
  });

  console.log("\n13-14. ZIP export");
  const zipInfo = p1.zip as { file: string; sha256: string; entries: number; checks: { ok: boolean }[] };
  await check("ZIP exists, integrity verified, essential files present, no secrets", () => {
    assert.ok(zipInfo.checks.every((c) => c.ok));
    const z = new AdmZip(zipInfo.file);
    assert.ok(z.test());
    const names = z.getEntries().map((e) => e.entryName);
    for (const f of ["package.json", "README.md", ".env.example", "server/index.mjs", "src/pages/index.html", "db/schema.sql", "docs/TESTING.md"]) assert.ok(names.includes(`harbor-pine-e2e/${f}`), f);
    assert.ok(!names.some((n) => /node_modules|^harbor-pine-e2e\/(data|dist)\/|\.sqlite|\/\.env$|sandbox-home/.test(n)));
    const all = z.getEntries().map((e) => e.getData().toString("latin1")).join("\n");
    for (const s of [AI_KEY, "harbor-demo-1", process.env.STUDIO_SECRET!]) assert.ok(!all.includes(s), "secret leaked into ZIP");
    return `${names.length} entries, sha256 ${zipInfo.sha256.slice(0, 12)}…`;
  });
  await check("the unzipped project installs, builds, tests and runs on its own", async () => {
    const dir = path.join(tmp, "unzipped");
    new AdmZip(zipInfo.file).extractAllTo(dir, true);
    const cwd = path.join(dir, "harbor-pine-e2e");
    const { execFileSync, spawn } = await import("node:child_process");
    const env = { PATH: process.env.PATH, HOME: tmp, NODE_NO_WARNINGS: "1" } as unknown as NodeJS.ProcessEnv;
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd, env, stdio: "pipe" });
    execFileSync("npm", ["run", "build"], { cwd, env, stdio: "pipe" });
    const t = execFileSync("npm", ["test"], { cwd, env, stdio: "pipe" }).toString();
    assert.match(t, /[#ℹ] fail 0/);
    const child = spawn("node", ["server/index.mjs"], { cwd, env: { ...env, PORT: "4391", HOST: "127.0.0.1" }, stdio: "pipe" });
    try {
      let up = false;
      for (let i = 0; i < 40 && !up; i++) { await new Promise((r) => setTimeout(r, 150)); up = await fetch("http://127.0.0.1:4391/api/health").then((r) => r.ok).catch(() => false); }
      assert.ok(up, "standalone server started");
      const r = await fetch("http://127.0.0.1:4391/members", { redirect: "manual" });
      assert.equal(r.status, 302, "standalone mode protects pages on the server");
      assert.match(r.headers.get("location") || "", /login\?next=/);
    } finally { child.kill(); }
  });

  console.log("\n15-16. Persistence, rebuild, AI edit, error recovery, cancellation");
  await check("AI-assisted file edit + rebuild reaches the live preview", async () => {
    const file = path.join(site, "src/pages/index.html");
    const next = await aiEditFile(providerId, "src/pages/index.html", fs.readFileSync(file, "utf8"), "Change the hero heading wording");
    fs.writeFileSync(file, next);
    await P.startJob(project.id, "rebuild");
    job = await wait(project.id);
    assert.equal(job.status, "succeeded", job.error || "");
    const steps = job.steps as { key: string; status: string }[];
    assert.equal(steps.find((s) => s.key === "routes")!.status, "skipped");
    const p = (await store.getProject(project.id))!;
    assert.match(await (await fetch(`http://127.0.0.1:4390/preview/${p.previewToken}/`)).text(), /Unhurried weekends/);
  });
  await check("build error is reported with the real compiler message; project marked failed", async () => {
    fs.renameSync(path.join(site, "src/components/header.html"), path.join(site, "src/components/header.bak"));
    await P.startJob(project.id, "rebuild");
    job = await wait(project.id);
    assert.equal(job.status, "failed");
    assert.match(job.error || "", /include not found: components\/header\.html/);
    const p = (await store.getProject(project.id))!;
    assert.equal(p.status, "failed");
    assert.equal(p.buildStatus, "failed");
    assert.equal(p.zip, null, "no stale ZIP after a failed build");
    const view = await P.projectView(p, new Headers({ host: "localhost:3000" }));
    assert.equal(view.preview.url, null, "no preview URL is advertised for a failed build");
    return job.error!.slice(0, 80);
  });
  await check("recovery: fix the file, resume → ready again", async () => {
    fs.renameSync(path.join(site, "src/components/header.bak"), path.join(site, "src/components/header.html"));
    await P.startJob(project.id, "resume");
    job = await wait(project.id);
    assert.equal(job.status, "succeeded", job.error || "");
    assert.equal(job.fromStage, "build");
    assert.equal((await store.getProject(project.id))!.status, "ready");
  });
  await check("re-running discovery with sign-in requires the password again", async () => {
    await assert.rejects(P.startJob(project.id, "restart"), /password is wiped/);
  });
  await check("built-in planning project (no AI) + cancellation mid-run", async () => {
    const p = await P.createProject({ targetUrl: target, name: "Cancel me", authorised: true, options: { useAi: false, maxPages: 15 } });
    const j = await P.startJob(p.id, "start");
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const cur = (await jobsMod.listJobs(p.id, 1))[0];
      if ((cur.steps as { key: string; status: string }[]).find((s) => s.key === "routes")?.status === "running") break;
    }
    await jobsMod.requestCancel(j.id);
    const done = await wait(p.id);
    assert.equal(done.status, "cancelled");
    assert.equal((await store.getProject(p.id))!.status, "failed");
    await P.startJob(p.id, "restart");
    const again = await wait(p.id);
    assert.equal(again.status, "succeeded", again.error || "");
    const arch = fs.readFileSync(path.join(store.siteDir(p.id), "docs/ARCHITECTURE.md"), "utf8");
    assert.match(arch, /built-in heuristics \(no AI provider was used\)/);
    const pages = loadAnalysis(p.id)!.pages.map((x) => x.route);
    assert.ok(!pages.includes("/members"), "member area is not reachable without sign-in");
    await P.deleteProject(p.id);
    assert.equal(await store.getProject(p.id), null);
    assert.ok(!fs.existsSync(store.projectDir(p.id)));
    return "cancelled → restarted → ready → deleted";
  });
  await check("unreachable target fails cleanly at the right step", async () => {
    const dead = await new Promise<number>((r) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const port = (s.address() as { port: number }).port; s.close(() => r(port)); }); });
    process.env.STUDIO_ALLOW_PRIVATE_TARGETS += `,127.0.0.1:${dead}`;
    const p = await P.createProject({ targetUrl: `http://127.0.0.1:${dead}/`, authorised: true, options: { useAi: false } });
    await P.startJob(p.id, "start");
    const j = await wait(p.id);
    assert.equal(j.status, "failed");
    const failed = (j.steps as { key: string; status: string }[]).find((s) => s.status === "failed");
    assert.equal(failed?.key, "routes");
    assert.match(j.error || "", /Could not open/);
    await P.deleteProject(p.id);
    return j.error!.slice(0, 70);
  });
  await check("preview stop → gateway reports it; restart on demand", async () => {
    const p = (await store.getProject(project.id))!;
    preview.stopPreview(project.id);
    assert.equal((await fetch(`http://127.0.0.1:4390/preview/${p.previewToken}/`)).status, 503);
    await P.ensurePreview(project.id);
    assert.equal((await fetch(`http://127.0.0.1:4390/preview/${p.previewToken}/`)).status, 200);
    await P.rotatePreviewToken(project.id);
    assert.equal((await fetch(`http://127.0.0.1:4390/preview/${p.previewToken}/`)).status, 404, "old link revoked");
  });
  await check("project metadata persists in the database across a reload", async () => {
    const list = await store.listProjects();
    assert.ok(list.some((x) => x.id === project.id && x.status === "ready"));
    assert.ok((await jobsMod.listJobs(project.id)).length >= 4);
  });

  preview.stopAllPreviews();
  demo.server.close();
  ai.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (process.env.E2E_REPORT) fs.writeFileSync(process.env.E2E_REPORT, JSON.stringify(results, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
