// ============================================================
//  MTQ 2026 — penilaian.gs
//  Backend Sistem Penilaian (Dewan Hakim / Peserta / Nilai)
//
//  PENTING — FILE INI BUKAN PROJECT TERPISAH:
//  File ini sekarang adalah BAGIAN dari project Apps Script yang
//  sama dengan api.gs / config.gs / helper.gs / maqra.gs / upload.gs.
//  Semua file itu di-deploy sebagai SATU Web App (satu API_URL),
//  dipakai bersama oleh daftar.html, admin.html, cek-maqra.html,
//  dan penilaian.html.
//
//  Konsekuensinya:
//  - JANGAN deklarasikan ulang SPREADSHEET_ID di sini — sudah ada
//    di config.gs (var SPREADSHEET_ID). Mendeklarasikan ulang
//    dengan `const` akan menyebabkan SyntaxError
//    "Identifier 'SPREADSHEET_ID' has already been declared"
//    yang membuat SELURUH project gagal jalan (semua action,
//    di semua halaman, ikut gagal).
//  - JANGAN buat doGet/doPost lagi di sini — sudah ada satu
//    router terpusat di api.gs yang memanggil fungsi-fungsi di
//    bawah ini. Routing untuk action saveHakim/getHakim/
//    getPeserta/getNilai/dst. ada di switch doGet() pada api.gs.
//
//  CARA DEPLOY (untuk seluruh project, bukan file ini sendiri):
//  1. Pastikan semua file .gs (api, config, helper, maqra,
//     penilaian, upload) ada dalam SATU project Apps Script.
//  2. Deploy → Manage deployments → Edit (pensil) → New version → Deploy
//     - Execute as: Me
//     - Who has access: Anyone
//  3. URL deployment yang sama dipakai semua halaman lewat js/config.js.
// ============================================================

// ── KONFIGURASI ──────────────────────────────────────────────
// SPREADSHEET_ID memakai variabel global dari config.gs — jangan dideklarasikan ulang di sini.
const ADMIN_PIN_GAS  = '1234';                       // ← Ganti PIN admin (placeholder, tidak dipakai langsung)

// ── Nama sheet ───────────────────────────────────────────────
const SHEET = {
  HAKIM    : 'Hakim',
  PESERTA  : 'Peserta',
  PARAMETER: 'Parameter',
  NILAI    : 'Nilai'
};

// ── Inisialisasi spreadsheet & sheet ─────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    initSheetHeaders(sh, name);
  }
  return sh;
}

function initSheetHeaders(sh, name) {
  const headers = {
    [SHEET.HAKIM]:     ['id','nama','pin','cabang','createdAt'],
    [SHEET.PESERTA]:   ['id','cabang','nama','kecamatan','nomor_urut','createdAt'],
    [SHEET.PARAMETER]: ['cabang','params_json','updatedAt'],
    [SHEET.NILAI]:     ['key','hakimId','hakimNama','pesertaId','pesertaNama','pesertaKecamatan','cabang','params_json','total','catatan','buktiName','buktiSize','submittedAt']
  };
  if (headers[name]) {
    sh.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
    sh.getRange(1, 1, 1, headers[name].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

// ── Setup awal (jalankan sekali manual) ──────────────────────
function setup() {
  Object.values(SHEET).forEach(name => getSheet(name));
  logInfo('penilaian', 'Setup selesai! (Tanggal pendaftaran dibaca dari PENDAFTARAN_CONFIG di config.gs — satu sumber, tidak perlu di-seed lagi di sini.)');
}

// ── CONFIG ────────────────────────────────────────────────────
// Tanggal buka/tutup pendaftaran & cutoff usia SEKARANG baca langsung
// dari PENDAFTARAN_CONFIG (didefinisikan sekali di config.gs — satu
// project Apps Script berbagi scope global yang sama, jadi bisa
// dipakai langsung tanpa perlu sheet "Config" terpisah di sini lagi).

// ════════════════════════════════════════════════════════════════
//  CATATAN: doGet / doPost / router action sudah dipindahkan ke
//  api.gs (lihat switch di function doGet(e) pada file itu).
//  Semua fungsi di bawah (saveHakim, getHakim, savePeserta,
//  getPeserta, saveNilai, getNilai, getPeringkat, dst.) dipanggil
//  langsung dari sana — tidak perlu doGet/doPost sendiri di file
//  ini lagi.
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  HAKIM FUNCTIONS
// ════════════════════════════════════════════════════════════════
function saveHakim(data) {
  if (!data.nama || !data.pin || !data.cabang) throw new Error('Data hakim tidak lengkap');

  const sh = getSheet(SHEET.HAKIM);
  const rows = sh.getDataRange().getValues();

  // Cek duplikat PIN
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) === String(data.pin)) {
      return { success: false, error: 'PIN sudah digunakan hakim lain' };
    }
  }

  const id = 'h_' + Date.now();
  sh.appendRow([
    id,
    data.nama,
    data.pin,
    Array.isArray(data.cabang) ? data.cabang.join('|') : data.cabang,
    new Date().toISOString()
  ]);
  return { success: true, id };
}

