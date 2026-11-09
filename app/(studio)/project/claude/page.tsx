import type { Route } from "next";
import { redirect } from "next/navigation";

/** The KB tab's docs lived here while it was called Claude - old links and open tabs still work. */
export default async function OldKbDocPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  redirect((path ? `/project/kb?path=${encodeURIComponent(path)}` : "/project?tab=kb") as Route);
}
