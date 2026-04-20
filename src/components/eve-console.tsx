"use client";

import Image from "next/image";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  FormEvent,
  startTransition,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { EveAvatar } from "@/components/eve-avatar";
import type { ConversationState } from "@/lib/conversation-state";
import { desktopCapabilityCards } from "@/lib/desktop-capabilities";
import type { ClientAction } from "@/lib/eve-tools";
import { createOptionalClient } from "@/lib/supabase/client";

type Presence = "ready" | "thinking" | "speaking" | "error";
type Mood = "warm" | "curious" | "focused" | "alert";
type ModelMode = "live" | "offline";
type DesktopRuntime = {
  isDesktop: boolean;
  platform: string;
  appVersion: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent?: string;
};

type ActiveSpeech = {
  messageId: string;
  text: string;
};

type ActiveVideo = {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
};

const quickPrompts = [
  "Give me a morning home brief with weather, calendar, bills, and deliveries.",
  "Find subscriptions and bills I should review this week.",
  "Turn my household inbox into action items and reminders.",
  "Help me compare the best option for a home purchase and savings plan.",
];

const introMessage =
  "I'm Eve. I run the admin of your home: inboxes, schedules, bills, subscriptions, devices, and the loose ends in your digital life.";

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferMood(text: string): Mood {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("risk") ||
    normalized.includes("warning") ||
    normalized.includes("urgent") ||
    normalized.includes("problem")
  ) {
    return "alert";
  }

  if (
    normalized.includes("explore") ||
    normalized.includes("option") ||
    normalized.includes("could") ||
    normalized.includes("what if")
  ) {
    return "curious";
  }

  if (
    normalized.includes("plan") ||
    normalized.includes("step") ||
    normalized.includes("next") ||
    normalized.includes("do this")
  ) {
    return "focused";
  }

  return "warm";
}

function selectVoice(voices: SpeechSynthesisVoice[]) {
  const rankedNames = [
    "Google US English",
    "Samantha",
    "Ava",
    "Jenny",
    "Aria",
    "Female",
  ];

  const englishVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("en"),
  );

  for (const name of rankedNames) {
    const match = englishVoices.find((voice) =>
      voice.name.toLowerCase().includes(name.toLowerCase()),
    );

    if (match) {
      return match;
    }
  }

  return englishVoices[0];
}

