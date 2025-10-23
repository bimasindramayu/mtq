const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby451S5eHRQXKIydYT5O4gCfZ7nhZ47YQ83JUB0_H7PbY6-G56lz3H86HAy8jmYYwNL/exec';

const REFERENCE_DATE = new Date('2025-11-01');

const WIB_OFFSET = 7 * 60 * 60 * 1000; // 7 jam dalam milliseconds

// Logger utility
const Logger = {
    enabled: true,
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
    alert.innerHTML = `<strong>${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</strong> ${message}`;
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
                
                // Create header index map for easy lookup
                const headerMap = {};
                data.headers.forEach((header, idx) => {
                    headerMap[header] = idx;
                });
                
                allData = data.data.map((row, idx) => {
                    const obj = { rowIndex: idx };
                    
                    data.headers.forEach((header, i) => {
                        let value = row[i] || '';
                        
                        // KHUSUS: Parse "Batas Usia Max" - Convert dari ISO datetime ke umur maksimal
                        if (header === 'Batas Usia Max') {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Batas Usia Max (row ${idx})`);
                                Logger.log('Batas Usia Processing', 'Original value:', value);
                                Logger.log('Batas Usia Processing', 'Original type:', typeof value);
                                
                                let processedValue = value;
                                
                                // Cek apakah format ISO datetime (YYYY-MM-DDTHH:MM:SS.000Z)
                                if (typeof value === 'string' && value.includes('T')) {
                                    Logger.log('Batas Usia Processing', 'Detected: ISO datetime format');
                                    const isoDate = value.split('T')[0]; // e.g., "2029-12-10"
                                    const parts = isoDate.split('-');
                                    const year = parseInt(parts[0]);
                                    const month = parts[1];
                                    const day = parts[2];
                                    
                                    Logger.log('Batas Usia Processing', 'Extracted date:', {year, month, day});
                                    
                                    // Google Sheets interpret "12-11-29" sebagai 12 November 2029 (DD-MM-YYYY)
                                    // Namun saat mengirim via API, Sheets malah mengirim ISO: 2029-12-10
                                    // Jadi kita perlu special handling:
                                    // 
                                    // Format asli yang diinginkan: DD-MM-YY
                                    // ISO yang diterima: YYYY-MM-DD
                                    // 
                                    // Mapping dari ISO 2029-12-10 ke original 12-11-29:
                                    // Sheets interpret: 12 (hari asli) - 11 (bulan asli) - 29 (tahun asli = 2029)
                                    // Sheets output ISO: 2029 (tahun asli) - 12 (?) - 10 (?)
                                    // 
                                    // Pattern: YYYY-MM-DD dari 2029-12-10 sebenarnya adalah:
                                    // YYYY (2029) = tahun dari 29 -> jadi ini adalah 20YY format
                                    // MM (12) = bulan? tidak, karena original bulan adalah 11
                                    // DD (10) = hari? tidak, karena original hari adalah 12
                                    //
                                    // Coba mapping lain: 
                                    // 2029-12-10 -> ambil: day(10) sebagai tahun(-29) + 30? tidak
                                    // 
                                    // Coba ekstrak dengan asumsi Sheets format regional DD/MM/YY:
                                    // Original 12-11-29 (DD-MM-YY) -> Sheets interpret sebagai date
                                    // Mungkin bulan dan hari ter-swap?
                                    // 2029-12-10: bulan 12 seharusnya 11, hari 10 seharusnya 12?
                                    // Berarti swap MM dan DD: 10-12-29 -> tapi ini juga salah
                                    //
                                    // Mari gunakan logic empiris dari data:
                                    // ISO 2029-12-10 harus menjadi 12-11-29
                                    // Dari 2029, 12, 10 -> 12, 11, 29
                                    // Pattern: day(dari original) = MM(12) dari ISO
                                    //          month(dari original) = MM-1(12-1=11) dari ISO
                                    //          year(dari original) = YY(29) dari year(2029)
                                    
                                    const yearLastTwoDigits = year % 100; // 29
                                    const monthFromISO = parseInt(month); // 12
                                    const dayFromISO = parseInt(day); // 10
                                    
                                    // Extract original dari ISO dengan swap-adjust:
                                    // day original = month dari ISO (12)
                                    // month original = month dari ISO - 1 (11)
                                    // year original = YY dari YYYY (29)
                                    
                                    const originalDay = monthFromISO;
                                    const originalMonth = monthFromISO - 1;
                                    const originalYear = yearLastTwoDigits;
                                    
                                    processedValue = `${String(originalDay).padStart(2, '0')}-${String(originalMonth).padStart(2, '0')}-${String(originalYear).padStart(2, '0')}`;
                                    
                                    Logger.log('Batas Usia Processing', 'Extracted with swap-adjust logic');
                                    Logger.log('Batas Usia Processing', 'Extracted values:', {originalDay, originalMonth, originalYear});
                                    Logger.log('Batas Usia Processing', 'Final format DD-MM-YY:', processedValue);
                                    Logger.log('Batas Usia Processing', 'Meaning:', `${originalDay} Tahun ${originalMonth} Bulan ${originalYear} Hari`);
                                }
                                // Cek apakah format YYYY-MM-DD (4 digit tahun di awal)
                                else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
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
                                // Format YY-MM-DD (sudah benar, hanya normalize)
                                else if (typeof value === 'string' && value.match(/^\d{1,2}-\d{1,2}-\d{1,2}$/)) {
                                    Logger.log('Batas Usia Processing', 'Detected: YY-MM-DD format (already correct)');
                                    const parts = value.split('-');
                                    const yy = String(parseInt(parts[0])).padStart(2, '0');
                                    const mm = String(parseInt(parts[1])).padStart(2, '0');
                                    const dd = String(parseInt(parts[2])).padStart(2, '0');
                                    processedValue = `${yy}-${mm}-${dd}`;
                                    Logger.log('Batas Usia Processing', 'Normalized YY-MM-DD to:', processedValue);
                                }
                                
                                value = processedValue;
                                Logger.log('Batas Usia Processing', 'FINAL VALUE:', value);
                                Logger.groupEnd();
                            }
                        }
                        
                        // Parse tanggal lahir fields
                        if (header.includes('Tanggal Lahir') || header.includes('Tgl Lahir')) {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Date: ${header} (row ${idx})`);
                                Logger.log('Date Processing', 'Original value:', value);
                                Logger.log('Date Processing', 'Value type:', typeof value);
                                
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
                        
                        // Handle Umur format
                        if (header.includes('Umur')) {
                            if (value && value !== '-' && value !== '') {
                                Logger.group(`Processing Age: ${header} (row ${idx})`);
                                Logger.log('Age Processing', 'Original value:', value);
                                Logger.log('Age Processing', 'Value type:', typeof value);
                                
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
                Logger.log('loadData', 'Sample data (first row):', allData[0]);
                
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
    Logger.log('compareAge', 'Max allowed:', {maxYears, maxMonths, maxDays});
    
    const ageParts = personAgeStr.split('-');
    if (ageParts.length !== 3) {
        Logger.log('compareAge', 'Invalid age format for comparison');
        return { isValid: true, message: '' };
    }
    
    const personYears = parseInt(ageParts[0]) || 0;
    const personMonths = parseInt(ageParts[1]) || 0;
    const personDays = parseInt(ageParts[2]) || 0;
    
    Logger.log('compareAge', 'Parsed person age:', {personYears, personMonths, personDays});
    
    // Konversi ke hari untuk perbandingan akurat
    const personTotalDays = (personYears * 365) + (personMonths * 30.44) + personDays;
    const maxTotalDays = (maxYears * 365) + (maxMonths * 30.44) + maxDays;
    
    Logger.log('compareAge', 'Person total days:', personTotalDays);
    Logger.log('compareAge', 'Max total days:', maxTotalDays);
    
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
    console.log('VALIDATION: Max age str:', maxAgeStr); // Debugging
    
    if (!maxAgeStr || maxAgeStr === '-') {
        Logger.log('validateAgeRestriction', 'No max age found');
        console.log('VALIDATION: No max age'); // Debugging
        return { isValid: true, message: '' };
    }
    
    // Parse max age dari format "YY-MM-DD"
    const maxAgeParts = maxAgeStr.split('-');
    console.log('VALIDATION: Max age parts:', maxAgeParts); // Debugging
    
    if (maxAgeParts.length !== 3) {
        Logger.log('validateAgeRestriction', 'Invalid max age format:', maxAgeStr);
        console.log('VALIDATION: Invalid format'); // Debugging
        return { isValid: true, message: '' };
    }
    
    let maxAgeYears = parseInt(maxAgeParts[0]) || 0;
    let maxAgeMonths = parseInt(maxAgeParts[1]) || 0;
    let maxAgeDays = parseInt(maxAgeParts[2]) || 0;
    
    Logger.log('validateAgeRestriction', 'Parsed max age:', {maxAgeYears, maxAgeMonths, maxAgeDays});
    console.log('VALIDATION: Parsed max age:', {maxAgeYears, maxAgeMonths, maxAgeDays}); // Debugging
    
    // Cek peserta utama
    const personalAge = currentRowData['Umur'] || '';
    Logger.log('validateAgeRestriction', 'Personal age:', personalAge);
    console.log('VALIDATION: Personal age:', personalAge); // Debugging
    
    if (personalAge && personalAge !== '-') {
        const validation = compareAge(personalAge, maxAgeYears, maxAgeMonths, maxAgeDays, 'Peserta Utama');
        console.log('VALIDATION: Personal validation result:', validation); // Debugging
        if (!validation.isValid) {
            Logger.log('validateAgeRestriction', 'Personal validation FAILED');
            console.log('VALIDATION: Personal FAILED'); // Debugging
            return validation;
        }
    }
    
    // Cek anggota tim jika ada
    for (let i = 1; i <= 3; i++) {
        const memberAge = currentRowData[`Anggota Tim #${i} - Umur`] || '';
        const memberName = currentRowData[`Anggota Tim #${i} - Nama`] || '-';
        
        Logger.log('validateAgeRestriction', `Member ${i} age:`, memberAge, 'Name:', memberName);
        console.log(`VALIDATION: Member ${i} age:`, memberAge, 'Name:', memberName); // Debugging
        
        if (memberAge && memberAge !== '-' && memberName !== '-') {
            const validation = compareAge(memberAge, maxAgeYears, maxAgeMonths, maxAgeDays, `Anggota Tim #${i}`);
            console.log(`VALIDATION: Member ${i} result:`, validation); // Debugging
            if (!validation.isValid) {
                Logger.log('validateAgeRestriction', `Member ${i} validation FAILED`);
                console.log(`VALIDATION: Member ${i} FAILED`); // Debugging
                return validation;
            }
        }
    }
    
    Logger.log('validateAgeRestriction', '=== ALL VALIDATION PASSED ===');
    console.log('VALIDATION: ALL PASSED'); // Debugging
    return { isValid: true, message: '' };
}

function formatDate(dateStr) {
    Logger.log('formatDate', 'Input:', dateStr);
    
    if (!dateStr || dateStr === '-') {
        Logger.log('formatDate', 'Output: -');
        return '-';
    }
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            Logger.log('formatDate', 'Invalid date, returning original:', dateStr);
            return dateStr;
        }
        
        // Adjustment untuk timezone Sheets
        const adjusted = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        
        const day = String(adjusted.getUTCDate()).padStart(2, '0');
        const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
        const year = adjusted.getUTCFullYear();
        const result = `${day}-${month}-${year}`;
        
        Logger.log('formatDate', 'Output:', result);
        return result;
    } catch (e) {
        Logger.log('formatDate', 'Error:', e.message);
        return dateStr;
    }
}

function toDateInputValue(dateStr) {
    Logger.log('toDateInputValue', 'Input:', dateStr);
    
    if (!dateStr || dateStr === '-') {
        Logger.log('toDateInputValue', 'Output: empty');
        return '';
    }
    
    try {
        let date;
        if (dateStr instanceof Date) {
            date = dateStr;
            Logger.log('toDateInputValue', 'Input is Date object');
        } else {
            date = new Date(dateStr);
            Logger.log('toDateInputValue', 'Parsed as Date');
        }
        
        if (isNaN(date.getTime())) {
            Logger.log('toDateInputValue', 'Invalid date, returning empty');
            return '';
        }
        
        // Adjustment untuk timezone Sheets
        const adjusted = new Date(date.getTime() + (7 * 60 * 60 * 1000));
        
        const year = adjusted.getUTCFullYear();
        const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
        const day = String(adjusted.getUTCDate()).padStart(2, '0');
        const result = `${year}-${month}-${day}`;
        
        Logger.log('toDateInputValue', 'Output:', result);
        return result;
    } catch (e) {
        Logger.log('toDateInputValue', 'Error:', e.message);
        console.error('Error converting date:', e);
        return '';
    }
}

function formatAge(ageStr) {
    Logger.log('formatAge', 'Input:', ageStr);
    Logger.log('formatAge', 'Input type:', typeof ageStr);
    
    if (!ageStr || ageStr === '-') {
        Logger.log('formatAge', 'Output: -');
        return '-';
    }
    
    const strAge = String(ageStr).trim();
    Logger.log('formatAge', 'String value:', strAge);
    
    const parts = strAge.split('-');
    Logger.log('formatAge', 'Parts:', parts);
    
    if (parts.length === 3) {
        const years = parseInt(parts[0]) || 0;
        const months = parseInt(parts[1]) || 0;
        const days = parseInt(parts[2]) || 0;
        
        Logger.log('formatAge', 'Parsed values:', {years, months, days});
        
        const result = `${years} Tahun ${months} Bulan ${days} Hari`;
        Logger.log('formatAge', 'Output:', result);
        return result;
    }
    
    Logger.log('formatAge', 'Not in expected format, returning original');
    return ageStr;
}

function calculateAge(birthDateStr) {
    Logger.log('calculateAge', 'Input:', birthDateStr);
    Logger.log('calculateAge', 'Input type:', typeof birthDateStr);
    
    if (!birthDateStr || birthDateStr === '-') {
        Logger.log('calculateAge', 'Output: -');
        return '-';
    }
    
    try {
        let birthDate;
        
        if (birthDateStr instanceof Date) {
            birthDate = birthDateStr;
            Logger.log('calculateAge', 'Input is Date object');
        } else {
            birthDate = new Date(birthDateStr);
            Logger.log('calculateAge', 'Parsed as Date:', birthDate);
        }
        
        if (isNaN(birthDate.getTime())) {
            Logger.log('calculateAge', 'Invalid date, returning -');
            return '-';
        }
        
        // Adjustment untuk timezone Sheets (+7 jam)
        const adjusted = new Date(birthDate.getTime() + (7 * 60 * 60 * 1000));
        const adjustedRef = new Date(REFERENCE_DATE.getTime() + (7 * 60 * 60 * 1000));
        
        let years = adjustedRef.getUTCFullYear() - adjusted.getUTCFullYear();
        let months = adjustedRef.getUTCMonth() - adjusted.getUTCMonth();
        let days = adjustedRef.getUTCDate() - adjusted.getUTCDate();
        
        Logger.log('calculateAge', 'Initial calculation:', {years, months, days});
        
        if (days < 0) {
            months--;
            const lastMonth = new Date(adjustedRef.getUTCFullYear(), adjustedRef.getUTCMonth(), 0);
            days += lastMonth.getUTCDate();
        }
        
        if (months < 0) {
            years--;
            months += 12;
        }
        
        Logger.log('calculateAge', 'Final calculation:', {years, months, days});
        
        const result = `${String(years).padStart(2, '0')}-${String(months).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
        Logger.log('calculateAge', 'Output:', result);
        return result;
    } catch (e) {
        Logger.log('calculateAge', 'Error:', e.message);
        console.error('Error calculating age:', e);
        return '-';
    }
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    filteredData.sort((a, b) => {
        let valA = a[column] || '';
        let valB = b[column] || '';
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

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
                    <button class="btn-sm btn-danger" onclick="confirmDelete(${idx})">Hapus</button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function updateStats() {
    const statsRow = document.getElementById('statsRow');
    const total = allData.length;
    const pending = allData.filter(r => r['Status'] === 'Menunggu Verifikasi').length;
    const verified = allData.filter(r => r['Status'] === 'Terverifikasi').length;
    const rejected = allData.filter(r => r['Status'] === 'Ditolak').length;

    statsRow.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total Peserta</div>
        </div>
        <div class="stat-card" style="border-top-color: var(--warning);">
            <div class="stat-value" style="color: var(--warning);">${pending}</div>
            <div class="stat-label">Menunggu Verifikasi</div>
        </div>
        <div class="stat-card" style="border-top-color: var(--success);">
            <div class="stat-value" style="color: var(--success);">${verified}</div>
            <div class="stat-label">Terverifikasi</div>
        </div>
        <div class="stat-card" style="border-top-color: var(--danger);">
            <div class="stat-value" style="color: var(--danger);">${rejected}</div>
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
    Logger.log('viewDetail', 'Umur value:', currentRowData['Umur']);
    Logger.log('viewDetail', 'Tanggal Lahir value:', currentRowData['Tanggal Lahir']);
    
    renderDetailView();
    document.getElementById('detailModal').classList.add('show');
}

function renderDetailView() {
    const detailContent = document.getElementById('detailContent');
    const detailFooter = document.getElementById('detailFooter');

    if (isEditMode) {
        detailContent.classList.add('edit-mode');
        detailFooter.innerHTML = `
            <button class="btn-secondary" onclick="cancelEdit()">Batal</button>
            <button class="btn-success" id="saveButton" onclick="saveEdit()">💾 Simpan Perubahan</button>
        `;
    } else {
        detailContent.classList.remove('edit-mode');
        detailFooter.innerHTML = `
            <button class="btn-secondary" onclick="closeDetailModal()">Tutup</button>
            <button class="btn-primary" onclick="toggleEditMode()">Edit</button>
            <button class="btn-danger" onclick="confirmDelete()">Hapus</button>
        `;
    }

    // Ambil info batas umur untuk ditampilkan
    // PENTING: Pastikan ambil dari allData yang sudah ter-parse
    let maxAgeStr = '-';
    
    // currentRowData sudah adalah copy dari filteredData[idx]
    // Tapi kami perlu ambil dari allData untuk nilai yang sudah ter-parse
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
                <span class="detail-value" style="background: #e3f2fd; border-color: #2196f3; font-weight: 600;">${maxAgeDisplay}</span>
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
            <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
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
        document.querySelectorAll('.file-input').forEach(input => {
            input.addEventListener('change', handleFileChange);
        });

        // Attach date change listeners untuk auto-calculate age
        document.querySelectorAll('.date-text-input').forEach(input => {
            input.addEventListener('change', function(e) {
                const dateValue = e.target.value;
                const memberNum = e.target.getAttribute('data-member');
                
                if (!dateValue || dateValue === '-' || dateValue === '') return;
                
                Logger.log('renderDetailView', 'Date changed for member:', memberNum, 'Value:', dateValue);
                
                // Calculate age
                const newAge = calculateAge(dateValue);
                Logger.log('renderDetailView', 'Calculated age:', newAge);
                
                // Update currentRowData
                if (memberNum) {
                    const umurField = `Anggota Tim #${memberNum} - Umur`;
                    currentRowData[umurField] = newAge;
                } else {
                    currentRowData['Umur'] = newAge;
                }
                
                // Update display dan input fields
                updateAgeDisplay(memberNum, newAge);
                
                // Validasi umur setelah perubahan
                setTimeout(() => {
                    performAgeValidation();
                }, 100);
            });
        });

        // Initial validation
        Logger.log('renderDetailView', 'Performing initial age validation');
        performAgeValidation();
    }
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
    let html = memberNum ? '' : `<div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #e0e0e0;"><h4 style="color: var(--primary); margin-bottom: 15px;">${prefix}</h4>`;
    
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
        <div style="margin-top: 25px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
            <h4 style="color: var(--primary); margin-bottom: 15px;">${title}</h4>
            <div class="file-preview">
    `;
    
    docKeys.forEach((key, idx) => {
        const hasFile = currentRowData[key] && currentRowData[key].trim();
        html += `
            <div style="margin-bottom: 15px; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
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
    return `
        <select class="edit-select" data-field="Status">
            <option value="Menunggu Verifikasi" ${currentStatus === 'Menunggu Verifikasi' ? 'selected' : ''}>Menunggu Verifikasi</option>
            <option value="Terverifikasi" ${currentStatus === 'Terverifikasi' ? 'selected' : ''}>Terverifikasi</option>
            <option value="Ditolak" ${currentStatus === 'Ditolak' ? 'selected' : ''}>Ditolak</option>
        </select>
    `;
}

