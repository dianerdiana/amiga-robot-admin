# PRD AMIGA Robot Admin: Invoice ke Voucher

Versi 0.1 (draf untuk review) | 14/10/2026 | Disusun oleh: Senior Software Analyst | Sumber utama: dokumen Revisi Diagram UML Invoice ke Voucher (14/10/2026) dan keputusan diskusi

## 0. Cara membaca dokumen ini

Dokumen Revisi UML adalah sumber kebenaran. BRD v1.0 tidak dijadikan acuan. Setiap requirement punya ID (ACC, UPL, EXT, VAL, QUE, REV, AUD, VCH, ADM) yang ditautkan ke use case (UC) dan skenario uji (S1 sampai S7). Diagram UML disisipkan pada placeholder Gambar 1 sampai 6 (bagian 11). Hal yang saya tambahkan di luar Revisi UML ditandai **\[Tambahan\]** dan dikumpulkan di bagian 10 untuk dikonfirmasi.

### Catatan perubahan 2026-10

Keputusan setelah PRD v0.1, ditandai **[Perubahan 2026-10]** pada butir terkait:

1. Intake dapat **mengoreksi** data hasil ekstraksi (field dan baris barang) pada status READY_FOR_REVIEW, EXCEPTION, dan POSSIBLE_DUPLICATE. Intake tetap **tidak** dapat menyetujui atau menolak, sehingga aturan pemisahan tugas (ACC-04) tidak berubah. Setiap koreksi wajib disertai alasan (10 sampai 500 karakter) yang dicatat di audit trail, memicu validasi ulang, dan memakai optimistic locking.
2. POSSIBLE_DUPLICATE adalah **peringatan, bukan kunci**. Data dapat dikoreksi, dan Finance Reviewer dapat menyetujui invoice tersebut secara manual. Usulan untuk fitur reviewer: persetujuan atas POSSIBLE_DUPLICATE wajib disertai catatan justifikasi.
3. Validasi input pengguna berada di backend sebagai sumber kebenaran; frontend hanya melakukan pemeriksaan sederhana untuk umpan balik cepat.

## 1. Ringkasan produk

**Masalah.** Invoice vendor klien diolah manual: data diketik ulang, voucher disusun satu per satu, salah ketik dan pembayaran ganda sulit dicegah, dan jejak perubahan lemah.

**Solusi.** Platform internal tempat Intake (personel AMIGA) mengunggah invoice yang diterima dari klien. AI (Amazon Bedrock) mengekstrak isinya menjadi draf, sistem memvalidasi, lalu Finance Reviewer yang independen memeriksa dan menyetujui. Setelah itu Intake menyusun voucher dari satu atau banyak invoice yang sudah disetujui. AI hanya asisten ekstraksi, keputusan tetap di tangan reviewer. Klien tidak memiliki akses ke sistem dan pembayaran terjadi di luar sistem.

**Tujuan produk**

- Intake tidak perlu mengetik ulang data invoice.
- Hasil ekstraksi selalu berstatus draf dan harus lolos peninjauan reviewer independen.
- Voucher hanya dibuat dari invoice yang sudah disetujui, tanpa duplikat dan tanpa invoice yang terpakai dua kali.
- Setiap perubahan data dan keputusan tercatat permanen, dan data antar-klien terisolasi.

**Bukan tujuan (MVP)**

Akses klien ke sistem, notifikasi WhatsApp atau email, integrasi pembayaran atau akuntansi, pembatalan (void) voucher, pembatalan persetujuan, alur bolak-balik perbaikan pada request yang sama (diganti unggah ulang sebagai request baru), master vendor, multi-mata uang (hanya IDR), template voucher per klien, dan alokasi ulang reviewer per invoice.

## 2. Persona dan hak akses

| Persona          | Peran                                                                                        | Batasan utama                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Intake           | Personel internal AMIGA. Mengunggah invoice, memantau status, membuat dan mengunduh voucher. | Tidak boleh mengedit hasil ekstraksi. Hanya klien yang ditugaskan. **[Perubahan 2026-10]** Boleh mengoreksi data ekstraksi, tidak menyetujui/menolak.       |
| Finance Reviewer | Memeriksa, mengoreksi, menyetujui atau menolak hasil ekstraksi.                              | Tidak mengunggah dan tidak membuat voucher. Hanya klien yang ditugaskan. |
| Service Lead     | Menetapkan reviewer per klien.                                                               | Tidak melihat antrean dan tidak menyetujui apa pun.                      |
| System Admin     | Mengelola user, peran, klien, dan penugasan Intake. **\[Tambahan\]**                         | Tidak mengakses invoice, voucher, maupun persetujuan.                    |
| Robot Admin      | Aktor sistem: ekstraksi dan validasi otomatis.                                               | Tidak berwenang menyetujui.                                              |
| Klien            | Pihak eksternal pengirim invoice.                                                            | Tidak punya akses ke sistem.                                             |

| Aksi                                                             | Intake | Finance Reviewer | Service Lead | System Admin | Robot Admin |
| ---------------------------------------------------------------- | ------ | ---------------- | ------------ | ------------ | ----------- |
| Upload invoice dan metadata                                      | Ya     | Tidak            | Tidak        | Tidak        | Tidak       |
| Lihat antrean dan status (klien ditugaskan)                      | Ya     | Ya               | Tidak        | Tidak        | Tidak       |
| Lihat hasil ekstraksi, hasil review, dan riwayat (read-only)     | Ya     | Ya               | Tidak        | Tidak        | Tidak       |
| Koreksi field, setujui, tolak                                    | Koreksi saja **[Perubahan 2026-10]** | Ya               | Tidak        | Tidak        | Tidak       |
| Buka file asli (ikon mata)                                       | Ya     | Ya               | Tidak        | Tidak        | Tidak       |
| Buat voucher, lihat daftar, unduh                                | Ya     | Tidak            | Tidak        | Tidak        | Tidak       |
| Tetapkan reviewer per klien                                      | Tidak  | Tidak            | Ya           | Tidak        | Tidak       |
| Kelola user, peran, klien, penugasan Intake **\[Tambahan\]**     | Tidak  | Tidak            | Tidak        | Ya           | Tidak       |
| Lihat daftar klien dan reviewer-nya (read-only) **\[Tambahan\]** | Tidak  | Tidak            | Ya           | Ya           | Tidak       |
| Ekstraksi dan validasi otomatis                                  | Tidak  | Tidak            | Tidak        | Tidak        | Ya          |

