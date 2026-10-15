# AMIGA Robot Admin: Revisi Diagram UML Invoice ke Voucher

Draf revisi untuk ditinjau, 14/10/2026. Berdasarkan BRD v1.0 dan keputusan yang disepakati dalam diskusi. Dokumen ini merangkum revisi diagram (use case, activity upload dan review, activity buat voucher, ERD, state invoice, state voucher) dalam bentuk teks dan tabel.

## 1. Ringkasan

Dua use case utama:

1. Upload dan ekstrak invoice: Intake mengunggah file invoice (PDF atau gambar), AI mengekstrak isinya menjadi data terstruktur, lalu data disimpan ke dua tabel (invoice dan invoice item) sebagai draf yang bisa dibuka kembali. Finance Reviewer memeriksa, mengoreksi, dan menyetujui atau menolak hasil ekstraksi di layar split-screen.
2. Buat voucher: Intake memilih satu atau lebih invoice berstatus AMIGA\_REVIEWED, melihat preview voucher yang read-only, lalu menyimpan voucher. Invoice yang sudah masuk voucher tidak muncul lagi di daftar pilihan.

Use case pendukung: Validasi invoice, Catat audit trail, Lihat hasil ekstraksi, Lihat hasil review, Periksa dan koreksi, Setujui atau tolak, Unduh voucher PDF, Lihat daftar voucher, dan Tetapkan reviewer per klien.

## 2. Aktor dan hak akses

PIC Klien tidak memiliki akses ke sistem. Pengunggahan dilakukan oleh Intake, yaitu personel internal AMIGA.

| Aksi | Intake | Finance Reviewer | Service Lead | Robot Admin |
| --- | --- | --- | --- | --- |
| Upload invoice dan metadata | Ya | Tidak | Tidak | Tidak |
| Lihat antrean dan status (klien yang ditugaskan) | Ya | Ya | Tidak | Tidak |
| Lihat hasil ekstraksi dan hasil review (read-only) | Ya | Ya | Tidak | Tidak |
| Koreksi field, setujui, tolak | Tidak | Ya | Tidak | Tidak |
| Buka file asli (ikon mata) | Ya | Ya | Tidak | Tidak |
| Buat voucher, lihat daftar voucher, unduh voucher | Ya | Tidak | Tidak | Tidak |
| Tetapkan reviewer per klien | Tidak | Tidak | Ya | Tidak |
| Ekstraksi dan validasi otomatis | Tidak | Tidak | Tidak | Ya |

Aturan tambahan:

- Satu user hanya memiliki satu peran di MVP.
- Pengecekan pengunggah tidak sama dengan penyetuju tetap dipasang di backend sebagai pengaman.
- Akses per klien ditetapkan lewat tabel penugasan user ke klien (user\_client). System Admin menugaskan Intake, Service Lead menugaskan Finance Reviewer. Seorang reviewer yang ditugaskan ke satu klien dapat mereview semua dokumen klien itu.
- Penugasan yang dicabut berlaku langsung. Aksi simpan atau setujui yang sedang berjalan ditolak dengan pesan jelas, dan perubahan penugasan dicatat di audit trail.
- Jika sebuah klien belum punya reviewer aktif, unggahan tetap diterima. Antrean menandai klien itu dengan indikator "Belum ada reviewer".

## 3. Use case

