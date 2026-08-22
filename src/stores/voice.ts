import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  modelDownload,
  modelStatus,
  ttsSpeak,
  ttsStop,
  voiceStart,
  voiceStop,
} from "../lib/api";
import { load, type Store } from "@tauri-apps/plugin-store";

export type VoiceMode = "ptt" | "toggle";
export type SttModel = "whisper-base" | "whisper-small";
export type TtsVoice = "id" | "en";

interface VoiceStateStore {
  micEnabled: boolean;
  mode: VoiceMode;
  sttModel: SttModel;
  autoSpeak: boolean;
  ttsVoice: TtsVoice;

  state: "idle" | "recording" | "transcribing" | "error";
  error: string | null;
  speaking: boolean;

  downloads: Record<string, number | null>;

  init: () => Promise<void>;
  setMicEnabled: (v: boolean) => void;
  setMode: (m: VoiceMode) => void;
  setSttModel: (m: SttModel) => void;
  setAutoSpeak: (v: boolean) => void;
  setTtsVoice: (v: TtsVoice) => void;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ text: string; language: string } | null>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  downloadModel: (key: string) => Promise<void>;
  refreshInstalled: (key: string) => Promise<void>;
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

let listenersStarted = false;
async function ensureListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  void listen<{ state: string; error?: string }>("voice-state", (e) => {
    useVoiceStore.setState({
      state: e.payload.state as VoiceStateStore["state"],
      error: e.payload.error ?? null,
    });
  });

  void listen<{ state: string; error?: string }>("tts-state", (e) => {
    if (e.payload.state === "playing" || e.payload.state === "loading") {
      useVoiceStore.setState({ speaking: true });
    } else if (e.payload.state === "idle" || e.payload.state === "stopped") {
      useVoiceStore.setState({ speaking: false });
    }
  });

  void listen<{ key: string; downloaded: number; total: number | null }>(
    "model-progress",
    (e) => {
      const { key, downloaded, total } = e.payload;
      const progress =
        total && total > 0 ? Math.min(1, downloaded / total) : null;
      const downloads = { ...useVoiceStore.getState().downloads };
      downloads[key] = progress;
      useVoiceStore.setState({ downloads });
    },
  );
}

async function persist(key: string, value: unknown) {
  const store = await getStore();
  await store.set(key, value);
}

export const useVoiceStore = create<VoiceStateStore>((set, get) => ({
  micEnabled: true,
  mode: "ptt",
  sttModel: "whisper-base",
  autoSpeak: false,
  ttsVoice: "id",

  state: "idle",
  error: null,
  speaking: false,

  downloads: {},

  init: async () => {
    await ensureListeners();
    const store = await getStore();
    const micEnabled = (await store.get<boolean>("voice.micEnabled")) ?? true;
    const mode = (await store.get<VoiceMode>("voice.mode")) ?? "ptt";
    const sttModel =
      (await store.get<SttModel>("voice.sttModel")) ?? "whisper-base";
    const autoSpeak = (await store.get<boolean>("voice.autoSpeak")) ?? false;
    const ttsVoice = (await store.get<TtsVoice>("voice.ttsVoice")) ?? "id";
    set({ micEnabled, mode, sttModel, autoSpeak, ttsVoice });
  },

  setMicEnabled: (v) => {
    set({ micEnabled: v });
    void persist("voice.micEnabled", v);
  },
  setMode: (m) => {
    set({ mode: m });
    void persist("voice.mode", m);
  },
  setSttModel: (m) => {
    set({ sttModel: m });
    void persist("voice.sttModel", m);
  },
  setAutoSpeak: (v) => {
    set({ autoSpeak: v });
    void persist("voice.autoSpeak", v);
  },
  setTtsVoice: (v) => {
    set({ ttsVoice: v });
    void persist("voice.ttsVoice", v);
  },

  startRecording: async () => {
    const s = get();
    if (!s.micEnabled || s.state !== "idle") return;
    try {
      await voiceStart();
      set({ error: null });
    } catch (e) {
      // voice-state error event juga ter-emit dari Rust; mirror di sini.
      set({ state: "error", error: String(e) });
      setTimeout(() => {
        if (useVoiceStore.getState().state === "error") {
          useVoiceStore.setState({ state: "idle" });
        }
      }, 6000);
      throw e;
    }
  },

  stopRecording: async () => {
    const s = get();
    if (s.state !== "recording") return null;
    try {
      const payload = await voiceStop(s.sttModel);
      return { text: payload.text, language: payload.language };
    } finally {
      // voice-state idle/error ditangani listener event.
    }
  },

  speak: async (text) => {
    const clean = text.trim();
    if (clean === "") return;
    try {
      await ttsSpeak(clean, get().ttsVoice);
    } catch (e) {
      set({ speaking: false });
      throw e;
    }
  },

  stopSpeaking: () => {
    ttsStop().catch(() => undefined);
  },

  downloadModel: async (key) => {
    if (get().downloads[key] !== undefined) return; // sedang berjalan
    const downloads = { ...get().downloads };
    downloads[key] = null; // indeterminate
    set({ downloads });
    try {
      await modelDownload(key);
    } finally {
      const next = { ...useVoiceStore.getState().downloads };
      delete next[key];
      useVoiceStore.setState({ downloads: next });
      await get().refreshInstalled(key);
    }
  },

  refreshInstalled: async (key) => {
    try {
      await modelStatus(key);
    } catch {
      /* status dipakai ulang via is_installed saat download */
    }
  },
}));
