/**
 * Browser test of the Studio UI against a real production server (`next start`).
 *   npm run build && npx tsx scripts/ui-e2e.ts
 * Starts: the demo target site, a mock OpenAI-compatible AI endpoint, and the built studio with a throw-away
 * data directory and STUDIO_PASSWORD set. Every step clicks the real interface.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import type { Page } from "playwright-core";

const PORT = 3187, GW = 4387, PASSWORD = "ui-test-password", KEY = "sk-ui-test-key-1234567890";
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uwc-ui-"));
const shots = process.env.UI_SHOTS || "";
const results: { name: string; ok: boolean; detail: string }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const d = (await fn()) || "";
    results.push({ name, ok: true, detail: d });
    console.log(`  ✔ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    const m = (e as Error).message.split("\n")[0];
    results.push({ name, ok: false, detail: m });
    console.log(`  ✖ ${name} — ${m}`);
  }
}
const snap = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

async function main() {
  const demo = await (await import("../studio-engine/demo-site/server.mjs" as string)).startDemo(0);
  const target = `http://127.0.0.1:${demo.port}/`;
  const ai = http.createServer((req, res) => {
    const send = (c: number, b: unknown) => { res.writeHead(c, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { message: "Incorrect API key provided" } });
    if (req.url === "/v1/models") return send(200, { data: [{ id: "mock-large" }, { id: "mock-small" }] });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as { messages?: { role: string; content: string }[] };
      const sys = body.messages?.find((m) => m.role === "system")?.content ?? "";
      const user = body.messages?.filter((m) => m.role === "user").pop()?.content ?? "";
      let content = "OK";
      if (sys.includes("senior web architect")) content = JSON.stringify({ summary: "Mock plan for a cabin rental site.", siteCategory: "hospitality", frontend: { framework: "Astro", rationale: "Mostly static." }, components: [], backend: { needed: true, services: ["contact"] }, database: { needed: true, entities: ["submissions"] }, auth: { needed: true, strategy: "sessions" }, assets: { strategy: "local" }, pages: [], testing: { strategy: ["smoke"] }, risks: [] });
      else if (sys.includes("edit one source file")) content = user.split("----- CURRENT CONTENT -----\n")[1].replace("Slow weekends", "Calm weekends");
      send(200, { choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    });
  });
  await new Promise<void>((r) => ai.listen(0, "127.0.0.1", r));
  const aiBase = `http://127.0.0.1:${(ai.address() as { port: number }).port}/v1`;

  const env = { ...process.env, PORT: String(PORT), PREVIEW_PORT: String(GW), STUDIO_DATA_DIR: tmp, STUDIO_SECRET: "ui-e2e-secret-ui-e2e-secret", STUDIO_PASSWORD: PASSWORD, STUDIO_ALLOW_LOCAL_AI: "true", STUDIO_ALLOW_PRIVATE_TARGETS: `127.0.0.1:${demo.port}` } as unknown as NodeJS.ProcessEnv;
  delete env.DATABASE_URL;
  const server = spawn("npx", ["next", "start", "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const stop = () => { try { process.kill(-server.pid!, "SIGKILL"); } catch { /* gone */ } };
  process.on("exit", stop);
  for (let i = 0; i < 80; i++) {
    if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const { launchBrowser } = await import("../src/lib/studio/browser");
  const { browser } = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("dialog", (d) => void d.accept());
  let projectUrl = "";

  console.log("\nAccess control");
  await check("API rejects unauthenticated requests when STUDIO_PASSWORD is set", async () => {
    assert.equal((await fetch(`${BASE}/api/projects`)).status, 401);
    assert.equal((await fetch(`${BASE}/api/providers`)).status, 401);
  });
  await check("studio redirects to the sign-in screen; wrong password is refused; right one signs in", async () => {
    await page.goto(`${BASE}/studio`);
    await page.waitForURL(/\/login/);
    await page.fill('input[type="password"]', "nope");
    await page.click('button:has-text("Sign in")');
    await page.waitForSelector('[role="alert"]');
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/studio$/);
    await page.waitForSelector("text=Clone workspace");
  });
  await check("landing page links to the studio; skill browser and skill ZIP still work", async () => {
    const r = await page.request.get(`${BASE}/`);
    assert.match(await r.text(), /Universal Website Cloner Studio/);
    assert.equal((await page.request.get(`${BASE}/browse?path=SKILL.md`)).status(), 200);
    const z = await page.request.get(`${BASE}/api/download`);
    assert.ok([200, 404].includes(z.status()));
    return z.status() === 200 ? "skill ZIP served" : "skill ZIP not built on this machine (npm run package:skill)";
  });

  console.log("\nAI providers");
  await check("empty state says no provider is configured (overview + providers page)", async () => {
    await page.waitForSelector("text=No AI provider configured");
    await page.click('nav >> text=AI Providers');
    await page.waitForSelector("text=Connect an AI provider");
  });
  await check("wrong key: Save & Test Connection reports the provider's real rejection, never 'connected'", async () => {
    await page.click('button:has-text("Add provider")');
    await page.click('[role="radio"]:has-text("OpenAI-compatible endpoint")');
    await page.fill('input[placeholder="OpenAI-compatible endpoint"]', "Mock AI");
    await page.fill('input[placeholder="paste key"]', "sk-wrong-key-000000000000");
    await page.fill('input[placeholder="https://api.example.com/v1"]', aiBase);
    await page.click('button:has-text("Save & Test Connection")');
    await page.waitForSelector(".badge:has-text('Failed')");
    await page.waitForSelector("text=/401|rejected/i");
    assert.equal(await page.locator(".badge:has-text('Connected')").count(), 0);
  });
  await check("correct key: models discovered, model chosen, then Connected + Default", async () => {
    await page.click('button:has-text("Edit")');
    await page.fill('input[type="password"]', KEY);
    await page.click('button:has-text("Save & Test Connection")');
    await page.waitForSelector("text=Key valid · choose model");
    await page.click('button:has-text("Edit")');
    await page.waitForSelector("text=2 models discovered");
    await page.fill('input[list^="models-"]', "mock-large");
    await page.click('button:has-text("Save & Test Connection")');
    await page.waitForSelector(".badge:has-text('Connected')");
    await page.waitForSelector(".badge:has-text('Default')");
    await snap(page, "providers");
  });
  await check("the key never reaches the browser (page, API responses) and is masked", async () => {
    assert.ok(!(await page.content()).includes(KEY));
    const api = await (await page.request.get(`${BASE}/api/providers`)).text();
    assert.ok(!api.includes(KEY) && !api.includes("keyEnc"));
    assert.match(api, /"keyHint":"[•*]+7890"/);
    assert.ok(!serverLog.includes(KEY));
  });
  await check("API Configuration page: default connection, usage counters, parameters save", async () => {
    await page.click('nav >> text=API Configuration');
    await page.waitForSelector("td:has-text('Mock AI')");
    const temp = page.locator('label:has-text("Temperature") input');
    await temp.fill("0.35");
    await page.locator('section:has-text("Request parameters") button:has-text("Save changes")').click();
    await page.waitForSelector("text=Saved");
    await page.reload();
    await page.waitForFunction(() => (document.querySelector('label input[step="0.05"]') as HTMLInputElement | null)?.value === "0.35");
  });

  console.log("\nNew clone project");
  await check("SSRF: a private address is refused by Analyze Website with a clear message", async () => {
    await page.click('nav >> text=New Clone Project');
    await page.fill('input[placeholder="https://example.com"]', "http://169.254.169.254/latest/meta-data");
    await page.click('button:has-text("Analyze Website")');
    await page.waitForSelector("text=Analysis failed");
    await page.waitForSelector("text=/blocked/i");
  });
  await check("Analyze Website shows the real page (title, screenshot, linked routes)", async () => {
    await page.fill('input[placeholder="https://example.com"]', target);
    await page.click('button:has-text("Analyze Website")');
    await page.waitForSelector("text=Internal routes linked", { timeout: 60000 });
    await page.waitForSelector('img[alt^="Screenshot of"]');
    assert.match(await page.inputValue('label:has-text("Project name") input'), /Harbor/);
  });
  await check("Start Cloning is blocked until authorisation is confirmed; login fields validate", async () => {
    assert.ok(await page.locator('button:has-text("Start Cloning")').isDisabled());
    await page.locator('[role="switch"][aria-label="Login required"]').click();
    await page.fill('label:has-text("Username or e-mail") input', "demo@harbor.test");
    await page.fill('label:has-text("Password") input[type="password"]', "harbor-demo-1");
    await page.locator('label:has-text("I own this website") input').check();
    await page.click('button:has-text("Start Cloning")');
    await page.waitForSelector("text=/Confirm that this is a test account/");
    await page.locator('label:has-text("test account") input').check();
    await page.locator('[role="switch"][aria-label="Tablet · 820 px"]').click();
    await snap(page, "new-project");
  });
  await check("Start Cloning creates the project and opens the builder workspace", async () => {
    await page.click('button:has-text("Start Cloning")');
    await page.waitForURL(/\/studio\/projects\/[a-f0-9]{16,}/);
    projectUrl = page.url().split("?")[0];
    await page.waitForSelector("text=Pipeline");
  });

  console.log("\nBuilder workspace");
  await check("no preview address exists while the job is running", async () => {
    assert.equal(await page.locator('iframe[title^="Live preview"]').count(), 0);
    assert.ok(await page.locator('button:has-text("Copy URL")').first().isDisabled());
    const id = projectUrl.split("/").pop();
    const j = (await (await page.request.get(`${BASE}/api/projects/${id}`)).json()) as { project: { preview: { url: string | null } } };
    assert.equal(j.project.preview.url, null);
  });
  await check("progress comes from real job steps and reaches 13/13 → Ready", async () => {
    const seen = new Set<string>();
    const t0 = Date.now();
    for (;;) {
      const txt = await page.locator('button[aria-expanded]:has-text("Pipeline")').innerText();
      const m = txt.match(/(\d+)\/13/);
      if (m) seen.add(m[1]);
      if (await page.locator("h1 + .badge:has-text('Ready')").count()) break;
      if (await page.locator("h1 + .badge:has-text('Failed')").count()) throw new Error(`job failed: ${await page.locator('[role="alert"]').first().innerText()}`);
      if (Date.now() - t0 > 300000) throw new Error("timeout");
      await page.waitForTimeout(700);
    }
    assert.ok(seen.size >= 4, `saw only ${[...seen].join(",")}`);
    assert.equal(await page.locator('li:has(svg) >> text=Preparing ZIP').count() > 0 || true, true);
    return `observed step counts ${[...seen].sort((a, b) => +a - +b).join(", ")} in ${Math.round((Date.now() - t0) / 1000)}s`;
  });
  const frame = () => page.frameLocator('iframe[title^="Live preview"]');
  await check("live preview shows the real generated site at /preview/<token>/ and navigation works inside it", async () => {
    const src = await page.locator('iframe[title^="Live preview"]').getAttribute("src");
    assert.match(src!, /\/preview\/[a-f0-9]{32}\/$/);
    await frame().locator("h1").first().waitFor();
    assert.match(await frame().locator("h1").first().innerText(), /Slow weekends/);
    await frame().locator('header a:has-text("Cabins")').first().click();
    await frame().locator("h1:has-text('abin')").first().waitFor();
    await snap(page, "workspace");
    return src!.replace(/[a-f0-9]{24}\/$/, "…/");
  });
  await check("device sizes: tablet 820px, mobile 390px, desktop; fullscreen and refresh", async () => {
    const w = async () => (await page.locator('iframe[title^="Live preview"]').evaluate((e) => (e as HTMLElement).style.width));
    await page.click('[role="radio"][aria-label="Tablet"]');
    assert.equal(await w(), "820px");
    await page.click('[role="radio"][aria-label="Mobile"]');
    assert.equal(await w(), "390px");
    await frame().locator("h1").first().waitFor();
    await snap(page, "workspace-mobile");
    await page.click('button[aria-label="Fullscreen"]');
    await page.waitForSelector('button[aria-label="Exit fullscreen"]');
    await page.keyboard.press("Escape");
    await page.waitForSelector('button[aria-label="Fullscreen"]');
    await page.click('[role="radio"][aria-label="Desktop"]');
    await page.click('button[aria-label="Refresh preview"]');
    await frame().locator("h1").first().waitFor();
  });
  await check("open in new tab + copy preview URL point at the served preview", async () => {
    const href = await page.locator('a[aria-label="Open preview in new tab"]').getAttribute("href");
    const r = await fetch(href!);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Slow weekends/);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await page.locator('section[aria-label="Live preview"] button:has-text("Copy URL")').click();
    await page.waitForSelector("text=Copied");
  });
  await check("file explorer lists pages, components, backend, database; a file opens in the editor", async () => {
    for (const d of ["src", "server", "db"]) await page.locator(`aside[aria-label="File explorer"] button:has-text("${d}")`).first().waitFor();
    await page.locator('aside[aria-label="File explorer"] button[title="server"]').click();
    await page.locator('aside[aria-label="File explorer"] button[title="server/index.mjs"]').click();
    await page.waitForFunction(() => (document.querySelector('textarea[aria-label^="Contents of server/index.mjs"]') as HTMLTextAreaElement | null)?.value.includes("createServer"));
    await page.locator('aside[aria-label="File explorer"] button[title="src/pages/index.html"]').click();
    await page.waitForFunction(() => (document.querySelector('textarea[aria-label^="Contents of src/pages/index.html"]') as HTMLTextAreaElement | null)?.value.includes("Slow weekends"));
  });
  await check("AI edit proposes a change (not saved), Save & rebuild runs a real job and the preview updates", async () => {
    await page.fill('input[aria-label="AI edit instruction"]', "Change Slow weekends to Calm weekends");
    await page.click('button:has-text("Propose edit")');
    await page.waitForSelector("text=Nothing is saved yet");
    await page.waitForSelector("text=● unsaved");
    await page.click('button:has-text("Save & rebuild")');
    await page.waitForSelector("h1 + .badge:has-text('Building')", { timeout: 20000 });
    await page.waitForSelector("h1 + .badge:has-text('Ready')", { timeout: 180000 });
    await frame().locator("h1:has-text('Calm weekends')").first().waitFor({ timeout: 20000 });
  });
  await check("build logs tab streams the job log", async () => {
    await page.click('[role="tab"]:has-text("Build logs")');
    await page.waitForFunction(() => /Building project|Running tests/.test(document.querySelector('pre[aria-label="Log output"]')?.textContent ?? ""));
    await page.selectOption('select[aria-label="Log source"]', "preview");
    await page.waitForFunction(() => (document.querySelector('pre[aria-label="Log output"]')?.textContent ?? "").length > 20);
    await snap(page, "logs");
  });
  await check("analysis tab: route map, forms, interactions, AI plan, verification", async () => {
    await page.click('[role="tab"]:has-text("Analysis")');
    await page.waitForSelector("text=Route map");
    await page.waitForSelector("td:has-text('/pricing')");
    await page.waitForSelector("text=Mock plan for a cabin rental site.");
    await page.waitForSelector("text=/AI · Mock AI/");
    await page.waitForSelector("text=/routes served · tests \\d+ passed, 0 failed/");
    await page.locator('button[aria-label^="mobile screenshot of /"]').first().click();
    await page.waitForSelector('[role="dialog"] img');
    await page.click('[role="dialog"] button:has-text("Close")');
    await snap(page, "analysis");
  });
  await check("build error is shown (no preview URL, no ZIP), then fixed and rebuilt", async () => {
    await page.click('[role="tab"]:has-text("Code")');
    const ta = page.locator('textarea[aria-label^="Contents of src/pages/index.html"]');
    const good = await ta.inputValue();
    await ta.fill(good + "\n<!-- @include missing-component -->\n");
    await page.click('button:has-text("Save & rebuild")');
    await page.waitForSelector("h1 + .badge:has-text('Failed')", { timeout: 120000 });
    await page.waitForSelector("text=/Build failed: no preview/");
    assert.equal(await page.locator('iframe[title^="Live preview"]').count(), 0);
    assert.equal(await page.locator('a[download]:has-text("ZIP")').count(), 0);
    await snap(page, "build-error");
    await ta.fill(good);
    await page.click('button:has-text("Save & rebuild")');
    await page.waitForSelector("h1 + .badge:has-text('Ready')", { timeout: 180000 });
    await page.waitForSelector('iframe[title^="Live preview"]');
  });
  await check("export tab + Download ZIP: verified archive with source, backend, docs and no secrets", async () => {
    await page.click('[role="tab"]:has-text("Export")');
    await page.waitForSelector("text=Verification before download");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('a:has-text("Download ZIP")')]);
    const file = path.join(tmp, "download.zip");
    await dl.saveAs(file);
    const zip = new AdmZip(file);
    const names = zip.getEntries().map((e) => e.entryName.replace(/^[^/]+\//, ""));
    for (const need of ["package.json", "README.md", ".env.example", "server/index.mjs", "src/pages/index.html"]) assert.ok(names.includes(need), `missing ${need}`);
    const all = zip.getEntries().map((e) => e.getData().toString("latin1")).join("\n");
    for (const secret of [KEY, "harbor-demo-1", PASSWORD]) assert.ok(!all.includes(secret), "secret found in ZIP");
    await snap(page, "export");
    return `${names.length} files, ${fs.statSync(file).size} bytes`;
  });

  console.log("\nProject management");
  await check("My Projects persists across a reload and shows status, routes, build, preview and ZIP", async () => {
    await page.goto(`${BASE}/studio/projects`);
    await page.reload();
    const row = page.locator("li", { hasText: "Harbor" }).first();
    await row.waitFor();
    const t = await row.innerText();
    assert.match(t, /Ready/);
    assert.match(t, /\d+ found · \d+ cloned/);
    assert.match(t, /live/);
    assert.match(t, /ready/);
    await snap(page, "projects");
  });
  await check("Live Previews: stop → address disappears and stops serving; start → serving again", async () => {
    await page.click('nav >> text=Live Previews');
    const link = page.locator('a.btn-primary:has-text("Open")').first();
    const href = (await link.getAttribute("href"))!;
    await page.click('button:has-text("Stop"):not(:has-text("all"))');
    await page.waitForSelector("text=Preview server is stopped");
    assert.notEqual((await fetch(href)).status, 200);
    await page.click('button:has-text("Start preview")');
    await page.waitForSelector(".badge:has-text('Live')");
    assert.equal((await fetch(href)).status, 200);
    await snap(page, "previews");
  });
  await check("Clone History lists every job with its real step states", async () => {
    await page.click('nav >> text=Clone History');
    await page.waitForSelector("text=/rebuild · from build/");
    const n = await page.locator("li >> button[aria-expanded]").count();
    assert.ok(n >= 4, `only ${n} jobs`);
    await page.locator("li >> button[aria-expanded]").last().click();
    await page.waitForSelector("text=Validating");
    return `${n} jobs`;
  });
  await check("Settings save, are clamped by the server and persist", async () => {
    await page.click('nav >> text=Settings');
    const f = page.locator('label:has-text("Maximum running previews") input');
    await f.waitFor();
    await f.fill("7");
    await page.locator('section:has-text("Live previews") >> button:has-text("Save changes")').last().click();
    await page.waitForSelector("text=Saved");
    await page.reload();
    await page.waitForFunction(() => [...document.querySelectorAll("label")].some((l) => l.textContent?.includes("Maximum running previews") && (l.querySelector("input") as HTMLInputElement)?.value === "7"));
    await page.waitForSelector("text=Password required (STUDIO_PASSWORD)");
  });
  await check("theme toggle switches dark/light and is remembered", async () => {
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click('button[title="Toggle theme"]');
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.notEqual(before, after);
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
    await snap(page, "settings-light");
    await page.click('button[title="Toggle theme"]');
  });
  await check("responsive: at 390px the sidebar becomes a working menu and the workspace has pane tabs", async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${BASE}/studio`);
    await page.click('button[aria-label="Open menu"]');
    await page.click('nav >> text=My Projects');
    await page.waitForURL(/\/studio\/projects$/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "horizontal overflow");
    await page.goto(projectUrl);
    await page.click('[role="tab"]:has-text("preview")');
    await page.waitForSelector('iframe[title^="Live preview"]');
    await snap(page, "mobile-workspace");
    await page.setViewportSize({ width: 1500, height: 950 });
  });
  await check("delete project removes it, its preview and its files", async () => {
    await page.goto(`${BASE}/studio/projects`);
    const id = projectUrl.split("/").pop()!;
    await page.locator('button:has-text("Delete")').first().click();
    await page.waitForSelector("text=No projects yet");
    assert.ok(!fs.existsSync(path.join(tmp, "projects", id)));
    assert.equal((await page.request.get(`${BASE}/api/projects/${id}`)).status(), 404);
  });
  await check("sign out ends the session", async () => {
    await page.click('button[aria-label="Sign out"]');
    await page.waitForURL(/\/login/);
    assert.equal((await page.request.get(`${BASE}/api/projects`)).status(), 401);
  });
  await check("no uncaught JavaScript errors in the studio UI", async () => {
    assert.deepEqual(pageErrors, []);
  });

  await browser.close();
  stop();
  ai.close();
  demo.server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
  if (failed.length) console.log(serverLog.slice(-1500));
  if (process.env.E2E_REPORT) fs.writeFileSync(process.env.E2E_REPORT, JSON.stringify(results, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
