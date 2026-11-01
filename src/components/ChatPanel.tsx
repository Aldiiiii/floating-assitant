import { useState } from "react";
import { useWindowDrag } from "../lib/useWindowDrag";
import { useChatStore } from "../stores/chat";
import { useSettingsStore, type ConnStatus } from "../stores/settings";
import { Composer } from "./Composer";
import { HelpModal } from "./HelpModal";
import { HistorySidebar } from "./HistorySidebar";
import { Icon } from "./Icon";
import { MessageList } from "./MessageList";
import { SettingsPanel } from "./SettingsPanel";

const STATUS_DOT: Record<ConnStatus, string> = {
  connected: "bg-[#c8f16b]",
  checking: "animate-pulse bg-amber-400",
  offline: "bg-rose-500",
  idle: "bg-zinc-600",
};

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const drag = useWindowDrag();
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [helpOpen, setHelpOpen] = useState(false);

  const status = useSettingsStore((s) => s.status);
  const activeModel = useSettingsStore((s) => s.model);
  const streaming = useChatStore((s) => s.streaming);
  const setSidebar = useChatStore((s) => s.setSidebar);

  const stopDrag = (event: React.PointerEvent) => event.stopPropagation();

  const controlButtonClass =
    "flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[.07] hover:text-zinc-100 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60";

  return (
    <div className="assistant-panel relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[.08] bg-[#141413] text-[#e4e3dd] shadow-2xl">
      {/* Top Header */}
      <header
        {...drag}
        className="flex cursor-grab items-center justify-between border-b border-white/[.06] bg-[#10100f] px-3.5 py-2.5 select-none active:cursor-grabbing"
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setSidebar(true)}
            title="Riwayat percakapan"
            className={`${controlButtonClass} -ml-1`}
          >
            <Icon name="menu" className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-zinc-200">Astra</span>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} title={`Status: ${status}`} />
            {activeModel && (
              <span className="max-w-[130px] truncate font-mono text-[10px] text-zinc-500">
                {activeModel}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          {streaming && (
            <span className="mr-1.5 font-mono text-[10px] text-[#c8f16b]">
              menjawab…
            </span>
          )}

          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setHelpOpen(true)}
            title="Panduan"
            className={controlButtonClass}
          >
            <Icon name="help" className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={() => setView((curr) => (curr === "chat" ? "settings" : "chat"))}
            title={view === "settings" ? "Kembali ke chat" : "Pengaturan"}
            className={`${controlButtonClass} ${
              view === "settings" ? "bg-white/[.08] text-white" : ""
            }`}
          >
            <Icon name="settings" className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onPointerDown={stopDrag}
            onClick={onClose}
            title="Minimalkan (Esc)"
            className={controlButtonClass}
          >
            <Icon name="minimize" className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Panel View */}
      {view === "settings" ? (
        <SettingsPanel />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <MessageList />
            <HistorySidebar />
          </div>
          <Composer />
        </>
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
