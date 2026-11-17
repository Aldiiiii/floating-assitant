import { useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Icon } from "./Icon";

function extractLang(children: ReactNode): string | null {
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (child && typeof child === "object" && "props" in child) {
      const className = (child as { props?: { className?: string } }).props?.className;
      const match = typeof className === "string" && /language-([\w-]+)/.exec(className);
      if (match) return match[1];
    }
  }
  return null;
}

function CodeBlock({ children, ...rest }: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const lang = useMemo(() => extractLang(children), [children]);
  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-white/[.1] bg-[#11110f] shadow-md">
      <div className="flex items-center justify-between border-b border-white/[.07] bg-white/[.035] px-3.5 py-1.5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5 opacity-60">
            <span className="h-1.5 w-1.5 rounded-full bg-white/[.3]" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/[.3]" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/[.3]" />
          </span>
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[.15em] text-[#8e8d85]">
            {lang ?? "code"}
          </span>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(ref.current?.innerText ?? "").then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-all duration-100 active:scale-[0.93] ${
            copied
              ? "bg-[#c8f16b]/20 text-[#c8f16b]"
              : "text-[#85857d] hover:bg-white/[0.08] hover:text-[#ecebe5]"
          }`}
        >
          <Icon name={copied ? "check" : "copy"} className="h-3 w-3" />
          <span>{copied ? "Tersalin!" : "Copy"}</span>
        </button>
      </div>
      <pre {...rest} ref={ref} className="m-0 overflow-x-auto bg-[#0d0d0b] p-3.5 font-mono text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function stripToolCall(text: string): string {
  let s = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  const unclosedCall = s.indexOf("<tool_call");
  if (unclosedCall !== -1) {
    s = s.slice(0, unclosedCall);
  }
  s = s.replace(/<function=[^>]*>[\s\S]*?<\/function>/gi, "");
  const unclosedFunc = s.indexOf("<function=");
  if (unclosedFunc !== -1) {
    s = s.slice(0, unclosedFunc);
  }
  return s.trim();
}

function parseThinkContent(raw: string): { thinkText: string | null; isThinking: boolean; mainText: string } {
  const cleanedRaw = stripToolCall(raw);
  const thinkMatches = Array.from(cleanedRaw.matchAll(/<think>([\s\S]*?)<\/think>/gi));

  if (thinkMatches.length === 0) {
    const unclosedStart = cleanedRaw.indexOf("<think>");
    if (unclosedStart !== -1) {
      // Sedang dalam proses berpikir (streaming)
      const thinkText = cleanedRaw.slice(unclosedStart + 7).trim();
      return { thinkText, isThinking: true, mainText: cleanedRaw.slice(0, unclosedStart).trim() };
    }
    return { thinkText: null, isThinking: false, mainText: cleanedRaw };
  }

  // Ambil dan deduplikasi semua blok <think>
  const uniqueThinks: string[] = [];
  for (const match of thinkMatches) {
    const t = match[1].trim();
    if (t && !uniqueThinks.includes(t)) {
      uniqueThinks.push(t);
    }
  }
  const thinkText = uniqueThinks.join("\n\n---\n\n");

  // Hapus semua pasangan <think>...</think> dari mainText
  const mainText = cleanedRaw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Bila model meletakkan seluruh jawabannya di dalam <think> tanpa ada teks di luar,
  // gunakan thinkText sebagai jawaban utama agar ditampilkan berformat lengkap
  // dan pengguna tidak melihat layar kosong.
  if (!mainText && thinkText) {
    return { thinkText: null, isThinking: false, mainText: thinkText };
  }

  return { thinkText, isThinking: false, mainText };
}

export function Markdown({ content }: { content: string }) {
  const [openThink, setOpenThink] = useState(false);
  const { thinkText, isThinking, mainText } = useMemo(() => parseThinkContent(content), [content]);

  return (
    <div className="prose prose-invert prose-sm max-w-none break-words text-[13px] leading-relaxed text-[#deddd6] prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-[#f2f1eb] prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-white prose-a:text-[#c8f16b] prose-code:rounded-sm prose-code:bg-white/[.07] prose-code:px-1 prose-code:py-0.5 prose-code:text-[#d7f68f] prose-code:before:hidden prose-code:after:hidden prose-pre:bg-transparent prose-pre:p-0">
      {thinkText && (
        <div className="not-prose my-2 overflow-hidden rounded-lg border border-white/[0.08] bg-[#141412] text-xs">
          <button
            type="button"
            onClick={() => setOpenThink(!openThink)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-medium text-[#8e8d84] transition-colors hover:bg-white/[0.03] hover:text-[#ecebe5]"
          >
            <span className="flex items-center gap-1.5">
              <span>💭</span>
              <span>{isThinking ? "Sedang berpikir..." : "Proses Berpikir"}</span>
              {isThinking && (
                <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-[#c8f16b]" />
              )}
            </span>
            <span className="text-[10px] text-[#706f68]">{openThink || isThinking ? "Sembunyikan" : "Tampilkan"}</span>
          </button>
          {(openThink || isThinking) && (
            <div className="max-h-60 overflow-y-auto border-t border-white/[0.06] bg-[#0c0c0b] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#9a9990] select-text">
              {thinkText}
            </div>
          )}
        </div>
      )}
      {mainText ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre: CodeBlock,
            a: ({ href, children }) => (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  if (href) void openUrl(href);
                }}
                className="text-[#c8f16b] underline underline-offset-2 hover:text-[#dbff8c]"
              >
                {children}
              </a>
            ),
          }}
        >
          {mainText}
        </ReactMarkdown>
      ) : !thinkText ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre: CodeBlock,
            a: ({ href, children }) => (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  if (href) void openUrl(href);
                }}
                className="text-[#c8f16b] underline underline-offset-2 hover:text-[#dbff8c]"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}
