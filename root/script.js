// root/script.js - LENGKAP

/* ========== CONFIG SECTION ========== */
const CONFIG = {
    DEBUG_MODE: true,
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwi1KnYcS2bekarfmHjIW1hCsgu6LMuOBk9byfA_e0DCt4AacW6jmttPX4aNz9-y5lG/exec',
    REFERENCE_DATE: new Date('2025-11-01'),
    WIB_OFFSET: 7 * 60 * 60 * 1000
};

const APPS_SCRIPT_URL = CONFIG.APPS_SCRIPT_URL;
const REFERENCE_DATE = CONFIG.REFERENCE_DATE;
const WIB_OFFSET = CONFIG.WIB_OFFSET;

const Logger = {
    enabled: CONFIG.DEBUG_MODE,
    log: function(category, message, data = null) {
        if (!this.enabled) return;
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] [${category}] ${message}`;
        if (data !== null) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    },
    group: function(name) {
        if (!this.enabled) return;
        console.group(name);
    },
    groupEnd: function() {
        if (!this.enabled) return;
        console.groupEnd();
    }
};

let allData = [];
let filteredData = [];
let currentRowData = null;
let isEditMode = false;
let headers = [];
let sortColumn = null;
let sortDirection = 'asc';
let filesToUpload = {};

const KECAMATAN_LIST = [
    'Anjatan', 'Arahan', 'Balongan', 'Bangodua', 'Bongas', 'Cantigi',
    'Cikedung', 'Gabuswetan', 'Gantar', 'Haurgeulis', 'Indramayu',
    'Jatibarang', 'Juntinyuat', 'Kandanghaur', 'Karangampel', 'Kedokan Bunder',
    'Kertasemaya', 'Krangkeng', 'Lelea', 'Lohbener', 'Losarang',
    'Patrol', 'Pasekan', 'Sindang', 'Sliyeg', 'Sukagumiwang',
    'Sukra', 'Terisi', 'Tukdana', 'Widasari', 'Kroya'
];

document.addEventListener('DOMContentLoaded', function() {
    loadData();
});

function showAlert(message, type = 'success', isModal = false) {
    const container = isModal ? document.getElementById('modalAlertContainer') : document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    const icons = { success: '✔', error: '✕', info: 'ℹ' };
    alert.innerHTML = `<strong>${icons[type] || 'ℹ'}</strong> ${message}`;
    container.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

function showLoading(message = 'Memproses...', isModal = false) {
    const container = isModal ? document.getElementById('modalAlertContainer') : document.getElementById('alertContainer');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'alert alert-info loading-alert';
    loadingDiv.id = isModal ? 'modalLoadingAlert' : 'loadingAlert';
    loadingDiv.innerHTML = `<div class="inline-spinner"></div> ${message}`;
    container.appendChild(loadingDiv);
}

function hideLoading(isModal = false) {
    const loadingAlert = document.getElementById(isModal ? 'modalLoadingAlert' : 'loadingAlert');
    if (loadingAlert) loadingAlert.remove();
}

function loadData() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.style.display = 'block';
    Logger.log('loadData', '=== START LOADING DATA ===');

    fetch(APPS_SCRIPT_URL + '?action=getData')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data && data.data.length > 0) {
                Logger.log('loadData', `Received ${data.data.length} rows`);
                headers = data.headers;
                const headerMap = {};
                data.headers.forEach((header, idx) => {
                    headerMap[header] = idx;
                });
                
                allData = data.data.map((row, idx) => {
                    const obj = { rowIndex: idx };
                    data.headers.forEach((header, i) => {
                        let value = row[i] || '';
                        
                        if (header === 'Batas Usia Max') {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Batas Usia Max (row ${idx})`);
                                Logger.log('Batas Usia Processing', 'Original value:', value);
                                let processedValue = value;
                                
                                if (typeof value === 'string' && value.includes('T')) {
                                    Logger.log('Batas Usia Processing', 'Detected: ISO datetime format');
                                    const isoDate = value.split('T')[0];
                                    const parts = isoDate.split('-');
                                    const year = parseInt(parts[0]);
                                    const month = parts[1];
                                    const day = parts[2];
                                    const yearLastTwoDigits = year % 100;
                                    const monthFromISO = parseInt(month);
                                    const dayFromISO = parseInt(day);
                                    const originalDay = monthFromISO;
                                    const originalMonth = monthFromISO - 1;
                                    const originalYear = yearLastTwoDigits;
                                    processedValue = `${String(originalDay).padStart(2, '0')}-${String(originalMonth).padStart(2, '0')}-${String(originalYear).padStart(2, '0')}`;
                                    Logger.log('Batas Usia Processing', 'Final format DD-MM-YY:', processedValue);
                                } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                    Logger.log('Batas Usia Processing', 'Detected: YYYY-MM-DD format');
                                    const parts = value.split('-');
                                    const year = parseInt(parts[0]);
                                    const month = parts[1];
                                    const day = parts[2];
                                    const referenceDate = new Date('2025-11-01T00:00:00Z');
                                    const maxAgeDate = new Date(`${year}-${month}-${day}T00:00:00Z`);
                                    let years = referenceDate.getUTCFullYear() - maxAgeDate.getUTCFullYear();
                                    let months = referenceDate.getUTCMonth() - maxAgeDate.getUTCMonth();
                                    let days = referenceDate.getUTCDate() - maxAgeDate.getUTCDate();
                                    if (days < 0) {
                                        months--;
                                        const lastMonth = new Date(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 0);
                                        days += lastMonth.getUTCDate();
                                    }
                                    if (months < 0) {
                                        years--;
                                        months += 12;
                                    }
                                    const yearTwoDigit = years % 100;
                                    processedValue = `${String(yearTwoDigit).padStart(2, '0')}-${String(months).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
                                    Logger.log('Batas Usia Processing', 'Converted to max age format (YY-MM-DD):', processedValue);
                                }
                                value = processedValue;
                                Logger.log('Batas Usia Processing', 'FINAL VALUE:', value);
                                Logger.groupEnd();
                            }
                        }
                        
                        if (header.includes('Tanggal Lahir') || header.includes('Tgl Lahir')) {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Date: ${header} (row ${idx})`);
                                Logger.log('Date Processing', 'Original value:', value);
                                const dateObj = new Date(value);
                                if (!isNaN(dateObj.getTime())) {
                                    const adjusted = new Date(dateObj.getTime() + (7 * 60 * 60 * 1000));
                                    const adjYear = adjusted.getUTCFullYear();
                                    const adjMonth = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
                                    const adjDay = String(adjusted.getUTCDate()).padStart(2, '0');
                                    value = `${adjYear}-${adjMonth}-${adjDay}`;
                                    Logger.log('Date Processing', 'Adjusted value:', value);
                                }
                                Logger.groupEnd();
                            }
                        }
                        
                        if (header.includes('Umur')) {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Age: ${header} (row ${idx})`);
                                Logger.log('Age Processing', 'Original value:', value);
                                if (typeof value === 'string' && (value.includes('T') || value.match(/^\d{4}-\d{2}-\d{2}/))) {
                                    Logger.log('Age Processing', 'DETECTED: Date format, need to recalculate from birth date');
                                    let birthDateField = null;
                                    if (header === 'Umur') {
                                        birthDateField = 'Tanggal Lahir';
                                    } else if (header.includes('Anggota Tim #')) {
                                        const memberMatch = header.match(/Anggota Tim #(\d+)/);
                                        if (memberMatch) {
                                            birthDateField = `Anggota Tim #${memberMatch[1]} - Tgl Lahir`;
                                        }
                                    }
                                    Logger.log('Age Processing', 'Looking for birth date field:', birthDateField);
                                    if (birthDateField && headerMap[birthDateField] !== undefined) {
                                        const birthDateValue = row[headerMap[birthDateField]];
                                        Logger.log('Age Processing', 'Birth date value found:', birthDateValue);
                                        if (birthDateValue && birthDateValue !== '-') {
                                            value = calculateAge(birthDateValue);
                                            Logger.log('Age Processing', 'Recalculated age:', value);
                                        }
                                    } else {
                                        Logger.log('Age Processing', 'Birth date field not found, setting to -');
                                        value = '-';
                                    }
                                } else {
                                    const strValue = String(value).trim();
                                    Logger.log('Age Processing', 'String value:', strValue);
                                    if (strValue.match(/^\d{1,2}-\d{1,2}-\d{1,2}$/)) {
                                        const parts = strValue.split('-');
                                        value = `${String(parts[0]).padStart(2, '0')}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
                                        Logger.log('Age Processing', 'Normalized age format:', value);
                                    }
                                }
                                Logger.groupEnd();
                            }
                        }
                        obj[header] = value;
                    });
                    return obj;
                });
                
                filteredData = [...allData];
                Logger.log('loadData', '=== DATA LOADED SUCCESSFULLY ===');
                renderTable();
                updateStats();
            } else {
                showAlert('Tidak ada data atau sheet masih kosong', 'error');
            }
            loadingIndicator.style.display = 'none';
        })
        .catch(error => {
            console.error('Error loading data:', error);
            Logger.log('loadData', 'ERROR:', error.message);
            showAlert('Error: ' + error.message, 'error');
            loadingIndicator.style.display = 'none';
        });
}

function compareAge(personAgeStr, maxYears, maxMonths, maxDays, personLabel) {
    Logger.log('compareAge', 'Person:', personLabel);
    Logger.log('compareAge', 'Person age:', personAgeStr);
    const ageParts = personAgeStr.split('-');
    if (ageParts.length !== 3) {
        Logger.log('compareAge', 'Invalid age format for comparison');
        return { isValid: true, message: '' };
    }
    const personYears = parseInt(ageParts[0]) || 0;
    const personMonths = parseInt(ageParts[1]) || 0;
    const personDays = parseInt(ageParts[2]) || 0;
    const personTotalDays = (personYears * 365) + (personMonths * 30.44) + personDays;
    const maxTotalDays = (maxYears * 365) + (maxMonths * 30.44) + maxDays;
    if (personTotalDays > maxTotalDays) {
        const message = `⚠️ ${personLabel} melebihi batas usia maksimal!\n\nUmur ${personLabel}: ${personYears} Tahun ${personMonths} Bulan ${personDays} Hari\nBatas Usia Maksimal: ${maxYears} Tahun ${maxMonths} Bulan ${maxDays} Hari\n\nData tidak dapat disimpan sampai umur sesuai dengan ketentuan.`;
        Logger.log('compareAge', 'Age exceeded:', message);
        return { isValid: false, message: message };
    }
    Logger.log('compareAge', 'Age valid');
    return { isValid: true, message: '' };
}

function validateAgeRestriction() {
    const maxAgeStr = currentRowData['Batas Usia Max'] || '';
    const cabang = currentRowData['Cabang Lomba'] || '';
    Logger.log('validateAgeRestriction', '=== START VALIDATION ===');
    Logger.log('validateAgeRestriction', 'Cabang:', cabang);
    Logger.log('validateAgeRestriction', 'Max age from data:', maxAgeStr);
    if (!maxAgeStr || maxAgeStr === '-') {
        Logger.log('validateAgeRestriction', 'No max age found');
        return { isValid: true, message: '' };
    }
    const maxAgeParts = maxAgeStr.split('-');
    if (maxAgeParts.length !== 3) {
        Logger.log('validateAgeRestriction', 'Invalid max age format:', maxAgeStr);
        return { isValid: true, message: '' };
    }
    let maxAgeYears = parseInt(maxAgeParts[0]) || 0;
    let maxAgeMonths = parseInt(maxAgeParts[1]) || 0;
    let maxAgeDays = parseInt(maxAgeParts[2]) || 0;
    const personalAge = currentRowData['Umur'] || '';
    Logger.log('validateAgeRestriction', 'Personal age:', personalAge);
    if (personalAge && personalAge !== '-') {
        const validation = compareAge(personalAge, maxAgeYears, maxAgeMonths, maxAgeDays, 'Peserta Utama');
        if (!validation.isValid) {
            Logger.log('validateAgeRestriction', 'Personal validation FAILED');
            return validation;
        }
    }
    for (let i = 1; i <= 3; i++) {
        const memberAge = currentRowData[`Anggota Tim #${i} - Umur`] || '';
        const memberName = currentRowData[`Anggota Tim #${i} - Nama`] || '-';
        if (memberAge && memberAge !== '-' && memberName !== '-') {
            const validation = compareAge(memberAge, maxAgeYears, maxAgeMonths, maxAgeDays, `Anggota Tim #${i}`);
            if (!validation.isValid) {
                Logger.log('validateAgeRestriction', `Member ${i} validation FAILED`);
                return validation;
            }
        }
    }
    Logger.log('validateAgeRestriction', '=== ALL VALIDATION PASSED ===');
    return { isValid: true, message: '' };
}

