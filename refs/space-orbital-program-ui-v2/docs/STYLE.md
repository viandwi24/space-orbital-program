# Style Guide — Design System

Semua nilai di bawah juga tersedia di `tokens/tokens.json` dan `tokens/tokens.css`.

## 1. Warna

### Latar
| Token | Nilai | Pakai |
|---|---|---|
| `bg.space` | `#000000` | Flight, Map, Home |
| `bg.ground` | `#05070A` | Space Center, layar bangunan |
| `bg.hangar` | `#0A0C0F` | Lantai Hangar (grid 40 px, garis mayor tiap 200 px) |

### Permukaan
| Token | Nilai | Pakai |
|---|---|---|
| `surface.glass` | `rgba(22,23,26,0.60)` + blur | Semua panel, kapsul, dan toolbar |
| `surface.solid` | `#141518` | Rumah modul navball (harus solid supaya bentuknya menyatu) |
| `surface.dialog` | `#16171A` | Dialog modal (Create world) |
| `surface.inset` | `rgba(255,255,255,0.05)` | Kotak statistik di dalam panel |
| `surface.tile` | `rgba(255,255,255,0.06)` | Kotak ikon 24–32 px, tombol sekunder |
| `surface.hover` | `rgba(255,255,255,0.07)` | Baris list yang dipilih |
| `surface.scrim` | `rgba(0,0,0,0.60)` | Latar di belakang dialog |

### Garis
| Token | Nilai |
|---|---|
| `border.subtle` | `rgba(255,255,255,0.08)` — tepi panel |
| `border.divider` | `rgba(255,255,255,0.07)` — pemisah 1 px |
| `border.strong` | `rgba(255,255,255,0.18)` — item "next", chip outline |

### Teks
| Token | Nilai | Pakai |
|---|---|---|
| `text.primary` | `#FFFFFF` | Nilai, judul |
| `text.body` | `#F4F4F5` | Teks dasar |
| `text.secondary` | `#E4E4E7` | Ikon default, teks tombol sekunder |
| `text.muted` | `#A1A1AA` | Label, sub-teks |
| `text.subtle` | `#8B8B93` | Hitungan, ikon toolbar nonaktif |
| `text.disabled` | `#6B6B73` | Node terkunci, SAS saat mati |

### Aksen & status
| Token | Nilai | Aturan |
|---|---|---|
| `accent` | `#3E6AE1` | Hanya untuk yang **aktif/dikendalikan**. Bisa diganti: `#E82127`, `#F4F4F5`, `#22A06B` |
| `selected.bg` / `selected.fg` | `#F4F4F5` / `#0B0B0C` | Tab/segmen terpilih, tombol primer, stage aktif |
| `status.ok` | `#7BD88F` | Check lolos |
| `status.warn` | `#FFB86B` | Peringatan (mod hilang, engineer report) |
| `status.danger` | `#FF8A8E` | Teks bahaya (Delete, penalti, "No transmitter") |
| `status.offline` | `#FF5A5F` | Tanda × kecil pada sinyal, titik "Offline" |
| `maneuver.prograde/normal/radial` | `#7BD88F` / `#C792EA` / `#7FD4F5` | Swatch sumbu Δv |
| `navball.sky/ground` | `#DCDFE4` / `#26282C` | Bola navball monokrom |

Kontras: teks `#A1A1AA` di atas panel ≈ 7:1. Warna hijau/merah tidak pernah jadi satu-satunya pembeda; status selalu disertai teks atau ikon.

## 2. Tipografi

- **Manrope** 300 / 400 / 500 / 600 / 700, selalu dengan `font-variant-numeric: tabular-nums`.
- **JetBrains Mono** 400, hanya untuk nomor versi di footer Home.

