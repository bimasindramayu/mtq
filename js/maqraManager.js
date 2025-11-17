import logger from './logger.js';
import { CONFIG } from './config.js';
import { isMaqraEnabled, getAvailableMaqra } from './maqraConfig.js';

export class MaqraManager {
    constructor() {
        this.isDrawing = false;
        this.currentModal = null;
        this.currentDrawData = null;
        this.drawnMaqra = null;
        this.isProcessingAnyDraw = false;
        this.currentButtonId = null; // ✅ FIX ISSUE #2: Track button ID
        this.manuallyConfirmed = false; // ✅ Track manual confirmation
        logger.log('🎴 MaqraManager initialized');
    }

    // ===== CHECK IF MAQRA CAN BE DRAWN =====
    async canDrawMaqra(rowData) {
        try {
            logger.log('=== CAN DRAW MAQRA CHECK START ===');
            logger.log('Row data received:', JSON.stringify(rowData));

            if (rowData.maqra && rowData.maqra !== '-' && rowData.maqra.trim() !== '') {
                logger.log('❌ Maqra already exists:', rowData.maqra);
                return {
                    canDraw: false,
                    reason: 'Maqra sudah diambil sebelumnya: ' + rowData.maqra
                };
            }

            if (rowData.status !== 'Terverifikasi' && rowData.status !== 'Diterima' && rowData.status !== 'Verified') {
                logger.log('❌ Status not verified:', rowData.status);
                return {
                    canDraw: false,
                    reason: 'Peserta belum terverifikasi (Status: ' + rowData.status + ')'
                };
            }

            const branchCode = this.extractBranchCode(rowData.cabang);
            logger.log('Branch code extracted:', branchCode);
            
            if (!branchCode) {
                return {
                    canDraw: false,
                    reason: 'Kode cabang tidak valid: ' + rowData.cabang
                };
            }

            const maqraEnabled = isMaqraEnabled(branchCode);
            if (!maqraEnabled) {
                return {
                    canDraw: false,
                    reason: 'Pengambilan maqra tidak diaktifkan untuk cabang ini'
                };
            }

            const takenMaqraCodes = await this.getTakenMaqraCodes(branchCode);
            const availableMaqra = getAvailableMaqra(branchCode, takenMaqraCodes);
            
            if (availableMaqra.length === 0) {
                return {
                    canDraw: false,
                    reason: 'Semua maqra sudah terambil untuk cabang ini'
                };
            }

            logger.log('✅ Can draw maqra!');
            return {
                canDraw: true,
                branchCode: branchCode,
                availableMaqra: availableMaqra
            };

        } catch (error) {
            logger.error('❌ Error in canDrawMaqra:', error);
            return {
                canDraw: false,
                reason: 'Terjadi kesalahan sistem: ' + error.message
            };
        }
    }

    extractBranchCode(cabangName) {
        const branchMap = {
            'Tartil Al Qur\'an': 'TA',
            'Tilawah Anak-anak': 'TLA',
            'Tilawah Remaja': 'TLR',
            'Tilawah Dewasa': 'TLD',
            'Qira\'at Mujawwad': 'QM',
            'Hafalan 1 Juz': 'H1J',
            'Hafalan 5 Juz': 'H5J',
            'Hafalan 10 Juz': 'H10J',
            'Hafalan 20 Juz': 'H20J',
            'Hafalan 30 Juz': 'H30J',
            'Tafsir Indonesia': 'TFI',
            'Tafsir Arab': 'TFA',
            'Tafsir Inggris': 'TFE',
            'Fahm Al Qur\'an': 'FAQ',
            'Syarh Al Qur\'an': 'SAQ',
            'Kaligrafi Naskah': 'KN',
            'Kaligrafi Hiasan': 'KH',
            'Kaligrafi Dekorasi': 'KD',
            'Kaligrafi Kontemporer': 'KK',
            'KTIQ': 'KTIQ'
        };

        for (let key in branchMap) {
            if (cabangName.includes(key)) {
                return branchMap[key];
            }
        }
        return null;
    }

