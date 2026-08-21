import { invoke } from "@tauri-apps/api/core";

export async function listModels(baseUrl: string): Promise<string[]> {
  return invoke<string[]>("lm_list_models", { baseUrl });
}

export interface ChatMessageDto {
  role: string;
  /** String biasa ATAU array content-parts format OpenAI (teks + image_url). */
  content: unknown;
}

export interface ScreenshotData {
  data_url: string;
  width: number;
  height: number;
}

export type CaptureMode = "fullscreen" | "active" | "area";

export function captureScreenshot(mode: CaptureMode): Promise<ScreenshotData> {
  const command = {
    fullscreen: "capture_fullscreen",
    active: "capture_active_window",
    area: "capture_area",
  }[mode];
  return invoke<ScreenshotData>(command);
}

export interface AreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function submitAreaSelection(rect: AreaRect): Promise<void> {
  return invoke("submit_area_selection", { rect });
}

export function cancelAreaSelection(): Promise<void> {
  return invoke("cancel_area_selection");
}

/** radius > 0 = sudut membulat (px fisik); 0 = kotak penuh. */
export function setWindowShape(radius: number): Promise<void> {
  return invoke("set_window_shape", { radius });
}

export async function chatStream(args: {
  id: number;
  baseUrl: string;
  model: string;
  messages: ChatMessageDto[];
  hasImage: boolean;
}): Promise<void> {
  return invoke("chat_stream", args);
}

export async function chatCancel(id: number): Promise<void> {
  return invoke("chat_cancel", { id });
}
