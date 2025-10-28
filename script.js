// script.js
// ===== CONFIGURATION =====
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxr0oyshQ8pdzaOR0f5p6Js_Q5C8Sxl1iu2d90-sjZ5uMHTrF3gVBvfm2bkV6pFj4cu/exec';
const REGISTRATION_START = new Date('2025-10-29T00:00:00+07:00');
const REGISTRATION_END = new Date('2025-11-03T23:59:59+07:00');
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ===== DEVELOPER MODE CONFIG (BARU) =====
const DEV_CONFIG = {
    enabled: false,              // Set ke true untuk enable developer mode & tools
    loggerEnabled: false          // Set ke false untuk disable semua console logs
};

const Logger = {
    log: function(message, data = null) {
        if (!DEV_CONFIG.loggerEnabled) return;  // Cek config terlebih dahulu
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`, data || '');
    },
    error: function(message, error = null) {
        if (!DEV_CONFIG.loggerEnabled) return;  // Cek config terlebih dahulu
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`, error || '');
    }
};

const progressTracker = {
    totalSteps: 3,              // Total 3 tahap: Validasi, Konversi, Upload
    currentStep: 0,             // 0 = Validasi, 1 = Konversi, 2 = Upload
    filesTotal: 0,              // Total files yang akan dikonversi
    filesProcessed: 0,          // Files yang sudah dikonversi
    
    calculateProgress: function() {
        // Basis progress: 15% untuk validasi, 45% untuk konversi, 25% untuk upload
        let baseProgress = (this.currentStep / this.totalSteps) * 60;
        let fileProgress = (this.filesProcessed / Math.max(this.filesTotal, 1)) * 25;
        return Math.min(Math.round(baseProgress + fileProgress + 15), 99);
    },
    
    getDetailedMessage: function() {
        const steps = [
            'Validasi Data',
            'Konversi File',
            'Upload ke Server'
        ];
        const step = steps[this.currentStep] || 'Memproses';
        
        // Jika ada files, tampilkan progress konversi
        if (this.filesTotal > 0 && this.currentStep > 0) {
            return `${step}... (${this.filesProcessed}/${this.filesTotal} file)`;
        }
        return step;
    },
    
    reset: function() {
        this.currentStep = 0;
        this.filesTotal = 0;
        this.filesProcessed = 0;
    }
};

// ===== REJECTED DATA MANAGEMENT =====
let rejectedDataInitialized = false;

function updateRejectedDataTabVisibility() {
    const now = new Date();
    const isOpen = now >= REGISTRATION_START && now <= REGISTRATION_END;
    
    const pesertaDitolakClosed = document.getElementById('pesertaDitolakClosed');
    const pesertaDitolakOpen = document.getElementById('pesertaDitolakOpen');
    
    Logger.log('Checking registration status for rejected data tab - isOpen: ' + isOpen);
    
    // Jika registrasi DIBUKA
    if (isOpen) {
        if (pesertaDitolakClosed) pesertaDitolakClosed.style.display = 'none';
        if (pesertaDitolakOpen) pesertaDitolakOpen.style.display = 'block';
        
        // ⭐ PERUBAHAN: Tidak lagi auto-load saat page load
        // Data akan di-load HANYA saat user membuka tab
    } 
    // Jika registrasi DITUTUP
    else {
        if (pesertaDitolakClosed) pesertaDitolakClosed.style.display = 'block';
        if (pesertaDitolakOpen) pesertaDitolakOpen.style.display = 'none';
        Logger.log('Registration closed - hiding rejected data content');
    }
}

async function loadRejectedData() {
    try {
        Logger.log('📊 Starting to load rejected data from server');
        
        // Ambil element
        const loadStatusDiv = document.getElementById('loadStatus');
        const rejectedDataContainer = document.getElementById('rejectedDataContainer');
        const emptyState = document.getElementById('emptyState');
        const pageLoadingDiv = document.getElementById('pageLoadingIndicator');
        
        // PERUBAHAN: Tampilkan loading hanya pada halaman, bukan overlay penuh
        if (pageLoadingDiv) {
            pageLoadingDiv.style.display = 'block';
            Logger.log('Page loading indicator shown');
        }
        
        // Tampilkan status loading
        if (loadStatusDiv) {
            loadStatusDiv.style.display = 'block';
            loadStatusDiv.innerHTML = '⏳ Data sedang dimuat...';
            loadStatusDiv.style.background = '#e7f3ff';
            loadStatusDiv.style.color = '#0056b3';
        }
        
        // Sembunyikan content awal
        if (rejectedDataContainer) rejectedDataContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
        
        // FETCH dari Apps Script
        Logger.log('Fetching from: ' + APPS_SCRIPT_URL + '?action=getRejectedData');
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getRejectedData`);
        
        Logger.log('Response status: ' + response.status);
        
        const result = await response.json();
        Logger.log('Response received: ' + JSON.stringify(result).substring(0, 100) + '...');
        
        // HANDLE RESPONSE
        if (result.success) {
            Logger.log('✅ Success! Data received');
            
            // Ada data peserta ditolak
            if (result.data && result.data.length > 0) {
                Logger.log('✅ Found ' + result.data.length + ' rejected participants');
                
                // Tampilkan tabel
                displayRejectedData(result.data);
                if (rejectedDataContainer) rejectedDataContainer.style.display = 'block';
                if (emptyState) emptyState.style.display = 'none';
                
                // Update status success
                if (loadStatusDiv) {
                    loadStatusDiv.innerHTML = `✅ Berhasil dimuat (${result.data.length} peserta ditolak)`;
                    loadStatusDiv.style.background = '#d4edda';
                    loadStatusDiv.style.color = '#155724';
                }
            } 
            // Tidak ada data
            else {
                Logger.log('ℹ️ No rejected data found');
                
                const noDataMsg = document.getElementById('noDataMessage');
                if (noDataMsg) noDataMsg.style.display = 'block';
                if (rejectedDataContainer) rejectedDataContainer.style.display = 'block';
                if (emptyState) emptyState.style.display = 'none';
                
                if (loadStatusDiv) {
                    loadStatusDiv.innerHTML = 'ℹ️ Tidak ada data peserta yang ditolak saat ini';
                    loadStatusDiv.style.background = '#cce5ff';
                    loadStatusDiv.style.color = '#004085';
                }
            }
        } 
        // ERROR
        else {
            Logger.error('❌ API Error: ' + result.message);
            
            if (loadStatusDiv) {
                loadStatusDiv.innerHTML = '❌ Gagal: ' + (result.message || 'Error tidak diketahui');
                loadStatusDiv.style.background = '#ffe7e7';
                loadStatusDiv.style.color = '#c82333';
                loadStatusDiv.style.display = 'block';
            }
        }
        
        // PERUBAHAN: Sembunyikan page loading indicator, bukan overlay
        if (pageLoadingDiv) {
            pageLoadingDiv.style.display = 'none';
            Logger.log('Page loading indicator hidden');
        }
        
        Logger.log('Load rejected data complete');
        
    } catch (error) {
        Logger.error('❌ Fetch Error:', error.message);
        
        // PERUBAHAN: Sembunyikan page loading indicator
        const pageLoadingDiv = document.getElementById('pageLoadingIndicator');
        if (pageLoadingDiv) {
            pageLoadingDiv.style.display = 'none';
        }
        
        const loadStatusDiv = document.getElementById('loadStatus');
        if (loadStatusDiv) {
            loadStatusDiv.innerHTML = '❌ Kesalahan Network: ' + error.message;
            loadStatusDiv.style.background = '#ffe7e7';
            loadStatusDiv.style.color = '#c82333';
            loadStatusDiv.style.display = 'block';
        }
    }
}

function displayRejectedData(data) {
    Logger.log('Displaying ' + data.length + ' rows to table');
    
    const tbody = document.getElementById('rejectedDataBody');
    const noDataMsg = document.getElementById('noDataMessage');
    
    // Kosongkan tabel
    if (tbody) tbody.innerHTML = '';
    
    // Jika tidak ada data
    if (!data || data.length === 0) {
        if (noDataMsg) noDataMsg.style.display = 'block';
        Logger.log('No data to display');
        return;
    }
    
    // Sembunyikan no data message
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    // Loop data dan buat row
    data.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${item.nomorPeserta || '-'}</strong></td>
            <td>${item.namaTimPeserta || '-'}</td>
            <td>${item.cabang || '-'}</td>
            <td>${item.kecamatan || '-'}</td>
            <td><span class="status-badge status-ditolak">Ditolak</span></td>
            <td>${item.alasan || '-'}</td>
        `;
        if (tbody) tbody.appendChild(row);
    });
    
    Logger.log('✅ ' + data.length + ' rows displayed successfully');
}

function updateProgressDetailed(percent, message) {
    const fill = document.getElementById('progressFill');
    if (fill) {
        fill.style.width = percent + '%';
        fill.textContent = percent + '%';
    }
    const msgEl = document.getElementById('progressMessage');
    if (msgEl) {
        msgEl.textContent = message;
    }
}

let currentCabang = null;
let currentTeamMemberCount = 2;
let uploadedFiles = {};
let savedPersonalData = null;
let savedTeamData = {};
let confirmCallback = null;
let countdownInterval = null;

function formatDateInput(e) {
    let value = e.target.value;
    if (value.length === 10) return;
    value = value.replace(/[^\d-]/g, '');
    const parts = value.split('-');
    
    if (parts[0] && parts[0].length > 4) parts[0] = parts[0].slice(0, 4);
    if (parts[1] && parts[1].length > 2) {
        parts[1] = parts[1].slice(0, 2);
        const month = parseInt(parts[1]);
        if (month > 12) parts[1] = '12';
    }
    if (parts[2] && parts[2].length > 2) {
        parts[2] = parts[2].slice(0, 2);
        const day = parseInt(parts[2]);
        if (day > 31) parts[2] = '31';
    }
    if (parts[0]) {
        const year = parseInt(parts[0]);
        const currentYear = new Date().getFullYear();
        if (year > currentYear) parts[0] = currentYear.toString();
    }
    e.target.value = parts.filter(p => p).join('-');
}

function checkRegistrationTime() {
    const now = new Date();
    const isOpen = now >= REGISTRATION_START && now <= REGISTRATION_END;
    const registrationClosed = document.getElementById('registrationClosed');
    const registrationOpen = document.getElementById('registrationOpen');
    
    if (isOpen) {
        registrationClosed.style.display = 'none';
        registrationOpen.style.display = 'block';
        if (countdownInterval) clearInterval(countdownInterval);
    } else {
        registrationClosed.style.display = 'block';
        registrationOpen.style.display = 'none';
        if (now < REGISTRATION_START) {
            document.getElementById('closedMessage').textContent = 'Pendaftaran peserta MTQ ke-55 akan dibuka pada tanggal 29 Oktober 2025 pukul 00:00 WIB.';
            document.getElementById('countdownTimer').style.display = 'block';
            startCountdown();
        } else {
            document.getElementById('closedMessage').textContent = 'Mohon maaf, pendaftaran peserta MTQ ke-55 telah ditutup pada tanggal 30 Oktober 2025 pukul 23:59 WIB.';
            document.getElementById('countdownTimer').style.display = 'none';
            if (countdownInterval) clearInterval(countdownInterval);
        }
    }
    return isOpen;
}

function startCountdown() {
    const update = () => {
        const now = new Date();
        const diff = REGISTRATION_START - now;
        if (diff <= 0) {
            clearInterval(countdownInterval);
            checkRegistrationTime();
            return;
        }
        document.getElementById('days').textContent = String(Math.floor(diff / (1000*60*60*24))).padStart(2, '0');
        document.getElementById('hours').textContent = String(Math.floor((diff % (1000*60*60*24)) / (1000*60*60))).padStart(2, '0');
        document.getElementById('minutes').textContent = String(Math.floor((diff % (1000*60*60)) / (1000*60))).padStart(2, '0');
        document.getElementById('seconds').textContent = String(Math.floor((diff % (1000*60)) / 1000)).padStart(2, '0');
    };
    update();
    countdownInterval = setInterval(update, 1000);
}