function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const adjusted = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        const day = String(adjusted.getUTCDate()).padStart(2, '0');
        const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
        const year = adjusted.getUTCFullYear();
        return `${day}-${month}-${year}`;
    } catch (e) {
        return dateStr;
    }
}

function toDateInputValue(dateStr) {
    if (!dateStr || dateStr === '-') return '';
    try {
        let date;
        if (dateStr instanceof Date) {
            date = dateStr;
        } else {
            date = new Date(dateStr);
        }
        if (isNaN(date.getTime())) return '';
        const adjusted = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        const year = adjusted.getUTCFullYear();
        const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
        const day = String(adjusted.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}

function formatAge(ageStr) {
    if (!ageStr || ageStr === '-') return '-';
    const strAge = String(ageStr).trim();
    const parts = strAge.split('-');
    if (parts.length === 3) {
        const years = parseInt(parts[0]) || 0;
        const months = parseInt(parts[1]) || 0;
        const days = parseInt(parts[2]) || 0;
        return `${years} Tahun ${months} Bulan ${days} Hari`;
    }
    return ageStr;
}

function calculateAge(birthDateStr) {
    if (!birthDateStr || birthDateStr === '-') return '-';
    try {
        let birthDate;
        if (birthDateStr instanceof Date) {
            birthDate = birthDateStr;
        } else {
            birthDate = new Date(birthDateStr);
        }
        if (isNaN(birthDate.getTime())) return '-';
        const adjusted = new Date(birthDate.getTime() + (7 * 60 * 60 * 1000));
        const adjustedRef = new Date(REFERENCE_DATE.getTime() + (7 * 60 * 60 * 1000));
        let years = adjustedRef.getUTCFullYear() - adjusted.getUTCFullYear();
        let months = adjustedRef.getUTCMonth() - adjusted.getUTCMonth();
        let days = adjustedRef.getUTCDate() - adjusted.getUTCDate();
        if (days < 0) {
            months--;
            const lastMonth = new Date(adjustedRef.getUTCFullYear(), adjustedRef.getUTCMonth(), 0);
            days += lastMonth.getUTCDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        return `${String(years).padStart(2, '0')}-${String(months).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
    } catch (e) {
        return '-';
    }
}

function sortTable(column) {
    Logger.log('sortTable', 'Sorting by column:', column);
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    filteredData.sort((a, b) => {
        let valA, valB;
        if (column === 'Nama') {
            valA = (a['Nama Regu/Tim'] && a['Nama Regu/Tim'] !== '-') ? a['Nama Regu/Tim'] : (a['Nama Lengkap'] || '');
            valB = (b['Nama Regu/Tim'] && b['Nama Regu/Tim'] !== '-') ? b['Nama Regu/Tim'] : (b['Nama Lengkap'] || '');
        } else {
            valA = a[column] || '';
            valB = b[column] || '';
        }
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        Logger.log('sortTable', `Comparing: "${valA}" vs "${valB}"`);
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    Logger.log('sortTable', `Sorted ${filteredData.length} rows in ${sortDirection} order`);
    renderTable();
}

function searchData() {
    const nameSearch = document.getElementById('searchName').value.toLowerCase();
    const teamSearch = document.getElementById('searchTeam').value.toLowerCase();
    const kecamatanSearch = document.getElementById('searchKecamatan').value.toLowerCase();
    const nomorSearch = document.getElementById('searchNomor').value.toLowerCase();
    const statusSearch = document.getElementById('searchStatus').value;

    filteredData = allData.filter(row => {
        const nama = String(row['Nama Lengkap'] || '').toLowerCase();
        const nik = String(row['NIK'] || '').toLowerCase();
        const member1Nama = String(row['Anggota Tim #1 - Nama'] || '').toLowerCase();
        const member1Nik = String(row['Anggota Tim #1 - NIK'] || '').toLowerCase();
        const namaRegu = String(row['Nama Regu/Tim'] || '').toLowerCase();
        const kecamatan = String(row['Kecamatan'] || '').toLowerCase();
        const nomor = String(row['Nomor Peserta'] || '').toLowerCase();
        const status = row['Status'] || '';

        const nameMatch = !nameSearch || nama.includes(nameSearch) || nik.includes(nameSearch) || 
                            member1Nama.includes(nameSearch) || member1Nik.includes(nameSearch);
        const teamMatch = !teamSearch || namaRegu.includes(teamSearch);
        const kecamatanMatch = !kecamatanSearch || kecamatan.includes(kecamatanSearch);
        const nomorMatch = !nomorSearch || nomor.includes(nomorSearch);
        const statusMatch = !statusSearch || status === statusSearch;

        return nameMatch && teamMatch && kecamatanMatch && nomorMatch && statusMatch;
    });

    renderTable();
}

function resetSearch() {
    document.getElementById('searchName').value = '';
    document.getElementById('searchTeam').value = '';
    document.getElementById('searchKecamatan').value = '';
    document.getElementById('searchNomor').value = '';
    document.getElementById('searchStatus').value = '';
    filteredData = [...allData];
    sortColumn = null;
    sortDirection = 'asc';
    renderTable();
}

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const dataTable = document.getElementById('dataTable');
    const noData = document.getElementById('noData');

    tableBody.innerHTML = '';

    if (filteredData.length === 0) {
        dataTable.style.display = 'none';
        noData.style.display = 'block';
        updateStats();
        return;
    }

    dataTable.style.display = 'table';
    noData.style.display = 'none';

    filteredData.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const statusClass = `status-${row['Status'] === 'Menunggu Verifikasi' ? 'pending' : row['Status'] === 'Terverifikasi' ? 'verified' : 'rejected'}`;
        
        let displayName;
        if (row['Nama Regu/Tim'] && row['Nama Regu/Tim'] !== '-') {
            displayName = row['Nama Regu/Tim'];
        } else {
            displayName = row['Nama Lengkap'] || '-';
        }
        
        tr.innerHTML = `
            <td><strong>${row['Nomor Peserta'] || '-'}</strong></td>
            <td>${displayName}</td>
            <td>${row['Cabang Lomba'] || '-'}</td>
            <td>${row['Kecamatan'] || '-'}</td>
            <td><span class="status-badge ${statusClass}">${row['Status'] || 'Menunggu Verifikasi'}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-sm btn-primary" onclick="viewDetail(${idx})">Lihat</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
    
    updateStats();
}

function updateStats() {
    const statsRow = document.getElementById('statsRow');
    
    const total = filteredData.length;
    const pending = filteredData.filter(r => r['Status'] === 'Menunggu Verifikasi').length;
    const verified = filteredData.filter(r => r['Status'] === 'Terverifikasi').length;
    const rejected = filteredData.filter(r => r['Status'] === 'Ditolak').length;

    Logger.log('updateStats', `Total: ${total}, Pending: ${pending}, Verified: ${verified}, Rejected: ${rejected}`);

    statsRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total Peserta</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="background: linear-gradient(135deg, #f59e0b, #f97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${pending}</div>
            <div class="stat-label">Menunggu Verifikasi</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="background: linear-gradient(135deg, #10b981, #059669); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${verified}</div>
            <div class="stat-label">Terverifikasi</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="background: linear-gradient(135deg, #ef4444, #dc2626); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${rejected}</div>
            <div class="stat-label">Ditolak</div>
        </div>
    `;
}

function viewDetail(idx) {
    Logger.log('viewDetail', '=== VIEWING DETAIL ===');
    Logger.log('viewDetail', 'Index:', idx);
    
    isEditMode = false;
    filesToUpload = {};
    currentRowData = JSON.parse(JSON.stringify(filteredData[idx]));
    
    if (!currentRowData) {
        Logger.log('viewDetail', 'ERROR: No row data found');
        return;
    }
    
    Logger.log('viewDetail', 'Row data loaded:', currentRowData);
    
    renderDetailView();
    document.getElementById('detailModal').classList.add('show');
}

function renderDetailView() {
    Logger.log('renderDetailView', '=== START RENDER DETAIL VIEW ===');
    Logger.log('renderDetailView', 'Edit Mode:', isEditMode);
    Logger.log('renderDetailView', 'Current Status:', currentRowData['Status']);
    
    const detailContent = document.getElementById('detailContent');
    const detailFooter = document.getElementById('detailFooter');

    if (isEditMode) {
        detailContent.classList.add('edit-mode');
        detailFooter.innerHTML = `
            <button class="btn-danger" onclick="confirmDelete()">🗑️ Hapus</button>
            <div style="flex: 1;"></div>
            <button class="btn-success" id="saveButton" onclick="saveEdit()">💾 Simpan</button>
            <button class="btn-secondary" onclick="cancelEdit()">Tutup</button>
        `;
    } else {
        detailContent.classList.remove('edit-mode');
        detailFooter.innerHTML = `
            <button class="btn-danger" onclick="confirmDelete()">🗑️ Hapus</button>
            <div style="flex: 1;"></div>
            <button class="btn-primary" onclick="toggleEditMode()">✏️ Edit</button>
            <button class="btn-secondary" onclick="closeDetailModal()">Tutup</button>
        `;
    }

    let maxAgeStr = '-';
    const indexInAllData = allData.findIndex(r => 
        r['Nomor Peserta'] === currentRowData['Nomor Peserta'] && 
        r['Nama Lengkap'] === currentRowData['Nama Lengkap']
    );
    
    if (indexInAllData !== -1) {
        maxAgeStr = allData[indexInAllData]['Batas Usia Max'] || '-';
    }
    
    const maxAgeDisplay = formatAge(maxAgeStr);

    let html = `
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Nomor Peserta</span>
                ${renderField('Nomor Peserta', false)}
            </div>
            <div class="detail-group">
                <span class="detail-label">Status</span>
                ${isEditMode ? renderStatusSelect() : `<span class="detail-value">${currentRowData['Status'] || 'Menunggu Verifikasi'}</span>`}
            </div>
        </div>
    `;
    
    if (isEditMode) {
        html += `<div id="reasonFieldContainer"></div>`;
    }
    
    if (!isEditMode && currentRowData['Status'] === 'Ditolak') {
        html += `
        <div class="detail-row">
            <div class="detail-group" style="grid-column: 1/-1;">
                <span class="detail-label">Alasan Ditolak</span>
                <span class="detail-value" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.1)); border-color: #ef4444;">${currentRowData['Alasan Ditolak'] || '-'}</span>
            </div>
        </div>
        `;
    }

    html += `
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Kecamatan</span>
                ${isEditMode ? renderKecamatanSelect() : `<span class="detail-value">${currentRowData['Kecamatan'] || '-'}</span>`}
            </div>
            <div class="detail-group">
                <span class="detail-label">Cabang Lomba</span>
                ${renderField('Cabang Lomba', false)}
            </div>
        </div>

        <div class="detail-row">
            <div class="detail-group" style="grid-column: 1/-1;">
                <span class="detail-label">Persyaratan Umur Cabang</span>
                <span class="detail-value" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.15)); border-color: #3b82f6; font-weight: 600;">${maxAgeDisplay}</span>
            </div>
        </div>
    `;

    if (currentRowData['NIK'] && currentRowData['NIK'] !== '-') {
        html += renderPersonalSection('', {
            nik: 'NIK',
            nama: 'Nama Lengkap',
            jenisKelamin: 'Jenis Kelamin',
            tempatLahir: 'Tempat Lahir',
            tglLahir: 'Tanggal Lahir',
            umur: 'Umur',
            alamat: 'Alamat',
            noTelepon: 'No Telepon',
            email: 'Email',
            namaRekening: 'Nama Rekening',
            noRekening: 'No Rekening',
            namaBank: 'Nama Bank'
        });

        html += renderDocumentSection('Personal', [
            'Link - Doc Surat Mandat Personal',
            'Link - Doc KTP Personal',
            'Link - Doc Sertifikat Personal',
            'Link - Doc Rekening Personal',
            'Link - Doc Pas Photo Personal'
        ], '📄 Dokumen Peserta');
    }

    if (currentRowData['Anggota Tim #1 - NIK'] && currentRowData['Anggota Tim #1 - NIK'] !== '-') {
        html += `
            <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid rgba(15, 52, 96, 0.15);">
                <h4 style="color: var(--primary); margin-bottom: 15px;">👥 Data Regu/Tim</h4>
                <div class="detail-group" style="margin-bottom: 15px;">
                    <span class="detail-label">Nama Regu/Tim</span>
                    ${renderField('Nama Regu/Tim')}
                </div>
        `;

        for (let i = 1; i <= 3; i++) {
            const nikKey = `Anggota Tim #${i} - NIK`;
            
            if (currentRowData[nikKey] && currentRowData[nikKey] !== '-') {
                html += `<div class="team-member-section"><h4>👤 Anggota #${i}</h4>`;
                html += renderPersonalSection(i, {
                    nik: `Anggota Tim #${i} - NIK`,
                    nama: `Anggota Tim #${i} - Nama`,
                    jenisKelamin: `Anggota Tim #${i} - Jenis Kelamin`,
                    tempatLahir: `Anggota Tim #${i} - Tempat Lahir`,
                    tglLahir: `Anggota Tim #${i} - Tgl Lahir`,
                    umur: `Anggota Tim #${i} - Umur`,
                    alamat: `Anggota Tim #${i} - Alamat`,
                    noTelepon: `Anggota Tim #${i} - No Telepon`,
                    email: `Anggota Tim #${i} - Email`,
                    namaRekening: `Anggota Tim #${i} - Nama Rekening`,
                    noRekening: `Anggota Tim #${i} - No Rekening`,
                    namaBank: `Anggota Tim #${i} - Nama Bank`
                });
                html += `</div>`;

                html += renderDocumentSection(`Team ${i}`, [
                    `Link - Doc Surat Mandat Team ${i}`,
                    `Link - Doc KTP Team ${i}`,
                    `Link - Doc Sertifikat Team ${i}`,
                    `Link - Doc Rekening Team ${i}`,
                    `Link - Doc Pas Photo Team ${i}`
                ], `📄 Dokumen Anggota Tim #${i}`);
            }
        }
        html += `</div>`;
    }

    detailContent.innerHTML = html;
    
    if (isEditMode) {
        Logger.log('renderDetailView', 'Setting up edit mode event listeners');
        
        const statusSelect = document.querySelector('[data-field="Status"]');
        if (statusSelect) {
            Logger.log('renderDetailView', 'Status select found, adding event listener');
            
            statusSelect.value = currentRowData['Status'] || 'Menunggu Verifikasi';
            Logger.log('renderDetailView', 'Initial status set to:', statusSelect.value);
            
            statusSelect.addEventListener('change', function(e) {
                const newStatus = e.target.value;
                Logger.log('renderDetailView', 'Status changed to:', newStatus);
                
                currentRowData['Status'] = newStatus;
                
                const reasonContainer = document.getElementById('reasonFieldContainer');
                if (reasonContainer) {
                    if (newStatus === 'Ditolak') {
                        Logger.log('renderDetailView', 'Showing reason field');
                        reasonContainer.innerHTML = renderReasonField();
                    } else {
                        Logger.log('renderDetailView', 'Hiding reason field');
                        reasonContainer.innerHTML = '';
                        currentRowData['Alasan Ditolak'] = '-';
                    }
                }
            });
            
            const initialStatus = statusSelect.value;
            const reasonContainer = document.getElementById('reasonFieldContainer');
            if (reasonContainer && initialStatus === 'Ditolak') {
                Logger.log('renderDetailView', 'Initial status is Ditolak, showing reason field');
                reasonContainer.innerHTML = renderReasonField();
            }
        } else {
            Logger.log('renderDetailView', 'ERROR: Status select not found!');
        }

        document.querySelectorAll('.file-input').forEach(input => {
            input.addEventListener('change', handleFileChange);
        });

        document.querySelectorAll('.date-text-input').forEach(input => {
            input.addEventListener('change', function(e) {
                const dateValue = e.target.value;
                const memberNum = e.target.getAttribute('data-member');
                
                if (!dateValue || dateValue === '-' || dateValue === '') return;
                
                Logger.log('renderDetailView', 'Date changed for member:', memberNum, 'Value:', dateValue);
                
                const newAge = calculateAge(dateValue);
                Logger.log('renderDetailView', 'Calculated age:', newAge);
                
                if (memberNum) {
                    const umurField = `Anggota Tim #${memberNum} - Umur`;
                    currentRowData[umurField] = newAge;
                } else {
                    currentRowData['Umur'] = newAge;
                }
                
                updateAgeDisplay(memberNum, newAge);
                setTimeout(() => {
                    performAgeValidation();
                }, 100);
            });
        });

        Logger.log('renderDetailView', 'Performing initial age validation');
        performAgeValidation();
    }
}

