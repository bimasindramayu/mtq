// ============================================================
//  MTQ 2026 — apps-script/maqra.gs
//  Fitur Pengambilan Maqra (Peserta & Admin)
//  Tambahkan file ini ke project Apps Script Anda
//  FIX #16: semua akses spreadsheet lewat ID diganti getSS_()
//  (cache per eksekusi, definisi di helper.gs) — lihat catatan
//  lengkap di helper.gs / api.gs.
// ============================================================

// ── Sheet & Column constants ──────────────────────────────────
var SHEET_MAQRA        = 'MAQRA';          // Daftar maqra per cabang
var SHEET_MAQRA_CONFIG = 'MAQRA_CONFIG';   // Konfigurasi buka/tutup per cabang
var SHEET_MAQRA_RESULT = 'MAQRA_RESULT';   // Hasil pengambilan maqra peserta

// FIX #30: Putra & Putri dari cabang yang sama ("Tilawah Anak-anak Putra"
// vs "Tilawah Anak-anak Putri") tetap 2 baris CABANG_LOMBA terpisah di
// sheet PENDAFTAR/CONFIG (perlu, karena penilaian & kuota tetap dipisah
// per gender) — TAPI untuk keperluan MAQRA keduanya "masih 1 cabang" yang
// sama, jadi seharusnya berbagi SATU pool maqra & SATU status
// tersedia/diambil, bukan admin harus input & kelola dua kali.
// getMaqraKelompok_() melepas akhiran " Putra"/" Putri" untuk dipakai
// SEBAGAI KUNCI PENCOCOKAN di semua fungsi MAQRA/MAQRA_CONFIG di bawah —
// data yang SUDAH tersimpan dengan cabang_lomba lama (masih ada " Putra"/
// " Putri"-nya) tetap otomatis ketemu/tercocokkan lewat perbandingan ini,
// TIDAK perlu migrasi/tulis-ulang data lama secara manual. Baris yang
// BARU disimpan lewat apiSaveMaqraAdmin_ akan memakai nama bersih (tanpa
// gender) secara konsisten ke depannya.
function getMaqraKelompok_(cabangLomba) {
  return String(cabangLomba || '').trim().replace(/\s+(Putra|Putri)$/i, '').trim();
}

// Headers
var MAQRA_HEADERS = [
  'id_maqra', 'cabang_lomba', 'maqra_teks', 'maqra_detail',
  'nomor_urut', 'sudah_diambil', 'diambil_oleh', 'timestamp_ambil'
];
var MAQRA_CONFIG_HEADERS = [
  'cabang_lomba', 'buka', 'tutup', 'override', 'keterangan'
];
var MAQRA_RESULT_HEADERS = [
  'timestamp', 'nomor_pendaftaran', 'nik', 'nama_lengkap',
  'kecamatan', 'cabang_lomba', 'id_maqra', 'maqra_teks',
  'maqra_detail', 'nomor_maqra'
];

// MAQRA column indices (0-based)
var MCOL = {
  ID_MAQRA      : 0,
  CABANG_LOMBA  : 1,
  MAQRA_TEKS    : 2,
  MAQRA_DETAIL  : 3,
  NOMOR_URUT    : 4,
  SUDAH_DIAMBIL : 5,
  DIAMBIL_OLEH  : 6,
  TIMESTAMP     : 7,
};

// ── Route additions (tambahkan ke switch di doGet) ───────────
// case 'getMaqraStatus'  : result = apiGetMaqraStatus_(e.parameter);  break;
// case 'getMaqraAdmin'   : result = apiGetMaqraAdmin_(e.parameter);   break;
//
// Tambahkan ke doPost:
// if (body.action === 'ambilMaqra')   return apiAmbilMaqra_(body);
// if (body.action === 'ambilMaqraAdmin') return apiAmbilMaqraAdmin_(body);  // NEW — tab "Ambil Maqra Peserta"
// if (body.action === 'saveMaqra')    return apiSaveMaqraAdmin_(body);
// if (body.action === 'deleteMaqra')  return apiDeleteMaqraAdmin_(body);
// if (body.action === 'saveMaqraConfig') return apiSaveMaqraConfig_(body);

// ────────────────────────────────────────────────────────────
//  PUBLIC: getMaqraStatus  (peserta)
//  Cek apakah buka, sudah diambil, dan list maqra tersedia
// ────────────────────────────────────────────────────────────
function apiGetMaqraStatus_(params) {
  var nomor  = String(params.nomor  || '').trim();
  var cabang = String(params.cabang || '').trim();

  if (!nomor || !cabang) {
    return { success:false, message:'Parameter nomor dan cabang wajib diisi' };
  }

  var ss = getSS_();
  initMaqraSheets_(ss);

  // 1. Cek konfigurasi buka/tutup
  var cfgStatus = getMaqraConfigStatus_(ss, cabang);
  if (!cfgStatus.isOpen) {
    var jadwalBuka = cfgStatus.buka
      ? new Date(cfgStatus.buka).toLocaleString('id-ID', {
          day:'numeric', month:'long', year:'numeric',
          hour:'2-digit', minute:'2-digit'
        })
      : null;
    return {
      success   : true,
      isOpen    : false,
      jadwalBuka: jadwalBuka,
      message   : 'Pengambilan maqra belum dibuka'
    };
  }

  // 2. Cek apakah nomor sudah punya maqra
  var existing = findMaqraResult_(ss, nomor);
  if (existing) {
    return {
      success    : true,
      isOpen     : true,
      sudahAmbil : true,
      maqra      : existing
    };
  }

  // 3. Ambil daftar maqra tersedia untuk cabang
  var list = getAvailableMaqraList_(ss, cabang);
  return {
    success    : true,
    isOpen     : true,
    sudahAmbil : false,
    list       : list,
    totalSisa  : list.length
  };
}

