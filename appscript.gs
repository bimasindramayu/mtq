// ===== KONFIGURASI =====
const SHEET_ID = '1_Sj7ehvNrJteModhFkhoYB0ut12Np1zv0SDIknWCn7A';
const FOLDER_ID = '1AK6rc4VUOJg_wDFed8F2nLzFSaDqf_5o';
const SHEET_NAME = 'Peserta';

// REGISTRATION TIME WINDOW (WIB = UTC+7)
const REGISTRATION_START = new Date('2025-10-29T00:00:00+07:00');
const REGISTRATION_END = new Date('2025-11-03T12:00:00+07:00');

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
    
    // ===== GENERATE NOMOR PESERTA =====
    Logger.log('STEP 1B: Generating nomor peserta...');
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
    'Link - Doc Rekening Team 3', 'Link - Doc Pas Photo Team 3', 'Status', 'Alasan Ditolak'
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