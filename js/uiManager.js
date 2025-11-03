import logger from './logger.js';

export class UIManager {
    constructor() {
        this.confirmCallback = null;
        this.lastRegistrationWasSuccessful = false;
    }

    // ===== LOADING OVERLAY =====
    showLoadingOverlay(show, message = 'Memproses...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingMessage = document.getElementById('loadingMessage');
        
        if (show) {
            loadingMessage.textContent = message;
            overlay.classList.add('show');
            logger.log('Loading overlay shown:', message);
        } else {
            overlay.classList.remove('show');
            logger.log('Loading overlay hidden');
        }
    }

    // ===== PROGRESS BAR =====
    showProgressBar(show) {
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.style.display = show ? 'block' : 'none';
        }
    }

    updateProgress(percent, message) {
        const fill = document.getElementById('progressFill');
        const msgEl = document.getElementById('progressMessage');
        
        if (fill) {
            fill.style.width = percent + '%';
            fill.textContent = percent + '%';
        }
        if (msgEl) {
            msgEl.textContent = message;
        }
        
        logger.log(`Progress: ${percent}% - ${message}`);
    }

    // ===== RESULT MODAL =====
    showResultModal(success, title, message, details = null) {
        this.lastRegistrationWasSuccessful = success;
        logger.log('showResultModal - success:', success);

        const modal = document.getElementById('resultModal');
        
        document.getElementById('resultIcon').textContent = success ? '\u2705' : '\u274C';
        document.getElementById('resultTitle').textContent = title;
        
        let messageText = message;
        if (details && success) {
            if (details.teamMembers && details.teamMembers.length > 0) {
                let teamData = `${message}\n\n=== Data Registrasi Anda ===\n`;
                teamData += `Nama Regu/Tim: ${details.namaRegu || '-'}\n`;
                teamData += `Cabang: ${details.cabang || '-'}\n`;
                teamData += `Nomor Peserta: ${details.nomorPeserta || '-'}\n\n`;
                teamData += `=== Anggota Tim ===\n`;
                
                details.teamMembers.forEach((member, i) => {
                    teamData += `${i + 1}. ${member.nama}\n   NIK: ${member.nik}\n`;
                });
                messageText = teamData;
            } else {
                messageText = `${message}\n\n=== Data Registrasi Anda ===\nNIK: ${details.nik}\nNama: ${details.nama}\nCabang: ${details.cabang}\nNomor Peserta: ${details.nomorPeserta}`;
            }
        }
        
        document.getElementById('resultMessage').textContent = messageText;
        modal.classList.add('show');
        logger.log('Result modal shown');
    }

    closeResultModal() {
        const resultModal = document.getElementById('resultModal');
        resultModal.classList.remove('show');
        
        logger.log('closeResultModal - lastRegistrationWasSuccessful:', this.lastRegistrationWasSuccessful);
        
        // Only clear form if registration was successful
        if (this.lastRegistrationWasSuccessful === true) {
            logger.log('✅ Registration SUCCESSFUL - CLEARING form');
            this.clearFormCompletely();
            this.lastRegistrationWasSuccessful = false;
        } else {
            logger.log('❌ Registration FAILED - KEEPING form data for retry');
        }
    }

    clearFormCompletely() {
        const registrationForm = document.getElementById('registrationForm');
        if (registrationForm) {
            registrationForm.reset();
            logger.log('Form reset executed');
        }

        // Clear personal file inputs
        for (let i = 1; i <= 5; i++) {
            const personalInput = document.getElementById(`personalDoc${i}`);
            if (personalInput) {
                personalInput.value = '';
                personalInput.removeAttribute('required');
            }
        }

        // Clear team file inputs
        for (let i = 1; i <= 3; i++) {
            for (let d = 1; d <= 5; d++) {
                const teamInput = document.getElementById(`teamDoc${i}_${d}`);
                if (teamInput) {
                    teamInput.value = '';
                    teamInput.removeAttribute('required');
                }
            }
        }

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

        logger.log('✅ Form cleared successfully');
    }

    // ===== CONFIRM MODAL =====
    showConfirmModal(title, message) {
        return new Promise((resolve) => {
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmModal').classList.add('show');
            this.confirmCallback = resolve;
            logger.log('Confirm modal shown:', title);
        });
    }

    closeConfirmModal(result) {
        document.getElementById('confirmModal').classList.remove('show');
        if (this.confirmCallback) {
            this.confirmCallback(result);
            this.confirmCallback = null;
            logger.log('Confirm modal closed, result:', result);
        }
    }

    // ===== SUBMIT STATUS INFO =====
    updateSubmitStatus(message, type = 'warning') {
        const statusDiv = document.getElementById('submitStatusInfo');
        if (!statusDiv) return;

        statusDiv.innerHTML = '⚠️ ' + message;
        statusDiv.style.display = 'block';
        
        if (type === 'warning') {
            statusDiv.style.background = '#fff3cd';
            statusDiv.style.color = '#856404';
        } else if (type === 'error') {
            statusDiv.style.background = '#ffe7e7';
            statusDiv.style.color = '#c82333';
        }
    }

    hideSubmitStatus() {
        const statusDiv = document.getElementById('submitStatusInfo');
        if (statusDiv) {
            statusDiv.style.display = 'none';
        }
    }
}