function validateGender() {
    if (!currentCabang) return { isValid: true, message: '' };
    const genderRestriction = currentCabang.genderRestriction;
    if (!genderRestriction || genderRestriction === 'any') return { isValid: true, message: '' };
    
    const requiredGender = genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
    
    if (!currentCabang.isTeam) {
        const selectedGender = document.getElementById('jenisKelamin')?.value;
        if (selectedGender && selectedGender !== requiredGender) {
            return { isValid: false, message: `Jenis kelamin tidak sesuai! Cabang ini khusus untuk ${genderRestriction === 'male' ? 'Laki-laki (Putra)' : 'Perempuan (Putri)'}` };
        }
    } else {
        const expectedGender = genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
        for (let i = 1; i <= currentTeamMemberCount; i++) {
            const memberGender = document.querySelector(`[name="memberJenisKelamin${i}"]`)?.value;
            if (memberGender && memberGender !== expectedGender) {
                return { isValid: false, message: `Peserta #${i}: Jenis kelamin tidak sesuai! Semua peserta tim harus ${expectedGender}` };
            }
        }
    }
    return { isValid: true, message: '' };
}

function clearPersonalData() {
    savedPersonalData = null;
    uploadedFiles = Object.keys(uploadedFiles).reduce((acc, key) => {
        if (!key.startsWith('doc')) acc[key] = uploadedFiles[key];
        return acc;
    }, {});
}

function clearTeamData() {
    savedTeamData = {};
    uploadedFiles = Object.keys(uploadedFiles).reduce((acc, key) => {
        if (!key.startsWith('teamDoc')) acc[key] = uploadedFiles[key];
        return acc;
    }, {});
}

function savePersonalData() {
    savedPersonalData = {
        nik: document.getElementById('nik')?.value || '',
        nama: document.getElementById('nama')?.value || '',
        jenisKelamin: document.getElementById('jenisKelamin')?.value || '',
        tempatLahir: document.getElementById('tempatLahir')?.value || '',
        tglLahir: document.getElementById('tglLahir')?.value || '',
        umur: document.getElementById('umur')?.value || '',
        alamat: document.getElementById('alamat')?.value || '',
        noTelepon: document.getElementById('noTelepon')?.value || '',
        email: document.getElementById('email')?.value || '',
        namaRek: document.getElementById('namaRek')?.value || '',
        noRek: document.getElementById('noRek')?.value || '',
        namaBank: document.getElementById('namaBank')?.value || ''
    };
    const savedFiles = {};
    for (let i = 1; i <= 5; i++) {
        if (uploadedFiles[`doc${i}`]) savedFiles[`doc${i}`] = uploadedFiles[`doc${i}`];
    }
    savedPersonalData.files = savedFiles;
}

function saveTeamData() {
    savedTeamData = { namaRegu: document.getElementById('namaRegu')?.value || '', members: {} };
    for (let i = 1; i <= currentTeamMemberCount; i++) {
        const memberData = {
            nik: document.querySelector(`[name="memberNik${i}"]`)?.value || '',
            name: document.querySelector(`[name="memberName${i}"]`)?.value || '',
            jenisKelamin: document.querySelector(`[name="memberJenisKelamin${i}"]`)?.value || '',
            tempatLahir: document.querySelector(`[name="memberTempatLahir${i}"]`)?.value || '',
            birthDate: document.querySelector(`[name="memberBirthDate${i}"]`)?.value || '',
            umur: document.querySelector(`[name="memberUmur${i}"]`)?.value || '',
            alamat: document.querySelector(`[name="memberAlamat${i}"]`)?.value || '',
            noTelepon: document.querySelector(`[name="memberNoTelepon${i}"]`)?.value || '',
            email: document.querySelector(`[name="memberEmail${i}"]`)?.value || '',
            namaRek: document.querySelector(`[name="memberNamaRek${i}"]`)?.value || '',
            noRek: document.querySelector(`[name="memberNoRek${i}"]`)?.value || '',
            namaBank: document.querySelector(`[name="memberNamaBank${i}"]`)?.value || '',
            files: {}
        };
        for (let d = 1; d <= 5; d++) {
            if (uploadedFiles[`teamDoc${i}_${d}`]) memberData.files[`doc${d}`] = uploadedFiles[`teamDoc${i}_${d}`];
        }
        savedTeamData.members[i] = memberData;
    }
}

function restoreTeamData() {
    if (!savedTeamData || !savedTeamData.members) return;
    if (savedTeamData.namaRegu) document.getElementById('namaRegu').value = savedTeamData.namaRegu;
    for (let i in savedTeamData.members) {
        const memberData = savedTeamData.members[i];
        if (document.querySelector(`[name="memberNik${i}"]`)) {
            document.querySelector(`[name="memberNik${i}"]`).value = memberData.nik;
            document.querySelector(`[name="memberName${i}"]`).value = memberData.name;
            document.querySelector(`[name="memberJenisKelamin${i}"]`).value = memberData.jenisKelamin;
            document.querySelector(`[name="memberTempatLahir${i}"]`).value = memberData.tempatLahir;
            document.querySelector(`[name="memberBirthDate${i}"]`).value = memberData.birthDate;
            document.querySelector(`[name="memberUmur${i}"]`).value = memberData.umur;
            document.querySelector(`[name="memberAlamat${i}"]`).value = memberData.alamat;
            document.querySelector(`[name="memberNoTelepon${i}"]`).value = memberData.noTelepon;
            document.querySelector(`[name="memberEmail${i}"]`).value = memberData.email;
            document.querySelector(`[name="memberNamaRek${i}"]`).value = memberData.namaRek;
            document.querySelector(`[name="memberNoRek${i}"]`).value = memberData.noRek;
            document.querySelector(`[name="memberNamaBank${i}"]`).value = memberData.namaBank;
            for (let d in memberData.files) {
                const docNum = d.replace('doc', '');
                uploadedFiles[`teamDoc${i}_${docNum}`] = memberData.files[d];
                const label = document.getElementById(`teamDoc${i}_${docNum}Name`);
                if (label) {
                    label.textContent = memberData.files[d].name;
                    label.style.color = '#28a745';
                }
            }
        }
    }
}

function restoreToTeamMember1() {
    if (!savedPersonalData) return;
    const fields = [
        { saved: 'nik', team: 'memberNik1' }, { saved: 'nama', team: 'memberName1' },
        { saved: 'jenisKelamin', team: 'memberJenisKelamin1' }, { saved: 'tempatLahir', team: 'memberTempatLahir1' },
        { saved: 'tglLahir', team: 'memberBirthDate1' }, { saved: 'umur', team: 'memberUmur1' },
        { saved: 'alamat', team: 'memberAlamat1' }, { saved: 'noTelepon', team: 'memberNoTelepon1' },
        { saved: 'email', team: 'memberEmail1' }, { saved: 'namaRek', team: 'memberNamaRek1' },
        { saved: 'noRek', team: 'memberNoRek1' }, { saved: 'namaBank', team: 'memberNamaBank1' }
    ];
    fields.forEach(field => {
        const input = document.querySelector(`[name="${field.team}"]`);
        if (input && savedPersonalData[field.saved]) input.value = savedPersonalData[field.saved];
    });
    if (savedPersonalData.files) {
        for (let docKey in savedPersonalData.files) {
            const docNum = docKey.replace('doc', '');
            uploadedFiles[`teamDoc1_${docNum}`] = savedPersonalData.files[docKey];
            const label = document.getElementById(`teamDoc1_${docNum}Name`);
            if (label) {
                label.textContent = savedPersonalData.files[docKey].name;
                label.style.color = '#28a745';
            }
        }
    }
}

// ===== FIX: handleCabangChange dengan Cleanup Required Attributes =====

