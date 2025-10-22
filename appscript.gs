// ===== KONFIGURASI =====
const SHEET_ID = '1OO7VUbHhUbsqHc_EbGQVaG2Jq6EkIaTLIbLsmFnAb94';
const FOLDER_ID = '1FHpgcmKbMrN84R29ZaVvHpNlh-AvA7_y';
const SHEET_NAME = 'Peserta';

// REGISTRATION TIME WINDOW (WIB = UTC+7)
const REGISTRATION_START = new Date('2025-10-29T00:00:00+07:00');
const REGISTRATION_END = new Date('2025-10-30T23:59:59+07:00');

// MAX PARTICIPANTS PER BRANCH
const MAX_PARTICIPANTS_PER_BRANCH = 62;

// Document type mapping
const DOC_TYPES = {
  1: 'Surat Mandat',
  2: 'KTP',
  3: 'Sertifikat',
  4: 'Rekening',
  5: 'Pas Photo'
};

// ===== FUNGSI UTAMA =====
function doPost(e) {
  try {
    Logger.log('=== START doPost ===');
    Logger.log('Request received at: ' + new Date().toISOString());
    
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
    
    // Check for duplicates
    Logger.log('Checking for duplicate NIK across ALL cabang');
    const nikList = formData.nikList ? JSON.parse(formData.nikList) : [];
    
    const duplicateCheck = checkDuplicates(sheet, nikList);
    if (!duplicateCheck.isValid) {
      Logger.log('Duplicate found: ' + duplicateCheck.message);
      return createResponse(false, duplicateCheck.message);
    }
    
    // Generate nomor peserta
    Logger.log('Generating nomor peserta...');
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
}

// ===== GENERATE NOMOR PESERTA =====
function generateNomorPeserta(sheet, cabangCode, genderCode, isTeam) {
  try {
    const lastRow = sheet.getLastRow();
    
    // Get existing numbers for this branch
    const existingNumbers = [];
    if (lastRow > 1) {
      const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
      const data = dataRange.getValues();
      
      // Column index for Nomor Peserta (column 2, index 1)
      const nomorPesertaCol = 1;
      
      for (let i = 0; i < data.length; i++) {
        const nomorPeserta = data[i][nomorPesertaCol];
        if (nomorPeserta && nomorPeserta.toString().startsWith(cabangCode + '-')) {
          const num = parseInt(nomorPeserta.toString().split('-')[1]);
          if (!isNaN(num)) {
            existingNumbers.push(num);
          }
        }
      }
    }
    
    Logger.log('Existing numbers for ' + cabangCode + ': ' + existingNumbers.join(', '));
    
    // For team registration, use even numbers only (regardless of gender)
    // For personal registration, use odd (female) or even (male)
    const isOdd = isTeam ? false : (genderCode === 'female');
    
    // Find next available number
    let nextNumber = isOdd ? 1 : 2;
    while (existingNumbers.indexOf(nextNumber) !== -1) {
      nextNumber += 2;
      
      // Check if we've exceeded the limit
      if (nextNumber > MAX_PARTICIPANTS_PER_BRANCH) {
        return {
          success: false,
          message: 'Maaf, kuota peserta untuk cabang ' + cabangCode + ' (' + (isOdd ? 'Putri' : 'Putra') + ') sudah penuh. Maksimal 31 peserta per jenis kelamin.'
        };
      }
    }
    
    const nomorPeserta = cabangCode + '-' + nextNumber;
    Logger.log('Generated nomor peserta: ' + nomorPeserta);
    
    return {
      success: true,
      number: nomorPeserta
    };
    
  } catch (error) {
    Logger.log('Error in generateNomorPeserta: ' + error.message);
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
    
    // Column indices (0-based after getting values)
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
      
      Logger.log('Row ' + rowNum + ' (' + rowCabang + '): Found ' + existingNiks.length + ' NIKs');
      
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
    Logger.log('Error stack: ' + error.stack);
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

// ===== TAMBAH HEADER KE SHEET =====
function addHeaders(sheet) {
  const headers = [
    'No',
    'Nomor Peserta',
    'Timestamp',
    'Kecamatan',
    'Cabang Lomba',
    'Batas Usia Max',
    'Nama Regu/Tim',
    'NIK',
    'Nama Lengkap',
    'Jenis Kelamin',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Umur',
    'Alamat',
    'No Telepon',
    'Email',
    'Nama Rekening',
    'No Rekening',
    'Nama Bank',
    'Anggota Tim #1 - NIK',
    'Anggota Tim #1 - Nama',
    'Anggota Tim #1 - Jenis Kelamin',
    'Anggota Tim #1 - Tempat Lahir',
    'Anggota Tim #1 - Tgl Lahir',
    'Anggota Tim #1 - Umur',
    'Anggota Tim #1 - Alamat',
    'Anggota Tim #1 - No Telepon',
    'Anggota Tim #1 - Email',
    'Anggota Tim #1 - Nama Rekening',
    'Anggota Tim #1 - No Rekening',
    'Anggota Tim #1 - Nama Bank',
    'Anggota Tim #2 - NIK',
    'Anggota Tim #2 - Nama',
    'Anggota Tim #2 - Jenis Kelamin',
    'Anggota Tim #2 - Tempat Lahir',
    'Anggota Tim #2 - Tgl Lahir',
    'Anggota Tim #2 - Umur',
    'Anggota Tim #2 - Alamat',
    'Anggota Tim #2 - No Telepon',
    'Anggota Tim #2 - Email',
    'Anggota Tim #2 - Nama Rekening',
    'Anggota Tim #2 - No Rekening',
    'Anggota Tim #2 - Nama Bank',
    'Anggota Tim #3 - NIK',
    'Anggota Tim #3 - Nama',
    'Anggota Tim #3 - Jenis Kelamin',
    'Anggota Tim #3 - Tempat Lahir',
    'Anggota Tim #3 - Tgl Lahir',
    'Anggota Tim #3 - Umur',
    'Anggota Tim #3 - Alamat',
    'Anggota Tim #3 - No Telepon',
    'Anggota Tim #3 - Email',
    'Anggota Tim #3 - Nama Rekening',
    'Anggota Tim #3 - No Rekening',
    'Anggota Tim #3 - Nama Bank',
    'Link - Doc Surat Mandat Personal',
    'Link - Doc KTP Personal',
    'Link - Doc Sertifikat Personal',
    'Link - Doc Rekening Personal',
    'Link - Doc Pas Photo Personal',
    'Link - Doc Surat Mandat Team 1',
    'Link - Doc KTP Team 1',
    'Link - Doc Sertifikat Team 1',
    'Link - Doc Rekening Team 1',
    'Link - Doc Pas Photo Team 1',
    'Link - Doc Surat Mandat Team 2',
    'Link - Doc KTP Team 2',
    'Link - Doc Sertifikat Team 2',
    'Link - Doc Rekening Team 2',
    'Link - Doc Pas Photo Team 2',
    'Link - Doc Surat Mandat Team 3',
    'Link - Doc KTP Team 3',
    'Link - Doc Sertifikat Team 3',
    'Link - Doc Rekening Team 3',
    'Link - Doc Pas Photo Team 3',
    'Status'
  ];
  sheet.appendRow(headers);
}

// ===== PERBAIKAN #4: PROSES UPLOAD FILE TANPA _type dan _name =====
function processFileUploads(e, formData, nomorPeserta) {
  const fileLinks = {};
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const timestamp = new Date().getTime();
  
  try {
    const allBlobs = e.parameters;
    Logger.log('Processing file blobs: ' + JSON.stringify(Object.keys(allBlobs)));
    
    for (let key in allBlobs) {
      // SKIP _type dan _name parameters - JANGAN PROCESS
      if (key.endsWith('_type') || key.endsWith('_name')) {
        Logger.log('Skipping metadata: ' + key);
        continue;
      }
      
      // Hanya process file yang sebenarnya (doc1, doc2, teamDoc1_1, dll)
      if (key.startsWith('doc') || key.startsWith('teamDoc')) {
        try {
          if (allBlobs[key] && allBlobs[key][0]) {
            // Ambil original name dari metadata
            const originalName = allBlobs[key + '_name'] ? allBlobs[key + '_name'][0] : key;
            const mimeType = allBlobs[key + '_type'] ? allBlobs[key + '_type'][0] : 'application/octet-stream';
            
            // Extract file extension
            const lastDotIndex = originalName.lastIndexOf('.');
            const extension = lastDotIndex > -1 ? originalName.substring(lastDotIndex) : '';
            
            // Create unique filename: NomorPeserta_DocType_Timestamp.ext
            const uniqueFileName = nomorPeserta + '_' + key + '_' + timestamp + extension;
            
            const blob = Utilities.newBlob(
              Utilities.base64Decode(allBlobs[key][0]),
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
    no,
    nomorPeserta,
    timestamp,
    formData.kecamatan || '',
    formData.cabang || '',
    formData.maxAge || '',
    formData.namaRegu || '-',
    formData.nik || '',
    formData.nama || '',
    formData.jenisKelamin || '',
    formData.tempatLahir || '',
    formData.tglLahir || '',
    formData.umur || '',
    formData.alamat || '',
    formData.noTelepon || '',
    formData.email || '',
    formData.namaRek || '',
    formData.noRek || '',
    formData.namaBank || '',
    
    // Data anggota tim 1
    formData.memberNik1 || '-',
    formData.memberName1 || '-',
    formData.memberJenisKelamin1 || '-',
    formData.memberTempatLahir1 || '-',
    formData.memberBirthDate1 || '-',
    formData.memberUmur1 || '-',
    formData.memberAlamat1 || '-',
    formData.memberNoTelepon1 || '-',
    formData.memberEmail1 || '-',
    formData.memberNamaRek1 || '-',
    formData.memberNoRek1 || '-',
    formData.memberNamaBank1 || '-',
    
    // Data anggota tim 2
    formData.memberNik2 || '-',
    formData.memberName2 || '-',
    formData.memberJenisKelamin2 || '-',
    formData.memberTempatLahir2 || '-',
    formData.memberBirthDate2 || '-',
    formData.memberUmur2 || '-',
    formData.memberAlamat2 || '-',
    formData.memberNoTelepon2 || '-',
    formData.memberEmail2 || '-',
    formData.memberNamaRek2 || '-',
    formData.memberNoRek2 || '-',
    formData.memberNamaBank2 || '-',
    
    // Data anggota tim 3
    formData.memberNik3 || '-',
    formData.memberName3 || '-',
    formData.memberJenisKelamin3 || '-',
    formData.memberTempatLahir3 || '-',
    formData.memberBirthDate3 || '-',
    formData.memberUmur3 || '-',
    formData.memberAlamat3 || '-',
    formData.memberNoTelepon3 || '-',
    formData.memberEmail3 || '-',
    formData.memberNamaRek3 || '-',
    formData.memberNoRek3 || '-',
    formData.memberNamaBank3 || '-',
    
    // Link dokumen personal
    fileLinks['doc1'] || '',
    fileLinks['doc2'] || '',
    fileLinks['doc3'] || '',
    fileLinks['doc4'] || '',
    fileLinks['doc5'] || '',
    
    // Link dokumen team 1
    fileLinks['teamDoc1_1'] || '',
    fileLinks['teamDoc1_2'] || '',
    fileLinks['teamDoc1_3'] || '',
    fileLinks['teamDoc1_4'] || '',
    fileLinks['teamDoc1_5'] || '',
    
    // Link dokumen team 2
    fileLinks['teamDoc2_1'] || '',
    fileLinks['teamDoc2_2'] || '',
    fileLinks['teamDoc2_3'] || '',
    fileLinks['teamDoc2_4'] || '',
    fileLinks['teamDoc2_5'] || '',
    
    // Link dokumen team 3
    fileLinks['teamDoc3_1'] || '',
    fileLinks['teamDoc3_2'] || '',
    fileLinks['teamDoc3_3'] || '',
    fileLinks['teamDoc3_4'] || '',
    fileLinks['teamDoc3_5'] || '',
    
    // Status
    'Menunggu Verifikasi'
  ];
  
  return rowData;
}