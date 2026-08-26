"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Map as LeafletMap,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
} from "leaflet";
import type { EventType, Mover, WarEvent } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import {
  EVENT_LABELS,
  eventColor,
  glyphKindFor,
  glyphSvg,
  relativeTime,
  severityToSize,
} from "./event-style";

// Coarse coordinate buckets keep GA cardinality bounded — exact lat/lng would
// register as a unique value per pan, blowing past GA's per-parameter limits.
const bucketCoord = (n: number) => Math.round(n * 10) / 10;

interface LocationGroup {
  key: string;
  lat: number;
  lng: number;
  locationName: string;
  country: string;
  events: WarEvent[];
}

function groupByLocation(events: WarEvent[]): LocationGroup[] {
  const by = new Map<string, LocationGroup>();
  for (const e of events) {
    const key = `${e.location.lat.toFixed(3)}|${e.location.lng.toFixed(3)}`;
    const existing = by.get(key);
    if (existing) {
      existing.events.push(e);
    } else {
      by.set(key, {
        key,
        lat: e.location.lat,
        lng: e.location.lng,
        locationName: e.location.name,
        country: e.location.country,
        events: [e],
      });
    }
  }
  for (const g of by.values()) {
    g.events.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }
  return Array.from(by.values());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moverClassName(m: Mover): string {
  switch (m) {
    case "missile": return "warmap-vector-missile";
    case "drone": return "warmap-vector-drone";
    case "aircraft": return "warmap-vector-aircraft";
    case "ship": return "warmap-vector-ship";
    case "troops": return "warmap-vector-troops";
    default: return "warmap-vector-other";
  }
}

function vectorStrokeColor(m: Mover): string {
  switch (m) {
    case "missile": return "#f97316";
    case "drone": return "#eab308";
    case "aircraft": return "#ef4444";
    case "ship": return "#38bdf8";
    case "troops": return "#dc2626";
    default: return "#94a3b8";
  }
}

// Emits the type-specific SVG/CSS layer that sits behind the normal pulse dot.
function animationLayer(type: EventType): string {
  switch (type) {
    case "airstrike":
    case "missile":
      // Streak + explosion burst (issue #5.33).
      return `
        <svg class="warmap-anim warmap-anim-streak" viewBox="0 0 120 120" aria-hidden="true">
          <line x1="100" y1="20" x2="60" y2="60" />
        </svg>
        <span class="warmap-anim warmap-anim-burst"></span>`;
    case "fire":
      // Flickering fire glow (issue #5.34).
      return `<span class="warmap-anim warmap-anim-fire"></span>`;
    case "drone":
      return `
        <svg class="warmap-anim warmap-anim-orbit" viewBox="0 0 42 42" aria-hidden="true">
          <circle cx="38" cy="21" r="2" />
        </svg>`;
    case "naval":
      return `
        <span class="warmap-anim warmap-anim-wave"></span>
        <span class="warmap-anim warmap-anim-wave delay-1"></span>
        <span class="warmap-anim warmap-anim-wave delay-2"></span>`;
    case "shelling":
      return `<span class="warmap-anim warmap-anim-burst"></span>`;
    case "ground":
      return `
        <svg class="warmap-anim warmap-anim-chevron" viewBox="0 0 36 36" aria-hidden="true">
          <path d="M18 4 L30 18 L24 18 L24 32 L12 32 L12 18 L6 18 Z" />
        </svg>`;
    default:
      return "";
  }
}

function renderEventRow(e: WarEvent): string {
  const color = eventColor(e);
  return `
    <div style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="width:8px;height:8px;border-radius:999px;background:${color};box-shadow:0 0 6px ${color};flex-shrink:0;"></span>
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:${color};font-weight:600;">
          ${escapeHtml(EVENT_LABELS[e.eventType])}
        </span>
        <span style="font-size:11px;color:#94a3b8;margin-left:auto;flex-shrink:0;">${escapeHtml(relativeTime(e.publishedAt))}</span>
      </div>
      <div style="font-size:13px;font-weight:600;line-height:1.35;color:#f9fafb;margin-bottom:4px;">
        ${escapeHtml(e.title)}
      </div>
      ${e.summary ? `<div style="font-size:12px;line-height:1.45;color:#cbd5e1;margin-bottom:6px;">${escapeHtml(e.summary.slice(0, 180))}${e.summary.length > 180 ? "…" : ""}</div>` : ""}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#94a3b8;">
        <span><strong style="color:#e2e8f0;">Source:</strong> ${escapeHtml(e.source)}</span>
        ${e.sourceUrl ? `<a href="${escapeHtml(e.sourceUrl)}" target="_blank" rel="noreferrer noopener" style="color:#60a5fa;text-decoration:none;font-weight:500;">Open →</a>` : ""}
      </div>
    </div>
  `;
}

function buildPopup(group: LocationGroup): string {
  const primary = group.events[0];
  const count = group.events.length;
  const sources = new Set(group.events.map((e) => e.source));

  const confBadge =
    primary.location.confidence === "high"
      ? ""
      : `<span style="padding:1px 6px;border-radius:4px;background:rgba(245,158,11,0.15);color:#fbbf24;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(primary.location.confidence)}</span>`;

  const countLabel =
    count === 1
      ? "1 article"
      : `${count} articles${sources.size > 1 ? ` · ${sources.size} sources` : ""}`;

  const eventRows = group.events.slice(0, 25).map(renderEventRow).join("");
  const overflowNote =
    count > 25
      ? `<div style="padding:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">+${count - 25} more — see sidebar for full list</div>`
      : "";

  return `
    <div style="width:320px;max-width:90vw;font-family:var(--font-sans, system-ui);color:#e5e7eb;">
      <div style="padding-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:14px;font-weight:600;color:#f9fafb;">
            ${escapeHtml(group.locationName)}${group.country ? `<span style="color:#94a3b8;font-weight:400;">, ${escapeHtml(group.country)}</span>` : ""}
          </span>
          ${confBadge}
        </div>
        <div style="font-size:11px;color:#94a3b8;">${escapeHtml(countLabel)}</div>
      </div>
      <div class="warmap-scroll" style="max-height:340px;overflow-y:auto;padding-right:4px;">
        ${eventRows}
        ${overflowNote}
      </div>
    </div>
  `;
}

export interface WarMapApi {
  /** Fit the viewport to every incident (or the default view when empty). */
  resetView: () => void;
}

interface Props {
  events: WarEvent[];
  focusedEventId: string | null;
  highlightedId: string | null;
  showVectors?: boolean;
  onMarkerHover?: (eventId: string | null) => void;
  onReady?: (api: WarMapApi) => void;
}

// Default framing used on load and when there are no incidents to fit.
const DEFAULT_CENTER: [number, number] = [30, 25];
const DEFAULT_ZOOM = 3;

export default function WarMap({
  events,
  focusedEventId,
  highlightedId,
  showVectors = true,
  onMarkerHover,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const vectorsRef = useRef<Map<string, { line: LeafletPolyline; origin: LeafletMarker }>>(
    new Map(),
  );
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const hoverCbRef = useRef(onMarkerHover);
  hoverCbRef.current = onMarkerHover;
  const [mapReady, setMapReady] = useState(false);

  const groups = useMemo(() => groupByLocation(events), [events]);
  // Latest groups kept in a ref so the stable resetView callback can read the
  // current incident set without being re-created on every data update.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // Reset / fit-to-incidents. Stable identity so onReady fires only once.
  const resetView = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    const pts = groupsRef.current.map(
      (g) => [g.lat, g.lng] as [number, number],
    );
    if (pts.length === 0) {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.8 });
      return;
    }
    map.flyToBounds(L.latLngBounds(pts), {
      padding: [64, 64],
      maxZoom: 6,
      duration: 0.9,
    });
  }, []);

  // Hand the imperative API to the parent once the map is live. `onReady` is a
  // stable useCallback from the parent, so this fires once.
  useEffect(() => {
    if (mapReady) onReady?.({ resetView });
  }, [mapReady, resetView, onReady]);

  // Init map once. `setMapReady(true)` is the signal the sync effect below
  // waits for — without it, any events that were already in state when the
  // component mounted would never render (async Leaflet init resolves after
  // the first sync effect run, and refs don't trigger re-renders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 3,
        maxZoom: 12,
        // Hard stop at the world bounds. Antarctica/Arctic are clipped to the
        // tile-supported range so zoom-out doesn't reveal grey margins.
        maxBounds: [[-85, -180], [85, 180]],
        maxBoundsViscosity: 1.0,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          attribution:
            '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
          maxZoom: 19,
        },
      ).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      // ── Map interaction tracking ──────────────────────────────────────
      // Zoom: fire only on zoomend so we don't spam during the animation.
      let lastZoom = map.getZoom();
      map.on("zoomend", () => {
        const z = map.getZoom();
        if (z === lastZoom) return;
        const direction = z > lastZoom ? "map_zoom_in" : "map_zoom_out";
        trackEvent(direction, { zoom: z, from_zoom: lastZoom });
        lastZoom = z;
      });

      // Pan: Leaflet already debounces moveend; bucket the center to keep
      // cardinality manageable and ignore tiny jitter moves.
      let lastCenter = map.getCenter();
      map.on("moveend", () => {
        const c = map.getCenter();
        const drift =
          Math.abs(c.lat - lastCenter.lat) + Math.abs(c.lng - lastCenter.lng);
        if (drift < 0.01) return;
        lastCenter = c;
        trackEvent("map_pan", {
          center_lat: bucketCoord(c.lat),
          center_lng: bucketCoord(c.lng),
          zoom: map.getZoom(),
        });
      });

      // Mouse-move intensity: count moves locally, emit one aggregated event
      // every 10s. Never one event per move.
      let moveCount = 0;
      let firstMoveAt = 0;
      map.on("mousemove", () => {
        if (moveCount === 0) firstMoveAt = Date.now();
        moveCount++;
      });
      const intensityTimer = setInterval(() => {
        if (moveCount === 0) return;
        const windowMs = Date.now() - firstMoveAt;
        trackEvent("map_mouse_move_intensity", {
          samples: moveCount,
          window_ms: windowMs,
          rate_per_sec: Math.round((moveCount / Math.max(windowMs, 1)) * 1000),
        });
        moveCount = 0;
        firstMoveAt = 0;
      }, 10_000);
      // Stash on the map instance so the cleanup below can clear it.
      (map as unknown as { __warmapTimers__?: ReturnType<typeof setInterval>[] }).__warmapTimers__ = [intensityTimer];
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        const timers =
          (mapRef.current as unknown as {
            __warmapTimers__?: ReturnType<typeof setInterval>[];
          }).__warmapTimers__ ?? [];
        for (const t of timers) clearInterval(t);
        mapRef.current.remove();
        mapRef.current = null;
      }
      leafletRef.current = null;
      markersRef.current.clear();
      vectorsRef.current.clear();
      setMapReady(false);
    };
  }, []);

  // Sync markers with grouped events.
  useEffect(() => {
    if (!mapReady) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const seen = new Set<string>();

    for (const group of groups) {
      seen.add(group.key);
      const existing = markersRef.current.get(group.key);
      const primary = group.events[0];
      const color = eventColor(primary);
      const count = group.events.length;

      const lowConfidence = primary.location.confidence === "low";
      // Size scales with the group's peak severity (issue #5.35).
      const peakSeverity = group.events.reduce(
        (m, e) => Math.max(m, e.severity),
        0,
      );
      const size = severityToSize(peakSeverity);
      const glyph = glyphSvg(glyphKindFor(primary));
      const html = `
        <div class="warmap-marker${lowConfidence ? " is-low-confidence" : ""}" style="--marker-color:${color};width:${size}px;height:${size}px;">
          ${animationLayer(primary.eventType)}
          <span class="warmap-marker-pulse"></span>
          <span class="warmap-marker-dot"></span>
          ${glyph}
          ${count > 1 ? `<span class="warmap-cluster-count" style="position:absolute;top:-10px;right:-12px;padding:1px 5px;border-radius:999px;background:rgba(10,10,10,0.9);color:#fff;font-size:10px;font-weight:600;border:1px solid ${color};">${count}</span>` : ""}
        </div>
      `;

      const icon = L.divIcon({
        html,
        className: "warmap-divicon",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      if (existing) {
        existing.setIcon(icon);
        existing.setPopupContent(buildPopup(group));
      } else {
        const marker = L.marker([group.lat, group.lng], {
          icon,
          riseOnHover: true,
        }).addTo(map);

        marker.bindPopup(buildPopup(group), {
          closeButton: true,
          autoPan: true,
          offset: [0, -4],
          maxWidth: 360,
          minWidth: 280,
          className: "warmap-popup",
        });

        // Per-marker hover duration tracking. A short hover (<300ms) is most
        // likely an accidental flyover and is dropped to keep the data clean.
        let hoverStart = 0;

        marker.on("mouseover", () => {
          marker.openPopup();
          hoverCbRef.current?.(primary.id);
          hoverStart = Date.now();
          trackEvent("ui_hover_element", {
            element: "incident_marker",
            element_id: primary.id,
            event_type: primary.eventType,
            location_name: primary.location.name,
          });
        });
        marker.on("mouseout", () => {
          hoverCbRef.current?.(null);
          if (hoverStart > 0) {
            const ms = Date.now() - hoverStart;
            hoverStart = 0;
            if (ms >= 300) {
              trackEvent("map_hover_duration", {
                element_id: primary.id,
                ms,
                event_type: primary.eventType,
                location_name: primary.location.name,
              });
            }
          }
        });
        marker.on("click", () => {
          marker.openPopup();
          trackEvent("click_incident_point", {
            element_id: primary.id,
            event_type: primary.eventType,
            location_name: primary.location.name,
            country: primary.location.country,
            stack_count: count,
            severity: primary.severity,
            source: primary.source,
          });
        });

        markersRef.current.set(group.key, marker);
      }
    }

    // Remove markers that no longer have events
    for (const [key, marker] of markersRef.current.entries()) {
      if (!seen.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    }
  }, [groups, mapReady]);

  // Sync directional vectors (origin → target polylines).
  const vectored = useMemo(
    () => events.filter((e): e is WarEvent & { vector: NonNullable<WarEvent["vector"]> } =>
      Boolean(e.vector)),
    [events],
  );

  useEffect(() => {
    if (!mapReady) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const seen = new Set<string>();
    // When the vector layer is toggled off, treat the active set as empty so
    // the removal pass below clears any existing trajectories.
    const active = showVectors ? vectored : [];

    for (const ev of active) {
      seen.add(ev.id);
      if (vectorsRef.current.has(ev.id)) continue;

      const { origin, target, mover } = ev.vector!;
      const moverClass = moverClassName(mover);

      const line = L.polyline(
        [
          [origin.lat, origin.lng],
          [target.lat, target.lng],
        ],
        {
          className: `warmap-vector ${moverClass}`,
          interactive: false,
          smoothFactor: 1.5,
          noClip: false,
        },
      ).addTo(map);

      const originIcon = L.divIcon({
        html: `<div class="warmap-origin" style="--marker-color:${vectorStrokeColor(mover)};"></div>`,
        className: "warmap-divicon",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const originMarker = L.marker([origin.lat, origin.lng], {
        icon: originIcon,
        interactive: false,
      }).addTo(map);

      vectorsRef.current.set(ev.id, { line, origin: originMarker });
    }

    for (const [id, pair] of vectorsRef.current.entries()) {
      if (!seen.has(id)) {
        pair.line.remove();
        pair.origin.remove();
        vectorsRef.current.delete(id);
      }
    }
  }, [vectored, mapReady, showVectors]);

  // Fly to focused event
  useEffect(() => {
    if (!focusedEventId) return;
    const map = mapRef.current;
    if (!map) return;
    const event = events.find((e) => e.id === focusedEventId);
    if (!event) return;
    const key = `${event.location.lat.toFixed(3)}|${event.location.lng.toFixed(3)}`;
    const marker = markersRef.current.get(key);
    map.flyTo([event.location.lat, event.location.lng], Math.max(map.getZoom(), 6), {
      duration: 1.1,
    });
    if (marker) {
      setTimeout(() => marker.openPopup(), 700);
    }
  }, [focusedEventId, events]);

  // Subtle highlight for the most recent event arriving via stream
  useEffect(() => {
    if (!highlightedId) return;
    const ev = events.find((e) => e.id === highlightedId);
    if (!ev) return;
    const key = `${ev.location.lat.toFixed(3)}|${ev.location.lng.toFixed(3)}`;
    const marker = markersRef.current.get(key);
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    el.classList.remove("warmap-new");
    // Force reflow so the animation replays
    void (el as HTMLElement).offsetWidth;
    el.classList.add("warmap-new");
  }, [highlightedId, events]);

  return <div ref={containerRef} className="absolute inset-0" aria-label="Live conflict map" />;
}
