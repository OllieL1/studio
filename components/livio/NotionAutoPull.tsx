"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pullInbox } from "@/app/todoActions";

/**
 * Opening Livio pulls anything new from Notion, in the background. The server
 * skips it if the last pull was under five minutes ago, so moving between
 * pages costs nothing. Only redraws when something actually changed.
 */
export function NotionAutoPull() {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    void pullInbox(false).then((res) => {
      if (live && res.ok && (res.added || res.removed)) router.refresh();
    });
    return () => {
      live = false;
    };
  }, [router]);
  return null;
}
