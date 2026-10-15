# Spesifikasi Use Case: AMIGA Robot Admin

Tab ini merinci 11 use case pada PRD v0.1 (tab pertama): aktor, pra-kondisi, alur utama, alur alternatif, aturan bisnis, dan pasca-kondisi. ID requirement merujuk ke bagian 5 PRD. Semua pesan ke pengguna berbahasa Indonesia.

| UC | Nama | Aktor | Requirement | Skenario |
| --- | --- | --- | --- | --- |
| UC-1 | Upload dan ekstrak invoice | Intake, Robot Admin | UPL-01 sampai 04, EXT-01 sampai 07, ACC-03, ACC-06 | 1, 2, 3 |
| UC-2 | Buat voucher | Intake | VCH-01 sampai 09, VCH-11 | 1 |
| UC-3 | Validasi invoice | Robot Admin | VAL-01 sampai 06 | 2, 3, 4 |
| UC-4 | Catat audit trail | Sistem | AUD-01 sampai 05 | 7 |
| UC-5 | Lihat hasil ekstraksi | Intake | REV-07, REV-08, AUD-05 | 1 |
| UC-6 | Lihat hasil review | Intake | REV-07, UPL-04 | 1 |
| UC-7 | Periksa dan koreksi | Finance Reviewer | REV-01 sampai 03, REV-06, REV-08, ACC-04 | 3, 5, 7 |
| UC-8 | Setujui atau tolak | Finance Reviewer | REV-04, REV-05, REV-06, ACC-04 | 1, 4, 5 |
| UC-9 | Unduh voucher PDF | Intake | VCH-11, VCH-12 | 1 |
| UC-10 | Lihat daftar voucher | Intake | VCH-13 | - |
| UC-11 | Tetapkan reviewer per klien | Service Lead, System Admin | ADM-01 sampai 04, ACC-05 | 5, 6 |

UC-5 dan UC-6 sama-sama read-only untuk Intake. Keduanya tetap dipisah di sini mengikuti diagram, dan boleh digabung tanpa mengubah requirement.

## UC-1 Upload dan ekstrak invoice

**Aktor:** Intake (utama), Robot Admin. **Include:** UC-3, UC-4.

**Pra-kondisi**

- Intake sudah login dan ditugaskan ke minimal satu klien.
- Bucket S3 private dan akses Bedrock sudah dikonfigurasi.

**Alur utama**

1. Intake membuka form Upload dan memilih klien dari daftar klien yang ditugaskan kepadanya.
2. Intake mengisi jenis permintaan, saluran, dan tanggal, lalu memilih satu file.
3. Sistem memvalidasi tipe file (dari isi file), ukuran maksimal 10 MB, dan kelengkapan metadata.
4. Sistem membuat invoice dengan Request ID unik dan status QUEUED, mengunggah file ke S3 dengan key clients/{client\_id}/invoices/{invoice\_id}.{ekstensi}, dan mencatat file\_key serta audit upload.
5. Sistem menampilkan Request ID dalam 3 detik. Ekstraksi berjalan di latar belakang.
6. Worker mengubah status menjadi PROCESSING dan memanggil model multimodal di Bedrock.
7. Sistem menyimpan hasil ke tabel invoice dan invoice\_item sebagai draf. Field yang tidak ditemukan dibiarkan kosong.
8. Sistem menjalankan UC-3 dan menetapkan status akhir: READY\_FOR\_REVIEW, EXCEPTION, atau POSSIBLE\_DUPLICATE.

**Alur alternatif**

