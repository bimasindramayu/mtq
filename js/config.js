// ============================================================
//  MTQ 2026 — js/config.js
//  ═══════════════════════════════════════════════════════════
//  SATU-SATUNYA SUMBER KONFIGURASI FRONTEND.
//  Semua file lain (daftar.js, main.js, admin-maqra.js,
//  admin-penilaian.js, penilaian.js/.html, index.html,
//  cek-maqra.js, maqra.js) WAJIB baca nilai dari MTQ_CONFIG —
//  JANGAN hardcode ulang cabang, umur cutoff, tanggal
//  buka/tutup pendaftaran, atau API_URL di file lain.
//
//  Untuk update tahunan/perubahan Juknis: HANYA file ini yang
//  perlu diedit. Nilai cabang/tanggal di sini adalah fallback —
//  akan ditimpa nilai live dari backend saat apiGetConfig_()
//  berhasil dipanggil (lihat MTQ_CONFIG.applyServerConfig).
// ============================================================

const MTQ_CONFIG = {

  // ── Google Apps Script Web App URL — SATU-SATUNYA tempat edit ──
  API_URL: 'https://script.google.com/macros/s/AKfycbyedWA3tESryA90YThpq1WfFzT-k0ImNX6q9BCzIU06gaMp03ZemsDjd6gjyunRYeev/exec',

  // ── Tanggal pendaftaran & cutoff umur ────────────────────────
  // Fallback bila API tidak terjangkau — akan ditimpa nilai live
  // dari backend (config.gs → PENDAFTARAN_CONFIG) saat getConfig berhasil.
  // Sesuai Juknis MTQ ke-56 Kab. Indramayu: pendaftaran online 5 s.d. 15 Agustus 2026,
  // usia dihitung per 1 November 2026.
  PENDAFTARAN_BUKA : '2026-08-05T00:00:00',
  PENDAFTARAN_TUTUP: '2026-08-15T23:59:59',
  AGE_CUTOFF_DATE  : '2026-11-01',

  // ── Info Event ───────────────────────────────────────────────
  EVENT_DATE_START  : '2026-08-26T08:00:00',   // Untuk countdown (tanggal mulai)
  EVENT_DATE_DISPLAY: '26–28 Agustus 2026',    // Untuk tampilan (rentang tanggal)
  EVENT_LOCATION    : 'Kecamatan Jatibarang',
  EVENT_THEME       : "Dengan Al-Qur'an Membangun Generasi Emas",
  EVENT_TITLE       : 'MTQ ke-56 Kabupaten Indramayu Tahun 2026',

  // ── Cabang & Golongan Musabaqah ──────────────────────────────
  // SATU-SATUNYA daftar cabang untuk SELURUH sistem: form pendaftaran,
  // manajemen maqra, sistem penilaian, dan hasil publik semua baca dari
  // sini (langsung, atau lewat MTQ_CONFIG.CABANG_LIST di bawah).
  // Fallback bila API gagal — sesuai Juknis MTQ ke-56 (14 golongan × 2 gender).
  CABANG_CONFIG_FALLBACK: [
    { cabang_lomba:"Tartil Al Qur'an Putra", tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:12, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:"Tartil Al Qur'an Putri", tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:12, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Tilawah Anak-anak Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:14, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Tilawah Anak-anak Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:14, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Tilawah Remaja Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:24, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Tilawah Remaja Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:24, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Tilawah Dewasa Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Tilawah Dewasa Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:"Qira'at Mujawwad Putra", tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:"Qira'at Mujawwad Putri", tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Hafalan 1 Juz dan Tilawah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:15, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Hafalan 1 Juz dan Tilawah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:15, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Hafalan 5 Juz dan Tilawah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Hafalan 5 Juz dan Tilawah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Hafalan 10 Juz Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Hafalan 10 Juz Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Tafsir Bahasa Indonesia Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Tafsir Bahasa Indonesia Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Kaligrafi Naskah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Kaligrafi Naskah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Kaligrafi Hiasan Mushaf Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Kaligrafi Hiasan Mushaf Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:'Kaligrafi Dekorasi Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:'Kaligrafi Dekorasi Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:"Fahm Al Qur'an Putra", tipe:'team', gender:'L', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:"Fahm Al Qur'an Putri", tipe:'team', gender:'P', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

    { cabang_lomba:"Syarh Al Qur'an Putra", tipe:'team', gender:'L', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
    { cabang_lomba:"Syarh Al Qur'an Putri", tipe:'team', gender:'P', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' }
  ],

  // ── Developer Mode ───────────────────────────────────────────
  // true  = tampilkan tombol Random Fill (untuk testing)
  // false = sembunyikan (untuk produksi)
  DEV_MODE: false,

  // ── Logger — SATU PINTU on/off untuk SEMUA logger frontend ────
  // Dipakai oleh objek `log` di bawah, adminLog (admin.html), dan
  // MTQ_LOG (penilaian.html). true = tampil di console (dan panel
  // logger di penilaian.html), false = senyap di semua halaman.
  // Ganti HANYA di sini — jangan hardcode ulang di file lain.
  LOGGER_ENABLED: false,
};

// ── Turunan otomatis: nama cabang saja (untuk dropdown/filter) ──
// Dipakai admin-maqra.js, admin-penilaian.js, penilaian.js/.html,
// index.html (Hasil Penilaian Publik) — jangan tulis ulang array
// nama cabang di file-file itu, cukup baca MTQ_CONFIG.CABANG_LIST.
MTQ_CONFIG.CABANG_LIST = MTQ_CONFIG.CABANG_CONFIG_FALLBACK.map(c => c.cabang_lomba);

// ── Terapkan hasil apiGetConfig_() dari server ke MTQ_CONFIG ──
// Panggil ini di callback getConfig tiap file (daftar.js, admin-maqra.js,
// dst) supaya SEMUA file otomatis memakai data live yang sama begitu
// salah satu berhasil memuatnya — bukan cuma file yang memanggil API.
// `data` = hasil JSON dari action=getConfig (lihat apiGetConfig_ di api.gs).
MTQ_CONFIG.applyServerConfig = function(data) {
  if (!data || !data.success) return false;
  if (Array.isArray(data.config) && data.config.length) {
    MTQ_CONFIG.CABANG_CONFIG_FALLBACK = data.config;
    MTQ_CONFIG.CABANG_LIST = data.config.map(c => c.cabang_lomba);
  }
  if (data.registrationConfig) {
    if (data.registrationConfig.buka)          MTQ_CONFIG.PENDAFTARAN_BUKA  = data.registrationConfig.buka;
    if (data.registrationConfig.tutup)         MTQ_CONFIG.PENDAFTARAN_TUTUP = data.registrationConfig.tutup;
    if (data.registrationConfig.ageCutoffDate) MTQ_CONFIG.AGE_CUTOFF_DATE   = data.registrationConfig.ageCutoffDate;
  }
  return true;
};

// ── Logger terpusat ──────────────────────────────────────────
// Setiap method dijaga oleh MTQ_CONFIG.LOGGER_ENABLED — matikan
// logger di SELURUH frontend cukup dengan ganti satu nilai itu.
const log = {
  info : (...a) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.log('%c[MTQ] INFO', 'color:#065f46;font-weight:bold', ...a); },
  warn : (...a) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.warn('%c[MTQ] WARN', 'color:#b45309;font-weight:bold', ...a); },
  error: (...a) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.error('%c[MTQ] ERROR', 'color:#dc2626;font-weight:bold', ...a); },
  debug: (...a) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.debug('%c[MTQ] DEBUG', 'color:#6b7280;font-weight:bold', ...a); },
  step : (n, msg) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.group(
    `%c[MTQ] STEP ${n}: ${msg}`,
    'color:#0369a1;font-weight:bold'
  ); },

  group: (title) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.group(
    `%c[MTQ] ${title}`,
    'color:#047857;font-weight:bold'
  ); },

  end  : () => { if (MTQ_CONFIG.LOGGER_ENABLED) console.groupEnd(); },

  time : (label) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.time(`[MTQ] ${label}`); },
  timeEnd: (label) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.timeEnd(`[MTQ] ${label}`); },

  table: (data) => { if (MTQ_CONFIG.LOGGER_ENABLED) console.table(data); },
};

