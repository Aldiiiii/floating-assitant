import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  audioDevices,
  audioOutputDevices,
  modelDownload,
  modelStatus,
  ttsPause,
  ttsSpeak,
  ttsStop,
  voiceStart,
  voiceStop,
} from "../lib/api";
import { load, type Store } from "@tauri-apps/plugin-store";
import { playBargeInCue, playDoneCue, playListeningCue } from "../lib/earcons";

export type VoiceMode = "ptt" | "toggle" | "dialog";
export type SttModel = "whisper-base" | "whisper-small" | "whisper-medium";
export type SttLanguage = "id" | "en" | "auto";
export type TtsVoice = "id" | "id-gadis" | "id-ardi" | "en";
export type MicSensitivity = "high" | "normal" | "low";

let vadSilenceHandler: (() => void) | null = null;

export function registerVadSilenceHandler(handler: (() => void) | null) {
  vadSilenceHandler = handler;
}

let speechStreamActive = false;
let dialogResumeTimer: ReturnType<typeof setTimeout> | null = null;

function triggerDialogTurn() {
  if (dialogResumeTimer) clearTimeout(dialogResumeTimer);
  dialogResumeTimer = setTimeout(() => {
    const cur = useVoiceStore.getState();
    if (
      !cur.speaking &&
      cur.mode === "dialog" &&
      cur.dialogActive &&
      cur.state === "idle" &&
      !speechStreamActive &&
      cur.micEnabled
    ) {
      void cur.startRecording().catch(() => undefined);
    }
  }, 400); // 400ms acoustic pacing delay to prevent speaker echo triggering VAD
}

export function setSpeechStreamActive(active: boolean) {
  speechStreamActive = active;
  if (!active) {
    triggerDialogTurn();
  }
}

export function isSpeechStreamActive(): boolean {
  return speechStreamActive;
}

interface VoiceStateStore {
  micEnabled: boolean;
  mode: VoiceMode;
  sttModel: SttModel;
  autoSpeak: boolean;
  vadAutoStop: boolean;
  bargeIn: boolean;
  dialogActive: boolean;
  ttsVoice: TtsVoice;
  language: SttLanguage;
  speechSpeed: number;
  micSensitivity: MicSensitivity;

  state: "idle" | "recording" | "transcribing" | "error";
  streamingText: string | null;
  audioLevel: number;
  error: string | null;
  speaking: boolean;
  paused: boolean;

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
  setVadAutoStop: (v: boolean) => void;
  setBargeIn: (v: boolean) => void;
  setDialogActive: (v: boolean) => void;
  setSttModel: (m: SttModel) => void;
  setAutoSpeak: (v: boolean) => void;
  setTtsVoice: (v: TtsVoice) => void;
  setLanguage: (l: SttLanguage) => void;
  setSpeechSpeed: (v: number) => void;
  setMicSensitivity: (s: MicSensitivity) => void;

  startRecording: () => Promise<void>;
  stopRecording: () => Promise<{ text: string; language: string } | null>;
  cancelRecording: () => Promise<void>;
  speak: (text: string, enqueue?: boolean) => Promise<void>;
  togglePause: () => void;
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
let transcribingWatchdog: ReturnType<typeof setTimeout> | null = null;
let bargeInCounter = 0;

async function ensureListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  void listen<{ state: string; error?: string }>("voice-state", (e) => {
    if (transcribingWatchdog) {
      clearTimeout(transcribingWatchdog);
      transcribingWatchdog = null;
    }

    const nextState = e.payload.state as VoiceStateStore["state"];
    useVoiceStore.setState({
      state: nextState,
      error: e.payload.error ?? null,
      ...(nextState !== "recording" ? { audioLevel: 0 } : {}),
    });

    if (nextState === "transcribing") {
      // Guardrail anti-stuck: jika transkripsi memakan waktu lebih dari 25 detik,
      // pulihkan state agar UI tidak macet selamanya.
      transcribingWatchdog = setTimeout(() => {
        if (useVoiceStore.getState().state === "transcribing") {
          useVoiceStore.setState({
            state: "error",
            error: "Waktu transkripsi terlalu lama. Disarankan memilih model 'Cepat (Whisper Base)' di Pengaturan.",
          });
          setTimeout(() => {
            if (useVoiceStore.getState().state === "error") {
              useVoiceStore.setState({ state: "idle" });
            }
          }, 5000);
        }
      }, 25000);
    } else if (nextState === "error") {
      setTimeout(() => {
        if (useVoiceStore.getState().state === "error") {
          useVoiceStore.setState({ state: "idle" });
        }
      }, 5000);
    }
  });

