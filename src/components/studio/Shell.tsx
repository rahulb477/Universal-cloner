"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { call, Icon, useLive } from "./ui";

const NAV: { group: string; items: { href: string; label: string; icon: string }[] }[] = [
  { group: "Workspace", items: [
    { href: "/studio", label: "Overview", icon: "grid" },
    { href: "/studio/new", label: "New Clone Project", icon: "plus" },
    { href: "/studio/projects", label: "My Projects", icon: "folder" },
    { href: "/studio/previews", label: "Live Previews", icon: "eye" },
  ] },
  { group: "Intelligence", items: [
    { href: "/studio/providers", label: "AI Providers", icon: "spark" },
    { href: "/studio/api-config", label: "API Configuration", icon: "key" },
  ] },
  { group: "System", items: [
    { href: "/studio/history", label: "Clone History", icon: "clock" },
    { href: "/studio/settings", label: "Settings", icon: "gear" },
  ] },
];

function watchTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

type Overview = { stats: { active: number; previews: number; providersConnected: number; providers: number } };

export default function Shell({ children, passwordProtected }: { children: ReactNode; passwordProtected: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const theme = useSyncExternalStore(watchTheme, () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"), () => "dark");
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(false);
  }
  const { data } = useLive<Overview>("/api/overview", 8000);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("uwc-theme", next);
    } catch {
      /* storage blocked */
    }
  };
  const active = (href: string) => (href === "/studio" ? path === "/studio" : path === href || path.startsWith(href + "/"));
  const crumbs = NAV.flatMap((g) => g.items).filter((i) => active(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const s = data?.stats;

  return (
    <div className="studio relative flex min-h-screen">
      <a href="#studio-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accentink">Skip to content</a>
      {open ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} /> : null}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-raised transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/studio" className="flex items-center gap-2.5 border-b border-line px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-[13px] font-bold tracking-tight text-accentink">UC</span>
          <span className="leading-tight">
            <span className="block text-[13.5px] font-semibold text-ink">Website Cloner</span>
            <span className="mono block text-[10.5px] uppercase tracking-[0.14em] text-ink3">Studio</span>
          </span>
        </Link>
        <nav aria-label="Studio" className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="label px-2.5 pb-1.5">{g.group}</p>
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
                  className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors ${active(i.href) ? "bg-panel2 font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-ink2 hover:bg-panel hover:text-ink"}`}>
                  <Icon name={i.icon} className={active(i.href) ? "text-accent" : "text-ink3 group-hover:text-ink2"} />
                  <span className="flex-1">{i.label}</span>
                  {i.href === "/studio/previews" && s?.previews ? <span className="mono rounded bg-accentsoft px-1.5 text-[10.5px] text-accent">{s.previews}</span> : null}
                  {i.href === "/studio/providers" && s && s.providersConnected === 0 ? <span className="h-1.5 w-1.5 rounded-full bg-warn" title="No connected provider" /> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <Link href="/" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink3 hover:bg-panel hover:text-ink">
            <Icon name="globe" size={14} /> Product page
          </Link>
          <p className="px-2.5 pt-1 text-[11px] leading-relaxed text-ink3">Clone only websites you own or are authorised to reproduce.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-6">
          <div className="lg:hidden">
            <button className="btn btn-ghost btn-icon" aria-label="Open menu" onClick={() => setOpen(true)}>
              <Icon name="menu" size={18} />
            </button>
          </div>
          <div className="mono flex min-w-0 items-center gap-2 text-[12px] text-ink3">
            <span>studio</span>
            <span>/</span>
            <span className="truncate text-ink">{crumbs?.label.toLowerCase() ?? "workspace"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {s?.active ? (
              <Link href="/studio/history" className="badge" data-tone="run" title="Jobs in progress">
                <i />
                {s.active} job{s.active === 1 ? "" : "s"} running
              </Link>
            ) : null}
            <Link href="/studio/new" className="btn btn-primary btn-sm hidden sm:inline-flex">
              <Icon name="plus" size={14} /> New clone
            </Link>
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            {passwordProtected ? (
              <button className="btn btn-ghost btn-icon" aria-label="Sign out" title="Sign out" onClick={async () => {
                await call("/api/session", { method: "DELETE" });
                // A full reload on purpose: the session cookie has just changed.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login";
              }}>
                <Icon name="logout" />
              </button>
            ) : null}
          </div>
        </header>
        <main id="studio-main" className="relative flex-1">
          <div className="studio-grid pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