function renderReasonField() {
    const currentReason = currentRowData['Alasan Ditolak'] || '';
    return `
        <div class="detail-row">
            <div class="detail-group" style="grid-column: 1/-1;">
                <span class="detail-label" style="color: #ef4444;">Alasan Ditolak *</span>
                <textarea class="edit-textarea" data-field="Alasan Ditolak" rows="3" placeholder="Masukkan alasan penolakan..." required style="border-color: rgba(239, 68, 68, 0.3);">${currentReason}</textarea>
            </div>
        </div>
    `;
}

function performAgeValidation() {
    const validation = validateAgeRestriction();
    Logger.log('performAgeValidation', 'Validation result:', validation);
    
    if (!validation.isValid) {
        showAgeValidationError(validation.message);
        disableSaveButton();
    } else {
        clearAgeValidationError();
        enableSaveButton();
    }
}

function enableSaveButton() {
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.disabled = false;
        saveButton.style.opacity = '1';
        saveButton.style.cursor = 'pointer';
        Logger.log('enableSaveButton', 'Save button enabled');
    }
}

function disableSaveButton() {
    const saveButton = document.getElementById('saveButton');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.style.opacity = '0.5';
        saveButton.style.cursor = 'not-allowed';
        Logger.log('disableSaveButton', 'Save button disabled');
    }
}

