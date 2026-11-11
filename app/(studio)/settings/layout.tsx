import { Eyebrow } from "@/components/ui";
import { SettingsNav } from "@/components/settings/SettingsNav";

/** Settings: the section tree on the left, the open section on the right. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
          Settings
        </h1>
      </div>

      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <aside className="md:sticky md:top-20 md:self-start">
          <SettingsNav />
        </aside>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
