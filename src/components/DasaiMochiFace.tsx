import { useEffect, useState } from "react";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { playBargeInCue } from "../lib/earcons";

interface DasaiMochiFaceProps {
  isHovered?: boolean;
}

type RobotEmotion = "idle" | "blink" | "look-left" | "look-right" | "happy" | "listening" | "thinking" | "speaking";

export function DasaiMochiFace({ isHovered = false }: DasaiMochiFaceProps) {
  const streaming = useChatStore((s) => s.streaming);
  const isRecording = useVoiceStore((s) => s.state === "recording");
  const speaking = useVoiceStore((s) => s.speaking);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const [emotion, setEmotion] = useState<RobotEmotion>("idle");

  useEffect(() => {
    if (isHovered) {
      setEmotion("happy");
      return;
    }
    if (speaking) {
      setEmotion("speaking");
      return;
    }
    if (isRecording) {
      setEmotion("listening");
      return;
    }
    if (streaming) {
      setEmotion("thinking");
      return;
    }

    // Siklus animasi natural: kedip santai & melirik sekitar desktop
    const loop = () => {
      const wait = Math.random() * 2800 + 1800; // 1.8s - 4.6s
      return setTimeout(() => {
        const rand = Math.random();
        if (rand < 0.6) {
          // Kedip halus
          setEmotion("blink");
          setTimeout(() => setEmotion("idle"), 160);
        } else if (rand < 0.8) {
          // Melirik kiri
          setEmotion("look-left");
          setTimeout(() => setEmotion("idle"), 950);
        } else {
          // Melirik kanan
          setEmotion("look-right");
          setTimeout(() => setEmotion("idle"), 950);
        }
        timer = loop();
      }, wait);
    };

    let timer = loop();
    return () => clearTimeout(timer);
  }, [isHovered, isRecording, speaking, streaming]);

  const active = isHovered
    ? "happy"
    : speaking
      ? "speaking"
      : isRecording
        ? "listening"
        : streaming
          ? "thinking"
          : emotion;

  // Offset posisi melirik bola mata
  const glanceX =
    active === "look-left" ? -5 : active === "look-right" ? 5 : 0;

  return (
    <div
      onClick={() => {
        if (speaking) {
          playBargeInCue();
          useVoiceStore.getState().stopSpeaking();
          useChatStore.getState().stop();
          useChatStore.getState().markInterrupted();
          const s = useVoiceStore.getState();
          if (s.mode === "dialog" && s.dialogActive && s.state === "idle") {
            void s.startRecording().catch(() => undefined);
          }
        }
      }}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#080906] select-none shadow-[inset_0_2px_4px_rgba(255,255,255,0.25)] ${
        speaking ? "cursor-pointer hover:opacity-90 active:scale-[0.98]" : ""
      }`}
      title={speaking ? "Klik untuk menyela (barge-in)" : undefined}
    >
      {/* Cincin Lingkar Luar Cyber Glow (Neon Lime Accents) */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-full border-[2px] transition-all duration-200 ${
          isRecording
            ? "border-[#c8f16b] shadow-[0_0_20px_rgba(200,241,107,0.6),inset_0_0_12px_rgba(200,241,107,0.3)] scale-[1.03]"
            : speaking
              ? "border-[#dbff8c] shadow-[0_0_18px_rgba(219,255,140,0.5),inset_0_0_10px_rgba(219,255,140,0.25)]"
              : streaming
                ? "border-[#70d6ff] shadow-[0_0_16px_rgba(112,214,255,0.45),inset_0_0_8px_rgba(112,214,255,0.25)]"
                : "border-[#c8f16b]/50 shadow-[0_0_15px_rgba(200,241,107,0.35),inset_0_0_8px_rgba(200,241,107,0.2)]"
        }`}
      />

      {/* Pantulan Kaca Lengkung Layar OLED (Curved Glass Glare) */}
      <div className="pointer-events-none absolute -left-4 -top-6 h-14 w-20 rotate-[-30deg] bg-gradient-to-b from-white/20 via-white/5 to-transparent" />

      {/* Titik LED Status di Sudut Kanan Atas */}
      <div className="pointer-events-none absolute right-3 top-3 flex items-center opacity-85">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            streaming
              ? "bg-[#70d6ff] animate-ping"
              : isRecording
                ? "bg-[#c8f16b] animate-pulse"
                : speaking
                  ? "bg-[#c8f16b] animate-bounce"
                  : "bg-[#c8f16b]/80"
          }`}
        />
      </div>

      {/* SVG Mata Robot Cozmo / EVE / Vector (Ukuran Penuh 64x64, Tajam & Bersinar) */}
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        style={{
          filter: "drop-shadow(0 0 5px rgba(200, 241, 107, 0.95))",
        }}
      >
        <defs>
          {/* Gradien Warna Mata Neon Lime */}
          <linearGradient id="cyberEyeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8ff9e" />
            <stop offset="100%" stopColor="#b5e848" />
          </linearGradient>
        </defs>

        {active === "happy" ? (
          /* Ekspresi Senyum Gembira ^ ^ (Tebal, Manis, Khas Robot) */
          <g
            stroke="url(#cyberEyeGrad)"
            strokeWidth="4.2"
            strokeLinecap="round"
            fill="none"
          >
            {/* Mata Kiri ^ */}
            <path d="M 16 34 Q 24 20 31 34" />
            {/* Mata Kanan ^ */}
            <path d="M 33 34 Q 40 20 48 34" />
          </g>
        ) : active === "speaking" ? (
          /* Mode Berbicara (Mata Senyum Hidup + Garis Gelombang Suara) */
          <g>
            <g stroke="url(#cyberEyeGrad)" strokeWidth="4" strokeLinecap="round" fill="none">
              <path d="M 16 30 Q 23 20 30 30" />
              <path d="M 34 30 Q 41 20 48 30" />
            </g>
            {/* Gelombang Suara (Vocal Waveform) di Bawah Mata */}
            <g fill="url(#cyberEyeGrad)">
              <rect x="22" y="38" width="3" height="6" rx="1.5" className="animate-pulse" style={{ animationDuration: "0.28s" }} />
              <rect x="27" y="36" width="3" height="10" rx="1.5" className="animate-pulse" style={{ animationDuration: "0.22s" }} />
              <rect x="32" y="35" width="3" height="12" rx="1.5" className="animate-pulse" style={{ animationDuration: "0.25s" }} />
              <rect x="37" y="36" width="3" height="10" rx="1.5" className="animate-pulse" style={{ animationDuration: "0.20s" }} />
              <rect x="42" y="38" width="3" height="6" rx="1.5" className="animate-pulse" style={{ animationDuration: "0.26s" }} />
            </g>
          </g>
        ) : active === "blink" ? (
          /* Kedip Halus (Garis Tebal Digital Horisontal) */
          <g stroke="url(#cyberEyeGrad)" strokeWidth="3.6" strokeLinecap="round">
            <line x1="16" y1="32" x2="30" y2="32" />
            <line x1="34" y1="32" x2="48" y2="32" />
          </g>
        ) : active === "listening" ? (
          /* Mode Mendengarkan Suara (Mata Membesar Berbinar + Reaktif Suara) */
          <g fill="url(#cyberEyeGrad)">
            {/* Mata Kiri Membesar */}
            <rect
              x="14"
              y={20 - Math.min(2, audioLevel * 4)}
              width="15"
              height={24 + Math.min(4, audioLevel * 8)}
              rx="7"
            />
            {/* Pantulan Cahaya Putih Kiri */}
            <circle cx="18" cy="24" r="2.2" fill="#ffffff" />
            <circle cx="25" cy="36" r="1.2" fill="#ffffff" opacity="0.8" />

            {/* Mata Kanan Membesar */}
            <rect
              x="35"
              y={20 - Math.min(2, audioLevel * 4)}
              width="15"
              height={24 + Math.min(4, audioLevel * 8)}
              rx="7"
            />
            {/* Pantulan Cahaya Putih Kanan */}
            <circle cx="39" cy="24" r="2.2" fill="#ffffff" />
            <circle cx="46" cy="36" r="1.2" fill="#ffffff" opacity="0.8" />
          </g>
        ) : active === "thinking" ? (
          /* Mode Thinking (Mata Bergoyang Cepat Bergantian) */
          <g fill="url(#cyberEyeGrad)">
            <rect
              x="16"
              y="22"
              width="13"
              height="20"
              rx="6"
              className="animate-pulse"
              style={{ animationDuration: "0.45s" }}
            />
            <rect
              x="35"
              y="22"
              width="13"
              height="20"
              rx="6"
              className="animate-pulse"
              style={{ animationDuration: "0.45s", animationDelay: "0.22s" }}
            />
          </g>
        ) : (
          /* Mode Normal Cozmo/EVE (Dua Mata Digital Kapsul Besar Berbinar) */
          <g
            fill="url(#cyberEyeGrad)"
            style={{
              transform: `translateX(${glanceX}px)`,
              transition: "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
          >
            {/* Mata Kiri Digital */}
            <rect x="16" y="21" width="13" height="21" rx="6" />
            {/* Pantulan Cahaya Putih Kiri (Eye Sparkle) */}
            <circle cx="19.5" cy="25.5" r="2" fill="#ffffff" />
            <circle cx="24.5" cy="34" r="1.1" fill="#ffffff" opacity="0.75" />

            {/* Mata Kanan Digital */}
            <rect x="35" y="21" width="13" height="21" rx="6" />
            {/* Pantulan Cahaya Putih Kanan (Eye Sparkle) */}
            <circle cx="38.5" cy="25.5" r="2" fill="#ffffff" />
            <circle cx="43.5" cy="34" r="1.1" fill="#ffffff" opacity="0.75" />
          </g>
        )}
      </svg>
    </div>
  );
}
