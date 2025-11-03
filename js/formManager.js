import logger from './logger.js';
import { Validator } from './validator.js';
import { FileHandler } from './fileHandler.js';

export class FormManager {
    constructor(fileHandler) {
        this.fileHandler = fileHandler;
        this.currentCabang = null;
        this.currentTeamMemberCount = 2;
        this.savedPersonalData = null;
        this.savedTeamData = {};
    }

    reset() {
        this.currentCabang = null;
        this.currentTeamMemberCount = 2;
        this.savedPersonalData = null;
        this.savedTeamData = {};
        logger.log('FormManager reset');
    }

    setCurrentCabang(cabang) {
        this.currentCabang = cabang;
        logger.log('Current cabang set:', cabang ? cabang.name : 'null');
    }

    getCurrentCabang() {
        return this.currentCabang;
    }

    isTeam() {
        return this.currentCabang && this.currentCabang.isTeam;
    }

    // ===== PERSONAL DATA MANAGEMENT =====
    savePersonalData() {
        this.savedPersonalData = {
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
            if (this.fileHandler.getFile(`doc${i}`)) {
                savedFiles[`doc${i}`] = this.fileHandler.getFile(`doc${i}`);
            }
        }
        this.savedPersonalData.files = savedFiles;
        logger.log('Personal data saved');
    }

    clearPersonalData() {
        this.savedPersonalData = null;
        this.fileHandler.clearPersonalFiles();
        logger.log('Personal data cleared');
    }

    restorePersonalData() {
        if (!this.savedPersonalData) return;

        document.getElementById('nik').value = this.savedPersonalData.nik;
        document.getElementById('nama').value = this.savedPersonalData.nama;
        document.getElementById('jenisKelamin').value = this.savedPersonalData.jenisKelamin;
        document.getElementById('tempatLahir').value = this.savedPersonalData.tempatLahir;
        document.getElementById('tglLahir').value = this.savedPersonalData.tglLahir;
        document.getElementById('umur').value = this.savedPersonalData.umur;
        document.getElementById('alamat').value = this.savedPersonalData.alamat;
        document.getElementById('noTelepon').value = this.savedPersonalData.noTelepon;
        document.getElementById('email').value = this.savedPersonalData.email;
        document.getElementById('namaRek').value = this.savedPersonalData.namaRek;
        document.getElementById('noRek').value = this.savedPersonalData.noRek;
        document.getElementById('namaBank').value = this.savedPersonalData.namaBank;

        if (this.savedPersonalData.files) {
            for (let docKey in this.savedPersonalData.files) {
                const docNum = docKey.replace('doc', '');
                const label = document.getElementById(`personalDoc${docNum}Name`);
                if (label) {
                    label.textContent = this.savedPersonalData.files[docKey].name;
                    label.style.color = '#28a745';
                }
            }
        }
        logger.log('Personal data restored');
    }