// ────────────────────────────────────────────────────────────
//  PUBLIC (POST): ambilMaqra
//  Locking atomic — ambil maqra secara acak
// ────────────────────────────────────────────────────────────
function apiAmbilMaqra_(body) {
  var nomor  = String(body.nomor_pendaftaran || '').trim();
  var cabang = String(body.cabang_lomba      || '').trim();
  var nik    = String(body.nik               || '').trim();

  if (!nomor || !cabang || !nik) {
    return { success:false, message:'Data tidak lengkap' };
  }

  var ss = getSS_();

  // rev 12 — PERSIS pola FIX #36 yang sudah dipakai jalur admin
  // (apiAmbilMaqraAdmin_): semua yang TIDAK menyentuh pool MAQRA/MAQRA_RESULT
  // dikerjakan DI LUAR lock. Dulu SEMUANYA (buka-tutup sheet, cek jadwal,
  // baca SELURUH sheet PENDAFTAR utk mencari nama peserta, dst) berjalan di
  // dalam LockService yang dipakai bersama SELURUH project, dengan
  // waitLock cuma 10 detik. Begitu >10 peserta menekan "Ambil Maqra"
  // nyaris bersamaan, peserta ke-6..10 dst menunggu > 10 dtk → "Server
  // sedang sibuk". Sekarang lock hanya membungkus: cek idempoten + pilih
  // acak + tandai + simpan hasil.
  initMaqraSheets_(ss);

  // 1. Cek buka/tutup (baca saja — tidak perlu lock)
  var cfgStatus = getMaqraConfigStatus_(ss, cabang);
  if (!cfgStatus.isOpen) {
    return { success:false, message:'Pengambilan maqra belum/sudah ditutup.' };
  }

  // 2. Nama & kecamatan dari PENDAFTAR (baca saja — di luar lock). Hanya
  //    membaca kolom yang dibutuhkan (tanpa ANGGOTA_JSON dst).
  var namaLengkap = '', kecamatan = '';
  try {
    var pendSheet = ss.getSheetByName(SHEET_PENDAFTAR);
    if (pendSheet && pendSheet.getLastRow() > 1) {
      var c0    = COL.NOMOR_PENDAFTARAN;
      var width = Math.max(COL.NAMA_LENGKAP, COL.KECAMATAN) - c0 + 1;
      var rows  = pendSheet.getRange(2, c0 + 1, pendSheet.getLastRow() - 1, width).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === nomor) {
          namaLengkap = rows[i][COL.NAMA_LENGKAP - c0] || '';
          kecamatan   = rows[i][COL.KECAMATAN    - c0] || '';
          break;
        }
      }
    }
  } catch (e2) {}

  // 3. Critical section. waitLock 10 dtk → 30 dtk (sama dgn jalur admin &
  //    pendaftaran) + flag busy:true supaya frontend mencoba lagi otomatis.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { success:false, busy:true, message:'Server sedang sibuk. Mencoba lagi otomatis…' };
  }

  try {
    // 3a. Idempoten — nomor sudah dapat maqra? (harus di dalam lock)
    var existing = findMaqraResult_(ss, nomor);
    if (existing) {
      return { success:true, sudahAmbil:true, maqra:existing,
               message:'Anda sudah mengambil maqra sebelumnya.' };
    }

    // 3b. Pilih acak + tandai sudah diambil (1 baca + 1 tulis)
    var chosen = takeRandomMaqra_(ss, cabang, nomor);
    if (!chosen) {
      return { success:false, message:'Semua maqra untuk cabang ini sudah diambil. Hubungi panitia.' };
    }

    // 3c. Simpan hasil ke sheet MAQRA_RESULT
    var resultSheet = getOrCreateSheet_(ss, SHEET_MAQRA_RESULT, MAQRA_RESULT_HEADERS);
    var ts = new Date().toLocaleString('id-ID');
    resultSheet.appendRow([
      ts, nomor, nik, namaLengkap, kecamatan, cabang,
      chosen.id_maqra, chosen.maqra_teks, chosen.maqra_detail || '',
      chosen.nomor_urut || chosen.id_maqra
    ]);

    writeLog_(ss, 'MAQRA', nomor+' → '+chosen.maqra_teks, 'ok');

    return {
      success : true,
      maqra   : {
        id_maqra    : chosen.id_maqra,
        maqra_teks  : chosen.maqra_teks,
        maqra_detail: chosen.maqra_detail || '',
        nomor_maqra : String(chosen.nomor_urut || chosen.id_maqra),
        surah       : chosen.maqra_detail || ''
      }
    };

  } finally {
    lock.releaseLock();
  }
}

