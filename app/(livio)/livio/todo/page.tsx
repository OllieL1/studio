import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listInbox, listTodoCourses, listTodos } from "@/app/todoActions";
import { TodoBoard } from "@/components/livio/TodoBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Todo" };

export default async function TodoPage() {
  const [todos, inbox, courses, notion] = await Promise.all([
    listTodos(),
    listInbox(),
    listTodoCourses(),
    db.notionAuth.findUnique({ where: { id: "singleton" }, select: { lastPulledAt: true } }),
  ]);
  return (
    <TodoBoard
      initialTodos={todos}
      initialInbox={inbox}
      courses={courses}
      notion={{ connected: !!notion, lastPulledAt: notion?.lastPulledAt ?? null }}
    />
  );
}
