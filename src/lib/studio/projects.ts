import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, jobs, projects, type JobRow, type ProjectRow } from "@/db/schema";
import { encrypt, newId } from "./crypto";
import { activeJob, enqueue, requestCancel, STAGES, UserError, type Stage, type StepState } from "./jobs";
import "./pipeline";
import { loadGeneration, loadPlan } from "./pipeline";
import { loadAnalysis } from "./discover";
import { previewStatus, publicPreviewUrl, startPreview, stopPreview } from "./preview";
import { defaultProvider, getProvider } from "./providers";
import { assertPublicUrl } from "./ssrf";
import { DEFAULT_OPTIONS, getProject, getSettings, logActivity, projectDir, siteDir, updateProject, type ProjectAuth, type ProjectOptions } from "./store";
import path from "node:path";

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseOptions(raw: unknown, maxPagesDefault: number): ProjectOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dev = (o.devices && typeof o.devices === "object" ? o.devices : {}) as Record<string, unknown>;
  const devices = { desktop: true, tablet: bool(dev.tablet, true), mobile: bool(dev.mobile, true) };
  const backend = bool(o.backend, DEFAULT_OPTIONS.backend);
  return {
    scope: o.scope === "selected" ? "selected" : "entire",
    selectedPaths: Array.isArray(o.selectedPaths) ? o.selectedPaths.filter((x): x is string => typeof x === "string" && x.length < 500).slice(0, 60) : [],
    maxPages: Math.min(60, Math.max(1, Number(o.maxPages) || maxPagesDefault)),
    devices, frontend: true, backend,
    database: backend && bool(o.database, true), authentication: backend && bool(o.authentication, true),
    animations: bool(o.animations, true), responsive: bool(o.responsive, true), useAi: bool(o.useAi, true),
  };
}

export async function createProject(input: Record<string, unknown>): Promise<ProjectRow> {
  const rawUrl = str(input.targetUrl, 2000);
  if (!rawUrl) throw new UserError("Enter the URL of the website to clone.");
  const url = await assertPublicUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).catch((e) => { throw new UserError((e as Error).message); });
  if (input.authorised !== true) throw new UserError("Confirm that you own this website or are authorised to inspect and reproduce it.");
  const settings = await getSettings();
  const options = parseOptions(input.options, settings.maxPages);
  const a = (input.auth && typeof input.auth === "object" ? input.auth : {}) as Record<string, unknown>;
  const auth: ProjectAuth = { required: a.required === true, loginUrl: str(a.loginUrl, 500), username: str(a.username, 200), notes: str(a.notes, 1000) };
  const password = typeof a.password === "string" ? a.password : "";
  if (auth.required) {
    if (!auth.username || !password) throw new UserError("Login is enabled: enter the test account's username/e-mail and password.");
    if (a.testAccountConfirmed !== true) throw new UserError("Confirm that this is a test account you are authorised to use.");
    if (auth.loginUrl) {
      let lu: URL;
      try { lu = new URL(auth.loginUrl, url); } catch { throw new UserError("The login page URL is not valid."); }
      if (lu.origin !== url.origin) throw new UserError("The login page must be on the same origin as the target website.");
    }
  }
  let providerId: string | null = null;
  if (options.useAi) {
    const p = typeof input.providerId === "string" && input.providerId ? await getProvider(input.providerId) : await defaultProvider();
    if (!p) throw new UserError("No tested AI provider is configured. Add one under AI Providers and test the connection, or choose built-in planning for this project.");
    if (p.status !== "connected") throw new UserError(`"${p.label}" has not passed a connection test yet.`);
    providerId = p.id;
  }
  const id = newId(12);
  const db = await getDb();
  await db.insert(projects).values({
    id, name: str(input.name, 120) || url.host, description: str(input.description, 2000), targetUrl: url.href, options, auth,
    passwordEnc: auth.required ? encrypt(password) : null, providerId, previewToken: newId(16),
  });
  const row = (await getProject(id))!;
  await logActivity("created", `${row.name}: project created for ${url.host}`, id);
  return row;
}

