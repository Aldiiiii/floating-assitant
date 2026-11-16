import { useEffect, useState } from "react";
import { modelStatus } from "../../lib/api";
import {
  useVoiceStore,
  type DialogBrevity,
  type DialogCadence,
  type MicSensitivity,
  type SttLanguage,
  type SttModel,
  type TtsVoice,
  type VoiceMode,
} from "../../stores/voice";
import { Icon } from "../Icon";
import { SettingRow } from "./SettingRow";

const PIPER_BIN_KEY = navigator.userAgent.includes("Windows")
  ? "piper-bin-windows"
  : "piper-bin-linux";

interface InstallChipProps {
  keys: string[];
  installed: Record<string, boolean>;
  onInstall: (keys: string[]) => void;
}

function InstallChip({ keys, installed, onInstall }: InstallChipProps) {
  if (keys.length === 0) {
    return (
      <span className="shrink-0 rounded-md bg-white/[.06] px-2 py-0.5 font-mono text-[9px] font-medium text-zinc-400">
        Natural · Online
      </span>
    );
  }
  const downloads = useVoiceStore((s) => s.downloads);
  const activeKey = keys.find((k) => downloads[k] !== undefined);
  if (activeKey !== undefined) {
    const progress = downloads[activeKey];
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#c8f16b]/10 px-2 py-0.5 font-mono text-[9px] tabular-nums text-[#c8f16b]">
        {progress === null ? "Mengunduh…" : `${Math.round(progress * 100)}%`}
      </span>
    );
  }
  const allInstalled = keys.every((k) => installed[k]);
  if (allInstalled) {
    return (
      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
        Terpasang
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onInstall(keys)}
      className="shrink-0 rounded-md bg-white/[.08] px-2.5 py-1 text-[9px] font-medium text-zinc-200 transition-colors hover:bg-white/[.15] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
    >
      Unduh
    </button>
  );
}

