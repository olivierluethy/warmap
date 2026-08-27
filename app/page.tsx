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
import IncidentDetail from "@/components/IncidentDetail";
import ReportExport from "@/components/ReportExport";
import type { WarMapApi } from "@/components/WarMap";
import type { WarEvent } from "@/lib/types";
import { useEvents } from "@/components/useEvents";
import { trackEvent } from "@/lib/analytics";
import { announce, playAlertSound, primeAudio, stopAnnouncing } from "@/lib/alerts";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import {
  bucketize,
  bucketizeRange,
  filterByRange,
  filterByWindow,
  windowMs,
  type TimeWindow,
} from "@/lib/timeline";

const WarMap = dynamic(() => import("@/components/WarMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f14] text-zinc-500 text-sm">
      Loading map…
    </div>
  ),
});

const REPORTER_MIN_SEVERITY = 6; // "breaking / critical" threshold for TTS

// Base wall-clock time to sweep the whole selected window once during playback,
// before the speed multiplier (issues #16–19). 22s at 1× feels deliberate
// without dragging on a 30-day window.
const BASE_PLAYBACK_MS = 22_000;
const PLAYBACK_STEPS = 32; // matches the timeline bucket count for step nudges

export default function Home() {
  const { events, connection, lastUpdate, latestId, status } = useEvents();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [customRange, setCustomRange] = useState<[number, number] | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Historical playback: a normalized playhead (0–1) across the current window.
  // `null` means live mode (no playback). (issues #16–19, #30–33)
  const [playFrac, setPlayFrac] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
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

  const handleOpenDetail = useCallback((e: WarEvent) => {
    setDetailId(e.id);
    trackEvent("open_incident_detail", { element_id: e.id, event_type: e.eventType });
  }, []);

  const handleOpenReport = useCallback(() => {
    setReportOpen(true);
    trackEvent("open_report");
  }, []);

  // ── Time filtering ──────────────────────────────────────────────────────
  const windowEvents = useMemo(() => {
    if (timeWindow === "custom") {
      return customRange
        ? filterByRange(events, customRange[0], customRange[1])
        : events;
    }
    return filterByWindow(events, timeWindow, now);
  }, [events, timeWindow, customRange, now]);

  // A selected timeline bucket narrows further to that period (issue #5.22).
  const bucketRange = useMemo<[number, number] | null>(() => {
    if (selectedBucket === null || now === 0) return null;
    const buckets =
      timeWindow === "custom"
        ? customRange
          ? bucketizeRange(events, customRange[0], customRange[1], 32)
          : []
        : bucketize(events, windowMs(timeWindow), now, 32);
    const b = buckets[selectedBucket];
    return b ? [b.start, b.end] : null;
  }, [selectedBucket, events, timeWindow, customRange, now]);

  // ── Historical playback ───────────────────────────────────────────────────
  // The [start, end] span the playhead sweeps: the custom range, the preset
  // window relative to now, or (for "all") the full observed history.
  const playbackRange = useMemo<[number, number]>(() => {
    const end = now || Date.now();
    if (timeWindow === "custom" && customRange) return customRange;
    if (timeWindow === "all") {
      let start = end - 24 * 60 * 60 * 1000;
      for (const e of events) {
        const t = new Date(e.publishedAt).getTime();
        if (Number.isFinite(t) && t < start) start = t;
      }
      return [start, end];
    }
    return [end - windowMs(timeWindow), end];
  }, [timeWindow, customRange, now, events]);

  const playheadMs =
    playFrac === null
      ? null
      : playbackRange[0] + playFrac * (playbackRange[1] - playbackRange[0]);

  // While scrubbing/playing, a manual bucket selection is ignored so the two
  // filters never fight (issue #19).
  const effectiveBucketRange = playFrac === null ? bucketRange : null;

  const visibleEvents = useMemo(() => {
    let out = windowEvents;
    if (!settings.showLowConfidence) {
      out = out.filter((e) => e.location.confidence !== "low");
    }
    if (effectiveBucketRange) {
      const [start, end] = effectiveBucketRange;
      out = out.filter((e) => {
        const t = new Date(e.publishedAt).getTime();
        return t >= start && t <= end;
      });
    }
    // Playback reconstructs the situation up to the playhead: only events that
    // had been published by that moment are shown (issues #16, #17, #31).
    if (playheadMs !== null) {
      out = out.filter(
        (e) => new Date(e.publishedAt).getTime() <= playheadMs,
      );
    }
    return out;
  }, [windowEvents, effectiveBucketRange, playheadMs, settings.showLowConfidence]);

  // The most recent event that has "arrived" at the playhead — highlighted so
  // its animation reads as the freshest development while playing (issue #17).
  const playbackFrontierId = useMemo(() => {
    if (playheadMs === null) return null;
    let best: string | null = null;
    let bestT = -Infinity;
    for (const e of windowEvents) {
      const t = new Date(e.publishedAt).getTime();
      if (t <= playheadMs && t > bestT) {
        bestT = t;
        best = e.id;
      }
    }
    return best;
  }, [windowEvents, playheadMs]);

  const detailEvent = useMemo(
    () => (detailId ? events.find((e) => e.id === detailId) ?? null : null),
    [detailId, events],
  );

  // Refit the map when a timeline bucket is selected so the two views stay
  // in sync (issue #5.22). Runs after the filtered set is on the map.
  useEffect(() => {
    if (selectedBucket === null) return;
    const id = requestAnimationFrame(() => mapApiRef.current?.resetView());
    return () => cancelAnimationFrame(id);
  }, [selectedBucket, bucketRange]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const playActive = playing && playFrac !== null;

  // Advance the playhead while playing; stop at the end (issue #16). Position
  // updates are throttled to ~15fps: at 60fps we'd re-filter the whole event
  // set and re-diff every marker four times as often for no visible benefit.
  useEffect(() => {
    if (!playActive) return;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    const step = (t: number) => {
      if (last !== null) {
        acc += t - last;
        if (acc >= 66) {
          const advanced = acc;
          acc = 0;
          const sweep = BASE_PLAYBACK_MS / playSpeed;
          setPlayFrac((f) => {
            if (f === null) return f;
            const nf = f + advanced / sweep;
            if (nf >= 1) {
              setPlaying(false);
              return 1;
            }
            return nf;
          });
        }
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playActive, playSpeed]);

  const handleTogglePlay = useCallback(() => {
    setSelectedBucket(null);
    if (playing) {
      setPlaying(false);
    } else {
      // Starting from live mode or after reaching the end restarts at 0.
      setPlayFrac((f) => (f === null || f >= 1 ? 0 : f));
      setPlaying(true);
    }
    trackEvent("timeline_playback_toggle", { window: timeWindow, action: playing ? "pause" : "play" });
  }, [playing, timeWindow]);

  const handleScrub = useCallback((frac: number) => {
    setSelectedBucket(null);
    setPlayFrac(Math.max(0, Math.min(1, frac)));
  }, []);

  const handleStepPlayback = useCallback((dir: -1 | 1) => {
    setSelectedBucket(null);
    setPlaying(false);
    setPlayFrac((f) => {
      const base = f === null ? (dir === 1 ? 0 : 1) : f;
      return Math.max(0, Math.min(1, base + dir / PLAYBACK_STEPS));
    });
    trackEvent("timeline_playback_step", { dir });
  }, []);

  const handleExitPlayback = useCallback(() => {
    setPlaying(false);
    setPlayFrac(null);
    trackEvent("timeline_playback_exit");
  }, []);

  const handleSelectBucket = useCallback((index: number | null) => {
    // Selecting a bucket exits playback so the two filters don't conflict.
    setPlayFrac(null);
    setPlaying(false);
    setSelectedBucket(index);
  }, []);

  const handleSpeedChange = useCallback((s: number) => {
    setPlaySpeed(s);
    trackEvent("timeline_playback_speed", { speed: s });
  }, []);

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
        highlightedId={playFrac === null ? latestId : playbackFrontierId}
        showVectors={settings.showVectors}
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
        onExport={handleOpenReport}
      />

      <Timeline
        events={windowEvents}
        window={timeWindow}
        now={now}
        selectedBucket={selectedBucket}
        customRange={customRange}
        onWindowChange={setTimeWindow}
        onSelectBucket={handleSelectBucket}
        onSetCustomRange={setCustomRange}
        playFrac={playFrac}
        playing={playing}
        playSpeed={playSpeed}
        playheadMs={playheadMs}
        onTogglePlay={handleTogglePlay}
        onScrub={handleScrub}
        onStepPlayback={handleStepPlayback}
        onExitPlayback={handleExitPlayback}
        onSpeedChange={handleSpeedChange}
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

      <IncidentDetail
        event={detailEvent}
        allEvents={events}
        onClose={() => setDetailId(null)}
        onFocus={handleFocus}
      />

      <ReportExport
        open={reportOpen}
        events={visibleEvents}
        window={timeWindow}
        onClose={() => setReportOpen(false)}
      />

      <div
        className={`absolute right-0 top-0 z-[550] h-full w-[360px] max-w-[92vw] transform transition-transform duration-300 ease-out ${
          feedOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar
          events={visibleEvents}
          latestId={latestId}
          onOpenDetail={handleOpenDetail}
        />
      </div>
    </main>
  );
}