- A1 (langkah 3): tipe, ukuran, atau metadata tidak valid. Upload ditolak dengan pesan penyebab dan tidak ada request yang dibuat. Untuk HEIC: “Format HEIC belum didukung, ubah ke JPG atau PNG.”
- A2 (langkah 4): unggah ke S3 gagal. Transaksi dibatalkan, Request ID tidak terbit, Intake diminta mengulang.
- A3 (langkah 6 dan 7): Bedrock error atau timeout. Sistem mencoba ulang satu kali. Jika tetap gagal, status EXCEPTION dengan kode EXTRACTION\_FAILED dan data kosong untuk diisi manual oleh reviewer.
- A4 (langkah 7): dokumen tidak terbaca jelas. Status EXCEPTION dengan kode UNREADABLE\_DOCUMENT dan pesan “Dokumen tidak terbaca jelas”.
- A5: unggah ulang setelah REJECTED. Intake mengunggah sebagai request baru dan dapat memilih previous\_request\_id dari request REJECTED milik klien yang sama.
- A6: klien belum punya reviewer aktif. Upload tetap diterima dan antrean menandai klien itu dengan Belum ada reviewer.

**Aturan bisnis**

- Satu file per request. Invoice fisik multi-halaman digabung dulu menjadi satu PDF oleh Intake.
- JPG dan PNG hanya aktif bila F14 masuk MVP (Should). PDF selalu didukung.
- Hasil ekstraksi selalu draf. Intake tidak dapat mengeditnya.
- Dokumen tidak boleh hilang dari antrean pada kondisi apa pun.

**Pasca-kondisi:** invoice tersimpan dengan status akhir hasil validasi, file ada di S3, dan upload serta perubahan status tercatat di audit trail.

## UC-2 Buat voucher

**Aktor:** Intake. **Include:** UC-4. **Extend oleh:** UC-9.

**Pra-kondisi**

- Intake sudah login dan ditugaskan ke klien yang dipilih.
- Ada invoice berstatus AMIGA\_REVIEWED dengan voucher\_id kosong pada klien itu.

**Alur utama**

1. Intake membuka form Buat voucher dan memilih klien serta vendor.
2. Sistem menampilkan tabel invoice AMIGA\_REVIEWED tanpa voucher: checkbox, nomor invoice, tanggal, rekening, total, dan ikon mata.
3. Intake mencentang satu atau lebih invoice. Setelah invoice pertama dipilih, invoice dengan vendor atau rekening berbeda dinonaktifkan beserta alasannya.
4. Opsional: Intake membuka file asli lewat ikon mata di modal, tanpa kehilangan centang.
5. Intake mengisi Peruntukan (wajib, maksimal 255 karakter).
6. Sistem menampilkan preview voucher side-by-side dan read-only.
7. Intake memilih Buat voucher.
8. Dalam satu transaksi atomik, sistem: mengunci baris invoice (SELECT ... FOR UPDATE), memeriksa ulang status dan voucher\_id, mengalokasikan nomor VCH-{kode klien}-{tahun}-{urutan 5 digit}, membuat PDF dan mengunggahnya ke S3, menyimpan voucher berstatus CREATED, mengubah semua invoice menjadi VOUCHERED dengan voucher\_id terisi, dan mencatat audit.
9. Sistem menampilkan nomor voucher dan tombol Unduh (UC-9).

**Alur alternatif**

- A1 (langkah 7): Intake memilih Ubah pilihan. Sistem kembali ke tabel dengan centang yang sudah ada.
- A2 (langkah 8): ada invoice yang sudah terpakai atau berubah. Transaksi dibatalkan, pesan “Invoice sudah masuk voucher lain, muat ulang daftar”, dan daftar dimuat ulang.
- A3 (langkah 8): pembuatan PDF atau unggah S3 gagal. Transaksi dibatalkan, tidak ada voucher dan status invoice tidak berubah, pesan “Voucher gagal dibuat, coba lagi”.
- A4 (langkah 2): tidak ada invoice yang memenuhi syarat. Tabel kosong dengan pesan “Tidak ada invoice yang siap dibuatkan voucher”.
- A5 (langkah 5): Peruntukan kosong. Sistem tidak melanjutkan ke preview dan menandai field.
- A6: penugasan klien dicabut saat proses berjalan. Aksi ditolak dengan pesan jelas dan tidak ada data tersimpan.

**Aturan bisnis**

