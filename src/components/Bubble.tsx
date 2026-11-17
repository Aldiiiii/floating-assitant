import { useCallback, useRef, useState } from "react";
import { useWindowDrag } from "../lib/useWindowDrag";
import { DasaiMochiFace } from "./DasaiMochiFace";

interface BubbleProps {
  onExpand: () => void;
}

export function Bubble({ onExpand }: BubbleProps) {
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pisahkan Single Click (Buka Chat) vs Double Click (Mode Hyped > <)
  const handleClick = useCallback(() => {
    clickCountRef.current += 1;
    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
        onExpand();
      }, 230);
    } else if (clickCountRef.current >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      clickCountRef.current = 0;
      // Double click terdeteksi: Pemicu ekspresi Hyped Drift Face
      window.dispatchEvent(new CustomEvent("astra-pet-double-click"));
    }
  }, [onExpand]);

  const drag = useWindowDrag(handleClick);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      {...drag}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExpand();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Astra Cyber Pet · Klik untuk membuka · Double-klik untuk mode Hyped · Tahan untuk memindahkan"
      className="assistant-bubble relative flex h-16 w-16 cursor-grab select-none items-center justify-center rounded-full bg-[#080906] p-[1.5px] border border-white/10 shadow-none outline-none transition-transform hover:scale-[1.06] active:cursor-grabbing active:scale-[0.95]"
    >
      <DasaiMochiFace isHovered={isHovered} />
    </div>
  );
}

