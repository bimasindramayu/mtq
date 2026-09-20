// ============================================================
//  MTQ 2026 — helper.gs  (rev 11)
//  Fix: proper logger with sheet+console, token fix
//  rev 10 — checkNIKDuplicate_() sekarang menerima excludeNomor
//  (opsional) + menolak NIK yang dobel DI DALAM satu form yang sama.
//  Dipakai untuk mengizinkan NIK diedit dengan aman: perbaikan data
//  peserta Ditolak / ganti anggota tim dengan peserta baru (apiPerbaikan_
//  di api.gs) dan edit NIK dari modal admin (apiEditPesertaGet_ /
//  apiEditAnggotaGet_ di api.gs). Lihat komentar lengkap di fungsinya.
//  rev 11 — _flushLog() sekarang membaca SHEET_LOG_ENABLED (config.gs,
//  baru, default FALSE) — sheet "LOG" bikin spreadsheet penuh, jadi
//  baris baru ke sheet itu dimatikan. Ini SATU titik yang menggating
//  SEMUA jalur (logInfo/logWarn/logError ATAUPUN writeLog_ — keduanya
//  bermuara ke _flushLog ini), jadi tidak ada pemanggil lain di api.gs/
//  upload.gs/maqra.gs yang perlu diubah. Baris LOG lama yang sudah
//  kadung tersimpan TIDAK ikut terhapus — itu perlu dibersihkan manual
//  langsung di spreadsheet.
//  rev 8: _log() sekarang baca LOGGER_ENABLED (config.gs) —
//  satu pintu on/off untuk Logger.log. Baris ke sheet LOG (audit
//  trail) tetap tersimpan terlepas dari flag ini — lihat catatan
//  di config.gs bagian 2b.
//  rev 9 — FIX #16: tambah getSS_() — cache SpreadsheetApp.openById()
//  per EKSEKUSI (bukan lintas request; var global di GAS di-reset tiap
//  invocation baru, jadi ini aman & tidak pernah menyajikan data basi).
//  Sebelumnya HAMPIR SETIAP action di api.gs/maqra.gs memanggil
//  SpreadsheetApp.openById(SPREADSHEET_ID) sendiri-sendiri, DITAMBAH
//  doGet() di api.gs membukanya SEKALI LAGI di akhir cuma untuk
//  _flushLog() — jadi satu request bisa membuka spreadsheet yang sama
//  2-3× berturut-turut. Untuk spreadsheet ini yang sudah punya banyak
//  sheet (PENDAFTAR, CONFIG, LOG, MAQRA, Hakim/Peserta/Nilai, dst),
//  tiap openById() TIDAK gratis — pada action berat seperti
//  getAllPendaftar, ini menyumbang ke lambatnya respons dan bisa
//  membuat request keburu kena timeout JSONP 20 detik di sisi client
//  (lihat FIX #15 di doyourmagic.html/main.js/daftar.js/cek-maqra.js
//  untuk sisi lain dari masalah yang sama). getSS_() TIDAK mengubah
//  perilaku apa pun — cuma menghindari membuka ulang spreadsheet yang
//  sama dalam satu eksekusi yang sama.
// ============================================================

// ── FIX #16: spreadsheet handle di-cache PER EKSEKUSI ──────────
// Ganti semua `SpreadsheetApp.openById(SPREADSHEET_ID)` di seluruh
// project (api.gs, helper.gs, maqra.gs) dengan getSS_(). JANGAN cache
// lintas eksekusi (mis. lewat PropertiesService/CacheService) — var
// global di sini otomatis kembali null tiap kali GAS menjalankan
// eksekusi baru, dan itu sudah pas: dalam SATU request/eksekusi tidak
// ada alasan membuka handle baru berkali-kali ke spreadsheet yang sama,
// tapi lintas request kita tetap mau handle yang segar seperti biasa.
var _cachedSS_ = null;
function getSS_() {
  if (!_cachedSS_) _cachedSS_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _cachedSS_;
}

