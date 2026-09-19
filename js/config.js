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
  API_URL: 'https://script.google.com/macros/s/AKfycbwXTDY6rcFlFsHmIcyMBZsof3z5KtrEZTp2W6o-tVVNrdzapJE-1cYdfKF5h_iYrihr/exec',

  // ── Tanggal pendaftaran & cutoff umur ────────────────────────
  // Fallback bila API tidak terjangkau — akan ditimpa nilai live
  // dari backend (config.gs → PENDAFTARAN_CONFIG) saat getConfig berhasil.
  // Sesuai Juknis MTQ ke-56 Kab. Indramayu: pendaftaran online 5 s.d. 15 Agustus 2026,
  // usia dihitung per 1 November 2026.
  PENDAFTARAN_BUKA : '2026-08-05T00:00:00',
  PENDAFTARAN_TUTUP: '2026-09-17T21:59:59',
  AGE_CUTOFF_DATE  : '2026-11-01',

  // ── Info Event ───────────────────────────────────────────────
  EVENT_DATE_START  : '2026-09-22T08:00:00',   // Untuk countdown (tanggal mulai)
  EVENT_DATE_DISPLAY: '22–24 September 2026',    // Untuk tampilan (rentang tanggal)
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

  // ── Data Panitia Pengambilan Maqra ────────────────────────────
  // Dipakai kartu-bukti-shared.js (buildBuktiMaqraCardHtml) utk mengisi
  // kolom tanda tangan "Panitia Pengambilan Maqra" pada Bukti Maqra
  // (nama tercetak + NIP, tanda tangan aslinya tetap ditulis tangan di
  // atas kolom ini setelah dicetak). Frontend-only — tidak dibaca
  // backend (config.gs), karena kartu bukti dibuat 100% di browser.
  // Kolom "Admin Kecamatan" di kartu SENGAJA dibiarkan kosong (beda
  // orang per kecamatan, bukan nilai tunggal seperti ini).
  // GANTI nilai di bawah sebelum deploy produksi. Kosongkan
  // PANITIA_MAQRA_NIP (string kosong) kalau panitia tidak punya
  // NIP (mis. bukan ASN) — baris NIP otomatis disembunyikan di kartu.
  // ── Teks ayat Al-Qur'an untuk Bukti Maqra (rev 15) ──────────────
  // Folder berkas statis teks ayat (Mushaf Standar Indonesia/Kemenag),
  // relatif terhadap halaman HTML yang memuatnya. Ubah HANYA kalau folder
  // data/ dipindah. Isinya 114 berkas {nomor-surat}.json; yang diunduh
  // cuma surat yang sedang dibutuhkan, lalu di-cache di localStorage.
  QURAN_BASE: 'data/quran',

  PANITIA_MAQRA_NAMA: 'ROSID, S.H.',
  PANITIA_MAQRA_NIP : '197003072014111002',

  // ── Developer Mode ───────────────────────────────────────────
  // true  = tampilkan tombol Random Fill (untuk testing)
  // false = sembunyikan (untuk produksi)
  DEV_MODE: false,

  // ── Logger — SATU PINTU on/off untuk SEMUA logger frontend ────
  // Dipakai oleh objek `log` di bawah, adminLog (admin.html), dan
  // MTQ_LOG (penilaian.html). true = tampil di console (dan panel
  // logger di penilaian.html), false = senyap di semua halaman.
  // Ganti HANYA di sini — jangan hardcode ulang di file lain.
  LOGGER_ENABLED: true,
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

