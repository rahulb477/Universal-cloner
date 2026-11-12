import { desc } from "drizzle-orm";
import { db } from "@/db";
import { cloneProjects } from "@/db/schema";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const rows = await db.select().from(cloneProjects).orderBy(desc(cloneProjects.createdAt));
  const initial = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-semibold text-white">Project tracker</h1>
      <p className="mt-2 max-w-2xl text-slate-400">
        Keep track of the sites you are cloning with the skill. Phases mirror the skill&apos;s <code className="text-slate-200">state.mjs</code> model so a hand-off between agents is easy. This tracker stores no credentials.
      </p>
      <ProjectsClient initial={initial} />
    </div>
  );
}
