# V3 — Page system & tidy HUD

V3 tidak mengganti Base layout v2: time bar, menu bar, status bar, dan area konten tetap sama. Yang berubah adalah **isi** halamannya:

1. **Space Center** sekarang punya *page system* dengan mode Overview → Build → Focus.
2. **Flight HUD** dirapikan: alert, panel, staging, dan navball.

Sumbernya ada di `source/v3/`. Di canvas, semuanya ada di page **V3 · Page system & tidy HUD**.

---

## 1. Space Center — page system

Space Center tidak lagi menampilkan semua panel sekaligus. Halaman ini punya 3 mode. Bar di **bawah tengah** adalah *bar konteks*: isinya berganti sesuai mode, sama seperti menu bar yang isinya berganti per halaman.

```
            ┌─────────── Build ───────────┐
Overview ───┤                             ├──→ Done → Overview
            └── klik bangunan → Focus ──── ← Overview / panel × → Overview
```

### 1.1 Overview (tampilan awal / showcase) — `SpaceCenterV3.dc.html`
- Layarnya bersih: kampus saja, ditambah time bar, menu bar, dan status bar.
- **Nama bangunan muncul hanya saat hover.** Toggle **Labels** (ikon tag) mengubahnya jadi "selalu tampil".
- **Bar konteks:** `Build · Buildings · Found a branch │ Labels`
  - **Buildings** membuka daftar bangunan di kanan. Hover pada satu baris menyorot bangunannya di peta; klik baris membuka Focus.
- Klik bangunan, labelnya, atau baris di daftar untuk masuk ke mode **Focus**.

### 1.2 Build — `SpaceCenterV3Build.dc.html`
- Bar bawah membesar menjadi **Build bar** (lebar 1040):
  - **Baris 1:** label BUILD, tab kategori, alat, lalu tombol **Done**.
    - Kategori: Launch · Comms · Science · Crew · Administration · Production · Infrastructure.
    - Alat: **Place** (kursor) dan **Demolish** (buldoser).
  - **Baris 2:** kartu bangunan berisi ikon, chip status, nama, dan biaya · waktu · ukuran tile.
    - Chip `BUILT` berarti bangunan sudah ada (maksimal 1). Chip `LOCKED` disertai syaratnya, misalnya "Needs R&D · level 2". Chip `×n` menunjukkan jumlah yang sudah dibangun.
- Grid kampus menjadi lebih terang selama mode Build.
- **Alur penempatan:**
  1. Klik kartu. *Ghost* bangunan berwarna aksen dengan garis putus-putus muncul di tile kosong.
  2. Di atasnya muncul chip `Rotate · Cancel · Place`.
  3. Setelah **Place**, bangunan muncul dengan garis putus-putus dan status "Under construction".

### 1.3 Build · Demolish — `SpaceCenterV3Demolish.dc.html`
- Saat alat buldoser aktif, kartu diganti strip penjelasan: "Click a building to remove it".
- Bangunan yang di-hover berubah merah, dengan label "Demolish [nama]".
- Klik bangunan untuk membuka popover konfirmasi: *"Demolish X? This can't be undone. Refund: [—] funds"* dengan tombol `Cancel` dan `Demolish`.

### 1.4 Focus — `SpaceCenterV3Focus.dc.html`
- Kamera **zoom ke bangunan** dengan animasi 700 ms dan skala otomatis 1.6–3×. Bangunan ditempatkan di area kiri, karena panel ada di kanan.
- **Panel detail (kanan, 320):** nama, bar level (Level 1 of 3), status, deskripsi, Provides, Upkeep, kotak **Next · Level 2** dengan tombol upgrade, tombol primer **Open [bangunan]**, dan tombol **Demolish** di bawahnya.
- **Bar konteks:** `[← Overview] │ ‹ Hangar · Building 2 of 7 ›`. Panah ‹ › berpindah ke bangunan lain tanpa keluar dari zoom.
- Kembali ke posisi tengah lewat tombol **← Overview**, tombol × di panel, atau ikon Space Center di menu bar.
- Bangunan yang sedang dibangun menampilkan "Cancel construction", bukan Upgrade/Open.

