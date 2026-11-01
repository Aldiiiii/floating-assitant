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
    <div className="group/code my-3 overflow-hidden border border-white/[.1] bg-[#11110f]">
      <div className="flex items-center justify-between border-b border-white/[.07] bg-white/[.035] px-3 py-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#777770]">
          {lang ?? "code"}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(ref.current?.innerText ?? "").then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
            copied
              ? "text-[#c8f16b]"
              : "text-[#85857d] hover:bg-white/[0.08] hover:text-[#ecebe5]"
          }`}
        >
          <Icon name={copied ? "check" : "copy"} className="h-3 w-3" />
          <span>{copied ? "Tersalin!" : "Copy"}</span>
        </button>
      </div>
      <pre {...rest} ref={ref} className="m-0 overflow-x-auto bg-[#11110f] p-3 text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

function parseThinkContent(raw: string): { thinkText: string | null; isThinking: boolean; mainText: string } {
  const thinkStart = raw.indexOf("<think>");
  if (thinkStart === -1) {
    return { thinkText: null, isThinking: false, mainText: raw };
  }
  const thinkEnd = raw.indexOf("</think>", thinkStart + 7);
  if (thinkEnd === -1) {
    // Sedang dalam proses berpikir (streaming)
    const thinkText = raw.slice(thinkStart + 7).trim();
    return { thinkText, isThinking: true, mainText: "" };
  }
  const thinkText = raw.slice(thinkStart + 7, thinkEnd).trim();
  const mainText = (raw.slice(0, thinkStart) + raw.slice(thinkEnd + 8)).trim();
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