    // ===== TEAM DATA MANAGEMENT =====
    saveTeamData() {
        this.savedTeamData = {
            namaRegu: document.getElementById('namaRegu')?.value || '',
            members: {}
        };

        for (let i = 1; i <= this.currentTeamMemberCount; i++) {
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
                if (this.fileHandler.getFile(`teamDoc${i}_${d}`)) {
                    memberData.files[`doc${d}`] = this.fileHandler.getFile(`teamDoc${i}_${d}`);
                }
            }

            this.savedTeamData.members[i] = memberData;
        }
        logger.log('Team data saved');
    }

    clearTeamData() {
        this.savedTeamData = {};
        this.fileHandler.clearTeamFiles();
        logger.log('Team data cleared');
    }

    restoreTeamData() {
        if (!this.savedTeamData || !this.savedTeamData.members) return;

        if (this.savedTeamData.namaRegu) {
            document.getElementById('namaRegu').value = this.savedTeamData.namaRegu;
        }

        for (let i in this.savedTeamData.members) {
            const memberData = this.savedTeamData.members[i];
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

                if (memberData.files) {
                    for (let d in memberData.files) {
                        const docNum = d.replace('doc', '');
                        const label = document.getElementById(`teamDoc${i}_${docNum}Name`);
                        if (label) {
                            label.textContent = memberData.files[d].name;
                            label.style.color = '#28a745';
                        }
                    }
                }
            }
        }
        logger.log('Team data restored');
    }

    restorePersonalToTeamMember1() {
        if (!this.savedPersonalData) return;

        const fields = [
            { saved: 'nik', team: 'memberNik1' },
            { saved: 'nama', team: 'memberName1' },
            { saved: 'jenisKelamin', team: 'memberJenisKelamin1' },
            { saved: 'tempatLahir', team: 'memberTempatLahir1' },
            { saved: 'tglLahir', team: 'memberBirthDate1' },
            { saved: 'umur', team: 'memberUmur1' },
            { saved: 'alamat', team: 'memberAlamat1' },
            { saved: 'noTelepon', team: 'memberNoTelepon1' },
            { saved: 'email', team: 'memberEmail1' },
            { saved: 'namaRek', team: 'memberNamaRek1' },
            { saved: 'noRek', team: 'memberNoRek1' },
            { saved: 'namaBank', team: 'memberNamaBank1' }
        ];

        fields.forEach(field => {
            const input = document.querySelector(`[name="${field.team}"]`);
            if (input && this.savedPersonalData[field.saved]) {
                input.value = this.savedPersonalData[field.saved];
            }
        });

        if (this.savedPersonalData.files) {
            for (let docKey in this.savedPersonalData.files) {
                const docNum = docKey.replace('doc', '');
                this.fileHandler.addFile(`teamDoc1_${docNum}`, this.savedPersonalData.files[docKey]);
                const label = document.getElementById(`teamDoc1_${docNum}Name`);
                if (label) {
                    label.textContent = this.savedPersonalData.files[docKey].name;
                    label.style.color = '#28a745';
                }
            }
        }
        logger.log('Personal data restored to Team Member 1');
    }

    restoreTeamMember1ToPersonal() {
        if (!this.savedTeamData || !this.savedTeamData.members || !this.savedTeamData.members[1]) return;

        const member1 = this.savedTeamData.members[1];

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
            for (let d in member1.files) {
                const docNum = d.replace('doc', '');
                this.fileHandler.addFile(`doc${docNum}`, member1.files[d]);
                const label = document.getElementById(`personalDoc${docNum}Name`);
                if (label) {
                    label.textContent = member1.files[d].name;
                    label.style.color = '#28a745';
                }
            }
        }
        logger.log('Team Member 1 data restored to Personal');
    }

    // ===== TEAM MEMBER COUNT =====
    addTeamMember() {
        if (this.currentTeamMemberCount < 3) {
            this.saveTeamData();
            this.currentTeamMemberCount = 3;
            logger.log('Team member added, count: 3');
            return true;
        }
        return false;
    }

    removeTeamMember() {
        if (this.currentTeamMemberCount === 3) {
            this.saveTeamData();
            this.currentTeamMemberCount = 2;
            
            // Clear member 3 files
            for (let d = 1; d <= 5; d++) {
                this.fileHandler.removeFile(`teamDoc3_${d}`);
            }
            logger.log('Team member removed, count: 2');
            return true;
        }
        return false;
    }

    getTeamMemberCount() {
        return this.currentTeamMemberCount;
    }

    // ===== VALIDATION =====
    validateForm() {
        logger.log('=== MANUAL VALIDATION START ===');
        const errors = [];

        // Validate kecamatan
        const kecamatan = document.getElementById('kecamatan').value;
        if (!kecamatan) errors.push('Kecamatan belum dipilih');

        // Validate cabang
        const cabang = document.getElementById('cabang').value;
        if (!cabang || !this.currentCabang) errors.push('Cabang lomba belum dipilih');

        // ✅ DEBUG: Log current uploaded files
        logger.log('📦 Current uploaded files:', Object.keys(this.fileHandler.getAllFiles()));
        
        // Validate based on form type
        if (this.currentCabang) {
            if (!this.currentCabang.isTeam) {
                logger.log('🔍 Validating PERSONAL form...');
                errors.push(...this.validatePersonalForm());
            } else {
                logger.log('🔍 Validating TEAM form...');
                errors.push(...this.validateTeamForm());
            }
        }

        if (errors.length > 0) {
            logger.log('❌ Validation FAILED:');
            errors.forEach((err, idx) => logger.log(`  ${idx + 1}. ${err}`));
            return { isValid: false, errors };
        }

        logger.log('✅ Validation PASSED');
        return { isValid: true, errors: [] };
    }

    validatePersonalForm() {
        const errors = [];
        const personalFields = [
            { id: 'nik', name: 'NIK' },
            { id: 'nama', name: 'Nama lengkap' },
            { id: 'jenisKelamin', name: 'Jenis kelamin' },
            { id: 'tempatLahir', name: 'Tempat lahir' },
            { id: 'tglLahir', name: 'Tanggal lahir' },
            { id: 'alamat', name: 'Alamat' },
            { id: 'noTelepon', name: 'Nomor telepon' },
            { id: 'email', name: 'Email' }
        ];

        personalFields.forEach(field => {
            const value = document.getElementById(field.id)?.value;
            if (!value || value.trim() === '') {
                errors.push(`${field.name} belum diisi`);
            }
        });

        const nik = document.getElementById('nik')?.value;
        if (nik && nik.length !== 16) {
            errors.push('NIK harus terdiri dari 16 digit');
        }

        const requiredDocs = [
            { num: 1, name: 'Surat Mandat' },
            { num: 2, name: 'KTP/KK/KIA' },
            { num: 5, name: 'Pas Photo' }
        ];
        
        requiredDocs.forEach(doc => {
            const fileKey = `doc${doc.num}`;
            const hasFile = this.fileHandler.getFile(fileKey);
            
            if (!hasFile) {
                errors.push(`Dokumen ${doc.name} belum diupload`);
                logger.log(`❌ Missing required file: ${fileKey}`);
            } else {
                logger.log(`✅ File exists: ${fileKey} - ${hasFile.name}`);
            }
        });

        return errors;
    }

    validateTeamMember(memberIndex, isRequired) {
        const errors = [];
        const prefix = `Anggota #${memberIndex}`;

        const memberFields = [
            { name: `memberNik${memberIndex}`, label: 'NIK' },
            { name: `memberName${memberIndex}`, label: 'Nama' },
            { name: `memberJenisKelamin${memberIndex}`, label: 'Jenis kelamin' },
            { name: `memberTempatLahir${memberIndex}`, label: 'Tempat lahir' },
            { name: `memberBirthDate${memberIndex}`, label: 'Tanggal lahir' },
            { name: `memberAlamat${memberIndex}`, label: 'Alamat' },
            { name: `memberNoTelepon${memberIndex}`, label: 'No telepon' },
            { name: `memberEmail${memberIndex}`, label: 'Email' }
        ];

        memberFields.forEach(field => {
            const value = document.querySelector(`[name="${field.name}"]`)?.value;
            if (!value || value.trim() === '') {
                errors.push(`${prefix}: ${field.label} belum diisi`);
            }
        });

        const memberNik = document.querySelector(`[name="memberNik${memberIndex}"]`)?.value;
        if (memberNik && memberNik.length !== 16) {
            errors.push(`${prefix}: NIK harus terdiri dari 16 digit`);
        }

        const requiredDocs = [
            { num: 1, name: 'Surat Mandat' },
            { num: 2, name: 'KTP/KK/KIA' },
            { num: 5, name: 'Pas Photo' }
        ];
        
        requiredDocs.forEach(doc => {
            const fileKey = `teamDoc${memberIndex}_${doc.num}`;
            const hasFile = this.fileHandler.getFile(fileKey);
            
            if (!hasFile) {
                errors.push(`${prefix}: Dokumen ${doc.name} belum diupload`);
                logger.log(`❌ Missing required file: ${fileKey}`);
            } else {
                logger.log(`✅ File exists: ${fileKey} - ${hasFile.name}`);
            }
        });

        return errors;
    }

    validateTeamMember(memberIndex, isRequired) {
        const errors = [];
        const prefix = `Anggota #${memberIndex}`;

        const memberFields = [
            { name: `memberNik${memberIndex}`, label: 'NIK' },
            { name: `memberName${memberIndex}`, label: 'Nama' },
            { name: `memberJenisKelamin${memberIndex}`, label: 'Jenis kelamin' },
            { name: `memberTempatLahir${memberIndex}`, label: 'Tempat lahir' },
            { name: `memberBirthDate${memberIndex}`, label: 'Tanggal lahir' },
            { name: `memberAlamat${memberIndex}`, label: 'Alamat' },
            { name: `memberNoTelepon${memberIndex}`, label: 'No telepon' },
            { name: `memberEmail${memberIndex}`, label: 'Email' }
        ];

        memberFields.forEach(field => {
            const value = document.querySelector(`[name="${field.name}"]`)?.value;
            if (!value || value.trim() === '') {
                errors.push(`${prefix}: ${field.label} belum diisi`);
            }
        });

        const memberNik = document.querySelector(`[name="memberNik${memberIndex}"]`)?.value;
        if (memberNik && memberNik.length !== 16) {
            errors.push(`${prefix}: NIK harus terdiri dari 16 digit`);
        }

        // Check required files
        const requiredDocs = [1, 2, 5];
        requiredDocs.forEach(docNum => {
            if (!this.fileHandler.getFile(`teamDoc${memberIndex}_${docNum}`)) {
                const docNames = { 1: 'Surat Mandat', 2: 'KTP/KK/KIA', 5: 'Pas Photo' };
                errors.push(`${prefix}: Dokumen ${docNames[docNum]} belum diupload`);
            }
        });

        return errors;
    }

    isTeamMemberFilled(memberIndex) {
        const nikEl = document.querySelector(`input[name="memberNik${memberIndex}"]`);
        const nameEl = document.querySelector(`input[name="memberName${memberIndex}"]`);
        const birthEl = document.querySelector(`input[name="memberBirthDate${memberIndex}"]`);
        return !!(nikEl?.value || nameEl?.value || birthEl?.value);
    }
}