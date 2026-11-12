"use client";

import { useState } from "react";
import { call, Icon } from "@/components/studio/ui";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="studio grid min-h-screen place-items-center px-4">
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await call("/api/session", { body: { password } });
            const next = new URLSearchParams(location.search).get("next");
            window.location.href = next && next.startsWith("/studio") ? next : "/studio";
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-bold text-accentink">UC</span>
          <div>
            <p className="font-semibold text-ink">Website Cloner Studio</p>
            <p className="text-xs text-ink3">This workspace is password protected.</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">Studio password</span>
          <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p> : null}
        <button className="btn btn-primary mt-4 w-full" disabled={busy}>
          {busy ? <span className="spin" /> : <Icon name="lock" size={14} />} Sign in
        </button>
      </form>
    </div>
  );
}
