"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      aria-live="polite"
    >
      {state === "copied" ? "Copied ✓" : state === "error" ? "Copy failed — select manually" : label}
    </button>
  );
}