function updateAgeDisplay(memberNum, newAge) {
    if (memberNum) {
        const ageInput = document.querySelector(`input[data-field="Anggota Tim #${memberNum} - Umur"]`);
        if (ageInput) {
            ageInput.value = newAge;
            Logger.log('renderDetailView', 'Updated age display for member:', memberNum, newAge);
        }
    } else {
        const ageInput = document.querySelector('input[data-field="Umur"]');
        if (ageInput) {
            ageInput.value = newAge;
            Logger.log('renderDetailView', 'Updated age display for personal:', newAge);
        }
    }
}

function renderPersonalSection(memberNum, fields) {
    const prefix = memberNum ? '' : '📋 Data Diri Peserta';
    let html = memberNum ? '' : `<div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid rgba(15, 52, 96, 0.15);"><h4 style="color: var(--primary); margin-bottom: 15px;">${prefix}</h4>`;
    
    html += `
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">NIK</span>
                ${renderField(fields.nik)}
            </div>
            <div class="detail-group">
                <span class="detail-label">Nama Lengkap</span>
                ${renderField(fields.nama)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Jenis Kelamin</span>
                ${renderField(fields.jenisKelamin)}
            </div>
            <div class="detail-group">
                <span class="detail-label">Tanggal Lahir</span>
                ${renderDateField(fields.tglLahir, memberNum)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Tempat Lahir</span>
                ${renderField(fields.tempatLahir)}
            </div>
            <div class="detail-group">
                <span class="detail-label">Umur</span>
                ${renderAgeField(fields.umur)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group" style="grid-column: 1/-1;">
                <span class="detail-label">Alamat</span>
                ${renderTextareaField(fields.alamat)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">No Telepon</span>
                ${renderField(fields.noTelepon)}
            </div>
            <div class="detail-group">
                <span class="detail-label">Email</span>
                ${renderField(fields.email)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Nama Rekening</span>
                ${renderField(fields.namaRekening)}
            </div>
            <div class="detail-group">
                <span class="detail-label">No Rekening</span>
                ${renderField(fields.noRekening)}
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-group">
                <span class="detail-label">Nama Bank</span>
                ${renderField(fields.namaBank)}
            </div>
        </div>
    `;
    
    html += memberNum ? '' : '</div>';
    return html;
}

