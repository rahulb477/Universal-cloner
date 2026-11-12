import fs from "node:fs";
import path from "node:path";
import { api, fail, json } from "@/lib/studio/http";
import { jobLogFile, listJobs } from "@/lib/studio/jobs";
import { getProject, logsDir } from "@/lib/studio/store";

export const dynamic = "force-dynamic";

/** Incremental log reader: pass the byte offset returned by the previous call. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(req, async () => {
    const p = await getProject((await params).id);
    if (!p) return fail("Project not found", 404);
    const q = new URL(req.url).searchParams;
    const jobs = await listJobs(p.id, 50);
    let file: string;
    let jobId: string | null = null;
    if (q.get("kind") === "preview") file = path.join(logsDir(p.id), "preview.log");
    else {
      const job = jobs.find((j) => j.id === q.get("job")) ?? jobs[0];
      if (!job) return json({ text: "", offset: 0, jobId: null, jobs: [] });
      jobId = job.id;
      file = jobLogFile(p.id, job.id);
    }
    let text = "";
    let offset = Math.max(0, Number(q.get("offset")) || 0);
    if (fs.existsSync(/*turbopackIgnore: true*/ file)) {
      const size = fs.statSync(/*turbopackIgnore: true*/ file).size;
      if (offset > size) offset = 0;
      const start = offset === 0 && size > 400_000 ? size - 400_000 : offset;
      const fd = fs.openSync(/*turbopackIgnore: true*/ file, "r");
      const buf = Buffer.alloc(Math.min(size - start, 400_000));
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      text = buf.toString("utf8");
      offset = start + buf.length;
    }
    return json({ text, offset, jobId, jobs: jobs.map((j) => ({ id: j.id, type: j.type, status: j.status, createdAt: j.createdAt, fromStage: j.fromStage })) });
  });
}