- Satu voucher hanya untuk satu klien, satu vendor, dan satu rekening (dinilai setelah normalisasi).
- Nominal = jumlah total\_amount semua invoice. Tanggal = tanggal voucher dibuat.
- Satu invoice maksimal berada di satu voucher.
- Voucher terkunci setelah disimpan. Tidak ada edit atau void di MVP.

**Pasca-kondisi:** voucher berstatus CREATED, semua invoice di dalamnya VOUCHERED dan tidak muncul lagi di daftar pilihan, audit tercatat.

## UC-3 Validasi invoice

**Aktor:** Robot Admin. **Dipicu oleh:** selesainya ekstraksi (UC-1) atau penyimpanan koreksi (UC-7).

**Pra-kondisi:** data draf invoice dan invoice\_item tersimpan.

**Alur utama**

1. Sistem membaca invoice dan seluruh barisnya.
2. Sistem memeriksa rekening. Kosong: temuan MISSING\_EVIDENCE.
3. Sistem memeriksa baris dan total. Tidak ada baris: NO\_LINE\_ITEMS. Jika jumlah amount semua baris dikurangi discount\_amount ditambah tax\_amount berbeda dari total\_amount melebihi toleransi (default Rp0): TOTAL\_MISMATCH.
4. Sistem memeriksa duplikat pada klien yang sama setelah normalisasi nomor invoice dan vendor, mengabaikan dokumen REJECTED dan dokumen itu sendiri. Ada kecocokan: POSSIBLE\_DUPLICATE.
5. Sistem menimpa exception\_codes dengan seluruh temuan terbaru.
6. Sistem menetapkan status: ada duplikat, POSSIBLE\_DUPLICATE. Ada temuan lain, EXCEPTION. Tanpa temuan, READY\_FOR\_REVIEW.
7. Sistem menyimpan status dan menaikkan version, lalu mencatat perubahan status di audit trail.

**Alur alternatif**

- A1: ekstraksi gagal atau dokumen tidak terbaca. Sistem langsung menetapkan EXCEPTION dengan kode EXTRACTION\_FAILED atau UNREADABLE\_DOCUMENT dan melewati pemeriksaan lain.
- A2: validasi dipicu koreksi reviewer. Hasil dapat memindahkan status EXCEPTION ke READY\_FOR\_REVIEW, READY\_FOR\_REVIEW ke EXCEPTION, atau EXCEPTION ke POSSIBLE\_DUPLICATE.

**Aturan bisnis**

- Normalisasi: huruf kecil, spasi dan tanda baca dibuang. Rekening dinormalisasi menjadi angka saja.
- POSSIBLE\_DUPLICATE mengalahkan EXCEPTION, dan EXCEPTION mengalahkan READY\_FOR\_REVIEW.
- Dokumen POSSIBLE\_DUPLICATE tidak dievaluasi ulang otomatis bila dokumen pembandingnya kemudian ditolak. Jalur satu-satunya adalah menolak dokumen itu.
- Pesan penyebab mengikuti tabel kode pada VAL-06.

**Pasca-kondisi:** status dan exception\_codes mutakhir, dan semua temuan terlihat sebagai indikator di layar review.

## UC-4 Catat audit trail

**Aktor:** Sistem. **Di-include oleh:** UC-1, UC-2, UC-7, UC-8, UC-9, UC-11.

**Pra-kondisi:** sebuah aksi yang tercakup AUD-01 sedang diproses dalam transaksi.

**Alur utama**

1. Sistem menulis entri audit pada transaksi yang sama dengan perubahan data: entity\_type, entity\_id, action, field\_name, old\_value, new\_value, user\_id, dan created\_at.
2. Untuk edit beberapa field atau baris, sistem menulis satu entri per field, misalnya field\_name items\[2\].amount.
3. Sistem melakukan commit. Perubahan data dan audit tersimpan bersama.

**Alur alternatif**

- A1: penulisan audit gagal. Seluruh transaksi dibatalkan dan aksi dinyatakan gagal.
- A2: perubahan dilakukan sistem (misalnya status PROCESSING). user\_id memakai akun sistem Robot Admin.
- A3: ada upaya update atau delete pada audit\_log dari peran apa pun. Ditolak oleh database.

