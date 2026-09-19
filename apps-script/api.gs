// ============================================================
//  MTQ 2026 — apps-script/api.gs  (rev 8)
//  Fix #3: NIK dup check, #6: bank fields, #7: sertifikat upload
//  rev 7 — FIX #16: semua pemanggilan langsung ke Spreadsheet
//  berdasarkan ID di file ini diganti getSS_() (baru, lihat helper.gs)
//  — cache handle spreadsheet PER EKSEKUSI, supaya satu request tidak membuka
//  spreadsheet yang sama berkali-kali (dulu: sekali per action + sekali
//  lagi di ekor doGet() untuk _flushLog()). Tidak mengubah perilaku,
//  cuma memangkas overhead — ini salah satu penyebab respons action
//  berat (mis. getAllPendaftar) kadang lebih lambat dari timeout JSONP
//  20 detik di client. Lihat catatan lengkap di helper.gs.
//  rev 8 — NIK sekarang BOLEH diubah lewat 3 jalur (dulu terkunci total
//  di apiPerbaikan_, dan tidak dicek sama sekali di 2 endpoint admin):
//   • apiPerbaikan_      → perbaikan data peserta Ditolak, termasuk
//                          mengganti 1 anggota tim dengan peserta baru
//   • apiEditPesertaGet_ → edit NIK individu/ketua dari modal admin
//   • apiEditAnggotaGet_ → edit NIK anggota tim dari modal admin
//  Ketiganya sekarang wajib lolos checkNIKDuplicate_ (helper.gs, rev 10)
//  sebelum tersimpan — lihat komentar di masing-masing fungsi.
// ============================================================

var CABANG_PREFIX = [
  { key:"Tartil Al Qur'an",             prefix:'TA' },

  { key:'Tilawah Anak-anak',            prefix:'TLA' },
  { key:'Tilawah Remaja',               prefix:'TLR' },
  { key:'Tilawah Dewasa',               prefix:'TLD' },

  { key:"Qira'at Mujawwad",             prefix:'QM' },

  { key:'Hafalan 1 Juz dan Tilawah',    prefix:'H1J' },
  { key:'Hafalan 5 Juz dan Tilawah',    prefix:'H5J' },
  { key:'Hafalan 10 Juz',               prefix:'H10J' },

  { key:'Tafsir Bahasa Indonesia',      prefix:'TFI' },

  { key:'Kaligrafi Naskah',             prefix:'KN' },
  { key:'Kaligrafi Hiasan Mushaf',      prefix:'KHM' },
  { key:'Kaligrafi Dekorasi',           prefix:'KD' },

  { key:"Fahm Al Qur'an",               prefix:'FAQ' },
  { key:"Syarh Al Qur'an",              prefix:'SAQ' },
];

function getCabangPrefix_(cabangLomba) {
  var name = String(cabangLomba).trim();
  for (var i=0; i<CABANG_PREFIX.length; i++) {
    if (name.indexOf(CABANG_PREFIX[i].key) === 0) return CABANG_PREFIX[i].prefix;
  }
  return 'MTQ';
}

// ── PATCH: All admin actions moved to doGet (JSONP bypass) ────
// Replace the doGet switch in api.gs with this version

function doGet(e) {
  var params   = (e && e.parameter) ? e.parameter : {};
  var action   = params.action   || '';
  var callback = params.callback || '';

  // FIX #11: ping harus INSTAN — dipakai frontend (testConnection() di
  // doyourmagic.html) sebagai "Uji Koneksi Server" SEBELUM login, justru
  // untuk mendeteksi masalah deployment/jaringan lebih awal. Sebelumnya
  // ping tetap ikut lewat logInfo() di bawah + SpreadsheetApp.openById()
  // + _flushLog() di ujung fungsi ini (lihat akhir doGet) — artinya tiap
  // ping ikut kena overhead BUKA SPREADSHEET padahal tidak butuh sama
  // sekali. Di koneksi lambat (data seluler di HP) ditambah GAS "cold
  // start" (eksekusi pertama setelah idle bisa makan beberapa detik utk
  // otorisasi + buka Spreadsheet), total waktu ini gampang melebihi
  // timeout 12 detik punya jsonp() di sisi client → muncul sebagai
  // "Koneksi gagal — GAS tidak merespons dengan JSONP", padahal
  // GAS-nya sendiri baik-baik saja, cuma kelamaan. Return duluan di sini,
  // SEBELUM logInfo/try-block/SpreadsheetApp di bawah, supaya ping selalu
  // balik dalam hitungan milidetik apa pun kondisi Sheet-nya.
  if (action === 'ping') {
    var pingResult = { success:true, pong:true, ts:new Date().toISOString() };
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(pingResult) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResp_(pingResult);
  }

  logInfo('api', 'doGet', { action: action, hasPostData: !!params.postData });
  var result;

  // ── Payload untuk endpoint Sistem Penilaian (Hakim/Peserta/Nilai) ──
  // Dikirim sebagai ?action=X&payload=<json> (lihat penilaian.html apiPost).
  // Ini terpisah dari tunnel ?postData= yang dipakai apiRegister_/maqra.
  var penilaianPayload = {};
  if (params.payload) {
    try { penilaianPayload = JSON.parse(params.payload); } catch (ePayload) { penilaianPayload = {}; }
  }
 
  try {
    // ── JSONP-POST tunnel ─────────────────────────────────
    // Frontend mengirim payload JSON sebagai ?postData=...
    // agar tidak ada CORS preflight (fetch/XHR).
    if (params.postData) {
      var body;
      try { body = JSON.parse(decodeURIComponent(params.postData)); }
      catch(e1) { body = JSON.parse(params.postData); }
      result = _dispatchPost(body);
 
    } else {
      // ── Normal GET dispatch ────────────────────────────
      switch (action) {
        // Public
        // 'ping' TIDAK ada di sini lagi — sudah di-return duluan di FIX #11
        // (lihat awal doGet), sebelum switch ini pernah tercapai.
        case 'getConfig'     : result = apiGetConfig_();                    break;
        case 'getStats'      : result = apiGetStats_();                     break;
        case 'getQuota'      : result = apiGetQuota_(params);               break;
        case 'checkDuplicate': result = apiCheckDuplicate_(params);         break;
        case 'checkNIK'      : result = apiCheckNIK_v2_(params);            break;
        // FIX: daftar publik peserta berstatus "Ditolak" — dipakai tombol
        // "📋 Lihat Peserta Ditolak" di cekstatus.html. TIDAK butuh token
        // admin, tapi field yang dikembalikan sengaja dibatasi (lihat
        // apiGetDitolak_) supaya data sensitif (NIK, no_hp, email, alamat)
        // tidak ikut terbuka ke publik.
        case 'getDitolak'    : result = apiGetDitolak_();                   break;
        case 'initSheets'    : result = { success:true, msg: initAllSheets() }; break;
        case 'debugConfig'   : result = apiDebugConfig_();                  break;

        // FIX: proxy gambar Drive → base64, supaya bisa dimuat ke <canvas>
        // (kartu peserta) tanpa CORS. drive.google.com/thumbnail dan
        // lh3.googleusercontent.com TIDAK mengirim header CORS, jadi
        // <img crossOrigin="anonymous"> ke sana selalu gagal dimuat dari
        // origin manapun selain punya Google sendiri — ini bukan bug di
        // frontend, itu keterbatasan Drive. Base64 lewat sini tidak
        // punya masalah origin sama sekali (data: URL). File tetap harus
        // "Anyone with link" seperti biasa (lihat uploadFile_ di
        // upload.gs) — endpoint ini tidak membuka akses baru, cuma
        // menyediakan jalur lain untuk mengambil isi file yang memang
        // sudah publik lewat link.
        case 'getDriveImage' : result = apiGetDriveImage_(params);          break;
        case 'getDriveImages': result = apiGetDriveImages_(params);         break;
        case 'getDriveFile'  : result = apiGetDriveFile_(params);           break;
 
        // Admin (token validated inside each function)
        case 'adminLogin'    : result = apiAdminLogin_(params);             break;
        case 'getAllPendaftar': result = apiGetAll_(params);                 break;
        case 'updateStatus'  : result = apiUpdateStatusGet_(params);        break;
        case 'editPeserta'   : result = apiEditPesertaGet_(params);         break;
        case 'editAnggota'   : result = apiEditAnggotaGet_(params);         break;  // FIX #34
        // FIX: tambah/hapus anggota tim dari modal admin (doyourmagic.html)
        case 'addAnggota'    : result = apiAddAnggotaGet_(params);          break;
        case 'removeAnggota' : result = apiRemoveAnggotaGet_(params);       break;
        case 'deactivate'    : result = apiDeactivateGet_(params);          break;
 
        // ── NEW: Maqra (public) ──────────────────────────
        case 'getMaqraStatus': result = apiGetMaqraStatus_(params);         break;
 
        // ── NEW: Maqra (admin, token validated inside) ───
        case 'getMaqraAdmin' : result = apiGetMaqraAdmin_(params);          break;

        // ── Sistem Penilaian (Dewan Hakim / Peserta / Nilai) ──
        // NOTE: fungsi-fungsi ini didefinisikan di penilaian.gs.
        // Action "write" (save*/delete*) membaca dari penilaianPayload
        // (?payload=<json>); action "read" (get*) membaca dari params langsung.
        //
        // Action yang dipanggil dari panel Admin (admin.html) — butuh token:
        case 'saveHakim'        : result = _runPenilaianAdmin_(params, function(){ return saveHakim(penilaianPayload); });                                   break;
        case 'getHakim'         : result = _runPenilaianAdmin_(params, function(){ return getHakim(); });                                                    break;
        case 'deleteHakim'      : result = _runPenilaianAdmin_(params, function(){ return deleteHakim(penilaianPayload.id); });                              break;
        case 'updateHakim'      : result = _runPenilaianAdmin_(params, function(){ return updateHakim(penilaianPayload.id, penilaianPayload); });             break;
        case 'saveParam'        : result = _runPenilaianAdmin_(params, function(){ return saveParam(penilaianPayload.cabang, penilaianPayload.params); });   break;
        case 'savePeserta'      : result = _runPenilaianAdmin_(params, function(){ return savePeserta(penilaianPayload.cabang, penilaianPayload.peserta); }); break;
        case 'deletePeserta'    : result = _runPenilaianAdmin_(params, function(){ return deletePeserta(penilaianPayload.id); });                            break;
        case 'importPesertaFromPendaftaran': result = _runPenilaianAdmin_(params, function(){ return importPesertaFromPendaftaran_(params.cabang, params.status_filter); }); break;
        case 'setHasilPublikStatus': result = _runPenilaianAdmin_(params, function(){ return apiSetHasilPublikStatus_(penilaianPayload.status); });          break;

        // Action publik — dipanggil dari halaman Login Hakim (penilaian.html)
        // atau halaman Hasil Penilaian publik (index.html), TANPA token:
        case 'verifyHakimPin'   : result = _runPenilaian_(function(){ return verifyHakimPin(params.pin); });                                    break;
        // getHakimPublic: segar-kan data hakim (cabang, nama) by ID tanpa PIN.
        // Dipanggil saat restore sesi di penilaian.html agar cabang selalu up-to-date.
        case 'getHakimPublic'   : result = _runPenilaian_(function(){ return getHakimPublic_(params.id); });                                    break;
        case 'getParam'         : result = _runPenilaian_(function(){ return getParam(params.cabang || null); });                               break;
        // adminView='true' → admin panel: tampilkan semua peserta (skip Terverifikasi filter)
        // adminView tidak ada / 'false' → scoring hakim: hanya Terverifikasi
        case 'getPeserta'       : result = _runPenilaian_(function(){ return getPeserta(params.cabang || null, params.adminView === 'true'); });  break;
        case 'saveNilai'        : result = _runPenilaian_(function(){ return saveNilai(penilaianPayload.key, penilaianPayload.data); });        break;
        case 'getNilai'         : result = _runPenilaian_(function(){ return getNilai(params.cabang || null, params.hakimId || null); });       break;
        case 'getPeringkat'     : result = _runPenilaian_(function(){ return getPeringkat(params.cabang); });                                   break;
        case 'getPenilaianStats': result = _runPenilaian_(function(){ return getPenilaianStats_(); });                                          break;
        case 'getHasilPublikStatus': result = _runPenilaian_(function(){ return apiGetHasilPublikStatus_(); });                                 break;
 
        default: result = { success:true, message:'MTQ 2026 API aktif', event:EVENT_INFO };
      }
    }
  } catch (err) {
    logError('api', 'doGet ERROR: ' + err.message + ' | ' + err.stack);
    result = { success:false, message: err.message };
  }
 
  var ss = null;
  try { ss = getSS_(); } catch(e2) {}
  _flushLog(ss);
 
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResp_(result);
}

// ── Wrapper khusus action Sistem Penilaian (publik, tanpa token) ──
// penilaian.html / index.html mengecek field `data.error` (bukan
// `data.message`) untuk pesan gagal, jadi error di-handle terpisah dari
// error handler utama di doGet agar kontrak responsnya tetap konsisten.
function _runPenilaian_(fn) {
  try {
    return fn();
  } catch (errP) {
    logError('api', 'Sistem Penilaian ERROR: ' + errP.message);
    return { success:false, error: errP.message };
  }
}