export function VoiceSection() {
  const micEnabled = useVoiceStore((s) => s.micEnabled);
  const setMicEnabled = useVoiceStore((s) => s.setMicEnabled);
  const mode = useVoiceStore((s) => s.mode);
  const setMode = useVoiceStore((s) => s.setMode);
  const vadAutoStop = useVoiceStore((s) => s.vadAutoStop);
  const setVadAutoStop = useVoiceStore((s) => s.setVadAutoStop);
  const bargeIn = useVoiceStore((s) => s.bargeIn);
  const setBargeIn = useVoiceStore((s) => s.setBargeIn);
  const sttModel = useVoiceStore((s) => s.sttModel);
  const setSttModel = useVoiceStore((s) => s.setSttModel);
  const autoSpeak = useVoiceStore((s) => s.autoSpeak);
  const setAutoSpeak = useVoiceStore((s) => s.setAutoSpeak);
  const ttsVoice = useVoiceStore((s) => s.ttsVoice);
  const setTtsVoice = useVoiceStore((s) => s.setTtsVoice);
  const language = useVoiceStore((s) => s.language);
  const setLanguage = useVoiceStore((s) => s.setLanguage);
  const speechSpeed = useVoiceStore((s) => s.speechSpeed);
  const setSpeechSpeed = useVoiceStore((s) => s.setSpeechSpeed);
  const micSensitivity = useVoiceStore((s) => s.micSensitivity);
  const setMicSensitivity = useVoiceStore((s) => s.setMicSensitivity);
  const dialogCadence = useVoiceStore((s) => s.dialogCadence);
  const setDialogCadence = useVoiceStore((s) => s.setDialogCadence);
  const dialogBrevity = useVoiceStore((s) => s.dialogBrevity);
  const setDialogBrevity = useVoiceStore((s) => s.setDialogBrevity);
  const dialogMaxTokens = useVoiceStore((s) => s.dialogMaxTokens);
  const setDialogMaxTokens = useVoiceStore((s) => s.setDialogMaxTokens);
  const downloadModel = useVoiceStore((s) => s.downloadModel);
  const micDevice = useVoiceStore((s) => s.micDevice);
  const setMicDevice = useVoiceStore((s) => s.setMicDevice);
  const devices = useVoiceStore((s) => s.devices);
  const loadDevices = useVoiceStore((s) => s.loadDevices);
  const speakerDevice = useVoiceStore((s) => s.speakerDevice);
  const setSpeakerDevice = useVoiceStore((s) => s.setSpeakerDevice);
  const outputDevices = useVoiceStore((s) => s.outputDevices);
  const loadOutputDevices = useVoiceStore((s) => s.loadOutputDevices);

  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const keys = [
        "whisper-base",
        "whisper-small",
        "whisper-medium",
        PIPER_BIN_KEY,
        "piper-voice-id",
        "piper-voice-id-config",
        "piper-voice-en",
        "piper-voice-en-config",
      ];
      const next: Record<string, boolean> = {};
      for (const key of keys) {
        try {
          next[key] = (await modelStatus(key)).installed;
        } catch {
          next[key] = false;
        }
      }
      setInstalled((prev) => ({ ...prev, ...next }));
    })();
  }, []);

  const refresh = async (keys: string[]) => {
    const next: Record<string, boolean> = {};
    for (const key of keys) {
      try {
        next[key] = (await modelStatus(key)).installed;
      } catch {
        next[key] = false;
      }
    }
    setInstalled((prev) => ({ ...prev, ...next }));
  };

  const installGroup = async (keys: string[]) => {
    setInstallError(null);
    for (const key of keys) {
      try {
        if (!(await modelStatus(key)).installed) {
          await downloadModel(key);
        }
      } catch (e) {
        setInstallError(String(e));
        await refresh(keys);
        return;
      }
    }
    await refresh(keys);
  };

  const sttOptions: { key: SttModel; modelKey: string; label: string; detail: string }[] = [
    { key: "whisper-base", modelKey: "whisper-base", label: "Cepat", detail: "Whisper Base · ±148 MB" },
    { key: "whisper-small", modelKey: "whisper-small", label: "Akurat", detail: "Whisper Small · ±490 MB" },
    { key: "whisper-medium", modelKey: "whisper-medium", label: "Paling akurat", detail: "Whisper Medium · ±1,5 GB" },
  ];

  const ttsOptions: { key: TtsVoice; keys: string[]; label: string; detail: string }[] = [
    { key: "id-gadis", keys: [], label: "Bahasa Indonesia — Gadis", detail: "Edge Natural (Wanita) · Intonasi Alami" },
    { key: "id-ardi", keys: [], label: "Bahasa Indonesia — Ardi", detail: "Edge Natural (Pria) · Jelas & Ramah" },
    { key: "id", keys: [PIPER_BIN_KEY, "piper-voice-id", "piper-voice-id-config"], label: "Bahasa Indonesia (Lokal)", detail: "Piper News · ±63 MB (Offline)" },
    { key: "en", keys: [PIPER_BIN_KEY, "piper-voice-en", "piper-voice-en-config"], label: "English (Lokal)", detail: "Piper Lessac · ±63 MB (Offline)" },
  ];

  const activeTts = ttsOptions.find((option) => option.key === ttsVoice);
  const ttsReady = Boolean(!activeTts || activeTts.keys.length === 0 || activeTts.keys.every((key) => installed[key]));

  const sensitivityOptions: [MicSensitivity, string][] = [
    ["high", "Tinggi (Hening)"],
    ["normal", "Sedang (Normal)"],
    ["low", "Rendah (Bising)"],
  ];

  const languageOptions: [SttLanguage, string][] = [
    ["id", "Indonesia"],
    ["en", "English"],
    ["auto", "Otomatis"],
  ];

  const modeOptions: [VoiceMode, string][] = [
    ["ptt", "Tahan (PTT)"],
    ["toggle", "Klik (Toggle)"],
    ["dialog", "Dialog Mode"],
  ];

  const cadenceOptions: [DialogCadence, string][] = [
    ["fast", "Cepat (1.2s)"],
    ["normal", "Seimbang (1.6s)"],
    ["relaxed", "Santai (2.2s)"],
  ];

  const brevityOptions: [DialogBrevity, string][] = [
    ["concise", "Ringkas (1-2 kalimat)"],
    ["balanced", "Seimbang (2-3 kalimat)"],
    ["detailed", "Lengkap"],
  ];

  const speedOptions: [number, string][] = [
    [0.85, "0.85× Lambat"],
    [1.0, "1.0× Normal"],
    [1.15, "1.15× Cepat"],
  ];

  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
        Suara &amp; mikrofon
      </h3>
      <div className="space-y-2">
        {/* Device Selection */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-zinc-200">Perangkat mikrofon</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">Pilih sumber audio input.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadDevices()}
              title="Muat ulang daftar perangkat"
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-zinc-300 transition-colors hover:bg-white/[.1] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="refresh" className="h-3 w-3" />
            </button>
          </div>
          <select
            value={micDevice ?? ""}
            onChange={(event) => setMicDevice(event.target.value || null)}
            disabled={devices.length === 0}
            className="mt-2 w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[11px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:text-zinc-600"
          >
            {devices.length === 0 ? (
              <option value="">Tidak ada microphone terdeteksi</option>
            ) : (
              <>
                <option value="">Default sistem</option>
                {devices.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Sensitivity & Noise Filter */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-200">Sensitivitas suara &amp; filter bising</p>
            <span className="text-[10px] font-medium text-[#c8f16b]">
              {micSensitivity === "low"
                ? "Filter bising aktif"
                : micSensitivity === "high"
                ? "Sangat peka"
                : "Standar"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
            Gunakan "Rendah (Bising)" jika ada deru kipas laptop atau AC agar hening terdeteksi akurat.
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {sensitivityOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={micSensitivity === value}
                onClick={() => setMicSensitivity(value)}
                className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  micSensitivity === value
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <SettingRow
          title="Microphone"
          description="Izinkan asisten mendengar suara saat tombol mic ditekan."
          checked={micEnabled}
          onChange={setMicEnabled}
        />

        {/* Output Device Selection */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium text-zinc-200">Perangkat speaker (output)</p>
              <p className="mt-0.5 text-[10px] text-zinc-400">Pilih speaker untuk suara asisten.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadOutputDevices()}
              title="Muat ulang daftar speaker"
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-zinc-300 transition-colors hover:bg-white/[.1] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            >
              <Icon name="refresh" className="h-3 w-3" />
            </button>
          </div>
          <select
            value={speakerDevice ?? ""}
            onChange={(event) => setSpeakerDevice(event.target.value || null)}
            disabled={outputDevices.length === 0}
            className="mt-2 w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[11px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:text-zinc-600"
          >
            {outputDevices.length === 0 ? (
              <option value="">Tidak ada speaker terdeteksi</option>
            ) : (
              <>
                <option value="">Default sistem</option>
                {outputDevices.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* STT Language Radio Group */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Bahasa percakapan</p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {languageOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={language === value}
                onClick={() => setLanguage(value)}
                className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  language === value
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Interaction Mode */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Cara berbicara</p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {modeOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  mode === value
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
            {mode === "dialog"
              ? "Percakapan dua arah hands-free: bicara langsung, asisten menjawab dengan suara, lalu otomatis mendengarkan lagi."
              : mode === "toggle"
              ? "Sekali klik mulai merekam, klik lagi (atau diam sejenak) untuk selesai."
              : "Tahan tombol mic saat berbicara dan lepas untuk mengirim."}
          </p>
        </div>

        {/* Dialog Cadence / Pause Tolerance */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-200">Jeda hening sebelum merespons</p>
            <span className="text-[10px] font-medium text-[#c8f16b]">
              {dialogCadence === "fast"
                ? "1.2 detik (Cepat)"
                : dialogCadence === "relaxed"
                ? "2.2 detik (Santai)"
                : "1.6 detik (Seimbang)"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
            Waktu tunggu saat Anda berhenti bicara sebelum asisten menjawab. Beri jeda lebih lama jika Anda sering berpikir di tengah kalimat.
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {cadenceOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={dialogCadence === value}
                onClick={() => setDialogCadence(value)}
                className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  dialogCadence === value
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dialog Brevity */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-200">Kepadatan jawaban Dialog Mode</p>
            <span className="text-[10px] font-medium text-[#c8f16b]">
              {dialogBrevity === "concise"
                ? "Ringkas (1-2 kalimat)"
                : dialogBrevity === "detailed"
                ? "Lengkap"
                : "Seimbang (2-3 kalimat)"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
            {dialogBrevity === "concise"
              ? "Langsung ke inti tanpa basa-basi (20-30 kata). Paling responsif dan nyaman didengar via suara."
              : dialogBrevity === "detailed"
              ? "Jawaban komprehensif dan mendalam seperti mode teks."
              : "Penjelasan wajar yang tetap santai dan mengalir natural via suara."}
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {brevityOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={dialogBrevity === value}
                onClick={() => setDialogBrevity(value)}
                className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  dialogBrevity === value
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dialog Max Tokens */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-200">Batas token respons Dialog Mode</p>
            <span className="font-mono text-[10px] tabular-nums text-[#c8f16b]">
              {dialogMaxTokens} tokens
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">
            Alokasi ruang token untuk penalaran internal model (&lt;think&gt;) dan jawaban lisan agar tidak terpotong di tengah kalimat.
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            {[1024, 2048, 4096].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setDialogMaxTokens(size)}
                className={`flex-1 rounded-lg py-1.5 font-mono text-[10px] font-medium tabular-nums transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  dialogMaxTokens === size
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <SettingRow
          title="Deteksi hening (VAD Auto-stop)"
          description="Berhenti merekam otomatis ketika Anda diam sejenak."
          checked={vadAutoStop}
          onChange={setVadAutoStop}
        />

        <SettingRow
          title="Interupsi suara (Barge-in)"
          description="Hentikan suara asisten seketika saat Anda mulai berbicara."
          checked={bargeIn}
          onChange={setBargeIn}
        />

        {/* STT Model Radio Group */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Pengenalan suara (STT)</p>
          <div role="radiogroup" aria-label="Model pengenalan suara" className="mt-2.5 space-y-1.5">
            {sttOptions.map((option) => (
              <div
                key={option.key}
                role="radio"
                aria-checked={sttModel === option.key}
                tabIndex={installed[option.modelKey] ? 0 : -1}
                onKeyDown={(event) => {
                  if (installed[option.modelKey] && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setSttModel(option.key);
                  }
                }}
                onClick={() => installed[option.modelKey] && setSttModel(option.key)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  sttModel === option.key
                    ? "border-[#c8f16b]/50 bg-[#c8f16b]/[0.08]"
                    : "border-white/[.06] hover:bg-white/[.03]"
                } ${!installed[option.modelKey] ? "opacity-60" : ""}`}
              >
                <div>
                  <p className="text-[10px] font-medium text-zinc-200">
                    {option.label}
                    {sttModel === option.key && installed[option.modelKey] ? " · aktif" : ""}
                  </p>
                  <p className="text-[9px] font-mono tabular-nums text-zinc-400">{option.detail}</p>
                </div>
                <InstallChip
                  keys={[option.modelKey]}
                  installed={installed}
                  onInstall={(keys) => void installGroup(keys)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* TTS Voice Radio Group */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Suara jawaban (TTS)</p>
          <div role="radiogroup" aria-label="Suara jawaban" className="mt-2.5 space-y-1.5">
            {ttsOptions.map((option) => {
              const optionReady = option.keys.every((key) => installed[key]);
              return (
                <div
                  key={option.key}
                  role="radio"
                  aria-checked={ttsVoice === option.key}
                  tabIndex={optionReady ? 0 : -1}
                  onKeyDown={(event) => {
                    if (optionReady && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setTtsVoice(option.key);
                    }
                  }}
                  onClick={() => optionReady && setTtsVoice(option.key)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                    ttsVoice === option.key
                      ? "border-[#c8f16b]/50 bg-[#c8f16b]/[0.08]"
                      : "border-white/[.06] hover:bg-white/[.03]"
                  } ${!optionReady ? "opacity-60" : ""}`}
                >
                  <div>
                    <p className="text-[10px] font-medium text-zinc-200">
                      {option.label}
                      {ttsVoice === option.key && optionReady ? " · aktif" : ""}
                    </p>
                    <p className="text-[9px] font-mono tabular-nums text-zinc-400">{option.detail}</p>
                  </div>
                  <InstallChip
                    keys={option.keys}
                    installed={installed}
                    onInstall={(keys) => void installGroup(keys)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <SettingRow
          title="Auto-speak"
          description={
            ttsReady
              ? "Bacakan otomatis setiap respons AI selesai."
              : "Pasang suara jawaban yang dipilih untuk mengaktifkan auto-speak."
          }
          checked={autoSpeak}
          onChange={setAutoSpeak}
          disabled={!ttsReady && !autoSpeak}
        />

        {/* Speech Speed */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Kecepatan bicara</p>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {speedOptions.map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setSpeechSpeed(value)}
                className={`rounded-lg px-2 py-1.5 font-mono text-[10px] font-medium tabular-nums transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  Math.abs(speechSpeed - value) < 0.01
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {installError && (
          <div className="rounded-lg border border-[#f07167]/30 bg-[#f07167]/10 px-3 py-2 text-[10px] leading-relaxed whitespace-pre-line text-[#f4aca5]">
            {installError}
          </div>
        )}

        <p className="px-1 pt-1 text-[10px] leading-relaxed text-zinc-400">
          <Icon name="shield" className="mr-1 inline h-3 w-3 -translate-y-px" />
          Pemrosesan STT &amp; Piper berjalan lokal (offline). Suara Natural (Edge-TTS) membutuhkan Python dengan paket edge-tts (jalankan: pip install edge-tts di terminal).
        </p>
      </div>
    </section>
  );
}