function getHakim() {
  const sh = getSheet(SHEET.HAKIM);
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return { success: true, data: [] };

  const hakim = rows.slice(1)
    .filter(r => r[0]) // skip empty rows
    .map(r => ({
      id       : r[0],
      nama     : r[1],
      pin      : r[2],
      cabang   : String(r[3]).split('|').filter(Boolean),
      createdAt: r[4]
    }));
  return { success: true, data: hakim };
}

function deleteHakim(id) {
  if (!id) throw new Error('ID hakim tidak ditemukan');
  const sh = getSheet(SHEET.HAKIM);
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === id) { sh.deleteRow(i + 1); }
  }
  return { success: true };
}

function updateHakim(id, data) {
  if (!id) throw new Error('ID hakim tidak ditemukan');
  const sh   = getSheet(SHEET.HAKIM);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== id) continue;
    if (data.nama)   sh.getRange(i+1, 2).setValue(data.nama);
    if (data.pin) {
      // Cek duplikat PIN (kecuali pin milik hakim yang sama)
      for (let j = 1; j < rows.length; j++) {
        if (j !== i && String(rows[j][2]) === String(data.pin)) {
          return { success: false, error: 'PIN sudah digunakan hakim lain' };
        }
      }
      sh.getRange(i+1, 3).setValue(data.pin);
    }
    if (data.cabang) {
      const cabangStr = Array.isArray(data.cabang) ? data.cabang.join('|') : data.cabang;
      sh.getRange(i+1, 4).setValue(cabangStr);
    }
    return { success: true };
  }
  return { success: false, error: 'Hakim tidak ditemukan' };
}

// ── getHakimPublic_ — public (tanpa token, tanpa PIN) ────────
// Dipanggil oleh penilaian.html saat restore sesi dari localStorage
// untuk menyegarkan data cabang jika admin sudah memperbarui hakim.
function getHakimPublic_(id) {
  if (!id) return { success: false, error: 'ID hakim tidak diisi' };
  const sh   = getSheet(SHEET.HAKIM);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(id)) continue;
    const cabs = String(rows[i][3] || '').split('|').filter(Boolean);
    // Kembalikan data hakim TANPA pin (aman untuk akses publik)
    return {
      success : true,
      hakim   : { id: rows[i][0], nama: rows[i][1], cabang: cabs, createdAt: rows[i][4] }
    };
  }
  return { success: false, error: 'Hakim tidak ditemukan' };
}

function verifyHakimPin(pin) {
  if (!pin) return { success: false, hakim: null };
  const res = getHakim();
  if (!res.success) return { success: false };
  const hakim = res.data.find(h => String(h.pin) === String(pin));
  if (!hakim) return { success: false, hakim: null };
  // Jangan kembalikan PIN ke client
  const { pin: _p, ...safeHakim } = hakim;
  return { success: true, hakim: safeHakim };
}

// ════════════════════════════════════════════════════════════════
//  PARAMETER FUNCTIONS
// ════════════════════════════════════════════════════════════════
function saveParam(cabang, params) {
  if (!cabang || !params) throw new Error('Data parameter tidak lengkap');

  const sh = getSheet(SHEET.PARAMETER);
  const rows = sh.getDataRange().getValues();
  const json = JSON.stringify(params);
  const now  = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === cabang) {
      sh.getRange(i + 1, 2, 1, 2).setValues([[json, now]]);
      return { success: true };
    }
  }
  sh.appendRow([cabang, json, now]);
  return { success: true };
}

function getParam(cabang) {
  const sh = getSheet(SHEET.PARAMETER);
  const rows = sh.getDataRange().getValues();
  const result = {};

  rows.slice(1).filter(r => r[0]).forEach(r => {
    if (cabang && r[0] !== cabang) return;
    try { result[r[0]] = JSON.parse(r[1]); } catch { result[r[0]] = []; }
  });

  if (cabang) return { success: true, data: result[cabang] || [] };
  return { success: true, data: result };
}

// ════════════════════════════════════════════════════════════════
//  PESERTA FUNCTIONS
// ════════════════════════════════════════════════════════════════
function savePeserta(cabang, peserta) {
  if (!cabang || !peserta?.nama) throw new Error('Data peserta tidak lengkap');

  const sh = getSheet(SHEET.PESERTA);
  // Hitung nomor urut
  const rows = sh.getDataRange().getValues();
  const cabangRows = rows.slice(1).filter(r => r[1] === cabang);
  const nomorUrut = cabangRows.length + 1;

  const id = peserta.id || (cabang + '_' + Date.now());
  sh.appendRow([
    id, cabang,
    peserta.nama,
    peserta.kecamatan || '-',
    nomorUrut,
    new Date().toISOString()
  ]);
  return { success: true, id, nomor_urut: nomorUrut };
}