| Peran | Ukuran / berat | Contoh |
|---|---|---|
| Display | 22–30 / 300 | Judul Home, nama world, nama kru |
| Nilai besar | 18–24 / 300 | Angka di kartu agency |
| Judul panel | 12–14 / 600–700 | "Space Center", nama vessel |
| Nilai | 11–13 / 500–600 | 2,616 · 72,081 · 4,384 |
| Body / sub | 9–11 / 400–500 | Sub-teks baris list |
| Label kapital | 7–9 / 700, tracking `0.12–0.14em` | `ALTITUDE`, `STAGING`, `CURRENT · Δv` |
| Chip | 8–9 / 700, tracking `0.08em` | `ORBIT`, `EVA`, `NEXT` |

Selalu pakai `line-height: 1` di dalam baris berukuran tetap supaya jarak vertikalnya konsisten.

## 3. Glass (panel kaca)

```css
background: rgba(22,23,26,0.60);
backdrop-filter: blur(28px) saturate(160%);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 16px;           /* panel */  — 999px untuk kapsul/toolbar
```

## 4. Ukuran & jarak

| Hal | Nilai |
|---|---|
| Margin layar (HUD) | 24 px |
| Area konten (v2) | top 80 · sisi 24 · bottom 56 (di atas status bar 32) |
| Status bar | tinggi 32, lebar penuh |
| Margin layar (menu/Home/Worlds) | 80 px |
| Celah antar-panel | 12 px (8 px di grup atas) |
| Padding panel | 10 px (14–20 px untuk panel detail) |
| Gap internal | 2 / 4 / 6 / 8 px |
| Tinggi kapsul/toolbar | 44 px |
| Tombol bulat | 36 px (toolbar), 34 px (pod SAS), 26 px (aksi part) |
| Kotak ikon | 24 px (list), 28–32 px (header) |
| Baris list | 26 (staging), 32 (crew), 36–40 (part/endpoint), 52 (menu) |
| Chip | tinggi 18–22, padding 0 7–9 |
| Switch | 30 × 18, knob 14 |
| Lebar panel | Staging/Crew 220 · Dock panel 280 · Vessel 300 · panel detail 320–520 |

### Radius
`999` kapsul/chip · `16` panel · `14` tombol besar · `10–12` kartu dan baris terpilih · `7–9` kotak ikon · `5–6` tombol kecil

## 5. Indikator aktif (flat)

Status aktif **tidak pernah memakai latar terisi**:

- **Ikon/label aktif:** `#FFFFFF`. Nonaktif: `#8B8B93`.
- **Titik 4 px putih:**
  - Toolbar horizontal: titik di **bawah** ikon (`bottom: 3px`).
  - Rail vertikal (dock kiri, kategori Hangar): titik di **kanan** ikon (`right: 1px`, tengah vertikal).
  - Baris list terpilih: latar `surface.hover` + titik di ujung kanan.

Pengecualian, karena di sini status adalah informasi utama:

- Tab/segmen terpilih → `selected.bg`.
- Tombol mode SAS aktif → `accent`.
- Switch on → `accent`.

## 6. Komponen

| Komponen | Spesifikasi singkat |
|---|---|
| **Kapsul** | Tinggi 44, glass, radius 999. Isinya tombol bulat 36 dan/atau teks. Dipakai untuk toolbar, kontrol waktu, kapsul world, judul layar. |
| **Segmented / tabs** | Kapsul dengan padding 4; item 34 × auto; item terpilih `#F4F4F5` dengan teks `#0B0B0C`. |
| **Panel** | Glass, radius 16, padding 10. Header berupa label kapital 9 px dengan hitungan di kanan. |
| **Stat cell** | `surface.inset`, radius 8, padding 7×8. Label 7 px kapital, nilai 11 px/600. |
| **List row** | Kotak ikon 24 + nama 11/600 + sub 9/400. Kontrol (switch, chevron, chip) di kanan. |
| **Switch** | 30×18, knob putih 14. On: `accent`. Off: `rgba(255,255,255,0.14)`. Mixed: aksen 45% dengan knob di tengah. |
| **Signal bars** | 4 bar dengan tinggi 4 / 6 / 8.5 / 11, lebar 2.5, celah 1.5. Bar mati `rgba(255,255,255,0.2)`. Offline ditandai × merah. |
| **Chip** | Tinggi 18, radius 999, teks 8/700 kapital. Varian isi `rgba(255,255,255,0.12)`, varian outline `border.strong`. |
| **Tombol primer** | `#F4F4F5` / `#0B0B0C`, tinggi 40–52, radius 10–14, teks 12–14/700. |
| **Tombol sekunder** | `rgba(255,255,255,0.08)` / `#E4E4E7`. Aksi destruktif memakai teks `status.danger`. |
| **Tombol back** | Bulat 44, glass, panah kiri; selalu di kiri atas atau di kiri switch mode. |
| **Kapsul world** | Tombol rumah 36 + nama world 11/600 + `MODE · SISTEM` 8/700. |