// ── Wrapper khusus action Sistem Penilaian milik ADMIN — wajib token valid ──
// Dipanggil dari panel "Sistem Penilaian" di admin.html (js/admin-penilaian.js).
function _runPenilaianAdmin_(params, fn) {
  if (!isTokenValid_(params.token)) {
    return { success:false, error:'Sesi admin tidak valid. Silakan login ulang.', message:'Sesi admin tidak valid. Silakan login ulang.' };
  }
  return _runPenilaian_(fn);
}

// ── Status buka/tutup "Hasil Penilaian Publik" (ditampilkan di index.html) ──
// Disimpan lewat getConfig/setConfig (sheet 'Config' milik penilaian.gs),
// terpisah dari status buka/tutup PENDAFTARAN (PENDAFTARAN_CONFIG di config.gs)
// dan terpisah dari status buka/tutup MAQRA — masing-masing punya toggle sendiri.
function apiGetHasilPublikStatus_() {
  var status = getConfig('HASIL_PUBLIK_STATUS') || 'tutup';
  return { success:true, status: status, isOpen: status === 'buka' };
}
function apiSetHasilPublikStatus_(status) {
  var v = (status === 'buka') ? 'buka' : 'tutup';
  setConfig('HASIL_PUBLIK_STATUS', v);
  return { success:true, status: v, isOpen: v === 'buka' };
}

// ── Import peserta scoring dari sheet Pendaftar utama ─────────
// Dipakai admin (via admin.html) untuk menarik peserta yang sudah
// mendaftar & diverifikasi ke dalam sheet PESERTA penilaian.
// Peserta dengan status 'Ditolak' atau 'Nonaktif' dilewati.
// Untuk cabang TIM, setiap anggota tim diimport sebagai baris tersendiri.
function importPesertaFromPendaftaran_(cabang, statusFilter) {
  if (!cabang) return { success: false, error: 'Cabang wajib diisi' };

  var ss             = getSS_();
  var pendaftarSheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!pendaftarSheet) return { success: false, error: 'Sheet pendaftar tidak ditemukan' };

  // getSheet adalah fungsi dari penilaian.gs — otomatis create jika belum ada
  var pesertaSheet = getSheet('Peserta');

  // Ambil existing IDs untuk cegah duplikat
  var existingRows = pesertaSheet.getDataRange().getValues();
  var existingIds  = {};
  existingRows.slice(1).forEach(function(r){ if(r[0]) existingIds[String(r[0])] = true; });

  // Hitung nomor urut awal per cabang (untuk urut setelah yang ada)
  var currentCount = existingRows.slice(1).filter(function(r){ return r[1] === cabang; }).length;

  var pendaftarRows = pendaftarSheet.getDataRange().getValues();
  var newRows = [];
  var skipStatuses = { 'Ditolak':true, 'Nonaktif':true };

  pendaftarRows.slice(1).forEach(function(r) {
    var rowCabang = String(r[COL.CABANG_LOMBA] || '').trim();
    var rowNomor  = String(r[COL.NOMOR_PENDAFTARAN] || '').trim();
    var rowNama   = String(r[COL.NAMA_LENGKAP] || '').trim();
    var rowKec    = String(r[COL.KECAMATAN] || '').trim();
    var rowStatus = String(r[COL.STATUS_VERIFIKASI] || '').trim();
    var rowTipe   = String(r[COL.TIPE_LOMBA] || '').trim();

    if (rowCabang !== cabang) return;
    if (!rowNomor || !rowNama) return;
    if (skipStatuses[rowStatus]) return;
    // Jika statusFilter diberikan, hanya import yang sesuai (mis. 'Diterima')
    if (statusFilter && rowStatus !== statusFilter) return;

    if (rowTipe === 'tim') {
      // Import anggota tim: parse dari ANGGOTA_JSON
      var anggotaJson = String(r[COL.ANGGOTA_JSON] || '[]');
      var anggota = [];
      try { anggota = JSON.parse(anggotaJson); } catch(e) { anggota = []; }
      if (!anggota.length) anggota.push({ nama_lengkap: rowNama, kecamatan: rowKec });

      anggota.forEach(function(a, ai) {
        var uid = rowNomor + '_m' + ai;
        if (existingIds[uid]) return;
        existingIds[uid] = true;
        currentCount++;
        newRows.push([uid, cabang, a.nama_lengkap || rowNama, a.kecamatan || rowKec, currentCount, new Date().toISOString()]);
      });
    } else {
      // Individu
      if (existingIds[rowNomor]) return;
      existingIds[rowNomor] = true;
      currentCount++;
      newRows.push([rowNomor, cabang, rowNama, rowKec, currentCount, new Date().toISOString()]);
    }
  });

  if (newRows.length > 0) {
    pesertaSheet.getRange(pesertaSheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
  }

  writeLog_(ss, 'IMPORT_PESERTA', 'Cabang: ' + cabang + ', imported: ' + newRows.length, 'ok');
  return { success: true, count: newRows.length, cabang: cabang };
}

// FIX: dispatchGet_(params, action) yang lama dihapus dari sini — tidak
// pernah dipanggil di mana pun (routing GET yang aktif ada di switch
// dalam doGet() di atas), jadi murni kode mati peninggalan refactor
// sebelumnya. Digantikan fungsi baru di bawah, yang memang dipakai.

// FIX: ambil isi file Drive di sisi server (tidak kena CORS sama sekali,
// karena UrlFetch/DriveApp jalan server-ke-server) lalu kembalikan
// sebagai data URL base64. Dipakai cek-maqra.js (downloadKartuPeserta)
// untuk memuat foto peserta ke <canvas> — drive.google.com/thumbnail
// dan lh3.googleusercontent.com tidak mengirim Access-Control-Allow-
// Origin, jadi <img crossOrigin="anonymous"> ke situ selalu diblokir
// browser dari origin manapun selain punya Google. Ukuran dibatasi
// (MAX_BYTES) sebagai jaga-jaga terhadap file yang bukan gambar/salah
// upload — respons JSONP yang sangat besar bisa lambat/gagal di HP.
// FIX #35: SEBELUMNYA fungsi ini SELALU mengambil file ASLI (sampai 8MB)
// lewat DriveApp.getFileById(id).getBlob() lalu base64-encode SELURUHNYA
// — untuk kartu peserta, foto cuma ditampilkan kecil (~20mm lingkaran),
// jadi mengirim file 1-3MB utuh jauh lebih besar dari yang dibutuhkan.
// Base64 encoding + transfer + decode file sebesar itu, semua harus
// selesai dalam 20 detik (timeout di sisi klien) — makin besar foto
// makin dekat/lewat batas itu. Ini penyebab laporan "kadang ada fotonya
// kadang tidak, coba lagi hasilnya beda": variasinya murni tergantung
// ukuran foto tiap peserta + kondisi jaringan/beban Apps Script saat itu
// — bukan bug logika, tapi payload yang kebesaran utk kebutuhannya.
// Sekarang ambil THUMBNAIL yang sudah digenerate & di-cache oleh Google
// Drive sendiri (biasanya puluhan KB, bukan MB) lewat endpoint publik
// drive.google.com/thumbnail. File foto sudah "Anyone with link" (lihat
// uploadFile_ di upload.gs), jadi thumbnail-nya bisa diambil tanpa OAuth
// istimewa. PENTING: ini butuh UrlFetchApp, yang berarti proyek Apps
// Script akan minta otorisasi ulang sekali (izin "Connect to an external
// service") saat pertama kali dijalankan setelah update ini — normal,
// cukup di-approve sekali. Kalau karena suatu sebab thumbnail gagal
// diambil, jatuh ke file asli sebagai cadangan (perilaku lama), bukan
// langsung gagal total — supaya tidak ada kasus yang MALAH lebih buruk
// dari sebelumnya.
function apiGetDriveImage_(params) {
  var id = String(params.id || '').trim();
  if (!id) return { success:false, message:'ID file kosong' };

  var MAX_BYTES = 8 * 1024 * 1024; // 8MB — jauh di atas batas 2MB upload foto, cukup longgar

  // ── Percobaan 1: thumbnail kecil dari Drive (cepat) ────────────
  try {
    var thumbUrl  = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w500';
    var thumbResp = UrlFetchApp.fetch(thumbUrl, { muteHttpExceptions:true, followRedirects:true });
    if (thumbResp.getResponseCode() === 200) {
      var tBlob = thumbResp.getBlob();
      var tType = tBlob.getContentType() || '';
      if (tType.indexOf('image/') === 0 && tBlob.getBytes().length > 0) {
        var tBase64 = Utilities.base64Encode(tBlob.getBytes());
        return { success:true, dataUrl:'data:' + tType + ';base64,' + tBase64 };
      }
    }
    // Response bukan 200/bukan gambar/kosong — lanjut ke fallback di bawah.
  } catch (thumbErr) {
    logWarn('api', 'apiGetDriveImage_ thumbnail gagal utk id=' + id + ': ' + thumbErr.message + ' — jatuh ke file asli');
  }

  // ── Percobaan 2 (fallback): file asli, perilaku lama ───────────
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    if (blob.getBytes().length > MAX_BYTES) {
      return { success:false, message:'File terlalu besar untuk dimuat sebagai gambar kartu' };
    }
    var mimeType = blob.getContentType() || 'image/jpeg';
    if (mimeType.indexOf('image/') !== 0) {
      return { success:false, message:'File bukan gambar (' + mimeType + ')' };
    }
    var base64 = Utilities.base64Encode(blob.getBytes());
    return { success:true, dataUrl: 'data:' + mimeType + ';base64,' + base64 };
  } catch (err) {
    logWarn('api', 'apiGetDriveImage_ gagal untuk id=' + id + ': ' + err.message);
    return { success:false, message:'Gagal mengambil gambar: ' + err.message };
  }
}

// FIX (baru): unduhan "Download Semua Kartu Peserta" (doyourmagic.html)
// melaporkan "kadang foto ada kadang tidak" yang TETAP terjadi walau
// sudah pakai thumbnail kecil (fix di atas) — akar masalahnya JUMLAH
// round-trip: unduhan borongan sebelumnya memanggil getDriveImage
// SATU PER SATU berurutan, kadang ratusan kali utk peserta banyak,
// jadi walau peluang gagal per panggilan kecil, dikali ratusan
// panggilan selalu ada yang gagal. apiGetDriveImages_ (JAMAK, baru) ini
// mengambil BANYAK foto dalam 1 panggilan (dipanggil dari
// _prefetchDriveImagesBatch_ di doyourmagic.html, dikelompokkan 10
// id/panggilan) — jauh lebih sedikit round-trip = jauh lebih kecil
// peluang ada yang gagal. Sengaja dibuat action TERPISAH dari
// apiGetDriveImage_ (tunggal, di atas, TIDAK diubah sama sekali) supaya
// pemanggil yang sudah ada (cek-maqra.js, unduhan perorangan yang
// memang cuma butuh 1-beberapa foto) tidak ikut berubah perilakunya.
function apiGetDriveImages_(params) {
  var idsParam = String(params.ids || '').trim();
  if (!idsParam) return { success:false, message:'ids kosong' };

  // FIX: batasi 25 id/panggilan (client sudah mengelompokkan 10/panggilan,
  // ini jaring pengaman tambahan) — cegah 1 eksekusi jadi terlalu lama
  // kalau suatu saat dipanggil dgn daftar id yang kepanjangan.
  var ids = idsParam.split(',').map(function(s){ return s.trim(); }).filter(Boolean).slice(0, 25);

  var results = {};
  ids.forEach(function(id) {
    try {
      results[id] = apiGetDriveImage_({ id: id });
    } catch (err) {
      results[id] = { success:false, message: err.message };
    }
  });
  return { success:true, results: results };
}