function handleCabangChange() {
    const selectedValue = document.getElementById('cabang').value;
    const cabangData = getCabangData();
    const data = cabangData[selectedValue];
    
    Logger.log('=== CABANG CHANGE START ===');
    Logger.log('Previous cabang: ' + (currentCabang ? (currentCabang.isTeam ? 'TEAM' : 'PERSONAL') : 'NONE'));
    Logger.log('New cabang: ' + (data ? (data.isTeam ? 'TEAM' : 'PERSONAL') : 'NONE'));
    
    const wasTeam = currentCabang && currentCabang.isTeam;
    
    // Simpan data sebelumnya
    if (currentCabang && !currentCabang.isTeam) {
        Logger.log('Saving PERSONAL data...');
        savePersonalData();
    } else if (currentCabang && currentCabang.isTeam) {
        Logger.log('Saving TEAM data...');
        saveTeamData();
    }
    
    // Hide semua section
    document.getElementById('personalSection').style.display = 'none';
    document.getElementById('teamSection').style.display = 'none';
    document.getElementById('ageRequirement').style.display = 'none';
    document.getElementById('teamMembers').innerHTML = '';
    document.getElementById('personalDocs').innerHTML = '';
    
    if (!data) {
        Logger.log('No cabang selected, clearing all');
        currentCabang = null;
        document.getElementById('dataDiriSection').style.display = 'none';
        document.getElementById('rekeningPersonalSection').style.display = 'none';
        clearPersonalData();
        clearTeamData();
        updateSubmitButtonState();
        Logger.log('=== CABANG CHANGE CANCEL ===');
        return;
    }
    
    currentCabang = data;
    const ageTextParts = data.maxAge.split('-');
    const ageText = ageTextParts[0] + ' tahun ' + ageTextParts[1] + ' bulan ' + ageTextParts[2] + ' hari';    let ageRequirementText = `Batas usia maksimal: ${ageText} (per 1 November 2025)`;
    
    if (data.genderRestriction && data.genderRestriction !== 'any') {
        const genderText = data.genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
        ageRequirementText += `<br>Khusus peserta: ${genderText}`;
    }
    
    document.getElementById('ageRequirement').innerHTML = ageRequirementText;
    document.getElementById('ageRequirement').style.display = 'block';
    
    if (data.isTeam) {
        Logger.log('Switching to TEAM cabang');
        Logger.log('Cleaning up personal file inputs...');
        
        // CRITICAL: Clean up personal file inputs sebelum pindah ke team
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput && personalInput.hasAttribute('required')) {
                personalInput.removeAttribute('required');
                Logger.log(`  Removed required from personalDoc${i}`);
            }
        }
        
        // CRITICAL: Prepare uploadedFiles BEFORE generating form
        // Jika dari PERSONAL, copy files dari PERSONAL ke uploadedFiles dengan format teamDoc1_X
        if (wasTeam === false && savedPersonalData) {
            Logger.log('Pre-copying PERSONAL files to TEAM member 1 format...');
            if (savedPersonalData.files) {
                for (let docKey in savedPersonalData.files) {
                    const docNum = docKey.replace('doc', '');
                    uploadedFiles[`teamDoc1_${docNum}`] = savedPersonalData.files[docKey];
                    Logger.log(`  Pre-copied: doc${docNum} -> teamDoc1_${docNum}`);
                }
            }
        }
        
        currentTeamMemberCount = 2;
        generateTeamForm(2);
        document.getElementById('teamSection').style.display = 'block';
        document.getElementById('dataDiriSection').style.display = 'none';
        document.getElementById('rekeningPersonalSection').style.display = 'none';
        
        // CRITICAL: Immediately remove required from file inputs yang sudah ter-upload
        Logger.log('Removing required from TEAM file inputs with uploaded files...');
        for (let i = 1; i <= 2; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput && uploadedFiles[`teamDoc${i}_${d}`]) {
                    if (teamInput.hasAttribute('required')) {
                        teamInput.removeAttribute('required');
                        Logger.log(`  Removed required from teamDoc${i}_${d} (file exists)`);
                    }
                }
            }
        }
        
        setTimeout(() => {
            // ISSUE #8: Copy Individu ke Tim1, clear Individu data
            if (wasTeam === false && savedPersonalData) {
                Logger.log('Restoring PERSONAL data to TEAM member 1');
                restoreToTeamMember1();
                savedPersonalData = null;
                uploadedFiles = Object.keys(uploadedFiles).reduce((acc, key) => {
                    if (!key.startsWith('doc')) acc[key] = uploadedFiles[key];
                    return acc;
                }, {});
            } else if (savedTeamData && Object.keys(savedTeamData).length > 0) {
                Logger.log('Restoring TEAM data');
                restoreTeamData();
            }
            updateSubmitButtonState();
            Logger.log('=== CABANG CHANGE TO TEAM COMPLETE ===');
        }, 100);
    } else {
        Logger.log('Switching to PERSONAL cabang');
        Logger.log('Cleaning up team file inputs...');
        
        // CRITICAL: Clean up team file inputs sebelum pindah ke personal
        for (let i = 1; i <= 3; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput && teamInput.hasAttribute('required')) {
                    teamInput.removeAttribute('required');
                    Logger.log(`  Removed required from teamDoc${i}_${d}`);
                }
            }
        }
        
        // CRITICAL: Prepare uploadedFiles BEFORE generating form
        // Jika dari TEAM, copy files dari TEAM member 1 ke uploadedFiles
        if (wasTeam === true && savedTeamData && savedTeamData.members && savedTeamData.members[1]) {
            Logger.log('Pre-copying TEAM member 1 files to uploadedFiles...');
            const member1 = savedTeamData.members[1];
            if (member1.files) {
                for (let d in member1.files) {
                    const docNum = d.replace('doc', '');
                    uploadedFiles[`doc${docNum}`] = member1.files[d];
                    Logger.log(`  Pre-copied: doc${docNum}`);
                }
            }
        }
        
        document.getElementById('dataDiriSection').style.display = 'block';
        document.getElementById('rekeningPersonalSection').style.display = 'block';
        generatePersonalDocsForm();
        document.getElementById('personalSection').style.display = 'block';
        
        // CRITICAL: Immediately remove required from file inputs yang sudah ter-upload
        // Ini harus dilakukan SETELAH generatePersonalDocsForm() tapi SEBELUM setTimeout
        Logger.log('Removing required from file inputs with uploaded files...');
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput && uploadedFiles[`doc${i}`]) {
                if (personalInput.hasAttribute('required')) {
                    personalInput.removeAttribute('required');
                    Logger.log(`  Removed required from personalDoc${i} (file exists)`);
                }
            }
        }
        
        setTimeout(() => {
            // ISSUE #8: Copy Tim1 ke Individu, clear Tim data
            if (wasTeam === true && savedTeamData && savedTeamData.members && savedTeamData.members[1]) {
                Logger.log('Restoring TEAM member 1 data to PERSONAL');
                const member1 = savedTeamData.members[1];
                
                document.getElementById('nik').value = member1.nik;
                document.getElementById('nama').value = member1.name;
                document.getElementById('jenisKelamin').value = member1.jenisKelamin;
                document.getElementById('tempatLahir').value = member1.tempatLahir;
                document.getElementById('tglLahir').value = member1.birthDate;
                document.getElementById('umur').value = member1.umur;
                document.getElementById('alamat').value = member1.alamat;
                document.getElementById('noTelepon').value = member1.noTelepon;
                document.getElementById('email').value = member1.email;
                document.getElementById('namaRek').value = member1.namaRek;
                document.getElementById('noRek').value = member1.noRek;
                document.getElementById('namaBank').value = member1.namaBank;
                
                if (member1.files) {
                    Logger.log('Copying files from TEAM member 1...');
                    for (let d in member1.files) {
                        const docNum = d.replace('doc', '');
                        // File sudah di-copy ke uploadedFiles sebelumnya, hanya update label
                        const label = document.getElementById(`personalDoc${docNum}Name`);
                        if (label) {
                            label.textContent = member1.files[d].name;
                            label.style.color = '#28a745';
                        }
                        Logger.log(`  File label updated: doc${docNum}`);
                    }
                }
                
                // Clear Team data
                savedTeamData = {};
                uploadedFiles = Object.keys(uploadedFiles).reduce((acc, key) => {
                    if (!key.startsWith('teamDoc')) acc[key] = uploadedFiles[key];
                    return acc;
                }, {});
                
                Logger.log('TEAM member 1 data restored to PERSONAL');
            } else if (savedPersonalData && Object.keys(savedPersonalData).length > 0) {
                Logger.log('Restoring PERSONAL data');
                document.getElementById('nik').value = savedPersonalData.nik;
                document.getElementById('nama').value = savedPersonalData.nama;
                document.getElementById('jenisKelamin').value = savedPersonalData.jenisKelamin;
                document.getElementById('tempatLahir').value = savedPersonalData.tempatLahir;
                document.getElementById('tglLahir').value = savedPersonalData.tglLahir;
                document.getElementById('umur').value = savedPersonalData.umur;
                document.getElementById('alamat').value = savedPersonalData.alamat;
                document.getElementById('noTelepon').value = savedPersonalData.noTelepon;
                document.getElementById('email').value = savedPersonalData.email;
                document.getElementById('namaRek').value = savedPersonalData.namaRek;
                document.getElementById('noRek').value = savedPersonalData.noRek;
                document.getElementById('namaBank').value = savedPersonalData.namaBank;
                
                if (savedPersonalData.files) {
                    Logger.log('Copying PERSONAL files...');
                    for (let docKey in savedPersonalData.files) {
                        uploadedFiles[docKey] = savedPersonalData.files[docKey];
                        const docNum = docKey.replace('doc', '');
                        const label = document.getElementById(`personalDoc${docNum}Name`);
                        if (label) {
                            label.textContent = savedPersonalData.files[docKey].name;
                            label.style.color = '#28a745';
                        }
                        Logger.log(`  Copied file: ${docKey}`);
                    }
                }
            }
            updateSubmitButtonState();
            Logger.log('=== CABANG CHANGE TO PERSONAL COMPLETE ===');
        }, 100);
    }
    
    updateSubmitButtonState();
}

