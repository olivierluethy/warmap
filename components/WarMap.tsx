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

// How long a projectile takes to travel its whole trajectory once. Fast, direct
// movers (missiles) cross quickly; loitering drones and ground columns crawl —
// so the motion itself communicates what kind of event it is (issues #6, #7, #8).
function moverTravelMs(m: Mover): number {
  switch (m) {
    case "missile": return 2600;
    case "aircraft": return 3600;
    case "drone": return 6200;
    case "ship": return 9000;
    case "troops": return 11000;
    default: return 4600;
  }
}

// The projectile body — a recognizable object per mover, not a dot (issues #2,
// #6, #7). Drawn on a 24×24 viewBox pointing to the +x axis; the marker rotates
// it to face the direction of travel. Filled shapes so the glow reads at size.
function projectileInnerSvg(m: Mover): string {
  switch (m) {
    case "missile":
      return '<path d="M2 12h10"/><path d="M11 8c5 0 8 2 9 4-1 2-4 4-9 4z"/><path d="M5 9 2 6 M5 15 2 18"/>';
    case "aircraft":
      return '<path d="M22 12 4 5l4 7-4 7z"/>';
    case "drone":
      return '<line x1="7" y1="7" x2="17" y2="17"/><line x1="17" y1="7" x2="7" y2="17"/><rect x="10" y="10" width="4" height="4" rx="1"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/>';
    case "ship":
      return '<path d="M3 14h18l-3 5H6z"/><path d="M8 14V7h6l3 7"/>';
    case "troops":
      return '<path d="M4 12h5 M6 8l4 4-4 4"/><path d="M13 12h5 M15 8l4 4-4 4"/>';
    default:
      return '<circle cx="12" cy="12" r="5"/>';
  }
}

