"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Legend from "@/components/Legend";
import LoadingOverlay from "@/components/LoadingOverlay";
import MapControls from "@/components/MapControls";
import SourcesPanel from "@/components/SourcesPanel";
import SettingsPanel from "@/components/SettingsPanel";
import Timeline from "@/components/Timeline";
import type { WarMapApi } from "@/components/WarMap";
import { useEvents } from "@/components/useEvents";
import { trackEvent } from "@/lib/analytics";
import { announce, playAlertSound, primeAudio, stopAnnouncing } from "@/lib/alerts";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { bucketize, filterByWindow, windowMs, type TimeWindow } from "@/lib/timeline";

const WarMap = dynamic(() => import("@/components/WarMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f14] text-zinc-500 text-sm">
      Loading map…
    </div>
  ),
});

const REPORTER_MIN_SEVERITY = 6; // "breaking / critical" threshold for TTS

export default function Home() {
  const { events, connection, lastUpdate, latestId, status } = useEvents();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const seenNotified = useRef<Set<string>>(new Set());
  const didBootstrap = useRef(false);
  const mapApiRef = useRef<WarMapApi | null>(null);

  // Load persisted settings + resolve the current time (kept fresh for window
  // filtering) after mount to avoid an SSR/client mismatch.
  useEffect(() => {
    setSettings(loadSettings());
    setFeedOpen(window.matchMedia("(min-width: 768px)").matches);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    if (patch.sound) primeAudio();
    if ("sound" in patch) trackEvent("toggle_sound", { next_state: patch.sound ? "on" : "off" });
    if ("reporter" in patch) {
      trackEvent("toggle_reporter", { next_state: patch.reporter ? "on" : "off" });
      if (!patch.reporter) stopAnnouncing();
    }
  }, []);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(null);
    requestAnimationFrame(() => setFocusedId(id));
  }, []);

  // Browser-notification permission flow, mirrored into settings.
  const handleToggleNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setSettings((prev) => {
      // Turning off.
      if (prev.notifications) {
        const next = { ...prev, notifications: false };
        saveSettings(next);
        trackEvent("click_filter_option", { feature: "notifications", next_state: "off" });
        return next;
      }
      // Already granted → just enable.
      if (Notification.permission === "granted") {
        const next = { ...prev, notifications: true };
        saveSettings(next);
        trackEvent("click_filter_option", { feature: "notifications", next_state: "on", permission: "granted" });
        return next;
      }
      // Need to request — do it async, then flip on if granted.
      if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((result) => {
          trackEvent("click_filter_option", {
            feature: "notifications",
            next_state: result === "granted" ? "on" : "off",
            permission: result,
          });
          if (result === "granted") updateSettings({ notifications: true });
        });
      }
      return prev;
    });
  }, [updateSettings]);

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

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    trackEvent("open_settings");
  }, []);

  const handleMapReady = useCallback((api: WarMapApi) => {
    mapApiRef.current = api;
  }, []);

  // ── Time filtering ──────────────────────────────────────────────────────
  const windowEvents = useMemo(
    () => filterByWindow(events, timeWindow, now),
    [events, timeWindow, now],
  );

  // A selected timeline bucket narrows further to that period (issue #5.22).
  const bucketRange = useMemo<[number, number] | null>(() => {
    if (selectedBucket === null || now === 0) return null;
    const buckets = bucketize(events, windowMs(timeWindow), now, 32);
    const b = buckets[selectedBucket];
    return b ? [b.start, b.end] : null;
  }, [selectedBucket, events, timeWindow, now]);

  const visibleEvents = useMemo(() => {
    if (!bucketRange) return windowEvents;
    const [start, end] = bucketRange;
    return windowEvents.filter((e) => {
      const t = new Date(e.publishedAt).getTime();
      return t >= start && t <= end;
    });
  }, [windowEvents, bucketRange]);

  // Refit the map when a timeline bucket is selected so the two views stay
  // in sync (issue #5.22). Runs after the filtered set is on the map.
  useEffect(() => {
    if (selectedBucket === null) return;
    const id = requestAnimationFrame(() => mapApiRef.current?.resetView());
    return () => cancelAnimationFrame(id);
  }, [selectedBucket, bucketRange]);

  // ── Bootstrap: mark everything present on first load as already-seen so we
  // don't alert for the initial backlog. ─────────────────────────────────
  useEffect(() => {
    if (events.length > 0 && !didBootstrap.current) {
      didBootstrap.current = true;
      for (const e of events) seenNotified.current.add(e.id);
    }
  }, [events]);

  // ── New-incident alerts: notification + sound + spoken reporter. ────────
  useEffect(() => {
    if (!latestId || !didBootstrap.current) return;
    if (seenNotified.current.has(latestId)) return;
    const ev = events.find((e) => e.id === latestId);
    if (!ev) return;
    seenNotified.current.add(ev.id);

    // Event sound (issue #5.9).
    if (settings.sound && ev.severity >= settings.soundMinSeverity) {
      playAlertSound(ev.severity);
    }

    // Live reporter TTS for breaking/critical events (issue #5.10/#5.11).
    if (settings.reporter && ev.severity >= REPORTER_MIN_SEVERITY) {
      const where = ev.location.country
        ? `${ev.location.name}, ${ev.location.country}`
        : ev.location.name;
      announce(`Breaking. ${ev.title}. Reported in ${where}.`);
    }

    // Browser notification (existing behaviour).
    if (settings.notifications && ev.severity >= 4) {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(`${ev.location.name}: ${ev.title.slice(0, 80)}`, {
            body: `${ev.source} · ${new Date(ev.publishedAt).toLocaleString()}`,
            tag: ev.id,
          });
        } catch {
          // some contexts block notifications (e.g. http, iframes) — ignore
        }
      }
    }
  }, [latestId, events, settings]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <WarMap
        events={visibleEvents}
        focusedEventId={focusedId}
        highlightedId={latestId}
        onReady={handleMapReady}
      />

      <Header
        connection={connection}
        lastUpdate={lastUpdate}
        totalEvents={events.length}
        onOpenSettings={handleOpenSettings}
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

      <Timeline
        events={windowEvents}
        window={timeWindow}
        now={now}
        selectedBucket={selectedBucket}
        onWindowChange={setTimeWindow}
        onSelectBucket={setSelectedBucket}
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

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={updateSettings}
        onToggleNotifications={handleToggleNotifications}
      />

      <div
        className={`absolute right-0 top-0 z-[550] h-full w-[360px] max-w-[92vw] transform transition-transform duration-300 ease-out ${
          feedOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar
          events={visibleEvents}
          latestId={latestId}
          onFocus={(id) => {
            handleFocus(id);
            if (
              typeof window !== "undefined" &&
              !window.matchMedia("(min-width: 768px)").matches
            ) {
              setFeedOpen(false);
            }
          }}
        />
      </div>
    </main>
  );
}
