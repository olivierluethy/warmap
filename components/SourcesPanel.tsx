"use client";

import { useEffect, useMemo } from "react";
import { SOURCES, type Source } from "@/lib/sources";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<Source["category"], string> = {
  world: "World news",
  conflict: "Conflict & regional",
  defense: "Defense",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// News Source Overview (issue #5.12): a transparent list of every RSS feed the
// pipeline aggregates, so users can see where the data comes from.
export default function SourcesPanel({ open, onClose }: Props) {
  const grouped = useMemo(() => {
    const by: Record<Source["category"], Source[]> = {
      world: [],
      conflict: [],
      defense: [],
    };
    for (const s of SOURCES) by[s.category].push(s);
    return by;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[800] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="News sources"
    >
      <button
        aria-label="Close sources overview"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Data transparency
            </div>
            <div className="text-sm font-semibold text-zinc-50">
              News sources · {SOURCES.length} feeds
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="warmap-scroll flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-[12px] leading-relaxed text-zinc-400">
            Every incident on the map is aggregated automatically from the public
            RSS feeds below, then geolocated and classified. Feeds that fail to
            load are skipped without affecting the rest.
          </p>
          {(Object.keys(grouped) as Source["category"][]).map((cat) =>
            grouped[cat].length === 0 ? null : (
              <section key={cat} className="mb-5 last:mb-0">
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {CATEGORY_LABELS[cat]} · {grouped[cat].length}
                </h3>
                <ul className="space-y-1">
                  {grouped[cat].map((s) => (
                    <li key={s.id}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-zinc-200 transition hover:border-white/15 hover:bg-white/5"
                      >
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="shrink-0 text-[11px] text-zinc-500">
                          {hostOf(s.url)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