&#91;embedded content: Gambar 1 · use case diagram · 5 aktor, 11 use case\]

Gambar 1. Intake memegang dua use case utama (UC-1 dan UC-2, disorot). UC-3 divalidasi Robot Admin, dan UC-4 dipakai oleh semua use case yang mengubah data.

## 3. Scope MVP

Prioritas memakai MoSCoW. Estimasi dalam person-day dan merupakan estimasi awal analis, perlu dikonfirmasi tim developer.

| ID  | Fitur                                                                                                   | Prioritas | Est. | UC          | Skenario   |
| --- | ------------------------------------------------------------------------------------------------------- | --------- | ---- | ----------- | ---------- |
| F01 | Setup proyek, skema database, deployment cloud, bucket S3 private, akses Bedrock                        | Must      | 0,75 | -           | Semua      |
| F02 | Login sederhana, akun seed, RBAC, isolasi klien di backend (user_client)                                | Must      | 1,00 | -           | 5, 6       |
| F03 | Upload PDF dan metadata, Request ID, status QUEUED                                                      | Must      | 0,50 | UC-1        | 1          |
| F04 | Ekstraksi AI via Bedrock (field dan line items), asinkron, mode fallback                                | Must      | 1,25 | UC-1        | 1, 2, 3    |
| F05 | Validasi otomatis (rekening, total, duplikat, prioritas status)                                         | Must      | 0,75 | UC-3        | 1 sampai 4 |
| F06 | Antrean kerja, filter, indikator kendala                                                                | Must      | 0,50 | -           | 1, 6       |
| F07 | Layar review split-screen: edit, validasi ulang, setujui atau tolak, optimistic locking, SoD            | Must      | 1,25 | UC-7, UC-8  | 1, 5, 7    |
| F08 | Audit trail append-only dan tabel riwayat                                                               | Must      | 0,50 | UC-4        | 7          |
| F09 | Lihat hasil ekstraksi dan review (read-only untuk Intake)                                               | Must      | 0,25 | UC-5, UC-6  | 1          |
| F10 | Buat voucher: pemilihan, aturan penggabungan, preview, simpan atomik, penomoran                         | Must      | 1,25 | UC-2        | 1          |
| F11 | Voucher PDF, unduh, daftar voucher                                                                      | Must      | 0,75 | UC-9, UC-10 | 1          |
| F12 | Dataset sintetis, uji end-to-end 7 skenario, skrip demo                                                 | Must      | 1,00 | -           | 1 sampai 7 |
| F13 | Layar admin minimal: System Admin (user, klien, penugasan Intake) dan Service Lead (penetapan reviewer) | Should    | 0,75 | UC-11       | 5, 6       |
| F14 | Dukungan JPG dan PNG, zoom viewer, sampel scan dan foto                                                 | Should    | 0,50 | UC-1        | -          |

**Total: Must 9,75 | Should 1,25 | Total 11,00 person-day, tanpa buffer.** Estimasi 11,00 person-day disetujui tanpa pemotongan scope, dan F13 serta F14 tetap masuk MVP.

**Di luar scope:** semua butir pada bagian Bukan tujuan, ditambah backlog dari Revisi UML: pembatalan persetujuan sebelum VOUCHERED, void voucher, dan kolom penugasan reviewer per invoice.

## 4. Alur pengguna

### 4.1 Upload dan review (Gambar 2)

1. Intake mengunggah file dan mengisi metadata wajib. Sistem menerbitkan Request ID, status QUEUED, dan menyimpan file di S3.
2. Robot Admin mengekstrak isi file (PROCESSING) dan menyimpan hasilnya ke tabel invoice dan invoice item sebagai draf.
3. Robot Admin memvalidasi. Tanpa temuan: READY_FOR_REVIEW. Ada duplikat: POSSIBLE_DUPLICATE. Temuan lain: EXCEPTION.
4. Finance Reviewer membuka layar split-screen dan memeriksa hasil, termasuk file asli lewat ikon mata.
5. Opsional: reviewer mengoreksi field. Setiap perubahan dicatat dan validasi dijalankan ulang.
6. Reviewer memutuskan: Setujui (AMIGA_REVIEWED) atau Tolak dengan catatan wajib (REJECTED).
7. Intake melihat status dan catatan hasil review. Jika ditolak, Intake mengunggah file baru sebagai request baru, dengan referensi opsional ke request sebelumnya.

&#91;embedded content: Gambar 2 · activity diagram upload dan review · 3 lajur\]

Gambar 2. Koreksi reviewer selalu memicu validasi ulang (garis putus-putus). Intake hanya melihat hasil, dan penolakan berujung pada unggah ulang sebagai request baru.

### 4.2 Buat voucher (Gambar 3)

1. Intake membuka form Buat voucher, memilih klien dan vendor, lalu mencentang invoice AMIGA_REVIEWED yang belum bervoucher.
2. Intake mengisi Peruntukan, lalu melihat preview voucher read-only.
3. Intake memilih Buat voucher atau Ubah pilihan.
4. Sistem menyimpan voucher dan mengubah semua invoice di dalamnya menjadi VOUCHERED dalam satu transaksi atomik.
5. Opsional: Intake mengunduh voucher PDF. Unduhan pertama mengubah status voucher dan invoice menjadi SENT_TO_CLIENT.

&#91;embedded content: Gambar 3 · activity diagram buat voucher · 2 lajur\]