---

## 2. Flight v3 — tidy HUD (`FlightV3.dc.html`)

### 2.1 Masalah di versi web yang diperbaiki
| Masalah | Solusi v3 |
|---|---|
| 3 alert bertumpuk di tengah atas, masing-masing dengan gaya berbeda | Dipisah menjadi **toast** (kejadian) dan **chip status** (kondisi). Lihat §2.2 |
| Alert dobel karena sebabnya sama ("Cannot throttle" dan "UNCONTROLLED · no power") | Chip menunjukkan sebabnya, toast hanya untuk aksi yang gagal, dan toast yang berulang digabung jadi badge `×2` |
| Teks developer (`vessel 0 ("Moon shot")…`) | Teks untuk pemain: **"Can't throttle — The probe core has no electric charge."** |
| Rail dan panel kiri terlihat seperti 2 benda dengan tinggi berbeda | **Satu wadah**: rail dan panel menyatu, garis pemisah penuh |
| Label bergaris putus-putus; kolom nilai tidak lurus | Tooltip tanpa dekorasi; nilai rata kanan di satu kolom; waktu "in 53:43" jadi sub-teks |
| Tombol outline "Warp to Ap/Pe" | Ikon ⏩ di ujung baris Apoapsis/Periapsis |
| Time bar panjang (teks batas warp + "Catch up to now") | Segmen di atas batas **diarsir** dan tidak bisa dipilih; "Catch up" jadi ikon dengan titik aksen |
| Menu bar punya 3 titik aktif sekaligus; bell muncul dobel | **Titik hanya untuk halaman aktif.** Panel yang tampil ditandai ikon putih, yang tersembunyi abu-abu. Bell hanya di status bar |
| Navball, SAS, throttle, dan readout terlihat seperti 5 benda terpisah | **Satu modul** (lihat §2.4) |
| Margin tidak konsisten (10 / 28 px) | Semua 24 px; tepi bawah panel sejajar di `bottom: 56` |
| Panel vessel di kanan dan dock di kiri sama-sama berisi info kapal | **Satu dock di kiri** (lihat §2.3) |

### 2.2 Sistem alert: kondisi vs kejadian
| | **Chip status (kondisi)** | **Toast (kejadian)** |
|---|---|---|
| Untuk | Keadaan yang terus berlaku: UNCONTROLLED, NO POWER, NO SIGNAL | Hal sesaat: aksi yang gagal, batas warp |
| Tempat | Strip di bawah modul navball | Tengah atas, `top: 24`, lebar 380 |
| Bentuk | Pill 20 px, teks 8/700 kapital, titik 5 px | Glass radius 12, ikon 28, judul 12/600, isi 10 |
| Umur | Selama kondisinya berlaku | Hilang sendiri setelah 6 detik, maksimal 2, bisa ditutup |
| Interaksi | Klik untuk membuka popover (sebab + perbaikan, misalnya **Extend solar panels** atau **Open Parts**) | Kejadian yang sama digabung jadi badge `×n` |
| Warna | Merah `#FF8A8E` = kontrol hilang, oranye `#FFB86B` = peringatan, hijau = "All systems nominal" | Ikon mengikuti tingkat keparahan |

Aturan:
- Kalau sebuah aksi gagal karena kondisi yang sudah tampil di chip, chip itu **berkedip** dengan garis berwarna selama 1.2 detik, supaya pemain langsung melihat sebabnya.
- Kondisi kapal juga tercermin di status bar, misalnya `● No signal · Occluded by Earth` dengan titik oranye.

### 2.3 Dock tunggal (kiri)
- **Satu kolom, satu panel pada satu waktu.** Klik ikon lain di rail untuk ganti panel, atau klik ikon yang aktif untuk menutupnya.
- **Rail berkelompok** dengan pemisah tipis:
  - **Vessel:** Overview · Parts · Comms · Crew
  - **Flight:** Orbit · Resources · Maneuver · Science
  - **Plugins:** Scripts · Plugin panel
  - `+` Panel library
