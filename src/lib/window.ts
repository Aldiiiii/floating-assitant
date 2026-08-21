import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";
import { setWindowShape } from "./api";

export const SIZES = {
  bubble: { width: 64, height: 64 },
  chat: { width: 380, height: 540 },
} as const;

export type Mode = keyof typeof SIZES;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
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
  // CreateRoundRectRgn menerima diameter ellipse sudut dalam pixel fisik.
  // Gunakan ukuran penuh window supaya region bubble benar-benar lingkaran,
  // bukan rounded-rectangle yang masih menampilkan sudut transparan.
  const radius = mode === "bubble"
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
  // Paksa WebView2 me-render ulang dengan ukuran baru (antisipasi stale layout).
  requestAnimationFrame(() => {
    void win.setSize(new LogicalSize(SIZES[mode].width, SIZES[mode].height));
    window.dispatchEvent(new Event("resize"));
  });
}

export async function restoreStartup(): Promise<Mode> {
  const win = getCurrentWindow();
  const store = await getStore();
  const mode = (await store.get<Mode>("window.mode")) ?? "bubble";
  const savedPos = await store.get<{ x: number; y: number }>("window.pos");
  const startMinimized = (await store.get<boolean>("app.startMinimized")) ?? false;
  await applyLayout(mode, savedPos ?? undefined);
  await applyShape(mode);
  if (!startMinimized) {
    await win.show();
    if (mode === "chat") await win.setFocus();
  }
  return mode;
}

export async function changeMode(mode: Mode, opts?: { focus?: boolean }): Promise<void> {
  // Resize window DULU (termasuk shape), baru pemanggil menukar konten UI —
  // mencegah konten terpotong oleh window yang masih berukuran lama.
  await applyLayout(mode);
  await applyShape(mode);
  if (opts?.focus) await getCurrentWindow().setFocus();
  const store = await getStore();
  await store.set("window.mode", mode);
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