// ────────────────────────────────────────────────────────────
//  ADMIN (POST): ambilMaqraAdmin
//  Admin mengambilkan maqra ATAS NAMA peserta — dipakai tab
//  "🎯 Ambil Maqra Peserta" di doyourmagic.html.
//
//  Beda dengan apiAmbilMaqra_ (peserta, di atas):
//   • TIDAK memanggil/mengecek getMaqraConfigStatus_ (jadwal buka/
//     tutup) — admin boleh mengambilkan maqra kapan pun, termasuk
//     saat jadwal di tab ⚙️ Jadwal Pengambilan sedang DITUTUP. Ini
//     SATU-SATUNYA perbedaan aturan; semua penjagaan lain (anti-
//     duplikat, pilih acak, kunci hasil) berlaku SAMA PERSIS seperti
//     jalur peserta.
//   • Butuh token admin (isTokenValid_), bukan nik dari body — data
//     peserta (nik/nama/kecamatan/cabang/status_verifikasi) dibaca
//     LANGSUNG dari sheet PENDAFTAR di server berdasarkan
//     nomor_pendaftaran, supaya tidak bisa "dipalsukan" dari klien
//     (pola sama dengan penjagaan umur di apiEditPesertaGet_/api.gs —
//     FE bisa saja dilewati/dimanipulasi, jadi penjagaan sebenarnya
//     harus di server).
//   • Mewajibkan status_verifikasi === 'Terverifikasi' — sama seperti
//     gerbang di FE peserta (cek-maqra.js hanya menampilkan tombol
//     "Ambil Maqra" utk status ini, lihat goToMaqraStep()), tapi di
//     sini DITEGAKKAN ULANG di server, karena apiAmbilMaqra_ sendiri
//     TIDAK pernah mengecek status_verifikasi (hanya mengandalkan
//     gerbang FE) — jalur admin ini beda pintu masuk, jadi perlu
//     penjagaannya sendiri.
//
//  Tetap SAMA dengan jalur peserta (lihat apiAmbilMaqra_):
//   • LockService — cegah race condition kalau 2 admin/tab browser
//     memproses peserta yang sama nyaris bersamaan.
//   • Idempoten — kalau peserta SUDAH punya maqra (findMaqraResult_),
//     hasil yang SUDAH ADA dikembalikan apa adanya, TIDAK digambar
//     ulang. Maqra yang sudah diperoleh tidak bisa diubah — admin
//     sekalipun tidak bisa "menarik ulang" lewat endpoint ini.
//
//  FIX #36: diperkeras utk skenario BANYAK admin (bisa >4 orang)
//  mengambilkan maqra nyaris bersamaan. PENTING: lock+idempoten di
//  atas SUDAH cukup mencegah tabrakan data sungguhan sejak awal (tidak
//  mungkin 1 maqra kembar ke 2 peserta, atau 1 peserta dapat 2 maqra)
//  — yang diperbaiki di sini murni SOAL THROUGHPUT/PENGALAMAN admin
//  saat lock itu ramai diantre, meniru pola yang SAMA dgn apiRegister_
//  (lihat komentar "FIX CRITICAL: race condition" di atasnya, api.gs):
//   1. Pencarian peserta di PENDAFTAR (scan O(n), bisa ratusan baris)
//      dipindah KE LUAR lock — bagian ini tidak menyentuh data yang
//      dilindungi lock (pool MAQRA/MAQRA_RESULT), jadi tidak perlu
//      ikut memegang lock. Ini memperpendek durasi TIAP admin
//      memegang lock → antrean admin lain cair lebih cepat. Bonus:
//      permintaan yang memang tidak valid (peserta tak ada/belum
//      Terverifikasi) gagal LEBIH CEPAT juga, karena tidak perlu ikut
//      antre lock sama sekali.
//   2. waitLock dinaikkan 10 dtk → 30 dtk (SAMA persis dgn lock
//      pendaftaran di apiRegister_/api.gs) — jauh di bawah batas
//      eksekusi Apps Script (6 menit), tapi cukup menampung antrean
//      lebih panjang sebelum menyerah duluan.
//   3. Respons gagal krn lock (timeout menunggu giliran) kini
//      menyertakan flag `busy:true` (bukan cuma pesan teks) — dibaca
//      maqraAmbilCallAmbilAdmin_()/admin-maqra.js utk otomatis mencoba
//      lagi sekali lagi SEBELUM menampilkan error ke admin, supaya
//      tabrakan sesaat antar-admin pulih sendiri ("smooth") tanpa
//      admin perlu sadar ada error lalu klik ulang manual.
// ────────────────────────────────────────────────────────────
function apiAmbilMaqraAdmin_(body) {
  if (!isTokenValid_(body.token)) return { success:false, message:'Sesi tidak valid' };

  var nomor = String(body.nomor_pendaftaran || '').trim();
  if (!nomor) return { success:false, message:'nomor_pendaftaran wajib diisi' };

  var ss = getSS_();

  // 1. Cari & validasi data peserta LANGSUNG dari sheet PENDAFTAR
  //    (server-side, bukan dikirim dari body FE — supaya tidak bisa
  //    "dipalsukan" dari klien, lihat catatan besar di atas fungsi
  //    ini). FIX #36: SENGAJA DI LUAR lock — lihat penjelasan poin 1
  //    di atas.
  var pendSheet = ss.getSheetByName(SHEET_PENDAFTAR);
  if (!pendSheet || pendSheet.getLastRow() <= 1) {
    return { success:false, message:'Data peserta tidak ditemukan' };
  }
  var pendRows = pendSheet.getRange(2,1,pendSheet.getLastRow()-1,PENDAFTAR_HEADERS.length).getValues();
  var peserta = null;
  for (var i = 0; i < pendRows.length; i++) {
    if (String(pendRows[i][COL.NOMOR_PENDAFTARAN]).trim() === nomor) { peserta = pendRows[i]; break; }
  }
  if (!peserta) return { success:false, message:'Peserta dengan nomor '+nomor+' tidak ditemukan' };

  var cabang      = String(peserta[COL.CABANG_LOMBA]      || '').trim();
  var nik         = String(peserta[COL.NIK]               || '').trim();
  var nama        = String(peserta[COL.NAMA_LENGKAP]      || '').trim();
  var kecamatan   = String(peserta[COL.KECAMATAN]         || '').trim();
  var statusVerif = String(peserta[COL.STATUS_VERIFIKASI] || '').trim();

  if (!cabang) return { success:false, message:'Peserta belum memiliki cabang lomba' };
  if (statusVerif !== 'Terverifikasi') {
    return { success:false, message:'Peserta belum berstatus Terverifikasi (status saat ini: '+(statusVerif||'Menunggu')+') — hanya peserta Terverifikasi yang bisa diambilkan maqra.' };
  }

  // 2. Critical section — HANYA bagian yang benar2 menyentuh pool
  //    MAQRA/MAQRA_RESULT bersama yang perlu diproteksi lock (idempoten
  //    + pilih acak + kunci hasil). FIX #36: waitLock 30 dtk + flag
  //    busy:true, lihat penjelasan poin 2 & 3 di atas.
  initMaqraSheets_(ss);   // rev 12: di luar lock
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch(e) {
    return {
      success: false,
      busy   : true,
      message: 'Server sedang sibuk (banyak admin mengambilkan maqra bersamaan). Mencoba lagi otomatis…'
    };
  }

  try {
    // 3. Idempoten — sudah pernah diambilkan sebelumnya (termasuk oleh
    //    admin LAIN yang baru saja selesai memproses peserta yang sama
    //    persis sesaat sebelum lock ini didapat)? Kembalikan hasil yang
    //    sudah ada apa adanya, JANGAN digambar ulang.
    var existing = findMaqraResult_(ss, nomor);
    if (existing) {
      return {
        success   : true,
        sudahAmbil: true,
        maqra     : existing,
        peserta   : { nomor_pendaftaran:nomor, nama_lengkap:nama, kecamatan:kecamatan, cabang_lomba:cabang },
        message   : 'Peserta ini sudah pernah mengambil maqra sebelumnya.'
      };
    }

    // 4. SENGAJA TIDAK memanggil getMaqraConfigStatus_ di sini — inilah
    //    yang membedakan dari apiAmbilMaqra_: admin boleh mengambilkan
    //    maqra walau jadwal pengambilan sedang ditutup/belum dibuka.

    // 5. Ambil daftar maqra tersedia untuk cabang peserta ini
    // rev 12: 1 baca + 1 tulis (lihat takeRandomMaqra_) — dulu 2 baca penuh + 3 tulis
    // 5-7. Ambil daftar tersedia untuk cabang peserta, pilih ACAK (adil, tidak
    //      dipilih manual), tandai sudah diambil — sama seperti jalur peserta.
    var chosen = takeRandomMaqra_(ss, cabang, nomor);
    if (!chosen) {
      return { success:false, message:'Semua maqra untuk cabang "'+cabang+'" sudah diambil. Tambahkan maqra baru di tab Daftar Maqra terlebih dahulu.' };
    }

    var resultSheet = getOrCreateSheet_(ss, SHEET_MAQRA_RESULT, MAQRA_RESULT_HEADERS);
    var ts = new Date().toLocaleString('id-ID');
    resultSheet.appendRow([
      ts, nomor, nik, nama, kecamatan, cabang,
      chosen.id_maqra, chosen.maqra_teks, chosen.maqra_detail || '',
      chosen.nomor_urut || chosen.id_maqra
    ]);

    writeLog_(ss, 'MAQRA_ADMIN', nomor+' ('+nama+') → '+chosen.maqra_teks+' [diambilkan oleh admin]', 'ok');

    return {
      success : true,
      maqra   : {
        id_maqra    : chosen.id_maqra,
        maqra_teks  : chosen.maqra_teks,
        maqra_detail: chosen.maqra_detail || '',
        nomor_maqra : String(chosen.nomor_urut || chosen.id_maqra),
        surah       : chosen.maqra_detail || ''
      },
      peserta : { nomor_pendaftaran:nomor, nama_lengkap:nama, kecamatan:kecamatan, cabang_lomba:cabang }
    };

  } finally {
    lock.releaseLock();
  }
}

