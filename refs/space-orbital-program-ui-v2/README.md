# Space Orbital Program — UI Design Package · v2

Redesign UI game *Space Orbital Program* dengan gaya **Tesla-inspired**: gelap, flat, minimal, panel kaca, angka bertipe tipis, dan satu warna aksen.

**Baru di v2:** semua halaman memakai satu **Base layout** yang sama, yaitu **time bar** di kiri atas, **menu bar** di kanan atas, dan **status bar** di bawah. Isi halaman berada di area konten di antara ketiganya. Rincian lengkapnya ada di `docs/BASE_LAYOUT.md`.

> Desain canvas aslinya: artifact Design **Flight HUD — Tesla-style refine** di Claude.
> Page **V2 · Base layout** berisi layar v2; page **V1 · Original screens** berisi layar lama.

---

## Isi paket

```
space-orbital-program-ui-v2/
├── README.md               ← file ini
├── CHANGELOG.md            ← apa yang berubah dari v1 ke v2
├── docs/
│   ├── BASE_LAYOUT.md      ← ★ layout dasar: time bar, menu bar, status bar, area konten
│   ├── STYLE.md            ← design system: warna, tipografi, glass, komponen, ikon
│   ├── CONCEPT.md          ← konsep produk: World, Space Center, alur layar
│   └── SCREENS.md          ← inventaris layar v2 + v1
├── tokens/
│   ├── tokens.json         ← design tokens (termasuk ukuran base layout)
│   └── tokens.css          ← CSS variables + kelas siap pakai (glass, status bar, menu bar, …)
└── source/
    ├── canvas.json         ← susunan canvas (2 page: v1, v2)
    ├── v2/                 ← Base, Space Center v2, Flight v2
    └── v1/                 ← layar v1 (Home, Worlds, bangunan, Flight, Map, Mission Center, …)
```

> Di canvas aslinya semua file berada di satu folder dan saling tertaut lewat nama file (misalnya `Hangar.dc.html`). Pemisahan `v1/` dan `v2/` di sini hanya untuk merapikan.

## Ringkasan Base layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [▶ ▮▮▮▮▯▯▯▯ 1× │ T+ 2y 70d 26:32]          [aksi halaman │ 🚀 🗺 🏢 🏠 │ ☰] │  ← 24 px dari tepi
│                                                                          │
│                         AREA KONTEN HALAMAN                              │  ← atas 80 · samping 24 · bawah 56
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ [WORLD] CAREER Kerbin · ● Connected · 📍Lokasi   Funds·Science·Rep·Contracts   Autosave · mods · 🔔4 │  ← 32 px
└──────────────────────────────────────────────────────────────────────────┘
```

- **Time bar:** pause/play, bar warp 8 segmen, kelipatan warp (1×), waktu T+.
- **Menu bar:** `[aksi halaman] | [Vessel] [Map] [Space Center] [VAB] | [Menu]`. Grup tengah selalu ada di setiap halaman; aksi halaman opsional.
- **Status bar:** identitas world, koneksi, lokasi, angka agency, autosave, jumlah mod, lonceng notifikasi.

## Layar v2

| File | Layar | Aksi halaman di menu bar |
|---|---|---|
| `v2/Base.dc.html` | Template Base layout (prop `page`: `base` / `vessel`) | — / contoh vessel |
| `v2/SpaceCenterV2.dc.html` | Space Center | Mission Center |
| `v2/FlightV2.dc.html` | Flight (Vessel + Map) | Panels · Vessel info · Navball · Crew · Change camera |

## Cara membuka sumber

File `*.dc.html` adalah **Design Component** (HTML + `{{hole}}` + `<sc-for>`/`<sc-if>` + kelas `DCLogic`). File ini butuh runtime editor canvas sehingga **tidak bisa dibuka langsung di browser**. Pakai sebagai spesifikasi markup: semua ukuran dan warna ditulis eksplisit lewat inline style, dan logika state ada di blok `<script type="text/x-dc">`. Untuk mencoba interaksinya, buka artifact desainnya dan pakai mode Play.

## Data & placeholder

Angka nyata dari screenshot referensi: ALT 72,081 m · VEL 2,616 m/s · Δv stage 4,384 m/s · total Δv 6,354 m/s · tangki 162/243 t dan 71/216 t · T+ 2y 70d 26:32 · kru Valentina, Jebediah, Bob.
Selain itu ditulis sebagai placeholder: `[—]`, `[WORLD NAME 1]`, `[VESSEL NAME]`, `[RELAY 1]`, dan seterusnya.

## Versi
- Paket v2 — 18 Oktober 2026
- Font: Manrope (UI), JetBrains Mono (nomor versi di Home v1) — Google Fonts, OFL.