| ID | Use case | Aktor | Jenis | Keterangan |
| --- | --- | --- | --- | --- |
| UC-1 | Upload dan ekstrak invoice | Intake, Robot Admin | Utama | PDF, JPG, atau PNG, maksimal 10 MB per file, satu file per request. Menerbitkan Request ID dan status QUEUED. |
| UC-2 | Buat voucher | Intake | Utama | Memilih invoice berstatus AMIGA\_REVIEWED tanpa voucher, untuk satu klien, satu vendor, dan satu nomor rekening. Preview read-only. |
| UC-3 | Validasi invoice | Robot Admin | Pendukung | Di-include oleh UC-1. Memeriksa rekening, kecocokan total, dan duplikat. |
| UC-4 | Catat audit trail | Sistem | Pendukung | Di-include oleh UC-1, UC-2, dan UC-7. Juga mencakup persetujuan, penolakan, unduh voucher, dan perubahan penugasan. |
| UC-5 | Lihat hasil ekstraksi | Intake | Pendukung | Read-only. Data draf di dua tabel bisa dibuka kembali kapan saja. |
| UC-6 | Lihat hasil review | Intake | Pendukung | Status dan catatan penolakan reviewer. |
| UC-7 | Periksa dan koreksi | Finance Reviewer | Pendukung | Layar split-screen, PDF atau gambar di kiri, data yang bisa diedit di kanan. Setiap edit memicu validasi ulang. |
| UC-8 | Setujui atau tolak | Finance Reviewer | Pendukung | Setuju mengubah status menjadi AMIGA\_REVIEWED. Tolak wajib disertai catatan. |
| UC-9 | Unduh voucher PDF | Intake | Extend dari UC-2 | Unduhan pertama mengubah status voucher menjadi SENT\_TO\_CLIENT. |
| UC-10 | Lihat daftar voucher | Intake | Pendukung | Daftar dan detail voucher, termasuk unduh ulang. |
| UC-11 | Tetapkan reviewer per klien | Service Lead | Pendukung | Menentukan reviewer yang boleh mereview dokumen sebuah klien. |

## 4. Alur upload dan review (activity diagram)

Lajur Intake:

1. Intake mengunggah file dan mengisi metadata wajib (klien, jenis permintaan, saluran, tanggal).

Lajur Sistem dan AI:

2. Sistem menerbitkan Request ID dan menetapkan status QUEUED. File disimpan di Amazon S3 dan key-nya dicatat.
3. AI mengekstrak isi file. Status PROCESSING.
4. Sistem menyimpan hasil ekstraksi ke tabel invoice dan invoice item sebagai draf.
5. Sistem menjalankan validasi otomatis: kelengkapan rekening, kecocokan total dengan jumlah baris, dan duplikat (nomor invoice dan vendor yang sama).
6. Jika lolos, status menjadi READY\_FOR\_REVIEW. Jika tidak, status menjadi EXCEPTION atau POSSIBLE\_DUPLICATE.

Lajur Finance Reviewer:

7. Reviewer membuka dokumen di layar split-screen dan memeriksa hasil ekstraksi, termasuk file asli lewat ikon mata.
8. Opsional: reviewer mengoreksi field. Setiap perubahan dicatat di audit trail (nilai lama, nilai baru, user, waktu) dan validasi dijalankan ulang, sehingga EXCEPTION dapat kembali menjadi READY\_FOR\_REVIEW.
9. Reviewer memutuskan. Setuju: status AMIGA\_REVIEWED. Tolak: status REJECTED dengan catatan wajib.

Lajur Intake (lanjutan):

10. Intake melihat status dan catatan hasil review. Jika ditolak, Intake mengunggah file baru sebagai Request baru, dengan referensi opsional ke request sebelumnya (previous\_request\_id). Tidak ada alur bolak-balik pada request yang sama.

Aturan khusus:

- POSSIBLE\_DUPLICATE diblokir dan hanya dapat ditolak, tanpa override.
- Dokumen tanpa nomor rekening ditandai MISSING\_EVIDENCE dan berstatus EXCEPTION.
- Jika ekstraksi gagal atau dokumen tidak terbaca jelas, status EXCEPTION dengan pesan penyebab. Reviewer mengisi manual atau menolak. Dokumen tidak boleh hilang dari antrean.
- Intake tidak dapat mengedit hasil ekstraksi. Hak koreksi hanya dimiliki Finance Reviewer.

## 5. Alur buat voucher (activity diagram)

