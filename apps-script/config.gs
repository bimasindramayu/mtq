// ============================================================
//  MTQ 2026 — apps-script/config.gs  (rev 9)
//  Fix #2: kuota=31 (1 per kecamatan), #9: initSheets lengkap,
//  #10: umur_min=0 (tidak ada batas bawah), #4: password here
//  rev 7: update jadwal — pendaftaran online 5-15 Agustus 2026,
//  pelaksanaan MTQ 26-28 Agustus 2026 (lihat juga config.js,
//  index.html bagian Jadwal Kegiatan & Pengumuman)
//  rev 8: LOGGER_ENABLED — satu pintu on/off untuk Logger.log
//  backend (lihat juga LOGGER_ENABLED di js/config.js untuk frontend)
//  rev 9: SHEET_LOG_ENABLED (baru) — satu pintu terpisah utk
//  mematikan baris yang ditulis ke sheet "LOG" (default: MATI, karena
//  sheet ini yang bikin spreadsheet penuh). Lihat komentar lengkap di
//  bagian 2c, dan _flushLog() di helper.gs (rev 11) utk sisi teknisnya.
// ============================================================

// ── 1. Spreadsheet & Drive ───────────────────────────────────
var SPREADSHEET_ID       = '10CS7gBHmS4nx9XKBvPttJ3qUVegsNy0Xy3J7T63J3Lk';
var DRIVE_ROOT_FOLDER_ID = '1e784li0m9IcBXy9gNsX6Yin5KAtxottg';

// ── 2. Admin Password ─────────────────────────────────────────
// FIX #4: Ganti nilai ini sebelum deploy produksi!
// Contoh yang kuat: 'MTQ2026@Indramayu#Adm!'
var ADMIN_PASSWORD   = 'MTQ2026@Admin!';

// ── Google Drive API Key (untuk DocumentPreviewer di admin) ───
// Buat di console.cloud.google.com → APIs & Services → Credentials
// Batasi: Application restrictions = HTTP referrers (your domain)
// Batasi: API restrictions = Google Drive API only
var DRIVE_API_KEY    = 'GANTI_DRIVE_API_KEY';

// ── 2b. Logger — satu pintu untuk semua logInfo/logWarn/logError ──
// (dipakai oleh helper.gs → _log() → dipanggil dari api.gs, dll.)
// true  = Logger.log tetap jalan (kelihatan di menu Executions GAS)
// false = Logger.log dimatikan (mengurangi noise saat produksi)
// CATATAN: baris ke sheet "LOG" TIDAK lagi ikut flag ini — diatur
// terpisah lewat SHEET_LOG_ENABLED di bawah (lihat komentarnya).
var LOGGER_ENABLED   = true;

// ── 2c. Sheet "LOG" (audit trail pendaftaran/verifikasi/dll) ───
// SATU PINTU untuk mematikan/menghidupkan baris yang ditulis ke sheet
// "LOG" — terpisah dari LOGGER_ENABLED di atas (itu cuma soal Logger.log/
// menu Executions GAS, bukan spreadsheet).
// false = TIDAK ADA baris baru ditulis ke sheet LOG sama sekali —
//         logInfo/logWarn/logError (dipanggil di HAMPIR SETIAP langkah
//         di api.gs/upload.gs/maqra.gs) MAUPUN writeLog_() (jejak audit
//         REGISTER/PERBAIKAN/EDIT_ANGGOTA/dst) semuanya bermuara ke
//         _flushLog() (helper.gs) — flag ini menggating persis di situ,
//         satu titik saja, jadi tidak perlu ubah pemanggilnya satu-satu.
// true  = kembali menulis seperti semula.
// CATATAN: sheet "LOG" yang SUDAH ADA beserta baris-baris lamanya TIDAK
// ikut terhapus/dikosongkan oleh flag ini — ini cuma menghentikan baris
// BARU. Kalau spreadsheet sudah kadung penuh dari baris lama, hapus
// manual isinya langsung di Google Sheets (sheet "LOG" boleh dikosongkan
// atau dihapus total — initAllSheets() akan membuatnya lagi, kosong,
// kalau flag ini dinyalakan lagi nanti).
var SHEET_LOG_ENABLED = false;

// ── 3. Nama Sheet ─────────────────────────────────────────────
var SHEET_CONFIG    = 'CONFIG';
var SHEET_PENDAFTAR = 'PENDAFTAR';
var SHEET_LOG       = 'LOG';

// ── 4. Konfigurasi Pendaftaran ────────────────────────────────
// Sesuai Juknis MTQ ke-56 Kab. Indramayu: pendaftaran online 5 s.d. 15 Agustus 2026
var PENDAFTARAN_CONFIG = {
  BUKA           : '2026-08-05T00:00:00',
  TUTUP          : '2026-08-30T23:59:59',
  AGE_CUTOFF_DATE: '2026-11-01',   // Juknis: usia dihitung per 1 November 2026 — sudah benar
  // OVERRIDE: null=auto | true=paksa buka | false=paksa tutup
  OVERRIDE       : null
};

// ── 5. Info Event ─────────────────────────────────────────────
var EVENT_INFO = {
  nama   : 'MTQ ke-56 Kabupaten Indramayu Tahun 2026',
  tanggal: '22–24 September 2026',
  lokasi : 'Kecamatan Jatibarang',
  tema   : "Dengan Al-Qur'an Membangun Generasi Emas"
};