  void listen("voice-vad-silence", () => {
    const s = useVoiceStore.getState();
    if (s.state === "recording") {
      if (vadSilenceHandler) {
        vadSilenceHandler();
      } else {
        void s.stopRecording();
      }
    }
  });

  void listen<{ state: string; error?: string }>("tts-state", (e) => {
    if (e.payload.state === "playing" || e.payload.state === "loading") {
      useVoiceStore.setState({
        speaking: true,
        paused: e.payload.state === "playing" ? false : useVoiceStore.getState().paused,
        playbackError: e.payload.error ?? null,
      });
    } else if (e.payload.state === "paused") {
      useVoiceStore.setState({ speaking: true, paused: true });
    } else if (e.payload.state === "error") {
      useVoiceStore.setState({ speaking: false, paused: false, playbackError: e.payload.error ?? "TTS gagal." });
    } else {
      if (speechStreamActive) {
        // Aliran kalimat TTS masih aktif (masih ada kalimat dalam antrean sintesis),
        // jangan matikan status speaking dan jangan aktifkan mikrofon dulu.
        return;
      }
      useVoiceStore.setState({ speaking: false, paused: false });
      // Dialog mode auto-listen loop: ketika TTS selesai berbicara, otomatis aktifkan mikrofon kembali setelah jeda akustik!
      const s = useVoiceStore.getState();
      if (s.mode === "dialog" && s.dialogActive && s.micEnabled) {
        triggerDialogTurn();
      }
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

  void listen<{ text: string; is_final: boolean }>("voice-stream-chunk", (e) => {
    if (!e.payload.is_final) {
      const raw = e.payload.text?.trim() ?? "";
      const normalized = raw
        .toLowerCase()
        .replace(/[.,!?;:()]/g, "")
        .trim();
      const isHallucination =
        normalized === "terima kasih" ||
        normalized === "terimakasih" ||
        normalized === "terima kasih banyak" ||
        normalized === "terima kasih sudah menonton" ||
        normalized === "terima kasih telah menonton" ||
        normalized === "thank you" ||
        normalized === "thank you very much" ||
        normalized === "thank you for watching" ||
        normalized === "thanks for watching";

      if (!isHallucination && raw.length > 0) {
        useVoiceStore.setState({ streamingText: raw });
      }
    } else {
      useVoiceStore.setState({ streamingText: null });
    }
  });

  void listen<number>("voice-audio-level", (e) => {
    const level = typeof e.payload === "number" ? e.payload : 0;
    useVoiceStore.setState({ audioLevel: level });

    // Interupsi suara (Barge-in): jika asisten sedang bersuara dan pengguna mulai bicara cukup keras
    const s = useVoiceStore.getState();
    if (s.bargeIn && s.speaking && (s.mode === "dialog" || s.mode === "toggle")) {
      if (level >= 0.28) {
        bargeInCounter++;
        if (bargeInCounter >= 3) {
          bargeInCounter = 0;
          playBargeInCue();
          s.stopSpeaking();
          import("./chat").then(({ useChatStore }) => {
            useChatStore.getState().stop();
            if (s.mode === "dialog" && s.dialogActive && s.state === "idle") {
              void s.startRecording().catch(() => undefined);
            }
          });
        }
      } else {
        bargeInCounter = 0;
      }
    }
  });
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
  vadAutoStop: true,
  bargeIn: true,
  dialogActive: false,
  ttsVoice: "id-gadis",
  language: "id",
  speechSpeed: 1,
  micSensitivity: "normal",

  state: "idle",
  streamingText: null,
  audioLevel: 0,
  error: null,
  speaking: false,
  paused: false,

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
    const vadAutoStop = (await store.get<boolean>("voice.vadAutoStop")) ?? true;
    const bargeIn = (await store.get<boolean>("voice.bargeIn")) ?? true;
    const ttsVoice = (await store.get<TtsVoice>("voice.ttsVoice")) ?? "id-gadis";
    const micDevice = (await store.get<string | null>("voice.micDevice")) ?? null;
    const speakerDevice = (await store.get<string | null>("voice.speakerDevice")) ?? null;
    const language = (await store.get<SttLanguage>("voice.language")) ?? "id";
    const speechSpeed = (await store.get<number>("voice.speechSpeed")) ?? 1;
    const micSensitivity =
      (await store.get<MicSensitivity>("voice.micSensitivity")) ?? "normal";
    set({
      micEnabled,
      mode,
      sttModel,
      autoSpeak,
      vadAutoStop,
      bargeIn,
      dialogActive: false,
      ttsVoice,
      micDevice,
      speakerDevice,
      language,
      speechSpeed,
      micSensitivity,
    });
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
  setVadAutoStop: (v) => {
    set({ vadAutoStop: v });
    void persist("voice.vadAutoStop", v);
  },
  setBargeIn: (v) => {
    set({ bargeIn: v });
    void persist("voice.bargeIn", v);
  },
  setDialogActive: (v) => {
    if (!v && dialogResumeTimer) {
      clearTimeout(dialogResumeTimer);
      dialogResumeTimer = null;
    }
    set({ dialogActive: v });
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
  setLanguage: (l) => {
    set({ language: l });
    void persist("voice.language", l);
  },
  setSpeechSpeed: (v) => {
    set({ speechSpeed: v });
    void persist("voice.speechSpeed", v);
  },
  setMicSensitivity: (s) => {
    set({ micSensitivity: s });
    void persist("voice.micSensitivity", s);
  },

  startRecording: async () => {
    const s = get();
    if (!s.micEnabled || s.state !== "idle") return;
    try {
      set({ streamingText: null, error: null });
      const useAutoStop = s.mode === "dialog" || s.vadAutoStop;
      await voiceStart(
        s.micDevice,
        s.sttModel,
        s.language,
        true,
        useAutoStop,
        1200,
        s.micSensitivity,
      );
      playListeningCue();
    } catch (e) {
      // voice-state error event juga ter-emit dari Rust; mirror di sini.
      set({ streamingText: null, state: "error", error: String(e) });
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
      const payload = await voiceStop(s.sttModel, s.language);
      playDoneCue();
      set({ streamingText: null, audioLevel: 0 });
      return { text: payload.text, language: payload.language };
    } catch (e) {
      set({ streamingText: null, audioLevel: 0, state: "error", error: String(e) });
      setTimeout(() => {
        if (useVoiceStore.getState().state === "error") {
          useVoiceStore.setState({ state: "idle" });
        }
      }, 5000);
      throw e;
    }
  },

  cancelRecording: async () => {
    const s = get();
    if (s.state !== "recording") return;
    try {
      await voiceStop(s.sttModel, s.language);
    } catch {
      /* abaikan error saat membatalkan */
    } finally {
      set({ streamingText: null, audioLevel: 0, state: "idle", error: null });
    }
  },

  speak: async (text, enqueue = false) => {
    const clean = text.trim();
    if (clean === "") return;
    set({ speaking: true, playbackError: null });
    try {
      await ttsSpeak(clean, get().ttsVoice, get().speakerDevice, get().speechSpeed, enqueue);
    } catch (e) {
      const msg = String(e);
      set({ speaking: false, playbackError: msg });
      console.error("[tts]", msg);
    }
  },

  togglePause: () => {
    if (!get().speaking) return;
    ttsPause().catch(() => undefined);
  },

  stopSpeaking: () => {
    setSpeechStreamActive(false);
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
