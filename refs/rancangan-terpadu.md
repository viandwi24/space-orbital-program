# Rancangan terpadu v2: Space Orbital Program menuju rilis publik

**Status:** draf untuk direview pemilik. Belum ada ADR, plan, atau kode yang dibuat dari dokumen ini.
**Tanggal:** 18 Oktober 2026 (v1 pagi hari, v2 setelah riset mendalam).

**Tujuan dokumen.** Satu tempat untuk membaca **semua** hal berikut:
- apa yang dimiliki KSP1 dan KSP2;
- apa yang sudah dan belum dimiliki game kita;
- apa yang wajib ada sebelum rilis publik, dan bagaimana rancangannya.

Setelah disetujui, isinya dipecah menjadi ADR dan draft plan (bagian 14).

**Bukti dan detail** ada di folder riset [`reverse-engineering-ksp-ksp2/`](reverse-engineering-ksp-ksp2/README.md):

| Dokumen | Isi |
|---|---|
| 01–14 | riset KSP1 dan KSP2 |
| 05, 15, 15a–15d | inventaris kode kita, lengkap dengan file:line |
| 16 | log verifikasi: 122 terverifikasi, 41 dikoreksi, sisanya belum bisa dipastikan dan masih ditandai di dokumennya |
| 17 | katalog induk dalam bahasa Inggris |

Setiap baris di dokumen ini menyebut nomor dokumen sumbernya.

**Tanda yang dipakai:**
- ✅ **diputuskan pemilik**
- 🔶 **default usulan**, silakan koreksi
- ❓ **perlu keputusan pemilik**

**Prioritas:**
- **P0:** wajib sebelum rilis publik
- **P1:** update awal setelah rilis
- **P2:** nanti

---

## Daftar isi

1. Ringkasan
2. Kerangka layar (Base layout v2)
3. Dunia selalu berjalan
4. Part dan resource
5. Model terbang (termasuk 5.13 warp)
5b. Debug, log, dan cheat untuk pengujian
6. Navigasi dan pengelolaan kendaraan
7. Panel vessel dan HUD
8. Hangar
9. EVA dan kru
10. Konten karier
11. Tampilan, suara, dan onboarding
12. Settings, aturan world, dan tombol
13. Rilis dan operasional (termasuk GitHub Pages)
14. Urutan pengerjaan, ADR, dan plan
15. Semua pertanyaan untuk pemilik

---

## 1. Ringkasan

**Posisi kita sekarang:**
- Ke-68 plan roadmap fondasi sudah selesai.
- Game sudah memiliki banyak sistem yang **melampaui KSP1 dan KSP2**:
  - world dan aturannya, life support, comms 6 tingkat;
  - pasar dan ekonomi, agensi AI, base dengan ISRU dan rute suplai;
  - n-body, tata surya asli dengan tanggal nyata, discovery science;
  - scripting, SDK mod, layar sentuh, mode high contrast.
- **Dasar permainan ala KSP masih bolong.** Pemain KSP akan langsung menyadarinya:
  - parasut, RCS, baterai, dan docking belum ada;
  - belum bisa pindah kendaraan;
  - jam dunia tersendat setiap kali pindah layar;
  - Hangar terasa kaku;
  - panel kontrol terlalu sempit dan dangkal;
  - tutorial berhenti setelah orbit pertama;
  - tombol keyboard bentrok dengan kebiasaan KSP;
  - deploy ke GitHub Pages akan rusak.

**Lingkup rilis publik** adalah semua baris **P0** di dokumen ini, sekitar 60 butir. Kalau dikelompokkan menjadi plan, kira-kira **25–30 plan**. Perkiraan waktunya **±30–40 jam kerja agen**, atau **±12–16 jam** dengan tiga mesin. Angka ini perkiraan, bukan janji (bagian 14).

---

## 2. Kerangka layar (Base layout v2)

Sumber: `space-orbital-program-ui-v2/docs/BASE_LAYOUT.md`.

