import { extractEvent } from "./event-extractor";
import { eventStore } from "./event-store";
import { getLlmStats, hasOpenAIKey } from "./llm-extractor";
import { parseFeed } from "./rss-parser";
import { SOURCES, type Source } from "./sources";
import { getCustomSources } from "./custom-sources";

// Built-in feeds plus any runtime-added custom feeds (issue #5.13). Read fresh
// each cycle so newly-added sources are picked up without a restart.
function allSources(): Source[] {
  const custom = getCustomSources();
  if (custom.length === 0) return SOURCES;
  const seen = new Set(SOURCES.map((s) => s.url));
  return [...SOURCES, ...custom.filter((s) => !seen.has(s.url))];
}

const FETCH_INTERVAL_MS = 90 * 1000;
const FETCH_TIMEOUT_MS = 15 * 1000;

interface FetcherState {
  started: boolean;
  firstCycleCompleted: boolean;
  lastRun: number;
  lastError: string | null;
  inFlight: Promise<void> | null;
  stats: {
    totalItems: number;
    totalEvents: number;
    cyclesCompleted: number;
  };
}

const GLOBAL_KEY = "__warmap_fetcher_state__";
type GlobalWithState = typeof globalThis & { [GLOBAL_KEY]?: FetcherState };
const g = globalThis as GlobalWithState;

const state: FetcherState =
  g[GLOBAL_KEY] ??
  (g[GLOBAL_KEY] = {
    started: false,
    firstCycleCompleted: false,
    lastRun: 0,
    lastError: null,
    inFlight: null,
    stats: { totalItems: 0, totalEvents: 0, cyclesCompleted: 0 },
  });

const EXTRACTOR_CONCURRENCY = Number(process.env.WARMAP_EXTRACTOR_CONCURRENCY ?? 4);

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const n = Math.min(limit, items.length);
  const runners = new Array(n).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      try {
        results[i] = await worker(items[i]);
      } catch {
        // worker errors are swallowed — caller inspects individual results
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchOne(source: Source): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "warmap/1.0 (+real-time conflict monitor; educational use)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.5",
      },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const xml = await res.text();
    const feed = parseFeed(xml, source.name);
    state.stats.totalItems += feed.items.length;

    const events = await mapWithConcurrency(feed.items, EXTRACTOR_CONCURRENCY, extractEvent);
    let added = 0;
    for (const ev of events) {
      if (!ev) continue;
      if (eventStore.add(ev)) added++;
    }
    state.stats.totalEvents += added;
    return added;
  } catch (err) {
    state.lastError = `${source.name}: ${(err as Error).message}`;
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

async function runCycle(): Promise<void> {
  const t0 = Date.now();
  const cycleNo = state.stats.cyclesCompleted + 1;
  const sources = allSources();
  console.log(
    `[warmap] cycle #${cycleNo} start :: sources=${sources.length} llm=${hasOpenAIKey() ? "on" : "off"}`,
  );

  const results = await Promise.allSettled(sources.map(fetchOne));
  const added = results.reduce(
    (n, r) => n + (r.status === "fulfilled" ? r.value : 0),
    0,
  );
  const failedSources = results.filter((r) => r.status === "rejected").length;
  state.lastRun = Date.now();
  state.stats.cyclesCompleted += 1;
  state.firstCycleCompleted = true;
  if (added > 0) state.lastError = null;

  const llm = getLlmStats();
  console.log(
    `[warmap] cycle #${cycleNo} done  :: items=${state.stats.totalItems} added=${added} total=${state.stats.totalEvents} failedSources=${failedSources} elapsed=${Date.now() - t0}ms llmCalls=${llm.calls} llmMemHit=${llm.cacheHits} llmDbHit=${llm.dbHits} llmErrors=${llm.errors} avgLatency=${llm.avgLatencyMs}ms`,
  );
}

function schedule() {
  setTimeout(async () => {
    if (state.inFlight) {
      await state.inFlight.catch(() => undefined);
    } else {
      state.inFlight = runCycle().finally(() => {
        state.inFlight = null;
      });
      await state.inFlight.catch(() => undefined);
    }
    schedule();
  }, FETCH_INTERVAL_MS).unref?.();
}

export function ensureFetcherStarted(): Promise<void> {
  if (state.started) {
    return state.inFlight ?? Promise.resolve();
  }
  state.started = true;
  state.inFlight = runCycle().finally(() => {
    state.inFlight = null;
  });
  schedule();
  return state.inFlight;
}

export function getFetcherStatus() {
  return {
    started: state.started,
    firstCycleCompleted: state.firstCycleCompleted,
    lastRun: state.lastRun,
    lastError: state.lastError,
    sources: allSources().length,
    llmEnabled: hasOpenAIKey(),
    ...state.stats,
  };
}