1. Intake membuka form Buat voucher dan memilih klien dan vendor.
2. Sistem menampilkan tabel invoice dengan filter status = AMIGA\_REVIEWED dan voucher\_id kosong, hanya untuk klien yang ditugaskan. Kolom: checkbox, nomor invoice, tanggal, rekening, total, dan ikon mata.
3. Ikon mata membuka file asli (PDF atau gambar sesuai mime\_type) di modal viewer tanpa meninggalkan form, sehingga pilihan yang sudah dicentang tidak hilang. Backend mengecek isolasi klien lalu mengembalikan presigned URL berumur pendek.
4. Intake mencentang satu atau lebih invoice. Setelah invoice pertama dipilih, invoice dengan rekening berbeda dinonaktifkan beserta alasannya.
5. Preview voucher tampil side-by-side dan read-only.
6. Intake memilih Buat voucher atau Ubah pilihan. Ubah pilihan kembali ke tabel.
7. Sistem mengunci baris invoice (SELECT ... FOR UPDATE) dalam satu transaksi dan memeriksa ulang bahwa status masih AMIGA\_REVIEWED dan voucher\_id masih kosong. Jika tidak, Intake menerima pesan "Invoice sudah masuk voucher lain, muat ulang daftar" dan daftar dimuat ulang.
8. Sistem menyimpan voucher (nomor VCH-{tahun}-{urutan 5 digit}, urutan per klien), mengubah status semua invoice di dalamnya menjadi VOUCHERED dengan voucher\_id terisi, dan mencatat audit trail, semuanya dalam satu transaksi atomik.
9. Opsional: Intake mengunduh voucher PDF. Unduhan pertama mengubah status voucher dan invoice di dalamnya menjadi SENT\_TO\_CLIENT secara otomatis. Unduhan berikutnya tidak mengubah status, tetapi tetap dicatat di audit trail.

Pembatalan voucher (void) berada di luar scope MVP karena voucher bersifat terkunci.

## 6. Model data (ERD)

### Relasi

| Dari | Ke | Kardinalitas | Keterangan |
| --- | --- | --- | --- |
| CLIENT | USER\_CLIENT | 1 ke banyak | Penugasan user ke klien |
| USER | USER\_CLIENT | 1 ke banyak | Intake dan reviewer memakai tabel yang sama |
| CLIENT | INVOICE | 1 ke banyak |  |
| CLIENT | VOUCHER | 1 ke banyak |  |
| USER | INVOICE | 1 ke banyak | Sebagai pengunggah (uploaded\_by) |
| USER | INVOICE | 0..1 ke banyak | Sebagai reviewer (reviewed\_by) |
| USER | VOUCHER | 1 ke banyak | Sebagai pembuat (created\_by) |
| VOUCHER | INVOICE | 0..1 ke banyak | Satu voucher berisi banyak invoice, satu invoice maksimal satu voucher |
| INVOICE | INVOICE\_ITEM | 1 ke 1..banyak |  |
| INVOICE | INVOICE | 0..1 ke banyak | Unggah ulang (previous\_request\_id) |
| USER | AUDIT\_LOG | 1 ke banyak | Audit log bersifat polimorfik lewat entity\_type dan entity\_id |

### Tabel INVOICE

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | uuid, PK |  |
| request\_id | string, unik | Request ID |
| client\_id | uuid, FK |  |
| uploaded\_by | uuid, FK | Intake pengunggah |
| reviewed\_by | uuid, FK | Kosong sampai direview |
| voucher\_id | uuid, FK | Kosong sebelum masuk voucher |
| previous\_request\_id | uuid, FK | Kosong jika bukan unggah ulang |
| vendor\_name | string |  |
| invoice\_number | string | Bersama vendor\_name dipakai untuk deteksi duplikat |
| invoice\_date | date |  |
| bank\_account | string |  |
| tax\_amount | decimal |  |
| total\_amount | decimal |  |
| file\_key | string | S3 key, bucket private |
| original\_filename | string |  |
| mime\_type | string | PDF, JPG, atau PNG |
| status | string | Lihat bagian 7 |
| exception\_code | string | Misalnya MISSING\_EVIDENCE |
| reject\_note | string | Wajib saat REJECTED |
| version | int | Optimistic locking untuk dua reviewer pada invoice yang sama |
| created\_at | timestamp |  |

### Tabel INVOICE\_ITEM

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | uuid, PK |  |
| invoice\_id | uuid, FK |  |
| line\_no | int |  |
| description | string |  |
| quantity | decimal |  |
| unit\_price | decimal |  |
| amount | decimal |  |

