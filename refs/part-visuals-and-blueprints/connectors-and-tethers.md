# Kabel, strut, pipa bahan bakar dan tali: riset dan usulan

Riset untuk pertanyaan owner (2026-10-21): "di KSP ada kabel yang bisa dipasang dari satu sisi ke sisi lain, untuk memperkuat struktur, dan bisa di-decouple. Bagaimana aplikasinya di sistem parts kita, kan ini dari mod stock, berarti part khusus seperti ini perlu perlakuan khusus?"

## 1. Apa yang ada di KSP

| Benda | Di KSP | Untuk apa | Saat decouple atau pecah |
| --- | --- | --- | --- |
| **EAS-4 Strut Connector** | KSP1 stock | Batang kaku dari part A ke part B. Di KSP setiap part benda fisika sendiri, disambung sendi lentur, jadi roket tinggi goyang ("wobble") lalu patah. Strut menambah satu sendi kaku lagi. | Strut yang melintasi pemisahan hilang, dan pemisahan tidak tertahan. Arah pasang berpengaruh: ditarik dari bagian yang dibuang ke yang tetap, kalau tidak bisa "nyangkut" ([forum](https://forum.kerbalspaceprogram.com/topic/110200-need-help-with-large-boosters-and-decouplers), [bug 5198](https://bugs.kerbalspaceprogram.com/issues/5198)). |
| **FTX-2 Fuel Line** | KSP1 stock | Pipa satu arah: bahan bakar mengalir dari A ke B, untuk asparagus staging. | Putus seperti strut. |
| **Autostrut** | KSP1 1.2 ke atas | Strut tersembunyi otomatis ke root, ke part terberat, atau ke grandparent. | Pemain menganggapnya "plester" yang tidak transparan. Pengembang KSP2 ingin menjauhinya ([forum KSP2](https://forum.kerbalspaceprogram.com/topic/214159-please-no-wobble)). |
| **Kabel atau winch (KAS)** | mod KSP1 | Tali lentur antara dua kendaraan: derek, tambatan, menarik muatan, selang bahan bakar antar kapal. Ujung kabel dipasang oleh kerbal saat EVA ke soket ("connector port"), ada magnet dan kait, panjang bisa digulung ([KAS](https://forum.kerbalspaceprogram.com/topic/142594-minimum-ksp-version-111-kerbal-attachment-system-kas-v112/page/54)). | Bisa dilepas. Bug yang sering muncul: kendaraan terlempar saat mode docked atau undocked berganti, dan selang lepas di atas 30 m tidak bisa diambil lagi. Ini pelajaran: sendi antar benda harus hati-hati. |
| **KSP2** | stock | Struts dan fuel line tetap ada. Pengembang menyebut sendi lunak dipilih demi performa, dan wobble jadi keluhan utama. | sama |

## 2. Apa yang sudah ada di game kita

- **Strut dan Fuel Line** sudah ada sebagai part "connector" (ADR 0071, `connector` di definisi part):
  - ujung pertama menempel seperti part biasa;
  - ujung kedua disimpan sebagai `link` (titik dan part tujuan);
  - fuel line mengalirkan bahan bakar (`connector.feeds`);
  - saat kendaraan pecah atau decouple, link yang ujungnya pindah ke kendaraan lain otomatis diputus (`packages/sim/src/vessel.ts`). Tidak ada masalah "arah pasang" seperti di KSP;
  - robotika (plan 306) ikut menggeser titik ujungnya.
- **Satu kendaraan = satu benda kaku** (ADR 0018). Roket kita **tidak pernah goyang**, jadi strut tidak dibutuhkan untuk kekuatan. Ini keputusan sengaja: lebih stabil dan murah dari KSP, pemain tidak perlu "strut spam" atau autostrut. Strut tetap berguna untuk tampilan (roket terlihat "dikunci") dan sebagai jalur fuel line.

## 3. Yang belum ada, dan usulannya

### 3a. Tali dan winch antar kendaraan (paling bernilai)

Contoh pemakaian:
- tambatan rover ke lander;
- derek muatan atau kargo;
- menarik satelit rusak;
- menambatkan dua kapal tanpa docking port;
- harpoon ke asteroid;
- selang bahan bakar antar kapal.

Ini butuh **sendi fisika antara dua benda**: satu sendi per tali. Sendi ini tidak bisa dibuat di mod; ia harus ada di engine, seperti docking port dan connector.

- **Core/SDK:** hook baru `tether(config, state)` di `ModuleDefinition`, berisi:
  - `{ maxLength, length, strength, node }`: panjang maksimal, panjang sekarang (bisa digulung), gaya putus (N), titik keluar;
  - mode ujung: soket, magnet, kait.
- **Sim:**
  - membuat rope joint di Rapier (`JointData.rope`), hanya menahan tarikan, tidak dorongan;
  - memutusnya saat tarikan melewati `strength`, dengan event `tether:snapped`;
  - menyimpannya di save;
  - di rails: dua kendaraan bertali dianggap satu grup orbit, atau tali digulung otomatis.
- **Renderer:** menggambar tali sebagai kurva (catenary atau garis lurus saat tegang) antara dua titik.
- **Stock mod:** part winch S dan M, soket, kait, magnet, harpoon.
- **Batas** (dari pelajaran KAS):
  - tali hanya antar dua kendaraan, tidak berantai panjang;
  - sambung dan lepas tidak boleh mengubah kecepatan kendaraan;
  - sesuai pengukuran plan 288, sendi Rapier tunggal stabil.

### 3b. Strut yang bisa dilepas

Strut atau connector dengan tombol "Release" atau action group. Sim cukup memutus `link`-nya. Ini kecil karena hampir semuanya sudah ada.

### 3c. Pemutusan karena beban

Kalau kendaraan satu benda kaku, beban pada strut tidak terhitung. Kita **tidak** menambah ini: tanpa wobble, ini tidak menambah permainan.

## 4. Usulan urutan

1. ADR 0272 (proposed): tali dan winch sebagai rope joint antar kendaraan.
2. Plan 313:
   - strut yang bisa dilepas (kecil);
   - lalu `tether` dan winch dengan tes sim: rover ditarik naik ke lander, dan tali putus di atas `strength`.
3. Sesudah itu baru selang bahan bakar antar kapal, yaitu tali dengan `feeds`.

Sumber: [forum KSP: decoupler dan strut](https://forum.kerbalspaceprogram.com/topic/23891-decouplers), [boosters dan strut](https://forum.kerbalspaceprogram.com/topic/110200-need-help-with-large-boosters-and-decouplers), [bug 5198](https://bugs.kerbalspaceprogram.com/issues/5198), [KAS](https://forum.kerbalspaceprogram.com/topic/142594-minimum-ksp-version-111-kerbal-attachment-system-kas-v112/page/54), [KSP2 wobble](https://forum.kerbalspaceprogram.com/topic/214159-please-no-wobble), [autostrut](https://forum.kerbalspaceprogram.com/topic/203282-112-autostrut-changes/page/2).