function renderDocumentSection(type, docKeys, title) {
    const docNames = ['Surat Mandat', 'KTP/KK/KIA', 'Sertifikat', 'Foto Buku Tabungan', 'Pas Photo'];
    let hasDocuments = false;
    
    for (let key of docKeys) {
        if (currentRowData[key] && currentRowData[key].trim()) {
            hasDocuments = true;
            break;
        }
    }

    if (!hasDocuments && !isEditMode) return '';

    let html = `
        <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid rgba(15, 52, 96, 0.15);">
            <h4 style="color: var(--primary); margin-bottom: 15px;">${title}</h4>
            <div class="file-preview">
    `;
    
    docKeys.forEach((key, idx) => {
        const hasFile = currentRowData[key] && currentRowData[key].trim();
        html += `
            <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 6px; border: 1px solid rgba(15, 52, 96, 0.1);">
                <strong style="color: var(--primary); display: block; margin-bottom: 5px;">${docNames[idx]}</strong>
        `;
        
        if (isEditMode) {
            html += `
                <input type="file" class="file-input" data-field="${key}" accept=".pdf,.jpg,.jpeg,.png" style="margin-bottom: 5px;">
                ${hasFile ? `<div style="font-size: 0.85em; color: #666;">File saat ini: <a href="${currentRowData[key]}" target="_blank">Lihat File</a></div>` : ''}
            `;
        } else if (hasFile) {
            html += `<a href="${currentRowData[key]}" target="_blank" class="file-link">📄 Buka File</a>`;
        } else {
            html += `<span style="color: #999;">Tidak ada file</span>`;
        }
        
        html += `</div>`;
    });

    html += `</div></div>`;
    return html;
}

