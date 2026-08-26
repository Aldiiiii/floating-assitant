import { useEffect, useState } from "react";
import { mcpLocalCheck, modelStatus, searchKeysGet, searchKeysSet } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { useVoiceStore, type SttLanguage, type SttModel, type TtsVoice, type VoiceMode } from "../stores/voice";
import { Icon } from "./Icon";

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) { return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "bg-[#c8f16b]" : "bg-slate-700"}`}><span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>; }
function SettingRow({ title, description, checked, onChange, disabled = false }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <div className={`flex items-center justify-between gap-4 rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3 ${disabled ? "opacity-60" : ""}`}><div className="min-w-0"><p className="text-[11px] font-medium text-slate-200">{title}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{description}</p></div><Toggle checked={checked} onChange={onChange} label={title} disabled={disabled} /></div>; }

const PIPER_BIN_KEY = navigator.userAgent.includes("Windows") ? "piper-bin-windows" : "piper-bin-linux";

function InstallChip({ keys, installed, onInstall }: { keys: string[]; installed: Record<string, boolean>; onInstall: (keys: string[]) => void }) {
  const downloads = useVoiceStore((s) => s.downloads);
  const activeKey = keys.find((k) => downloads[k] !== undefined);
  if (activeKey !== undefined) {
    const progress = downloads[activeKey];
    return <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-400/10 px-2 py-1 text-[9px] text-indigo-200">{progress === null ? <>Mengunduh…</> : <>{Math.round(progress * 100)}%</>}</span>;
  }
  const allInstalled = keys.every((k) => installed[k]);
  if (allInstalled) return <span className="shrink-0 rounded-lg bg-emerald-400/10 px-2 py-1 text-[9px] font-medium text-emerald-300">Terpasang</span>;
  return <button onClick={() => onInstall(keys)} className="shrink-0 rounded-lg bg-white/[.07] px-2.5 py-1 text-[9px] font-semibold text-slate-200 hover:bg-indigo-400/20 hover:text-indigo-100">Unduh</button>;
}

function VoiceSection() {
  const micEnabled = useVoiceStore((s) => s.micEnabled); const setMicEnabled = useVoiceStore((s) => s.setMicEnabled);
  const mode = useVoiceStore((s) => s.mode); const setMode = useVoiceStore((s) => s.setMode);
  const sttModel = useVoiceStore((s) => s.sttModel); const setSttModel = useVoiceStore((s) => s.setSttModel);
  const autoSpeak = useVoiceStore((s) => s.autoSpeak); const setAutoSpeak = useVoiceStore((s) => s.setAutoSpeak);
  const ttsVoice = useVoiceStore((s) => s.ttsVoice); const setTtsVoice = useVoiceStore((s) => s.setTtsVoice);
  const language = useVoiceStore((s) => s.language); const setLanguage = useVoiceStore((s) => s.setLanguage);
  const speechSpeed = useVoiceStore((s) => s.speechSpeed); const setSpeechSpeed = useVoiceStore((s) => s.setSpeechSpeed);
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

  useEffect(() => { void (async () => { const keys = ["whisper-base", "whisper-small", "whisper-medium", PIPER_BIN_KEY, "piper-voice-id", "piper-voice-id-config", "piper-voice-en", "piper-voice-en-config"]; const next: Record<string, boolean> = {}; for (const key of keys) { try { next[key] = (await modelStatus(key)).installed; } catch { next[key] = false; } } setInstalled((prev) => ({ ...prev, ...next })); })(); }, []);

  const installGroup = async (keys: string[]) => {
    setInstallError(null);
    for (const key of keys) {
      try {
        if (!(await modelStatus(key)).installed) await downloadModel(key);
      } catch (e) {
        setInstallError(String(e));
        await refresh(keys);
        return;
      }
    }
    await refresh(keys);
  };

  const refresh = async (keys: string[]) => {
    const next: Record<string, boolean> = {};
    for (const key of keys) { try { next[key] = (await modelStatus(key)).installed; } catch { next[key] = false; } }
    setInstalled((prev) => ({ ...prev, ...next }));
  };

  const sttOptions: { key: SttModel; modelKey: string; label: string; detail: string }[] = [
    { key: "whisper-base", modelKey: "whisper-base", label: "Cepat", detail: "Whisper Base · ±148 MB" },
    { key: "whisper-small", modelKey: "whisper-small", label: "Akurat", detail: "Whisper Small · ±490 MB" },
    { key: "whisper-medium", modelKey: "whisper-medium", label: "Paling akurat", detail: "Whisper Medium · ±1,5 GB" },
  ];
  const ttsOptions: { key: TtsVoice; keys: string[]; label: string; detail: string }[] = [
    { key: "id", keys: [PIPER_BIN_KEY, "piper-voice-id", "piper-voice-id-config"], label: "Bahasa Indonesia", detail: "Piper News · ±63 MB" },
    { key: "en", keys: [PIPER_BIN_KEY, "piper-voice-en", "piper-voice-en-config"], label: "English", detail: "Piper Lessac · ±63 MB" },
  ];
  const activeTts = ttsOptions.find((option) => option.key === ttsVoice);
  const ttsReady = Boolean(activeTts?.keys.every((key) => installed[key]));

  return <section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Voice</p><div className="space-y-2">
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-slate-200">Perangkat microphone</p><button onClick={() => void loadDevices()} aria-label="Muat ulang daftar microphone" title="Muat ulang daftar perangkat" className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-slate-300 hover:bg-white/[.1]"><Icon name="refresh" className="h-3 w-3" /></button></div><select value={micDevice ?? ""} onChange={(event) => setMicDevice(event.target.value || null)} disabled={devices.length === 0} className="mt-2 w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50 disabled:text-slate-600">{devices.length === 0 ? <option value="">Tidak ada microphone terdeteksi</option> : <><option value="">Default sistem</option>{devices.map((name) => <option key={name} value={name}>{name}</option>)}</>}</select></div>
    <SettingRow title="Microphone" description="Izinkan assistant mendengar suaramu saat tombol mic dipakai." checked={micEnabled} onChange={setMicEnabled} />
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-slate-200">Perangkat speaker</p><button onClick={() => void loadOutputDevices()} aria-label="Muat ulang daftar speaker" title="Muat ulang daftar perangkat" className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-slate-300 hover:bg-white/[.1]"><Icon name="refresh" className="h-3 w-3" /></button></div><select value={speakerDevice ?? ""} onChange={(event) => setSpeakerDevice(event.target.value || null)} disabled={outputDevices.length === 0} className="mt-2 w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50 disabled:text-slate-600">{outputDevices.length === 0 ? <option value="">Tidak ada speaker terdeteksi</option> : <><option value="">Default sistem</option>{outputDevices.map((name) => <option key={name} value={name}>{name}</option>)}</>}</select></div>
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Bahasa transkripsi</p><p className="mt-1 text-[9px] text-slate-500">Bahasa yang didengar Whisper; tidak mengubah bahasa jawaban AI.</p><div className="mt-2 grid grid-cols-3 gap-1.5">{([["id", "Indonesia"], ["en", "English"], ["auto", "Otomatis"]] as [SttLanguage, string][]).map(([value, label]) => <button key={value} aria-pressed={language === value} onClick={() => setLanguage(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${language === value ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{label}</button>)}</div></div>
        <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Cara berbicara</p><div className="mt-2 grid grid-cols-2 gap-1.5">{([["ptt", "Tahan (Push-to-talk)"], ["toggle", "Klik (Toggle)"]] as [VoiceMode, string][]).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${mode === value ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{label}</button>)}</div></div>
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Pengenalan suara</p><div role="radiogroup" aria-label="Model pengenalan suara" className="mt-2 space-y-1.5">{sttOptions.map((option) => <div key={option.key} role="radio" aria-checked={sttModel === option.key} tabIndex={installed[option.modelKey] ? 0 : -1} onKeyDown={(event) => { if (installed[option.modelKey] && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSttModel(option.key); } }} onClick={() => installed[option.modelKey] && setSttModel(option.key)} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${sttModel === option.key ? "border-[#c8f16b]/50 bg-[#c8f16b]/[.07]" : "border-white/[.06]"} ${!installed[option.modelKey] && "opacity-60"}`}><div><p className="text-[10px] font-medium text-slate-200">{option.label}{sttModel === option.key && installed[option.modelKey] ? " · aktif" : ""}</p><p className="text-[9px] text-slate-500">{option.detail}</p></div><InstallChip keys={[option.modelKey]} installed={installed} onInstall={(keys) => void installGroup(keys)} /></div>)}</div></div>
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Suara jawaban</p><div role="radiogroup" aria-label="Suara jawaban" className="mt-2 space-y-1.5">{ttsOptions.map((option) => { const optionReady = option.keys.every((key) => installed[key]); return <div key={option.key} role="radio" aria-checked={ttsVoice === option.key} tabIndex={optionReady ? 0 : -1} onKeyDown={(event) => { if (optionReady && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setTtsVoice(option.key); } }} onClick={() => optionReady && setTtsVoice(option.key)} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${ttsVoice === option.key ? "border-[#c8f16b]/50 bg-[#c8f16b]/[.07]" : "border-white/[.06]"} ${!optionReady ? "opacity-60" : ""}`}><div><p className="text-[10px] font-medium text-slate-200">{option.label}{ttsVoice === option.key && optionReady ? " · aktif" : ""}</p><p className="text-[9px] text-slate-500">{option.detail}</p></div><InstallChip keys={option.keys} installed={installed} onInstall={(keys) => void installGroup(keys)} /></div>; })}</div></div>
    <SettingRow title="Auto-speak" description={ttsReady ? "Bacakan otomatis setiap jawaban AI selesai." : "Pasang suara jawaban yang dipilih untuk mengaktifkan auto-speak."} checked={autoSpeak} onChange={setAutoSpeak} disabled={!ttsReady && !autoSpeak} />
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Kecepatan bicara</p><div className="mt-2 grid grid-cols-3 gap-1.5">{([[0.85, "Lambat"], [1, "Normal"], [1.15, "Cepat"]] as [number, string][]).map(([value, label]) => <button key={label} onClick={() => setSpeechSpeed(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${Math.abs(speechSpeed - value) < 0.01 ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{label}</button>)}</div></div>
    {installError && <div className="rounded-lg border border-[#f07167]/25 bg-[#f07167]/10 px-2.5 py-2 text-[10px] leading-relaxed whitespace-pre-line text-[#f4aca5]">{installError}</div>}
    <p className="px-1 pt-1 text-[9px] leading-relaxed text-slate-600"><Icon name="shield" className="mr-1 inline h-3 w-3 -translate-y-px" />Semua pemrosesan suara berjalan lokal di perangkat ini.</p>
  </div></section>;
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

  return <div>
    <label className="block text-[10px] font-medium text-slate-400">{label}</label>
    <div className="mt-1 flex gap-2">
      <input type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} spellCheck={false} className="min-w-0 flex-1 rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50" />
      <button disabled={saving} onClick={() => { setSaving(true); setSaveError(null); void searchKeysSet(account === "brave-api-key" ? value : null, account === "tavily-api-key" ? value : null).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }).catch((error) => setSaveError(String(error))).finally(() => setSaving(false)); }} className={`shrink-0 rounded-xl px-3 text-[10px] font-semibold disabled:opacity-50 ${saved ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[.07] text-slate-200 hover:bg-white/[.12]"}`}>{saving ? "…" : saved ? "✓" : "Simpan"}</button>
    </div>
    {saveError && <p className="mt-1 text-[9px] leading-relaxed text-[#f4aca5]">{saveError}</p>}
  </div>;
}

function GenerationSection() {
  const systemPrompt = useSettingsStore((s) => s.systemPrompt); const setSystemPrompt = useSettingsStore((s) => s.setSystemPrompt); const resetSystemPrompt = useSettingsStore((s) => s.resetSystemPrompt);
  const temperature = useSettingsStore((s) => s.temperature); const topP = useSettingsStore((s) => s.topP); const maxTokens = useSettingsStore((s) => s.maxTokens); const setGeneration = useSettingsStore((s) => s.setGeneration);
  const genPreset = useSettingsStore((s) => s.genPreset); const setGenPreset = useSettingsStore((s) => s.setGenPreset);
  const contextTokens = useSettingsStore((s) => s.contextTokens); const setContextTokens = useSettingsStore((s) => s.setContextTokens);

  const sliders: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }[] = [
    { label: "Temperature", value: temperature, min: 0, max: 1.5, step: 0.05, onChange: (v) => { setGenPreset("kustom"); setGeneration({ temperature: v }); } },
    { label: "Top P", value: topP, min: 0.1, max: 1, step: 0.05, onChange: (v) => { setGenPreset("kustom"); setGeneration({ topP: v }); } },
  ];

  return <section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Gaya jawaban</p><div className="space-y-2 rounded-2xl border border-white/[.07] bg-[#0b0f1e]/45 p-3">
    <div className="grid grid-cols-4 gap-1.5">{([["presisi", "Presisi"], ["seimbang", "Seimbang"], ["kreatif", "Kreatif"], ["kustom", "Kustom"]] as const).map(([value, label]) => <button key={value} onClick={() => setGenPreset(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${genPreset === value ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{label}</button>)}</div>
    <p className="text-[9px] leading-relaxed text-slate-500">Preset mengatur temperature dan Top P. Respons berbasis web otomatis memakai sampling lebih presisi.</p>
    <details open={genPreset === "kustom" || undefined} className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium text-slate-300">System prompt &amp; sampling lanjutan</summary>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between"><p className="text-[10px] font-medium text-slate-400">System prompt aktif</p><button onClick={resetSystemPrompt} title="Kembalikan ke bawaan" className="flex items-center gap-1 rounded-lg bg-white/[.06] px-2 py-1 text-[9px] text-slate-300 hover:bg-white/[.12]"><Icon name="refresh" className="h-3 w-3" />Reset</button></div>
        <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} rows={6} spellCheck={false} className="w-full resize-y rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] leading-relaxed text-white outline-none focus:border-indigo-300/50" />
        {sliders.map((slider) => <div key={slider.label}><div className="flex items-center justify-between"><p className="text-[10px] font-medium text-slate-400">{slider.label}</p><span className="text-[10px] tabular-nums text-[#c8f16b]">{slider.value.toFixed(2)}</span></div><input type="range" min={slider.min} max={slider.max} step={slider.step} value={slider.value} onChange={(event) => slider.onChange(Number(event.target.value))} className="mt-1 w-full accent-[#c8f16b]" /></div>)}
      </div>
    </details>
    <div className="flex items-center justify-between gap-3 pt-1"><div><p className="text-[10px] font-medium text-slate-400">Batas riwayat yang dikirim</p><p className="mt-0.5 text-[9px] text-slate-600">Tidak mengubah context length di LM Studio.</p></div><div className="flex gap-1">{[2048, 4096, 8192, 16384, 32768].map((size) => <button key={size} onClick={() => setContextTokens(size)} className={`rounded-lg px-2 py-1 text-[9px] font-semibold transition-colors ${contextTokens === size ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{size >= 1024 ? `${size / 1024}k` : size}</button>)}</div></div>
    <div className="flex items-center justify-between gap-3 pt-1"><p className="text-[10px] font-medium text-slate-400">Max tokens respons</p><input type="number" min={128} max={8192} step={64} value={maxTokens} onChange={(event) => setGeneration({ maxTokens: Math.max(128, Math.min(8192, Number(event.target.value) || 1024)) })} className="w-24 rounded-lg border border-white/[.08] bg-white/[.04] px-2 py-1.5 text-right text-[11px] tabular-nums text-white outline-none focus:border-indigo-300/50" /></div>
  </div></section>;
}

function WebSearchSection() {
  const enabled = useSettingsStore((s) => s.webSearchEnabled); const setEnabled = useSettingsStore((s) => s.setWebSearchEnabled);
  const provider = useSettingsStore((s) => s.searchProvider); const setProvider = useSettingsStore((s) => s.setSearchProvider);

  const mcpIndexPath = useSettingsStore((s) => s.mcpIndexPath);
  const mcpNode = useSettingsStore((s) => s.mcpNode);
  const mcpFullContent = useSettingsStore((s) => s.mcpFullContent);
  const setMcpConfig = useSettingsStore((s) => s.setMcpConfig);
  const [mcpChecking, setMcpChecking] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);

  const checkMcp = () => {
    if (!mcpIndexPath.trim()) { setMcpStatus("Path belum diisi."); return; }
    setMcpChecking(true); setMcpStatus(null);
    void mcpLocalCheck(mcpIndexPath.trim(), mcpNode.trim() || "node")
      .then((res) => setMcpStatus(`OK · ${res.tools} tool tersedia`))
      .catch((e) => setMcpStatus(String(e)))
      .finally(() => setMcpChecking(false));
  };

  const providers: { key: "ddg" | "brave" | "tavily"; label: string; detail: string }[] = [
    { key: "ddg", label: "DuckDuckGo", detail: "Tanpa key · kadang diblokir ISP" },
    { key: "brave", label: "Brave", detail: "Butuh API key gratis" },
    { key: "tavily", label: "Tavily", detail: "Butuh API key" },
  ];

  return <section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Pencarian web</p><div className="space-y-2 rounded-2xl border border-white/[.07] bg-[#0b0f1e]/45 p-3">
    <SettingRow title="Izinkan pencarian web" description="Assistant boleh mencari data terbaru saat pertanyaan memerlukannya. Nonaktif = tanpa browsing." checked={enabled} onChange={setEnabled} />
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3">
      <div className="flex items-center justify-between"><p className="text-[11px] font-medium text-slate-200">Web Search MCP (Lokal)</p><button onClick={checkMcp} disabled={mcpChecking} title="Cek kesehatan server" className="rounded-lg bg-white/[.07] px-2 py-1 text-[9px] font-semibold text-slate-200 hover:bg-white/[.12] disabled:opacity-40">{mcpChecking ? "Memeriksa…" : "Cek"}</button></div>
      <p className="mb-2 mt-1 text-[9px] leading-relaxed text-slate-500">Dipakai lebih dahulu untuk pencarian web umum. Berita dan kurs memakai sumber terstruktur khusus, lalu MCP sebagai fallback. Butuh Node.js &amp; setup awal.</p>
      <input value={mcpIndexPath} onChange={(event) => setMcpConfig({ path: event.target.value })} placeholder="…/web-search-mcp/dist/index.js" spellCheck={false} className="w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[10px] text-white outline-none focus:border-indigo-300/50" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <input value={mcpNode} onChange={(event) => setMcpConfig({ node: event.target.value })} placeholder="node" spellCheck={false} className="w-28 rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-indigo-300/50" />
        <Toggle checked={mcpFullContent} onChange={(v) => setMcpConfig({ full: v })} label="Ekstrak isi lengkap halaman MCP" />
      </div>
      <p className="mt-1 text-[9px] text-slate-500">Ekstrak isi halaman pada web_search/deep_search. Nonaktif memakai ringkasan hasil agar lebih cepat.</p>
      {mcpStatus && <p className={`mt-2 text-[9px] leading-relaxed ${mcpStatus.startsWith("OK") ? "text-emerald-300" : "text-[#f4aca5]"}`}>{mcpStatus}</p>}
    </div>
    <div><p className="mb-1 text-[9px] font-medium text-slate-500">Provider fallback (saat MCP gagal/tidak dipasang)</p><div className={`grid grid-cols-3 gap-1.5 transition-opacity ${enabled ? "" : "pointer-events-none opacity-40"}`}>
      {providers.map((item) => <button key={item.key} onClick={() => setProvider(item.key)} className={`rounded-lg px-2 py-2 text-left transition-colors ${provider === item.key ? "bg-[#c8f16b]/[.12] ring-1 ring-[#c8f16b]/50" : "bg-white/[.05] hover:bg-white/[.1]"}`}><p className={`text-[10px] font-medium ${provider === item.key ? "text-[#dbff8c]" : "text-slate-300"}`}>{item.label}</p><p className="text-[9px] text-slate-500">{item.detail}</p></button>)}
    </div></div>
    {enabled && provider === "brave" && <KeyField account="brave-api-key" label="Brave API key" placeholder="brv-…" />}
    {enabled && provider === "tavily" && <KeyField account="tavily-api-key" label="Tavily API key" placeholder="tvly-…" />}
    <p className="text-[9px] leading-relaxed text-slate-600"><Icon name="shield" className="mr-1 inline h-3 w-3 -translate-y-px" />API key disimpan di OS keychain. Kosongkan kolom lalu Simpan untuk menghapus key provider tersebut.</p>
  </div></section>;
}

export function SettingsPanel() {
  const baseUrl = useSettingsStore((s) => s.baseUrl); const model = useSettingsStore((s) => s.model); const models = useSettingsStore((s) => s.models); const status = useSettingsStore((s) => s.status); const error = useSettingsStore((s) => s.error); const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop); const startMinimized = useSettingsStore((s) => s.startMinimized); const setBaseUrl = useSettingsStore((s) => s.setBaseUrl); const setModel = useSettingsStore((s) => s.setModel); const testConnection = useSettingsStore((s) => s.testConnection); const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop); const setStartMinimized = useSettingsStore((s) => s.setStartMinimized); const clearAll = useChatStore((s) => s.clearAll);
  const [urlDraft, setUrlDraft] = useState(baseUrl); const [confirming, setConfirming] = useState(false);
  useEffect(() => setUrlDraft(baseUrl), [baseUrl]); useEffect(() => { if (!confirming) return; const timer = setTimeout(() => setConfirming(false), 4000); return () => clearTimeout(timer); }, [confirming]);
  const statusColor = status === "connected" ? "bg-emerald-400" : status === "checking" ? "animate-pulse bg-amber-300" : "bg-rose-400";
  return <div className="relative flex-1 overflow-y-auto bg-[#101425]/45 px-4 py-4"><div className="mb-5 rounded-2xl border border-indigo-200/[.1] bg-[linear-gradient(135deg,rgba(99,102,241,.15),rgba(34,211,238,.04))] p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.08] text-indigo-200"><Icon name="settings" className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-white">Pengaturan</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Atur koneksi AI, voice, web, dan perilaku assistant.</p></div></div></div><section><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">AI server</p><div className="space-y-2 rounded-2xl border border-white/[.07] bg-[#0b0f1e]/45 p-3"><label className="block text-[10px] font-medium text-slate-400">Base URL</label><input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} onBlur={() => { const value = urlDraft.trim(); if (value && value !== baseUrl) { setBaseUrl(value); void testConnection(); } else if (!value) setUrlDraft(baseUrl); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} spellCheck={false} className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="http://localhost:1234/v1" /><label className="mt-3 block text-[10px] font-medium text-slate-400">Model aktif</label><div className="flex gap-2"><select value={model} onChange={(event) => setModel(event.target.value)} disabled={models.length === 0} className="min-w-0 flex-1 rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50 disabled:text-slate-600">{models.length === 0 ? <option value="">Belum ada model</option> : models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select><button onClick={() => void testConnection()} disabled={status === "checking"} title="Muat ulang model" className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04] text-slate-300 hover:bg-white/[.1] disabled:opacity-40"><Icon name="refresh" className="h-3.5 w-3.5" /></button></div><div className="mt-3 flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{status === "connected" ? "Terhubung ke server" : status === "checking" ? "Memeriksa koneksi" : "Belum terhubung"}</span><button onClick={() => void testConnection()} disabled={status === "checking"} className="rounded-lg bg-indigo-400/15 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-100 hover:bg-indigo-400/25 disabled:opacity-50">Uji koneksi</button></div>{status === "offline" && error && <p className="rounded-lg bg-rose-400/[.08] px-2.5 py-2 text-[10px] leading-relaxed text-rose-200/80">{error}</p>}</div></section><section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Tampilan</p><div className="space-y-2"><SettingRow title="Selalu di atas" description="Jaga Astra tetap di atas aplikasi lain." checked={alwaysOnTop} onChange={setAlwaysOnTop} /><SettingRow title="Mulai tersembunyi di tray" description="Jangan tampilkan window saat startup; buka lewat tray atau Alt+Space." checked={startMinimized} onChange={setStartMinimized} /></div></section><VoiceSection />
<GenerationSection />
<WebSearchSection /><section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Penyimpanan</p><div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.06] bg-white/[.025] p-3"><div><p className="text-[11px] font-medium text-slate-200">Riwayat percakapan</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Hapus semua percakapan tersimpan.</p></div><button onClick={() => { if (confirming) { void clearAll(); setConfirming(false); } else setConfirming(true); }} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${confirming ? "bg-rose-500 text-white" : "bg-white/[.07] text-slate-300 hover:bg-rose-400/15 hover:text-rose-200"}`}>{confirming ? "Klik lagi" : "Hapus"}</button></div></section></div>;
}
