import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  captureScreenshot,
  chatCancel,
  chatStream,
  type CaptureMode,
  type ChatMessageDto,
} from "../lib/api";
import { db, type ConversationRow } from "../lib/db";
import { useSettingsStore } from "./settings";

export type Role = "user" | "assistant";

export interface ChatMsg {
  id?: number;
  role: Role;
  content: string;
  image?: string;
  error?: string | null;
}

export interface Attachment {
  dataUrl: string;
  width: number;
  height: number;
}

interface ChunkEvent {
  id: number;
  delta: string;
}
interface DoneEvent {
  id: number;
  cancelled: boolean;
}
interface ErrorEvent {
  id: number;
  error: string;
}

interface ChatState {
  conversations: ConversationRow[];
  currentId: number | null;
  messages: ChatMsg[];
  streaming: boolean;
  sidebarOpen: boolean;

  attachment: Attachment | null;
  capturing: boolean;
  captureError: string | null;

  init: () => Promise<void>;
  setSidebar: (open: boolean) => void;
  newConversation: () => void;
  openConversation: (id: number) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
  attach: (mode: CaptureMode) => Promise<void>;
  removeAttachment: () => void;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
}

let requestSeq = 0;
let activeRequest = -1;
let listenersStarted = false;

function deriveTitle(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
}

function mutateLastAssistant(
  msgs: ChatMsg[],
  fn: (m: ChatMsg) => ChatMsg,
): ChatMsg[] {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") {
      const next = [...msgs];
      next[i] = fn(next[i]);
      return next;
    }
  }
  return msgs;
}

function lastAssistant(msgs: ChatMsg[]): ChatMsg | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i];
  }
  return undefined;
}

function dropTrailingEmptyAssistant(msgs: ChatMsg[]): ChatMsg[] {
  const m = lastAssistant(msgs);
  if (m && m.id == null && !m.error && m.content.trim() === "") {
    const next = [...msgs];
    next.splice(next.indexOf(m), 1);
    return next;
  }
  return msgs;
}

async function refreshConversations() {
  const conversations = await db.listConversations();
  useChatStore.setState({ conversations });
}

