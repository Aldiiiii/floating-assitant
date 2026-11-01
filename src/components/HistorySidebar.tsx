import type { ConversationRow } from "../lib/db";
import { useChatStore } from "../stores/chat";
import { Icon } from "./Icon";

function relativeDate(conversation: ConversationRow) {
  const date = new Date(conversation.updated_at.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "Tersimpan lokal";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Hari ini";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(date);
}

export function HistorySidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const currentId = useChatStore((s) => s.currentId);
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const setSidebar = useChatStore((s) => s.setSidebar);
  const newConversation = useChatStore((s) => s.newConversation);
  const openConversation = useChatStore((s) => s.openConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  return (
    <>
      {/* Backdrop with fade transition */}
      <div
        className={`absolute inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setSidebar(false)}
      />

      {/* Drawer Panel with slide transition */}
      <aside
        className={`absolute inset-y-0 left-0 z-30 flex w-[280px] flex-col border-r border-white/[.12] bg-[#1a1b18]/95 shadow-[16px_0_48px_rgba(0,0,0,.6)] backdrop-blur-xl transition-transform duration-200 ease-out select-none ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[.08] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[.06] text-[#c8f16b] ring-1 ring-white/[.08]">
              <Icon name="history" className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[12px] font-semibold text-[#f0efe8]">Riwayat percakapan</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebar(false)}
            title="Tutup riwayat (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#85857d] transition-all hover:bg-white/[.08] hover:text-white active:scale-[0.94] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              newConversation();
              setSidebar(false);
            }}
            className="flex w-full items-center justify-between rounded-xl bg-[#c8f16b] px-3 py-2 text-[11px] font-semibold text-[#161712] shadow-sm transition-all hover:bg-[#dbff8c] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          >
            <span>Percakapan Baru</span>
            <Icon name="plus" className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* List Header */}
        <div className="flex items-center justify-between px-3.5 pb-2">
          <span className="text-[11px] font-medium text-[#85847b]">
            Sesi tersimpan
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#85847b]">
            {conversations.length}
          </span>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {conversations.length === 0 ? (
            <div className="border-t border-white/[.06] px-3 py-8 text-center">
              <p className="text-[11px] text-[#9a9991]">Belum ada percakapan tersimpan.</p>
              <p className="mt-1 text-[9px] leading-relaxed text-[#75746c]">
                Setiap pesan yang Anda kirim akan disimpan secara otomatis di sini.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  void openConversation(conversation.id);
                  setSidebar(false);
                }}
                className={`group/item flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${conversation.id === currentId
                    ? "bg-[#c8f16b]/15 text-[#f0efe8] ring-1 ring-[#c8f16b]/40"
                    : "text-[#bfbbb1] hover:bg-white/[.05] hover:text-[#f0efe8]"
                  }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full transition-colors ${conversation.id === currentId
                      ? "bg-[#c8f16b] shadow-[0_0_6px_rgba(200,241,107,0.8)]"
                      : "bg-white/[.2] group-hover/item:bg-white/[.4]"
                    }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[11px] ${conversation.id === currentId ? "font-semibold text-white" : "font-normal"
                      }`}
                  >
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-[#7a7972]">
                    {relativeDate(conversation)}
                  </span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteConversation(conversation.id);
                  }}
                  title="Hapus percakapan ini"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#77776f] opacity-0 transition-all hover:bg-rose-500/20 hover:text-rose-300 group-hover/item:opacity-100 focus-visible:opacity-100"
                >
                  <Icon name="close" className="h-3 w-3" />
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
