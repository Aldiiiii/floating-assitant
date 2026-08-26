import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chat";
import { Icon } from "./Icon";
import { Message } from "./Message";

export function MessageList() {
  const messages = useChatStore((s) => s.messages); const streaming = useChatStore((s) => s.streaming); const containerRef = useRef<HTMLDivElement>(null); const nearBottomRef = useRef(true);
  useEffect(() => { const element = containerRef.current; if (element && nearBottomRef.current) element.scrollTop = element.scrollHeight; }, [messages]);
  if (messages.length === 0) return <div className="flex flex-1 flex-col justify-between px-5 py-5"><div><div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[.11] text-[#c8f16b]"><Icon name="sparkle" className="h-3.5 w-3.5" /></div><h1 className="mt-4 text-[18px] font-medium tracking-[-.035em] text-[#f3f2ec]">Mulai percakapan.</h1><p className="mt-2 max-w-[280px] text-[11px] leading-relaxed text-[#96968e]">Tanyakan sesuatu, tempel teks, atau lampirkan screenshot. Riwayat tersimpan di perangkat; pencarian web hanya berjalan saat diizinkan.</p></div><div className="border-t border-white/[.08] pt-3"><div className="flex items-center gap-2 text-[10px] text-[#999990]"><span className="flex h-5 w-5 items-center justify-center rounded bg-white/[.06] text-[#c8f16b]"><Icon name="shield" className="h-3 w-3" /></span>Kontrol privasi tersedia di Pengaturan</div></div></div>;
  return <div ref={containerRef} onScroll={() => { const element = containerRef.current; if (element) nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{messages.map((message, index) => <Message key={message.id ?? `tmp-${index}`} msg={message} streaming={streaming} isLastUser={index === messages.length - 1 && message.role === "user"} />)}</div>;
}