**Aturan bisnis**

- Dicatat: upload, perubahan status, edit field, setujui, tolak, pembuatan voucher, unduh voucher (pertama dan berikutnya), dan perubahan penugasan.
- Tidak dicatat: melihat daftar, membuka detail, preview, dan membuka file asli.
- Tabel audit\_log append-only.

**Pasca-kondisi:** entri permanen yang tidak dapat diubah atau dihapus.

## UC-5 Lihat hasil ekstraksi

**Aktor:** Intake.

**Pra-kondisi:** Intake login dan ditugaskan ke klien pemilik invoice.

**Alur utama**

1. Intake membuka antrean dan memilih sebuah request.
2. Sistem menampilkan data hasil ekstraksi secara read-only: field invoice, baris barang, status, dan indikator validasi beserta pesan penyebabnya.
3. Opsional: Intake membuka file asli lewat ikon mata dan melihat tabel riwayat perubahan.

**Alur alternatif**

- A1: status masih QUEUED atau PROCESSING. Sistem menampilkan status dan pesan “Dokumen sedang diproses” tanpa data.
- A2: invoice milik klien yang tidak ditugaskan. Akses ditolak (403).

**Aturan bisnis:** semua field read-only untuk Intake. Tindakan melihat tidak dicatat di audit trail.

**Pasca-kondisi:** tidak ada perubahan data.

## UC-6 Lihat hasil review

**Aktor:** Intake.

**Pra-kondisi:** sama dengan UC-5.

**Alur utama**

1. Intake membuka detail request.
2. Sistem menampilkan status keputusan (AMIGA\_REVIEWED atau REJECTED), nama reviewer, dan catatan penolakan bila ada.
3. Jika REJECTED, sistem menampilkan tombol Unggah ulang yang mengisi klien dan previous\_request\_id.

**Alur alternatif**

- A1: belum ada keputusan. Sistem menampilkan status terkini (misalnya READY\_FOR\_REVIEW atau EXCEPTION) tanpa catatan.

**Aturan bisnis:** tidak ada alur bolak-balik pada request yang sama. Perbaikan dilakukan lewat unggah ulang sebagai request baru.

**Pasca-kondisi:** tidak ada perubahan data.

## UC-7 Periksa dan koreksi

**Aktor:** Finance Reviewer. **Include:** UC-3, UC-4.

**Pra-kondisi**

- Reviewer login dan ditugaskan ke klien pemilik invoice.
- Status invoice READY\_FOR\_REVIEW, EXCEPTION, atau POSSIBLE\_DUPLICATE.
- Reviewer bukan pengunggah dokumen (uploaded\_by).

**Alur utama**

1. Reviewer membuka dokumen dari antrean.
2. Sistem menampilkan layar split-screen dalam 2 detik: file asli di kiri, data yang dapat diedit di kanan, indikator validasi, dan menyimpan version yang terbaca.
3. Reviewer membandingkan file dengan data, termasuk zoom pada gambar.
4. Reviewer mengoreksi field atau menambah, mengubah, dan menghapus baris barang.
5. Reviewer memilih Simpan.
6. Sistem memeriksa version, status, dan penugasan.
7. Sistem menyimpan perubahan, mencatat audit per field (nilai lama, nilai baru, user, waktu), dan menaikkan version.
8. Sistem menjalankan UC-3 dan menampilkan status serta indikator terbaru.

**Alur alternatif**

- A1: status POSSIBLE\_DUPLICATE. Semua field read-only dan hanya aksi Tolak (UC-8) yang tersedia.
- A2 (langkah 6): version atau status sudah berubah. Pesan “Data sudah diubah user lain, muat ulang”. Perubahan lokal tidak disimpan.
- A3 (langkah 6): penugasan dicabut. Aksi ditolak dengan pesan jelas.
- A4 (langkah 4): input tidak valid (angka non-numerik, tanggal salah format). Sistem menandai field dan tidak menyimpan.
- A5 (langkah 7): tidak ada perubahan nilai. Simpan tidak membuat entri audit dan tidak menaikkan version.
- A6: ekstraksi gagal (EXCEPTION). Reviewer mengisi data manual dari form kosong, lalu menyimpan.
- A7: reviewer adalah pengunggah dokumen. Akses ditolak oleh backend.

