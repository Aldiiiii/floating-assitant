import { useCallback, useEffect, useRef, useState } from "react";
import { cancelAreaSelection, submitAreaSelection } from "../lib/api";

interface DragRect { ax: number; ay: number; bx: number; by: number; }

export function OverlaySelector() {
  const [rect, setRect] = useState<DragRect | null>(null); const rectRef = useRef<DragRect | null>(null); const submittingRef = useRef(false);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void cancelAreaSelection().catch(() => undefined); }; const onContext = (event: MouseEvent) => event.preventDefault(); window.addEventListener("keydown", onKey); window.addEventListener("contextmenu", onContext); return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("contextmenu", onContext); }; }, []);
  const confirm = useCallback(async (drag: DragRect) => { if (submittingRef.current) return; submittingRef.current = true; const scale = window.devicePixelRatio || 1; try { await submitAreaSelection({ x: Math.round(Math.min(drag.ax, drag.bx) * scale), y: Math.round(Math.min(drag.ay, drag.by) * scale), width: Math.round(Math.abs(drag.ax - drag.bx) * scale), height: Math.round(Math.abs(drag.ay - drag.by) * scale) }); } catch { submittingRef.current = false; } }, []);
  useEffect(() => { const onMove = (event: MouseEvent) => { const current = rectRef.current; if (!current) return; const next = { ...current, bx: event.clientX, by: event.clientY }; rectRef.current = next; setRect(next); }; const onUp = () => { const drag = rectRef.current; if (!drag) return; rectRef.current = null; setRect(null); if (Math.abs(drag.ax - drag.bx) < 8 || Math.abs(drag.ay - drag.by) < 8) return; void confirm(drag); }; window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }; }, [confirm]);
  const style = rect ? { left: Math.min(rect.ax, rect.bx), top: Math.min(rect.ay, rect.by), width: Math.abs(rect.ax - rect.bx), height: Math.abs(rect.ay - rect.by) } : null;
  return (
    <div
      className="relative h-screen w-screen cursor-crosshair bg-black/40"
      onMouseDown={(event) => {
        if (event.button !== 0 || submittingRef.current) return;
        const next = { ax: event.clientX, ay: event.clientY, bx: event.clientX, by: event.clientY };
        rectRef.current = next;
        setRect(next);
      }}
    >
      {style && (
        <div
          className="absolute border-2 border-[#c8f16b] bg-[#c8f16b]/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
          style={style}
        >
          <span className="absolute -top-8 right-0 rounded-md border border-white/10 bg-[#141413]/95 px-2 py-0.5 font-mono text-[10px] font-medium text-[#c8f16b] shadow-lg">
            {style.width} × {style.height}
          </span>
        </div>
      )}
      {!rect && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
          <span className="rounded-full border border-white/10 bg-[#141413]/90 px-4 py-1.5 text-[11px] font-medium text-zinc-200 shadow-2xl backdrop-blur-md">
            Tarik kursor untuk memilih area <span className="mx-1 text-zinc-500">·</span> Esc batal
          </span>
        </div>
      )}
    </div>
  );
}
