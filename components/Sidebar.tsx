"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventType, WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import { debounce } from "@/lib/throttle";
import { EVENT_COLORS, EVENT_LABELS, eventColor, relativeTime } from "./event-style";

interface Props {
  events: WarEvent[];
  latestId: string | null;
  onOpenDetail: (event: WarEvent) => void;
}

const FILTER_TYPES: Array<EventType | "all"> = [
  "all",
  "airstrike",
  "missile",
  "drone",
  "shelling",
  "ground",
  "naval",
  "fire",
  "casualties",
  "diplomacy",
  "humanitarian",
];

export default function Sidebar({ events, latestId, onOpenDetail }: Props) {
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [query, setQuery] = useState("");

  // One-shot session marker so we know whether this user ever engaged with
  // any sidebar filter (search OR pill). Useful as a denominator for the
  // "users who filter" funnel.
  const filterUsedFired = useRef(false);
  const markFilterUsedOnce = () => {
    if (filterUsedFired.current) return;
    filterUsedFired.current = true;
    trackEvent("filter_used_session", { surface: "sidebar" });
  };

  // Filter pill handler: classifies the transition so analytics can split
  // first-time activations (filter_applied), clears (filter_removed), and
  // swaps (filter_changed).
  const onSelectFilter = (next: EventType | "all") => {
    if (next === filter) return;
    const prev = filter;
    setFilter(next);
    markFilterUsedOnce();
    if (next === "all") {
      trackEvent("filter_removed", {
        surface: "sidebar",
        from: prev,
        to: next,
      });
    } else if (prev === "all") {
      trackEvent("filter_applied", {
        surface: "sidebar",
        filter: next,
      });
    } else {
      trackEvent("filter_changed", {
        surface: "sidebar",
        from: prev,
        to: next,
      });
    }
    trackEvent("click_filter_option", {
      surface: "sidebar",
      filter: next,
    });
  };

  // Debounce search-input tracking — fire once 500ms after the user stops
  // typing, with the query length only (avoid sending raw queries to GA).
  const trackSearchDebounced = useRef(
    debounce((q: string) => {
      if (q.length === 0) {
        trackEvent("filter_removed", { surface: "sidebar_search" });
      } else {
        markFilterUsedOnce();
        trackEvent("filter_changed", {
          surface: "sidebar_search",
          query_length: q.length,
        });
      }
    }, 500),
  ).current;

  useEffect(() => {
    trackSearchDebounced(query);
  }, [query, trackSearchDebounced]);

  const onItemClick = (e: WarEvent) => {
    trackEvent("click_news_article", {
      element_id: e.id,
      source: e.source,
      event_type: e.eventType,
      location_name: e.location.name,
      country: e.location.country,
      severity: e.severity,
      surface: "sidebar",
    });
    trackEvent("click_sidepanel_item", {
      element_id: e.id,
      surface: "sidebar_event_list",
    });
    onOpenDetail(e);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== "all" && e.eventType !== filter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.location.name.toLowerCase().includes(q) ||
        e.location.country.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q)
      );
    });
  }, [events, filter, query]);

  const countsByType = useMemo(() => {
    const counts: Partial<Record<EventType, number>> = {};
    for (const e of events) counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    return counts;
  }, [events]);

  return (
    <aside className="flex h-full w-full flex-col bg-zinc-950/85 backdrop-blur-xl border-l border-white/5">
      <div className="p-4 border-b border-white/5 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Incidents
          </div>
          <div className="text-2xl font-semibold text-zinc-50 tabular-nums">
            {events.length.toLocaleString()}
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, location, source…"
          className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/25 focus:bg-white/10 transition"
        />
        <div className="flex flex-wrap gap-1.5 warmap-scroll">
          {FILTER_TYPES.map((t) => {
            const active = filter === t;
            const color =
              t === "all" ? "#e5e7eb" : EVENT_COLORS[t as EventType];
            const label = t === "all" ? "All" : EVENT_LABELS[t as EventType];
            const count =
              t === "all" ? events.length : countsByType[t as EventType] ?? 0;
            return (
              <button
                key={t}
                onClick={() => onSelectFilter(t)}
                className={`group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition border ${
                  active
                    ? "bg-white/10 border-white/20 text-zinc-50"
                    : "bg-transparent border-white/5 text-zinc-400 hover:text-zinc-100 hover:border-white/10"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {label}
                <span className="tabular-nums text-zinc-500 group-hover:text-zinc-300">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto warmap-scroll">
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm p-8 text-center">
            {events.length === 0
              ? "Listening for incoming events…"
              : "No events match the current filter."}
          </div>
        ) : (
          <ul>
            {filtered.map((e) => {
              const isLatest = e.id === latestId;
              return (
                <li
                  key={e.id}
                  className={`group border-b border-white/5 ${isLatest ? "warmap-new" : ""}`}
                >
                  <button
                    onClick={() => onItemClick(e)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: eventColor(e),
                          boxShadow: `0 0 10px ${eventColor(e)}`,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-1">
                          <span style={{ color: eventColor(e) }}>
                            {EVENT_LABELS[e.eventType]}
                          </span>
                          <span>·</span>
                          <span className="truncate">
                            {e.location.name}
                            {e.location.country ? `, ${e.location.country}` : ""}
                          </span>
                          {e.location.confidence !== "high" && (
                            <span className="text-amber-400/70 uppercase tracking-wider">
                              · {e.location.confidence}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-zinc-100 leading-snug line-clamp-2 group-hover:text-white">
                          {e.title}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                          <span className="truncate">{e.source}</span>
                          <span className="shrink-0 tabular-nums">
                            {relativeTime(e.publishedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
