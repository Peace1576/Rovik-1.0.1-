"use client";

import Image from "next/image";
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
import type { ClientAction } from "@/lib/eve-tools";
import { createClient } from "@/lib/supabase/client";

type Presence = "ready" | "thinking" | "speaking" | "error";
type Mood = "warm" | "curious" | "focused" | "alert";
type ModelMode = "live" | "offline";

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
  const [liveExcerpt, setLiveExcerpt] = useState(introMessage);
  const [recentActions, setRecentActions] = useState<ClientAction[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>({
    pendingMediaSelection: null,
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{ url: string; prompt: string } | null>(null);
  const [activeVideo, setActiveVideo] = useState<ActiveVideo | null>(null);
  // Voice mode: off | standby (wake-word listener) | listening (active recording)
  const [voiceState, setVoiceState] = useState<"off" | "standby" | "listening">("standby");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [silenceProgress, setSilenceProgress] = useState(0); // 0–1 countdown before auto-submit

  const voiceStateRef = useRef<"off" | "standby" | "listening">("standby");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRecogRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeRecogRef = useRef<any>(null);
  const wakeRecogActiveRef = useRef(false);
  const wakeLastEventRef = useRef(0);
  const activeRecogActiveRef = useRef(false);
  const activeLastEventRef = useRef(0);
  const activeRestartCountRef = useRef(0);
  const activeSessionIdRef = useRef(0);
  const wakeSuppressedRef = useRef(false);
  const interimTranscriptRef = useRef("");
  const wakeWatchdogRef = useRef<number | null>(null);
  const listeningStartedAtRef = useRef(0);
  const heardSpeechSinceListenRef = useRef(false);
  const initialListenWindowRef = useRef(7000);
  const trailingSilenceWindowRef = useRef(3500);
  const lastSpeechRef = useRef(0);
  const finalTranscriptRef = useRef("");
  const silenceRafRef = useRef<number | null>(null);
  const postReplyTimerRef = useRef<number | null>(null);

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
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

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
      if (silenceRafRef.current) cancelAnimationFrame(silenceRafRef.current);
      if (postReplyTimerRef.current) window.clearTimeout(postReplyTimerRef.current);
      wakeRecogRef.current?.stop();
      activeRecogRef.current?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function reviveWakeWord() {
      if (voiceStateRef.current === "standby") {
        startWakeWordListener();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        reviveWakeWord();
      }
    }

    window.addEventListener("focus", reviveWakeWord);
    document.addEventListener("visibilitychange", onVisibilityChange);

    wakeWatchdogRef.current = window.setInterval(() => {
      const now = Date.now();
      if (voiceStateRef.current === "standby") {
        const timeSinceLast = now - wakeLastEventRef.current;

        // Case 1: no ref at all — listener was never started or got cleared
        const noRef = !wakeRecogRef.current;

        // Case 2: ref exists but onstart never fired after 8s — stuck before start
        const stuckBeforeStart =
          !!wakeRecogRef.current &&
          !wakeRecogActiveRef.current &&
          timeSinceLast > 8_000;

        // Case 3: listener was running (onstart fired) but Chrome killed it
        // without firing onend — no events at all for >50s
        const silentlyDead =
          !!wakeRecogRef.current &&
          wakeRecogActiveRef.current &&
          timeSinceLast > 50_000;

        if (noRef) {
          // Nothing running — start fresh
          startWakeWordListener();
        } else if (stuckBeforeStart || silentlyDead) {
          // Listener is stuck or silently dead — force-restart.
          // Null refs BEFORE stopping so that when onend fires it sees
          // wakeRecogRef.current === null and skips its own restart.
          const staleWakeRecog = wakeRecogRef.current;
          wakeRecogRef.current = null;
          wakeRecogActiveRef.current = false;
          try { staleWakeRecog?.stop(); } catch { /* ignore */ }
          window.setTimeout(startWakeWordListener, 350);
        }
      }
      // Otherwise listener is healthy — leave it alone
    }, 5000);

    return () => {
      window.removeEventListener("focus", reviveWakeWord);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
  // If the user starts talking, silence detection handles auto-submit as normal.
  // If nobody speaks within 3.5s, close the window and return to wake-word standby.
  function startPostReplyListen() {
    if (voiceStateRef.current !== "standby") return; // wake word off or already listening
    wakeSuppressedRef.current = false;
    startActiveListening("", "followup");
  }

  function finishPlayback(messageId: string, fullText: string) {
    activeSpeechRef.current = null;
    speechEnergyRef.current = 0; // RAF will detect and stop itself
    updateMessageDisplay(messageId, fullText);
    setStatus("ready");
    setMood(inferMood(fullText));
    setLiveExcerpt(fullText);
    wakeSuppressedRef.current = false;
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

  function recoverToStandby(delay = 350) {
    stopActiveListening();
    setVoiceSynced("standby");
    if (!wakeSuppressedRef.current) {
      window.setTimeout(startWakeWordListener, delay);
    }
  }

  function hasSpeechSignal(text: string) {
    return text.replace(/[^a-z0-9]/gi, "").length >= 2;
  }

  function hasUsableSpeech(text: string) {
    return text.replace(/[^a-z0-9]/gi, "").length >= 4;
  }

  function hasCapturedActiveSpeech() {
    return (
      heardSpeechSinceListenRef.current ||
      hasSpeechSignal(finalTranscriptRef.current) ||
      hasSpeechSignal(interimTranscriptRef.current)
    );
  }

  function stopSilenceRaf() {
    if (silenceRafRef.current) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    setSilenceProgress(0);
  }

  function stopActiveListening() {
    activeSessionIdRef.current += 1;
    activeRecogRef.current?.stop();
    activeRecogRef.current = null;
    activeRecogActiveRef.current = false;
    activeLastEventRef.current = 0;
    activeRestartCountRef.current = 0;
    stopSilenceRaf();
    setInterimTranscript("");
    interimTranscriptRef.current = "";
    finalTranscriptRef.current = "";
    listeningStartedAtRef.current = 0;
    heardSpeechSinceListenRef.current = false;
    if (postReplyTimerRef.current) {
      window.clearTimeout(postReplyTimerRef.current);
      postReplyTimerRef.current = null;
    }
  }

  function autoSubmit() {
    const finalText = finalTranscriptRef.current.trim();
    const interimText = interimTranscriptRef.current.trim();
    const text = finalText || (hasUsableSpeech(interimText) ? interimText : "");
    wakeSuppressedRef.current = true;
    stopActiveListening();
    setVoiceSynced("standby");
    if (text) {
      setPrompt("");
      void submitPrompt(text);
    }
  }

  function startSilenceDetection() {
    stopSilenceRaf();

    const tick = () => {
      if (voiceStateRef.current !== "listening") return;
      const waitingForFirstSpeech = !hasCapturedActiveSpeech();
      const deadlineMs = waitingForFirstSpeech
        ? initialListenWindowRef.current
        : trailingSilenceWindowRef.current;
      const startedAt = waitingForFirstSpeech
        ? listeningStartedAtRef.current || lastSpeechRef.current
        : lastSpeechRef.current;
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / deadlineMs);
      setSilenceProgress(progress);
      if (progress >= 1) {
        const hasFinalText = Boolean(finalTranscriptRef.current.trim());
        const hasUsableInterim = hasUsableSpeech(interimTranscriptRef.current.trim());
        if (hasFinalText || hasUsableInterim) {
          autoSubmit();
        } else {
          recoverToStandby();
        }
        return;
      }
      silenceRafRef.current = requestAnimationFrame(tick);
    };
    silenceRafRef.current = requestAnimationFrame(tick);
  }

  function startActiveListening(
    seedText = "",
    mode: "wake" | "manual" | "followup" = "manual",
  ) {
    const SR = getSR();
    if (!SR) return;
    const trimmedSeed = seedText.trim();
    const sessionId = activeSessionIdRef.current + 1;

    // Chrome only allows one SpeechRecognition at a time — stop the wake word
    // listener before starting active recording to avoid immediate error/close.
    wakeRecogRef.current?.stop();
    wakeRecogRef.current = null;

    stopActiveListening();
    activeSessionIdRef.current = sessionId;
    setVoiceSynced("listening");
    finalTranscriptRef.current = trimmedSeed ? `${trimmedSeed} ` : "";
    lastSpeechRef.current = Date.now();
    activeLastEventRef.current = Date.now();
    listeningStartedAtRef.current = Date.now();
    heardSpeechSinceListenRef.current = hasSpeechSignal(trimmedSeed);
    initialListenWindowRef.current = mode === "followup" ? 3500 : 8000;
    trailingSilenceWindowRef.current = 3500;
    if (trimmedSeed) {
      setPrompt(trimmedSeed);
    } else {
      setPrompt("");
    }
    setInterimTranscript(trimmedSeed);
    interimTranscriptRef.current = trimmedSeed;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let startupTimeout: number | null =
      typeof window !== "undefined"
        ? window.setTimeout(() => {
            if (
              activeSessionIdRef.current !== sessionId ||
              voiceStateRef.current !== "listening" ||
              activeRecogRef.current !== rec
            ) {
              return;
            }
            recoverToStandby(200);
          }, 2200)
        : null;

    function clearStartupTimeout() {
      if (startupTimeout) {
        window.clearTimeout(startupTimeout);
        startupTimeout = null;
      }
    }

    // Reset the silence clock the moment the mic is actually live so the
    // user gets the full silence window — not a shortened one due to Chrome
    // taking time to initialise the new recognition instance.
    rec.onstart = () => {
      if (activeSessionIdRef.current !== sessionId || activeRecogRef.current !== rec) return;
      clearStartupTimeout();
      const now = Date.now();
      activeRecogActiveRef.current = true;
      activeLastEventRef.current = now;
      lastSpeechRef.current = now;
      listeningStartedAtRef.current = now;
      startSilenceDetection();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      if (
        activeSessionIdRef.current !== sessionId ||
        activeRecogRef.current !== rec ||
        voiceStateRef.current !== "listening"
      ) {
        return;
      }
      activeLastEventRef.current = Date.now();

      // Speech detected — cancel the post-reply close timer so the window stays open
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          if (hasSpeechSignal(t)) {
            heardSpeechSinceListenRef.current = true;
          }
          finalTranscriptRef.current += t + " ";
        } else {
          if (hasSpeechSignal(t)) {
            heardSpeechSinceListenRef.current = true;
          }
          interim += t;
        }
      }
      lastSpeechRef.current = Date.now(); // reset silence clock on every word
      const nextTranscript = finalTranscriptRef.current + interim;
      interimTranscriptRef.current = nextTranscript;
      setInterimTranscript(nextTranscript);
      setPrompt(nextTranscript.trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (activeSessionIdRef.current !== sessionId || activeRecogRef.current !== rec) return;
      clearStartupTimeout();
      activeRecogActiveRef.current = false;
      activeLastEventRef.current = Date.now();
      if (e.error === "aborted") return; // intentional .stop() — onend will handle restart
      if (e.error === "no-speech") return; // Chrome fired silence timeout — onend will decide whether to retry
      // Any real error: fall back to standby so wake word keeps working
      recoverToStandby();
    };

    // Chrome stops continuous recognition after ~60s (or on internal errors).
    // Restart with a small delay so Chrome has time to fully release the mic.
    // If restart throws, recover to standby so the system never gets stuck.
    rec.onend = () => {
      if (activeSessionIdRef.current !== sessionId || activeRecogRef.current !== rec) return;
      clearStartupTimeout();
      activeRecogActiveRef.current = false;
      activeLastEventRef.current = Date.now();
      if (voiceStateRef.current !== "listening") return;
      const finalText = finalTranscriptRef.current.trim();
      const interimText = interimTranscriptRef.current.trim();
      if (finalText || hasUsableSpeech(interimText)) {
        autoSubmit();
        return;
      }

      const withinInitialWindow =
        !hasCapturedActiveSpeech() &&
        Date.now() - listeningStartedAtRef.current < initialListenWindowRef.current &&
        activeRestartCountRef.current < 2;

      if (withinInitialWindow) {
        activeRestartCountRef.current += 1;
      } else {
        recoverToStandby();
        return;
      }

      window.setTimeout(() => {
        if (
          activeSessionIdRef.current !== sessionId ||
          voiceStateRef.current !== "listening" ||
          activeRecogRef.current !== rec
        ) {
          return;
        }
        try {
          activeLastEventRef.current = Date.now();
          rec.start();
        } catch {
          // Restart failed — reset cleanly so wake word still works
          recoverToStandby();
        }
      }, 150);
    };

    activeRecogRef.current = rec;
    try {
      rec.start();
    } catch {
      recoverToStandby();
      return;
    }
  }

  function startWakeWordListener() {
    const SR = getSR();
    if (!SR || voiceStateRef.current === "off" || wakeSuppressedRef.current) return;

    wakeRecogRef.current?.stop();
    wakeRecogRef.current = null;
    wakeRecogActiveRef.current = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.lang = "en-US";
    rec.continuous = true;      // keep mic open so Chrome doesn't cut off between phrases
    rec.interimResults = true;  // catch "eve" even before the utterance finalises
    wakeLastEventRef.current = Date.now();

    let triggered = false;

    rec.onstart = () => {
      wakeRecogActiveRef.current = true;
      wakeLastEventRef.current = Date.now();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      if (triggered || voiceStateRef.current !== "standby") return;
      wakeLastEventRef.current = Date.now();

      // Check each new result individually — don't accumulate old ones
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        const match = transcript.match(/(?:hey[\s,]*)?eve[,.\s]*(.*)/i);
        if (match) {
          triggered = true;
          const afterWake = match[1]?.trim() ?? "";
          rec.stop();
          startActiveListening(afterWake, "wake");
          return;
        }
      }
    };

    // Track whether onerror already scheduled a restart so onend doesn't
    // also schedule one — the double-restart storm is what kills the listener
    // after repeated 60s Chrome cycles.
    let restartScheduled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      wakeRecogActiveRef.current = false;
      wakeLastEventRef.current = Date.now();
      if (triggered || voiceStateRef.current !== "standby") return;
      if (e.error === "not-allowed") {
        setVoiceSynced("off");
        wakeRecogRef.current = null;
        return;
      }
      // Only restart from onerror if this is still the official instance
      if (wakeRecogRef.current !== rec) return;
      wakeRecogRef.current = null;
      restartScheduled = true;
      window.setTimeout(startWakeWordListener, e.error === "service-unavailable" ? 1500 : 200);
    };

    rec.onend = () => {
      wakeRecogActiveRef.current = false;
      wakeLastEventRef.current = Date.now();
      // Only restart if: still in standby, wake word not triggered,
      // onerror didn't already schedule one, AND this instance is still
      // the official listener (watchdog hasn't replaced it yet).
      if (
        voiceStateRef.current === "standby" &&
        !triggered &&
        !restartScheduled &&
        wakeRecogRef.current === rec
      ) {
        restartScheduled = true;
        wakeRecogRef.current = null;
        window.setTimeout(startWakeWordListener, 80);
      }
    };

    try {
      rec.start();
      wakeRecogRef.current = rec;
    } catch {
      wakeRecogActiveRef.current = false;
      // Chrome hasn't released the mic yet — retry after a short delay.
      // This is the most common cause of the wake word listener dying silently.
      if (voiceStateRef.current === "standby") {
        window.setTimeout(startWakeWordListener, 350);
      }
    }
  }

  function toggleVoiceStandby() {
    if (voiceStateRef.current === "off") {
      wakeSuppressedRef.current = false;
      setVoiceSynced("standby");
      startWakeWordListener();
    } else {
      wakeSuppressedRef.current = false;
      wakeRecogRef.current?.stop();
      wakeRecogRef.current = null;
      stopActiveListening();
      setVoiceSynced("off");
    }
  }

  // Manual mic tap: skip wake word and go straight to active listening.
  function tapMic() {
    if (voiceStateRef.current === "listening") {
      wakeSuppressedRef.current = false;
      stopActiveListening();
      // Stay in standby if wake word is on, otherwise off
      const next = voiceState === "off" ? "off" : "standby";
      setVoiceSynced(next);
      if (next === "standby") window.setTimeout(startWakeWordListener, 350);
    } else {
      wakeSuppressedRef.current = false;
      wakeRecogRef.current?.stop();
      startActiveListening("", "manual");
    }
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
        const popup = window.open(action.url, "_blank", "noopener,noreferrer");
        if (!popup) {
          window.location.assign(action.url);
        }
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
          await navigator.clipboard.writeText(action.text);
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
        window.open(mailto);
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
    wakeSuppressedRef.current = true;
    wakeRecogRef.current?.stop();
    wakeRecogRef.current = null;
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
      wakeSuppressedRef.current = false;
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
      recoverToStandby();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt();
  }

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
            {userEmail ? (
              <button
                type="button"
                onClick={async () => {
                  const supabase = createClient();
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
              </div>

              <EveAvatar mood={mood} status={status} visemeLevel={visemeLevel} />

              <div className="glass-panel w-full max-w-3xl rounded-[2rem] px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-[#64768e]">
                      Eve status
                    </p>
                    <p className="mt-1 text-xl font-medium tracking-[-0.04em] text-[#09101d]">
                      {status === "thinking"
                        ? "Processing the next move..."
                        : status === "speaking"
                          ? "Speaking live..."
                          : status === "error"
                            ? "Needs attention"
                            : "Standing by"}
                    </p>
                  </div>
                  <p className="max-w-xl text-sm leading-7 text-[#586983]">
                    {liveExcerpt}
                  </p>
                </div>
              </div>

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

          <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
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
                  userScrolledRef.current = el.scrollTop + el.clientHeight < el.scrollHeight - 60;
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
        </section>
      </div>
    </main>
  );
}
