import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { extractSpeakableText, speakFullText, useChatStore, type ChatMsg } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { Icon, type IconName } from "./Icon";
import { Markdown } from "./Markdown";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title="Salin jawaban AI ke clipboard"
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
        copied
          ? "bg-[#c8f16b]/20 text-[#c8f16b]"
          : "text-[#8e8d84] hover:bg-white/[0.08] hover:text-[#ecebe5]"
      }`}
    >
      <Icon name={copied ? "check" : "copy"} className="h-3 w-3" />
      {copied ? "Tersalin!" : "Salin"}
    </button>
  );
}

function SpeakButton({ text }: { text: string }) {
  const speaking = useVoiceStore((s) => s.speaking);
  const paused = useVoiceStore((s) => s.paused);
  const togglePause = useVoiceStore((s) => s.togglePause);
  const stopSpeaking = useVoiceStore((s) => s.stopSpeaking);
  const speakable = extractSpeakableText(text, true);
  if (!speaking)
    return (
      <button
        onClick={() => void speakFullText(speakable)}
        title="Bacakan jawaban"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[#8e8d84] transition-all hover:bg-white/[0.08] hover:text-[#ecebe5] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
      >
        <Icon name={"volume" as IconName} className="h-3 w-3" />
        Bacakan
      </button>
    );
  return (
    <span className="flex items-center gap-0.5">
      <button
        onClick={togglePause}
        title={paused ? "Lanjutkan" : "Jeda"}
        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
          paused ? "text-[#c8f16b]" : "text-[#dbdad3]"
        }`}
      >
        <Icon name={paused ? ("play" as IconName) : ("pause" as IconName)} className="h-3 w-3" />
        {paused ? "Lanjut" : "Jeda"}
      </button>
      <button
        onClick={stopSpeaking}
        title="Hentikan"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[#f07167] transition-all hover:bg-[#f07167]/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f07167]/60"
      >
        <Icon name="stop" className="h-3 w-3" />
        Stop
      </button>
    </span>
  );
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

export function Message({
  msg,
  streaming,
  isLastUser = false,
}: {
  msg: ChatMsg;
  streaming: boolean;
  isLastUser?: boolean;
}) {
  const retry = useChatStore((s) => s.retry);
  const editLastUser = useChatStore((s) => s.editLastUser);
  const thinking = streaming && !msg.error && !msg.content.trim();

  if (msg.role === "user") {
    return (
      <div className="group/msg flex items-start justify-end gap-2">
        {msg.image && (
          <img
            src={msg.image}
            alt="Lampiran screenshot"
            className="h-16 self-start rounded border border-white/[.12]"
          />
        )}
        <div className="relative max-w-[82%] rounded-2xl border border-white/[.11] bg-[#2a2a26] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-[#f0efe8]">
          <div className="selectable-text">{msg.content}</div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-0 transition-opacity group-hover/msg:opacity-100">
            {isLastUser && (
              <button
                onClick={() => editLastUser(msg)}
                title="Edit pertanyaan ini"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[#8e8d84] transition-all hover:bg-white/[0.08] hover:text-[#ecebe5] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
              >
                <Icon name="refresh" className="h-3 w-3 rotate-90" />
                <span>Edit</span>
              </button>
            )}
            <CopyButton text={msg.content} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="group/msg min-w-0 border-l-2 border-[#c8f16b]/60 pl-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#898981]">
          Astra
        </span>
        {!msg.error && msg.content.trim() !== "" && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
            <CopyButton text={msg.content} />
          </div>
        )}
      </div>

      {msg.content.trim() !== "" && <Markdown content={msg.content} />}

      {/* Action Bar di Bawah Jawaban AI */}
      {!streaming && !msg.error && msg.content.trim() !== "" && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-1.5 text-[10px]">
          <CopyButton text={msg.content} />
          <SpeakButton text={msg.content} />
          <button
            onClick={() => void useChatStore.getState().regenerate()}
            title="Buat ulang jawaban"
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-medium text-[#8e8d84] transition-all hover:bg-white/[0.08] hover:text-[#ecebe5] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          >
            <Icon name="refresh" className="h-3 w-3" />
            <span>Buat ulang</span>
          </button>
        </div>
      )}

      {msg.sources && msg.sources.length > 0 && <SourcesBlock sources={msg.sources} />}
      {thinking && <TypingIndicator />}
      {msg.error && (
        <div className="border-l-2 border-[#f07167] bg-[#f07167]/[.07] px-3 py-2.5">
          <p className="text-[10px] font-medium text-[#ffd1cc]">Respons gagal</p>
          <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-[#d59791]">
            {msg.error}
          </p>
          <button
            onClick={() => void retry()}
            className="mt-2 text-[10px] font-medium text-[#f4aca5] underline underline-offset-2"
          >
            Coba lagi
          </button>
        </div>
      )}
    </article>
  );
}