// ════════════════════════════════════════════════════════════
//  LOGGER — tulis ke console GAS + sheet LOG
// ════════════════════════════════════════════════════════════
var _logBuffer = [];   // buffer agar appendRow tidak dipanggil tiap baris

function logInfo (ctx, msg, data) { _log('INFO',  ctx, msg, data); }
function logWarn (ctx, msg, data) { _log('WARN',  ctx, msg, data); }
function logError(ctx, msg, data) { _log('ERROR', ctx, msg, data); }

function _log(level, ctx, msg, data) {
  var line = '[MTQ2026][' + level + '][' + ctx + '] ' + msg;
  if (data !== undefined) line += ' | ' + JSON.stringify(data);
  // Satu pintu on/off: LOGGER_ENABLED di config.gs. Default aman ke
  // "aktif" kalau variabelnya entah kenapa belum terdefinisi.
  if (typeof LOGGER_ENABLED === 'undefined' || LOGGER_ENABLED) Logger.log(line);
  // Baris ke sheet LOG TETAP disimpan walau logger dimatikan — ini
  // audit trail (verifikasi/pendaftaran), bukan sekadar debug noise.
  _logBuffer.push([new Date().toISOString(), level, ctx, msg,
                   data !== undefined ? JSON.stringify(data) : '']);
}

function _flushLog(ss) {
  // FIX: satu pintu SHEET_LOG_ENABLED (config.gs) — kalau false, buang isi
  // buffer tanpa menulis apa pun ke sheet "LOG". logInfo/logWarn/logError
  // (dipanggil di HAMPIR SETIAP langkah di api.gs/upload.gs/maqra.gs) DAN
  // writeLog_() (jejak audit REGISTER/PERBAIKAN/EDIT_ANGGOTA/dst) semuanya
  // lewat _log() → _logBuffer → _flushLog() ini — jadi menggating di SATU
  // titik ini sudah cukup, tidak perlu ubah pemanggilnya satu per satu di
  // file lain. typeof-check: default AMAN (tetap menulis) kalau entah
  // kenapa SHEET_LOG_ENABLED belum terdefinisi — sama seperti pola
  // LOGGER_ENABLED di _log() di atas.
  if (typeof SHEET_LOG_ENABLED !== 'undefined' && !SHEET_LOG_ENABLED) {
    _logBuffer = [];
    return;
  }
  if (!_logBuffer.length) return;
  try {
    var sheet = ss ? ss.getSheetByName(SHEET_LOG) : null;
    if (!sheet) {
      if (!ss) ss = getSS_();   // FIX #16: pakai cache, bukan openById() baru
      sheet = getOrCreateSheet_(ss, SHEET_LOG, ['timestamp','level','context','message','data']);
    }
    sheet.getRange(sheet.getLastRow()+1, 1, _logBuffer.length, 5).setValues(_logBuffer);
  } catch(e) { Logger.log('[MTQ2026] _flushLog error: ' + e.message); }
  _logBuffer = [];
}

// ════════════════════════════════════════════════════════════
//  CACHE — CacheService dgn versi per-"scope" (rev 12)
// ════════════════════════════════════════════════════════════
// Latar belakang: Apps Script Web App hanya memproses ~30 eksekusi BERSAMAAN
// per project; sisanya ditolak/ditunda. Hampir semua endpoint publik dulu
// membuka spreadsheet + membaca seluruh sheet PENDAFTAR di TIAP request,
// jadi ~10+ pengunjung serentak (tiap halaman memanggil 3-5 action) sudah
// cukup untuk menabrak batas itu → respons gagal/timeout. Sekarang hasil
// baca yang sifatnya "boleh basi beberapa detik" disimpan di CacheService
// dan dipakai bersama SEMUA pengunjung — 100 pengunjung ≈ 1 kali baca sheet.
//
// Invalidasi: tiap scope punya nomor versi ('p' = data PENDAFTAR,
// 'n' = data Sistem Penilaian). Aksi yang MENULIS data memanggil
// bumpCacheForAction_() (dipasang SATU tempat di doGet/doPost) → nomor
// versi naik → cache lama otomatis tidak terpakai lagi. TTL tetap ada
// sebagai jaring pengaman untuk edit manual langsung di Google Sheets.
var CACHE_WRITE_SCOPES_ = {
  register:['p'], perbaikan:['p'], updateStatus:['p'], editPeserta:['p'],
  editAnggota:['p'], addAnggota:['p'], removeAnggota:['p'], deactivate:['p'],
  initSheets:['p'],
  saveHakim:['n'], updateHakim:['n'], deleteHakim:['n'], saveParam:['n'],
  savePeserta:['n'], deletePeserta:['n'], importPesertaFromPendaftaran:['n'],
  setHasilPublikStatus:['n'], saveNilai:['n']
  // Aksi Maqra (ambilMaqra, saveMaqra, dst.) sengaja TIDAK ada di sini:
  // belum ada hasil baca Maqra yang di-cache, jadi tidak perlu invalidasi.
};

