import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, type JobRow } from "@/db/schema";
import { newId } from "./crypto";
import { getProject, getSettings, logActivity, logsDir, updateProject } from "./store";

/** The thirteen user-visible steps. Each belongs to a resumable stage. */
export const STEPS = [
  { key: "validate", label: "Validating target URL", stage: "discovery" },
  { key: "browser", label: "Launching browser", stage: "discovery" },
  { key: "routes", label: "Discovering routes", stage: "discovery" },
  { key: "screenshots", label: "Capturing screenshots", stage: "discovery" },
  { key: "design", label: "Analyzing website design", stage: "discovery" },
  { key: "functionality", label: "Mapping functionality", stage: "discovery" },
  { key: "plan", label: "Planning architecture", stage: "plan" },
  { key: "generate", label: "Generating source code", stage: "generate" },
  { key: "install", label: "Installing dependencies", stage: "build" },
  { key: "build", label: "Building project", stage: "build" },
  { key: "test", label: "Running tests", stage: "build" },
  { key: "preview", label: "Starting preview server", stage: "build" },
  { key: "zip", label: "Preparing ZIP export", stage: "build" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];
export type Stage = "discovery" | "plan" | "generate" | "build";
export const STAGES: Stage[] = ["discovery", "plan", "generate", "build"];

export type StepState = {
  key: StepKey; label: string; stage: Stage;
  status: "pending" | "running" | "done" | "failed" | "skipped" | "cancelled";
  detail?: string; startedAt?: string; finishedAt?: string;
};

export class CancelledError extends Error {
  constructor() {
    super("Cancelled by user");
  }
}
/** An error the user can act on; never retried automatically. */
export class UserError extends Error {}

export type JobContext = {
  job: JobRow;
  signal: AbortSignal;
  log: (message: string, level?: "info" | "warn" | "error") => void;
  step: <T>(key: StepKey, fn: (setDetail: (d: string) => void) => Promise<T>) => Promise<T>;
  skip: (key: StepKey, why: string) => Promise<void>;
  check: () => void;
};

type Runner = (ctx: JobContext) => Promise<void>;
type Q = { running: Map<string, AbortController>; runner: Runner | null; booted: boolean; ticking: boolean };
const g = globalThis as typeof globalThis & { __uwcQueue?: Q };
const q: Q = (g.__uwcQueue ??= { running: new Map(), runner: null, booted: false, ticking: false });

export function registerRunner(r: Runner) {
  q.runner = r;
}

export const jobLogFile = (projectId: string, jobId: string) => path.join(logsDir(projectId), `${jobId}.log`);

function initialSteps(fromStage: Stage): StepState[] {
  const from = STAGES.indexOf(fromStage);
  return STEPS.map((s) => ({
    ...s,
    status: STAGES.indexOf(s.stage) < from ? "skipped" : "pending",
    ...(STAGES.indexOf(s.stage) < from ? { detail: "Reused from the previous run" } : {}),
  }));
}

export async function activeJob(projectId: string): Promise<JobRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(jobs).where(and(eq(jobs.projectId, projectId), inArray(jobs.status, ["queued", "running"]))).limit(1);
  return row ?? null;
}

export async function enqueue(projectId: string, type: "clone" | "rebuild", fromStage: Stage, attempt = 1): Promise<JobRow> {
  if (await activeJob(projectId)) throw new UserError("A job is already running for this project.");
  const db = await getDb();
  const id = newId(10);
  await db.insert(jobs).values({ id, projectId, type, fromStage, steps: initialSteps(fromStage), attempt });
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  void tick();
  return row;
}

export async function requestCancel(jobId: string) {
  const db = await getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!row || !["queued", "running"].includes(row.status)) return false;
  await db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, jobId));
  const ac = q.running.get(jobId);
  if (ac) ac.abort();
  else {
    await db.update(jobs).set({ status: "cancelled", finishedAt: new Date(), error: "Cancelled before it started" }).where(eq(jobs.id, jobId));
    await updateProject(row.projectId, { status: "failed", error: "Cancelled by user" });
  }
  return true;
}

async function saveSteps(jobId: string, steps: StepState[]) {
  const db = await getDb();
  await db.update(jobs).set({ steps }).where(eq(jobs.id, jobId));
}