function generatePersonalDocsForm() {
    const container = document.getElementById('personalDocs');
    const docs = [
        { id: 1, name: 'Surat Mandat', desc: 'Ditandatangani oleh Ketua LPTQ Kecamatan', required: true },
        { id: 2, name: 'KTP/KK/KIA', desc: 'Diterbitkan maksimal 6 bulan sebelum 1 Nov 2025', required: true },
        { id: 3, name: 'Sertifikat Kejuaraan', desc: 'Dari MTQ Tingkat Kecamatan', required: false },
        { id: 4, name: 'Foto Buku Tabungan', desc: 'Menunjukkan nomor rekening', required: false },
        { id: 5, name: 'Pas Photo Terbaru', desc: 'Latar belakang biru', required: true }
    ];
    
    container.innerHTML = '';
    docs.forEach(doc => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
            <label>${doc.id}. ${doc.name} ${doc.required ? '*' : '(Opsional)'}</label>
            <small style="font-size: 0.85em; color: #666; display: block; margin-bottom: 10px;">${doc.desc}</small>
            <small style="font-size: 0.8em; color: #999; display: block; margin-bottom: 15px;">Max 5MB</small>
            <div style="display: flex; gap: 12px; align-items: center; justify-content: flex-start; flex-wrap: nowrap;">
                <label for="personalDoc${doc.id}" style="display: inline-flex; align-items: center; justify-content: center; padding: 0 25px; background: linear-gradient(135deg, #34d399, #10b981); color: white; border-radius: 25px; cursor: pointer; font-weight: 700; transition: all 0.3s ease; white-space: nowrap; height: 50px; font-size: 1em; border: none; flex-shrink: 0; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
                    📁 Pilih File
                </label>
                <button type="button" id="clearPersonalDoc${doc.id}" style="display: none; padding: 0 25px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 25px; cursor: pointer; font-weight: 700; transition: all 0.3s ease; white-space: nowrap; height: 50px; font-size: 1em; border: none; flex-shrink: 0; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);">
                    🗑️ Hapus
                </button>
            </div>
            <input type="file" id="personalDoc${doc.id}" name="personalDoc${doc.id}" accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
            <span class="file-name" id="personalDoc${doc.id}Name" style="color: #666; font-weight: 600; display: block; margin-top: 12px;">Belum ada file</span>
        `;
        container.appendChild(div);
    });
    
    // ===== SETUP FILE INPUT LISTENERS DENGAN CANCEL HANDLING =====
    for (let i = 1; i <= 5; i++) {
        const input = document.getElementById(`personalDoc${i}`);
        const clearBtn = document.getElementById(`clearPersonalDoc${i}`);
        const label = document.getElementById(`personalDoc${i}Name`);
        
        if (input) {
            input.addEventListener('change', function() {
                Logger.log(`personalDoc${i} change event - files: ${this.files.length}`);
                
                if (this.files && this.files.length > 0) {
                    Logger.log(`File selected: ${this.files[0].name}`);
                    handleFileUpload(this, `personalDoc${i}Name`, `doc${i}`, `clearPersonalDoc${i}`);
                } 
                else {
                    Logger.log('Cancel clicked - restoring previous file (if any)');
                    
                    if (uploadedFiles[`doc${i}`]) {
                        const existingFile = uploadedFiles[`doc${i}`];
                        label.textContent = existingFile.name;
                        label.style.color = '#28a745';
                        if (clearBtn) clearBtn.style.display = 'inline-flex';
                        Logger.log(`Restored previous file: ${existingFile.name}`);
                    } else {
                        label.textContent = 'Belum ada file';
                        label.style.color = '#666';
                        if (clearBtn) clearBtn.style.display = 'none';
                        Logger.log('No previous file, showing "Belum ada file"');
                    }
                    
                    updateSubmitButtonState();
                }
            });
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.preventDefault();
                Logger.log(`Clear button clicked for personalDoc${i}`);
                
                document.getElementById(`personalDoc${i}`).value = '';
                document.getElementById(`personalDoc${i}Name`).textContent = 'Belum ada file';
                document.getElementById(`personalDoc${i}Name`).style.color = '#666';
                delete uploadedFiles[`doc${i}`];
                clearBtn.style.display = 'none';
                updateSubmitButtonState();
            });
        }
    }
}

function generateTeamForm(memberCount) {
    const container = document.getElementById('teamMembers');
    let html = `<p style="margin-bottom: 25px; color: #666; font-size: 0.95em; padding: 15px; background: #e6f3ff; border-radius: 10px;">
        Saat ini: ${memberCount} peserta ${memberCount < 3 ? '(klik tombol Tambah untuk menambah peserta ke-3)' : ''}
    </p>`;
    
    for (let i = 1; i <= memberCount; i++) {
        html += generateTeamMemberHTML(i);
    }
    
    html += `<div style="margin-top: 25px;">
        ${memberCount === 2 ? `<button type="button" onclick="addTeamMember()" style="background: linear-gradient(135deg, var(--secondary), #1e7e34); border: none; padding: 16px 35px; color: white; border-radius: 12px; font-weight: 700; cursor: pointer;">Tambah Peserta ke-3</button>` : ''}
        ${memberCount === 3 ? `<button type="button" onclick="removeTeamMember()" style="background: linear-gradient(135deg, var(--danger), #c82333); border: none; padding: 16px 35px; color: white; border-radius: 12px; font-weight: 700; cursor: pointer;">Hapus Peserta ke-3</button>` : ''}
    </div>`;
    
    container.innerHTML = html;
    setupTeamFormListeners(memberCount);
}

function generateTeamMemberHTML(i) {
    const isOptional = i > 2;
    const docs = [
        { name: 'Surat Mandat/Rekomendasi', desc: 'Ditandatangani oleh Ketua LPTQ Kecamatan', required: true },
        { name: 'KTP/KK/KIA', desc: 'Diterbitkan maksimal 6 bulan sebelum 1 Nov 2025', required: true },
        { name: 'Sertifikat Kejuaraan', desc: 'Dari MTQ Tingkat Kecamatan', required: false },
        { name: 'Foto Buku Tabungan', desc: 'Menunjukkan nomor rekening atas nama peserta', required: false },
        { name: 'Pas Photo', desc: 'Latar belakang biru', required: true }
    ];
    
    return `
        <div class="team-member" id="teamMember${i}">
            <h4 style="color: var(--primary); margin-bottom: 20px; font-size: 1.2em;">Anggota Tim #${i} ${isOptional ? '(Opsional)' : '(Wajib)'}</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                    <label>NIK ${isOptional ? '' : '*'}</label>
                    <input type="text" name="memberNik${i}" maxlength="16" inputmode="numeric" placeholder="NIK (16 digit)" ${isOptional ? '' : 'required'}>
                    <small style="font-size: 0.85em; color: #666; display: block; margin-top: 5px;">Hanya angka, tanpa spasi</small>
                </div>
                <div class="form-group">
                    <label>Nama Lengkap ${isOptional ? '' : '*'}</label>
                    <input type="text" name="memberName${i}" placeholder="Nama lengkap" ${isOptional ? '' : 'required'}>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                    <label>Jenis Kelamin ${isOptional ? '' : '*'}</label>
                    <select name="memberJenisKelamin${i}" class="gender-select" data-member="${i}" ${isOptional ? '' : 'required'}>
                        <option value="">-- Pilih --</option>
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tempat Lahir ${isOptional ? '' : '*'}</label>
                    <input type="text" name="memberTempatLahir${i}" placeholder="Kota/Kabupaten" ${isOptional ? '' : 'required'}>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                    <label>Tanggal Lahir ${isOptional ? '' : '*'}</label>
                    <input type="date" name="memberBirthDate${i}" ${isOptional ? '' : 'required'}>
                </div>
                <div class="form-group">
                    <label>Umur (per 1 Nov 2025)</label>
                    <input type="text" name="memberUmur${i}" readonly placeholder="Otomatis terisi">
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
                <label>Alamat Lengkap ${isOptional ? '' : '*'}</label>
                <textarea name="memberAlamat${i}" rows="2" placeholder="Jalan, RT/RW, Desa, Kecamatan" ${isOptional ? '' : 'required'}></textarea>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                    <label>No Telepon/WhatsApp ${isOptional ? '' : '*'}</label>
                    <input type="tel" name="memberNoTelepon${i}" placeholder="08xxxxxxxxxx" ${isOptional ? '' : 'required'}>
                </div>
                <div class="form-group">
                    <label>Email ${isOptional ? '' : '*'}</label>
                    <input type="email" name="memberEmail${i}" placeholder="email@example.com" ${isOptional ? '' : 'required'}>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div class="form-group">
                    <label>Nama Rekening (Opsional)</label>
                    <input type="text" name="memberNamaRek${i}" placeholder="Nama sesuai buku tabungan">
                </div>
                <div class="form-group">
                    <label>Nomor Rekening (Opsional)</label>
                    <input type="text" name="memberNoRek${i}" placeholder="Nomor rekening">
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
                <label>Nama Bank  (Opsional)</label>
                <input type="text" name="memberNamaBank${i}" placeholder="BNI, BCA, Mandiri, dll">
            </div>
            <div style="background: #e6f3ff; padding: 20px; margin-top: 20px; border-radius: 12px; border-left: 4px solid var(--primary);">
                <h5 style="color: var(--primary); margin-bottom: 15px; font-size: 1.1em;">Dokumen Anggota #${i}</h5>
                ${docs.map((doc, d) => `
                    <div style="margin-bottom: 20px;">
                        <label>${d+1}. ${doc.name} ${doc.required ? '*' : '(Opsional)'}</label>
                        <small style="font-size: 0.85em; color: #666; display: block; margin-bottom: 8px;">${doc.desc}</small>
                        <small style="font-size: 0.8em; color: #999; display: block; margin-bottom: 12px;">Max 5MB</small>
                        <div style="display: flex; gap: 12px; align-items: center; justify-content: flex-start; flex-wrap: nowrap;">
                            <label for="teamDoc${i}_${d+1}" style="display: inline-flex; align-items: center; justify-content: center; padding: 0 25px; background: linear-gradient(135deg, #34d399, #10b981); color: white; border-radius: 25px; cursor: pointer; font-weight: 700; transition: all 0.3s ease; white-space: nowrap; height: 50px; font-size: 1em; border: none; flex-shrink: 0; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
                                📁 Pilih
                            </label>
                            <button type="button" id="clearTeamDoc${i}_${d+1}" style="display: none; padding: 0 25px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 25px; cursor: pointer; font-weight: 700; transition: all 0.3s ease; white-space: nowrap; height: 50px; font-size: 1em; border: none; flex-shrink: 0; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);">
                                🗑️ Hapus
                            </button>
                        </div>
                        <input type="file" id="teamDoc${i}_${d+1}" name="teamDoc${i}_${d+1}" accept=".pdf,.jpg,.jpeg,.png" style="display: none;" ${doc.required ? 'required' : ''}>
                        <span class="file-name" id="teamDoc${i}_${d+1}Name" style="color: #666; font-weight: 600; display: block; margin-top: 12px;">Belum ada</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function addTeamMember() {
    if (currentTeamMemberCount < 3) {
        saveTeamData();
        currentTeamMemberCount = 3;
        generateTeamForm(3);
        setTimeout(() => {
            restoreTeamData();
            updateSubmitButtonState();
        }, 100);
    }
}

function removeTeamMember() {
    if (currentTeamMemberCount === 3) {
        saveTeamData();
        currentTeamMemberCount = 2;
        for (let d = 1; d <= 5; d++) {
            delete uploadedFiles[`teamDoc3_${d}`];
        }
        generateTeamForm(2);
        setTimeout(() => {
            restoreTeamData();
            updateSubmitButtonState();
        }, 100);
    }
}

function setupTeamFormListeners(memberCount) {
    for (let i = 1; i <= memberCount; i++) {
        for (let d = 1; d <= 5; d++) {
            const input = document.getElementById(`teamDoc${i}_${d}`);
            const clearBtn = document.getElementById(`clearTeamDoc${i}_${d}`);
            const label = document.getElementById(`teamDoc${i}_${d}Name`);
            
            if (input) {
                // ===== FIX #2: STORE FILE SEBELUM OPEN DIALOG =====
                input.addEventListener('change', function() {
                    Logger.log(`teamDoc${i}_${d} change event - files: ${this.files.length}`);
                    
                    // Jika user pilih file baru
                    if (this.files && this.files.length > 0) {
                        Logger.log(`File selected: ${this.files[0].name}`);
                        handleFileUpload(this, `teamDoc${i}_${d}Name`, `teamDoc${i}_${d}`, `clearTeamDoc${i}_${d}`);
                    }
                    // Jika user klik Cancel
                    else {
                        Logger.log('Cancel clicked - restoring previous file (if any)');
                        
                        if (uploadedFiles[`teamDoc${i}_${d}`]) {
                            // Ada file di uploadedFiles, tampilkan kembali
                            const existingFile = uploadedFiles[`teamDoc${i}_${d}`];
                            label.textContent = existingFile.name;
                            label.style.color = '#28a745';
                            if (clearBtn) clearBtn.style.display = 'inline-block';
                            Logger.log(`Restored previous file: ${existingFile.name}`);
                        } else {
                            // Tidak ada file sebelumnya, tampilkan "Belum ada"
                            label.textContent = 'Belum ada';
                            label.style.color = '#666';
                            if (clearBtn) clearBtn.style.display = 'none';
                            Logger.log('No previous file, showing "Belum ada"');
                        }
                        
                        updateSubmitButtonState();
                    }
                });
            }
            
            if (clearBtn) {
                clearBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    Logger.log(`Clear button clicked for teamDoc${i}_${d}`);
                    
                    document.getElementById(`teamDoc${i}_${d}`).value = '';
                    document.getElementById(`teamDoc${i}_${d}Name`).textContent = 'Belum ada';
                    document.getElementById(`teamDoc${i}_${d}Name`).style.color = '#666';
                    delete uploadedFiles[`teamDoc${i}_${d}`];
                    clearBtn.style.display = 'none';
                    updateSubmitButtonState();
                });
            }
        }
        
        const nikInput = document.querySelector(`input[name="memberNik${i}"]`);
        if (nikInput) {
            nikInput.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
                updateSubmitButtonState();
            });
        }
        
        const genderSelect = document.querySelector(`select[name="memberJenisKelamin${i}"]`);
        if (genderSelect) {
            genderSelect.addEventListener('change', updateSubmitButtonState);
        }
        
        const birthInput = document.querySelector(`input[name="memberBirthDate${i}"]`);
        if (birthInput) {
            birthInput.addEventListener('input', formatDateInput);
            birthInput.addEventListener('change', function() {
                if (!this.value) return;
                const selectedDate = new Date(this.value);
                const today = new Date();
                if (selectedDate > today) {
                    this.value = '';
                    document.querySelector(`input[name="memberUmur${i}"]`).value = '';
                    updateSubmitButtonState();
                    return;
                }
                const ageObj = calculateAge(this.value);
                const umurInput = document.querySelector(`input[name="memberUmur${i}"]`);
                if (umurInput && ageObj) {
                    umurInput.value = formatAge(ageObj);
                }
                updateSubmitButtonState();
            });
        }
        
        const allInputs = document.querySelectorAll(`#teamMember${i} input, #teamMember${i} select, #teamMember${i} textarea`);
        allInputs.forEach(input => {
            if (!input.type || input.type !== 'file') {
                input.addEventListener('input', updateSubmitButtonState);
                input.addEventListener('change', updateSubmitButtonState);
            }
        });
    }
}

function handleFileUpload(input, labelId, fileKey, clearBtnId) {
    const label = document.getElementById(labelId);
    const clearBtn = document.getElementById(clearBtnId);
    const statusDiv = document.getElementById('submitStatusInfo');
    
    if (!input.files || input.files.length === 0) {
        label.textContent = 'Belum ada file';
        label.style.color = '#666';
        if (clearBtn) clearBtn.style.display = 'none';
        delete uploadedFiles[fileKey];
        updateSubmitButtonState();
        return;
    }
    
    const file = input.files[0];
    
    // ===== VALIDASI UKURAN FILE =====
    Logger.log(`File selected: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    
    if (file.size > MAX_FILE_SIZE_BYTES) {
        Logger.log(`⚠️ File terlalu besar: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB > ${MAX_FILE_SIZE_MB} MB)`);
        // Update label dengan error
        label.textContent = `File terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB > ${MAX_FILE_SIZE_MB} MB)`;
        label.style.color = '#dc3545';
        // Update status info
        if (statusDiv) {
            statusDiv.innerHTML = `⚠️ File "${file.name}" terlalu besar! Max ${MAX_FILE_SIZE_MB}MB per file`;
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#ffe7e7';
            statusDiv.style.color = '#c82333';
        }
        // Clear file input
        input.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        delete uploadedFiles[fileKey];
        updateSubmitButtonState();
        return;
    }
    // ===== FILE VALID =====
    Logger.log(`✅ File valid: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    label.textContent = file.name;
    label.style.color = '#28a745';
    if (clearBtn) clearBtn.style.display = 'inline-block';
    uploadedFiles[fileKey] = file;
    
    // Clear status error jika file ini sebelumnya error
    if (statusDiv && statusDiv.innerHTML.includes(file.name)) {
        statusDiv.style.display = 'none';
    }    
    updateSubmitButtonState();
}

function calculateAge(birthDateStr) {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    const refDate = new Date(2025, 10, 1);
    let years = refDate.getFullYear() - birthDate.getFullYear();
    let months = refDate.getMonth() - birthDate.getMonth();
    let days = refDate.getDate() - birthDate.getDate();
    if (days < 0) {
        months--;
        const prevMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    return { years, months, days };
}

function formatAge(ageObj) {
    return `${ageObj.years}-${String(ageObj.months).padStart(2, '0')}-${String(ageObj.days).padStart(2, '0')}`;
}

function isAgeValid(ageObj, maxAgeStr) {
    const [maxYears, maxMonths, maxDays] = maxAgeStr.split('-').map(Number);
    if (ageObj.years > maxYears) return false;
    if (ageObj.years === maxYears && ageObj.months > maxMonths) return false;
    if (ageObj.years === maxYears && ageObj.months === maxMonths && ageObj.days > maxDays) return false;
    return true;
}

function checkFileSizes() {
    Logger.log('Validating all uploaded file sizes...');
    
    const fileSizeIssues = [];
    
    for (let fileKey in uploadedFiles) {
        const file = uploadedFiles[fileKey];
        if (file && file.size > MAX_FILE_SIZE_BYTES) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            fileSizeIssues.push(`${file.name} (${sizeMB}MB > ${MAX_FILE_SIZE_MB}MB)`);
            Logger.log(`⚠️ File size issue: ${fileKey} - ${file.name} (${sizeMB}MB)`);
        }
    }
    
    if (fileSizeIssues.length > 0) {
        return {
            isValid: false,
            message: `File terlalu besar: ${fileSizeIssues.join(', ')}`
        };
    }
    
    Logger.log('✅ All file sizes valid');
    return { isValid: true };
}


function updateSubmitButtonState() {
    const submitBtn = document.getElementById('submitBtn');
    const statusDiv = document.getElementById('submitStatusInfo');
    const cabang = document.getElementById('cabang').value;
    const kecamatan = document.getElementById('kecamatan').value;
    
    if (!kecamatan) {
        submitBtn.disabled = true;
        statusDiv.innerHTML = '⚠️ Pilih kecamatan asal terlebih dahulu';
        statusDiv.style.display = 'block';
        return;
    }
    
    if (!cabang || !currentCabang) {
        submitBtn.disabled = true;
        statusDiv.innerHTML = '⚠️ Pilih cabang lomba terlebih dahulu';
        statusDiv.style.display = 'block';
        return;
    }
    
    const genderValidation = validateGender();
    if (!genderValidation.isValid) {
        submitBtn.disabled = true;
        statusDiv.innerHTML = genderValidation.message;
        statusDiv.style.display = 'block';
        return;
    }
    
    // ===== NEW: CHECK FILE SIZES =====
    Logger.log('Checking file sizes...');
    const fileSizeCheck = checkFileSizes();
    if (!fileSizeCheck.isValid) {
        Logger.log('⚠️ File size issue: ' + fileSizeCheck.message);
        submitBtn.disabled = true;
        statusDiv.innerHTML = '⚠️ ' + fileSizeCheck.message;
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#ffe7e7';
        statusDiv.style.color = '#c82333';
        return;
    }
    
    let isComplete = false;
    let reasons = [];
    
    if (currentCabang.isTeam) {
        const result = checkTeamCompletion();
        isComplete = result.complete;
        reasons = result.reasons;
    } else {
        const result = checkPersonalCompletion();
        isComplete = result.complete;
        reasons = result.reasons;
    }
    
    if (isComplete) {
        submitBtn.disabled = false;
        statusDiv.style.display = 'none';
    } else {
        submitBtn.disabled = true;
        statusDiv.innerHTML = '⚠️ ' + reasons.join('<br>⚠️ ');
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fff3cd';
        statusDiv.style.color = '#856404';
    }
}

function checkPersonalCompletion() {
    const reasons = [];
    const tglLahir = document.getElementById('tglLahir').value;
    const nik = document.getElementById('nik').value;
    const nama = document.getElementById('nama').value;
    const gender = document.getElementById('jenisKelamin').value;
    const tempat = document.getElementById('tempatLahir').value;
    const alamat = document.getElementById('alamat').value;
    const telepon = document.getElementById('noTelepon').value;
    const email = document.getElementById('email').value;
    // const namaRek = document.getElementById('namaRek').value;
    // const noRek = document.getElementById('noRek').value;
    // const namaBank = document.getElementById('namaBank').value;
    
    if (!nik) reasons.push('NIK belum diisi');
    if (!nama) reasons.push('Nama lengkap belum diisi');
    if (!gender) reasons.push('Jenis kelamin belum dipilih');
    if (!tempat) reasons.push('Tempat lahir belum diisi');
    if (!tglLahir) reasons.push('Tanggal lahir belum diisi');
    if (!alamat) reasons.push('Alamat belum diisi');
    if (!telepon) reasons.push('Nomor telepon belum diisi');
    if (!email) reasons.push('Email belum diisi');
    // if (!namaRek) reasons.push('Nama rekening belum diisi');
    // if (!noRek) reasons.push('Nomor rekening belum diisi');
    // if (!namaBank) reasons.push('Nama bank belum diisi');
    
    if (tglLahir) {
        const ageObj = calculateAge(tglLahir);
        if (!isAgeValid(ageObj, currentCabang.maxAge)) {
            reasons.push('Usia melebihi batas maksimal cabang ini');
        }
    }
    
    const requiredDocs = [1, 2, 5];
    const docNames = { 1: 'Surat Mandat', 2: 'KTP/KK/KIA', 5: 'Pas Photo' };
    for (let i of requiredDocs) {
        if (!uploadedFiles[`doc${i}`]) {
            reasons.push(`Dokumen ${docNames[i]} belum diupload`);
        }
    }
    
    return { complete: reasons.length === 0, reasons: reasons };
}

function checkTeamCompletion() {
    const reasons = [];
    const namaRegu = document.getElementById('namaRegu').value;
    if (!namaRegu || namaRegu.trim() === '') {
        reasons.push('Nama regu/tim belum diisi');
    }
    
    for (let i = 1; i <= 2; i++) {
        const memberReasons = checkTeamMember(i, true);
        reasons.push(...memberReasons);
    }
    
    if (currentTeamMemberCount === 3) {
        const member3Filled = isTeamMemberFilled(3);
        if (member3Filled) {
            const memberReasons = checkTeamMember(3, false);
            reasons.push(...memberReasons);
        }
    }
    
    return { complete: reasons.length === 0, reasons: reasons };
}

function isTeamMemberFilled(memberIndex) {
    const nikEl = document.querySelector(`input[name="memberNik${memberIndex}"]`);
    const nameEl = document.querySelector(`input[name="memberName${memberIndex}"]`);
    const birthEl = document.querySelector(`input[name="memberBirthDate${memberIndex}"]`);
    return (nikEl?.value || nameEl?.value || birthEl?.value);
}

function checkTeamMember(memberIndex, isRequired) {
    const reasons = [];
    const prefix = `Anggota #${memberIndex}`;
    
    const nikEl = document.querySelector(`input[name="memberNik${memberIndex}"]`);
    const nameEl = document.querySelector(`input[name="memberName${memberIndex}"]`);
    const genderEl = document.querySelector(`select[name="memberJenisKelamin${memberIndex}"]`);
    const tempatEl = document.querySelector(`input[name="memberTempatLahir${memberIndex}"]`);
    const birthEl = document.querySelector(`input[name="memberBirthDate${memberIndex}"]`);
    const alamatEl = document.querySelector(`textarea[name="memberAlamat${memberIndex}"]`);
    const telEl = document.querySelector(`input[name="memberNoTelepon${memberIndex}"]`);
    const emailEl = document.querySelector(`input[name="memberEmail${memberIndex}"]`);
    // const rekNamaEl = document.querySelector(`input[name="memberNamaRek${memberIndex}"]`);
    // const rekNoEl = document.querySelector(`input[name="memberNoRek${memberIndex}"]`);
    // const rekBankEl = document.querySelector(`input[name="memberNamaBank${memberIndex}"]`);
    
    if (!nikEl?.value) reasons.push(`${prefix}: NIK belum diisi`);
    if (!nameEl?.value) reasons.push(`${prefix}: Nama belum diisi`);
    if (!genderEl?.value) reasons.push(`${prefix}: Jenis kelamin belum dipilih`);
    if (!tempatEl?.value) reasons.push(`${prefix}: Tempat lahir belum diisi`);
    if (!birthEl?.value) reasons.push(`${prefix}: Tanggal lahir belum diisi`);
    if (!alamatEl?.value) reasons.push(`${prefix}: Alamat belum diisi`);
    if (!telEl?.value) reasons.push(`${prefix}: No telepon belum diisi`);
    if (!emailEl?.value) reasons.push(`${prefix}: Email belum diisi`);
    // if (!rekNamaEl?.value) reasons.push(`${prefix}: Nama rekening belum diisi`);
    // if (!rekNoEl?.value) reasons.push(`${prefix}: No rekening belum diisi`);
    // if (!rekBankEl?.value) reasons.push(`${prefix}: Nama bank belum diisi`);
    
    if (birthEl?.value) {
        const ageObj = calculateAge(birthEl.value);
        if (!isAgeValid(ageObj, currentCabang.maxAge)) {
            reasons.push(`${prefix}: Usia melebihi batas maksimal`);
        }
    }
    
    const requiredDocs = [1, 2, 5];
    const docNames = { 1: 'Surat Mandat', 2: 'KTP/KK/KIA', 5: 'Pas Photo' };
    for (let d of requiredDocs) {
        if (!uploadedFiles[`teamDoc${memberIndex}_${d}`]) {
            reasons.push(`${prefix}: Dokumen ${docNames[d]} belum diupload`);
        }
    }
    
    return reasons;
}

document.addEventListener('DOMContentLoaded', function() {
    Logger.log('🚀 Page loaded - initializing...');
    
    checkRegistrationTime();
    setInterval(checkRegistrationTime, 60000);
    
    // ⭐ PERUBAHAN: Hanya initialize tab visibility, TIDAK load data
    Logger.log('Initializing rejected data tab...');
    updateRejectedDataTabVisibility();
    
    // Monitor setiap 60 detik
    setInterval(() => {
        updateRejectedDataTabVisibility();
    }, 60000);
    
    initDeveloperMode();
    Logger.log('✅ Page initialization complete');
}, { once: true });

const originalShowTab = window.showTab || function() {};

window.showTab = function(tabName) {
    Logger.log('Switching to tab: ' + tabName);
    
    // Sembunyikan semua section
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    
    // Remove active class dari buttons
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Tampilkan section yang dipilih
    const activeSection = document.getElementById(tabName);
    if (activeSection) {
        activeSection.classList.add('active');
    }
    
    // Mark button as active
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // ⭐ PERUBAHAN: Load data KETIKA user membuka tab peserta ditolak
    if (tabName === 'pesertaDitolak') {
        Logger.log('User opened rejected data tab - loading data now');
        updateRejectedDataTabVisibility();
        
        // Check if registration is open
        const now = new Date();
        const isOpen = now >= REGISTRATION_START && now <= REGISTRATION_END;
        
        // HANYA load data jika registrasi dibuka dan belum pernah di-load
        if (isOpen && !rejectedDataInitialized) {
            Logger.log('Registration is open - auto-loading data for first time');
            rejectedDataInitialized = true;
            loadRejectedData();
        }
    }
};

function updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    if (fill) {
        fill.style.width = percent + '%';
        fill.textContent = percent + '%';
    }
}

