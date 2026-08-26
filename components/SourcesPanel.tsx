"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Source } from "@/lib/sources";
import { trackEvent } from "@/lib/analytics";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<Source["category"], string> = {
  world: "World news",
  conflict: "Conflict & regional",
  defense: "Defense",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// News source overview + management (issues #5.12 / #5.13): lists every feed the
// pipeline aggregates and lets an administrator add or remove custom feeds.
export default function SourcesPanel({ open, onClose }: Props) {
  const [builtin, setBuiltin] = useState<Source[]>([]);
  const [custom, setCustom] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; url: string; category: Source["category"] }>({
    name: "",
    url: "",
    category: "world",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sources", { cache: "no-store" });
      const json = (await res.json()) as { builtin: Source[]; custom: Source[] };
      setBuiltin(json.builtin ?? []);
      setCustom(json.custom ?? []);
    } catch {
      setError("Could not load sources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, load]);

  const customIds = useMemo(() => new Set(custom.map((s) => s.id)), [custom]);

  const grouped = useMemo(() => {
    const by: Record<Source["category"], Source[]> = { world: [], conflict: [], defense: [] };
    for (const s of [...builtin, ...custom]) by[s.category].push(s);
    return by;
  }, [builtin, custom]);

  const total = builtin.length + custom.length;

  const submit = async () => {
    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not add source.");
        return;
      }
      trackEvent("add_source", { host: hostOf(form.url), category: form.category });
      setForm({ name: "", url: "", category: "world" });
      await load();
    } catch {
      setError("Request failed.");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      trackEvent("remove_source", { id });
      await load();
    } catch {
      setError("Could not remove source.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[800] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="News sources"
    >
      <button aria-label="Close sources overview" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Data transparency</div>
            <div className="text-sm font-semibold text-zinc-50">
              News sources · {total} feed{total === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="warmap-scroll flex-1 overflow-y-auto px-5 py-4">
          {/* Add-source form (admin management) */}
          <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Add a source</div>
            <div className="flex flex-col gap-2">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Display name (e.g. Example News)"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
              />
              <input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="RSS/Atom feed URL"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Source["category"] }))}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-sm text-zinc-100 [color-scheme:dark]"
                >
                  <option value="world">World news</option>
                  <option value="conflict">Conflict &amp; regional</option>
                  <option value="defense">Defense</option>
                </select>
                <button
                  onClick={submit}
                  disabled={adding}
                  className="ml-auto rounded-md bg-sky-500/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
                >
                  {adding ? "Validating…" : "Add feed"}
                </button>
              </div>
              {error && <div className="text-[12px] text-amber-400">{error}</div>}
            </div>
          </div>

          <p className="mb-4 text-[12px] leading-relaxed text-zinc-400">
            Every incident is aggregated automatically from the feeds below, then geolocated
            and classified. Feeds that fail to load are skipped without affecting the rest.
          </p>

          {loading && total === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">Loading sources…</div>
          ) : (
            (Object.keys(grouped) as Source["category"][]).map((cat) =>
              grouped[cat].length === 0 ? null : (
                <section key={cat} className="mb-5 last:mb-0">
                  <h3 className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    {CATEGORY_LABELS[cat]} · {grouped[cat].length}
                  </h3>
                  <ul className="space-y-1">
                    {grouped[cat].map((s) => {
                      const isCustom = customIds.has(s.id);
                      return (
                        <li key={s.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                          <a href={s.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm text-zinc-200 transition hover:text-white">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">{s.name}</span>
                              {isCustom && (
                                <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-300">
                                  custom
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-[11px] text-zinc-500">{hostOf(s.url)}</span>
                          </a>
                          {isCustom && (
                            <button
                              onClick={() => remove(s.id)}
                              aria-label={`Remove ${s.name}`}
                              title="Remove source"
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M3 6h18" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              </svg>
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
