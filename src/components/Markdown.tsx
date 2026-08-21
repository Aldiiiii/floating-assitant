import { useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

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
  return <div className="group/code my-3 overflow-hidden border border-white/[.1] bg-[#11110f]"><div className="flex items-center justify-between border-b border-white/[.07] bg-white/[.035] px-3 py-1.5"><span className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#777770]">{lang ?? "code"}</span><button onClick={() => { void navigator.clipboard.writeText(ref.current?.innerText ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="text-[10px] text-[#85857d] hover:text-[#ecebe5]">{copied ? "Copied" : "Copy"}</button></div><pre {...rest} ref={ref} className="m-0 overflow-x-auto bg-[#11110f] p-3 text-xs leading-relaxed">{children}</pre></div>;
}

export function Markdown({ content }: { content: string }) { return <div className="prose prose-invert prose-sm max-w-none break-words text-[13px] leading-relaxed text-[#deddd6] prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-[#f2f1eb] prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-white prose-a:text-[#c8f16b] prose-code:rounded-sm prose-code:bg-white/[.07] prose-code:px-1 prose-code:py-0.5 prose-code:text-[#d7f68f] prose-code:before:hidden prose-code:after:hidden prose-pre:bg-transparent prose-pre:p-0"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: CodeBlock }}>{content}</ReactMarkdown></div>; }
