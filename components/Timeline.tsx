"use client";

import { useMemo } from "react";
import type { WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import {
  bucketize,
  TIME_WINDOWS,
  windowMs,
  type TimeWindow,
} from "@/lib/timeline";

interface Props {
  events: WarEvent[];
  window: TimeWindow;
  now: number;
  selectedBucket: number | null;
  onWindowChange: (w: TimeWindow) => void;
  onSelectBucket: (index: number | null) => void;
}

function bucketLabel(startMs: number, endMs: number, span: number): string {
  const d = new Date(startMs);
  // Sub-day spans: show clock time; longer spans: show date.
  if (span <= 24 * 60 * 60 * 1000) {
    return `${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${new Date(
      endMs,
    ).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Interactive timeline (issue #5.19–22): activity histogram over the selected
// window, with preset windows and click-to-filter buckets.
export default function Timeline({
  events,
  window,
  now,
  selectedBucket,
  onWindowChange,
  onSelectBucket,
}: Props) {
  const span = windowMs(window);
  const buckets = useMemo(
    () => (now > 0 ? bucketize(events, span, now, 32) : []),
    [events, span, now],
  );
  const max = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.count), 0),
    [buckets],
  );
  const total = useMemo(
    () => buckets.reduce((s, b) => s + b.count, 0),
    [buckets],
  );

  const onWindow = (w: TimeWindow) => {
    if (w === window) return;
    onSelectBucket(null);
    onWindowChange(w);
    trackEvent("select_time_window", { window: w });
  };

  const onBucket = (i: number) => {
    const next = selectedBucket === i ? null : i;
    onSelectBucket(next);
    trackEvent("timeline_bucket_click", {
      window,
      bucket: i,
      count: buckets[i]?.count ?? 0,
      cleared: next === null,
    });
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-[500] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2.5 backdrop-blur-xl shadow-xl shadow-black/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Activity
          {selectedBucket !== null && buckets[selectedBucket] && (
            <span className="ml-2 normal-case tracking-normal text-sky-300">
              {bucketLabel(
                buckets[selectedBucket].start,
                buckets[selectedBucket].end,
                span,
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => onWindow(w.id)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                window === w.id
                  ? "bg-white/15 text-zinc-50"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-10 items-end gap-[2px]" role="group" aria-label="Activity timeline">
        {buckets.map((b, i) => {
          const h = max > 0 ? Math.max(2, Math.round((b.count / max) * 40)) : 2;
          const active = selectedBucket === null || selectedBucket === i;
          const empty = b.count === 0;
          return (
            <button
              key={i}
              onClick={() => onBucket(i)}
              title={`${bucketLabel(b.start, b.end, span)} · ${b.count} event${b.count === 1 ? "" : "s"}`}
              aria-label={`${b.count} events`}
              className="group relative flex-1"
              style={{ height: 40 }}
            >
              <span
                className={`absolute bottom-0 left-0 right-0 rounded-sm transition-all ${
                  empty
                    ? "bg-white/5"
                    : active
                      ? "bg-sky-400/70 group-hover:bg-sky-300"
                      : "bg-sky-400/25"
                }`}
                style={{ height: h }}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{total.toLocaleString()} in view</span>
        <span>
          {window === "all"
            ? "full history"
            : `last ${TIME_WINDOWS.find((w) => w.id === window)?.label}`}
        </span>
      </div>
    </div>
  );
}