function _cache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function _cacheVers_(c, scopes) {
  if (!scopes || !scopes.length) return '';
  var keys = scopes.map(function(s){ return 'ver_' + s; });
  var got  = c.getAll(keys), out = [], missing = {}, anyMissing = false;
  keys.forEach(function(k) {
    var v = got[k];
    if (!v) { v = String(Date.now()); missing[k] = v; anyMissing = true; }
    out.push(v);
  });
  if (anyMissing) c.putAll(missing, 21600);
  return out.join('.');
}

function bumpCache_(scope) {
  var c = _cache_(); if (!c) return;
  try { c.put('ver_' + scope, String(Date.now()) + String(Math.floor(Math.random()*1000)), 21600); } catch (e) {}
}

function bumpCacheForAction_(action) {
  var sc = CACHE_WRITE_SCOPES_[String(action || '')];
  if (sc) sc.forEach(bumpCache_);
}

/**
 * cachedRead_(name, ttlSec, scopes, computeFn [, opts])
 *  - name    : nama unik hasil (sertakan parameter pembeda di dalamnya)
 *  - scopes  : ['p'] / ['n'] / ['p','n'] / [] (tanpa versi, murni TTL)
 *  - opts.stale === false : jangan pernah menyajikan salinan lama
 * Hasil dengan success===false TIDAK disimpan. Nilai > ~95 KB tidak disimpan
 * (batas CacheService 100 KB) — tetap benar, hanya tanpa cache.
 * Anti-stampede: begitu versi naik, hanya satu eksekusi yang menghitung
 * ulang; eksekusi lain yg datang bersamaan memakai salinan terakhir
 * (maks. 120 dtk) kalau ada, alih-alih ikut membaca sheet berbarengan.
 */
function cachedRead_(name, ttlSec, scopes, computeFn, opts) {
  var c = _cache_();
  if (!c) return computeFn();
  var allowStale = !(opts && opts.stale === false);
  var key, busyKey, staleKey = 'stale:' + name;
  try {
    key     = 'c:' + name + ':' + _cacheVers_(c, scopes);
    busyKey = key + ':busy';
    var hit = c.get(key);
    if (hit) return JSON.parse(hit);
    if (allowStale && c.get(busyKey)) {
      var st = c.get(staleKey);
      if (st) {
        var bar = st.indexOf('|');
        if (bar > 0 && (Date.now() - Number(st.substring(0, bar))) < 120000) {
          return JSON.parse(st.substring(bar + 1));
        }
      }
    }
    c.put(busyKey, '1', 25);
  } catch (e) { return computeFn(); }

  var val = computeFn();
  try {
    if (val && val.success !== false) {
      var s = JSON.stringify(val);
      if (Utilities.newBlob(s).getBytes().length < 95000) {
        c.put(key, s, ttlSec);
        if (allowStale) c.put(staleKey, Date.now() + '|' + s, 300);
      }
    }
    c.remove(busyKey);
  } catch (e2) {}
  return val;
}

