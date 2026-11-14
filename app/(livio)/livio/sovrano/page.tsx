import type { Metadata } from "next";
import { listSovrano } from "@/app/sovranoActions";
import { SovranoBoard } from "@/components/livio/SovranoBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sovrano" };

export default async function SovranoPage() {
  const { sessions, projects } = await listSovrano();
  return <SovranoBoard initialSessions={sessions} initialProjects={projects} />;
}
