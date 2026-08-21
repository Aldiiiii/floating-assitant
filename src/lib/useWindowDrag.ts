import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const MOVE_THRESHOLD_PX = 5;
const HOLD_TO_DRAG_MS = 180;

interface Gesture { x: number; y: number; dragging: boolean; }

/**
 * Satu area dapat dipakai untuk dua aksi tanpa saling berebut event native:
 * klik cepat untuk activate, tahan atau geser untuk memindahkan window.
 */
export function useWindowDrag(onActivate?: () => void) {
  const gestureRef = useRef<Gesture | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;

  const clearDragTimer = useCallback(() => {
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    dragTimerRef.current = null;
  }, []);

  const startNativeDrag = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.dragging) return;
    gesture.dragging = true;
    clearDragTimer();
    void getCurrentWindow().startDragging();
  }, [clearDragTimer]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    gestureRef.current = { x: event.clientX, y: event.clientY, dragging: false };
    clearDragTimer();
    dragTimerRef.current = setTimeout(startNativeDrag, HOLD_TO_DRAG_MS);
  }, [clearDragTimer, startNativeDrag]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.dragging) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (dx * dx + dy * dy >= MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) startNativeDrag();
  }, [startNativeDrag]);

  const finish = useCallback(() => {
    const gesture = gestureRef.current;
    clearDragTimer();
    gestureRef.current = null;
    if (gesture && !gesture.dragging) activateRef.current?.();
  }, [clearDragTimer]);

  useEffect(() => clearDragTimer, [clearDragTimer]);

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
