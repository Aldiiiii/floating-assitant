import { useEffect, useRef, useState } from "react";
import type { CaptureMode } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { registerVadSilenceHandler, useVoiceStore } from "../stores/voice";
import { Icon } from "./Icon";

const IS_WINDOWS = navigator.userAgent.includes("Windows");

const OPTIONS: { mode: CaptureMode; label: string; detail: string; disabled?: boolean }[] = [
  { mode: "fullscreen", label: "Layar penuh", detail: "Seluruh layar" },
  { mode: "active", label: "Jendela aktif", detail: IS_WINDOWS ? "Aplikasi saat ini" : "Belum tersedia di Linux", disabled: !IS_WINDOWS },
  { mode: "area", label: "Pilih area", detail: "Tentukan bagian layar" },
];

const WAVE_BARS_COUNT = 18;

export function Composer() {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [waveHistory, setWaveHistory] = useState<number[]>(() =>
    Array(WAVE_BARS_COUNT).fill(0)
  );
  const streaming = useChatStore((s) => s.streaming);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const attachment = useChatStore((s) => s.attachment);
  const capturing = useChatStore((s) => s.capturing);
  const captureError = useChatStore((s) => s.captureError);
  const attach = useChatStore((s) => s.attach);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const searchPhase = useChatStore((s) => s.searchPhase);
  const editDraft = useChatStore((s) => s.editDraft);
  const setEditDraft = useChatStore((s) => s.setEditDraft);

  const voiceState = useVoiceStore((s) => s.state);
  const micEnabled = useVoiceStore((s) => s.micEnabled);
  const voiceMode = useVoiceStore((s) => s.mode);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const speaking = useVoiceStore((s) => s.speaking);
  const dialogActive = useVoiceStore((s) => s.dialogActive);
  const setDialogActive = useVoiceStore((s) => s.setDialogActive);
  const voiceError = useVoiceStore((s) => s.error);
  const playbackError = useVoiceStore((s) => s.playbackError);
  const startRecording = useVoiceStore((s) => s.startRecording);
  const stopRecording = useVoiceStore((s) => s.stopRecording);
  const cancelRecording = useVoiceStore((s) => s.cancelRecording);
  const composingRef = useRef(false);
  const pttHeldRef = useRef(false);
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  // Aliran gelombang suara bergerak terus dari KANAN ke KIRI (seismograph / scrolling tape)
  useEffect(() => {
    if (!isRecording) {
      setWaveHistory(Array(WAVE_BARS_COUNT).fill(0));
      return;
    }

    const interval = setInterval(() => {
      const currentLevel = audioLevelRef.current;
      setWaveHistory((prev) => {
        const next = prev.slice(1);
        next.push(currentLevel);
        return next;
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (editDraft != null) {
      setValue(editDraft);
      setEditDraft(null);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>("textarea");
        if (el) {
          el.focus();
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
        }
      });
    }
  }, [editDraft, setEditDraft]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const streamingText = useVoiceStore((s) => s.streamingText);
  const streamingBoxRef = useRef<HTMLDivElement>(null);
  const baseTextRef = useRef<string>("");

  useEffect(() => {
    if (streamingBoxRef.current) {
      streamingBoxRef.current.scrollTop = streamingBoxRef.current.scrollHeight;
    }
  }, [streamingText]);

  const finishRecording = async () => {
    try {
      const result = await stopRecording();
      if (result?.text) {
        const text = result.text.trim();
        const normalized = text
          .toLowerCase()
          .replace(/[.,!?;:()]/g, "")
          .trim();
        const isHallucination =
          normalized === "terima kasih" ||
          normalized === "terimakasih" ||
          normalized === "terima kasih banyak" ||
          normalized === "terima kasih sudah menonton" ||
          normalized === "terima kasih telah menonton" ||
          normalized === "thank you" ||
          normalized === "thank you very much" ||
          normalized === "thank you for watching" ||
          normalized === "thanks for watching";

        if (isHallucination || text.length === 0) {
          if (voiceMode === "dialog") {
            setDialogActive(true);
            void startRecording().catch(() => undefined);
          }
          return;
        }

        if (voiceMode === "dialog") {
          // Dialog mode: otomatis kirim ke LLM & jaga sesi tetap aktif!
          setDialogActive(true);
          setValue("");
          void send(text);
        } else {
          const prefix = baseTextRef.current.trim();
          const finalVal = prefix ? `${prefix} ${text}` : text;
          setValue(finalVal);
          requestAnimationFrame(() => {
            const el = document.querySelector<HTMLTextAreaElement>("textarea");
            if (el) {
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
              el.focus();
            }
          });
        }
      } else if (voiceMode === "dialog") {
        setDialogActive(true);
        void startRecording().catch(() => undefined);
      }
    } catch {
      /* error ditangani via event voice-state */
    } finally {
      baseTextRef.current = "";
    }
  };

  // Daftarkan listener VAD (Voice Activity Detection auto-stop ketika hening > 1.2 detik)
  useEffect(() => {
    registerVadSilenceHandler(() => {
      void finishRecording();
    });
    return () => registerVadSilenceHandler(null);
  }, [voiceMode, dialogActive]);

  const onCancelRecording = () => {
    void cancelRecording();
    setValue(baseTextRef.current);
    baseTextRef.current = "";
    if (voiceMode === "dialog") {
      setDialogActive(false);
    }
  };

  const onFinishRecording = () => {
    void finishRecording();
  };

  const onMicPointerDown = () => {
    if (voiceMode !== "ptt" || !micEnabled || voiceState !== "idle") return;
    pttHeldRef.current = true;
    baseTextRef.current = value;
    void startRecording().catch(() => undefined);
  };

  const onMicPointerUp = () => {
    if (voiceMode !== "ptt" || !pttHeldRef.current) return;
    pttHeldRef.current = false;
    if (isRecording) void finishRecording();
  };

  const onMicClick = () => {
    if (!micEnabled) return;
    if (voiceMode === "dialog") {
      if (dialogActive || isRecording) {
        setDialogActive(false);
        if (isRecording) void cancelRecording();
      } else {
        setDialogActive(true);
        if (voiceState === "idle") {
          baseTextRef.current = "";
          void startRecording().catch(() => undefined);
        }
      }
    } else if (voiceMode === "toggle") {
      if (isRecording) {
        void finishRecording();
      } else if (voiceState === "idle") {
        baseTextRef.current = value;
        void startRecording().catch(() => undefined);
      }
    }
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
    {searchPhase && <div className="mb-2 flex items-center gap-2 border border-white/[.08] bg-white/[.04] px-3 py-2 text-[10px] text-[#b6b6ad]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#c8f16b] border-t-transparent" />{searchPhase === "__verifying__" ? "Memverifikasi jawaban dan sumber…" : <>Mencari web: “{searchPhase}”…</>}</div>}
    
    {voiceMode === "dialog" && dialogActive && (
      <div className="mb-2 flex items-center justify-between rounded-lg border border-[#c8f16b]/30 bg-[#c8f16b]/10 px-2.5 py-1 text-[10px] text-[#dbff8c]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8f16b] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#c8f16b]" />
          </span>
          <span>
            {isRecording
              ? "Mode Dialog Aktif · Mendengarkan suara Anda…"
              : speaking
              ? "Mode Dialog Aktif · Asisten sedang menjawab…"
              : isTranscribing
              ? "Menyalin suara…"
              : "Mode Dialog Aktif · Siap berbicara"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setDialogActive(false);
            if (isRecording) void cancelRecording();
          }}
          className="text-[9px] underline text-[#dbff8c]/80 hover:text-white"
        >
          Keluar
        </button>
      </div>
    )}

    {(attachment || capturing || captureError || voiceError) && <div className="mb-2 space-y-1.5">
      {capturing && <div className="flex items-center gap-2 border border-white/[.08] bg-white/[.04] px-3 py-2 text-[10px] text-[#b6b6ad]"><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#c8f16b] border-t-transparent" />Menyiapkan screenshot…</div>}
      {!capturing && attachment && <div className="flex items-center gap-2 border border-white/[.08] bg-white/[.04] p-1.5"><img src={attachment.dataUrl} alt="Screenshot terlampir" className="h-10 w-14 object-cover" /><div><p className="text-[10px] text-[#dbdad3]">Konteks layar terpasang</p><p className="mt-0.5 text-[9px] text-[#85857d]">{attachment.width} × {attachment.height}</p></div><button onClick={removeAttachment} title="Hapus screenshot" className="ml-auto flex h-7 w-7 items-center justify-center text-[#85857d] hover:text-white"><Icon name="close" className="h-3.5 w-3.5" /></button></div>}
      {!capturing && captureError && <div className="border border-[#f07167]/25 bg-[#f07167]/10 px-3 py-2 text-[10px] text-[#f4aca5]">{captureError}</div>}
      {voiceError && <div className="whitespace-pre-line border border-[#f07167]/25 bg-[#f07167]/10 px-3 py-2 text-[10px] leading-relaxed text-[#f4aca5]">{voiceError}</div>}
      {playbackError && !voiceError && <div className="border border-[#f07167]/25 bg-[#f07167]/10 px-3 py-2 text-[10px] leading-relaxed text-[#f4aca5]">{playbackError}</div>}
    </div>}

    {isRecording && streamingText && (
      <div
        ref={streamingBoxRef}
        className="mb-2 flex items-start gap-2.5 rounded-xl border border-white/[.15] bg-[#21211e]/95 px-3 py-2 shadow-2xl backdrop-blur-md max-h-32 overflow-y-auto transition-all"
      >
        <span className="mt-1 flex h-2 w-2 relative shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8f16b] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#c8f16b]" />
        </span>
        <p className="flex-1 min-w-0 text-[11px] leading-relaxed text-[#f3f2ee] italic break-words whitespace-pre-wrap">
          “{streamingText}”
        </p>
      </div>
    )}

    <div className="relative flex items-center gap-1.5 rounded-xl border border-white/[.13] bg-[#11110f] p-1.5 focus-within:border-[#c8f16b]/55">
      {isRecording ? (
        <div className="flex w-full items-center justify-between gap-2 px-1.5 py-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              title="Tambahkan opsi"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#aaa9a1] hover:bg-white/[.07] hover:text-white active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="plus" className="h-4 w-4" />
            </button>
            <span className="shrink-0 text-[12px] italic text-[#9e9e96] select-none">
              Mendengarkan…
            </span>
            <div
              className="flex h-6 items-center gap-[3px] overflow-hidden px-1 select-none"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 18%, black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 18%, black 100%)",
              }}
            >
              {waveHistory.map((level, i) => {
                const isSpeaking = level > 0.04;
                const dynamicHeight = isSpeaking
                  ? Math.min(20, Math.max(4, Math.round(4 + level * 20)))
                  : 3;
                return (
                  <span
                    key={i}
                    className="w-[3px] rounded-full shrink-0"
                    style={{
                      height: `${dynamicHeight}px`,
                      backgroundColor: isSpeaking ? "#c8f16b" : "#4e573d",
                      boxShadow:
                        dynamicHeight > 9
                          ? "0 0 6px rgba(200, 241, 107, 0.55)"
                          : "none",
                      transition:
                        "height 60ms ease-out, background-color 100ms ease, box-shadow 100ms ease",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onCancelRecording}
              title="Batalkan rekaman"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#aaa9a1] hover:bg-white/[.1] hover:text-[#f07167] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f07167]/60"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onFinishRecording}
              title="Selesai bicara"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[.12] hover:bg-white/[.22] text-[#c8f16b] hover:text-white active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="check" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pb-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
              disabled={capturing}
              title="Tambahkan screenshot"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                menuOpen
                  ? "bg-[#c8f16b] text-[#161712]"
                  : "text-[#aaa9a1] hover:bg-white/[.07] hover:text-white"
              } disabled:opacity-30`}
            >
              <Icon name="image" className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div
                onClick={(event) => event.stopPropagation()}
                className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-white/[.12] bg-[#22221f]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,.5)] backdrop-blur-md"
              >
                <p className="px-2.5 py-1 text-[10px] font-medium text-zinc-400">
                  Mode tangkapan layar
                </p>
                {OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    disabled={option.disabled}
                    title={option.disabled ? option.detail : undefined}
                    onClick={() => {
                      setMenuOpen(false);
                      void attach(option.mode);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[.08] active:bg-white/[.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="text-[10px] text-[#e4e3dc]">{option.label}</span>
                    <span className="text-[9px] text-[#82827a]">{option.detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative pb-0.5">
            <button
              type="button"
              onPointerDown={onMicPointerDown}
              onPointerUp={onMicPointerUp}
              onPointerLeave={onMicPointerUp}
              onClick={onMicClick}
              disabled={!micEnabled || isTranscribing}
              title={
                !micEnabled
                  ? "Microphone dimatikan — Pengaturan → Voice"
                  : voiceMode === "ptt"
                  ? "Tahan untuk bicara"
                  : voiceMode === "dialog"
                  ? dialogActive
                    ? "Hentikan Mode Dialog"
                    : "Mulai Mode Dialog (klik untuk bicara langsung)"
                  : "Klik mulai/berhenti merekam"
              }
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                voiceMode === "dialog" && dialogActive
                  ? "bg-[#c8f16b]/20 text-[#c8f16b] ring-1 ring-[#c8f16b]/50"
                  : isTranscribing
                  ? "bg-white/[.09] text-[#c8f16b]"
                  : micEnabled
                  ? "text-[#aaa9a1] hover:bg-white/[.07] hover:text-white"
                  : "text-[#5b5b55] opacity-60"
              } disabled:opacity-40`}
            >
              <span className="relative">
                <Icon name="mic" className={`h-3.5 w-3.5 ${isTranscribing ? "animate-pulse" : ""}`} />
                {voiceMode === "dialog" && dialogActive && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#c8f16b] animate-ping" />
                )}
              </span>
            </button>
          </div>

          <textarea
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 96)}px`;
            }}
            onKeyDown={(event) => {
              composingRef.current = event.nativeEvent.isComposing;
              if (event.key === "Enter" && !event.shiftKey && !composingRef.current) {
                event.preventDefault();
                doSend();
              }
            }}
            rows={1}
            placeholder={
              isTranscribing
                ? "Menyalin suara…"
                : streaming
                ? "Assistant sedang menjawab…"
                : "Ketik pesan"
            }
            className="composer-input max-h-[96px] min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-[12px] leading-relaxed text-[#efeee7] outline-none placeholder:text-[#888880]"
          />

          {streaming ? (
            <button
              type="button"
              onClick={stop}
              title="Hentikan respons"
              className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[.09] text-[#eeeeea] hover:bg-white/[.15] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="stop" className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={doSend}
              disabled={!value.trim()}
              title="Kirim"
              className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[#c8f16b] text-[#171812] hover:bg-[#dbff8c] disabled:bg-white/[.06] disabled:text-[#66665f] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="send" className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  </footer>;
}
