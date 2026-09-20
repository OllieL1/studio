import { db } from "@/lib/db";
import { getProject } from "@/lib/projectData";
import { isTaskDone } from "@/lib/progress";
import { buildSchedulePdf } from "@/lib/pdf/schedule";
import { toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/** The project schedule: outline, the runway as a chart, then week by week. */
export async function GET() {
  const data = await getProject();
  if (!data) return new Response("No project course.", { status: 404 });

  const pdf = await buildSchedulePdf({
    course: {
      name: data.course.name,
      code: data.course.code,
      colour: data.course.colour,
      hoursTarget: data.course.hoursTarget,
    },
    pace: {
      loggedHours: data.pace.loggedHours,
      neededPerWeek: data.pace.neededPerWeek,
      recentPerWeek: data.pace.recentPerWeek,
      weeksLeft: data.pace.weeksLeft,
    },
    progress: {
      percent: data.progress.percent,
      tasksDone: data.progress.tasksDone,
      tasksTotal: data.progress.tasksTotal,
    },
    timeline: data.timeline,
    undated: data.tasks.filter((t) => !t.dueAt && !t.startsAt && !isTaskDone(t)).map((t) => t.title),
    generatedAt: new Date(),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="studio-project-schedule-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