function getPeserta(cabang, adminView) {
  // ── Ambil langsung dari SHEET_PENDAFTAR.
  // adminView=true  → admin panel: semua peserta KECUALI Ditolak/Nonaktif
  // adminView=false → scoring hakim: hanya status 'Terverifikasi'
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!sh) return { success: false, error: 'Sheet pendaftar tidak ditemukan' };

  var rows    = sh.getDataRange().getValues();
  var result  = {};
  var counter = {};

  rows.slice(1).forEach(function(r) {
    var rowStatus  = String(r[COL.STATUS_VERIFIKASI] || '').trim();
    var rowCabang  = String(r[COL.CABANG_LOMBA]      || '').trim();
    var rowNomor   = String(r[COL.NOMOR_PENDAFTARAN] || '').trim();
    var rowKec     = String(r[COL.KECAMATAN]         || '').trim();
    var rowNama    = String(r[COL.NAMA_LENGKAP]      || '').trim();
    var rowTipe    = String(r[COL.TIPE_LOMBA]        || '').trim().toLowerCase();
    var rowNamaTim = String(r[COL.NAMA_TIM]          || '').trim();

    // Filter status
    if (!adminView && rowStatus !== 'Terverifikasi') return;
    if (rowStatus === 'Ditolak' || rowStatus === 'Nonaktif') return;

    if (!rowNomor || !rowCabang) return;
    if (cabang && rowCabang !== cabang) return;

    if (!result[rowCabang]) { result[rowCabang] = []; counter[rowCabang] = 0; }
    counter[rowCabang]++;

    var displayNama = (rowTipe === 'tim' && rowNamaTim) ? rowNamaTim : rowNama;

    result[rowCabang].push({
      id               : rowNomor,
      cabang           : rowCabang,
      nama             : displayNama,
      kecamatan        : rowKec,
      nomor_urut       : counter[rowCabang],
      nomor_pendaftaran: rowNomor,
      tipe_lomba       : rowTipe,
      status           : rowStatus
    });
  });

  if (cabang) return { success: true, data: result[cabang] || [] };
  return { success: true, data: result };
}

function deletePeserta(id) {
  if (!id) throw new Error('ID peserta tidak ditemukan');
  const sh = getSheet(SHEET.PESERTA);
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === id) { sh.deleteRow(i + 1); }
  }
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  NILAI FUNCTIONS
// ════════════════════════════════════════════════════════════════
function saveNilai(key, data) {
  if (!key || !data) throw new Error('Data nilai tidak lengkap');

  const sh = getSheet(SHEET.NILAI);
  const rows = sh.getDataRange().getValues();

  // Cek apakah sudah ada — TIDAK BOLEH OVERWRITE setelah submit
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) {
      return { success: false, error: 'Nilai sudah disubmit dan tidak dapat diubah' };
    }
  }

  sh.appendRow([
    key,
    data.hakimId,
    data.hakimNama,
    data.pesertaId,
    data.pesertaNama,
    data.pesertaKecamatan,
    data.cabang,
    JSON.stringify(data.params || []),
    Number(data.total).toFixed(4),
    data.catatan || '',
    data.bukti?.name || '',
    data.bukti?.size || '',
    data.submittedAt || new Date().toISOString()
  ]);
  return { success: true };
}

function getNilai(cabang, hakimId) {
  const sh = getSheet(SHEET.NILAI);
  const rows = sh.getDataRange().getValues();
  const result = {};

  rows.slice(1).filter(r => r[0]).forEach(r => {
    const rowCabang  = r[6];
    const rowHakimId = r[1];
    if (cabang  && rowCabang  !== cabang)  return;
    if (hakimId && rowHakimId !== hakimId) return;

    let params = [];
    try { params = JSON.parse(r[7]); } catch {}

    result[r[0]] = {
      hakimId         : r[1],
      hakimNama       : r[2],
      pesertaId       : r[3],
      pesertaNama     : r[4],
      pesertaKecamatan: r[5],
      cabang          : r[6],
      params,
      total           : parseFloat(r[8]) || 0,
      catatan         : r[9],
      bukti           : r[10] ? { name: r[10], size: r[11] } : null,
      submittedAt     : r[12]
    };
  });
  return { success: true, data: result };
}

