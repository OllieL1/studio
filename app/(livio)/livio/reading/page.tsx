import type { Metadata } from "next";
import { listReading } from "@/app/readingActions";
import { ReadingBoard } from "@/components/livio/ReadingBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reading" };

export default async function ReadingPage() {
  return <ReadingBoard initial={await listReading()} />;
}
