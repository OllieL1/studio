"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarItem } from "@/lib/calendar";
import type { GoogleItemsResponse } from "@/app/api/calendar/google/route";

type Loaded = { key: string; items: CalendarItem[]; error: string | null };

/** Ranges already fetched this visit, so paging back shows Google's events at once while they refresh. */
const seen = new Map<string, Loaded>();

/**
 * Google's events for the visible range, fetched after the page is up.
 *
 * The calendar opens with what this app holds; Google's events are a round
 * trip per calendar, so they arrive afterwards from `/api/calendar/google`
 * and slot in. Whatever was already showing stays while a fresh copy loads,
 * and anything outside the new range is dropped - so paging from one week to
 * the next never blanks Google's events, and a month holding the week you
 * just left keeps that week's.
 *
 * `refetchOn` changes when what this app holds does (an event was saved or
 * synced, say), which is when Google's copy may have changed too. Pass
 * something stable - a string - not an array that is new on every render.
 */
export function useGoogleItems(connected: boolean, rangeStart: string, rangeEnd: string, refetchOn: unknown) {
  const key = `${rangeStart}|${rangeEnd}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!connected) return;
    const cached = seen.get(key);
    if (cached) setLoaded(cached);

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/calendar/google?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = (await res.json()) as GoogleItemsResponse;
        const next: Loaded = { key, items: data.items, error: data.error };
        // A failure shouldn't throw away events already on screen for this range.
        if (data.error && cached && data.items.length === 0) return;
        seen.set(key, next);
        setLoaded(next);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoaded((prev) => ({ key, items: prev?.items ?? [], error: "Couldn't reach Google Calendar." }));
      }
    })();
    return () => controller.abort();
  }, [connected, key, rangeStart, rangeEnd, refetchOn]);

  const items = useMemo(() => {
    if (!connected || !loaded) return [];
    const from = new Date(rangeStart).getTime();
    const to = new Date(rangeEnd).getTime();
    return loaded.items.filter((i) => new Date(i.end).getTime() > from && new Date(i.start).getTime() < to);
  }, [connected, loaded, rangeStart, rangeEnd]);

  return {
    items,
    /** Nothing for this range yet - what the "loading" note is for. */
    loading: connected && loaded?.key !== key,
    error: connected ? (loaded?.error ?? null) : null,
  };
}
