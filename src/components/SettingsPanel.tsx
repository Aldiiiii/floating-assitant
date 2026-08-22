import { useEffect, useState } from "react";
import { modelStatus } from "../lib/api";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { useVoiceStore, type SttModel, type TtsVoice, type VoiceMode } from "../stores/voice";
import { Icon } from "./Icon";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-[#c8f16b]" : "bg-slate-700"}`}><span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>; }
function SettingRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><div className="min-w-0"><p className="text-[11px] font-medium text-slate-200">{title}</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{description}</p></div><Toggle checked={checked} onChange={onChange} /></div>; }

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
  const downloadModel = useVoiceStore((s) => s.downloadModel);
  const micDevice = useVoiceStore((s) => s.micDevice);
  const setMicDevice = useVoiceStore((s) => s.setMicDevice);
  const devices = useVoiceStore((s) => s.devices);
  const loadDevices = useVoiceStore((s) => s.loadDevices);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  useEffect(() => { void (async () => { const keys = ["whisper-base", "whisper-small", PIPER_BIN_KEY, "piper-voice-id", "piper-voice-id-config", "piper-voice-en", "piper-voice-en-config"]; const next: Record<string, boolean> = {}; for (const key of keys) { try { next[key] = (await modelStatus(key)).installed; } catch { next[key] = false; } } setInstalled((prev) => ({ ...prev, ...next })); })(); }, []);

  const installGroup = async (keys: string[]) => {
    for (const key of keys) {
      try { if (!(await modelStatus(key)).installed) await downloadModel(key); } catch { /* lanjut item berikutnya */ }
    }
    const next: Record<string, boolean> = {};
    for (const key of keys) { try { next[key] = (await modelStatus(key)).installed; } catch { next[key] = false; } }
    setInstalled((prev) => ({ ...prev, ...next }));
  };

  const sttOptions: { key: SttModel; modelKey: string; label: string; detail: string }[] = [
    { key: "whisper-base", modelKey: "whisper-base", label: "Cepat", detail: "Whisper Base · ±148 MB" },
    { key: "whisper-small", modelKey: "whisper-small", label: "Akurat", detail: "Whisper Small · ±490 MB" },
  ];
  const ttsOptions: { key: TtsVoice; keys: string[]; label: string; detail: string }[] = [
    { key: "id", keys: [PIPER_BIN_KEY, "piper-voice-id", "piper-voice-id-config"], label: "Bahasa Indonesia", detail: "Piper Ardhi · ±65 MB" },
    { key: "en", keys: [PIPER_BIN_KEY, "piper-voice-en", "piper-voice-en-config"], label: "English", detail: "Piper Lessac · ±63 MB" },
  ];

  return <section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Voice</p><div className="space-y-2">
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-slate-200">Perangkat microphone</p><button onClick={() => void loadDevices()} title="Muat ulang daftar perangkat" className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.04] text-slate-300 hover:bg-white/[.1]"><Icon name="refresh" className="h-3 w-3" /></button></div><select value={micDevice ?? ""} onChange={(event) => setMicDevice(event.target.value || null)} disabled={devices.length === 0} className="mt-2 w-full rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50 disabled:text-slate-600">{devices.length === 0 ? <option value="">Tidak ada microphone terdeteksi</option> : <><option value="">Default sistem</option>{devices.map((name) => <option key={name} value={name}>{name}</option>)}</>}</select></div>
    <SettingRow title="Microphone" description="Izinkan assistant mendengar suaramu saat tombol mic dipakai." checked={micEnabled} onChange={setMicEnabled} />
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Cara berbicara</p><div className="mt-2 grid grid-cols-2 gap-1.5">{([["ptt", "Tahan (Push-to-talk)"], ["toggle", "Klik (Toggle)"]] as [VoiceMode, string][]).map(([value, label]) => <button key={value} onClick={() => setMode(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${mode === value ? "bg-[#c8f16b] text-[#161712]" : "bg-white/[.05] text-slate-300 hover:bg-white/[.1]"}`}>{label}</button>)}</div></div>
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Pengenalan suara</p><div className="mt-2 space-y-1.5">{sttOptions.map((option) => <div key={option.key} onClick={() => installed[option.modelKey] && setSttModel(option.key)} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${sttModel === option.key ? "border-[#c8f16b]/50 bg-[#c8f16b]/[.07]" : "border-white/[.06]"} ${!installed[option.modelKey] && "opacity-60"}`}><div><p className="text-[10px] font-medium text-slate-200">{option.label}{sttModel === option.key && installed[option.modelKey] ? " · aktif" : ""}</p><p className="text-[9px] text-slate-500">{option.detail}</p></div><InstallChip keys={[option.modelKey]} installed={installed} onInstall={(keys) => void installGroup(keys)} /></div>)}</div></div>
    <div className="rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-3"><p className="text-[11px] font-medium text-slate-200">Suara jawaban</p><div className="mt-2 space-y-1.5">{ttsOptions.map((option) => <div key={option.key} onClick={() => option.keys.every((k) => installed[k]) && setTtsVoice(option.key)} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${ttsVoice === option.key ? "border-[#c8f16b]/50 bg-[#c8f16b]/[.07]" : "border-white/[.06]"}`}><div><p className="text-[10px] font-medium text-slate-200">{option.label}{ttsVoice === option.key && option.keys.every((k) => installed[k]) ? " · aktif" : ""}</p><p className="text-[9px] text-slate-500">{option.detail}</p></div><InstallChip keys={option.keys} installed={installed} onInstall={(keys) => void installGroup(keys)} /></div>)}</div></div>
    <SettingRow title="Auto-speak" description="Bacakan otomatis setiap jawaban AI selesai." checked={autoSpeak} onChange={setAutoSpeak} />
    <p className="px-1 pt-1 text-[9px] leading-relaxed text-slate-600"><Icon name="shield" className="mr-1 inline h-3 w-3 -translate-y-px" />Semua pemrosesan suara berjalan lokal di perangkat ini.</p>
  </div></section>;
}

export function SettingsPanel() {
  const baseUrl = useSettingsStore((s) => s.baseUrl); const model = useSettingsStore((s) => s.model); const models = useSettingsStore((s) => s.models); const status = useSettingsStore((s) => s.status); const error = useSettingsStore((s) => s.error); const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop); const startMinimized = useSettingsStore((s) => s.startMinimized); const setBaseUrl = useSettingsStore((s) => s.setBaseUrl); const setModel = useSettingsStore((s) => s.setModel); const testConnection = useSettingsStore((s) => s.testConnection); const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop); const setStartMinimized = useSettingsStore((s) => s.setStartMinimized); const clearAll = useChatStore((s) => s.clearAll);
  const [urlDraft, setUrlDraft] = useState(baseUrl); const [confirming, setConfirming] = useState(false);
  useEffect(() => setUrlDraft(baseUrl), [baseUrl]); useEffect(() => { if (!confirming) return; const timer = setTimeout(() => setConfirming(false), 4000); return () => clearTimeout(timer); }, [confirming]);
  const statusColor = status === "connected" ? "bg-emerald-400" : status === "checking" ? "animate-pulse bg-amber-300" : "bg-rose-400";
  return <div className="relative flex-1 overflow-y-auto bg-[#101425]/45 px-4 py-4"><div className="mb-5 rounded-2xl border border-indigo-200/[.1] bg-[linear-gradient(135deg,rgba(99,102,241,.15),rgba(34,211,238,.04))] p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[.08] text-indigo-200"><Icon name="settings" className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-white">Pengaturan</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">Atur koneksi model lokal dan perilaku assistant.</p></div></div></div><section><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">AI server</p><div className="space-y-2 rounded-2xl border border-white/[.07] bg-[#0b0f1e]/45 p-3"><label className="block text-[10px] font-medium text-slate-400">Base URL</label><input value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} onBlur={() => { const value = urlDraft.trim(); if (value && value !== baseUrl) { setBaseUrl(value); void testConnection(); } else if (!value) setUrlDraft(baseUrl); }} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} spellCheck={false} className="w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50" placeholder="http://localhost:1234/v1" /><label className="mt-3 block text-[10px] font-medium text-slate-400">Model aktif</label><div className="flex gap-2"><select value={model} onChange={(event) => setModel(event.target.value)} disabled={models.length === 0} className="min-w-0 flex-1 rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px] text-white outline-none focus:border-indigo-300/50 disabled:text-slate-600">{models.length === 0 ? <option value="">Belum ada model</option> : models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select><button onClick={() => void testConnection()} disabled={status === "checking"} title="Muat ulang model" className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04] text-slate-300 hover:bg-white/[.1] disabled:opacity-40"><Icon name="refresh" className="h-3.5 w-3.5" /></button></div><div className="mt-3 flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />{status === "connected" ? "Terhubung ke server" : status === "checking" ? "Memeriksa koneksi" : "Belum terhubung"}</span><button onClick={() => void testConnection()} disabled={status === "checking"} className="rounded-lg bg-indigo-400/15 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-100 hover:bg-indigo-400/25 disabled:opacity-50">Uji koneksi</button></div>{status === "offline" && error && <p className="rounded-lg bg-rose-400/[.08] px-2.5 py-2 text-[10px] leading-relaxed text-rose-200/80">{error}</p>}</div></section><section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Tampilan</p><div className="space-y-2"><SettingRow title="Selalu di atas" description="Jaga Astra tetap di atas aplikasi lain." checked={alwaysOnTop} onChange={setAlwaysOnTop} /><SettingRow title="Mulai sebagai bubble" description="Buka dalam mode ringkas saat aplikasi dijalankan." checked={startMinimized} onChange={setStartMinimized} /></div></section><VoiceSection /><section className="mt-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.16em] text-indigo-200">Penyimpanan</p><div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.06] bg-white/[.025] p-3"><div><p className="text-[11px] font-medium text-slate-200">Riwayat percakapan</p><p className="mt-1 text-[10px] leading-relaxed text-slate-500">Hapus semua percakapan tersimpan.</p></div><button onClick={() => { if (confirming) { void clearAll(); setConfirming(false); } else setConfirming(true); }} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${confirming ? "bg-rose-500 text-white" : "bg-white/[.07] text-slate-300 hover:bg-rose-400/15 hover:text-rose-200"}`}>{confirming ? "Klik lagi" : "Hapus"}</button></div></section></div>;
}