// ════════════════════════════════════════════════════════════
//  CACHE UNTUK HASIL BESAR — gzip + pecah beberapa key (rev 14)
// ════════════════════════════════════════════════════════════
// Latar: cachedRead_() di atas MELEWATI cache begitu hasilnya > ~95 KB
// (batas CacheService 100 KB per key). Itu tepat sasaran utk getConfig
// dkk, tapi justru membuat endpoint TERBERAT — getAllPendaftar, yang
// membaca SELURUH sheet PENDAFTAR — tidak pernah ter-cache sama sekali:
// tiap tab admin & tiap refresh = 1 pembacaan penuh spreadsheet, dan
// tiap pembacaan itu memegang 1 dari 30 slot "simultaneous executions
// per user" milik akun pemilik selama beberapa detik. Sepuluh admin yang
// membuka panel bersamaan sudah cukup membuat antreannya penuh; request
// yang mengantre terlalu lama dijawab Google dengan halaman 404
// "Sorry, unable to open the file at this time" dari
// script.googleusercontent.com/macros/echo (kaki kedua redirect /exec).
//
// Solusinya bukan menaikkan batas, tapi mengecilkan datanya lalu
// memecahnya: JSON di-gzip dulu (data pendaftaran teks berulang, rasio
// kompresinya besar), di-base64 (naik ~33%, masih jauh lebih kecil dari
// aslinya), lalu dipotong ~90 KB per key dengan satu key induk berisi
// jumlah potongan. Satu potongan hilang/kedaluwarsa → dianggap MISS
// seluruhnya (jangan pernah menyajikan hasil separuh).
//
// Invalidasi tetap lewat mekanisme yang sudah ada: scope ['p'] +
// bumpCacheForAction_() yang sudah dipasang di doGet/doPost, jadi setiap
// updateStatus/editPeserta/register langsung menyegarkan cache ini juga.
var CACHE_CHUNK_ = 90000;   // karakter base64 per key (batas aman < 100 KB)
var CACHE_MAX_CHUNK_ = 12;  // > ini, hasilnya dianggap terlalu besar utk di-cache

function _gzB64_(str) {
  return Utilities.base64Encode(
    Utilities.gzip(Utilities.newBlob(str, 'application/octet-stream', 'd.txt')).getBytes());
}

function _ungzB64_(b64) {
  return Utilities.ungzip(
    Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'd.gz')).getDataAsString();
}

function _cachePutBig_(c, key, str, ttlSec) {
  var b64 = _gzB64_(str);
  var n   = Math.ceil(b64.length / CACHE_CHUNK_);
  if (n > CACHE_MAX_CHUNK_) { try { c.remove(key); } catch (e) {} return false; }
  var payload = {};
  for (var i = 0; i < n; i++) {
    payload[key + ':' + i] = b64.substring(i * CACHE_CHUNK_, (i + 1) * CACHE_CHUNK_);
  }
  payload[key] = String(n);
  c.putAll(payload, ttlSec);
  return true;
}

function _cacheGetBig_(c, key) {
  var n = parseInt(c.get(key), 10);
  if (!n || n < 1) return null;
  var keys = [], i;
  for (i = 0; i < n; i++) keys.push(key + ':' + i);
  var got = c.getAll(keys), parts = [];
  for (i = 0; i < n; i++) {
    var p = got[keys[i]];
    if (p === undefined || p === null) return null;   // 1 potongan hilang → MISS total
    parts.push(p);
  }
  try { return _ungzB64_(parts.join('')); } catch (e) { return null; }
}

/**
 * Versi cachedRead_ untuk hasil yang BESAR (lihat catatan di atas).
 * Tanda tangan & perilaku anti-stampede-nya sengaja dibuat sama persis
 * dengan cachedRead_ supaya bisa ditukar tanpa mengubah pemanggil.
 */