function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmModal').classList.add('show');
        confirmCallback = resolve;
    });
}

function closeConfirmModal(result) {
    document.getElementById('confirmModal').classList.remove('show');
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
}

function showResultModal(success, title, message, details = null) {
    // SIMPAN STATUS KE FLAG
    lastRegistrationWasSuccessful = success;
    Logger.log('showResultModal - Setting lastRegistrationWasSuccessful: ' + success);
    
    const modal = document.getElementById('resultModal');
    
    // ===== PERBAIKAN: GUNAKAN UNICODE ESCAPE SEQUENCES =====
    // Sebelumnya: ✓ dan ✗ (plain emoji - sering error)
    // Sekarang: \u2705 (✅) dan \u274C (❌) (unicode - always work)
    
    if (success) {
        document.getElementById('resultIcon').textContent = '\u2705'; // ✅
        Logger.log('Success icon set: ✅');
    } else {
        document.getElementById('resultIcon').textContent = '\u274C'; // ❌
        Logger.log('Error icon set: ❌');
    }
    
    document.getElementById('resultTitle').textContent = title;
    
    let messageText = message;
    if (details && success) {
        if (currentCabang && currentCabang.isTeam) {
            let teamData = `${message}\n\n`;
            teamData += `=== Data Registrasi Anda ===\n`;
            teamData += `Nama Regu/Tim: ${details.namaRegu || '-'}\n`;
            teamData += `Cabang: ${details.cabang || '-'}\n`;
            teamData += `Nomor Peserta: ${details.nomorPeserta || '-'}\n\n`;
            teamData += `=== Anggota Tim ===\n`;
            
            if (details.teamMembers && details.teamMembers.length > 0) {
                for (let i = 0; i < details.teamMembers.length; i++) {
                    const member = details.teamMembers[i];
                    teamData += `${i + 1}. ${member.nama}\n   NIK: ${member.nik}\n`;
                }
            }
            messageText = teamData;
        } else {
            messageText = `${message}\n\n=== Data Registrasi Anda ===\nNIK: ${details.nik}\nNama: ${details.nama}\nCabang: ${details.cabang}\nNomor Peserta: ${details.nomorPeserta}`;
        }
    }
    
    document.getElementById('resultMessage').textContent = messageText;
    modal.classList.add('show');
}

