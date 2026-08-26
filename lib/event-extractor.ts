import { classify } from "./classifier";
import { findLocation } from "./gazetteer";
import { geocodeOne, resolveBestLocation } from "./geocoder";
import {
  extractWithLlm,
  hasOpenAIKey,
  type ExtractedVector,
} from "./llm-extractor";
import type { EventType, EventVector, FeedItem, WarEvent } from "./types";

/**
 * Pipeline (for each RSS item):
 *
 *   1. Cheap keyword classifier  → drop obvious non-war articles
 *   2. If OPENAI_API_KEY set:
 *        a. Ask the LLM to re-classify, extract ALL explicit locations, and
 *           optionally extract a directional vector (origin → target + mover).
 *        b. Resolve each location via custom gazetteer → Nominatim → country
 *           fallback, and pick the best one for the marker.
 *        c. If a vector was returned, geocode both endpoints and attach.
 *      Else:
 *        Use the legacy gazetteer text-scan as the location resolver.
 *   3. Build a WarEvent and hand it to the store.
 */
// Geolocation validation (issue #5.23/#5.24): reject coordinates that are out
// of range or sit on "null island" (0,0) — a classic geocoding failure that
// would otherwise drop a marker in the Gulf of Guinea.
function isValidCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -85 || lat > 85 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return false;
  return true;
}

export async function extractEvent(item: FeedItem): Promise<WarEvent | null> {
  const text = `${item.title}. ${item.summary}`;
  const keywordResult = classify(text);
  if (!keywordResult.isWar) return null;

  let eventType: EventType = keywordResult.eventType;
  let severity = keywordResult.severity;
  const keywords = keywordResult.keywords;
  let summaryText = item.summary;

  if (hasOpenAIKey()) {
    const llm = await extractWithLlm(item.id, item.title, item.summary);
    if (llm) {
      if (!llm.isWar) return null;
      eventType = llm.eventType;
      severity = Math.max(severity, llm.severity);
      if (llm.brief) summaryText = llm.brief;

      const vector = await resolveVector(llm.vector, item.id);

      if (llm.locations.length > 0) {
        const resolved = await resolveBestLocation(
          llm.locations,
          {},
          { itemId: item.id, source: "primary" },
        );
        if (resolved && isValidCoord(resolved.lat, resolved.lng)) {
          return buildEvent(item, {
            eventType,
            severity,
            keywords,
            location: resolved,
            summary: summaryText,
            vector,
          });
        }
      }
      // Fall through to legacy resolver if the LLM returned locations we
      // couldn't geocode (or returned none at all).
    }
  }

  const legacy = findLocation(item.title, item.summary);
  if (!legacy || !isValidCoord(legacy.lat, legacy.lng)) return null;

  return buildEvent(item, {
    eventType,
    severity,
    keywords,
    location: legacy,
    summary: summaryText,
    vector: null,
  });
}

async function resolveVector(
  raw: ExtractedVector | null,
  itemId: string,
): Promise<EventVector | null> {
  if (!raw) return null;
  const [origin, target] = await Promise.all([
    geocodeOne(
      {
        name: raw.origin.name,
        country: raw.origin.country,
        type: "other",
        confidence: 0.8,
      },
      {},
      { itemId, source: "vector-origin" },
    ),
    geocodeOne(
      {
        name: raw.target.name,
        country: raw.target.country,
        type: "other",
        confidence: 0.8,
      },
      {},
      { itemId, source: "vector-target" },
    ),
  ]);
  if (!origin || !target) return null;
  if (origin.lat === target.lat && origin.lng === target.lng) return null;
  return { origin, target, mover: raw.mover };
}

function buildEvent(
  item: FeedItem,
  parts: {
    eventType: EventType;
    severity: number;
    keywords: string[];
    location: WarEvent["location"];
    summary: string;
    vector: EventVector | null;
  },
): WarEvent {
  return {
    id: item.id,
    title: item.title,
    summary: parts.summary,
    source: item.source,
    sourceUrl: item.link,
    publishedAt: item.publishedAt,
    receivedAt: new Date().toISOString(),
    location: parts.location,
    eventType: parts.eventType,
    severity: parts.severity,
    keywords: parts.keywords,
    vector: parts.vector,
  };
}