```
 ┌─ TIME BAR ─────────────────────────┐                ┌─ MENU BAR ───────────────────────────┐
 │ ▶ ▮▮▮▮▯▯▯▯ 1× │ T+ 2y 70d 26:32   │                │ [aksi halaman] │ 🚀 🗺 🏢 🏠 │ ☰     │  44 px, 24 px dari tepi
 └────────────────────────────────────┘                └──────────────────────────────────────┘
 ┌──────────────────────────── AREA KONTEN (atas 80 · kiri/kanan 24 · bawah 56) ─────────────┐
 └───────────────────────────────────────────────────────────────────────────────────────────┘
 ┌─ STATUS BAR (32 px, lebar penuh) ─────────────────────────────────────────────────────────┐
 │ WORLD CAREER · ● Connected · 📍 Lokasi │ Funds · Science · Rep · Contracts │ 💾 · mods · 🔔 │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Butir | Prio |
|---|---|---|
| 2.1 | ✅ Semua halaman di dalam world memakai Base sebagai **satu layout bersama**: Space Center, Flight dan Map, Mission Center, Hangar, Launch, Astronaut Complex, R&D, Administration, Test Stand, dan halaman mod. Home, Worlds, dan halaman publik tidak memakai Base. | P0 |
| 2.2 | 🔶 **Chip status waktu** di time bar: `DIJEDA`, `DIJEDA · HANGAR`, `TERKUNCI`, `BACKGROUND`. | P0 |
| 2.3 | 🔶 **Status bar** menampilkan autosave ("Tersimpan 12 dtk lalu"). Lonceng 🔔 mengumpulkan kejadian saat pemain tidak melihat. | P0 |
| 2.4 | 🔶 Aksi halaman di Hangar: New · Open · Save · Launch. | P0 |
| 2.5 | 🔶 Draf 132 (dana di HUD) **digabung ke status bar**, supaya tidak dikerjakan dua kali. | P0 |
| 2.6 | 🔶 Warp 8 segmen sesuai v2: 1×, 2×, 4×, 10× (fisik) dan 50×, 100×, 1k×, 10k× (on-rails). ❓ Perlu segmen tambahan 100k× untuk Sol. Batas warp dihitung dari kondisi dunia, bukan per halaman (KSP2 punya bug karena hal ini, doc 01 §8). | P0 |

---

## 3. Dunia selalu berjalan

Sumber: doc 01, 05 §1, dan 15 #2. **Bahkan KSP tidak melakukan ini.** KSP menghentikan jam di VAB dan membangun ulang setiap scene dari save. Di game kita, sekarang setiap layar menyalakan simulasinya sendiri. Akibatnya waktu bisa hilang atau mundur, dan di luar Flight tidak ada warp maupun pause.

| # | Butir | Prio |
|---|---|---|
| 3.1 | ✅ **Satu simulasi per world.** Simulasi dinyalakan saat world dibuka dan dimatikan saat keluar ke Home. Pindah halaman memakai navigasi klien, tanpa memuat ulang. Ini mengganti ADR 0118 dan 0152, dan mengubah ADR 0123. | P0 |
| 3.2 | Keadaan jam: **Berjalan**, **Warp**, **Dijeda pemain**, **Dijeda tempat**, **Dijeda tab**, dan **Background**. Jeda yang ditekan pemain selalu menang: game tidak pernah melanjutkan sendiri setelah pemain menekan pause. | P0 |
| 3.3 | ✅ Aturan world **"Jeda diizinkan"**: ya untuk Sandbox, Science, dan Career standar; **tidak** untuk Career Hardcore. Kalau tidak diizinkan, tombol pause terkunci dan dunia selalu berjalan, termasuk di background. 🔶 Warp tetap boleh. | P0 |
| 3.4 | ✅ **Jeda otomatis per tempat**, milik pemain dan diatur di Settings → Waktu. Ada juga chip di time bar untuk mengubahnya langsung. 🔶 Default: Hangar, menu, dan Launch dijeda; Space Center, Mission Center, Map, gedung lain, dan Flight tetap berjalan. | P0 |
| 3.5 | ✅ **"Dunia tetap berjalan saat tab tidak aktif"** adalah pengaturan pemain, untuk gaya bermain idle. 🔶 Default mati. Simulasi menyusul berdasarkan jam nyata karena browser memperlambat tab yang tidak aktif. | P0 |
| 3.6 | ✅ **Peringatan saat meninggalkan penerbangan aktif** (di atmosfer, mesin menyala, atau ada fisika). Pilihannya "Tetap di sini" atau "Pindah saja", plus ☐ "Jangan tanya lagi" yang bisa dikembalikan di Settings. 🔶 Kendaraan itu tetap disimulasikan dengan fisika penuh, termasuk SAS dan script. | P0 |
| 3.7 | 🔶 **Kejadian yang menghentikan warp dan masuk lonceng:** alarm, manuver, perpindahan SOI, masuk atmosfer, konstruksi selesai, tenggat kontrak, listrik habis, life support kritis, jendela transfer. | P0 |
| 3.8 | 🔶 **Autosave:** setiap 60 detik jam nyata, saat kejadian penting, dan saat keluar, tab ditutup, atau tab disembunyikan. Quickload dan revert memutar balik seluruh dunia. | P0 |
| 3.9 | 🔶 Satu world dibuka di dua tab: tab kedua menampilkan "World ini terbuka di tab lain" dengan tombol Ambil alih. | P1 |
| 3.10 | 🔶 Game ditutup: waktu berhenti. ❓ "Menyusul waktu nyata saat dibuka lagi" dijadikan opsi sekarang, atau nanti? | P2 |

---

## 4. Part dan resource

Sumber: doc 09 (katalog), 11, 03, dan 15d. Kita punya **36 part, semuanya 1,25 m**. Penerbangan pertama di KSP memakai pod, parasut, booster padat, dan fin. Dari keempatnya, kita baru punya pod dan fin.

### 4.1 Resource

| Resource | Status | Prio |
|---|---|---|
| Monopropellant (≈4 kg/u) | ❌ baru | P0 |
| Solid fuel (≈7,5 kg/u) untuk SRB | ❌ baru | P0 |
| Cold gas: ganti nama dari propelan EVA, dipakai juga RCS cold gas | ⚠️ | P0 |
| Electric Charge | ✅ ada; perlu baterai dan aturan baru | P0 |
| Xenon, Ore, IntakeAir | ❌ | P1 (jet) / P2 |

### 4.2 Paket part P0

Kolom **Kontrol terbang** adalah yang tampil di panel part. Kolom **Hangar** adalah yang bisa diatur saat merakit.

| Part | Kontrol terbang (wajib) | Staging / grup | Hangar |
|---|---|---|---|
| **Parasut atas, radial, dan drogue** | Pasang/Deploy, Cut, Lepas pasang; status **aman/berisiko/bahaya** dengan teks; tekanan minimum; ketinggian buka penuh | ya / Parachutes | tekanan, ketinggian, sudut sebar |
| **RCS 4 arah** monoprop, dan **RCS cold gas** kecil | nyala/mati, thrust limiter, sumbu rotasi dan translasi | — / RCS (R) | limiter, sumbu |
| **Tangki monoprop** radial dan inline | level, laju, waktu habis, kunci aliran, transfer | — | isi awal |
| **Baterai** kecil, sedang, besar | level, laju, waktu habis, kunci aliran | — / Batteries | isi awal |
| **Panel surya:** tetap, lipat (sudah ada), lipat besar yang mengikuti matahari | buka/tutup, paparan, output | — / Solar | — |
| **RTG** | output | — | — |
| **Docking port** kecil, sedang, besar | Undock, Kendalikan dari sini, Jadikan target, crossfeed | — | crossfeed |
| **Engine vakum upper stage** | sama seperti engine lain (4.3) | ya / Engines | limiter, gimbal |
| **SRB padat** beberapa ukuran: tanpa throttle, dengan thrust limiter | aktif, status | ya | thrust limiter, isi |
| **Launch clamp** | — | ya (lepas saat stage) | — |
| **Fairing prosedural** | Buang | ya | bentuk (bagian 8) |
| **Kelas 2,5 m:** tangki, engine, adapter, decoupler, nose cone, heat shield | — | — | — |
| **Eksperimen dasar** ala Goo / Materials Bay | Jalankan, Lihat, Kirim, Reset | — | — |

**Angka acuan KSP1** (terverifikasi dari arsip wiki, doc 16). Ini titik awal penyeimbangan, bukan untuk disalin persis:

| Part | Angka acuan |
|---|---|
| Parasut utama | buka di 0,04 atm, penuh di 1 000 m |
| Drogue | 0,02 atm, penuh di 2 500 m |
| Status parasut | "berisiko" mulai ±250 m/s; mode "buka saat aman" adalah default |
| RCS | blok RCS 1 kN; Vernor 12 kN |
| Baterai | 5 kg per 100 EC |
| RTG | 0,75 EC/s |
| Panel surya kelas OX-10 | 8,25 EC/s |
| Docking port | ukuran 0,625 / 1,25 / 2,5 m |

**Cara kerja parasut** (seperti KSP1 sejak 1.2):

| Cara | Perilaku |
|---|---|
| **Dari staging** | Saat stage-nya aktif, parasut **dipasang (armed)**. Parasut lalu terbuka **otomatis**: setengah terbuka saat tekanan udara mencapai batas minimumnya, terbuka penuh di ketinggian buka penuh. Mode default adalah **"buka saat aman"**: parasut menunggu kecepatan turun ke batas aman supaya tidak robek. |
| **Manual dari panel part atau action group** | Tombol **Deploy**: pasang sekarang, lalu buka sesuai aturan tekanan dan ketinggian. Tombol **Buka paksa**: abaikan status aman, dengan risiko robek. Tersedia juga **Lepas pasang** (disarm) dan **Cut** (lepaskan parasut). |
| **Pengaturan per parasut** | Hangar dan inspektur: tekanan minimum, ketinggian buka penuh, sudut sebar, dan mode (buka saat aman / segera). |
| **Status** | Selalu tampil dengan teks: *Aman* / *Berisiko* / *Bahaya*, *Terpasang*, *Setengah terbuka*, *Terbuka*, *Dipotong*, *Robek*. |
| **Repack** | Saat EVA, engineer bisa mengemas ulang parasut (P1). |

**Infrastruktur peluncuran** (pertanyaanmu tentang launchpad). Di KSP, penyangga roket adalah **part** yang dipasang di Hangar:
- **launch clamp** dipasang radial di roket, lalu memanjang otomatis sampai menyentuh pad;
- clamp **menahan roket** dan **menyuplai listrik** selama terpasang. Untuk KSP2, apakah clamp juga menyuplai bahan bakar *(belum terverifikasi)*;
- clamp **dilepas lewat staging**, biasanya bersamaan dengan menyalakan mesin.

Di game kita sekarang, menara di pad hanya hiasan. 🔶 Usulan:
- **P0:** launch clamp sebagai part (radial, tinggi otomatis, menahan roket, listrik), masuk ke staging.
- **P1:** part menara atau lengan umbilikal yang ikut di-stage.
- Hiasan pad bawaan tetap ada sebagai dekorasi.

Catatan untuk part yang sudah ada:
- **"BST-1 Booster"** sekarang roket cair. 🔶 Jadikan SRB sungguhan, atau ganti namanya.
- **Pod** perlu cadangan monoprop kecil. 🔶 Tanpa parasut bawaan (❓ bagian 15).

### 4.3 Kontrol dan aturan part (P0)

- **Engine:** thrust limiter dengan angka, gimbal lock dan limit, status (thrust, Isp, aliran, alasan flameout). Independent throttle masuk P1.
- **Tangki:**
  - transfer antar tangki: pilih sumber dan tujuan, lalu tombol stop, dengan laju yang terlihat;
  - kunci aliran per resource;
  - laju dan waktu habis.
  Prioritas aliran yang diatur pemain masuk P1.
- **Listrik:**
  - panel surya bergantung pada **sudut, jarak ke matahari, dan bayangan planet**, saat terbang maupun di background;
  - **mengirim data memakan listrik dan waktu**;
  - probe core memakai listrik;
  - listrik habis membuat probe tidak bisa dikendalikan, lalu muncul notifikasi;
  - Hangar menampilkan **neraca daya** (siang dan malam).

### 4.3b Sumber kendali (bug yang ditemukan)

ADR 0109 menetapkan bahwa kendaraan hanya bisa dikendalikan kalau punya **pod berawak yang benar-benar berisi kru**, atau **probe core dengan sinyal**.

Di kode, pod dihitung "berawak" hanya karena **punya kursi** (`packages/sim/src/comms.ts:247-252`). Akibatnya roket dengan pod kosong, tanpa probe core dan tanpa antena, tetap bisa diterbangkan. ADR 0109 memberi pengecualian "sampai sistem kru ada (plan 106)", tapi pengecekannya tidak diperbarui setelah plan 106 selesai.

| # | Butir | Prio |
|---|---|---|
| 4.3b.1 | Pod dihitung berawak hanya kalau **ada kru di kursinya**. | P0 |
| 4.3b.2 | Kendaraan tanpa sumber kendali tidak bisa dikendalikan. Tampilannya: chip *"Tidak terkendali: tidak ada kru atau probe core"*. | P0 |
| 4.3b.3 | Probe tanpa sinyal mengikuti aturan world: Career/Science `none`, Sandbox `full` (ADR 0109). | P0 |
| 4.3b.4 | **Laporan pra-terbang** di Hangar dan Launch memberi peringatan untuk:<ul><li>tidak ada sumber kendali;</li><li>pod tanpa kru;</li><li>probe tanpa antena;</li><li>tanpa parasut padahal kendaraan berawak.</li></ul> | P0 |
| 4.3b.5 | Level SAS tergantung pilot atau probe core (5.9). | P1 |

### 4.4 Part P1 dan P2

- **P1:**
  - lampu (U), tangga, pod 3 kursi, lander can, kokpit, kabin kru;
  - jet dan air intake, engine multimode, motor roda;
  - engine nuklir, engine lander, separatron, airbrake, cargo bay dan service bay;
  - antena relay, kursi eksternal.
- **P2:**
  - drill dan converter di kendaraan, tangki ore, scanner, radiator, fuel cell, lab;
  - robotik, deployed science, surface feature.

---

## 5. Model terbang

Sumber: doc 07 dan 15a. Fondasi kita sudah kuat: langkah tetap 50 Hz, floating origin, on-rails, drag per part, sayap, panas skin, ablator, impact, dan buoyancy.

| # | Butir | Prio |
|---|---|---|
| 5.1 | **Efek Mach dan transonik**, plus **kurva suhu atmosfer per planet**. Sekarang atmosfernya isotermal 288 K. | P0 |
| 5.2 | **Aerodinamika parasut:** setengah terbuka saat tekanan cukup, terbuka penuh di ketinggian tertentu, robek kalau terlalu cepat. Pelajaran dari KSP2 0.2.2: selalu tampilkan status aman. | P0 |
| 5.3 | **Aturan "panas reentry %"** (opsi aksesibilitas paling sering dipakai di KSP). Juga "crash damage" dan "unbreakable joints" di Sandbox. | P0 |
| 5.4 | **SRB** dan **launch clamp** di fisika. | P0 |
| 5.5 | **Warp yang fleksibel** (lihat 5.13). | P0 |
| 5.5b | **Batas suhu per jenis part:**<ul><li>kebanyakan part ±2000 K, pod ±2400 K, heat shield ±3300 K, seperti KSP;</li><li>sekarang semua part 1000 K.</li></ul>**Batang suhu** muncul di dekat part yang memanas dan di inspektur part. | P0 |
| 5.6 | Body lift; suhu internal dan konduksi; panas saat on-rails. | P1 |
| 5.7 | Kerusakan tabrakan antar part dan antar kendaraan. | P1 |
| 5.8 | Batas g untuk part, dan G-LOC yang benar-benar mengambil kendali (sekarang hanya chip). | P1 |
| 5.9 | **Mode SAS dibatasi level pilot atau jenis probe**, seperti KSP. | P1 |
| 5.10 | Suspensi kaki dan roda. | P1 |
| 5.11 | Debris yang persisten, plus batas jumlah debris. | P1 |
| 5.12 | Joint lentur dan overstress (opsional; sekarang kaku by design, ADR 0018). | P2 |

### 5.13 Warp yang lebih enak dipakai

**Sekarang:** warp on-rails ditolak selama **ada kendaraan yang sedang terbang**. Pemain harus menunggu sampai kendaraan stabil di orbit atau diam di tanah selama 2 detik. Physics warp belum ada. Akibatnya pemain sering mendapat pesan "set warp to 1 first" tanpa tahu harus berbuat apa.

**KSP1** (terverifikasi, doc 16):
- **physics warp ×2–×4** bisa dipakai di mana saja, termasuk di atmosfer dan saat mesin menyala;
- **warp on-rails** (×5 sampai ×100 000) **tidak perlu orbit**, tapi syaratnya:
  - tidak ada gaya dorong;
  - kendaraan **di atas batas ketinggian** per planet: misalnya Kerbin di atas 70 km untuk ×5–×50, naik bertahap sampai ×100 000 di atas 600 km;
  - atau sedang diam di permukaan.

🔶 **Rancangan kita:**

| # | Aturan |
|---|---|
| W1 | **Physics warp ×2, ×4** (dan ×10 di segmen v2) tersedia di mana saja: atmosfer, mesin menyala, mendarat. Biayanya: langkah fisika dikalikan, jadi ada batas CPU. Kalau frame tertinggal, warp diturunkan otomatis dengan pesan. |
| W2 | **Warp on-rails tanpa harus orbit.** Boleh kalau mesin mati, kendaraan aktif dan kendaraan lain dalam jangkauan fisika tidak sedang di atmosfer, dan ketinggian di atas batas per planet. Batasnya dihitung otomatis dari tinggi atmosfer dan medan, dengan tabel per tingkat seperti KSP. Mendarat atau mengapung juga boleh. |
| W3 | **Tidak pernah ditolak tanpa penjelasan.** Kalau pemain meminta warp lebih tinggi dari batas, warp **dinaikkan sejauh yang boleh**, lalu time bar menunjukkan alasannya. Contoh: *"Maks 4× — mesin menyala"*, *"Maks 1k× — di bawah 120 km"*. |
| W4 | **Transisi otomatis:** kalau mesin menyala saat warp on-rails, warp turun ke physics warp. Kalau warp on-rails turun ke ×1, kendaraan kembali ke fisika dengan aman (sudah ada). |
| W5 | **Warp-to** (alarm, node, Ap/Pe, SOI, jendela transfer) mengatur levelnya sendiri dan berhenti tepat sebelum kejadian, dengan jarak aman. |
| W6 | Kendaraan **lain** di luar jangkauan fisika selalu on-rails, jadi tidak membatasi warp. Kendaraan yang sedang di atmosfer **tanpa ada yang melihat** disimulasikan sesuai aturan 3.6. 🔶 Untuk warp tinggi, kendaraan seperti itu tidak dihapus seperti di KSP (KSP menghapus kendaraan di bawah ±23 km). Kendaraan itu dibekukan sampai warp turun, lalu muncul peringatan. |

---

## 5b. Debug, log, dan cheat untuk pengujian

Sumber: doc 12 §4 dan §6.4. KSP1 punya **Alt+F12 debug** (cheat, set orbit, konsol log) dan pemain memakainya untuk menguji desain. Kita sekarang hanya punya autopilot khusus mode dev.

Panel ini penting untuk dua hal:
- pemain bisa menguji desain tanpa terbang 30 menit;
- **pengujian rilis dan e2e oleh agen** bisa langsung ke situasi yang mau diuji.

| # | Butir | Prio |
|---|---|---|
| 5b.1 | **Panel Debug**, dibuka lewat tombol (🔶 `Alt+F12`, sama seperti KSP) dan menu ☰. Tab-tabnya:<ul><li>**Cheats**</li><li>**Set orbit**</li><li>**Set lokasi**</li><li>**Resource**</li><li>**Log**</li><li>**Overlay**</li><li>**Info**</li></ul> | P0 |
| 5b.2 | **Cheats** (sakelar):<ul><li>bahan bakar tak terbatas, listrik tak terbatas, monoprop dan propelan EVA tak terbatas;</li><li>tanpa kerusakan tabrakan, abaikan batas suhu, unbreakable joints;</li><li>komunikasi tanpa sinyal;</li><li>life support tak habis;</li><li>tambah dana, sains, dan reputasi;</li><li>konstruksi instan, buka semua tech.</li></ul> | P0 |
| 5b.3 | **Set orbit:**<ul><li>pilih planet;</li><li>isi ketinggian Ap/Pe, atau a, e, i, Ω, ω, dan anomali;</li><li>preset: "orbit rendah", "orbit bulan", "transfer ke …";</li><li>bisa diterapkan ke kendaraan aktif atau kendaraan baru.</li></ul> | P0 |
| 5b.4 | **Set lokasi:** mendarat di site, di koordinat tertentu, atau di ketinggian tertentu di atmosfer dengan kecepatan tertentu (untuk menguji parasut dan reentry). | P0 |
| 5b.5 | **Set resource:** isi, kosongkan, atau **set nilai persis** per tangki dan per resource. Juga set suhu part dan level kru (untuk menguji). | P0 |
| 5b.6 | **Log:**<ul><li>kejadian simulasi (stage, decouple, ledakan beserta alasannya, perubahan kendali, warp ditolak beserta alasannya);</li><li>peringatan dan error, termasuk error JS;</li><li>filter, salin, dan unduh sebagai file. Juga dipakai untuk melaporkan bug.</li></ul> | P0 |
| 5b.7 | **Overlay:** panah gaya aero, gradien suhu, CoM/CoL/CoT, collider, jangkauan fisika. | P1 |
| 5b.8 | **Info:** FPS, waktu simulasi per langkah, jumlah kendaraan, memori, versi. | P0 |
| 5b.9 | **Aturan akses:**<ul><li>**Sandbox:** selalu tersedia.</li><li>**Mode lain:** perlu menyalakan *"Mode debug"* di Settings. Save lalu ditandai **"menggunakan cheat"** (terlihat di Worlds dan di prestasi), dan prestasi tidak didapat selama cheat aktif. ❓ Setuju?</li><li>**Career Hardcore:** terkunci. ❓</li></ul> | P0 |
| 5b.10 | **API yang sama untuk script dan e2e** (`debug.setOrbit`, `debug.setResource`, …), hanya aktif kalau mode debug menyala. | P0 |

---

## 6. Navigasi dan pengelolaan kendaraan

Sumber: doc 08, 14, dan 15c. Yang sudah ada: patched conics, SOI, closest approach, gizmo node, aid rendezvous, dan warp ke burn.

| # | Butir | Prio |
|---|---|---|
| 6.1 | **Pindah kendaraan dan terbangkan kendaraan mana pun:** tombol `[` / `]` dalam radius ±2,5 km, "Switch to" di map, dan dari daftar. Ini butuh **desain per kendaraan** (sekarang hanya kendaraan fokus yang bisa diterbangkan). | P0 |
| 6.2 | **Docking:** port saling menarik, dua kendaraan menjadi satu, undock memisahkan kembali (nama dan jenis kembali), crossfeed. Juga **indikator keselarasan** dan kamera Locked. | P0 |
| 6.3 | **Daftar kendaraan** di Mission Center dengan filter 9 jenis (debris, probe, rover, lander, ship, station, base, plane, relay, ditambah EVA dan flag). Aksi yang tersedia: Fly, **Recover dengan pratinjau nilai**, Terminate, dan Rename/ganti jenis. | P0 |
| 6.4 | **Nilai recover** 🔶 mengikuti KSP: 100 % di pad, 98 % di area Space Center, lalu berkurang sesuai jarak. Kru dan sains ikut dikreditkan. | P0 |
| 6.5 | **Editor node dengan angka:** Δv per sumbu dan waktu ±, tombol ±orbit, panel untuk **setiap** node, bukan hanya node pertama. | P0 |
| 6.6 | **Marker AN/DN** di map, dan **Ap/Pe pada orbit rencana**. | P0 |
| 6.7 | **Warp ke Ap, Pe, SOI, dan node**, dengan jarak aman. | P0 |
| 6.8 | **Alarm buatan pemain:** waktu, node, Ap/Pe, SOI, dan jendela transfer. Alarm menghentikan warp dan juga berlaku untuk kendaraan di background. | P0 |
| 6.9 | **Tampilan jendela transfer minimum:** "jendela berikutnya ke planet X dan Δv-nya", dari trip planner yang sudah ada. | P0 |
| 6.10 | Δv per stage dengan pilihan planet dan situasi, juga saat terbang. | P0 |
| 6.11 | Snap node ke marker dan circularise sekali klik; waypoint kontrak di navball; batas jumlah conic patch. | P1 |
| 6.12 | Porkchop, prediksi jatuh di atmosfer, ground track. | P2 |

---

## 7. Panel vessel dan HUD

Sumber: doc 03, 04, 05 §4, dan Base v2.

| # | Butir | Prio |
|---|---|---|
| 7.1 | **Panel vessel:** lebar **340 px** dan bisa diubah 300–440 px. Di bawah 300 px, slider berubah menjadi angka dengan tombol − dan +. | P0 |
| 7.2 | **Tab panel:** Overview (sakelar grup dengan teks jumlah, misalnya "Engines 3/4") · Parts (grup per jenis, kotak cari, filter stage) · **Resources (baru: level, laju, waktu habis, transfer)** · Comms. | P0 |
| 7.3 | **Inspektur per part** (komponen yang sama di Hangar dan Flight). Dibuka dengan klik part di 3D atau klik barisnya. Lebar 320 px. **Pin** sampai 3, ditumpuk di kiri panel dan tidak pernah menutupi kendaraan. Angka bisa diketik dengan satuan. Isi lanjutan ada di "Lainnya". | P0 |
| 7.4 | Sorotan dua arah antara baris dan part. State selalu dibaca dari simulasi. Status selalu memakai teks juga, tidak pernah hanya warna. | P0 |
| 7.5 | **Spesifikasi wilayah HUD**, termasuk aturan per lebar layar (rincian di bawah tabel ini). | P0 |
| 7.6 | Perbaikan cepat: badge blackout dobel, nilai px dan warna di luar token, dua skala huruf di dock, pause yang membuka menu, serta tombol Camera dan Crew di toolbar yang masih nonaktif dengan tooltip usang. | P0 |
| 7.6c | **Kamera melompat saat panel dibuka atau ditutup** (dilaporkan pemilik). Ini disengaja sejak plan 023: titik tengah gambar digeser ke tengah area yang tidak tertutup panel (`packages/renderer/src/scene.ts:766-779`; insets dihitung di `apps/web/src/routes/flight/+page.svelte:606-624`). Akibatnya, setiap kali panel dock kiri atau panel vessel kanan di-toggle, roket **meloncat ke samping ±150–200 px secara instan**.<br>KSP tidak menggeser kamera saat jendela dibuka. Konsep UI kita juga memakai panel kaca yang melayang di atas 3D.<br>🔶 **Usulan:**<ul><li>**panel samping tidak menggeser kamera**, karena panel itu melayang di atas pemandangan;</li><li>pergeseran vertikal tetap ada, tapi **konstan**, dihitung dari time bar, modul navball, dan status bar Base v2 yang selalu ada;</li><li>kalau suatu saat ada pergeseran yang berubah, transisinya **halus** (±250 ms) dan mengikuti *reduced motion*;</li><li>opsi Settings: "Pusatkan kendaraan di area kosong" (default mati).</li></ul> | P0 |
| 7.6d | **Masalah lain di layar Flight saat di pad** (dari screenshot pemilik):<ul><li>Label situasi berbunyi **"FLYING OVER EARTH"** padahal roket diam di pad (ALT 0,0, VEL 0,0). Seharusnya *"Di landasan, siap meluncur"* (KSP: *Pre-launch*), lalu *Landed* atau *Splashed*.</li><li>Panel Orbit di pad menampilkan Apoapsis 3,0 m, Periapsis −6,36 Mm, dan waktu "in 29:53". Saat mendarat, ganti dengan *"Di permukaan, belum ada orbit"*, dan sembunyikan waktu menuju Ap/Pe.</li><li>**"No crew aboard"** dan **"No antenna"** tampil, tapi roket tetap bisa di-throttle dan di-stage. Ini konfirmasi bug kendali 4.3b.</li><li>Jam menunjukkan **T+07:37** sebelum peluncuran. 🔶 MET seharusnya mulai saat lepas landas. Sebelumnya tampilkan jam world (T+ hanya untuk misi).</li><li>Tombol **"Catch up to now"** muncul di world Sandbox sistem stock. Tombol ini hanya bermakna untuk kalender nyata (Sol). ❓ Cek apakah sistem stock juga memakai kalender Gregorian.</li><li>Throttle awal 100 %. Di KSP throttle awal 50 % *(belum terverifikasi)*. 🔶 Ikuti KSP, atau setidaknya jangan 100 % sebelum ada sumber kendali.</li></ul> | P0 |
| 7.6b | **Isi panel Parts, lengkap per jenis part** (tabel di bawah). Semua aksi juga bisa dijalankan dari inspektur, action group, dan script. | P0 |
| 7.7 | Edit action group saat terbang ("Tambahkan ke grup…"); G-meter, Mach, dan tekanan dinamis; flight log (F3). | P1 |

Spesifikasi wilayah HUD (7.5), dalam px pada skala 100 %:

| Wilayah | Lebar (min – default – max) | Tinggi | Saat layar sempit |
|---|---|---|---|
| Dock kiri | 260 – 280 – 400 | dibatasi, scroll di dalam | laci |
| Panel vessel | 300 – 340 – 440 | dibatasi, scroll di dalam | laci |
| Navball | 390 × 262 tetap | — | — |
| Staging | 200 – 220 – 280 | maksimum dibatasi, scroll di dalam | — |
| Kru | — | maksimum 3 baris | — |
| Toast | — | maksimum 4 | di bawah menu bar, tidak pernah menutupi navball |

Aturan per lebar layar:
- **≥ 1440 px:** dua panel samping boleh terbuka sekaligus.
- **< 1280 px:** satu panel samping saja.
- **≤ 1024 px:** laci dan target sentuh 44 px.
- **Semua skala UI:** teks minimal 10 px.
- **Semua panel bawah:** `bottom: 56px` (Base v2).

**Isi panel Parts per jenis part** (7.6b, dari doc 03 §6.3).
- **P0** adalah yang diharapkan pemain KSP sejak hari pertama.
- **P1** adalah yang diharapkan setelah part-nya ada.

| Jenis part | P0 | P1 |
|---|---|---|
| Pod / probe core | Kendalikan dari sini; ganti nama dan jenis kendaraan; level SAS; daftar kru dengan tombol EVA dan transfer | hibernasi; arah depan; data tersimpan |
| Engine | nyala/mati; thrust limiter dengan angka; status (thrust, Isp, aliran, alasan flameout) | gimbal lock/limit; ganti mode; independent throttle |
| Tangki / baterai | batang per resource: jumlah, kapasitas, **laju**, **waktu habis**; kunci aliran | transfer masuk/keluar dengan laju; prioritas aliran |
| RCS | nyala/mati; thrust limiter | sakelar per sumbu |
| Reaction wheel | nyala/mati; mode (normal, hanya SAS, hanya pilot) | batas authority |
| Control surface | sakelar pitch/yaw/roll; batas authority; deploy | invert; sudut deploy |
| Decoupler | Decouple; sakelar "ikut staging" | sakelar crossfeed |
| Docking port | Undock; Kendalikan dari sini; Jadikan target; crossfeed | angle snap |
| Fairing | Buang | — |
| Parasut | Deploy; Buka paksa; Lepas pasang; Cut; **status aman**; tekanan minimum; ketinggian buka | sudut sebar; repack saat EVA |
| Kaki / roda pendarat | naik/turun; rem | gesekan; pegas dan peredam |
| Roda | motor nyala/mati dan batasnya; steering nyala/mati dan invert; rem | traksi |
| Panel surya | buka/tutup; paparan dan output | ikuti matahari |
| Antena | buka/tutup; kirim; status link | info gabungan |
| Lampu | nyala/mati; warna | berkedip |
| Eksperimen | jalankan; lihat; kirim; reset; ambil (saat EVA) | nilai yang tersisa di situasi ini |
| **Setiap part** | nama; sorotan; pin; **suhu saat panas** (batang suhu); keanggotaan action group | arahkan kamera; info part |

---

## 8. Hangar

Sumber: doc 02 §15 dan 05 §2. Model datanya sudah ada; yang belum ada adalah **rasa tangannya**.

| # | Butir | Prio |
|---|---|---|
| 8.1 | **Part menempel di kursor:** node menyala saat part mendekat, snap, klik untuk menaruh, dan menjatuhkan part ke katalog berarti menghapus. | P0 |
| 8.2 | Ambil part beserta anak-anaknya; rakitan yang mengambang; **Alt-klik untuk menyalin**; surface attach di sisi mana pun; tahan Alt untuk "hanya node". | P0 |
| 8.3 | **Symmetry 1–8 dan mirror (R), diwariskan ke anak part**, dihitung sebagai satu langkah undo. | P0 |
| 8.4 | Rotasi WASDQE (Shift untuk halus, Space untuk reset) dan snap sudut C. | P0 |
| 8.5 | **Kamera turntable:** roda mouse untuk naik/turun, Shift/Ctrl + roda untuk zoom, klik tengah untuk fokus. Kamera pan untuk pesawat. | P0 |
| 8.6 | **Inspektur per part di Hangar** (sama dengan 7.3). Perubahan berlaku ke semua part simetrinya. | P0 |
| 8.7 | **Editor action group:** pilih grup, klik part, pilih aksinya. | P0 |
| 8.8 | Δv dan TWR per stage dengan **pilihan planet dan situasi**; **neraca daya**. | P0 |
| 8.9 | **Fairing prosedural:** klik untuk menambah bagian, pegangan 3D, dan kolom angka. | P0 |
| 8.10 | Penugasan kru di Hangar. | P1 |
| 8.11 | Gizmo offset dan rotate dengan sumbu lokal/global dan **kolom angka**, tanpa batas offset kaku; **re-root**; daftar pohon part. | P1 |
| 8.12 | Merge craft, thumbnail, ekspor/impor file craft dan link. | P1 |
| 8.13 | Tangki dan sayap prosedural. | P2 |

### 8b. Sambungan antar part dan bug geometri 3D

**Bug yang ditemukan:** ada celah tembus pandang di antara BST-1 Booster dan nose cone, terlihat di Hangar.

**Penyebab:** di `packages/renderer/src/parts/generators/booster.ts:14-20`, profil cincin atas booster digambar **dari atas ke bawah**. Aturan di `revolve.ts` mengharuskan profil digambar **dari bawah ke atas**, karena dari arah itulah normal permukaan menghadap keluar. Akibatnya dinding cincin itu menghadap ke dalam dan tidak dirender saat dilihat dari luar, jadi terlihat bolong.

Generator lain sudah benar: tank, engine, decoupler, capsule. Perbaikannya membalik urutan titik profil cincin itu.

**Cara KSP menutup sambungan** (tidak ada "penambal otomatis" yang berlaku umum):

| Cara | KSP1 | KSP2 |
|---|---|---|
| **Ukuran node standar** (0,625 / 1,25 / 1,875 / 2,5 / 3,75 / 5 m). Setiap model part dibuat agar tepinya **pas persis** dengan diameter node, sehingga part berukuran sama selalu menyambung rapi | ✅ | ✅ |
| **Shroud otomatis.** Engine dan decoupler memunculkan selubung sendiri saat ada part yang dipasang di bawahnya, sehingga celah di sekitar mesin tertutup | ✅ *(detail per part belum diverifikasi)* | ✅ |
| **Adapter ukuran:** part transisi, misalnya 1,25 ↔ 2,5 m | ✅ | ✅ |
| **Fairing prosedural:** pemain membangun selubung atau kerucut di sekeliling muatan dengan mengklik per bagian (sejak 1.0) | ✅ | ✅ (lebih fleksibel) |
| **Nose cone dan tail cone** di semua ukuran | ✅ | ✅ |
| **Varian part** (1.4+): warna dan bentuk dipilih agar serasi | ✅ | ✅ |

**🔶 Rancangan kita:**

| # | Butir | Prio |
|---|---|---|
| 8b.1 | Perbaiki profil cincin booster. | P0 |
| 8b.2 | **Test geometri otomatis** untuk setiap generator part:<ul><li>semua permukaan luar menghadap keluar, sehingga tidak ada dinding yang hilang saat dilihat dari luar;</li><li>**tepi muka sambungan sama dengan radius node**, toleransi < 1 mm, untuk setiap pasangan part yang bisa disambung.</li></ul>Test ini mencegah bug serupa terulang. | P0 |
| 8b.3 | **Ukuran node eksplisit di setiap part:** 0,625 / 1,25 / 2,5 m. Hangar menandai sambungan yang ukurannya tidak cocok. | P0 |
| 8b.4 | **Shroud otomatis** pada engine dan decoupler, menyesuaikan ukuran part di bawahnya. | P0 |
| 8b.5 | **Adapter ukuran** 0,625 ↔ 1,25 dan 1,25 ↔ 2,5, plus **nose cone dan tail cone di setiap ukuran**. | P0 (bersama kelas 2,5 m) |
| 8b.6 | **Lebih baik dari KSP:** saat pemain menyambung dua part berbeda ukuran, Hangar **menawarkan adapter otomatis** ("Sisipkan adapter 1,25 → 2,5 m?"), satu klik. | P1 |
| 8b.7 | **Fairing prosedural** (sudah ada di 8.9), sekaligus untuk interstage. | P0 |
| 8b.8 | Hangar selalu memakai detail geometri tinggi, supaya part bulat tidak tampak bersegi seperti di foto pada preset grafis rendah. Detail rendah hanya untuk Flight jarak jauh. | P1 |
| 8b.10 | **Hangar terasa lebih luas** (permintaan pemilik). Menara servis, catwalk, dan crane tetap dipertahankan sebagai detail, tapi posisinya **dimundurkan dari area rakit**.<br>**Sekarang** (`packages/renderer/src/vab/hangar.ts:812-813`):<ul><li>dua menara berada di x = ±9,5 m, z = −7 m, padahal ruangannya ±30 m;</li><li>swing arm di setiap dek menjulur sampai **1,6 m dari sumbu roket**, sehingga terasa sempit saat kamera diputar.</li></ul>🔶 **Usulan:**<ul><li>menara pindah ke sekitar x = ±15 m, z = −13 m;</li><li>swing arm berhenti di tepi platform (±6,2 m), atau dibuat **menyesuaikan diameter roket** dengan jarak bebas di sekelilingnya, supaya tidak menembus roket 2,5–3,75 m nanti;</li><li>lampu sorot (`hangar.ts:822-825`), sel keselamatan, dan lintasan crane, tug, serta kru (`hangar-movers.ts`) ikut digeser;</li><li>batas zoom kamera turntable disesuaikan.</li></ul>Verifikasi lewat screenshot dari 4 sudut. | P1 (cepat, bisa ikut G6) |
| 8b.11 | **Bug: bayangan berkedip di preset High** (dilaporkan pemilik, di sekitar pad). Penyebabnya belum dipastikan. Ada tiga dugaan yang paling mungkin, diurutkan:<ol><li>**Quality governor naik-turun preset.** Governor menurunkan resolusi, lalu preset, saat frame di bawah ±55 fps, kemudian **mencoba naik lagi** setelah tenang (`packages/renderer/src/quality-governor.ts`). Setiap ganti preset High ↔ Medium mengubah ukuran shadow map (4096 ↔ 2048). Ukuran baru diterapkan beberapa frame kemudian (`environment.ts:232-261`, `settleShadowMap`), dan `map.setSize` mengalokasikan ulang tekstur kedalaman. Shader tanah planet memakai `shadow.map.depthTexture` (`environment.ts:398`), jadi bisa sempat membaca tekstur kosong atau usang. Hasilnya bayangan hilang lalu muncul lagi. Di laptop yang panas, governor sering naik-turun, sehingga kedipnya berulang.</li><li>**Matriks bayangan dari frame sebelumnya.** `shadowMatrix` disalin **sebelum** three.js memperbarui matriks bayangan di frame ini (`environment.ts:417`). Kalau fit bayangan berubah, tanah memakai matriks lama selama satu frame.</li><li>Ambang `nearSite` (300 m) membuat ukuran area bayangan melompat saat kendaraan melintasinya. Ini tidak cocok dengan foto di pad, jadi kemungkinannya kecil.</li></ol>**Cek cepat untuk pemilik:** Settings → Graphics, pilih **High**, lalu matikan **"Adjust quality while playing"**. Kalau kedipnya hilang, penyebabnya dugaan 1.<br>🔶 **Perbaikan:**<ul><li>shadow map dialokasikan **sekali pada ukuran terbesar** preset pemain, dan governor hanya menurunkan resolusi atau *update rate* bayangan, tanpa mengalokasikan ulang;</li><li>matriks bayangan untuk shader planet diambil **setelah** shadow pass;</li><li>governor diberi histeresis lebih panjang sebelum naik preset;</li><li>panel Debug → Info menampilkan level governor dan perubahannya, untuk diagnosis.</li></ul> | P0 |
| 8b.9 | **Pemeriksaan visual sambungan:** screenshot otomatis dari sudut tetap untuk setiap part dan pasangan umum (cone di booster, engine di tank, decoupler), disimpan di jurnal untuk direview. | P1 |

**Lebih baik dari KSP:**
- daftar langkah snap;
- tweak, staging, dan simetri sebagai satu langkah undo;
- model kamera yang tidak pernah diubah (keluhan nomor satu di KSP2).

**Untuk layar sentuh:** chip di layar menggantikan tombol pengubah, dan pegangan berukuran 44 px.

---

## 9. EVA dan kru

Sumber: doc 10 dan 15d.

| # | Butir | Prio |
|---|---|---|
| 9.1 | **Fokus ke suit saat EVA dan HUD EVA:** propelan, O₂, radio. Sekarang suit tidak bisa dikendalikan dari HUD. Tombol mengikuti KSP1 (terverifikasi):<ul><li>WASD untuk jalan, Shift untuk lari, Space untuk lompat;</li><li>R untuk jetpack nyala/mati, dengan **translasi** dan bantuan orientasi;</li><li>**F** untuk berpegangan pada tangga;</li><li>**B** untuk naik ke kapal;</li><li>O untuk helm;</li><li>P untuk parasut pribadi.</li></ul> | P0 |
| 9.2 | **Jetpack yang bisa lepas landas dari bulan.** KSP1 memakai 270 N dan 5 unit propelan, dengan Δv sekitar 600 m/s (terverifikasi, doc 16). Kita sekarang 50 N dengan Δv ±31 m/s, hanya ke arah atas. 🔶 Usulan: 270 N dengan Δv 300–600 m/s. | P0 |
| 9.3 | **Tangga dan pegangan:** memanjat dan melepas. Naik ke kapal **harus di hatch atau tangga**, dengan cek hatch terhalang beserta alasannya. ❓ Radius 50 m tetap ada sebagai bantuan di Sandbox? | P0 |
| 9.4 | Jatuh, pingsan, dan mati saat EVA; parasut pribadi; lampu suit; EVA report; bendera dengan nama dan plakat. | P1 |
| 9.5 | **Potret kru yang bereaksi** terhadap g-load, life support, dan bahaya. Murah dibuat, nilai emosionalnya besar. | P1 |
| 9.6 | **Profesi yang berpengaruh:** pilot membuka mode SAS, engineer bisa memperbaiki dan repack parasut, scientist bisa reset eksperimen. Sekarang 5 dari 7 kemampuan kru tidak pernah dibaca simulasi. | P1 |
| 9.7 | Kontrak rescue; kursi eksternal; UI untuk transfer kru dan memberhentikan kru (fungsinya sudah ada di simulasi). | P1 |
| 9.8 | Inventory, konstruksi EVA, helm, IVA, berenang. | P2 |

---

## 10. Konten karier

Sumber: doc 14 dan 15d. Sistem karier kita sudah lebih kaya dari KSP (ekonomi, pasar, gedung, misi, milestone, agensi). Yang kurang adalah **isinya**.

| # | Butir | Prio |
|---|---|---|
| 10.1 | Tech tree diperluas dari 10 node, dengan tempat untuk semua part P0. Sebagai pembanding, KSP punya ±60 node. | P1 (P0 untuk menempatkan part baru) |
| 10.2 | Variasi kontrak: rescue, satelit, stasiun, base, survei. Sekarang ada 6 template. | P1 |
| 10.3 | Sains: memilih eksperimen atau hasil tertentu, reset, lab. | P1 |

---

## 11. Tampilan, suara, dan onboarding

Sumber: doc 13 dan 15b.

| # | Butir | Prio |
|---|---|---|
| 11.1 | **Mode kamera** Auto, Free, Orbital, dan Locked, diganti dengan **V** dan disertai toast. Fokus kamera ke part. Tombol Camera di toolbar diaktifkan. | P0 |
| 11.2 | **Sembunyikan UI (F2)** dan **screenshot** (unduhan PNG). | P0 |
| 11.3 | Efek baru: semburan RCS, visual parasut, debu saat mendarat. | P0 |
| 11.4 | **Suara:** ledakan, decouple, parasut, mendarat, RCS, EVA, jetpack, dan isyarat UI untuk map dan warp. | P0 |
| 11.5 | **Musik minimal:** menu, Space Center, Hangar, dan ambient luar angkasa, semuanya pelan secara default, dengan slider volume musik. ❓ ADR 0062 memutuskan "tanpa musik". Diubah? Kalau ya: musik prosedural, atau musik berlisensi CC? | ❓ |
| 11.6 | **Pelajaran setelah orbit pertama:** mendarat, maneuver node, rendezvous dan docking, transfer antarplanet. Ini topik yang KSP serahkan ke YouTube. | P0 |
| 11.7 | **Sistem tooltip** di setiap istilah HUD dan **glosarium**. Sekarang hanya `title=`. | P0 |
| 11.8 | Setiap isyarat suara juga punya tanda visual; reduced motion untuk guncangan kamera dan kilatan. | P0 |
| 11.9 | Kamera chase dan kokpit, photo mode, suara misi, musik adaptif. | P2 |

---

## 12. Settings, aturan world, dan tombol

Sumber: doc 12 dan 15 §5.

### 12.1 Tombol: bentrok dengan KSP (P0)

| Tombol | Kita sekarang | KSP | 🔶 Usulan |
|---|---|---|---|
| C | rem | IVA | **B** untuk rem; C kosong sampai ada IVA |
| `[` `]` | trim pesawat | pindah kendaraan | `[` `]` untuk **pindah kendaraan**; trim pindah ke **Alt + WASDQE**, reset dengan Alt + X |
| V | mode kecepatan | mode kamera | V untuk **kamera**; mode kecepatan diganti dengan klik pada angka kecepatan |
| N | mute | RCS mundur | N untuk **RCS mundur**; mute pindah ke Ctrl + M |
| 1–0 | mode SAS | action group | 1–0 untuk **action group**; mode SAS lewat tombol di navball dan **Alt + 1..0** |
| I K J L O U | edit node | translasi RCS (I K J L H N) | translasi untuk RCS; edit node **hanya aktif saat map terbuka dan node dipilih** |

Catatan terverifikasi (doc 16):
- di KSP1, **Backspace** menjalankan grup Abort, dan reset kamera memakai **`** (backtick);
- warp on-rails KSP1 sampai **100 000×** (di atas 600 km dari Kerbin);
- physics warp ×2–×4;
- batas debris default **250**, sebagai pengaturan.