function handleFileChange(e) {
    const field = e.target.getAttribute('data-field');
    const file = e.target.files[0];
    if (file) {
        filesToUpload[field] = file;
        console.log('File akan diupload:', field, file.name);
    }
}

function renderField(fieldName, editable = true) {
    const value = currentRowData[fieldName] || '-';
    if (isEditMode && editable) {
        return `<input type="text" class="edit-input" data-field="${fieldName}" value="${value}">`;
    }
    return `<span class="detail-value">${value}</span>`;
}

function renderKecamatanSelect() {
    const currentKecamatan = currentRowData['Kecamatan'] || '';
    let html = '<select class="edit-select" data-field="Kecamatan">';
    html += '<option value="">Pilih Kecamatan</option>';
    KECAMATAN_LIST.forEach(kec => {
        html += `<option value="${kec}" ${currentKecamatan === kec ? 'selected' : ''}>${kec}</option>`;
    });
    html += '</select>';
    return html;
}

function renderDateField(fieldName, memberNum = '') {
    Logger.log('renderDateField', 'Field:', fieldName);
    
    const value = currentRowData[fieldName] || '-';
    Logger.log('renderDateField', 'Raw value:', value);
    
    const formattedValue = formatDate(value);
    Logger.log('renderDateField', 'Formatted value:', formattedValue);
    
    if (isEditMode) {
        const inputValue = toDateInputValue(value);
        Logger.log('renderDateField', 'Input value:', inputValue);
        
        const memberAttr = memberNum ? memberNum : '';
        return `<input type="date" class="edit-input date-text-input" data-field="${fieldName}" data-member="${memberAttr}" value="${inputValue}">`;
    }
    return `<span class="detail-value">${formattedValue}</span>`;
}

