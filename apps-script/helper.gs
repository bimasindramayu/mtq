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
  var existing = [];
  rows.forEach(function(row) {
    if (excl && String(row[COL.NOMOR_PENDAFTARAN]||'').trim() === excl) return;
    var s = String(row[COL.STATUS_VERIFIKASI]||'').toLowerCase();
    if (s === 'nonaktif') return;
    existing.push(String(row[COL.NIK]||'').trim());
    var aj = row[COL.ANGGOTA_JSON];
    if (aj) { try { JSON.parse(aj).forEach(function(a){if(a.nik)existing.push(String(a.nik).trim());}); } catch(e){} }
  });
  for (var i=0; i<nikList.length; i++) {
    var nik = String(nikList[i]).trim();
    if (!nik) continue;
    if (existing.indexOf(nik) !== -1) return { isDuplicate:true, nik:nik,
      msg:'NIK '+nik+' sudah terdaftar. Satu NIK hanya boleh mendaftar satu kali.' };
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