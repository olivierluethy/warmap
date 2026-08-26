"use client";

import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

interface Props {
  onResetView: () => void;
  onOpenSources: () => void;
}

// Vertical toolbar anchored under Leaflet's zoom control (top-left): reset the
// map view (issue #4 / #5.2), toggle fullscreen (#5.6), and open the news
// source overview (#5.12).
export default function MapControls({ onResetView, onOpenSources }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);

  useEffect(() => {
    setSupportsFullscreen(
      typeof document !== "undefined" &&
        !!document.documentElement.requestFullscreen,
    );
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        trackEvent("toggle_fullscreen", { next_state: "on" });
      } else {
        await document.exitFullscreen();
        trackEvent("toggle_fullscreen", { next_state: "off" });
      }
    } catch {
      // Fullscreen can be blocked by browser policy — ignore.
    }
  }, []);

  const btn =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/80 text-zinc-300 backdrop-blur-xl shadow-lg shadow-black/40 transition hover:bg-zinc-900/80 hover:text-zinc-50";

  return (
    <div className="pointer-events-auto absolute left-4 top-28 z-[600] flex flex-col gap-2">
      <button onClick={onResetView} aria-label="Reset view to all incidents" title="Reset view to all incidents" className={btn}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>

      {supportsFullscreen && (
        <button
          onClick={toggleFullscreen}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className={btn}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
      )}

      <button onClick={onOpenSources} aria-label="View news sources" title="View news sources" className={btn}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 22V4a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H4Z" />
          <path d="M8 7h7" />
          <path d="M8 11h7" />
          <path d="M8 15h4" />
        </svg>
      </button>
    </div>
  );
}
