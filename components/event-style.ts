import type { EventType, WarEvent } from "@/lib/types";

export const EVENT_COLORS: Record<EventType, string> = {
  airstrike: "#ef4444",
  missile: "#f97316",
  drone: "#eab308",
  shelling: "#f59e0b",
  ground: "#dc2626",
  naval: "#38bdf8",
  fire: "#fb923c",
  casualties: "#b91c1c",
  diplomacy: "#a78bfa",
  cyber: "#22d3ee",
  humanitarian: "#34d399",
  other: "#94a3b8",
};

export const EVENT_LABELS: Record<EventType, string> = {
  airstrike: "Airstrike",
  missile: "Missile",
  drone: "Drone",
  shelling: "Shelling",
  ground: "Ground ops",
  naval: "Naval",
  fire: "Fire",
  casualties: "Casualties",
  diplomacy: "Diplomacy",
  cyber: "Cyber",
  humanitarian: "Humanitarian",
  other: "Incident",
};

// A meaningful glyph per incident kind (issue #5.25). Values are inner SVG
// markup drawn on a 24×24 viewBox; the marker composes them into a divIcon.
// Kept to simple, valid stroke paths so the marker never fails to render.
export type GlyphKind =
  | EventType
  | "tanker"
  | "warship"
  | "speech"
  | "jet";

const GLYPHS: Record<GlyphKind, string> = {
  airstrike: '<path d="M12 2 3 20l9-4 9 4z"/>', // delta jet
  jet: '<path d="M12 2 3 20l9-4 9 4z"/>',
  missile: '<path d="M12 2c2 2 3 5 3 8v6l-3 4-3-4v-6c0-3 1-6 3-8z"/><path d="M9 20l-3 2 M15 20l3 2"/>',
  drone: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 7l3 3 M17 7l-3 3 M7 17l3-3 M17 17l-3-3"/>',
  shelling: '<path d="M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l3 3 M18 6l-3 3 M6 18l3-3 M18 18l-3-3"/><circle cx="12" cy="12" r="2"/>',
  ground: '<path d="M12 3 20 19 4 19z"/>', // advance chevron/triangle
  naval: '<path d="M3 15c1 1 2 1.5 3 1.5s2-.5 3-.5 2 .5 3 .5 2-.5 3-.5 2 .5 3 .5 2-.5 3-1.5"/><path d="M5 13V8h10l3 5"/>',
  warship: '<path d="M3 15c1 1 2 1.5 3 1.5s2-.5 3-.5 2 .5 3 .5 2-.5 3-.5 2 .5 3 .5 2-.5 3-1.5"/><path d="M5 13V8h10l3 5 M9 8V5h3"/>',
  tanker: '<path d="M3 15c1 1 2 1.5 3 1.5s2-.5 3-.5 2 .5 3 .5 2-.5 3-.5 2 .5 3 .5 2-.5 3-1.5"/><rect x="5" y="9" width="13" height="4" rx="1"/>',
  fire: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1 1 2 2 2 0-2-2-4-2-6z"/>',
  casualties: '<path d="M12 4v16 M4 12h16"/>', // medical cross
  diplomacy: '<path d="M5 20V4l7 3 7-3v16 M12 7v13"/>', // flag
  speech: '<path d="M12 3v6 M8 9h8 M6 21c0-4 2.7-6 6-6s6 2 6 6"/>', // podium/speaker
  cyber: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3"/>',
  humanitarian: '<path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.5-7 9-7 9z"/>',
  other: "",
};

function has(text: string, words: string[]): boolean {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

// Resolve the most specific glyph for an event, refining broad types using
// its keywords/title (military vessel vs tanker #5.28/#5.29, political speech
// #5.31, jets for airstrikes).
export function glyphKindFor(e: WarEvent): GlyphKind {
  const text = `${e.title} ${e.summary} ${e.keywords.join(" ")}`;
  switch (e.eventType) {
    case "naval":
      if (has(text, ["tanker", "oil ship", "cargo"])) return "tanker";
      if (has(text, ["warship", "frigate", "destroyer", "submarine", "corvette", "carrier", "navy"])) return "warship";
      return "naval";
    case "airstrike":
      if (has(text, ["jet", "warplane", "fighter", "aircraft", "f-16", "f-35", "su-"])) return "jet";
      return "airstrike";
    case "diplomacy":
      if (has(text, ["speech", "address", "press conference", "rally", "podium", "remarks"])) return "speech";
      return "diplomacy";
    default:
      return e.eventType;
  }
}

export function glyphSvg(kind: GlyphKind): string {
  const inner = GLYPHS[kind] ?? "";
  if (!inner) return "";
  return `<svg class="warmap-glyph" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

export function eventColor(e: WarEvent): string {
  return EVENT_COLORS[e.eventType] ?? EVENT_COLORS.other;
}

// Marker diameter scales with severity so escalating incidents read as more
// intense at a glance (issue #5.35). Clamped 0–10 → 14–30px.
export function severityToSize(severity: number): number {
  const s = Math.max(0, Math.min(10, severity));
  return Math.round(14 + s * 1.6);
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const s = Math.floor(diff / 1000);
  if (s < 45) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