🔶 Ada juga pilihan profil **"Orbital klasik"** di Settings untuk pemain lama. ❓ Setuju dengan profil default ala KSP?

**Tombol yang belum ada (P0):**
- R (RCS), G (gear), U (lampu), B (rem, tahan), Backspace (abort, perlu dicek karena tombol ini dicadangkan);
- F2 (sembunyikan UI), screenshot, / (stop warp), Caps Lock (presisi), translasi RCS;
- tombol EVA (9.1).

### 12.2 Aturan world

| Butir | Prio |
|---|---|
| **Izinkan revert**, **izinkan quickload**, **panas reentry %** | P0 |
| "Jeda diizinkan" (3.3) | P0 |
| Aturan bisa diubah di tengah permainan dengan changelog. `set-rule` sudah ada di simulasi tapi belum punya UI. 🔶 Usulan: hanya boleh ke arah lebih mudah, misalnya dari "tidak" ke "ya" | P1 |
| Paket Easy / Normal / Hard | P1 |
| Pengali toleransi G kru | P1 |
| Plasma blackout sebagai aturan | P1 |
| Panel cheat khusus Sandbox (bahan bakar tak terbatas, tanpa kerusakan tabrakan, set orbit), ditandai di save | P1 |

### 12.3 Settings

| Butir | Prio |
|---|---|
| **Ekspor/impor save**, dilindungi dari penghapusan oleh browser, plus peringatan kalau penyimpanan browser tidak persisten | P0 |
| Kebijakan tab tersembunyi yang jelas (3.5) | P0 |
| Skala UI sampai 200 %; palet ramah buta warna untuk marker dan garis orbit; toggle grafis satu per satu (bayangan, awan, AA, pixel ratio); **batas frame rate** (penting untuk laptop panas); guncangan kamera; sensitivitas mouse | P1 |
| Gamepad, pilihan bahasa (siapkan string key sekarang: P1), batas debris, batas conic patch | P2 |

