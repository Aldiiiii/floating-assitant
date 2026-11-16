import { useEffect, useState } from "react";
import { mcpLocalCheck, searchKeysGet, searchKeysSet } from "../../lib/api";
import { useSettingsStore } from "../../stores/settings";
import { Icon } from "../Icon";
import { SettingRow, Toggle } from "./SettingRow";

interface KeyFieldProps {
  account: string;
  label: string;
  placeholder: string;
}

function KeyField({ account, label, placeholder }: KeyFieldProps) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void searchKeysGet().then((keys) => {
      if (account === "brave-api-key") setValue(keys.brave ?? "");
      else if (account === "tavily-api-key") setValue(keys.tavily ?? "");
      else if (account === "searxng-url") setValue(keys.searxng ?? "");
    });
  }, [account]);

  const handleSave = () => {
    setSaving(true);
    setSaveError(null);
    void searchKeysSet(
      account === "brave-api-key" ? value : null,
      account === "tavily-api-key" ? value : null,
      account === "searxng-url" ? value : null
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

export function WebSearchSection() {
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
    key: "searxng" | "bing" | "google" | "ddg" | "brave" | "tavily";
    label: string;
    detail: string;
  }[] = [
    { key: "searxng", label: "SearXNG (Google)", detail: "Multi-engine · Tanpa key" },
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

        {enabled && (provider === "searxng" || provider === "google") && (
          <div className="space-y-1">
            <KeyField account="searxng-url" label="SearXNG Instance URL" placeholder="http://localhost:8080 (default lokal Docker)" />
            <p className="text-[9px] text-zinc-500">
              Jalankan lokal via Docker: <code className="rounded bg-white/[.06] px-1 font-mono text-[9px] text-zinc-300">docker run -d -p 8080:8080 searxng/searxng</code>
            </p>
          </div>
        )}
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