## 7. Ikon

- Grid 24 × 24, **stroke** (bukan fill), lebar 1.7–1.9, `stroke-linejoin: round`, `stroke-linecap: round`.
- Ditampilkan di 12–18 px. Ikon toolbar 18 px, ikon list 13 px.
- Ikon dekoratif memakai `aria-hidden="true"`; tombol yang hanya berisi ikon wajib punya `aria-label` dan `title`.
- Semua path ikon tertulis di sumber, misalnya objek `I = {...}` di script `Main.dc.html` dan `Map.dc.html`.

## 8. Ilustrasi

- **Roket:** line-art berisi (putih `#F1F2F4`, garis `#C3C7CD`, aksen hitam `#1A1B1E`). Satu gambar yang sama dipakai dengan rotasi: −24° (flight), −90° (hangar, launch), −78° (home).
- **Planet:** radial-gradient biru dengan glow `rgba(70,130,255,0.25)`.
- **Space Center:** isometrik (sumbu x ×0.866, y ×0.5). Bangunan berupa kotak dengan tiga muka: top `#262A30`, kiri `#17191D`, kanan `#1E2126`. Bangunan yang di-hover menjadi lebih terang dengan garis putih.

## 9. Komponen Base layout (v2)

Spesifikasi lengkapnya ada di `BASE_LAYOUT.md`. Ringkasnya:

| Komponen | Spesifikasi |
|---|---|
| **Time bar** | Kapsul 44 di kiri atas: tombol 36 putih, 8 segmen warp (6/10 × 18, radius 3, celah 3), label 12/600, pemisah, T+ 12/500 |
| **Menu bar** | Kapsul 44 di kanan atas: `[aksi halaman] │ Vessel · Map · Space Center · VAB │ Menu`. Tombol 36, ikon 18; tujuan aktif putih dengan titik 4 px di bawah |
| **Status bar** | `bottom: 0`, lebar penuh, tinggi 32, glass, `border-top` 1 px `border.subtle`, padding 0 24, gap 14, teks 10 `text.muted`. Pemisah 1 × 12 |
| **Chip mode** (status bar) | Tinggi 16, padding 0 6, 8/700, tracking 0.08em, `rgba(255,255,255,0.10)` |
| **Titik koneksi** | 6 px: `accent` = terhubung, `status.offline` = offline |
| **Notification bell** | Tombol 26, ikon 14; badge `#F4F4F5`/`#0B0B0C`, min 12 × 12, teks 8/700, di kanan atas ikon |

**Konsistensi ikon:** setiap ikon navigasi memakai batas y 3–21 dengan garis dasar yang sama di 21, dan sumbu tengahnya di x 12. Ikon yang batasnya berbeda akan terlihat tidak sejajar di dalam kapsul.

## 10. Aksesibilitas

- Semua kontrol berupa `<button>` atau `<a href>` asli, dengan `aria-pressed`/`aria-selected`/`aria-expanded` sesuai state.
- Target sentuh kurang dari 44 px (pod SAS 34, aksi part 26) **hanya aman untuk mouse**. Untuk tablet, naikkan ke minimal 44.