// FIX #23: DocumentPreviewer (admin, doyourmagic.html) sebelumnya fetch()
// LANGSUNG dari browser ke googleapis.com/drive/v3/files/{id}?alt=media
// pakai DRIVE_API_KEY yang dikirim ke client. Ini SELALU gagal dengan
// "blocked by CORS policy" — Google Drive API tidak mengirim header
// Access-Control-Allow-Origin untuk endpoint alt=media (unduh konten
// biner), beda dari endpoint metadata (?fields=...) yang memang
// mendukung CORS. Ini keterbatasan Google sendiri, bukan salah
// konfigurasi API key/deployment — tidak bisa diperbaiki dari sisi
// browser sama sekali. Solusinya: proxy lewat backend ini (DriveApp API
// di Apps Script tidak kena CORS, karena jalan di server bukan
// browser) — pola yang SAMA seperti apiGetDriveImage_ di atas, tapi
// TIDAK dibatasi hanya gambar (previewer juga menampilkan PDF untuk
// dokumen seperti sertifikat/surat rekomendasi hasil scan). Sengaja
// dibuat action TERPISAH dari apiGetDriveImage_ (bukan melonggarkan
// fungsi itu) supaya pemanggil apiGetDriveImage_ yang sudah ada
// (cek-maqra.js, khusus gambar kecil) tidak ikut berubah perilakunya.
function apiGetDriveFile_(params) {
  var id = String(params.id || '').trim();
  if (!id) return { success:false, message:'ID file kosong' };

  var MAX_BYTES = 8 * 1024 * 1024; // 8MB — sama dengan apiGetDriveImage_
  try {
    var file = DriveApp.getFileById(id);
    var blob = file.getBlob();
    if (blob.getBytes().length > MAX_BYTES) {
      return { success:false, message:'File terlalu besar untuk dipratinjau (maks 8MB)' };
    }
    var mimeType = blob.getContentType() || 'application/octet-stream';
    var base64   = Utilities.base64Encode(blob.getBytes());
    return { success:true, mimeType:mimeType, base64:base64, name:file.getName() };
  } catch (err) {
    logWarn('api', 'apiGetDriveFile_ gagal untuk id=' + id + ': ' + err.message);
    return { success:false, message:'Gagal mengambil file: ' + err.message };
  }
}

function _dispatchPost(body) {
  var action = String(body.action || '');
  switch (action) {
    case 'register'       : return apiRegister_(body);
    // ── NEW: Maqra ──────────────────────────────────────────
    case 'ambilMaqra'     : return apiAmbilMaqra_(body);
    case 'ambilMaqraAdmin': return apiAmbilMaqraAdmin_(body);  // NEW — admin mengambilkan maqra utk peserta (lihat maqra.gs)
    case 'saveMaqra'      : return apiSaveMaqraAdmin_(body);
    case 'deleteMaqra'    : return apiDeleteMaqraAdmin_(body);
    case 'deleteMaqraBulk': return apiDeleteMaqraBulkAdmin_(body);
    case 'saveMaqraConfig': return apiSaveMaqraConfig_(body);
    case 'perbaikan'      : return apiPerbaikan_(body);
    default: return { success:false, message:'Unknown action: ' + action };
  }
}

// doPost kept for registration only (large base64 payload)
function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    logInfo('api', 'doPost action: ' + body.action);
    result = _dispatchPost(body);
  } catch (err) {
    logError('api', 'doPost ERROR: ' + err.message);
    result = { success:false, message: err.message };
  }
  var ss = null;
  try { ss = getSS_(); } catch(e2) {}
  _flushLog(ss);
  return jsonResp_(result);
}

// ── adminLogin via GET ─────────────────────────────────────────
// Password dikirim sebagai base64 untuk menghindari URL-encoding
// char spesial (@, !, #, dll). Decode di server sebelum compare.
function apiAdminLogin_(params) {
  logInfo('api','apiAdminLogin_ GET — param keys: '+Object.keys(params||{}).join(','));
  var incoming = '';
  try {
    var b64 = String(params.pw || '').trim();
    logInfo('api','pw param length: '+b64.length);
    if (!b64) {
      // fallback: plain password
      incoming = String(params.password || '').trim();
      logInfo('api','Fallback plain password, length: '+incoming.length);
    } else {
      // Decode base64
      var decoded = Utilities.base64Decode(b64, Utilities.Charset.UTF_8);
      incoming = Utilities.newBlob(decoded).getDataAsString();
      logInfo('api','b64 decoded, incoming.length: '+incoming.length);
    }
  } catch(e) {
    logError('api','Decode error: '+e.message);
    return {success:false, message:'Gagal mendekode password: '+e.message};
  }

  var expected = String(ADMIN_PASSWORD || '').trim();
  logInfo('api','incoming.length='+incoming.length+' expected.length='+expected.length);

  if (!incoming) return {success:false, message:'Password tidak boleh kosong'};
  if (incoming !== expected) {
    logWarn('api','Login GAGAL — tidak cocok');
    return {success:false, message:'Password salah. Silakan coba lagi.'};
  }
  var token = genToken_();
  logInfo('api','Login BERHASIL, token.length='+token.length);
  return {success:true, token:token};
}

// ── Admin GET handlers ─────────────────────────────────────────
function apiUpdateStatusGet_(p) {
  if (!isTokenValid_(p.token)) return {success:false, message:'Sesi tidak valid'};
  return updateRowField_(p.nomor, COL.STATUS_VERIFIKASI, p.status, p.catatan||'');
}

function apiEditPesertaGet_(p) {
  if (!isTokenValid_(p.token)) return {success:false, message:'Sesi tidak valid'};
  var fieldMap = {
    nama_lengkap:'NAMA_LENGKAP', nik:'NIK', tempat_lahir:'TEMPAT_LAHIR',
    tanggal_lahir:'TANGGAL_LAHIR', jenis_kelamin:'JENIS_KELAMIN',
    alamat:'ALAMAT', no_hp:'NO_HP', email:'EMAIL', kecamatan:'KECAMATAN',
    nama_bank:'NAMA_BANK', nomor_rekening:'NOMOR_REKENING',
    nama_rekening:'NAMA_REKENING', catatan:'CATATAN',
  };
  var field = String(p.field||'');
  if (!fieldMap[field]) return {success:false, message:'Field tidak diizinkan: '+field};
  var value = p.value||'';

  // FIX #26 (Bug 2): SEBELUMNYA edit tanggal_lahir dari modal Detail
  // Peserta (doyourmagic.html) langsung ditulis ke sheet tanpa dicek
  // ulang terhadap syarat umur cabang — beda dengan apiRegister_/
  // apiPerbaikan_ yang SELALU memvalidasi lewat calcAgeAtCutoff_/
  // validateAge_ (helper.gs) + getCabangConfig_ (di bawah). FE bisa saja
  // dilewati/dimanipulasi, jadi penjagaan yang sebenarnya harus di sini.
  // extra menampung field tambahan (umur_display baru) utk response,
  // supaya FE bisa sinkron tanpa reload modal.
  var extra = null;
  // FIX: NIK bisa diedit dari modal Detail Peserta sejak awal (sudah ada
  // di fieldMap di atas), tapi TIDAK PERNAH dicek anti-duplikat — 2
  // pendaftaran bisa berakhir dengan NIK yang identik. Sama seperti
  // penjagaan tanggal_lahir di bawah: FE (saveEdit() di doyourmagic.html)
  // sudah kasih feedback instan, tapi itu bisa dilewati/dimanipulasi —
  // penjagaan yang MENGIKAT harus di sini.
  if (field === 'nik') {
    var valNik = String(value).trim();
    if (!/^\d{16}$/.test(valNik)) {
      return {success:false, message:'NIK harus berupa 16 digit angka'};
    }
    var ss    = getSS_();
    var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
    if (!sheet) return {success:false, message:'Sheet PENDAFTAR tidak ditemukan'};

    // FIX CRITICAL: race condition — cek + tulis NIK sekarang dibungkus
    // LockService (SCRIPT LOCK yang sama dipakai apiRegister_ &
    // apiPerbaikan_, saling menunggu satu sama lain) supaya 2 permintaan
    // yang menyasar NIK yang sama tidak bisa lolos cek duplikat
    // bersamaan. Ditulis LANGSUNG di sini (bukan lewat updateRowField_ di
    // ekor fungsi) supaya klaim & pelepasan lock berdekatan, tanpa jeda
    // kode lain (mis. validasi tanggal_lahir) di antaranya.
    var lockNikEdit = LockService.getScriptLock();
    try {
      lockNikEdit.waitLock(30000);
    } catch (lockErr) {
      return {success:false, message:'Sistem sedang memproses permintaan lain. Mohon coba lagi dalam beberapa saat.'};
    }
    try {
      var nikDup = checkNIKDuplicate_(sheet, [valNik], p.nomor);
      if (nikDup.isDuplicate) return {success:false, message: nikDup.msg};
      return updateRowField_(p.nomor, COL.NIK, valNik, null);
    } finally {
      lockNikEdit.releaseLock();
    }
  }
  if (field === 'tanggal_lahir') {
    var ss    = getSS_();
    var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
    if (!sheet) return {success:false, message:'Sheet PENDAFTAR tidak ditemukan'};
    var found = findPendaftarRow_(sheet, p.nomor);
    if (!found) return {success:false, message:'Nomor pendaftaran tidak ditemukan: '+p.nomor};

    var cabangCfg = getCabangConfig_(found.row[COL.CABANG_LOMBA]);
    if (!cabangCfg) {
      return {success:false, message:'Konfigurasi cabang "'+found.row[COL.CABANG_LOMBA]+'" tidak ditemukan — edit dibatalkan demi keamanan data.'};
    }
    // FIX #26 (Bug 2): field ini datang dari input type="text" biasa di
    // doyourmagic.html (bukan date-picker), jadi FE bisa dilewati/salah
    // ketik bebas. calcAgeAtCutoff_() pakai `new Date(str+'T00:00:00')` —
    // untuk string bukan-ISO ini Invalid Date, lalu SEMUA perbandingan umur
    // di validateAge_ jadi NaN vs angka, yang SELALU false → tanggal ngawur
    // akan diam-diam LOLOS validasi, bukan tertolak. Cek format eksplisit
    // dulu, sebelum tanggal ini dipercaya sama sekali.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return {success:false, message:'Format tanggal lahir tidak valid, harus YYYY-MM-DD'};
    }
    var age  = calcAgeAtCutoff_(value);
    var aChk = validateAge_(age, cabangCfg.umur_min, cabangCfg.umur_max_tahun, cabangCfg.umur_max_bulan, cabangCfg.umur_max_hari);
    if (!aChk.ok) return {success:false, message:aChk.msg};

    // Tanggal lahir baru VALID untuk cabang ini — sekalian sinkronkan
    // UMUR_DISPLAY supaya tidak basi (sebelumnya kolom ini tertinggal
    // dengan umur lama sampai peserta diedit ulang secara manual).
    sheet.getRange(found.rowIndex, COL.UMUR_DISPLAY+1).setValue(age.display);
    extra = { umur_display: age.display };
  }

  var res = updateRowField_(p.nomor, COL[fieldMap[field]], value, null);
  if (res.success && extra) { for (var k in extra) res[k] = extra[k]; }
  return res;
}

