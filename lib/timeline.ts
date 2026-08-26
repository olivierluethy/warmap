import type { WarEvent } from "./types";

// Predefined analysis windows (issue #5.17). "all" disables time filtering;
// "custom" uses a user-supplied from/to range (issue #5.18).
export type TimeWindow = "2h" | "6h" | "24h" | "30d" | "all" | "custom";

export const TIME_WINDOWS: Array<{ id: TimeWindow; label: string; ms: number }> = [
  { id: "2h", label: "2h", ms: 2 * 60 * 60 * 1000 },
  { id: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All", ms: Infinity },
];

export function windowMs(w: TimeWindow): number {
  return TIME_WINDOWS.find((x) => x.id === w)?.ms ?? Infinity;
}

function ts(e: WarEvent): number {
  const t = new Date(e.publishedAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Events whose publishedAt falls within `window` of `now`. */
export function filterByWindow(
  events: WarEvent[],
  window: TimeWindow,
  now: number,
): WarEvent[] {
  const ms = windowMs(window);
  if (!Number.isFinite(ms)) return events;
  const cutoff = now - ms;
  return events.filter((e) => ts(e) >= cutoff);
}

export interface TimelineBucket {
  start: number;
  end: number;
  count: number;
}

/**
 * Split [now - span, now] into `count` equal buckets and tally events per
 * bucket. Empty buckets are preserved (count 0) so the timeline can render
 * inactive periods distinctly (issue #5.21).
 */
export function bucketize(
  events: WarEvent[],
  span: number,
  now: number,
  count = 32,
): TimelineBucket[] {
  const effectiveSpan = Number.isFinite(span)
    ? span
    : Math.max(
        60 * 60 * 1000,
        now - Math.min(...events.map(ts).filter((t) => t > 0), now),
      );
  const start = now - effectiveSpan;
  const width = effectiveSpan / count;
  const buckets: TimelineBucket[] = Array.from({ length: count }, (_, i) => ({
    start: start + i * width,
    end: start + (i + 1) * width,
    count: 0,
  }));
  for (const e of events) {
    const t = ts(e);
    if (t < start || t > now) continue;
    let idx = Math.floor((t - start) / width);
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    buckets[idx].count++;
  }
  return buckets;
}

/** Bucketize over an explicit [from, to] range (issue #5.18 custom range). */
export function bucketizeRange(
  events: WarEvent[],
  from: number,
  to: number,
  count = 32,
): TimelineBucket[] {
  const span = Math.max(1, to - from);
  const width = span / count;
  const buckets: TimelineBucket[] = Array.from({ length: count }, (_, i) => ({
    start: from + i * width,
    end: from + (i + 1) * width,
    count: 0,
  }));
  for (const e of events) {
    const t = ts(e);
    if (t < from || t > to) continue;
    let idx = Math.floor((t - from) / width);
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    buckets[idx].count++;
  }
  return buckets;
}

/** Filter events to an explicit [from, to] range. */
export function filterByRange(
  events: WarEvent[],
  from: number,
  to: number,
): WarEvent[] {
  return events.filter((e) => {
    const t = ts(e);
    return t >= from && t <= to;
  });
}