// ── Activation chime ──────────────────────────────────────────────────────
// Two rising tones played via Web Audio API when the mic switches to LISTENING.
function playChime() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC() as AudioContext;
    const now = ctx.currentTime;
    // A5 (880 Hz) → E6 (1320 Hz), each note 380 ms with soft attack & exponential fade
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.28, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38);
      osc.start(t0);
      osc.stop(t0 + 0.38);
    });
    window.setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 700);
  } catch { /* AudioContext unavailable — skip chime */ }
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-white" : "text-current"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 1 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function EveConsole() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "eve-intro",
      role: "assistant",
      content: introMessage,
      displayContent: introMessage,
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Presence>("ready");
  const [mood, setMood] = useState<Mood>("warm");
  const [visemeLevel, setVisemeLevel] = useState(0.16);
  const [muted, setMuted] = useState(false);
  const [modelMode, setModelMode] = useState<ModelMode>("live");
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntime | null>(
    null,
  );
  const [liveExcerpt, setLiveExcerpt] = useState(introMessage);
  const [recentActions, setRecentActions] = useState<ClientAction[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>({
    pendingMediaSelection: null,
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{ url: string; prompt: string } | null>(null);
  const [activeVideo, setActiveVideo] = useState<ActiveVideo | null>(null);
  const [desktopTranscriptOpen, setDesktopTranscriptOpen] = useState(false);
  // When Chrome blocks window.open (async context), store url here so user can tap it
  const [pendingUrl, setPendingUrl] = useState<{ url: string; label: string } | null>(null);
  // Voice mode: off | standby (wake-word listener) | listening (active recording)
  const [voiceState, setVoiceState] = useState<"off" | "standby" | "listening">("standby");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [silenceProgress, setSilenceProgress] = useState(0); // 0–1 countdown before auto-submit

  // ── Voice machine refs ─────────────────────────────────────────────────────
  // Clean 3-state machine: standby (wake word) → listening → standby
  const voiceStateRef = useRef<"off" | "standby" | "listening">("standby");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRecRef = useRef<any>(null);        // active wake-word SpeechRecognition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeRecRef = useRef<any>(null);      // active listening SpeechRecognition
  const sessionIdRef = useRef(0);             // incremented on every new session
  const wakeLastEventRef = useRef(0);         // last onstart/onerror/onend from wake rec
  const wakeActiveRef = useRef(false);        // true after wake rec fires onstart
  const finalTextRef = useRef("");            // accumulated final transcript
  const interimTranscriptRef = useRef("");    // current interim (also drives UI)
  const lastSpeechRef = useRef(0);           // Date.now() of last onresult
  const listenStartRef = useRef(0);          // Date.now() when active listening began
  const hadSpeechRef = useRef(false);        // heard real words this session?
  const silenceTimerRef = useRef<number | null>(null);  // setInterval silence check
  const wakeWatchdogRef = useRef<number | null>(null);  // setInterval health check
  const postReplyTimerRef = useRef<number | null>(null);
  const externalWindowRef = useRef<Window | null>(null);
  const micReadyRef = useRef(false);
  const micInitPromiseRef = useRef<Promise<boolean> | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const transcriptBoxRef = useRef<HTMLDivElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const userScrolledRef = useRef(false);
  const speechEnergyRef = useRef(0);
  const mouthRafRef = useRef<number | null>(null);
  const mouthStartRef = useRef(0);
  const activeSpeechRef = useRef<ActiveSpeech | null>(null);

  const messageCount = messages.length;
  useEffect(() => {
    if (!userScrolledRef.current) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messageCount]);

  // Auth state
  useEffect(() => {
    const supabase = createOptionalClient();
    if (!supabase) {
      setUserEmail(null);
      return;
    }

    void (async () => {
      const result = await supabase.auth.getUser();
      setUserEmail(result.data.user?.email ?? null);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUserEmail(session?.user?.email ?? null);
      },
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDesktopRuntime() {
      try {
        const runtime = await window.eveDesktop?.getRuntimeInfo?.();
        if (active && runtime?.isDesktop) {
          setDesktopRuntime(runtime);
        }
      } catch {
        if (active) {
          setDesktopRuntime(null);
        }
      }
    }

    void loadDesktopRuntime();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!desktopRuntime?.isDesktop) return;

    void (async () => {
      const ready = await ensureMicrophoneReady(true);
      if (!ready || voiceStateRef.current === "listening") return;
      stopListening();
      setVoiceSynced("standby");
      window.setTimeout(startWakeWordListener, 150);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopRuntime?.isDesktop]);

  // Auto-start wake word listener on mount
  useEffect(() => {
    startWakeWordListener();
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (fallbackTimerRef.current) window.clearInterval(fallbackTimerRef.current);
      if (wakeWatchdogRef.current) window.clearInterval(wakeWatchdogRef.current);
      if (mouthRafRef.current) cancelAnimationFrame(mouthRafRef.current);
      if (silenceTimerRef.current) window.clearInterval(silenceTimerRef.current);
      if (postReplyTimerRef.current) window.clearTimeout(postReplyTimerRef.current);
      try { wakeRecRef.current?.stop(); } catch { /* ignore */ }
      try { activeRecRef.current?.stop(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function revive() {
      if (voiceStateRef.current === "standby" && !wakeRecRef.current) {
        startWakeWordListener();
      }
    }
    window.addEventListener("focus", revive);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revive();
    });

    // Watchdog: every 6s check wake rec health — restart if stuck or dead
    wakeWatchdogRef.current = window.setInterval(() => {
      if (voiceStateRef.current !== "standby") return;
      const now = Date.now();
      const noRef = !wakeRecRef.current;
      const stuckStart = !!wakeRecRef.current && !wakeActiveRef.current && (now - wakeLastEventRef.current) > 8_000;
      const silentDead = !!wakeRecRef.current && wakeActiveRef.current && (now - wakeLastEventRef.current) > 50_000;
      if (noRef || stuckStart || silentDead) {
        const old = wakeRecRef.current;
        wakeRecRef.current = null;
        wakeActiveRef.current = false;
        try { old?.stop(); } catch { /* ignore */ }
        window.setTimeout(startWakeWordListener, 300);
      }
    }, 6000);

    return () => {
      window.removeEventListener("focus", revive);
      if (wakeWatchdogRef.current) {
        window.clearInterval(wakeWatchdogRef.current);
        wakeWatchdogRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateMessageDisplay(_messageId: string, nextText: string) {
    if (nextText) {
      setLiveExcerpt(nextText);
    }
  }

  function startMouthAnimation() {
    if (mouthRafRef.current) return;
    mouthStartRef.current = performance.now();

    const tick = (now: number) => {
      const energy = speechEnergyRef.current;
      if (energy < 0.06) {
        setVisemeLevel(0.1);
        mouthRafRef.current = null;
        return;
      }
      const t = now - mouthStartRef.current;
      // Multi-harmonic oscillation: syllable(4.5Hz) + word(2Hz) + phoneme(10Hz) + detail(7.2Hz)
      const osc =
        Math.sin(t * 0.02827) * 0.50 +
        Math.sin(t * 0.01257) * 0.25 +
        Math.sin(t * 0.06283 + 0.8) * 0.15 +
        Math.sin(t * 0.04524 + 2.1) * 0.10;
      const normalized = (osc + 1) / 2; // 0–1
      setVisemeLevel(Math.min(1, 0.1 + energy * normalized * 0.9));
      speechEnergyRef.current *= 0.978; // ~50% decay per 300ms at 60fps
      mouthRafRef.current = requestAnimationFrame(tick);
    };

    mouthRafRef.current = requestAnimationFrame(tick);
  }

  function boostMouthEnergy(sample: string) {
    const vowels = sample.match(/[aeiouy]/gi)?.length ?? 1;
    const boost = Math.min(1, 0.55 + vowels * 0.12);
    speechEnergyRef.current = Math.max(speechEnergyRef.current, boost);
    startMouthAnimation();
  }

  // After Eve finishes speaking, open a 3.5s re-listen window.
  // After Eve finishes speaking, open a short post-reply window.
  // User speaks → full active listen. Silence → wake word back on.
  function startPostReplyListen() {
    if (voiceStateRef.current !== "standby") return;
    // 350 ms gap lets Chrome's audio engine fully release after TTS ends.
    // Store handle in postReplyTimerRef so stopListening() can cancel it
    // if something else (manual tap, new wake word, etc.) fires first.
    postReplyTimerRef.current = window.setTimeout(() => {
      postReplyTimerRef.current = null;
      if (voiceStateRef.current !== "standby") return;
      startListening("", 3500); // 3.5 s initial window after Eve's reply
    }, 350);
  }

  function finishPlayback(messageId: string, fullText: string) {
    activeSpeechRef.current = null;
    speechEnergyRef.current = 0;
    updateMessageDisplay(messageId, fullText);
    setStatus("ready");
    setMood(inferMood(fullText));
    setLiveExcerpt(fullText);
    startPostReplyListen();
  }

  function cancelPlayback(finalizeActiveMessage = true) {
    if (finalizeActiveMessage && activeSpeechRef.current) {
      updateMessageDisplay(
        activeSpeechRef.current.messageId,
        activeSpeechRef.current.text,
      );
    }

    activeSpeechRef.current = null;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (fallbackTimerRef.current) {
      window.clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (mouthRafRef.current) {
      cancelAnimationFrame(mouthRafRef.current);
      mouthRafRef.current = null;
    }
    speechEnergyRef.current = 0;
  }

  function runSilentReveal(messageId: string, text: string) {
    cancelPlayback(false);
    activeSpeechRef.current = { messageId, text };
    setStatus("speaking");
    setMood("warm");
    setLiveExcerpt(text);

    speechEnergyRef.current = 0.85;
    startMouthAnimation();

    let cursor = 0;

    fallbackTimerRef.current = window.setInterval(() => {
      cursor = Math.min(text.length, cursor + Math.max(3, Math.ceil(text.length / 36)));
      const sample = text.slice(Math.max(0, cursor - 12), cursor);
      boostMouthEnergy(sample);

      if (cursor >= text.length) {
        if (fallbackTimerRef.current) {
          window.clearInterval(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }

        finishPlayback(messageId, text);
      }
    }, 44);
  }

  function speakReply(messageId: string, text: string) {
    cancelPlayback();
    activeSpeechRef.current = { messageId, text };
    setLiveExcerpt(text);

    if (typeof window === "undefined" || !("speechSynthesis" in window) || muted) {
      runSilentReveal(messageId, text);
      return;
    }

    let recovered = false;

    const utterance = new SpeechSynthesisUtterance(text);
    const preferredVoice = selectVoice(window.speechSynthesis.getVoices());

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.pitch = 1.06;
    utterance.rate = 1.02;

    utterance.onstart = () => {
      setStatus("speaking");
      setMood("warm");
      speechEnergyRef.current = 0.85;
      startMouthAnimation();
    };

    utterance.onboundary = (event) => {
      boostMouthEnergy(text.slice(Math.max(0, event.charIndex - 4), event.charIndex + 12));
    };

    utterance.onerror = () => {
      if (recovered) {
        return;
      }

      recovered = true;
      runSilentReveal(messageId, text);
    };

    utterance.onend = () => {
      if (recovered) {
        return;
      }

      finishPlayback(messageId, text);
    };

    window.speechSynthesis.speak(utterance);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getSR(): any | null {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  function setVoiceSynced(state: "off" | "standby" | "listening") {
    voiceStateRef.current = state;
    setVoiceState(state);
  }

  async function ensureMicrophoneReady(quiet = false) {
    if (micReadyRef.current) return true;
    if (typeof window === "undefined") return false;

    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(
      navigator.mediaDevices,
    );
    if (!getUserMedia) return true;

    if (micInitPromiseRef.current) {
      return micInitPromiseRef.current;
    }

    micInitPromiseRef.current = getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        micReadyRef.current = true;
        return true;
      })
      .catch((error: unknown) => {
        const name =
          typeof error === "object" &&
          error &&
          "name" in error &&
          typeof error.name === "string"
            ? error.name
            : "MicrophoneError";

        if (!quiet) {
          if (
            name === "NotAllowedError" ||
            name === "PermissionDeniedError"
          ) {
            appendAssistantNote(
              "Rovik needs microphone access in the desktop app. Check Windows microphone permissions, then try the mic again.",
              "alert",
            );
          } else if (name === "NotFoundError") {
            appendAssistantNote(
              "Rovik couldn't find a working microphone on this device. Check the Windows input device and try again.",
              "alert",
            );
          } else {
            appendAssistantNote(
              `Rovik couldn't start the microphone (${name}). Check the Windows input device and try again.`,
              "alert",
            );
          }
        }

        if (
          name === "NotAllowedError" ||
          name === "PermissionDeniedError"
        ) {
          setVoiceSynced("off");
        }

        return false;
      })
      .finally(() => {
        micInitPromiseRef.current = null;
      });

    return micInitPromiseRef.current;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE MACHINE  (rebuilt — clean 3-state loop)
  //
  //  STANDBY  →  wake word detected  →  LISTENING
  //  LISTENING  →  silence after speech  →  submit  →  STANDBY
  //  After TTS  →  startPostReplyListen  →  LISTENING (3s window)
  //  LISTENING with no speech in window  →  STANDBY (wake word back on)
  // ══════════════════════════════════════════════════════════════════════════

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isWord(t: string) {
    return t.replace(/[^a-z0-9]/gi, "").length >= 2;
  }

  function stopSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setSilenceProgress(0);
  }

  // ── Active listening ───────────────────────────────────────────────────────

  function stopListening() {
    sessionIdRef.current++;            // invalidate all in-flight callbacks
    stopSilenceTimer();
    if (postReplyTimerRef.current) { window.clearTimeout(postReplyTimerRef.current); postReplyTimerRef.current = null; }
    activeRecRef.current?.stop();
    activeRecRef.current = null;
    finalTextRef.current = "";
    interimTranscriptRef.current = "";
    lastSpeechRef.current = 0;
    listenStartRef.current = 0;
    hadSpeechRef.current = false;
    setInterimTranscript("");
  }

  function goIdle() {
    stopListening();
    setVoiceSynced("standby");
    window.setTimeout(startWakeWordListener, 300);
  }

  function doSubmit() {
    // interimTranscriptRef is always finalText + currentInterim — use it directly.
    // Do NOT concat finalTextRef again or the text is doubled ("open YouTube  open YouTube").
    const text = interimTranscriptRef.current.trim();
    stopListening();
    setVoiceSynced("standby");
    // Don't start wake word yet — finishPlayback will call startPostReplyListen
    if (text) void submitPrompt(text);
    else window.setTimeout(startWakeWordListener, 300); // nothing to submit → back to idle
  }

  function startListening(seedText: string, initialWindowMs: number) {
    const SR = getSR();
    if (!SR || voiceStateRef.current === "off") return;

    // Stop wake word before starting active rec (Chrome: one SR at a time)
    const oldWake = wakeRecRef.current;
    wakeRecRef.current = null;
    wakeActiveRef.current = false;
    try { oldWake?.stop(); } catch { /* ignore */ }

    stopListening();
    const sid = sessionIdRef.current; // use id AFTER stopListening incremented it

    setVoiceSynced("listening");
    const seed = seedText.trim();
    finalTextRef.current = seed ? seed + " " : "";
    interimTranscriptRef.current = seed;
    hadSpeechRef.current = isWord(seed);
    setInterimTranscript(seed);
    setPrompt(seed);

    // ── CRITICAL: seed the timestamps NOW so the interval's first tick
    // doesn't see listenStartRef=0 / lastSpeechRef=0 (which are unix-epoch-0,
    // ~1.7 trillion ms ago) and immediately compute p=1 → goIdle/doSubmit.
    // Chrome fires rec.onstart ~100–500ms after rec.start(); these defaults
    // hold the fort until then, and onstart refines them to the actual mic-open time.
    const seedTime = Date.now();
    listenStartRef.current = seedTime;
    lastSpeechRef.current = seedTime;

    // ── Silence detection (interval, 200ms ticks) ──────────────────────────
    // Phase 1 — waiting for first word: abandon after initialWindowMs
    // Phase 2 — had speech: submit after 2500ms trailing silence
    const TRAILING_MS = 2500;
    silenceTimerRef.current = window.setInterval(() => {
      if (sessionIdRef.current !== sid || voiceStateRef.current !== "listening") {
        stopSilenceTimer(); return;
      }
      const now = Date.now();
      if (!hadSpeechRef.current) {
        const p = Math.min(1, (now - listenStartRef.current) / initialWindowMs);
        setSilenceProgress(p);
        if (p >= 1) { stopSilenceTimer(); goIdle(); }
      } else {
        const p = Math.min(1, (now - lastSpeechRef.current) / TRAILING_MS);
        setSilenceProgress(p);
        if (p >= 1) { stopSilenceTimer(); doSubmit(); }
      }
    }, 200);

    // ── SpeechRecognition instance ─────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      if (sessionIdRef.current !== sid) return;
      const now = Date.now();
      lastSpeechRef.current = now;  // reset clock from when mic is truly live
      listenStartRef.current = now;
      playChime(); // 🔔 ring when mic goes live
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      if (sessionIdRef.current !== sid || voiceStateRef.current !== "listening") return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { finalTextRef.current += t + " "; if (isWord(t)) hadSpeechRef.current = true; }
        else { interim += t; if (isWord(t)) hadSpeechRef.current = true; }
      }
      lastSpeechRef.current = Date.now();
      const full = finalTextRef.current + interim;
      interimTranscriptRef.current = full;
      setInterimTranscript(full);
      setPrompt(full.trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (sessionIdRef.current !== sid) return;
      if (e.error === "aborted" || e.error === "no-speech") return; // onend handles
      if (e.error === "audio-capture") {
        appendAssistantNote(
          "Rovik couldn't hear a working microphone. Check the Windows input device, then try again.",
          "alert",
        );
      } else if (e.error === "network" || e.error === "service-not-allowed") {
        appendAssistantNote(
          "Rovik lost desktop speech recognition. Tap the mic again after checking your connection and Google voice configuration.",
          "alert",
        );
      }
      goIdle(); // real error → back to standby
    };

    rec.onend = () => {
      if (sessionIdRef.current !== sid || voiceStateRef.current !== "listening") return;
      // Chrome stopped the rec (60s cap or network blip)
      // If we have text → submit. Otherwise restart the rec to keep capturing.
      const hasText = hadSpeechRef.current && finalTextRef.current.trim().length > 0;
      if (hasText) { stopSilenceTimer(); doSubmit(); return; }
      window.setTimeout(() => {
        if (sessionIdRef.current !== sid || voiceStateRef.current !== "listening") return;
        try { rec.start(); } catch { goIdle(); }
      }, 150);
    };

    activeRecRef.current = rec;
    try { rec.start(); } catch { goIdle(); }
  }

  // ── Wake word listener ─────────────────────────────────────────────────────

  function startWakeWordListener() {
    const SR = getSR();
    if (!SR || voiceStateRef.current === "off") return;

    // Clear any existing instance first
    const oldRec = wakeRecRef.current;
    wakeRecRef.current = null;
    wakeActiveRef.current = false;
    try { oldRec?.stop(); } catch { /* ignore */ }

    wakeLastEventRef.current = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3; // check top-3 transcripts — helps when Chrome mis-hears first pass
    let done = false;         // triggered wake word this session
    let restarted = false;    // onerror already scheduled restart

    rec.onstart = () => {
      wakeActiveRef.current = true;
      wakeLastEventRef.current = Date.now();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      if (done || voiceStateRef.current !== "standby") return;
      wakeLastEventRef.current = Date.now();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        // Loop every alternative Chrome returned, not just [0]
        const numAlts = e.results[i].length;
        for (let j = 0; j < numAlts; j++) {
          const t: string = e.results[i][j].transcript;
          // Primary:  "Eve [rest]" / "Hey Eve [rest]"
          // Fallback: standalone word "eve" anywhere in the transcript
          const m =
            t.match(/(?:hey\s*)?eve[,.\s]*(.*)/i) ??
            (t.match(/\beve\b/i) ? [t, ""] : null);
          if (m) {
            done = true;
            const seed = (m[1] ?? "").trim();
            wakeRecRef.current = null; // clear before stop so onend skips self-restart
            try { rec.stop(); } catch { /* ignore */ }
            // If Eve is mid-speech, cut it off immediately (interrupt feature)
            cancelPlayback();
            startListening(seed, 7000);
            return;
          }
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      wakeActiveRef.current = false;
      wakeLastEventRef.current = Date.now();
      if (done || voiceStateRef.current !== "standby") return;
      if (e.error === "not-allowed") {
        appendAssistantNote(
          "Rovik needs microphone access before wake word listening can run. Check Windows microphone permissions, then reopen the desktop app.",
          "alert",
        );
        setVoiceSynced("off");
        wakeRecRef.current = null;
        return;
      }
      if (e.error === "audio-capture") {
        appendAssistantNote(
          "Rovik couldn't start wake word listening because Windows isn't exposing a working microphone.",
          "alert",
        );
      } else if (e.error === "network" || e.error === "service-not-allowed") {
        appendAssistantNote(
          "Rovik's desktop speech service is unavailable right now. I'll keep Eve available by text while the mic reconnects.",
          "alert",
        );
      }
      if (wakeRecRef.current !== rec) return; // watchdog already replaced us
      wakeRecRef.current = null;
      restarted = true;
      window.setTimeout(startWakeWordListener, e.error === "service-unavailable" ? 1500 : 200);
    };

    rec.onend = () => {
      wakeActiveRef.current = false;
      wakeLastEventRef.current = Date.now();
      // Only self-restart if nothing else already did.
      // 200 ms gives Chrome time to fully release the mic before the next start().
      if (voiceStateRef.current === "standby" && !done && !restarted && wakeRecRef.current === rec) {
        wakeRecRef.current = null;
        restarted = true;
        window.setTimeout(startWakeWordListener, 200);
      }
    };

    try {
      rec.start();
      wakeRecRef.current = rec;
    } catch {
      wakeActiveRef.current = false;
      if (voiceStateRef.current === "standby") window.setTimeout(startWakeWordListener, 350);
    }
  }

  // Toggle wake word on/off via the header button
  function toggleVoiceStandby() {
    if (voiceStateRef.current === "off") {
      setVoiceSynced("standby");
      startWakeWordListener();
    } else {
      stopListening();
      const old = wakeRecRef.current;
      wakeRecRef.current = null;
      wakeActiveRef.current = false;
      try { old?.stop(); } catch { /* ignore */ }
      setVoiceSynced("off");
    }
  }

  // Manual mic button tap: start/stop listening without wake word
  function tapMic() {
    if (voiceStateRef.current === "listening") {
      goIdle();
    } else {
      void (async () => {
        const ready = await ensureMicrophoneReady();
        if (!ready) return;
        startListening("", 8000);
      })();
    }
  }

  function appendAssistantNote(note: string, nextMood: Mood = "alert") {
    const assistantMessage: Message = {
      id: makeId(),
      role: "assistant",
      content: note,
      displayContent: note,
    };

    startTransition(() => {
      setMessages((current) => [...current, assistantMessage]);
    });
    setStatus("ready");
    setMood(nextMood);
    setLiveExcerpt(note);
  }

  async function runDesktopAction(
    label: string,
    fn: (bridge: NonNullable<typeof window.eveDesktop>) => Promise<{
      ok: boolean;
      error?: string;
    }>,
  ) {
    const bridge = window.eveDesktop;
    if (!bridge) {
      appendAssistantNote(
        `${label} needs the Rovik Windows desktop app.`,
      );
      return false;
    }

    try {
      const result = await fn(bridge);
      if (!result.ok) {
        appendAssistantNote(
          result.error ? `${label} failed: ${result.error}` : `${label} failed.`,
        );
        return false;
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown desktop action error.";
      appendAssistantNote(`${label} failed: ${message}`);
      return false;
    }
  }

  async function openExternalTarget(url: string, label: string) {
    setPendingUrl(null);

    if (window.eveDesktop) {
      return runDesktopAction(label, (bridge) => bridge.openExternal(url));
    }

    const existing = externalWindowRef.current;
    if (existing && !existing.closed) {
      try {
        existing.location.replace(url);
        existing.focus();
        window.setTimeout(() => window.focus(), 40);
        return true;
      } catch {
        externalWindowRef.current = null;
      }
    }

    const popup = window.open(
      url,
      "rovik-external",
      "popup=yes,width=1320,height=900,left=80,top=60,resizable=yes,scrollbars=yes",
    );

    if (!popup) {
      setPendingUrl({ url, label });
      return false;
    }

    externalWindowRef.current = popup;
    try {
      popup.opener = null;
      popup.blur();
    } catch {
      /* ignore browser restrictions */
    }
    window.setTimeout(() => window.focus(), 40);
    return true;
  }

  async function executeActions(actions: ClientAction[]) {
    if (!actions.length) return;
    setRecentActions(actions);
    for (const action of actions) {
      if (action.type === "play_youtube") {
        setActiveVideo({
          videoId: action.videoId,
          url: action.url,
          title: action.title,
          channel: action.channel,
        });
      }
      if (action.type === "open_url" && action.url) {
        await openExternalTarget(action.url, action.description ?? action.url);
      }
      if (action.type === "desktop_open_app") {
        await runDesktopAction(action.label, (bridge) =>
          bridge.openApp(action.appName),
        );
      }
      if (action.type === "desktop_open_path") {
        await runDesktopAction(action.label, (bridge) =>
          bridge.openPath(action.path),
        );
      }
      if (action.type === "desktop_system_action") {
        await runDesktopAction(action.label, (bridge) =>
          bridge.runSystemAction(action.action),
        );
      }
      if (action.type === "set_reminder") {
        const delayMs = action.delay_minutes * 60_000;
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
        window.setTimeout(() => {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Eve reminder", { body: action.message });
          }
        }, delayMs);
      }
      if (action.type === "write_clipboard") {
        try {
          if (window.eveDesktop) {
            await runDesktopAction("Copy to clipboard", (bridge) =>
              bridge.writeClipboard(action.text),
            );
          } else {
            await navigator.clipboard.writeText(action.text);
          }
        } catch { /* clipboard permission denied */ }
      }
      if (action.type === "download_file") {
        const blob = new Blob([action.content], { type: action.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = action.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (action.type === "draft_email") {
        const mailto = `mailto:${encodeURIComponent(action.to)}?subject=${encodeURIComponent(action.subject)}&body=${encodeURIComponent(action.body)}`;
        await openExternalTarget(mailto, `Draft email to ${action.to}`);
      }
      if (action.type === "show_image") {
        setGeneratedImage({ url: action.url, prompt: action.prompt });
      }
    }
  }

  async function submitPrompt(nextPrompt?: string) {
    const submittedPrompt = (nextPrompt ?? prompt).trim();

    if (!submittedPrompt || status === "thinking") {
      return;
    }

    cancelPlayback();
    userScrolledRef.current = false;
    if (/\b(play|watch|youtube|spotify|video|song|music)\b/i.test(submittedPrompt)) {
      setActiveVideo(null);
    }

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: submittedPrompt,
      displayContent: submittedPrompt,
    };

    const conversation = [...messages, userMessage].map(({ role, content }) => ({
      role,
      content,
    }));

    startTransition(() => {
      setMessages((current) => [...current, userMessage]);
      setPrompt("");
    });

    setStatus("thinking");
    setMood("focused");
    setLiveExcerpt("Thinking through your request...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: conversation, state: conversationState }),
      });

      const data = (await response.json()) as {
        error?: string;
        mode?: ModelMode;
        reply?: string;
        actions?: ClientAction[];
        state?: ConversationState;
      };

      if (!response.ok || !data.reply) {
        throw new Error(data.error ?? "Eve could not finish the response.");
      }

      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content: data.reply.trim(),
        displayContent: data.reply.trim(),
      };

      startTransition(() => {
        setMessages((current) => [...current, assistantMessage]);
      });

      setModelMode(data.mode ?? "live");
      setConversationState(data.state ?? { pendingMediaSelection: null });
      speakReply(assistantMessage.id, assistantMessage.content);
      void executeActions(data.actions ?? []);
    } catch (error) {
      const fallbackText =
        error instanceof Error
          ? error.message
          : "Eve hit an unexpected error while processing the request.";

      startTransition(() => {
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            content: fallbackText,
            displayContent: fallbackText,
          },
        ]);
      });

      setStatus("error");
      setMood("alert");
      setLiveExcerpt(fallbackText);
      goIdle(); // error → wake word back on
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt();
  }

  const isDesktopShell = !!desktopRuntime?.isDesktop;
  const statusLabel =
    status === "thinking"
      ? "Processing the next move..."
      : status === "speaking"
        ? "Speaking live..."
        : status === "error"
          ? "Needs attention"
          : "Standing by";

  const transcriptPanel = (
    <section className="glass-panel rounded-[2rem] px-4 py-4 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
            Conversation stream
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#0b1321]">
            Live transcript
          </h3>
        </div>
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#6d8099]">
          {messages.length} entries
        </p>
      </div>

      <div
        ref={transcriptBoxRef}
        onScroll={() => {
          const el = transcriptBoxRef.current;
          if (!el) return;
          userScrolledRef.current =
            el.scrollTop + el.clientHeight < el.scrollHeight - 60;
        }}
        className="transcript-fade flex max-h-[36rem] flex-col gap-3 overflow-y-auto pr-1"
      >
        {messages.map((message) => {
          const text = message.displayContent ?? message.content;
          const isUser = message.role === "user";

          return (
            <article
              key={message.id}
              className={`max-w-[92%] rounded-[1.6rem] px-4 py-3 shadow-[0_16px_34px_rgba(11,24,43,0.08)] ${
                isUser
                  ? "ml-auto bg-[linear-gradient(180deg,#0f1f38_0%,#13284d_100%)] text-white"
                  : "border border-white/60 bg-white/80 text-[#10213a]"
              }`}
            >
              <p
                className={`font-mono text-[0.62rem] uppercase tracking-[0.28em] ${
                  isUser ? "text-white/62" : "text-[#6b7d95]"
                }`}
              >
                {isUser ? "You" : "Eve"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 sm:text-[0.95rem]">
                {text}
              </p>
            </article>
          );
        })}
        <div ref={transcriptEndRef} />
      </div>
    </section>
  );

  return (
    <main className="min-h-screen px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="glass-panel mx-auto flex w-full max-w-6xl items-center justify-between rounded-[2rem] px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.34em] text-[#5c718d]">
              Rovik / Embodied Assistant
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
              Eve
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="rounded-full border border-white/60 bg-white/65 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#47627f]">
              {modelMode === "live" ? "Gemini live" : "Offline demo"}
            </span>
            <button
              type="button"
              onClick={() => setMuted((current) => !current)}
              className="rounded-full border border-white/65 bg-white/65 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#47627f] transition hover:bg-white"
            >
              {muted ? "TTS off" : "TTS on"}
            </button>
            <button
              type="button"
              onClick={toggleVoiceStandby}
              title={voiceState === "off" ? "Enable wake word. Say 'Eve' to activate." : "Disable wake word listener"}
              className={`rounded-full border px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] transition hover:bg-white ${
                voiceState !== "off"
                  ? "border-[#2bb6ff]/60 bg-[rgba(43,182,255,0.12)] text-[#1a7fc4]"
                  : "border-white/65 bg-white/65 text-[#47627f]"
              }`}
            >
              {voiceState === "off" ? "Wake word off" : "Wake word on"}
            </button>
            <Link
              href="/settings"
              className="rounded-full border border-white/65 bg-white/65 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#47627f] transition hover:bg-white"
            >
              Settings
            </Link>
            <Link
              href="/download"
              className="rounded-full bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white shadow-[0_12px_28px_rgba(19,112,255,0.22)] transition hover:-translate-y-0.5"
            >
              {desktopRuntime?.isDesktop ? "Desktop guide" : "Download app"}
            </Link>
            {userEmail ? (
              <button
                type="button"
                onClick={async () => {
                  const supabase = createOptionalClient();
                  if (!supabase) {
                    setUserEmail(null);
                    return;
                  }

                  await supabase.auth.signOut();
                  setUserEmail(null);
                }}
                className="rounded-full border border-white/65 bg-white/65 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#47627f] transition hover:bg-white"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-full border border-[#0b74ff]/40 bg-[rgba(11,116,255,0.08)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#0b74ff] transition hover:bg-[rgba(11,116,255,0.15)]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6">
          <div className="glass-panel-strong relative w-full overflow-hidden rounded-[2.5rem] px-5 py-8 sm:px-8 lg:px-12">
            <div className="absolute inset-x-0 top-[-8rem] h-56 bg-[radial-gradient(circle,rgba(43,182,255,0.24),transparent_60%)] blur-3xl" />
            <div className="relative flex flex-col items-center gap-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-[rgba(255,255,255,0.82)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5a6d88]">
                  Home operations
                </span>
                <span className="rounded-full bg-[rgba(255,255,255,0.82)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5a6d88]">
                  Bills + subscriptions
                </span>
                <span className="rounded-full bg-[rgba(255,255,255,0.82)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#5a6d88]">
                  Digital life command center
                </span>
                {desktopRuntime?.isDesktop && (
                  <span className="rounded-full bg-[rgba(11,116,255,0.1)] px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#0b74ff]">
                    Windows desktop ready
                  </span>
                )}
              </div>

              <div className="max-w-2xl text-center">
                <h2 className="text-4xl font-semibold tracking-[-0.06em] text-[#09101d] sm:text-5xl lg:text-6xl">
                  The operating system for your home.
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#566780] sm:text-base">
                  Eve handles the admin of home life: calendars, household inboxes,
                  bills, renewals, routines, purchases, and smart-device actions,
                  through a voice-first interface that feels present instead of passive.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/download"
                    className="rounded-full bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(19,112,255,0.3)] transition hover:-translate-y-0.5"
                  >
                    {desktopRuntime?.isDesktop
                      ? "See desktop capabilities"
                      : "Download Rovik for Windows"}
                  </Link>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#5f738f] sm:text-[0.72rem]">
                    Opens apps, folders, settings, and handoff surfaces without losing Eve
                  </p>
                </div>
              </div>

              <EveAvatar mood={mood} status={status} visemeLevel={visemeLevel} />

              {isDesktopShell ? (
                <form
                  onSubmit={handleSubmit}
                  className="flex w-full max-w-4xl items-end gap-3"
                >
                  <button
                    type="submit"
                    disabled={status === "thinking" || voiceState === "listening"}
                    className="shrink-0 rounded-[1.4rem] border border-[#0b74ff]/25 bg-white/85 px-5 py-4 text-sm font-semibold text-[#0b74ff] shadow-[0_14px_30px_rgba(11,116,255,0.12)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send to Eve
                  </button>

                  <div className="glass-panel flex-1 rounded-[2rem] px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="shrink-0">
                        <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#64768e]">
                          Eve status
                        </p>
                        <p className="mt-1 text-lg font-medium tracking-[-0.04em] text-[#09101d]">
                          {statusLabel}
                        </p>
                      </div>
                      <div className="min-w-[16rem] flex-1">
                        <textarea
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          placeholder="Ask Eve to run a home task, open an app, search, or take the next step."
                          className="min-h-[4.5rem] w-full resize-none rounded-[1.4rem] border border-white/70 bg-white/75 px-4 py-3 text-sm leading-7 text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
                        />
                        <p className="mt-2 text-sm leading-6 text-[#586983]">
                          {voiceState === "listening" && interimTranscript
                            ? interimTranscript
                            : liveExcerpt}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={tapMic}
                    aria-label={
                      voiceState === "listening"
                        ? "Stop voice input"
                        : "Start voice input"
                    }
                    title={
                      voiceState === "listening"
                        ? "Stop listening"
                        : voiceState === "standby"
                          ? "Tap to speak now (or say 'Eve')"
                          : "Tap to speak"
                    }
                    className={`relative shrink-0 overflow-hidden rounded-[1.4rem] px-5 py-4 text-sm font-semibold transition hover:-translate-y-0.5 ${
                      voiceState === "listening"
                        ? "bg-red-500 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
                        : voiceState === "standby"
                          ? "border border-[#2bb6ff]/50 bg-[rgba(43,182,255,0.1)] text-[#1a7fc4]"
                          : "border border-white/70 bg-white/80 text-[#24344b]"
                    }`}
                  >
                    {voiceState === "listening" && silenceProgress > 0 && (
                      <span
                        className="absolute inset-0 rounded-[1.4rem]"
                        style={{
                          background: `conic-gradient(rgba(255,255,255,0.35) ${silenceProgress * 360}deg, transparent 0deg)`,
                        }}
                      />
                    )}
                    <span className="relative flex items-center justify-center">
                      <MicIcon active={voiceState === "listening"} />
                      {voiceState !== "off" ? (
                        <span
                          className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white/70 ${
                            voiceState === "listening" ? "bg-white" : "bg-[#2bb6ff]"
                          }`}
                        />
                      ) : null}
                    </span>
                  </button>
                </form>
              ) : (
                <div className="glass-panel w-full max-w-3xl rounded-[2rem] px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#64768e]">
                        Eve status
                      </p>
                      <p className="mt-1 text-xl font-medium tracking-[-0.04em] text-[#09101d]">
                        {statusLabel}
                      </p>
                    </div>
                    <p className="max-w-xl text-sm leading-7 text-[#586983]">
                      {liveExcerpt}
                    </p>
                  </div>
                </div>
              )}

              {isDesktopShell && voiceState === "standby" && (
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#4a90c4]/80">
                  Listening for &quot;Eve&quot;...
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-3">
                {quickPrompts.map((quickPrompt) => (
                  <button
                    key={quickPrompt}
                    type="button"
                    onClick={() => void submitPrompt(quickPrompt)}
                    className="rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm text-[#24344b] transition hover:-translate-y-0.5 hover:bg-white"
                  >
                    {quickPrompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isDesktopShell ? (
            <div className="flex w-full max-w-4xl flex-col gap-4">
              <button
                type="button"
                onClick={() => setDesktopTranscriptOpen((current) => !current)}
                className="glass-panel flex items-center justify-between rounded-[1.6rem] px-5 py-4 text-left transition hover:-translate-y-0.5"
              >
                <div>
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                    Transcript
                  </p>
                  <p className="mt-1 text-base font-semibold tracking-[-0.03em] text-[#0b1321]">
                    {desktopTranscriptOpen ? "Close live transcript" : "Open live transcript"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[#6d8099]">
                    {messages.length} entries
                  </p>
                  <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-sm font-medium text-[#24344b]">
                    {desktopTranscriptOpen ? "Hide" : "Show"}
                  </span>
                </div>
              </button>

              {desktopTranscriptOpen && transcriptPanel}

              {pendingUrl && (
                <div className="glass-panel rounded-[2rem] border border-[#2bb6ff]/30 bg-[rgba(43,182,255,0.06)] px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#1a7fc4]">Opens in new tab</p>
                    <p className="mt-1 text-sm font-semibold text-[#09101d] truncate">{pendingUrl.label}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium shrink-0">
                    <a
                      href={pendingUrl.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setPendingUrl(null)}
                      className="rounded-full bg-[linear-gradient(135deg,#0b74ff,#30c2ff)] px-4 py-2 text-white shadow-sm hover:opacity-90"
                    >
                      Open
                    </a>
                    <button onClick={() => setPendingUrl(null)} className="text-[#5c718d] hover:text-[#09101d]">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {generatedImage && (
                <div className="glass-panel rounded-[2rem] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#5c718d]">Generated Image</p>
                    <button onClick={() => setGeneratedImage(null)} className="text-[#5c718d] hover:text-[#09101d] text-sm font-medium">Close</button>
                  </div>
                  <Image
                    src={generatedImage.url}
                    alt={generatedImage.prompt}
                    width={1024}
                    height={1024}
                    unoptimized
                    className="h-auto max-h-80 w-full object-cover"
                  />
                  <p className="px-4 py-2 text-xs text-[#5c718d] italic">{generatedImage.prompt}</p>
                </div>
              )}

              {activeVideo && (
                <div className="glass-panel overflow-hidden rounded-[2rem]">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#5c718d]">Now Playing</p>
                      <p className="mt-1 text-sm font-semibold text-[#09101d]">{activeVideo.title}</p>
                      {activeVideo.channel && (
                        <p className="mt-1 text-xs text-[#5c718d]">{activeVideo.channel}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-medium">
                      <a
                        href={activeVideo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1b4d9b] hover:text-[#09101d]"
                      >
                        Open on YouTube
                      </a>
                      <button
                        onClick={() => setActiveVideo(null)}
                        className="text-[#5c718d] hover:text-[#09101d]"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="aspect-video bg-black">
                    <iframe
                      key={activeVideo.videoId}
                      src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1&rel=0&playsinline=1`}
                      title={activeVideo.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                </div>
              )}

              {recentActions.length > 0 && (
                <section className="glass-panel rounded-[2rem] px-5 py-5">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                    Actions taken
                  </p>
                  <ul className="mt-3 space-y-2">
                    {recentActions.map((action, i) => (
                      <li
                        key={i}
                        className="rounded-[1.2rem] border border-white/60 bg-white/70 px-3 py-2.5 text-sm text-[#31425a]"
                      >
                        {action.type === "open_url" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Opened</p>
                            <p className="mt-1 truncate text-[0.85rem]">{action.description}</p>
                          </>
                        )}
                        {action.type === "desktop_open_app" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Windows app</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "desktop_open_path" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">File Explorer</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "desktop_system_action" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Windows action</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "play_youtube" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Playing YouTube</p>
                            <p className="mt-1 text-[0.85rem]">{action.title}</p>
                            {action.channel && (
                              <p className="mt-1 text-[0.78rem] text-[#5a708e]">{action.channel}</p>
                            )}
                          </>
                        )}
                        {action.type === "set_reminder" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Reminder in {action.delay_minutes}m</p>
                            <p className="mt-1 text-[0.85rem]">{action.message}</p>
                          </>
                        )}
                        {action.type === "write_clipboard" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Copied to clipboard</p>
                            <p className="mt-1 truncate text-[0.85rem]">{action.text}</p>
                          </>
                        )}
                        {action.type === "download_file" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Downloaded</p>
                            <p className="mt-1 text-[0.85rem]">{action.filename}</p>
                          </>
                        )}
                        {action.type === "draft_email" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Email draft To: {action.to}</p>
                            <p className="mt-1 text-[0.85rem]">{action.subject}</p>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              {transcriptPanel}

              <aside className="flex flex-col gap-6">
              <section className="glass-panel rounded-[2rem] px-5 py-5">
                <div>
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                    Prompt Eve
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#0b1321]">
                    Give Eve a household job
                  </h3>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Ask Eve to review bills, triage home emails, plan errands, manage subscriptions, prep a purchase, or run a home routine."
                    className="min-h-36 rounded-[1.6rem] border border-white/70 bg-white/82 px-4 py-4 text-sm leading-7 text-[#10213a] outline-none transition placeholder:text-[#7b8da4] focus:border-[#72ceff] focus:ring-4 focus:ring-[#72ceff]/18"
                  />

                  {/* Interim transcript while listening */}
                  {voiceState === "listening" && interimTranscript && (
                    <p className="rounded-[1.2rem] border border-[#2bb6ff]/30 bg-[rgba(43,182,255,0.07)] px-4 py-2 text-sm leading-6 text-[#1a4a6e]">
                      {interimTranscript}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={status === "thinking" || voiceState === "listening"}
                      className="flex-1 rounded-[1.4rem] bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(19,112,255,0.3)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {status === "thinking" ? "Eve is thinking..." : "Send to Eve"}
                    </button>

                    {/* Mic button: state-aware manual voice trigger. */}
                    <button
                      type="button"
                      onClick={tapMic}
                      aria-label={
                        voiceState === "listening"
                          ? "Stop voice input"
                          : "Start voice input"
                      }
                      title={
                        voiceState === "listening"
                          ? "Stop listening"
                          : voiceState === "standby"
                          ? "Tap to speak now (or say 'Eve')"
                          : "Tap to speak"
                      }
                      className={`relative overflow-hidden rounded-[1.4rem] px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 ${
                        voiceState === "listening"
                          ? "bg-red-500 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.25)]"
                          : voiceState === "standby"
                          ? "border border-[#2bb6ff]/50 bg-[rgba(43,182,255,0.1)] text-[#1a7fc4]"
                          : "border border-white/70 bg-white/80 text-[#24344b]"
                      }`}
                    >
                      {/* Silence countdown ring */}
                      {voiceState === "listening" && silenceProgress > 0 && (
                        <span
                          className="absolute inset-0 rounded-[1.4rem]"
                          style={{
                            background: `conic-gradient(rgba(255,255,255,0.35) ${silenceProgress * 360}deg, transparent 0deg)`,
                          }}
                        />
                      )}
                      <span className="relative flex items-center justify-center">
                        <MicIcon active={voiceState === "listening"} />
                        {voiceState !== "off" ? (
                          <span
                            className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white/70 ${
                              voiceState === "listening"
                                ? "bg-white"
                                : "bg-[#2bb6ff]"
                            }`}
                          />
                        ) : null}
                      </span>
                    </button>
                  </div>

                  {/* Standby hint */}
                  {voiceState === "standby" && (
                    <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#4a90c4]/70">
                      Listening for &quot;Eve&quot;...
                    </p>
                  )}
                </form>
              </section>

              <section className="glass-panel rounded-[2rem] px-5 py-5">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                  Six core workflows
                </p>
                <ul className="mt-3 grid grid-cols-2 gap-2 text-[0.78rem] text-[#31425a]">
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">🌅 Morning Brief</li>
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">📥 Inbox Triage</li>
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">💸 Bills &amp; Subs</li>
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">✅ Home Tasks</li>
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">💡 Smart Home</li>
                  <li className="rounded-xl border border-white/60 bg-white/60 px-3 py-2">🛒 Purchases</li>
                </ul>
                <p className="mt-3 text-[0.72rem] text-[#63758e]">
                  Risky actions (send email, event invites, purchases, cancels, door unlocks) always ask before running.
                </p>
              </section>

              <section className="glass-panel rounded-[2rem] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                      Rovik for Windows
                    </p>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-[#0b1321]">
                      Install the desktop build
                    </h3>
                  </div>
                  <span className="rounded-full border border-[#0b74ff]/20 bg-[rgba(11,116,255,0.08)] px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#0b74ff]">
                    Desktop actions
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-[#586983]">
                  The Windows app keeps Eve live while she opens apps, folders,
                  settings, and the next surface you need to work from.
                </p>
                <ul className="mt-4 space-y-2">
                  {desktopCapabilityCards.slice(0, 3).map((capability) => (
                    <li
                      key={capability.title}
                      className="rounded-[1.2rem] border border-white/60 bg-white/70 px-3 py-3 text-sm text-[#31425a]"
                    >
                      <p className="font-medium text-[#0b1321]">{capability.title}</p>
                      <p className="mt-1 text-[0.82rem] leading-6 text-[#5d708b]">
                        {capability.description}
                      </p>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/download"
                  className="mt-4 inline-flex rounded-full bg-[linear-gradient(135deg,#0b74ff_0%,#30c2ff_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(19,112,255,0.24)] transition hover:-translate-y-0.5"
                >
                  Open download page
                </Link>
              </section>

              {/* Open-in-new-tab card — always shown so user can bring the tab forward */}
              {pendingUrl && (
                <div className="glass-panel rounded-[2rem] border border-[#2bb6ff]/30 bg-[rgba(43,182,255,0.06)] px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#1a7fc4]">↗ Opens in new tab</p>
                    <p className="mt-1 text-sm font-semibold text-[#09101d] truncate">{pendingUrl.label}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium shrink-0">
                    <a
                      href={pendingUrl.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setPendingUrl(null)}
                      className="rounded-full bg-[linear-gradient(135deg,#0b74ff,#30c2ff)] px-4 py-2 text-white shadow-sm hover:opacity-90"
                    >
                      Open ↗
                    </a>
                    <button onClick={() => setPendingUrl(null)} className="text-[#5c718d] hover:text-[#09101d]">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {generatedImage && (
                <div className="glass-panel rounded-[2rem] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#5c718d]">Generated Image</p>
                    <button onClick={() => setGeneratedImage(null)} className="text-[#5c718d] hover:text-[#09101d] text-sm font-medium">Close</button>
                  </div>
                  <Image
                    src={generatedImage.url}
                    alt={generatedImage.prompt}
                    width={1024}
                    height={1024}
                    unoptimized
                    className="h-auto max-h-80 w-full object-cover"
                  />
                  <p className="px-4 py-2 text-xs text-[#5c718d] italic">{generatedImage.prompt}</p>
                </div>
              )}

              {activeVideo && (
                <div className="glass-panel overflow-hidden rounded-[2rem]">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#5c718d]">Now Playing</p>
                      <p className="mt-1 text-sm font-semibold text-[#09101d]">{activeVideo.title}</p>
                      {activeVideo.channel && (
                        <p className="mt-1 text-xs text-[#5c718d]">{activeVideo.channel}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-medium">
                      <a
                        href={activeVideo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1b4d9b] hover:text-[#09101d]"
                      >
                        Open on YouTube
                      </a>
                      <button
                        onClick={() => setActiveVideo(null)}
                        className="text-[#5c718d] hover:text-[#09101d]"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="aspect-video bg-black">
                    <iframe
                      key={activeVideo.videoId}
                      src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1&rel=0&playsinline=1`}
                      title={activeVideo.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                </div>
              )}

              {recentActions.length > 0 && (
                <section className="glass-panel rounded-[2rem] px-5 py-5">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#63758e]">
                    Actions taken
                  </p>
                  <ul className="mt-3 space-y-2">
                    {recentActions.map((action, i) => (
                      <li
                        key={i}
                        className="rounded-[1.2rem] border border-white/60 bg-white/70 px-3 py-2.5 text-sm text-[#31425a]"
                      >
                        {action.type === "open_url" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Opened</p>
                            <p className="mt-1 truncate text-[0.85rem]">{action.description}</p>
                          </>
                        )}
                        {action.type === "desktop_open_app" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Windows app</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "desktop_open_path" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">File Explorer</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "desktop_system_action" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Windows action</p>
                            <p className="mt-1 text-[0.85rem]">{action.label}</p>
                          </>
                        )}
                        {action.type === "play_youtube" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Playing YouTube</p>
                            <p className="mt-1 text-[0.85rem]">{action.title}</p>
                            {action.channel && (
                              <p className="mt-1 text-[0.78rem] text-[#5a708e]">{action.channel}</p>
                            )}
                          </>
                        )}
                        {action.type === "set_reminder" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Reminder in {action.delay_minutes}m</p>
                            <p className="mt-1 text-[0.85rem]">{action.message}</p>
                          </>
                        )}
                        {action.type === "write_clipboard" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Copied to clipboard</p>
                            <p className="mt-1 truncate text-[0.85rem]">{action.text}</p>
                          </>
                        )}
                        {action.type === "download_file" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Downloaded</p>
                            <p className="mt-1 text-[0.85rem]">{action.filename}</p>
                          </>
                        )}
                        {action.type === "draft_email" && (
                          <>
                            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#5a708e]">Email draft — To: {action.to}</p>
                            <p className="mt-1 text-[0.85rem]">{action.subject}</p>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
