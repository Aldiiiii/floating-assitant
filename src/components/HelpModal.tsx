import { Icon, type IconName } from "./Icon";

interface HelpModalProps { onClose: () => void; }

const SECTIONS: { title: string; icon: IconName; items: string[] }[] = [
  {
    title: "Membuka & memindahkan",
    icon: "sparkle",
    items: [
      "Klik bubble untuk membuka panel percakapan.",
      "Geser atau tahan bubble sebentar untuk memindahkan posisinya.",
      "Alt + Space menampilkan atau menyembunyikan assistant dari aplikasi mana pun.",
    ],
  },
  {
    title: "Percakapan",
    icon: "history",
    items: [
      "Enter mengirim pesan; Shift + Enter membuat baris baru.",
      "Tekan Esc dari panel untuk kembali menjadi bubble. Tekan Esc lagi dari bubble untuk menyembunyikannya.",
      "Riwayat percakapan tersimpan secara lokal dan dapat dikelola dari menu riwayat.",
    ],
  },
  {
    title: "Konteks layar",
    icon: "image",
    items: [
      "Gunakan tombol gambar di kolom pesan untuk melampirkan layar penuh, jendela aktif, atau area tertentu.",
      "Untuk memilih area, tarik kotak pada layar; tekan Esc untuk membatalkan pemilihan.",
      "Model aktif harus mendukung vision agar dapat memahami screenshot.",
    ],
  },
  {
    title: "Suara",
    icon: "mic",
    items: [
      "Tombol mic di kolom pesan: tahan untuk bicara (push-to-talk) atau klik untuk mulai/berhenti, tergantung mode di Pengaturan.",
      "Hasil pengenalan suara masuk ke kolom pesan dulu — kamu bisa menyuntingnya sebelum dikirim.",
      "Bahasa transkripsi (Indonesia / English / Otomatis) dan model pengenalan suara dipilih di Pengaturan → Voice.",
      "Tombol Bacakan pada pesan assistant membacakan jawaban; Auto-speak membacakan otomatis.",
      "Unduh model suara (Whisper & Piper) dari Pengaturan → Voice. Semuanya diproses lokal.",
    ],
  },
  {
    title: "Data terbaru & kualitas jawaban",
    icon: "sparkle",
    items: [
      "Saat butuh data segar, model dapat meminta pencarian web dengan format [CARI: kata kunci] — hasilnya otomatis disuntikkan lalu jawaban dilanjutkan.",
      "Web Search MCP dipakai lebih dahulu untuk pencarian umum bila dikonfigurasi. DuckDuckGo, Brave, atau Tavily menjadi fallback; berita dan kurs memakai sumber terstruktur khusus.",
      "System prompt, temperature, top-p, max tokens, serta batas riwayat yang dikirim dapat disesuaikan di Pengaturan → Gaya jawaban.",
      "Gunakan tombol Regenerate pada jawaban terakhir atau ikon edit pada pesanmu untuk iterasi cepat.",
    ],
  },
  {
    title: "Koneksi & privasi",
    icon: "shield",
    items: [
      "Atur alamat LM Studio dan pilih model dari Pengaturan.",
      "Percakapan disimpan di database lokal. Screenshot hanya digunakan saat request berlangsung dan tidak disimpan permanen.",
      "Percakapan dikirim ke alamat model yang kamu konfigurasi. Jika pencarian web aktif dan dibutuhkan, kata kunci serta akses halaman juga keluar ke layanan pencarian atau situs terkait.",
    ],
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  return <div className="absolute inset-0 z-30 flex bg-black/65 p-3" onClick={onClose}>
    <div onClick={(event) => event.stopPropagation()} className="m-auto flex max-h-full w-full flex-col overflow-hidden rounded-[16px] border border-white/[.12] bg-[#20201d] shadow-[0_24px_65px_rgba(0,0,0,.55)]">
      <header className="flex items-center justify-between border-b border-white/[.09] px-3 py-3">
        <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center border border-white/[.1] text-[#c8f16b]"><Icon name="help" className="h-3.5 w-3.5" /></span><div><p className="text-[11px] font-semibold text-[#f0efe8]">Panduan penggunaan</p><p className="mt-0.5 text-[9px] text-[#7e7e76]">Shortcut dan alur kerja utama</p></div></div>
        <button onClick={onClose} title="Tutup" className="flex h-7 w-7 items-center justify-center text-[#85857d] hover:bg-white/[.06] hover:text-white"><Icon name="close" className="h-3.5 w-3.5" /></button>
      </header>
      <div className="flex-1 divide-y divide-white/[.07] overflow-y-auto px-3">
        {SECTIONS.map((section) => <section key={section.title} className="py-3"><div className="flex items-center gap-2 text-[#c8f16b]"><Icon name={section.icon} className="h-3.5 w-3.5" /><h3 className="text-[9px] font-semibold uppercase tracking-[.14em]">{section.title}</h3></div><ul className="mt-2 space-y-1.5">{section.items.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-relaxed text-[#aaa9a1]"><span className="mt-[6px] h-1 w-1 shrink-0 bg-[#74746c]" />{item}</li>)}</ul></section>)}
      </div>
      <footer className="border-t border-white/[.09] p-3"><button onClick={onClose} className="w-full bg-[#c8f16b] px-3 py-2 text-[10px] font-semibold text-[#1a1a17] hover:bg-[#d7fb80]">Mengerti</button></footer>
    </div>
  </div>;
}
