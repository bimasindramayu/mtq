# Panduan Setup Google Apps Script untuk MTQ Registration

## STEP 1: Buat Google Sheets untuk Menyimpan Data

1. Buka https://sheets.google.com
2. Klik "Buat spreadsheet baru"
3. Beri nama: "MTQ Registration Data"
4. Pada Sheet pertama, ubah nama dari "Sheet1" menjadi "Peserta"
5. **Copy ID Spreadsheet** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
   Bagian {SPREADSHEET_ID} itulah yang Anda butuhkan
   ```

## STEP 2: Buat Folder di Google Drive untuk Upload File

1. Buka https://drive.google.com
2. Klik kanan → "Folder baru"
3. Beri nama: "MTQ Upload Files"
4. **Copy ID Folder** dari URL:
   ```
   https://drive.google.com/drive/folders/{FOLDER_ID}
   Bagian {FOLDER_ID} itulah yang Anda butuhkan
   ```

## STEP 3: Buat Google Apps Script Project

1. Buka Google Sheet yang sudah dibuat di STEP 1
2. Klik menu: **Extensions → Apps Script**
3. Tunggu sampai halaman baru terbuka
4. **Hapus semua code** yang ada di `Code.gs`
5. **Copy-paste code** dari file `Code.gs` (artifact di atas)

## STEP 4: Update Konfigurasi di Code.gs

Pada baris 2-3 di Code.gs, ganti dengan data Anda:

```javascript
const SHEET_ID = 'GANTI_DENGAN_ID_SPREADSHEET_ANDA';
const FOLDER_ID = 'GANTI_DENGAN_ID_FOLDER_DRIVE_ANDA';
```

Contoh:
```javascript
const SHEET_ID = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t';
const FOLDER_ID = '0ABCDe1F2g3H4i5J6k7L8m9N0O1P2Q3R4S5T6U';
```

## STEP 5: Deploy sebagai Web App

1. Di Apps Script, klik tombol **"Deploy"** (sudut kanan atas)
2. Klik **"New deployment"**
3. Pilih "Select type" → cari dan pilih **"Web app"**
4. Isi form:
   - **Execute as**: Pilih akun Anda
   - **Who has access**: Pilih **"Anyone"**
5. Klik **"Deploy"**
6. **COPY URL** yang muncul. Contohnya:
   ```
   https://script.google.com/macros/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p/usercopy
   ```

## STEP 6: Update URL di script.js

1. Buka file `script.js` Anda
2. Cari baris yang ada `APPS_SCRIPT_URL`
3. Ganti dengan URL dari STEP 5:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p/usercopy';
```

**PENTING**: Pastikan URL berakhir dengan `/usercopy` (bukan `/exec`)

## STEP 7: Update script.js Untuk Production

Cari bagian ini di `config.js`:

```javascript
const isDemo = true;
```

Ubah menjadi:

```javascript
const isDemo = false;
```

Ini akan mengaktifkan pengiriman data ke Google Apps Script.

## STEP 8: Testing

1. Buka `index.html` di browser
2. Test dengan data dummy:
   - NIK: 1234567890123456
   - Nama: Test Peserta
   - Tanggal Lahir: 2010-01-01
   - Cabang: Pilih salah satu
   - Upload semua dokumen (file dummy)
3. Klik "Daftar Peserta"
4. Jika berhasil, cek Google Sheet Anda - data harus sudah ada

## STEP 9: Verifikasi Data di Google Sheets

1. Buka Google Sheet (dari STEP 1)
2. Lihat Sheet "Peserta"
3. Data peserta harus sudah tersimpan dengan rapi
4. Kolom "Link" berisi link ke file yang sudah diupload

## STEP 10: Verifikasi File di Google Drive

1. Buka folder yang dibuat di STEP 2
2. Semua file yang diupload harus ada di sini
3. File bisa diakses publik (untuk link sharing)

---

## Troubleshooting

### Error: "Cannot find property SHEET_ID"
- Pastikan Anda sudah update konstanta di atas dengan ID yang benar
- Refresh halaman Apps Script

### Error: "Spreadsheet not found"
- ID Spreadsheet salah. Copy ulang dari URL
- Pastikan format ID benar (panjang, berisi huruf dan angka)

### File tidak terupload
- Pastikan folder di Drive sudah dibuat
- Folder ID harus benar
- Akun yang menjalankan Apps Script harus punya akses ke folder

### Form tidak submit
- Buka Console (F12) untuk lihat error
- Pastikan `isDemo = false` di script.js
- Pastikan URL Apps Script benar di script.js

### Data tidak muncul di Sheet
- Refresh halaman Sheet
- Pastikan Sheet name adalah "Peserta" (case-sensitive)
- Cek di Apps Script console untuk error

---

## Info Penting

- **Setiap kali ubah Code.gs**, Anda perlu **Deploy ulang**
- File yang diupload akan disimpan otomatis di folder Drive
- Data tersimpan rapi di Google Sheets dengan timestamp
- Link file bisa dibagikan ke peserta melalui email

---

## Keamanan

- URL Web App bisa diakses siapa saja (by design)
- Data tersimpan aman di Google Sheets/Drive milik Anda
- Firestore/Database tidak digunakan (opsional jika mau lebih secure)
- Backup otomatis tersedia di Google Drive