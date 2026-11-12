import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Product" },
  { href: "/browse", label: "Agent skill" },
];

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#c6f04d] text-sm font-bold text-slate-950">UC</span>
            Universal Website Cloner
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c6f04d]">
                {n.label}
              </Link>
            ))}
            <Link href="/studio" className="ml-2 rounded-md bg-[#c6f04d] px-3.5 py-1.5 font-semibold text-slate-950 transition hover:bg-[#d4f570] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
              Open Studio
            </Link>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-20 border-t border-white/10 py-8 text-center text-sm text-slate-500">
        Use only on websites you are authorised to inspect and reproduce. Never bypasses MFA, CAPTCHA or paywalls.
      </footer>
    </div>
  );
}