function cachedReadBig_(name, ttlSec, scopes, computeFn) {
  var c = _cache_();
  if (!c) return computeFn();
  var key, busyKey, staleKey = 'z:stale:' + name;
  try {
    key     = 'z:' + name + ':' + _cacheVers_(c, scopes);
    busyKey = key + ':busy';
    var hit = _cacheGetBig_(c, key);
    if (hit) return JSON.parse(hit);
    // Anti-stampede: saat satu eksekusi sedang membaca sheet, eksekusi lain
    // yang datang bersamaan memakai salinan terakhir (maks. 120 dtk) daripada
    // ikut membaca sheet berbarengan dan sama-sama menahan slot eksekusi.
    if (c.get(busyKey)) {
      var st = _cacheGetBig_(c, staleKey);
      if (st) {
        try {
          var o = JSON.parse(st);
          if (o && o._t && (Date.now() - o._t) < 120000) return o;
        } catch (eS) {}
      }
    }
    c.put(busyKey, '1', 40);
  } catch (e) { return computeFn(); }

  var val = computeFn();
  try {
    if (val && val.success !== false) {
      val._t  = Date.now();
      var str = JSON.stringify(val);
      if (_cachePutBig_(c, key, str, ttlSec)) _cachePutBig_(c, staleKey, str, 300);
    }
    c.remove(busyKey);
  } catch (e2) {}
  return val;
}

// Buang buffer log tanpa membuka spreadsheet kalau sheet LOG dimatikan.
// Dulu doGet/doPost SELALU memanggil getSS_() di ekornya hanya untuk
// _flushLog() — padahal dgn SHEET_LOG_ENABLED=false buffernya toh dibuang.
// Sekarang request yang dijawab dari cache tidak menyentuh Spreadsheet
// sama sekali.
function _flushLogIfEnabled_() {
  if (typeof SHEET_LOG_ENABLED !== 'undefined' && !SHEET_LOG_ENABLED) { _logBuffer = []; return; }
  if (!_logBuffer.length) return;
  var ss = null;
  try { ss = getSS_(); } catch (e) {}
  _flushLog(ss);
}

// ════════════════════════════════════════════════════════════
//  AUTH — token berbasis hash + timestamp sesi (1 jam)
// ════════════════════════════════════════════════════════════
var TOKEN_TTL_MS = 3600 * 1000 * 8;   // token valid 8 jam

function genToken_() {
  // Slot waktu 8 jam agar token tidak berubah di tengah sesi
  var slot = Math.floor(Date.now() / TOKEN_TTL_MS);
  var raw  = 'MTQ2026_' + ADMIN_PASSWORD + '_slot' + slot;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
                                      raw, Utilities.Charset.UTF_8);
  return bytes.map(function(b){
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function isTokenValid_(token) {
  if (!token) return false;
  // Cek slot sekarang DAN slot sebelumnya (agar token di ujung slot tidak langsung expire)
  var slot  = Math.floor(Date.now() / TOKEN_TTL_MS);
  var raw1  = 'MTQ2026_' + ADMIN_PASSWORD + '_slot' + slot;
  var raw2  = 'MTQ2026_' + ADMIN_PASSWORD + '_slot' + (slot - 1);
  function toHex(raw) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
                                   raw, Utilities.Charset.UTF_8)
      .map(function(b){ return ('0'+(b&0xFF).toString(16)).slice(-2); }).join('');
  }
  return String(token) === toHex(raw1) || String(token) === toHex(raw2);
}

// ════════════════════════════════════════════════════════════
//  REGISTRATION STATUS
// ════════════════════════════════════════════════════════════
function isRegistrationOpen_() {
  if (PENDAFTARAN_CONFIG.OVERRIDE === true)  return { open:true,  status:'buka' };
  if (PENDAFTARAN_CONFIG.OVERRIDE === false) return { open:false, status:'tutup' };
  var now   = new Date();
  var buka  = new Date(PENDAFTARAN_CONFIG.BUKA);
  var tutup = new Date(PENDAFTARAN_CONFIG.TUTUP);
  if (now < buka)  return { open:false, status:'belum_buka' };
  if (now < tutup) return { open:true,  status:'buka' };
  return { open:false, status:'tutup' };
}

