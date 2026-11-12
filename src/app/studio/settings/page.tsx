"use client";

import { SettingsForm, type FieldDef } from "@/components/studio/SettingsForm";
import { ActionButton, call, fmtBytes, Icon, Notice, PageHead, Section, Skeleton, useLive } from "@/components/studio/ui";

type S = {
  settings: Record<string, number | boolean>; defaults: Record<string, number | boolean>;
  system: { database: string; secretSource: string; passwordProtected: boolean; gateway: { listening: boolean; port: number | null; error: string | null }; runningPreviews: number; dataBytes: number; node: string; privateTargetsAllowed: string[]; localAiAllowed: boolean };
};
const CRAWL: FieldDef[] = [
  { key: "maxPages", label: "Default page limit", hint: "1–60 pages per project.", min: 1, max: 60 },
  { key: "maxDepth", label: "Link depth", hint: "1–6 clicks from the start page.", min: 1, max: 6 },
  { key: "navTimeoutMs", label: "Navigation timeout (ms)", hint: "5000–60000.", min: 5000, max: 60000, step: 500 },
  { key: "respectRobots", label: "Respect robots.txt", hint: "Skip routes the site disallows for crawlers.", type: "bool" },
];
const BUILD: FieldDef[] = [
  { key: "buildTimeoutSec", label: "Build step timeout (seconds)", hint: "20–600, per install/build/test command.", min: 20, max: 600 },
  { key: "memoryMb", label: "Memory per process (MB)", hint: "128–2048 for build and preview processes.", min: 128, max: 2048 },
  { key: "jobRetries", label: "Automatic retries", hint: "0–3 for unexpected failures.", min: 0, max: 3 },
];
const PREVIEW: FieldDef[] = [
  { key: "previewIdleMinutes", label: "Stop idle previews after (minutes)", hint: "1–1440.", min: 1, max: 1440 },
  { key: "maxPreviews", label: "Maximum running previews", hint: "1–12. The oldest idle one is stopped first.", min: 1, max: 12 },
];

export default function SettingsPage() {
  const { data, error, reload } = useLive<S>("/api/settings", 15000);
  const sys = data?.system;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <PageHead eyebrow="Settings" title="Studio settings" sub="Limits are enforced on the server; values outside the allowed range are clamped." />
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      {!data ? <Section><Skeleton rows={6} /></Section> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Discovery" className="lg:self-start"><SettingsForm fields={CRAWL} values={data.settings} defaults={data.defaults} onSaved={reload} /></Section>
          <div className="space-y-5">
            <Section title="Build & jobs"><SettingsForm fields={BUILD} values={data.settings} defaults={data.defaults} onSaved={reload} /></Section>
            <Section title="Live previews"><SettingsForm fields={PREVIEW} values={data.settings} defaults={data.defaults} onSaved={reload} /></Section>
          </div>
          <Section title="System" hint="Read from the running server." className="lg:col-span-2">
            <dl className="grid gap-x-8 gap-y-3 p-5 text-[13px] sm:grid-cols-2">
              {([
                ["Database", sys!.database],
                ["Secret key source", sys!.secretSource],
                ["Studio access", sys!.passwordProtected ? "Password required (STUDIO_PASSWORD)" : "Open: no STUDIO_PASSWORD set"],
                ["Preview gateway", sys!.gateway.listening ? `Listening on port ${sys!.gateway.port}` : `Not listening (${sys!.gateway.error ?? "starts with the first preview"}); previews use the same-origin fallback`],
                ["Running previews", String(sys!.runningPreviews)],
                ["Project data on disk", fmtBytes(sys!.dataBytes)],
                ["Node.js", sys!.node],
                ["Private targets allow-list", sys!.privateTargetsAllowed.length ? sys!.privateTargetsAllowed.join(", ") : "none (private addresses blocked)"],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line pb-2"><dt className="flex-none text-ink3">{k}</dt><dd className="mono text-right text-[12px] text-ink">{v}</dd></div>
              ))}
            </dl>
            {!sys!.passwordProtected ? <div className="px-5 pb-5"><Notice tone="warn" title="The studio is not password protected">Anyone who can reach this address can use it. Set <span className="mono">STUDIO_PASSWORD</span> before exposing it to a network.</Notice></div> : null}
          </Section>
          <Section title="Maintenance" className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="max-w-xl text-[13px] text-ink2">Stop every running preview process. Builds and ZIPs are kept; previews can be started again from each project.</p>
              <ActionButton className="btn btn-danger" disabled={!sys!.runningPreviews} confirm="Stop all running previews?" onAct={async () => { await call("/api/settings", { body: { action: "stop-previews" } }); await reload(); }}><Icon name="stop" size={13} /> Stop all previews ({sys!.runningPreviews})</ActionButton>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
