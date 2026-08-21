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

const STATUS: Record<ConnStatus, { label: string; dot: string }> = {
  connected: { label: "Connected", dot: "bg-[#c8f16b]" }, checking: { label: "Checking", dot: "animate-pulse bg-[#f5c451]" }, offline: { label: "Offline", dot: "bg-[#f07167]" }, idle: { label: "Not connected", dot: "bg-[#74746e]" },
};
interface ChatPanelProps { onClose: () => void; }

export function ChatPanel({ onClose }: ChatPanelProps) {
  const drag = useWindowDrag(); const [view, setView] = useState<"chat" | "settings">("chat"); const [helpOpen, setHelpOpen] = useState(false); const status = useSettingsStore((s) => s.status); const streaming = useChatStore((s) => s.streaming); const setSidebar = useChatStore((s) => s.setSidebar); const connection = STATUS[status];
  const stopDrag = (event: React.PointerEvent) => event.stopPropagation(); const control = "flex h-7 w-7 items-center justify-center rounded-md text-[#94948d] transition-colors hover:bg-white/[.06] hover:text-[#f1f0ea]";
  return <div className="assistant-panel relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-white/[.12] bg-[#1a1a18] text-[#ecebe5] shadow-[0_24px_72px_rgba(0,0,0,.62)]">
    <header {...drag} className="flex cursor-grab items-center justify-between border-b border-white/[.09] px-3 py-2.5 active:cursor-grabbing">
      <div className="flex items-center gap-2"><button onPointerDown={stopDrag} onClick={() => setSidebar(true)} title="Riwayat percakapan" className={`${control} -ml-1`}><Icon name="menu" className="h-4 w-4" /></button><div><p className="text-[11px] font-semibold tracking-[-.01em]">Assistant</p><div className="mt-0.5 flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${connection.dot}`} /><span className="text-[8px] font-medium text-[#85857e]">{connection.label}</span></div></div></div>
      <div className="flex items-center gap-0.5">{streaming && <span className="mr-1 text-[8px] text-[#c8f16b]">thinking</span>}<button onPointerDown={stopDrag} onClick={() => setHelpOpen(true)} title="Panduan" className={control}><Icon name="help" className="h-3.5 w-3.5" /></button><button onPointerDown={stopDrag} onClick={() => setView(view === "chat" ? "settings" : "chat")} title="Pengaturan" className={`${control} ${view === "settings" ? "bg-white/[.06] text-[#f1f0ea]" : ""}`}><Icon name="settings" className="h-3.5 w-3.5" /></button><button onPointerDown={stopDrag} onClick={onClose} title="Minimalkan" className={control}><Icon name="minimize" className="h-3.5 w-3.5" /></button></div>
    </header>
    {view === "settings" ? <SettingsPanel /> : <><div className="relative flex min-h-0 flex-1 flex-col"><MessageList /><HistorySidebar /></div><Composer /></>}{helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
  </div>;
}
