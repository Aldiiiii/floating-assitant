import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "sparkle"
  | "menu"
  | "help"
  | "settings"
  | "minimize"
  | "send"
  | "stop"
  | "image"
  | "close"
  | "plus"
  | "copy"
  | "refresh"
  | "chevron"
  | "shield"
  | "history"
  | "mic"
  | "volume"
  | "pause"
  | "play"
  | "check"
  | "code"
  | "search";

export function Icon({ name, className = "", ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  const paths: Record<IconName, ReactNode> = {
    sparkle: (
      <>
        <path d="m12 3-1.2 5.1L6 9.5l4.8 1.4L12 16l1.2-5.1L18 9.5l-4.8-1.4L12 3Z" />
        <path d="m19 15-.6 2.4L16 18l2.4.6L19 21l.6-2.4L22 18l-2.4-.6L19 15Z" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h10" />,
    help: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.8 9.5a2.4 2.4 0 1 1 3.8 2c-.9.7-1.6 1.1-1.6 2.5" />
        <path d="M12 16.7h.01" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.3 2.3-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6 16.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4.7v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L6 7.7 8.3 5.4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.3 2.3-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3.2h-.2a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
    minimize: <path d="M6 12h12" />,
    send: (
      <>
        <path d="m4 4 16 8-16 8 3-8-3-8Z" />
        <path d="M7 12h13" />
      </>
    ),
    stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
    image: (
      <>
        <rect x="3.5" y="4" width="17" height="16" rx="3" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m4 17 5-5 3.3 3.2 2.3-2.2 5 4" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    plus: <path d="M12 5v14M5 12h14" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 12a8 8 0 0 1-14.5 4.6L4 15" />
        <path d="M4 20v-5h5" />
        <path d="M4 12A8 8 0 0 1 18.5 7.4L20 9" />
        <path d="M20 4v5h-5" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
        <path d="M12 18v3" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6.5 8.5H4v7h2.5L11 19V5Z" />
        <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
        <path d="M18 7.5a6.3 6.3 0 0 1 0 9" />
      </>
    ),
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    play: <path d="M7 4.5v15l13-7.5-13-7.5Z" />,
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.7 3 8.4 7 10 4-1.6 7-5.3 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
        <path d="M4 4v4.6h4.6" />
        <path d="M12 8v4l2.7 1.6" />
      </>
    ),
    check: <path d="m5 13 4 4L19 7" />,
    code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" />
      </>
    ),
  };

  return (
    <svg {...common} {...props}>
      {paths[name]}
    </svg>
  );
}
