export interface Source {
  id: string;
  name: string;
  url: string;
  category: "world" | "conflict" | "defense";
}

export const SOURCES: Source[] = [
  {
    id: "bbc-world",
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "world",
  },
  {
    id: "reuters-world",
    name: "Reuters World",
    url: "https://www.reutersagency.com/feed/?best-topics=world&post_type=best",
    category: "world",
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "world",
  },
  {
    id: "guardian-world",
    name: "The Guardian — World",
    url: "https://www.theguardian.com/world/rss",
    category: "world",
  },
  {
    id: "guardian-ukraine",
    name: "The Guardian — Ukraine",
    url: "https://www.theguardian.com/world/ukraine/rss",
    category: "conflict",
  },
  {
    id: "guardian-israel",
    name: "The Guardian — Israel",
    url: "https://www.theguardian.com/world/israel/rss",
    category: "conflict",
  },
  {
    id: "kyiv-independent",
    name: "Kyiv Independent",
    url: "https://kyivindependent.com/rss/",
    category: "conflict",
  },
  {
    id: "dw-world",
    name: "Deutsche Welle",
    url: "https://rss.dw.com/rdf/rss-en-world",
    category: "world",
  },
  {
    id: "france24",
    name: "France 24",
    url: "https://www.france24.com/en/rss",
    category: "world",
  },
  {
    id: "npr-world",
    name: "NPR World",
    url: "https://feeds.npr.org/1004/rss.xml",
    category: "world",
  },

  // ── Competition / regional sources (issue #6) ──────────────────────────
  // Feed URLs verified to return valid RSS/Atom. Non-English outlets are
  // included as-is; the pipeline handles them gracefully and skips any feed
  // that fails to fetch.
  {
    id: "kyiv-post",
    name: "Kyiv Post",
    url: "https://www.kyivpost.com/feed",
    category: "conflict",
  },
  {
    id: "meduza",
    name: "Meduza (EN)",
    url: "https://meduza.io/rss/en/all",
    category: "world",
  },
  {
    id: "ukrinform",
    name: "Ukrinform",
    url: "https://www.ukrinform.net/rss/block-lastnews",
    category: "conflict",
  },
  {
    id: "pravda-ua",
    name: "Ukrainska Pravda (EN)",
    url: "https://www.pravda.com.ua/eng/rss/",
    category: "conflict",
  },
  {
    id: "interfax-ru",
    name: "Interfax (RU)",
    url: "https://www.interfax.ru/rss",
    category: "world",
  },
  {
    id: "espreso-tv",
    name: "Espreso TV",
    url: "https://espreso.tv/rss",
    category: "conflict",
  },
  {
    id: "tvn24",
    name: "TVN24 (PL)",
    url: "https://tvn24.pl/najnowsze.xml",
    category: "world",
  },
  {
    id: "tass",
    name: "TASS",
    url: "https://tass.com/rss/v2.xml",
    category: "world",
  },
  {
    id: "the-hindu-world",
    name: "The Hindu — International",
    url: "https://www.thehindu.com/news/international/feeder/default.rss",
    category: "world",
  },
  {
    id: "zeit-online",
    name: "Zeit Online (DE)",
    url: "https://newsfeed.zeit.de/index",
    category: "world",
  },
  {
    id: "le-monde",
    name: "Le Monde (FR)",
    url: "https://www.lemonde.fr/rss/une.xml",
    category: "world",
  },
  {
    id: "allafrica",
    name: "AllAfrica",
    url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf",
    category: "world",
  },
  {
    id: "anadolu",
    name: "Anadolu Agency (EN)",
    url: "https://www.aa.com.tr/en/rss/default?cat=world",
    category: "world",
  },
  {
    id: "iran-intl",
    name: "Iran International",
    url: "https://www.iranintl.com/feed",
    category: "conflict",
  },
  {
    id: "npa-syria",
    name: "North Press Agency (Syria)",
    url: "https://npasyria.com/en/feed/",
    category: "conflict",
  },
  // ── Under-represented regions (issues #20, #29): strengthen Africa and
  // wider Middle East coverage so those developments aren't overlooked.
  {
    id: "africanews",
    name: "Africanews",
    url: "https://www.africanews.com/feed/rss",
    category: "world",
  },
  {
    id: "middle-east-eye",
    name: "Middle East Eye",
    url: "https://www.middleeasteye.net/rss",
    category: "conflict",
  },
  {
    id: "sudan-tribune",
    name: "Sudan Tribune",
    url: "https://sudantribune.com/feed/",
    category: "conflict",
  },
];
