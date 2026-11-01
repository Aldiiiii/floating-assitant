import { Icon, type IconName } from "./Icon";

interface HelpModalProps {
  onClose: () => void;
}

const SECTIONS: { title: string; icon: IconName; items: string[] }[] = [
  {
    title: "Membuka & Memindahkan",
    icon: "sparkle",
    items: [
      "Klik bubble untuk membuka panel percakapan.",
      "Geser atau tahan bubble sebentar untuk memindahkan posisinya di layar.",
      "Alt + Space menampilkan atau menyembunyikan assistant dari aplikasi mana pun.",
    ],
  },
  {
    title: "Percakapan & Pintasan",
    icon: "history",
    items: [
      "Enter mengirim pesan; Shift + Enter membuat baris baru.",
      "Tekan Esc dari panel untuk kembali menjadi bubble. Tekan Esc lagi untuk menyembunyikannya.",
      "Riwayat percakapan tersimpan secara lokal dan dapat dikelola dari menu riwayat.",
    ],
  },
  {
    title: "Konteks Layar (Screenshot)",
    icon: "image",
    items: [
      "Gunakan tombol gambar di composer untuk melampirkan Layar Penuh, Jendela Aktif, atau Pilih Area.",
      "Tarik kotak pada layar untuk memilih area; tekan Esc untuk membatalkan.",
      "Gambar diproses murni di memori (zero disk temp) dan diteruskan ke model multimodal.",
    ],
  },
  {
    title: "Interaksi Suara (STT & TTS)",
    icon: "mic",
    items: [
      "Mode Suara: Tahan bicara (PTT), Klik rekam (Toggle), atau Mode Dialog hands-free.",
      "Audio Cues (Earcons): Nada halus memberi tahu saat mic mulai mendengar dan saat selesai bicara.",
      "Deteksi hening otomatis (VAD): Asisten berhenti merekam otomatis saat Anda diam >1.2 detik.",
      "Interupsi suara (Barge-in): Suara jawaban asisten otomatis berhenti seketika saat Anda mulai berbicara.",
      "Pembersih Teks TTS: Kode layar dan URL panjang dirangkum secara lisan agar nyaman didengar.",
      "Peredam Bising Dinamis: High-Pass Filter 130Hz meredam deru kipas laptop dan hembusan angin.",
    ],
  },
  {
    title: "Pencarian Web & Data Terkini",
    icon: "sparkle",
    items: [
      "Asisten otomatis mendeteksi kebutuhan data terkini (berita, kurs valuta, waktu lokal, kalkulator).",
      "Web Search MCP dipakai lebih dahulu jika dikonfigurasi, dengan fallback Bing, DuckDuckGo, Brave, atau Tavily.",
      "Grounding Gate memverifikasi fakta dan memangkas halusinasi sebelum jawaban akhir disajikan.",
    ],
  },
  {
    title: "Koneksi & Privasi",
    icon: "shield",
    items: [
      "Terhubung ke LM Studio atau endpoint OpenAI-compatible lokal.",
      "Seluruh data percakapan, transkripsi Whisper, dan sintesis Piper berjalan lokal tanpa telemetri pihak ketiga.",
    ],
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-3.5 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90%] w-full flex-col overflow-hidden rounded-2xl border border-white/[.12] bg-[#1a1b18] shadow-[0_24px_72px_rgba(0,0,0,.65)] select-none"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[.08] px-4 py-3 bg-[#131412]/60">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[.06] text-[#c8f16b] ring-1 ring-white/[.08]">
              <Icon name="help" className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-[12px] font-semibold text-white">Panduan penggunaan</p>
              <p className="text-[10px] text-zinc-400">Pintasan keyboard dan fitur Astra</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#85857d] transition-all hover:bg-white/[.08] hover:text-white active:scale-[0.94] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 divide-y divide-white/[.06] overflow-y-auto px-4 py-1">
          {SECTIONS.map((section) => (
            <section key={section.title} className="py-3">
              <div className="flex items-center gap-2 text-[#c8f16b]">
                <Icon name={section.icon} className="h-3.5 w-3.5" />
                <h3 className="text-[10px] font-semibold uppercase tracking-[.14em]">
                  {section.title}
                </h3>
              </div>
              <ul className="mt-2 space-y-1.5">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[10px] leading-relaxed text-[#b4b3aa]">
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[#c8f16b]/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="border-t border-white/[.08] p-3 bg-[#131412]/40">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#c8f16b] px-3 py-2 text-[11px] font-semibold text-[#161712] shadow-sm transition-all hover:bg-[#dbff8c] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c8f16b]/60"
          >
            Mengerti
          </button>
        </footer>
      </div>
    </div>
  );
}
