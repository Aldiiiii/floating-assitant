import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chat";
import { Message } from "./Message";

const SUGGESTIONS = [
  "Jelaskan penyebab dan solusi untuk error ini:",
  "Cari berita dan informasi terbaru mengenai:",
  "Bantu review dan optimasi kode berikut:",
];

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const containerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    const element = containerRef.current;
    if (element && nearBottomRef.current) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: streaming ? "auto" : "smooth",
      });
    }
  }, [messages, streaming]);

  const setPrompt = (text: string) => {
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea.composer-input");
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center px-6 py-6 select-none">
        <div className="max-w-xs space-y-4">
          <p className="text-[14px] font-medium text-zinc-200">
            Apa yang ingin Anda kerjakan?
          </p>

          {/* Clean suggestions without decorative cards */}
          <div className="space-y-1.5">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrompt(item)}
                className="w-full text-left rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2 text-[11px] text-zinc-400 transition-colors hover:border-white/[.12] hover:bg-white/[.04] hover:text-zinc-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        const element = containerRef.current;
        if (element) {
          nearBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 70;
        }
      }}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
    >
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        return (
          <Message
            key={message.id ?? `tmp-${index}`}
            msg={message}
            streaming={streaming && isLast}
            isLastUser={isLast && message.role === "user"}
          />
        );
      })}
    </div>
  );
}