---

## 13. Rilis dan operasional

Sumber: doc 15 §7.1 dan 15b §2.

| # | Butir | Prio |
|---|---|---|
| 13.1 | **Hosting di sub-path** (GitHub Pages `user.github.io/space-orbital-program/`):<ul><li>atur `paths.base`;</li><li>ganti ±40 link absolut dengan `base`;</li><li>path ephemeris;</li><li>fallback `404.html`.</li></ul> | P0 |
| 13.2 | **CSP dan isolasi sandbox script.** GitHub Pages tidak bisa mengatur header. Pilihannya:<ul><li>(a) CSP lewat `<meta>`, yang kehilangan `frame-ancestors` dan melemahkan isolasi (ADR 0038);</li><li>(b) host yang bisa mengatur header, misalnya Cloudflare Pages gratis dengan `_headers`.</li></ul>❓ 🔶 Saran: **(b) untuk produksi**, GitHub Pages sebagai preview. | P0 |
| 13.3 | **Penanganan error global:** `hooks.client.ts`, `unhandledrejection`, dan kartu error yang ramah, dengan tombol "simpan dan muat ulang". | P0 |
| 13.4 | **Job deploy di CI**, tag rilis, dan changelog publik. | P0 |
| 13.5 | **Uji manual manusia** (langkah plan 023 yang belum dikerjakan), plus checklist rilis. | P0 |
| 13.6 | E2E yang memblokir rilis di lebih dari satu engine browser. | P1 |
| 13.7 | Crash report opt-in dan halaman privasi. ❓ Mau ada telemetri? Saran: tidak, atau opt-in saja. | P1 |
| 13.8 | PWA, mode offline, dan cache file ephemeris 7,2 MB. | P2 |