// ════════════════════════════════════════════════════════════
//  AGE & GENDER VALIDATION
// ════════════════════════════════════════════════════════════
function calcAgeAtCutoff_(dobString) {
  if (!dobString) return { tahun:0, bulan:0, hari:0, display:'—' };
  var dob = new Date(dobString + 'T00:00:00');
  var ref = new Date(PENDAFTARAN_CONFIG.AGE_CUTOFF_DATE + 'T00:00:00');
  var tahun = ref.getFullYear() - dob.getFullYear();
  var bulan = ref.getMonth()    - dob.getMonth();
  var hari  = ref.getDate()     - dob.getDate();
  if (hari < 0) { bulan--; hari += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate(); }
  if (bulan < 0) { tahun--; bulan += 12; }
  return { tahun:tahun, bulan:bulan, hari:hari,
           display: tahun+' thn '+bulan+' bln '+hari+' hr' };
}

// FIX #10: umur_min=0 → skip lower bound
function validateAge_(age, umurMin, maxTahun, maxBulan, maxHari) {
  if (umurMin > 0 && age.tahun < umurMin)
    return { ok:false, msg:'Usia '+age.display+' kurang dari minimum '+umurMin+' tahun' };
  if (maxTahun < 99) {
    if (age.tahun > maxTahun) return _tooOld(age, maxTahun, maxBulan, maxHari);
    if (age.tahun === maxTahun) {
      if (age.bulan > maxBulan) return _tooOld(age, maxTahun, maxBulan, maxHari);
      if (age.bulan === maxBulan && age.hari > maxHari) return _tooOld(age, maxTahun, maxBulan, maxHari);
    }
  }
  return { ok:true, msg:'Usia valid: '+age.display };
}
function _tooOld(age, thn, bln, hr) {
  return { ok:false, msg:'Usia '+age.display+' melebihi batas maks. '+thn+' thn'+
           (bln?' '+bln+' bln':'')+((hr&&bln===0)||hr?' '+hr+' hr':'') };
}

function validateGender_(jenisKelamin, genderCabang) {
  if (!genderCabang || genderCabang === 'Semua') return { ok:true };
  var required = genderCabang === 'L' ? 'Laki-laki' : 'Perempuan';
  if (jenisKelamin !== required)
    return { ok:false, msg:'Cabang ini hanya untuk '+required+'. Peserta ('+jenisKelamin+') tidak sesuai.' };
  return { ok:true };
}

// ════════════════════════════════════════════════════════════
//  NORMALISASI TEKS — uppercase + rapikan spasi/baris baru
// ════════════════════════════════════════════════════════════
// Dipakai untuk field TEKS BEBAS yang diisi peserta saat mendaftar
// (nama_lengkap, tempat_lahir, alamat, nama_tim, nama_bank,
// nama_rekening) sebelum ditulis ke sheet PENDAFTAR / ANGGOTA_JSON.
// Dipanggil dari apiRegister_ dan apiPerbaikan_ di api.gs.
//
// - replace(/\s+/g,' ') mencakup newline (\n, \r) dari textarea
//   Alamat, jadi hasilnya OTOMATIS jadi SATU BARIS meski peserta
//   menekan Enter saat mengisi — sekaligus merapikan spasi ganda.
// - JANGAN pakai fungsi ini untuk field yang dicocokkan persis
//   (exact-match) di tempat lain: NIK, tanggal_lahir, jenis_kelamin,
//   kecamatan, cabang_lomba, email, atau URL/link Drive — mengubah
//   huruf besar/kecil atau spasinya di situ bisa merusak validasi
//   atau membuat link rusak.
function normalizeUpperText_(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, ' ').trim().toUpperCase();
}

