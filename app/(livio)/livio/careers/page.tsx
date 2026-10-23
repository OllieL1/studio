import type { Metadata } from "next";
import { listCareers } from "@/app/careerActions";
import { listVersions } from "@/app/cvActions";
import { CareersBoard } from "@/components/livio/CareersBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Careers" };

export default async function CareersPage() {
  const [rows, versions] = await Promise.all([listCareers(), listVersions()]);
  return <CareersBoard initial={rows} cvs={versions.map((v) => ({ id: v.id, name: v.name }))} />;
}