Gambar 3. Pengecekan ulang saat baris dikunci mencegah satu invoice masuk dua voucher. Jika gagal, Intake memuat ulang daftar dan memilih lagi.

## 5. Functional requirements

### 5.1 Akses dan isolasi data (ACC)

| ID     | Requirement                                                                                                                                                                                                                         | Prioritas | Skenario |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- |
| ACC-01 | Login dengan email dan password untuk akun seed.                                                                                                                                                                                    | Must      | 5, 6     |
| ACC-02 | Satu user memiliki tepat satu peran: INTAKE, FINANCE_REVIEWER, SERVICE_LEAD, atau SYSTEM_ADMIN.                                                                                                                                     | Must      | 5        |
| ACC-03 | Isolasi klien diterapkan di backend pada semua endpoint (invoice, file, voucher) berdasarkan tabel user_client, bukan hanya di tampilan. Akses ke dokumen klien yang tidak ditugaskan ditolak (HTTP 403) lewat URL, API, maupun ID. | Must      | 6        |
| ACC-04 | Backend menolak persetujuan jika approver sama dengan uploaded_by, sebagai pengaman di atas pembatasan peran.                                                                                                                       | Must      | 5        |
| ACC-05 | Pencabutan penugasan berlaku langsung. Aksi simpan atau setujui yang sedang berjalan ditolak dengan pesan jelas, dan pencabutan dicatat di audit trail.                                                                             | Should    | -        |
| ACC-06 | Klien tanpa reviewer aktif tetap dapat menerima unggahan. Antrean menandai klien itu dengan indikator Belum ada reviewer.                                                                                                           | Must      | -        |

**Acceptance criteria**

- Intake klien A yang membuka dokumen klien B (lewat URL atau API) menerima penolakan, dan tidak ada data dokumen B yang ikut terkirim.
- Endpoint setujui dipanggil oleh Intake mengembalikan 403 karena peran.
- Endpoint setujui dipanggil oleh reviewer pada dokumen yang uploaded_by-nya adalah reviewer itu sendiri (data uji) mengembalikan 403.

### 5.2 Upload (UPL) - UC-1

| ID     | Requirement                                                                                                                                                                                                                                                         | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| UPL-01 | Form upload memiliki metadata wajib: klien (hanya klien yang ditugaskan), jenis permintaan, saluran, dan tanggal. Pilihan saluran: WhatsApp, Email, Lainnya. Jenis permintaan: Pembayaran Vendor (nilai awal). Tanggal = tanggal permintaan diterima dari klien.    | Must      |
| UPL-02 | File diterima: PDF (Must), JPG dan PNG (Should). Maksimal 10 MB per file, satu file per request. Tipe file divalidasi dari isi file, bukan hanya ekstensi. HEIC ditolak dengan pesan jelas. Invoice fisik multi-halaman digabung dulu menjadi satu PDF oleh Intake. | Must      |
| UPL-03 | Upload berhasil menerbitkan Request ID unik dan status QUEUED, dikonfirmasi dalam 3 detik. File disimpan di S3 private dengan key clients/{client_id}/invoices/{invoice_id}.{ekstensi}, key dicatat di kolom file_key. Ekstraksi berjalan asinkron.                 | Must      |
| UPL-04 | Setelah REJECTED, Intake mengunggah file baru sebagai request baru. Field previous_request_id bersifat opsional dan dipilih dari request REJECTED milik klien yang sama.                                                                                            | Must      |

**Acceptance criteria**

- File melebihi 10 MB, bukan PDF/JPG/PNG, atau metadata tidak lengkap ditolak dengan pesan yang menyebut penyebabnya.
- Request ID unik. Format usulan: REQ-{tahun}-{urutan 6 digit}.

### 5.3 Ekstraksi AI (EXT) - UC-1

| ID     | Requirement                                                                                                                                                                                                                                                                                                                            | Prioritas |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| EXT-01 | Worker asinkron mengambil dokumen QUEUED, mengubah status menjadi PROCESSING, lalu memanggil model multimodal di Amazon Bedrock. Keluaran berupa JSON terstruktur: vendor_name, invoice_number, invoice_date, bank_account, tax_amount, discount_amount, total_amount, dan items (line_no, description, quantity, unit_price, amount). | Must      |
| EXT-02 | Semua baris barang terbaca (invoice dengan 3 baris atau lebih tidak boleh kehilangan baris). Hasil disimpan ke tabel invoice dan invoice_item sebagai draf dan dapat dibuka kembali kapan saja.                                                                                                                                        | Must      |
| EXT-03 | Nilai yang tidak ditemukan dibiarkan kosong, tidak ditebak.                                                                                                                                                                                                                                                                            | Must      |
| EXT-04 | Jika ekstraksi gagal, timeout, atau dokumen tidak terbaca jelas: satu kali percobaan ulang otomatis, lalu status EXCEPTION dengan kode EXTRACTION_FAILED atau UNREADABLE_DOCUMENT. Dokumen tidak hilang dari antrean dan reviewer dapat mengisi manual atau menolak.                                                                   | Must      |
| EXT-05 | Mode fallback lewat konfigurasi: memakai hasil ekstraksi tersimpan untuk dataset demo bila Bedrock bermasalah.                                                                                                                                                                                                                         | Must      |
| EXT-06 | ID model, region, dan timeout Bedrock diatur lewat konfigurasi, tanpa perubahan kode.                                                                                                                                                                                                                                                  | Must      |
| EXT-07 | Hasil AI tidak pernah langsung menjadi voucher tanpa persetujuan reviewer.                                                                                                                                                                                                                                                             | Must      |

**Acceptance criteria:** ekstraksi selesai dalam 15 detik untuk PDF sampai 5 halaman (diukur pada minimal 5 dokumen uji). Akurasi field kunci (vendor, nomor invoice, nominal, rekening) minimal 90 persen pada PDF digital di dataset sintetis.