// ════════════════════════════════════════════════════════════
//  NIK DUPLICATE CHECK
// ════════════════════════════════════════════════════════════
// FIX: parameter ke-3 (excludeNomor, opsional) ditambahkan supaya fungsi
// ini juga bisa dipakai saat NIK yang SUDAH TERDAFTAR sedang diubah —
// perbaikan data peserta yang Ditolak (apiPerbaikan_), ganti 1 anggota
// tim dengan peserta baru (juga lewat apiPerbaikan_), atau edit NIK dari
// modal admin (apiEditPesertaGet_ / apiEditAnggotaGet_). Baris milik
// nomor_pendaftaran itu sendiri TIDAK dihitung sebagai "sudah ada", jadi
// NIK yang TIDAK diubah tidak keliru ditolak sebagai duplikat dari
// dirinya sendiri. Dipanggil TANPA argumen ke-3 (mis. dari apiRegister_
// saat pendaftaran baru) perilakunya sama persis seperti sebelumnya.
//
// Sekalian menolak kalau ada NIK yang sama dipakai LEBIH dari sekali DI
// DALAM nikList itu sendiri (mis. 2 anggota tim tidak sengaja diisi NIK
// yang sama) — sebelumnya tidak pernah dicek sama sekali.
function checkNIKDuplicate_(sheet, nikList, excludeNomor) {
  if (!nikList || !nikList.length) return { isDuplicate:false };

  var seenInList = {};
  for (var li = 0; li < nikList.length; li++) {
    var listNik = String(nikList[li]||'').trim();
    if (!listNik) continue;
    if (seenInList[listNik]) return { isDuplicate:true, nik:listNik,
      msg:'NIK '+listNik+' dipakai lebih dari satu anggota pada form ini.' };
    seenInList[listNik] = true;
  }

  if (sheet.getLastRow() <= 1) return { isDuplicate:false };
  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  var excl = excludeNomor ? String(excludeNomor).trim() : '';
  // rev 12: dulu SETIAP baris di-JSON.parse (ratusan baris, di dalam
  // LockService yang dipakai bersama semua pendaftar/maqra). Sekarang
  // ANGGOTA_JSON hanya di-parse kalau teks mentahnya MEMANG memuat NIK
  // yang dicari — hasilnya identik, kerjanya jauh lebih sedikit, jadi lock
  // dilepas lebih cepat.
  var wanted = [];
  for (var wi=0; wi<nikList.length; wi++) {
    var wn = String(nikList[wi]).trim();
    if (wn) wanted.push(wn);
  }
  var found = {};
  for (var r=0; r<rows.length; r++) {
    var row = rows[r];
    if (excl && String(row[COL.NOMOR_PENDAFTARAN]||'').trim() === excl) continue;
    var s = String(row[COL.STATUS_VERIFIKASI]||'').toLowerCase();
    if (s === 'nonaktif') continue;
    var rowNik = String(row[COL.NIK]||'').trim();
    var aj = row[COL.ANGGOTA_JSON];
    var ajStr = aj ? String(aj) : '';
    for (var k=0; k<wanted.length; k++) {
      var nik = wanted[k];
      if (found[nik]) continue;
      var hit = (rowNik === nik);
      if (!hit && ajStr && ajStr.indexOf(nik) !== -1) {
        try {
          var arr = JSON.parse(aj);
          for (var a=0; a<arr.length; a++) {
            if (arr[a].nik && String(arr[a].nik).trim() === nik) { hit = true; break; }
          }
        } catch(e) {}
      }
      if (hit) found[nik] = true;
    }
    if (wanted.length && found[wanted[0]]) break;   // NIK pertama di daftar sudah ketemu — tak ada yang lebih awal lagi
  }
  // Laporkan NIK duplikat PERTAMA menurut URUTAN DAFTAR (sama seperti kode lama).
  for (var w=0; w<wanted.length; w++) {
    if (found[wanted[w]]) return { isDuplicate:true, nik:wanted[w],
      msg:'NIK '+wanted[w]+' sudah terdaftar. Satu NIK hanya boleh mendaftar satu kali.' };
  }
  return { isDuplicate:false };
}