// ────────────────────────────────────────────────────────────
//  ADMIN: getMaqraAdmin
//  Ambil semua data maqra + config + results
// ────────────────────────────────────────────────────────────
function apiGetMaqraAdmin_(params) {
  if (!isTokenValid_(params.token)) {
    return { success:false, message:'Sesi tidak valid' };
  }
  var ss = getSS_();
  initMaqraSheets_(ss);

  var maqraSheet  = ss.getSheetByName(SHEET_MAQRA);
  var cfgSheet    = ss.getSheetByName(SHEET_MAQRA_CONFIG);
  var resultSheet = ss.getSheetByName(SHEET_MAQRA_RESULT);

  // Parse maqra list
  var maqraData = [];
  if (maqraSheet && maqraSheet.getLastRow() > 1) {
    var rows = maqraSheet.getRange(2,1,maqraSheet.getLastRow()-1,MAQRA_HEADERS.length).getValues();
    rows.forEach(function(r) {
      maqraData.push({
        id_maqra    : r[MCOL.ID_MAQRA]     || '',
        cabang_lomba: r[MCOL.CABANG_LOMBA] || '',
        maqra_teks  : r[MCOL.MAQRA_TEKS]  || '',
        maqra_detail: r[MCOL.MAQRA_DETAIL] || '',
        nomor_urut  : r[MCOL.NOMOR_URUT]   || '',
        sudah_diambil: String(r[MCOL.SUDAH_DIAMBIL]).toLowerCase() === 'true' ||
                       String(r[MCOL.SUDAH_DIAMBIL]).toLowerCase() === 'ya',
        diambil_oleh: r[MCOL.DIAMBIL_OLEH] || '',
        timestamp   : r[MCOL.TIMESTAMP]    || '',
      });
    });
  }

  // Parse config
  var configData = [];
  if (cfgSheet && cfgSheet.getLastRow() > 1) {
    var cfgRows = cfgSheet.getRange(2,1,cfgSheet.getLastRow()-1,MAQRA_CONFIG_HEADERS.length).getValues();
    cfgRows.forEach(function(r) {
      configData.push({
        cabang_lomba: r[0] || '',
        buka        : r[1] ? String(r[1]) : '',
        tutup       : r[2] ? String(r[2]) : '',
        override    : r[3] || '',
        keterangan  : r[4] || '',
      });
    });
  }

  // Parse results
  var results = [];
  if (resultSheet && resultSheet.getLastRow() > 1) {
    var resRows = resultSheet.getRange(2,1,resultSheet.getLastRow()-1,MAQRA_RESULT_HEADERS.length).getValues();
    resRows.forEach(function(r) {
      results.push({
        timestamp          : r[0] || '',
        nomor_pendaftaran  : r[1] || '',
        nik                : r[2] || '',
        nama_lengkap       : r[3] || '',
        kecamatan          : r[4] || '',
        cabang_lomba       : r[5] || '',
        id_maqra           : r[6] || '',
        maqra_teks         : r[7] || '',
        maqra_detail       : r[8] || '',
        nomor_maqra        : r[9] || '',
      });
    });
  }

  return {
    success    : true,
    maqraList  : maqraData,
    config     : configData,
    results    : results,
    stats: {
      total        : maqraData.length,
      sudahDiambil : maqraData.filter(function(m){return m.sudah_diambil;}).length,
      tersedia     : maqraData.filter(function(m){return !m.sudah_diambil;}).length,
    }
  };
}