### 5.4 Validasi otomatis (VAL) - UC-3

| ID     | Requirement                                                                                                                                                                                                                                 | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| VAL-01 | Validasi berjalan otomatis setelah ekstraksi dan setiap kali reviewer menyimpan koreksi.                                                                                                                                                    | Must      |
| VAL-02 | MISSING_EVIDENCE bila bank_account kosong.                                                                                                                                                                                                  | Must      |
| VAL-03 | TOTAL_MISMATCH bila (jumlah amount semua baris) dikurangi discount_amount ditambah tax_amount tidak sama dengan total_amount. Toleransi default Rp0, disimpan sebagai konfigurasi. NO_LINE_ITEMS bila tidak ada baris barang.               | Must      |
| VAL-04 | POSSIBLE_DUPLICATE bila ada dokumen lain pada klien yang sama dengan nomor invoice dan nama vendor yang sama setelah normalisasi (huruf kecil, spasi dan tanda baca dibuang). Dokumen berstatus REJECTED dan dokumen itu sendiri diabaikan. | Must      |
| VAL-05 | Semua temuan disimpan di kolom exception_codes (daftar) dan ditampilkan sebagai indikator di layar review. Status ditentukan oleh prioritas: POSSIBLE_DUPLICATE mengalahkan EXCEPTION, dan EXCEPTION mengalahkan READY_FOR_REVIEW.          | Must      |
| VAL-06 | Setiap kode menampilkan pesan penyebab dan tindakan (tabel di bawah).                                                                                                                                                                       | Must      |

| Kode                | Pesan                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| MISSING_EVIDENCE    | Nomor rekening tidak ditemukan pada invoice.                                                       |
| TOTAL_MISMATCH      | Total invoice tidak sama dengan jumlah baris, diskon, dan pajak (selisih Rp...).                   |
| NO_LINE_ITEMS       | Baris barang tidak ditemukan.                                                                      |
| EXTRACTION_FAILED   | Ekstraksi otomatis gagal. Isi data secara manual atau tolak dokumen.                               |
| UNREADABLE_DOCUMENT | Dokumen tidak terbaca jelas.                                                                       |
| POSSIBLE_DUPLICATE  | Invoice dengan nomor dan vendor yang sama sudah ada (Request ID ...). Periksa kembali; reviewer dapat menolak atau menyetujui secara manual. **[Perubahan 2026-10]** |

### 5.5 Antrean kerja (QUE)

| ID     | Requirement                                                                                                                                                                          | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| QUE-01 | Antrean menampilkan Request ID, klien, vendor, nomor invoice, total, status, tanggal, dan indikator kendala. Hanya klien yang ditugaskan. Dapat diakses Intake dan Finance Reviewer. | Must      |
| QUE-02 | Filter: klien, status, indikasi kendala (EXCEPTION, POSSIBLE_DUPLICATE, Belum ada reviewer), dan rentang tanggal. Urutan terbaru dulu, dengan paginasi.                              | Must      |
| QUE-03 | Antrean termuat dalam 2 detik.                                                                                                                                                       | Must      |

### 5.6 Review dan keputusan (REV) - UC-5 sampai UC-8

| ID     | Requirement                                                                                                                                                                                                                                                                                                | Prioritas |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| REV-01 | Layar split-screen: file asli di kiri (PDF, atau gambar dengan zoom dasar), data di kanan, indikator validasi terlihat jelas. Termuat dalam 2 detik.                                                                                                                                                       | Must      |
| REV-02 | Hanya Finance Reviewer yang dapat mengedit, pada status READY_FOR_REVIEW atau EXCEPTION. Field dapat diedit: vendor, nomor invoice, tanggal, rekening, pajak, diskon, total, serta tambah, ubah, dan hapus baris barang. Pada POSSIBLE_DUPLICATE semua field read-only dan hanya aksi Tolak yang tersedia. **[Perubahan 2026-10]** Intake juga dapat mengoreksi (bukan menyetujui/menolak), dengan alasan wajib. POSSIBLE_DUPLICATE tidak lagi read-only. | Must      |
| REV-03 | Setiap simpan memicu validasi ulang. EXCEPTION yang bersih menjadi READY_FOR_REVIEW. Penyimpanan bersifat atomik bersama audit trail.                                                                                                                                                                      | Must      |
| REV-04 | Setujui hanya dari READY_FOR_REVIEW, mengubah status menjadi AMIGA_REVIEWED dan mengisi reviewed_by.                                                                                                                                                                                                       | Must      |
| REV-05 | Tolak dari READY_FOR_REVIEW, EXCEPTION, atau POSSIBLE_DUPLICATE. Catatan wajib diisi (reject_note). Status REJECTED bersifat final. **[Perubahan 2026-10]** POSSIBLE_DUPLICATE juga dapat disetujui secara manual oleh Finance Reviewer.                                                                                                                                                                        | Must      |
| REV-06 | Optimistic locking lewat kolom version. Jika version atau status sudah berubah, aksi ditolak dengan pesan Data sudah diubah user lain, muat ulang.                                                                                                                                                         | Must      |
| REV-07 | Intake melihat hasil ekstraksi, status, dan catatan penolakan secara read-only. Intake tidak dapat mengedit. **[Perubahan 2026-10]** Diganti: Intake dapat mengoreksi data ekstraksi dengan alasan wajib; menyetujui dan menolak tetap hak Finance Reviewer.                                                                                                                                                                                               | Must      |
| REV-08 | Ikon mata membuka file asli (PDF atau gambar sesuai mime_type) lewat presigned URL berumur pendek (usulan 5 menit) setelah backend memeriksa isolasi klien.                                                                                                                                                | Must      |

### 5.7 Audit trail (AUD) - UC-4

