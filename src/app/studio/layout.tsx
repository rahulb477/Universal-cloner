import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Shell from "@/components/studio/Shell";
import { isSignedIn, passwordRequired } from "@/lib/studio/http";

export const metadata: Metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: ReactNode }) {
  if (!(await isSignedIn())) redirect("/login?next=/studio");
  return <Shell passwordProtected={passwordRequired()}>{children}</Shell>;
}
