import { useSettingsStore } from "../../stores/settings";
import { Icon } from "../Icon";

export function GenerationSection() {
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

