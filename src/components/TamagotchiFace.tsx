import { useEffect, useState } from "react";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";

interface TamagotchiFaceProps {
  isHovered?: boolean;
}

type EyeState = "normal" | "blink" | "look-left" | "look-right" | "happy";

export function TamagotchiFace({ isHovered = false }: TamagotchiFaceProps) {
  const streaming = useChatStore((s) => s.streaming);
  const isRecording = useVoiceStore((s) => s.state === "recording");
  const [eyeState, setEyeState] = useState<EyeState>("normal");

  useEffect(() => {
    if (isHovered) {
      setEyeState("happy");
      return;
    }

    // Interval spontan: kedip atau melirik kiri-kanan
    const loop = () => {
      const delay = Math.random() * 2500 + 1800; // 1.8s - 4.3s
      return setTimeout(() => {
        const rand = Math.random();
        if (rand < 0.65) {
          // Kedip
          setEyeState("blink");
          setTimeout(() => setEyeState("normal"), 160);
        } else if (rand < 0.82) {
          // Melirik kiri
          setEyeState("look-left");
          setTimeout(() => setEyeState("normal"), 850);
        } else {
          // Melirik kanan
          setEyeState("look-right");
          setTimeout(() => setEyeState("normal"), 850);
        }
        timer = loop();
      }, delay);
    };

    let timer = loop();
    return () => clearTimeout(timer);
  }, [isHovered]);

  const activeState: EyeState = isHovered
    ? "happy"
    : isRecording
    ? "happy"
    : eyeState;

  // Offset posisi melirik
  const shiftX =
    activeState === "look-left" ? -2.5 : activeState === "look-right" ? 2.5 : 0;

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Telinga / Headphone Robot di Kiri & Kanan */}
      <span className="absolute -left-0.5 top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-[#181a14] opacity-80" />
      <span className="absolute -right-0.5 top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-[#181a14] opacity-80" />

      {/* Antena Robot di Atas */}
      <span className="absolute -top-1 left-1/2 h-2 w-1 -translate-x-1/2 rounded-full bg-[#1e2018]" />
      <span className="absolute -top-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#c8f16b] shadow-[0_0_6px_#c8f16b]" />

      {/* Layar OLED Retro Robot (Hitam Kaca) */}
      <div className="relative flex h-[38px] w-[46px] items-center justify-center overflow-hidden rounded-[13px] border border-black/40 bg-[#0d0f0b] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_2px_4px_rgba(0,0,0,0.3)]">
        {/* Pantulan Kaca Mengkilap (Glossy Reflection) */}
        <div className="pointer-events-none absolute -left-2 -top-3 h-8 w-12 rotate-[-28deg] bg-gradient-to-b from-white/18 via-white/5 to-transparent" />

        {/* Indikator Status Mini: Heart / Battery ESP32 di pojok layar */}
        <div className="pointer-events-none absolute left-1.5 top-1 flex items-center gap-0.5 opacity-65">
          <span
            className={`h-1 w-1 rounded-full ${
              streaming
                ? "bg-[#ff7b90] animate-ping"
                : isRecording
                ? "bg-[#c8f16b] animate-pulse"
                : "bg-[#c8f16b]"
            }`}
          />
        </div>

        {/* Wajah / Mata Robot Tamagotchi (SVG) */}
        <svg
          viewBox="0 0 46 36"
          className="h-full w-full select-none"
          style={{
            filter: "drop-shadow(0 0 3px rgba(200, 241, 107, 0.75))",
          }}
        >
          {activeState === "happy" ? (
            /* Mata Melengkung Senyum Gembira ^ ^ */
            <g
              stroke="#c8f16b"
              strokeWidth="2.6"
              strokeLinecap="round"
              fill="none"
            >
              {/* Mata Kiri ^ */}
              <path d="M 12 18 Q 16 12 20 18" />
              {/* Mata Kanan ^ */}
              <path d="M 26 18 Q 30 12 34 18" />

              {/* Mulut Senyum Lucu w */}
              <path d="M 21 22 Q 23 24 25 22" strokeWidth="1.8" />

              {/* Pipi Merona Pink (Kawaii Blush) */}
              <circle
                cx="11"
                cy="21.5"
                r="1.8"
                fill="#ff7b90"
                stroke="none"
                opacity="0.9"
              />
              <circle
                cx="35"
                cy="21.5"
                r="1.8"
                fill="#ff7b90"
                stroke="none"
                opacity="0.9"
              />
            </g>
          ) : activeState === "blink" ? (
            /* Mata Menutup Sejenak (Blink) */
            <g
              stroke="#c8f16b"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            >
              <line x1="12" y1="18" x2="20" y2="18" />
              <line x1="26" y1="18" x2="34" y2="18" />
            </g>
          ) : streaming ? (
            /* Mode Berpikir (Thinking) saat AI menjawab: Mata bergoyang lucu */
            <g fill="#c8f16b">
              <rect
                x="12"
                y="15"
                width="8"
                height="8"
                rx="3"
                className="animate-bounce"
                style={{ animationDuration: "0.6s" }}
              />
              <rect
                x="26"
                y="15"
                width="8"
                height="8"
                rx="3"
                className="animate-bounce"
                style={{ animationDuration: "0.6s", animationDelay: "0.2s" }}
              />
            </g>
          ) : (
            /* Mode Normal & Melirik (Normal Digital Pixel Eyes) */
            <g
              fill="#c8f16b"
              style={{
                transform: `translateX(${shiftX}px)`,
                transition: "transform 150ms ease-out",
              }}
            >
              {/* Mata Kiri Digital */}
              <rect x="12" y="14" width="8" height="10" rx="2.5" />
              {/* Pupil / Pantulan Cahaya Putih Kiri */}
              <rect x="13.5" y="15.5" width="2.5" height="2.5" rx="0.6" fill="#ffffff" />

              {/* Mata Kanan Digital */}
              <rect x="26" y="14" width="8" height="10" rx="2.5" />
              {/* Pupil / Pantulan Cahaya Putih Kanan */}
              <rect x="27.5" y="15.5" width="2.5" height="2.5" rx="0.6" fill="#ffffff" />

              {/* Titik Hidung / Mulut Mini */}
              <circle cx="23" cy="22" r="0.9" fill="#c8f16b" opacity="0.65" />
            </g>
          )}
        </svg>

        {/* Garis Scanline CRT Khas Layar Tamagotchi */}
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)",
          }}
        />
      </div>

      {/* Tombol Mini Ala Tamagotchi di Bawah Layar */}
      <div className="absolute bottom-1.5 flex gap-1">
        <span className="h-1 w-1 rounded-full bg-[#1a1c15] opacity-50" />
        <span className="h-1 w-1 rounded-full bg-[#1a1c15] opacity-75" />
        <span className="h-1 w-1 rounded-full bg-[#1a1c15] opacity-50" />
      </div>
    </div>
  );
}
