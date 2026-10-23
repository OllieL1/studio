import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { getMaster, getVersion, listVersions } from "@/app/cvActions";
import { CvEditor } from "@/components/livio/cv/CvEditor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CV" };

/** The master CV, or `?v=` one of its versions. */
export default async function CvPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const [master, versions, current] = await Promise.all([getMaster(), listVersions(), v ? getVersion(v) : null]);
  if (v && !current) redirect("/livio/cv" as Route);
  // Keyed by version, so switching starts the editor fresh rather than
  // carrying one version's unsaved state into the next.
  return <CvEditor key={v ?? "master"} initialMaster={master} versions={versions} current={current} />;
}