- Isi panel:
  - **Overview:** nama kapal, 4 stat (Control, Electric, Link, Mass), dan **Group control** (switch per grup).
  - **Parts:** daftar part dengan switch.
  - **Comms:** status link dan daftar endpoint.
  - **Crew:** daftar kru, atau keadaan kosong "No crew aboard".
- Panel Vessel info di kanan dan kapsul Crew di kanan bawah **dihapus**. Toggle-nya juga hilang dari menu bar, jadi aksi halaman tinggal `Panels · Navball · Staging · Camera`.
- Panel tumbuh mengikuti isi, maksimal 860 px, lalu bisa di-scroll.

### 2.4 Modul navball compact
```
              [264°]
[VEL  3,581.0 m/s ORB]  ( V/S ◖ navball ◗ THR )   [SAS][RCS]
[ALT    350.0 km  SEA]                             ( pod SAS bulat )
──────── ● UNCONTROLLED   ● NO POWER   ● NO SIGNAL ────────
```
- **Ukuran:** 552 × 232, di tengah bawah, tepi bawah di y 1024. Warna solid `#141518`, sehingga navball dan pod SAS terlihat menonjol dari bodi.
- **Kiri:** angka saja (VEL dan ALT 15/500 dengan chip referensi ORB/SEA).
- **Tengah:** navball 180 px.
  - **Lengkung kiri = V/S.** Tanda putih di tengah berarti level.
  - **Lengkung kanan = throttle**, terisi dari bawah. Warnanya abu-abu selama tidak ada power, aksen saat aktif.
- **Kanan:** pod SAS bulat 136 px.
  - Stability di tengah, 6 mode melingkar dengan radius 44: Prograde di atas, Retrograde di bawah, Normal dan Radial out di kanan, Anti-normal dan Radial in di kiri.
  - Pill SAS/RCS di atas pod.
- Selama **uncontrolled**, SAS, RCS, dan semua mode diredupkan (`#4A4B50`, `cursor: not-allowed`).
- **Bawah:** strip chip status.

### 2.5 Staging (kanan bawah)
- Pindah ke **kanan bawah**, karena kolom kanan sekarang kosong. Panelnya tumbuh ke atas sampai `top: 80`, lalu daftar stage bisa di-scroll.
- Tiap baris stage: nomor, ikon part, nama part, Δv, dan TWR.
- Stage berikutnya ditampilkan sebagai blok `01 · NEXT · Δv` beserta TWR dan durasi burn. Di bawahnya ada tombol **GO** dan **Total Δv**.
- Chip `Δv · Here` menggantikan dropdown "Here, as flown".

### 2.6 Susunan layar Flight v3
```
┌───────────────────────────────────────────────────────────────────────────┐
│ [time bar]                  [toast (event)]            [menu bar]          │
│ ┌rail┬ panel ─────┐                                                        │
│ │ ▣ │ OVERVIEW   ×│                                                        │
│ │ ▣ │ …           │                (vessel)                                │
│ │───│             │                                        ┌ STAGING ────┐ │
│ │ ▣ │             │                                        │ 04 …        │ │
│ │ + │             │      ┌──────── flight module ───────┐  │ 01 NEXT  GO │ │
│ └───┴─────────────┘      └──────────────────────────────┘  └─────────────┘ │
│ [status bar: world · link · vessel · agency · autosave · mods · 🔔]         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Langkah berikutnya (belum dikerjakan)
- Alat **Move** di mode Build.
- Bar konteks Space Center dijadikan bagian Base layout untuk semua halaman.
- Map view dan Mission Center versi v3 (dock tunggal dan modul navball yang sama).
- Isi panel Crew dengan kru (avatar, chip baju, sinyal radio) untuk kapal berawak.
