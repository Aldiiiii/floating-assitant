import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { useVoiceStore } from "../stores/voice";
import { playBargeInCue } from "../lib/earcons";

interface DasaiMochiFaceProps {
  isHovered?: boolean;
}

type RobotEmotion =
  | "ignition"
  | "idle"
  | "blink"
  | "look-left"
  | "look-right"
  | "smug"
  | "wink"
  | "happy"
  | "hyped"
  | "star"
  | "dizzy"
  | "glitch"
  | "sleepy"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted";

export function DasaiMochiFace({ isHovered: _isHovered = false }: DasaiMochiFaceProps) {
  const streaming = useChatStore((s) => s.streaming);
  const messages = useChatStore((s) => s.messages);
  const isRecording = useVoiceStore((s) => s.state === "recording");
  const speaking = useVoiceStore((s) => s.speaking);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const connStatus = useSettingsStore((s) => s.status);

  // Status Siklus Emosi
  const [emotion, setEmotion] = useState<RobotEmotion>("idle");
  const [isIgnition, setIsIgnition] = useState(true);
  const [interrupted, setInterrupted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHyped, setIsHyped] = useState(false);
  const [showStarEyes, setShowStarEyes] = useState(false);
  const [isDrowsy, setIsDrowsy] = useState(false);
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const lastActivityRef = useRef<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const prevStreamingRef = useRef<boolean>(streaming);

  // 1. Ignition Sweep Sequence: Sapuan laser booting saat pertama kali dimuat
  useEffect(() => {
    const timer = setTimeout(() => setIsIgnition(false), 450);
    return () => clearTimeout(timer);
  }, []);

  // 2. Gyro / Inertia Tracker: Mata spiral (@ @) saat window dipindahkan di desktop
  useEffect(() => {
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let unlistenMoved: (() => void) | undefined;

    const onDragChange = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      if (custom.detail) {
        setIsDragging(true);
        if (stopTimer) clearTimeout(stopTimer);
        // Fail-safe auto-reset jika tidak ada pergerakan selama 600ms
        stopTimer = setTimeout(() => {
          setIsDragging(false);
        }, 600);
      } else {
        if (stopTimer) clearTimeout(stopTimer);
        setIsDragging(false);
      }
    };
    window.addEventListener("astra-window-drag", onDragChange);

    // Pantau pergerakan window native dari Tauri:
    // Selama window bergerak, spiral aktif. Begitu berhenti bergerak selama 250ms, spiral berhenti seketika!
    void getCurrentWindow().onMoved(() => {
      setIsDragging(true);
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        setIsDragging(false);
      }, 250);
    }).then((unlisten) => {
      unlistenMoved = unlisten;
    });

    return () => {
      window.removeEventListener("astra-window-drag", onDragChange);
      unlistenMoved?.();
      if (stopTimer) clearTimeout(stopTimer);
    };
  }, []);

  // 3. Tangkap event Double-Click dari Bubble atau SpeechBalloonView & Toggle Sleep
  useEffect(() => {
    const onDoubleClick = () => {
      setIsHyped(true);
      const timer = setTimeout(() => setIsHyped(false), 1300);
      return () => clearTimeout(timer);
    };
    const onToggleSleep = () => {
      setIsDrowsy((prev) => !prev);
    };
    window.addEventListener("astra-pet-double-click", onDoubleClick);
    window.addEventListener("astra-pet-toggle-sleep", onToggleSleep);
    return () => {
      window.removeEventListener("astra-pet-double-click", onDoubleClick);
      window.removeEventListener("astra-pet-toggle-sleep", onToggleSleep);
    };
  }, []);

  // 4. Audio Barge-in Listener: Mata terperanjat (O_O) saat asisten disela
  useEffect(() => {
    const onBargeIn = () => {
      setInterrupted(true);
      const timer = setTimeout(() => setInterrupted(false), 550);
      return () => clearTimeout(timer);
    };
    window.addEventListener("astra-barge-in", onBargeIn);
    return () => window.removeEventListener("astra-barge-in", onBargeIn);
  }, []);

  // 5. Star Eyes (✦ ✦): Flash lampu high-beam sejenak saat jawaban selesai digenerate
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && !lastMsg.error) {
        setShowStarEyes(true);
        const timer = setTimeout(() => setShowStarEyes(false), 1300);
        return () => clearTimeout(timer);
      }
    }
    prevStreamingRef.current = streaming;
  }, [streaming, messages]);

  // Reset timer keaktifan jika ada aktivitas suara atau streaming
  useEffect(() => {
    if (speaking || isRecording || streaming) {
      lastActivityRef.current = Date.now();
      setIsDrowsy(false);
    }
  }, [speaking, isRecording, streaming]);

  // 5. Deteksi Aktivitas Global (Mouse & Keyboard) untuk Low Power Mode (29 Menit = 1.740.000 ms)
  // 0% Memory Overhead: hanya memperbarui satu integer timestamp (8 byte), bebas memory leak
  useEffect(() => {
    const LOW_POWER_DELAY = 29 * 60 * 1000; // 29 menit tanpa gerak kursor / ketikan keyboard

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
      if (isDrowsy) {
        setIsDrowsy(false);
        setEmotion("blink");
        setTimeout(() => setEmotion("idle"), 200);
      }
    };

    // 6. Interactive Gaze Tracking ke Arah Kursor Mouse secara Real-Time
    const onPointerMove = (e: PointerEvent) => {
      recordActivity();

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Radius jangkauan pelacakan tatapan (bekerja dinamis baik di bubble 64px maupun window chat penuh)
      const reachX = Math.max(rect.width * 2.2, 130);
      const reachY = Math.max(rect.height * 2.2, 130);

      const dx = (e.clientX - centerX) / reachX;
      const dy = (e.clientY - centerY) / reachY;

      const clampedX = Math.max(-1, Math.min(1, dx));
      const clampedY = Math.max(-1, Math.min(1, dy));

      setGaze({
        x: clampedX * 6.5,
        y: clampedY * 5.0,
      });
    };

    const onPointerLeave = () => {
      setGaze({ x: 0, y: 0 });
    };

    const onKeyDown = () => {
      recordActivity();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("keydown", onKeyDown, { passive: true });

    // Pengecekan interval setiap 5 detik (aritmatika 1 baris, 0% CPU footprint)
    const checkDrowsyInterval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > LOW_POWER_DELAY) {
        setIsDrowsy(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
      clearInterval(checkDrowsyInterval);
    };
  }, [isDrowsy]);

  // 7. Siklus Emosi Idle Spontan Khas Dasai Mochi JDM
  useEffect(() => {
    if (isIgnition || interrupted || isDragging || isHyped || showStarEyes) return;
    if (speaking || isRecording || streaming || isDrowsy) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = () => {
      const wait = Math.random() * 2600 + 1600; // 1.6s - 4.2s
      return setTimeout(() => {
        if (isDrowsy) {
          timer = loop();
          return;
        }

        const rand = Math.random();
        if (rand < 0.4) {
          // Kedip cepat presisi
          setEmotion("blink");
          setTimeout(() => setEmotion("idle"), 160);
        } else if (rand < 0.55) {
          // Melirik kiri
          setEmotion("look-left");
          setTimeout(() => setEmotion("idle"), 950);
        } else if (rand < 0.7) {
          // Melirik kanan
          setEmotion("look-right");
          setTimeout(() => setEmotion("idle"), 950);
        } else if (rand < 0.8) {
          // Happy Face (^ ^)
          setEmotion("happy");
          setTimeout(() => setEmotion("idle"), 950);
        } else if (rand < 0.9) {
          // Smug half-eye (tatapan tengil pembalap JDM)
          setEmotion("smug");
          setTimeout(() => setEmotion("idle"), 1200);
        } else {
          // Wink tajam
          setEmotion("wink");
          setTimeout(() => setEmotion("idle"), 900);
        }
        timer = loop();
      }, wait);
    };

    timer = loop();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    isIgnition,
    interrupted,
    isDragging,
    isHyped,
    showStarEyes,
    speaking,
    isRecording,
    streaming,
    isDrowsy,
  ]);

  // 8. Interactive Tap / Double Tap Reaction (Single = Wink, Double = Hyped `> <`)
  const handleClick = () => {
    lastActivityRef.current = Date.now();
    if (isDrowsy) {
      setIsDrowsy(false);
      return;
    }

    if (speaking) {
      setInterrupted(true);
      setTimeout(() => setInterrupted(false), 550);
      playBargeInCue();
      useVoiceStore.getState().stopSpeaking();
      useChatStore.getState().stop();
      useChatStore.getState().markInterrupted();
      const s = useVoiceStore.getState();
      if (s.mode === "dialog" && s.dialogActive && s.state === "idle") {
        void s.startRecording().catch(() => undefined);
      }
      return;
    }

    const now = Date.now();
    if (now - lastClickTimeRef.current < 350) {
      // Double click: Hyped Drift Face `> <`
      setIsHyped(true);
      setTimeout(() => setIsHyped(false), 1200);
    } else {
      // Single click: Wink tajam JDM
      setEmotion("wink");
      setTimeout(() => setEmotion("idle"), 800);
    }
    lastClickTimeRef.current = now;
  };

  // Deteksi error koneksi LLM / Check Engine
  const lastMsg = messages[messages.length - 1];
  const hasError = !streaming && ((lastMsg && Boolean(lastMsg.error)) || connStatus === "offline");

  // Penentuan ekspresi aktif berdasarkan prioritas status
  const active: RobotEmotion = isIgnition
    ? "ignition"
    : interrupted
      ? "interrupted"
      : isDragging
        ? "dizzy"
        : isHyped
          ? "hyped"
          : showStarEyes
            ? "star"
            : hasError
              ? "glitch"
              : speaking
                ? "speaking"
                : isRecording
                  ? "listening"
                  : streaming
                    ? "thinking"
                    : isDrowsy
                      ? "sleepy"
                      : emotion;

  const glanceX =
    active === "look-left" ? -5.5 : active === "look-right" ? 5.5 : gaze.x;
  const glanceY = gaze.y;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsHyped(true);
        setTimeout(() => setIsHyped(false), 1300);
      }}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#080906] select-none shadow-[inset_0_2px_4px_rgba(255,255,255,0.22)] transition-transform duration-100 ${
        speaking ? "cursor-pointer hover:opacity-90 active:scale-[0.96]" : "active:scale-[0.97]"
      }`}
      style={{
        transform: `perspective(240px) rotateY(${glanceX * 2.5}deg) rotateX(${-glanceY * 2.5}deg)`,
      }}
      title={
        speaking
          ? "Klik untuk menyela (barge-in)"
          : hasError
            ? "Peringatan sistem: Terputus dari model AI (Check Engine)"
            : isDrowsy
              ? "Mode hemat daya · Gerakkan mouse atau ketik keyboard untuk menyalakan kembali"
              : "Astra JDM Cyber Pet · Double-klik untuk mode Hyped Drift"
      }
    >
      {/* Cincin Lingkar Luar Cyber Glow (Neon Lime / Tachometer Blue / Coral Alert) */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-full border-[2px] transition-all duration-200 ${
          interrupted || hasError
            ? "border-[#f07167] shadow-[0_0_24px_rgba(240,113,103,0.7),inset_0_0_12px_rgba(240,113,103,0.4)] scale-[1.05]"
            : isDragging
              ? "border-[#c8f16b] shadow-[0_0_24px_rgba(200,241,107,0.8),inset_0_0_14px_rgba(200,241,107,0.4)] scale-[1.04]"
              : isRecording
                ? "border-[#c8f16b] shadow-[0_0_22px_rgba(200,241,107,0.7),inset_0_0_12px_rgba(200,241,107,0.35)] scale-[1.03]"
                : speaking
                  ? "border-[#c8f16b] shadow-[0_0_18px_rgba(200,241,107,0.5),inset_0_0_10px_rgba(200,241,107,0.25)] animate-mochi-speak-ring"
                  : streaming
                    ? "border-[#70d6ff] shadow-[0_0_18px_rgba(112,214,255,0.5),inset_0_0_8px_rgba(112,214,255,0.3)]"
                    : isDrowsy
                      ? "border-[#c8f16b]/45 shadow-[0_0_12px_rgba(200,241,107,0.3),inset_0_0_6px_rgba(200,241,107,0.15)]"
                      : "border-[#c8f16b]/50 shadow-[0_0_15px_rgba(200,241,107,0.35),inset_0_0_8px_rgba(200,241,107,0.2)]"
        }`}
      />

      {/* Efek Kejut Interupsi (Barge-In Shockwave Ripple) */}
      {interrupted && (
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#f07167] animate-mochi-barge-ripple" />
      )}

      {/* Pantulan Kaca Lengkung Visor Helm 2.5D (Parallax Glare Utama JDM) */}
      <div
        className="pointer-events-none absolute -left-2 -top-3 h-12 w-16 rounded-full bg-gradient-to-b from-white/45 via-white/10 to-transparent blur-[0.4px] transition-transform duration-150"
        style={{
          transform: `rotate(-28deg) translate(${-glanceX * 2.4}px, ${-glanceY * 2.0}px)`,
        }}
      />

      {/* Pantulan Sekunder Sisi Kaca Helm Bawah (Specular Rim Light) */}
      <div
        className="pointer-events-none absolute -right-1 -bottom-2 h-7 w-12 rounded-full bg-gradient-to-t from-white/25 to-transparent blur-[0.6px] transition-transform duration-150"
        style={{
          transform: `rotate(15deg) translate(${-glanceX * 1.5}px, ${-glanceY * 1.2}px)`,
        }}
      />

      {/* SVG Tampilan OLED Dasai Mochi (Monokrom Neon Cyber, Bersih & Tajam) */}
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        style={{
          filter:
            hasError
              ? "drop-shadow(0 0 6px rgba(240, 113, 103, 0.95))"
              : streaming
                ? "drop-shadow(0 0 6px rgba(112, 214, 255, 0.95))"
                : "drop-shadow(0 0 5px rgba(200, 241, 107, 0.95))",
        }}
      >
        <defs>
          {/* Gradien Warna Mata Neon Lime JDM */}
          <linearGradient id="cyberEyeGrad" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e8ff9e" />
            <stop offset="100%" stopColor="#b5e848" />
          </linearGradient>

          {/* Gradien Cyan Komputasi Turbo */}
          <linearGradient id="cyberTurboGrad" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#b5f2ff" />
            <stop offset="100%" stopColor="#5cd0ff" />
          </linearGradient>
        </defs>

        {/* 1. Ignition Boot Sweep (Sapuan Laser Kontak Awal) */}
        {active === "ignition" ? (
          <g fill="url(#cyberEyeGrad)">
            <rect x="12" y="31" width="40" height="2.5" rx="1" className="animate-pulse" />
          </g>
        ) : active === "interrupted" ? (
          /* 2. Barge-in / Rem Mendadak (Mata Bulat Kaget O_O) */
          <g>
            <g fill="url(#cyberEyeGrad)">
              <circle cx="22" cy="29" r="8.5" />
              <circle cx="42" cy="29" r="8.5" />
            </g>
            <circle cx="22" cy="29" r="2.8" fill="#ffffff" />
            <circle cx="42" cy="29" r="2.8" fill="#ffffff" />
            <line x1="28" y1="44" x2="36" y2="44" stroke="url(#cyberEyeGrad)" strokeWidth="3" strokeLinecap="round" />
          </g>
        ) : active === "dizzy" ? (
          /* 3. Gyro / G-Force Inertia (@ @ Spiral Eyes saat Bubble di-drag) */
          <g stroke="url(#cyberEyeGrad)" strokeWidth="2.4" strokeLinecap="round" fill="none">
            <g style={{ transformOrigin: "22.5px 30px", animation: "spin 0.7s linear infinite" }}>
              <path d="M 22.5 30 m -7 0 a 7 7 0 1 0 14 0 a 5 5 0 1 0 -10 0 a 3 3 0 1 0 6 0" />
            </g>
            <g style={{ transformOrigin: "41.5px 30px", animation: "spin 0.7s linear infinite" }}>
              <path d="M 41.5 30 m -7 0 a 7 7 0 1 0 14 0 a 5 5 0 1 0 -10 0 a 3 3 0 1 0 6 0" />
            </g>
          </g>
        ) : active === "star" ? (
          /* 4. High-Beam Star Eyes (✦ ✦ Lampu Sorot Sport Sukses) */
          <g className="animate-mochi-star-spin" style={{ transformOrigin: "32px 30px" }}>
            <path
              d="M 22.5 20 Q 22.5 30 14 30 Q 22.5 30 22.5 40 Q 22.5 30 31 30 Q 22.5 30 22.5 20 Z"
              fill="url(#cyberEyeGrad)"
            />
            <circle cx="22.5" cy="30" r="1.8" fill="#ffffff" />
            <path
              d="M 41.5 20 Q 41.5 30 33 30 Q 41.5 30 41.5 40 Q 41.5 30 50 30 Q 41.5 30 41.5 20 Z"
              fill="url(#cyberEyeGrad)"
            />
            <circle cx="41.5" cy="30" r="1.8" fill="#ffffff" />
          </g>
        ) : active === "hyped" ? (
          /* 5. Hyped Drift Face (> < Chevron Sharp Double-Tap) */
          <g className="animate-mochi-drift-wiggle">
            <g stroke="url(#cyberEyeGrad)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M 16 23 L 28 30 L 16 37" />
              <path d="M 48 23 L 36 30 L 48 37" />
              <line x1="28" y1="44" x2="36" y2="44" strokeWidth="3" />
            </g>
          </g>
        ) : active === "glitch" ? (
          /* 6. Check Engine / Offline (X X Glitch Eyes) */
          <g stroke="#f07167" strokeWidth="4.2" strokeLinecap="round">
            <line x1="17" y1="24" x2="28" y2="36" />
            <line x1="28" y1="24" x2="17" y2="36" />
            <line x1="36" y1="24" x2="47" y2="36" />
            <line x1="47" y1="24" x2="36" y2="36" />
            <line x1="27" y1="44" x2="37" y2="44" strokeWidth="2.5" />
          </g>
        ) : active === "smug" ? (
          /* 7. Smug Half-Eye (Tatapan Tengil Khas Mochi) */
          <g fill="url(#cyberEyeGrad)">
            <path d="M 16 27 L 29 24 L 29 35 L 16 35 Z" />
            <circle cx="20" cy="30" r="1.8" fill="#ffffff" />
            <path d="M 35 24 L 48 27 L 48 35 L 35 35 Z" />
            <circle cx="44" cy="30" r="1.8" fill="#ffffff" />
            <line x1="30" y1="44" x2="38" y2="42" stroke="url(#cyberEyeGrad)" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        ) : active === "wink" ? (
          /* 8. Sharp Wink (Kedipan Sebelah Mata Bersih) */
          <g>
            <g fill="url(#cyberEyeGrad)">
              <rect x="16" y="21" width="13" height="21" rx="6" />
              <circle cx="19.5" cy="25.5" r="2.2" fill="#ffffff" />
              <circle cx="24.5" cy="34" r="1.1" fill="#ffffff" opacity="0.8" />
            </g>
            <path d="M 35 32 Q 41.5 21 48 32" stroke="url(#cyberEyeGrad)" strokeWidth="4" strokeLinecap="round" fill="none" />
          </g>
        ) : active === "happy" ? (
          /* 9. Happy Face (^ ^ Sharp Arcs) */
          <g
            stroke="url(#cyberEyeGrad)"
            strokeWidth="4.2"
            strokeLinecap="round"
            fill="none"
            style={{
              transform: `translate(${glanceX * 0.6}px, ${glanceY * 0.6}px)`,
              transition: "transform 100ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            <path d="M 16 34 Q 22.5 20 29 34" />
            <path d="M 35 34 Q 41.5 20 48 34" />
          </g>
        ) : active === "sleepy" ? (
          /* 10. Low Power Sleep (— — Straight Digital Cyber Bars) */
          <g className="animate-mochi-sleepy">
            {/* Batang Mata Tidur Lurus Khas JDM Dasai Mochi (Bukan Melengkung) */}
            <rect
              x="15"
              y="28.5"
              width="15"
              height="4.6"
              rx="2.3"
              fill="url(#cyberEyeGrad)"
            />
            <rect
              x="34"
              y="28.5"
              width="15"
              height="4.6"
              rx="2.3"
              fill="url(#cyberEyeGrad)"
            />
          </g>
        ) : active === "speaking" ? (
          /* 11. Audio Speech Mode (Digital Frequency EQ Bars di Bawah Mata) */
          <g>
            <g className="animate-mochi-talk-eyes" fill="url(#cyberEyeGrad)">
              <rect x="16" y="20" width="13" height="21" rx="6" />
              <circle cx="19.5" cy="24.5" r="2.2" fill="#ffffff" />
              <circle cx="24.5" cy="33" r="1.1" fill="#ffffff" opacity="0.8" />

              <rect x="35" y="20" width="13" height="21" rx="6" />
              <circle cx="38.5" cy="24.5" r="2.2" fill="#ffffff" />
              <circle cx="43.5" cy="33" r="1.1" fill="#ffffff" opacity="0.8" />
            </g>

            {/* Digital Frequency EQ Bars (Bukan Bibir Kartun!) */}
            <g fill="url(#cyberEyeGrad)">
              <rect x="22" y="44" width="3" height="5" rx="1.5" className="animate-mochi-eq-1" />
              <rect x="27" y="42" width="3" height="9" rx="1.5" className="animate-mochi-eq-2" />
              <rect x="32" y="41" width="3" height="11" rx="1.5" className="animate-mochi-eq-3" />
              <rect x="37" y="42" width="3" height="9" rx="1.5" className="animate-mochi-eq-2" />
              <rect x="42" y="44" width="3" height="5" rx="1.5" className="animate-mochi-eq-1" />
            </g>
          </g>
        ) : active === "listening" ? (
          /* 12. Mode Mendengarkan Suara (Live Mic VU Meter Real-Time) */
          <g fill="url(#cyberEyeGrad)">
            <rect
              x="14"
              y={20 - Math.min(3, audioLevel * 5)}
              width="15"
              height={24 + Math.min(6, audioLevel * 10)}
              rx="7"
            />
            <circle cx="18" cy="24" r="2.2" fill="#ffffff" />
            <circle cx="25" cy="36" r="1.2" fill="#ffffff" opacity="0.8" />

            <rect
              x="35"
              y={20 - Math.min(3, audioLevel * 5)}
              width="15"
              height={24 + Math.min(6, audioLevel * 10)}
              rx="7"
            />
            <circle cx="39" cy="24" r="2.2" fill="#ffffff" />
            <circle cx="46" cy="36" r="1.2" fill="#ffffff" opacity="0.8" />

            {/* Live Mic VU Bars Mengikuti Desibel Suara Anda */}
            {[-2, -1, 0, 1, 2].map((offset, i) => {
              const barH = Math.max(3, Math.min(13, 3 + audioLevel * (18 - Math.abs(offset) * 3)));
              return (
                <rect
                  key={i}
                  x={32 + offset * 5 - 1.5}
                  y={46 - barH / 2}
                  width="3"
                  height={barH}
                  rx="1.5"
                />
              );
            })}
          </g>
        ) : active === "thinking" ? (
          /* 13. Thinking Mode: Mata Melirik Berpikir Khas Dasai Mochi + ECU Scanline */
          <g>
            {/* Kelompok Mata Berpikir yang Hidup (Neon Lime + Sparkle Pupils) */}
            <g className="animate-mochi-thinking-eyes" fill="url(#cyberEyeGrad)">
              {/* Mata Kiri Menyipit Fokus */}
              <rect x="16" y="22" width="13" height="19" rx="6" />
              <circle cx="19.5" cy="26" r="2.1" fill="#ffffff" />
              <circle cx="24.5" cy="34" r="1.1" fill="#ffffff" opacity="0.8" />

              {/* Mata Kanan Menyipit Fokus */}
              <rect x="35" y="22" width="13" height="19" rx="6" />
              <circle cx="38.5" cy="26" r="2.1" fill="#ffffff" />
              <circle cx="43.5" cy="34" r="1.1" fill="#ffffff" opacity="0.8" />
            </g>

            {/* Garis Sapuan Pemindai Halus (ECU Radar Scanline) Melintas di Area Mata */}
            <g className="animate-mochi-scanline">
              <line
                x1="14"
                y1="31"
                x2="50"
                y2="31"
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.5"
              />
            </g>
          </g>
        ) : (
          /* 14. Neutral Idle dengan Pelacakan Gaze Mouse Real-Time */
          <g
            fill="url(#cyberEyeGrad)"
            style={{
              transform: `translate(${glanceX}px, ${glanceY}px)`,
              transition: "transform 80ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {/* Mata Kiri Digital */}
            <rect x="16" y="21" width="13" height="21" rx="6" />
            <circle cx={19.5 + glanceX * 0.45} cy={25.5 + glanceY * 0.45} r="2.2" fill="#ffffff" />
            <circle cx={24.5 + glanceX * 0.45} cy={34 + glanceY * 0.45} r="1.1" fill="#ffffff" opacity="0.8" />

            {/* Mata Kanan Digital */}
            <rect x="35" y="21" width="13" height="21" rx="6" />
            <circle cx={38.5 + glanceX * 0.45} cy={25.5 + glanceY * 0.45} r="2.2" fill="#ffffff" />
            <circle cx={43.5 + glanceX * 0.45} cy={34 + glanceY * 0.45} r="1.1" fill="#ffffff" opacity="0.8" />
          </g>
        )}

        {/* Cincin Sapuan Tachometer Konsentris Sempurna saat Thinking */}
        {active === "thinking" && (
          <circle
            cx="32"
            cy="32"
            r="28.5"
            fill="none"
            stroke="#70d6ff"
            strokeWidth="2.4"
            strokeDasharray="40 140"
            strokeLinecap="round"
            className="animate-mochi-tachometer"
            style={{
              transformOrigin: "32px 32px",
            }}
          />
        )}
      </svg>
    </div>
  );
}
