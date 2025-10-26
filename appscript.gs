// ===== KONFIGURASI =====
const SHEET_ID = '1_Sj7ehvNrJteModhFkhoYB0ut12Np1zv0SDIknWCn7A';
const FOLDER_ID = '1AK6rc4VUOJg_wDFed8F2nLzFSaDqf_5o';
const SHEET_NAME = 'Peserta';

// REGISTRATION TIME WINDOW (WIB = UTC+7)
const REGISTRATION_START = new Date('2025-10-22T00:00:00+07:00');
const REGISTRATION_END = new Date('2025-10-30T23:59:59+07:00');

// ===== CONCURRENCY PROTECTION =====
const lock = LockService.getScriptLock();
const LOCK_TIMEOUT_MS = 30000; // 30 detik timeout
const LOCK_WAIT_TIME_MS = 500; // Tunggu 0.5 detik sebelum retry

// MAX PARTICIPANTS PER BRANCH - UPDATED: 62 per cabang
const MAX_PARTICIPANTS_PER_BRANCH = 62;

// ===== CABANG ORDER - UNTUK MENENTUKAN RANGE NOMOR =====
const CABANG_ORDER = {
  'TA': { start: 1, end: 62, name: 'Tartil Al Qur\'an' },
  'TLA': { start: 63, end: 124, name: 'Tilawah Anak-anak' },
  'TLR': { start: 125, end: 186, name: 'Tilawah Remaja' },
  'TLD': { start: 187, end: 248, name: 'Tilawah Dewasa' },
  'QM': { start: 249, end: 310, name: 'Qira\'at Mujawwad' },
  'H1J': { start: 311, end: 372, name: 'Hafalan 1 Juz + Tilawah' },
  'H5J': { start: 373, end: 434, name: 'Hafalan 5 Juz + Tilawah' },
  'H10J': { start: 435, end: 496, name: 'Hafalan 10 Juz' },
  'H20J': { start: 497, end: 558, name: 'Hafalan 20 Juz' },
  'H30J': { start: 559, end: 620, name: 'Hafalan 30 Juz' },
  'TFI': { start: 621, end: 682, name: 'Tafsir Indonesia' },
  'TFA': { start: 683, end: 744, name: 'Tafsir Arab' },
  'TFE': { start: 745, end: 806, name: 'Tafsir Inggris' },
  'FAQ': { start: 1, end: 31, name: 'Fahm Al Qur\'an', prefix: 'F' },
  'SAQ': { start: 1, end: 31, name: 'Syarh Al Qur\'an', prefix: 'S' },
  'KN': { start: 1, end: 62, name: 'Kaligrafi Naskah', prefix: 'N' },
  'KH': { start: 63, end: 124, name: 'Kaligrafi Hiasan', prefix: 'H' },
  'KD': { start: 125, end: 186, name: 'Kaligrafi Dekorasi', prefix: 'D' },
  'KK': { start: 187, end: 248, name: 'Kaligrafi Kontemporer', prefix: 'K' },
  'KTIQ': { start: 1, end: 62, name: 'KTIQ', prefix: 'M' }
};

