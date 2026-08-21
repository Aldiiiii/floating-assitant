import { useState } from "react";
import type { ChatMsg } from "../stores/chat";
import { useChatStore } from "../stores/chat";
import { Icon } from "./Icon";
import { Markdown } from "./Markdown";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="flex items-center gap-1 px-1 py-1 text-[9px] text-[#787870] opacity-0 transition-opacity hover:text-[#e7e6df] group-hover/msg:opacity-100"><Icon name="copy" className="h-3 w-3" />{copied ? "Copied" : "Copy"}</button>;
}

function TypingIndicator() { return <div className="flex h-6 items-center gap-1"><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b] [animation-delay:-.2s]" /><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b] [animation-delay:-.1s]" /><span className="h-1 w-1 animate-bounce rounded-full bg-[#c8f16b]" /></div>; }

export function Message({ msg, streaming }: { msg: ChatMsg; streaming: boolean }) {
  const retry = useChatStore((s) => s.retry); const thinking = streaming && !msg.error && !msg.content.trim();
  if (msg.role === "user") return <div className="group/msg flex justify-end"><div className="max-w-[78%] border border-white/[.11] bg-[#30302c] px-3 py-2 text-[13px] leading-relaxed text-[#f0efe8]">{msg.content}</div></div>;
  return <article className="group/msg min-w-0 border-l border-[#c8f16b]/60 pl-3"><div className="mb-1 flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#898981]">Assistant</span>{!thinking && !msg.error && msg.content.trim() !== "" && <CopyButton text={msg.content} />}</div>{msg.content.trim() !== "" && <Markdown content={msg.content} />}{thinking && <TypingIndicator />}{msg.error && <div className="border-l-2 border-[#f07167] bg-[#f07167]/[.07] px-3 py-2.5"><p className="text-[10px] font-medium text-[#ffd1cc]">Response failed</p><p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-[#d59791]">{msg.error}</p><button onClick={() => void retry()} className="mt-2 text-[10px] font-medium text-[#f4aca5] underline underline-offset-2">Try again</button></div>}</article>;
}