// ────────────────────────────────────────────────────────────
//  ADMIN (POST): saveMaqra
//  Tambah / update maqra
// ────────────────────────────────────────────────────────────
function apiSaveMaqraAdmin_(body) {
  if (!isTokenValid_(body.token)) return { success:false, message:'Sesi tidak valid' };

  var ss    = getSS_();
  initMaqraSheets_(ss);
  var sheet = ss.getSheetByName(SHEET_MAQRA);

  var items = body.items || [];  // Array of maqra objects to save
  if (!items.length) return { success:false, message:'Data maqra kosong' };

  // FIX #30: cabang_lomba yang dikirim FE sekarang nama kelompok (tanpa
  // gender, lihat admin-maqra.js). Tetap dilepas gender-nya di sini juga
  // (defensif) — kalau ada pemanggil lama yang masih kirim nama ber-gender,
  // hasilnya tetap konsisten dengan baris yang sudah ada.
  if (body.replace && body.cabang_lomba) {
    var cabangTarget = getMaqraKelompok_(body.cabang_lomba);
    if (sheet.getLastRow() > 1) {
      var allRows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_HEADERS.length).getValues();
      // Delete rows for this cabang (bottom-up to keep indices stable)
      for (var i = allRows.length - 1; i >= 0; i--) {
        // FIX #30: cocokkan lewat kelompok — supaya "Ganti Semua" ikut
        // membersihkan baris lama yang masih tersimpan dengan cabang_lomba
        // ber-akhiran " Putra"/" Putri", bukan cuma baris yang persis sama
        // dengan nama kelompok baru.
        if (getMaqraKelompok_(allRows[i][MCOL.CABANG_LOMBA]) !== cabangTarget) continue;
        // Only delete if not yet taken (preserve audit trail)
        var taken = String(allRows[i][MCOL.SUDAH_DIAMBIL]).toLowerCase();
        if (taken !== 'true' && taken !== 'ya') {
          sheet.deleteRow(i + 2);
        }
      }
    }
  }

  // Append new items
  var added = 0;
  items.forEach(function(item) {
    // FIX #30: simpan dengan nama KELOMPOK (tanpa gender) — konsisten ke
    // depan, apa pun yang dikirim klien.
    var cabangBersih = getMaqraKelompok_(item.cabang_lomba);
    var idMaqra = item.id_maqra || (cabangBersih.replace(/\s+/g,'_').toUpperCase() + '_' + String(item.nomor_urut||'').padStart(3,'0'));
    sheet.appendRow([
      idMaqra,
      cabangBersih,
      item.maqra_teks   || '',
      item.maqra_detail || '',
      item.nomor_urut   || '',
      'false', '', ''
    ]);
    added++;
  });

  writeLog_(ss, 'MAQRA_SAVE', 'Tambah '+added+' maqra untuk '+body.cabang_lomba, 'ok');
  return { success:true, added:added };
}