**Aturan bisnis**

- Hanya Finance Reviewer yang dapat mengedit. Intake tidak pernah dapat mengedit.
- Setiap penyimpanan memicu validasi ulang.
- Membuka file asli tidak dicatat di audit trail.

**Pasca-kondisi:** data, status, dan version mutakhir. Semua perubahan tercatat.

## UC-8 Setujui atau tolak

**Aktor:** Finance Reviewer. **Include:** UC-4.

**Pra-kondisi:** sama dengan UC-7. Setujui hanya tersedia pada status READY\_FOR\_REVIEW.

**Alur utama: setujui**

1. Reviewer memilih Setujui.
2. Sistem memeriksa version, status READY\_FOR\_REVIEW, penugasan, dan aturan pengunggah tidak sama dengan penyetuju.
3. Sistem mengubah status menjadi AMIGA\_REVIEWED, mengisi reviewed\_by, dan mencatat audit.
4. Sistem menampilkan konfirmasi dan kembali ke antrean.

**Alur utama: tolak**

1. Reviewer memilih Tolak. Sistem menampilkan isian catatan penolakan.
2. Reviewer mengisi catatan dan mengonfirmasi.
3. Sistem memeriksa version, status (READY\_FOR\_REVIEW, EXCEPTION, atau POSSIBLE\_DUPLICATE), penugasan, dan aturan pengunggah.
4. Sistem mengubah status menjadi REJECTED, mengisi reject\_note dan reviewed\_by, dan mencatat audit.
5. Sistem menampilkan konfirmasi dan kembali ke antrean.

**Alur alternatif**

- A1: catatan penolakan kosong. Tombol konfirmasi tidak aktif dan field ditandai.
- A2: Setujui dipilih pada status selain READY\_FOR\_REVIEW. Tombol nonaktif, dan API menolak dengan pesan “Dokumen belum siap disetujui”.
- A3: version atau status berubah. Pesan “Data sudah diubah user lain, muat ulang”.
- A4: pengaman SoD gagal. Ditolak dengan pesan “Anda tidak dapat meninjau dokumen yang Anda unggah”.
- A5: status POSSIBLE\_DUPLICATE. Hanya Tolak yang tersedia, tanpa override.

**Aturan bisnis**

- REJECTED bersifat final. Perbaikan lewat unggah ulang sebagai request baru.
- AMIGA\_REVIEWED tidak dapat dibatalkan di MVP dan satu-satunya jalur berikutnya adalah UC-2.
- Tidak ada edit setelah keputusan.

**Pasca-kondisi:** invoice berstatus AMIGA\_REVIEWED atau REJECTED, reviewed\_by terisi, dan audit tercatat.

## UC-9 Unduh voucher PDF

**Aktor:** Intake. **Extend dari:** UC-2. **Include:** UC-4.

**Pra-kondisi:** voucher ada dan milik klien yang ditugaskan kepada Intake.

**Alur utama**

1. Intake memilih Unduh, dari konfirmasi UC-2 atau dari daftar voucher.
2. Backend memeriksa isolasi klien.
3. Jika status voucher CREATED, sistem dalam satu transaksi mengubah voucher menjadi SENT\_TO\_CLIENT, mengisi sent\_at, mengubah semua invoice di dalamnya menjadi SENT\_TO\_CLIENT, dan mencatat audit. Perubahan memakai kondisi status masih CREATED.
4. Sistem menerbitkan presigned URL berumur pendek (usulan 5 menit).
5. Browser mengunduh file PDF.

**Alur alternatif**