    async getTakenMaqraCodes(branchCode) {
        try {
            const url = `${CONFIG.APPS_SCRIPT_URL}?action=getTakenMaqra&branchCode=${branchCode}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success) {
                return result.takenCodes || [];
            }
            return [];
        } catch (error) {
            logger.error('❌ Error getting taken maqra:', error);
            return [];
        }
    }

    async showDrawModalWithLoader(rowData, buttonId) {
        logger.log('=== SHOW DRAW MODAL WITH LOADER ===');
        logger.log('Button ID:', buttonId);
        
        if (this.isProcessingAnyDraw) {
            alert('⚠️ Sedang ada proses pengambilan maqra lainnya. Mohon tunggu hingga selesai.');
            return;
        }
        
        this.isProcessingAnyDraw = true;
        this.disableAllDrawButtons();
        
        // ✅ FIX ISSUE #2: Store original button for restore
        this.currentButtonId = buttonId;
        
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="btn-loader"></span> Memuat...';
            logger.log('✅ Button loader shown');
        }
        
        try {
            await this.showDrawModal(rowData);
            
            // ✅ FIX ISSUE #2: Jika modal gagal buka, restore button
            if (!this.currentModal) {
                logger.log('⚠️ Modal failed to open, restoring button');
                this.restoreButton();
                this.isProcessingAnyDraw = false;
                this.enableAllDrawButtons();
            }
        } catch (error) {
            logger.error('Error in showDrawModalWithLoader:', error);
            this.restoreButton();
            this.isProcessingAnyDraw = false;
            this.enableAllDrawButtons();
            
            alert('❌ Terjadi kesalahan: ' + error.message);
        }
    }

    // ✅ FIX ISSUE #2: Helper function untuk restore button
    restoreButton() {
        if (this.currentButtonId) {
            const button = document.getElementById(this.currentButtonId);
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Ambil Maqra';
                logger.log('✅ Button restored:', this.currentButtonId);
            }
            this.currentButtonId = null;
        }
    }

    disableAllDrawButtons() {
        const buttons = document.querySelectorAll('.btn-draw-maqra-small');
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });
    }

    enableAllDrawButtons() {
        const buttons = document.querySelectorAll('.btn-draw-maqra-small');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }

    // ===== SHOW MAQRA DRAW MODAL WITH MUSHAF ANIMATION =====
    async showDrawModal(rowData) {
        logger.log('=== SHOW DRAW MODAL START ===');
        
        const eligibility = await this.canDrawMaqra(rowData);
        
        if (!eligibility.canDraw) {
            logger.log('❌ Cannot draw:', eligibility.reason);
            alert(`❌ ${eligibility.reason}`);
            
            // ✅ FIX ISSUE #2: Restore button jika tidak eligible
            this.restoreButton();
            this.isProcessingAnyDraw = false;
            this.enableAllDrawButtons();
            return;
        }

        logger.log('✅ Eligible to draw, creating modal...');

        const modal = this.createMushafModal(rowData, eligibility);
        document.body.appendChild(modal);
        this.currentModal = modal;

        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }

    // ===== CREATE MUSHAF MODAL =====
    createMushafModal(rowData, eligibility) {
        logger.log('=== CREATE MUSHAF MODAL ===');
        
        const modal = document.createElement('div');
        modal.className = 'maqra-modal';
        
        this.currentDrawData = {
            nomorPeserta: rowData.nomorPeserta,
            rowIndex: rowData.rowIndex,
            branchCode: eligibility.branchCode,
            availableMaqra: eligibility.availableMaqra
        };
        
        modal.innerHTML = `
            <div class="maqra-modal-content">
                <div class="maqra-header">
                    <h2>📖 Pengambilan Maqra</h2>
                    <button class="maqra-close-btn">✕</button>
                </div>
                
                <div class="maqra-info">
                    <p><strong>Nomor Peserta:</strong> ${rowData.nomorPeserta}</p>
                    <p><strong>Nama:</strong> ${rowData.nama}</p>
                    <p><strong>Cabang:</strong> ${rowData.cabang}</p>
                    <p><strong>Maqra Tersedia:</strong> ${eligibility.availableMaqra.length}</p>
                </div>

                <div class="bismillah-decoration">
                    ﷽
                </div>

                <div class="mushaf-container">
                    <div class="mushaf-book" id="mushafBook">
                        <!-- Cover -->
                        <div class="mushaf-cover">
                            <div class="cover-pattern"></div>
                            <div class="cover-title">المصحف الشريف<br><small style="font-size: 0.6em;">Al-Qur'an Al-Karim</small></div>
                        </div>

                        <!-- Pages -->
                        <div class="mushaf-pages">
                            <div class="islamic-ornament">۞</div>
                            <div class="page-content" id="pageContent">
                                <div class="maqra-display">
                                    <div class="maqra-code-display" id="maqraCode">---</div>
                                    <div class="maqra-surah-display" id="maqraSurah">---</div>
                                    <div class="maqra-ayat-display" id="maqraAyat">---</div>
                                </div>
                            </div>

                            <!-- Light Rays -->
                            <div class="light-rays">
                                <div class="light-ray"></div>
                                <div class="light-ray"></div>
                                <div class="light-ray"></div>
                                <div class="light-ray"></div>
                                <div class="light-ray"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="maqra-actions">
                    <button class="btn-draw-maqra" id="drawBtn">
                        <span>✨</span>
                        <span>Ambil Maqra</span>
                    </button>
                </div>

                <div class="maqra-result" id="maqraResult">
                    <div class="result-icon">✨</div>
                    <h3>Maqra Anda:</h3>
                    <div class="result-code" id="resultCode">---</div>
                    <div class="result-details">
                        <p><strong id="resultSurah">---</strong></p>
                        <p id="resultAyat">---</p>
                    </div>
                    <button class="btn-confirm-maqra" onclick="window.viewApp.maqraManager.confirmMaqra()">
                        ✓ Konfirmasi & Simpan
                    </button>
                </div>
            </div>
        `;

        setTimeout(() => {
            const closeBtn = modal.querySelector('.maqra-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeDrawModal());
            }

            const drawBtn = modal.querySelector('#drawBtn');
            if (drawBtn) {
                drawBtn.addEventListener('click', () => this.startMushafDraw());
            }
        }, 10);

        return modal;
    }

    // ===== START MUSHAF DRAW ANIMATION =====
    async startMushafDraw() {
        if (this.isDrawing) return;
        
        logger.log('=== START MUSHAF DRAW ===');
        this.isDrawing = true;

        const mushafBook = document.getElementById('mushafBook');
        const drawBtn = document.getElementById('drawBtn');
        const maqraCode = document.getElementById('maqraCode');
        const maqraSurah = document.getElementById('maqraSurah');
        const maqraAyat = document.getElementById('maqraAyat');

        if (!mushafBook || !this.currentDrawData) {
            logger.log('❌ Missing elements or data');
            return;
        }

        drawBtn.disabled = true;
        drawBtn.innerHTML = '<span>⏳</span><span>Membuka Mushaf...</span>';

        // Open mushaf
        mushafBook.classList.add('opening');

        // Wait for mushaf to open
        await this.sleep(1500);

        // Shuffle animation
        drawBtn.innerHTML = '<span>🔄</span><span>Mengacak Maqra...</span>';
        
        const { availableMaqra } = this.currentDrawData;
        
        // ✅ FIX ISSUE #1: Jangan pilih finalMaqra di client, biarkan server yang tentukan
        let shuffleCount = 0;
        const totalShuffles = 20;

        const shuffleInterval = setInterval(() => {
            const randomMaqra = availableMaqra[Math.floor(Math.random() * availableMaqra.length)];
            
            maqraCode.textContent = randomMaqra.code;
            maqraSurah.textContent = randomMaqra.surat;
            maqraAyat.textContent = `Ayat ${randomMaqra.ayat}`;

            shuffleCount++;

            if (shuffleCount >= totalShuffles) {
                clearInterval(shuffleInterval);
                
                // ✅ FIX ISSUE #1: Langsung panggil server tanpa set finalMaqra di client
                logger.log('Shuffle animation complete, fetching result from server...');
                setTimeout(() => {
                    this.performActualDraw();
                }, 300);
            }
        }, 100);
    }

    async performActualDraw() {
        try {
            logger.log('=== PERFORM ACTUAL DRAW ===');

            const formData = new URLSearchParams({
                action: 'drawMaqra',
                nomorPeserta: this.currentDrawData.nomorPeserta,
                rowIndex: this.currentDrawData.rowIndex,
                branchCode: this.currentDrawData.branchCode
            });

            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            const result = await response.json();
            logger.log('Server response:', result);

            if (result.success) {
                // ✅ FIX ISSUE #1: Update mushaf display dengan hasil dari server
                const maqraCode = document.getElementById('maqraCode');
                const maqraSurah = document.getElementById('maqraSurah');
                const maqraAyat = document.getElementById('maqraAyat');
                
                if (maqraCode) maqraCode.textContent = result.drawnMaqra.code;
                if (maqraSurah) maqraSurah.textContent = result.drawnMaqra.surat;
                if (maqraAyat) maqraAyat.textContent = `Ayat ${result.drawnMaqra.ayat}`;
                
                logger.log('✅ Mushaf display updated with server result');
                
                // Small delay untuk smooth transition
                await this.sleep(500);
                
                // Show result dengan data dari server
                this.showResult(result.drawnMaqra);
            } else {
                throw new Error(result.message || 'Gagal mengambil maqra');
            }

        } catch (error) {
            logger.error('❌ Error drawing maqra:', error);
            alert('❌ Terjadi kesalahan: ' + error.message);
            
            // ✅ FIX ISSUE #2: Restore button saat error
            this.restoreButton();
            this.closeDrawModal();
        }
    }

    showResult(maqra) {
        logger.log('=== SHOW RESULT ===');
        logger.log('Maqra to display:', maqra);
        
        const resultDiv = document.getElementById('maqraResult');
        const resultCode = document.getElementById('resultCode');
        const resultSurah = document.getElementById('resultSurah');
        const resultAyat = document.getElementById('resultAyat');

        // ✅ FIX ISSUE #1: Pastikan semua element menggunakan data yang sama
        if (resultCode) resultCode.textContent = maqra.code;
        if (resultSurah) resultSurah.textContent = maqra.surat;
        if (resultAyat) resultAyat.textContent = `Ayat ${maqra.ayat}`;

        if (resultDiv) {
            resultDiv.classList.add('show');
        }

        this.drawnMaqra = maqra;
        logger.log('✅ Result displayed successfully');
    }

    async confirmMaqra() {
        logger.log('=== CONFIRM MAQRA ===');
        
        if (!this.drawnMaqra) {
            alert('Tidak ada maqra yang diambil');
            return;
        }

        const confirmBtn = document.querySelector('.btn-confirm-maqra');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '⏳ Menyimpan...';
        }

        try {
            const maqraText = `${this.drawnMaqra.surat} ayat ${this.drawnMaqra.ayat}`;
            
            // Update the cell in table
            if (typeof window._maqraCellIndex !== 'undefined') {
                if (window.viewApp && window.viewApp.updateMaqraCell) {
                    window.viewApp.updateMaqraCell(window._maqraCellIndex, maqraText);
                }
            }
            
            setTimeout(() => {
                alert(`✅ Maqra berhasil disimpan!\n\n${maqraText}`);
                
                delete window._maqraCellIndex;
                delete window._maqraRowData;
                
                // Set flag bahwa sudah dikonfirmasi manual
                this.manuallyConfirmed = true;
                
                this.closeDrawModal();
                
                // Refresh data
                setTimeout(() => {
                    if (window.viewApp && window.viewApp.viewManager) {
                        window.viewApp.viewManager.refreshData();
                    }
                }, 1500);
            }, 500);

        } catch (error) {
            logger.error('❌ Error confirming maqra:', error);
            alert('❌ Gagal menyimpan: ' + error.message);
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = '✓ Konfirmasi & Simpan';
            }
        }
    }

    closeDrawModal() {
        logger.log('=== CLOSE DRAW MODAL ===');
        
        if (this.currentModal) {
            this.currentModal.classList.remove('show');
            
            setTimeout(() => {
                if (this.currentModal && this.currentModal.parentNode) {
                    this.currentModal.parentNode.removeChild(this.currentModal);
                }
                this.currentModal = null;
                this.currentDrawData = null;
                
                // ✅ FIX ISSUE #2: Jika maqra sudah diambil DAN belum dikonfirmasi manual
                if (this.drawnMaqra && !this.manuallyConfirmed) {
                    logger.log('🎯 Maqra was drawn but not manually confirmed, updating button to badge...');
                    this.updateButtonToBadge();
                } else if (this.manuallyConfirmed) {
                    logger.log('✅ Maqra manually confirmed, skip auto-update');
                    // Button sudah di-update saat confirm, tidak perlu restore
                    this.currentButtonId = null;
                } else {
                    // Jika tidak ada maqra, restore button normal
                    this.restoreButton();
                }
                
                this.drawnMaqra = null;
                this.manuallyConfirmed = false;
                this.isDrawing = false;
                this.isProcessingAnyDraw = false;
                this.enableAllDrawButtons();
                
                logger.log('✅ Modal closed, all states reset');
            }, 300);
        } else {
            // ✅ FIX ISSUE #2: Restore button bahkan jika tidak ada modal
            this.restoreButton();
            this.isProcessingAnyDraw = false;
            this.enableAllDrawButtons();
        }
    }

    // ✅ FIX ISSUE #2: Helper untuk update button jadi badge setelah draw
    updateButtonToBadge() {
        if (!this.drawnMaqra || typeof window._maqraCellIndex === 'undefined') {
            logger.log('⚠️ Cannot update button: missing data');
            return;
        }
        
        const maqraText = `${this.drawnMaqra.surat} ayat ${this.drawnMaqra.ayat}`;
        const cellIndex = window._maqraCellIndex;
        
        logger.log('Updating button to badge:', { cellIndex, maqraText });
        
        // Update via viewApp if available
        if (window.viewApp && window.viewApp.updateMaqraCell) {
            window.viewApp.updateMaqraCell(cellIndex, maqraText);
            logger.log('✅ Button updated to badge via viewApp');
        } else {
            // Fallback: direct DOM update
            const cellId = `maqra-cell-${cellIndex}`;
            const cell = document.getElementById(cellId);
            
            if (cell) {
                cell.innerHTML = `<span class="maqra-badge">${maqraText}</span>`;
                logger.log('✅ Button updated to badge via direct DOM');
            } else {
                logger.log('❌ Cell not found:', cellId);
            }
        }
        
        // Clear button ID since we're replacing it
        this.currentButtonId = null;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}