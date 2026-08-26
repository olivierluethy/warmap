"use client";

import type { EventType } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "./event-style";

const LEGEND_ORDER: EventType[] = [
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

export default function Legend() {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[500] rounded-xl border border-white/10 bg-zinc-950/80 p-3 backdrop-blur-xl shadow-xl shadow-black/40">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Event type
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-zinc-300">
        {LEGEND_ORDER.map((type) => (
          <li key={type} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: EVENT_COLORS[type],
                boxShadow: `0 0 8px ${EVENT_COLORS[type]}`,
              }}
            />
            {EVENT_LABELS[type]}
          </li>
        ))}
      </ul>
    </div>
  );
}
