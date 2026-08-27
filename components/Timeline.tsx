"use client";

import { useMemo, useState } from "react";
import type { WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import {
  bucketize,
  bucketizeRange,
  TIME_WINDOWS,
  windowMs,
  type TimeWindow,
} from "@/lib/timeline";

interface Props {
  events: WarEvent[];
  window: TimeWindow;
  now: number;
  selectedBucket: number | null;
  customRange: [number, number] | null;
  onWindowChange: (w: TimeWindow) => void;
  onSelectBucket: (index: number | null) => void;
  onSetCustomRange: (range: [number, number] | null) => void;
  // ── Historical playback (issues #16–19, #30–33) ──
  playFrac: number | null;
  playing: boolean;
  playSpeed: number;
  playheadMs: number | null;
  onTogglePlay: () => void;
  onScrub: (frac: number) => void;
  onStepPlayback: (dir: -1 | 1) => void;
  onExitPlayback: () => void;
  onSpeedChange: (s: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4];

// Format an epoch-ms value for a <input type="datetime-local"> (local time).
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// Timestamp shown next to the playhead while scrubbing/playing.
function playheadLabel(ms: number, span: number): string {
  const d = new Date(ms);
  if (span <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Interactive timeline (issue #5.19–22): activity histogram over the selected
// window, with preset windows, click-to-filter buckets, and historical
// playback — play / pause / scrub / step through the sequence of events
// (issues #16–19, #30–33).
export default function Timeline({
  events,
  window,
  now,
  selectedBucket,
  customRange,
  onWindowChange,
  onSelectBucket,
  onSetCustomRange,
  playFrac,
  playing,
  playSpeed,
  playheadMs,
  onTogglePlay,
  onScrub,
  onStepPlayback,
  onExitPlayback,
  onSpeedChange,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [fromStr, setFromStr] = useState("");
  const [toStr, setToStr] = useState("");

  const span =
    window === "custom" && customRange
      ? customRange[1] - customRange[0]
      : windowMs(window);

  const buckets = useMemo(() => {
    if (now === 0) return [];
    if (window === "custom") {
      return customRange
        ? bucketizeRange(events, customRange[0], customRange[1], 32)
        : [];
    }
    return bucketize(events, windowMs(window), now, 32);
  }, [events, window, customRange, now]);
  const max = useMemo(
    () => buckets.reduce((m, b) => Math.max(m, b.count), 0),
    [buckets],
  );
  const total = useMemo(
    () => buckets.reduce((s, b) => s + b.count, 0),
    [buckets],
  );

  const playbackOn = playFrac !== null;

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
          {playbackOn ? "Playback" : "Activity"}
          {playbackOn && playheadMs !== null ? (
            <span className="ml-2 normal-case tracking-normal text-sky-300">
              {playheadLabel(playheadMs, span)}
            </span>
          ) : (
            selectedBucket !== null &&
            buckets[selectedBucket] && (
              <span className="ml-2 normal-case tracking-normal text-sky-300">
                {bucketLabel(
                  buckets[selectedBucket].start,
                  buckets[selectedBucket].end,
                  span,
                )}
              </span>
            )
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
          <button
            onClick={() => {
              setCustomOpen((v) => !v);
              if (customRange) {
                setFromStr(toLocalInput(customRange[0]));
                setToStr(toLocalInput(customRange[1]));
              }
            }}
            aria-expanded={customOpen}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
              window === "custom"
                ? "bg-white/15 text-zinc-50"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {customOpen && (
        <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/30 p-2">
          <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
            From
            <input
              type="datetime-local"
              value={fromStr}
              onChange={(e) => setFromStr(e.target.value)}
              className="rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-100 [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-zinc-400">
            To
            <input
              type="datetime-local"
              value={toStr}
              onChange={(e) => setToStr(e.target.value)}
              className="rounded bg-white/5 px-2 py-1 text-[11px] text-zinc-100 [color-scheme:dark]"
            />
          </label>
          <button
            onClick={() => {
              const from = new Date(fromStr).getTime();
              const to = new Date(toStr).getTime();
              if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return;
              onSelectBucket(null);
              onSetCustomRange([from, to]);
              onWindowChange("custom");
              setCustomOpen(false);
              trackEvent("set_custom_range", { span_ms: to - from });
            }}
            className="rounded-md bg-sky-500/80 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-sky-400"
          >
            Apply
          </button>
        </div>
      )}

      <div className="relative flex h-10 items-end gap-[2px]" role="group" aria-label="Activity timeline">
        {buckets.map((b, i) => {
          const h = max > 0 ? Math.max(2, Math.round((b.count / max) * 40)) : 2;
          const selectActive = selectedBucket === null || selectedBucket === i;
          // While playing, dim buckets that lie ahead of the playhead so the
          // histogram stays visually synced with the map (issue #19).
          const ahead = playheadMs !== null && b.start > playheadMs;
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
                    : selectActive
                      ? "bg-sky-400/70 group-hover:bg-sky-300"
                      : "bg-sky-400/25"
                } ${ahead ? "opacity-25" : ""}`}
                style={{ height: h }}
              />
            </button>
          );
        })}

        {/* Playhead marker (issue #19) */}
        {playbackOn && playFrac !== null && (
          <span
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-sky-300 shadow-[0_0_6px_#7dd3fc]"
            style={{ left: `${(playFrac * 100).toFixed(2)}%` }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-300" />
          </span>
        )}
      </div>

      {/* ── Playback controls (issues #16–19, #30–33) ── */}
      <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
        <button
          onClick={() => onStepPlayback(-1)}
          aria-label="Step backward"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
          </svg>
        </button>
        <button
          onClick={onTogglePlay}
          aria-label={playing ? "Pause playback" : "Play history"}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/80 text-white transition hover:bg-sky-400"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M7 5v14l12-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={() => onStepPlayback(1)}
          aria-label="Step forward"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
          </svg>
        </button>

        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round((playFrac ?? 0) * 1000)}
          onChange={(e) => onScrub(Number(e.target.value) / 1000)}
          aria-label="Playback position"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400"
        />

        <div className="flex items-center gap-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition ${
                playSpeed === s
                  ? "bg-white/15 text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <button
          onClick={onExitPlayback}
          disabled={!playbackOn}
          aria-label="Return to live"
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
            playbackOn
              ? "text-rose-300 hover:bg-rose-500/15"
              : "text-emerald-400/80"
          }`}
        >
          {playbackOn ? "Live ↩" : "● Live"}
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{total.toLocaleString()} in view</span>
        <span>
          {window === "all"
            ? "full history"
            : window === "custom"
              ? "custom range"
              : `last ${TIME_WINDOWS.find((w) => w.id === window)?.label}`}
        </span>
      </div>
    </div>
  );
}
