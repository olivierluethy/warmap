"use client";

// Client-only alert effects for new incidents: a synthesized alert chime
// (issue #5.9 — event sounds) and a spoken "live reporter" announcement
// (#5.10/#5.11 — breaking-news TTS). Both are best-effort and degrade
// silently when the browser lacks the API or blocks autoplay/audio.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// Some browsers start the AudioContext suspended until a user gesture. Call
// this from a click handler (e.g. the settings toggle) to unlock playback.
export function primeAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

// A short two-tone chime. Higher severity → brighter, more urgent pitch.
export function playAlertSound(severity: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    const base = severity >= 7 ? 880 : severity >= 5 ? 660 : 520;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.setValueAtTime(base * 1.5, now + 0.14);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.56);
  } catch {
    // Audio can fail on locked contexts — ignore.
  }
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Speaks a concise breaking-news line. Cancels any queued utterance so rapid
// arrivals don't pile up into an unintelligible backlog.
export function announce(text: string): void {
  if (!speechSupported()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    u.volume = 1;
    synth.speak(u);
  } catch {
    // TTS unavailable — ignore.
  }
}

export function stopAnnouncing(): void {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