async function run(job: JobRow) {
  const db = await getDb();
  const ac = new AbortController();
  q.running.set(job.id, ac);
  const steps = job.steps as StepState[];
  const file = jobLogFile(job.projectId, job.id);
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const log: JobContext["log"] = (message, level = "info") => {
    fs.appendFileSync(/*turbopackIgnore: true*/ file, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message.replace(/\s+$/, "")}\n`);
  };
  const check = () => {
    if (ac.signal.aborted) throw new CancelledError();
  };
  const ctx: JobContext = {
    job, signal: ac.signal, log, check,
    async step(key, fn) {
      check();
      const s = steps.find((x) => x.key === key)!;
      s.status = "running";
      s.startedAt = new Date().toISOString();
      delete s.detail;
      await saveSteps(job.id, steps);
      log(`▶ ${s.label}`);
      let lastSave = 0;
      const setDetail = (d: string) => {
        s.detail = d;
        if (Date.now() - lastSave > 700) {
          lastSave = Date.now();
          void saveSteps(job.id, steps);
        }
      };
      try {
        const out = await fn(setDetail);
        check();
        s.status = "done";
        s.finishedAt = new Date().toISOString();
        await saveSteps(job.id, steps);
        log(`✔ ${s.label}${s.detail ? ` — ${s.detail}` : ""}`);
        return out;
      } catch (e) {
        s.status = e instanceof CancelledError || ac.signal.aborted ? "cancelled" : "failed";
        s.finishedAt = new Date().toISOString();
        if (s.status === "failed") s.detail = (e as Error).message.slice(0, 500);
        await saveSteps(job.id, steps);
        throw ac.signal.aborted ? new CancelledError() : e;
      }
    },
    async skip(key, why) {
      const s = steps.find((x) => x.key === key)!;
      s.status = "skipped";
      s.detail = why;
      await saveSteps(job.id, steps);
      log(`↷ ${s.label} skipped — ${why}`);
    },
  };
  await db.update(jobs).set({ status: "running", startedAt: new Date() }).where(eq(jobs.id, job.id));
  log(`Job ${job.id} started (type=${job.type}, from stage=${job.fromStage}, attempt ${job.attempt})`);
  try {
    if (!q.runner) throw new Error("Job runner is not registered");
    await q.runner(ctx);
    await db.update(jobs).set({ status: "succeeded", finishedAt: new Date() }).where(eq(jobs.id, job.id));
    log("Job finished successfully");
  } catch (e) {
    const cancelled = e instanceof CancelledError || ac.signal.aborted;
    const message = cancelled ? "Cancelled by user" : (e as Error).message || String(e);
    log(cancelled ? "Job cancelled" : `Job failed: ${message}`, cancelled ? "warn" : "error");
    if (!cancelled && !(e instanceof UserError) && (e as Error).stack) log((e as Error).stack!.split("\n").slice(1, 5).join("\n"), "error");
    await db.update(jobs).set({ status: cancelled ? "cancelled" : "failed", error: message.slice(0, 1000), finishedAt: new Date() }).where(eq(jobs.id, job.id));
    await updateProject(job.projectId, { status: "failed", error: message.slice(0, 1000) });
    const p = await getProject(job.projectId);
    await logActivity(cancelled ? "cancelled" : "failed", `${p?.name ?? "Project"}: ${message.slice(0, 160)}`, job.projectId);
    // Automatic retry for unexpected failures only, resuming from the failed stage.
    const { jobRetries } = await getSettings();
    if (!cancelled && !(e instanceof UserError) && job.attempt <= jobRetries) {
      const failed = steps.find((s) => s.status === "failed");
      const stage = (failed?.stage ?? job.fromStage) as Stage;
      log(`Retrying automatically from stage "${stage}" (attempt ${job.attempt + 1})`, "warn");
      q.running.delete(job.id);
      await enqueue(job.projectId, job.type as "clone" | "rebuild", stage, job.attempt + 1).catch(() => {});
    } else {
      // No retry will follow: do not keep the reference site's test password around.
      await updateProject(job.projectId, { passwordEnc: null }).catch(() => {});
    }
  } finally {
    q.running.delete(job.id);
    void tick();
  }
}

/** Start queued jobs, one at a time (browser automation and builds are heavy). */
export async function tick() {
  if (q.ticking) return;
  q.ticking = true;
  try {
    await boot();
    if (q.running.size >= 1) return;
    const db = await getDb();
    const [next] = await db.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.createdAt).limit(1);
    if (next) void run(next);
  } finally {
    q.ticking = false;
  }
}

/** After a server restart, jobs that were mid-flight are marked interrupted and re-queued from their stage. */
async function boot() {
  if (q.booted) return;
  q.booted = true;
  const db = await getDb();
  const stuck = await db.select().from(jobs).where(eq(jobs.status, "running"));
  for (const j of stuck) {
    const steps = j.steps as StepState[];
    const cur = steps.find((s) => s.status === "running");
    if (cur) {
      cur.status = "failed";
      cur.detail = "Interrupted by a server restart";
    }
    await db.update(jobs).set({ status: "failed", steps, error: "Interrupted by a server restart", finishedAt: new Date() }).where(eq(jobs.id, j.id));
    try {
      fs.appendFileSync(/*turbopackIgnore: true*/ jobLogFile(j.projectId, j.id), `${new Date().toISOString()} WARN  Interrupted by a server restart; re-queued\n`);
    } catch {
      /* log dir may be gone */
    }
    if (await getProject(j.projectId)) {
      const id = newId(10);
      const stage = (cur?.stage ?? j.fromStage) as Stage;
      await db.insert(jobs).values({ id, projectId: j.projectId, type: j.type, fromStage: stage, steps: initialSteps(stage), attempt: j.attempt + 1 });
    }
  }
}

export async function listJobs(projectId?: string, limit = 100) {
  const db = await getDb();
  const base = db.select().from(jobs);
  return (projectId ? base.where(eq(jobs.projectId, projectId)) : base).orderBy(desc(jobs.createdAt)).limit(limit);
}
