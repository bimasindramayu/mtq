// ============================================================
//  MTQ 2026 — apps-script/upload.gs
//  Semua fungsi upload ke Google Drive
//  Struktur folder:
//    ROOT/
//      {CabangLomba}/
//        {Kecamatan}_{NomorPeserta}/
//          FOTO_NamaPeserta.ext
//          KTP_NamaPeserta.ext
//          REKOMENDASI.ext
// ============================================================

/**
 * Buat struktur folder dan kembalikan folder tujuan peserta
 * @param {string} cabangLomba
 * @param {string} kecamatan
 * @param {string} nomorPendaftaran
 * @returns {Folder} folder peserta
 */
function getPesertaFolder_(cabangLomba, kecamatan, nomorPendaftaran) {
  logInfo('upload', 'getPesertaFolder_', { cabangLomba, kecamatan, nomorPendaftaran });

  var rootFolder   = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  var cabangFolder = getOrCreateDriveFolder_(rootFolder, sanitizeFolderName_(cabangLomba));
  var pesertaName  = sanitizeFolderName_(kecamatan) + '_' + nomorPendaftaran;
  var pesertaFolder= getOrCreateDriveFolder_(cabangFolder, pesertaName);

  logInfo('upload', 'Folder peserta siap: ' + pesertaFolder.getName());
  return pesertaFolder;
}

/**
 * Ambil atau buat subfolder di dalam folder parent
 */
function getOrCreateDriveFolder_(parentFolder, name) {
  var iter = parentFolder.getFoldersByName(name);
  if (iter.hasNext()) {
    var existing = iter.next();
    logInfo('upload', 'Folder sudah ada: ' + name);
    return existing;
  }
  var newFolder = parentFolder.createFolder(name);
  logInfo('upload', 'Folder baru dibuat: ' + name);
  return newFolder;
}

/**
 * Upload satu file ke folder tujuan
 * @param {object|null} fileObj   { name, type, data (base64) }
 * @param {Folder}      folder    Folder Drive tujuan
 * @param {string}      fileLabel Nama file, misal "FOTO_Ahmad"
 * @returns {string}              URL publik atau ''
 */
function uploadFile_(fileObj, folder, fileLabel) {
  if (!fileObj || !fileObj.data) {
    logWarn('upload', 'uploadFile_ dilewati: fileObj kosong untuk ' + fileLabel);
    return '';
  }

  try {
    var decoded  = Utilities.base64Decode(fileObj.data);
    var mimeType = fileObj.type || 'application/octet-stream';
    var ext      = getExt_(fileObj.name || '', mimeType);
    var fileName = sanitizeFolderName_(fileLabel) + ext;

    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    logInfo('upload', 'Upload sukses: ' + fileName + ' → ' + url);
    return url;

  } catch (err) {
    logError('upload', 'uploadFile_ error: ' + err.message, { label: fileLabel });
    return '';
  }
}

/**
 * Upload semua berkas satu peserta (individu atau satu anggota tim)
 * @returns {object} { foto, ktp } — URL masing-masing
 */
function uploadMemberFiles_(memberData, folder, prefix) {
  logInfo('upload', 'uploadMemberFiles_', { prefix: prefix });
  return {
    foto: uploadFile_(memberData.photo, folder, 'FOTO_' + prefix),
    ktp : uploadFile_(memberData.ktp,   folder, 'KTP_'  + prefix),
  };
}

// ── Helpers ───────────────────────────────────────────────────
function getExt_(filename, mimeType) {
  var m = String(filename).match(/\.[^.]+$/);
  if (m) return m[0].toLowerCase();
  var map = { 'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf' };
  return '.' + (map[mimeType] || 'bin');
}

function sanitizeFolderName_(name) {
  return String(name)
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}