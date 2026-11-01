import { useState } from "react";
import { useWindowDrag } from "../lib/useWindowDrag";
import { DasaiMochiFace } from "./DasaiMochiFace";

interface BubbleProps {
  onExpand: () => void;
}

export function Bubble({ onExpand }: BubbleProps) {
  const drag = useWindowDrag(onExpand);
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
      title="Astra Cyber Pet · Klik untuk membuka · Tahan atau geser untuk memindahkan"
      className="assistant-bubble relative flex h-16 w-16 cursor-grab select-none items-center justify-center rounded-full bg-[#080906] p-[1.5px] border border-white/10 shadow-none outline-none transition-transform hover:scale-[1.06] active:cursor-grabbing active:scale-[0.95]"
    >
      <DasaiMochiFace isHovered={isHovered} />
    </div>
  );
}