---

## 14. Urutan pengerjaan, ADR, dan plan

### 14.1 Gelombang P0

Ukuran: S ≈ 0,75 jam, M ≈ 1,25 jam, L ≈ 2,25 jam kerja agen.

| Gelombang | Isi (nomor bagian) | Perkiraan plan | Bergantung pada |
|---|---|---|---|
| **G0 — Rilis dan operasional** | 13.1–13.4 | 2 (M + M) | — |
| **G1 — Kerangka world** | 2.1–2.6, 3.1, 3.8 | 2 (L + M) | — |
| **G2 — Aturan waktu** | 3.2–3.7, 12.2 jeda | 2 (M + M) | G1 |
| **G3 — Part paket 1: daya dan pulang** | 4.1, parasut, baterai, surya nyata, RTG, kirim data memakai listrik, 5.2 | 3 (L + M + M) | — |
| **G4 — Part paket 2: dorong dan struktur** | SRB, clamp, engine vakum, 2,5 m, monoprop dan RCS, eksperimen dasar, 4.3 engine dan tangki, 5.1 Mach dan atmosfer, 5.4 | 3–4 (L + L + M + M) | — |
| **G5 — Panel vessel dan HUD** | 7.1–7.6 | 2 (L + M) | G1 untuk posisi bar |
| **G6 — Hangar** | 8.1–8.9 | 3 (L + L + M) | G5 (inspektur), G3/G4 (part) |
| **G7 — Kendaraan** | 6.1–6.10 (switching, docking, daftar kendaraan, node, alarm, jendela transfer) | 4 (L + L + M + M) | G1, G4 (docking port) |
| **G8 — EVA** | 9.1–9.3 | 2 (M + M) | G7 (fokus kendaraan) |
| **G9 — Tampilan dan onboarding** | 11.1–11.8, tooltip | 3 (M + M + L pelajaran) | G3, G4, G7 untuk isi pelajaran |
| **G10 — Settings dan tombol** | 12.1, 12.2 P0, 12.3 P0 | 2 (M + M) | G7 (tombol pindah kendaraan) |
| **G2b — Warp dan debug** | 5.13 (W1–W6), 5b.1–5b.10 | 2 (M + L) | G1 (time bar) |
| **G3b — Kendali, panas, dan geometri** | 4.3b (bug kendali), 5.5b (batas suhu dan batang suhu), 8b.1–8b.4 (bug booster, test geometri, ukuran node, shroud) | 2 (M + M) | — |
| **G11 — Uji rilis** | 13.5, checklist, verifikasi semua | 1 | semua |

