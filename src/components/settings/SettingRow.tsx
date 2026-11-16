interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
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

export interface SettingRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SettingRow({
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

