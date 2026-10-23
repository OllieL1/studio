import { db } from "@/lib/db";
const v = await db.cvVersion.findFirst({ where: { name: { startsWith: "Probe" } } });
const m = JSON.parse((await db.cvMaster.findUniqueOrThrow({ where: { id: "singleton" } })).doc);
const exp = m.sections.find((s: { title: string }) => s.title === "Experience");
console.log(JSON.stringify({ version: v?.name, id: v?.id, overrides: v && JSON.parse(v.overrides), masterFirstBullet: exp.items[0].bullets[0].t }, null, 1));