export async function startJob(projectId: string, mode: "start" | "resume" | "rebuild" | "restart"): Promise<JobRow> {
  const project = await getProject(projectId);
  if (!project) throw new UserError("Project not found");
  let stage: Stage = "discovery";
  if (mode === "rebuild") {
    if (!fs.existsSync(/*turbopackIgnore: true*/ path.join(siteDir(projectId), "package.json"))) throw new UserError("Nothing has been generated yet, so there is nothing to rebuild.");
    stage = "build";
  } else if (mode === "resume") {
    // Continue from the first stage whose artefacts are missing.
    if (!loadAnalysis(projectId)) stage = "discovery";
    else if (!loadPlan(projectId)) stage = "plan";
    else if (!loadGeneration(projectId) || !fs.existsSync(/*turbopackIgnore: true*/ path.join(siteDir(projectId), "package.json"))) stage = "generate";
    else stage = "build";
  }
  if (stage === "discovery" && (project.auth as ProjectAuth).required && !project.passwordEnc) {
    throw new UserError("The test-account password is wiped after every analysis. Enter it again under “Sign-in for analysis”, then start the run.");
  }
  const job = await enqueue(projectId, stage === "build" && mode === "rebuild" ? "rebuild" : "clone", stage);
  await logActivity("job", `${project.name}: ${mode === "rebuild" ? "rebuild" : mode === "resume" ? `resumed from ${stage}` : "clone"} queued`, projectId);
  return job;
}

export async function setProjectPassword(projectId: string, password: string) {
  if (!password || password.length > 500) throw new UserError("Enter the test-account password.");
  await updateProject(projectId, { passwordEnc: encrypt(password) });
}

export async function deleteProject(projectId: string) {
  const project = await getProject(projectId);
  if (!project) return;
  const job = await activeJob(projectId);
  if (job) {
    await requestCancel(job.id);
    await new Promise((r) => setTimeout(r, 800));
  }
  stopPreview(projectId);
  const db = await getDb();
  await db.delete(jobs).where(eq(jobs.projectId, projectId));
  await db.delete(activity).where(eq(activity.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
  fs.rmSync(/*turbopackIgnore: true*/ projectDir(projectId), { recursive: true, force: true });
  await logActivity("deleted", `${project.name}: project and all generated files deleted`);
}

export async function ensurePreview(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new UserError("Project not found");
  if (project.buildStatus !== "succeeded") throw new UserError("The project must build successfully before a preview can start.");
  const gen = loadGeneration(projectId);
  const acc = gen?.previewAccount;
  await startPreview(projectId, acc ? { DEMO_USER_EMAIL: acc.identifier, DEMO_USER_PASSWORD: acc.password } : {});
}

export async function rotatePreviewToken(projectId: string) {
  await updateProject(projectId, { previewToken: newId(16) });
}

/** Public JSON shape of a project. Never includes the encrypted password or internal paths. */
export async function projectView(p: ProjectRow, headers: Headers, job?: JobRow | null) {
  const pv = await previewStatus(p.id);
  const zip = p.zip as { name: string; bytes: number; sha256: string; entries: number; createdAt: string; checks: unknown[]; warnings: string[]; external: string[] } | null;
  const canPreview = p.buildStatus === "succeeded";
  const pub = pv.running && canPreview ? publicPreviewUrl(headers, p.previewToken) : null;
  return {
    id: p.id, name: p.name, description: p.description, targetUrl: p.targetUrl, status: p.status, buildStatus: p.buildStatus,
    options: p.options as ProjectOptions, auth: { ...(p.auth as ProjectAuth), passwordStored: !!p.passwordEnc },
    providerId: p.providerId, routesDiscovered: p.routesDiscovered, pagesCloned: p.pagesCloned,
    error: p.error, mismatchPercent: p.mismatchPercent, verification: p.verification,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    preview: { available: canPreview, running: pv.running && canPreview, url: pub?.url ?? null, mode: pub?.mode ?? null, ...(pv.running ? { startedAt: pv.startedAt, expiresAt: pv.expiresAt } : {}) },
    zip: zip ? { name: zip.name, bytes: zip.bytes, sha256: zip.sha256, entries: zip.entries, createdAt: zip.createdAt, checks: zip.checks, warnings: zip.warnings, external: zip.external } : null,
    job: job ? jobView(job) : null,
  };
}

export function jobView(j: JobRow) {
  const steps = j.steps as StepState[];
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return {
    id: j.id, projectId: j.projectId, type: j.type, status: j.status, fromStage: j.fromStage, attempt: j.attempt, error: j.error,
    createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt, steps,
    // Derived from real step states only.
    progress: { completed: done, total: steps.length, current: steps.find((s) => s.status === "running")?.key ?? null },
  };
}

export { STAGES };