| ID     | Requirement                                                                                                                                                                                                                                                          | Prioritas |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AUD-01 | Dicatat: upload, perubahan status, edit field (satu entri per field), setujui, tolak, pembuatan voucher, unduh voucher (pertama dan berikutnya), dan perubahan penugasan. **Tidak dicatat:** tindakan melihat, yaitu membuka file asli, preview, dan membuka daftar. | Must      |
| AUD-02 | Entri memuat entity_type, entity_id, action, field_name, old_value, new_value, user_id, dan created_at. Perubahan oleh sistem memakai akun sistem Robot Admin.                                                                                                       | Must      |
| AUD-03 | Tabel audit_log append-only. Update dan delete dicegah di level database untuk semua peran, termasuk System Admin.                                                                                                                                                   | Must      |
| AUD-04 | Audit ditulis dalam transaksi yang sama dengan perubahan datanya.                                                                                                                                                                                                    | Must      |
| AUD-05 | Tabel riwayat sederhana (nilai lama, nilai baru, user, waktu) tampil read-only pada detail invoice untuk Intake dan Finance Reviewer klien terkait. **\[Tambahan\]**                                                                                                 | Must      |

### 5.8 Voucher (VCH) - UC-2, UC-9, UC-10

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                | Prioritas |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| VCH-01 | Form Buat voucher: Intake memilih klien (yang ditugaskan) dan vendor. Daftar vendor berasal dari invoice AMIGA_REVIEWED yang belum bervoucher.                                                                                                                                                                                                                                                                                             | Must      |
| VCH-02 | Tabel invoice menampilkan hanya status AMIGA_REVIEWED dengan voucher_id kosong. Kolom: checkbox, nomor invoice, tanggal, rekening, total, ikon mata.                                                                                                                                                                                                                                                                                       | Must      |
| VCH-03 | Satu voucher hanya untuk satu klien, satu vendor, dan satu rekening. Kesamaan vendor dan rekening dinilai setelah normalisasi. Setelah invoice pertama dicentang, invoice dengan rekening berbeda dinonaktifkan beserta alasannya.                                                                                                                                                                                                         | Must      |
| VCH-04 | Ikon mata membuka file asli di modal tanpa meninggalkan form, sehingga centang tidak hilang.                                                                                                                                                                                                                                                                                                                                               | Should    |
| VCH-05 | Field Peruntukan wajib diisi Intake sebelum preview (teks, maksimal 255 karakter).                                                                                                                                                                                                                                                                                                                                                         | Must      |
| VCH-06 | Preview voucher side-by-side dan read-only. Aksi: Buat voucher atau Ubah pilihan (kembali ke tabel).                                                                                                                                                                                                                                                                                                                                       | Must      |
| VCH-07 | Simpan dalam satu transaksi atomik: kunci baris invoice (SELECT ... FOR UPDATE), cek ulang status AMIGA_REVIEWED dan voucher_id kosong, alokasikan nomor, buat PDF dan unggah ke S3, simpan voucher, ubah semua invoice menjadi VOUCHERED, catat audit. Jika ada invoice yang sudah terpakai: pesan Invoice sudah masuk voucher lain, muat ulang daftar, dan daftar dimuat ulang. Jika PDF atau unggah gagal, tidak ada voucher tersimpan. | Must      |
| VCH-08 | Nomor voucher VCH-{kode klien}-{tahun}-{urutan 5 digit}. Urutan per klien per tahun. voucher_number unik global.                                                                                                                                                                                                                                                                                                                           | Must      |
| VCH-09 | Voucher terkunci setelah disimpan. Tidak ada edit atau void di MVP.                                                                                                                                                                                                                                                                                                                                                                        | Must      |
| VCH-10 | Isi voucher minimum: Nomor, Nama, Peruntukan, Tanggal, Nominal, dan Tabel Invoice Items (lihat di bawah).                                                                                                                                                                                                                                                                                                                                  | Must      |
| VCH-11 | PDF voucher terbentuk dalam 3 detik. Unduhan lewat endpoint backend yang memeriksa isolasi klien dan memberi presigned URL berumur pendek.                                                                                                                                                                                                                                                                                                 | Must      |
| VCH-12 | Unduhan pertama mengubah status voucher dan semua invoice di dalamnya menjadi SENT_TO_CLIENT secara otomatis dan atomik. Unduhan berikutnya tidak mengubah status. Keduanya dicatat di audit trail. SENT_TO_CLIENT hanya berarti voucher sudah diunduh Intake, pengiriman ke klien terjadi di luar sistem.                                                                                                                                 | Must      |
| VCH-13 | Daftar dan detail voucher (nomor, tanggal, vendor, peruntukan, nominal, status, invoice di dalamnya) untuk klien yang ditugaskan, termasuk unduh ulang.                                                                                                                                                                                                                                                                                    | Must      |

**Template voucher (minimum)**

| Elemen              | Sumber data                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Nomor               | voucher_number                                                                                                               |
| Nama                | vendor_name (penerima pembayaran)                                                                                            |
| Peruntukan          | voucher.purpose, diisi Intake. **Kolom baru di ERD.**                                                                        |
| Tanggal             | Tanggal voucher dibuat (dd/mm/yyyy)                                                                                          |
| Nominal             | Jumlah total_amount semua invoice dalam voucher, format Rp1.250.000,00                                                       |
| Tabel Invoice Items | Seluruh baris invoice_item dari semua invoice dalam voucher. Kolom: Nomor Invoice, No, Deskripsi, Qty, Harga Satuan, Jumlah. |

Selain elemen di atas, template menampilkan Rekening tujuan (bank_account voucher) di bawah Nama, serta ringkasan pajak dan diskon per invoice di bawah tabel item agar jumlah baris cocok dengan Nominal. Template resmi AMIGA dan teks batas otorisasi belum tersedia. Sampai tersedia, template minimum di atas dipakai sebagai placeholder.

### 5.9 Administrasi (ADM) - UC-11

