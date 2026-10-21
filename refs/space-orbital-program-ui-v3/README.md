# Space Orbital Program — UI Design Package · v3

Redesign UI game *Space Orbital Program* dengan gaya **Tesla-inspired**: gelap, flat, minimal, panel kaca, dan satu warna aksen.

**Baru di v3** (detail lengkap ada di `docs/V3_CHANGES.md`):

- **Space Center page system.** Space Center sekarang punya tiga mode: **Overview** (showcase bersih, nama bangunan muncul saat hover), **Build** (bar kategori, kartu bangunan, alat Place/Demolish), dan **Focus** (kamera zoom ke bangunan, panel detail, tombol ← Overview).
- **Flight HUD yang rapi.**
  - Alert dipisah menjadi chip status (kondisi) dan toast (kejadian).
  - Semua info kapal ada di satu dock kiri dengan rail berkelompok.
  - Staging pindah ke kanan.
  - Navball, V/S, throttle, SAS, dan readout disatukan dalam satu modul compact.

Base layout v2 (time bar, menu bar, status bar) tetap berlaku; lihat `docs/BASE_LAYOUT.md`.

> Desain canvas aslinya ada di artifact Design **Flight HUD — Tesla-style refine** di Claude:
> - Page **V3 · Page system & tidy HUD** berisi layar v3.
> - Page **V2 · Base layout** dan **V1 · Original screens** berisi versi sebelumnya.

---

## Isi paket

```
space-orbital-program-ui-v3/
├── README.md               ← file ini
├── CHANGELOG.md            ← riwayat v1 → v2 → v3
├── docs/
│   ├── V3_CHANGES.md       ← ★ apa yang berubah di v3 (Space Center modes, alert, dock, navball, staging)
│   ├── BASE_LAYOUT.md      ← layout dasar: time bar, menu bar, status bar, area konten
│   ├── STYLE.md            ← design system: warna, tipografi, glass, komponen, ikon
│   ├── CONCEPT.md          ← konsep produk: World, Space Center, alur layar
│   └── SCREENS.md          ← inventaris layar v3 + v2 + v1
├── tokens/
│   ├── tokens.json         ← design tokens v3 (termasuk alert, dock, flight module)
│   └── tokens.css          ← CSS variables + kelas siap pakai
└── source/
    ├── canvas.json         ← susunan canvas (3 page: v1, v2, v3)
    ├── v3/                 ← SpaceCenterV3 (+ Build, Demolish, Focus), FlightV3
    ├── v2/                 ← Base, Space Center v2, Flight v2
    └── v1/                 ← layar v1
```

## Layar v3

| File | Isi |
|---|---|
| `SpaceCenterV3.dc.html` | Space Center: komponen utama dengan prop `initialMode` = `overview` / `build` / `demolish` / `focus` |
| `SpaceCenterV3Build.dc.html` | Space Center dibuka dalam mode Build (sedang menempatkan Fuel depot) |
| `SpaceCenterV3Demolish.dc.html` | Space Center dibuka dalam mode Build · Demolish (konfirmasi untuk Administration) |
| `SpaceCenterV3Focus.dc.html` | Space Center dibuka dalam mode Focus (zoom ke Hangar) |
| `FlightV3.dc.html` | Flight: dock tunggal, staging kanan, modul navball compact, chip status, dan toast |

Ketiga file wrapper memakai `<dc-import name="SpaceCenterV3" initial-mode="…">`, jadi semua logika ada di satu file.

## Ringkasan Flight v3

```
[time bar]                     [toast]                          [menu bar]
[rail│panel]                                                     
                                (vessel)                       [STAGING ↑]
                  [VEL/ALT] (V/S◖navball◗THR) (SAS pod)        [04 … 01 GO]
                  ── ● UNCONTROLLED ● NO POWER ● NO SIGNAL ──
[status bar ·································································🔔]
```

## Catatan
- File `.dc.html` adalah Design Component untuk canvas Claude Design. Logikanya ada di `class Component extends DCLogic`, dan file ini tidak berjalan sebagai HTML biasa di browser. Untuk implementasi di game, pakai `docs/` dan `tokens/` sebagai spesifikasi.
- Data kapal di Flight v3 mengikuti screenshot build web: probe "Moon shot" di orbit Earth 350 km, tanpa power, dan tertutup Earth. Nilai yang belum diketahui ditulis `[—]`.
- Interaksi yang bisa dicoba di Flight v3:
  - Klik chip status untuk membuka popover. Tombol **Extend solar panels** memulihkan power.
  - Klik **THR 37%** atau tombol SAS saat tidak ada power untuk memunculkan toast dan membuat chip berkedip.
  - Klik segmen warp yang diarsir untuk memunculkan toast batas warp.
