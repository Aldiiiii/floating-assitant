import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ChatMsg } from "../stores/chat";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { Icon, type IconName } from "./Icon";
import { Markdown } from "./Markdown";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="flex items-center gap-1 px-1 py-1 text-[9px] text-[#787870] opacity-0 transition-opacity hover:text-[#e7e6df] group-hover/msg:opacity-100"><Icon name="copy" className="h-3 w-3" />{copied ? "Copied" : "Copy"}</button>;
}

function SpeakButton({ text }: { text: string }) {
  const speaking = useVoiceStore((s) => s.speaking);
  const paused = useVoiceStore((s) => s.paused);
  const speak = useVoiceStore((s) => s.speak);
  const togglePause = useVoiceStore((s) => s.togglePause);
  const stopSpeaking = useVoiceStore((s) => s.stopSpeaking);
  if (!speaking) return <button onClick={() => void speak(text)} title="Bacakan jawaban" className="flex items-center gap-1 px-1 py-1 text-[9px] text-[#787870] opacity-0 transition-opacity hover:text-[#e7e6df] group-hover/msg:opacity-100"><Icon name={"volume" as IconName} className="h-3 w-3" />Bacakan</button>;
  return <span className="flex items-center gap-0.5 opacity-100">
    <button onClick={togglePause} title={paused ? "Lanjutkan" : "Jeda"} className={`flex items-center gap-1 px-1 py-1 text-[9px] transition-opacity ${paused ? "text-[#c8f16b]" : "text-[#dbdad3]"}`}><Icon name={paused ? ("play" as IconName) : ("pause" as IconName)} className="h-3 w-3" />{paused ? "Lanjut" : "Jeda"}</button>
    <button onClick={stopSpeaking} title="Hentikan" className="flex items-center gap-1 px-1 py-1 text-[9px] text-[#f07167]"><Icon name="stop" className="h-3 w-3" />Stop</button>
  </span>;
}

function SourcesBlock({ sources }: { sources: { title: string; url: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen((o) => !o)} className="text-[10px] text-[#8ab4f8] hover:underline">🌐 {sources.length} sumber {open ? "▾" : "▸"}</button>
      {open && <ul className="mt-1 space-y-1 border-l border-[#8ab4f8]/40 pl-2">{sources.map((source, index) => <li key={source.url} className="text-[10px] leading-snug"><button onClick={() => void openUrl(source.url)} className="text-left text-[#8ab4f8] hover:underline">[{index + 1}] {source.title}</button></li>)}</ul>}
    </div>
  );
}

function TypingIndicator() { return <div className="flex h-6 items-center gap-1"><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b] [animation-delay:-.2s]" /><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b] [animation-delay:-.1s]" /><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b]" /></div>; }

export function Message({ msg, streaming, isLastUser = false }: { msg: ChatMsg; streaming: boolean; isLastUser?: boolean }) {
  const retry = useChatStore((s) => s.retry); const editLastUser = useChatStore((s) => s.editLastUser); const thinking = streaming && !msg.error && !msg.content.trim();
  if (msg.role === "user") return <div className="group/msg flex items-start justify-end gap-2">{msg.image && <img src={msg.image} alt="Lampiran screenshot" className="h-16 self-start rounded border border-white/[.12]" />}<div className="max-w-[78%] border border-white/[.11] bg-[#30302c] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-[#f0efe8]">{isLastUser && <button onClick={() => editLastUser(msg)} title="Edit pesan ini" className="mr-1 inline-flex translate-y-px align-middle text-[#787870] opacity-0 transition-opacity hover:text-[#e7e6df] group-hover/msg:opacity-100"><Icon name="refresh" className="h-3 w-3 rotate-90" /></button>}{msg.content}</div></div>;
  return <article className="group/msg min-w-0 border-l border-[#c8f16b]/60 pl-3"><div className="mb-1 flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#898981]">Assistant</span>{!thinking && !msg.error && msg.content.trim() !== "" && <span className="flex items-center gap-0.5"><SpeakButton text={msg.content} /><CopyButton text={msg.content} /></span>}</div>{msg.content.trim() !== "" && <Markdown content={msg.content} />}{!streaming && !msg.error && msg.content.trim() !== "" && <button onClick={() => void useChatStore.getState().regenerate()} title="Buat ulang jawaban" className="mt-0.5 flex items-center gap-1 px-1 py-1 text-[9px] text-[#787870] opacity-0 transition-opacity hover:text-[#e7e6df] group-hover/msg:opacity-100"><Icon name="refresh" className="h-3 w-3" />Regenerate</button>}{msg.sources && msg.sources.length > 0 && <SourcesBlock sources={msg.sources} />}{thinking && <TypingIndicator />}{msg.error && <div className="border-l-2 border-[#f07167] bg-[#f07167]/[.07] px-3 py-2.5"><p className="text-[10px] font-medium text-[#ffd1cc]">Respons gagal</p><p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-[#d59791]">{msg.error}</p><button onClick={() => void retry()} className="mt-2 text-[10px] font-medium text-[#f4aca5] underline underline-offset-2">Coba lagi</button></div>}</article>;
}
