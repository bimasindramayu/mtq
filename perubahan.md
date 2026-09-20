# MTQ 2026 — Perbaikan 404 Beban Tinggi + Format Maqra

Semua berkas di sini adalah **versi utuh siap tukar**, bukan potongan tambal. Timpa
berkas lama dengan nama yang sama. Tidak ada berkas baru, jadi tidak ada `<script>`
yang perlu ditambahkan di HTML mana pun.

| Berkas | Taruh di |
|---|---|
| `apps-script/helper.gs` | project Apps Script |
| `apps-script/api.gs` | project Apps Script |
| `js/config.js` | folder `js/` |
| `js/kartu-bukti-shared.js` | folder `js/` |
| `js/cek-maqra.js` | folder `js/` |
| `js/admin-maqra.js` | folder `js/` |
| `doyourmagic.html` | root |
| `data/quran/` (115 berkas) | root, jadi `data/quran/...` — **folder baru** |

Setelah menempel ke Apps Script: **Deploy → Manage deployments → Edit → Version:
New version → Deploy**. URL `/exec` tidak berubah. Lalu naikkan `?v=` pada tag
`<script>` di HTML (mis. `?v=202609201`) supaya browser tidak memakai JS lama.

---

## A. Penyebab 404

404 itu bukan dari `/exec` kamu — semua `/exec` menjawab 302 dengan normal. Yang
404 adalah kaki kedua redirect, `script.googleusercontent.com/macros/echo`, dan
isinya halaman Drive generik "Sorry, unable to open the file at this time".

Di HAR, request yang gagal itu **menunggu 29 detik** sebelum dijawab 404; request
yang sama persis saat antrean longgar selesai dalam **409 ms**. Jadi yang habis
bukan kapasitas request, melainkan **slot eksekusi**: batasnya 30 eksekusi
simultan per user, dan karena web app dideploy "Execute as: Me", seluruh
pengunjung berbagi jatah 30 milik akun pemilik.

## B. Yang diperbaiki

**1. `apiGetAll_` sekarang lewat cache** (`api.gs` + `cachedReadBig_` di
`helper.gs`). Ini endpoint terberat dan satu-satunya yang belum ter-cache: tiap
tab dan tiap refresh memicu pembacaan penuh sheet PENDAFTAR. `cachedRead_` yang
lama tidak bisa dipakai karena diam-diam melewati hasil > 95 KB — versi baru
meng-gzip JSON-nya lalu memecahnya ke beberapa key CacheService (~90 KB per key).
TTL 45 detik, dan invalidasi otomatis lewat scope `['p']` yang sudah ada, jadi
hasil verifikasi/edit peserta tetap langsung terlihat.

**2. Batas request lintas-tab** (`config.js`). `MAX_CONCURRENT = 4` itu per
halaman, jadi 5 tab = 20 request berjalan dari satu orang. Sekarang ada daftar
slot bersama di `localStorage`: maksimal 3 per tab dan **6 gabungan seluruh tab**.
Slot dari tab yang ditutup paksa kedaluwarsa sendiri setelah 60 detik.

**3. Cache klien untuk `getConfig`** (`config.js`), 10 menit, dibagi semua tab.
Di log-mu satu tab meminta `getConfig` tiga kali dalam 42 detik padahal isinya
nyaris statis berjam-jam.

**4. Backoff retry dinaikkan** jadi ~0,9 dtk → 1,8 dtk → 3,6 dtk + jitter (dulu
0,6–1,3 dtk, terlalu pendek untuk skala waktu GAS yang mengantre). Timeout 35 dtk
→ 45 dtk. Aturan "TIMEOUT tidak diulang" **sengaja dipertahankan**: membatalkan
fetch tidak membatalkan eksekusi Apps Script, jadi mengirim ulang hanya menambah
eksekusi yatim yang masih memegang slot.

> Cara memastikan berhasil: buka editor Apps Script → **Executions** → filter
> **Status = Running**, lalu ulangi tes refresh berkali-kali. Jumlah baris
> "Running" seharusnya tidak lagi menumpuk mendekati 30.

## C. Format maqra di PDF

Parser `parseMaqra()` ditambahkan di `kartu-bukti-shared.js` (otomatis tersedia
di semua halaman yang sudah memuat berkas itu). Ia memecah baris baku:

```
SURAT AL-BAQARAH - AYAT : 21 – HAL : 5   →  surat "AL-BAQARAH", ayat "21", halaman "5"
```

Pemisahan memakai kata kunci `AYAT` dan `HAL`/`HALAMAN`, **bukan** `split('-')` —
nama surat sendiri banyak yang bertanda hubung (`AL-BAQARAH`, `AN-NISA`). Toleran
terhadap `-`/`–`/`—`, titik dua opsional, `HAL` atau `HALAMAN`, kata `SURAT`
opsional, dan rentang ayat (`102-109`). Baris yang tidak mengenali polanya
ditampilkan utuh apa adanya, tidak pernah hilang.

