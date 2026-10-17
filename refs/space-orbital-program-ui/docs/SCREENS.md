# Inventaris Layar

Semua layar berukuran 1920 × 1080. "Interaksi" berarti sudah berfungsi di prototipe.

---

## 0 · Home — `Home.dc.html`
- **Kiri:** logo **SPACE ORBITAL PROGRAM**, tagline, tombol utama **Continue · [WORLD NAME 1]**, lalu menu Worlds, Vessel library, Mods, Settings. Di bawahnya tombol Roadmap dan Credits.
- **Kanan bawah:** kartu **Last world** berisi nama world, mode, sistem, kapal aktif, avatar kru, ALT/VEL/Δv, dan MET.
- **Footer:** versi game dan mod API.
- **Interaksi:** sorotan menu (latar tipis + titik). Continue membuka Flight; Worlds membuka layar Worlds.

## 0b · Worlds — `Worlds.dc.html`
- Grid kartu world berisi thumbnail planet, mode, sistem, jumlah kapal dan kru, dan waktu terakhir dimainkan. World terakhir diberi label *LAST PLAYED*. Kartu bisa menampilkan peringatan **mod hilang**.
- **Panel detail:** chip mode/sistem/kesulitan, 6 stat, daftar kapal di world, **Enter world** (ke Space Center), serta Duplicate, Rename, Delete.
- **Dialog Create world:** nama, mode (Sandbox/Science/Career), sistem bintang, kesulitan, 2 rules, dan catatan bahwa mod aktif di semua world.
- **Interaksi:** memilih world, membuat world baru (langsung masuk ke daftar dan terpilih).

## W · Space Center — `SpaceCenter.dc.html`
- **Kampus isometrik:** Hangar, Launchpad (tower + roket), Runway, Mission Center (dish), Astronaut Complex (dome), R&D (dome), Administration.
- **Label** di atas tiap bangunan (nama + status) yang bisa diklik. Label yang di-hover berubah putih.
- **Kanan:** detail bangunan yang di-hover (fakta + tombol buka), ringkasan agency, dan daftar **Needs attention**.
- **Bawah:** dock bangunan dengan titik indikator.
- **Kiri atas:** kapsul world (tombol keluar ke Home) dan waktu world.

## W1 · Hangar — `Hangar.dc.html`
- **Kiri:** rail 10 kategori part (titik di kanan), pencarian, dan grid kartu part (nama, `[—] t · [—] funds`).
- **Tengah:** roket tegak di atas grid blueprint, label part terpilih, penanda CoM dan CoT.
- **Kanan:** statistik vessel (mass, parts, height, Δv, TWR, cost), staging Δv per stage, dan pre-flight checks.
- **Bawah:** alat Place/Move/Rotate/Re-root/Staging, simetri ×1–×6, toggle CoM/CoT, Undo/Redo.
- **Atas:** nama vessel yang bisa diedit, New/Open/Save, **Launch**.

## W2 · Launch sites — `Launch.dc.html`
- Pilihan **Launchpad / Runway**; pratinjau di tengah ikut berganti.
- Desain kapal dari library, difilter sesuai situs, dengan tautan *Edit in Hangar*.
- Kru: 3 kursi dan daftar kru tersedia (klik untuk menempatkan atau mengosongkan).
- Ringkasan (cost, mass, crew) dan tombol **Launch from pad / Roll out to runway** menuju Flight.

## W3 · Astronaut Complex — `Astronauts.dc.html`
- **Tab:** Roster / Applicants / Lost. Filter peran Pilot/Engineer/Scientist.
- **Profil:** avatar, nama, chip (peran, lokasi, baju), XP, 6 stat (courage, stupidity, missions, radio, time in space, EVA time), skill per peran, dan aksi kontekstual.
- **Flight log** khusus untuk world ini.

## W4 · R&D — `Research.dc.html`
- Tech tree 5 tier dan 14 node dengan konektor siku.
- Status node: **Unlocked** (putih penuh), **Can research** (garis putih), **Locked** (redup). Legenda ada di atas.
- **Panel detail:** tier, status, biaya, prasyarat, part yang terbuka, dan tombol Research.
- **Interaksi:** me-research node mengubah status node anaknya.

## W5 · Administration — `Admin.dc.html`
- Strip agency: Funds, Reputation, Science, jumlah kontrak.
- **Contracts:** daftar Offered/Active/Completed (reward + bintang), detail kontrak (brief, objektif dengan checkbox, reward, penalti, deadline), Accept/Decline/Cancel.
- **Strategies:** 4 kartu strategi dengan tombol Activate/End.

## 1 · Flight — `Main.dc.html`
- **Kiri atas:** kapsul world (ke Space Center) dan kontrol waktu (play/pause, 8 segmen warp, MET/UT).
- **Kanan atas:** toolbar `Map · VAB · Camera | Dock · Vessel · Staging · Nav · Crew | Menu`.
- **Dock kiri:** rail plugin (Tracking, Orbit, Resources, Science, Maneuver, dan plugin tambahan), satu panel aktif, serta Panel library.
- **Vessel panel kanan:** tab Overview / Parts / Comms (lihat CONCEPT §4).
- **Bawah tengah:** modul navball 390 × 262: navball 176, lengkung V-speed, chip heading, pod 7 mode SAS, toggle SAS/RCS, readout VEL/ALT.
- **Kiri bawah:** staging (antrean, current stage + Δv + tangki, GO, total Δv).
- **Kanan bawah:** crew (chip baju, sinyal radio, sinkron dengan Comms).
- **Kanvas:** roket line-art, planet, dan callout bagian kapal.
- **Prop:** `initialView` (`flight` | `map`) dan `accent`.

## 2 · Map — `MapView.dc.html` (= `Main` dengan `initialView="map"`)
- HUD sama dengan Flight; kanvasnya peta orbit Kerbin (Mun, relay, KSC, Ap/Pe, rute komunikasi).
- **Atas tengah:** tombol back (ke flight) dan switch **Map | Mission Center**.
- **Maneuver:** *Add node* di panel Maneuver menampilkan node di orbit dan editor Δv (Prograde/Normal/Radial ±10 m/s, total dihitung otomatis) di atas navball.

## 3 · Mission Center — `Map.dc.html`
- Peta seluruh sistem, full-bleed, dengan selection ring per objek.
- **Kiri:** Tracking (filter All/Vessels/Relays/Bodies), Crew roster, strip agency.
- **Kanan:** Upcoming (warp ke event) dan Contracts.
- **Bawah tengah:** kartu objek terpilih (3 stat, aksi; kapal punya tombol Fly).
- **Bawah kanan:** layer Orbits/Network/Labels dan zoom.
- **Toolbar:** toggle panel Tracking, Upcoming, Contracts, Crew.

## — · Docked (arsip) — `Docked.dc.html`
Eksplorasi awal tata letak flight deck close-up 1154 × 451. Tidak dipakai di alur, disimpan sebagai referensi.
