"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Legend from "@/components/Legend";
import LoadingOverlay from "@/components/LoadingOverlay";
import MapControls from "@/components/MapControls";
import SourcesPanel from "@/components/SourcesPanel";
import type { WarMapApi } from "@/components/WarMap";
import { useEvents } from "@/components/useEvents";
import { trackEvent } from "@/lib/analytics";

const WarMap = dynamic(() => import("@/components/WarMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f14] text-zinc-500 text-sm">
      Loading map…
    </div>
  ),
});

export default function Home() {
  const { events, connection, lastUpdate, latestId, status } = useEvents();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const seenNotified = useRef<Set<string>>(new Set());
  const didBootstrap = useRef(false);
  const mapApiRef = useRef<WarMapApi | null>(null);

  // Feed starts open on desktop (room for map + feed) and closed on mobile
  // (map-first). Resolved after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFeedOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(null);
    requestAnimationFrame(() => setFocusedId(id));
  }, []);

  const handleToggleNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (notificationsOn) {
      setNotificationsOn(false);
      trackEvent("click_filter_option", {
        feature: "notifications",
        next_state: "off",
      });
      return;
    }
    if (Notification.permission === "granted") {
      setNotificationsOn(true);
      trackEvent("click_filter_option", {
        feature: "notifications",
        next_state: "on",
        permission: "granted",
      });
      return;
    }
    if (Notification.permission !== "denied") {
      const result = await Notification.requestPermission();
      if (result === "granted") setNotificationsOn(true);
      trackEvent("click_filter_option", {
        feature: "notifications",
        next_state: result === "granted" ? "on" : "off",
        permission: result,
      });
    }
  }, [notificationsOn]);

  const handleFeedToggle = useCallback(() => {
    setFeedOpen((v) => {
      const next = !v;
      trackEvent("toggle_feed", { next_state: next ? "open" : "closed" });
      return next;
    });
  }, []);

  const handleResetView = useCallback(() => {
    mapApiRef.current?.resetView();
    trackEvent("map_reset_view", { total_events: events.length });
  }, [events.length]);

  const handleOpenSources = useCallback(() => {
    setSourcesOpen(true);
    trackEvent("open_sources_panel");
  }, []);

  const handleMapReady = useCallback((api: WarMapApi) => {
    mapApiRef.current = api;
  }, []);

  useEffect(() => {
    if (events.length > 0 && !didBootstrap.current) {
      didBootstrap.current = true;
      for (const e of events) seenNotified.current.add(e.id);
    }
  }, [events]);

  useEffect(() => {
    if (!notificationsOn || !latestId) return;
    if (seenNotified.current.has(latestId)) return;
    const ev = events.find((e) => e.id === latestId);
    if (!ev) return;
    seenNotified.current.add(ev.id);
    if (ev.severity < 4) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(`${ev.location.name}: ${ev.title.slice(0, 80)}`, {
        body: `${ev.source} · ${new Date(ev.publishedAt).toLocaleString()}`,
        tag: ev.id,
      });
    } catch {
      // some contexts block notifications (e.g. http, iframes) — ignore
    }
  }, [latestId, events, notificationsOn]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WarMap
        events={events}
        focusedEventId={focusedId}
        highlightedId={latestId}
        onReady={handleMapReady}
      />

      <Header
        connection={connection}
        lastUpdate={lastUpdate}
        totalEvents={events.length}
        notificationsOn={notificationsOn}
        onToggleNotifications={handleToggleNotifications}
      />

      <LoadingOverlay
        connection={connection}
        status={status}
        eventCount={events.length}
      />

      <Legend />

      <MapControls
        onResetView={handleResetView}
        onOpenSources={handleOpenSources}
      />

      <button
        onClick={handleFeedToggle}
        aria-expanded={feedOpen}
        aria-label={feedOpen ? "Close event feed" : "Open event feed"}
        className="pointer-events-auto absolute right-4 top-20 z-[600] flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs font-medium text-zinc-200 backdrop-blur-xl shadow-xl shadow-black/40 hover:bg-zinc-900/80 transition"
      >
        {feedOpen ? "Hide" : "Feed"}
      </button>

      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />

      <div
        className={`absolute right-0 top-0 z-[550] h-full w-[360px] max-w-[92vw] transform transition-transform duration-300 ease-out ${
          feedOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar
          events={events}
          latestId={latestId}
          onFocus={(id) => {
            handleFocus(id);
            if (typeof window !== "undefined" &&
              !window.matchMedia("(min-width: 768px)").matches) {
              setFeedOpen(false);
            }
          }}
        />
      </div>
    </main>
  );
}
