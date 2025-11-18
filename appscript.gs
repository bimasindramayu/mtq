// ===== KONFIGURASI =====
const SHEET_ID = '1_Sj7ehvNrJteModhFkhoYB0ut12Np1zv0SDIknWCn7A';
const FOLDER_ID = '1AK6rc4VUOJg_wDFed8F2nLzFSaDqf_5o';
const SHEET_NAME = 'Peserta';

// REGISTRATION TIME WINDOW (WIB = UTC+7)
const REGISTRATION_START = new Date('2025-10-29T00:00:00+07:00');
const REGISTRATION_END = new Date('2026-11-04T00:00:00+07:00');

// ===== MAQRA DRAW TIME CONFIGURATION =====
const MAQRA_DRAW_ENABLED = true; // Master switch
const MAQRA_DRAW_START = new Date('2025-11-05T08:00:00+07:00');
const MAQRA_DRAW_END = new Date('2026-11-10T23:59:59+07:00');

// ===== MAQRA CONFIGURATION =====
const MAQRA_ENABLED_BRANCHES = [
  'TA', 'TLA', 'TLR', 'QM', 
  'H1J', 'H5J', 'H10J', 'H20J', 'H30J',
  'TFI', 'TFA', 'TFE'
  // TLD, FAQ, SAQ, KN, KH, KD, KK, KTIQ are DISABLED
];

// Check if maqra draw is currently allowed
function isMaqraDrawTimeActive() {
  if (!MAQRA_DRAW_ENABLED) {
    Logger.log('Maqra draw globally disabled');
    return false;
  }
  
  const now = new Date();
  const isActive = now >= MAQRA_DRAW_START && now <= MAQRA_DRAW_END;
  
  Logger.log('Current time: ' + now.toISOString());
  Logger.log('Draw start: ' + MAQRA_DRAW_START.toISOString());
  Logger.log('Draw end: ' + MAQRA_DRAW_END.toISOString());
  Logger.log('Is active: ' + isActive);
  
  return isActive;
}

// ===== CONCURRENCY PROTECTION - OPTIMIZED =====
const LOCK_TIMEOUT_MS = 45000;      // 45 detik (lebih pendek)
const LOCK_WAIT_TIME_MS = 150;      // 150ms retry interval
const MAX_LOCK_ATTEMPTS = 300;      // Total: 45 detik / 150ms = 300 attempts
const DUPLICATE_CHECK_TIMEOUT_MS = 30000;

// MAX PARTICIPANTS PER BRANCH
const MAX_PARTICIPANTS_PER_BRANCH = 62;

// ===== CABANG ORDER =====
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
  'FAQ': { start: 1, end: 62, name: 'Fahm Al Qur\'an', prefix: 'F' },
  'SAQ': { start: 1, end: 62, name: 'Syarh Al Qur\'an', prefix: 'S' },
  'KN': { start: 1, end: 62, name: 'Kaligrafi Naskah', prefix: 'N' },
  'KH': { start: 63, end: 124, name: 'Kaligrafi Hiasan', prefix: 'H' },
  'KD': { start: 125, end: 186, name: 'Kaligrafi Dekorasi', prefix: 'D' },
  'KK': { start: 187, end: 248, name: 'Kaligrafi Kontemporer', prefix: 'K' },
  'KTIQ': { start: 1, end: 62, name: 'KTIQ', prefix: 'M' }
};

// ===== HELPER: ACQUIRE LOCK DENGAN RETRY =====
function acquireLockWithRetry(lock, timeoutMs, waitMs, maxAttempts) {
  let attempts = 0;
  const startTime = new Date().getTime();
  
  while (attempts < maxAttempts) {
    try {
      if (lock.tryLock(timeoutMs)) {
        Logger.log(`✓ Lock acquired on attempt ${attempts + 1}/${maxAttempts}`);
        return true;
      }
    } catch (e) {
      Logger.log(`Lock attempt ${attempts + 1} error: ${e.message}`);
    }
    
    attempts++;
    const elapsedMs = new Date().getTime() - startTime;
    
    if (elapsedMs + waitMs > timeoutMs) {
      Logger.log(`✗ Lock timeout exceeded (${elapsedMs}ms)`);
      break;
    }
    
    Utilities.sleep(waitMs);
  }
  
  Logger.log(`✗ Could not acquire lock after ${attempts} attempts (${new Date().getTime() - startTime}ms)`);
  return false;
}

// ===== MAIN FUNCTION - OPTIMIZED FLOW =====
function doPost(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  
  try {
    Logger.log('=== START doPost ===');
    Logger.log('Request received at: ' + new Date().toISOString());
    Logger.log('Action: ' + e.parameter.action);
    
    // ===== HANDLE UPLOAD FILES ACTION =====
    if (e.parameter.action === 'uploadFiles') {
      Logger.log('UPLOAD FILES ACTION detected');
      return handleFileUploadOnly(e);
    }

    // Handle penilaian submission
    if (e.parameter.action === 'submitPenilaian') {
      return submitPenilaian(e);
    }

    // ===== HANDLE DRAW MAQRA ACTION =====
    if (e.parameter.action === 'drawMaqra') {
      return drawMaqraForParticipant(e);
    }
    
    // ===== HANDLE UPDATE STATUS ACTION =====
    if (e.parameter.action === 'updateStatus') {
      return updateRowStatus(parseInt(e.parameter.rowIndex), e.parameter.status, e.parameter.reason || '');
    }
    
    // ===== HANDLE DELETE ROW ACTION =====
    if (e.parameter.action === 'deleteRow') {
      return deleteRowData(parseInt(e.parameter.rowIndex));
    }

    // ===== HANDLE UPDATE ROW ACTION =====
    if (e.parameter.action === 'updateRow') {
      return updateCompleteRow(e);
    }
    
    // ===== MAIN REGISTRATION FLOW =====
    // STEP 0: VALIDATE REGISTRATION TIME (TANPA LOCK)
    Logger.log('STEP 0: Validating registration time...');
    const now = new Date();
    if (now < REGISTRATION_START || now > REGISTRATION_END) {
      Logger.log('ERROR: Registration outside time window');
      return createResponse(false, 'Saat ini waktu pendaftaran telah ditutup atau belum dimulai.');
    }
    Logger.log('✓ Registration time valid');
    
    const formData = e.parameter;
    Logger.log('Form data received: ' + JSON.stringify(Object.keys(formData)));
    
    // Validasi data dasar
    if (!formData.cabang || !formData.kecamatan) {
      Logger.log('ERROR: Missing cabang or kecamatan');
      return createResponse(false, 'Data cabang atau kecamatan tidak lengkap');
    }
    
    // ===== STEP 1: ACQUIRE LOCK UNTUK VALIDASI DUPLIKAT & NOMOR PESERTA =====
    Logger.log('STEP 1: Acquiring lock for duplicate check and nomor peserta generation...');
    lockAcquired = acquireLockWithRetry(lock, LOCK_TIMEOUT_MS, LOCK_WAIT_TIME_MS, MAX_LOCK_ATTEMPTS);
    
    if (!lockAcquired) {
      Logger.log('ERROR: Could not acquire lock');
      return createResponse(false, 'Server sedang sibuk menangani registrasi. Mohon coba lagi dalam beberapa detik.');
    }
    Logger.log('✓ Lock acquired successfully');
    
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
    
    // ===== CHECK DUPLICATES =====
    Logger.log('STEP 1A: Checking for duplicate NIK...');
    const nikList = formData.nikList ? JSON.parse(formData.nikList) : [];
    
    const duplicateCheck = checkDuplicates(sheet, nikList);
    if (!duplicateCheck.isValid) {
      Logger.log('Duplicate found: ' + duplicateCheck.message);
      lock.releaseLock();
      lockAcquired = false;
      return createResponse(false, duplicateCheck.message);
    }
    Logger.log('✓ No duplicates found');

    // ===== CHECK DUPLICATE BRANCH PER KECAMATAN =====
    Logger.log('STEP 1B: Checking duplicate branch per kecamatan...');
    const branchCheck = checkDuplicateBranchPerKecamatan(
      sheet, 
      formData.kecamatan, 
      formData.cabangCode, 
      formData.genderCode
    );

    if (!branchCheck.isValid) {
      Logger.log('Duplicate branch found:', branchCheck.message);
      lock.releaseLock();
      lockAcquired = false;
      return createResponse(false, branchCheck.message);
    }
    Logger.log('✓ No duplicate branch found');
    
    // ===== GENERATE NOMOR PESERTA =====
    Logger.log('STEP 1C: Generating nomor peserta...');
    const isTeam = formData.isTeam === 'true';
    const nomorPeserta = generateNomorPeserta(sheet, formData.cabangCode, formData.genderCode || formData.memberGenderCode1, isTeam);
    if (!nomorPeserta.success) {
      Logger.log('Failed to generate nomor peserta: ' + nomorPeserta.message);
      lock.releaseLock();
      lockAcquired = false;
      return createResponse(false, nomorPeserta.message);
    }
    Logger.log('✓ Nomor peserta generated: ' + nomorPeserta.number);

    // ===== STEP 2: PREPARE & APPEND DATA KE SHEET (MASIH DALAM LOCK) =====
    Logger.log('STEP 2: Preparing and appending data to sheet...');
    const rowData = prepareRowData(formData, {}, sheet, nomorPeserta.number);
    sheet.appendRow(rowData);
    const savedRowIndex = sheet.getLastRow();
    Logger.log('✓ Data appended to row: ' + savedRowIndex);
    
    // ===== STEP 3: RELEASE LOCK (DATA SUDAH TERSIMPAN) =====
    Logger.log('STEP 3: Releasing lock...');
    lock.releaseLock();
    lockAcquired = false;
    Logger.log('✓ Lock released - registration data saved');
    
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
    if (lockAcquired) {
      try {
        Logger.log('Finally block: Releasing lock...');
        lock.releaseLock();
        Logger.log('✓ Lock released in finally block');
      } catch (e) {
        Logger.log('Error releasing lock: ' + e.message);
      }
    }
  }
}

// ===== CHECK DUPLICATE BRANCH PER KECAMATAN =====
function checkDuplicateBranchPerKecamatan(sheet, kecamatan, cabangCode, genderCode) {
  try {
    Logger.log('=== CHECK DUPLICATE BRANCH PER KECAMATAN ===');
    Logger.log('Kecamatan:', kecamatan);
    Logger.log('Cabang Code:', cabangCode);
    Logger.log('Gender Code:', genderCode);
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log('No existing data, check passed');
      return { isValid: true };
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    Logger.log('Checking against ' + data.length + ' existing registrations');
    
    const kecamatanCol = 3;
    const cabangCol = 4;
    
    // Extract base branch name (without Putra/Putri)
    const baseBranchName = extractBaseBranchName(cabangCode);
    Logger.log('Base branch name:', baseBranchName);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowKecamatan = row[kecamatanCol];
      const rowCabang = row[cabangCol];
      
      // Skip if different kecamatan
      if (!rowKecamatan || rowKecamatan.toString().trim() !== kecamatan.trim()) {
        continue;
      }
      
      // Extract existing branch info
      const existingBranchCode = extractBranchCodeFromCabangName(rowCabang);
      const existingBaseBranch = extractBaseBranchName(existingBranchCode);
      const existingGender = extractGenderFromCabangName(rowCabang);
      
      Logger.log('Row ' + (i + 2) + ':', {
        kecamatan: rowKecamatan,
        cabang: rowCabang,
        branchCode: existingBranchCode,
        baseBranch: existingBaseBranch,
        gender: existingGender
      });
      
      // Check if same base branch and same gender
      if (existingBaseBranch === baseBranchName && existingGender === genderCode) {
        const genderText = genderCode === 'male' ? 'Putra' : 'Putri';
        const message = `Kecamatan ${kecamatan} sudah memiliki peserta di cabang ${baseBranchName} ${genderText}. Setiap kecamatan hanya boleh mendaftar 1 peserta per cabang (Putra dan Putri terpisah).`;
        Logger.log('DUPLICATE BRANCH FOUND:', message);
        return { isValid: false, message: message };
      }
    }
    
    Logger.log('No duplicate branch found - validation passed');
    return { isValid: true };
    
  } catch (error) {
    Logger.log('Error in checkDuplicateBranchPerKecamatan:', error.message);
    return { 
      isValid: false, 
      message: 'Terjadi kesalahan saat validasi cabang. Silakan coba lagi.' 
    };
  }
}

// Helper: Extract gender from cabang name
function extractGenderFromCabangName(cabangName) {
  if (!cabangName) return null;
  
  if (cabangName.includes('Putra')) return 'male';
  if (cabangName.includes('Putri')) return 'female';
  
  return null;
}

function extractBaseBranchName(branchCode) {
  const branchMap = {
    'TA': 'Tartil Al Qur\'an',
    'TLA': 'Tilawah Anak-anak',
    'TLR': 'Tilawah Remaja',
    'TLD': 'Tilawah Dewasa',
    'QM': 'Qira\'at Mujawwad',
    'H1J': 'Hafalan 1 Juz',
    'H5J': 'Hafalan 5 Juz',
    'H10J': 'Hafalan 10 Juz',
    'H20J': 'Hafalan 20 Juz',
    'H30J': 'Hafalan 30 Juz',
    'TFI': 'Tafsir Indonesia',
    'TFA': 'Tafsir Arab',
    'TFE': 'Tafsir Inggris',
    'KN': 'Kaligrafi Naskah',
    'KH': 'Kaligrafi Hiasan',
    'KD': 'Kaligrafi Dekorasi',
    'KK': 'Kaligrafi Kontemporer',
    'KTIQ': 'KTIQ',
    'FAQ': 'Fahm Al Qur\'an',
    'SAQ': 'Syarh Al Qur\'an'
  };
  
  return branchMap[branchCode] || branchCode;
}

// Helper: Extract branch code from cabang name
function extractBranchCodeFromCabangName(cabangName) {
  if (!cabangName) return null;
  
  const branchMap = {
    'Tartil Al Qur\'an': 'TA',
    'Tilawah Anak-anak': 'TLA',
    'Tilawah Remaja': 'TLR',
    'Tilawah Dewasa': 'TLD',
    'Qira\'at Mujawwad': 'QM',
    'Hafalan 1 Juz': 'H1J',
    'Hafalan 5 Juz': 'H5J',
    'Hafalan 10 Juz': 'H10J',
    'Hafalan 20 Juz': 'H20J',
    'Hafalan 30 Juz': 'H30J',
    'Tafsir Indonesia': 'TFI',
    'Tafsir Arab': 'TFA',
    'Tafsir Inggris': 'TFE',
    'Kaligrafi Naskah': 'KN',
    'Kaligrafi Hiasan': 'KH',
    'Kaligrafi Dekorasi': 'KD',
    'Kaligrafi Kontemporer': 'KK',
    'KTIQ': 'KTIQ',
    'Fahm Al Qur\'an': 'FAQ',
    'Syarh Al Qur\'an': 'SAQ'
  };
  
  for (let key in branchMap) {
    if (cabangName.includes(key)) {
      return branchMap[key];
    }
  }
  
  return null;
}

function handleFileUploadOnly(e) {
  try {
    Logger.log('=== HANDLE FILE UPLOAD START ===');
    
    const nomorPesertaOriginal = e.parameter.nomorPeserta;
    Logger.log('Nomor Peserta received (original): ' + nomorPesertaOriginal);
    
    if (!nomorPesertaOriginal) {
      Logger.log('ERROR: nomorPeserta not provided');
      return createResponse(false, 'Nomor peserta tidak ditemukan');
    }
    
    // ===== BUKA SPREADSHEET =====
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found');
      return createResponse(false, 'Sheet tidak ditemukan');
    }
    
    Logger.log('Sheet found: ' + SHEET_NAME);
    
    // ===== DEBUG: Check total rows =====
    const lastRow = sheet.getLastRow();
    Logger.log('Total rows in sheet: ' + lastRow);
    
    if (lastRow <= 1) {
      Logger.log('ERROR: No data in sheet (only headers)');
      return createResponse(false, 'Tidak ada data registrasi di sheet');
    }
    
    // ===== GET ALL NOMOR PESERTA =====
    Logger.log('Getting all nomor peserta from column B...');
    const nomorPesertaRange = sheet.getRange(2, 2, lastRow - 1, 1);
    const nomorPesertaValues = nomorPesertaRange.getValues();
    
    Logger.log('Total entries to search: ' + nomorPesertaValues.length);
    
    // ===== NORMALIZE SEARCH STRING =====
    const searchStr = nomorPesertaOriginal.toString().trim();
    const searchStrNoLeadingZero = parseInt(searchStr) || searchStr;
    
    Logger.log('Searching for: "' + searchStr + '"');
    Logger.log('Alternative (no leading zero): "' + searchStrNoLeadingZero + '"');
    
    // ===== SEARCH: Try exact match first, then without leading zeros =====
    let targetRow = -1;
    
    for (let i = 0; i < nomorPesertaValues.length; i++) {
      const cellValue = nomorPesertaValues[i][0];
      const cellStr = cellValue.toString().trim();
      
      // Try exact match
      if (cellStr === searchStr) {
        targetRow = i + 2;
        Logger.log('✓ EXACT MATCH at row ' + targetRow + ': "' + cellStr + '"');
        break;
      }
      
      // Try numeric comparison (handles leading zeros)
      if (!isNaN(searchStr) && !isNaN(cellStr)) {
        const searchNum = parseInt(searchStr);
        const cellNum = parseInt(cellStr);
        
        if (searchNum === cellNum) {
          targetRow = i + 2;
          Logger.log('✓ NUMERIC MATCH at row ' + targetRow + ': cell="' + cellStr + '" (parsed: ' + cellNum + ') vs search="' + searchStr + '" (parsed: ' + searchNum + ')');
          break;
        }
      }
    }
    
    if (targetRow === -1) {
      Logger.log('✗ ERROR: No match found!');
      Logger.log('Showing last 10 nomor peserta:');
      const startIdx = Math.max(0, nomorPesertaValues.length - 10);
      for (let i = startIdx; i < nomorPesertaValues.length; i++) {
        Logger.log(`  Row ${i + 2}: "${nomorPesertaValues[i][0]}"`);
      }
      
      return createResponse(false, 
        'Data registrasi dengan nomor peserta "' + nomorPesertaOriginal + '" tidak ditemukan di sheet. ' +
        'Sistem menemukan ' + nomorPesertaValues.length + ' data registrasi, tapi nomor peserta yang dicari tidak ada.');
    }
    
    Logger.log('Target row confirmed: ' + targetRow);
    
    // ===== PROCESS FILE UPLOADS =====
    Logger.log('Processing file uploads...');
    const fileLinks = processFileUploads(e, e.parameter, nomorPesertaOriginal);
    Logger.log('✓ Files processed: ' + Object.keys(fileLinks).length);
    Logger.log('File links received:');
    for (let key in fileLinks) {
      Logger.log('  ' + key + ': ' + fileLinks[key]);
    }
    
    // ===== UPDATE FILE LINKS KE SHEET =====
    if (Object.keys(fileLinks).length > 0) {
      Logger.log('Updating file links in sheet at row ' + targetRow);
      updateFileLinksInSheet(sheet, targetRow, fileLinks);
      Logger.log('✓ File links updated');
    } else {
      Logger.log('WARNING: No file links to update');
    }
    
    Logger.log('=== HANDLE FILE UPLOAD SUCCESS ===');
    
    // ===== CRITICAL: RETURN FILE LINKS TO CLIENT =====
    Logger.log('Preparing response with file links...');
    Logger.log('File links object: ' + JSON.stringify(fileLinks));
    
    const responseDetails = {
      filesUploaded: Object.keys(fileLinks).length,
      rowUpdated: targetRow,
      fileLinks: fileLinks  // MOST IMPORTANT: Include file links!
    };
    
    Logger.log('Response details: ' + JSON.stringify(responseDetails));
    
    return createResponse(true, 'File berhasil diupload', nomorPesertaOriginal, responseDetails);
    
  } catch (error) {
    Logger.log('=== ERROR in handleFileUploadOnly ===');
    Logger.log('Error message: ' + error.message);
    Logger.log('Error stack: ' + error.stack);
    return createResponse(false, 'Error: ' + error.toString());
  }
}

function formatNomorPesertaColumnAsText() {
  try {
    Logger.log('=== FORMAT NOMOR PESERTA COLUMN AS TEXT ===');
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // Get entire column B
    const range = sheet.getRange('B:B');
    
    // Set number format to TEXT
    range.setNumberFormat('@');
    
    Logger.log('✓ Column B formatted as TEXT');
    Logger.log('Note: Leading zeros akan tetap terjaga sekarang');
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
  }
}

