import { useEffect, useRef, useState } from "react";
import type { CaptureMode } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { useVoiceStore } from "../stores/voice";
import { Icon } from "./Icon";

const OPTIONS: { mode: CaptureMode; label: string; detail: string }[] = [
  { mode: "fullscreen", label: "Layar penuh", detail: "Seluruh layar" },
  { mode: "active", label: "Jendela aktif", detail: "Aplikasi saat ini" },
  { mode: "area", label: "Pilih area", detail: "Tentukan bagian layar" },
];

export function Composer() {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const streaming = useChatStore((s) => s.streaming);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const attachment = useChatStore((s) => s.attachment);
  const capturing = useChatStore((s) => s.capturing);
  const captureError = useChatStore((s) => s.captureError);
  const attach = useChatStore((s) => s.attach);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const voiceState = useVoiceStore((s) => s.state);
  const micEnabled = useVoiceStore((s) => s.micEnabled);
  const voiceMode = useVoiceStore((s) => s.mode);
  const voiceError = useVoiceStore((s) => s.error);
  const startRecording = useVoiceStore((s) => s.startRecording);
  const stopRecording = useVoiceStore((s) => s.stopRecording);
  const composingRef = useRef(false);
  const pttHeldRef = useRef(false);

  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const insertTranscript = (text: string) => {
    if (!text.trim()) return;
    setValue((current) => (current.trim() === "" ? text : `${current} ${text}`));
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  };

  const finishRecording = async () => {
    try {
      const result = await stopRecording();
      if (result?.text) insertTranscript(result.text);
    } catch {
      /* error ditangani via event voice-state */
    }
  };

  const onMicPointerDown = () => {
    if (voiceMode !== "ptt" || !micEnabled || voiceState !== "idle") return;
    pttHeldRef.current = true;
    void startRecording().catch(() => undefined);
  };

  const onMicPointerUp = () => {
    if (voiceMode !== "ptt" || !pttHeldRef.current) return;
    pttHeldRef.current = false;
    if (isRecording) void finishRecording();
  };

  const onMicClick = () => {
    if (voiceMode !== "toggle" || !micEnabled) return;
    if (isRecording) void finishRecording();
    else if (voiceState === "idle") void startRecording().catch(() => undefined);
  };

  const doSend = () => {
    if (!value.trim() || streaming) return;
    void send(value);
    setValue("");
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>("textarea");
      if (input) input.style.height = "auto";
    });
  };

  return <footer className="border-t border-white/[.09] bg-[#181816] p-2.5">
    {(attachment || capturing || captureError || voiceError) && <div className="mb-2 space-y-1.5">
      {capturing && <div className="flex items-center gap-2 border border-white/[.08] bg-white/[.04] px-3 py-2 text-[10px] text-[#b6b6ad]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#c8f16b] border-t-transparent" />Menyiapkan screenshot…</div>}
      {!capturing && attachment && <div className="flex items-center gap-2 border border-white/[.08] bg-white/[.04] p-1.5"><img src={attachment.dataUrl} alt="Screenshot terlampir" className="h-10 w-14 object-cover" /><div><p className="text-[10px] text-[#dbdad3]">Konteks layar terpasang</p><p className="mt-0.5 text-[9px] text-[#85857d]">{attachment.width} × {attachment.height}</p></div><button onClick={removeAttachment} title="Hapus screenshot" className="ml-auto flex h-7 w-7 items-center justify-center text-[#85857d] hover:text-white"><Icon name="close" className="h-3.5 w-3.5" /></button></div>}
      {!capturing && captureError && <div className="border border-[#f07167]/25 bg-[#f07167]/10 px-3 py-2 text-[10px] text-[#f4aca5]">{captureError}</div>}
      {voiceError && <div className="whitespace-pre-line border border-[#f07167]/25 bg-[#f07167]/10 px-3 py-2 text-[10px] leading-relaxed text-[#f4aca5]">{voiceError}</div>}
    </div>}
    <div className="relative flex items-end gap-1 border border-white/[.13] bg-[#11110f] p-1.5 focus-within:border-[#c8f16b]/55">
      <div className="pb-0.5"><button onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }} disabled={capturing} title="Tambahkan screenshot" className={`flex h-8 w-8 items-center justify-center ${menuOpen ? "bg-[#c8f16b] text-[#161712]" : "text-[#aaa9a1] hover:bg-white/[.07] hover:text-white"} disabled:opacity-30`}><Icon name="image" className="h-3.5 w-3.5" /></button>{menuOpen && <div onClick={(event) => event.stopPropagation()} className="absolute bottom-full left-0 z-20 mb-2 w-52 border border-white/[.12] bg-[#242421] p-1 shadow-[0_12px_32px_rgba(0,0,0,.38)]"><p className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[#83837b]">Tambahkan konteks layar</p>{OPTIONS.map((option) => <button key={option.mode} onClick={() => { setMenuOpen(false); void attach(option.mode); }} className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-white/[.06]"><span className="text-[10px] text-[#e4e3dc]">{option.label}</span><span className="text-[9px] text-[#82827a]">{option.detail}</span></button>)}</div>}</div>

      <div className="relative pb-0.5">
        <button
          onPointerDown={onMicPointerDown}
          onPointerUp={onMicPointerUp}
          onPointerLeave={onMicPointerUp}
          onClick={onMicClick}
          disabled={!micEnabled || isTranscribing}
          title={!micEnabled ? "Microphone dimatikan — Pengaturan → Voice" : voiceMode === "ptt" ? "Tahan untuk bicara" : "Klik mulai/berhenti merekam"}
          className={`relative flex h-8 w-8 items-center justify-center ${isRecording ? "bg-[#f07167] text-white" : isTranscribing ? "bg-white/[.09] text-[#c8f16b]" : micEnabled ? "text-[#aaa9a1] hover:bg-white/[.07] hover:text-white" : "text-[#5b5b55] opacity-60"} disabled:opacity-40`}
        >
          {isRecording && <span className="absolute inset-0 animate-ping rounded-none bg-[#f07167]/50" />}
          <span className="relative"><Icon name="mic" className={`h-3.5 w-3.5 ${isTranscribing ? "animate-pulse" : ""}`} /></span>
        </button>
        {isRecording && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#f07167]" />}
      </div>

      <textarea value={value} onChange={(event) => { setValue(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 96)}px`; }} onKeyDown={(event) => { composingRef.current = event.nativeEvent.isComposing; if (event.key === "Enter" && !event.shiftKey && !composingRef.current) { event.preventDefault(); doSend(); } }} rows={1} placeholder={isRecording ? "Mendengarkan…" : isTranscribing ? "Menyalin suara…" : streaming ? "Assistant sedang menjawab…" : "Ketik pesan"} className="composer-input max-h-[96px] min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-[12px] leading-relaxed text-[#efeee7] outline-none placeholder:text-[#74746c]" />
      {streaming ? <button onClick={stop} title="Hentikan respons" className="mb-0.5 flex h-8 w-8 items-center justify-center bg-white/[.09] text-[#eeeeea] hover:bg-white/[.15]"><Icon name="stop" className="h-3.5 w-3.5" /></button> : <button onClick={doSend} disabled={!value.trim()} title="Kirim" className="mb-0.5 flex h-8 w-8 items-center justify-center bg-[#c8f16b] text-[#171812] hover:bg-[#dbff8c] disabled:bg-white/[.06] disabled:text-[#66665f]"><Icon name="send" className="h-3.5 w-3.5" /></button>}
    </div><div className="mt-1.5 flex justify-between text-[8px] text-[#74746c]"><span>Enter kirim · Shift + Enter baris baru{micEnabled ? ` · 🎤 ${voiceMode === "ptt" ? "tahan untuk bicara" : "klik untuk merekam"}` : ""}</span><span>Lokal</span></div>
  </footer>;
}