function handleFileChange(e) {
    const field = e.target.getAttribute('data-field');
    const file = e.target.files[0];
    if (file) {
        filesToUpload[field] = file;
        console.log('File akan diupload:', field, file.name);
    }
}

function toggleEditMode() {
    isEditMode = true;
    filesToUpload = {};
    renderDetailView();
}

function cancelEdit() {
    isEditMode = false;
    filesToUpload = {};
    currentRowData = JSON.parse(JSON.stringify(filteredData.find(r => r.rowIndex === currentRowData.rowIndex)));
    renderDetailView();
}

async function saveEdit() {
    if (!confirm('Apakah Anda yakin ingin menyimpan perubahan?')) {
        return;
    }

    showLoading('Menyimpan perubahan...', true);
    
    try {
        const inputs = document.querySelectorAll('.edit-input:not([readonly]), .edit-textarea, .edit-select');
        const updatedData = {};
        
        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            updatedData[field] = input.value;
            currentRowData[field] = input.value;
        });

        const originalIndex = allData.findIndex(row => row.rowIndex === currentRowData.rowIndex);
        if (originalIndex !== -1) {
            Object.assign(allData[originalIndex], updatedData);
        }

        if (Object.keys(filesToUpload).length > 0) {
            hideLoading(true);
            showLoading(`Mengupload ${Object.keys(filesToUpload).length} file...`, true);
            const uploadResult = await uploadFiles();
            if (uploadResult.success) {
                Object.assign(updatedData, uploadResult.fileLinks);
                Object.assign(currentRowData, uploadResult.fileLinks);
                hideLoading(true);
                showAlert('File berhasil diupload', 'success', true);
            } else {
                hideLoading(true);
                showAlert('Gagal mengupload file: ' + uploadResult.message, 'error', true);
                return;
            }
        }

        hideLoading(true);
        showLoading('Memperbarui data di spreadsheet...', true);
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

        if (result.success) {
            showAlert('✓ Data berhasil diperbarui!', 'success', true);
            isEditMode = false;
            filesToUpload = {};
            renderDetailView();
            renderTable();
            updateStats();
        } else {
            showAlert('Gagal memperbarui data: ' + result.message, 'error', true);
        }
    } catch (error) {
        hideLoading(true);
        console.error('Error updating data:', error);
        showAlert('Error: ' + error.message, 'error', true);
    }
}

