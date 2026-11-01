import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  captureScreenshot,
  chatCancel,
  chatStream,
  type CaptureMode,
  type ChatMessageDto,
} from "../lib/api";
import { db, type ConversationRow, type SourceRef } from "../lib/db";
import { DEFAULT_SYSTEM_PROMPT, useSettingsStore } from "./settings";
import { setSpeechStreamActive, useVoiceStore } from "./voice";

export type Role = "user" | "assistant";

export interface ChatMsg {
  id?: number;
  role: Role;
  content: string;
  image?: string;
  sources?: { title: string; url: string }[];
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
  sources?: SourceRef[];
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
  searchPhase: string | null;
  editDraft: string | null;

  init: () => Promise<void>;
  setSidebar: (open: boolean) => void;
  newConversation: () => void;
  openConversation: (id: number) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
  regenerate: () => Promise<void>;
  editLastUser: (msg: ChatMsg) => void;
  setEditDraft: (v: string | null) => void;
  attach: (mode: CaptureMode) => Promise<void>;
  removeAttachment: () => void;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
}

let requestSeq = 0;
let activeRequest = -1;
let pendingSources: SourceRef[] | null = null;

export function extractSpeakableText(raw: string, isFinal = false): string {
  if (!raw) return "";
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .replace(/<thought>[\s\S]*/gi, "")
    .replace(/<reasoning>[\s\S]*/gi, "");

  // Hanya jika streaming sudah selesai total (isFinal) DAN tidak ada teks sama sekali di luar tag:
  if (isFinal && !cleaned.trim()) {
    cleaned = raw.replace(/<\/?(think|thought|reasoning)>/gi, "");
  }

  // Conversational UX: "Writing for Ears, Not Eyes"
  // 1. Ganti blok kode lengkap atau unclosed dengan frasa lisan ramah
  cleaned = cleaned.replace(/```[\s\S]*?```/g, " (kode terlampir di layar) ");
  cleaned = cleaned.replace(/```[\s\S]*/g, " (kode terlampir di layar) ");

  // 2. Format markdown link [Label](url) -> sebutkan Label saja
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 3. Buang URL mentah agar tidak dieja huruf per huruf
  cleaned = cleaned.replace(/https?:\/\/[^\s)\]]+/gi, " ");

  // 4. Buang karakter formatting markdown
  cleaned = cleaned
    .replace(/[*_#`|>~]/g, " ")
    .replace(/\s+/g, " ");

  return cleaned.trim();
}

export function extractNextSentence(
  text: string,
  isDone: boolean,
): { sentence: string; length: number } | null {
  const trimmed = text.trimStart();
  const leadingSpaces = text.length - trimmed.length;
  if (!trimmed) return null;

  // 1. Tanda baca kalimat (. ! ?) yang diikuti spasi/newline
  let searchFrom = 0;
  while (searchFrom < trimmed.length) {
    const sub = trimmed.slice(searchFrom);
    const m = sub.match(/^([^.!?\n]+[.!?]+(?:\s+|\n+))/);
    if (!m) break;
    const candidate = trimmed.slice(0, searchFrom + m[1].length);
    const candidateTrimmed = candidate.trim();
    // Jika hanya nomor urut (misal "1." atau "2."), gabungkan dengan kalimat setelahnya
    if (/^\d+\.?$/.test(candidateTrimmed) || candidateTrimmed.length < 3) {
      searchFrom += m[1].length;
      continue;
    }
    return {
      sentence: candidateTrimmed,
      length: leadingSpaces + candidate.length,
    };
  }

  // 2. Baris baru / pemisah paragraf (\n+)
  const matchNewline = trimmed.match(/^([^\n]+\n+)/);
  if (matchNewline) {
    const candidate = matchNewline[1].trim();
    if (candidate.length >= 2) {
      return {
        sentence: candidate,
        length: leadingSpaces + matchNewline[1].length,
      };
    }
  }

  // 3. Kalimat panjang tanpa titik (> 100 karakter), potong pada koma/titik dua terdekat
  if (trimmed.length > 100) {
    const matchClause = trimmed.match(/^([^,;:\n]{40,}[,;:]\s+)/);
    if (matchClause) {
      return {
        sentence: matchClause[1].trim(),
        length: leadingSpaces + matchClause[1].length,
      };
    }
  }

  // 4. Jika stream sudah selesai (isDone), konsumsi semua sisa teks
  if (isDone && trimmed.length > 0) {
    return {
      sentence: trimmed.trim(),
      length: text.length,
    };
  }

  return null;
}

