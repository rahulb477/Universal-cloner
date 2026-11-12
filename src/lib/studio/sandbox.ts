import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Minimal environment for child processes: no platform secrets, database URLs or API keys are inherited. */
export function cleanEnv(cwd: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const home = path.join(cwd, ".sandbox-home");
  fs.mkdirSync(/*turbopackIgnore: true*/ home, { recursive: true });
  return {
    PATH: process.env.PATH, HOME: home, TMPDIR: home, LANG: "C.UTF-8", NODE_ENV: "production", CI: "1",
    npm_config_cache: path.join(home, ".npm"), npm_config_update_notifier: "false", npm_config_fund: "false", npm_config_audit: "false",
    NODE_NO_WARNINGS: "1",
    ...extra,
  } as NodeJS.ProcessEnv;
}

/**
 * Node flags that confine generated code: the permission model limits the file system to the project
 * directory (read) and its data/dist folders (write) and forbids child processes, workers and native add-ons.
 */
export function nodeSandboxArgs(cwd: string, memoryMb: number, writable: string[] = ["data", "dist"]): string[] {
  for (const w of writable) fs.mkdirSync(/*turbopackIgnore: true*/ path.join(cwd, w), { recursive: true });
  return [
    "--permission",
    `--allow-fs-read=${cwd}`,
    ...writable.map((w) => `--allow-fs-write=${path.join(cwd, w)}`),
    `--max-old-space-size=${memoryMb}`,
    "--disallow-code-generation-from-strings",
  ];
}

export type RunResult = { code: number | null; timedOut: boolean; output: string };

/** Run a command to completion with a wall-clock limit, a CPU-time ulimit and captured output. */
export function runLimited(o: {
  cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutSec: number;
  signal?: AbortSignal; onLine?: (line: string) => void;
}): Promise<RunResult> {
  return new Promise((resolve) => {
    // `ulimit -t` caps CPU seconds; exec replaces the shell so signals reach the real process.
    const child = spawn("/bin/sh", ["-c", `ulimit -t ${Math.ceil(o.timeoutSec * 2)} 2>/dev/null; exec "$0" "$@"`, o.cmd, ...o.args], {
      cwd: o.cwd, env: o.env, stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    let out = "";
    let buf = "";
    let timedOut = false;
    const onData = (d: Buffer) => {
      const s = d.toString();
      if (out.length < 200_000) out += s;
      buf += s;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) o.onLine?.(l);
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    const kill = () => killTree(child);
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, o.timeoutSec * 1000);
    o.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (e) => {
      out += `\n${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", kill);
      if (buf.trim()) o.onLine?.(buf);
      resolve({ code, timedOut, output: out });
    });
  });
}

export function killTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}
