import logger from './logger.js';
import {
    CONFIG
} from './config.js';
import {
    Validator
} from './validator.js';
import {
    FileHandler
} from './fileHandler.js';
import {
    APIService
} from './apiService.js';
import {
    UIManager
} from './uiManager.js';
export class EditManager {
    constructor() {
        this.fileHandler = new FileHandler();
        this.apiService = new APIService();
        this.uiManager = new UIManager();
        this.pesertaData = null;
        logger.log('📝 EditManager initialized');
    }

    // ===== GET NOMOR PESERTA FROM URL =====
    getNomorPesertaFromURL() {
        // Try to get from hash first (for edit.html#xxx format)
        let encodedPart = window.location.hash.replace('#', '').trim(); // If no hash, try from pathname (for 404.html with /xxx format)
        if (!encodedPart) {
            const path = window.location.pathname;
            const segments = path.split('/').filter(s => s);
            encodedPart = segments[segments.length - 1];
            if (!encodedPart || encodedPart.includes('.html')) {
                logger.error('No valid encoded part found in URL');
                return null;
            }
        }
        try {
            logger.log('Encoded part:', encodedPart);
            const decoded = atob(encodedPart);
            logger.log('Decoded string:', decoded);
            if (decoded.startsWith('peserta-')) {
                const nomorPeserta = decoded.replace('peserta-', '');
                logger.log('Nomor peserta extracted:', nomorPeserta);
                return nomorPeserta;
            }
            logger.error('Invalid format: does not start with "peserta-"');
            return null;
        } catch (e) {
            logger.error('Decode error:', e);
            return null;
        }
    }