// FIX #34 (poin 4): edit 1 field milik SATU ANGGOTA TIM — sebelumnya
// admin sama sekali tidak bisa mengedit data anggota tim dari modal
// Detail Peserta, karena datanya tersimpan sebagai JSON di kolom
// ANGGOTA_JSON, BUKAN kolom pendaftar biasa seperti peserta individu —
// apiEditPesertaGet_ (fieldMap-nya) tidak bisa dipakai untuk ini sama
// sekali. anggotaIdx===0 (ketua tim) datanya JUGA diduplikasi ke kolom
// pendaftar utama saat registrasi (lihat apiRegister_) — supaya tetap
// sinkron dan tabel/CSV/kartu yang baca kolom utama tidak basi, edit di
// sini menulis KEDUANYA khusus untuk ketua.
function apiEditAnggotaGet_(p) {
  if (!isTokenValid_(p.token)) return { success:false, message:'Sesi tidak valid' };

  var fieldMap = {
    nama_lengkap:true, nik:true, tempat_lahir:true, tanggal_lahir:true,
    jenis_kelamin:true, alamat:true, no_hp:true,
  };
  var field = String(p.field || '');
  if (!fieldMap[field]) return { success:false, message:'Field tidak diizinkan: ' + field };

  var idx = parseInt(p.idx, 10);
  if (isNaN(idx) || idx < 0) return { success:false, message:'Index anggota tidak valid' };
  var value = p.value || '';

  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sheet) return { success:false, message:'Sheet PENDAFTAR tidak ditemukan' };
  var found = findPendaftarRow_(sheet, p.nomor);
  if (!found) return { success:false, message:'Nomor pendaftaran tidak ditemukan: ' + p.nomor };

  var anggota;
  try { anggota = JSON.parse(found.row[COL.ANGGOTA_JSON] || '[]'); }
  catch (e) { return { success:false, message:'Data anggota tim rusak/tidak terbaca — hubungi developer.' }; }
  if (!Array.isArray(anggota) || idx >= anggota.length) {
    return { success:false, message:'Anggota ke-' + (idx + 1) + ' tidak ditemukan' };
  }

  var extra = null;
  // FIX: sama seperti apiEditPesertaGet_ — NIK anggota tim sudah bisa
  // diedit dari modal (field ini ada di fieldMap di atas) tapi tidak
  // pernah dicek anti-duplikat. Dua lapis pengecekan diperlukan di sini:
  // (1) checkNIKDuplicate_ (helper.gs) terhadap pendaftaran LAIN —
  //     excludeNomor mengecualikan SELURUH baris nomor_pendaftaran ini
  //     (termasuk anggota-anggota lainnya di baris yang sama) supaya
  //     NIK yang tidak diubah tidak keliru ditolak sbg duplikat dari
  //     dirinya sendiri;
  // (2) justru KARENA (1) mengecualikan seluruh baris ini, tabrakan
  //     dengan SESAMA anggota tim yang sama (mis. NIK anggota 2 diketik
  //     sama dengan NIK anggota 1) tidak akan pernah tertangkap oleh (1)
  //     — jadi dicek terpisah di sini terhadap `anggota` (sudah diparse
  //     di atas), membandingkan ke semua index SELAIN idx yang sedang
  //     diedit.
  if (field === 'nik') {
    var valNik = String(value).trim();
    if (!/^\d{16}$/.test(valNik)) {
      return { success:false, message:'NIK harus berupa 16 digit angka' };
    }
    for (var si = 0; si < anggota.length; si++) {
      if (si === idx) continue;
      if (String(anggota[si].nik||'').trim() === valNik) {
        return { success:false, message:'NIK ini sudah dipakai Anggota ' + (si + 1) + ' pada tim yang sama.' };
      }
    }

    // FIX CRITICAL: race condition — cek + tulis NIK sekarang dibungkus
    // LockService (SCRIPT LOCK yang sama dgn apiRegister_/apiPerbaikan_/
    // apiEditPesertaGet_, semuanya saling menunggu). Ditulis LANGSUNG di
    // sini — bypass ekor fungsi (yang menulis field lain via
    // "anggota[idx][field]=value") — supaya klaim & pelepasan lock
    // berdekatan, dan meniru perilaku ekor fungsi persis (sinkron ke
    // kolom utama kalau idx===0, writeLog_, bentuk respons).
    var lockNikEdit = LockService.getScriptLock();
    try {
      lockNikEdit.waitLock(30000);
    } catch (lockErr) {
      return { success:false, message:'Sistem sedang memproses permintaan lain. Mohon coba lagi dalam beberapa saat.' };
    }
    try {
      var nikDup = checkNIKDuplicate_(sheet, [valNik], p.nomor);
      if (nikDup.isDuplicate) return { success:false, message:'Anggota ' + (idx + 1) + ': ' + nikDup.msg };

      anggota[idx].nik = valNik;
      sheet.getRange(found.rowIndex, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(anggota));
      if (idx === 0) sheet.getRange(found.rowIndex, COL.NIK + 1).setValue(valNik);

      writeLog_(ss, 'EDIT_ANGGOTA', 'nomor=' + p.nomor + ' idx=' + idx + ' field=nik', 'ok');
      return { success:true, nomor_pendaftaran:p.nomor };
    } finally {
      lockNikEdit.releaseLock();
    }
  }
  if (field === 'tanggal_lahir') {
    // FIX #34: penjagaan umur SAMA PERSIS dengan apiEditPesertaGet_
    // (FIX #26) — format YYYY-MM-DD wajib (cegah NaN lolos validasi),
    // lalu dicek terhadap syarat cabang lewat getCabangConfig_.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return { success:false, message:'Format tanggal lahir tidak valid, harus YYYY-MM-DD' };
    }
    var cabangCfg = getCabangConfig_(found.row[COL.CABANG_LOMBA]);
    if (!cabangCfg) {
      return { success:false, message:'Konfigurasi cabang "' + found.row[COL.CABANG_LOMBA] + '" tidak ditemukan — edit dibatalkan demi keamanan data.' };
    }
    var age  = calcAgeAtCutoff_(value);
    var aChk = validateAge_(age, cabangCfg.umur_min, cabangCfg.umur_max_tahun, cabangCfg.umur_max_bulan, cabangCfg.umur_max_hari);
    if (!aChk.ok) return { success:false, message:'Anggota ' + (idx + 1) + ': ' + aChk.msg };
    anggota[idx].umur_display = age.display;
    extra = { umur_display: age.display };
  }

  anggota[idx][field] = value;
  sheet.getRange(found.rowIndex, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(anggota));

  // FIX #34: idx 0 (ketua tim) — sinkronkan juga ke kolom pendaftar utama.
  if (idx === 0) {
    var mainColMap = {
      nama_lengkap:COL.NAMA_LENGKAP, nik:COL.NIK, tempat_lahir:COL.TEMPAT_LAHIR,
      tanggal_lahir:COL.TANGGAL_LAHIR, jenis_kelamin:COL.JENIS_KELAMIN,
      alamat:COL.ALAMAT, no_hp:COL.NO_HP,
    };
    sheet.getRange(found.rowIndex, mainColMap[field] + 1).setValue(value);
    if (extra && extra.umur_display) {
      sheet.getRange(found.rowIndex, COL.UMUR_DISPLAY + 1).setValue(extra.umur_display);
    }
  }

  writeLog_(ss, 'EDIT_ANGGOTA', 'nomor=' + p.nomor + ' idx=' + idx + ' field=' + field, 'ok');
  var res = { success:true, nomor_pendaftaran:p.nomor };
  if (extra) { for (var k in extra) res[k] = extra[k]; }
  return res;
}

// ── Cari 1 baris PENDAFTAR by nomor_pendaftaran ────────────────
// FIX #26: dipakai apiEditPesertaGet_ untuk mengambil cabang_lomba
// SEBELUM menyimpan field yang perlu divalidasi ulang (tanggal_lahir),
// dan untuk tahu rowIndex persis (utk menulis UMUR_DISPLAY di baris yang
// sama). rowIndex 1-based sesuai posisi asli di sheet (header = baris 1).
function findPendaftarRow_(sheet, nomor) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  var data   = sheet.getRange(2, 1, lastRow-1, PENDAFTAR_HEADERS.length).getValues();
  var target = String(nomor||'').trim();
  for (var i=0; i<data.length; i++) {
    if (String(data[i][COL.NOMOR_PENDAFTARAN]||'').trim() === target) {
      return { rowIndex: i+2, row: data[i] };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  TAMBAH / HAPUS ANGGOTA TIM (dari modal admin doyourmagic.html)
// ════════════════════════════════════════════════════════════
// FIX: dulu jumlah anggota tim TETAP sejak pendaftaran — tidak ada cara
// menambah anggota ke-3 atau menghapus anggota yang mengundurkan diri
// selain edit manual di Spreadsheet. Batas sama persis dengan
// apiRegister_/apiPerbaikan_: tim 2-3 anggota. Ketua (idx 0) tidak bisa
// dihapus dari sini — kalau ketua perlu diganti, ubah datanya lewat
// efMember() (nama/NIK/dst per field), bukan hapus lalu tambah ulang.

function apiAddAnggotaGet_(p) {
  if (!isTokenValid_(p.token)) return { success:false, message:'Sesi tidak valid' };

  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sheet) return { success:false, message:'Sheet PENDAFTAR tidak ditemukan' };
  var found = findPendaftarRow_(sheet, p.nomor);
  if (!found) return { success:false, message:'Nomor pendaftaran tidak ditemukan: ' + p.nomor };

  var cabangCfg = getCabangConfig_(found.row[COL.CABANG_LOMBA]);
  if (!cabangCfg || cabangCfg.tipe !== 'team') {
    return { success:false, message:'Hanya cabang tim yang bisa ditambah anggota' };
  }

  var anggota;
  try { anggota = JSON.parse(found.row[COL.ANGGOTA_JSON] || '[]'); }
  catch (e) { return { success:false, message:'Data anggota tim rusak/tidak terbaca — hubungi developer.' }; }
  if (!Array.isArray(anggota)) anggota = [];

  if (anggota.length >= 3) return { success:false, message:'Tim maksimal 3 anggota' };

  // jenis_kelamin ikut cabangCfg.gender — satu cabang lomba sudah tetap
  // gendernya (mis. "Fahm Al Qur'an Putra" → semua anggota WAJIB 'L'),
  // sama seperti default yang dipakai apiPerbaikan_ saat anggota baru
  // ditambahkan dari sisi peserta (lihat cek-maqra.js → gantiPeserta()/
  // tambahAnggotaTim()).
  anggota.push({
    nama_lengkap: '', nik: '', tempat_lahir: '', tanggal_lahir: '',
    jenis_kelamin: cabangCfg.gender || '', alamat: '', no_hp: '',
    link_foto: '', link_ktp: '', link_sertifikat: ''
  });

  sheet.getRange(found.rowIndex, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(anggota));
  writeLog_(ss, 'ADD_ANGGOTA', p.nomor + ' — anggota ke-' + anggota.length + ' ditambahkan oleh admin', 'ok');
  return { success:true, anggota: anggota, message:'Anggota ke-' + anggota.length + ' ditambahkan — lengkapi datanya lalu unggah foto & KTP.' };
}

function apiRemoveAnggotaGet_(p) {
  if (!isTokenValid_(p.token)) return { success:false, message:'Sesi tidak valid' };

  var idx = parseInt(p.idx, 10);
  if (isNaN(idx) || idx < 0) return { success:false, message:'Index anggota tidak valid' };
  if (idx === 0) return { success:false, message:'Ketua tim tidak bisa dihapus dari sini. Ubah datanya lewat field masing-masing kalau perlu mengganti ketua.' };

  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sheet) return { success:false, message:'Sheet PENDAFTAR tidak ditemukan' };
  var found = findPendaftarRow_(sheet, p.nomor);
  if (!found) return { success:false, message:'Nomor pendaftaran tidak ditemukan: ' + p.nomor };

  var anggota;
  try { anggota = JSON.parse(found.row[COL.ANGGOTA_JSON] || '[]'); }
  catch (e) { return { success:false, message:'Data anggota tim rusak/tidak terbaca — hubungi developer.' }; }
  if (!Array.isArray(anggota) || idx >= anggota.length) {
    return { success:false, message:'Anggota ke-' + (idx + 1) + ' tidak ditemukan' };
  }
  // FIX: syarat minimum 2 anggota berlaku TANPA syarat cabangCfg berhasil
  // ditemukan — kalau lookup cabang gagal karena sebab apa pun, lebih
  // aman menolak penghapusan daripada diam-diam mengizinkan tim turun ke
  // 1 anggota atau kosong sama sekali.
  if (anggota.length <= 2) {
    return { success:false, message:'Tim minimal 2 anggota — anggota ini tidak bisa dihapus lagi' };
  }

  anggota.splice(idx, 1);
  sheet.getRange(found.rowIndex, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(anggota));
  writeLog_(ss, 'REMOVE_ANGGOTA', p.nomor + ' — anggota ke-' + (idx + 1) + ' dihapus oleh admin', 'ok');
  return { success:true, anggota: anggota, message:'Anggota dihapus.' };
}

function apiDeactivateGet_(p) {
  if (!isTokenValid_(p.token)) return {success:false, message:'Sesi tidak valid'};
  return updateRowField_(p.nomor, COL.STATUS_VERIFIKASI, 'Nonaktif',
                         p.catatan||'Dinonaktifkan oleh admin');
}


function jsonResp_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── debugConfig ───────────────────────────────────────────────
function apiDebugConfig_() {
  try {
    var ss = getSS_();
    var sheet = ss.getSheetByName(SHEET_CONFIG);
    if (!sheet) return { success:false, message:'Sheet CONFIG tidak ditemukan', sheetNames:ss.getSheets().map(function(s){return s.getName();}) };
    var rows = sheet.getDataRange().getValues();
    return { success:true, sheetName:sheet.getName(), totalRows:rows.length, headers:rows[0], sampleRows:rows.slice(1,6), expectedHeaders:CONFIG_HEADERS };
  } catch(err) { return { success:false, message:err.message }; }
}

// ── checkDuplicate (kecamatan+cabang) ────────────────────────
function apiCheckDuplicate_(params) {
  var kecamatan = String(params.kecamatan||'').trim();
  var cabang    = String(params.cabang   ||'').trim();
  if (!kecamatan || !cabang) return { success:false, message:'Parameter tidak lengkap' };
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  if (sheet.getLastRow()<=1) return { success:true, isDuplicate:false, count:0 };
  var rows  = sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  var count = 0;
  rows.forEach(function(row) {
    var s = String(row[COL.STATUS_VERIFIKASI]||'').toLowerCase();
    if (s==='nonaktif') return;
    if (String(row[COL.KECAMATAN]||'').trim()===kecamatan && String(row[COL.CABANG_LOMBA]||'').trim()===cabang) count++;
  });
  return { success:true, isDuplicate:count>0, count:count };
}

// ── checkNIK (FIX #3) ─────────────────────────────────────────
function apiCheckNIK_(params) {
  var nik = String(params.nik || '').trim();
  if (!nik) return { success:false, message:'Parameter NIK diperlukan' };
 
  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sheet) return { success:false, found:false, message:'Sheet tidak ditemukan' };
 
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success:true, found:false };
 
  var rows = sheet.getRange(2, 1, lastRow - 1, PENDAFTAR_HEADERS.length).getValues();
 
  for (var i = 0; i < rows.length; i++) {
    var row    = rows[i];
    var rowNIK = String(row[COL.NIK] || '').trim();
 
    // Cek NIK ketua / individu
    if (rowNIK === nik) {
      return buildNIKResponse_(row, nik);
    }
 
    // Cek NIK anggota tim (dari kolom ANGGOTA_JSON)
    var anggotaJson = row[COL.ANGGOTA_JSON] || '';
    if (anggotaJson) {
      try {
        var anggota = JSON.parse(anggotaJson);
        for (var j = 0; j < anggota.length; j++) {
          if (String(anggota[j].nik || '').trim() === nik) {
            return buildNIKResponse_(row, nik, anggota, j);
          }
        }
      } catch (e2) {}
    }
  }
 
  return { success:true, found:false };
}