function showAgeValidationError(message) {
    const container = document.getElementById('modalAlertContainer');
    
    // Hapus alert sebelumnya
    const existingAlert = container.querySelector('.alert-age-error');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // Buat alert baru
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
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
    })
    .then(response => response.json())
    .then(result => {
        hideLoading(isModal);
        
        if (result.success) {
            const allIdx = allData.findIndex(row => row.rowIndex === rowToDelete.rowIndex);
            if (allIdx > -1) {
                allData.splice(allIdx, 1);
            }
            
            const filteredIdx = filteredData.findIndex(row => row.rowIndex === rowToDelete.rowIndex);
            if (filteredIdx > -1) {
                filteredData.splice(filteredIdx, 1);
            }
            
            showAlert('✓ Data peserta berhasil dihapus!', 'success', isModal);
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

function updateSaveButtonState(isDisabled) {
    const saveButton = document.querySelector('button.btn-success');
    if (saveButton) {
        if (isDisabled) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.5';
            saveButton.style.cursor = 'not-allowed';
        } else {
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
            saveButton.style.cursor = 'pointer';
        }
    }
}

function attachAgeValidationListeners() {
    // Validasi saat ada perubahan pada field tanggal lahir
    const dateInputs = document.querySelectorAll('.date-text-input');
    dateInputs.forEach(input => {
        input.addEventListener('change', function() {
            setTimeout(() => {
                const validation = validateAgeRestriction();
                if (!validation.isValid) {
                    showAgeValidationError(validation.message);
                    updateSaveButtonState(true);
                } else {
                    clearAgeValidationError();
                    updateSaveButtonState(false);
                }
            }, 500); // Delay untuk memastikan umur sudah ter-update
        });
    });
}