| ID     | Requirement                                                                                                                                                                                                                | Prioritas |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| ADM-01 | System Admin: daftar user, tambah dan nonaktifkan user, set peran (satu peran per user), kelola klien (nama dan kode), dan tetapkan Intake ke klien. User nonaktif langsung tidak dapat mengakses sistem. **\[Tambahan\]** | Should    |
| ADM-02 | Service Lead: tetapkan dan cabut reviewer per klien. Seorang reviewer yang ditugaskan ke klien dapat mereview semua dokumen klien itu, dan satu klien boleh punya lebih dari satu reviewer.                                | Should    |
| ADM-03 | Daftar klien beserta reviewer dan Intake-nya (read-only) dengan indikator Belum ada reviewer, untuk Service Lead dan System Admin. **\[Tambahan\]**                                                                        | Should    |
| ADM-04 | Semua perubahan penugasan dicatat di audit trail.                                                                                                                                                                          | Should    |

Fallback bila F13 dipotong: user, klien, dan penugasan diatur lewat seed data.

## 6. Model data, status, dan konkurensi

ERD lengkap disisipkan sebagai Gambar 5. Ringkasan entitas:

| Entitas      | Kolom kunci                                                                                                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT       | id, name, **code**                                                                                                                                                                                                                                                                                                                           |
| USER         | id, name, email, role                                                                                                                                                                                                                                                                                                                        |
| USER_CLIENT  | user_id, client_id (PK gabungan)                                                                                                                                                                                                                                                                                                             |
| INVOICE      | id, request_id, client_id, uploaded_by, reviewed_by, voucher_id, previous_request_id, **request_type, channel, request_date**, vendor_name, invoice_number, invoice_date, bank_account, tax_amount, **discount_amount**, total_amount, file_key, original_filename, mime_type, status, **exception_codes**, reject_note, version, created_at |
| INVOICE_ITEM | id, invoice_id, line_no, description, quantity, unit_price, amount                                                                                                                                                                                                                                                                           |
| VOUCHER      | id, voucher_number, client_id, created_by, vendor_name, bank_account, **purpose**, total_amount, file_key, status, sent_at, created_at                                                                                                                                                                                                       |
| AUDIT_LOG    | id, entity_type, entity_id, action, field_name, old_value, new_value, user_id, created_at                                                                                                                                                                                                                                                    |

&#91;embedded content: Gambar 5 · ERD · 7 tabel\]

Gambar 5. Kolom bertanda bintang adalah perubahan terhadap ERD di dokumen Revisi UML (tabel di bawah). INVOICE disorot karena menjadi pusat relasi.

**Perubahan terhadap ERD di dokumen Revisi UML** (cetak tebal di atas):

| Perubahan                                                                               | Alasan                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| CLIENT.code                                                                             | Nomor voucher unik antar-klien (keputusan 4).                                     |
| VOUCHER.purpose                                                                         | Kolom Peruntukan pada template voucher (keputusan 8).                             |
| INVOICE.exception_codes (daftar) menggantikan exception_code                            | Satu dokumen dapat kena beberapa temuan (keputusan 6).                            |
| INVOICE.request_type, channel, request_date                                             | Metadata upload wajib belum punya kolom di ERD revisi. **\[Tambahan\]**           |
| INVOICE.discount_amount, default 0                                                      | Rumus total pada VAL-03 memperhitungkan diskon (keputusan 7). **\[Tambahan\]**    |
| INVOICE.reviewed_by, reject_note                                                        | Sudah disetujui dalam Revisi UML.                                                 |
| Nilai normalisasi vendor, nomor invoice, rekening (kolom turunan atau expression index) | Deteksi duplikat dan pengelompokan voucher. Implementasi, bukan perubahan bisnis. |

### Status invoice

| Dari                                            | Ke                                  | Pemicu                                                   | Pelaku           |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------------------------- | ---------------- |
| (awal)                                          | QUEUED                              | Upload berhasil                                          | Intake           |
| QUEUED                                          | PROCESSING                          | AI mulai membaca                                         | Sistem           |
| PROCESSING                                      | READY_FOR_REVIEW                    | Lolos semua validasi                                     | Sistem           |
| PROCESSING                                      | EXCEPTION                           | Rekening kosong, total tidak cocok, atau ekstraksi gagal | Sistem           |
| PROCESSING                                      | POSSIBLE_DUPLICATE                  | Duplikat                                                 | Sistem           |
| EXCEPTION                                       | READY_FOR_REVIEW                    | Koreksi lalu validasi ulang bersih                       | Finance Reviewer |
| READY_FOR_REVIEW                                | EXCEPTION **\[Tambahan\]**          | Koreksi memunculkan temuan baru                          | Finance Reviewer |
| EXCEPTION                                       | POSSIBLE_DUPLICATE **\[Tambahan\]** | Koreksi memunculkan duplikat                             | Finance Reviewer |
| READY_FOR_REVIEW                                | AMIGA_REVIEWED                      | Disetujui                                                | Finance Reviewer |
| READY_FOR_REVIEW, EXCEPTION, POSSIBLE_DUPLICATE | REJECTED                            | Ditolak dengan catatan                                   | Finance Reviewer |
| AMIGA_REVIEWED                                  | VOUCHERED                           | Voucher dibuat                                           | Intake           |
| VOUCHERED                                       | SENT_TO_CLIENT                      | Voucher pertama kali diunduh                             | Intake           |

REJECTED dan SENT_TO_CLIENT adalah status akhir. Tidak ada jalur balik dari AMIGA_REVIEWED.

&#91;embedded content: Gambar 4 · diagram state invoice · 9 status\]

Gambar 4. Dua transisi putus-putus adalah tambahan dari Revisi UML dan menunggu konfirmasi (pertanyaan terbuka nomor 4).

### Status voucher

CREATED (voucher disimpan) berubah menjadi SENT_TO_CLIENT pada unduhan pertama oleh Intake. Unduh ulang mempertahankan status dan tetap dicatat di audit trail.

&#91;embedded content: Gambar 6 · diagram state voucher · 2 status\]

