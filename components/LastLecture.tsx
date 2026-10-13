"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "studio:lastLecture";
const LECTURE = /^\/lectures\/([^/]+)\/?$/;

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * Alt+L jumps to the lecture note you opened last, from anywhere - including
 * from inside a text field, like ⌘K. The id is remembered per browser: it is
 * recorded whenever a lecture page is visited.
 */
export function LastLecture() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const id = LECTURE.exec(pathname)?.[1];
    if (!id) return;
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `code`, not `key`: Option+L types "¬" on a Mac.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyL") return;
      e.preventDefault();
      const id = read();
      if (id && !pathname.startsWith(`/lectures/${id}`)) router.push(`/lectures/${id}` as Route);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return null;
}
