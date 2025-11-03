import logger from './logger.js';
import { CONFIG, CABANG_DATA } from './config.js';
import progressTracker from './progressTracker.js';
import { Validator } from './validator.js';
import { FileHandler } from './fileHandler.js';
import { FormManager } from './formManager.js';
import { APIService } from './apiService.js';
import { UIManager } from './uiManager.js';
import { DataManager } from './dataManager.js';
import { RegistrationTimeManager } from './registrationTimeManager.js';

class MTQRegistrationApp {
    constructor() {
        // Initialize all managers
        this.fileHandler = new FileHandler();
        this.formManager = new FormManager(this.fileHandler);
        this.apiService = new APIService();
        this.uiManager = new UIManager();
        this.dataManager = new DataManager();
        this.timeManager = new RegistrationTimeManager();
        
        logger.log('🚀 MTQ Registration App initialized');
    }

    // ===== INITIALIZATION =====
    init() {
        logger.log('=== APP INITIALIZATION START ===');
        
        // Check registration time
        this.timeManager.checkRegistrationTime();
        setInterval(() => this.timeManager.checkRegistrationTime(), 60000);
        
        // Initialize rejected data tab
        this.timeManager.updateRejectedDataTabVisibility();
        setInterval(() => this.timeManager.updateRejectedDataTabVisibility(), 60000);
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize developer mode if enabled
        if (CONFIG.DEV_MODE.enabled) {
            this.initDeveloperMode();
        }
        
        logger.log('✅ APP INITIALIZATION COMPLETE');
    }

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        // Cabang change
        const cabangSelect = document.getElementById('cabang');
        if (cabangSelect) {
            cabangSelect.addEventListener('change', () => this.handleCabangChange());
        }

        // Kecamatan change
        const kecamatanSelect = document.getElementById('kecamatan');
        if (kecamatanSelect) {
            kecamatanSelect.addEventListener('change', () => this.updateSubmitButton());
        }

        // Personal form listeners
        this.setupPersonalFormListeners();

