import logger from '../../utils/logger.js';
import { Validator } from '../../utils/validator.js';

export class DeveloperMode {
    constructor(mtqApp) {
        this.app = mtqApp;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        
        logger.log('🛠️ Developer mode initializing...');
        this.createDevModal();
        this.createDevButton();
        this.isInitialized = true;
        logger.log('✅ Developer mode enabled');
    }

    createDevModal() {
        const devModal = document.createElement('div');
        devModal.id = 'devModal';
        devModal.className = 'dev-modal';
        devModal.innerHTML = `
            <div class="dev-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--primary);">🛠️ Developer Tools</h3>
                    <button onclick="window.closeDevModal()" style="background: #6c757d; padding: 8px 15px; border: none; color: white; border-radius: 5px; cursor: pointer;">Tutup</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <button onclick="window.fillPersonalDataRandom()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">📝 Isi Data Personal</button>
                    <button onclick="window.fillTeamMember1Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">👤 Isi Tim Peserta 1</button>
                    <button onclick="window.fillTeamMember2Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">👥 Isi Tim Peserta 2</button>
                    <button onclick="window.fillTeamMember3Random()" style="background: linear-gradient(135deg, #2e8b57, #1e7e34); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">👨‍👩‍👦 Isi Tim Peserta 3</button>
                    <button onclick="window.clearAllDevData()" style="background: linear-gradient(135deg, var(--danger), #c82333); border: none; color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; grid-column: 1/-1;">🗑️ Hapus Semua</button>
                </div>
            </div>
        `;
        document.body.appendChild(devModal);
    }