### Tabel VOUCHER

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| id | uuid, PK |  |
| voucher\_number | string, unik | VCH-{tahun}-{urutan 5 digit}, urutan per klien |
| client\_id | uuid, FK |  |
| created\_by | uuid, FK | Intake pembuat |
| vendor\_name | string |  |
| bank\_account | string | Satu voucher satu rekening tujuan |
| total\_amount | decimal |  |
| file\_key | string | S3 key voucher PDF |
| status | string | CREATED atau SENT\_TO\_CLIENT |
| sent\_at | timestamp | Waktu unduhan pertama |
| created\_at | timestamp |  |

### Tabel pendukung

| Tabel | Kolom |
| --- | --- |
| CLIENT | id (PK), name |
| USER | id (PK), name, email, role (INTAKE, FINANCE\_REVIEWER, SERVICE\_LEAD, SYSTEM\_ADMIN) |
| USER\_CLIENT | user\_id (PK, FK), client\_id (PK, FK) |
| AUDIT\_LOG | id (PK), entity\_type, entity\_id, action, field\_name, old\_value, new\_value, user\_id (FK), created\_at. Append-only. |

Catatan penyimpanan file: file disimpan di Amazon S3 dengan key yang kita tentukan sendiri sebelum upload, misalnya clients/{client\_id}/invoices/{invoice\_id}.pdf, karena response upload S3 tidak mengembalikan key atau URL. Bucket private, tanpa URL publik. Akses lewat endpoint backend yang mengecek isolasi klien lalu memberikan presigned URL berumur pendek, misalnya 5 menit. Voucher PDF memakai pola yang sama.

## 7. Status invoice

| Dari | Ke | Pemicu | Pelaku |
| --- | --- | --- | --- |
| (awal) | QUEUED | Upload berhasil | Intake |
| QUEUED | PROCESSING | AI mulai membaca file | Sistem |
| PROCESSING | READY\_FOR\_REVIEW | Lolos seluruh validasi | Sistem |
| PROCESSING | EXCEPTION | Rekening kosong, total tidak cocok, atau ekstraksi gagal | Sistem |
| PROCESSING | POSSIBLE\_DUPLICATE | Nomor invoice dan vendor sama dengan dokumen sebelumnya | Sistem |
| EXCEPTION | READY\_FOR\_REVIEW | Koreksi lalu validasi ulang lolos | Finance Reviewer |
| READY\_FOR\_REVIEW | AMIGA\_REVIEWED | Disetujui | Finance Reviewer |
| READY\_FOR\_REVIEW, EXCEPTION, POSSIBLE\_DUPLICATE | REJECTED | Ditolak dengan catatan wajib | Finance Reviewer |
| AMIGA\_REVIEWED | VOUCHERED | Voucher dibuat | Intake |
| VOUCHERED | SENT\_TO\_CLIENT | Voucher pertama kali diunduh | Intake |

REJECTED dan SENT\_TO\_CLIENT adalah status akhir. Tidak ada jalur balik dari AMIGA\_REVIEWED. Status DRAFT yang sempat diusulkan dibatalkan.

## 8. Status voucher

| Dari | Ke | Pemicu |
| --- | --- | --- |
| (awal) | CREATED | Voucher disimpan |
| CREATED | SENT\_TO\_CLIENT | Unduhan pertama oleh Intake |
| SENT\_TO\_CLIENT | SENT\_TO\_CLIENT | Unduh ulang. Status tetap, audit trail tetap dicatat. |

SENT\_TO\_CLIENT hanya berarti voucher sudah diunduh Intake. Pengiriman ke klien terjadi di luar sistem.

## 9. Penanganan konkurensi

| Skenario | Penanganan |
| --- | --- |
| Dua Finance Reviewer pada invoice yang sama | Optimistic locking dengan kolom version. Simpan dan setujui hanya berhasil jika version masih sama dan status masih READY\_FOR\_REVIEW atau EXCEPTION. Yang kalah menerima pesan "Data sudah diubah user lain, muat ulang". Tidak ada lock manual. |
| Dua Intake memilih invoice yang sama untuk voucher | SELECT ... FOR UPDATE dalam satu transaksi, lalu cek ulang status AMIGA\_REVIEWED dan voucher\_id kosong. |

