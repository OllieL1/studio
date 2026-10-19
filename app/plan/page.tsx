import { toISODate } from "@/lib/dates";
import { planRange, rangeLabel } from "@/lib/plan";
import { getPlan } from "@/lib/planData";
import { Eyebrow } from "@/components/ui";
import { PlanEditor } from "@/components/plan/PlanEditor";
import { RangeBar } from "@/components/plan/RangeBar";

export const dynamic = "force-dynamic";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ from?: string; days?: string }> }) {
  const range = planRange(await searchParams);
  const plan = await getPlan(range.from, range.days);
  const from = toISODate(range.from);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up relative z-30 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{range.preset === "this" ? "This week" : range.preset === "next" ? "Next week" : `${range.days} day${range.days === 1 ? "" : "s"}`} · weekly schedule</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
            {rangeLabel(range.from, range.days)}
          </h1>
        </div>
        <RangeBar from={from} days={range.days} preset={range.preset} />
      </div>

      <PlanEditor
        key={`${from}-${range.days}`}
        from={from}
        days={range.days}
        fixed={plan.fixed}
        blocks={plan.blocks}
        hidden={plan.hidden}
        removed={plan.removed}
        courses={plan.courses}
        googleConnected={plan.googleConnected}
        googleError={plan.googleError}
        calendar={plan.calendar}
        sleep={plan.sleep}
      />
    </div>
  );
}