Total **±33 plan**, sekitar **34–45 jam agen**. Dengan tiga mesin, kira-kira **13–18 jam**.

### 14.2 Pembagian untuk tiga agen

| Agen | Lane |
|---|---|
| **Agent 1 (Lead, M5)** | G0 → G1 → G2 → G2b → G7 (docking dan switching, inti simulasi plus pengukuran) → G11 |
| **Agent 2 (M2)** | G5 → G6 → G9 (UI, Hangar, pelajaran) |
| **Agent 3 (Linux)** | G3b → G3 → G4 → G8 → G10 (part, modul, fisika, EVA, tombol) |

### 14.3 ADR yang akan ditulis

1. Dunia selalu berjalan: satu simulasi per world, keadaan jam, jeda, dan tab. Mengganti 0118 dan 0152.
2. Base layout sebagai kerangka world.
3. Paket part ala KSP: resource, modul, dan aturan listrik.
4. Model terbang tambahan: Mach, atmosfer, parasut, SRB.
5. Pindah kendaraan, desain per kendaraan, dan docking.
6. Panel vessel, inspektur, dan aturan lebar HUD.
7. Model interaksi Hangar.
8. EVA versi 2: fokus suit, jetpack, tangga, hatch.
9. Profil tombol (KSP sebagai default).
10. Hosting produksi dan CSP.
11. Musik (jika ADR 0062 diubah).