// ── Utilitas Tanggal ─────────────────────────────────────────
/**
 * Hitung umur presisi (tahun-bulan-hari) pada tanggal cutoff
 * @param {string} dobStr    - 'YYYY-MM-DD'
 * @param {string} cutoffStr - 'YYYY-MM-DD'  (default: MTQ_CONFIG.AGE_CUTOFF_DATE)
 * @returns {{ tahun:number, bulan:number, hari:number }}
 */
function calcAgeAt(dobStr, cutoffStr) {
  const cutoffDate = cutoffStr || MTQ_CONFIG.AGE_CUTOFF_DATE;
  const dob    = new Date(dobStr    + 'T00:00:00');
  const cutoff = new Date(cutoffDate + 'T00:00:00');

  let tahun = cutoff.getFullYear() - dob.getFullYear();
  let bulan = cutoff.getMonth()    - dob.getMonth();
  let hari  = cutoff.getDate()     - dob.getDate();

  if (hari < 0) {
    bulan--;
    const prevMonthEnd = new Date(cutoff.getFullYear(), cutoff.getMonth(), 0);
    hari += prevMonthEnd.getDate();
  }
  if (bulan < 0) { tahun--; bulan += 12; }

  return { tahun, bulan, hari };
}

/**
 * Cek apakah umur (obj) dalam rentang [minTahun, {maxTahun,maxBulan,maxHari}]
 * @returns {{ ok:boolean, msg:string }}
 */
