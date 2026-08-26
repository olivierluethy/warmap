"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// Chrome/Edge fire `beforeinstallprompt` with a prompt() we can defer and
// trigger from our own button. Safari/iOS never fire it, so there we fall
// back to "Add to Home Screen" instructions instead. (issue #3 / #5.1)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes standalone on navigator instead of matchMedia.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function InstallButton() {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Register the service worker (required for installability).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Registration can fail on http:// or in private mode — non-fatal.
      });
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const iOS =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(iOS);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanPrompt(false);
      deferredRef.current = null;
      trackEvent("pwa_installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = async () => {
    trackEvent("pwa_install_click", { platform: isIOS ? "ios" : "web" });

    if (isIOS) {
      setShowIosHelp((v) => !v);
      return;
    }

    const deferred = deferredRef.current;
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    trackEvent("pwa_install_click", {
      platform: "web",
      outcome: choice.outcome,
    });
    if (choice.outcome === "accepted") {
      setCanPrompt(false);
    }
    deferredRef.current = null;
  };

  // Nothing to offer: already installed, or a browser that can't install and
  // isn't iOS (so no instructions to show either).
  if (installed) return null;
  if (!canPrompt && !isIOS) return null;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        aria-haspopup={isIOS ? "dialog" : undefined}
        aria-expanded={isIOS ? showIosHelp : undefined}
        className="flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200 backdrop-blur-xl transition hover:bg-sky-500/15"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Install app
      </button>

      {isIOS && showIosHelp && (
        <div
          role="dialog"
          aria-label="Install instructions"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-[12px] leading-relaxed text-zinc-300 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          To install Warmap, tap the{" "}
          <span aria-label="Share" className="font-semibold text-zinc-100">
            Share
          </span>{" "}
          button in Safari, then choose{" "}
          <span className="font-semibold text-zinc-100">
            &ldquo;Add to Home Screen&rdquo;
          </span>
          .
        </div>
      )}
    </div>
  );
}