// ────────────────────────────────────────────────────────────
//  ADMIN (POST): deleteMaqra
//  Hapus satu maqra berdasarkan id_maqra
// ────────────────────────────────────────────────────────────
function apiDeleteMaqraAdmin_(body) {
  if (!isTokenValid_(body.token)) return { success:false, message:'Sesi tidak valid' };

  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_MAQRA);
  if (!sheet) return { success:false, message:'Sheet MAQRA tidak ditemukan' };

  var target = String(body.id_maqra || '').trim();
  if (!target) return { success:false, message:'id_maqra wajib diisi' };

  if (sheet.getLastRow() <= 1) return { success:false, message:'Sheet kosong' };

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim() === target) {
      sheet.deleteRow(i + 2);
      return { success:true, id_maqra:target };
    }
  }
  return { success:false, message:'Maqra tidak ditemukan: '+target };
}

// FIX: hapus banyak maqra sekaligus (checklist multi-pilih di
// #maqraCabangGroups) — satu kali baca+tulis sheet untuk semuanya,
// bukan memanggil apiDeleteMaqraAdmin_ berkali-kali dari klien (yang
// artinya satu round-trip Apps Script per item, lambat kalau yang
// dipilih banyak).
function apiDeleteMaqraBulkAdmin_(body) {
  if (!isTokenValid_(body.token)) return { success:false, message:'Sesi tidak valid' };

  var ss    = getSS_();
  var sheet = ss.getSheetByName(SHEET_MAQRA);
  if (!sheet) return { success:false, message:'Sheet MAQRA tidak ditemukan' };

  var ids = Array.isArray(body.id_maqra_list) ? body.id_maqra_list : [];
  ids = ids.map(function(x){ return String(x).trim(); }).filter(function(x){ return x; });
  if (!ids.length) return { success:false, message:'id_maqra_list wajib diisi (array, tidak boleh kosong)' };

  if (sheet.getLastRow() <= 1) return { success:false, message:'Sheet kosong' };

  var idSet = {};
  ids.forEach(function(id){ idSet[id] = true; });

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues();

  // FIX: kumpulkan dulu SEMUA baris yang cocok, baru hapus dari BAWAH
  // ke ATAS (descending). Kalau hapus sambil jalan dari atas, baris di
  // bawahnya ikut bergeser naik dan index yang sudah dihitung jadi
  // salah sasaran — bug klasik hapus banyak baris sekaligus.
  var toDelete = [];
  for (var i = 0; i < rows.length; i++) {
    if (idSet[String(rows[i][0]).trim()]) toDelete.push(i + 2); // +2: 1-based + lewati header
  }
  toDelete.sort(function(a,b){ return b - a; });
  toDelete.forEach(function(rowIdx){ sheet.deleteRow(rowIdx); });

  return { success:true, deleted: toDelete.length, requested: ids.length };
}