    // ===== LOAD PESERTA DATA =====
    async loadPesertaData(nomorPeserta) {
        try {
            logger.log('Loading data for:', nomorPeserta);
            const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getData`);
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Gagal mengambil data');
            }
            const nomorPesertaIdx = result.headers.indexOf('Nomor Peserta');
            if (nomorPesertaIdx === -1) {
                throw new Error('Header tidak valid');
            }
            let foundRow = null;
            let foundIndex = -1;
            for (let i = 0; i < result.data.length; i++) {
                const rowNomorPeserta = result.data[i][nomorPesertaIdx]?.toString().trim();
                if (rowNomorPeserta === nomorPeserta.trim()) {
                    foundRow = result.data[i];
                    foundIndex = i;
                    break;
                }
            }
            if (!foundRow) {
                throw new Error('Nomor peserta tidak ditemukan');
            }
            this.pesertaData = {
                rowIndex: foundIndex,
                headers: result.headers,
                data: foundRow,
                nomorPeserta: nomorPeserta
            };
            logger.log('Data loaded:', this.pesertaData);
            return this.pesertaData;
        } catch (error) {
            logger.error('Error loading data:', error);
            throw error;
        }
    }

    // ===== RENDER FORM =====
    renderForm() {
        const data = this.pesertaData.data;
        const headers = this.pesertaData.headers;
        const cabangIdx = headers.indexOf('Cabang Lomba');
        const kecamatanIdx = headers.indexOf('Kecamatan');
        const statusIdx = headers.indexOf('Status');
        const namaReguIdx = headers.indexOf('Nama Regu/Tim');
        document.getElementById('infoNomorPeserta').textContent = this.pesertaData.nomorPeserta;
        document.getElementById('infoCabang').textContent = data[cabangIdx] || '-';
        document.getElementById('infoKecamatan').textContent = data[kecamatanIdx] || '-';
        document.getElementById('infoStatus').textContent = data[statusIdx] || 'Menunggu Verifikasi';
        document.getElementById('nomorPeserta').value = this.pesertaData.nomorPeserta;
        document.getElementById('rowIndex').value = this.pesertaData.rowIndex;
        const namaRegu = data[namaReguIdx];
        const isTeam = namaRegu && namaRegu !== '-' && namaRegu.trim() !== '';
        document.getElementById('isTeam').value = isTeam ? 'true' : 'false';
        const formContent = document.getElementById('formContent');
        if (isTeam) {
            formContent.innerHTML = this.renderTeamForm();
            this.populateTeamData();
        } else {
            formContent.innerHTML = this.renderPersonalForm();
            this.populatePersonalData();
        }
        this.setupFileInputs();
        this.setupNIKValidation();
        setTimeout(() => {
            this.validateFormAndUpdateButton();
        }, 100);
    }

    // ===== RENDER PERSONAL FORM =====
    renderPersonalForm() {
        return `
        <h3 class="section-title">📝 Data Pribadi</h3>        <div class="form-row">
            <div class="form-group">
                <label>NIK *</label>
                <input type="text" name="nik" id="nik" maxlength="16" pattern="[0-9]{16}" inputmode="numeric" required>
                <small style="font-size: 0.85em; color: #666; display: block; margin-top: 5px;">Masukkan 16 digit NIK tanpa spasi</small>
            </div>
            <div class="form-group">
                <label>Nama Lengkap *</label>
                <input type="text" name="nama" id="nama" required>
            </div>
        </div>        <h3 class="section-title" style="margin-top: 40px;">📄 Dokumen Persyaratan</h3>        ${this.renderPersonalFileInputs()}
    `;
    }
    renderPersonalFileInputs() {
        const docs = [{
                num: 1,
                name: 'Surat Mandat',
                desc: 'Ditandatangani oleh Ketua LPTQ Kecamatan'
            },
            {
                num: 2,
                name: 'KTP/KK/KIA',
                desc: 'Diterbitkan maksimal 6 bulan sebelum 1 Nov 2025'
            },
            {
                num: 3,
                name: 'Sertifikat Kejuaraan',
                desc: 'Dari MTQ Tingkat Kecamatan (Opsional)'
            },
            {
                num: 4,
                name: 'Foto Buku Tabungan',
                desc: 'Menunjukkan nomor rekening (Opsional)'
            },
            {
                num: 5,
                name: 'Pas Photo Terbaru',
                desc: 'Latar belakang biru'
            }
        ];
        return docs.map(doc => `
        <div class="file-upload-group">
            <label>${doc.num}. ${doc.name}</label>
            <small>${doc.desc}</small>
            <div id="currentDoc${doc.num}"></div>
            <div class="file-upload-controls">
                <label for="doc${doc.num}" class="btn-file">📁 Pilih File Baru</label>
                <button type="button" class="btn-clear" id="clearDoc${doc.num}" style="display: none;">🗑️ Hapus</button>
            </div>
            <input type="file" id="doc${doc.num}" name="doc${doc.num}" accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
            <span class="file-name" id="doc${doc.num}Name">Belum ada file baru</span>
        </div>
    `).join('');
    }

    // ===== RENDER TEAM FORM =====
    renderTeamForm() {
        return `
        <h3 class="section-title">👥 Data Tim/Regu</h3>        <div class="form-group">
            <label>Nama Regu/Tim *</label>
            <input type="text" name="namaRegu" id="namaRegu" required>
        </div>        ${this.renderTeamMember(1)}
        ${this.renderTeamMember(2)}
        ${this.renderTeamMember(3)}
    `;
    }
    renderTeamMember(num) {
        const isOptional = num === 3;
        return `
        <div class="member-section">
            <h4>Anggota Tim #${num}</h4>            <div class="form-row">
                <div class="form-group">
                    <label>NIK ${isOptional ? '' : '*'}</label>
                    <input type="text" name="memberNik${num}" id="memberNik${num}" maxlength="16" pattern="[0-9]{16}" inputmode="numeric" placeholder="NIK (16 digit)" ${isOptional ? '' : 'required'}>
                    <small style="font-size: 0.85em; color: #666; display: block; margin-top: 5px;">Hanya angka, tanpa spasi (16 digit)</small>
                </div>
                <div class="form-group">
                    <label>Nama Lengkap ${num <= 2 ? '*' : ''}</label>
                    <input type="text" name="memberName${num}" id="memberName${num}" ${num <= 2 ? 'required' : ''}>
                </div>
            </div>            <h4 style="margin-top: 25px;">📄 Dokumen Anggota #${num}</h4>
            ${this.renderTeamMemberFileInputs(num)}
        </div>
    `;
    }
    renderTeamMemberFileInputs(memberNum) {
        const docs = [{
                num: 1,
                name: 'Surat Mandat',
                desc: 'Ditandatangani oleh Ketua LPTQ Kecamatan'
            },
            {
                num: 2,
                name: 'KTP/KK/KIA',
                desc: 'Diterbitkan maksimal 6 bulan sebelum 1 Nov 2025'
            },
            {
                num: 3,
                name: 'Sertifikat Kejuaraan',
                desc: 'Dari MTQ Tingkat Kecamatan (Opsional)'
            },
            {
                num: 4,
                name: 'Foto Buku Tabungan',
                desc: 'Menunjukkan nomor rekening (Opsional)'
            },
            {
                num: 5,
                name: 'Pas Photo Terbaru',
                desc: 'Latar belakang biru'
            }
        ];
        return docs.map(doc => `
        <div class="file-upload-group">
            <label>${doc.num}. ${doc.name}</label>
            <small>${doc.desc}</small>
            <div id="currentTeamDoc${memberNum}_${doc.num}"></div>
            <div class="file-upload-controls">
                <label for="teamDoc${memberNum}_${doc.num}" class="btn-file">📁 Pilih File Baru</label>
                <button type="button" class="btn-clear" id="clearTeamDoc${memberNum}_${doc.num}" style="display: none;">🗑️ Hapus</button>
            </div>
            <input type="file" id="teamDoc${memberNum}_${doc.num}" name="teamDoc${memberNum}_${doc.num}" accept=".pdf,.jpg,.jpeg,.png" style="display: none;">
            <span class="file-name" id="teamDoc${memberNum}_${doc.num}Name">Belum ada file baru</span>
        </div>
    `).join('');
    }

    // ===== POPULATE DATA =====
    populatePersonalData() {
        const data = this.pesertaData.data;
        const headers = this.pesertaData.headers;
        const getValue = (headerName) => {
            const idx = headers.indexOf(headerName);
            return idx !== -1 ? (data[idx] || '') : '';
        };
        document.getElementById('nik').value = getValue('NIK');
        document.getElementById('nama').value = getValue('Nama Lengkap');
        for (let i = 1; i <= 5; i++) {
            const fileLink = getValue(`Link - Doc ${this.getDocName(i)} Personal`);
            if (fileLink && fileLink !== '-' && fileLink.trim() !== '') {
                this.showCurrentFile(`currentDoc${i}`, fileLink);
            }
        }
    }
    populateTeamData() {
        const data = this.pesertaData.data;
        const headers = this.pesertaData.headers;
        const getValue = (headerName) => {
            const idx = headers.indexOf(headerName);
            return idx !== -1 ? (data[idx] || '') : '';
        };
        document.getElementById('namaRegu').value = getValue('Nama Regu/Tim');
        for (let i = 1; i <= 3; i++) {
            const nikEl = document.getElementById(`memberNik${i}`);
            const nameEl = document.getElementById(`memberName${i}`);
            if (nikEl) {
                nikEl.value = getValue(`Anggota Tim #${i} - NIK`);
            }
            if (nameEl) nameEl.value = getValue(`Anggota Tim #${i} - Nama`);
            for (let d = 1; d <= 5; d++) {
                const fileLink = getValue(`Link - Doc ${this.getDocName(d)} Team ${i}`);
                if (fileLink && fileLink !== '-' && fileLink.trim() !== '') {
                    this.showCurrentFile(`currentTeamDoc${i}_${d}`, fileLink);
                }
            }
        }
    }
    getDocName(num) {
        const names = {
            1: 'Surat Mandat',
            2: 'KTP',
            3: 'Sertifikat',
            4: 'Rekening',
            5: 'Pas Photo'
        };
        return names[num] || '';
    }
    showCurrentFile(containerId, fileLink) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
            <div class="current-file">
                <div class="current-file-label">📎 File saat ini:</div>
                <a href="${fileLink}" target="_blank" class="current-file-link">Lihat Dokumen</a>
            </div>
        `;
        }
    }

    // ===== SETUP FILE INPUTS =====
    setupFileInputs() {
        const isTeam = document.getElementById('isTeam').value === 'true';
        if (isTeam) {
            for (let i = 1; i <= 3; i++) {
                for (let d = 1; d <= 5; d++) {
                    this.fileHandler.setupFileInput(`teamDoc${i}_${d}`, `clearTeamDoc${i}_${d}`);
                }
            }
        } else {
            for (let i = 1; i <= 5; i++) {
                this.fileHandler.setupFileInput(`doc${i}`, `clearDoc${i}`);
            }
        }
    }

    // ===== NIK VALIDATION =====
    setupNIKValidation() {
        const isTeam = document.getElementById('isTeam').value === 'true';
        if (isTeam) {
            for (let i = 1; i <= 3; i++) {
                const nikInput = document.getElementById(`memberNik${i}`);
                if (nikInput) {
                    nikInput.addEventListener('input', function() {
                        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
                    });
                    nikInput.addEventListener('change', () => this.validateFormAndUpdateButton());
                }
            }
        } else {
            const nikInput = document.getElementById('nik');
            if (nikInput) {
                nikInput.addEventListener('input', function() {
                    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
                });
                nikInput.addEventListener('change', () => this.validateFormAndUpdateButton());
            }
        }
    }
    validateFormAndUpdateButton() {
        const submitBtn = document.getElementById('submitBtn');
        const nikErrors = this.validateAllNIKs();
        const existingError = document.getElementById('nikValidationError');
        if (existingError) existingError.remove();
        if (nikErrors.length > 0) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';
            const statusDiv = document.createElement('div');
            statusDiv.id = 'nikValidationError';
            statusDiv.style.cssText = 'background: #ffe7e7; color: #c82333; padding: 15px; border-radius: 10px; margin: 15px 0; border-left: 5px solid #dc2626;';
            statusDiv.innerHTML = '⚠️ ' + nikErrors.join('<br>⚠️ ');
            submitBtn.parentElement.insertBefore(statusDiv, submitBtn);
        } else {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
    }
    validateAllNIKs() {
        const isTeam = document.getElementById('isTeam').value === 'true';
        const errors = [];
        if (isTeam) {
            for (let i = 1; i <= 3; i++) {
                const nikInput = document.getElementById(`memberNik${i}`);
                if (nikInput && nikInput.value) {
                    const validation = Validator.validateNIKLength(nikInput.value);
                    if (!validation.isValid) {
                        errors.push(`Anggota #${i}: ${validation.message}`);
                    }
                }
            }
        } else {
            const nikInput = document.getElementById('nik');
            if (nikInput && nikInput.value) {
                const validation = Validator.validateNIKLength(nikInput.value);
                if (!validation.isValid) {
                    errors.push(validation.message);
                }
            }
        }
        return errors;
    }

    // ===== FORM SUBMISSION =====
    async handleFormSubmit(e) {
        e.preventDefault();
        const nikErrors = this.validateAllNIKs();
        if (nikErrors.length > 0) {
            this.uiManager.showResultModal(false, 'Validasi Gagal', nikErrors.join('\n'));
            return;
        }
        try {
            this.uiManager.showLoadingOverlay(true, 'Menyimpan perubahan...');
            const formData = new FormData();
            formData.append('action', 'updateRow');
            formData.append('rowIndex', this.pesertaData.rowIndex);
            formData.append('nomorPeserta', this.pesertaData.nomorPeserta);
            const updatedData = {};
            const isTeam = document.getElementById('isTeam').value === 'true';
            if (isTeam) {
                updatedData['Nama Regu/Tim'] = document.getElementById('namaRegu').value;
                for (let i = 1; i <= 3; i++) {
                    const nik = document.getElementById(`memberNik${i}`)?.value;
                    if (nik) {
                        updatedData[`Anggota Tim #${i} - NIK`] = nik;
                        updatedData[`Anggota Tim #${i} - Nama`] = document.getElementById(`memberName${i}`).value;
                    }
                }
            } else {
                updatedData['NIK'] = document.getElementById('nik').value;
                updatedData['Nama Lengkap'] = document.getElementById('nama').value;
            }
            formData.append('updatedData', JSON.stringify(updatedData));
            logger.log('Sending data update...');
            const dataResponse = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                body: formData
            });
            const dataResult = await dataResponse.json();
            if (!dataResult.success) {
                throw new Error(dataResult.message || 'Gagal menyimpan data');
            } // Upload files if any
            const uploadedFiles = this.fileHandler.getAllFiles();
            if (Object.keys(uploadedFiles).length > 0) {
                this.uiManager.showLoadingOverlay(true, 'Mengupload dokumen...');
                const fileFormData = new FormData();
                fileFormData.append('action', 'uploadFiles');
                fileFormData.append('nomorPeserta', this.pesertaData.nomorPeserta);
                for (let key in uploadedFiles) {
                    const file = uploadedFiles[key];
                    const base64 = await this.fileHandler.fileToBase64(file);
                    fileFormData.append(key, base64);
                    fileFormData.append(key + '_name', file.name);
                    fileFormData.append(key + '_type', file.type);
                }
                logger.log('Uploading files...');
                const fileResponse = await fetch(CONFIG.APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: fileFormData
                });
                const fileResult = await fileResponse.json();
                if (!fileResult.success) {
                    logger.error('File upload warning:', fileResult.message);
                }
            }
            this.uiManager.showLoadingOverlay(false);
            this.uiManager.showResultModal(true, 'Berhasil!', 'Perubahan data telah disimpan.');
        } catch (error) {
            logger.error('Submit error:', error);
            this.uiManager.showLoadingOverlay(false);
            this.uiManager.showResultModal(false, 'Kesalahan', error.message || 'Terjadi kesalahan saat menyimpan data.');
        }
    }

    // ===== SHOW STATES =====
    showLoadingState() {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('contentState').style.display = 'none';
    }
    showErrorState(message) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
        document.getElementById('contentState').style.display = 'none';
        document.getElementById('errorMessage').textContent = message;
    }
    showContentState() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('contentState').style.display = 'block';
    }

    // ===== INIT =====
    async init() {
        try {
            const nomorPeserta = this.getNomorPesertaFromURL();
            if (!nomorPeserta) {
                throw new Error('URL tidak valid.');
            }
            logger.log('Nomor Peserta:', nomorPeserta);
            await this.loadPesertaData(nomorPeserta);
            this.showContentState();
            this.renderForm();
        } catch (error) {
            logger.error('Init error:', error);
            this.showErrorState(error.message);
        }
    }
}