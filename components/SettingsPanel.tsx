"use client";

import { useEffect } from "react";
import type { AppSettings } from "@/lib/settings";
import { speechSupported } from "@/lib/alerts";

interface Props {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
  onToggleNotifications: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
          {description}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition ${
          checked
            ? "border-emerald-400/50 bg-emerald-500/30"
            : "border-white/15 bg-white/5"
        } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-zinc-100 shadow transition-all ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

// Settings area (issue #5.7): central place to configure notifications, event
// sounds (#5.9), and the spoken live reporter (#5.10/#5.11).
export default function SettingsPanel({
  open,
  settings,
  onClose,
  onChange,
  onToggleNotifications,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ttsOk = speechSupported();

  return (
    <div
      className="absolute inset-0 z-[800] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <button
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Configuration
            </div>
            <div className="text-sm font-semibold text-zinc-50">Settings</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="warmap-scroll flex-1 divide-y divide-white/5 overflow-y-auto px-5 py-2">
          <Toggle
            label="Incident notifications"
            description="Show a browser notification when a new high-severity incident is detected."
            checked={settings.notifications}
            onChange={onToggleNotifications}
          />

          <Toggle
            label="Event sounds"
            description="Play an alert chime when a new incident arrives. Louder, brighter tone for more severe events."
            checked={settings.sound}
            onChange={() => onChange({ sound: !settings.sound })}
          />

          {settings.sound && (
            <div className="py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-zinc-200">
                  Minimum severity to sound
                </span>
                <span className="tabular-nums text-sm font-semibold text-sky-300">
                  {settings.soundMinSeverity}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={settings.soundMinSeverity}
                onChange={(e) =>
                  onChange({ soundMinSeverity: Number(e.target.value) })
                }
                className="w-full accent-sky-400"
                aria-label="Minimum severity to sound"
              />
              <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                <span>Any (1)</span>
                <span>Critical only (10)</span>
              </div>
            </div>
          )}

          <Toggle
            label="Live reporter"
            description={
              ttsOk
                ? "Announce breaking and critical incidents aloud using text-to-speech."
                : "Text-to-speech is not available in this browser."
            }
            checked={settings.reporter && ttsOk}
            disabled={!ttsOk}
            onChange={() => onChange({ reporter: !settings.reporter })}
          />

          <div className="pt-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Map layers
          </div>

          <Toggle
            label="Directional trajectories"
            description="Show origin → target vectors for missiles, drones, aircraft, ships and troop movements."
            checked={settings.showVectors}
            onChange={() => onChange({ showVectors: !settings.showVectors })}
          />

          <Toggle
            label="Approximate incidents"
            description="Show incidents whose location could only be resolved to low confidence (dimmed on the map)."
            checked={settings.showLowConfidence}
            onChange={() =>
              onChange({ showLowConfidence: !settings.showLowConfidence })
            }
          />
        </div>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-zinc-500">
          Preferences are saved in this browser only.
        </div>
      </div>
    </div>
  );
}
