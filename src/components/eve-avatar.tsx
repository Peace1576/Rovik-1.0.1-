"use client";

import { useEffect, useRef, useState } from "react";

type Presence = "ready" | "thinking" | "speaking" | "error";
type Mood = "warm" | "curious" | "focused" | "alert";
type Gaze = { x: number; y: number };

type EveAvatarProps = { mood: Mood; status: Presence; visemeLevel: number };

// --- Idle animation definitions ---
type AnimStep = {
  delay: number;
  gaze?: Gaze;
  eyeScale?: number;
  browLift?: number;  // extra Y offset (px) on both brows
  browAsym?: number;  // left brow lifts +N, right brow lifts -N (px)
};
type IdleAnim = { steps: AnimStep[]; duration: number };

const IDLE_ANIMS: IdleAnim[] = [
  // 0 — Look Around: gaze sweeps left → right → down-left → center
  {
    steps: [
      { delay: 0,    gaze: { x: -0.9, y: 0.1 } },
      { delay: 750,  gaze: { x: -0.6, y: -0.15 } },
      { delay: 1400, gaze: { x: 0.95, y: 0.05 } },
      { delay: 2200, gaze: { x: 0.4,  y: 0.4  } },
      { delay: 2900, gaze: { x: 0,    y: 0    } },
    ],
    duration: 4200,
  },
  // 1 — Happy Surprise: eyes pop wide → soft squint → back to normal
  {
    steps: [
      { delay: 0,    eyeScale: 1.15, browLift: -5 },
      { delay: 550,  eyeScale: 1.06, browLift: -2 },
      { delay: 1100, eyeScale: 0.80, browLift:  1 },
      { delay: 1700, eyeScale: 1.0,  browLift:  0 },
    ],
    duration: 3000,
  },
  // 2 — Ponder / Glance Up: eyes look up with asymmetric brow raise, sweep sides
  {
    steps: [
      { delay: 0,    gaze: { x:  0.2, y: -0.95 }, browAsym:  4 },
      { delay: 950,  gaze: { x: -0.3, y: -0.80 }, browAsym: -4 },
      { delay: 1800, gaze: { x:  0.1, y: -0.45 }, browAsym:  0 },
      { delay: 2500, gaze: { x:  0,   y:  0    } },
    ],
    duration: 3600,
  },
  // 3 — Sleepy / Dreamy: eyelids droop → slow blink → gently reopen
  {
    steps: [
      { delay: 0,    eyeScale: 0.62, gaze: { x: 0, y: 0.25 } },
      { delay: 750,  eyeScale: 0.40 },
      { delay: 1450, eyeScale: 0.10 },   // blink close
      { delay: 1650, eyeScale: 0.52 },   // half-open
      { delay: 2300, eyeScale: 0.72 },
      { delay: 2900, eyeScale: 1.0,  gaze: { x: 0, y: 0 } },
    ],
    duration: 3900,
  },
];