Gambar 6. Status voucher tidak berubah setelah SENT_TO_CLIENT, dan voucher tidak dapat diedit atau dibatalkan di MVP.

### Konkurensi

| Skenario                             | Penanganan                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dua reviewer pada invoice yang sama  | Optimistic locking dengan kolom version. Simpan dan setujui hanya berhasil jika version masih sama dan status sesuai (REV-04, REV-06). Tidak ada lock manual. |
| Dua Intake memilih invoice yang sama | SELECT ... FOR UPDATE dalam satu transaksi, lalu cek ulang status dan voucher_id (VCH-07).                                                                    |
| Dua unduhan pertama bersamaan        | Perubahan status memakai kondisi status masih CREATED, sehingga hanya satu yang mengubah status.                                                              |

## 7. Non-functional requirements

**Wajib untuk MVP/PoC**

| Kategori        | Requirement                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performa        | Ekstraksi 15 detik atau kurang (PDF sampai 5 halaman). Antrean dan layar review 2 detik atau kurang. Voucher PDF 3 detik atau kurang. Konfirmasi upload 3 detik atau kurang.                |
| Keamanan        | Isolasi klien dan RBAC di backend. Bucket S3 private tanpa URL publik, akses lewat presigned URL berumur pendek. Data uji hanya data sintetis.                                              |
| Auditabilitas   | Audit trail append-only mencakup 100 persen aksi pada AUD-01. Voucher terkunci setelah disimpan.                                                                                            |
| Keandalan AI    | Hasil AI selalu draf. Kegagalan ekstraksi menghasilkan EXCEPTION, dokumen tidak pernah hilang. Mode fallback tersedia untuk demo.                                                           |
| Integritas data | Transaksi atomik untuk pembuatan voucher, perubahan status bersama audit, dan penomoran.                                                                                                    |
| Usability       | Antarmuka berbahasa Indonesia. Layar review optimal di desktop 1366 px atau lebih. Mata uang IDR, format Rp1.250.000,00, tanggal dd/mm/yyyy. Pesan error menjelaskan penyebab dan tindakan. |
| Observabilitas  | Log teknis: waktu ekstraksi, jumlah kegagalan AI, dan jumlah antrean.                                                                                                                       |
| Deployment      | Seluruh skenario uji dijalankan di lingkungan yang sudah di-deploy, bukan hanya di laptop developer.                                                                                        |

**Target sebelum produksi (di luar MVP)**

Uptime 99,9 persen pada jam operasional, kapasitas 500 invoice per hari dan 50 unggahan bersamaan, enkripsi at-rest AES-256 dan kepatuhan UU PDP penuh sebelum data nyata dipakai, aturan validasi yang dapat diubah tanpa deploy ulang, backup dan retensi data, serta penegasan kontrak bahwa data invoice tidak dipakai melatih model pihak ketiga (dikonfirmasi pada ketentuan layanan Bedrock).

## 8. Metrik keberhasilan dan traceability uji

| Metrik                                    | Target MVP                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Waktu ekstraksi per invoice               | 15 detik atau kurang (PDF sampai 5 halaman)                              |
| Waktu pembuatan voucher                   | 3 detik atau kurang                                                      |
| Waktu muat antrean dan layar review       | 2 detik atau kurang                                                      |
| Akurasi field kunci, PDF digital          | 90 persen atau lebih benar tanpa koreksi                                 |
| Akurasi field kunci, scan dan foto        | Ditetapkan setelah diukur, usulan awal 80 persen                         |
| Duplikat terdeteksi sebelum voucher       | 100 persen pada dataset uji                                              |
| Perubahan data tercatat di audit trail    | 100 persen                                                               |
| Pelanggaran SoD dan akses lintas klien    | 0 kasus                                                                  |
| Produktivitas (invoice per staf per hari) | Baseline belum diukur. Diukur sebelum demo agar target dapat ditetapkan. |

| S   | Skenario                             | Fitur          | Hasil yang didemokan                                                                                           |
| --- | ------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Alur normal                          | F02 sampai F11 | PDF diunggah, diekstrak, lolos validasi, disetujui, voucher dibuat dan PDF terunduh, status SENT_TO_CLIENT     |
| 2   | Multi-line item (3 baris atau lebih) | F04, F05       | Semua baris terbaca dan total cocok                                                                            |
| 3   | Missing evidence                     | F04, F05, F07  | MISSING_EVIDENCE, status EXCEPTION. Setelah rekening diisi reviewer, menjadi READY_FOR_REVIEW                  |
| 4   | Deteksi duplikasi                    | F05, F07       | Invoice kedua POSSIBLE_DUPLICATE, hanya dapat ditolak                                                          |
| 5   | Segregation of Duties                | F02, F07       | Aksi setujui oleh Intake ditolak (peran) dan oleh user yang sama dengan uploaded_by ditolak (pengaman backend) |
| 6   | Keamanan multi-klien                 | F02            | Intake klien A ditolak membuka dokumen klien B                                                                 |
| 7   | Penelusuran audit                    | F07, F08       | Perubahan nominal tercatat: nilai awal, nilai baru, reviewer, waktu                                            |

**Uji tambahan di luar tujuh skenario:** konflik dua reviewer pada satu invoice, dua Intake memilih invoice yang sama, penugasan dicabut saat simpan berjalan, klien tanpa reviewer, invoice dengan rekening berbeda pada satu voucher, serta unggahan scan dan foto (jika F14 masuk).

**Dataset sintetis:** minimal 8 PDF digital (normal, multi-line, tanpa rekening, pasangan duplikat, total tidak cocok) ditambah minimal 2 sampel scan dan 2 foto kamera. Akun demo: Intake A, Intake B, Finance Reviewer (klien A dan B), Service Lead, System Admin, dan satu Finance Reviewer kedua untuk uji konflik.

## 9. Asumsi, dependensi, dan risiko

**Asumsi**