function closeResultModal() {
    const resultModal = document.getElementById('resultModal');
    
    Logger.log('closeResultModal - lastRegistrationWasSuccessful: ' + lastRegistrationWasSuccessful);
    
    resultModal.classList.remove('show');
    
    // ===== HANYA CLEAR JIKA BERHASIL =====
    if (lastRegistrationWasSuccessful === true) {
        Logger.log('✅ Registration SUCCESSFUL - CLEARING form');
        
        // Clear form fields
        const registrationForm = document.getElementById('registrationForm');
        if (registrationForm) {
            registrationForm.reset();
            Logger.log('Form reset executed');
        }
        
        // Clear file input values
        Logger.log('Clearing personal file inputs...');
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput) {
                personalInput.value = '';
                personalInput.removeAttribute('required');
                Logger.log(`  Cleared personalDoc${i}`);
            }
        }
        
        Logger.log('Clearing team file inputs...');
        for (let i = 1; i <= 3; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput) {
                    teamInput.value = '';
                    teamInput.removeAttribute('required');
                }
            }
        }
        Logger.log('All team files cleared');
        
        // Clear variables
        uploadedFiles = {};
        savedPersonalData = null;
        savedTeamData = {};
        Logger.log('Cleared: uploadedFiles, savedPersonalData, savedTeamData');
        
        // Reset display
        document.getElementById('cabang').value = '';
        document.getElementById('kecamatan').value = '';
        document.getElementById('umur').value = '';
        document.getElementById('ageRequirement').innerHTML = '';
        document.getElementById('ageRequirement').style.display = 'none';
        document.getElementById('dataDiriSection').style.display = 'none';
        document.getElementById('rekeningPersonalSection').style.display = 'none';
        document.getElementById('teamSection').style.display = 'none';
        document.getElementById('personalSection').style.display = 'none';
        document.getElementById('teamMembers').innerHTML = '';
        document.getElementById('personalDocs').innerHTML = '';
        document.getElementById('submitStatusInfo').style.display = 'none';
        
        Logger.log('Display sections hidden');
        
        currentCabang = null;
        currentTeamMemberCount = 2;
        
        // RESET FLAG
        lastRegistrationWasSuccessful = false;
        
        Logger.log('✅ Form cleared successfully');
        
    } else {
        Logger.log('❌ Registration FAILED - KEEPING form data for retry');
    }
    
    updateSubmitButtonState();
}

