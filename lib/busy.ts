/**
 * The logic behind the thin loading bar along the top of the screen: which
 * requests count, and when the bar should appear, move and go.
 *
 * The aim is feedback that a click did something, never noise. So:
 *
 * - Only what Next itself fires counts: a navigation or refresh (an `rsc`
 *   request) and a server action (`next-action`). Prefetches are excluded -
 *   links scrolling into view must not flash anything - and so is every
 *   other fetch, the polling widgets included.
 * - Only requests that follow a click, tap, Enter or shortcut count (see
 *   `Intent`), so notes autosaving while you type stay silent.
 * - Nothing shows until a request has run for `showAfter`, so quick actions
 *   never flash the bar at all.
 */

/* ── Which requests count ────────────────────────────────────────────────── */

function headerNames(source: HeadersInit | undefined): Set<string> {
  const names = new Set<string>();
  if (!source) return names;
  if (Array.isArray(source)) for (const [k] of source) names.add(k.toLowerCase());
  else if (typeof Headers !== "undefined" && source instanceof Headers) source.forEach((_, k) => names.add(k.toLowerCase()));
  else for (const k of Object.keys(source)) names.add(k.toLowerCase());
  return names;
}

/**
 * Is this fetch a navigation, refresh or server action - the things a click
 * waits on? Next marks them with headers: `next-action` on an action, `rsc`
 * on a page request, and `next-router-prefetch` (or the segment variant) on
 * a prefetch, which isn't anyone waiting on anything.
 */
export function isTrackedRequest(input: unknown, init?: { headers?: HeadersInit }): boolean {
  const names = headerNames(init?.headers);
  if (typeof Request !== "undefined" && input instanceof Request) {
    for (const n of headerNames(input.headers)) names.add(n);
  }
  if (names.has("next-router-prefetch") || names.has("next-router-segment-prefetch")) return false;
  return names.has("next-action") || names.has("rsc");
}

/* ── Which gestures count ────────────────────────────────────────────────── */

export type KeyTarget = { tag: string; role?: string | null; editable?: boolean };

const ACTIVATES_ON_SPACE = new Set(["button", "a", "summary"]);
const ACTIVATING_ROLES = new Set(["button", "switch", "checkbox", "menuitem", "option", "tab"]);

/**
 * Is this key press doing something, as opposed to typing? Letters never are.
 * Enter is, except where it just starts a new line; Space only on a control
 * it activates; and any shortcut chord is.
 */
export function isActionKey(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  target: KeyTarget,
): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const tag = target.tag.toLowerCase();
  if (e.key === "Enter") return !(tag === "textarea" || (target.editable && tag !== "input"));
  if (e.key === " ") return ACTIVATES_ON_SPACE.has(tag) || ACTIVATING_ROLES.has(target.role ?? "");
  return false;
}

/** How long after a gesture a request still counts as caused by it. */
export const INTENT_WINDOW_MS = 1000;

/** Remembers when the user last did something, to tell a request they
 *  caused from one a timer or a poll started. */
export class Intent {
  private at = -Infinity;
  constructor(private now: () => number = Date.now) {}
  note() {
    this.at = this.now();
  }
  recent() {
    return this.now() - this.at <= INTENT_WINDOW_MS;
  }
}

/* ── When the bar shows ──────────────────────────────────────────────────── */

export type BusyView = {
  visible: boolean;
  /** 0-1: how far along the bar is drawn. It's only ever an impression. */
  progress: number;
  /** Counts up on each appearance, so the view can start a fresh bar rather
   *  than animate the last one backwards. */
  run: number;
};

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };

export type BusyOptions = {
  onChange: (view: BusyView) => void;
  /** Wait this long before showing anything: most actions are faster. */
  showAfter?: number;
  /** After the last request ends, wait this long before finishing, so an
   *  action and the refresh it triggers read as one piece of work. */
  linger?: number;
  /** How long the finishing sweep and fade take before the bar is gone. */
  fadeFor?: number;
  /** Clear a bar that's been up this long, whatever the count says. */
  giveUpAfter?: number;
  /** Reduced motion: a still, full-width line instead of a creeping one. */
  reducedMotion?: () => boolean;
  timers?: Timers;
};

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createBusy(opts: BusyOptions) {
  const showAfter = opts.showAfter ?? 150;
  const linger = opts.linger ?? 150;
  const fadeFor = opts.fadeFor ?? 300;
  const giveUpAfter = opts.giveUpAfter ?? 60_000;
  const timers = opts.timers ?? realTimers;

  let pending = 0;
  let shown = false;
  let progress = 0;
  let run = 0;
  let showTimer: unknown = null;
  let trickleTimer: unknown = null;
  let finishTimer: unknown = null;
  let fadeTimer: unknown = null;
  let capTimer: unknown = null;

  const emit = (visible: boolean) => opts.onChange({ visible, progress, run });
  const stop = (id: unknown) => { if (id !== null) timers.clear(id); return null; };

  const trickle = () => {
    // Creeps towards 92% and never arrives: the bar finishes when the work does.
    progress += (0.92 - progress) * 0.1;
    emit(true);
    trickleTimer = timers.set(trickle, 200);
  };

  const show = () => {
    showTimer = null;
    if (pending === 0) return;
    shown = true;
    run += 1;
    const still = opts.reducedMotion?.() ?? false;
    progress = still ? 1 : 0.1;
    emit(true);
    if (!still) trickleTimer = timers.set(trickle, 200);
    capTimer = timers.set(giveUp, giveUpAfter);
  };

  const finish = () => {
    finishTimer = null;
    if (pending > 0) return;
    trickleTimer = stop(trickleTimer);
    capTimer = stop(capTimer);
    progress = 1;
    emit(false); // full width, fading out
    fadeTimer = timers.set(() => {
      fadeTimer = null;
      shown = false;
      progress = 0;
    }, fadeFor);
  };

  const giveUp = () => {
    capTimer = null;
    pending = 0;
    finish();
  };

  /**
   * A request has started. Returns the function to call when it ends; calling
   * it more than once does nothing, so the count can't drift out of step.
   */
  function begin(): () => void {
    pending += 1;
    finishTimer = stop(finishTimer);
    if (fadeTimer !== null) {
      // The last bar was still fading: start over rather than revive it. The
      // view keeps showing it fading; the next appearance is a fresh run.
      fadeTimer = stop(fadeTimer);
      shown = false;
      progress = 0;
    }
    if (!shown && showTimer === null) showTimer = timers.set(show, showAfter);

    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      pending = Math.max(0, pending - 1);
      if (pending > 0) return;
      showTimer = stop(showTimer); // finished before it ever showed: nothing to see
      if (shown) finishTimer = timers.set(finish, linger);
    };
  }

  return {
    begin,
    /** Is work under way, or only just done? A request that starts now is
     *  the next step of it, whether or not a click caused it. */
    engaged: () => pending > 0 || finishTimer !== null,
  };
}
