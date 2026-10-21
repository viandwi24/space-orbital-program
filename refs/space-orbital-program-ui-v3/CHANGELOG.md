# Changelog

## v3 — 21 Oktober 2026 · Page system & tidy HUD

### Baru
- **Space Center page system** (`source/v3/SpaceCenterV3*.dc.html`): mode **Overview → Build → Focus**, dengan *bar konteks* di bawah tengah yang isinya berganti per mode.
  - **Overview**: nama bangunan hanya muncul saat hover (toggle Labels untuk selalu tampil), plus daftar Buildings yang bisa dibuka-tutup.
  - **Build**: 7 tab kategori, kartu bangunan (BUILT / LOCKED / ×n), ghost penempatan dengan Rotate · Cancel · Place, dan status "Under construction".
  - **Demolish** (alat buldoser): hover membuat bangunan merah, lalu muncul popover konfirmasi dengan info refund.
  - **Focus**: kamera zoom animasi ke bangunan, panel detail (level, upkeep, upgrade, Open, Demolish), dan bar `← Overview · ‹ nama ›`.
- **Flight v3** (`source/v3/FlightV3.dc.html`):
  - **Chip status** kapal (UNCONTROLLED / NO POWER / NO SIGNAL) di modul navball, lengkap dengan popover sebab dan perbaikan.
  - **Toast** untuk kejadian (maksimal 2, hilang sendiri, kejadian berulang digabung jadi `×n`).
  - **Dock tunggal** di kiri dengan rail berkelompok (Vessel · Flight · Plugins). Crew, Parts, dan Comms pindah ke sini.
  - **Modul navball compact** 552 × 232: readout di kiri, navball dengan lengkung V/S (kiri) dan throttle (kanan), pod SAS bulat di kanan, dan strip status di bawah.
- Canvas mendapat page ketiga: **V3 · Page system & tidy HUD**.
- `docs/V3_CHANGES.md`.

### Diubah
- **Staging** pindah dari kiri bawah ke **kanan bawah** dan tumbuh ke atas (bisa di-scroll). Tiap baris berisi part, Δv, dan TWR.
- **Time bar**: segmen warp di atas batas diarsir dan tidak bisa dipilih; "Catch up to now" jadi ikon.
- **Menu bar**: titik hanya untuk halaman aktif. Panel yang tampil ditandai ikon putih, yang tersembunyi abu-abu. Aksi halaman Flight: Panels · Navball · Staging · Camera.
- **Panel Orbit**: satu kolom nilai rata kanan, waktu sebagai sub-teks, warp sebagai ikon di ujung baris, dan garis bawah putus-putus dihapus.
- **Status bar** di Flight menampilkan link kapal (`No signal · Occluded by Earth`).
- Semua margin 24 px, dan tepi bawah panel sejajar di `bottom: 56`.

### Dihapus
- Panel **Vessel info** di kanan, kapsul **Crew** di kanan bawah, dan toggle keduanya di menu bar.
- Bell di menu bar (bell hanya ada di status bar).
- Alert bertumpuk di tengah atas (kartu warning, pill "Occluded", pill "UNCONTROLLED").

---

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