function apiCheckNIK_v2_(params) {
  var nik = String(params.nik || '').trim();
  if (!nik) return { success:false, message:'NIK tidak boleh kosong' };
 
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success:true, found:false };
 
  var rows = sheet.getRange(2, 1, lastRow - 1, PENDAFTAR_HEADERS.length).getValues();
 
  for (var i = 0; i < rows.length; i++) {
    var row    = rows[i];
    var rowNIK = String(row[COL.NIK] || '').trim();
 
    // Ketua / individu
    if (rowNIK === nik) {
      return _buildNIKRecord(row, nik);
    }
 
    // Cek anggota tim di ANGGOTA_JSON
    var anggotaRaw = row[COL.ANGGOTA_JSON];
    if (anggotaRaw) {
      try {
        var anggota = JSON.parse(anggotaRaw);
        for (var j = 0; j < anggota.length; j++) {
          if (String(anggota[j].nik || '').trim() === nik) {
            return _buildNIKRecord(row, nik, anggota, j);
          }
        }
      } catch (pe) {}
    }
  }
 
  return { success:true, found:false };
}

// ── FIX #1: helper terpusat untuk lookup config cabang ─────────────
// Dipakai oleh _buildNIKRecord (mengisi syarat usia di response checkNIK)
// dan apiPerbaikan_ (validasi usia server-side saat submit perbaikan),
// supaya keduanya konsisten dengan logika yang sama dipakai apiRegister_.
function getCabangConfig_(cabangLomba) {
  var target = String(cabangLomba || '').trim();
  if (!target) return null;
  try {
    var ss       = getSS_();
    var cfgSheet = getOrCreateSheet_(ss, SHEET_CONFIG, CONFIG_HEADERS, DEFAULT_CONFIG_DATA);
    var cfgData  = cfgSheet.getDataRange().getValues();
    var cfgHdr   = cfgData[0].map(function(h){ return String(h).trim().toLowerCase().replace(/\s+/g,'_'); });
    var cIdx     = cfgHdr.indexOf('cabang_lomba');
    for (var i=1; i<cfgData.length; i++) {
      if (String(cfgData[i][cIdx]||'').trim() === target) {
        var row = cfgData[i];
        return {
          tipe          : String(row[cfgHdr.indexOf('tipe')]||'individu').trim(),
          gender        : String(row[cfgHdr.indexOf('gender')]||'Semua').trim(),
          umur_min      : parseInt(row[cfgHdr.indexOf('umur_min')])||0,
          umur_max_tahun: parseInt(row[cfgHdr.indexOf('umur_max_tahun')])||99,
          umur_max_bulan: parseInt(row[cfgHdr.indexOf('umur_max_bulan')])||0,
          umur_max_hari : parseInt(row[cfgHdr.indexOf('umur_max_hari')])||0,
          kuota         : parseInt(row[cfgHdr.indexOf('kuota')])||31,
          status        : String(row[cfgHdr.indexOf('status_aktif')]||'').trim(),
        };
      }
    }
  } catch (eCfg) { logWarn('api','getCabangConfig_ error: '+eCfg.message); }
  // Fallback ke DEFAULT_CONFIG_DATA (mis. sheet CONFIG belum sinkron)
  for (var di=0; di<DEFAULT_CONFIG_DATA.length; di++) {
    if (String(DEFAULT_CONFIG_DATA[di][0]).trim() === target) {
      var dr = DEFAULT_CONFIG_DATA[di];
      return { tipe:String(dr[1]).trim(), gender:String(dr[2]).trim(),
        umur_min:parseInt(dr[3])||0, umur_max_tahun:parseInt(dr[4])||99,
        umur_max_bulan:parseInt(dr[5])||0, umur_max_hari:parseInt(dr[6])||0,
        kuota:parseInt(dr[7])||31, status:'Aktif' };
    }
  }
  return null;
}

function _buildNIKRecord(row, nik, anggotaArr, anggotaIdx) {
  var anggota = [];
  try {
    if (row[COL.ANGGOTA_JSON]) anggota = JSON.parse(row[COL.ANGGOTA_JSON]);
  } catch(e) {}

  // FIX #1 / #2: syarat usia cabang + link dokumen existing, supaya
  // validateDOB()/allDOBValid() dan uzMini() di cek-maqra.js tidak lagi
  // selalu jatuh ke nilai default (tanpa batas / tanpa link dokumen).
  var _cabangNama = String(row[COL.CABANG_LOMBA] || '');
  var _cabangCfg  = getCabangConfig_(_cabangNama) || {};

  return {
    success: true,
    found  : true,
    record : {
      nomor_pendaftaran : String(row[COL.NOMOR_PENDAFTARAN] || ''),
      tipe_lomba        : String(row[COL.TIPE_LOMBA]        || 'individu'),
      nama_tim          : String(row[COL.NAMA_TIM]          || ''),
      kecamatan         : String(row[COL.KECAMATAN]         || ''),
      cabang_lomba      : _cabangNama,
      nama_lengkap      : String(row[COL.NAMA_LENGKAP]      || ''),
      nik               : String(row[COL.NIK]               || ''),
      tempat_lahir      : String(row[COL.TEMPAT_LAHIR]      || ''),
      // FIX: sel tanggal_lahir bisa berupa objek Date (Sheets auto-detect
      // teks "YYYY-MM-DD" sbg tanggal) — String(dateObj) akan menghasilkan
      // format panjang salah zona (mis. "Fri Feb 01 2002 00:00:00 GMT+0700"),
      // bukan "2002-02-01". Lihat komentar rowToObj_() di helper.gs.
      tanggal_lahir     : row[COL.TANGGAL_LAHIR] instanceof Date
                            ? Utilities.formatDate(row[COL.TANGGAL_LAHIR], _sheetTimeZone_(), 'yyyy-MM-dd')
                            : String(row[COL.TANGGAL_LAHIR] || ''),
      jenis_kelamin     : String(row[COL.JENIS_KELAMIN]     || ''),
      alamat            : String(row[COL.ALAMAT]            || ''),
      no_hp             : String(row[COL.NO_HP]             || ''),
      email             : String(row[COL.EMAIL]             || ''),
      status_verifikasi : String(row[COL.STATUS_VERIFIKASI] || 'Menunggu'),
      catatan           : String(row[COL.CATATAN]           || ''),
      anggota           : anggota,
      nik_pencari       : nik,
      is_ketua          : anggotaIdx === undefined || anggotaIdx === 0,
      // ── FIX #1: syarat usia cabang — dipakai validateDOB()/allDOBValid() ──
      umur_min          : _cabangCfg.umur_min,
      umur_max_tahun    : _cabangCfg.umur_max_tahun,
      umur_max_bulan    : _cabangCfg.umur_max_bulan,
      umur_max_hari     : _cabangCfg.umur_max_hari,
      age_cutoff        : PENDAFTARAN_CONFIG.AGE_CUTOFF_DATE,
      // ── FIX #2: link dokumen existing — dipakai uzMini()/"Lihat Dokumen" ──
      link_rekom        : String(row[COL.LINK_REKOM]  || ''),
      link_folder       : String(row[COL.LINK_FOLDER] || ''),
    },
    // Kunci API Drive (dibatasi HTTP referrer + Drive API only — lihat config.gs)
    // dikirim di sini agar DocumentPreviewer di halaman publik cekstatus.html
    // bisa menampilkan preview dokumen milik peserta yang sedang login by NIK.
    driveApiKey: DRIVE_API_KEY || ''
  };
}

function buildNIKResponse_(row, nik, anggota, anggotaIdx) {
  var anggotaArr = [];
  try {
    if (row[COL.ANGGOTA_JSON]) {
      anggotaArr = JSON.parse(row[COL.ANGGOTA_JSON]);
    }
  } catch(e) {}
 
  return {
    success: true,
    found  : true,
    record : {
      nomor_pendaftaran : String(row[COL.NOMOR_PENDAFTARAN] || ''),
      tipe_lomba        : String(row[COL.TIPE_LOMBA]        || 'individu'),
      nama_tim          : String(row[COL.NAMA_TIM]          || ''),
      kecamatan         : String(row[COL.KECAMATAN]         || ''),
      cabang_lomba      : String(row[COL.CABANG_LOMBA]      || ''),
      nama_lengkap      : String(row[COL.NAMA_LENGKAP]      || ''),
      nik               : String(row[COL.NIK]               || ''),
      tempat_lahir      : String(row[COL.TEMPAT_LAHIR]      || ''),
      tanggal_lahir     : String(row[COL.TANGGAL_LAHIR]     || ''),
      jenis_kelamin     : String(row[COL.JENIS_KELAMIN]     || ''),
      alamat            : String(row[COL.ALAMAT]            || ''),
      no_hp             : String(row[COL.NO_HP]             || ''),
      email             : String(row[COL.EMAIL]             || ''),
      status_verifikasi : String(row[COL.STATUS_VERIFIKASI] || 'Menunggu'),
      catatan           : String(row[COL.CATATAN]           || ''),
      anggota           : anggotaArr,
      nik_pencari       : nik,
      is_ketua          : anggotaIdx === undefined || anggotaIdx === 0,
    }
  };
}

// ── getConfig ─────────────────────────────────────────────────
function apiGetConfig_() {
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_CONFIG, CONFIG_HEADERS, DEFAULT_CONFIG_DATA);
  var rows  = sheet.getDataRange().getValues();
  var hdrs  = rows[0].map(function(h){return String(h).trim().toLowerCase().replace(/\s+/g,'_');});
  var config = [];
  for (var i=1; i<rows.length; i++) {
    var r=rows[i], obj={};
    hdrs.forEach(function(h,j){obj[h]=r[j]!==undefined?r[j]:'';});
    var nm = String(obj.cabang_lomba||'').trim();
    if (!nm) continue;
    if (String(obj.status_aktif||'').trim().toLowerCase()!=='aktif') continue;
    config.push({
      cabang_lomba:nm, tipe:String(obj.tipe||'individu').trim(), gender:String(obj.gender||'Semua').trim(),
      umur_min:parseInt(obj.umur_min)||0, umur_max_tahun:parseInt(obj.umur_max_tahun)||99,
      umur_max_bulan:parseInt(obj.umur_max_bulan)||0, umur_max_hari:parseInt(obj.umur_max_hari)||0,
      kuota:parseInt(obj.kuota)||31, status_aktif:'Aktif',
    });
  }
  if (config.length===0) {
    logWarn('api','CONFIG kosong — pakai DEFAULT');
    config = DEFAULT_CONFIG_DATA.map(function(row){
      return { cabang_lomba:String(row[0]).trim(), tipe:String(row[1]).trim(), gender:String(row[2]).trim(),
               umur_min:parseInt(row[3])||0, umur_max_tahun:parseInt(row[4])||99,
               umur_max_bulan:parseInt(row[5])||0, umur_max_hari:parseInt(row[6])||0,
               kuota:parseInt(row[7])||31, status_aktif:'Aktif' };
    });
  }
  var regStatus = isRegistrationOpen_();
  return { success:true, config:config,
    registrationConfig:{ buka:PENDAFTARAN_CONFIG.BUKA, tutup:PENDAFTARAN_CONFIG.TUTUP,
      ageCutoffDate:PENDAFTARAN_CONFIG.AGE_CUTOFF_DATE, isOpen:regStatus.open, status:regStatus.status },
    event:EVENT_INFO };
}

// ── getStats ──────────────────────────────────────────────────
function apiGetStats_() {
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  // FIX: regStatus dihitung SEBELUM early-return, lalu disertakan di KEDUA
  // jalur return (sheet PENDAFTAR kosong maupun sudah terisi). Sebelumnya
  // jalur early-return (sheet baru berisi header / belum ada pendaftar sama
  // sekali) TIDAK menyertakan isOpen/status/buka/tutup, sehingga di
  // main.js → loadRegStatus() field2 itu undefined dan #heroRegBanner
  // jatuh ke cabang "else" (dianggap TERTUTUP, dgn tanggal "—") — persis
  // yang terjadi di hari pertama pendaftaran dibuka saat PENDAFTAR masih 0 baris.
  var regStatus = isRegistrationOpen_();
  if (sheet.getLastRow()<=1) {
    return { success:true, total:0, verified:0, pending:0, rejected:0, nonaktif:0, cabangs:0, kecamatans:0,
             isOpen:regStatus.open, status:regStatus.status,
             buka:PENDAFTARAN_CONFIG.BUKA, tutup:PENDAFTARAN_CONFIG.TUTUP };
  }
  var data = sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  var verified=0,pending=0,rejected=0,nonaktif=0,cabangs={},kecs={};
  data.forEach(function(row) {
    var s=String(row[COL.STATUS_VERIFIKASI]||'').toLowerCase();
    if(s==='terverifikasi')verified++;else if(s==='ditolak')rejected++;else if(s==='nonaktif')nonaktif++;else pending++;
    var cb=row[COL.CABANG_LOMBA];if(cb)cabangs[cb]=1;
    var kc=row[COL.KECAMATAN];if(kc)kecs[kc]=1;
  });
  return { success:true, total:data.length, verified:verified, pending:pending, rejected:rejected, nonaktif:nonaktif,
           cabangs:Object.keys(cabangs).length, kecamatans:Object.keys(kecs).length,
           isOpen:regStatus.open, status:regStatus.status,
           buka:PENDAFTARAN_CONFIG.BUKA, tutup:PENDAFTARAN_CONFIG.TUTUP };
}

