export type EventType =
  | "airstrike"
  | "missile"
  | "drone"
  | "shelling"
  | "ground"
  | "naval"
  | "fire"
  | "casualties"
  | "diplomacy"
  | "cyber"
  | "humanitarian"
  | "other";

export type Confidence = "high" | "medium" | "low";

export interface GeoLocation {
  name: string;
  country: string;
  lat: number;
  lng: number;
  confidence: Confidence;
}

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  summary: string;
}

export type Mover = "missile" | "drone" | "aircraft" | "ship" | "troops" | "other";

export interface EventVector {
  origin: GeoLocation;
  target: GeoLocation;
  mover: Mover;
}

export interface WarEvent {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  receivedAt: string;
  location: GeoLocation;
  eventType: EventType;
  severity: number;
  keywords: string[];
  vector?: EventVector | null;
}

export interface PipelineStatus {
  firstCycleCompleted: boolean;
  cyclesCompleted: number;
  sources: number;
  llmEnabled: boolean;
  lastError: string | null;
}

export interface StreamMessage {
  type: "init" | "event" | "heartbeat" | "status";
  event?: WarEvent;
  events?: WarEvent[];
  status?: PipelineStatus;
  ts: number;
}
