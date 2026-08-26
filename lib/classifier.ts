import type { EventType } from "./types";

// Strong signals: a single mention is sufficient to classify as war-related.
const STRONG_KEYWORDS = [
  "airstrike", "air strike", "air raid", "air-raid",
  "missile", "missiles", "ballistic", "cruise missile",
  "drone strike", "drone attack", "shahed", "kamikaze drone",
  "artillery", "shelling", "shelled", "mortar fire",
  "rocket attack", "rockets fired", "rocket fire",
  "airstrikes", "struck", "hit by",
  "offensive", "counter-offensive", "counteroffensive",
  "invasion", "invaded",
  "ceasefire", "truce",
  "captured", "liberated",
  "siege", "besieged",
  "hostage", "hostages",
  "genocide", "massacre", "atrocity",
  "warplane", "warplanes", "fighter jet", "fighter jets",
  "frontline", "front line",
  "terror attack", "terrorist attack",
  "suicide bomb", "car bomb", "roadside bomb", "ied",
  "militant", "militants", "insurgent", "insurgents", "paramilitary",
  "hezbollah", "hamas", "idf", "houthi", "houthis",
  "wagner group", "rsf", "al-shabaab", "boko haram",
  "shelled", "bombarded",
  // Major wildfires / conflict-related fires (issue #5.34, #2).
  "wildfire", "wildfires", "forest fire", "bushfire", "firefighters battling",
];

// Weak signals: need to co-occur with another signal to count.
const WEAK_KEYWORDS = [
  "war", "conflict", "battle",
  "military", "army", "forces",
  "troops", "soldier", "soldiers",
  "killed", "wounded", "casualties", "dead", "fatalities",
  "attack", "attacks", "attacked", "assault",
  "bomb", "bombs", "bombing", "bombed",
  "strike", "strikes",
  "explosion", "explosions", "blast",
  "refugee", "refugees", "displaced",
  "clash", "clashes", "clashed",
  "combat", "combatant", "combatants",
  "drone", "drones", "uav",
  "tank", "tanks",
  "naval", "navy",
  "fire", "fires", "blaze", "wildfire", "flames", "burning", "inferno",
  "tanker", "warship",
  "speech", "address", "press conference",
];

// Headlines that usually aren't war events even if keywords fire.
const NEGATIVE_HEADLINE_PATTERNS = [
  /\b(premier league|champions league|world cup|olympic|grammy|oscar|golden globe)\b/i,
  /\b(box office|eurovision|celebrity gossip|vibecession)\b/i,
  /\b(stock market|earnings report|ipo|dividend)\b/i,
  /\b(retail sales|house prices|inflation report)\b/i,
  /\b(weather forecast|hurricane forecast)\b/i,
];

const EVENT_TYPE_RULES: Array<{ type: EventType; patterns: RegExp[] }> = [
  { type: "airstrike", patterns: [/\b(air[- ]?strike|air raid|airstrikes|bombing raid|bombed|warplane|fighter jet)\b/i] },
  { type: "missile", patterns: [/\b(missile|ballistic|cruise missile|iskander|kinzhal|tomahawk|patriot)\b/i] },
  { type: "drone", patterns: [/\b(drone strike|drone attack|drones|shahed|loitering munition|kamikaze drone|uav)\b/i] },
  { type: "shelling", patterns: [/\b(artillery|shelling|shelled|mortar|rocket fire|rockets fired|grad|himars|bombardment)\b/i] },
  { type: "ground", patterns: [/\b(ground offensive|counter[- ]?offensive|captured|liberated|frontline|front line|tank|tanks|infantry|advance)\b/i] },
  { type: "naval", patterns: [/\b(navy|naval|warship|frigate|destroyer|submarine|red sea|black sea fleet|corvette|strait of hormuz|tanker)\b/i] },
  { type: "fire", patterns: [/\b(wildfire|wildfires|forest fire|bushfire|blaze|inferno|firefighters?|flames|wall of fire)\b/i] },
  { type: "casualties", patterns: [/\b(killed|dead|wounded|casualties|death toll|injured|fatalities|bodies)\b/i] },
  { type: "diplomacy", patterns: [/\b(ceasefire|truce|peace talks|sanction|summit|un resolution|diplomatic|envoy|speech|address to the nation|press conference|declares?)\b/i] },
  { type: "cyber", patterns: [/\b(cyberattack|cyber attack|hacked|hackers|ransomware|ddos)\b/i] },
  { type: "humanitarian", patterns: [/\b(refugee|refugees|displaced|aid convoy|humanitarian|famine|blockade|hospital|wfp|unicef)\b/i] },
];

export interface ClassificationResult {
  isWar: boolean;
  eventType: EventType;
  severity: number;
  keywords: string[];
}

function containsWord(hay: string, word: string): boolean {
  const w = word.toLowerCase();
  if (w.includes(" ") || w.includes("-")) return hay.includes(w);
  const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(hay);
}

export function classify(text: string): ClassificationResult {
  const lower = text.toLowerCase();

  for (const re of NEGATIVE_HEADLINE_PATTERNS) {
    if (re.test(text)) {
      return { isWar: false, eventType: "other", severity: 0, keywords: [] };
    }
  }

  const strong = STRONG_KEYWORDS.filter((k) => containsWord(lower, k));
  const weak = WEAK_KEYWORDS.filter((k) => containsWord(lower, k));

  // Require a strong keyword, OR at least two weak keywords co-occurring.
  const isWar = strong.length >= 1 || weak.length >= 2;
  if (!isWar) {
    return { isWar: false, eventType: "other", severity: 0, keywords: [] };
  }

  let eventType: EventType = "other";
  for (const rule of EVENT_TYPE_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      eventType = rule.type;
      break;
    }
  }

  const lethal = /\b(killed|dead|casualt|massacre|genocide|wounded|fatalities)\b/i.test(text);
  const severity = Math.min(
    10,
    strong.length * 2 + weak.length + (lethal ? 3 : 0),
  );

  const keywords = [...new Set([...strong, ...weak])].slice(0, 6);
  return { isWar: true, eventType, severity, keywords };
}