// ────────────────────────────────────────────────────────────
//  ADMIN (POST): saveMaqraConfig
//  Simpan konfigurasi buka/tutup pengambilan maqra
// ────────────────────────────────────────────────────────────
function apiSaveMaqraConfig_(body) {
  if (!isTokenValid_(body.token)) return { success:false, message:'Sesi tidak valid' };

  var ss    = getSS_();
  initMaqraSheets_(ss);
  var sheet = ss.getSheetByName(SHEET_MAQRA_CONFIG);

  // FIX #30: kelompok (tanpa gender) — kalau ini pernah dipakai utk
  // config PER-CABANG (bukan 'GLOBAL'), Putra/Putri dari cabang yang
  // sama berbagi satu baris config, bukan dua yang bisa diam-diam beda.
  var cabang   = getMaqraKelompok_(body.cabang_lomba);
  var buka     = String(body.buka   || '').trim();
  var tutup    = String(body.tutup  || '').trim();
  var override = String(body.override || '').trim();   // 'buka' | 'tutup' | ''
  var keterangan = String(body.keterangan || '').trim();

  if (!cabang) return { success:false, message:'cabang_lomba wajib diisi' };

  // Find existing row for this cabang
  var found = false;
  if (sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_CONFIG_HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (getMaqraKelompok_(rows[i][0]) === cabang) {
        // Update existing
        sheet.getRange(i+2, 1, 1, MAQRA_CONFIG_HEADERS.length).setValues([[
          cabang, buka, tutup, override, keterangan
        ]]);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    sheet.appendRow([cabang, buka, tutup, override, keterangan]);
  }

  writeLog_(ss, 'MAQRA_CONFIG', 'Config cabang '+cabang+' buka='+buka+' tutup='+tutup+' override='+override, 'ok');
  return { success:true, cabang_lomba:cabang };
}

// ════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ════════════════════════════════════════════════════════════

function initMaqraSheets_(ss) {
  getOrCreateSheet_(ss, SHEET_MAQRA,        MAQRA_HEADERS);
  getOrCreateSheet_(ss, SHEET_MAQRA_CONFIG, MAQRA_CONFIG_HEADERS);
  getOrCreateSheet_(ss, SHEET_MAQRA_RESULT, MAQRA_RESULT_HEADERS);
}

/**
 * Cek status buka/tutup pengambilan maqra.
 * Prioritas: cari konfigurasi 'GLOBAL' dahulu (satu config untuk semua cabang),
 * jika tidak ada baru cari per-cabang spesifik.
 */
function getMaqraConfigStatus_(ss, cabang) {
  var sheet = ss.getSheetByName(SHEET_MAQRA_CONFIG);
  if (!sheet || sheet.getLastRow() <= 1) {
    return { isOpen:false, message:'Konfigurasi maqra belum diisi oleh admin.' };
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow()-1, MAQRA_CONFIG_HEADERS.length).getValues();
  // FIX #30: kelompok (tanpa gender), bukan string cabang_lomba mentah —
  // supaya config lama yang masih tersimpan sebagai "... Putra"/"... Putri"
  // tetap cocok dicari lewat nama kelompoknya.
  var cabangTarget = getMaqraKelompok_(cabang);

  // Coba urutan: GLOBAL dulu, lalu spesifik cabang
  var searchOrder = ['GLOBAL', cabangTarget];

  for (var s = 0; s < searchOrder.length; s++) {
    var key = searchOrder[s];
    for (var i = 0; i < rows.length; i++) {
      // getMaqraKelompok_('GLOBAL') === 'GLOBAL' (tidak diakhiri Putra/Putri,
      // jadi tidak berubah) — perbandingan ini aman dipakai utk kedua key.
      if (getMaqraKelompok_(rows[i][0]) !== key) continue;

      var buka     = rows[i][1] ? String(rows[i][1]) : null;
      var tutup    = rows[i][2] ? String(rows[i][2]) : null;
      var override = String(rows[i][3] || '').toLowerCase().trim();
      var sumber   = key === 'GLOBAL' ? 'global' : 'per-cabang';

      if (override === 'buka')  return { isOpen:true,  buka:buka, tutup:tutup, sumber:sumber };
      if (override === 'tutup') return { isOpen:false, buka:buka, tutup:tutup, sumber:sumber };

      if (buka && tutup) {
        var now    = new Date();
        var bukaD  = new Date(buka);
        var tutupD = new Date(tutup);
        return {
          isOpen : now >= bukaD && now < tutupD,
          buka   : buka,
          tutup  : tutup,
          sumber : sumber,
          status : now < bukaD ? 'belum_buka' : (now < tutupD ? 'buka' : 'tutup')
        };
      }
      return { isOpen:false, buka:buka, tutup:tutup, sumber:sumber, message:'Waktu belum dikonfigurasi' };
    }
  }

  return { isOpen:false, message:'Konfigurasi maqra belum ada. Hubungi admin.' };
}

/**
 * Cari hasil maqra untuk nomor pendaftaran
 */
function findMaqraResult_(ss, nomor) {
  var sheet = ss.getSheetByName(SHEET_MAQRA_RESULT);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_RESULT_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === String(nomor).trim()) {
      return {
        nomor_pendaftaran : rows[i][1] || '',
        nik               : rows[i][2] || '',
        nama_lengkap      : rows[i][3] || '',
        cabang_lomba      : rows[i][5] || '',
        id_maqra          : rows[i][6] || '',
        maqra_teks        : rows[i][7] || '',
        maqra             : rows[i][7] || '',
        maqra_detail      : rows[i][8] || '',
        surah             : rows[i][8] || '',
        nomor_maqra       : String(rows[i][9] || ''),
        timestamp         : rows[i][0] || '',
      };
    }
  }
  return null;
}

