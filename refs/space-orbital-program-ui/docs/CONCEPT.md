# Konsep Produk

## 1. Arah desain

**"Tesla untuk roket."** HUD game luar angkasa biasanya ramai: font digital, warna neon, panel bertumpuk. Desain ini mengambil arah sebaliknya:

- **Tenang dan gelap.** Latar hitam ruang angkasa; UI berupa panel kaca gelap yang mengambang.
- **Satu aksen.** Hampir monokrom; biru `#3E6AE1` hanya untuk hal yang *aktif atau dikendalikan* (SAS mode aktif, marker prograde, rute komunikasi, switch on).
- **Angka dulu, label belakangan.** Nilai memakai Manrope tabular. Label kecil ditulis kapital dengan tracking lebar, dan teks bantu berwarna abu-abu.
- **Compact.** Panel serapat mungkin supaya pandangan ke kapal dan peta tetap lega. Banyak panel bisa dibuka-tutup.
- **Flat.** Status aktif ditandai **ikon putih + titik 4 px**, bukan latar terisi.

## 2. Hierarki dunia

```
Game
├── Mods ............ global, aktif di SEMUA world
├── Vessel library .. desain kapal global, bisa diluncurkan di world mana pun
└── World (= save)
    ├── Aturan: mode (Sandbox / Science / Career), sistem bintang, kesulitan, rules
    ├── Progres: funds, science, reputation, tech, kontrak, strategi
    ├── Site: Space Center (utama) — nanti bisa ditambah base/koloni lain
    │   └── Bangunan: Hangar, Launchpad, Runway, Mission Center,
    │                 Astronaut Complex, R&D, Administration
    ├── Vessels yang sudah diluncurkan
    ├── Kru (terikat world)
    └── Jaringan komunikasi: ground station + relay
```

Keputusan penting:

- **Mod berlaku global.** Konsekuensinya, world yang dibuat dengan mod yang kemudian dihapus diberi peringatan *"Uses a mod that is no longer installed"* di kartunya.
- **Desain kapal global, vessel per world.** Desain yang butuh part dari mod yang tidak aktif ditandai tidak kompatibel.
- **Kru per world.** Valentina di world A berbeda dengan Valentina di world B.
- **Bangunan muncul sesuai mode.** Sandbox: Hangar, Launch, Mission Center. Science menambah R&D. Career membuka semuanya.

## 3. Tiga tampilan saat terbang

| Tampilan | Untuk apa | HUD |
|---|---|---|
| **Flight** | Menerbangkan kapal | Penuh: dock plugin, vessel panel, staging, navball, crew |
| **Map** | Merencanakan dan mengeksekusi maneuver | **HUD yang sama**, hanya kanvasnya diganti peta orbit. Editor maneuver menempel di navball. |
| **Mission Center** | Strategi, tanpa menerbangkan kapal | Peta seluruh sistem, ditambah panel strategis di pinggir layar (Tracking, Upcoming, Contracts, Crew roster, agency) |

Mission Center menggabungkan *Tracking Station* dan *Mission Control* dari KSP.

## 4. Sistem panel di Flight

- **Toolbar kanan atas:** `Map · VAB · Camera | Dock · Vessel · Staging · Nav · Crew | Menu`. Grup tengah membuka dan menutup panel.
- **Dock plugin (kiri):** rail ikon vertikal, satu panel terbuka pada satu waktu (mirip tab). Tombol `+` membuka **Panel library** untuk menambah atau menghapus panel, termasuk panel dari plugin pihak ketiga yang mendapat area render sendiri.
- **Vessel panel (kanan):** tiga tab.
  - **Overview:** info dan **Group control**, yaitu satu switch untuk semua part dalam satu grup (Engines, Batteries, Solar, Lights, Antennas). Saat sebagian part menyala, switch tampil di posisi *mixed*.
  - **Parts:** daftar part per kategori; tiap part punya switch, info, dan actions berupa ikon.
  - **Comms:** rute Auto/Manual, endpoint jaringan, channel radio, dan transmitter on-board (termasuk radio di baju kru).
- **Modul navball (bawah tengah):** satu bentuk menyatu yang berisi cincin navball, lengkung kecepatan vertikal, pod mode SAS, dan readout VEL/ALT.
- **Staging (kiri bawah):** antrean stage, stage *current* dengan Δv dan tangkinya, tombol GO, serta total Δv.
- **Crew (kanan bawah):** tiap kru menampilkan chip baju (EVA/IVA) dan sinyal radio. Status ini sinkron dengan tab Comms.

## 5. Prinsip yang dipakai berulang

1. **Satu bahasa visual di semua layar.** Kapsul 44 px, panel kaca radius 16, label kapital 8–9 px.
2. **Status selalu terlihat tanpa harus membuka panel.** Contohnya sinyal radio di crew, titik indikator di toolbar, dan chip status di bangunan.
3. **Yang bisa dikendalikan memakai aksen; yang hanya informasi tetap putih atau abu-abu.**
4. **Placeholder jujur.** Data yang belum ada ditulis `[—]`, bukan angka karangan.