class SpeechStreamManager {
  private chain: Promise<void> = Promise.resolve();
  private spokenOffset = 0;
  private sentenceIndex = 0;
  private stopped = false;
  private requestId = -1;

  start(reqId: number) {
    this.stopped = false;
    this.chain = Promise.resolve();
    this.spokenOffset = 0;
    this.sentenceIndex = 0;
    this.requestId = reqId;
    setSpeechStreamActive(true);
  }

  stop() {
    this.stopped = true;
    this.requestId = -1;
    this.chain = Promise.resolve();
    setSpeechStreamActive(false);
  }

  feed(rawText: string, isDone: boolean, reqId: number) {
    if (this.stopped || reqId !== this.requestId) return;

    const speakable = extractSpeakableText(rawText, isDone);
    let remaining = speakable.slice(this.spokenOffset);

    while (remaining.length > 0) {
      const next = extractNextSentence(remaining, isDone);
      if (!next) break;

      this.spokenOffset += next.length;
      remaining = speakable.slice(this.spokenOffset);

      const sentenceToSpeak = next.sentence;
      if (!sentenceToSpeak) continue;

      const isFirst = this.sentenceIndex === 0;
      this.sentenceIndex++;

      this.chain = this.chain
        .then(async () => {
          if (this.stopped || reqId !== this.requestId) return;
          const vs = useVoiceStore.getState();
          await vs.speak(sentenceToSpeak, !isFirst);
        })
        .catch((err) => {
          console.error("[speechStreamManager]", err);
        });
    }

    if (isDone) {
      this.chain = this.chain.finally(() => {
        if (reqId === this.requestId) {
          setSpeechStreamActive(false);
        }
      });
    }
  }
}

export const speechStreamManager = new SpeechStreamManager();

export function speakFullText(text: string) {
  const reqId = ++requestSeq;
  speechStreamManager.start(reqId);
  speechStreamManager.feed(text, true, reqId);
}

export function extractFirstSentences(text: string, maxSentences = 2): string {
  if (!text) return "";
  const trimmed = text.trim();
  const matches = trimmed.match(/[^.!?\n]+[.!?\n]+(\s|$)/g);
  if (matches && matches.length > 0) {
    const selected = matches.slice(0, maxSentences).join("").trim();
    if (selected.length > 0) return selected;
  }
  if (trimmed.length > 160) {
    const cut = trimmed.slice(0, 160);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + "...";
  }
  return trimmed;
}

export function estimateTokens(text: string): number {
  // Heuristik lintas bahasa: ~4 karakter per token.
  return Math.ceil(text.length / 4);
}
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

function shouldAutoSpeak(): boolean {
  const vs = useVoiceStore.getState();
  return vs.autoSpeak || (vs.mode === "dialog" && vs.dialogActive);
}

