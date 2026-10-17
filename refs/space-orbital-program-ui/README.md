# Space Orbital Program — UI Design Package

Redesign UI game *Space Orbital Program* dengan gaya **Tesla-inspired**: gelap, flat, minimal, panel kaca (glass), angka besar bertipe tipis, dan satu warna aksen. Titik awal desain ini adalah HUD *Kerbal Space Program 2*, yang kemudian dirapikan menjadi sistem UI lengkap: dari menu utama sampai di dalam world.

> Desain canvas aslinya ada di Claude: **Flight HUD — Tesla-style refine** (artifact Design).
> Paket ini adalah salinan sumber dan dokumentasinya untuk handoff ke tim.

---

## Isi paket

```
space-orbital-program-ui/
├── README.md              ← file ini
├── docs/
│   ├── CONCEPT.md         ← konsep produk: World, Space Center, alur layar
│   ├── STYLE.md           ← design system: warna, tipografi, glass, komponen, ikon
│   └── SCREENS.md         ← inventaris layar + isi, state, dan interaksinya
├── tokens/
│   ├── tokens.json        ← design tokens (format netral, bisa di-import ke tool)
│   └── tokens.css         ← CSS custom properties + kelas utilitas glass/indicator
└── source/
    ├── canvas.json        ← susunan artboard di canvas desain
    └── *.dc.html          ← sumber tiap layar (Design Component, 1920×1080)
```

## Daftar layar

| # | File | Layar | Interaktif |
|---|------|-------|-----------|
| 0 | `Home.dc.html` | Menu utama | ✓ |
| 0b | `Worlds.dc.html` | Daftar world + Create world | ✓ |
| W | `SpaceCenter.dc.html` | Space Center (hub di dalam world) | ✓ |
| W1 | `Hangar.dc.html` | Hangar / VAB — merakit kapal | ✓ |
| W2 | `Launch.dc.html` | Launch sites — pilih situs, kapal, kru | ✓ |
| W3 | `Astronauts.dc.html` | Astronaut Complex — roster & rekrut | ✓ |
| W4 | `Research.dc.html` | R&D — tech tree | ✓ |
| W5 | `Admin.dc.html` | Administration — kontrak & strategi | ✓ |
| 1 | `Main.dc.html` | Flight HUD (juga memuat mode Map) | ✓ |
| 2 | `MapView.dc.html` | Map — memakai ulang `Main` dengan `initialView="map"` | ✓ |
| 3 | `Map.dc.html` | Mission Center | ✓ |
| — | `Docked.dc.html` | Eksplorasi awal: close-up flight deck (arsip) | — |

## Alur navigasi

```
Home ─► Worlds ─► Enter world ─► Space Center
                                   ├─ Hangar ─► Launch ─► Flight ⇄ Map ─► Mission Center
                                   ├─ Astronaut Complex
                                   ├─ R&D
                                   ├─ Administration
                                   └─ (exit) ─► Home
Flight / Map / Mission Center: tombol 🏠 di kapsul world ─► Space Center
```

## Cara membuka sumber

File `*.dc.html` adalah **Design Component**: HTML + `{{hole}}` + `<sc-for>`/`<sc-if>` + kelas `DCLogic`. File ini butuh runtime editor (`support.js`) sehingga **tidak bisa dibuka langsung di browser**. Pilihannya:

1. Buka artifact desainnya di Claude, lalu pakai mode Play untuk mencoba interaksinya.
2. Pakai file ini sebagai **spesifikasi markup**. Semua ukuran, warna, dan struktur ditulis eksplisit lewat inline style, dan logika state ada di blok `<script type="text/x-dc">` di bawah tiap file.
3. Saat implementasi di engine (Unity UI Toolkit, React, dan sejenisnya), mulai dari `tokens/` dan `docs/STYLE.md`.

## Data & placeholder

Angka yang **nyata** (dari screenshot referensi): ketinggian 72,081 m, kecepatan 2,616 m/s, Δv stage 4,384 m/s, total Δv 6,354 m/s, tangki 162/243 t dan 71/216 t, MET T+ 2y 70d 26:32, kru Valentina, Jebediah, dan Bob.
Selain itu ditulis sebagai placeholder: `[—]`, `[VESSEL NAME]`, `[WORLD NAME 1]`, `[RELAY 1]`, `[CONTRACT NAME]`, dan seterusnya. Ganti dengan data game yang sebenarnya.

## Versi

- Paket: 1.0 — 17 Oktober 2026
- Font: Manrope (UI), JetBrains Mono (nomor versi) — keduanya Google Fonts, lisensi OFL.
