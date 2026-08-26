"use client";

import { useEffect, useState } from "react";
import type { ConnectionState } from "./useEvents";
import { relativeTime } from "./event-style";
import InstallButton from "./InstallButton";

interface Props {
  connection: ConnectionState;
  lastUpdate: number | null;
  totalEvents: number;
  notificationsOn: boolean;
  onToggleNotifications: () => void;
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const label: Record<ConnectionState, string> = {
    connecting: "Connecting",
    live: "Live",
    polling: "Polling",
    offline: "Offline",
  };
  const color: Record<ConnectionState, string> = {
    connecting: "#f59e0b",
    live: "#22c55e",
    polling: "#38bdf8",
    offline: "#ef4444",
  };
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-200 backdrop-blur">
      <span className="relative flex h-2 w-2">
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ background: color[state] }}
        />
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: color[state] }}
        />
      </span>
      {label[state]}
    </div>
  );
}

export default function Header({
  connection,
  lastUpdate,
  totalEvents,
  notificationsOn,
  onToggleNotifications,
}: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-2.5 backdrop-blur-xl shadow-xl shadow-black/40">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/15 ring-1 ring-red-500/40">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-red-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m17.66 6.34 1.41-1.41" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 12v9" />
            <path d="m8 21 4-3 4 3" />
          </svg>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Warmap
          </div>
          <div className="text-sm font-semibold text-zinc-50 leading-tight">
            Real-time conflict intelligence
          </div>
        </div>
        <div className="ml-2 h-7 w-px bg-white/10" />
        <ConnectionBadge state={connection} />
        <div className="text-[11px] text-zinc-500 tabular-nums">
          {totalEvents.toLocaleString()} events
          {lastUpdate && (
            <span className="hidden sm:inline"> · {relativeTime(new Date(lastUpdate).toISOString())}</span>
          )}
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <InstallButton />
        <button
          onClick={onToggleNotifications}
          aria-pressed={notificationsOn}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-xl transition ${
            notificationsOn
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
              : "border-white/10 bg-zinc-950/80 text-zinc-300 hover:bg-zinc-900/80"
          }`}
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
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          Alerts {notificationsOn ? "On" : "Off"}
        </button>
      </div>
    </header>
  );
}