// --- Eye component ---
function Eye({
  side,
  gazeX = 0,
  gazeY = 0,
  scaleOverride,
}: {
  side: "left" | "right";
  gazeX?: number;
  gazeY?: number;
  scaleOverride?: number;
}) {
  const isLeft = side === "left";
  const hasCustomScale = scaleOverride !== undefined && scaleOverride !== 1;

  return (
    <div
      className={`${hasCustomScale ? "" : "eve-blink"} relative overflow-hidden bg-[radial-gradient(circle_at_38%_32%,#96eaff_0%,#2bb3ff_36%,#0052cc_68%,#001a4d_100%)] shadow-[0_0_32px_rgba(43,182,255,0.65),inset_0_1px_0_rgba(255,255,255,0.18)]`}
      style={{
        width: 52,
        height: 56,
        borderRadius: isLeft
          ? "44% 56% 56% 44% / 48% 48% 52% 52%"
          : "56% 44% 44% 56% / 48% 48% 52% 52%",
        transform: `scaleY(${scaleOverride ?? 1})`,
        transition: hasCustomScale ? "transform 0.45s ease-out" : undefined,
      }}
    >
      {/* Gaze group — pupil + highlights translate together */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${gazeX * 7}px, ${gazeY * 5}px)`,
          transition: "transform 0.38s ease-out",
        }}
      >
        <div className="absolute left-1/2 top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-[42%] rounded-full bg-[#020b1c]" />
        <div
          className="absolute h-[11px] w-[11px] rounded-full bg-white/92 shadow-[0_0_6px_rgba(255,255,255,0.5)]"
          style={{ top: "16%", left: "58%" }}
        />
        <div
          className="absolute h-[7px] w-[7px] rounded-full bg-white/35"
          style={{ top: "50%", left: "30%" }}
        />
      </div>
    </div>
  );
}

// --- Main avatar ---
function resolveExpression(status: Presence, mood: Mood) {
  if (status === "error" || mood === "alert") return "alert";
  if (status === "thinking") return "thinking";
  if (status === "speaking") return "speaking";
  if (mood === "curious") return "curious";
  return "ready";
}

export function EveAvatar({ mood, status, visemeLevel }: EveAvatarProps) {
  const expression = resolveExpression(status, mood);
  const isSpeaking = expression === "speaking";
  const isThinking = expression === "thinking";
  const isAlert = expression === "alert";
  const isIdle = status === "ready";

  // Idle animation state
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 });
  const [idleEyeScale, setIdleEyeScale] = useState(1);
  const [idleBrowLift, setIdleBrowLift] = useState(0);
  const [idleBrowAsym, setIdleBrowAsym] = useState(0);

  const activeRef = useRef(false);
  const timerIds = useRef<number[]>([]);

  function clearTimers() {
    timerIds.current.forEach(window.clearTimeout);
    timerIds.current = [];
  }

  function resetIdleState() {
    setGaze({ x: 0, y: 0 });
    setIdleEyeScale(1);
    setIdleBrowLift(0);
    setIdleBrowAsym(0);
  }

  function safe(fn: () => void) {
    return () => { if (activeRef.current) fn(); };
  }

  useEffect(() => {
    if (!isIdle) {
      activeRef.current = false;
      clearTimers();
      resetIdleState();
      return;
    }

    activeRef.current = true;
    let phase = 0;

    function runPhase() {
      if (!activeRef.current) return;
      const anim = IDLE_ANIMS[phase % IDLE_ANIMS.length];

      anim.steps.forEach(({ delay, gaze: g, eyeScale, browLift, browAsym }) => {
        const id = window.setTimeout(safe(() => {
          if (g !== undefined) setGaze(g);
          if (eyeScale !== undefined) setIdleEyeScale(eyeScale);
          if (browLift !== undefined) setIdleBrowLift(browLift);
          if (browAsym !== undefined) setIdleBrowAsym(browAsym);
        }), delay);
        timerIds.current.push(id);
      });

      const endId = window.setTimeout(safe(() => {
        resetIdleState();
        phase++;
        const nextId = window.setTimeout(safe(runPhase), 1800);
        timerIds.current.push(nextId);
      }), anim.duration);
      timerIds.current.push(endId);
    }

    const startId = window.setTimeout(safe(runPhase), 2200);
    timerIds.current.push(startId);

    return () => {
      activeRef.current = false;
      clearTimers();
      resetIdleState();
    };
  }, [isIdle]);

  // Eyebrow transforms
  const baseBrowL = isAlert ? "rotate(9deg)" : isThinking ? "rotate(-3deg)" : "rotate(-7deg)";
  const baseBrowR = isAlert ? "rotate(-9deg)" : isThinking ? "rotate(3deg)" : "rotate(7deg)";
  const browLTransform = `${baseBrowL} translateY(${idleBrowLift + idleBrowAsym}px)`;
  const browRTransform = `${baseBrowR} translateY(${idleBrowLift - idleBrowAsym}px)`;

  // Mouth height when speaking
  const mouthH = isSpeaking ? Math.max(7, Math.round(visemeLevel * 46)) : 0;
  const isReady = !isSpeaking && !isThinking && !isAlert;

  return (
    <div className="relative mx-auto flex w-full max-w-[29rem] flex-col items-center">
      <div className="eve-ring absolute inset-x-10 top-14 h-64 rounded-full border border-[#42b8ff]/30 bg-[radial-gradient(circle,rgba(43,182,255,0.12),transparent_70%)] blur-xl" />
      <div className="eve-orbit absolute left-12 top-20 h-4 w-4 rounded-full bg-[#42b8ff]/80 shadow-[0_0_18px_rgba(43,182,255,0.7)]" />
      <div className="aurora-shift absolute inset-x-16 top-8 h-72 rounded-full bg-[radial-gradient(circle,rgba(43,182,255,0.18),transparent_65%)] blur-3xl" />

      <div className="eve-float relative flex flex-col items-center">
        <div className="relative rounded-[3.3rem] bg-[linear-gradient(180deg,#ffffff_0%,#edf2fb_36%,#dfe6f0_100%)] p-[14px] shadow-[0_36px_90px_rgba(17,35,66,0.24)]">
          <div className="relative overflow-hidden rounded-[2.8rem] bg-[linear-gradient(180deg,#fcfdff_0%,#ebeff7_100%)] px-6 pb-8 pt-7">
            <div className="absolute left-8 right-8 top-4 h-16 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0))]" />
            <div className="relative h-[18rem] w-[23rem] max-w-[80vw] overflow-hidden rounded-[2.3rem] border border-white/8 bg-[linear-gradient(180deg,#09111e_0%,#02050b_100%)] px-8 pb-8 pt-9 shadow-[inset_0_0_60px_rgba(11,29,54,0.8),0_16px_45px_rgba(6,15,30,0.35)]">
              <div className="absolute inset-0 rounded-[2.3rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_26%)]" />
              <div className="absolute inset-0 rounded-[2.3rem] bg-[radial-gradient(circle_at_50%_40%,rgba(43,182,255,0.13),transparent_52%)]" />
              <div className="eve-scan absolute inset-x-10 top-0 h-16 rounded-full bg-[linear-gradient(180deg,rgba(98,212,255,0)_0%,rgba(98,212,255,0.18)_35%,rgba(98,212,255,0)_100%)] blur-sm" />

              {/* Status label */}
              <div className="relative flex items-start justify-between font-mono text-[0.68rem] uppercase tracking-[0.32em] text-[#8bcfff]/76">
                <span>Rovik / Eve</span>
                <span>{status}</span>
              </div>

              {/* Face */}
              <div className="relative mt-6 flex flex-col items-center gap-9">

                {/* Eyes row */}
                <div className="flex w-full items-end justify-between px-5">

                  {/* Left eye + brow */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="h-[5px] w-9 rounded-full bg-[linear-gradient(90deg,#3fc2ff,#72d8ff)] shadow-[0_0_10px_rgba(43,182,255,0.45)]"
                      style={{ transform: browLTransform, transition: "transform 0.35s ease-out" }}
                    />
                    {isThinking ? (
                      <div className="h-[14px] w-[62px] rounded-full bg-[linear-gradient(90deg,#2aa8ff,#6ad7ff)] shadow-[0_0_22px_rgba(43,182,255,0.55)]" />
                    ) : (
                      <Eye
                        side="left"
                        gazeX={gaze.x}
                        gazeY={gaze.y}
                        scaleOverride={idleEyeScale !== 1 ? idleEyeScale : undefined}
                      />
                    )}
                  </div>

                  {/* Thinking diamond */}
                  {isThinking && (
                    <span className="mb-4 h-3 w-3 rotate-45 rounded-[0.3rem] bg-[#63d4ff] shadow-[0_0_18px_rgba(98,212,255,0.9)]" />
                  )}

                  {/* Right eye + brow */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="h-[5px] w-9 rounded-full bg-[linear-gradient(90deg,#72d8ff,#3fc2ff)] shadow-[0_0_10px_rgba(43,182,255,0.45)]"
                      style={{ transform: browRTransform, transition: "transform 0.35s ease-out" }}
                    />
                    {isThinking ? (
                      <div className="h-[14px] w-[62px] rounded-full bg-[linear-gradient(90deg,#2aa8ff,#6ad7ff)] shadow-[0_0_22px_rgba(43,182,255,0.55)]" />
                    ) : (
                      <Eye
                        side="right"
                        gazeX={gaze.x}
                        gazeY={gaze.y}
                        scaleOverride={idleEyeScale !== 1 ? idleEyeScale : undefined}
                      />
                    )}
                  </div>
                </div>

                {/* Cheek blush */}
                {(isReady || isSpeaking) && (
                  <div
                    className="pointer-events-none absolute flex w-full justify-between px-3"
                    style={{ top: 72 }}
                  >
                    <div className="h-4 w-10 rounded-full blur-[8px]" style={{ background: "rgba(255,110,150,0.22)" }} />
                    <div className="h-4 w-10 rounded-full blur-[8px]" style={{ background: "rgba(255,110,150,0.22)" }} />
                  </div>
                )}

                {/* Mouth */}
                <div className="flex items-center justify-center" style={{ marginTop: -8 }}>
                  {isSpeaking ? (
                    <div
                      className="rounded-full bg-[#010812] transition-[height] duration-50 ease-linear"
                      style={{
                        width: 42,
                        height: mouthH,
                        boxShadow: `0 0 ${8 + visemeLevel * 20}px rgba(43,182,255,${0.2 + visemeLevel * 0.35})`,
                      }}
                    >
                      <div className="h-full w-full rounded-full bg-[radial-gradient(ellipse_at_50%_0%,rgba(43,182,255,0.18),transparent_65%)]" />
                    </div>
                  ) : isThinking ? (
                    <div className="h-[4px] w-8 rounded-full bg-[linear-gradient(90deg,#2aa8ff,#6ad7ff)] shadow-[0_0_10px_rgba(43,182,255,0.4)] transition-all duration-300" />
                  ) : isAlert ? (
                    <div
                      className="transition-all duration-300"
                      style={{
                        width: 46, height: 20,
                        borderTop: "3px solid #4abeff",
                        borderRadius: "50% 50% 0 0",
                        boxShadow: "0 -2px 12px rgba(43,182,255,0.35)",
                      }}
                    />
                  ) : (
                    <div
                      className="transition-all duration-300"
                      style={{
                        width: 48, height: 22,
                        borderBottom: "3px solid #4abeff",
                        borderRadius: "0 0 50% 50%",
                        boxShadow: "0 4px 14px rgba(43,182,255,0.3)",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative -mt-2 h-6 w-[4.5rem] rounded-b-[1.5rem] bg-[linear-gradient(180deg,#eef3fa_0%,#cfd7e3_100%)] shadow-[0_10px_26px_rgba(15,34,62,0.14)]" />
        <div className="relative mt-2 flex h-36 w-44 items-center justify-center rounded-[2.9rem] bg-[linear-gradient(180deg,#ffffff_0%,#eef3fa_42%,#d9e1ed_100%)] shadow-[0_22px_48px_rgba(17,35,66,0.18)]">
          <div className="absolute left-4 right-4 top-5 h-8 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(255,255,255,0))]" />
          <div className="h-8 w-20 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,#04070d_0%,#0c1322_100%)] shadow-[inset_0_0_18px_rgba(43,182,255,0.15)]" />
        </div>
      </div>
    </div>
  );
}
