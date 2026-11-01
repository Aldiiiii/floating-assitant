import { useEffect, useState } from "react";
import { mcpLocalCheck, modelStatus, searchKeysGet, searchKeysSet } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import {
  useVoiceStore,
  type MicSensitivity,
  type SttLanguage,
  type SttModel,
  type TtsVoice,
  type VoiceMode,
} from "../stores/voice";
import { Icon } from "./Icon";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f16b]/60 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-[#c8f16b]" : "bg-white/[.15]"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full transition-all ${
          checked ? "left-6 bg-[#141413] shadow-sm" : "left-1 bg-white"
        }`}
      />
    </button>
  );
}

interface SettingRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: SettingRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3 transition-colors ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-zinc-200">{title}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

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

function VoiceSection() {
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
        {/* Input Device Selection */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-zinc-200">Perangkat microphone</p>
            <button
              type="button"
              onClick={() => void loadDevices()}
              aria-label="Muat ulang daftar microphone"
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
            <p className="text-[11px] font-medium text-zinc-200">Perangkat speaker</p>
            <button
              type="button"
              onClick={() => void loadOutputDevices()}
              aria-label="Muat ulang daftar speaker"
              title="Muat ulang daftar perangkat"
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

        {/* Transcription Language */}
        <div className="rounded-xl border border-white/[.07] bg-white/[.025] px-3.5 py-3">
          <p className="text-[11px] font-medium text-zinc-200">Bahasa transkripsi</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
            Bahasa yang didengar Whisper; tidak membatasi bahasa jawaban teks AI.
          </p>
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

        <SettingRow
          title="Deteksi hening (VAD Auto-stop)"
          description="Berhenti merekam otomatis ketika Anda diam selama >1.2 detik."
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
          Pemrosesan STT &amp; Piper berjalan lokal; suara Natural (Edge-TTS) menggunakan neural voice gratis tanpa kuota.
        </p>
      </div>
    </section>
  );
}

function KeyField({ account, label, placeholder }: { account: string; label: string; placeholder: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void searchKeysGet().then((keys) => {
      if (account === "brave-api-key") setValue(keys.brave ?? "");
      else setValue(keys.tavily ?? "");
    });
  }, [account]);

  const handleSave = () => {
    setSaving(true);
    setSaveError(null);
    void searchKeysSet(
      account === "brave-api-key" ? value : null,
      account === "tavily-api-key" ? value : null
    )
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch((error) => setSaveError(String(error)))
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <label className="block text-[10px] font-medium text-zinc-400">{label}</label>
      <div className="mt-1 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 font-mono text-[11px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
        />
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className={`shrink-0 rounded-lg px-3 text-[10px] font-semibold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:opacity-50 ${
            saved
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/[.08] text-zinc-200 hover:bg-white/[.15]"
          }`}
        >
          {saving ? "…" : saved ? "✓" : "Simpan"}
        </button>
      </div>
      {saveError && <p className="mt-1 text-[9px] leading-relaxed text-[#f4aca5]">{saveError}</p>}
    </div>
  );
}

function GenerationSection() {
  const systemPrompt = useSettingsStore((s) => s.systemPrompt);
  const setSystemPrompt = useSettingsStore((s) => s.setSystemPrompt);
  const resetSystemPrompt = useSettingsStore((s) => s.resetSystemPrompt);
  const temperature = useSettingsStore((s) => s.temperature);
  const topP = useSettingsStore((s) => s.topP);
  const maxTokens = useSettingsStore((s) => s.maxTokens);
  const setGeneration = useSettingsStore((s) => s.setGeneration);
  const genPreset = useSettingsStore((s) => s.genPreset);
  const setGenPreset = useSettingsStore((s) => s.setGenPreset);
  const contextTokens = useSettingsStore((s) => s.contextTokens);
  const setContextTokens = useSettingsStore((s) => s.setContextTokens);

  const presets = [
    ["presisi", "Presisi"],
    ["seimbang", "Seimbang"],
    ["kreatif", "Kreatif"],
    ["kustom", "Kustom"],
  ] as const;

  const sliders = [
    {
      label: "Temperature",
      value: temperature,
      min: 0,
      max: 1.5,
      step: 0.05,
      onChange: (v: number) => {
        setGenPreset("kustom");
        setGeneration({ temperature: v });
      },
    },
    {
      label: "Top P",
      value: topP,
      min: 0.1,
      max: 1,
      step: 0.05,
      onChange: (v: number) => {
        setGenPreset("kustom");
        setGeneration({ topP: v });
      },
    },
  ];

  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
        Gaya jawaban
      </h3>
      <div className="space-y-2 rounded-xl border border-white/[.07] bg-white/[.025] p-3.5">
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setGenPreset(value)}
              className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                genPreset === value
                  ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                  : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-zinc-400">
          Preset mengatur temperature dan Top P. Respons berbasis web otomatis memakai sampling lebih presisi.
        </p>

        <details
          open={genPreset === "kustom" || undefined}
          className="rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2.5"
        >
          <summary className="cursor-pointer text-[10px] font-medium text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/50">
            System prompt &amp; sampling lanjutan
          </summary>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-zinc-400">System prompt aktif</p>
              <button
                type="button"
                onClick={resetSystemPrompt}
                title="Kembalikan ke bawaan"
                className="flex items-center gap-1 rounded-md bg-white/[.06] px-2 py-1 text-[9px] text-zinc-300 transition-colors hover:bg-white/[.12] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
              >
                <Icon name="refresh" className="h-3 w-3" />
                Reset
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full resize-y rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] leading-relaxed text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            />
            {sliders.map((slider) => (
              <div key={slider.label}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-zinc-400">{slider.label}</p>
                  <span className="font-mono text-[10px] tabular-nums text-[#c8f16b]">
                    {slider.value.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={slider.value}
                  onChange={(event) => slider.onChange(Number(event.target.value))}
                  className="mt-1 w-full accent-[#c8f16b] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
                />
              </div>
            ))}
          </div>
        </details>

        {/* History token limit */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-[10px] font-medium text-zinc-300">Batas riwayat yang dikirim</p>
            <p className="text-[9px] text-zinc-500">Tidak mengubah context length di LM Studio.</p>
          </div>
          <div className="flex gap-1">
            {[2048, 4096, 8192, 16384, 32768].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setContextTokens(size)}
                className={`rounded-lg px-2 py-1 font-mono text-[9px] font-semibold tabular-nums transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  contextTokens === size
                    ? "bg-[#c8f16b] text-[#141413] shadow-sm font-semibold"
                    : "bg-white/[.05] text-zinc-300 hover:bg-white/[.1]"
                }`}
              >
                {size >= 1024 ? `${size / 1024}k` : size}
              </button>
            ))}
          </div>
        </div>

        {/* Max Tokens Response */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[10px] font-medium text-zinc-300">Max tokens respons</p>
          <input
            type="number"
            min={128}
            max={8192}
            step={64}
            value={maxTokens}
            onChange={(event) =>
              setGeneration({
                maxTokens: Math.max(128, Math.min(8192, Number(event.target.value) || 1024)),
              })
            }
            className="w-24 rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-1.5 text-right font-mono text-[11px] tabular-nums text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          />
        </div>
      </div>
    </section>
  );
}

function WebSearchSection() {
  const enabled = useSettingsStore((s) => s.webSearchEnabled);
  const setEnabled = useSettingsStore((s) => s.setWebSearchEnabled);
  const provider = useSettingsStore((s) => s.searchProvider);
  const setProvider = useSettingsStore((s) => s.setSearchProvider);

  const mcpIndexPath = useSettingsStore((s) => s.mcpIndexPath);
  const mcpNode = useSettingsStore((s) => s.mcpNode);
  const mcpFullContent = useSettingsStore((s) => s.mcpFullContent);
  const setMcpConfig = useSettingsStore((s) => s.setMcpConfig);
  const [mcpChecking, setMcpChecking] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);

  const checkMcp = () => {
    if (!mcpIndexPath.trim()) {
      setMcpStatus("Path belum diisi.");
      return;
    }
    setMcpChecking(true);
    setMcpStatus(null);
    void mcpLocalCheck(mcpIndexPath.trim(), mcpNode.trim() || "node")
      .then((res) => setMcpStatus(`OK · ${res.tools} tool tersedia`))
      .catch((e) => setMcpStatus(String(e)))
      .finally(() => setMcpChecking(false));
  };

  const providers: {
    key: "bing" | "google" | "ddg" | "brave" | "tavily";
    label: string;
    detail: string;
  }[] = [
    { key: "bing", label: "Bing (Gratis)", detail: "Tanpa key · lancar di Indonesia" },
    { key: "ddg", label: "DuckDuckGo", detail: "Tanpa key · sering diblokir ISP" },
    { key: "brave", label: "Brave", detail: "Butuh API key" },
    { key: "tavily", label: "Tavily", detail: "Butuh API key" },
  ];

  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
        Pencarian web
      </h3>
      <div className="space-y-2 rounded-xl border border-white/[.07] bg-white/[.025] p-3.5">
        <SettingRow
          title="Izinkan pencarian web"
          description="Asisten boleh mencari data terbaru saat pertanyaan memerlukannya."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="rounded-xl border border-white/[.06] bg-white/[.02] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-zinc-200">Web Search MCP (Lokal)</p>
            <button
              type="button"
              onClick={checkMcp}
              disabled={mcpChecking}
              title="Cek server MCP"
              className="rounded-lg bg-white/[.08] px-2.5 py-1 text-[9px] font-medium text-zinc-200 transition-colors hover:bg-white/[.15] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:opacity-40"
            >
              {mcpChecking ? "Memeriksa…" : "Cek"}
            </button>
          </div>
          <p className="mb-2 mt-1 text-[10px] leading-relaxed text-zinc-400">
            Dipakai lebih dahulu untuk pencarian web umum dengan fallback otomatis ke provider di bawah.
          </p>
          <input
            value={mcpIndexPath}
            onChange={(event) => setMcpConfig({ path: event.target.value })}
            placeholder="…/web-search-mcp/dist/index.js"
            spellCheck={false}
            className="w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 font-mono text-[10px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <input
              value={mcpNode}
              onChange={(event) => setMcpConfig({ node: event.target.value })}
              placeholder="node"
              spellCheck={false}
              className="w-28 rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-1.5 font-mono text-[10px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            />
            <Toggle
              checked={mcpFullContent}
              onChange={(v) => setMcpConfig({ full: v })}
              label="Ekstrak isi lengkap halaman MCP"
            />
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
            Ekstrak isi halaman pada deep_search. Nonaktif memakai ringkasan hasil agar lebih cepat.
          </p>
          {mcpStatus && (
            <p
              className={`mt-2 font-mono text-[10px] leading-relaxed ${
                mcpStatus.startsWith("OK") ? "text-emerald-400" : "text-[#f4aca5]"
              }`}
            >
              {mcpStatus}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium text-zinc-400">
            Provider fallback (saat MCP tidak aktif)
          </p>
          <div
            className={`grid grid-cols-2 gap-1.5 transition-opacity sm:grid-cols-4 ${
              enabled ? "" : "pointer-events-none opacity-40"
            }`}
          >
            {providers.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setProvider(item.key)}
                className={`rounded-lg px-2.5 py-2 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 ${
                  provider === item.key
                    ? "bg-[#c8f16b]/[0.1] ring-1 ring-[#c8f16b]/60 shadow-sm"
                    : "bg-white/[.05] hover:bg-white/[.08]"
                }`}
              >
                <p
                  className={`text-[10px] font-medium ${
                    provider === item.key ? "text-[#c8f16b] font-semibold" : "text-zinc-200"
                  }`}
                >
                  {item.label}
                </p>
                <p className="text-[9px] text-zinc-400">{item.detail}</p>
              </button>
            ))}
          </div>
        </div>

        {enabled && provider === "brave" && (
          <KeyField account="brave-api-key" label="Brave API key" placeholder="brv-…" />
        )}
        {enabled && provider === "tavily" && (
          <KeyField account="tavily-api-key" label="Tavily API key" placeholder="tvly-…" />
        )}

        <p className="text-[10px] leading-relaxed text-zinc-400">
          <Icon name="shield" className="mr-1 inline h-3 w-3 -translate-y-px" />
          API key disimpan di OS keychain. Kosongkan kolom lalu Simpan untuk menghapus key provider tersebut.
        </p>
      </div>
    </section>
  );
}

export function SettingsPanel() {
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const model = useSettingsStore((s) => s.model);
  const models = useSettingsStore((s) => s.models);
  const status = useSettingsStore((s) => s.status);
  const error = useSettingsStore((s) => s.error);
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
  const startMinimized = useSettingsStore((s) => s.startMinimized);
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl);
  const setModel = useSettingsStore((s) => s.setModel);
  const testConnection = useSettingsStore((s) => s.testConnection);
  const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop);
  const setStartMinimized = useSettingsStore((s) => s.setStartMinimized);
  const clearAll = useChatStore((s) => s.clearAll);

  const [urlDraft, setUrlDraft] = useState(baseUrl);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setUrlDraft(baseUrl), [baseUrl]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const statusColor =
    status === "connected"
      ? "bg-[#c8f16b]"
      : status === "checking"
      ? "animate-pulse bg-amber-400"
      : "bg-rose-500";

  return (
    <div className="relative flex-1 overflow-y-auto bg-[#141413] px-4 py-4 text-[#e4e3dd]">
      {/* Clean Header */}
      <div className="mb-4 flex items-center justify-between border-b border-white/[.06] pb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Pengaturan</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">Preferensi server AI, suara, dan aplikasi</p>
        </div>
      </div>

      {/* AI Server */}
      <section>
        <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
          Koneksi AI
        </h3>
        <div className="space-y-2 rounded-xl border border-white/[.07] bg-white/[.025] p-3.5">
          <label className="block text-[10px] font-medium text-zinc-300">Base URL</label>
          <input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={() => {
              const value = urlDraft.trim();
              if (value && value !== baseUrl) {
                setBaseUrl(value);
                void testConnection();
              } else if (!value) {
                setUrlDraft(baseUrl);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            className="w-full rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 font-mono text-[11px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
            placeholder="http://localhost:1234/v1"
          />

          <label className="mt-3 block text-[10px] font-medium text-zinc-300">Model aktif</label>
          <div className="flex gap-2">
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={models.length === 0}
              className="min-w-0 flex-1 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-zinc-100 outline-none transition-colors focus:border-[#c8f16b]/60 focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:text-zinc-600"
            >
              {models.length === 0 ? (
                <option value="">Belum ada model</option>
              ) : (
                models.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={status === "checking"}
              title="Muat ulang model"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-zinc-300 transition-colors hover:bg-white/[.1] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:opacity-40"
            >
              <Icon name="refresh" className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] text-zinc-300">
              <span className={`h-2 w-2 rounded-full ${statusColor}`} />
              {status === "connected"
                ? "Terhubung ke server"
                : status === "checking"
                ? "Memeriksa koneksi…"
                : "Belum terhubung"}
            </span>
            <button
              type="button"
              onClick={() => void testConnection()}
              disabled={status === "checking"}
              className="rounded-lg bg-white/[.08] px-3 py-1.5 text-[10px] font-semibold text-zinc-200 transition-colors hover:bg-white/[.15] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60 disabled:opacity-50"
            >
              Uji koneksi
            </button>
          </div>

          {status === "offline" && error && (
            <p className="rounded-lg bg-rose-500/[.1] px-3 py-2 text-[10px] leading-relaxed text-rose-200">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* Tampilan */}
      <section className="mt-6">
        <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
          Tampilan
        </h3>
        <div className="space-y-2">
          <SettingRow
            title="Selalu di atas"
            description="Jaga Astra tetap di atas jendela aplikasi lain."
            checked={alwaysOnTop}
            onChange={setAlwaysOnTop}
          />
          <SettingRow
            title="Mulai tersembunyi di tray"
            description="Jangan buka jendela saat startup; buka lewat tray atau shortcut Alt+Space."
            checked={startMinimized}
            onChange={setStartMinimized}
          />
        </div>
      </section>

      <VoiceSection />
      <GenerationSection />
      <WebSearchSection />

      {/* Penyimpanan */}
      <section className="mt-6">
        <h3 className="mb-2.5 text-xs font-semibold text-zinc-300">
          Penyimpanan
        </h3>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3.5">
          <div>
            <p className="text-[11px] font-medium text-zinc-200">Riwayat percakapan</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              Hapus seluruh riwayat percakapan yang tersimpan di SQLite lokal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirming) {
                void clearAll();
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-400/60 ${
              confirming
                ? "bg-rose-500 text-white shadow-sm"
                : "bg-white/[.07] text-zinc-300 hover:bg-rose-500/15 hover:text-rose-200"
            }`}
          >
            {confirming ? "Konfirmasi hapus" : "Hapus"}
          </button>
        </div>
      </section>
    </div>
  );
}