// ════════════════════════════════════════════════════════════════
//  PERINGKAT (agregasi nilai semua hakim per peserta per cabang)
// ════════════════════════════════════════════════════════════════
function getPeringkat(cabang) {
  if (!cabang) throw new Error('Cabang wajib diisi');

  const pesertaRes = getPeserta(cabang);
  const nilaiRes   = getNilai(cabang, null);

  if (!pesertaRes.success) return pesertaRes;
  const pesertaList = pesertaRes.data;
  const nilaiMap    = nilaiRes.data;

  const result = pesertaList.map(p => {
    // Kumpulkan semua nilai dari semua hakim untuk peserta ini
    const hakimScores = Object.values(nilaiMap).filter(n => n.pesertaId === p.id);
    const avgTotal = hakimScores.length
      ? hakimScores.reduce((s, n) => s + n.total, 0) / hakimScores.length
      : null;

    return {
      ...p,
      avgTotal,
      hakimCount : hakimScores.length,
      hakimScores: hakimScores.map(hs => ({
        hakimNama : hs.hakimNama,
        params    : hs.params,
        total     : hs.total,
        catatan   : hs.catatan,
        submittedAt: hs.submittedAt
      }))
    };
  });

  // Urutkan: yang sudah dinilai dulu (desc), lalu yang belum
  result.sort((a, b) => {
    if (a.avgTotal === null && b.avgTotal === null) return 0;
    if (a.avgTotal === null) return 1;
    if (b.avgTotal === null) return -1;
    return b.avgTotal - a.avgTotal;
  });

  return { success: true, data: result, cabang };
}

// ════════════════════════════════════════════════════════════════
//  STATS (Sistem Penilaian)
//  NOTE: dipanggil lewat action 'getPenilaianStats' — BUKAN 'getStats'.
//  Nama 'getStats' sudah dipakai untuk statistik pendaftaran di api.gs
//  (apiGetStats_), jadi sengaja dibedakan agar tidak rebutan action.
// ════════════════════════════════════════════════════════════════
function getPenilaianStats_() {
  const hakimRes   = getHakim();
  const pesertaSh  = getSheet(SHEET.PESERTA);
  const nilaiSh    = getSheet(SHEET.NILAI);

  const totalHakim  = hakimRes.success ? hakimRes.data.length : 0;
  const totalPeserta = Math.max(0, pesertaSh.getLastRow() - 1);
  const totalNilai   = Math.max(0, nilaiSh.getLastRow() - 1);

  const now   = new Date();
  const buka  = new Date(PENDAFTARAN_CONFIG.BUKA);
  const tutup = new Date(PENDAFTARAN_CONFIG.TUTUP);
  const isOpen = now >= buka && now < tutup;
  const status = now < buka ? 'belum_buka' : isOpen ? 'buka' : 'tutup';

  return {
    success            : true,
    totalHakim,
    totalPeserta,
    totalNilaiSubmit   : totalNilai,
    isOpen,
    status,
    buka               : PENDAFTARAN_CONFIG.BUKA,
    tutup              : PENDAFTARAN_CONFIG.TUTUP
  };
}

// ════════════════════════════════════════════════════════════════
//  TRIGGER OTOMATIS — kirim rangkuman nilai via email (opsional)
//  Jadwalkan via Triggers → Time-driven → setiap hari pukul 20:00
// ════════════════════════════════════════════════════════════════
function dailySummaryEmail() {
  const adminEmail = Session.getActiveUser().getEmail();
  const stats = getPenilaianStats_();

  const subject = `[MTQ 2026] Ringkasan Penilaian Harian — ${Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd MMM yyyy')}`;
  const body = `
Assalamu'alaikum,

Berikut ringkasan penilaian MTQ 2026 per hari ini:

• Total Dewan Hakim   : ${stats.totalHakim}
• Total Peserta       : ${stats.totalPeserta}
• Nilai Tersubmit     : ${stats.totalNilaiSubmit}

Untuk detail lengkap, silakan buka spreadsheet:
https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}

Salam,
Sistem Penilaian MTQ 2026
  `.trim();

  MailApp.sendEmail(adminEmail, subject, body);
  logInfo('penilaian', 'Email ringkasan terkirim ke ' + adminEmail);
}

// ════════════════════════════════════════════════════════════════
//  UTILITAS
// ════════════════════════════════════════════════════════════════

/**
 * Jalankan fungsi ini sekali dari editor untuk membuat semua sheet
 * dan memverifikasi koneksi spreadsheet.
 */
function testSetup() {
  setup();
  const stats = getPenilaianStats_();
  logInfo('penilaian', 'Stats: ' + JSON.stringify(stats));
  logInfo('penilaian', 'Test selesai — semua sheet berhasil dibuat!');
}

/**
 * Reset semua data nilai (hati-hati! tidak bisa di-undo)
 * Jalankan manual dari editor jika diperlukan reset data testing.
 */
function resetNilai_DANGER() {
  const sh = getSheet(SHEET.NILAI);
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.deleteRows(2, lastRow - 1);
  logWarn('penilaian', 'Semua data nilai telah dihapus! (resetNilai_DANGER)');
}