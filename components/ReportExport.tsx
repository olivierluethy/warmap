"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventType, WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import { EVENT_LABELS } from "./event-style";
import type { TimeWindow } from "@/lib/timeline";
import { TIME_WINDOWS } from "@/lib/timeline";

interface Props {
  open: boolean;
  events: WarEvent[];
  window: TimeWindow;
  onClose: () => void;
}

interface LocGroup {
  name: string;
  country: string;
  lat: number;
  lng: number;
  events: WarEvent[];
}

const locKey = (e: WarEvent) =>
  `${e.location.lat.toFixed(3)}|${e.location.lng.toFixed(3)}`;

// Comprehensive incident report (issue #5.43–45): a printable, self-contained
// document of the incidents currently in view — details, timeline, locations,
// summaries, and source references. "Print / Save as PDF" uses the browser's
// print dialog, so no PDF dependency is required.
export default function ReportExport({ open, events, window: win, onClose }: Props) {
  const [generatedAt, setGeneratedAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setGeneratedAt(new Date().toLocaleString());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      ),
    [events],
  );

  const byType = useMemo(() => {
    const m = new Map<EventType, number>();
    for (const e of events) m.set(e.eventType, (m.get(e.eventType) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const groups = useMemo(() => {
    const by = new Map<string, LocGroup>();
    for (const e of events) {
      const key = locKey(e);
      const g = by.get(key);
      if (g) g.events.push(e);
      else
        by.set(key, {
          name: e.location.name,
          country: e.location.country,
          lat: e.location.lat,
          lng: e.location.lng,
          events: [e],
        });
    }
    const arr = [...by.values()];
    for (const g of arr)
      g.events.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
    return arr.sort((a, b) => b.events.length - a.events.length);
  }, [events]);

  const span = useMemo(() => {
    if (sorted.length === 0) return null;
    const times = sorted.map((e) => new Date(e.publishedAt).getTime());
    return {
      from: new Date(Math.min(...times)),
      to: new Date(Math.max(...times)),
    };
  }, [sorted]);

  const sourceCount = useMemo(
    () => new Set(events.map((e) => e.source)).size,
    [events],
  );

  if (!open) return null;

  const windowLabel =
    win === "all" ? "Full history" : `Last ${TIME_WINDOWS.find((w) => w.id === win)?.label}`;

  const doPrint = () => {
    trackEvent("print_report", { events: events.length });
    window.print();
  };

  return (
    <div
      className="absolute inset-0 z-[830] flex items-center justify-center p-4 print:static print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Export report"
    >
      <button
        aria-label="Close report"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm print:hidden"
      />

      <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:w-full print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-5 py-3 print:hidden">
          <span className="text-sm font-semibold text-zinc-800">
            Incident report preview
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={doPrint}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700"
            >
              Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Close
            </button>
          </div>
        </div>

        <div
          id="warmap-report"
          className="warmap-scroll flex-1 overflow-y-auto bg-white px-8 py-7 text-zinc-900 print:overflow-visible"
        >
          <header className="mb-5 border-b border-zinc-300 pb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-600">
              Warmap · Conflict Intelligence Report
            </div>
            <h1 className="mt-1 text-xl font-bold">Incident Summary</h1>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] text-zinc-600 sm:grid-cols-4">
              <div>
                <div className="font-semibold text-zinc-900">{events.length}</div>
                <div>Incidents</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-900">{groups.length}</div>
                <div>Locations</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-900">{sourceCount}</div>
                <div>Sources</div>
              </div>
              <div>
                <div className="font-semibold text-zinc-900">{windowLabel}</div>
                <div>Window</div>
              </div>
            </div>
            {span && (
              <div className="mt-2 text-[12px] text-zinc-600">
                Coverage: {span.from.toLocaleString()} — {span.to.toLocaleString()}
              </div>
            )}
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Generated {generatedAt}
            </div>
          </header>

          <section className="mb-5">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Breakdown by type
            </h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              {byType.map(([t, n]) => (
                <span key={t}>
                  <span className="font-semibold">{n}</span>{" "}
                  <span className="text-zinc-600">{EVENT_LABELS[t]}</span>
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Incidents by location
            </h2>
            {groups.length === 0 ? (
              <p className="text-[13px] text-zinc-500">
                No incidents in the current view.
              </p>
            ) : (
              <div className="space-y-4">
                {groups.map((g, i) => (
                  <div key={i} className="break-inside-avoid">
                    <div className="flex items-baseline justify-between border-b border-zinc-200 pb-1">
                      <h3 className="text-[14px] font-semibold">
                        {g.name}
                        {g.country ? `, ${g.country}` : ""}
                      </h3>
                      <span className="text-[11px] text-zinc-400">
                        {g.lat.toFixed(3)}, {g.lng.toFixed(3)} · {g.events.length}{" "}
                        report{g.events.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-2">
                      {g.events.map((e) => (
                        <li key={e.id} className="text-[13px] leading-snug">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium text-zinc-500">
                              [{EVENT_LABELS[e.eventType]}]
                            </span>
                            <span className="font-medium">{e.title}</span>
                          </div>
                          {e.summary && (
                            <div className="text-zinc-600">
                              {e.summary.slice(0, 240)}
                              {e.summary.length > 240 ? "…" : ""}
                            </div>
                          )}
                          <div className="text-[11px] text-zinc-500">
                            {e.source} · {new Date(e.publishedAt).toLocaleString()}
                            {e.sourceUrl ? ` · ${e.sourceUrl}` : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
