import type { EventType, WarEvent } from "@/lib/types";

export const EVENT_COLORS: Record<EventType, string> = {
  airstrike: "#ef4444",
  missile: "#f97316",
  drone: "#eab308",
  shelling: "#f59e0b",
  ground: "#dc2626",
  naval: "#38bdf8",
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
  casualties: "Casualties",
  diplomacy: "Diplomacy",
  cyber: "Cyber",
  humanitarian: "Humanitarian",
  other: "Incident",
};

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