    createDevButton() {
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

    closeModal() {
        document.getElementById('devModal').classList.remove('show-dev');
    }

    // ===== RANDOM DATA GENERATORS =====
    generateRandomNIK() {
        return Math.floor(Math.random() * 9000000000000000 + 1000000000000000).toString();
    }

    generateRandomName() {
        const firstNames = ['Ahmad', 'Budi', 'Citra', 'Dina', 'Eka', 'Farah', 'Gilang', 'Hana', 'Irfan', 'Jaya'];
        const lastNames = ['Rahman', 'Suryanto', 'Kusuma', 'Wijaya', 'Santoso', 'Hermawan', 'Pratama', 'Setiawan'];
        return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + 
               lastNames[Math.floor(Math.random() * lastNames.length)];
    }

    generateRandomBirthDate() {
        const year = Math.floor(Math.random() * 20) + 2000;
        const month = Math.floor(Math.random() * 12) + 1;
        const day = Math.floor(Math.random() * 28) + 1;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    generateRandomPhone() {
        return '08' + Math.floor(Math.random() * 9000000000 + 1000000000).toString().slice(0, 10);
    }

    generateRandomAddress() {
        const streets = ['Jl. Merdeka', 'Jl. Diponegoro', 'Jl. Sudirman', 'Jl. Gatot Subroto', 'Jl. Ahmad Yani'];
        const street = streets[Math.floor(Math.random() * streets.length)];
        const number = Math.floor(Math.random() * 200) + 1;
        const rt = Math.floor(Math.random() * 10) + 1;
        const rw = Math.floor(Math.random() * 10) + 1;
        return `${street} No. ${number}, RT ${rt}/RW ${rw}`;
    }

    generateRandomAccountNumber() {
        return Math.floor(Math.random() * 9000000000000 + 1000000000000).toString();
    }

    // ===== FILL FORM FUNCTIONS =====
    fillPersonalDataRandom() {
        if (!this.app.formManager.getCurrentCabang() || this.app.formManager.isTeam()) {
            alert('Pilih Cabang Individu terlebih dahulu!');
            return;
        }
        
        const birthDate = this.generateRandomBirthDate();
        const ageObj = Validator.calculateAge(birthDate);
        
        document.getElementById('nik').value = this.generateRandomNIK();
        document.getElementById('nama').value = this.generateRandomName();
        document.getElementById('jenisKelamin').value = this.app.formManager.getCurrentCabang().genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
        document.getElementById('tempatLahir').value = 'Jakarta';
        document.getElementById('tglLahir').value = birthDate;
        document.getElementById('umur').value = Validator.formatAge(ageObj);
        document.getElementById('alamat').value = this.generateRandomAddress();
        document.getElementById('noTelepon').value = this.generateRandomPhone();
        document.getElementById('email').value = `user${Math.floor(Math.random() * 10000)}@email.com`;
        document.getElementById('namaRek').value = this.generateRandomName();
        document.getElementById('noRek').value = this.generateRandomAccountNumber();
        document.getElementById('namaBank').value = ['BNI', 'BCA', 'Mandiri', 'BRI'][Math.floor(Math.random() * 4)];
        
        this.app.updateSubmitButton();
        logger.log('✅ Personal data filled with random values');
    }

    fillTeamMember1Random() {
        if (!this.app.formManager.getCurrentCabang() || !this.app.formManager.isTeam()) {
            alert('Pilih Cabang Tim terlebih dahulu!');
            return;
        }
        this.fillTeamMemberRandom(1);
    }

    fillTeamMember2Random() {
        if (!this.app.formManager.getCurrentCabang() || !this.app.formManager.isTeam()) {
            alert('Pilih Cabang Tim terlebih dahulu!');
            return;
        }
        this.fillTeamMemberRandom(2);
    }

    fillTeamMember3Random() {
        if (!this.app.formManager.getCurrentCabang() || !this.app.formManager.isTeam()) {
            alert('Pilih Cabang Tim terlebih dahulu!');
            return;
        }
        if (this.app.formManager.getTeamMemberCount() < 3) {
            alert('Tambahkan Peserta ke-3 terlebih dahulu!');
            return;
        }
        this.fillTeamMemberRandom(3);
    }

    fillTeamMemberRandom(memberIndex) {
        const birthDate = this.generateRandomBirthDate();
        const ageObj = Validator.calculateAge(birthDate);
        
        document.querySelector(`[name="memberNik${memberIndex}"]`).value = this.generateRandomNIK();
        document.querySelector(`[name="memberName${memberIndex}"]`).value = this.generateRandomName();
        document.querySelector(`[name="memberJenisKelamin${memberIndex}"]`).value = this.app.formManager.getCurrentCabang().genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
        document.querySelector(`[name="memberTempatLahir${memberIndex}"]`).value = 'Jakarta';
        document.querySelector(`[name="memberBirthDate${memberIndex}"]`).value = birthDate;
        document.querySelector(`[name="memberUmur${memberIndex}"]`).value = Validator.formatAge(ageObj);
        document.querySelector(`[name="memberAlamat${memberIndex}"]`).value = this.generateRandomAddress();
        document.querySelector(`[name="memberNoTelepon${memberIndex}"]`).value = this.generateRandomPhone();
        document.querySelector(`[name="memberEmail${memberIndex}"]`).value = `member${memberIndex}${Math.floor(Math.random() * 10000)}@email.com`;
        document.querySelector(`[name="memberNamaRek${memberIndex}"]`).value = this.generateRandomName();
        document.querySelector(`[name="memberNoRek${memberIndex}"]`).value = this.generateRandomAccountNumber();
        document.querySelector(`[name="memberNamaBank${memberIndex}"]`).value = ['BNI', 'BCA', 'Mandiri', 'BRI'][Math.floor(Math.random() * 4)];
        
        this.app.updateSubmitButton();
        logger.log(`✅ Team member ${memberIndex} data filled with random values`);
    }

    clearAllDevData() {
        if (confirm('Hapus semua data yang sudah diisi?')) {
            document.getElementById('registrationForm').reset();
            this.app.fileHandler.reset();
            this.app.formManager.reset();
            document.getElementById('umur').value = '';
            this.app.updateSubmitButton();
            logger.log('🗑️ All dev data cleared');
        }
    }
}