function renderAgeField(fieldName) {
    Logger.log('renderAgeField', 'Field:', fieldName);
    
    const value = currentRowData[fieldName] || '-';
    Logger.log('renderAgeField', 'Raw value:', value);
    
    const formattedValue = formatAge(value);
    Logger.log('renderAgeField', 'Formatted value:', formattedValue);
    
    if (isEditMode) {
        return `<input type="text" class="edit-input" data-field="${fieldName}" value="${value}" readonly style="background: #f0f0f0; cursor: not-allowed;">`;
    }
    return `<span class="detail-value">${formattedValue}</span>`;
}

function renderTextareaField(fieldName) {
    const value = currentRowData[fieldName] || '-';
    if (isEditMode) {
        return `<textarea class="edit-textarea" data-field="${fieldName}" rows="3">${value}</textarea>`;
    }
    return `<span class="detail-value">${value}</span>`;
}

function renderStatusSelect() {
    const currentStatus = currentRowData['Status'] || 'Menunggu Verifikasi';
    Logger.log('renderStatusSelect', 'Current status:', currentStatus);
    return `
        <select class="edit-select" data-field="Status">
            <option value="Menunggu Verifikasi" ${currentStatus === 'Menunggu Verifikasi' ? 'selected' : ''}>Menunggu Verifikasi</option>
            <option value="Terverifikasi" ${currentStatus === 'Terverifikasi' ? 'selected' : ''}>Terverifikasi</option>
            <option value="Ditolak" ${currentStatus === 'Ditolak' ? 'selected' : ''}>Ditolak</option>
        </select>
    `;
}

function toggleEditMode() {
    Logger.log('toggleEditMode', 'Entering edit mode');
    isEditMode = true;
    filesToUpload = {};
    renderDetailView();
}

function cancelEdit() {
    Logger.log('cancelEdit', 'Cancelling edit mode');
    isEditMode = false;
    filesToUpload = {};
    currentRowData = JSON.parse(JSON.stringify(filteredData.find(r => r.rowIndex === currentRowData.rowIndex)));
    Logger.log('cancelEdit', 'Restored original data');
    renderDetailView();
}

async function saveEdit() {
    Logger.log('saveEdit', '=== START SAVE EDIT ===');
    
    const statusSelect = document.querySelector('[data-field="Status"]');
    const reasonTextarea = document.querySelector('[data-field="Alasan Ditolak"]');
    
    Logger.log('saveEdit', 'Status Select Found:', !!statusSelect);
    Logger.log('saveEdit', 'Status Value:', statusSelect ? statusSelect.value : 'N/A');
    Logger.log('saveEdit', 'Reason Textarea Found:', !!reasonTextarea);
    Logger.log('saveEdit', 'Reason Value:', reasonTextarea ? reasonTextarea.value : 'N/A');
    
    if (statusSelect && statusSelect.value === 'Ditolak') {
        Logger.log('saveEdit', 'Status is Ditolak, checking reason...');
        if (!reasonTextarea || !reasonTextarea.value.trim()) {
            Logger.log('saveEdit', 'ERROR: Reason is empty!');
            showAlert('⚠️ Alasan ditolak harus diisi!', 'error', true);
            if (reasonTextarea) {
                reasonTextarea.focus();
                reasonTextarea.style.borderColor = '#ef4444';
            }
            return;
        }
        Logger.log('saveEdit', 'Reason validation passed');
    }

    if (!confirm('Apakah Anda yakin ingin menyimpan perubahan?')) {
        Logger.log('saveEdit', 'User cancelled save');
        return;
    }

    showLoading('Menyimpan perubahan...', true);
    
    try {
        const inputs = document.querySelectorAll('.edit-input:not([readonly]), .edit-textarea, .edit-select');
        const updatedData = {};
        
        Logger.log('saveEdit', 'Found inputs:', inputs.length);
        
        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            const value = input.value;
            updatedData[field] = value;
            currentRowData[field] = value;
            Logger.log('saveEdit', `Field: ${field} = ${value}`);
        });

        if (updatedData['Status'] !== 'Ditolak') {
            Logger.log('saveEdit', 'Status is not Ditolak, setting reason to "-"');
            updatedData['Alasan Ditolak'] = '-';
            currentRowData['Alasan Ditolak'] = '-';
        } else {
            Logger.log('saveEdit', 'Status is Ditolak, reason:', updatedData['Alasan Ditolak']);
        }

        const originalIndex = allData.findIndex(row => row.rowIndex === currentRowData.rowIndex);
        if (originalIndex !== -1) {
            Object.assign(allData[originalIndex], updatedData);
            Logger.log('saveEdit', 'Updated allData at index:', originalIndex);
        }

        if (Object.keys(filesToUpload).length > 0) {
            Logger.log('saveEdit', 'Uploading files:', Object.keys(filesToUpload).length);
            hideLoading(true);
            showLoading(`Mengupload ${Object.keys(filesToUpload).length} file...`, true);
            const uploadResult = await uploadFiles();
            if (uploadResult.success) {
                Object.assign(updatedData, uploadResult.fileLinks);
                Object.assign(currentRowData, uploadResult.fileLinks);
                hideLoading(true);
                showAlert('File berhasil diupload', 'success', true);
                Logger.log('saveEdit', 'Files uploaded successfully');
            } else {
                hideLoading(true);
                showAlert('Gagal mengupload file: ' + uploadResult.message, 'error', true);
                Logger.log('saveEdit', 'ERROR: File upload failed');
                return;
            }
        }

        hideLoading(true);
        showLoading('Memperbarui data di spreadsheet...', true);
        
        Logger.log('saveEdit', 'Sending data to server...');
        Logger.log('saveEdit', 'Updated Data:', updatedData);
        
        const formData = new URLSearchParams();
        formData.append('action', 'updateRow');
        formData.append('rowIndex', currentRowData.rowIndex);
        formData.append('updatedData', JSON.stringify(updatedData));

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        const result = await response.json();
        
        hideLoading(true);

        Logger.log('saveEdit', 'Server response:', result);

        if (result.success) {
            showAlert('✔ Data berhasil diperbarui!', 'success', true);
            isEditMode = false;
            filesToUpload = {};
            
            const filteredIndex = filteredData.findIndex(row => row.rowIndex === currentRowData.rowIndex);
            if (filteredIndex !== -1) {
                Object.assign(filteredData[filteredIndex], updatedData);
                Logger.log('saveEdit', 'Updated filteredData at index:', filteredIndex);
            }
            
            renderDetailView();
            renderTable();
            updateStats();
            Logger.log('saveEdit', '=== SAVE EDIT SUCCESS ===');
        } else {
            showAlert('Gagal memperbarui data: ' + result.message, 'error', true);
            Logger.log('saveEdit', 'ERROR: Server returned failure');
        }
    } catch (error) {
        hideLoading(true);
        console.error('Error updating data:', error);
        Logger.log('saveEdit', 'ERROR:', error.message);
        showAlert('Error: ' + error.message, 'error', true);
    }
}

