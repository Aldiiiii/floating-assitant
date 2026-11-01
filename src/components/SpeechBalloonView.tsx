import { useState } from "react";
import { useWindowDrag } from "../lib/useWindowDrag";
import type { DockSide } from "../lib/window";
import { ChatPanel } from "./ChatPanel";
import { DasaiMochiFace } from "./DasaiMochiFace";

interface SpeechBalloonViewProps {
  onClose: () => void;
  dock: DockSide;
}

export function SpeechBalloonView({ onClose, dock }: SpeechBalloonViewProps) {
  const dragPet = useWindowDrag(onClose);
  const [isPetHovered, setIsPetHovered] = useState(false);

  const isRight = dock.side === "right";
  const isBottom = dock.vertical === "bottom";

  return (
    <div className="relative flex h-full w-full select-none items-stretch justify-center p-1.5 bg-transparent">
      <div
        className={`flex h-full w-full items-${
          isBottom ? "end" : "start"
        } justify-center gap-1.5`}
      >
        {/* Sisi Kiri: Pet jika dock.side === 'left', atau ChatPanel jika dock.side === 'right' */}
        {!isRight && (
          <div
            {...dragPet}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }}
            onMouseEnter={() => setIsPetHovered(true)}
            onMouseLeave={() => setIsPetHovered(false)}
            title="Astra Cyber Pet · Klik untuk menutup chat · Tahan atau geser untuk memindahkan"
            className="assistant-bubble relative z-30 flex h-16 w-16 shrink-0 cursor-grab select-none items-center justify-center rounded-full bg-[#080906] p-[1.5px] border border-white/10 shadow-none outline-none transition-transform hover:scale-[1.06] active:cursor-grabbing active:scale-[0.95]"
          >
            <DasaiMochiFace isHovered={isPetHovered} />
          </div>
        )}

        {/* Chat Panel & Ekor Balon Percakapan */}
        <div className="relative flex h-full w-[380px] shrink-0 flex-col">
          {/* Ekor Balon (Speech Bubble Tail) */}
          <div
            className={`pointer-events-none absolute z-20 flex items-center ${
              isRight ? "-right-[13px]" : "-left-[13px]"
            } ${isBottom ? "bottom-5" : "top-5"}`}
          >
            <svg
              width="14"
              height="20"
              viewBox="0 0 14 20"
              fill="none"
              className={isRight ? "" : "scale-x-[-1]"}
            >
              <path d="M0 2 L13 10 L0 18 Z" fill="#141413" />
              <path
                d="M0 2 L13 10 L0 18"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="2"
                x2="0"
                y2="18"
                stroke="#141413"
                strokeWidth="2"
              />
            </svg>
          </div>

          {/* Bodi Chat Panel */}
          <ChatPanel onClose={onClose} />
        </div>

        {/* Sisi Kanan: Pet jika dock.side === 'right' */}
        {isRight && (
          <div
            {...dragPet}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }}
            onMouseEnter={() => setIsPetHovered(true)}
            onMouseLeave={() => setIsPetHovered(false)}
            title="Astra Cyber Pet · Klik untuk menutup chat · Tahan atau geser untuk memindahkan"
            className="assistant-bubble relative z-30 flex h-16 w-16 shrink-0 cursor-grab select-none items-center justify-center rounded-full bg-[#080906] p-[1.5px] border border-white/10 shadow-none outline-none transition-transform hover:scale-[1.06] active:cursor-grabbing active:scale-[0.95]"
          >
            <DasaiMochiFace isHovered={isPetHovered} />
          </div>
        )}
      </div>
    </div>
  );
}

