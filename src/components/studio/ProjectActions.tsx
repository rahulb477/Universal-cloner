"use client";

import Link from "next/link";
import { ActionButton, call, Icon, jobActive, type Project } from "./ui";

/** Every project action in one place. Each button calls the real API; disabled states mirror server rules. */
export function ProjectActions({ p, onChange, compact = false, onDeleted }: { p: Project; onChange: () => void; compact?: boolean; onDeleted?: () => void }) {
  const act = (action: string) => async () => {
    await call(`/api/projects/${p.id}/actions`, { body: { action } });
    onChange();
  };
  const running = jobActive(p.job);
  const canResume = !running && (p.status === "failed" || p.job?.status === "cancelled" || p.status === "discovery_complete" || p.status === "pending");
  const hasSource = p.pagesCloned > 0;
  const sm = "btn btn-sm";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/studio/projects/${p.id}`} className={`${sm} ${compact ? "" : "btn-primary"}`}><Icon name="code" size={13} /> Open</Link>
      {running ? (
        <ActionButton className={sm} onAct={act("cancel")} confirm="Cancel the running job?"><Icon name="stop" size={12} /> Cancel</ActionButton>
      ) : (
        <>
          {canResume ? <ActionButton className={sm} onAct={act(p.job ? "resume" : "start")} title="Continue from the last completed stage"><Icon name="play" size={12} /> {p.job ? "Resume" : "Start"}</ActionButton> : null}
          <ActionButton className={sm} onAct={act("rebuild")} disabled={!hasSource} title={hasSource ? "Install, build, test and serve the current source again" : "Nothing has been generated yet"}><Icon name="hammer" size={13} /> Rebuild</ActionButton>
        </>
      )}
      <Link href={`/studio/projects/${p.id}?tab=logs`} className={sm}><Icon name="list" size={13} /> Logs</Link>
      {p.preview.url ? (
        <a href={p.preview.url} target="_blank" rel="noopener noreferrer" className={sm}><Icon name="external" size={13} /> Preview</a>
      ) : p.preview.available && !running ? (
        <ActionButton className={sm} onAct={act("preview-start")} title="Start the preview server for this build"><Icon name="eye" size={13} /> Start preview</ActionButton>
      ) : (
        <button className={sm} disabled title="A preview exists only after a successful build"><Icon name="eye" size={13} /> Preview</button>
      )}
      {p.zip && p.buildStatus === "succeeded" ? (
        <a href={`/api/projects/${p.id}/download`} className={sm} download><Icon name="download" size={13} /> ZIP</a>
      ) : (
        <button className={sm} disabled title="The ZIP is produced after a successful build"><Icon name="download" size={13} /> ZIP</button>
      )}
      <ActionButton
        className={`${sm} btn-danger`} confirm={`Delete "${p.name}"? Its source, analysis, logs, preview and ZIP are removed permanently.`}
        onAct={async () => { await call(`/api/projects/${p.id}`, { method: "DELETE" }); (onDeleted ?? onChange)(); }}
      ><Icon name="trash" size={13} /> Delete</ActionButton>
    </div>
  );
}
