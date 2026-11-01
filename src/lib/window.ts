import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";
import { setWindowShape } from "./api";

export const SIZES = {
  bubble: { width: 64, height: 64 },
  chat: { width: 466, height: 554 },
} as const;

export type Mode = keyof typeof SIZES;

export interface DockSide {
  side: "left" | "right";
  vertical: "top" | "bottom";
}

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

export function getMochiOffset(dock: DockSide) {
  // Posisi Mochi di dalam window chat (466x554) dengan padding p-1.5 (6px).
  // Sisi horizontal: jika Mochi di kanan, offset = 466 - 64 - 6 = 396; jika di kiri = 6.
  // Sisi vertikal: jika Mochi di bawah, offset = 554 - 64 - 6 = 484; jika di atas = 6.
  const x = dock.side === "right" ? SIZES.chat.width - SIZES.bubble.width - 6 : 6;
  const y = dock.vertical === "bottom" ? SIZES.chat.height - SIZES.bubble.height - 6 : 6;
  return { x, y };
}

export async function detectDock(): Promise<DockSide> {
  const win = getCurrentWindow();
  const monitor = await currentMonitor();
  if (!monitor) return { side: "right", vertical: "bottom" };
  const current = await win.outerPosition();
  const midX = monitor.position.x + monitor.size.width / 2;
  const midY = monitor.position.y + monitor.size.height / 2;
  return {
    side: current.x > midX ? "right" : "left",
    vertical: current.y > midY ? "bottom" : "top",
  };
}

async function fitInsideMonitor(x: number, y: number, widthPx: number, heightPx: number) {
  const monitor = await currentMonitor();
  if (!monitor) return { x, y };
  const minX = monitor.position.x;
  const minY = monitor.position.y;
  const maxX = monitor.position.x + monitor.size.width - widthPx;
  const maxY = monitor.position.y + monitor.size.height - heightPx;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

async function applyShape(mode: Mode) {
  const radius =
    mode === "bubble"
      ? Math.round(SIZES.bubble.width * (await getCurrentWindow().scaleFactor()))
      : 0;
  await setWindowShape(radius).catch(() => undefined);
}

async function applyLayout(mode: Mode, position?: { x: number; y: number }) {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const widthPx = Math.round(SIZES[mode].width * scale);
  const heightPx = Math.round(SIZES[mode].height * scale);
  const current = await win.outerPosition();
  const next = await fitInsideMonitor(
    position?.x ?? current.x,
    position?.y ?? current.y,
    widthPx,
    heightPx,
  );
  await win.setSize(new LogicalSize(SIZES[mode].width, SIZES[mode].height));
  await win.setPosition(new PhysicalPosition(next.x, next.y));
  requestAnimationFrame(() => {
    void win.setSize(new LogicalSize(SIZES[mode].width, SIZES[mode].height));
    window.dispatchEvent(new Event("resize"));
  });
}

export async function restoreStartup(): Promise<{ mode: Mode; dock: DockSide }> {
  const win = getCurrentWindow();
  const store = await getStore();
  const mode = (await store.get<Mode>("window.mode")) ?? "bubble";
  const savedPos = await store.get<{ x: number; y: number }>("window.pos");
  const storedDock = await store.get<DockSide>("window.dock");
  const dock = storedDock ?? (await detectDock());
  const startMinimized = (await store.get<boolean>("app.startMinimized")) ?? false;
  await applyLayout(mode, savedPos ?? undefined);
  await applyShape(mode);
  if (!startMinimized) {
    await win.show();
    if (mode === "chat") await win.setFocus();
  }
  return { mode, dock };
}

export async function changeMode(
  mode: Mode,
  opts?: { focus?: boolean; dock?: DockSide }
): Promise<DockSide> {
  const win = getCurrentWindow();
  const current = await win.outerPosition();
  const scale = await win.scaleFactor();
  const store = await getStore();
  const prevMode = (await store.get<Mode>("window.mode")) ?? "bubble";

  let dock = opts?.dock;
  if (!dock) {
    if (mode === "chat") {
      dock = await detectDock();
    } else {
      const storedDock = await store.get<DockSide>("window.dock");
      dock = storedDock ?? (await detectDock());
    }
  }

  const offset = getMochiOffset(dock);
  let nextPos: { x: number; y: number } | undefined;

  if (mode === "chat" && prevMode === "bubble") {
    // Geser window chat agar posisi Mochi di dalamnya tepat berada di koordinat bubble sebelumnya
    nextPos = {
      x: current.x - Math.round(offset.x * scale),
      y: current.y - Math.round(offset.y * scale),
    };
  } else if (mode === "bubble" && prevMode === "chat") {
    // Kembalikan window bubble tepat di koordinat Mochi berada saat ini
    nextPos = {
      x: current.x + Math.round(offset.x * scale),
      y: current.y + Math.round(offset.y * scale),
    };
  }

  await applyLayout(mode, nextPos);
  await applyShape(mode);
  if (opts?.focus) await win.setFocus();
  await store.set("window.mode", mode);
  await store.set("window.dock", dock);
  return dock;
}

export async function watchPosition(): Promise<UnlistenFn> {
  const win = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return win.onMoved((event) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void (async () => {
        const store = await getStore();
        await store.set("window.pos", { x: event.payload.x, y: event.payload.y });
      })();
    }, 400);
  });
}