function convertNomorPesertaWithLeadingZero(nomor) {
  // Convert "72" to "072" jika numeric
  // Jangan touch "K. 187" atau format dengan prefix
  
  if (!nomor) return nomor;
  
  const str = nomor.toString().trim();
  
  // Jika ada prefix (e.g., "K. 187", "F. 02")
  if (str.includes('.')) {
    return str; // Sudah punya prefix, return as-is
  }
  
  // Jika pure numeric, pad dengan leading zero
  if (!isNaN(str)) {
    const num = parseInt(str);
    return String(num).padStart(3, '0'); // "72" -> "072"
  }
  
  return str;
}

// ===== UPDATE FILE LINKS TANPA LOCK =====
function updateFileLinksInSheet(sheet, rowIndex, fileLinks) {
  try {
    Logger.log('=== UPDATE FILE LINKS START ===');
    Logger.log('Row Index: ' + rowIndex);
    Logger.log('File Links to update: ' + Object.keys(fileLinks).length);
    
    // Get all headers
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log('Total headers: ' + headers.length);
    
    // Create link mappings
    const linkMappings = {
      'doc1': 'Link - Doc Surat Mandat Personal',
      'doc2': 'Link - Doc KTP Personal',
      'doc3': 'Link - Doc Sertifikat Personal',
      'doc4': 'Link - Doc Rekening Personal',
      'doc5': 'Link - Doc Pas Photo Personal',
      'teamDoc1_1': 'Link - Doc Surat Mandat Team 1',
      'teamDoc1_2': 'Link - Doc KTP Team 1',
      'teamDoc1_3': 'Link - Doc Sertifikat Team 1',
      'teamDoc1_4': 'Link - Doc Rekening Team 1',
      'teamDoc1_5': 'Link - Doc Pas Photo Team 1',
      'teamDoc2_1': 'Link - Doc Surat Mandat Team 2',
      'teamDoc2_2': 'Link - Doc KTP Team 2',
      'teamDoc2_3': 'Link - Doc Sertifikat Team 2',
      'teamDoc2_4': 'Link - Doc Rekening Team 2',
      'teamDoc2_5': 'Link - Doc Pas Photo Team 2',
      'teamDoc3_1': 'Link - Doc Surat Mandat Team 3',
      'teamDoc3_2': 'Link - Doc KTP Team 3',
      'teamDoc3_3': 'Link - Doc Sertifikat Team 3',
      'teamDoc3_4': 'Link - Doc Rekening Team 3',
      'teamDoc3_5': 'Link - Doc Pas Photo Team 3'
    };
    
    // For each file link
    for (let fileKey in fileLinks) {
      const headerName = linkMappings[fileKey];
      
      if (!headerName) {
        Logger.log(`WARNING: No mapping found for fileKey: ${fileKey}`);
        continue;
      }
      
      // Find column index
      const colIndex = headers.indexOf(headerName);
      
      if (colIndex === -1) {
        Logger.log(`ERROR: Header "${headerName}" not found in sheet`);
        Logger.log('Available headers: ' + headers.join(' | '));
        continue;
      }
      
      Logger.log(`Found header "${headerName}" at column ${colIndex + 1}`);
      
      // Update cell
      const cell = sheet.getRange(rowIndex, colIndex + 1);
      const url = fileLinks[fileKey];
      
      Logger.log(`Setting ${fileKey} link: ${url}`);
      cell.setValue(url);
      
      // Optional: Add hyperlink formula untuk better UX
      // cell.setFormula(`=HYPERLINK("${url}", "📄 ${fileKey}")`);
      
      Logger.log(`✓ Updated ${fileKey} at row ${rowIndex}, column ${colIndex + 1}`);
    }
    
    Logger.log('=== UPDATE FILE LINKS SUCCESS ===');
    
  } catch (error) {
    Logger.log('=== ERROR in updateFileLinksInSheet ===');
    Logger.log('Error message: ' + error.message);
    Logger.log('Error stack: ' + error.stack);
    throw error;
  }
}

function debugListHeaders() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  Logger.log('=== ALL HEADERS ===');
  for (let i = 0; i < headers.length; i++) {
    Logger.log(`Column ${i + 1}: "${headers[i]}"`);
  }
  
  return headers;
}

function debugCheckRecentRegistration() {
  Logger.log('=== DEBUG CHECK RECENT REGISTRATION ===');
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found');
      return;
    }
    
    const lastRow = sheet.getLastRow();
    Logger.log('Last row: ' + lastRow);
    
    if (lastRow <= 1) {
      Logger.log('No data in sheet');
      return;
    }
    
    // Get last 3 rows data
    Logger.log('Last 3 registrations:');
    const dataRange = sheet.getRange(Math.max(2, lastRow - 2), 1, 3, 5);
    const data = dataRange.getValues();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      Logger.log(`Row ${lastRow - 2 + i}:`);
      Logger.log(`  No: ${row[0]}`);
      Logger.log(`  Nomor Peserta: "${row[1]}" (type: ${typeof row[1]})`);
      Logger.log(`  Timestamp: ${row[2]}`);
      Logger.log(`  Kecamatan: ${row[3]}`);
      Logger.log(`  Cabang: ${row[4]}`);
    }
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
  }
}

function debugCheckNomorPesertaDataType() {
  Logger.log('=== DEBUG NOMOR PESERTA DATA TYPE ===');
  
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    const lastRow = sheet.getLastRow();
    
    if (lastRow > 1) {
      // Get last 5 values dari column B
      const range = sheet.getRange(Math.max(2, lastRow - 4), 2, 5, 1);
      const values = range.getValues();
      
      Logger.log('Last 5 nomor peserta values:');
      values.forEach((row, idx) => {
        const val = row[0];
        Logger.log(`  Row ${Math.max(2, lastRow - 4) + idx}: "${val}"`);
        Logger.log(`    Type: ${typeof val}`);
        Logger.log(`    Constructor: ${val.constructor.name}`);
        Logger.log(`    String: "${val.toString()}"`);
        Logger.log(`    Trimmed: "${val.toString().trim()}"`);
        Logger.log(`    Length: ${val.toString().length}`);
      });
    }
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
  }
}

function debugCheckSpreadsheetStatus() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  Logger.log('=== SPREADSHEET DEBUG INFO ===');
  Logger.log('Sheet Name: ' + sheet.getName());
  Logger.log('Last Row: ' + sheet.getLastRow());
  Logger.log('Last Column: ' + sheet.getLastColumn());
  
  // Show last 5 rows nomor peserta
  if (sheet.getLastRow() > 1) {
    const range = sheet.getRange(Math.max(2, sheet.getLastRow() - 4), 2, 5, 1);
    const values = range.getValues();
    Logger.log('Last 5 nomor peserta:');
    for (let i = 0; i < values.length; i++) {
      Logger.log(`  Row ${Math.max(2, sheet.getLastRow() - 4) + i}: ${values[i][0]}`);
    }
  }
}

// ===== HELPER FUNCTIONS (SAMA SEPERTI SEBELUMNYA) =====

function generateNomorPeserta(sheet, cabangCode, genderCode, isTeam) {
  try {
    Logger.log('[LOCK] Generating nomor peserta for cabang: ' + cabangCode);
    
    const cabangInfo = CABANG_ORDER[cabangCode];
    if (!cabangInfo) {
      return { success: false, message: 'Kode cabang tidak valid' };
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
    
    Logger.log('[LOCK] Found ' + existingNumbers.length + ' existing numbers');
    
    let isOdd;
    if (genderCode === 'female' || genderCode === 'perempuan') {
      isOdd = true;
    } else {
      isOdd = false;
    }
    
    Logger.log('[LOCK] Gender: ' + genderCode + ', isOdd: ' + isOdd);
    
    let nextNumber;
    
    if (isOdd) {
      nextNumber = cabangInfo.start % 2 === 0 ? cabangInfo.start + 1 : cabangInfo.start;
    } else {
      nextNumber = cabangInfo.start % 2 === 0 ? cabangInfo.start : cabangInfo.start + 1;
    }

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
    
    let nomorPeserta;
    if (cabangInfo.prefix) {
      nomorPeserta = cabangInfo.prefix + '. ' + String(nextNumber).padStart(2, '0');
    } else {
      nomorPeserta = String(nextNumber).padStart(3, '0');
    }
    
    Logger.log('[LOCK] ✓ Generated nomor peserta: ' + nomorPeserta);
    
    return { success: true, number: nomorPeserta };
    
  } catch (error) {
    Logger.log('[LOCK] Error in generateNomorPeserta: ' + error.message);
    return { success: false, message: 'Terjadi kesalahan saat membuat nomor peserta. Silakan coba lagi.' };
  }
}

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
    
    const kecamatanCol = 3;
    const cabangCol = 4;
    const nikCol = 7;
    const member1NikCol = 19;
    const member2NikCol = 31;
    const member3NikCol = 43;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowKecamatan = row[kecamatanCol];
      const rowCabang = row[cabangCol];
      
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
              const message = `NIK ${trimmedNewNik} sudah terdaftar di Kecamatan "${rowKecamatan}", Cabang "${rowCabang}". Setiap peserta hanya boleh mendaftar satu kali di seluruh cabang lomba.`;
              Logger.log('DUPLICATE NIK FOUND: ' + message);
              return { isValid: false, message: message };
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
    'Link - Doc Rekening Team 3', 'Link - Doc Pas Photo Team 3', 'Status', 'Alasan Ditolak', 'Maqra', 'Penilaian'
  ];
  sheet.appendRow(headers);
}