// ── 6. Kolom PENDAFTAR (0-based) ──────────────────────────────
// FIX #6: tambah nama_bank, nomor_rekening, nama_rekening
var COL = {
  TIMESTAMP        : 0,
  NOMOR_PENDAFTARAN: 1,
  TIPE_LOMBA       : 2,
  NAMA_TIM         : 3,
  KECAMATAN        : 4,
  CABANG_LOMBA     : 5,
  GENDER_CABANG    : 6,
  NAMA_LENGKAP     : 7,
  NIK              : 8,
  TEMPAT_LAHIR     : 9,
  TANGGAL_LAHIR    : 10,
  UMUR_DISPLAY     : 11,
  JENIS_KELAMIN    : 12,
  ALAMAT           : 13,
  NO_HP            : 14,
  EMAIL            : 15,
  NAMA_BANK        : 16,   // FIX #6
  NOMOR_REKENING   : 17,   // FIX #6
  NAMA_REKENING    : 18,   // FIX #6
  LINK_FOLDER      : 19,
  ANGGOTA_JSON     : 20,
  STATUS_VERIFIKASI: 21,
  CATATAN          : 22,
  LINK_REKOM       : 23
};

// ── 7. Header PENDAFTAR ───────────────────────────────────────
var PENDAFTAR_HEADERS = [
  'timestamp','nomor_pendaftaran','tipe_lomba','nama_tim','kecamatan',
  'cabang_lomba','gender_cabang','nama_lengkap','nik','tempat_lahir',
  'tanggal_lahir','umur_display','jenis_kelamin','alamat','no_hp','email',
  'nama_bank','nomor_rekening','nama_rekening',
  'link_folder','anggota_json','status_verifikasi','catatan','link_rekom'
];

// ── 8. Header CONFIG ──────────────────────────────────────────
var CONFIG_HEADERS = [
  'cabang_lomba','tipe','gender',
  'umur_min','umur_max_tahun','umur_max_bulan','umur_max_hari',
  'kuota','status_aktif'
];

// ── 9. Data CONFIG default ────────────────────────────────────
// FIX #2: kuota=31 (1 per kecamatan Indramayu = 31 kecamatan)
// FIX #10: umur_min=0 (tidak ada batas bawah usia)
var DEFAULT_CONFIG_DATA = [
  // Tartil
  ["Tartil Al Qur'an Putra", 'individu','L', 0, 12,11,29, 31,'Aktif'],
  ["Tartil Al Qur'an Putri", 'individu','P', 0, 12,11,29, 31,'Aktif'],

  // Tilawah
  ['Tilawah Anak-anak Putra', 'individu','L', 0, 14,11,29, 31,'Aktif'],
  ['Tilawah Anak-anak Putri', 'individu','P', 0, 14,11,29, 31,'Aktif'],

  ['Tilawah Remaja Putra', 'individu','L', 0, 24,11,29, 31,'Aktif'],
  ['Tilawah Remaja Putri', 'individu','P', 0, 24,11,29, 31,'Aktif'],

  ['Tilawah Dewasa Putra', 'individu','L', 0, 40,11,29, 31,'Aktif'],
  ['Tilawah Dewasa Putri', 'individu','P', 0, 40,11,29, 31,'Aktif'],

  // Qira'at
  ["Qira'at Mujawwad Putra", 'individu','L', 0, 40,11,29, 31,'Aktif'],
  ["Qira'at Mujawwad Putri", 'individu','P', 0, 40,11,29, 31,'Aktif'],

  // Hafalan
  ['Hafalan 1 Juz dan Tilawah Putra', 'individu','L', 0, 15,11,29, 31,'Aktif'],
  ['Hafalan 1 Juz dan Tilawah Putri', 'individu','P', 0, 15,11,29, 31,'Aktif'],

  ['Hafalan 5 Juz dan Tilawah Putra', 'individu','L', 0, 20,11,29, 31,'Aktif'],
  ['Hafalan 5 Juz dan Tilawah Putri', 'individu','P', 0, 20,11,29, 31,'Aktif'],

  ['Hafalan 10 Juz Putra', 'individu','L', 0, 20,11,29, 31,'Aktif'],
  ['Hafalan 10 Juz Putri', 'individu','P', 0, 20,11,29, 31,'Aktif'],

  // Tafsir
  ['Tafsir Bahasa Indonesia Putra', 'individu','L', 0, 34,11,29, 31,'Aktif'],
  ['Tafsir Bahasa Indonesia Putri', 'individu','P', 0, 34,11,29, 31,'Aktif'],

  // Kaligrafi
  ['Kaligrafi Naskah Putra', 'individu','L', 0, 34,11,29, 31,'Aktif'],
  ['Kaligrafi Naskah Putri', 'individu','P', 0, 34,11,29, 31,'Aktif'],

  ['Kaligrafi Hiasan Mushaf Putra', 'individu','L', 0, 34,11,29, 31,'Aktif'],
  ['Kaligrafi Hiasan Mushaf Putri', 'individu','P', 0, 34,11,29, 31,'Aktif'],

  ['Kaligrafi Dekorasi Putra', 'individu','L', 0, 34,11,29, 31,'Aktif'],
  ['Kaligrafi Dekorasi Putri', 'individu','P', 0, 34,11,29, 31,'Aktif'],

  // Fahm Al Qur'an (Tim)
  ["Fahm Al Qur'an Putra", 'team','L', 0, 18,11,29, 31,'Aktif'],
  ["Fahm Al Qur'an Putri", 'team','P', 0, 18,11,29, 31,'Aktif'],

  // Syarh Al Qur'an (Tim)
  ["Syarh Al Qur'an Putra", 'team','L', 0, 18,11,29, 31,'Aktif'],
  ["Syarh Al Qur'an Putri", 'team','P', 0, 18,11,29, 31,'Aktif']
];