- A1: unduh ulang (status sudah SENT\_TO\_CLIENT). Status tidak berubah, tautan diterbitkan, dan audit tetap dicatat.
- A2: dua unduhan pertama bersamaan. Hanya satu transaksi yang mengubah status, yang lain diperlakukan sebagai unduh ulang.
- A3: file voucher tidak ditemukan di S3. Transaksi dibatalkan dan status tidak berubah, pesan “Berkas voucher tidak dapat diambil, coba lagi”.

**Aturan bisnis:** status berubah saat sistem menerbitkan tautan unduh, bukan saat browser selesai mengunduh. SENT\_TO\_CLIENT hanya berarti voucher sudah diunduh Intake, pengiriman ke klien terjadi di luar sistem.

**Pasca-kondisi:** voucher dan invoice di dalamnya berstatus SENT\_TO\_CLIENT, dan setiap unduhan tercatat.

## UC-10 Lihat daftar voucher

**Aktor:** Intake.

**Pra-kondisi:** Intake login dan ditugaskan ke minimal satu klien.

**Alur utama**

1. Intake membuka daftar voucher.
2. Sistem menampilkan voucher klien yang ditugaskan, terbaru dulu dengan paginasi: nomor, tanggal, vendor, peruntukan, nominal, status, dan jumlah invoice.
3. Intake memilih sebuah voucher. Sistem menampilkan detail read-only: daftar invoice dan baris barang.
4. Opsional: Intake memilih Unduh ulang (UC-9).

**Alur alternatif**

- A1: belum ada voucher. Sistem menampilkan pesan “Belum ada voucher”.
- A2: voucher milik klien yang tidak ditugaskan. Akses ditolak (403).

**Aturan bisnis:** melihat daftar dan detail tidak dicatat di audit trail.

**Pasca-kondisi:** tidak ada perubahan data.

## UC-11 Tetapkan reviewer per klien

**Aktor:** Service Lead (reviewer per klien), System Admin (user, klien, dan penugasan Intake). **Include:** UC-4.

**Pra-kondisi:** aktor login dengan peran yang sesuai. User yang ditugaskan aktif dan berperan sesuai (FINANCE\_REVIEWER untuk Service Lead, INTAKE untuk System Admin).

**Alur utama: Service Lead**

1. Service Lead membuka daftar klien beserta reviewer-nya.
2. Service Lead memilih klien dan menambah atau mencabut reviewer.
3. Sistem menyimpan perubahan pada user\_client dan mencatat audit.
4. Sistem memperbarui indikator Belum ada reviewer pada antrean.

**Alur utama: System Admin**

1. System Admin membuka daftar user dan klien.
2. System Admin menambah atau menonaktifkan user, menetapkan peran (satu peran per user), mengelola klien (nama dan kode), dan menugaskan Intake ke klien.
3. Sistem menyimpan perubahan dan mencatat audit.

**Alur alternatif**

- A1: reviewer dicabut saat sedang memegang dokumen. Simpan atau setujui yang sedang berjalan ditolak dengan pesan jelas (ACC-05).
- A2: user yang dipilih tidak berperan sesuai. Sistem menolak dengan pesan penyebab.
- A3: reviewer terakhir sebuah klien dicabut. Sistem meminta konfirmasi, lalu klien ditandai Belum ada reviewer. Dokumen yang antre tidak hilang.
- A4: user dinonaktifkan. Sesi aktif user itu langsung tidak berlaku.
- A5: kode klien sudah dipakai. Sistem menolak karena kode harus unik.

**Aturan bisnis**

- Seorang reviewer yang ditugaskan ke klien dapat mereview semua dokumen klien itu. Satu klien boleh punya lebih dari satu reviewer.
- Service Lead tidak melihat antrean dan tidak menyetujui apa pun. System Admin tidak mengakses invoice, voucher, maupun persetujuan.
- Pencabutan berlaku langsung dan setiap perubahan penugasan tercatat.
- Bila F13 dipotong, penugasan diatur lewat seed data.

**Pasca-kondisi:** tabel user\_client mutakhir, dan indikator antrean serta hak akses langsung mengikuti.
