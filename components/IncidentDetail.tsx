"use client";

import { useEffect, useMemo } from "react";
import type { WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import { EVENT_COLORS, EVENT_LABELS, eventColor, relativeTime } from "./event-style";

interface Props {
  event: WarEvent | null;
  allEvents: WarEvent[];
  onClose: () => void;
  onFocus: (id: string) => void;
}

const locKey = (e: WarEvent) =>
  `${e.location.lat.toFixed(3)}|${e.location.lng.toFixed(3)}`;

// Incident detail view (#5.37) with a location overview + location-specific
// news feed (#5.38/#5.39). Reads from the live event list so an evolving
// situation updates in place (#5.40).
export default function IncidentDetail({
  event,
  allEvents,
  onClose,
  onFocus,
}: Props) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  // Sibling incidents at the same location, newest first.
  const atLocation = useMemo(() => {
    if (!event) return [];
    const key = locKey(event);
    return allEvents
      .filter((e) => locKey(e) === key)
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }, [event, allEvents]);

  const sources = useMemo(
    () => new Set(atLocation.map((e) => e.source)),
    [atLocation],
  );

  // Coverage-gap signal (issue #24): a notable event corroborated by only a
  // single source is flagged so it can be investigated / verified further.
  const coverageGap = useMemo(
    () => event !== null && sources.size <= 1 && event.severity >= 4,
    [event, sources],
  );

  if (!event) return null;
  const color = eventColor(event);

  return (
    <div
      className="absolute inset-0 z-[820] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Incident detail"
    >
      <button
        aria-label="Close incident detail"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color }}
              >
                {EVENT_LABELS[event.eventType]}
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                Severity {event.severity}/10
              </span>
              {event.location.confidence !== "high" && (
                <span className="text-[10px] uppercase tracking-wider text-amber-400/80">
                  {event.location.confidence} confidence
                </span>
              )}
              {coverageGap && (
                <span
                  className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300"
                  title="Reported by a single source — corroborate before relying on it"
                >
                  Single-source
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug text-zinc-50">
              {event.title}
            </h2>
            <div className="mt-1 text-[12px] text-zinc-400">
              {event.location.name}
              {event.location.country ? `, ${event.location.country}` : ""} ·{" "}
              {new Date(event.publishedAt).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="warmap-scroll flex-1 overflow-y-auto px-5 py-4">
          {event.summary && (
            <p className="mb-4 text-sm leading-relaxed text-zinc-300">
              {event.summary}
            </p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {event.sourceUrl && (
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() =>
                  trackEvent("click_news_article", {
                    element_id: event.id,
                    source: event.source,
                    surface: "incident_detail",
                  })
                }
                className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/15"
              >
                Open source: {event.source} →
              </a>
            )}
            <button
              onClick={() => {
                onFocus(event.id);
                onClose();
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
            >
              Show on map
            </button>
          </div>

          {event.keywords.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {event.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400"
                >
                  {k}
                </span>
              ))}
            </div>
          )}

          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Location overview · {event.location.name}
            </h3>
            <span className="text-[11px] text-zinc-500">
              {atLocation.length} report{atLocation.length === 1 ? "" : "s"}
              {sources.size > 1 ? ` · ${sources.size} sources` : ""}
            </span>
          </div>

          {coverageGap && (
            <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
              Limited coverage — this event is currently backed by a single
              source. Treat as unconfirmed and look for corroborating reports.
            </div>
          )}

          <ul className="space-y-1">
            {atLocation.map((e) => {
              const isCurrent = e.id === event.id;
              return (
                <li key={e.id}>
                  <a
                    href={e.sourceUrl || "#"}
                    target={e.sourceUrl ? "_blank" : undefined}
                    rel="noreferrer noopener"
                    className={`block rounded-lg border px-3 py-2 transition ${
                      isCurrent
                        ? "border-white/20 bg-white/[0.06]"
                        : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                      <span style={{ color: EVENT_COLORS[e.eventType] }}>
                        {EVENT_LABELS[e.eventType]}
                      </span>
                      <span className="ml-auto normal-case tracking-normal">
                        {relativeTime(e.publishedAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[13px] leading-snug text-zinc-100">
                      {e.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">
                      {e.source}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