function showLoadingOverlay(show, message = 'Memproses...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    if (show) {
        loadingMessage.textContent = message;
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

async function resetForm() {
    const confirmed = await showConfirmModal(
        'Konfirmasi Bersihkan Form',
        'Apakah Anda yakin ingin membersihkan semua isian form?'
    );
    
    if (!confirmed) return;
    
    document.getElementById('registrationForm').reset();
    document.getElementById('cabang').value = '';
    document.getElementById('kecamatan').value = '';
    document.getElementById('umur').value = '';
    document.getElementById('ageRequirement').innerHTML = '';
    document.getElementById('ageRequirement').style.display = 'none';
    document.getElementById('dataDiriSection').style.display = 'none';
    document.getElementById('rekeningPersonalSection').style.display = 'none';
    document.getElementById('teamSection').style.display = 'none';
    document.getElementById('personalSection').style.display = 'none';
    document.getElementById('teamMembers').innerHTML = '';
    document.getElementById('personalDocs').innerHTML = '';
    
    uploadedFiles = {};
    savedPersonalData = null;
    savedTeamData = {};
    currentCabang = null;
    currentTeamMemberCount = 2;
    
    updateSubmitButtonState();
}

function getCabangData() {
    return {
        'Tartil Al Qur\'an Putra|12-11-29|personal|male|TA': { name: 'Tartil Al Qur\'an Putra', maxAge: '12-11-29', isTeam: false, genderRestriction: 'male', code: 'TA' },
        'Tartil Al Qur\'an Putri|12-11-29|personal|female|TA': { name: 'Tartil Al Qur\'an Putri', maxAge: '12-11-29', isTeam: false, genderRestriction: 'female', code: 'TA' },
        'Tilawah Anak-anak Putra|14-11-29|personal|male|TLA': { name: 'Tilawah Anak-anak Putra', maxAge: '14-11-29', isTeam: false, genderRestriction: 'male', code: 'TLA' },
        'Tilawah Anak-anak Putri|14-11-29|personal|female|TLA': { name: 'Tilawah Anak-anak Putri', maxAge: '14-11-29', isTeam: false, genderRestriction: 'female', code: 'TLA' },
        'Tilawah Remaja Putra|24-11-29|personal|male|TLR': { name: 'Tilawah Remaja Putra', maxAge: '24-11-29', isTeam: false, genderRestriction: 'male', code: 'TLR' },
        'Tilawah Remaja Putri|24-11-29|personal|female|TLR': { name: 'Tilawah Remaja Putri', maxAge: '24-11-29', isTeam: false, genderRestriction: 'female', code: 'TLR' },
        'Tilawah Dewasa Putra|40-11-29|personal|male|TLD': { name: 'Tilawah Dewasa Putra', maxAge: '40-11-29', isTeam: false, genderRestriction: 'male', code: 'TLD' },
        'Tilawah Dewasa Putri|40-11-29|personal|female|TLD': { name: 'Tilawah Dewasa Putri', maxAge: '40-11-29', isTeam: false, genderRestriction: 'female', code: 'TLD' },
        'Qira\'at Mujawwad Putra|40-11-29|personal|male|QM': { name: 'Qira\'at Mujawwad Putra', maxAge: '40-11-29', isTeam: false, genderRestriction: 'male', code: 'QM' },
        'Qira\'at Mujawwad Putri|40-11-29|personal|female|QM': { name: 'Qira\'at Mujawwad Putri', maxAge: '40-11-29', isTeam: false, genderRestriction: 'female', code: 'QM' },
        'Hafalan 1 Juz Putra|15-11-29|personal|male|H1J': { name: 'Hafalan 1 Juz Putra', maxAge: '15-11-29', isTeam: false, genderRestriction: 'male', code: 'H1J' },
        'Hafalan 1 Juz Putri|15-11-29|personal|female|H1J': { name: 'Hafalan 1 Juz Putri', maxAge: '15-11-29', isTeam: false, genderRestriction: 'female', code: 'H1J' },
        'Hafalan 5 Juz Putra|20-11-29|personal|male|H5J': { name: 'Hafalan 5 Juz Putra', maxAge: '20-11-29', isTeam: false, genderRestriction: 'male', code: 'H5J' },
        'Hafalan 5 Juz Putri|20-11-29|personal|female|H5J': { name: 'Hafalan 5 Juz Putri', maxAge: '20-11-29', isTeam: false, genderRestriction: 'female', code: 'H5J' },
        'Hafalan 10 Juz Putra|20-11-29|personal|male|H10J': { name: 'Hafalan 10 Juz Putra', maxAge: '20-11-29', isTeam: false, genderRestriction: 'male', code: 'H10J' },
        'Hafalan 10 Juz Putri|20-11-29|personal|female|H10J': { name: 'Hafalan 10 Juz Putri', maxAge: '20-11-29', isTeam: false, genderRestriction: 'female', code: 'H10J' },
        'Hafalan 20 Juz Putra|22-11-29|personal|male|H20J': { name: 'Hafalan 20 Juz Putra', maxAge: '22-11-29', isTeam: false, genderRestriction: 'male', code: 'H20J' },
        'Hafalan 20 Juz Putri|22-11-29|personal|female|H20J': { name: 'Hafalan 20 Juz Putri', maxAge: '22-11-29', isTeam: false, genderRestriction: 'female', code: 'H20J' },
        'Hafalan 30 Juz Putra|22-11-29|personal|male|H30J': { name: 'Hafalan 30 Juz Putra', maxAge: '22-11-29', isTeam: false, genderRestriction: 'male', code: 'H30J' },
        'Hafalan 30 Juz Putri|22-11-29|personal|female|H30J': { name: 'Hafalan 30 Juz Putri', maxAge: '22-11-29', isTeam: false, genderRestriction: 'female', code: 'H30J' },
        'Tafsir Arab Putra|22-11-29|personal|male|TFA': { name: 'Tafsir Arab Putra', maxAge: '22-11-29', isTeam: false, genderRestriction: 'male', code: 'TFA' },
        'Tafsir Arab Putri|22-11-29|personal|female|TFA': { name: 'Tafsir Arab Putri', maxAge: '22-11-29', isTeam: false, genderRestriction: 'female', code: 'TFA' },
        'Tafsir Indonesia Putra|34-11-29|personal|male|TFI': { name: 'Tafsir Indonesia Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'TFI' },
        'Tafsir Indonesia Putri|34-11-29|personal|female|TFI': { name: 'Tafsir Indonesia Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'TFI' },
        'Tafsir Inggris Putra|34-11-29|personal|male|TFE': { name: 'Tafsir Inggris Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'TFE' },
        'Tafsir Inggris Putri|34-11-29|personal|female|TFE': { name: 'Tafsir Inggris Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'TFE' },
        'Kaligrafi Naskah Putra|34-11-29|personal|male|KN': { name: 'Kaligrafi Naskah Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'KN' },
        'Kaligrafi Naskah Putri|34-11-29|personal|female|KN': { name: 'Kaligrafi Naskah Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'KN' },
        'Kaligrafi Hiasan Putra|34-11-29|personal|male|KH': { name: 'Kaligrafi Hiasan Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'KH' },
        'Kaligrafi Hiasan Putri|34-11-29|personal|female|KH': { name: 'Kaligrafi Hiasan Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'KH' },
        'Kaligrafi Dekorasi Putra|34-11-29|personal|male|KD': { name: 'Kaligrafi Dekorasi Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'KD' },
        'Kaligrafi Dekorasi Putri|34-11-29|personal|female|KD': { name: 'Kaligrafi Dekorasi Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'KD' },
        'Kaligrafi Kontemporer Putra|34-11-29|personal|male|KK': { name: 'Kaligrafi Kontemporer Putra', maxAge: '34-11-29', isTeam: false, genderRestriction: 'male', code: 'KK' },
        'Kaligrafi Kontemporer Putri|34-11-29|personal|female|KK': { name: 'Kaligrafi Kontemporer Putri', maxAge: '34-11-29', isTeam: false, genderRestriction: 'female', code: 'KK' },
        'KTIQ Putra|24-11-29|personal|male|KTIQ': { name: 'KTIQ Putra', maxAge: '24-11-29', isTeam: false, genderRestriction: 'male', code: 'KTIQ' },
        'KTIQ Putri|24-11-29|personal|female|KTIQ': { name: 'KTIQ Putri', maxAge: '24-11-29', isTeam: false, genderRestriction: 'female', code: 'KTIQ' },
        'Fahm Al Qur\'an Putra|18-11-29|tim|3|male|FAQ': { name: 'Fahm Al Qur\'an Putra', maxAge: '18-11-29', isTeam: true, memberCount: 3, genderRestriction: 'male', code: 'FAQ' },
        'Fahm Al Qur\'an Putri|18-11-29|tim|3|female|FAQ': { name: 'Fahm Al Qur\'an Putri', maxAge: '18-11-29', isTeam: true, memberCount: 3, genderRestriction: 'female', code: 'FAQ' },
        'Syarh Al Qur\'an Putra|18-11-29|tim|3|male|SAQ': { name: 'Syarh Al Qur\'an Putra', maxAge: '18-11-29', isTeam: true, memberCount: 3, genderRestriction: 'male', code: 'SAQ' },
        'Syarh Al Qur\'an Putri|18-11-29|tim|3|female|SAQ': { name: 'Syarh Al Qur\'an Putri', maxAge: '18-11-29', isTeam: true, memberCount: 3, genderRestriction: 'female', code: 'SAQ' }
    };
}

function initDeveloperMode() {
    if (!DEV_CONFIG.enabled) return;
    
    const devModal = document.createElement('div');
    devModal.id = 'devModal';
    devModal.className = 'dev-modal';
    devModal.innerHTML = `
        <div class="dev-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: var(--primary);">Developer Tools</h3>
                <button onclick="closeDevModal()" style="background: #6c757d; padding: 8px 15px; border: none; color: white; border-radius: 5px; cursor: pointer;">Tutup</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <button onclick="fillPersonalDataRandom()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Isi Data Personal</button>
                <button onclick="fillTeamMember1Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Isi Tim Peserta 1</button>
                <button onclick="fillTeamMember2Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Isi Tim Peserta 2</button>
                <button onclick="fillTeamMember3Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Isi Tim Peserta 3</button>
                <button onclick="clearAllDevData()" style="background: linear-gradient(135deg, var(--danger), #c82333); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; grid-column: 1/-1;">Hapus Semua</button>
            </div>
        </div>
    `;
    document.body.appendChild(devModal);
    
    const devBtn = document.createElement('button');
    devBtn.id = 'devBtn';
    devBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: linear-gradient(135deg, #1e5c96, #2e8b57); color: white; border: none; padding: 15px 20px; border-radius: 50%; width: 60px; height: 60px; cursor: pointer; font-size: 1.5em; z-index: 1000; box-shadow: 0 4px 15px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;';
    devBtn.textContent = '⚙️';
    devBtn.onclick = () => {
        const modal = document.getElementById('devModal');
        modal.classList.toggle('show-dev');
    };
    document.body.appendChild(devBtn);
}

function closeDevModal() {
    document.getElementById('devModal').classList.remove('show-dev');
}

function generateRandomNIK() {
    return Math.floor(Math.random() * 9000000000000000 + 1000000000000000).toString();
}

function generateRandomName() {
    const firstNames = ['Ahmad', 'Budi', 'Citra', 'Dina', 'Eka', 'Farah', 'Gilang', 'Hana', 'Irfan', 'Jaya'];
    const lastNames = ['Rahman', 'Suryanto', 'Kusuma', 'Wijaya', 'Santoso', 'Hermawan', 'Pratama', 'Setiawan'];
    return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)];
}

function generateRandomBirthDate() {
    const year = Math.floor(Math.random() * 20) + 2000;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateRandomPhone() {
    return '08' + Math.floor(Math.random() * 9000000000 + 1000000000).toString().slice(0, 10);
}

function generateRandomAddress() {
    const streets = ['Jl. Merdeka', 'Jl. Diponegoro', 'Jl. Sudirman', 'Jl. Gatot Subroto', 'Jl. Ahmad Yani'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    const number = Math.floor(Math.random() * 200) + 1;
    const rt = Math.floor(Math.random() * 10) + 1;
    const rw = Math.floor(Math.random() * 10) + 1;
    return `${street} No. ${number}, RT ${rt}/RW ${rw}`;
}

function generateRandomAccountNumber() {
    return Math.floor(Math.random() * 9000000000000 + 1000000000000).toString();
}

function fillPersonalDataRandom() {
    if (!currentCabang || currentCabang.isTeam) {
        alert('Pilih Cabang Individu terlebih dahulu!');
        return;
    }
    
    const birthDate = generateRandomBirthDate();
    const ageObj = calculateAge(birthDate);
    
    document.getElementById('nik').value = generateRandomNIK();
    document.getElementById('nama').value = generateRandomName();
    document.getElementById('jenisKelamin').value = currentCabang.genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
    document.getElementById('tempatLahir').value = 'Jakarta';
    document.getElementById('tglLahir').value = birthDate;
    document.getElementById('umur').value = formatAge(ageObj);
    document.getElementById('alamat').value = generateRandomAddress();
    document.getElementById('noTelepon').value = generateRandomPhone();
    document.getElementById('email').value = `user${Math.floor(Math.random() * 10000)}@email.com`;
    document.getElementById('namaRek').value = generateRandomName();
    document.getElementById('noRek').value = generateRandomAccountNumber();
    document.getElementById('namaBank').value = ['BNI', 'BCA', 'Mandiri', 'BRI'][Math.floor(Math.random() * 4)];
    
    updateSubmitButtonState();
}

function fillTeamMember1Random() {
    if (!currentCabang || !currentCabang.isTeam) {
        alert('Pilih Cabang Tim terlebih dahulu!');
        return;
    }
    fillTeamMemberRandom(1);
}

function fillTeamMember2Random() {
    if (!currentCabang || !currentCabang.isTeam) {
        alert('Pilih Cabang Tim terlebih dahulu!');
        return;
    }
    fillTeamMemberRandom(2);
}

function fillTeamMember3Random() {
    if (!currentCabang || !currentCabang.isTeam) {
        alert('Pilih Cabang Tim terlebih dahulu!');
        return;
    }
    if (currentTeamMemberCount < 3) {
        alert('Tambahkan Peserta ke-3 terlebih dahulu!');
        return;
    }
    fillTeamMemberRandom(3);
}

function fillTeamMemberRandom(memberIndex) {
    const birthDate = generateRandomBirthDate();
    const ageObj = calculateAge(birthDate);
    
    document.querySelector(`[name="memberNik${memberIndex}"]`).value = generateRandomNIK();
    document.querySelector(`[name="memberName${memberIndex}"]`).value = generateRandomName();
    document.querySelector(`[name="memberJenisKelamin${memberIndex}"]`).value = currentCabang.genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
    document.querySelector(`[name="memberTempatLahir${memberIndex}"]`).value = 'Jakarta';
    document.querySelector(`[name="memberBirthDate${memberIndex}"]`).value = birthDate;
    document.querySelector(`[name="memberUmur${memberIndex}"]`).value = formatAge(ageObj);
    document.querySelector(`[name="memberAlamat${memberIndex}"]`).value = generateRandomAddress();
    document.querySelector(`[name="memberNoTelepon${memberIndex}"]`).value = generateRandomPhone();
    document.querySelector(`[name="memberEmail${memberIndex}"]`).value = `member${memberIndex}${Math.floor(Math.random() * 10000)}@email.com`;
    document.querySelector(`[name="memberNamaRek${memberIndex}"]`).value = generateRandomName();
    document.querySelector(`[name="memberNoRek${memberIndex}"]`).value = generateRandomAccountNumber();
    document.querySelector(`[name="memberNamaBank${memberIndex}"]`).value = ['BNI', 'BCA', 'Mandiri', 'BRI'][Math.floor(Math.random() * 4)];
    
    updateSubmitButtonState();
}

function clearAllDevData() {
    if (confirm('Hapus semua data yang sudah diisi?')) {
        document.getElementById('registrationForm').reset();
        uploadedFiles = {};
        savedPersonalData = null;
        savedTeamData = {};
        document.getElementById('umur').value = '';
        updateSubmitButtonState();
    }
}

// ===== FORM SUBMISSION HANDLER - FINAL VERSION WITH DETAILED LOGGING =====

document.getElementById('registrationForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    Logger.log('=== FORM SUBMISSION START (OPTIMIZED FLOW) ===');
    Logger.log('Request received at: ' + new Date().toISOString());
    
    try {
        // ===== RESET PROGRESS TRACKER =====
        progressTracker.reset();
        
        // ===== STEP 0: BERSIHKAN REQUIRED ATTRIBUTE =====
        Logger.log('STEP 0: Cleaning required attributes from file inputs...');
        
        let personalFilesRemoved = 0;
        let teamFilesRemoved = 0;
        
        // Untuk Personal Form
        Logger.log('Cleaning personal form files...');
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput) {
                const hasUpload = uploadedFiles[`doc${i}`];
                
                if (!hasUpload) {
                    if (personalInput.hasAttribute('required')) {
                        personalInput.removeAttribute('required');
                        personalFilesRemoved++;
                        Logger.log(`  Removed required from personalDoc${i}`);
                    }
                } else {
                    if (i === 3 && personalInput.hasAttribute('required')) {
                        personalInput.removeAttribute('required');
                    }
                    if (i === 4 && personalInput.hasAttribute('required')) {
                        personalInput.removeAttribute('required');
                    }
                }
            }
        }
        Logger.log(`Personal files cleaned: ${personalFilesRemoved} removed required`);
        
        // Untuk Team Form
        Logger.log('Cleaning team form files...');
        for (let i = 1; i <= 3; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput) {
                    const hasUpload = uploadedFiles[`teamDoc${i}_${d}`];
                    
                    if (teamInput.hasAttribute('required')) {
                        if (!hasUpload) {
                            teamInput.removeAttribute('required');
                            teamFilesRemoved++;
                            Logger.log(`  Removed required from teamDoc${i}_${d}`);
                        }
                    }
                    
                    if (d === 3 && teamInput.hasAttribute('required')) {
                        teamInput.removeAttribute('required');
                    }
                    if (d === 4 && teamInput.hasAttribute('required')) {
                        teamInput.removeAttribute('required');
                    }
                }
            }
        }
        Logger.log(`Team files cleaned: ${teamFilesRemoved} removed required`);
        
        // ===== STEP 1: CHECK REGISTRATION TIME (TANPA LOCK) =====
        Logger.log('STEP 1: Checking registration time...');
        progressTracker.currentStep = 0;
        updateProgressDetailed(8, 'Memvalidasi Waktu Pendaftaran...');
        
        if (!checkRegistrationTime()) {
            Logger.log('ERROR: Registration time is closed');
            showResultModal(false, 'Pendaftaran Ditutup', 'Mohon maaf, waktu pendaftaran telah berakhir atau belum dimulai.');
            return;
        }
        Logger.log('Registration time: VALID');
        
        // ===== STEP 2: MINTA KONFIRMASI USER =====
        Logger.log('STEP 2: Waiting for user confirmation...');
        updateProgressDetailed(12, 'Menunggu Konfirmasi Anda...');
        
        const confirmed = await showConfirmModal(
            'Konfirmasi Pendaftaran',
            'Apakah Anda yakin semua data sudah benar?\n\nData yang sudah dikirim tidak dapat diubah.'
        );
        
        if (!confirmed) {
            Logger.log('User cancelled registration');
            return;
        }
        Logger.log('User confirmed registration');
        
        // ===== STEP 3: TAMPILKAN LOADING & PROGRESS =====
        Logger.log('STEP 3: Showing loading overlay...');
        showLoadingOverlay(true, 'Memvalidasi data & menyimpan...');
        document.getElementById('progressContainer').style.display = 'block';
        
        progressTracker.currentStep = 0;
        updateProgressDetailed(15, 'Validasi & Penyimpanan Data');
        
        // ===== STEP 4: SIAPKAN FORMDATA UNTUK STEP PERTAMA =====
        Logger.log('STEP 4: Preparing form data for server submission...');
        
        const formData = new FormData();
        const kecamatan = document.getElementById('kecamatan').value;
        const cabang = document.getElementById('cabang').value;
        
        formData.append('kecamatan', kecamatan);
        formData.append('cabang', currentCabang.name);
        formData.append('cabangCode', currentCabang.code);
        formData.append('maxAge', currentCabang.maxAge);
        formData.append('genderCode', currentCabang.genderRestriction);
        formData.append('isTeam', currentCabang.isTeam ? 'true' : 'false');
        
        const nikList = [];
        const responseDetails = { 
            cabang: currentCabang.name, 
            nomorPeserta: '' 
        };
        
        Logger.log('Cabang: ' + currentCabang.name);
        Logger.log('Kecamatan: ' + kecamatan);
        
        // ===== STEP 5A: JIKA INDIVIDU =====
        if (!currentCabang.isTeam) {
            Logger.log('STEP 5A: Processing PERSONAL registration...');
            updateProgressDetailed(20, 'Memproses Data Pribadi...');
            
            const nik = document.getElementById('nik').value;
            nikList.push(nik);
            
            formData.append('nik', nik);
            formData.append('nama', document.getElementById('nama').value);
            formData.append('jenisKelamin', document.getElementById('jenisKelamin').value);
            formData.append('tempatLahir', document.getElementById('tempatLahir').value);
            formData.append('tglLahir', document.getElementById('tglLahir').value);
            formData.append('umur', document.getElementById('umur').value);
            formData.append('alamat', document.getElementById('alamat').value);
            formData.append('noTelepon', document.getElementById('noTelepon').value);
            formData.append('email', document.getElementById('email').value);
            formData.append('namaRek', document.getElementById('namaRek').value);
            formData.append('noRek', document.getElementById('noRek').value);
            formData.append('namaBank', document.getElementById('namaBank').value);
            
            responseDetails.nik = nik;
            responseDetails.nama = document.getElementById('nama').value;
            
            Logger.log('Personal data: NIK=' + nik + ', Nama=' + responseDetails.nama);
        } 
        // ===== STEP 5B: JIKA TIM =====
        else {
            Logger.log('STEP 5B: Processing TEAM registration...');
            Logger.log('Team members to process: ' + currentTeamMemberCount);
            updateProgressDetailed(20, 'Memproses Data Tim...');
            
            const namaRegu = document.getElementById('namaRegu').value;
            formData.append('namaRegu', namaRegu);
            responseDetails.namaRegu = namaRegu;
            responseDetails.teamMembers = [];
            
            Logger.log('Team name: ' + namaRegu);
            
            // Loop untuk setiap anggota tim
            for (let i = 1; i <= currentTeamMemberCount; i++) {
                Logger.log(`Processing Team Member #${i}...`);
                
                const nik = document.querySelector(`[name="memberNik${i}"]`).value;
                const nama = document.querySelector(`[name="memberName${i}"]`).value;
                
                if (nik) nikList.push(nik);
                
                Logger.log(`  Member ${i}: NIK=${nik}, Nama=${nama}`);
                
                formData.append(`memberNik${i}`, nik);
                formData.append(`memberName${i}`, nama);
                formData.append(`memberJenisKelamin${i}`, document.querySelector(`[name="memberJenisKelamin${i}"]`).value);
                formData.append(`memberTempatLahir${i}`, document.querySelector(`[name="memberTempatLahir${i}"]`).value);
                formData.append(`memberBirthDate${i}`, document.querySelector(`[name="memberBirthDate${i}"]`).value);
                formData.append(`memberUmur${i}`, document.querySelector(`[name="memberUmur${i}"]`).value);
                formData.append(`memberAlamat${i}`, document.querySelector(`[name="memberAlamat${i}"]`).value);
                formData.append(`memberNoTelepon${i}`, document.querySelector(`[name="memberNoTelepon${i}"]`).value);
                formData.append(`memberEmail${i}`, document.querySelector(`[name="memberEmail${i}"]`).value);
                formData.append(`memberNamaRek${i}`, document.querySelector(`[name="memberNamaRek${i}"]`).value);
                formData.append(`memberNoRek${i}`, document.querySelector(`[name="memberNoRek${i}"]`).value);
                formData.append(`memberNamaBank${i}`, document.querySelector(`[name="memberNamaBank${i}"]`).value);
                
                // Simpan data member untuk response
                if (nik && nama) {
                    responseDetails.teamMembers.push({ nik: nik, nama: nama });
                    Logger.log(`  Member ${i} saved to response`);
                }
            }
            
            formData.append('memberGenderCode1', document.querySelector('[name="memberJenisKelamin1"]').value === 'Laki-laki' ? 'male' : 'female');
            Logger.log('Team registration data prepared successfully');
        }
        
        formData.append('nikList', JSON.stringify(nikList));
        Logger.log('NIK list: ' + JSON.stringify(nikList));
        
        updateProgressDetailed(25, 'Mengirim Data ke Server...');
        
        // ===== STEP 6: KIRIM DATA PERTAMA KE SERVER (VALIDASI + SIMPAN DATA) =====
        Logger.log('STEP 6: Sending data to server for validation & data storage...');
        showLoadingOverlay(true, 'Menyimpan data ke server...');
        
        progressTracker.currentStep = 0;
        updateProgressDetailed(30, 'Upload Data Registrasi...');
        
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        Logger.log('Server response status: ' + response.status);
        updateProgressDetailed(50, 'Data Registrasi Tersimpan!');
        
        const result = await response.json();
        Logger.log('Server response: ' + JSON.stringify(result));
        
        if (!result.success) {
            Logger.log('Registration FAILED: ' + result.message);
            showLoadingOverlay(false);
            showResultModal(false, 'Registrasi Ditolak', result.message || 'Terjadi kesalahan');
            return;
        }
        
        responseDetails.nomorPeserta = result.nomorPeserta;
        Logger.log('Registration data saved! Nomor Peserta: ' + result.nomorPeserta);
        
        // ===== STEP 7: UPLOAD FILES (JIKA ADA) =====
        Logger.log('STEP 7: Processing file uploads...');
        showLoadingOverlay(true, 'Mengupload dokumen...');
        
        progressTracker.currentStep = 1;
        progressTracker.filesTotal = Object.keys(uploadedFiles).length;
        progressTracker.filesProcessed = 0;
        
        Logger.log('Total files to upload: ' + progressTracker.filesTotal);
        
        if (progressTracker.filesTotal > 0) {
            // Siapkan FormData untuk file upload
            const fileFormData = new FormData();
            const uploadedFilesList = Object.keys(uploadedFiles);
            
            // ===== PENTING: TAMBAHKAN nomor peserta =====
            fileFormData.append('nomorPeserta', result.nomorPeserta);
            fileFormData.append('action', 'uploadFiles');
            Logger.log('Added nomorPeserta: ' + result.nomorPeserta);
            
            for (let idx = 0; idx < uploadedFilesList.length; idx++) {
                const key = uploadedFilesList[idx];
                if (uploadedFiles[key]) {
                    try {
                        const file = uploadedFiles[key];
                        Logger.log(`Converting file ${idx + 1}/${uploadedFilesList.length}: ${key} (${file.name})`);
                        
                        const base64 = await fileToBase64(file);
                        fileFormData.append(key, base64);
                        fileFormData.append(key + '_name', file.name);
                        fileFormData.append(key + '_type', file.type);
                        
                        // UPDATE PROGRESS
                        progressTracker.filesProcessed = idx + 1;
                        const currentProgress = progressTracker.calculateProgress();
                        const message = progressTracker.getDetailedMessage();
                        updateProgressDetailed(currentProgress, message);
                        
                        Logger.log(`File converted: ${key} (${currentProgress}%)`);
                    } catch (fileError) {
                        Logger.error('Error converting file ' + key, fileError);
                        throw fileError;
                    }
                }
            }
            
            Logger.log(`File conversion complete: ${progressTracker.filesProcessed}/${progressTracker.filesTotal} files converted`);
            updateProgressDetailed(70, 'Mengirim File...');
            
            // ===== KIRIM FILES KE SERVER =====
            Logger.log('Sending files to server...');
            Logger.log('File FormData keys: ' + Array.from(fileFormData.keys()).join(', '));
            
            const fileResponse = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                body: fileFormData
            });
            
            Logger.log('File upload response status: ' + fileResponse.status);
            const fileResult = await fileResponse.json();
            Logger.log('File upload response: ' + JSON.stringify(fileResult));
            
            if (!fileResult.success) {
                Logger.log('File upload failed: ' + fileResult.message);
                // Tetap tampilkan sukses karena data sudah tersimpan
                Logger.log('Note: Data sudah tersimpan meski file upload gagal');
                // Optional: Tampilkan warning ke user
                const warningDiv = document.getElementById('submitStatusInfo');
                if (warningDiv) {
                    warningDiv.innerHTML = '⚠️ Beberapa file mungkin gagal terupload. Data registrasi tetap tersimpan.';
                    warningDiv.style.display = 'block';
                    warningDiv.style.background = '#fff3cd';
                    warningDiv.style.color = '#856404';
                }
            }
            
            updateProgressDetailed(85, 'File Terupload!');
        } else {
            Logger.log('No files to upload, skipping file upload step');
            updateProgressDetailed(75, 'Tidak ada file untuk diupload');
        }
        
        Logger.log('Registration process COMPLETE!');
        updateProgressDetailed(100, '✅ Selesai!');
        
        setTimeout(() => {
            showLoadingOverlay(false);
            showResultModal(true, 'Registrasi Berhasil!', 'Data Anda telah tersimpan' + (progressTracker.filesTotal > 0 ? ' dan dokumen telah diupload.' : '.'), responseDetails);
            Logger.log('=== FORM SUBMISSION SUCCESS ===');
        }, 500);
        
    } 
    catch (error) {
        Logger.error('Submission error occurred', error);
        Logger.log('Error name: ' + error.name);
        Logger.log('Error message: ' + error.message);
        Logger.log('Error stack: ' + error.stack);
        
        showLoadingOverlay(false);
        updateProgressDetailed(0, 'Terjadi Kesalahan');
        showResultModal(false, 'Kesalahan Sistem', 'Terjadi kesalahan: ' + error.message);
        Logger.log('=== FORM SUBMISSION ERROR ===');
    } 
    finally {
        Logger.log('STEP FINAL: Cleanup...');
        document.getElementById('progressContainer').style.display = 'none';
        progressTracker.reset();
        Logger.log('=== FORM SUBMISSION COMPLETE ===');
    }
});

// Personal form event listeners
const tglLahirEl = document.getElementById('tglLahir');
if (tglLahirEl) {
    tglLahirEl.addEventListener('input', formatDateInput);
    tglLahirEl.addEventListener('change', function() {
        if (!this.value) return;
        const selectedDate = new Date(this.value);
        const today = new Date();
        
        if (selectedDate > today) {
            this.value = '';
            document.getElementById('umur').value = '';
            document.getElementById('submitStatusInfo').innerHTML = '⚠️ Tanggal lahir tidak boleh lebih dari hari ini';
            document.getElementById('submitStatusInfo').style.display = 'block';
            updateSubmitButtonState();
            return;
        }
        
        const ageObj = calculateAge(this.value);
        if (ageObj) {
            document.getElementById('umur').value = formatAge(ageObj);
        }
        updateSubmitButtonState();
    });
}

const nikEl = document.getElementById('nik');
if (nikEl) {
    nikEl.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
        updateSubmitButtonState();
    });
}

const jenisKelaminEl = document.getElementById('jenisKelamin');
if (jenisKelaminEl) {
    jenisKelaminEl.addEventListener('change', updateSubmitButtonState);
}

['nik', 'nama', 'jenisKelamin', 'tempatLahir', 'alamat', 'noTelepon', 'email', 'namaRek', 'noRek', 'namaBank'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', updateSubmitButtonState);
        el.addEventListener('change', updateSubmitButtonState);
    }
});

document.getElementById('kecamatan')?.addEventListener('change', updateSubmitButtonState);