// ===== FUNGSI UTAMA =====
function doPost(e) {
  let lockAcquired = false;
  
  try {
    Logger.log('=== START doPost ===');
    Logger.log('Request received at: ' + new Date().toISOString());
    
    // Check action untuk update row lengkap
    if (e.parameter.action === 'updateRow') {
      return updateCompleteRow(e);
    }
    
    // Check action untuk upload files
    if (e.parameter.action === 'uploadFiles') {
      return uploadFilesOnly(e);
    }
    
    // Check jika ada parameter action untuk update/delete
    if (e.parameter.action === 'updateStatus') {
      return updateRowStatus(parseInt(e.parameter.rowIndex), e.parameter.status, e.parameter.reason || '');
    }
    
    if (e.parameter.action === 'deleteRow') {
      return deleteRowData(parseInt(e.parameter.rowIndex));
    }
    
    // ===== ACQUIRE LOCK UNTUK REGISTRATION =====
    Logger.log('Attempting to acquire lock for registration...');
    lockAcquired = lock.tryLock(LOCK_TIMEOUT_MS);
    
    if (!lockAcquired) {
      Logger.log('ERROR: Could not acquire lock after ' + LOCK_TIMEOUT_MS + 'ms');
      return createResponse(false, 'Server sedang sibuk. Mohon coba lagi dalam beberapa detik.');
    }
    
    Logger.log('âœ… Lock acquired successfully');
    
    // Validate registration time
    const now = new Date();
    if (now < REGISTRATION_START || now > REGISTRATION_END) {
      Logger.log('ERROR: Registration outside time window');
      return createResponse(false, 'Pendaftaran hanya dapat dilakukan antara tanggal 29-30 Oktober 2025. Saat ini waktu pendaftaran telah ditutup atau belum dimulai.');
    }
    
    const formData = e.parameter;
    Logger.log('Form data received: ' + JSON.stringify(Object.keys(formData)));
    
    // Validasi data dasar
    if (!formData.cabang || !formData.kecamatan) {
      Logger.log('ERROR: Missing cabang or kecamatan');
      return createResponse(false, 'Data cabang atau kecamatan tidak lengkap');
    }
    
    // Buka spreadsheet
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('Creating new sheet: ' + SHEET_NAME);
      sheet = ss.insertSheet(SHEET_NAME);
    }
    
    if (sheet.getLastRow() === 0) {
      Logger.log('Adding headers to sheet');
      addHeaders(sheet);
    }
    
    // ===== CRITICAL: CHECK DUPLICATES DALAM LOCK =====
    Logger.log('Checking for duplicate NIK across ALL cabang (dalam LOCK)');
    const nikList = formData.nikList ? JSON.parse(formData.nikList) : [];
    
    const duplicateCheck = checkDuplicates(sheet, nikList);
    if (!duplicateCheck.isValid) {
      Logger.log('Duplicate found: ' + duplicateCheck.message);
      return createResponse(false, duplicateCheck.message);
    }
    
    // ===== CRITICAL: GENERATE NOMOR PESERTA DALAM LOCK =====
    Logger.log('Generating nomor peserta (dalam LOCK untuk mencegah collision)...');
    const isTeam = formData.isTeam === 'true';
    const nomorPeserta = generateNomorPeserta(sheet, formData.cabangCode, formData.genderCode || formData.memberGenderCode1, isTeam);
    if (!nomorPeserta.success) {
      Logger.log('Failed to generate nomor peserta: ' + nomorPeserta.message);
      return createResponse(false, nomorPeserta.message);
    }
    Logger.log('Nomor peserta generated: ' + nomorPeserta.number);
    
    // Process file uploads with unique names
    Logger.log('Processing file uploads...');
    const fileLinks = processFileUploads(e, formData, nomorPeserta.number);
    Logger.log('Files processed: ' + Object.keys(fileLinks).length);
    
    // Prepare and append data
    Logger.log('Preparing row data...');
    const rowData = prepareRowData(formData, fileLinks, sheet, nomorPeserta.number);
    sheet.appendRow(rowData);
    Logger.log('Data successfully appended to row: ' + sheet.getLastRow());
    
    // ===== RELEASE LOCK SETELAH DATA TERSIMPAN =====
    Logger.log('âœ… Data saved successfully. Releasing lock...');
    lock.releaseLock();
    lockAcquired = false;
    Logger.log('=== END doPost SUCCESS ===');
    
    return createResponse(true, 'Registrasi berhasil!', nomorPeserta.number, {
      nik: formData.nik || '',
      nama: formData.nama || '',
      cabang: formData.cabang || '',
      nomorPeserta: nomorPeserta.number
    });
    
  } catch (error) {
    Logger.log('=== ERROR in doPost ===');
    Logger.log('Error type: ' + error.name);
    Logger.log('Error message: ' + error.message);
    Logger.log('Error stack: ' + error.stack);
    return createResponse(false, 'Error: ' + error.toString());
  } 
  finally {
    // ===== ENSURE LOCK IS RELEASED =====
    if (lockAcquired) {
      try {
        Logger.log('Finally block: Releasing lock...');
        lock.releaseLock();
        Logger.log('Lock released successfully');
      } catch (e) {
        Logger.log('Error releasing lock: ' + e.message);
      }
    }
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getData') {
    return getAllDataAsJSON();
  } else if (action === 'getRejectedData') {
    return getRejectedDataAsJSON();
  } else if (action === 'updateStatus') {
    const rowIndex = parseInt(e.parameter.rowIndex);
    const newStatus = e.parameter.status;
    const reason = e.parameter.reason || '';
    return updateRowStatus(rowIndex, newStatus, reason);
  } else if (action === 'deleteRow') {
    const rowIndex = parseInt(e.parameter.rowIndex);
    return deleteRowData(rowIndex);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: 'Invalid action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function getAllDataAsJSON() {
  try {
    Logger.log('Getting all data from Peserta sheet');
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        headers: [],
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Ambil header
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const headers = headerRange.getValues()[0];
    
    // Ambil semua data
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = dataRange.getValues();
    
    Logger.log('Total rows: ' + data.length);
    Logger.log('Total columns: ' + headers.length);
    
    const response = {
      success: true,
      headers: headers,
      data: data,
      totalRows: data.length
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in getAllDataAsJSON: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== NEW: GET REJECTED DATA =====
function getRejectedDataAsJSON() {
  try {
    Logger.log('Getting rejected data from Peserta sheet');
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Ambil header
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const headers = headerRange.getValues()[0];
    
    // Ambil semua data
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const allData = dataRange.getValues();
    
    // Find column indices
    const nomorPesertaIdx = headers.indexOf('Nomor Peserta');
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const kecamatanIdx = headers.indexOf('Kecamatan');
    const namaReguIdx = headers.indexOf('Nama Regu/Tim');
    const namaIdx = headers.indexOf('Nama Lengkap');
    const statusIdx = headers.indexOf('Status');
    const alasanIdx = headers.indexOf('Alasan Ditolak');
    
    // Filter data dengan status "Ditolak"
    const rejectedData = [];
    for (let i = 0; i < allData.length; i++) {
      const row = allData[i];
      if (row[statusIdx] === 'Ditolak') {
        rejectedData.push({
          nomorPeserta: row[nomorPesertaIdx] || '-',
          namaTimPeserta: row[namaReguIdx] && row[namaReguIdx] !== '-' ? row[namaReguIdx] : row[namaIdx],
          cabang: row[cabangIdx] || '-',
          kecamatan: row[kecamatanIdx] || '-',
          status: row[statusIdx] || '-',
          alasan: row[alasanIdx] || '-'
        });
      }
    }
    
    Logger.log('Rejected data count: ' + rejectedData.length);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      data: rejectedData,
      totalRows: rejectedData.length
    })).setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error in getRejectedDataAsJSON: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateCompleteRow(e) {
  try {
    Logger.log('Updating complete row');
    const rowIndex = parseInt(e.parameter.rowIndex);
    const updatedData = JSON.parse(e.parameter.updatedData);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const actualRow = rowIndex + 2;
    
    if (actualRow > sheet.getLastRow()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Row tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    for (let field in updatedData) {
      const colIndex = headers.indexOf(field);
      if (colIndex !== -1) {
        sheet.getRange(actualRow, colIndex + 1).setValue(updatedData[field]);
      }
    }
    
    Logger.log('Row updated successfully at row ' + actualRow);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data berhasil diperbarui'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in updateCompleteRow: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function uploadFilesOnly(e) {
  try {
    Logger.log('Uploading files only');
    const nomorPeserta = e.parameter.nomorPeserta;
    const fileLinks = processFileUploads(e, e.parameter, nomorPeserta);
    
    Logger.log('Files uploaded: ' + Object.keys(fileLinks).length);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Files berhasil diupload',
      fileLinks: fileLinks
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in uploadFilesOnly: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== UPDATED: WITH REASON PARAMETER =====
function updateRowStatus(rowIndex, newStatus, reason) {
  try {
    Logger.log('Updating row ' + rowIndex + ' status to ' + newStatus + ' with reason: ' + reason);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const statusIdx = headers.indexOf('Status');
    const alasanIdx = headers.indexOf('Alasan Ditolak');
    const actualRow = rowIndex + 2;
    
    if (actualRow > sheet.getLastRow()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Row tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Update status
    sheet.getRange(actualRow, statusIdx + 1).setValue(newStatus);
    
    // Update alasan jika status Ditolak
    if (newStatus === 'Ditolak' && alasanIdx !== -1) {
      sheet.getRange(actualRow, alasanIdx + 1).setValue(reason || '-');
    } else if (alasanIdx !== -1) {
      sheet.getRange(actualRow, alasanIdx + 1).setValue('-');
    }
    
    Logger.log('Status updated successfully at row ' + actualRow);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Status berhasil diperbarui'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in updateRowStatus: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function deleteRowData(rowIndex) {
  try {
    Logger.log('Deleting row ' + rowIndex);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const actualRow = rowIndex + 2;
    
    if (actualRow > sheet.getLastRow()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Row tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    sheet.deleteRow(actualRow);
    
    Logger.log('Row deleted successfully');
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data berhasil dihapus'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error in deleteRowData: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== UPDATED: GENERATE NOMOR PESERTA - GENAP PUTRA, GANJIL PUTRI =====
function generateNomorPeserta(sheet, cabangCode, genderCode, isTeam) {
  try {
    Logger.log('[LOCK] Generating nomor peserta for cabang: ' + cabangCode);
    
    const cabangInfo = CABANG_ORDER[cabangCode];
    if (!cabangInfo) {
      return {
        success: false,
        message: 'Kode cabang tidak valid'
      };
    }
    
    const lastRow = sheet.getLastRow();
    const existingNumbers = [];
    
    if (lastRow > 1) {
      Logger.log('[LOCK] Reading existing numbers from rows 2 to ' + lastRow);
      const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
      const data = dataRange.getValues();
      const nomorPesertaCol = 1;
      
      for (let i = 0; i < data.length; i++) {
        const nomorPeserta = data[i][nomorPesertaCol];
        if (nomorPeserta) {
          const nomorStr = nomorPeserta.toString();
          let num;
          
          if (cabangInfo.prefix) {
            const prefixMatch = nomorStr.match(new RegExp('^' + cabangInfo.prefix + '\\.\\s*(\\d+)$'));
            if (prefixMatch) {
              num = parseInt(prefixMatch[1]);
              if (!isNaN(num)) {
                existingNumbers.push(num);
              }
            }
          } else {
            num = parseInt(nomorStr);
            if (!isNaN(num) && num >= cabangInfo.start && num <= cabangInfo.end) {
              existingNumbers.push(num);
            }
          }
        }
      }
    }
    
    Logger.log('[LOCK] Found ' + existingNumbers.length + ' existing numbers: ' + existingNumbers.join(', '));
    
    // Determine if odd or even
    let isOdd;
    if (genderCode === 'female' || genderCode === 'perempuan') {
      isOdd = true;
    } else {
      isOdd = false;
    }
    
    Logger.log('[LOCK] Gender: ' + genderCode + ', isOdd: ' + isOdd);
    
    // Find next available number
    let nextNumber;
    
    if (isOdd) {
      nextNumber = cabangInfo.start % 2 === 0 ? cabangInfo.start + 1 : cabangInfo.start;
    } else {
      nextNumber = cabangInfo.start % 2 === 0 ? cabangInfo.start : cabangInfo.start + 1;
    }

    // Cari nomor tersedia dengan increment 2
    let attempts = 0;
    const maxAttempts = (cabangInfo.end - cabangInfo.start) / 2 + 1;
    
    while (existingNumbers.indexOf(nextNumber) !== -1) {
      nextNumber += 2;
      attempts++;
      
      if (attempts > maxAttempts || nextNumber > cabangInfo.end) {
        Logger.log('[LOCK] ERROR: Kuota penuh setelah ' + attempts + ' attempts');
        return {
          success: false,
          message: 'Maaf, kuota peserta untuk cabang ' + cabangInfo.name + ' (' + (isOdd ? 'Putri' : 'Putra') + ') sudah penuh.'
        };
      }
    }
    
    // Format nomor peserta
    let nomorPeserta;
    if (cabangInfo.prefix) {
      nomorPeserta = cabangInfo.prefix + '. ' + String(nextNumber).padStart(2, '0');
    } else {
      nomorPeserta = String(nextNumber).padStart(3, '0');
    }
    
    Logger.log('[LOCK] âœ… Generated nomor peserta: ' + nomorPeserta + ' (Gender: ' + (isOdd ? 'Putri/Ganjil' : 'Putra/Genap') + ')');
    
    return {
      success: true,
      number: nomorPeserta
    };
    
  } catch (error) {
    Logger.log('[LOCK] Error in generateNomorPeserta: ' + error.message);
    return {
      success: false,
      message: 'Terjadi kesalahan saat membuat nomor peserta. Silakan coba lagi.'
    };
  }
}

// ===== CHECK DUPLICATES =====
function checkDuplicates(sheet, nikList) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('No existing data, duplicate check passed');
      return { isValid: true };
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    Logger.log('Checking against ' + data.length + ' existing registrations');
    
    const cabangCol = 4;
    const nikCol = 7;
    const member1NikCol = 19;
    const member2NikCol = 31;
    const member3NikCol = 43;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowCabang = row[cabangCol];
      const rowNum = i + 2;
      
      const existingNiks = [
        row[nikCol],
        row[member1NikCol],
        row[member2NikCol],
        row[member3NikCol]
      ].filter(nik => nik && nik !== '-' && nik.toString().trim() !== '');
      
      for (let newNik of nikList) {
        if (newNik && newNik.trim() !== '') {
          const trimmedNewNik = newNik.trim();
          
          for (let existingNik of existingNiks) {
            const trimmedExistingNik = existingNik.toString().trim();
            
            if (trimmedExistingNik === trimmedNewNik) {
              const message = `NIK ${trimmedNewNik} sudah terdaftar di cabang "${rowCabang}". Setiap peserta hanya boleh mendaftar satu kali di seluruh cabang lomba.`;
              Logger.log('DUPLICATE NIK FOUND: ' + message);
              return {
                isValid: false,
                message: message
              };
            }
          }
        }
      }
    }
    
    Logger.log('No duplicates found - validation passed');
    return { isValid: true };
    
  } catch (error) {
    Logger.log('Error in checkDuplicates: ' + error.message);
    return { 
      isValid: false, 
      message: 'Terjadi kesalahan saat validasi data. Silakan coba lagi atau hubungi admin.' 
    };
  }
}

// ===== CREATE RESPONSE =====
function createResponse(success, message, nomorPeserta, details) {
  const response = {
    success: success,
    message: message
  };
  
  if (nomorPeserta) {
    response.nomorPeserta = nomorPeserta;
  }
  
  if (details) {
    response.details = details;
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== UPDATED: ADD HEADERS WITH "ALASAN DITOLAK" =====
function addHeaders(sheet) {
  const headers = [
    'No', 'Nomor Peserta', 'Timestamp', 'Kecamatan', 'Cabang Lomba', 'Batas Usia Max',
    'Nama Regu/Tim', 'NIK', 'Nama Lengkap', 'Jenis Kelamin', 'Tempat Lahir', 'Tanggal Lahir',
    'Umur', 'Alamat', 'No Telepon', 'Email', 'Nama Rekening', 'No Rekening', 'Nama Bank',
    'Anggota Tim #1 - NIK', 'Anggota Tim #1 - Nama', 'Anggota Tim #1 - Jenis Kelamin',
    'Anggota Tim #1 - Tempat Lahir', 'Anggota Tim #1 - Tgl Lahir', 'Anggota Tim #1 - Umur',
    'Anggota Tim #1 - Alamat', 'Anggota Tim #1 - No Telepon', 'Anggota Tim #1 - Email',
    'Anggota Tim #1 - Nama Rekening', 'Anggota Tim #1 - No Rekening', 'Anggota Tim #1 - Nama Bank',
    'Anggota Tim #2 - NIK', 'Anggota Tim #2 - Nama', 'Anggota Tim #2 - Jenis Kelamin',
    'Anggota Tim #2 - Tempat Lahir', 'Anggota Tim #2 - Tgl Lahir', 'Anggota Tim #2 - Umur',
    'Anggota Tim #2 - Alamat', 'Anggota Tim #2 - No Telepon', 'Anggota Tim #2 - Email',
    'Anggota Tim #2 - Nama Rekening', 'Anggota Tim #2 - No Rekening', 'Anggota Tim #2 - Nama Bank',
    'Anggota Tim #3 - NIK', 'Anggota Tim #3 - Nama', 'Anggota Tim #3 - Jenis Kelamin',
    'Anggota Tim #3 - Tempat Lahir', 'Anggota Tim #3 - Tgl Lahir', 'Anggota Tim #3 - Umur',
    'Anggota Tim #3 - Alamat', 'Anggota Tim #3 - No Telepon', 'Anggota Tim #3 - Email',
    'Anggota Tim #3 - Nama Rekening', 'Anggota Tim #3 - No Rekening', 'Anggota Tim #3 - Nama Bank',
    'Link - Doc Surat Mandat Personal', 'Link - Doc KTP Personal', 'Link - Doc Sertifikat Personal',
    'Link - Doc Rekening Personal', 'Link - Doc Pas Photo Personal', 'Link - Doc Surat Mandat Team 1',
    'Link - Doc KTP Team 1', 'Link - Doc Sertifikat Team 1', 'Link - Doc Rekening Team 1',
    'Link - Doc Pas Photo Team 1', 'Link - Doc Surat Mandat Team 2', 'Link - Doc KTP Team 2',
    'Link - Doc Sertifikat Team 2', 'Link - Doc Rekening Team 2', 'Link - Doc Pas Photo Team 2',
    'Link - Doc Surat Mandat Team 3', 'Link - Doc KTP Team 3', 'Link - Doc Sertifikat Team 3',
    'Link - Doc Rekening Team 3', 'Link - Doc Pas Photo Team 3', 'Status', 'Alasan Ditolak'
  ];
  sheet.appendRow(headers);
}

// ===== PROSES UPLOAD FILE =====
function processFileUploads(e, formData, nomorPeserta) {
  const fileLinks = {};
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const timestamp = new Date().getTime();
  
  try {
    const allBlobs = e.parameters || e.parameter;
    Logger.log('Processing file blobs: ' + JSON.stringify(Object.keys(allBlobs)));
    
    for (let key in allBlobs) {
      if (key.endsWith('_type') || key.endsWith('_name') || key === 'action' || key === 'nomorPeserta' || key === 'updatedData' || key === 'rowIndex') {
        continue;
      }
      
      if (key.startsWith('doc') || key.startsWith('teamDoc') || key.startsWith('Link')) {
        try {
          const base64Data = Array.isArray(allBlobs[key]) ? allBlobs[key][0] : allBlobs[key];
          if (base64Data && base64Data.length > 0) {
            const originalName = allBlobs[key + '_name'] ? (Array.isArray(allBlobs[key + '_name']) ? allBlobs[key + '_name'][0] : allBlobs[key + '_name']) : key;
            const mimeType = allBlobs[key + '_type'] ? (Array.isArray(allBlobs[key + '_type']) ? allBlobs[key + '_type'][0] : allBlobs[key + '_type']) : 'application/octet-stream';
            
            const lastDotIndex = originalName.lastIndexOf('.');
            const extension = lastDotIndex > -1 ? originalName.substring(lastDotIndex) : '';
            
            const uniqueFileName = nomorPeserta + '_' + key + '_' + timestamp + extension;
            
            const blob = Utilities.newBlob(
              Utilities.base64Decode(base64Data),
              mimeType,
              uniqueFileName
            );
            
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            fileLinks[key] = file.getUrl();
            Logger.log('Uploaded file: ' + key + ' -> ' + uniqueFileName);
          }
        } catch (fileError) {
          Logger.log('Error uploading file ' + key + ': ' + fileError.message);
        }
      }
    }
    
  } catch (error) {
    Logger.log('Upload error: ' + error.message);
  }
  
  return fileLinks;
}

// ===== SIAPKAN DATA UNTUK ROW =====
function prepareRowData(formData, fileLinks, sheet, nomorPeserta) {
  const no = sheet.getLastRow();
  const timestamp = new Date().toLocaleString('id-ID');
  
  const rowData = [
    no, nomorPeserta, timestamp, formData.kecamatan || '', formData.cabang || '',
    formData.maxAge || '', formData.namaRegu || '-', formData.nik || '', formData.nama || '',
    formData.jenisKelamin || '', formData.tempatLahir || '', formData.tglLahir || '',
    formData.umur || '', formData.alamat || '', formData.noTelepon || '', formData.email || '',
    formData.namaRek || '', formData.noRek || '', formData.namaBank || '',
    
    formData.memberNik1 || '-', formData.memberName1 || '-', formData.memberJenisKelamin1 || '-',
    formData.memberTempatLahir1 || '-', formData.memberBirthDate1 || '-', formData.memberUmur1 || '-',
    formData.memberAlamat1 || '-', formData.memberNoTelepon1 || '-', formData.memberEmail1 || '-',
    formData.memberNamaRek1 || '-', formData.memberNoRek1 || '-', formData.memberNamaBank1 || '-',
    
    formData.memberNik2 || '-', formData.memberName2 || '-', formData.memberJenisKelamin2 || '-',
    formData.memberTempatLahir2 || '-', formData.memberBirthDate2 || '-', formData.memberUmur2 || '-',
    formData.memberAlamat2 || '-', formData.memberNoTelepon2 || '-', formData.memberEmail2 || '-',
    formData.memberNamaRek2 || '-', formData.memberNoRek2 || '-', formData.memberNamaBank2 || '-',
    
    formData.memberNik3 || '-', formData.memberName3 || '-', formData.memberJenisKelamin3 || '-',
    formData.memberTempatLahir3 || '-', formData.memberBirthDate3 || '-', formData.memberUmur3 || '-',
    formData.memberAlamat3 || '-', formData.memberNoTelepon3 || '-', formData.memberEmail3 || '-',
    formData.memberNamaRek3 || '-', formData.memberNoRek3 || '-', formData.memberNamaBank3 || '-',
    
    fileLinks['doc1'] || '', fileLinks['doc2'] || '', fileLinks['doc3'] || '',
    fileLinks['doc4'] || '', fileLinks['doc5'] || '', fileLinks['teamDoc1_1'] || '',
    fileLinks['teamDoc1_2'] || '', fileLinks['teamDoc1_3'] || '', fileLinks['teamDoc1_4'] || '',
    fileLinks['teamDoc1_5'] || '', fileLinks['teamDoc2_1'] || '', fileLinks['teamDoc2_2'] || '',
    fileLinks['teamDoc2_3'] || '', fileLinks['teamDoc2_4'] || '', fileLinks['teamDoc2_5'] || '',
    fileLinks['teamDoc3_1'] || '', fileLinks['teamDoc3_2'] || '', fileLinks['teamDoc3_3'] || '',
    fileLinks['teamDoc3_4'] || '', fileLinks['teamDoc3_5'] || '', 'Menunggu Verifikasi', '-'
  ];
  
  return rowData;
}