/**
 * Ambil daftar maqra yang belum diambil untuk satu cabang
 */
function getAvailableMaqraList_(ss, cabang) {
  var sheet = ss.getSheetByName(SHEET_MAQRA);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_HEADERS.length).getValues();
  var list = [];
  // FIX #30: kelompok (tanpa gender) — Putra & Putri dari cabang yang
  // sama sekarang menarik dari pool maqra yang SAMA persis.
  var cabangTarget = getMaqraKelompok_(cabang);

  rows.forEach(function(r) {
    if (getMaqraKelompok_(r[MCOL.CABANG_LOMBA]) !== cabangTarget) return;
    var taken = String(r[MCOL.SUDAH_DIAMBIL]).toLowerCase();
    if (taken === 'true' || taken === 'ya') return;
    list.push({
      id_maqra    : String(r[MCOL.ID_MAQRA])   || '',
      cabang_lomba: String(r[MCOL.CABANG_LOMBA])|| '',
      maqra_teks  : String(r[MCOL.MAQRA_TEKS]) || '',
      maqra_detail: String(r[MCOL.MAQRA_DETAIL])|| '',
      nomor_urut  : String(r[MCOL.NOMOR_URUT])  || '',
    });
  });

  return list;
}

/**
 * rev 12 — Pilih SATU maqra acak yang masih tersedia untuk `cabang` DAN
 * menandainya sudah diambil oleh `nomorPendaftaran`, dengan SATU kali baca
 * sheet MAQRA + SATU kali tulis 3 sel. Dulu: getAvailableMaqraList_() (baca
 * seluruh sheet) lalu markMaqraAmbil_() (baca seluruh sheet LAGI, cari baris
 * by id, lalu 3 setValue terpisah) — semuanya di dalam lock.
 * Aturan pemilihan sama: kelompok cabang tanpa Putra/Putri, baris dengan
 * sudah_diambil 'true'/'ya' dilewati, pilih acak seragam.
 * @returns {object|null} item maqra terpilih, atau null kalau habis
 */
function takeRandomMaqra_(ss, cabang, nomorPendaftaran) {
  var sheet = ss.getSheetByName(SHEET_MAQRA);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_HEADERS.length).getValues();
  var cabangTarget = getMaqraKelompok_(cabang);
  var avail = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (getMaqraKelompok_(r[MCOL.CABANG_LOMBA]) !== cabangTarget) continue;
    var taken = String(r[MCOL.SUDAH_DIAMBIL]).toLowerCase();
    if (taken === 'true' || taken === 'ya') continue;
    avail.push({
      row : i + 2,
      item: {
        id_maqra    : String(r[MCOL.ID_MAQRA])   || '',
        cabang_lomba: String(r[MCOL.CABANG_LOMBA])|| '',
        maqra_teks  : String(r[MCOL.MAQRA_TEKS]) || '',
        maqra_detail: String(r[MCOL.MAQRA_DETAIL])|| '',
        nomor_urut  : String(r[MCOL.NOMOR_URUT])  || ''
      }
    });
  }
  if (!avail.length) return null;

  var pick = avail[Math.floor(Math.random() * avail.length)];
  // SUDAH_DIAMBIL, DIAMBIL_OLEH, TIMESTAMP berurutan di sheet (lihat MCOL).
  sheet.getRange(pick.row, MCOL.SUDAH_DIAMBIL + 1, 1, 3)
       .setValues([['true', nomorPendaftaran, new Date().toLocaleString('id-ID')]]);
  return pick.item;
}

/**
 * Tandai maqra sebagai sudah diambil
 */
function markMaqraAmbil_(ss, idMaqra, nomorPendaftaran) {
  var sheet = ss.getSheetByName(SHEET_MAQRA);
  if (!sheet || sheet.getLastRow() <= 1) return;

  var rows = sheet.getRange(2,1,sheet.getLastRow()-1,MAQRA_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][MCOL.ID_MAQRA]).trim() === String(idMaqra).trim()) {
      var rowNum = i + 2;
      sheet.getRange(rowNum, MCOL.SUDAH_DIAMBIL + 1).setValue('true');
      sheet.getRange(rowNum, MCOL.DIAMBIL_OLEH  + 1).setValue(nomorPendaftaran);
      sheet.getRange(rowNum, MCOL.TIMESTAMP     + 1).setValue(new Date().toLocaleString('id-ID'));
      break;
    }
  }
}

// ── Helper: perbaikan endpoint (tambahkan ke doPost) ──────────
// ── NOTE: apiPerbaikan_ (endpoint perbaikan data setelah Ditolak) ──
// Fungsi ini sudah didefinisikan di api.gs (versi lebih lengkap,
// mendukung array sertifikat, dan sengaja TIDAK mengizinkan NIK
// diubah lewat form perbaikan). Definisi duplikat yang sebelumnya
// ada di sini sudah dihapus — dua fungsi dengan nama sama di
// project Apps Script yang sama akan saling menimpa secara diam-diam
// dan bisa membuat perilaku jadi tidak konsisten / NIK ikut terubah.