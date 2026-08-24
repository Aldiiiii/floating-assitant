import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";
import { listModels } from "../lib/api";

export type ConnStatus = "idle" | "checking" | "connected" | "offline";

export const DEFAULT_BASE_URL = "http://localhost:1234/v1";

export const DEFAULT_SYSTEM_PROMPT = `Kamu adalah Astra, asisten AI pribadi yang berjalan lokal di perangkat pengguna.

Gaya menjawab:
- Bahasa utama: Indonesia yang natural dan mudah dipahami.
- Ringkas, padat, langsung ke inti. Hindari basa-basi dan pengulangan pertanyaan.
- Gunakan Markdown: poin bernomor untuk langkah-langkah, tabel bila membandingkan, dan code block dengan bahasa yang benar untuk kode.
- Untuk pertanyaan teknis/pemrograman: berikan contoh kode yang bisa dijalankan.
- Jika informasi tidak cukup atau kamu tidak yakin, katakan terus terang.
- Kamu memiliki tool pencarian web: jika butuh data terbaru (harga, berita, cuaca, jadwal), balas HANYA satu baris berformat [CARI: kata kunci] tanpa teks lain. Selain itu, jawab langsung.`;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load("settings.json");
  return storePromise;
}

interface SettingsState {
  baseUrl: string;
  model: string;
  models: string[];
  status: ConnStatus;
  error: string | null;
  ready: boolean;
  alwaysOnTop: boolean;
  startMinimized: boolean;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  webSearchEnabled: boolean;
  searchProvider: "ddg" | "brave" | "tavily";
  braveKey: string;
  tavilyKey: string;

  init: () => Promise<void>;
  setSystemPrompt: (v: string) => void;
  resetSystemPrompt: () => void;
  setGeneration: (patch: { temperature?: number; topP?: number; maxTokens?: number }) => void;
  setWebSearchEnabled: (v: boolean) => void;
  setSearchProvider: (v: "ddg" | "brave" | "tavily") => void;
  setBraveKey: (v: string) => void;
  setTavilyKey: (v: string) => void;
  setBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  testConnection: () => Promise<void>;
  setAlwaysOnTop: (v: boolean) => void;
  setStartMinimized: (v: boolean) => void;
}

let checkSeq = 0;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseUrl: DEFAULT_BASE_URL,
  model: "",
  models: [],
  status: "idle",
  error: null,
  ready: false,
  alwaysOnTop: true,
  startMinimized: false,
  systemPrompt: "",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  webSearchEnabled: true,
  searchProvider: "ddg" as const,
  braveKey: "",
  tavilyKey: "",

  setSystemPrompt: (v) => {
    set({ systemPrompt: v });
    void (async () => (await getStore()).set("ai.systemPrompt", v))();
  },
  resetSystemPrompt: () => get().setSystemPrompt(DEFAULT_SYSTEM_PROMPT),
  setGeneration: (patch) => {
    set(patch as Partial<SettingsState>);
    void (async () => {
      const store = await getStore();
      if (patch.temperature !== undefined) await store.set("ai.temperature", patch.temperature);
      if (patch.topP !== undefined) await store.set("ai.topP", patch.topP);
      if (patch.maxTokens !== undefined) await store.set("ai.maxTokens", patch.maxTokens);
    })();
  },
  setWebSearchEnabled: (v) => {
    set({ webSearchEnabled: v });
    void (async () => (await getStore()).set("web.enabled", v))();
  },
  setSearchProvider: (v) => {
    set({ searchProvider: v });
    void (async () => (await getStore()).set("web.provider", v))();
  },
  setBraveKey: (v) => {
    set({ braveKey: v });
    void (async () => (await getStore()).set("web.braveKey", v))();
  },
  setTavilyKey: (v) => {
    set({ tavilyKey: v });
    void (async () => (await getStore()).set("web.tavilyKey", v))();
  },

  init: async () => {
    const store = await getStore();
    const baseUrl = (await store.get<string>("ai.baseUrl")) ?? DEFAULT_BASE_URL;
    const model = (await store.get<string>("ai.model")) ?? "";
    const alwaysOnTop = (await store.get<boolean>("appearance.alwaysOnTop")) ?? true;
    const startMinimized = (await store.get<boolean>("app.startMinimized")) ?? false;
    const systemPrompt = (await store.get<string>("ai.systemPrompt")) ?? DEFAULT_SYSTEM_PROMPT;
    const temperature = (await store.get<number>("ai.temperature")) ?? 0.7;
    const topP = (await store.get<number>("ai.topP")) ?? 0.9;
    const maxTokens = (await store.get<number>("ai.maxTokens")) ?? 1024;
    const webSearchEnabled = (await store.get<boolean>("web.enabled")) ?? true;
    const searchProvider = (await store.get<"ddg"|"brave"|"tavily">("web.provider")) ?? "ddg";
    const braveKey = (await store.get<string>("web.braveKey")) ?? "";
    const tavilyKey = (await store.get<string>("web.tavilyKey")) ?? "";

    if (!alwaysOnTop) {
      await getCurrentWindow().setAlwaysOnTop(false).catch(() => undefined);
    }
    set({ baseUrl, model, alwaysOnTop, startMinimized, systemPrompt, temperature, topP, maxTokens, webSearchEnabled, searchProvider, braveKey, tavilyKey, ready: true });
    void get().testConnection();
  },

  setBaseUrl: (url) => {
    set({ baseUrl: url });
    void (async () => {
      const store = await getStore();
      await store.set("ai.baseUrl", url);
    })();
  },

  setModel: (model) => {
    set({ model });
    void (async () => {
      const store = await getStore();
      await store.set("ai.model", model);
    })();
  },

  setAlwaysOnTop: (v) => {
    set({ alwaysOnTop: v });
    void getCurrentWindow().setAlwaysOnTop(v).catch(() => undefined);
    void (async () => {
      const store = await getStore();
      await store.set("appearance.alwaysOnTop", v);
    })();
  },

  setStartMinimized: (v) => {
    set({ startMinimized: v });
    void (async () => {
      const store = await getStore();
      await store.set("app.startMinimized", v);
    })();
  },

  testConnection: async () => {
    const seq = ++checkSeq;
    const { baseUrl } = get();
    set({ status: "checking", error: null });
    try {
      const models = await listModels(baseUrl);
      if (seq !== checkSeq) return;
      let model = get().model;
      if (!model || !models.includes(model)) {
        model = models[0] ?? "";
        if (model) {
          const store = await getStore();
          await store.set("ai.model", model);
        }
      }
      set({ models, model, status: "connected", error: null });
    } catch (e) {
      if (seq !== checkSeq) return;
      set({ status: "offline", error: String(e), models: [] });
    }
  },
}));