// Emits the type-specific SVG/CSS layer that sits behind the normal pulse dot.
function animationLayer(type: EventType): string {
  switch (type) {
    case "airstrike":
    case "missile":
      // Incoming streak, then a bright flash + expanding shockwave ring so the
      // impact reads as a real explosion, not a pulse (issues #4, #5, #13).
      return `
        <svg class="warmap-anim warmap-anim-streak" viewBox="0 0 120 120" aria-hidden="true">
          <line x1="100" y1="20" x2="60" y2="60" />
        </svg>
        <span class="warmap-anim warmap-anim-flash"></span>
        <span class="warmap-anim warmap-anim-shock"></span>
        <span class="warmap-anim warmap-anim-burst"></span>`;
    case "fire":
      // Flickering fire glow (issue #5.34).
      return `<span class="warmap-anim warmap-anim-fire"></span>`;
    case "drone":
      // A recognizable quad-rotor that hovers and drifts, with spinning rotors
      // — an object, not a circle (issue #6).
      return `
        <svg class="warmap-anim warmap-anim-drone" viewBox="0 0 40 40" aria-hidden="true">
          <line x1="12" y1="12" x2="28" y2="28" /><line x1="28" y1="12" x2="12" y2="28" />
          <rect x="16" y="16" width="8" height="8" rx="1.5" />
          <circle class="rotor" cx="12" cy="12" r="4.5" /><circle class="rotor" cx="28" cy="12" r="4.5" />
          <circle class="rotor" cx="12" cy="28" r="4.5" /><circle class="rotor" cx="28" cy="28" r="4.5" />
        </svg>`;
    case "naval":
      return `
        <span class="warmap-anim warmap-anim-wave"></span>
        <span class="warmap-anim warmap-anim-wave delay-1"></span>
        <span class="warmap-anim warmap-anim-wave delay-2"></span>`;
    case "shelling":
      return `
        <span class="warmap-anim warmap-anim-shock"></span>
        <span class="warmap-anim warmap-anim-burst"></span>`;
    case "ground":
      // A column of chevrons marching forward, reading as advancing units
      // rather than a spinning marker (issue #7).
      return `
        <span class="warmap-anim warmap-anim-advance" aria-hidden="true">
          <i class="warmap-advance-chevron c1"></i>
          <i class="warmap-advance-chevron c2"></i>
          <i class="warmap-advance-chevron c3"></i>
        </span>`;
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
  // Live projectiles animated along their trajectory by a single rAF loop.
  const projectilesRef = useRef<
    Map<
      string,
      {
        marker: LeafletMarker;
        impact: LeafletMarker;
        origin: [number, number];
        target: [number, number];
        travelMs: number;
        pauseMs: number;
        start: number;
        impacted: boolean;
      }
    >
  >(new Map());
  const rafRef = useRef<number | null>(null);
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
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
      projectilesRef.current.clear();
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

    // Honour the OS reduced-motion setting: keep the static trajectory line and
    // origin marker, but skip the travelling projectile and impact loop.
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const seen = new Set<string>();
    // When the vector layer is toggled off, treat the active set as empty so
    // the removal pass below clears any existing trajectories.
    const active = showVectors ? vectored : [];

    for (const ev of active) {
      seen.add(ev.id);
      if (vectorsRef.current.has(ev.id)) continue;

      const { origin, target, mover } = ev.vector!;
      const moverClass = moverClassName(mover);
      const stroke = vectorStrokeColor(mover);

      // Explicit path options (not just a CSS class): the map is canvas-rendered
      // (preferCanvas), where CSS on the SVG path does not apply, so the colour
      // and dash must be set here for the trajectory to stay clearly visible
      // (issue #3).
      const line = L.polyline(
        [
          [origin.lat, origin.lng],
          [target.lat, target.lng],
        ],
        {
          className: `warmap-vector ${moverClass}`,
          color: stroke,
          weight: 1.8,
          opacity: 0.85,
          dashArray: "6 10",
          interactive: false,
          smoothFactor: 1.5,
          noClip: false,
        },
      ).addTo(map);

      const originIcon = L.divIcon({
        html: `<div class="warmap-origin" style="--marker-color:${stroke};"></div>`,
        className: "warmap-divicon",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const originMarker = L.marker([origin.lat, origin.lng], {
        icon: originIcon,
        interactive: false,
      }).addTo(map);

      vectorsRef.current.set(ev.id, { line, origin: originMarker });

      if (reduceMotion) continue;

      // Travelling projectile — an object that follows the trajectory from
      // origin to target and loops (issues #2, #6, #7, #12).
      const projectileIcon = L.divIcon({
        html: `<div class="warmap-projectile" style="--proj-color:${stroke};"><span class="warmap-projectile-trail"></span><span class="warmap-projectile-body"><svg viewBox="0 0 24 24" aria-hidden="true">${projectileInnerSvg(mover)}</svg></span></div>`,
        className: "warmap-divicon",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const projectile = L.marker([origin.lat, origin.lng], {
        icon: projectileIcon,
        interactive: false,
        zIndexOffset: 500,
        keyboard: false,
      }).addTo(map);

      // Impact effect placed at the target, replayed each time the projectile
      // arrives (issues #4, #5).
      const impactIcon = L.divIcon({
        html: `<div class="warmap-impact" style="--impact-color:${stroke};"><span class="warmap-impact-flash"></span><span class="warmap-impact-ring"></span><span class="warmap-impact-ring r2"></span></div>`,
        className: "warmap-divicon",
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      const impact = L.marker([target.lat, target.lng], {
        icon: impactIcon,
        interactive: false,
        zIndexOffset: 450,
        keyboard: false,
      }).addTo(map);

      // Orient the projectile body along the travel direction. The bearing
      // between two layer points is invariant to zoom (uniform scale) and pan,
      // so it is computed once here.
      const a = map.latLngToLayerPoint([origin.lat, origin.lng]);
      const b = map.latLngToLayerPoint([target.lat, target.lng]);
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const body = projectile
        .getElement()
        ?.querySelector<HTMLElement>(".warmap-projectile-body");
      if (body) body.style.setProperty("--angle", `${angle}deg`);

      projectilesRef.current.set(ev.id, {
        marker: projectile,
        impact,
        origin: [origin.lat, origin.lng],
        target: [target.lat, target.lng],
        travelMs: moverTravelMs(mover),
        pauseMs: 1400,
        start: performance.now(),
        impacted: false,
      });
    }

    for (const [id, pair] of vectorsRef.current.entries()) {
      if (!seen.has(id)) {
        pair.line.remove();
        pair.origin.remove();
        vectorsRef.current.delete(id);
      }
    }
    for (const [id, p] of projectilesRef.current.entries()) {
      if (!seen.has(id)) {
        p.marker.remove();
        p.impact.remove();
        projectilesRef.current.delete(id);
      }
    }

    // Single rAF loop drives every projectile. Cancelled on cleanup and
    // restarted on each run so it never double-schedules.
    const tick = (now: number) => {
      for (const p of projectilesRef.current.values()) {
        const cycle = p.travelMs + p.pauseMs;
        const phase = (now - p.start) % cycle;
        const el = p.marker.getElement();
        if (phase <= p.travelMs) {
          const t = phase / p.travelMs;
          p.marker.setLatLng([
            p.origin[0] + (p.target[0] - p.origin[0]) * t,
            p.origin[1] + (p.target[1] - p.origin[1]) * t,
          ]);
          // Fade in on launch, fade out just before impact.
          if (el)
            el.style.opacity =
              t < 0.06 ? String(t / 0.06) : t > 0.94 ? String((1 - t) / 0.06) : "1";
          p.impacted = false;
        } else {
          if (el) el.style.opacity = "0";
          if (!p.impacted) {
            p.impacted = true;
            const host = p.impact
              .getElement()
              ?.querySelector<HTMLElement>(".warmap-impact");
            if (host) {
              // Restart the one-shot impact animation.
              host.classList.remove("is-on");
              void host.offsetWidth;
              host.classList.add("is-on");
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current === null && projectilesRef.current.size > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
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