function showAgeValidationError(message) {
    const container = document.getElementById('modalAlertContainer');
    
    const existingAlert = container.querySelector('.alert-age-error');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    const alert = document.createElement('div');
    alert.className = 'alert alert-error alert-age-error';
    alert.innerHTML = `<strong>⚠️ Validasi Umur Gagal</strong><br>${message}`;
    alert.style.whiteSpace = 'pre-wrap';
    container.insertBefore(alert, container.firstChild);
}

async function uploadFiles() {
    try {
        const formData = new FormData();
        formData.append('action', 'uploadFiles');
        formData.append('nomorPeserta', currentRowData['Nomor Peserta']);
        
        for (let field in filesToUpload) {
            const file = filesToUpload[field];
            const reader = new FileReader();
            
            await new Promise((resolve, reject) => {
                reader.onload = function(e) {
                    const base64 = e.target.result.split(',')[1];
                    formData.append(field, base64);
                    formData.append(field + '_name', file.name);
                    formData.append(field + '_type', file.type);
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });

        return await response.json();
    } catch (error) {
        return { success: false, message: error.message };
    }
}

function closeDetailModal() {
    Logger.log('closeDetailModal', 'Closing modal');
    document.getElementById('detailModal').classList.remove('show');
    isEditMode = false;
    filesToUpload = {};
    currentRowData = null;
    document.getElementById('modalAlertContainer').innerHTML = '';
}

function confirmDelete(idx) {
    let rowToDelete;
    if (typeof idx === 'number') {
        rowToDelete = filteredData[idx];
    } else {
        rowToDelete = currentRowData;
    }
    
    if (!rowToDelete) return;

    const displayName = rowToDelete['Nama Regu/Tim'] && rowToDelete['Nama Regu/Tim'] !== '-' 
        ? rowToDelete['Nama Regu/Tim'] 
        : rowToDelete['Nama Lengkap'] || 'Peserta';
    
    Logger.log('confirmDelete', 'Attempting to delete:', displayName);
    
    if (confirm(`⚠️ PERINGATAN!\n\nApakah Anda yakin ingin menghapus data:\n${displayName}\nNomor Peserta: ${rowToDelete['Nomor Peserta']}\n\nTindakan ini tidak dapat dibatalkan!`)) {
        deleteData(rowToDelete);
    }
}

function clearAgeValidationError() {
    const container = document.getElementById('modalAlertContainer');
    const existingAlert = container.querySelector('.alert-age-error');
    if (existingAlert) {
        existingAlert.remove();
    }
}

function deleteData(rowToDelete) {
    const isModal = document.getElementById('detailModal').classList.contains('show');
    showLoading('Menghapus data...', isModal);
    
    const formData = new URLSearchParams();
    formData.append('action', 'deleteRow');
    formData.append('rowIndex', rowToDelete.rowIndex);

    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
    })
    .then(r => r.json())
    .then(result => {
        hideLoading(isModal);
        
        if (result.success) {
            const allIdx = allData.findIndex(row => row.rowIndex === rowToDelete.rowIndex);
            if (allIdx > -1) allData.splice(allIdx, 1);
            
            const filteredIdx = filteredData.findIndex(row => row.rowIndex === rowToDelete.rowIndex);
            if (filteredIdx > -1) filteredData.splice(filteredIdx, 1);
            
            showAlert('✔ Data peserta berhasil dihapus!', 'success', isModal);
            renderTable();
            updateStats();
            if (isModal) {
                setTimeout(() => closeDetailModal(), 1500);
            }
        } else {
            showAlert('Gagal menghapus data: ' + result.message, 'error', isModal);
        }
    })
    .catch(error => {
        hideLoading(isModal);
        console.error('Error deleting data:', error);
        showAlert('Error: ' + error.message, 'error', isModal);
    });
}