// ── Transport HTTP bersama: fetch TANPA cookie + antrean + retry ─────────
// MASALAH (rev 13): semua halaman admin/hakim/peserta memanggil Apps Script
// lewat <script src="...exec?...&callback=..."> (JSONP). Tag <script> SELALU
// ikut mengirim cookie login Google milik browser. Kalau browser sedang login
// ke LEBIH DARI SATU akun Google (hampir semua HP Android & laptop admin),
// script.google.com mengalihkan ke /macros/u/1/s/... lalu menjawab
// "404 Not Found / Sorry, unable to open the file at present" — untuk SEMUA
// action (getAllPendaftar, getMaqraAdmin, ...). Gejalanya persis yang tertulis di
// panduan deploy doyourmagic.html: gagal di browser biasa, aman di Incognito.
// fetch() lintas-origin TIDAK mengirim cookie (credentials:'omit'), jadi
// masalah akun ganda itu hilang. Dipakai lebih dulu; <script> lama tetap jadi
// cadangan di tiap pemanggil.
//   MTQ_HTTP.request(url, {timeout, attempts}) → Promise<objek JSON>
//     ditolak dgn Error.code = 'TIMEOUT' | 'FAILED' | 'BAD_RESPONSE'
//   MTQ_HTTP.attemptsFor(url) → jumlah percobaan yang AMAN utk action itu
// Batas 4 request berjalan bersamaan per halaman (sisanya antre) supaya satu
// halaman tidak menghabiskan slot eksekusi Apps Script sendirian; kegagalan
// cepat (404/5xx/jaringan) diulang dgn jeda acak. TIMEOUT tidak diulang
// (server sedang sibuk — request pertama mungkin masih berjalan).
const MTQ_HTTP = (function () {
  const MAX_CONCURRENT = 3;      // batas per HALAMAN (tab ini saja)
  const GLOBAL_MAX     = 6;      // batas gabungan SEMUA tab di browser ini
  const SLOTS_KEY      = 'mtq_http_slots';
  const SLOT_TTL       = 60000;  // slot yatim (tab ditutup paksa) kedaluwarsa sendiri
  const CACHE_KEY      = 'mtq_http_cache';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Action yang aman diulang otomatis (baca, atau tulis idempoten).
  const IDEMPOTENT = {
    updateStatus:1, deactivate:1, editPeserta:1, editAnggota:1, adminLogin:1,
    ambilMaqra:1, ambilMaqraAdmin:1, saveMaqraConfig:1, setHasilPublikStatus:1,
    saveParam:1, updateHakim:1, deletePeserta:1, deleteHakim:1, deleteMaqra:1,
  };

  // Hasil yang boleh disimpan di sisi klien & berapa lama (ms). Isinya nyaris
  // statis berjam-jam, tapi di log HAR getConfig diminta 3x dalam 42 detik
  // oleh SATU tab — dikalikan jumlah tab & refresh, ini penyumbang beban
  // terbesar yang sebetulnya tidak perlu ada. Disimpan di localStorage supaya
  // dipakai bersama semua tab, bukan sessionStorage per tab.
  const CLIENT_CACHE_MS = { getConfig: 10 * 60 * 1000, getMaqraStatus: 0 };

  // ── Slot lintas-tab ────────────────────────────────────────────────────
  // MAX_CONCURRENT saja tidak cukup: batasnya per halaman, jadi 5 tab admin
  // = 5x jatah sendiri-sendiri dan satu orang bisa menghabiskan sebagian
  // besar dari 30 slot eksekusi Apps Script milik akun pemilik. Daftar slot
  // yang sedang berjalan ditaruh di localStorage supaya semua tab di browser
  // yang sama berbagi satu jatah.
  const myId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let mySeq = 0;

  function readSlots() {
    try {
      const now = Date.now();
      const raw = JSON.parse(localStorage.getItem(SLOTS_KEY) || '{}');
      const out = {};
      for (const k in raw) if (raw[k] > now) out[k] = raw[k];
      return out;
    } catch (e) { return null; }
  }
  function takeSlot() {
    const s = readSlots();
    if (s === null) return 'nostore';          // localStorage mati → jangan blokir
    if (Object.keys(s).length >= GLOBAL_MAX) return null;
    const id = myId + ':' + (++mySeq);
    s[id] = Date.now() + SLOT_TTL;
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(s)); } catch (e) { return 'nostore'; }
    return id;
  }
  function freeSlot(id) {
    if (!id || id === 'nostore') return;
    try {
      const s = readSlots() || {};
      delete s[id];
      localStorage.setItem(SLOTS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  // ── Antrean lokal ──────────────────────────────────────────────────────
  let running = 0;
  const waiting = [];
  function acquire() {
    return new Promise((resolve) => {
      const tryStart = () => {
        if (running >= MAX_CONCURRENT) { waiting.push(tryStart); return; }
        const slot = takeSlot();
        if (!slot) { setTimeout(tryStart, 250 + Math.floor(Math.random() * 450)); return; }
        running++;
        resolve(slot);
      };
      tryStart();
    });
  }
  function release(slot) {
    running--;
    freeSlot(slot);
    const next = waiting.shift();
    if (next) next();
  }

  // ── Cache klien ────────────────────────────────────────────────────────
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function cacheKeyFor(url) {
    const a = actionOf(url);
    if (!CLIENT_CACHE_MS[a]) return null;
    try {
      const u = new URL(url, location.href);
      u.searchParams.delete('callback');
      u.searchParams.delete('token');            // token berganti tiap slot waktu
      return u.pathname + '?' + u.searchParams.toString();
    } catch (e) { return null; }
  }
  function cacheGet(k) {
    const c = readCache()[k];
    return (c && c.exp > Date.now()) ? c.v : null;
  }
  function cachePut(k, v, ttl) {
    try {
      const all = readCache();
      const now = Date.now();
      for (const x in all) if (all[x].exp <= now) delete all[x];   // sapu yang basi
      all[k] = { exp: now + ttl, v: v };
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  function actionOf(url) {
    try {
      const u = new URL(url, location.href);
      const pd = u.searchParams.get('postData');
      if (pd) { try { return String(JSON.parse(pd).action || ''); } catch (e) { return ''; } }
      return String(u.searchParams.get('action') || '');
    } catch (e) { return ''; }
  }

  function attemptsFor(url) {
    const a = actionOf(url);
    if (!a) return 1;
    if (/^(get|check|verify|ping)/i.test(a)) return 3;   // baca
    return IDEMPOTENT[a] ? 2 : 1;                        // tulis
  }

  function parseBody(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    const m = String(text).match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);   // _noop({...})
    if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
    return null;
  }

  async function once(url, timeout) {
    const ctrl  = (typeof AbortController === 'function') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const full = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=_noop';   // sama dgn jalur fetch di daftar.js
      const res  = await fetch(full, { method: 'GET', credentials: 'omit', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined });
      const text = await res.text();
      if (!res.ok) { const e = new Error('HTTP ' + res.status); e.code = 'FAILED'; e.status = res.status; throw e; }
      const json = parseBody(text);
      if (json === null) { const e = new Error('Respons bukan JSON'); e.code = 'BAD_RESPONSE'; throw e; }
      return json;
    } catch (err) {
      if (err && err.name === 'AbortError') { const e = new Error('Timeout'); e.code = 'TIMEOUT'; throw e; }
      if (err && !err.code) err.code = 'FAILED';
      throw err;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function run(url, o) {
    let last;
    for (let i = 0; i < o.attempts; i++) {
      try { return await once(url, o.timeout); }
      catch (err) {
        last = err;
        // TIMEOUT tidak diulang: eksekusi Apps Script TIDAK ikut batal saat
        // fetch di-abort — mengirim ulang hanya menambah eksekusi yatim yang
        // masih memegang slot, persis yang bikin antrean makin panjang.
        if (err && err.code === 'TIMEOUT') break;
        if (i < o.attempts - 1) {
          // Backoff eksponensial + jitter. Jeda 600-1300 ms yang lama terlalu
          // pendek utk skala waktu GAS yang sedang mengantre (di log, satu
          // request sempat menunggu 29 detik sebelum dijawab 404).
          await sleep(900 * Math.pow(2, i) + Math.floor(Math.random() * 800));
        }
      }
    }
    throw last;
  }

  function request(url, opts) {
    const o = Object.assign({ timeout: 45000, attempts: attemptsFor(url) }, opts || {});
    const ck = cacheKeyFor(url);
    if (ck) { const hit = cacheGet(ck); if (hit) return Promise.resolve(hit); }
    return acquire().then((slot) =>
      run(url, o).then(
        (val) => {
          if (ck && val && val.success !== false) cachePut(ck, val, CLIENT_CACHE_MS[actionOf(url)]);
          release(slot);
          return val;
        },
        (err) => { release(slot); throw err; }
      )
    );
  }

  return { request, attemptsFor, clearCache, available: (typeof fetch === 'function') };
})();
window.MTQ_HTTP = MTQ_HTTP;