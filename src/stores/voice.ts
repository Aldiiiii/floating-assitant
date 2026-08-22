import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  audioDevices,
  audioOutputDevices,
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

  micDevice: string | null;
  devices: string[];
  speakerDevice: string | null;
  outputDevices: string[];
  playbackError: string | null;

  init: () => Promise<void>;
  loadDevices: () => Promise<void>;
  setMicDevice: (name: string | null) => void;
  loadOutputDevices: () => Promise<void>;
  setSpeakerDevice: (name: string | null) => void;
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
      useVoiceStore.setState({ speaking: true, playbackError: e.payload.error ?? null });
    } else if (e.payload.state === "error") {
      useVoiceStore.setState({ speaking: false, playbackError: e.payload.error ?? "TTS gagal." });
    } else {
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
  micDevice: null,
  devices: [],
  speakerDevice: null,
  outputDevices: [],
  playbackError: null,

  loadDevices: async () => {
    try {
      const devices = await audioDevices();
      set({ devices });
      const current = useVoiceStore.getState().micDevice;
      if (current && !devices.includes(current)) {
        // Perangkat tersimpan tidak ada lagi → kembali ke default sistem.
        set({ micDevice: null });
        void persist("voice.micDevice", null);
      }
    } catch {
      /* biarkan list kosong; error ditampilkan saat mulai merekam */
    }
  },

  setMicDevice: (name) => {
    set({ micDevice: name });
    void persist("voice.micDevice", name);
  },

  loadOutputDevices: async () => {
    try {
      const outputDevices = await audioOutputDevices();
      set({ outputDevices });
      const current = useVoiceStore.getState().speakerDevice;
      if (current && !outputDevices.includes(current)) {
        set({ speakerDevice: null });
        void persist("voice.speakerDevice", null);
      }
    } catch {
      /* biarkan kosong; error tampil saat memutar suara */
    }
  },

  setSpeakerDevice: (name) => {
    set({ speakerDevice: name });
    void persist("voice.speakerDevice", name);
  },

  init: async () => {
    await ensureListeners();
    const store = await getStore();
    const micEnabled = (await store.get<boolean>("voice.micEnabled")) ?? true;
    const mode = (await store.get<VoiceMode>("voice.mode")) ?? "ptt";
    const sttModel =
      (await store.get<SttModel>("voice.sttModel")) ?? "whisper-base";
    const autoSpeak = (await store.get<boolean>("voice.autoSpeak")) ?? false;
    const ttsVoice = (await store.get<TtsVoice>("voice.ttsVoice")) ?? "id";
    const micDevice = (await store.get<string | null>("voice.micDevice")) ?? null;
    const speakerDevice = (await store.get<string | null>("voice.speakerDevice")) ?? null;
    set({ micEnabled, mode, sttModel, autoSpeak, ttsVoice, micDevice, speakerDevice });
    void get().loadDevices();
    void get().loadOutputDevices();
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
      await voiceStart(get().micDevice);
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
    set({ speaking: true, playbackError: null });
    try {
      await ttsSpeak(clean, get().ttsVoice, get().speakerDevice);
    } catch (e) {
      const msg = String(e);
      set({ speaking: false, playbackError: msg });
      console.error("[tts]", msg);
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