Di PDF, kotak maqra sekarang bertingkat: **nama surat besar**, lalu dua kartu
putih **AYAT** dan **HALAMAN** dengan angka besar (teks gelap di atas putih —
kontras tertinggi setelah dicetak), lalu baris aslinya sebagai rujukan
verifikasi panitia, lalu nomor undian. Ukuran font seluruh kartu dinaikkan dan
semua teks abu-abu tipis diganti hitam; kualitas potret `html2canvas` naik dari
`scale: 2.5` ke `3`.

Kalau baris maqra tidak memuat nama surat (mis. admin hanya menulis
`AYAT : 113 – HAL : 17`), nama surat diambil dari kolom **maqra_detail** yang
memang dipakai admin untuk menulis surat sekali untuk satu batch.

Tampilan di layar ikut disamakan: kartu hasil peserta di `cek-maqra.js` dan modal
hasil di `admin-maqra.js` sekarang memakai tata letak yang sama dengan PDF.


---

## D. Teks ayat Al-Qur'an di PDF bukti maqra

### Sumbernya
Teks memakai **Mushaf Standar Indonesia (Kemenag)** — 6.236 ayat, disimpan
sebagai berkas statis di `data/quran/{nomor-surat}.json` (total 1,4 MB, tapi
yang diunduh hanya surat yang sedang dibutuhkan: rata-rata ~12 KB, paling besar
Al-Baqarah ~110 KB). Berkasnya di-cache di `localStorage`, jadi unduhan borongan
100 peserta dengan surat yang sama hanya sekali menyentuh jaringan.

Contoh yang Anda kirim (Al-Baqarah 168) sudah dicocokkan **karakter per
karakter** dengan berkas ini: identik. Berkas disimpan dalam bentuk NFC, yang
hanya menyeragamkan *urutan simpan* tanda (shadda sebelum/sesudah fathah) tanpa
mengubah tandanya — hasil render di layar dan di PDF sama persis.

**Kenapa berkas statis, bukan API pihak ketiga:** bukti maqra dicetak saat acara
berlangsung, sering dari HP dengan sinyal seadanya. Menggantungkannya pada API
luar berarti PDF bisa keluar tanpa ayat (atau gagal total) hanya karena layanan
orang lain sedang *down* atau kena *rate limit*. Berkas statis ikut ter-hosting
bersama situs ini — selama situsnya terbuka, ayatnya pasti ada.

### Fontnya
**Scheherazade New** (SIL), dimuat dari Google Fonts, dengan Amiri sebagai
cadangan. Dipilih karena memang dirancang untuk teks Arab berharakat penuh gaya
mushaf Indonesia: tandanya dicetak besar dan tidak bertabrakan, jadi tetap
terbaca setelah kartu dikecilkan ke kertas. `downloadBuktiMaqraPdf()` sekarang
**menunggu font selesai dimuat** sebelum `html2canvas` memotret — tanpa itu yang
terpotret adalah font pengganti sistem dan harakatnya berantakan.

### Pencocokan nama surat
Ejaan bebas panitia tetap ketemu: `AL-BAQARAH`, `Al Baqoroh`, `albaqarah`,
`Aali Imron`, `Yaasiin`, `Baraah` (At-Taubah), `Bani Israil` (Al-Isra'),
`Al-Masad`/`Al-Lahab`, `Asy-Syarh`/`Al-Insyirah` — semuanya dikenali. Diuji
terhadap 114 nama kanonik + 42 varian ejaan: nol salah, nol tabrakan, dan teks
yang bukan nama surat ("Juz 30 acak") tetap dikembalikan 0. Ambang toleransi
salah ketik sengaja diketatkan — **salah tebak surat pada dokumen resmi jauh
lebih buruk daripada sekadar gagal mengenali**, jadi kalau ragu, blok ayat
dikosongkan dan sisa kartu tetap tercetak normal.

### Tata letak
Kartu diubah jadi **dua kolom** (identitas peserta di kiri, kotak maqra di
kanan), lebar panggung 620px. Ini bukan soal selera: kartu difoto lalu ditempel
ke A4, dan penskalaannya memakai sisi yang paling sesak. Versi 1 kolom + blok
ayat punya rasio tinggi:lebar 2,3 sedangkan area cetak A4 hanya 1,46 — kartunya
dipaksa mengecil sampai 120 mm dan menyisakan 70 mm kertas kosong. Dengan dua
kolom rasionya turun ke 1,25–1,40, jadi kartu tercetak selebar **190 mm penuh**
dan semua teks lebih besar di kertas meski ukuran px-nya sama. Hasil ukur:
teks data peserta ≈ 13,5 pt, nama surat ≈ 29 pt, teks ayat ≈ 27 pt.

Ukuran font Arab turun bertingkat mengikuti panjang teks (31px untuk 1 ayat
pendek sampai 18px untuk rentang panjang), dan rentang lebih dari 10 ayat
dipotong dengan keterangan, supaya 1 peserta tetap 1 halaman.

### Batas yang perlu diketahui
- Rentang ayat (`AYAT : 102-105`) didukung; ditampilkan maksimal 10 ayat.
- Kalau nama surat tidak ada di baris maqra, dipakai isi kolom **maqra_detail**.
- Halaman (`HAL`) hanya dicetak apa adanya dari input admin — nomor halaman
  berbeda antar cetakan mushaf, jadi sengaja tidak divalidasi ke data.