## 10. Deviasi dari BRD v1.0

| Aspek | BRD v1.0 | Revisi ini |
| --- | --- | --- |
| Pengunggah | PIC Klien atau Intake Support | Intake internal AMIGA. Klien tidak punya akses ke sistem. |
| Pembuatan voucher | Otomatis per invoice setelah disetujui | Manual oleh Intake, satu voucher untuk banyak invoice (satu klien, vendor, dan rekening) |
| Format file | PDF | PDF, JPG, PNG. OCR keluar dari daftar out-of-scope, tanpa modul OCR terpisah. |
| Target akurasi | 90 persen pada PDF digital | 90 persen untuk PDF digital. Target scan dan foto ditetapkan setelah diukur, usulan awal 80 persen. |
| Status voucher | Tidak ada | CREATED dan SENT\_TO\_CLIENT |
| SENT\_TO\_CLIENT | Setelah unduhan oleh PIC | Otomatis saat Intake mengunduh voucher pertama kali |
| KPI adopsi | 90 persen invoice masuk lewat platform, bukan WhatsApp atau email | Berubah makna: klien tetap mengirim ke Intake lewat WhatsApp atau email, platform dipakai internal |
| Skenario uji 6 | User Klien A ditolak membuka dokumen Klien B | Intake klien A ditolak membuka dokumen klien B |
| Akun demo | PIC Klien A, PIC Klien B, dan lainnya | Intake A dan B menggantikan PIC Klien A dan B |
| Dataset sintetis | 8 sampai 10 PDF | Ditambah minimal 2 sampel scan dan 2 foto kamera |

Penanganan gambar dan scan:

- Format diterima: PDF, JPG, PNG. HEIC dikonversi di server atau ditolak dengan pesan jelas.
- Invoice fisik multi-halaman digabung dulu menjadi satu PDF oleh Intake.
- Batas ukuran tetap 10 MB per file.
- Dokumen yang tidak terbaca jelas menghasilkan status EXCEPTION dengan pesan "Dokumen tidak terbaca jelas".
- Layar review perlu zoom dasar agar foto bisa dibaca.

## 11. Hal yang perlu dicek pada revisi ini

1. Use case diagram: Lihat hasil ekstraksi dan Lihat hasil review digambar sebagai dua use case terpisah. Keduanya read-only untuk Intake. Jika dianggap terlalu halus, bisa digabung menjadi satu.
2. Activity upload: kotak EXCEPTION atau POSSIBLE\_DUPLICATE berada di lajur Sistem karena merupakan hasil validasi. Koreksi dengan validasi ulang hanya berlaku untuk EXCEPTION, sedangkan POSSIBLE\_DUPLICATE hanya dapat ditolak.
3. ERD: kolom reviewed\_by dan reject\_note di invoice ditambahkan karena dibutuhkan untuk menampilkan hasil review ke Intake dan mencatat penolakan. Keduanya belum pernah dibahas secara eksplisit.
4. Unduh voucher PDF digambar sebagai langkah opsional, karena voucher sudah sah setelah disimpan. Jika Intake wajib mengunduh sebagai bagian dari alur, langkah ini menjadi wajib.

## 12. Backlog dan di luar scope

- Pembatalan persetujuan oleh reviewer sebelum VOUCHERED.
- Pembatalan (void) voucher.
- Alur bolak-balik perbaikan pada request yang sama, digantikan unggah ulang sebagai Request baru.
- Kolom penugasan reviewer per invoice, hanya jika fitur alokasi ulang oleh Service Lead dipertahankan. Saat ini penugasan reviewer per klien sudah cukup.
- Template resmi voucher AMIGA dan teks batas otorisasi masih menjadi dependensi (BRD 6.2). Gunakan placeholder sampai tersedia.

## 13. Langkah berikutnya

Jika seluruh isi sudah sesuai, balas "diagram oke". Dokumen final kemudian dikunci dengan spesifikasi per use case (pra-kondisi, alur utama, alur alternatif, aturan bisnis, pasca-kondisi) dan diagram dalam bentuk visual.