// ── getDitolak (publik, TANPA token) ─────────────────────────
// FIX: dipakai tombol "📋 Lihat Peserta Ditolak" di cekstatus.html
// supaya siapa saja bisa melihat daftar peserta yang ditolak beserta
// alasannya, tanpa perlu tahu NIK dan tanpa perlu login admin.
// SENGAJA hanya mengembalikan field yang aman ditampilkan ke publik
// (nama, tipe, cabang, kecamatan, catatan) — TIDAK ada NIK, alamat,
// no_hp, email, dst seperti checkNIK/getAllPendaftar.
function apiGetDitolak_() {
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  if (sheet.getLastRow()<=1) return { success:true, data:[], total:0 };

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  var data = [];
  rows.forEach(function(row) {
    if (String(row[COL.STATUS_VERIFIKASI]||'').toLowerCase() !== 'ditolak') return;
    var tipe    = String(row[COL.TIPE_LOMBA]||'individu').trim();
    var namaTim = String(row[COL.NAMA_TIM]||'').trim();
    // Tim → tampilkan nama tim (bukan nama ketua) supaya jelas ini
    // penolakan atas satu tim, bukan hanya satu orang.
    var nama = (tipe === 'team' && namaTim) ? namaTim : String(row[COL.NAMA_LENGKAP]||'').trim();
    data.push({
      nama_peserta: nama || '-',
      tipe_lomba  : tipe,
      cabang_lomba: String(row[COL.CABANG_LOMBA]||''),
      kecamatan   : String(row[COL.KECAMATAN]||''),
      catatan     : String(row[COL.CATATAN]||'')
    });
  });
  logInfo('api','apiGetDitolak_ — total ditolak: '+data.length);
  return { success:true, data:data, total:data.length };
}

// ── getQuota ──────────────────────────────────────────────────
function apiGetQuota_(params) {
  var cabang = String(params.cabang||'').trim();
  var ss     = getSS_();
  var sheet  = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  return { success:true, count:countByCabangActive_(sheet,cabang), cabang:cabang };
}



// ── getAllPendaftar (GET via JSONP) ────────────────────────────
function apiGetAll_(params) {
  var token = String(params.token || '').trim();
  logInfo('api','apiGetAll_ token length: '+token.length);
  if (!isTokenValid_(token)) {
    logWarn('api','apiGetAll_ — token tidak valid');
    return { success:false, message:'Sesi tidak valid. Silakan login ulang.' };
  }
  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  if (sheet.getLastRow()<=1) return { success:true, data:[] };
  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  logInfo('api','apiGetAll_ — rows: '+rows.length);
  return {
    success    : true,
    data       : rows.map(function(r){ return rowToObj_(r); }),
    driveApiKey: DRIVE_API_KEY || ''   // returned only to authenticated admin
  };
}





// ── register ──────────────────────────────────────────────────
function apiRegister_(body) {
  logInfo('api','apiRegister_ START',{cabang:body.cabang_lomba,kecamatan:body.kecamatan});

  // 1. Status pendaftaran
  var regStatus = isRegistrationOpen_();
  if (!regStatus.open) {
    var msg = regStatus.status==='belum_buka'
      ? 'Pendaftaran belum dibuka (buka per '+PENDAFTARAN_CONFIG.BUKA+').'
      : 'Pendaftaran telah ditutup.';
    return { success:false, message:msg };
  }

  // 2. Cari config cabang
  var ss         = getSS_();
  var cfgSheet   = getOrCreateSheet_(ss, SHEET_CONFIG, CONFIG_HEADERS, DEFAULT_CONFIG_DATA);
  var cfgData    = cfgSheet.getDataRange().getValues();
  var cfgHdr     = cfgData[0].map(function(h){return String(h).trim().toLowerCase().replace(/\s+/g,'_');});
  var cabangIdx  = cfgHdr.indexOf('cabang_lomba');
  var targetCabang = String(body.cabang_lomba||'').trim();
  var cabangCfg  = null;

  for (var ci=1; ci<cfgData.length; ci++) {
    if (String(cfgData[ci][cabangIdx]||'').trim()===targetCabang) {
      var crow = cfgData[ci];
      cabangCfg = {
        tipe:String(crow[cfgHdr.indexOf('tipe')]||'individu').trim(),
        gender:String(crow[cfgHdr.indexOf('gender')]||'Semua').trim(),
        umur_min:parseInt(crow[cfgHdr.indexOf('umur_min')])||0,
        umur_max_tahun:parseInt(crow[cfgHdr.indexOf('umur_max_tahun')])||99,
        umur_max_bulan:parseInt(crow[cfgHdr.indexOf('umur_max_bulan')])||0,
        umur_max_hari:parseInt(crow[cfgHdr.indexOf('umur_max_hari')])||0,
        kuota:parseInt(crow[cfgHdr.indexOf('kuota')])||31,
        status:String(crow[cfgHdr.indexOf('status_aktif')]||'').trim(),
      };
      break;
    }
  }
  // Fallback ke DEFAULT
  if (!cabangCfg) {
    for (var di=0; di<DEFAULT_CONFIG_DATA.length; di++) {
      if (String(DEFAULT_CONFIG_DATA[di][0]).trim()===targetCabang) {
        var dr=DEFAULT_CONFIG_DATA[di];
        cabangCfg={tipe:String(dr[1]).trim(),gender:String(dr[2]).trim(),
          umur_min:parseInt(dr[3])||0,umur_max_tahun:parseInt(dr[4])||99,
          umur_max_bulan:parseInt(dr[5])||0,umur_max_hari:parseInt(dr[6])||0,
          kuota:parseInt(dr[7])||31,status:'Aktif'};
        break;
      }
    }
  }
  if (!cabangCfg) return { success:false, message:'Cabang tidak ditemukan: '+targetCabang };
  if (String(cabangCfg.status).toLowerCase()!=='aktif') return { success:false, message:'Cabang tidak aktif.' };

  // 3. Validasi anggota
  var members = body.members||[];
  if (!members.length) return { success:false, message:'Data peserta tidak boleh kosong' };
  if (cabangCfg.tipe==='team' && members.length<2) return { success:false, message:'Tim minimal 2 anggota' };
  if (cabangCfg.tipe==='team' && members.length>3) return { success:false, message:'Tim maksimal 3 anggota' };

  // FIX #14: normalisasi teks — uppercase semua huruf & alamat diratakan
  // jadi satu baris (lihat normalizeUpperText_ di helper.gs). Dilakukan
  // di awal, sebelum divalidasi/disimpan, supaya SEMUA turunannya ikut
  // konsisten: label pesan error di bawah, processedMembers/ANGGOTA_JSON,
  // dan kolom utama NAMA_LENGKAP/TEMPAT_LAHIR/ALAMAT di sheet.
  members.forEach(function(m) {
    m.nama_lengkap = normalizeUpperText_(m.nama_lengkap);
    m.tempat_lahir = normalizeUpperText_(m.tempat_lahir);
    m.alamat       = normalizeUpperText_(m.alamat);
  });
  body.nama_tim      = normalizeUpperText_(body.nama_tim);
  body.nama_bank     = normalizeUpperText_(body.nama_bank);
  body.nama_rekening = normalizeUpperText_(body.nama_rekening);

  for (var mi=0; mi<members.length; mi++) {
    var m=members[mi], label='Anggota '+(mi+1)+' ('+(m.nama_lengkap||'-')+')';
    var gChk=validateGender_(m.jenis_kelamin, cabangCfg.gender);
    if (!gChk.ok) return { success:false, message:label+': '+gChk.msg };
    var age=calcAgeAtCutoff_(m.tanggal_lahir);
    var aChk=validateAge_(age, cabangCfg.umur_min, cabangCfg.umur_max_tahun, cabangCfg.umur_max_bulan, cabangCfg.umur_max_hari);
    if (!aChk.ok) return { success:false, message:label+': '+aChk.msg };
    m._age = age;
  }

  // ══════════════════════════════════════════════════════════════
  //  FIX CRITICAL: race condition — dulu TIDAK ADA penguncian sama
  //  sekali di seluruh alur pendaftaran. Kalau 2 permintaan (mis.
  //  klik dobel tombol daftar, atau retry otomatis krn timeout
  //  jaringan saat upload berkas besar) berjalan BERSAMAAN, keduanya
  //  bisa SAMA-SAMA lolos cek duplikat NIK / kecamatan+cabang DAN
  //  sama-sama dapat nomor pendaftaran — karena keduanya membaca
  //  sheet SEBELUM salah satu pun sempat menulis baris (upload
  //  berkas ke Drive di antaranya bisa makan waktu cukup lama utk
  //  celah ini benar2 kena). Hasilnya: 2 baris/nomor dgn data yg
  //  identik, persis yang dilaporkan.
  //
  //  Perbaikan: LockService.getScriptLock() membungkus bagian CEPAT
  //  saja (cek duplikat + generate nomor + tulis baris "reservasi")
  //  — baris ini langsung tertulis ke sheet SEBELUM lock dilepas,
  //  supaya permintaan LAIN yang sedang antre lock langsung melihat
  //  baris ini saat gilirannya tiba & pengecekan duplikatnya jadi
  //  akurat. Lock SENGAJA TIDAK dipegang selama upload Drive (bisa
  //  lama) — supaya pendaftar lain utk kecamatan/cabang yang SAMA
  //  SEKALI BEDA tidak ikut tertahan menunggu upload orang lain
  //  selesai. Link berkas disisipkan lewat UPDATE ke baris yang sama
  //  setelah upload selesai, di luar lock.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return { success:false, message:'Sistem sedang memproses pendaftaran lain. Mohon coba lagi dalam beberapa saat.' };
  }

  var nomor, pendSheet, reservedRowNum;
  try {
    // 4. Cek duplikat kecamatan+cabang — di DALAM lock, data ter-update.
    pendSheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
    var dupCheck = checkDuplicateKecCabang_(pendSheet, body.kecamatan, targetCabang);
    if (dupCheck.isDuplicate) return { success:false, message:'Kecamatan '+body.kecamatan+' sudah mendaftarkan peserta pada cabang '+targetCabang+'.' };

    // 5. FIX #3: Cek duplikat NIK di semua anggota — di DALAM lock.
    var allNIKs = members.map(function(m){return m.nik||'';}).filter(Boolean);
    var nikCheck = checkNIKDuplicate_(pendSheet, allNIKs);
    if (nikCheck.isDuplicate) return { success:false, message:nikCheck.msg };

    // 6. Kuota — di DALAM lock.
    var curCount = countByCabangActive_(pendSheet, targetCabang);
    if (curCount>=cabangCfg.kuota) return { success:false, message:'Kuota '+targetCabang+' sudah penuh ('+cabangCfg.kuota+')' };

    // 7. Nomor pendaftaran — di DALAM lock, LANGSUNG diklaim di bawah.
    nomor = generateRegNumberOddEven_(pendSheet, targetCabang, cabangCfg.gender);
    logInfo('api','Nomor: '+nomor);

    // 9a. Tulis baris RESERVASI sekarang juga (identitas lengkap semua
    // anggota, TANPA link berkas dulu) — inilah yang menutup celah race:
    // begitu baris ini ada, permintaan lain (utk NIK/kecamatan+cabang yg
    // sama) yang antre di lock ini akan langsung terdeteksi duplikat.
    var lead = members[0];
    var row = new Array(PENDAFTAR_HEADERS.length).fill('');
    row[COL.TIMESTAMP]         = new Date().toLocaleString('id-ID');
    row[COL.NOMOR_PENDAFTARAN] = nomor;
    row[COL.TIPE_LOMBA]        = cabangCfg.tipe;
    row[COL.NAMA_TIM]          = body.nama_tim||'';
    row[COL.KECAMATAN]         = body.kecamatan||'';
    row[COL.CABANG_LOMBA]      = targetCabang;
    row[COL.GENDER_CABANG]     = cabangCfg.gender;
    row[COL.NAMA_LENGKAP]      = lead.nama_lengkap;
    row[COL.NIK]               = lead.nik;
    row[COL.TEMPAT_LAHIR]      = lead.tempat_lahir;
    row[COL.TANGGAL_LAHIR]     = lead.tanggal_lahir;
    row[COL.UMUR_DISPLAY]      = lead._age ? lead._age.display : '';
    row[COL.JENIS_KELAMIN]     = lead.jenis_kelamin;
    row[COL.ALAMAT]            = lead.alamat;
    row[COL.NO_HP]             = lead.no_hp;
    row[COL.EMAIL]             = lead.email;
    row[COL.NAMA_BANK]         = body.nama_bank||'';
    row[COL.NOMOR_REKENING]    = body.nomor_rekening||'';
    row[COL.NAMA_REKENING]     = body.nama_rekening||'';
    row[COL.STATUS_VERIFIKASI] = 'Menunggu';
    row[COL.ANGGOTA_JSON]      = JSON.stringify(members.map(function(m) {
      return { nama_lengkap:m.nama_lengkap||'', nik:m.nik||'',
        tempat_lahir:m.tempat_lahir||'', tanggal_lahir:m.tanggal_lahir||'',
        umur_display:m._age?m._age.display:'', jenis_kelamin:m.jenis_kelamin||'',
        alamat:m.alamat||'', no_hp:m.no_hp||'', email:m.email||'',
        link_foto:'', link_ktp:'', link_sertifikat:'' };
    }));
    pendSheet.appendRow(row);
    reservedRowNum = pendSheet.getLastRow();
  } finally {
    lock.releaseLock();
  }

  // ── Lock sudah dilepas — nomor SUDAH tercatat & aman dari duplikat.
  // Upload berkas (bisa lambat) berjalan bebas, tidak menahan pendaftar
  // lain utk kecamatan/cabang yang berbeda. ──────────────────────────
  try {
    // 8. Upload files
    var pesertaFolder = getPesertaFolder_(targetCabang, body.kecamatan, nomor);
    var folderUrl     = 'https://drive.google.com/drive/folders/'+pesertaFolder.getId();
    var processedMembers = [];
    for (var mi2=0; mi2<members.length; mi2++) {
      var m2=members[mi2], prefix2=(m2.nama_lengkap||'A'+(mi2+1)).replace(/\s+/g,'_').substring(0,30);
      var links = uploadMemberFiles_(m2, pesertaFolder, prefix2);
      // FIX #7: upload sertifikat
      var linkSert = uploadFile_(m2.sertifikat, pesertaFolder, 'SERTIFIKAT_'+prefix2);
      processedMembers.push({
        nama_lengkap:m2.nama_lengkap||'', nik:m2.nik||'',
        tempat_lahir:m2.tempat_lahir||'', tanggal_lahir:m2.tanggal_lahir||'',
        umur_display:m2._age?m2._age.display:'', jenis_kelamin:m2.jenis_kelamin||'',
        alamat:m2.alamat||'', no_hp:m2.no_hp||'', email:m2.email||'',
        link_foto:links.foto, link_ktp:links.ktp, link_sertifikat:linkSert,
      });
    }
    // FIX #11: Rekomendasi mandatory — upload & simpan URL
    var rekomUrl = uploadFile_(body.rekom, pesertaFolder, 'REKOMENDASI');
    logInfo('api','rekom URL: ' + rekomUrl);

    // 9b. Lengkapi baris reservasi dengan link folder & berkas.
    pendSheet.getRange(reservedRowNum, COL.LINK_FOLDER+1).setValue(folderUrl);
    pendSheet.getRange(reservedRowNum, COL.ANGGOTA_JSON+1).setValue(JSON.stringify(processedMembers));
    pendSheet.getRange(reservedRowNum, COL.LINK_REKOM+1).setValue(rekomUrl || '');
    writeLog_(ss,'REGISTER',nomor+' | '+targetCabang+' | '+(body.kecamatan||''),'ok');

    return { success:true, nomor_pendaftaran:nomor, tipe_lomba:cabangCfg.tipe,
             cabang_lomba:targetCabang, kecamatan:body.kecamatan,
             jumlah_anggota:processedMembers.length, link_folder:folderUrl, message:'Pendaftaran berhasil!' };

  } catch (uploadErr) {
    // FIX: nomor SUDAH terlanjur tercatat (mencegah duplikat) sebelum
    // upload ini gagal — jangan biarkan baris nyangkut diam2 tanpa
    // berkas. Ditandai 'Ditolak' + catatan supaya peserta bisa
    // melengkapi sendiri lewat menu Cek Status (alur "Perbaikan Data"
    // yang sudah ada), tanpa perlu daftar ulang dari nol / kehilangan
    // nomor pendaftarannya.
    logError('api', 'Upload gagal setelah nomor '+nomor+' direservasi: ' + uploadErr.message, {nomor:nomor});
    try {
      pendSheet.getRange(reservedRowNum, COL.STATUS_VERIFIKASI+1).setValue('Ditolak');
      pendSheet.getRange(reservedRowNum, COL.CATATAN+1).setValue('Sebagian berkas belum berhasil diunggah karena kendala teknis. Silakan lengkapi/unggah ulang berkas melalui menu Cek Status.');
    } catch (e2) { logError('api', 'Gagal menandai baris reservasi setelah upload error: ' + e2.message, {nomor:nomor}); }
    return { success:false, nomor_pendaftaran:nomor,
      message:'Nomor pendaftaran Anda ('+nomor+') sudah tercatat, tetapi upload berkas gagal karena kendala teknis. Silakan buka menu Cek Status, masukkan NIK Anda, lalu lengkapi berkas yang belum terupload.' };
  }
}