// ════════════════════════════════════════════════════════════
//  SHEET HELPERS
// ════════════════════════════════════════════════════════════
function getOrCreateSheet_(ss, name, headers, defaultData) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    logInfo('helper','Buat sheet: '+name);
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.appendRow(headers);
      sheet.getRange(1,1,1,headers.length)
           .setBackground('#065f46').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    if (defaultData && defaultData.length) {
      sheet.getRange(2,1,defaultData.length,defaultData[0].length).setValues(defaultData);
    }
    sheet.autoResizeColumns(1, headers ? headers.length : 1);
  }
  return sheet;
}

function initAllSheets() {
  logInfo('helper','initAllSheets START');
  var ss = getSS_();   // FIX #16: pakai cache, bukan openById() baru
  getOrCreateSheet_(ss, SHEET_CONFIG,    CONFIG_HEADERS,    DEFAULT_CONFIG_DATA);
  getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  getOrCreateSheet_(ss, SHEET_LOG,       ['timestamp','level','context','message','data']);

  var pendSheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (pendSheet) {
    try {
      pendSheet.getRange(2,COL.STATUS_VERIFIKASI+1,1000,1).setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(['Menunggu','Terverifikasi','Ditolak','Nonaktif'],true).build());
      pendSheet.setFrozenColumns(2);
    } catch(e) { logWarn('helper','initAllSheets setDataValidation error: '+e.message); }
  }
  _flushLog(ss);
  return 'initAllSheets selesai. Sheet: '+ss.getSheets().map(function(s){return s.getName();}).join(', ');
}

function rowToObj_(row) {
  var obj = {};
  PENDAFTAR_HEADERS.forEach(function(h,i){ obj[h] = row[i]!==undefined ? row[i] : ''; });
  // FIX: Sheets otomatis mengubah teks "YYYY-MM-DD" pada kolom tanggal_lahir
  // menjadi sel bertipe Date. getValues() lalu mengembalikan objek Date
  // (dibentuk pada timezone spreadsheet), dan begitu objek ini di-
  // JSON.stringify (lihat apiGetAll_), JS otomatis memanggil .toISOString()
  // (selalu UTC) — ini MENGGESER tanggal mundur satu hari untuk timezone di
  // depan UTC, mis. Asia/Jakarta (UTC+7): "2002-02-01" → "2002-01-31T17:00:00.000Z".
  // Normalisasi balik ke string "yyyy-MM-dd" polos di sini, sebelum dikirim
  // sebagai JSON, memakai timezone yang sama dgn yang dipakai Sheets saat
  // membaca sel tsb — supaya tanggal kalendernya tetap presis seperti input.
  // Jika selnya sudah berupa teks biasa (bukan Date), dibiarkan apa adanya.
  if (obj.tanggal_lahir instanceof Date) {
    obj.tanggal_lahir = Utilities.formatDate(obj.tanggal_lahir, _sheetTimeZone_(), 'yyyy-MM-dd');
  }
  if (obj.anggota_json) { try { obj.anggota = JSON.parse(obj.anggota_json); } catch(e){ obj.anggota=[]; } }
  return obj;
}

// Timezone spreadsheet, di-cache per eksekusi supaya rowToObj_() tidak
// membuka spreadsheet berulang kali saat memetakan banyak baris (.map()).
var _cachedSheetTz_ = null;
function _sheetTimeZone_() {
  if (!_cachedSheetTz_) {
    try { _cachedSheetTz_ = getSS_().getSpreadsheetTimeZone(); }   // FIX #16: pakai cache
    catch (e) { _cachedSheetTz_ = Session.getScriptTimeZone() || 'Asia/Jakarta'; }
  }
  return _cachedSheetTz_;
}

function countByCabang_(sheet, cabang) {
  if (sheet.getLastRow()<=1) return 0;
  var data = sheet.getRange(2,COL.CABANG_LOMBA+1,sheet.getLastRow()-1,1).getValues();
  return data.filter(function(r){ return String(r[0]).trim()===String(cabang).trim(); }).length;
}

function writeLog_(ss, action, detail, status) {
  _log(status==='ok'?'INFO':'WARN', 'AUDIT', action, {detail:detail,status:status});
  _flushLog(ss);
}