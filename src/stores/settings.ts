import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load, type Store } from "@tauri-apps/plugin-store";
import { listModels } from "../lib/api";

export type ConnStatus = "idle" | "checking" | "connected" | "offline";

export const DEFAULT_BASE_URL = "http://localhost:1234/v1";

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

  init: () => Promise<void>;
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

  init: async () => {
    const store = await getStore();
    const baseUrl = (await store.get<string>("ai.baseUrl")) ?? DEFAULT_BASE_URL;
    const model = (await store.get<string>("ai.model")) ?? "";
    const alwaysOnTop = (await store.get<boolean>("appearance.alwaysOnTop")) ?? true;
    const startMinimized = (await store.get<boolean>("app.startMinimized")) ?? false;

    if (!alwaysOnTop) {
      await getCurrentWindow().setAlwaysOnTop(false).catch(() => undefined);
    }
    set({ baseUrl, model, alwaysOnTop, startMinimized, ready: true });
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