// ── initSheets (callable via GET) ────────────────────────────
function apiInitSheets_() {
  return { success:true, msg: initAllSheets() };
}

// ── Helpers ───────────────────────────────────────────────────
function checkDuplicateKecCabang_(sheet, kecamatan, cabang) {
  if (sheet.getLastRow()<=1) return { isDuplicate:false };
  var kecT=String(kecamatan||'').trim(), cabT=String(cabang||'').trim();
  var rows=sheet.getRange(2,1,sheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  for (var i=0; i<rows.length; i++) {
    var s=String(rows[i][COL.STATUS_VERIFIKASI]||'').toLowerCase();
    if (s==='nonaktif') continue;
    if (String(rows[i][COL.KECAMATAN]||'').trim()===kecT && String(rows[i][COL.CABANG_LOMBA]||'').trim()===cabT) return {isDuplicate:true};
  }
  return {isDuplicate:false};
}

function countByCabangActive_(sheet, cabang) {
  if (sheet.getLastRow()<=1) return 0;
  var data=sheet.getRange(2,COL.CABANG_LOMBA+1,sheet.getLastRow()-1,1).getValues();
  var stat=sheet.getRange(2,COL.STATUS_VERIFIKASI+1,sheet.getLastRow()-1,1).getValues();
  var count=0;
  for (var i=0;i<data.length;i++) {
    if (String(data[i][0]).trim()===String(cabang).trim() && String(stat[i][0]).toLowerCase()!=='nonaktif') count++;
  }
  return count;
}

function generateRegNumberOddEven_(sheet, cabangLomba, gender) {
  var prefix = getCabangPrefix_(cabangLomba);
  var isOdd  = (gender==='P');
  var isEven = (gender==='L');
  var used   = {};
  if (sheet.getLastRow()>1) {
    var nums = sheet.getRange(2,COL.NOMOR_PENDAFTARAN+1,sheet.getLastRow()-1,1).getValues();
    var stats= sheet.getRange(2,COL.STATUS_VERIFIKASI+1,sheet.getLastRow()-1,1).getValues();
    nums.forEach(function(r,i){
      var m=String(r[0]).match(new RegExp('^'+prefix+'-(\\d+)$'));
      if (m) used[parseInt(m[1])]=true;
    });
  }
  for (var n=1; n<=62; n++) {
    if (isOdd  && n%2===0) continue;
    if (isEven && n%2===1) continue;
    if (!used[n]) return prefix+'-'+String(n).padStart(3,'0');
  }
  var max=Object.keys(used).length ? Math.max.apply(null,Object.keys(used).map(Number)) : 0;
  return prefix+'-'+String(max+1).padStart(3,'0');
}

// ── FIX: updateRowField_ was missing — required by all admin GET handlers ──
function updateRowField_(nomor, colIndex, value, catatan) {
  logInfo('api','updateRowField_', {nomor:nomor, col:colIndex, value:String(value).substring(0,40)});
  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sheet) return {success:false, message:'Sheet PENDAFTAR tidak ditemukan'};

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {success:false, message:'Sheet kosong'};

  var nums = sheet.getRange(2, COL.NOMOR_PENDAFTARAN+1, lastRow-1, 1).getValues();
  for (var i=0; i<nums.length; i++) {
    if (String(nums[i][0]).trim() === String(nomor).trim()) {
      sheet.getRange(i+2, colIndex+1).setValue(value);
      if (catatan) sheet.getRange(i+2, COL.CATATAN+1).setValue(catatan);
      writeLog_(ss, 'UPDATE', nomor+' col='+colIndex+' → '+String(value).substring(0,50), 'ok');
      return {success:true, nomor_pendaftaran:nomor};
    }
  }
  return {success:false, message:'Nomor pendaftaran tidak ditemukan: '+nomor};
}


// ── Catatan: apiGetMaqraStatus_ di maqra.gs perlu mendukung ──
// cabang_lomba=GLOBAL — update getMaqraConfigStatus_ agar:
// 1. Cari row dengan cabang_lomba = 'GLOBAL' dahulu
// 2. Jika tidak ada, cari row dengan cabang_lomba = cabang peserta
// Tambahkan ini di maqra.gs fungsi getMaqraConfigStatus_:
//
// function getMaqraConfigStatus_(ss, cabang) {
//   var sheet = ss.getSheetByName(SHEET_MAQRA_CONFIG);
//   if (!sheet || sheet.getLastRow() <= 1) return { isOpen:false };
//   var rows = sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues();
//   // Try GLOBAL first, then specific cabang
//   var targets = ['GLOBAL', cabang];
//   for (var t=0; t<targets.length; t++) {
//     for (var i=0; i<rows.length; i++) {
//       if (String(rows[i][0]).trim() === targets[t]) {
//         // ... same logic as before ...
//       }
//     }
//   }
//   return { isOpen:false };
// }
 
// ── logError_ (alias) ──────────────────────────────────────────
// FIX: sebelumnya dummy dengan console.error mentah (bypass
// LOGGER_ENABLED & sheet LOG). Sekarang diarahkan ke logError()
// asli di helper.gs supaya tetap lewat satu pintu yang sama.
function logError_(ctx, msg) {
  logError(ctx, msg);
}

