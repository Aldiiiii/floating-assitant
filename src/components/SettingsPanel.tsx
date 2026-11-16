import { useEffect, useState } from "react";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { Icon } from "./Icon";
import { GenerationSection } from "./settings/GenerationSection";
import { SettingRow } from "./settings/SettingRow";
import { VoiceSection } from "./settings/VoiceSection";
import { WebSearchSection } from "./settings/WebSearchSection";

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
