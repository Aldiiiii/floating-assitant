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

export function searchKeysGet(): Promise<{ brave: string | null; tavily: string | null }> {
  return invoke("search_keys_get");
}

export function searchKeysSet(
  brave: string | null,
  tavily: string | null,
): Promise<void> {
  return invoke("search_keys_set", { brave, tavily });
}

export function mcpLocalCheck(
  indexPath: string,
  node: string,
): Promise<{ tools: number }> {
  return invoke("mcp_local_check", { indexPath, node });
}

export interface GenerationOptions {
  systemPrompt?: string | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  webSearchEnabled?: boolean;
  searchProvider?: string;
  mcpIndexPath?: string | null;
  mcpNode?: string | null;
  mcpFullContent?: boolean;
}

export async function chatStream(
  args: {
    id: number;
    baseUrl: string;
    model: string;
    messages: ChatMessageDto[];
    hasImage: boolean;
  } & GenerationOptions,
): Promise<void> {
  return invoke("chat_stream", {
    ...args,
    systemPrompt: args.systemPrompt ?? null,
    searchProvider: args.searchProvider ?? "ddg",
  });
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

export interface StreamChunkPayload {
  text: string;
  is_final: boolean;
}

export function voiceStart(
  deviceName?: string | null,
  modelKey?: string | null,
  language?: string | null,
  stream?: boolean,
  autoStop?: boolean,
  silenceMs?: number,
  sensitivity?: string | null,
): Promise<void> {
  return invoke("voice_start", {
    deviceName: deviceName ?? null,
    modelKey: modelKey ?? null,
    language: language ?? null,
    stream: stream ?? true,
    autoStop: autoStop ?? false,
    silenceMs: silenceMs ?? null,
    sensitivity: sensitivity ?? null,
  });
}

export function audioDevices(): Promise<string[]> {
  return invoke<string[]>("audio_devices");
}

export function voiceStop(
  modelKey: string,
  language: string,
): Promise<TranscriptPayload> {
  return invoke("voice_stop", { modelKey, language });
}

export function ttsSpeak(
  text: string,
  voice: string,
  speakerDevice?: string | null,
  speed?: number,
  enqueue?: boolean,
): Promise<void> {
  return invoke("tts_speak", {
    text,
    voice,
    speakerDevice: speakerDevice ?? null,
    speed: speed ?? 1,
    enqueue: enqueue ?? false,
  });
}

export function audioOutputDevices(): Promise<string[]> {
  return invoke<string[]>("audio_output_devices");
}

export function ttsStop(): Promise<void> {
  return invoke("tts_stop");
}

export function ttsPause(): Promise<void> {
  return invoke("tts_pause");
}

export function modelStatus(
  key: string,
): Promise<{ installed: boolean; downloading: boolean }> {
  return invoke("model_status", { key });
}

export function modelDownload(key: string): Promise<void> {
  return invoke("model_download", { key });
}
