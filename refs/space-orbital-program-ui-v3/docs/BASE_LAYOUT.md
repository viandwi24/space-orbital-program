# Base Layout

Semua halaman di dalam world (Space Center, Flight/Map, dan nanti Hangar, Mission Center, bangunan lain) memakai kerangka yang sama. Sumber acuannya adalah `source/v2/Base.dc.html`.

```
 24px                                                                      24px
 ┌─ TIME BAR ──────────────────────┐                ┌─ MENU BAR ────────────────────────┐   ↑ 24px
 │ ▶  ▮▮▮▮▯▯▯▯  1×  │  T+ 2y 70d  │                │ [page…] │ 🚀 🗺 🏢 🏠 │ ☰           │   44px tinggi
 └─────────────────────────────────┘                └───────────────────────────────────┘
 ┌───────────────────────────────────────────────────────────────────────────────────┐   ↑ top 80px
 │                                                                                   │
 │                           AREA KONTEN (safe area)                                 │
 │                                                                                   │
 └───────────────────────────────────────────────────────────────────────────────────┘   ↓ bottom 56px
 ┌─ STATUS BAR (full width) ─────────────────────────────────────────────────────────┐   32px tinggi
 │ WORLD CAREER system │ ● link │ 📍loc      Funds Science Rep Contracts      💾 │ mods │ 🔔 │
 └───────────────────────────────────────────────────────────────────────────────────┘
```

## 1. Grid dan area aman

| Hal | Nilai |
|---|---|
| Kanvas | 1920 × 1080 |
| Margin tepi untuk bar atas | 24 px |
| Tinggi time bar / menu bar | 44 px (kapsul, radius 999) |
| Status bar | menempel di bawah, lebar penuh, tinggi 32 px, border-top 1 px |
| **Area konten** | top 80 · left 24 · right 24 · bottom 56 (= 32 status bar + 24 jarak) |
| Panel yang menempel di bawah | `bottom: 56px` (bukan 24) |

Atas–tengah sengaja dikosongkan. Judul halaman tidak ditaruh di atas karena lokasi saat ini sudah tertulis di status bar.

## 2. Time bar (kiri atas)

Urutannya tetap:

1. **Tombol pause/play**: bulat 36, `#F4F4F5` dengan ikon `#0B0B0C`.
2. **Bar warp**: 8 segmen tinggi 18, radius 3, celah 3. Empat segmen pertama lebar 6 (warp fisik: 1×, 2×, 4×, 10×), empat berikutnya lebar 10 (on-rails: 50×, 100×, 1k×, 10k×). Segmen sampai level aktif berwarna putih, segmen aktif berwarna `accent`, sisanya `rgba(255,255,255,0.12)`. Saat dijeda, semua segmen redup.
3. **Label kelipatan**: 12/600 putih, min-width 34. Berisi `1×`, `50×`, `1k×`, dan seterusnya; tampil `—` saat dijeda.
4. **Pemisah** 1 × 18.
5. **Waktu**: `T+ 2y 70d 26:32`, 12/500.

Isinya hanya kontrol waktu. Nama world dipindah ke status bar.

## 3. Menu bar (kanan atas)

```
[ aksi halaman … ] │ [ Vessel ] [ Map ] [ Space Center ] [ VAB ] │ [ Menu ]
   opsional            TETAP di semua halaman                       tetap
```

- **Aksi halaman** hanya ada kalau halamannya butuh. Jika tidak ada, pemisah pertama juga tidak ditampilkan.
- **Grup tetap** adalah navigasi utama di dalam world. Tujuan yang sedang aktif ditandai **ikon putih + titik 4 px di bawahnya**; yang lain `#8B8B93`.
- **Menu** (ikon tiga garis) membuka menu sistem: pengaturan, save/load, keluar ke main menu.

| Halaman | Aksi halaman | Aktif di grup tetap |
|---|---|---|
| Base (template) | — | — |
| **Flight / Vessel** | Panels · Vessel info · Navball · Crew · Change camera | Vessel (atau Map saat di tampilan peta) |
| **Space Center** | Mission Center | Space Center |
| Hangar / VAB *(belum v2)* | mis. New · Open · Save · Launch | VAB |

Aturan tombol:

- Tombol bulat 36, ikon 18, stroke 1.7, tanpa latar.
- Tombol *toggle panel* (Panels, Vessel info, Navball, Crew) memakai titik saat panelnya terbuka.
- Tombol *aksi sekali tekan* (Change camera) tidak memakai titik.

## 4. Status bar (bawah)

Urutan dari kiri ke kanan (font 10 px, `#A1A1AA`):

| Zona | Isi |
|---|---|
| **Kiri** | Nama world 11/700 putih · chip mode (`CAREER`) · sistem bintang |
| | Pemisah · **Koneksi**: titik 6 px (aksen = terhubung, `#FF5A5F` = offline) + "Connected" + jaringan |
| | Pemisah · **Lokasi** dengan ikon: `Space Center · Kerbin` atau `[VESSEL] · Orbiting Kerbin` |
| **Tengah** (`margin: 0 auto`) | Funds · Science · Reputation · Contracts. Nilainya 600 putih |
| **Kanan** | Autosave · pemisah · jumlah mod · pemisah · **🔔 notifikasi** |

Tray kanan untuk sementara hanya berisi lonceng notifikasi: tombol 26 × 26, ikon 14, badge putih `#F4F4F5` berisi angka 8/700.

Yang **tidak** ditaruh di status bar: nomor versi game, ikon keluar, dan ikon tray lain (log, sound, screenshot, settings).

## 5. Penyesuaian halaman saat memakai Base

Contohnya dari Flight v2:

- Panel staging dan crew: `bottom: 24 → 56`.
- Modul navball: naik 32 px (`top 794 → 762`). Editor maneuver ikut naik (`704 → 672`).
- Panel kanan (Vessel info) dipendekkan `808 → 776` supaya tetap berjarak 24 dari panel crew.
- Panel dock kiri: max-height `680 → 640` supaya tidak menyentuh staging.
- Space Center: dock bangunan `bottom 24 → 52`. Judul atas–tengah dihapus.

## 6. Ikon menu bar (versi rapi)

Semua ikon digambar di grid 24 dengan **batas vertikal yang sama: y = 3 sampai 21, garis dasar di 21**, dan berada di tengah sumbu x = 12.

```
Vessel        M12 3 C15 5.5 16 9 16 13 V16 L18.5 19 H5.5 L8 16 V13 C8 9 9 5.5 12 3 Z M10 19 V21 M14 19 V21
Map           M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20
Space Center  M4 21 V10 L9 7.5 V21 M9 21 V3 L15 6 V21 M15 21 V11 L20 13 V21 M3 21 H21
VAB           M4 21 V9 L12 3 L20 9 V21 Z M12 10 C13.6 11.4 14 13.4 14 16 V21 H10 V16 C10 13.4 10.4 11.4 12 10 Z
Menu          M4 7 H20 M4 12 H20 M4 17 H20
Mission Ctr.  M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z
Notification  M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z M10 21 H14
```

## 7. Rencana berikutnya

- Jadikan Base satu komponen bersama yang dipasang di semua halaman (seperti `MapView` memakai ulang `Main`), supaya perubahan bar cukup dibuat sekali.
- Terapkan ke Hangar, Launch, Mission Center, Astronaut Complex, R&D, dan Administration.
- Panel notifikasi yang muncul dari lonceng di status bar.
