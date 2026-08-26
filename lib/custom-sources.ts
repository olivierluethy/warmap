import fs from "node:fs";
import path from "node:path";
import type { Source } from "./sources";

// Runtime-managed RSS sources (issue #5.13). Persisted to a JSON file under
// .data so administrators can add feeds without a redeploy. Merged with the
// built-in SOURCES by the fetcher on every cycle.

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "custom-sources.json");

const VALID_CATEGORIES: Source["category"][] = ["world", "conflict", "defense"];

function readAll(): Source[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as Source[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(sources: Source[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(sources, null, 2), "utf8");
}

export function getCustomSources(): Source[] {
  return readAll();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface AddSourceInput {
  name: string;
  url: string;
  category?: string;
}

export interface AddSourceResult {
  ok: boolean;
  error?: string;
  source?: Source;
}

// Confirms the URL is reachable and returns feed-like XML before persisting.
export async function addCustomSource(
  input: AddSourceInput,
): Promise<AddSourceResult> {
  const name = (input.name || "").trim();
  const url = (input.url || "").trim();

  if (!name) return { ok: false, error: "Name is required." };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "URL must be http(s)." };
  }

  const category = (
    VALID_CATEGORIES.includes(input.category as Source["category"])
      ? input.category
      : "world"
  ) as Source["category"];

  const existing = readAll();
  if (existing.some((s) => s.url === url)) {
    return { ok: false, error: "That feed is already added." };
  }

  // Validate that the URL actually serves a feed.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "WarmapBot/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `Feed returned HTTP ${res.status}.` };
    }
    const text = (await res.text()).slice(0, 4000);
    if (!/<rss|<feed|<rdf|<channel/i.test(text)) {
      return { ok: false, error: "URL does not look like an RSS/Atom feed." };
    }
  } catch {
    return { ok: false, error: "Could not fetch the feed URL." };
  }

  let id = slugify(name) || slugify(parsed.hostname);
  const ids = new Set(existing.map((s) => s.id));
  if (ids.has(id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;

  const source: Source = { id, name, url, category };
  writeAll([...existing, source]);
  return { ok: true, source };
}

export function removeCustomSource(id: string): boolean {
  const existing = readAll();
  const next = existing.filter((s) => s.id !== id);
  if (next.length === existing.length) return false;
  writeAll(next);
  return true;
}