function processFileUploads(e, formData, nomorPeserta) {
  const fileLinks = {};
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const timestamp = new Date().getTime();
  
  try {
    const allBlobs = e.parameters || e.parameter;
    Logger.log('Processing file blobs: ' + JSON.stringify(Object.keys(allBlobs)));
    
    for (let key in allBlobs) {
      // Skip non-file parameters
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
    
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    'Menunggu Verifikasi', '-'
  ];
  
  return rowData;
}

function updateRowStatus(rowIndex, newStatus, reason) {
  try {
    Logger.log('=== UPDATE ROW STATUS ===');
    Logger.log('Row Index: ' + rowIndex);
    Logger.log('New Status: ' + newStatus);
    Logger.log('Reason: ' + reason);
    
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
    
    Logger.log('Status Column: ' + statusIdx);
    Logger.log('Reason Column: ' + alasanIdx);
    Logger.log('Actual Row: ' + actualRow);
    
    if (actualRow > sheet.getLastRow()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Row tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Update status
    sheet.getRange(actualRow, statusIdx + 1).setValue(newStatus);
    Logger.log('✓ Status updated to: ' + newStatus);
    
    // Update reason jika ditolak
    if (newStatus === 'Ditolak' && alasanIdx !== -1) {
      sheet.getRange(actualRow, alasanIdx + 1).setValue(reason || '-');
      Logger.log('✓ Reason updated to: ' + (reason || '-'));
    } else if (alasanIdx !== -1) {
      sheet.getRange(actualRow, alasanIdx + 1).setValue('-');
      Logger.log('✓ Reason cleared');
    }
    
    Logger.log('=== UPDATE SUCCESS ===');
    
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
    Logger.log('=== DELETE ROW DATA ===');
    Logger.log('Row Index: ' + rowIndex);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const actualRow = rowIndex + 2;
    
    Logger.log('Actual Row: ' + actualRow);
    
    if (actualRow > sheet.getLastRow()) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Row tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    sheet.deleteRow(actualRow);
    Logger.log('✓ Row deleted');
    
    Logger.log('=== DELETE SUCCESS ===');
    
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

// Update doGet to handle checkJuriSubmission
function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'checkJuriSubmission') {
    return checkJuriSubmission(e.parameter.cabang, e.parameter.juri);
  } else if (action === 'getPesertaByCabang') {
    return getPesertaByCabang(e.parameter.cabang);
  } else if (action === 'getData') {
    return getAllDataAsJSON();
  } else if (action === 'getRejectedData') {
    return getRejectedDataAsJSON();
  } else if (action === 'getTakenMaqra') {
    return getTakenMaqraForBranch(e.parameter.branchCode);
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
    Logger.log('=== GET ALL DATA ===');
    
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
    
    Logger.log('Last Row: ' + lastRow + ', Last Col: ' + lastCol);
    
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        headers: [],
        data: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get headers
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const headers = headerRange.getValues()[0];
    
    Logger.log('Headers: ' + headers.length);
    
    // Get all data
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = dataRange.getValues();
    
    Logger.log('Total rows: ' + data.length);
    
    const response = {
      success: true,
      headers: headers,
      data: data,
      totalRows: data.length
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('Error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateCompleteRow(e) {
  try {
    Logger.log('=== UPDATE COMPLETE ROW ===');
    const rowIndex = parseInt(e.parameter.rowIndex);
    const updatedData = JSON.parse(e.parameter.updatedData);
    
    Logger.log('Row Index: ' + rowIndex);
    Logger.log('Updated Fields: ' + Object.keys(updatedData).length);
    
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
        Logger.log(`✓ Updated ${field} at row ${actualRow}, col ${colIndex + 1}`);
      } else {
        Logger.log(`WARNING: Column not found for field: ${field}`);
      }
    }
    
    Logger.log('=== UPDATE COMPLETE SUCCESS ===');
    
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
    
    const headerRange = sheet.getRange(1, 1, 1, lastCol);
    const headers = headerRange.getValues()[0];
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const allData = dataRange.getValues();
    
    const nomorPesertaIdx = headers.indexOf('Nomor Peserta');
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const kecamatanIdx = headers.indexOf('Kecamatan');
    const namaReguIdx = headers.indexOf('Nama Regu/Tim');
    const namaIdx = headers.indexOf('Nama Lengkap');
    const statusIdx = headers.indexOf('Status');
    const alasanIdx = headers.indexOf('Alasan Ditolak');
    
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
    Logger.log('Error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getTakenMaqraForBranch(branchCode) {
  try {
    Logger.log('=== GET TAKEN MAQRA ===');
    Logger.log('Branch Code: ' + branchCode);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        takenCodes: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const maqraIdx = headers.indexOf('Maqra');
    
    if (cabangIdx === -1 || maqraIdx === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Kolom tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    const takenCodes = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const cabang = row[cabangIdx];
      const maqra = row[maqraIdx];
      
      // Check if this row matches the branch
      if (cabang && cabang.toString().trim() !== '') {
        // Extract branch code from cabang name
        let rowBranchCode = extractBranchCodeFromName(cabang);
        
        if (rowBranchCode === branchCode && maqra && maqra !== '-' && maqra.toString().trim() !== '') {
          takenCodes.push(maqra.toString().trim());
        }
      }
    }
    
    Logger.log('Taken codes count: ' + takenCodes.length);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      takenCodes: takenCodes
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function isBranchEnabledForMaqra(branchCode) {
  return MAQRA_ENABLED_BRANCHES.indexOf(branchCode) !== -1;
}

function extractBranchCodeFromName(cabangName) {
  const branchMap = {
    'Tartil Al Qur\'an': 'TA',
    'Tilawah Anak-anak': 'TLA',
    'Tilawah Remaja': 'TLR',
    'Tilawah Dewasa': 'TLD',
    'Qira\'at Mujawwad': 'QM',
    'Hafalan 1 Juz': 'H1J',
    'Hafalan 5 Juz': 'H5J',
    'Hafalan 10 Juz': 'H10J',
    'Hafalan 20 Juz': 'H20J',
    'Hafalan 30 Juz': 'H30J',
    'Tafsir Indonesia': 'TFI',
    'Tafsir Arab': 'TFA',
    'Tafsir Inggris': 'TFE',
    'Fahm Al Qur\'an': 'FAQ',
    'Syarh Al Qur\'an': 'SAQ',
    'Kaligrafi Naskah': 'KN',
    'Kaligrafi Hiasan': 'KH',
    'Kaligrafi Dekorasi': 'KD',
    'Kaligrafi Kontemporer': 'KK',
    'KTIQ': 'KTIQ'
  };
  
  for (let key in branchMap) {
    if (cabangName.includes(key)) {
      return branchMap[key];
    }
  }
  
  return null;
}

// Draw maqra for a participant
function drawMaqraForParticipant(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  
  try {
    Logger.log('=== DRAW MAQRA START ===');
    
    // ===== CHECK TIME WINDOW FIRST =====
    if (!isMaqraDrawTimeActive()) {
      Logger.log('❌ Maqra draw not active');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Pengambilan maqra tidak aktif saat ini. Silakan coba pada waktu yang ditentukan.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const nomorPeserta = e.parameter.nomorPeserta;
    const rowIndex = parseInt(e.parameter.rowIndex);
    const branchCode = e.parameter.branchCode;
    
    Logger.log('Nomor Peserta: ' + nomorPeserta);
    Logger.log('Row Index: ' + rowIndex);
    Logger.log('Branch Code: ' + branchCode);
    
    // ===== CHECK BRANCH ENABLED =====
    if (!isBranchEnabledForMaqra(branchCode)) {
      Logger.log('❌ Branch not enabled for maqra');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Pengambilan maqra tidak diaktifkan untuk cabang ini'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Acquire lock
    lockAcquired = acquireLockWithRetry(lock, LOCK_TIMEOUT_MS, LOCK_WAIT_TIME_MS, MAX_LOCK_ATTEMPTS);
    
    if (!lockAcquired) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Server sibuk, coba lagi dalam beberapa detik'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const actualRow = rowIndex + 2;
    
    if (actualRow > sheet.getLastRow()) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Data tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const maqraIdx = headers.indexOf('Maqra');
    const statusIdx = headers.indexOf('Status');
    
    Logger.log('Maqra index: ' + maqraIdx);
    Logger.log('Status index: ' + statusIdx);
    
    if (maqraIdx === -1) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Kolom "Maqra" tidak ditemukan di spreadsheet'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ===== CHECK IF ALREADY HAS MAQRA =====
    const currentMaqra = sheet.getRange(actualRow, maqraIdx + 1).getValue();
    Logger.log('Current maqra value: "' + currentMaqra + '"');
    
    if (currentMaqra && currentMaqra !== '-' && currentMaqra.toString().trim() !== '') {
      lock.releaseLock();
      Logger.log('❌ Already has maqra: ' + currentMaqra);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Maqra sudah pernah diambil: ' + currentMaqra
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Check status
    const status = sheet.getRange(actualRow, statusIdx + 1).getValue();
    Logger.log('Status: ' + status);
    
    if (status !== 'Terverifikasi' && status !== 'Diterima' && status !== 'Verified') {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Peserta belum terverifikasi'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get all taken maqra codes
    const takenCodes = getTakenMaqraCodesSync(sheet, branchCode);
    Logger.log('Taken codes: ' + takenCodes.length);
    
    // Get maqra data for this branch
    const maqraData = getMaqraDataForBranch(branchCode);
    Logger.log('Total maqra for branch: ' + maqraData.length);
    
    if (!maqraData || maqraData.length === 0) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Data maqra tidak ditemukan untuk cabang ini'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Filter available maqra
    const availableMaqra = maqraData.filter(function(m) {
      return takenCodes.indexOf(m.code) === -1;
    });
    
    Logger.log('Available maqra: ' + availableMaqra.length);
    
    if (availableMaqra.length === 0) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Semua maqra sudah terambil'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Random draw
    const randomIndex = Math.floor(Math.random() * availableMaqra.length);
    const drawnMaqra = availableMaqra[randomIndex];
    
    Logger.log('Drawn maqra: ' + drawnMaqra.code);
    
    // Save to sheet - format: "Surat ayat X-Y"
    const maqraText = drawnMaqra.surat + ' ayat ' + drawnMaqra.ayat;
    sheet.getRange(actualRow, maqraIdx + 1).setValue(maqraText);
    Logger.log('Maqra saved: ' + maqraText);
    
    lock.releaseLock();
    lockAcquired = false;
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Maqra berhasil diambil',
      drawnMaqra: drawnMaqra
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.message);
    Logger.log('Stack: ' + error.stack);
    if (lockAcquired) {
      lock.releaseLock();
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Terjadi kesalahan: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getTakenMaqraCodesSync(sheet, branchCode) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cabangIdx = headers.indexOf('Cabang Lomba');
  const maqraIdx = headers.indexOf('Maqra');
  
  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const data = dataRange.getValues();
  
  const takenCodes = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const cabang = row[cabangIdx];
    const maqra = row[maqraIdx];
    
    if (cabang && cabang.toString().trim() !== '') {
      let rowBranchCode = extractBranchCodeFromName(cabang);
      
      if (rowBranchCode === branchCode && maqra && maqra !== '-' && maqra.toString().trim() !== '') {
        takenCodes.push(maqra.toString().trim());
      }
    }
  }
  
  return takenCodes;
}

function getMaqraDataForBranch(branchCode) {
  // IMPORTANT: This must match exactly with maqraConfig.js
  const maqraDatabase = {
  'TA': [
    { code: 'TA001', surat: 'Al-Fatihah', ayat: '83-86' },
    { code: 'TA002', surat: 'Al-Baqarah', ayat: '54-58' },
    { code: 'TA003', surat: 'Ali Imran', ayat: '155-162' },
    { code: 'TA004', surat: 'An-Nisa', ayat: '10-18' },
    { code: 'TA005', surat: 'Al-Maidah', ayat: '163-171' },
    { code: 'TA006', surat: 'Al-An\'am', ayat: '118-125' },
    { code: 'TA007', surat: 'Al-A\'raf', ayat: '85-90' },
    { code: 'TA008', surat: 'Al-Anfal', ayat: '38-42' },
    { code: 'TA009', surat: 'At-Taubah', ayat: '113-123' },
    { code: 'TA010', surat: 'Yunus', ayat: '143-152' },
    { code: 'TA011', surat: 'Hud', ayat: '109-119' },
    { code: 'TA012', surat: 'Yusuf', ayat: '109-119' },
    { code: 'TA013', surat: 'Ar-Ra\'d', ayat: '67-76' },
    { code: 'TA014', surat: 'Ibrahim', ayat: '53-62' },
    { code: 'TA015', surat: 'Al-Hijr', ayat: '28-35' },
    { code: 'TA016', surat: 'An-Nahl', ayat: '179-186' },
    { code: 'TA017', surat: 'Al-Isra', ayat: '168-176' },
    { code: 'TA018', surat: 'Al-Kahf', ayat: '175-181' },
    { code: 'TA019', surat: 'Maryam', ayat: '15-23' },
    { code: 'TA020', surat: 'Taha', ayat: '99-107' },
    { code: 'TA021', surat: 'Al-Anbiya', ayat: '138-146' },
    { code: 'TA022', surat: 'Al-Hajj', ayat: '31-37' },
    { code: 'TA023', surat: 'Al-Mu\'minun', ayat: '175-179' },
    { code: 'TA024', surat: 'An-Nur', ayat: '72-79' },
    { code: 'TA025', surat: 'Al-Furqan', ayat: '131-140' },
    { code: 'TA026', surat: 'Ash-Shu\'ara', ayat: '170-177' },
    { code: 'TA027', surat: 'An-Naml', ayat: '102-110' },
    { code: 'TA028', surat: 'Al-Qasas', ayat: '129-132' },
    { code: 'TA029', surat: 'Al-Ankabut', ayat: '14-21' },
    { code: 'TA030', surat: 'Ar-Rum', ayat: '115-123' },
    { code: 'TA031', surat: 'Luqman', ayat: '124-130' },
    { code: 'TA032', surat: 'As-Sajdah', ayat: '136-139' },
    { code: 'TA033', surat: 'Al-Ahzab', ayat: '116-123' },
    { code: 'TA034', surat: 'Saba', ayat: '107-115' },
    { code: 'TA035', surat: 'Fatir', ayat: '147-157' },
    { code: 'TA036', surat: 'Ya-Sin', ayat: '126-130' },
    { code: 'TA037', surat: 'As-Saffat', ayat: '4-11' },
    { code: 'TA038', surat: 'Sad', ayat: '121-125' },
    { code: 'TA039', surat: 'Az-Zumar', ayat: '135-140' },
    { code: 'TA040', surat: 'Ghafir', ayat: '34-43' },
    { code: 'TA041', surat: 'Fussilat', ayat: '40-48' },
    { code: 'TA042', surat: 'Ash-Shura', ayat: '67-74' },
    { code: 'TA043', surat: 'Az-Zukhruf', ayat: '41-44' },
    { code: 'TA044', surat: 'Ad-Dukhan', ayat: '116-126' },
    { code: 'TA045', surat: 'Al-Jathiyah', ayat: '135-144' },
    { code: 'TA046', surat: 'Al-Ahqaf', ayat: '163-166' },
    { code: 'TA047', surat: 'Muhammad', ayat: '68-73' },
    { code: 'TA048', surat: 'Al-Fath', ayat: '1-9' },
    { code: 'TA049', surat: 'Al-Hujurat', ayat: '61-70' },
    { code: 'TA050', surat: 'Qaf', ayat: '80-87' },
    { code: 'TA051', surat: 'Adh-Dhariyat', ayat: '131-140' },
    { code: 'TA052', surat: 'At-Tur', ayat: '36-40' },
    { code: 'TA053', surat: 'An-Najm', ayat: '11-21' },
    { code: 'TA054', surat: 'Al-Qamar', ayat: '35-41' },
    { code: 'TA055', surat: 'Ar-Rahman', ayat: '122-128' },
    { code: 'TA056', surat: 'Al-Waqi\'ah', ayat: '67-76' },
    { code: 'TA057', surat: 'Al-Hadid', ayat: '87-96' },
    { code: 'TA058', surat: 'Al-Mujadilah', ayat: '81-85' },
    { code: 'TA059', surat: 'Al-Hashr', ayat: '113-122' },
    { code: 'TA060', surat: 'Al-Mumtahanah', ayat: '172-180' },
    { code: 'TA061', surat: 'As-Saff', ayat: '19-24' },
    { code: 'TA062', surat: 'Al-Jumu\'ah', ayat: '151-158' },
  ],
  'TLA': [
    { code: 'TLA063', surat: 'Al-Munafiqun', ayat: '116-123' },
    { code: 'TLA064', surat: 'At-Taghabun', ayat: '69-76' },
    { code: 'TLA065', surat: 'At-Talaq', ayat: '68-76' },
    { code: 'TLA066', surat: 'At-Tahrim', ayat: '117-122' },
    { code: 'TLA067', surat: 'Al-Mulk', ayat: '6-16' },
    { code: 'TLA068', surat: 'Al-Qalam', ayat: '57-63' },
    { code: 'TLA069', surat: 'Al-Haqqah', ayat: '46-56' },
    { code: 'TLA070', surat: 'Al-Ma\'arij', ayat: '81-91' },
    { code: 'TLA071', surat: 'Nuh', ayat: '43-49' },
    { code: 'TLA072', surat: 'Al-Jinn', ayat: '98-102' },
    { code: 'TLA073', surat: 'Al-Muzzammil', ayat: '129-132' },
    { code: 'TLA074', surat: 'Al-Muddaththir', ayat: '116-120' },
    { code: 'TLA075', surat: 'Al-Qiyamah', ayat: '155-162' },
    { code: 'TLA076', surat: 'Al-Insan', ayat: '138-142' },
    { code: 'TLA077', surat: 'Al-Mursalat', ayat: '102-106' },
    { code: 'TLA078', surat: 'An-Naba', ayat: '69-78' },
    { code: 'TLA079', surat: 'An-Nazi\'at', ayat: '137-141' },
    { code: 'TLA080', surat: 'Abasa', ayat: '109-115' },
    { code: 'TLA081', surat: 'At-Takwir', ayat: '33-39' },
    { code: 'TLA082', surat: 'Al-Infitar', ayat: '113-116' },
    { code: 'TLA083', surat: 'Al-Mutaffifin', ayat: '178-181' },
    { code: 'TLA084', surat: 'Al-Inshiqaq', ayat: '128-131' },
    { code: 'TLA085', surat: 'Al-Buruj', ayat: '144-148' },
    { code: 'TLA086', surat: 'At-Tariq', ayat: '147-154' },
    { code: 'TLA087', surat: 'Al-A\'la', ayat: '144-154' },
    { code: 'TLA088', surat: 'Al-Ghashiyah', ayat: '94-101' },
    { code: 'TLA089', surat: 'Al-Fajr', ayat: '46-50' },
    { code: 'TLA090', surat: 'Al-Balad', ayat: '94-99' },
    { code: 'TLA091', surat: 'Ash-Shams', ayat: '33-40' },
    { code: 'TLA092', surat: 'Al-Lail', ayat: '80-86' },
    { code: 'TLA093', surat: 'Ad-Duha', ayat: '169-172' },
    { code: 'TLA094', surat: 'Ash-Sharh', ayat: '58-65' },
    { code: 'TLA095', surat: 'At-Tin', ayat: '174-182' },
    { code: 'TLA096', surat: 'Al-\'Alaq', ayat: '61-65' },
    { code: 'TLA097', surat: 'Al-Qadr', ayat: '28-36' },
    { code: 'TLA098', surat: 'Al-Bayyinah', ayat: '129-132' },
    { code: 'TLA099', surat: 'Az-Zalzalah', ayat: '163-169' },
    { code: 'TLA100', surat: 'Al-Adiyat', ayat: '120-125' },
    { code: 'TLA101', surat: 'Al-Qari\'ah', ayat: '157-164' },
    { code: 'TLA102', surat: 'At-Takathur', ayat: '17-22' },
    { code: 'TLA103', surat: 'Al-Asr', ayat: '70-73' },
    { code: 'TLA104', surat: 'Al-Humazah', ayat: '58-61' },
    { code: 'TLA105', surat: 'Al-Fil', ayat: '101-104' },
    { code: 'TLA106', surat: 'Quraish', ayat: '117-121' },
    { code: 'TLA107', surat: 'Al-Ma\'un', ayat: '17-21' },
    { code: 'TLA108', surat: 'Al-Kawthar', ayat: '61-66' },
    { code: 'TLA109', surat: 'Al-Kafirun', ayat: '103-107' },
    { code: 'TLA110', surat: 'An-Nasr', ayat: '31-38' },
    { code: 'TLA111', surat: 'Al-Lahab', ayat: '19-26' },
    { code: 'TLA112', surat: 'Al-Ikhlas', ayat: '43-49' },
    { code: 'TLA113', surat: 'Al-Falaq', ayat: '123-132' },
    { code: 'TLA114', surat: 'An-Nas', ayat: '102-108' },
    { code: 'TLA115', surat: 'Al-Fatihah', ayat: '117-124' },
    { code: 'TLA116', surat: 'Al-Baqarah', ayat: '155-160' },
    { code: 'TLA117', surat: 'Ali Imran', ayat: '173-176' },
    { code: 'TLA118', surat: 'An-Nisa', ayat: '80-86' },
    { code: 'TLA119', surat: 'Al-Maidah', ayat: '30-38' },
    { code: 'TLA120', surat: 'Al-An\'am', ayat: '121-125' },
    { code: 'TLA121', surat: 'Al-A\'raf', ayat: '43-46' },
    { code: 'TLA122', surat: 'Al-Anfal', ayat: '33-43' },
    { code: 'TLA123', surat: 'At-Taubah', ayat: '129-134' },
    { code: 'TLA124', surat: 'Yunus', ayat: '158-167' },
  ],
  'TLR': [
    { code: 'TLR125', surat: 'Hud', ayat: '113-119' },
    { code: 'TLR126', surat: 'Yusuf', ayat: '109-116' },
    { code: 'TLR127', surat: 'Ar-Ra\'d', ayat: '50-53' },
    { code: 'TLR128', surat: 'Ibrahim', ayat: '70-75' },
    { code: 'TLR129', surat: 'Al-Hijr', ayat: '15-18' },
    { code: 'TLR130', surat: 'An-Nahl', ayat: '101-105' },
    { code: 'TLR131', surat: 'Al-Isra', ayat: '135-141' },
    { code: 'TLR132', surat: 'Al-Kahf', ayat: '120-130' },
    { code: 'TLR133', surat: 'Maryam', ayat: '122-129' },
    { code: 'TLR134', surat: 'Taha', ayat: '77-87' },
    { code: 'TLR135', surat: 'Al-Anbiya', ayat: '92-95' },
    { code: 'TLR136', surat: 'Al-Hajj', ayat: '92-96' },
    { code: 'TLR137', surat: 'Al-Mu\'minun', ayat: '13-20' },
    { code: 'TLR138', surat: 'An-Nur', ayat: '177-185' },
    { code: 'TLR139', surat: 'Al-Furqan', ayat: '156-166' },
    { code: 'TLR140', surat: 'Ash-Shu\'ara', ayat: '149-158' },
    { code: 'TLR141', surat: 'An-Naml', ayat: '173-179' },
    { code: 'TLR142', surat: 'Al-Qasas', ayat: '133-142' },
    { code: 'TLR143', surat: 'Al-Ankabut', ayat: '97-103' },
    { code: 'TLR144', surat: 'Ar-Rum', ayat: '18-26' },
    { code: 'TLR145', surat: 'Luqman', ayat: '28-35' },
    { code: 'TLR146', surat: 'As-Sajdah', ayat: '130-138' },
    { code: 'TLR147', surat: 'Al-Ahzab', ayat: '50-56' },
    { code: 'TLR148', surat: 'Saba', ayat: '123-127' },
    { code: 'TLR149', surat: 'Fatir', ayat: '122-127' },
    { code: 'TLR150', surat: 'Ya-Sin', ayat: '71-80' },
    { code: 'TLR151', surat: 'As-Saffat', ayat: '160-168' },
    { code: 'TLR152', surat: 'Sad', ayat: '48-55' },
    { code: 'TLR153', surat: 'Az-Zumar', ayat: '12-16' },
    { code: 'TLR154', surat: 'Ghafir', ayat: '11-18' },
    { code: 'TLR155', surat: 'Fussilat', ayat: '82-92' },
    { code: 'TLR156', surat: 'Ash-Shura', ayat: '24-29' },
    { code: 'TLR157', surat: 'Az-Zukhruf', ayat: '158-166' },
    { code: 'TLR158', surat: 'Ad-Dukhan', ayat: '177-180' },
    { code: 'TLR159', surat: 'Al-Jathiyah', ayat: '70-77' },
    { code: 'TLR160', surat: 'Al-Ahqaf', ayat: '106-113' },
    { code: 'TLR161', surat: 'Muhammad', ayat: '107-114' },
    { code: 'TLR162', surat: 'Al-Fath', ayat: '32-37' },
    { code: 'TLR163', surat: 'Al-Hujurat', ayat: '120-130' },
    { code: 'TLR164', surat: 'Qaf', ayat: '56-60' },
    { code: 'TLR165', surat: 'Adh-Dhariyat', ayat: '114-123' },
    { code: 'TLR166', surat: 'At-Tur', ayat: '7-16' },
    { code: 'TLR167', surat: 'An-Najm', ayat: '146-151' },
    { code: 'TLR168', surat: 'Al-Qamar', ayat: '13-22' },
    { code: 'TLR169', surat: 'Ar-Rahman', ayat: '164-171' },
    { code: 'TLR170', surat: 'Al-Waqi\'ah', ayat: '125-130' },
    { code: 'TLR171', surat: 'Al-Hadid', ayat: '124-130' },
    { code: 'TLR172', surat: 'Al-Mujadilah', ayat: '82-88' },
    { code: 'TLR173', surat: 'Al-Hashr', ayat: '170-175' },
    { code: 'TLR174', surat: 'Al-Mumtahanah', ayat: '83-86' },
    { code: 'TLR175', surat: 'As-Saff', ayat: '163-167' },
    { code: 'TLR176', surat: 'Al-Jumu\'ah', ayat: '123-126' },
    { code: 'TLR177', surat: 'Al-Munafiqun', ayat: '177-181' },
    { code: 'TLR178', surat: 'At-Taghabun', ayat: '21-29' },
    { code: 'TLR179', surat: 'At-Talaq', ayat: '122-132' },
    { code: 'TLR180', surat: 'At-Tahrim', ayat: '135-143' },
    { code: 'TLR181', surat: 'Al-Mulk', ayat: '37-42' },
    { code: 'TLR182', surat: 'Al-Qalam', ayat: '40-43' },
    { code: 'TLR183', surat: 'Al-Haqqah', ayat: '48-51' },
    { code: 'TLR184', surat: 'Al-Ma\'arij', ayat: '46-50' },
    { code: 'TLR185', surat: 'Nuh', ayat: '22-28' },
    { code: 'TLR186', surat: 'Al-Jinn', ayat: '118-125' },
  ],
  'TLD': [
    { code: 'TLD187', surat: 'Al-Muzzammil', ayat: '147-150' },
    { code: 'TLD188', surat: 'Al-Muddaththir', ayat: '99-109' },
    { code: 'TLD189', surat: 'Al-Qiyamah', ayat: '110-118' },
    { code: 'TLD190', surat: 'Al-Insan', ayat: '151-157' },
    { code: 'TLD191', surat: 'Al-Mursalat', ayat: '147-151' },
    { code: 'TLD192', surat: 'An-Naba', ayat: '92-96' },
    { code: 'TLD193', surat: 'An-Nazi\'at', ayat: '138-147' },
    { code: 'TLD194', surat: 'Abasa', ayat: '114-119' },
    { code: 'TLD195', surat: 'At-Takwir', ayat: '96-100' },
    { code: 'TLD196', surat: 'Al-Infitar', ayat: '104-111' },
    { code: 'TLD197', surat: 'Al-Mutaffifin', ayat: '1-5' },
    { code: 'TLD198', surat: 'Al-Inshiqaq', ayat: '39-42' },
    { code: 'TLD199', surat: 'Al-Buruj', ayat: '25-35' },
    { code: 'TLD200', surat: 'At-Tariq', ayat: '33-43' },
    { code: 'TLD201', surat: 'Al-A\'la', ayat: '98-106' },
    { code: 'TLD202', surat: 'Al-Ghashiyah', ayat: '27-30' },
    { code: 'TLD203', surat: 'Al-Fajr', ayat: '89-96' },
    { code: 'TLD204', surat: 'Al-Balad', ayat: '178-183' },
    { code: 'TLD205', surat: 'Ash-Shams', ayat: '174-184' },
    { code: 'TLD206', surat: 'Al-Lail', ayat: '88-96' },
    { code: 'TLD207', surat: 'Ad-Duha', ayat: '135-143' },
    { code: 'TLD208', surat: 'Ash-Sharh', ayat: '26-32' },
    { code: 'TLD209', surat: 'At-Tin', ayat: '86-89' },
    { code: 'TLD210', surat: 'Al-\'Alaq', ayat: '119-122' },
    { code: 'TLD211', surat: 'Al-Qadr', ayat: '78-83' },
    { code: 'TLD212', surat: 'Al-Bayyinah', ayat: '143-150' },
    { code: 'TLD213', surat: 'Az-Zalzalah', ayat: '164-171' },
    { code: 'TLD214', surat: 'Al-Adiyat', ayat: '73-79' },
    { code: 'TLD215', surat: 'Al-Qari\'ah', ayat: '86-90' },
    { code: 'TLD216', surat: 'At-Takathur', ayat: '101-109' },
    { code: 'TLD217', surat: 'Al-Asr', ayat: '124-129' },
    { code: 'TLD218', surat: 'Al-Humazah', ayat: '59-64' },
    { code: 'TLD219', surat: 'Al-Fil', ayat: '11-20' },
    { code: 'TLD220', surat: 'Quraish', ayat: '118-121' },
    { code: 'TLD221', surat: 'Al-Ma\'un', ayat: '18-24' },
    { code: 'TLD222', surat: 'Al-Kawthar', ayat: '128-133' },
    { code: 'TLD223', surat: 'Al-Kafirun', ayat: '23-28' },
    { code: 'TLD224', surat: 'An-Nasr', ayat: '155-163' },
    { code: 'TLD225', surat: 'Al-Lahab', ayat: '144-150' },
    { code: 'TLD226', surat: 'Al-Ikhlas', ayat: '80-85' },
    { code: 'TLD227', surat: 'Al-Falaq', ayat: '42-46' },
    { code: 'TLD228', surat: 'An-Nas', ayat: '157-164' },
    { code: 'TLD229', surat: 'Al-Fatihah', ayat: '133-138' },
    { code: 'TLD230', surat: 'Al-Baqarah', ayat: '31-39' },
    { code: 'TLD231', surat: 'Ali Imran', ayat: '9-17' },
    { code: 'TLD232', surat: 'An-Nisa', ayat: '62-72' },
    { code: 'TLD233', surat: 'Al-Maidah', ayat: '158-163' },
    { code: 'TLD234', surat: 'Al-An\'am', ayat: '85-94' },
    { code: 'TLD235', surat: 'Al-A\'raf', ayat: '61-67' },
    { code: 'TLD236', surat: 'Al-Anfal', ayat: '74-83' },
    { code: 'TLD237', surat: 'At-Taubah', ayat: '84-94' },
    { code: 'TLD238', surat: 'Yunus', ayat: '113-120' },
    { code: 'TLD239', surat: 'Hud', ayat: '167-175' },
    { code: 'TLD240', surat: 'Yusuf', ayat: '70-80' },
    { code: 'TLD241', surat: 'Ar-Ra\'d', ayat: '158-161' },
    { code: 'TLD242', surat: 'Ibrahim', ayat: '163-168' },
    { code: 'TLD243', surat: 'Al-Hijr', ayat: '47-57' },
    { code: 'TLD244', surat: 'An-Nahl', ayat: '177-184' },
    { code: 'TLD245', surat: 'Al-Isra', ayat: '90-93' },
    { code: 'TLD246', surat: 'Al-Kahf', ayat: '108-113' },
    { code: 'TLD247', surat: 'Maryam', ayat: '159-169' },
    { code: 'TLD248', surat: 'Taha', ayat: '166-171' },
  ],
  'QM': [
    { code: 'QM249', surat: 'Al-Anbiya', ayat: '75-83' },
    { code: 'QM250', surat: 'Al-Hajj', ayat: '64-68' },
    { code: 'QM251', surat: 'Al-Mu\'minun', ayat: '117-127' },
    { code: 'QM252', surat: 'An-Nur', ayat: '101-110' },
    { code: 'QM253', surat: 'Al-Furqan', ayat: '42-49' },
    { code: 'QM254', surat: 'Ash-Shu\'ara', ayat: '40-50' },
    { code: 'QM255', surat: 'An-Naml', ayat: '106-115' },
    { code: 'QM256', surat: 'Al-Qasas', ayat: '160-165' },
    { code: 'QM257', surat: 'Al-Ankabut', ayat: '91-101' },
    { code: 'QM258', surat: 'Ar-Rum', ayat: '100-103' },
    { code: 'QM259', surat: 'Luqman', ayat: '120-129' },
    { code: 'QM260', surat: 'As-Sajdah', ayat: '124-131' },
    { code: 'QM261', surat: 'Al-Ahzab', ayat: '73-83' },
    { code: 'QM262', surat: 'Saba', ayat: '36-42' },
    { code: 'QM263', surat: 'Fatir', ayat: '174-180' },
    { code: 'QM264', surat: 'Ya-Sin', ayat: '118-125' },
    { code: 'QM265', surat: 'As-Saffat', ayat: '145-154' },
    { code: 'QM266', surat: 'Sad', ayat: '19-24' },
    { code: 'QM267', surat: 'Az-Zumar', ayat: '168-174' },
    { code: 'QM268', surat: 'Ghafir', ayat: '108-111' },
    { code: 'QM269', surat: 'Fussilat', ayat: '54-61' },
    { code: 'QM270', surat: 'Ash-Shura', ayat: '121-126' },
    { code: 'QM271', surat: 'Az-Zukhruf', ayat: '70-75' },
    { code: 'QM272', surat: 'Ad-Dukhan', ayat: '111-114' },
    { code: 'QM273', surat: 'Al-Jathiyah', ayat: '4-11' },
    { code: 'QM274', surat: 'Al-Ahqaf', ayat: '86-90' },
    { code: 'QM275', surat: 'Muhammad', ayat: '130-135' },
    { code: 'QM276', surat: 'Al-Fath', ayat: '173-180' },
    { code: 'QM277', surat: 'Al-Hujurat', ayat: '13-23' },
    { code: 'QM278', surat: 'Qaf', ayat: '23-31' },
    { code: 'QM279', surat: 'Adh-Dhariyat', ayat: '50-60' },
    { code: 'QM280', surat: 'At-Tur', ayat: '28-31' },
    { code: 'QM281', surat: 'An-Najm', ayat: '117-123' },
    { code: 'QM282', surat: 'Al-Qamar', ayat: '161-165' },
    { code: 'QM283', surat: 'Ar-Rahman', ayat: '117-123' },
    { code: 'QM284', surat: 'Al-Waqi\'ah', ayat: '148-151' },
    { code: 'QM285', surat: 'Al-Hadid', ayat: '168-172' },
    { code: 'QM286', surat: 'Al-Mujadilah', ayat: '169-178' },
    { code: 'QM287', surat: 'Al-Hashr', ayat: '83-88' },
    { code: 'QM288', surat: 'Al-Mumtahanah', ayat: '117-122' },
    { code: 'QM289', surat: 'As-Saff', ayat: '99-109' },
    { code: 'QM290', surat: 'Al-Jumu\'ah', ayat: '148-154' },
    { code: 'QM291', surat: 'Al-Munafiqun', ayat: '25-35' },
    { code: 'QM292', surat: 'At-Taghabun', ayat: '8-17' },
    { code: 'QM293', surat: 'At-Talaq', ayat: '140-147' },
    { code: 'QM294', surat: 'At-Tahrim', ayat: '74-82' },
    { code: 'QM295', surat: 'Al-Mulk', ayat: '21-31' },
    { code: 'QM296', surat: 'Al-Qalam', ayat: '98-104' },
    { code: 'QM297', surat: 'Al-Haqqah', ayat: '16-21' },
    { code: 'QM298', surat: 'Al-Ma\'arij', ayat: '52-58' },
    { code: 'QM299', surat: 'Nuh', ayat: '163-171' },
    { code: 'QM300', surat: 'Al-Jinn', ayat: '167-175' },
    { code: 'QM301', surat: 'Al-Muzzammil', ayat: '107-116' },
    { code: 'QM302', surat: 'Al-Muddaththir', ayat: '27-32' },
    { code: 'QM303', surat: 'Al-Qiyamah', ayat: '15-20' },
    { code: 'QM304', surat: 'Al-Insan', ayat: '153-159' },
    { code: 'QM305', surat: 'Al-Mursalat', ayat: '142-152' },
    { code: 'QM306', surat: 'An-Naba', ayat: '7-14' },
    { code: 'QM307', surat: 'An-Nazi\'at', ayat: '75-83' },
    { code: 'QM308', surat: 'Abasa', ayat: '103-110' },
    { code: 'QM309', surat: 'At-Takwir', ayat: '176-182' },
    { code: 'QM310', surat: 'Al-Infitar', ayat: '149-153' },
  ],
  'H1J': [
    { code: 'H1J311', surat: 'Al-Mutaffifin', ayat: '160-163' },
    { code: 'H1J312', surat: 'Al-Inshiqaq', ayat: '136-142' },
    { code: 'H1J313', surat: 'Al-Buruj', ayat: '99-104' },
    { code: 'H1J314', surat: 'At-Tariq', ayat: '164-173' },
    { code: 'H1J315', surat: 'Al-A\'la', ayat: '59-67' },
    { code: 'H1J316', surat: 'Al-Ghashiyah', ayat: '18-23' },
    { code: 'H1J317', surat: 'Al-Fajr', ayat: '38-48' },
    { code: 'H1J318', surat: 'Al-Balad', ayat: '14-19' },
    { code: 'H1J319', surat: 'Ash-Shams', ayat: '71-78' },
    { code: 'H1J320', surat: 'Al-Lail', ayat: '66-71' },
    { code: 'H1J321', surat: 'Ad-Duha', ayat: '6-11' },
    { code: 'H1J322', surat: 'Ash-Sharh', ayat: '1-9' },
    { code: 'H1J323', surat: 'At-Tin', ayat: '45-54' },
    { code: 'H1J324', surat: 'Al-\'Alaq', ayat: '81-89' },
    { code: 'H1J325', surat: 'Al-Qadr', ayat: '121-127' },
    { code: 'H1J326', surat: 'Al-Bayyinah', ayat: '132-141' },
    { code: 'H1J327', surat: 'Az-Zalzalah', ayat: '115-125' },
    { code: 'H1J328', surat: 'Al-Adiyat', ayat: '133-140' },
    { code: 'H1J329', surat: 'Al-Qari\'ah', ayat: '119-129' },
    { code: 'H1J330', surat: 'At-Takathur', ayat: '89-99' },
    { code: 'H1J331', surat: 'Al-Asr', ayat: '46-52' },
    { code: 'H1J332', surat: 'Al-Humazah', ayat: '129-136' },
    { code: 'H1J333', surat: 'Al-Fil', ayat: '10-14' },
    { code: 'H1J334', surat: 'Quraish', ayat: '86-95' },
    { code: 'H1J335', surat: 'Al-Ma\'un', ayat: '77-82' },
    { code: 'H1J336', surat: 'Al-Kawthar', ayat: '122-130' },
    { code: 'H1J337', surat: 'Al-Kafirun', ayat: '123-128' },
    { code: 'H1J338', surat: 'An-Nasr', ayat: '161-171' },
    { code: 'H1J339', surat: 'Al-Lahab', ayat: '16-25' },
    { code: 'H1J340', surat: 'Al-Ikhlas', ayat: '44-48' },
    { code: 'H1J341', surat: 'Al-Falaq', ayat: '5-12' },
    { code: 'H1J342', surat: 'An-Nas', ayat: '14-24' },
    { code: 'H1J343', surat: 'Al-Fatihah', ayat: '119-124' },
    { code: 'H1J344', surat: 'Al-Baqarah', ayat: '87-94' },
    { code: 'H1J345', surat: 'Ali Imran', ayat: '116-122' },
    { code: 'H1J346', surat: 'An-Nisa', ayat: '85-92' },
    { code: 'H1J347', surat: 'Al-Maidah', ayat: '21-25' },
    { code: 'H1J348', surat: 'Al-An\'am', ayat: '137-143' },
    { code: 'H1J349', surat: 'Al-A\'raf', ayat: '79-88' },
    { code: 'H1J350', surat: 'Al-Anfal', ayat: '92-97' },
    { code: 'H1J351', surat: 'At-Taubah', ayat: '160-163' },
    { code: 'H1J352', surat: 'Yunus', ayat: '59-69' },
    { code: 'H1J353', surat: 'Hud', ayat: '134-137' },
    { code: 'H1J354', surat: 'Yusuf', ayat: '169-179' },
    { code: 'H1J355', surat: 'Ar-Ra\'d', ayat: '63-66' },
    { code: 'H1J356', surat: 'Ibrahim', ayat: '154-162' },
    { code: 'H1J357', surat: 'Al-Hijr', ayat: '165-175' },
    { code: 'H1J358', surat: 'An-Nahl', ayat: '36-45' },
    { code: 'H1J359', surat: 'Al-Isra', ayat: '38-48' },
    { code: 'H1J360', surat: 'Al-Kahf', ayat: '103-108' },
    { code: 'H1J361', surat: 'Maryam', ayat: '120-126' },
    { code: 'H1J362', surat: 'Taha', ayat: '95-102' },
    { code: 'H1J363', surat: 'Al-Anbiya', ayat: '25-31' },
    { code: 'H1J364', surat: 'Al-Hajj', ayat: '65-69' },
    { code: 'H1J365', surat: 'Al-Mu\'minun', ayat: '125-134' },
    { code: 'H1J366', surat: 'An-Nur', ayat: '92-100' },
    { code: 'H1J367', surat: 'Al-Furqan', ayat: '129-132' },
    { code: 'H1J368', surat: 'Ash-Shu\'ara', ayat: '167-176' },
    { code: 'H1J369', surat: 'An-Naml', ayat: '154-160' },
    { code: 'H1J370', surat: 'Al-Qasas', ayat: '106-116' },
    { code: 'H1J371', surat: 'Al-Ankabut', ayat: '134-138' },
    { code: 'H1J372', surat: 'Ar-Rum', ayat: '180-185' },
  ],
  'H5J': [
    { code: 'H5J373', surat: 'Luqman', ayat: '127-137' },
    { code: 'H5J374', surat: 'As-Sajdah', ayat: '60-70' },
    { code: 'H5J375', surat: 'Al-Ahzab', ayat: '133-141' },
    { code: 'H5J376', surat: 'Saba', ayat: '36-40' },
    { code: 'H5J377', surat: 'Fatir', ayat: '33-43' },
    { code: 'H5J378', surat: 'Ya-Sin', ayat: '177-180' },
    { code: 'H5J379', surat: 'As-Saffat', ayat: '104-109' },
    { code: 'H5J380', surat: 'Sad', ayat: '61-65' },
    { code: 'H5J381', surat: 'Az-Zumar', ayat: '65-75' },
    { code: 'H5J382', surat: 'Ghafir', ayat: '9-19' },
    { code: 'H5J383', surat: 'Fussilat', ayat: '65-68' },
    { code: 'H5J384', surat: 'Ash-Shura', ayat: '147-150' },
    { code: 'H5J385', surat: 'Az-Zukhruf', ayat: '137-144' },
    { code: 'H5J386', surat: 'Ad-Dukhan', ayat: '111-120' },
    { code: 'H5J387', surat: 'Al-Jathiyah', ayat: '16-19' },
    { code: 'H5J388', surat: 'Al-Ahqaf', ayat: '86-91' },
    { code: 'H5J389', surat: 'Muhammad', ayat: '19-23' },
    { code: 'H5J390', surat: 'Al-Fath', ayat: '175-179' },
    { code: 'H5J391', surat: 'Al-Hujurat', ayat: '95-99' },
    { code: 'H5J392', surat: 'Qaf', ayat: '64-72' },
    { code: 'H5J393', surat: 'Adh-Dhariyat', ayat: '14-20' },
    { code: 'H5J394', surat: 'At-Tur', ayat: '45-48' },
    { code: 'H5J395', surat: 'An-Najm', ayat: '168-171' },
    { code: 'H5J396', surat: 'Al-Qamar', ayat: '5-8' },
    { code: 'H5J397', surat: 'Ar-Rahman', ayat: '56-63' },
    { code: 'H5J398', surat: 'Al-Waqi\'ah', ayat: '170-179' },
    { code: 'H5J399', surat: 'Al-Hadid', ayat: '147-150' },
    { code: 'H5J400', surat: 'Al-Mujadilah', ayat: '113-116' },
    { code: 'H5J401', surat: 'Al-Hashr', ayat: '172-182' },
    { code: 'H5J402', surat: 'Al-Mumtahanah', ayat: '124-132' },
    { code: 'H5J403', surat: 'As-Saff', ayat: '40-49' },
    { code: 'H5J404', surat: 'Al-Jumu\'ah', ayat: '44-50' },
    { code: 'H5J405', surat: 'Al-Munafiqun', ayat: '67-73' },
    { code: 'H5J406', surat: 'At-Taghabun', ayat: '101-106' },
    { code: 'H5J407', surat: 'At-Talaq', ayat: '29-38' },
    { code: 'H5J408', surat: 'At-Tahrim', ayat: '121-126' },
    { code: 'H5J409', surat: 'Al-Mulk', ayat: '110-120' },
    { code: 'H5J410', surat: 'Al-Qalam', ayat: '47-52' },
    { code: 'H5J411', surat: 'Al-Haqqah', ayat: '180-186' },
    { code: 'H5J412', surat: 'Al-Ma\'arij', ayat: '137-143' },
    { code: 'H5J413', surat: 'Nuh', ayat: '140-149' },
    { code: 'H5J414', surat: 'Al-Jinn', ayat: '96-102' },
    { code: 'H5J415', surat: 'Al-Muzzammil', ayat: '76-80' },
    { code: 'H5J416', surat: 'Al-Muddaththir', ayat: '153-159' },
    { code: 'H5J417', surat: 'Al-Qiyamah', ayat: '59-69' },
    { code: 'H5J418', surat: 'Al-Insan', ayat: '129-133' },
    { code: 'H5J419', surat: 'Al-Mursalat', ayat: '82-91' },
    { code: 'H5J420', surat: 'An-Naba', ayat: '135-142' },
    { code: 'H5J421', surat: 'An-Nazi\'at', ayat: '145-150' },
    { code: 'H5J422', surat: 'Abasa', ayat: '4-12' },
    { code: 'H5J423', surat: 'At-Takwir', ayat: '93-97' },
    { code: 'H5J424', surat: 'Al-Infitar', ayat: '76-82' },
    { code: 'H5J425', surat: 'Al-Mutaffifin', ayat: '71-76' },
    { code: 'H5J426', surat: 'Al-Inshiqaq', ayat: '143-148' },
    { code: 'H5J427', surat: 'Al-Buruj', ayat: '55-63' },
    { code: 'H5J428', surat: 'At-Tariq', ayat: '158-166' },
    { code: 'H5J429', surat: 'Al-A\'la', ayat: '20-26' },
    { code: 'H5J430', surat: 'Al-Ghashiyah', ayat: '153-159' },
    { code: 'H5J431', surat: 'Al-Fajr', ayat: '46-56' },
    { code: 'H5J432', surat: 'Al-Balad', ayat: '64-70' },
    { code: 'H5J433', surat: 'Ash-Shams', ayat: '45-55' },
    { code: 'H5J434', surat: 'Al-Lail', ayat: '139-149' },
  ],
  'H10J': [
    { code: 'H10J435', surat: 'Ad-Duha', ayat: '76-80' },
    { code: 'H10J436', surat: 'Ash-Sharh', ayat: '105-111' },
    { code: 'H10J437', surat: 'At-Tin', ayat: '130-133' },
    { code: 'H10J438', surat: 'Al-\'Alaq', ayat: '38-45' },
    { code: 'H10J439', surat: 'Al-Qadr', ayat: '6-15' },
    { code: 'H10J440', surat: 'Al-Bayyinah', ayat: '172-182' },
    { code: 'H10J441', surat: 'Az-Zalzalah', ayat: '22-29' },
    { code: 'H10J442', surat: 'Al-Adiyat', ayat: '31-37' },
    { code: 'H10J443', surat: 'Al-Qari\'ah', ayat: '157-160' },
    { code: 'H10J444', surat: 'At-Takathur', ayat: '178-185' },
    { code: 'H10J445', surat: 'Al-Asr', ayat: '152-157' },
    { code: 'H10J446', surat: 'Al-Humazah', ayat: '166-174' },
    { code: 'H10J447', surat: 'Al-Fil', ayat: '132-140' },
    { code: 'H10J448', surat: 'Quraish', ayat: '73-79' },
    { code: 'H10J449', surat: 'Al-Ma\'un', ayat: '47-55' },
    { code: 'H10J450', surat: 'Al-Kawthar', ayat: '97-107' },
    { code: 'H10J451', surat: 'Al-Kafirun', ayat: '180-183' },
    { code: 'H10J452', surat: 'An-Nasr', ayat: '44-49' },
    { code: 'H10J453', surat: 'Al-Lahab', ayat: '32-42' },
    { code: 'H10J454', surat: 'Al-Ikhlas', ayat: '80-86' },
    { code: 'H10J455', surat: 'Al-Falaq', ayat: '35-44' },
    { code: 'H10J456', surat: 'An-Nas', ayat: '142-151' },
    { code: 'H10J457', surat: 'Al-Fatihah', ayat: '101-110' },
    { code: 'H10J458', surat: 'Al-Baqarah', ayat: '13-20' },
    { code: 'H10J459', surat: 'Ali Imran', ayat: '173-180' },
    { code: 'H10J460', surat: 'An-Nisa', ayat: '112-122' },
    { code: 'H10J461', surat: 'Al-Maidah', ayat: '153-160' },
    { code: 'H10J462', surat: 'Al-An\'am', ayat: '49-57' },
    { code: 'H10J463', surat: 'Al-A\'raf', ayat: '86-94' },
    { code: 'H10J464', surat: 'Al-Anfal', ayat: '168-172' },
    { code: 'H10J465', surat: 'At-Taubah', ayat: '123-133' },
    { code: 'H10J466', surat: 'Yunus', ayat: '158-165' },
    { code: 'H10J467', surat: 'Hud', ayat: '180-188' },
    { code: 'H10J468', surat: 'Yusuf', ayat: '7-15' },
    { code: 'H10J469', surat: 'Ar-Ra\'d', ayat: '131-139' },
    { code: 'H10J470', surat: 'Ibrahim', ayat: '31-37' },
    { code: 'H10J471', surat: 'Al-Hijr', ayat: '32-36' },
    { code: 'H10J472', surat: 'An-Nahl', ayat: '120-128' },
    { code: 'H10J473', surat: 'Al-Isra', ayat: '131-140' },
    { code: 'H10J474', surat: 'Al-Kahf', ayat: '52-61' },
    { code: 'H10J475', surat: 'Maryam', ayat: '63-73' },
    { code: 'H10J476', surat: 'Taha', ayat: '129-137' },
    { code: 'H10J477', surat: 'Al-Anbiya', ayat: '174-183' },
    { code: 'H10J478', surat: 'Al-Hajj', ayat: '28-37' },
    { code: 'H10J479', surat: 'Al-Mu\'minun', ayat: '77-86' },
    { code: 'H10J480', surat: 'An-Nur', ayat: '92-99' },
    { code: 'H10J481', surat: 'Al-Furqan', ayat: '130-135' },
    { code: 'H10J482', surat: 'Ash-Shu\'ara', ayat: '132-138' },
    { code: 'H10J483', surat: 'An-Naml', ayat: '113-116' },
    { code: 'H10J484', surat: 'Al-Qasas', ayat: '95-102' },
    { code: 'H10J485', surat: 'Al-Ankabut', ayat: '76-85' },
    { code: 'H10J486', surat: 'Ar-Rum', ayat: '94-104' },
    { code: 'H10J487', surat: 'Luqman', ayat: '171-179' },
    { code: 'H10J488', surat: 'As-Sajdah', ayat: '137-141' },
    { code: 'H10J489', surat: 'Al-Ahzab', ayat: '10-15' },
    { code: 'H10J490', surat: 'Saba', ayat: '27-37' },
    { code: 'H10J491', surat: 'Fatir', ayat: '57-63' },
    { code: 'H10J492', surat: 'Ya-Sin', ayat: '173-181' },
    { code: 'H10J493', surat: 'As-Saffat', ayat: '81-88' },
    { code: 'H10J494', surat: 'Sad', ayat: '67-75' },
    { code: 'H10J495', surat: 'Az-Zumar', ayat: '14-20' },
    { code: 'H10J496', surat: 'Ghafir', ayat: '26-31' },
  ],
  'H20J': [
    { code: 'H20J497', surat: 'Fussilat', ayat: '81-87' },
    { code: 'H20J498', surat: 'Ash-Shura', ayat: '76-85' },
    { code: 'H20J499', surat: 'Az-Zukhruf', ayat: '19-25' },
    { code: 'H20J500', surat: 'Ad-Dukhan', ayat: '83-87' },
    { code: 'H20J501', surat: 'Al-Jathiyah', ayat: '171-176' },
    { code: 'H20J502', surat: 'Al-Ahqaf', ayat: '108-114' },
    { code: 'H20J503', surat: 'Muhammad', ayat: '121-131' },
    { code: 'H20J504', surat: 'Al-Fath', ayat: '11-18' },
    { code: 'H20J505', surat: 'Al-Hujurat', ayat: '25-31' },
    { code: 'H20J506', surat: 'Qaf', ayat: '120-126' },
    { code: 'H20J507', surat: 'Adh-Dhariyat', ayat: '140-144' },
    { code: 'H20J508', surat: 'At-Tur', ayat: '20-30' },
    { code: 'H20J509', surat: 'An-Najm', ayat: '102-111' },
    { code: 'H20J510', surat: 'Al-Qamar', ayat: '88-92' },
    { code: 'H20J511', surat: 'Ar-Rahman', ayat: '26-33' },
    { code: 'H20J512', surat: 'Al-Waqi\'ah', ayat: '32-42' },
    { code: 'H20J513', surat: 'Al-Hadid', ayat: '74-80' },
    { code: 'H20J514', surat: 'Al-Mujadilah', ayat: '63-70' },
    { code: 'H20J515', surat: 'Al-Hashr', ayat: '78-82' },
    { code: 'H20J516', surat: 'Al-Mumtahanah', ayat: '171-178' },
    { code: 'H20J517', surat: 'As-Saff', ayat: '71-74' },
    { code: 'H20J518', surat: 'Al-Jumu\'ah', ayat: '166-175' },
    { code: 'H20J519', surat: 'Al-Munafiqun', ayat: '145-154' },
    { code: 'H20J520', surat: 'At-Taghabun', ayat: '14-21' },
    { code: 'H20J521', surat: 'At-Talaq', ayat: '152-155' },
    { code: 'H20J522', surat: 'At-Tahrim', ayat: '147-154' },
    { code: 'H20J523', surat: 'Al-Mulk', ayat: '161-169' },
    { code: 'H20J524', surat: 'Al-Qalam', ayat: '62-72' },
    { code: 'H20J525', surat: 'Al-Haqqah', ayat: '51-56' },
    { code: 'H20J526', surat: 'Al-Ma\'arij', ayat: '68-73' },
    { code: 'H20J527', surat: 'Nuh', ayat: '179-183' },
    { code: 'H20J528', surat: 'Al-Jinn', ayat: '26-32' },
    { code: 'H20J529', surat: 'Al-Muzzammil', ayat: '54-64' },
    { code: 'H20J530', surat: 'Al-Muddaththir', ayat: '166-174' },
    { code: 'H20J531', surat: 'Al-Qiyamah', ayat: '68-71' },
    { code: 'H20J532', surat: 'Al-Insan', ayat: '132-135' },
    { code: 'H20J533', surat: 'Al-Mursalat', ayat: '73-83' },
    { code: 'H20J534', surat: 'An-Naba', ayat: '6-11' },
    { code: 'H20J535', surat: 'An-Nazi\'at', ayat: '56-60' },
    { code: 'H20J536', surat: 'Abasa', ayat: '152-162' },
    { code: 'H20J537', surat: 'At-Takwir', ayat: '156-165' },
    { code: 'H20J538', surat: 'Al-Infitar', ayat: '25-33' },
    { code: 'H20J539', surat: 'Al-Mutaffifin', ayat: '51-57' },
    { code: 'H20J540', surat: 'Al-Inshiqaq', ayat: '174-179' },
    { code: 'H20J541', surat: 'Al-Buruj', ayat: '49-57' },
    { code: 'H20J542', surat: 'At-Tariq', ayat: '151-160' },
    { code: 'H20J543', surat: 'Al-A\'la', ayat: '17-25' },
    { code: 'H20J544', surat: 'Al-Ghashiyah', ayat: '178-185' },
    { code: 'H20J545', surat: 'Al-Fajr', ayat: '130-139' },
    { code: 'H20J546', surat: 'Al-Balad', ayat: '97-104' },
    { code: 'H20J547', surat: 'Ash-Shams', ayat: '95-102' },
    { code: 'H20J548', surat: 'Al-Lail', ayat: '15-20' },
    { code: 'H20J549', surat: 'Ad-Duha', ayat: '123-128' },
    { code: 'H20J550', surat: 'Ash-Sharh', ayat: '11-16' },
    { code: 'H20J551', surat: 'At-Tin', ayat: '135-139' },
    { code: 'H20J552', surat: 'Al-\'Alaq', ayat: '28-37' },
    { code: 'H20J553', surat: 'Al-Qadr', ayat: '169-173' },
    { code: 'H20J554', surat: 'Al-Bayyinah', ayat: '144-153' },
    { code: 'H20J555', surat: 'Az-Zalzalah', ayat: '115-125' },
    { code: 'H20J556', surat: 'Al-Adiyat', ayat: '100-108' },
    { code: 'H20J557', surat: 'Al-Qari\'ah', ayat: '81-91' },
    { code: 'H20J558', surat: 'At-Takathur', ayat: '2-12' },
  ],
  'H30J': [
    { code: 'H30J559', surat: 'Al-Asr', ayat: '95-99' },
    { code: 'H30J560', surat: 'Al-Humazah', ayat: '114-119' },
    { code: 'H30J561', surat: 'Al-Fil', ayat: '164-171' },
    { code: 'H30J562', surat: 'Quraish', ayat: '23-29' },
    { code: 'H30J563', surat: 'Al-Ma\'un', ayat: '21-24' },
    { code: 'H30J564', surat: 'Al-Kawthar', ayat: '148-151' },
    { code: 'H30J565', surat: 'Al-Kafirun', ayat: '22-31' },
    { code: 'H30J566', surat: 'An-Nasr', ayat: '35-45' },
    { code: 'H30J567', surat: 'Al-Lahab', ayat: '139-145' },
    { code: 'H30J568', surat: 'Al-Ikhlas', ayat: '171-180' },
    { code: 'H30J569', surat: 'Al-Falaq', ayat: '30-36' },
    { code: 'H30J570', surat: 'An-Nas', ayat: '72-75' },
    { code: 'H30J571', surat: 'Al-Fatihah', ayat: '132-137' },
    { code: 'H30J572', surat: 'Al-Baqarah', ayat: '146-150' },
    { code: 'H30J573', surat: 'Ali Imran', ayat: '118-123' },
    { code: 'H30J574', surat: 'An-Nisa', ayat: '36-40' },
    { code: 'H30J575', surat: 'Al-Maidah', ayat: '50-56' },
    { code: 'H30J576', surat: 'Al-An\'am', ayat: '123-127' },
    { code: 'H30J577', surat: 'Al-A\'raf', ayat: '27-30' },
    { code: 'H30J578', surat: 'Al-Anfal', ayat: '12-19' },
    { code: 'H30J579', surat: 'At-Taubah', ayat: '114-117' },
    { code: 'H30J580', surat: 'Yunus', ayat: '58-61' },
    { code: 'H30J581', surat: 'Hud', ayat: '86-89' },
    { code: 'H30J582', surat: 'Yusuf', ayat: '167-170' },
    { code: 'H30J583', surat: 'Ar-Ra\'d', ayat: '71-75' },
    { code: 'H30J584', surat: 'Ibrahim', ayat: '135-138' },
    { code: 'H30J585', surat: 'Al-Hijr', ayat: '157-163' },
    { code: 'H30J586', surat: 'An-Nahl', ayat: '147-152' },
    { code: 'H30J587', surat: 'Al-Isra', ayat: '44-49' },
    { code: 'H30J588', surat: 'Al-Kahf', ayat: '54-60' },
    { code: 'H30J589', surat: 'Maryam', ayat: '144-148' },
    { code: 'H30J590', surat: 'Taha', ayat: '32-40' },
    { code: 'H30J591', surat: 'Al-Anbiya', ayat: '115-119' },
    { code: 'H30J592', surat: 'Al-Hajj', ayat: '73-82' },
    { code: 'H30J593', surat: 'Al-Mu\'minun', ayat: '106-110' },
    { code: 'H30J594', surat: 'An-Nur', ayat: '145-154' },
    { code: 'H30J595', surat: 'Al-Furqan', ayat: '146-154' },
    { code: 'H30J596', surat: 'Ash-Shu\'ara', ayat: '103-108' },
    { code: 'H30J597', surat: 'An-Naml', ayat: '102-112' },
    { code: 'H30J598', surat: 'Al-Qasas', ayat: '15-25' },
    { code: 'H30J599', surat: 'Al-Ankabut', ayat: '12-15' },
    { code: 'H30J600', surat: 'Ar-Rum', ayat: '98-107' },
    { code: 'H30J601', surat: 'Luqman', ayat: '146-151' },
    { code: 'H30J602', surat: 'As-Sajdah', ayat: '41-44' },
    { code: 'H30J603', surat: 'Al-Ahzab', ayat: '12-18' },
    { code: 'H30J604', surat: 'Saba', ayat: '127-134' },
    { code: 'H30J605', surat: 'Fatir', ayat: '80-88' },
    { code: 'H30J606', surat: 'Ya-Sin', ayat: '112-117' },
    { code: 'H30J607', surat: 'As-Saffat', ayat: '125-132' },
    { code: 'H30J608', surat: 'Sad', ayat: '125-133' },
    { code: 'H30J609', surat: 'Az-Zumar', ayat: '138-143' },
    { code: 'H30J610', surat: 'Ghafir', ayat: '22-25' },
    { code: 'H30J611', surat: 'Fussilat', ayat: '5-13' },
    { code: 'H30J612', surat: 'Ash-Shura', ayat: '55-61' },
    { code: 'H30J613', surat: 'Az-Zukhruf', ayat: '134-138' },
    { code: 'H30J614', surat: 'Ad-Dukhan', ayat: '111-118' },
    { code: 'H30J615', surat: 'Al-Jathiyah', ayat: '36-44' },
    { code: 'H30J616', surat: 'Al-Ahqaf', ayat: '123-128' },
    { code: 'H30J617', surat: 'Muhammad', ayat: '30-39' },
    { code: 'H30J618', surat: 'Al-Fath', ayat: '109-117' },
    { code: 'H30J619', surat: 'Al-Hujurat', ayat: '141-149' },
    { code: 'H30J620', surat: 'Qaf', ayat: '29-36' },
  ],
  'TFI': [
    { code: 'TFI621', surat: 'Adh-Dhariyat', ayat: '57-65' },
    { code: 'TFI622', surat: 'At-Tur', ayat: '158-162' },
    { code: 'TFI623', surat: 'An-Najm', ayat: '90-98' },
    { code: 'TFI624', surat: 'Al-Qamar', ayat: '111-114' },
    { code: 'TFI625', surat: 'Ar-Rahman', ayat: '137-144' },
    { code: 'TFI626', surat: 'Al-Waqi\'ah', ayat: '52-61' },
    { code: 'TFI627', surat: 'Al-Hadid', ayat: '142-150' },
    { code: 'TFI628', surat: 'Al-Mujadilah', ayat: '79-86' },
    { code: 'TFI629', surat: 'Al-Hashr', ayat: '68-77' },
    { code: 'TFI630', surat: 'Al-Mumtahanah', ayat: '50-58' },
    { code: 'TFI631', surat: 'As-Saff', ayat: '136-143' },
    { code: 'TFI632', surat: 'Al-Jumu\'ah', ayat: '24-33' },
    { code: 'TFI633', surat: 'Al-Munafiqun', ayat: '110-120' },
    { code: 'TFI634', surat: 'At-Taghabun', ayat: '104-111' },
    { code: 'TFI635', surat: 'At-Talaq', ayat: '113-120' },
    { code: 'TFI636', surat: 'At-Tahrim', ayat: '2-9' },
    { code: 'TFI637', surat: 'Al-Mulk', ayat: '48-57' },
    { code: 'TFI638', surat: 'Al-Qalam', ayat: '179-182' },
    { code: 'TFI639', surat: 'Al-Haqqah', ayat: '160-170' },
    { code: 'TFI640', surat: 'Al-Ma\'arij', ayat: '44-53' },
    { code: 'TFI641', surat: 'Nuh', ayat: '82-89' },
    { code: 'TFI642', surat: 'Al-Jinn', ayat: '132-140' },
    { code: 'TFI643', surat: 'Al-Muzzammil', ayat: '104-110' },
    { code: 'TFI644', surat: 'Al-Muddaththir', ayat: '107-116' },
    { code: 'TFI645', surat: 'Al-Qiyamah', ayat: '72-81' },
    { code: 'TFI646', surat: 'Al-Insan', ayat: '130-137' },
    { code: 'TFI647', surat: 'Al-Mursalat', ayat: '165-171' },
    { code: 'TFI648', surat: 'An-Naba', ayat: '103-111' },
    { code: 'TFI649', surat: 'An-Nazi\'at', ayat: '157-162' },
    { code: 'TFI650', surat: 'Abasa', ayat: '86-93' },
    { code: 'TFI651', surat: 'At-Takwir', ayat: '125-133' },
    { code: 'TFI652', surat: 'Al-Infitar', ayat: '132-141' },
    { code: 'TFI653', surat: 'Al-Mutaffifin', ayat: '55-62' },
    { code: 'TFI654', surat: 'Al-Inshiqaq', ayat: '50-58' },
    { code: 'TFI655', surat: 'Al-Buruj', ayat: '20-27' },
    { code: 'TFI656', surat: 'At-Tariq', ayat: '78-84' },
    { code: 'TFI657', surat: 'Al-A\'la', ayat: '121-126' },
    { code: 'TFI658', surat: 'Al-Ghashiyah', ayat: '40-47' },
    { code: 'TFI659', surat: 'Al-Fajr', ayat: '54-59' },
    { code: 'TFI660', surat: 'Al-Balad', ayat: '23-31' },
    { code: 'TFI661', surat: 'Ash-Shams', ayat: '34-41' },
    { code: 'TFI662', surat: 'Al-Lail', ayat: '94-97' },
    { code: 'TFI663', surat: 'Ad-Duha', ayat: '141-146' },
    { code: 'TFI664', surat: 'Ash-Sharh', ayat: '146-155' },
    { code: 'TFI665', surat: 'At-Tin', ayat: '162-172' },
    { code: 'TFI666', surat: 'Al-\'Alaq', ayat: '79-83' },
    { code: 'TFI667', surat: 'Al-Qadr', ayat: '123-128' },
    { code: 'TFI668', surat: 'Al-Bayyinah', ayat: '80-83' },
    { code: 'TFI669', surat: 'Az-Zalzalah', ayat: '165-172' },
    { code: 'TFI670', surat: 'Al-Adiyat', ayat: '55-59' },
    { code: 'TFI671', surat: 'Al-Qari\'ah', ayat: '77-84' },
    { code: 'TFI672', surat: 'At-Takathur', ayat: '165-172' },
    { code: 'TFI673', surat: 'Al-Asr', ayat: '121-130' },
    { code: 'TFI674', surat: 'Al-Humazah', ayat: '134-141' },
    { code: 'TFI675', surat: 'Al-Fil', ayat: '8-14' },
    { code: 'TFI676', surat: 'Quraish', ayat: '57-61' },
    { code: 'TFI677', surat: 'Al-Ma\'un', ayat: '62-71' },
    { code: 'TFI678', surat: 'Al-Kawthar', ayat: '53-58' },
    { code: 'TFI679', surat: 'Al-Kafirun', ayat: '129-139' },
    { code: 'TFI680', surat: 'An-Nasr', ayat: '180-188' },
    { code: 'TFI681', surat: 'Al-Lahab', ayat: '30-37' },
    { code: 'TFI682', surat: 'Al-Ikhlas', ayat: '168-176' },
  ],
  'TFA': [
    { code: 'TFA683', surat: 'Al-Falaq', ayat: '168-173' },
    { code: 'TFA684', surat: 'An-Nas', ayat: '152-157' },
    { code: 'TFA685', surat: 'Al-Fatihah', ayat: '162-172' },
    { code: 'TFA686', surat: 'Al-Baqarah', ayat: '62-65' },
    { code: 'TFA687', surat: 'Ali Imran', ayat: '18-24' },
    { code: 'TFA688', surat: 'An-Nisa', ayat: '157-163' },
    { code: 'TFA689', surat: 'Al-Maidah', ayat: '11-21' },
    { code: 'TFA690', surat: 'Al-An\'am', ayat: '102-106' },
    { code: 'TFA691', surat: 'Al-A\'raf', ayat: '61-70' },
    { code: 'TFA692', surat: 'Al-Anfal', ayat: '96-106' },
    { code: 'TFA693', surat: 'At-Taubah', ayat: '94-97' },
    { code: 'TFA694', surat: 'Yunus', ayat: '149-157' },
    { code: 'TFA695', surat: 'Hud', ayat: '50-54' },
    { code: 'TFA696', surat: 'Yusuf', ayat: '97-105' },
    { code: 'TFA697', surat: 'Ar-Ra\'d', ayat: '128-134' },
    { code: 'TFA698', surat: 'Ibrahim', ayat: '163-170' },
    { code: 'TFA699', surat: 'Al-Hijr', ayat: '91-97' },
    { code: 'TFA700', surat: 'An-Nahl', ayat: '100-110' },
    { code: 'TFA701', surat: 'Al-Isra', ayat: '37-46' },
    { code: 'TFA702', surat: 'Al-Kahf', ayat: '143-148' },
    { code: 'TFA703', surat: 'Maryam', ayat: '99-103' },
    { code: 'TFA704', surat: 'Taha', ayat: '57-63' },
    { code: 'TFA705', surat: 'Al-Anbiya', ayat: '102-111' },
    { code: 'TFA706', surat: 'Al-Hajj', ayat: '149-158' },
    { code: 'TFA707', surat: 'Al-Mu\'minun', ayat: '80-88' },
    { code: 'TFA708', surat: 'An-Nur', ayat: '177-180' },
    { code: 'TFA709', surat: 'Al-Furqan', ayat: '21-29' },
    { code: 'TFA710', surat: 'Ash-Shu\'ara', ayat: '153-156' },
    { code: 'TFA711', surat: 'An-Naml', ayat: '24-34' },
    { code: 'TFA712', surat: 'Al-Qasas', ayat: '101-110' },
    { code: 'TFA713', surat: 'Al-Ankabut', ayat: '97-104' },
    { code: 'TFA714', surat: 'Ar-Rum', ayat: '178-188' },
    { code: 'TFA715', surat: 'Luqman', ayat: '10-20' },
    { code: 'TFA716', surat: 'As-Sajdah', ayat: '103-106' },
    { code: 'TFA717', surat: 'Al-Ahzab', ayat: '84-90' },
    { code: 'TFA718', surat: 'Saba', ayat: '166-174' },
    { code: 'TFA719', surat: 'Fatir', ayat: '85-90' },
    { code: 'TFA720', surat: 'Ya-Sin', ayat: '102-106' },
    { code: 'TFA721', surat: 'As-Saffat', ayat: '25-33' },
    { code: 'TFA722', surat: 'Sad', ayat: '163-171' },
    { code: 'TFA723', surat: 'Az-Zumar', ayat: '10-19' },
    { code: 'TFA724', surat: 'Ghafir', ayat: '69-78' },
    { code: 'TFA725', surat: 'Fussilat', ayat: '167-172' },
    { code: 'TFA726', surat: 'Ash-Shura', ayat: '32-39' },
    { code: 'TFA727', surat: 'Az-Zukhruf', ayat: '167-177' },
    { code: 'TFA728', surat: 'Ad-Dukhan', ayat: '19-28' },
    { code: 'TFA729', surat: 'Al-Jathiyah', ayat: '21-25' },
    { code: 'TFA730', surat: 'Al-Ahqaf', ayat: '173-181' },
    { code: 'TFA731', surat: 'Muhammad', ayat: '78-85' },
    { code: 'TFA732', surat: 'Al-Fath', ayat: '57-63' },
    { code: 'TFA733', surat: 'Al-Hujurat', ayat: '104-112' },
    { code: 'TFA734', surat: 'Qaf', ayat: '16-24' },
    { code: 'TFA735', surat: 'Adh-Dhariyat', ayat: '128-136' },
    { code: 'TFA736', surat: 'At-Tur', ayat: '117-127' },
    { code: 'TFA737', surat: 'An-Najm', ayat: '43-50' },
    { code: 'TFA738', surat: 'Al-Qamar', ayat: '179-187' },
    { code: 'TFA739', surat: 'Ar-Rahman', ayat: '5-11' },
    { code: 'TFA740', surat: 'Al-Waqi\'ah', ayat: '168-171' },
    { code: 'TFA741', surat: 'Al-Hadid', ayat: '62-70' },
    { code: 'TFA742', surat: 'Al-Mujadilah', ayat: '38-46' },
    { code: 'TFA743', surat: 'Al-Hashr', ayat: '39-49' },
    { code: 'TFA744', surat: 'Al-Mumtahanah', ayat: '48-53' },
  ],
  'TFE': [
    { code: 'TFE745', surat: 'As-Saff', ayat: '103-110' },
    { code: 'TFE746', surat: 'Al-Jumu\'ah', ayat: '118-121' },
    { code: 'TFE747', surat: 'Al-Munafiqun', ayat: '45-51' },
    { code: 'TFE748', surat: 'At-Taghabun', ayat: '122-126' },
    { code: 'TFE749', surat: 'At-Talaq', ayat: '164-170' },
    { code: 'TFE750', surat: 'At-Tahrim', ayat: '52-62' },
    { code: 'TFE751', surat: 'Al-Mulk', ayat: '119-125' },
    { code: 'TFE752', surat: 'Al-Qalam', ayat: '147-154' },
    { code: 'TFE753', surat: 'Al-Haqqah', ayat: '94-99' },
    { code: 'TFE754', surat: 'Al-Ma\'arij', ayat: '109-117' },
    { code: 'TFE755', surat: 'Nuh', ayat: '70-76' },
    { code: 'TFE756', surat: 'Al-Jinn', ayat: '31-40' },
    { code: 'TFE757', surat: 'Al-Muzzammil', ayat: '43-53' },
    { code: 'TFE758', surat: 'Al-Muddaththir', ayat: '84-90' },
    { code: 'TFE759', surat: 'Al-Qiyamah', ayat: '116-124' },
    { code: 'TFE760', surat: 'Al-Insan', ayat: '155-162' },
    { code: 'TFE761', surat: 'Al-Mursalat', ayat: '96-105' },
    { code: 'TFE762', surat: 'An-Naba', ayat: '163-173' },
    { code: 'TFE763', surat: 'An-Nazi\'at', ayat: '115-120' },
    { code: 'TFE764', surat: 'Abasa', ayat: '168-178' },
    { code: 'TFE765', surat: 'At-Takwir', ayat: '125-135' },
    { code: 'TFE766', surat: 'Al-Infitar', ayat: '72-75' },
    { code: 'TFE767', surat: 'Al-Mutaffifin', ayat: '95-101' },
    { code: 'TFE768', surat: 'Al-Inshiqaq', ayat: '172-175' },
    { code: 'TFE769', surat: 'Al-Buruj', ayat: '151-158' },
    { code: 'TFE770', surat: 'At-Tariq', ayat: '60-64' },
    { code: 'TFE771', surat: 'Al-A\'la', ayat: '168-175' },
    { code: 'TFE772', surat: 'Al-Ghashiyah', ayat: '71-74' },
    { code: 'TFE773', surat: 'Al-Fajr', ayat: '22-26' },
    { code: 'TFE774', surat: 'Al-Balad', ayat: '88-96' },
    { code: 'TFE775', surat: 'Ash-Shams', ayat: '62-70' },
    { code: 'TFE776', surat: 'Al-Lail', ayat: '155-161' },
    { code: 'TFE777', surat: 'Ad-Duha', ayat: '69-73' },
    { code: 'TFE778', surat: 'Ash-Sharh', ayat: '93-102' },
    { code: 'TFE779', surat: 'At-Tin', ayat: '173-181' },
    { code: 'TFE780', surat: 'Al-\'Alaq', ayat: '146-150' },
    { code: 'TFE781', surat: 'Al-Qadr', ayat: '109-119' },
    { code: 'TFE782', surat: 'Al-Bayyinah', ayat: '43-51' },
    { code: 'TFE783', surat: 'Az-Zalzalah', ayat: '39-49' },
    { code: 'TFE784', surat: 'Al-Adiyat', ayat: '73-78' },
    { code: 'TFE785', surat: 'Al-Qari\'ah', ayat: '26-29' },
    { code: 'TFE786', surat: 'At-Takathur', ayat: '49-52' },
    { code: 'TFE787', surat: 'Al-Asr', ayat: '54-59' },
    { code: 'TFE788', surat: 'Al-Humazah', ayat: '100-109' },
    { code: 'TFE789', surat: 'Al-Fil', ayat: '125-133' },
    { code: 'TFE790', surat: 'Quraish', ayat: '151-156' },
    { code: 'TFE791', surat: 'Al-Ma\'un', ayat: '146-150' },
    { code: 'TFE792', surat: 'Al-Kawthar', ayat: '159-164' },
    { code: 'TFE793', surat: 'Al-Kafirun', ayat: '68-71' },
    { code: 'TFE794', surat: 'An-Nasr', ayat: '83-88' },
    { code: 'TFE795', surat: 'Al-Lahab', ayat: '99-103' },
    { code: 'TFE796', surat: 'Al-Ikhlas', ayat: '19-22' },
    { code: 'TFE797', surat: 'Al-Falaq', ayat: '63-72' },
    { code: 'TFE798', surat: 'An-Nas', ayat: '13-17' },
    { code: 'TFE799', surat: 'Al-Fatihah', ayat: '171-180' },
    { code: 'TFE800', surat: 'Al-Baqarah', ayat: '119-127' },
    { code: 'TFE801', surat: 'Ali Imran', ayat: '108-112' },
    { code: 'TFE802', surat: 'An-Nisa', ayat: '129-137' },
    { code: 'TFE803', surat: 'Al-Maidah', ayat: '6-13' },
    { code: 'TFE804', surat: 'Al-An\'am', ayat: '8-14' },
    { code: 'TFE805', surat: 'Al-A\'raf', ayat: '15-18' },
    { code: 'TFE806', surat: 'Al-Anfal', ayat: '25-31' },
  ],
  'FAQ': [
    { code: 'FAQ001', surat: 'Al-Fatihah', ayat: '94-98' },
    { code: 'FAQ002', surat: 'Al-Baqarah', ayat: '47-52' },
    { code: 'FAQ003', surat: 'Ali Imran', ayat: '103-111' },
    { code: 'FAQ004', surat: 'An-Nisa', ayat: '68-77' },
    { code: 'FAQ005', surat: 'Al-Maidah', ayat: '134-142' },
    { code: 'FAQ006', surat: 'Al-An\'am', ayat: '133-140' },
    { code: 'FAQ007', surat: 'Al-A\'raf', ayat: '86-94' },
    { code: 'FAQ008', surat: 'Al-Anfal', ayat: '48-53' },
    { code: 'FAQ009', surat: 'At-Taubah', ayat: '149-155' },
    { code: 'FAQ010', surat: 'Yunus', ayat: '5-10' },
    { code: 'FAQ011', surat: 'Hud', ayat: '8-17' },
    { code: 'FAQ012', surat: 'Yusuf', ayat: '17-25' },
    { code: 'FAQ013', surat: 'Ar-Ra\'d', ayat: '20-26' },
    { code: 'FAQ014', surat: 'Ibrahim', ayat: '88-93' },
    { code: 'FAQ015', surat: 'Al-Hijr', ayat: '131-139' },
    { code: 'FAQ016', surat: 'An-Nahl', ayat: '38-45' },
    { code: 'FAQ017', surat: 'Al-Isra', ayat: '136-139' },
    { code: 'FAQ018', surat: 'Al-Kahf', ayat: '157-163' },
    { code: 'FAQ019', surat: 'Maryam', ayat: '65-71' },
    { code: 'FAQ020', surat: 'Taha', ayat: '156-164' },
    { code: 'FAQ021', surat: 'Al-Anbiya', ayat: '20-25' },
    { code: 'FAQ022', surat: 'Al-Hajj', ayat: '144-150' },
    { code: 'FAQ023', surat: 'Al-Mu\'minun', ayat: '21-25' },
    { code: 'FAQ024', surat: 'An-Nur', ayat: '36-39' },
    { code: 'FAQ025', surat: 'Al-Furqan', ayat: '47-50' },
    { code: 'FAQ026', surat: 'Ash-Shu\'ara', ayat: '172-179' },
    { code: 'FAQ027', surat: 'An-Naml', ayat: '45-49' },
    { code: 'FAQ028', surat: 'Al-Qasas', ayat: '122-131' },
    { code: 'FAQ029', surat: 'Al-Ankabut', ayat: '134-139' },
    { code: 'FAQ030', surat: 'Ar-Rum', ayat: '136-142' },
    { code: 'FAQ031', surat: 'Luqman', ayat: '37-42' },
    { code: 'FAQ032', surat: 'As-Sajdah', ayat: '129-132' },
    { code: 'FAQ033', surat: 'Al-Ahzab', ayat: '90-100' },
    { code: 'FAQ034', surat: 'Saba', ayat: '156-159' },
    { code: 'FAQ035', surat: 'Fatir', ayat: '123-133' },
    { code: 'FAQ036', surat: 'Ya-Sin', ayat: '72-76' },
    { code: 'FAQ037', surat: 'As-Saffat', ayat: '101-109' },
    { code: 'FAQ038', surat: 'Sad', ayat: '126-136' },
    { code: 'FAQ039', surat: 'Az-Zumar', ayat: '12-18' },
    { code: 'FAQ040', surat: 'Ghafir', ayat: '105-113' },
    { code: 'FAQ041', surat: 'Fussilat', ayat: '106-115' },
    { code: 'FAQ042', surat: 'Ash-Shura', ayat: '137-142' },
    { code: 'FAQ043', surat: 'Az-Zukhruf', ayat: '117-126' },
    { code: 'FAQ044', surat: 'Ad-Dukhan', ayat: '161-168' },
    { code: 'FAQ045', surat: 'Al-Jathiyah', ayat: '28-31' },
    { code: 'FAQ046', surat: 'Al-Ahqaf', ayat: '39-46' },
    { code: 'FAQ047', surat: 'Muhammad', ayat: '108-114' },
    { code: 'FAQ048', surat: 'Al-Fath', ayat: '12-20' },
    { code: 'FAQ049', surat: 'Al-Hujurat', ayat: '23-28' },
    { code: 'FAQ050', surat: 'Qaf', ayat: '140-145' },
    { code: 'FAQ051', surat: 'Adh-Dhariyat', ayat: '75-83' },
    { code: 'FAQ052', surat: 'At-Tur', ayat: '85-95' },
    { code: 'FAQ053', surat: 'An-Najm', ayat: '141-150' },
    { code: 'FAQ054', surat: 'Al-Qamar', ayat: '133-141' },
    { code: 'FAQ055', surat: 'Ar-Rahman', ayat: '11-21' },
    { code: 'FAQ056', surat: 'Al-Waqi\'ah', ayat: '57-63' },
    { code: 'FAQ057', surat: 'Al-Hadid', ayat: '97-102' },
    { code: 'FAQ058', surat: 'Al-Mujadilah', ayat: '79-85' },
    { code: 'FAQ059', surat: 'Al-Hashr', ayat: '122-132' },
    { code: 'FAQ060', surat: 'Al-Mumtahanah', ayat: '78-83' },
    { code: 'FAQ061', surat: 'As-Saff', ayat: '126-134' },
    { code: 'FAQ062', surat: 'Al-Jumu\'ah', ayat: '6-13' },
  ],
  'SAQ': [
    { code: 'SAQ001', surat: 'Al-Fatihah', ayat: '120-126' },
    { code: 'SAQ002', surat: 'Al-Baqarah', ayat: '168-178' },
    { code: 'SAQ003', surat: 'Ali Imran', ayat: '73-82' },
    { code: 'SAQ004', surat: 'An-Nisa', ayat: '3-6' },
    { code: 'SAQ005', surat: 'Al-Maidah', ayat: '15-21' },
    { code: 'SAQ006', surat: 'Al-An\'am', ayat: '10-15' },
    { code: 'SAQ007', surat: 'Al-A\'raf', ayat: '61-64' },
    { code: 'SAQ008', surat: 'Al-Anfal', ayat: '75-83' },
    { code: 'SAQ009', surat: 'At-Taubah', ayat: '69-72' },
    { code: 'SAQ010', surat: 'Yunus', ayat: '65-74' },
    { code: 'SAQ011', surat: 'Hud', ayat: '127-131' },
    { code: 'SAQ012', surat: 'Yusuf', ayat: '71-74' },
    { code: 'SAQ013', surat: 'Ar-Ra\'d', ayat: '14-20' },
    { code: 'SAQ014', surat: 'Ibrahim', ayat: '21-31' },
    { code: 'SAQ015', surat: 'Al-Hijr', ayat: '128-136' },
    { code: 'SAQ016', surat: 'An-Nahl', ayat: '64-72' },
    { code: 'SAQ017', surat: 'Al-Isra', ayat: '155-162' },
    { code: 'SAQ018', surat: 'Al-Kahf', ayat: '37-45' },
    { code: 'SAQ019', surat: 'Maryam', ayat: '106-110' },
    { code: 'SAQ020', surat: 'Taha', ayat: '71-74' },
    { code: 'SAQ021', surat: 'Al-Anbiya', ayat: '33-38' },
    { code: 'SAQ022', surat: 'Al-Hajj', ayat: '88-97' },
    { code: 'SAQ023', surat: 'Al-Mu\'minun', ayat: '134-139' },
    { code: 'SAQ024', surat: 'An-Nur', ayat: '46-56' },
    { code: 'SAQ025', surat: 'Al-Furqan', ayat: '134-144' },
    { code: 'SAQ026', surat: 'Ash-Shu\'ara', ayat: '169-179' },
    { code: 'SAQ027', surat: 'An-Naml', ayat: '88-92' },
    { code: 'SAQ028', surat: 'Al-Qasas', ayat: '171-179' },
    { code: 'SAQ029', surat: 'Al-Ankabut', ayat: '75-82' },
    { code: 'SAQ030', surat: 'Ar-Rum', ayat: '17-23' },
    { code: 'SAQ031', surat: 'Luqman', ayat: '6-11' },
    { code: 'SAQ032', surat: 'As-Sajdah', ayat: '110-120' },
    { code: 'SAQ033', surat: 'Al-Ahzab', ayat: '129-139' },
    { code: 'SAQ034', surat: 'Saba', ayat: '18-27' },
    { code: 'SAQ035', surat: 'Fatir', ayat: '21-31' },
    { code: 'SAQ036', surat: 'Ya-Sin', ayat: '84-87' },
    { code: 'SAQ037', surat: 'As-Saffat', ayat: '147-155' },
    { code: 'SAQ038', surat: 'Sad', ayat: '76-83' },
    { code: 'SAQ039', surat: 'Az-Zumar', ayat: '16-20' },
    { code: 'SAQ040', surat: 'Ghafir', ayat: '113-120' },
    { code: 'SAQ041', surat: 'Fussilat', ayat: '90-98' },
    { code: 'SAQ042', surat: 'Ash-Shura', ayat: '65-69' },
    { code: 'SAQ043', surat: 'Az-Zukhruf', ayat: '17-21' },
    { code: 'SAQ044', surat: 'Ad-Dukhan', ayat: '96-104' },
    { code: 'SAQ045', surat: 'Al-Jathiyah', ayat: '54-61' },
    { code: 'SAQ046', surat: 'Al-Ahqaf', ayat: '149-154' },
    { code: 'SAQ047', surat: 'Muhammad', ayat: '38-43' },
    { code: 'SAQ048', surat: 'Al-Fath', ayat: '122-131' },
    { code: 'SAQ049', surat: 'Al-Hujurat', ayat: '175-185' },
    { code: 'SAQ050', surat: 'Qaf', ayat: '70-78' },
    { code: 'SAQ051', surat: 'Adh-Dhariyat', ayat: '133-140' },
    { code: 'SAQ052', surat: 'At-Tur', ayat: '138-142' },
    { code: 'SAQ053', surat: 'An-Najm', ayat: '49-53' },
    { code: 'SAQ054', surat: 'Al-Qamar', ayat: '156-165' },
    { code: 'SAQ055', surat: 'Ar-Rahman', ayat: '106-116' },
    { code: 'SAQ056', surat: 'Al-Waqi\'ah', ayat: '17-24' },
    { code: 'SAQ057', surat: 'Al-Hadid', ayat: '148-154' },
    { code: 'SAQ058', surat: 'Al-Mujadilah', ayat: '176-179' },
    { code: 'SAQ059', surat: 'Al-Hashr', ayat: '77-84' },
    { code: 'SAQ060', surat: 'Al-Mumtahanah', ayat: '148-156' },
    { code: 'SAQ061', surat: 'As-Saff', ayat: '82-91' },
    { code: 'SAQ062', surat: 'Al-Jumu\'ah', ayat: '90-98' },
  ],
  'KN': [
    { code: 'KN001', surat: 'Al-Fatihah', ayat: '119-125' },
    { code: 'KN002', surat: 'Al-Baqarah', ayat: '24-28' },
    { code: 'KN003', surat: 'Ali Imran', ayat: '113-117' },
    { code: 'KN004', surat: 'An-Nisa', ayat: '4-11' },
    { code: 'KN005', surat: 'Al-Maidah', ayat: '6-10' },
    { code: 'KN006', surat: 'Al-An\'am', ayat: '71-79' },
    { code: 'KN007', surat: 'Al-A\'raf', ayat: '174-180' },
    { code: 'KN008', surat: 'Al-Anfal', ayat: '141-151' },
    { code: 'KN009', surat: 'At-Taubah', ayat: '89-98' },
    { code: 'KN010', surat: 'Yunus', ayat: '62-66' },
    { code: 'KN011', surat: 'Hud', ayat: '16-25' },
    { code: 'KN012', surat: 'Yusuf', ayat: '83-89' },
    { code: 'KN013', surat: 'Ar-Ra\'d', ayat: '174-180' },
    { code: 'KN014', surat: 'Ibrahim', ayat: '96-105' },
    { code: 'KN015', surat: 'Al-Hijr', ayat: '104-107' },
    { code: 'KN016', surat: 'An-Nahl', ayat: '52-61' },
    { code: 'KN017', surat: 'Al-Isra', ayat: '1-9' },
    { code: 'KN018', surat: 'Al-Kahf', ayat: '136-140' },
    { code: 'KN019', surat: 'Maryam', ayat: '113-123' },
    { code: 'KN020', surat: 'Taha', ayat: '44-47' },
    { code: 'KN021', surat: 'Al-Anbiya', ayat: '126-132' },
    { code: 'KN022', surat: 'Al-Hajj', ayat: '127-135' },
    { code: 'KN023', surat: 'Al-Mu\'minun', ayat: '24-29' },
    { code: 'KN024', surat: 'An-Nur', ayat: '41-51' },
    { code: 'KN025', surat: 'Al-Furqan', ayat: '66-71' },
    { code: 'KN026', surat: 'Ash-Shu\'ara', ayat: '84-88' },
    { code: 'KN027', surat: 'An-Naml', ayat: '9-14' },
    { code: 'KN028', surat: 'Al-Qasas', ayat: '138-148' },
    { code: 'KN029', surat: 'Al-Ankabut', ayat: '146-155' },
    { code: 'KN030', surat: 'Ar-Rum', ayat: '134-144' },
    { code: 'KN031', surat: 'Luqman', ayat: '82-85' },
    { code: 'KN032', surat: 'As-Sajdah', ayat: '145-149' },
    { code: 'KN033', surat: 'Al-Ahzab', ayat: '165-171' },
    { code: 'KN034', surat: 'Saba', ayat: '56-60' },
    { code: 'KN035', surat: 'Fatir', ayat: '95-102' },
    { code: 'KN036', surat: 'Ya-Sin', ayat: '135-139' },
    { code: 'KN037', surat: 'As-Saffat', ayat: '136-145' },
    { code: 'KN038', surat: 'Sad', ayat: '169-179' },
    { code: 'KN039', surat: 'Az-Zumar', ayat: '29-33' },
    { code: 'KN040', surat: 'Ghafir', ayat: '68-75' },
    { code: 'KN041', surat: 'Fussilat', ayat: '124-132' },
    { code: 'KN042', surat: 'Ash-Shura', ayat: '171-178' },
    { code: 'KN043', surat: 'Az-Zukhruf', ayat: '6-12' },
    { code: 'KN044', surat: 'Ad-Dukhan', ayat: '163-166' },
    { code: 'KN045', surat: 'Al-Jathiyah', ayat: '70-73' },
    { code: 'KN046', surat: 'Al-Ahqaf', ayat: '102-112' },
    { code: 'KN047', surat: 'Muhammad', ayat: '143-151' },
    { code: 'KN048', surat: 'Al-Fath', ayat: '84-93' },
    { code: 'KN049', surat: 'Al-Hujurat', ayat: '66-76' },
    { code: 'KN050', surat: 'Qaf', ayat: '36-45' },
    { code: 'KN051', surat: 'Adh-Dhariyat', ayat: '69-72' },
    { code: 'KN052', surat: 'At-Tur', ayat: '129-137' },
    { code: 'KN053', surat: 'An-Najm', ayat: '109-116' },
    { code: 'KN054', surat: 'Al-Qamar', ayat: '111-118' },
    { code: 'KN055', surat: 'Ar-Rahman', ayat: '1-4' },
    { code: 'KN056', surat: 'Al-Waqi\'ah', ayat: '117-125' },
    { code: 'KN057', surat: 'Al-Hadid', ayat: '162-167' },
    { code: 'KN058', surat: 'Al-Mujadilah', ayat: '35-41' },
    { code: 'KN059', surat: 'Al-Hashr', ayat: '156-160' },
    { code: 'KN060', surat: 'Al-Mumtahanah', ayat: '44-49' },
    { code: 'KN061', surat: 'As-Saff', ayat: '173-181' },
    { code: 'KN062', surat: 'Al-Jumu\'ah', ayat: '50-56' },
  ],
  'KH': [
    { code: 'KH063', surat: 'Al-Munafiqun', ayat: '13-21' },
    { code: 'KH064', surat: 'At-Taghabun', ayat: '145-155' },
    { code: 'KH065', surat: 'At-Talaq', ayat: '87-96' },
    { code: 'KH066', surat: 'At-Tahrim', ayat: '82-87' },
    { code: 'KH067', surat: 'Al-Mulk', ayat: '78-86' },
    { code: 'KH068', surat: 'Al-Qalam', ayat: '156-166' },
    { code: 'KH069', surat: 'Al-Haqqah', ayat: '158-161' },
    { code: 'KH070', surat: 'Al-Ma\'arij', ayat: '117-123' },
    { code: 'KH071', surat: 'Nuh', ayat: '20-25' },
    { code: 'KH072', surat: 'Al-Jinn', ayat: '26-31' },
    { code: 'KH073', surat: 'Al-Muzzammil', ayat: '174-181' },
    { code: 'KH074', surat: 'Al-Muddaththir', ayat: '99-106' },
    { code: 'KH075', surat: 'Al-Qiyamah', ayat: '19-28' },
    { code: 'KH076', surat: 'Al-Insan', ayat: '165-169' },
    { code: 'KH077', surat: 'Al-Mursalat', ayat: '170-176' },
    { code: 'KH078', surat: 'An-Naba', ayat: '109-117' },
    { code: 'KH079', surat: 'An-Nazi\'at', ayat: '35-42' },
    { code: 'KH080', surat: 'Abasa', ayat: '100-103' },
    { code: 'KH081', surat: 'At-Takwir', ayat: '9-14' },
    { code: 'KH082', surat: 'Al-Infitar', ayat: '20-29' },
    { code: 'KH083', surat: 'Al-Mutaffifin', ayat: '1-4' },
    { code: 'KH084', surat: 'Al-Inshiqaq', ayat: '83-89' },
    { code: 'KH085', surat: 'Al-Buruj', ayat: '29-38' },
    { code: 'KH086', surat: 'At-Tariq', ayat: '119-126' },
    { code: 'KH087', surat: 'Al-A\'la', ayat: '52-59' },
    { code: 'KH088', surat: 'Al-Ghashiyah', ayat: '67-71' },
    { code: 'KH089', surat: 'Al-Fajr', ayat: '43-48' },
    { code: 'KH090', surat: 'Al-Balad', ayat: '95-104' },
    { code: 'KH091', surat: 'Ash-Shams', ayat: '174-178' },
    { code: 'KH092', surat: 'Al-Lail', ayat: '50-57' },
    { code: 'KH093', surat: 'Ad-Duha', ayat: '8-14' },
    { code: 'KH094', surat: 'Ash-Sharh', ayat: '14-18' },
    { code: 'KH095', surat: 'At-Tin', ayat: '124-127' },
    { code: 'KH096', surat: 'Al-\'Alaq', ayat: '45-51' },
    { code: 'KH097', surat: 'Al-Qadr', ayat: '111-118' },
    { code: 'KH098', surat: 'Al-Bayyinah', ayat: '99-106' },
    { code: 'KH099', surat: 'Az-Zalzalah', ayat: '159-165' },
    { code: 'KH100', surat: 'Al-Adiyat', ayat: '156-160' },
    { code: 'KH101', surat: 'Al-Qari\'ah', ayat: '62-71' },
    { code: 'KH102', surat: 'At-Takathur', ayat: '106-109' },
    { code: 'KH103', surat: 'Al-Asr', ayat: '77-84' },
    { code: 'KH104', surat: 'Al-Humazah', ayat: '23-33' },
    { code: 'KH105', surat: 'Al-Fil', ayat: '21-24' },
    { code: 'KH106', surat: 'Quraish', ayat: '44-47' },
    { code: 'KH107', surat: 'Al-Ma\'un', ayat: '30-39' },
    { code: 'KH108', surat: 'Al-Kawthar', ayat: '67-75' },
    { code: 'KH109', surat: 'Al-Kafirun', ayat: '160-163' },
    { code: 'KH110', surat: 'An-Nasr', ayat: '114-119' },
    { code: 'KH111', surat: 'Al-Lahab', ayat: '130-133' },
    { code: 'KH112', surat: 'Al-Ikhlas', ayat: '164-174' },
    { code: 'KH113', surat: 'Al-Falaq', ayat: '124-127' },
    { code: 'KH114', surat: 'An-Nas', ayat: '89-95' },
    { code: 'KH115', surat: 'Al-Fatihah', ayat: '115-119' },
    { code: 'KH116', surat: 'Al-Baqarah', ayat: '26-29' },
    { code: 'KH117', surat: 'Ali Imran', ayat: '163-166' },
    { code: 'KH118', surat: 'An-Nisa', ayat: '99-105' },
    { code: 'KH119', surat: 'Al-Maidah', ayat: '83-90' },
    { code: 'KH120', surat: 'Al-An\'am', ayat: '8-13' },
    { code: 'KH121', surat: 'Al-A\'raf', ayat: '53-57' },
    { code: 'KH122', surat: 'Al-Anfal', ayat: '65-69' },
    { code: 'KH123', surat: 'At-Taubah', ayat: '71-79' },
    { code: 'KH124', surat: 'Yunus', ayat: '37-46' },
  ],
  'KD': [
    { code: 'KD125', surat: 'Hud', ayat: '110-117' },
    { code: 'KD126', surat: 'Yusuf', ayat: '131-136' },
    { code: 'KD127', surat: 'Ar-Ra\'d', ayat: '93-97' },
    { code: 'KD128', surat: 'Ibrahim', ayat: '157-161' },
    { code: 'KD129', surat: 'Al-Hijr', ayat: '163-169' },
    { code: 'KD130', surat: 'An-Nahl', ayat: '170-174' },
    { code: 'KD131', surat: 'Al-Isra', ayat: '20-23' },
    { code: 'KD132', surat: 'Al-Kahf', ayat: '107-117' },
    { code: 'KD133', surat: 'Maryam', ayat: '45-51' },
    { code: 'KD134', surat: 'Taha', ayat: '89-97' },
    { code: 'KD135', surat: 'Al-Anbiya', ayat: '57-66' },
    { code: 'KD136', surat: 'Al-Hajj', ayat: '63-70' },
    { code: 'KD137', surat: 'Al-Mu\'minun', ayat: '7-11' },
    { code: 'KD138', surat: 'An-Nur', ayat: '82-85' },
    { code: 'KD139', surat: 'Al-Furqan', ayat: '156-166' },
    { code: 'KD140', surat: 'Ash-Shu\'ara', ayat: '77-83' },
    { code: 'KD141', surat: 'An-Naml', ayat: '6-16' },
    { code: 'KD142', surat: 'Al-Qasas', ayat: '143-147' },
    { code: 'KD143', surat: 'Al-Ankabut', ayat: '18-22' },
    { code: 'KD144', surat: 'Ar-Rum', ayat: '71-77' },
    { code: 'KD145', surat: 'Luqman', ayat: '13-19' },
    { code: 'KD146', surat: 'As-Sajdah', ayat: '120-127' },
    { code: 'KD147', surat: 'Al-Ahzab', ayat: '169-179' },
    { code: 'KD148', surat: 'Saba', ayat: '125-131' },
    { code: 'KD149', surat: 'Fatir', ayat: '138-146' },
    { code: 'KD150', surat: 'Ya-Sin', ayat: '126-135' },
    { code: 'KD151', surat: 'As-Saffat', ayat: '76-83' },
    { code: 'KD152', surat: 'Sad', ayat: '126-130' },
    { code: 'KD153', surat: 'Az-Zumar', ayat: '76-85' },
    { code: 'KD154', surat: 'Ghafir', ayat: '133-138' },
    { code: 'KD155', surat: 'Fussilat', ayat: '111-116' },
    { code: 'KD156', surat: 'Ash-Shura', ayat: '51-55' },
    { code: 'KD157', surat: 'Az-Zukhruf', ayat: '76-84' },
    { code: 'KD158', surat: 'Ad-Dukhan', ayat: '132-137' },
    { code: 'KD159', surat: 'Al-Jathiyah', ayat: '139-147' },
    { code: 'KD160', surat: 'Al-Ahqaf', ayat: '4-14' },
    { code: 'KD161', surat: 'Muhammad', ayat: '60-70' },
    { code: 'KD162', surat: 'Al-Fath', ayat: '124-133' },
    { code: 'KD163', surat: 'Al-Hujurat', ayat: '30-35' },
    { code: 'KD164', surat: 'Qaf', ayat: '10-13' },
    { code: 'KD165', surat: 'Adh-Dhariyat', ayat: '174-177' },
    { code: 'KD166', surat: 'At-Tur', ayat: '107-117' },
    { code: 'KD167', surat: 'An-Najm', ayat: '50-53' },
    { code: 'KD168', surat: 'Al-Qamar', ayat: '147-157' },
    { code: 'KD169', surat: 'Ar-Rahman', ayat: '32-37' },
    { code: 'KD170', surat: 'Al-Waqi\'ah', ayat: '15-24' },
    { code: 'KD171', surat: 'Al-Hadid', ayat: '168-175' },
    { code: 'KD172', surat: 'Al-Mujadilah', ayat: '93-97' },
    { code: 'KD173', surat: 'Al-Hashr', ayat: '97-100' },
    { code: 'KD174', surat: 'Al-Mumtahanah', ayat: '141-148' },
    { code: 'KD175', surat: 'As-Saff', ayat: '150-155' },
    { code: 'KD176', surat: 'Al-Jumu\'ah', ayat: '75-84' },
    { code: 'KD177', surat: 'Al-Munafiqun', ayat: '6-12' },
    { code: 'KD178', surat: 'At-Taghabun', ayat: '39-48' },
    { code: 'KD179', surat: 'At-Talaq', ayat: '14-17' },
    { code: 'KD180', surat: 'At-Tahrim', ayat: '57-66' },
    { code: 'KD181', surat: 'Al-Mulk', ayat: '162-171' },
    { code: 'KD182', surat: 'Al-Qalam', ayat: '16-23' },
    { code: 'KD183', surat: 'Al-Haqqah', ayat: '127-135' },
    { code: 'KD184', surat: 'Al-Ma\'arij', ayat: '12-16' },
    { code: 'KD185', surat: 'Nuh', ayat: '57-66' },
    { code: 'KD186', surat: 'Al-Jinn', ayat: '54-61' },
  ],
  'KK': [
    { code: 'KK187', surat: 'Al-Muzzammil', ayat: '79-89' },
    { code: 'KK188', surat: 'Al-Muddaththir', ayat: '11-18' },
    { code: 'KK189', surat: 'Al-Qiyamah', ayat: '105-114' },
    { code: 'KK190', surat: 'Al-Insan', ayat: '66-69' },
    { code: 'KK191', surat: 'Al-Mursalat', ayat: '21-30' },
    { code: 'KK192', surat: 'An-Naba', ayat: '75-83' },
    { code: 'KK193', surat: 'An-Nazi\'at', ayat: '128-131' },
    { code: 'KK194', surat: 'Abasa', ayat: '148-154' },
    { code: 'KK195', surat: 'At-Takwir', ayat: '64-72' },
    { code: 'KK196', surat: 'Al-Infitar', ayat: '49-57' },
    { code: 'KK197', surat: 'Al-Mutaffifin', ayat: '179-184' },
    { code: 'KK198', surat: 'Al-Inshiqaq', ayat: '159-164' },
    { code: 'KK199', surat: 'Al-Buruj', ayat: '9-13' },
    { code: 'KK200', surat: 'At-Tariq', ayat: '65-73' },
    { code: 'KK201', surat: 'Al-A\'la', ayat: '113-118' },
    { code: 'KK202', surat: 'Al-Ghashiyah', ayat: '123-129' },
    { code: 'KK203', surat: 'Al-Fajr', ayat: '98-106' },
    { code: 'KK204', surat: 'Al-Balad', ayat: '36-43' },
    { code: 'KK205', surat: 'Ash-Shams', ayat: '101-106' },
    { code: 'KK206', surat: 'Al-Lail', ayat: '67-77' },
    { code: 'KK207', surat: 'Ad-Duha', ayat: '155-162' },
    { code: 'KK208', surat: 'Ash-Sharh', ayat: '1-6' },
    { code: 'KK209', surat: 'At-Tin', ayat: '121-129' },
    { code: 'KK210', surat: 'Al-\'Alaq', ayat: '154-157' },
    { code: 'KK211', surat: 'Al-Qadr', ayat: '48-58' },
    { code: 'KK212', surat: 'Al-Bayyinah', ayat: '110-116' },
    { code: 'KK213', surat: 'Az-Zalzalah', ayat: '142-150' },
    { code: 'KK214', surat: 'Al-Adiyat', ayat: '103-111' },
    { code: 'KK215', surat: 'Al-Qari\'ah', ayat: '122-126' },
    { code: 'KK216', surat: 'At-Takathur', ayat: '128-132' },
    { code: 'KK217', surat: 'Al-Asr', ayat: '78-84' },
    { code: 'KK218', surat: 'Al-Humazah', ayat: '20-28' },
    { code: 'KK219', surat: 'Al-Fil', ayat: '174-178' },
    { code: 'KK220', surat: 'Quraish', ayat: '23-30' },
    { code: 'KK221', surat: 'Al-Ma\'un', ayat: '43-47' },
    { code: 'KK222', surat: 'Al-Kawthar', ayat: '17-26' },
    { code: 'KK223', surat: 'Al-Kafirun', ayat: '103-106' },
    { code: 'KK224', surat: 'An-Nasr', ayat: '17-20' },
    { code: 'KK225', surat: 'Al-Lahab', ayat: '31-41' },
    { code: 'KK226', surat: 'Al-Ikhlas', ayat: '149-156' },
    { code: 'KK227', surat: 'Al-Falaq', ayat: '117-121' },
    { code: 'KK228', surat: 'An-Nas', ayat: '130-134' },
    { code: 'KK229', surat: 'Al-Fatihah', ayat: '29-36' },
    { code: 'KK230', surat: 'Al-Baqarah', ayat: '67-76' },
    { code: 'KK231', surat: 'Ali Imran', ayat: '14-24' },
    { code: 'KK232', surat: 'An-Nisa', ayat: '54-62' },
    { code: 'KK233', surat: 'Al-Maidah', ayat: '63-68' },
    { code: 'KK234', surat: 'Al-An\'am', ayat: '62-72' },
    { code: 'KK235', surat: 'Al-A\'raf', ayat: '73-77' },
    { code: 'KK236', surat: 'Al-Anfal', ayat: '51-58' },
    { code: 'KK237', surat: 'At-Taubah', ayat: '141-148' },
    { code: 'KK238', surat: 'Yunus', ayat: '34-38' },
    { code: 'KK239', surat: 'Hud', ayat: '164-168' },
    { code: 'KK240', surat: 'Yusuf', ayat: '38-47' },
    { code: 'KK241', surat: 'Ar-Ra\'d', ayat: '159-163' },
    { code: 'KK242', surat: 'Ibrahim', ayat: '20-23' },
    { code: 'KK243', surat: 'Al-Hijr', ayat: '62-69' },
    { code: 'KK244', surat: 'An-Nahl', ayat: '167-173' },
    { code: 'KK245', surat: 'Al-Isra', ayat: '15-19' },
    { code: 'KK246', surat: 'Al-Kahf', ayat: '177-183' },
    { code: 'KK247', surat: 'Maryam', ayat: '85-88' },
    { code: 'KK248', surat: 'Taha', ayat: '67-71' },
  ],
  'KTIQ': [
    { code: 'KTIQ001', surat: 'Al-Fatihah', ayat: '145-148' },
    { code: 'KTIQ002', surat: 'Al-Baqarah', ayat: '30-37' },
    { code: 'KTIQ003', surat: 'Ali Imran', ayat: '43-49' },
    { code: 'KTIQ004', surat: 'An-Nisa', ayat: '117-120' },
    { code: 'KTIQ005', surat: 'Al-Maidah', ayat: '24-32' },
    { code: 'KTIQ006', surat: 'Al-An\'am', ayat: '137-142' },
    { code: 'KTIQ007', surat: 'Al-A\'raf', ayat: '39-44' },
    { code: 'KTIQ008', surat: 'Al-Anfal', ayat: '64-68' },
    { code: 'KTIQ009', surat: 'At-Taubah', ayat: '20-27' },
    { code: 'KTIQ010', surat: 'Yunus', ayat: '162-170' },
    { code: 'KTIQ011', surat: 'Hud', ayat: '53-56' },
    { code: 'KTIQ012', surat: 'Yusuf', ayat: '68-77' },
    { code: 'KTIQ013', surat: 'Ar-Ra\'d', ayat: '95-99' },
    { code: 'KTIQ014', surat: 'Ibrahim', ayat: '179-183' },
    { code: 'KTIQ015', surat: 'Al-Hijr', ayat: '94-104' },
    { code: 'KTIQ016', surat: 'An-Nahl', ayat: '156-160' },
    { code: 'KTIQ017', surat: 'Al-Isra', ayat: '137-147' },
    { code: 'KTIQ018', surat: 'Al-Kahf', ayat: '5-9' },
    { code: 'KTIQ019', surat: 'Maryam', ayat: '67-71' },
    { code: 'KTIQ020', surat: 'Taha', ayat: '1-9' },
    { code: 'KTIQ021', surat: 'Al-Anbiya', ayat: '70-80' },
    { code: 'KTIQ022', surat: 'Al-Hajj', ayat: '13-17' },
    { code: 'KTIQ023', surat: 'Al-Mu\'minun', ayat: '168-171' },
    { code: 'KTIQ024', surat: 'An-Nur', ayat: '27-34' },
    { code: 'KTIQ025', surat: 'Al-Furqan', ayat: '169-172' },
    { code: 'KTIQ026', surat: 'Ash-Shu\'ara', ayat: '166-173' },
    { code: 'KTIQ027', surat: 'An-Naml', ayat: '99-107' },
    { code: 'KTIQ028', surat: 'Al-Qasas', ayat: '23-27' },
    { code: 'KTIQ029', surat: 'Al-Ankabut', ayat: '61-68' },
    { code: 'KTIQ030', surat: 'Ar-Rum', ayat: '81-89' },
    { code: 'KTIQ031', surat: 'Luqman', ayat: '173-179' },
    { code: 'KTIQ032', surat: 'As-Sajdah', ayat: '49-57' },
    { code: 'KTIQ033', surat: 'Al-Ahzab', ayat: '45-51' },
    { code: 'KTIQ034', surat: 'Saba', ayat: '117-122' },
    { code: 'KTIQ035', surat: 'Fatir', ayat: '125-130' },
    { code: 'KTIQ036', surat: 'Ya-Sin', ayat: '143-147' },
    { code: 'KTIQ037', surat: 'As-Saffat', ayat: '43-53' },
    { code: 'KTIQ038', surat: 'Sad', ayat: '76-82' },
    { code: 'KTIQ039', surat: 'Az-Zumar', ayat: '12-19' },
    { code: 'KTIQ040', surat: 'Ghafir', ayat: '18-21' },
    { code: 'KTIQ041', surat: 'Fussilat', ayat: '63-70' },
    { code: 'KTIQ042', surat: 'Ash-Shura', ayat: '170-173' },
    { code: 'KTIQ043', surat: 'Az-Zukhruf', ayat: '8-14' },
    { code: 'KTIQ044', surat: 'Ad-Dukhan', ayat: '159-164' },
    { code: 'KTIQ045', surat: 'Al-Jathiyah', ayat: '91-99' },
    { code: 'KTIQ046', surat: 'Al-Ahqaf', ayat: '98-108' },
    { code: 'KTIQ047', surat: 'Muhammad', ayat: '169-178' },
    { code: 'KTIQ048', surat: 'Al-Fath', ayat: '172-180' },
    { code: 'KTIQ049', surat: 'Al-Hujurat', ayat: '104-114' },
    { code: 'KTIQ050', surat: 'Qaf', ayat: '88-98' },
    { code: 'KTIQ051', surat: 'Adh-Dhariyat', ayat: '160-167' },
    { code: 'KTIQ052', surat: 'At-Tur', ayat: '64-68' },
    { code: 'KTIQ053', surat: 'An-Najm', ayat: '33-36' },
    { code: 'KTIQ054', surat: 'Al-Qamar', ayat: '176-183' },
    { code: 'KTIQ055', surat: 'Ar-Rahman', ayat: '5-12' },
    { code: 'KTIQ056', surat: 'Al-Waqi\'ah', ayat: '144-152' },
    { code: 'KTIQ057', surat: 'Al-Hadid', ayat: '19-27' },
    { code: 'KTIQ058', surat: 'Al-Mujadilah', ayat: '43-47' },
    { code: 'KTIQ059', surat: 'Al-Hashr', ayat: '132-135' },
    { code: 'KTIQ060', surat: 'Al-Mumtahanah', ayat: '8-17' },
    { code: 'KTIQ061', surat: 'As-Saff', ayat: '106-114' },
    { code: 'KTIQ062', surat: 'Al-Jumu\'ah', ayat: '79-89' },
  ],
};
const branches = ['TLA', 'TLR', 'TLD', 'QM', 'H1J', 'H5J', 'H10J', 'H20J', 'H30J', 
                    'TFI', 'TFA', 'TFE', 'FAQ', 'SAQ', 'KN', 'KH', 'KD', 'KK', 'KTIQ'];

branches.forEach(function(branch) {
    if (!maqraDatabase[branch]) {
      maqraDatabase[branch] = generateMaqraListForBranch(branch);
    }
  });
return maqraDatabase[branchCode] || [];
}

function generateMaqraListForBranch(branchCode) {
  // 62 surat unik untuk setiap cabang
  const surahList = [
    { surat: 'Al-Fatihah', ayat: '1-7' },
    { surat: 'Al-Baqarah', ayat: '1-5' },
    { surat: 'Al-Baqarah', ayat: '183-186' },
    { surat: 'Al-Baqarah', ayat: '255-257' },
    { surat: 'Ali Imran', ayat: '1-9' },
    { surat: 'Ali Imran', ayat: '18-20' },
    { surat: 'Ali Imran', ayat: '190-200' },
    { surat: 'An-Nisa', ayat: '1-10' },
    { surat: 'An-Nisa', ayat: '58-59' },
    { surat: 'Al-Maidah', ayat: '1-5' },
    { surat: 'Al-An\'am', ayat: '1-10' },
    { surat: 'Al-A\'raf', ayat: '1-10' },
    { surat: 'Al-Anfal', ayat: '1-10' },
    { surat: 'At-Taubah', ayat: '1-10' },
    { surat: 'Yunus', ayat: '1-10' },
    { surat: 'Hud', ayat: '1-10' },
    { surat: 'Yusuf', ayat: '1-10' },
    { surat: 'Ar-Ra\'d', ayat: '1-10' },
    { surat: 'Ibrahim', ayat: '1-10' },
    { surat: 'Al-Hijr', ayat: '1-10' },
    { surat: 'An-Nahl', ayat: '1-10' },
    { surat: 'Al-Isra', ayat: '1-10' },
    { surat: 'Al-Isra', ayat: '23-24' },
    { surat: 'Al-Kahf', ayat: '1-10' },
    { surat: 'Maryam', ayat: '1-10' },
    { surat: 'Taha', ayat: '1-10' },
    { surat: 'Al-Anbiya', ayat: '1-10' },
    { surat: 'Al-Hajj', ayat: '1-10' },
    { surat: 'Al-Mu\'minun', ayat: '1-10' },
    { surat: 'An-Nur', ayat: '1-10' },
    { surat: 'Al-Furqan', ayat: '1-10' },
    { surat: 'Ash-Shu\'ara', ayat: '1-10' },
    { surat: 'An-Naml', ayat: '1-10' },
    { surat: 'Al-Qasas', ayat: '1-10' },
    { surat: 'Al-Ankabut', ayat: '1-10' },
    { surat: 'Ar-Rum', ayat: '1-10' },
    { surat: 'Luqman', ayat: '1-10' },
    { surat: 'As-Sajdah', ayat: '1-10' },
    { surat: 'Al-Ahzab', ayat: '1-10' },
    { surat: 'Saba', ayat: '1-10' },
    { surat: 'Fatir', ayat: '1-10' },
    { surat: 'Ya-Sin', ayat: '1-10' },
    { surat: 'As-Saffat', ayat: '1-10' },
    { surat: 'Sad', ayat: '1-10' },
    { surat: 'Az-Zumar', ayat: '1-10' },
    { surat: 'Ghafir', ayat: '1-10' },
    { surat: 'Fussilat', ayat: '1-10' },
    { surat: 'Ash-Shura', ayat: '1-10' },
    { surat: 'Az-Zukhruf', ayat: '1-10' },
    { surat: 'Ad-Dukhan', ayat: '1-18' },
    { surat: 'Al-Jathiyah', ayat: '1-10' },
    { surat: 'Al-Ahqaf', ayat: '1-10' },
    { surat: 'Muhammad', ayat: '1-10' },
    { surat: 'Al-Fath', ayat: '1-10' },
    { surat: 'Al-Hujurat', ayat: '1-10' },
    { surat: 'Qaf', ayat: '1-10' },
    { surat: 'Adh-Dhariyat', ayat: '1-10' },
    { surat: 'At-Tur', ayat: '1-10' },
    { surat: 'An-Najm', ayat: '1-10' },
    { surat: 'Al-Qamar', ayat: '1-10' },
    { surat: 'Ar-Rahman', ayat: '1-10' },
    { surat: 'Al-Waqi\'ah', ayat: '1-10' }
  ];
  
  const maqraList = [];
  for (let i = 1; i <= 62; i++) {
    const surah = surahList[i - 1];
    maqraList.push({
      code: branchCode + String(i).padStart(3, '0'),
      surat: surah.surat,
      ayat: surah.ayat
    });
  }
  
  return maqraList;
}

function generateMaqraData(branchCode, count) {
  const surahList = [
    { surat: 'Al-Fatihah', ayat: '1-7' },
    { surat: 'Al-Baqarah', ayat: '1-5' },
    { surat: 'Al-Baqarah', ayat: '183-186' },
    { surat: 'Ali Imran', ayat: '1-9' },
    { surat: 'Ali Imran', ayat: '190-200' },
    { surat: 'An-Nisa', ayat: '1-10' },
    { surat: 'Al-Maidah', ayat: '1-5' },
    { surat: 'Al-An\'am', ayat: '1-10' },
    { surat: 'Al-A\'raf', ayat: '1-10' },
    { surat: 'Al-Anfal', ayat: '1-10' }
  ];
  
  const maqraList = [];
  
  for (let i = 1; i <= count; i++) {
    const surahIndex = (i - 1) % surahList.length;
    const surah = surahList[surahIndex];
    
    maqraList.push({
      code: branchCode + String(i).padStart(3, '0'),
      surat: surah.surat,
      ayat: surah.ayat
    });
  }
  
  return maqraList;
}

// Check if juri has already submitted for this cabang
function checkJuriSubmission(cabang, juri) {
  try {
    Logger.log('=== CHECK JURI SUBMISSION ===');
    Logger.log('Cabang:', cabang);
    Logger.log('Juri:', juri);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        hasSubmitted: false
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const penilaianIdx = headers.indexOf('Penilaian');
    
    if (cabangIdx === -1 || penilaianIdx === -1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Kolom tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowCabang = row[cabangIdx];
      const rowPenilaian = row[penilaianIdx];
      
      // Check if cabang matches
      if (rowCabang && rowCabang.toString().includes(cabang)) {
        if (rowPenilaian && rowPenilaian !== '-') {
          try {
            const penilaianData = JSON.parse(rowPenilaian);
            
            // Check if this juri has already submitted
            if (penilaianData.juri && Array.isArray(penilaianData.juri)) {
              for (let j = 0; j < penilaianData.juri.length; j++) {
                if (penilaianData.juri[j].namaJuri === juri) {
                  Logger.log('Juri already submitted');
                  return ContentService.createTextOutput(JSON.stringify({
                    success: true,
                    hasSubmitted: true,
                    data: penilaianData.juri[j]
                  })).setMimeType(ContentService.MimeType.JSON);
                }
              }
            }
          } catch (e) {
            Logger.log('Error parsing penilaian JSON:', e.message);
          }
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      hasSubmitted: false
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error:', error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Submit penilaian juri
function submitPenilaian(e) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  
  try {
    Logger.log('=== SUBMIT PENILAIAN START ===');
    Logger.log('Step 1: Acquiring lock...');
    
    lockAcquired = acquireLockWithRetry(lock, LOCK_TIMEOUT_MS, LOCK_WAIT_TIME_MS, MAX_LOCK_ATTEMPTS);
    
    if (!lockAcquired) {
      Logger.log('ERROR: Failed to acquire lock');
      return createResponse(false, 'Server sibuk, coba lagi dalam beberapa detik');
    }
    
    Logger.log('Step 2: Lock acquired successfully');
    
    const cabang = e.parameter.cabang;
    const namaJuri = e.parameter.namaJuri;
    const nomorPeserta = e.parameter.nomorPeserta;
    const nilaiAspek = JSON.parse(e.parameter.nilaiAspek);
    const nilaiTotal = parseFloat(e.parameter.nilaiTotal);
    
    const catatan = e.parameter.catatan || '';
    
    Logger.log('Step 3: Parameters received:');
    Logger.log('  - Cabang: ' + cabang);
    Logger.log('  - Juri: ' + namaJuri);
    Logger.log('  - Nomor Peserta: ' + nomorPeserta);
    Logger.log('  - Nilai Aspek: ' + JSON.stringify(nilaiAspek));
    Logger.log('  - Nilai Total: ' + nilaiTotal);
    
    Logger.log('Step 4: Opening spreadsheet...');
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found - ' + SHEET_NAME);
      lock.releaseLock();
      return createResponse(false, 'Sheet tidak ditemukan');
    }
    
    Logger.log('Step 5: Sheet opened successfully - ' + SHEET_NAME);
    
    // Find the row with matching nomor peserta and cabang
    const lastRow = sheet.getLastRow();
    Logger.log('Step 6: Total rows in sheet: ' + lastRow);
    
    const lastCol = sheet.getLastColumn();
    Logger.log('Step 7: Total columns in sheet: ' + lastCol);
    
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    Logger.log('Step 8: Headers retrieved, total: ' + headers.length);
    
    // Log all headers for debugging
    Logger.log('Step 9: All headers:');
    for (let i = 0; i < headers.length; i++) {
      Logger.log('  Column ' + (i + 1) + ': "' + headers[i] + '"');
    }
    
    const nomorPesertaIdx = headers.indexOf('Nomor Peserta');
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const penilaianIdx = headers.indexOf('Penilaian');
    
    Logger.log('Step 10: Column indices:');
    Logger.log('  - Nomor Peserta index: ' + nomorPesertaIdx);
    Logger.log('  - Cabang Lomba index: ' + cabangIdx);
    Logger.log('  - Penilaian index: ' + penilaianIdx);
    
    if (nomorPesertaIdx === -1) {
      Logger.log('ERROR: Column "Nomor Peserta" not found in headers');
      lock.releaseLock();
      return createResponse(false, 'Kolom "Nomor Peserta" tidak ditemukan di spreadsheet');
    }
    
    if (cabangIdx === -1) {
      Logger.log('ERROR: Column "Cabang Lomba" not found in headers');
      lock.releaseLock();
      return createResponse(false, 'Kolom "Cabang Lomba" tidak ditemukan di spreadsheet');
    }
    
    if (penilaianIdx === -1) {
      Logger.log('ERROR: Column "Penilaian" not found in headers');
      lock.releaseLock();
      return createResponse(false, 'Kolom "Penilaian" tidak ditemukan di spreadsheet');
    }
    
    Logger.log('Step 11: All required columns found successfully');
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    let targetRow = -1;
    let existingPenilaian = null;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNomor = row[nomorPesertaIdx].toString().trim();
      const rowCabang = row[cabangIdx];
      
      if (rowNomor === nomorPeserta.trim() && rowCabang && rowCabang.toString().includes(cabang)) {
        targetRow = i + 2;
        const existingData = row[penilaianIdx];
        
        if (existingData && existingData !== '-') {
          try {
            existingPenilaian = JSON.parse(existingData);
          } catch (e) {
            existingPenilaian = { juri: [] };
          }
        } else {
          existingPenilaian = { juri: [] };
        }
        
        break;
      }
    }
    
    if (targetRow === -1) {
      lock.releaseLock();
      return createResponse(false, 'Data peserta tidak ditemukan. Pastikan nomor peserta benar.');
    }
    
    // Check if juri already submitted
    if (existingPenilaian.juri && Array.isArray(existingPenilaian.juri)) {
      for (let j = 0; j < existingPenilaian.juri.length; j++) {
        if (existingPenilaian.juri[j].namaJuri === namaJuri) {
          lock.releaseLock();
          return createResponse(false, 'Anda sudah memberikan penilaian untuk peserta ini.');
        }
      }
    }
    
    // Upload bukti penilaian
    const filesData = JSON.parse(e.parameter.files);
    const buktiLinks = [];
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const timestamp = new Date().getTime();
    
    for (let i = 0; i < filesData.length; i++) {
      const fileData = filesData[i];
      const fileName = `Penilaian_${namaJuri}_${nomorPeserta}_${timestamp}_${i}.${fileData.type.split('/')[1]}`;
      
      const blob = Utilities.newBlob(
        Utilities.base64Decode(fileData.data),
        fileData.type,
        fileName
      );
      
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      buktiLinks.push(file.getUrl());
    }
    
    // Add new penilaian
    const nilaiTotal = (nilaiTajwid + nilaiFasohah + nilaiSuara + nilaiAdab) / 4;
    
    const newPenilaian = {
      namaJuri: namaJuri,
      nomorPeserta: nomorPeserta,
      nilaiAspek: nilaiAspek,
      nilaiTotal: nilaiTotal,
      catatan: catatan,
      buktiPenilaian: buktiLinks,
      timestamp: new Date().toISOString()
    };
    
    existingPenilaian.juri.push(newPenilaian);
    
    // Calculate rata-rata from all juri
    let totalNilai = 0;
    for (let j = 0; j < existingPenilaian.juri.length; j++) {
      totalNilai += existingPenilaian.juri[j].nilaiTotal;
    }
    existingPenilaian.rataRata = totalNilai / existingPenilaian.juri.length;
    
    // Update sheet
    sheet.getRange(targetRow, penilaianIdx + 1).setValue(JSON.stringify(existingPenilaian));
    
    lock.releaseLock();
    lockAcquired = false;
    
    Logger.log('✅ Penilaian berhasil disimpan');
    
    return createResponse(true, 'Penilaian berhasil dikirim!', null, {
      nilaiTotal: nilaiTotal,
      rataRata: existingPenilaian.rataRata
    });
    
  } catch (error) {
    Logger.log('Error:', error.message);
    Logger.log('Stack:', error.stack);
    if (lockAcquired) {
      lock.releaseLock();
    }
    return createResponse(false, 'Terjadi kesalahan: ' + error.toString());
  }
}

// Get list peserta for a specific cabang
function getPesertaByCabang(cabang) {
  try {
    Logger.log('=== GET PESERTA BY CABANG ===');
    Logger.log('Cabang requested: ' + cabang);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log('ERROR: Sheet not found');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Sheet tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const lastRow = sheet.getLastRow();
    Logger.log('Total rows: ' + lastRow);
    
    if (lastRow <= 1) {
      Logger.log('No data in sheet');
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        peserta: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const nomorPesertaIdx = headers.indexOf('Nomor Peserta');
    const namaIdx = headers.indexOf('Nama Lengkap');
    const namaReguIdx = headers.indexOf('Nama Regu/Tim');
    const cabangIdx = headers.indexOf('Cabang Lomba');
    const statusIdx = headers.indexOf('Status');
    const maqraIdx = headers.indexOf('Maqra');
    
    Logger.log('Column indices:');
    Logger.log('  - Nomor Peserta: ' + nomorPesertaIdx);
    Logger.log('  - Nama Lengkap: ' + namaIdx);
    Logger.log('  - Nama Regu/Tim: ' + namaReguIdx);
    Logger.log('  - Cabang Lomba: ' + cabangIdx);
    Logger.log('  - Status: ' + statusIdx);
    
    if (nomorPesertaIdx === -1 || cabangIdx === -1) {
      Logger.log('ERROR: Required columns not found');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Kolom tidak ditemukan'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const data = dataRange.getValues();
    
    const pesertaList = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowCabang = row[cabangIdx];
      const rowStatus = row[statusIdx];
      
      // Check if cabang matches and status is verified
      if (rowCabang && rowCabang.toString().includes(cabang)) {
        // Only include verified participants
        if (rowStatus === 'Terverifikasi' || rowStatus === 'Diterima' || rowStatus === 'Verified') {
          const nomorPeserta = row[nomorPesertaIdx] ? row[nomorPesertaIdx].toString() : '';
          const nama = row[namaIdx] ? row[namaIdx].toString() : '';
          const namaRegu = row[namaReguIdx] ? row[namaReguIdx].toString() : '';
          const maqra = row[maqraIdx] ? row[maqraIdx].toString() : '';

          // Use team name if exists, otherwise use personal name
          const displayName = (namaRegu && namaRegu !== '-') ? namaRegu : nama;
          
          if (nomorPeserta) {
            pesertaList.push({
              nomorPeserta: nomorPeserta,
              nama: displayName,
              display: nomorPeserta + ' - ' + displayName,
              maqra: maqra
            });
          }
        }
      }
    }
    
    Logger.log('Found ' + pesertaList.length + ' verified peserta for cabang: ' + cabang);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      peserta: pesertaList
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Error: ' + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}