async function ensureListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  void listen<ChunkEvent>("chat-chunk", (e) => {
    if (e.payload.id !== activeRequest) return;
    useChatStore.setState((s) => ({
      messages: mutateLastAssistant(s.messages, (m) => ({
        ...m,
        content: m.content + e.payload.delta,
      })),
    }));
  });

  void listen<DoneEvent>("chat-done", async (e) => {
    if (e.payload.id !== activeRequest) return;
    activeRequest = -1;
    const s = useChatStore.getState();
    const convId = s.currentId;
    const content = lastAssistant(s.messages)?.content ?? "";
    let messages = s.messages;
    try {
      if (convId != null && content.trim() !== "") {
        const id = await db.addMessage(convId, "assistant", content);
        messages = mutateLastAssistant(messages, (m) => ({ ...m, id }));
      }
      if (convId != null) await db.touchConversation(convId);
    } finally {
      messages = dropTrailingEmptyAssistant(messages);
      useChatStore.setState({ streaming: false, messages });
      void refreshConversations();
    }
  });

  void listen<ErrorEvent>("chat-error", (e) => {
    if (e.payload.id !== activeRequest) return;
    activeRequest = -1;
    useChatStore.setState((s) => ({
      streaming: false,
      messages: mutateLastAssistant(s.messages, (m) => ({
        ...m,
        error: e.payload.error,
      })),
    }));
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentId: null,
  messages: [],
  streaming: false,
  sidebarOpen: false,

  attachment: null,
  capturing: false,
  captureError: null,

  init: async () => {
    await ensureListeners();
    await refreshConversations();
  },

  setSidebar: (open) => set({ sidebarOpen: open }),

  newConversation: () =>
    set({ currentId: null, messages: [], sidebarOpen: false }),

  openConversation: async (id) => {
    const rows = await db.getMessages(id);
    set({
      currentId: id,
      messages: rows.map((r) => ({ id: r.id, role: r.role, content: r.content })),
      sidebarOpen: false,
    });
  },

  deleteConversation: async (id) => {
    await db.deleteConversation(id);
    if (get().currentId === id) {
      set({ currentId: null, messages: [] });
    }
    await refreshConversations();
  },

  clearAll: async () => {
    await db.clearAllConversations();
    set({ currentId: null, messages: [] });
    await refreshConversations();
  },

  attach: async (mode) => {
    if (get().capturing) return;
    set({ capturing: true, captureError: null });
    try {
      const shot = await captureScreenshot(mode);
      set({
        attachment: {
          dataUrl: shot.data_url,
          width: shot.width,
          height: shot.height,
        },
        capturing: false,
      });
    } catch (e) {
      set({ capturing: false, captureError: String(e) });
      setTimeout(() => {
        if (useChatStore.getState().captureError === String(e)) {
          useChatStore.setState({ captureError: null });
        }
      }, 5000);
    }
  },

  removeAttachment: () => set({ attachment: null }),

  send: async (text) => {
    const t = text.trim();
    const s = get();
    if (t === "" || s.streaming) return;

    // Screenshot tidak pernah disimpan ke disk — hanya di memori.
    const att = s.attachment;
    set({ attachment: null });

    let convId = s.currentId;
    if (convId == null) {
      const conv = await db.createConversation(deriveTitle(t));
      convId = conv.id;
      set({ currentId: convId });
    }

    const persistedText = att ? `${t}\n\n[📷 Screenshot ${att.width}x${att.height}]` : t;
    const msgId = await db.addMessage(convId, "user", persistedText);

    set((st) => ({
      messages: [
        ...st.messages,
        {
          id: msgId,
          role: "user",
          content: t,
          image: att?.dataUrl,
        },
      ],
    }));
    void refreshConversations();

    const parts = att
      ? [
          { type: "text", text: t },
          { type: "image_url", image_url: { url: att.dataUrl } },
        ]
      : undefined;
    void runAssistant(parts);
  },

  retry: async () => {
    const s = get();
    if (s.streaming) return;
    set((st) => {
      const msgs = [...st.messages];
      while (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
        const m = msgs[msgs.length - 1];
        if (m.error && m.id == null) msgs.pop();
        else break;
      }
      return { messages: msgs };
    });
    void runAssistant();
  },

  stop: () => {
    if (activeRequest > 0) void chatCancel(activeRequest);
  },
}));

async function runAssistant(imageParts?: unknown) {
  const settings = useSettingsStore.getState();
  const chat = useChatStore.getState();

  if (!settings.model) {
    useChatStore.setState((s) => ({
      messages: [
        ...s.messages,
        {
          role: "assistant",
          content: "",
          error:
            "Model belum dipilih.\n\nBuka Pengaturan (⚙), pilih model, lalu coba lagi.",
        },
      ],
    }));
    return;
  }

  const msgs = chat.messages;
  const lastIndex = msgs.length - 1;
  const hasImage = imageParts != null;
  const history: ChatMessageDto[] = msgs.map((m, i) => ({
    role: m.role,
    content:
      hasImage && i === lastIndex && m.role === "user" ? imageParts : m.content,
  }));

  const reqId = ++requestSeq;
  activeRequest = reqId;
  useChatStore.setState((s) => ({
    streaming: true,
    messages: [...s.messages, { role: "assistant", content: "" }],
  }));

  try {
    await chatStream({
      id: reqId,
      baseUrl: settings.baseUrl,
      model: settings.model,
      messages: history,
      hasImage,
    });
  } catch (e) {
    if (activeRequest === reqId) {
      activeRequest = -1;
      useChatStore.setState((s) => ({
        streaming: false,
        messages: mutateLastAssistant(s.messages, (m) => ({
          ...m,
          error: String(e),
        })),
      }));
    }
  }
}
