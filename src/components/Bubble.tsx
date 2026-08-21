import { useWindowDrag } from "../lib/useWindowDrag";
import { Icon } from "./Icon";

interface BubbleProps { onExpand: () => void; }
export function Bubble({ onExpand }: BubbleProps) {
  const drag = useWindowDrag(onExpand);
  return <div {...drag} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onExpand(); } }} title="Klik untuk membuka · tahan atau geser untuk memindahkan" className="assistant-bubble relative flex h-16 w-16 cursor-grab select-none items-center justify-center rounded-full bg-[#c8f16b] text-[#1a1a17] shadow-[0_12px_34px_rgba(0,0,0,.5)] outline-none transition-transform hover:scale-[1.03] hover:bg-[#d7fb80] active:cursor-grabbing active:scale-[.97]"><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-[#c8f16b] bg-[#1c1c1a]" /><Icon name="sparkle" className="h-6 w-6 stroke-[1.8]" /></div>;
}
