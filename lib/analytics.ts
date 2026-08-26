// Single entrypoint for every analytics call in the app. SSR-safe: every
// helper short-circuits when window or window.gtag is missing.
//
// trackEvent automatically attaches behavioural metadata (session_id, page_path,
// timestamp) to every event so call sites only have to think about what
// happened, not who/where/when.

import { getSessionId } from "./analytics-session";

export type GtagEventName =
  // navigation / engagement
  | "page_view"
  | "scroll_depth"
  // session lifecycle
  | "session_start"
  | "session_duration"
  | "session_active_time"
  | "session_idle_time"
  // map interactions
  | "map_zoom_in"
  | "map_zoom_out"
  | "map_pan"
  | "map_mouse_move_intensity"
  | "map_hover_duration"
  // click instrumentation
  | "click_incident_point"
  | "click_news_article"
  | "click_filter_option"
  | "click_sidepanel_item"
  // filter behaviour
  | "filter_applied"
  | "filter_removed"
  | "filter_changed"
  | "filter_used_session"
  // ui exploration
  | "ui_hover_element"
  | "ui_revisit_element"
  | "ui_exploration_pattern"
  // app shell / navigation controls
  | "pwa_install_click"
  | "pwa_installed"
  | "map_reset_view"
  | "toggle_fullscreen"
  | "toggle_feed"
  | "open_sources_panel"
  | "open_settings"
  | "toggle_sound"
  | "toggle_reporter"
  | "select_time_window"
  | "timeline_bucket_click"
  // existing CTA buttons
  | "blog_click"
  | "request_access_click"
  | "start_now_click";

export interface GtagEventParams {
  [key: string]: string | number | boolean | undefined | null;
}

type GtagFn = (
  command: "config" | "event" | "set" | "consent" | "js",
  targetId: string,
  params?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export function isAnalyticsReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

function autoMeta(): Record<string, string | number> {
  if (typeof window === "undefined") return {};
  return {
    session_id: getSessionId(),
    page_path: window.location.pathname,
    ts: Date.now(),
  };
}

export function trackEvent(
  name: GtagEventName,
  params?: GtagEventParams,
): void {
  if (!isAnalyticsReady()) return;
  try {
    window.gtag!("event", name, { ...autoMeta(), ...(params ?? {}) });
  } catch {
    // Never let analytics errors surface to the user.
  }
}

export function trackPageview(path: string, title?: string): void {
  if (!isAnalyticsReady()) return;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return;
  try {
    window.gtag!("config", gaId, {
      page_path: path,
      page_title: title,
      session_id: getSessionId(),
    });
    window.gtag!("event", "page_view", {
      ...autoMeta(),
      page_path: path,
      page_title: title,
    });
  } catch {
    // ignore
  }
}
