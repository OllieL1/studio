import type { Route } from "next";
import { redirect } from "next/navigation";
import { SettingsSectionView } from "./sections";

export const dynamic = "force-dynamic";

/** Settings opens on Appearance; every other section is /settings/<slug>. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; spotify?: string }>;
}) {
  const { google, spotify } = await searchParams;
  // An OAuth round trip that started before Settings had sections still comes
  // back here - pass its result on to the section it was for.
  if (google) redirect(`/settings/google?google=${encodeURIComponent(google)}` as Route);
  if (spotify) redirect(`/settings/spotify?spotify=${encodeURIComponent(spotify)}` as Route);
  return <SettingsSectionView slug="appearance" params={{}} />;
}
