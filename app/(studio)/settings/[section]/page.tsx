import { notFound } from "next/navigation";
import { isSettingsSlug } from "@/lib/settingsSections";
import { SettingsSectionView } from "../sections";

export const dynamic = "force-dynamic";

/** One section of Settings, picked in the sidebar. */
export default async function SettingsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ google?: string; spotify?: string }>;
}) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!isSettingsSlug(section)) notFound();
  return <SettingsSectionView slug={section} params={query} />;
}
