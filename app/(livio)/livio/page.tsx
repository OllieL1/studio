import { Eyebrow } from "@/components/ui";
import { fmtDateLong, greeting } from "@/lib/dates";

export const dynamic = "force-dynamic";

/** Livio's home. A greeting for now; the dashboard arrives once the pages it
 *  summarises (careers, todo, reading) exist. */
export default function LivioHome() {
  const now = new Date();
  return (
    <section className="animate-fade-up">
      <Eyebrow>{fmtDateLong(now)}</Eyebrow>
      <h1 className="font-display mt-1 text-[38px] leading-[44px] font-semibold tracking-tight text-n-900">
        {greeting(now)}, Ollie.
      </h1>
    </section>
  );
}