### 14.4 P1 setelah rilis

Gelombang berikutnya mengikuti baris P1 di bagian 4–13. Kira-kira **15–20 plan**:
- part P1;
- physics warp;
- profesi yang berpengaruh;
- potret kru;
- kontrak dan tech tree;
- gizmo dengan angka dan re-root;
- settings aksesibilitas;
- dan lainnya.

---

## 15. Semua pertanyaan untuk pemilik

| # | Pertanyaan | Usulan saya |
|---|---|---|
| 1 | Aturan "Jeda diizinkan" boleh diubah di tengah permainan? | Boleh, tapi hanya ke arah lebih mudah, dan tercatat |
| 2 | Menyusul waktu nyata saat game dibuka lagi: sekarang atau nanti? | Nanti (P2) |
| 3 | Pod punya parasut bawaan? | Tidak. Template pemula sudah menyertakan parasut |
| 4 | Naik kapal saat EVA: harus di hatch/tangga, atau tetap 50 m? | Harus di hatch/tangga; 50 m hanya bantuan di Sandbox |
| 5 | Segmen warp 100k× untuk Sol? | Ya, hanya untuk world Sol |
| 6 | Tombol pause? | `P` di semua halaman; Space hanya di luar Flight (di Flight, Space untuk staging) |
| 7 | Profil tombol default ala KSP, plus profil "Orbital klasik"? | Ya |
| 8 | "BST-1 Booster": jadikan SRB sungguhan, atau ganti nama? | Jadikan SRB sungguhan dan tambah ukuran |
| 9 | Musik: tetap tanpa musik (ADR 0062), prosedural, atau berlisensi CC? | Set kecil musik ambient, pelan secara default. Sumbernya keputusan Anda |
| 10 | Hosting produksi: GitHub Pages (CSP lewat meta) atau Cloudflare Pages (bisa header)? | Cloudflare Pages untuk produksi, GitHub Pages untuk preview |
| 11 | Telemetri atau crash report? | Tidak ada, atau opt-in saja |
| 12 | Jetpack: ikuti KSP (270 N, Δv ±600 m/s), atau lebih hemat? | 270 N dengan Δv 300–600 m/s |
| 13 | Lingkup rilis = semua P0 di dokumen ini (±29 plan)? | Ya. P1 untuk update pertama |
| 14 | Cheat di luar Sandbox: lewat "Mode debug" yang menandai save dan mematikan prestasi? Hardcore dikunci? | Ya, keduanya |
| 15 | Kendaraan di atmosfer yang tidak dilihat saat warp tinggi: dibekukan (usulan kita) atau dihapus seperti KSP? | Dibekukan, dengan peringatan |
| 16 | Launch clamp menyuplai bahan bakar juga, atau hanya listrik? | Listrik saja di P0; bahan bakar dari menara/umbilikal di P1 |