- PDF digital adalah mayoritas input. Scan dan foto diterima tetapi akurasinya belum dijanjikan.
- Format invoice antar-vendor punya field kunci yang relatif konsisten.
- Satu invoice berarti satu mata uang, IDR.
- Reviewer yang ditugaskan tersedia untuk uji coba sebelum demo.

**Dependensi**

- Akses Amazon Bedrock (model multimodal aktif di region yang dipakai, kuota memadai).
- Lingkungan cloud, bucket S3 private, dan layanan antrean atau worker.
- Dataset sintetis (siap di awal pengerjaan) dan akun seed.
- Template resmi voucher AMIGA dan teks batas otorisasi (placeholder dipakai sementara).

**Risiko**

| Risiko                                                          | Tingkat | Mitigasi                                                                                                                    |
| --------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Akurasi ekstraksi rendah pada invoice kompleks, scan, atau foto | Tinggi  | Dataset semi-terstruktur, mode fallback, jalur isi manual di layar EXCEPTION, target scan ditetapkan setelah diukur         |
| Tanpa buffer pada estimasi 11,00 person-day                     | Tinggi  | Prioritas MoSCoW tetap dipakai. Jika terlambat, Should (F13, F14) diturunkan lebih dulu. Scope freeze setelah PRD disetujui |
| Akses, kuota, atau latensi Bedrock bermasalah                   | Sedang  | Uji akses di hari pertama, ID model lewat konfigurasi, mode fallback                                                        |
| Kegagalan integrasi ekstraksi, validasi, review, dan voucher    | Sedang  | Kontrak data (skema JSON ekstraksi dan status) disepakati di awal, checkpoint integrasi tengah pengerjaan                   |
| SoD atau isolasi klien tidak tertegak di kode                   | Sedang  | Unit test permission untuk skenario 5 dan 6, pair review                                                                    |
| Race condition pada voucher atau review                         | Sedang  | SELECT FOR UPDATE dan optimistic locking, diuji eksplisit                                                                   |
| Template voucher resmi belum tersedia                           | Sedang  | Template minimum sebagai placeholder, mudah diganti                                                                         |

## 10. Pertanyaan terbuka dan usulan keputusan

Keputusan 14/10/2026: butir 1 diputuskan tanpa pemotongan scope. Butir 2 sampai 8 mengikuti usulan dan sudah tercermin di bagian terkait.

| No  | Pertanyaan                                                                                                                                                                        | Usulan                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Apakah estimasi 11,00 person-day (Must 9,75) perlu dipotong?                                                                                                                      | Diputuskan: tidak ada pemotongan, 11,00 person-day disetujui.                                                                                                        |
| 2   | Apakah Nama pada voucher adalah nama vendor, dan perlukah rekening tujuan serta ringkasan pajak dan diskon tampil di template agar jumlah baris cocok dengan Nominal?             | Nama = vendor_name. Rekening tujuan ditambahkan pada template karena ini dokumen pembayaran. Ringkasan pajak dan diskon per invoice ditampilkan di bawah tabel item. |
| 3   | Metadata upload: nilai pilihan jenis permintaan dan saluran, serta arti tanggal.                                                                                                  | Saluran: WhatsApp, Email, Lainnya. Jenis permintaan: Pembayaran Vendor sebagai nilai awal. Tanggal = tanggal permintaan diterima dari klien. Kolom ditambah ke ERD.  |
| 4   | Setujui dan tolak pada diagram state: dua transisi tambahan (READY_FOR_REVIEW ke EXCEPTION dan EXCEPTION ke POSSIBLE_DUPLICATE) diperlukan agar validasi ulang konsisten. Setuju? | Setuju, dan diagram state diperbarui.                                                                                                                                |
| 5   | Skenario 5 (SoD): karena satu user hanya punya satu peran, Intake tidak pernah bisa menyetujui.                                                                                   | Skenario didemokan dengan dua lapis: penolakan karena peran, dan uji backend dengan data uploaded_by sama dengan reviewer.                                           |
| 6   | Riwayat audit pada detail invoice (AUD-05) perlu dibuka untuk Intake dan reviewer? Revisi UML belum menyebut siapa yang boleh melihatnya.                                         | Ya, read-only untuk keduanya pada klien yang ditugaskan.                                                                                                             |
| 7   | HEIC: dikonversi atau ditolak?                                                                                                                                                    | Ditolak dengan pesan jelas di MVP. Konversi masuk backlog.                                                                                                           |
| 8   | Bedrock: model, region, dan konfirmasi ketentuan layanan bahwa data tidak dipakai untuk pelatihan.                                                                                | Pilih model multimodal setelah uji pada dataset sintetis di awal pengerjaan. Konfirmasi ketentuan sebelum data nyata dipakai.                                        |

## 11. Placeholder diagram UML

| Gambar | Diagram                    | Disisipkan di | Pembaruan yang diperlukan                                                                       |
| ------ | -------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| 1      | Use case diagram           | Bagian 2      | Tambah aktor System Admin dan use case kelola user dan penugasan. UC-5 dan UC-6 boleh digabung. |
| 2      | Activity upload dan review | Bagian 4.1    | Kotak EXCEPTION dan POSSIBLE_DUPLICATE di lajur Sistem. Tambah jalur edit ke validasi ulang.    |
| 3      | Activity buat voucher      | Bagian 4.2    | Tambah langkah pengisian Peruntukan.                                                            |
| 4      | Diagram state invoice      | Bagian 6      | Dua transisi tambahan (pertanyaan 4).                                                           |
| 5      | ERD                        | Bagian 6      | Kolom baru pada tabel Perubahan terhadap ERD.                                                   |
| 6      | Diagram state voucher      | Bagian 6      | Tidak ada perubahan.                                                                            |

Gambar 1 sampai 6 sudah disisipkan pada bagian yang tercantum di tabel. Kolom terakhir mencatat pembaruan yang sudah tergambar di diagram.
