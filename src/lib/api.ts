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

// ---- Voice ----

export interface TranscriptPayload {
  text: string;
  language: string;
  duration_ms: number;
}

export function voiceStart(): Promise<void> {
  return invoke("voice_start");
}

export function voiceStop(modelKey: string): Promise<TranscriptPayload> {
  return invoke("voice_stop", { modelKey });
}

export function ttsSpeak(text: string, voice: string): Promise<void> {
  return invoke("tts_speak", { text, voice });
}

export function ttsStop(): Promise<void> {
  return invoke("tts_stop");
}

export function modelStatus(
  key: string,
): Promise<{ installed: boolean; downloading: boolean }> {
  return invoke("model_status", { key });
}

export function modelDownload(key: string): Promise<void> {
  return invoke("model_download", { key });
}
