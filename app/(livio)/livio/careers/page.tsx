import type { Metadata } from "next";
import { listCareers } from "@/app/careerActions";
import { CareersBoard } from "@/components/livio/CareersBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Careers" };

export default async function CareersPage() {
  return <CareersBoard initial={await listCareers()} />;
}
