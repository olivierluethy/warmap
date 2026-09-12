<div align="center">
  <img src="public/logo.png" alt="warmap logo" width="140" />
  <h1>warmap</h1>
  <p><b>A live map of conflict and incident news, built from trusted RSS feeds.</b><br/>Ingests news, extracts and geolocates events with an LLM, and plots them on an interactive map with a timeline.</p>
  <p>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript">
    <img alt="Leaflet" src="https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet">
    <img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-003b57?logo=sqlite">
  </p>
</div>

---

warmap pulls headlines from a curated set of trusted news RSS feeds, uses an LLM plus a built-in gazetteer
and geocoder to work out *what* happened and *where*, classifies each event, and plots it on a live
Leaflet map. A timeline, filterable sidebar and per-incident detail let you scan the current picture and
drill into individual reports and their sources.

Events are cached in a local SQLite database and streamed to the browser over Server-Sent Events, so the
map stays current and restarts don't re-spam the LLM.

## Features

- **Trusted-source ingestion** — a curated RSS source list (BBC World, Reuters, Al Jazeera, The Guardian
  and more), with support for user-added custom sources.
- **LLM event extraction** — decides whether an item is a conflict/incident event, assigns an event type
  (airstrike, missile, drone, shelling, ground, naval, casualties, diplomacy, cyber, humanitarian…),
  a severity score and a short brief, and pulls out locations and movement vectors.
- **Gazetteer + geocoding** — resolves place names through a local gazetteer, then Nominatim
  (OpenStreetMap), rejecting country-sized hits for city/base-level locations. Results are cached with a
  version prefix so cache rules can be invalidated cleanly.
- **Interactive map** — Leaflet/react-leaflet with event styling by type and severity, a legend, and map
  controls.
- **Timeline & sidebar** — filter events by time window and type; open incident detail with sources.
- **Report export** — group and export the current event set.
- **Live updates** — an SSE stream (`/api/events/stream`) pushes new events without a refresh.
- **Local SQLite store** — `better-sqlite3` caches LLM extractions and geocodes and persists the event
  list (re-hydrated on boot).
- **Blog, SEO & PWA** — a Markdown-backed blog, `sitemap.xml`, `robots`, analytics, and an installable PWA
  (`manifest`, service worker) with an install button.

## Tech stack

| Area          | Technology                                                          |
|---------------|---------------------------------------------------------------------|
| Framework     | Next.js 16 (App Router), React 19, TypeScript 5                     |
| Map           | Leaflet + react-leaflet                                             |
| Storage       | `better-sqlite3` (file-backed SQLite in `.data/warmap.db`)          |
| Extraction    | OpenAI Chat Completions API + local gazetteer                       |
| Geocoding     | Nominatim (OpenStreetMap)                                           |
| Styling       | Tailwind CSS v4                                                     |

## Getting started

### Prerequisites

- Node.js 18+ and a package manager (npm, pnpm or yarn)

### Install and run

```bash
npm install
npm run dev        # start the dev server at http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # run ESLint
```

The SQLite database is created automatically under `.data/` on first run.

### Environment variables

All variables are optional. Without an LLM key, extraction is skipped; set `OPENAI_API_KEY` to enable the
full pipeline.

```bash
# LLM extraction (OpenAI Chat Completions). Extraction is disabled if unset.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini          # optional; defaults to gpt-4o-mini

# Max concurrent LLM extraction jobs in the background fetcher (default 4).
WARMAP_EXTRACTOR_CONCURRENCY=4

# Analytics / SEO (optional).
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_SITE_URL=
```

### Data sources

The default feeds live in `lib/sources.ts`. Add or remove entries there, or let users add their own via the
in-app sources panel (backed by `lib/custom-sources.ts` and the `/api/sources` route). Geocoding uses the
public Nominatim service — please respect its usage policy (the client is already throttled to ~1 request
per second).

## License

Released under the [MIT License](LICENSE) © 2026 Olivier Lüthy. You're free to use, modify and distribute this
software, including commercially, as long as the copyright notice and license are included.

## Author

Built by **Olivier Lüthy** — [GitHub](https://github.com/olivierluethy).