async function ensureListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  void listen<ChunkEvent>("chat-chunk", (e) => {
    if (e.payload.id !== activeRequest) return;
    useChatStore.setState((s) => ({
      messages: mutateLastAssistant(s.messages, (m) => {
        const nextContent = m.content + e.payload.delta;
        if (shouldAutoSpeak()) {
          speechStreamManager.feed(nextContent, false, e.payload.id);
        }
        return {
          ...m,
          content: nextContent,
        };
      }),
    }));
  });

  void listen<DoneEvent & { sources?: SourceRef[] }>("chat-done", async (e) => {
    if (e.payload.id !== activeRequest) return;
    activeRequest = -1;
    const s = useChatStore.getState();
    const convId = s.currentId;
    const content = lastAssistant(s.messages)?.content ?? "";
    let messages = s.messages;
    if (e.payload.sources && e.payload.sources.length > 0) {
      pendingSources = e.payload.sources;
    }
    try {
      if (convId != null && content.trim() !== "") {
        const sources = pendingSources ?? undefined;
        const id = await db.addMessage(convId, "assistant", content, sources);
        messages = mutateLastAssistant(
          messages,
          (m) => ({ ...m, id, sources }),
        );
        pendingSources = null;
      }
      if (convId != null) await db.touchConversation(convId);
    } finally {
      messages = dropTrailingEmptyAssistant(messages);
      useChatStore.setState({ streaming: false, searchPhase: null, messages });
      void refreshConversations();
      const vs = useVoiceStore.getState();
      const shouldSpeak = shouldAutoSpeak();
      if (shouldSpeak) {
        speechStreamManager.feed(content, true, e.payload.id);
      } else if (vs.mode === "dialog" && vs.dialogActive) {
        setTimeout(() => {
          const cur = useVoiceStore.getState();
          if (cur.mode === "dialog" && cur.dialogActive && cur.state === "idle" && !cur.speaking) {
            void cur.startRecording().catch(() => undefined);
          }
        }, 350);
      }
    }
  });

  void listen<{ id: number; sources: SourceRef[] }>("chat-sources", (e) => {
    if (e.payload.id !== activeRequest) return;
    pendingSources = e.payload.sources.filter((sItem) => sItem.url);
  });

  void listen<{ id: number }>("chat-reset", (e) => {
    if (e.payload.id !== activeRequest) return;
    speechStreamManager.stop();
    useChatStore.setState((s) => ({
      messages: mutateLastAssistant(s.messages, (m) => ({ ...m, content: "" })),
    }));
    if (shouldAutoSpeak()) {
      speechStreamManager.start(e.payload.id);
    }
  });

  void listen<{ id: number; phase: string; query?: string }>("chat-phase", (e) => {
    if (e.payload.id !== activeRequest) return;
    useChatStore.setState({
      searchPhase: e.payload.phase === "searching"
        ? e.payload.query
        : e.payload.phase === "verifying"
          ? "__verifying__"
          : null,
    });
  });

  void listen<ErrorEvent>("chat-error", (e) => {
    if (e.payload.id !== activeRequest) return;
    activeRequest = -1;
    speechStreamManager.stop();
    useVoiceStore.getState().stopSpeaking();
    useChatStore.setState((s) => ({
      streaming: false,
      searchPhase: null,
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
  searchPhase: null,
  editDraft: null,

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

  regenerate: async () => {
    const s = get();
    if (s.streaming) return;
    set((st) => {
      const msgs = [...st.messages];
      while (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") msgs.pop();
      return { messages: msgs };
    });
    void runAssistant();
  },

  editLastUser: (msg) => {
    const s = get();
    if (s.streaming || msg.role !== "user" || s.currentId == null) return;
    const idx = s.messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    // Buang pesan user ini dan semua sesudahnya (state + DB).
    const removed = s.messages.slice(idx);
    const draftText = msg.content.replace(/\n\n\[📷 Screenshot[^\]]*\]$/, "").trimEnd();
    set({ messages: s.messages.slice(0, idx), editDraft: draftText });
    if (s.currentId != null) {
      const firstRemovedId = removed.find((m) => m.id != null)?.id;
      if (firstRemovedId != null) void db.deleteMessagesFrom(s.currentId, firstRemovedId);
    }
  },

  setEditDraft: (v) => set({ editDraft: v }),

  stop: () => {
    speechStreamManager.stop();
    useVoiceStore.getState().stopSpeaking();
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
  const all: ChatMessageDto[] = msgs.map((m, i) => ({
    role: m.role,
    content:
      hasImage && i === lastIndex && m.role === "user" ? imageParts : m.content,
  }));
  // Windowing token-based: sisakan 30% context utk respons,
  // system prompt & pesan terbaru selalu diprioritaskan.
  const contextTokens = settings.contextTokens ?? 4096;
  const budgetTokens = Math.floor(contextTokens * 0.7);
  let used =
    estimateTokens(settings.systemPrompt || DEFAULT_SYSTEM_PROMPT) +
    estimateTokens(all[all.length - 1]?.content ? JSON.stringify(all[all.length - 1].content) : "");
  let cut = 0;
  for (let i = all.length - 2; i >= 0; i--) {
    const cost = estimateTokens(JSON.stringify(all[i].content));
    if (used + cost > budgetTokens) {
      cut = i + 1;
      break;
    }
    used += cost;
  }
  // Muat seluruhnya → cut tetap 0 (kirim semua); melebihi → pangkas dari depan.
  const history = all.slice(cut);

  pendingSources = null;

  const reqId = ++requestSeq;
  activeRequest = reqId;
  if (shouldAutoSpeak()) {
    speechStreamManager.start(reqId);
  }
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
      systemPrompt: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      temperature: settings.temperature,
      topP: settings.topP,
      maxTokens: settings.maxTokens,
      webSearchEnabled: settings.webSearchEnabled,
      searchProvider: settings.searchProvider,
      mcpIndexPath: settings.mcpIndexPath || null,
      mcpNode: settings.mcpNode || null,
      mcpFullContent: settings.mcpFullContent,
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