function apiPerbaikan_(body) {
  var nomor = String(body.nomor_pendaftaran || '').trim();
  if (!nomor) return { success:false, message:'Nomor pendaftaran tidak ada' };

  // ── FIX: peserta Ditolak sekarang TIDAK BISA lagi mengajukan
  // perbaikan data setelah masa pendaftaran ditutup — dulu fungsi ini
  // tidak pernah mengecek jendela PENDAFTARAN_CONFIG sama sekali, jadi
  // "Kirim Perbaikan" tetap berhasil kapan pun, bahkan lama setelah
  // pendaftaran resmi tutup. Dipakai fungsi YANG SAMA dengan
  // apiRegister_ (isRegistrationOpen_, helper.gs) — satu pintu, satu
  // sumber kebenaran, supaya jendela waktu pendaftaran baru & perbaikan
  // data selalu konsisten. Ini penjagaan yang MENGIKAT — cek di FE
  // (cek-maqra.js, getRegStatus()) cuma feedback cepat & bisa
  // dilewati/dimanipulasi.
  var regStatusPerbaikan = isRegistrationOpen_();
  if (!regStatusPerbaikan.open) {
    var msgPerbaikan = regStatusPerbaikan.status === 'belum_buka'
      ? 'Pendaftaran belum dibuka.'
      : 'Masa pendaftaran telah ditutup, sehingga perbaikan data tidak dapat dilakukan lagi. Silakan hubungi panitia jika memerlukan bantuan lebih lanjut.';
    return { success:false, message: msgPerbaikan };
  }

  var ss    = getSS_();
  var sheet = getOrCreateSheet_(ss, SHEET_PENDAFTAR, PENDAFTAR_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success:false, message:'Data kosong' };

  // Cari baris berdasarkan nomor pendaftaran
  var nums   = sheet.getRange(2, COL.NOMOR_PENDAFTARAN + 1, lastRow - 1, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < nums.length; i++) {
    if (String(nums[i][0]).trim() === nomor) { rowNum = i + 2; break; }
  }
  if (rowNum < 0) return { success:false, message:'Nomor tidak ditemukan: ' + nomor };

  // Hanya boleh jika status saat ini = Ditolak
  var currentStatus = String(sheet.getRange(rowNum, COL.STATUS_VERIFIKASI + 1).getValue()).trim();
  if (currentStatus !== 'Ditolak') {
    return { success:false, message:'Perbaikan hanya berlaku untuk status Ditolak (saat ini: ' + currentStatus + ')' };
  }

  var members = body.members || [];

  // FIX #14: normalisasi teks — sama seperti apiRegister_ (uppercase +
  // alamat diratakan jadi satu baris). Lihat normalizeUpperText_ di
  // helper.gs. Aman untuk field yang tidak diisi ulang: hasilnya string
  // kosong tetap falsy, jadi pengecekan "if (lead.nama_lengkap)" dst.
  // di bawah tetap melewatinya seperti semula.
  members.forEach(function(m) {
    m.nama_lengkap = normalizeUpperText_(m.nama_lengkap);
    m.tempat_lahir = normalizeUpperText_(m.tempat_lahir);
    m.alamat       = normalizeUpperText_(m.alamat);
  });

  // ── FIX #1: validasi usia SEBELUM menyimpan apa pun ────────────────
  // Sebelumnya tanggal_lahir baru langsung ditulis ke sheet tanpa dicek
  // ulang terhadap syarat umur cabang lomba, jadi peserta bisa mengganti
  // tanggal lahir ke nilai di luar syarat cabang saat "perbaikan data".
  // Sekarang divalidasi dengan logika yang sama dengan apiRegister_,
  // lewat helper getCabangConfig_ + calcAgeAtCutoff_/validateAge_ (helper.gs).
  var cabangNama = String(sheet.getRange(rowNum, COL.CABANG_LOMBA + 1).getValue());
  var cabangCfg  = getCabangConfig_(cabangNama);

  // FIX: dukungan "Tambah Anggota" / "Hapus Anggota" di cek-maqra.js &
  // doyourmagic.html — jumlah anggota tim yang disubmit sekarang bisa
  // BERBEDA dari yang tersimpan sebelumnya (2→3 atau 3→2). Batas sama
  // persis dengan apiRegister_ (baris ~1144-1145): tim 2-3 anggota.
  if (cabangCfg && cabangCfg.tipe === 'team') {
    if (members.length < 2) return { success:false, message:'Tim minimal 2 anggota' };
    if (members.length > 3) return { success:false, message:'Tim maksimal 3 anggota' };
  }

  if (cabangCfg && members.length) {
    for (var vi = 0; vi < members.length; vi++) {
      var vm = members[vi];
      if (!vm.tanggal_lahir) continue;   // tidak diubah oleh peserta — lewati
      var vAge = calcAgeAtCutoff_(vm.tanggal_lahir);
      var vChk = validateAge_(vAge, cabangCfg.umur_min, cabangCfg.umur_max_tahun, cabangCfg.umur_max_bulan, cabangCfg.umur_max_hari);
      if (!vChk.ok) {
        return { success:false, message:'Anggota ' + (vi + 1) + ' (' + (vm.nama_lengkap || '-') + '): ' + vChk.msg };
      }
    }
  }

  // ── FIX CRITICAL: race condition sama seperti apiRegister_ — dulu
  // TIDAK ADA penguncian sama sekali di sini juga. Cek duplikat NIK di
  // atas membaca sheet, lalu (di bawah) BARU ditulis — kalau 2 permintaan
  // perbaikan/ganti-NIK berjalan bersamaan (atau bersamaan dengan
  // pendaftaran baru di apiRegister_) utk NIK yang SAMA, keduanya bisa
  // lolos cek sebelum salah satu sempat menulis. LockService di sini
  // memakai SCRIPT LOCK yang SAMA dgn apiRegister_ — keduanya saling
  // menunggu satu sama lain, bukan cuma menunggu sesama apiPerbaikan_.
  // NIK yang baru/berubah LANGSUNG diklaim ke sheet (kolom NIK utama +
  // ANGGOTA_JSON) SEBELUM lock dilepas — field lain (nama/alamat/dst)
  // dan upload berkas TETAP di luar lock seperti semula (tidak perlu
  // ikut serialisasi, tidak berisiko duplikat).
  if (members.length) {
    for (var ni = 0; ni < members.length; ni++) {
      var mNik = String(members[ni].nik || '').trim();
      if (!mNik) return { success:false, message:'NIK anggota ' + (ni + 1) + ' wajib diisi.' };
      if (!/^\d{16}$/.test(mNik)) return { success:false, message:'NIK anggota ' + (ni + 1) + ' harus 16 digit angka.' };
      members[ni].nik = mNik;
    }
    var lockNik = LockService.getScriptLock();
    try {
      lockNik.waitLock(30000);
    } catch (lockNikErr) {
      return { success:false, message:'Sistem sedang memproses permintaan lain. Mohon coba lagi dalam beberapa saat.' };
    }
    try {
      var nikCheck = checkNIKDuplicate_(sheet, members.map(function(m){ return m.nik; }), nomor);
      if (nikCheck.isDuplicate) return { success:false, message: nikCheck.msg };

      // Klaim segera — lihat catatan di atas.
      sheet.getRange(rowNum, COL.NIK + 1).setValue(members[0].nik);
      try {
        var existingJsonClaim = sheet.getRange(rowNum, COL.ANGGOTA_JSON + 1).getValue();
        var existingClaim     = existingJsonClaim ? JSON.parse(existingJsonClaim) : [];
        members.forEach(function(m, idx) {
          if (!existingClaim[idx]) {
            // FIX: anggota BARU (idx belum ada di ANGGOTA_JSON lama) —
            // stub di sini WAJIB lengkap (bukan cuma {nik}), soalnya blok
            // upload di bawah nanti membaca ANGGOTA_JSON ini lagi dan
            // menentukan "anggota baru atau bukan" dari ADA/TIDAKnya
            // existing[idx]. Stub minimal {nik} akan membuat blok itu
            // salah kira anggota ini "sudah ada", sehingga nama_lengkap/
            // tempat_lahir/jenis_kelamin/dst tidak pernah ikut tersimpan.
            existingClaim[idx] = {
              nama_lengkap: m.nama_lengkap || '', nik: '',
              tempat_lahir: m.tempat_lahir || '', tanggal_lahir: m.tanggal_lahir || '',
              jenis_kelamin: (cabangCfg && cabangCfg.gender) || '',
              alamat: m.alamat || '', no_hp: m.no_hp || ''
            };
          }
          existingClaim[idx].nik = m.nik;
        });
        if (existingClaim.length > members.length) existingClaim = existingClaim.slice(0, members.length);
        sheet.getRange(rowNum, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(existingClaim));
      } catch (jsonClaimErr) {
        logError('api', 'Gagal klaim NIK ke ANGGOTA_JSON: ' + jsonClaimErr.message, {nomor:nomor});
      }
    } finally {
      lockNik.releaseLock();
    }
  }

  if (members.length > 0) {
    var lead = members[0];
    // Update kolom utama dari anggota pertama (ketua / individu)
    if (lead.nama_lengkap)  sheet.getRange(rowNum, COL.NAMA_LENGKAP  + 1).setValue(lead.nama_lengkap);
    if (lead.tempat_lahir)  sheet.getRange(rowNum, COL.TEMPAT_LAHIR  + 1).setValue(lead.tempat_lahir);
    if (lead.tanggal_lahir) sheet.getRange(rowNum, COL.TANGGAL_LAHIR + 1).setValue(lead.tanggal_lahir);
    if (lead.alamat)        sheet.getRange(rowNum, COL.ALAMAT         + 1).setValue(lead.alamat);
    if (lead.no_hp)         sheet.getRange(rowNum, COL.NO_HP          + 1).setValue(lead.no_hp);
    // NIK: sudah diklaim & ditulis di blok lockNik di atas, sebelum baris
    // ini dijalankan — tidak ditulis ulang di sini.

    // Upload berkas revisi ke Drive.
    // FIX #2: URL hasil upload sekarang DITANGKAP (newLinks) dan disinkronkan
    // ke ANGGOTA_JSON di bawah — sebelumnya uploadFile_() dipanggil tapi hasil
    // URL-nya dibuang, jadi "Lihat Dokumen" tidak akan pernah lihat file baru.
    var newLinks = {};
    try {
      var cab  = cabangNama;
      var kec  = String(sheet.getRange(rowNum, COL.KECAMATAN + 1).getValue());
      var fold = getPesertaFolder_(cab, kec, nomor);
      var ts   = new Date().getTime();

      members.forEach(function(m, mi) {
        var prefix = 'REVISI_' + ts + '_M' + (mi + 1) + '_';
        var link = {};
        if (m.foto) { try { link.foto = uploadFile_(m.foto, fold, prefix + 'FOTO'); } catch(ue) {} }
        if (m.ktp)  { try { link.ktp  = uploadFile_(m.ktp,  fold, prefix + 'KTP');  } catch(ue) {} }
        if (m.sertifikat && m.sertifikat.length) {
          m.sertifikat.forEach(function(s, si) {
            try {
              var sUrl = uploadFile_(s, fold, prefix + 'SERT' + (si + 1));
              if (sUrl) link.sertifikat = sUrl;
            } catch(ue) {}
          });
        }
        newLinks[mi] = link;
      });

      if (body.rekom) {
        var rekomUrl = uploadFile_(body.rekom, fold, 'REVISI_' + ts + '_REKOMENDASI');
        if (rekomUrl) sheet.getRange(rowNum, COL.LINK_REKOM + 1).setValue(rekomUrl);
      }
    } catch (uploadErr) {
      logWarn('api', 'perbaikan upload error: ' + uploadErr.message);
    }

    // Update ANGGOTA_JSON.
    // FIX #2: sebelumnya blok ini hanya berjalan untuk tim (members.length > 1),
    // sehingga anggota_json milik peserta INDIVIDU tidak pernah ikut tersinkron —
    // nama/tanggal_lahir/link_foto/link_ktp baru tidak pernah tersimpan di sana,
    // meskipun kolom utama (NAMA_LENGKAP dst di atas) sudah ter-update. Sekarang
    // berlaku untuk semua tipe peserta (guard "!existing[idx]" tetap menjaga
    // agar tidak menulis ke index yang tidak ada).
    try {
      var existingJson = sheet.getRange(rowNum, COL.ANGGOTA_JSON + 1).getValue();
      var existing     = existingJson ? JSON.parse(existingJson) : [];
      members.forEach(function(m, idx) {
        if (!existing[idx]) {
          // FIX: anggota BARU (ditambahkan lewat "Tambah Anggota" di
          // cek-maqra.js / doyourmagic.html) — dulu index yang belum ada
          // di ANGGOTA_JSON lama langsung di-skip ("if (!existing[idx])
          // return;"), jadi data anggota baru hilang total walau
          // berkasnya sudah kadung terupload ke Drive. Sekarang entri
          // baru dibuat dari data yang disubmit apa adanya (bukan cuma
          // field yang truthy, karena tidak ada data lama utk digabung).
          // jenis_kelamin ikut cabangCfg.gender — bukan pilihan bebas,
          // karena satu cabang lomba sudah tetap gendernya (mis. "Fahm
          // Al Qur'an Putra" → semua anggota WAJIB 'L'), sama seperti
          // yang divalidasi di apiRegister_ (validateGender_).
          existing[idx] = {
            nama_lengkap : m.nama_lengkap  || '',
            nik          : m.nik           || '',
            tempat_lahir : m.tempat_lahir  || '',
            tanggal_lahir: m.tanggal_lahir || '',
            jenis_kelamin: (cabangCfg && cabangCfg.gender) || '',
            alamat       : m.alamat        || '',
            no_hp        : m.no_hp         || ''
          };
        } else {
          if (m.nama_lengkap)  existing[idx].nama_lengkap  = m.nama_lengkap;
          if (m.nik)           existing[idx].nik           = m.nik;   // FIX: boleh diganti — sudah divalidasi anti-duplikat di atas
          if (m.tempat_lahir)  existing[idx].tempat_lahir  = m.tempat_lahir;
          if (m.tanggal_lahir) existing[idx].tanggal_lahir = m.tanggal_lahir;
          if (m.alamat)        existing[idx].alamat        = m.alamat;
          if (m.no_hp)         existing[idx].no_hp         = m.no_hp;
        }
        var nl = newLinks[idx] || {};
        if (nl.foto)       existing[idx].link_foto       = nl.foto;
        if (nl.ktp)        existing[idx].link_ktp        = nl.ktp;
        if (nl.sertifikat) existing[idx].link_sertifikat = nl.sertifikat;
      });
      // FIX: potong entri lama yang melebihi jumlah anggota yang disubmit
      // sekarang (anggota dihapus lewat "Hapus Anggota" di FE) — tanpa
      // ini, anggota yang sudah dihapus di form tetap nyangkut di
      // ANGGOTA_JSON walau tidak lagi muncul di UI manapun.
      if (existing.length > members.length) existing = existing.slice(0, members.length);
      sheet.getRange(rowNum, COL.ANGGOTA_JSON + 1).setValue(JSON.stringify(existing));
    } catch (je) { logWarn('api', 'anggota JSON update error: ' + je.message); }
  }

  // Reset status ke Menunggu
  sheet.getRange(rowNum, COL.STATUS_VERIFIKASI + 1).setValue('Menunggu');
  sheet.getRange(rowNum, COL.CATATAN + 1).setValue(
    'Direvisi oleh peserta pada ' + new Date().toLocaleString('id-ID')
  );

  writeLog_(ss, 'PERBAIKAN', nomor + ' direset ke Menunggu', 'ok');
  return { success:true, nomor_pendaftaran:nomor, message:'Perbaikan berhasil dikirim.' };
}