function checkAgeRange(age, minTahun, maxTahun, maxBulan, maxHari) {
  if (age.tahun < minTahun) {
    return { ok: false, msg: `Usia kurang dari minimum ${minTahun} tahun` };
  }
  // Bandingkan dengan batas maksimum presisi
  if (age.tahun > maxTahun) {
    return { ok: false, msg: `Usia melebihi batas maksimum ${maxTahun} tahun ${maxBulan} bulan ${maxHari} hari` };
  }
  if (age.tahun === maxTahun) {
    if (age.bulan > maxBulan) {
      return { ok: false, msg: `Usia melebihi batas maksimum ${maxTahun} tahun ${maxBulan} bulan ${maxHari} hari` };
    }
    if (age.bulan === maxBulan && age.hari > maxHari) {
      return { ok: false, msg: `Usia melebihi batas maksimum ${maxTahun} tahun ${maxBulan} bulan ${maxHari} hari` };
    }
  }
  return { ok: true, msg: `Usia valid: ${age.tahun} thn ${age.bulan} bln ${age.hari} hr` };
}

/**
 * Format objek umur menjadi string
 */
function fmtAge(age) {
  return `${age.tahun} thn ${age.bulan} bln ${age.hari} hr`;
}

/**
 * Cek status pendaftaran berdasarkan waktu sekarang
 * @returns {'belum_buka'|'buka'|'tutup'}
 */
function getRegStatus() {
  const now   = new Date();
  const buka  = new Date(MTQ_CONFIG.PENDAFTARAN_BUKA);
  const tutup = new Date(MTQ_CONFIG.PENDAFTARAN_TUTUP);
  if (now < buka)  return 'belum_buka';
  if (now < tutup) return 'buka';
  return 'tutup';
}

// ── Satu-satunya sumber API_URL untuk semua file ──────────────
// main.js, daftar.js, admin.html, admin-maqra.js, admin-penilaian.js,
// penilaian.js/.html, cek-maqra.js, maqra.js — semuanya baca dari sini.
window.MTQ_API_URL = MTQ_CONFIG.API_URL;