        // Form submission
        const registrationForm = document.getElementById('registrationForm');
        if (registrationForm) {
            registrationForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Search NIK
        const searchNIK = document.getElementById('searchNIK');
        if (searchNIK) {
            searchNIK.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearchNIK();
            });
            searchNIK.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
            });
        }

        logger.log('Event listeners setup complete');
    }

    setupPersonalFormListeners() {
        // NIK input
        const nikEl = document.getElementById('nik');
        if (nikEl) {
            nikEl.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
            });
            nikEl.addEventListener('change', () => this.updateSubmitButton());
        }

        // Tanggal lahir
        const tglLahirEl = document.getElementById('tglLahir');
        if (tglLahirEl) {
            tglLahirEl.addEventListener('change', () => {
                if (!tglLahirEl.value) return;
                
                const selectedDate = new Date(tglLahirEl.value);
                const today = new Date();
                
                if (selectedDate > today) {
                    tglLahirEl.value = '';
                    document.getElementById('umur').value = '';
                    this.uiManager.updateSubmitStatus('Tanggal lahir tidak boleh lebih dari hari ini', 'error');
                    return;
                }
                
                const ageObj = Validator.calculateAge(tglLahirEl.value);
                if (ageObj) {
                    document.getElementById('umur').value = Validator.formatAge(ageObj);
                }
                this.updateSubmitButton();
            });
        }

        // Gender select
        const jenisKelaminEl = document.getElementById('jenisKelamin');
        if (jenisKelaminEl) {
            jenisKelaminEl.addEventListener('change', () => this.updateSubmitButton());
        }

        // Other personal fields
        const personalFields = ['nama', 'tempatLahir', 'alamat', 'noTelepon', 'email', 'namaRek', 'noRek', 'namaBank'];
        personalFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.updateSubmitButton());
                el.addEventListener('change', () => this.updateSubmitButton());
            }
        });

        // Nama regu (for team)
        const namaReguEl = document.getElementById('namaRegu');
        if (namaReguEl) {
            namaReguEl.addEventListener('input', () => this.updateSubmitButton());
            namaReguEl.addEventListener('change', () => this.updateSubmitButton());
        }
    }

    // ===== CABANG CHANGE HANDLER =====
    handleCabangChange() {
        logger.log('=== CABANG CHANGE START ===');
        
        const selectedValue = document.getElementById('cabang').value;
        const data = CABANG_DATA[selectedValue];
        
        const wasTeam = this.formManager.getCurrentCabang() && this.formManager.isTeam();
        
        logger.log('Previous cabang:', wasTeam ? 'TEAM' : 'PERSONAL');
        logger.log('New cabang:', data ? (data.isTeam ? 'TEAM' : 'PERSONAL') : 'NONE');
        
        // Save data before switching
        if (this.formManager.getCurrentCabang()) {
            if (wasTeam) {
                logger.log('Saving TEAM data...');
                this.formManager.saveTeamData();
            } else {
                logger.log('Saving PERSONAL data...');
                this.formManager.savePersonalData();
            }
        }
        
        // Hide all sections
        document.getElementById('personalSection').style.display = 'none';
        document.getElementById('teamSection').style.display = 'none';
        document.getElementById('ageRequirement').style.display = 'none';
        document.getElementById('teamMembers').innerHTML = '';
        document.getElementById('personalDocs').innerHTML = '';
        
        if (!data) {
            logger.log('No cabang selected, clearing all');
            this.formManager.setCurrentCabang(null);
            document.getElementById('dataDiriSection').style.display = 'none';
            document.getElementById('rekeningPersonalSection').style.display = 'none';
            this.formManager.clearPersonalData();
            this.formManager.clearTeamData();
            this.updateSubmitButton();
            return;
        }
        
        this.formManager.setCurrentCabang(data);
        
        // Show age requirement
        this.displayAgeRequirement(data);
        
        if (data.isTeam) {
            this.switchToTeamForm(wasTeam);
        } else {
            this.switchToPersonalForm(wasTeam);
        }
        
        this.updateSubmitButton();
        logger.log('=== CABANG CHANGE COMPLETE ===');
    }

    displayAgeRequirement(data) {
        const ageTextParts = data.maxAge.split('-');
        const ageText = `${ageTextParts[0]} tahun ${ageTextParts[1]} bulan ${ageTextParts[2]} hari`;
        
        let ageRequirementText = `Batas usia maksimal: ${ageText} (per 1 November 2025)`;
        
        if (data.genderRestriction && data.genderRestriction !== 'any') {
            const genderText = data.genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
            ageRequirementText += `<br>Khusus peserta: ${genderText}`;
        }
        
        document.getElementById('ageRequirement').innerHTML = ageRequirementText;
        document.getElementById('ageRequirement').style.display = 'block';
    }

    switchToTeamForm(wasTeam) {
        logger.log('Switching to TEAM form');
        
        // Cleanup personal file inputs
        this.cleanupPersonalFileInputs();
        
        // Prepare team files if switching from personal
        if (wasTeam === false && this.formManager.savedPersonalData) {
            logger.log('Pre-copying PERSONAL files to TEAM format...');
            if (this.formManager.savedPersonalData.files) {
                for (let docKey in this.formManager.savedPersonalData.files) {
                    const docNum = docKey.replace('doc', '');
                    this.fileHandler.addFile(`teamDoc1_${docNum}`, this.formManager.savedPersonalData.files[docKey]);
                    logger.log(`Pre-copied: doc${docNum} -> teamDoc1_${docNum}`);
                }
            }
        }
        
        // Generate team form
        this.formManager.currentTeamMemberCount = 2;
        this.generateTeamForm(2);
        
        document.getElementById('teamSection').style.display = 'block';
        document.getElementById('dataDiriSection').style.display = 'none';
        document.getElementById('rekeningPersonalSection').style.display = 'none';
        
        // Cleanup team file inputs with uploaded files
        this.cleanupTeamFileInputsWithFiles();
        
        setTimeout(() => {
            if (wasTeam === false && this.formManager.savedPersonalData) {
                logger.log('Restoring PERSONAL data to TEAM member 1');
                this.formManager.restorePersonalToTeamMember1();
                this.formManager.clearPersonalData();
            } else if (this.formManager.savedTeamData && Object.keys(this.formManager.savedTeamData).length > 0) {
                logger.log('Restoring TEAM data');
                this.formManager.restoreTeamData();
            }
            this.updateSubmitButton();
        }, 100);
    }

    switchToPersonalForm(wasTeam) {
        logger.log('Switching to PERSONAL form');
        
        // Cleanup team file inputs
        this.cleanupTeamFileInputs();
        
        // Prepare personal files if switching from team
        if (wasTeam === true && this.formManager.savedTeamData && this.formManager.savedTeamData.members && this.formManager.savedTeamData.members[1]) {
            logger.log('Pre-copying TEAM member 1 files...');
            const member1 = this.formManager.savedTeamData.members[1];
            if (member1.files) {
                for (let d in member1.files) {
                    const docNum = d.replace('doc', '');
                    this.fileHandler.addFile(`doc${docNum}`, member1.files[d]);
                    logger.log(`Pre-copied: doc${docNum}`);
                }
            }
        }
        
        document.getElementById('dataDiriSection').style.display = 'block';
        document.getElementById('rekeningPersonalSection').style.display = 'block';
        this.generatePersonalDocsForm();
        document.getElementById('personalSection').style.display = 'block';
        
        // Cleanup personal file inputs with uploaded files
        this.cleanupPersonalFileInputsWithFiles();
        
        setTimeout(() => {
            if (wasTeam === true) {
                logger.log('Restoring TEAM member 1 data to PERSONAL');
                this.formManager.restoreTeamMember1ToPersonal();
                this.formManager.clearTeamData();
            } else if (this.formManager.savedPersonalData) {
                logger.log('Restoring PERSONAL data');
                this.formManager.restorePersonalData();
            }
            this.updateSubmitButton();
        }, 100);
    }

    cleanupPersonalFileInputs() {
        logger.log('Cleaning up personal file inputs...');
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput && personalInput.hasAttribute('required')) {
                personalInput.removeAttribute('required');
                logger.log(`Removed required from personalDoc${i}`);
            }
        }
    }

    cleanupTeamFileInputs() {
        logger.log('Cleaning up team file inputs...');
        for (let i = 1; i <= 3; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput && teamInput.hasAttribute('required')) {
                    teamInput.removeAttribute('required');
                    logger.log(`Removed required from teamDoc${i}_${d}`);
                }
            }
        }
    }

    cleanupPersonalFileInputsWithFiles() {
        logger.log('Removing required from personal file inputs with files...');
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput && this.fileHandler.getFile(`doc${i}`)) {
                if (personalInput.hasAttribute('required')) {
                    personalInput.removeAttribute('required');
                    logger.log(`Removed required from personalDoc${i} (file exists)`);
                }
            }
        }
    }

    cleanupTeamFileInputsWithFiles() {
        logger.log('Removing required from team file inputs with files...');
        for (let i = 1; i <= 2; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput && this.fileHandler.getFile(`teamDoc${i}_${d}`)) {
                    if (teamInput.hasAttribute('required')) {
                        teamInput.removeAttribute('required');
                        logger.log(`Removed required from teamDoc${i}_${d} (file exists)`);
                    }
                }
            }
        }
    }

    // ===== FORM GENERATION =====
    generatePersonalDocsForm() {
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
        
        // Setup file input listeners
        for (let i = 1; i <= 5; i++) {
            this.fileHandler.setupFileInput(`personalDoc${i}`, `clearPersonalDoc${i}`);
            const input = document.getElementById(`personalDoc${i}`);
            if (input) {
                input.addEventListener('change', () => {
                    setTimeout(() => this.updateSubmitButton(), 100);
                });
            }
        }
    }

    generateTeamForm(memberCount) {
        const container = document.getElementById('teamMembers');
        let html = `<p style="margin-bottom: 25px; color: #666; font-size: 0.95em; padding: 15px; background: #e6f3ff; border-radius: 10px;">
            Saat ini: ${memberCount} peserta ${memberCount < 3 ? '(klik tombol Tambah untuk menambah peserta ke-3)' : ''}
        </p>`;
        
        for (let i = 1; i <= memberCount; i++) {
            html += this.generateTeamMemberHTML(i);
        }
        
        html += `<div style="margin-top: 25px;">
            ${memberCount === 2 ? `<button type="button" onclick="window.mtqApp.addTeamMember()" style="background: linear-gradient(135deg, var(--secondary), #1e7e34); border: none; padding: 16px 35px; color: white; border-radius: 12px; font-weight: 700; cursor: pointer;">Tambah Peserta ke-3</button>` : ''}
            ${memberCount === 3 ? `<button type="button" onclick="window.mtqApp.removeTeamMember()" style="background: linear-gradient(135deg, var(--danger), #c82333); border: none; padding: 16px 35px; color: white; border-radius: 12px; font-weight: 700; cursor: pointer;">Hapus Peserta ke-3</button>` : ''}
        </div>`;
        
        container.innerHTML = html;
        this.setupTeamFormListeners(memberCount);
    }

    generateTeamMemberHTML(i) {
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

    setupTeamFormListeners(memberCount) {
        for (let i = 1; i <= memberCount; i++) {
            // File inputs
            for (let d = 1; d <= 5; d++) {
                this.fileHandler.setupFileInput(`teamDoc${i}_${d}`, `clearTeamDoc${i}_${d}`);
            }
            
            // NIK input
            const nikInput = document.querySelector(`input[name="memberNik${i}"]`);
            if (nikInput) {
                nikInput.addEventListener('input', function() {
                    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 16);
                });
                nikInput.addEventListener('change', () => this.updateSubmitButton());
            }
            
            // Gender select
            const genderSelect = document.querySelector(`select[name="memberJenisKelamin${i}"]`);
            if (genderSelect) {
                genderSelect.addEventListener('change', () => this.updateSubmitButton());
            }
            
            // Birth date
            const birthInput = document.querySelector(`input[name="memberBirthDate${i}"]`);
            if (birthInput) {
                birthInput.addEventListener('change', function() {
                    if (!this.value) return;
                    
                    const selectedDate = new Date(this.value);
                    const today = new Date();
                    if (selectedDate > today) {
                        this.value = '';
                        document.querySelector(`input[name="memberUmur${i}"]`).value = '';
                        return;
                    }
                    
                    const ageObj = Validator.calculateAge(this.value);
                    const umurInput = document.querySelector(`input[name="memberUmur${i}"]`);
                    if (umurInput && ageObj) {
                        umurInput.value = Validator.formatAge(ageObj);
                    }
                });
            }
            
            // All other inputs
            const allInputs = document.querySelectorAll(`#teamMember${i} input, #teamMember${i} select, #teamMember${i} textarea`);
            allInputs.forEach(input => {
                if (!input.type || input.type !== 'file') {
                    input.addEventListener('input', () => this.updateSubmitButton());
                    input.addEventListener('change', () => this.updateSubmitButton());
                }
            });
        }
    }

    // ===== TEAM MEMBER ADD/REMOVE =====
    addTeamMember() {
        if (this.formManager.addTeamMember()) {
            this.generateTeamForm(3);
            setTimeout(() => {
                this.formManager.restoreTeamData();
                this.updateSubmitButton();
            }, 100);
        }
    }

    removeTeamMember() {
        if (this.formManager.removeTeamMember()) {
            this.generateTeamForm(2);
            setTimeout(() => {
                this.formManager.restoreTeamData();
                this.updateSubmitButton();
            }, 100);
        }
    }

    // ===== UPDATE SUBMIT BUTTON =====
    updateSubmitButton() {
        const submitBtn = document.getElementById('submitBtn');
        const kecamatan = document.getElementById('kecamatan').value;
        const cabang = document.getElementById('cabang').value;
        
        if (!kecamatan) {
            submitBtn.disabled = true;
            this.uiManager.updateSubmitStatus('Pilih kecamatan asal terlebih dahulu');
            return;
        }
        
        if (!cabang || !this.formManager.getCurrentCabang()) {
            submitBtn.disabled = true;
            this.uiManager.updateSubmitStatus('Pilih cabang lomba terlebih dahulu');
            return;
        }
        
        // Validate gender
        const genderValidation = Validator.validateGender(
            this.formManager.getCurrentCabang(), 
            this.formManager.isTeam(), 
            this.formManager.getTeamMemberCount()
        );
        
        if (!genderValidation.isValid) {
            submitBtn.disabled = true;
            this.uiManager.updateSubmitStatus(genderValidation.message, 'error');
            return;
        }
        
        // Check file sizes
        const fileSizeCheck = Validator.checkFileSizes(
            this.fileHandler.getAllFiles(), 
            CONFIG.MAX_FILE_SIZE_BYTES
        );
        
        if (!fileSizeCheck.isValid) {
            submitBtn.disabled = true;
            this.uiManager.updateSubmitStatus(fileSizeCheck.message, 'error');
            return;
        }
        
        // Check form completion
        const validation = this.formManager.validateForm();
        
        if (validation.isValid) {
            submitBtn.disabled = false;
            this.uiManager.hideSubmitStatus();
        } else {
            submitBtn.disabled = true;
            this.uiManager.updateSubmitStatus(validation.errors.join('<br>⚠️ '));
        }
    }

    // ===== FORM SUBMISSION =====
    async handleFormSubmit(e) {
        e.preventDefault();
        
        logger.log('=== FORM SUBMISSION START ===');
        
        try {
            // Cleanup form
            this.cleanupFormBeforeSubmit();
            
            // Manual validation
            const validation = this.formManager.validateForm();
            if (!validation.isValid) {
                this.uiManager.showResultModal(false, 'Data Tidak Lengkap', 
                    'Mohon lengkapi data berikut:\n\n' + validation.errors.join('\n'));
                return;
            }
            
            // Reset progress tracker
            progressTracker.reset();
            
            // Check registration time
            if (!this.timeManager.checkRegistrationTime()) {
                this.uiManager.showResultModal(false, 'Pendaftaran Ditutup', 
                    'Mohon maaf, waktu pendaftaran telah berakhir atau belum dimulai.');
                return;
            }
            
            // Show confirmation
            const confirmed = await this.uiManager.showConfirmModal(
                'Konfirmasi Pendaftaran',
                'Apakah Anda yakin semua data sudah benar?\n\nData yang sudah dikirim tidak dapat diubah.'
            );
            
            if (!confirmed) {
                logger.log('User cancelled registration');
                return;
            }
            
            // Show loading & progress
            this.uiManager.showLoadingOverlay(true, 'Memvalidasi data & menyimpan...');
            this.uiManager.showProgressBar(true);
            progressTracker.currentStep = 0;
            this.uiManager.updateProgress(15, 'Validasi & Penyimpanan Data');
            
            // Prepare form data
            const formData = this.prepareFormData();
            
            // Submit registration
            this.uiManager.updateProgress(30, 'Upload Data Registrasi...');
            const result = await this.apiService.submitRegistration(formData);
            
            if (!result.success) {
                this.uiManager.showLoadingOverlay(false);
                this.uiManager.showResultModal(false, 'Registrasi Ditolak', result.message || 'Terjadi kesalahan');
                return;
            }
            
            const responseDetails = this.prepareResponseDetails(result.nomorPeserta);
            
            this.uiManager.updateProgress(50, 'Data Registrasi Tersimpan!');
            
            // Upload files
            const uploadedFiles = this.fileHandler.getAllFiles();
            if (Object.keys(uploadedFiles).length > 0) {
                await this.uploadFiles(result.nomorPeserta, uploadedFiles);
            }
            
            this.uiManager.updateProgress(100, '✅ Selesai!');
            
            setTimeout(() => {
                this.uiManager.showLoadingOverlay(false);
                this.uiManager.showResultModal(true, 'Registrasi Berhasil!', 
                    'Data Anda telah tersimpan' + (Object.keys(uploadedFiles).length > 0 ? ' dan dokumen telah diupload.' : '.'), 
                    responseDetails);
                logger.log('=== FORM SUBMISSION SUCCESS ===');
            }, 500);
            
        } catch (error) {
            logger.error('Submission error occurred', error);
            this.uiManager.showLoadingOverlay(false);
            this.uiManager.updateProgress(0, 'Terjadi Kesalahan');
            this.uiManager.showResultModal(false, 'Kesalahan Sistem', 'Terjadi kesalahan: ' + error.message);
        } finally {
            this.uiManager.showProgressBar(false);
            progressTracker.reset();
        }
    }

    prepareFormData() {
        const formData = new FormData();
        const kecamatan = document.getElementById('kecamatan').value;
        const currentCabang = this.formManager.getCurrentCabang();
        
        formData.append('kecamatan', kecamatan);
        formData.append('cabang', currentCabang.name);
        formData.append('cabangCode', currentCabang.code);
        formData.append('maxAge', currentCabang.maxAge);
        formData.append('genderCode', currentCabang.genderRestriction);
        formData.append('isTeam', currentCabang.isTeam ? 'true' : 'false');
        
        const nikList = [];
        
        if (!currentCabang.isTeam) {
            // Personal data
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
        } else {
            // Team data
            const namaRegu = document.getElementById('namaRegu').value;
            formData.append('namaRegu', namaRegu);
            
            for (let i = 1; i <= this.formManager.getTeamMemberCount(); i++) {
                const nik = document.querySelector(`[name="memberNik${i}"]`).value;
                if (nik) nikList.push(nik);
                
                formData.append(`memberNik${i}`, nik);
                formData.append(`memberName${i}`, document.querySelector(`[name="memberName${i}"]`).value);
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
            }
            
            formData.append('memberGenderCode1', document.querySelector('[name="memberJenisKelamin1"]').value === 'Laki-laki' ? 'male' : 'female');
        }
        
        formData.append('nikList', JSON.stringify(nikList));
        
        return formData;
    }

    prepareResponseDetails(nomorPeserta) {
        const currentCabang = this.formManager.getCurrentCabang();
        const responseDetails = {
            cabang: currentCabang.name,
            nomorPeserta: nomorPeserta
        };
        
        if (!currentCabang.isTeam) {
            responseDetails.nik = document.getElementById('nik').value;
            responseDetails.nama = document.getElementById('nama').value;
        } else {
            responseDetails.namaRegu = document.getElementById('namaRegu').value;
            responseDetails.teamMembers = [];
            
            for (let i = 1; i <= this.formManager.getTeamMemberCount(); i++) {
                const nik = document.querySelector(`[name="memberNik${i}"]`).value;
                const nama = document.querySelector(`[name="memberName${i}"]`).value;
                
                if (nik && nama) {
                    responseDetails.teamMembers.push({ nik, nama });
                }
            }
        }
        
        return responseDetails;
    }

    async uploadFiles(nomorPeserta, uploadedFiles) {
        this.uiManager.showLoadingOverlay(true, 'Mengupload dokumen...\nJangan tutup ataupun refresh halaman ini..');
        
        progressTracker.currentStep = 1;
        progressTracker.setFilesTotal(Object.keys(uploadedFiles).length);
        
        const fileFormData = new FormData();
        fileFormData.append('nomorPeserta', nomorPeserta);
        fileFormData.append('action', 'uploadFiles');
        
        const uploadedFilesList = Object.keys(uploadedFiles);
        
        for (let idx = 0; idx < uploadedFilesList.length; idx++) {
            const key = uploadedFilesList[idx];
            if (uploadedFiles[key]) {
                const file = uploadedFiles[key];
                logger.log(`Converting file ${idx + 1}/${uploadedFilesList.length}: ${key} (${file.name})`);
                
                const base64 = await this.fileHandler.fileToBase64(file);
                fileFormData.append(key, base64);
                fileFormData.append(key + '_name', file.name);
                fileFormData.append(key + '_type', file.type);
                
                progressTracker.incrementFile();
                const currentProgress = progressTracker.calculateProgress();
                const message = progressTracker.getDetailedMessage();
                this.uiManager.updateProgress(currentProgress, message);
            }
        }
        
        this.uiManager.updateProgress(70, 'Mengirim File...');
        
        const fileResult = await this.apiService.uploadFiles(fileFormData);
        
        if (!fileResult.success) {
            logger.log('File upload failed:', fileResult.message);
        }
        
        this.uiManager.updateProgress(85, 'File Terupload!');
    }

    cleanupFormBeforeSubmit() {
        logger.log('=== CLEANUP FORM BEFORE SUBMIT ===');
        
        this.cleanupPersonalFileInputs();
        this.cleanupTeamFileInputs();
        
        logger.log('=== CLEANUP COMPLETE ===');
    }

    // ===== SEARCH NIK =====
    async handleSearchNIK() {
        try {
            const nikInput = document.getElementById('searchNIK').value.trim();
            
            if (!nikInput) {
                alert('Silakan masukkan NIK peserta terlebih dahulu');
                return;
            }
            
            await this.dataManager.searchPesertaByNIK(nikInput);
            
        } catch (error) {
            alert('Terjadi kesalahan saat mencari data: ' + error.message);
        }
    }

    // ===== LOAD REJECTED DATA =====
    async loadRejectedData() {
        await this.dataManager.loadRejectedData();
    }

    // ===== TAB SWITCHING =====
    showTab(tabName) {
        logger.log('Switching to tab:', tabName);
        
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const activeSection = document.getElementById(tabName);
        if (activeSection) {
            activeSection.classList.add('active');
        }
        
        if (event && event.target) {
            event.target.classList.add('active');
        }
        
        if (tabName === 'pesertaDitolak') {
            logger.log('User opened rejected data tab');
            this.timeManager.updateRejectedDataTabVisibility();
            
            const now = new Date();
            const isOpen = now >= CONFIG.REGISTRATION_START && now <= CONFIG.REGISTRATION_END;
            
            if (isOpen && !this.dataManager.rejectedDataInitialized) {
                logger.log('Auto-loading rejected data for first time');
                this.dataManager.rejectedDataInitialized = true;
                this.loadRejectedData();
            }
        }
    }

    // ===== RESET FORM =====
    async resetForm() {
        const confirmed = await this.uiManager.showConfirmModal(
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
        
        this.fileHandler.reset();
        this.formManager.reset();
        
        this.updateSubmitButton();
    }

    // ===== DEVELOPER MODE =====
    initDeveloperMode() {
        logger.log('Developer mode enabled');
        // Developer mode implementation can be added here if needed
    }
}

// ===== INITIALIZE APP =====
const mtqApp = new MTQRegistrationApp();
window.mtqApp = mtqApp; // Expose to global for onclick handlers

document.addEventListener('DOMContentLoaded', () => {
    logger.log('DOM Content Loaded');
    mtqApp.init();
}, { once: true });

// ===== GLOBAL FUNCTIONS (for onclick handlers) =====
window.showTab = (tabName) => mtqApp.showTab(tabName);
window.loadRejectedData = () => mtqApp.loadRejectedData();
window.searchPesertaByNIK = () => mtqApp.handleSearchNIK();
window.closeResultModal = () => mtqApp.uiManager.closeResultModal();
window.closeConfirmModal = (result) => mtqApp.uiManager.closeConfirmModal(result);
window.resetForm = () => mtqApp.resetForm();