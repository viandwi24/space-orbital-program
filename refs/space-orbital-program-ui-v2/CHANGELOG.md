# Changelog

## v2 — 18 Oktober 2026 · Base layout

### Baru
- **Base layout** (`source/v2/Base.dc.html`): time bar kiri atas, menu bar kanan atas, status bar bawah, dan area konten aman. Lihat `docs/BASE_LAYOUT.md`.
- **Status bar** 32 px selebar layar: world dan mode, koneksi, lokasi, Funds/Science/Reputation/Contracts, autosave, jumlah mod, dan lonceng notifikasi dengan badge.
- **Struktur menu bar**: `[aksi halaman] | [Vessel] [Map] [Space Center] [VAB] | [Menu]`, dengan titik putih untuk tujuan aktif.
- **Space Center v2** dan **Flight v2** sudah memakai Base layout.
- Canvas dipecah menjadi 2 page: *V1 · Original screens* dan *V2 · Base layout*.

### Diubah
- **Time bar** sekarang hanya berisi kontrol waktu (pause, warp 8 segmen yang bisa diklik, kelipatan, T+). Chip MET/UT dan kapsul world dihapus dari bagian atas.
- **Nama world** pindah dari kiri atas ke ujung kiri status bar.
- **Judul halaman** di atas tengah Space Center dihapus, karena lokasi sudah tertulis di status bar.
- **Menu bar Flight**: toggle Staging dan tombol Map lama dihapus dari aksi halaman. Map sekarang ada di grup tetap, dan panel staging selalu tampil.
- **Mission Center** di Space Center memakai ikon grid supaya tidak sama dengan ikon Map.
- **Ikon Vessel, Space Center, dan VAB digambar ulang** supaya sejajar: batas y 3–21 dan garis dasar sama di y 21.
- Panel bawah di Flight v2 dan dock Space Center v2 dinaikkan supaya tidak tertutup status bar.

### Dihapus
- Nomor versi game dan tombol keluar dari status bar.
- Ikon tray Mission log, Sound, Screenshot, dan Settings (tray menyisakan notifikasi saja).

---

## v1 — 17 Oktober 2026
Paket awal: Home, Worlds, Space Center + 5 bangunan, Flight, Map, Mission Center, style guide, dan tokens.
