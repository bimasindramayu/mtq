import logger from './logger.js';
import { CONFIG } from './config.js';
import { isMaqraEnabled, getAvailableMaqra } from './maqraConfig.js';

export class MaqraManager {
    constructor() {
        this.isDrawing = false;
        this.currentModal = null;
        this.currentDrawData = null;
        this.drawnMaqra = null;
        this.isProcessingAnyDraw = false; // NEW: Global lock untuk semua tombol
        logger.log('🎴 MaqraManager initialized');
    }

    // ===== CHECK IF MAQRA CAN BE DRAWN =====
    async canDrawMaqra(rowData) {
        try {
            logger.log('=== CAN DRAW MAQRA CHECK START ===');
            logger.log('Row data received:', JSON.stringify(rowData));

            // Check if maqra already assigned
            logger.log('Checking existing maqra:', rowData.maqra);
            if (rowData.maqra && rowData.maqra !== '-' && rowData.maqra.trim() !== '') {
                logger.log('❌ Maqra already exists:', rowData.maqra);
                return {
                    canDraw: false,
                    reason: 'Maqra sudah diambil sebelumnya: ' + rowData.maqra
                };
            }

            // Check if status is verified
            logger.log('Checking status:', rowData.status);
            if (rowData.status !== 'Terverifikasi' && rowData.status !== 'Diterima' && rowData.status !== 'Verified') {
                logger.log('❌ Status not verified:', rowData.status);
                return {
                    canDraw: false,
                    reason: 'Peserta belum terverifikasi (Status: ' + rowData.status + ')'
                };
            }

            // Extract branch code from cabang
            logger.log('Extracting branch code from:', rowData.cabang);
            const branchCode = this.extractBranchCode(rowData.cabang);
            logger.log('Branch code extracted:', branchCode);
            
            if (!branchCode) {
                logger.log('❌ Invalid branch code');
                return {
                    canDraw: false,
                    reason: 'Kode cabang tidak valid: ' + rowData.cabang
                };
            }

            // Check if maqra is enabled for this branch
            logger.log('Checking if maqra enabled for branch:', branchCode);
            const maqraEnabled = isMaqraEnabled(branchCode);
            logger.log('Maqra enabled:', maqraEnabled);
            
            if (!maqraEnabled) {
                logger.log('❌ Maqra not enabled for this branch');
                return {
                    canDraw: false,
                    reason: 'Pengambilan maqra tidak diaktifkan untuk cabang ini'
                };
            }

            // Get taken maqra codes for this branch
            logger.log('Fetching taken maqra codes for branch:', branchCode);
            const takenMaqraCodes = await this.getTakenMaqraCodes(branchCode);
            logger.log('Taken maqra codes count:', takenMaqraCodes.length);
            logger.log('Taken codes:', takenMaqraCodes);
            
            // Get available maqra
            logger.log('Getting available maqra...');
            const availableMaqra = getAvailableMaqra(branchCode, takenMaqraCodes);
            logger.log('Available maqra count:', availableMaqra.length);
            
            if (availableMaqra.length === 0) {
                logger.log('❌ No available maqra');
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

    // ===== EXTRACT BRANCH CODE FROM CABANG NAME =====
    extractBranchCode(cabangName) {
        logger.log('Extracting branch code from:', cabangName);
        
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
                logger.log('✅ Branch code found:', branchMap[key]);
                return branchMap[key];
            }
        }

        logger.log('❌ No branch code found');
        return null;
    }

    // ===== GET TAKEN MAQRA CODES FROM SERVER =====
    async getTakenMaqraCodes(branchCode) {
        try {
            logger.log('=== FETCHING TAKEN MAQRA ===');
            logger.log('Branch code:', branchCode);
            logger.log('API URL:', CONFIG.APPS_SCRIPT_URL);
            
            const url = `${CONFIG.APPS_SCRIPT_URL}?action=getTakenMaqra&branchCode=${branchCode}`;
            logger.log('Full URL:', url);
            
            const response = await fetch(url);
            logger.log('Response status:', response.status);
            
            const result = await response.json();
            logger.log('API Response:', JSON.stringify(result));
            
            if (result.success) {
                logger.log('✅ Successfully fetched taken maqra');
                return result.takenCodes || [];
            }
            
            logger.log('⚠️ API returned success=false');
            return [];
        } catch (error) {
            logger.error('❌ Error getting taken maqra:', error);
            return [];
        }
    }

    // ===== SHOW DRAW MODAL WITH LOADER & ANTI-SPAM =====
    async showDrawModalWithLoader(rowData, buttonId) {
        logger.log('=== SHOW DRAW MODAL WITH LOADER ===');
        
        // Check if any draw is in progress
        if (this.isProcessingAnyDraw) {
            logger.log('❌ Another draw is in progress');
            alert('⚠️ Sedang ada proses pengambilan maqra lainnya. Mohon tunggu hingga selesai.');
            return;
        }
        
        // Set global lock
        this.isProcessingAnyDraw = true;
        logger.log('🔒 Global draw lock acquired');
        
        // Disable ALL draw buttons
        this.disableAllDrawButtons();
        
        // Show loader on clicked button
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="btn-loader"></span> Memuat...';
        }
        
        try {
            // Call original showDrawModal
            await this.showDrawModal(rowData);
            
            // If modal failed to open, release lock
            if (!this.currentModal) {
                logger.log('⚠️ Modal failed to open, releasing lock');
                this.isProcessingAnyDraw = false;
                this.enableAllDrawButtons();
                
                if (button) {
                    button.disabled = false;
                    button.innerHTML = '🎲 Ambil Maqra';
                }
            }
        } catch (error) {
            logger.error('Error in showDrawModalWithLoader:', error);
            this.isProcessingAnyDraw = false;
            this.enableAllDrawButtons();
            
            if (button) {
                button.disabled = false;
                button.innerHTML = '🎲 Ambil Maqra';
            }
        }
    }

    // ===== DISABLE ALL DRAW BUTTONS =====
    disableAllDrawButtons() {
        logger.log('Disabling all draw buttons');
        const buttons = document.querySelectorAll('.btn-draw-maqra-small');
        buttons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        });
    }

    // ===== ENABLE ALL DRAW BUTTONS =====
    enableAllDrawButtons() {
        logger.log('Enabling all draw buttons');
        const buttons = document.querySelectorAll('.btn-draw-maqra-small');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }

    // ===== CREATE DRAW MODAL =====
    createDrawModal(rowData, eligibility) {
        logger.log('=== CREATE DRAW MODAL ===');
        
        const modal = document.createElement('div');
        modal.className = 'maqra-modal';
        
        // Store data directly in modal element
        this.currentDrawData = {
            nomorPeserta: rowData.nomorPeserta,
            rowIndex: rowData.rowIndex,
            branchCode: eligibility.branchCode,
            availableMaqra: eligibility.availableMaqra
        };
        
        logger.log('Current draw data stored:', JSON.stringify({
            nomorPeserta: this.currentDrawData.nomorPeserta,
            rowIndex: this.currentDrawData.rowIndex,
            branchCode: this.currentDrawData.branchCode,
            availableMaqraCount: this.currentDrawData.availableMaqra.length
        }));
        
        modal.innerHTML = `
            <div class="maqra-modal-content">
                <div class="maqra-header">
                    <h2>🎴 Pengambilan Maqra</h2>
                    <button class="maqra-close-btn">✕</button>
                </div>
                
                <div class="maqra-info">
                    <p><strong>Nomor Peserta:</strong> ${rowData.nomorPeserta}</p>
                    <p><strong>Nama:</strong> ${rowData.nama}</p>
                    <p><strong>Cabang:</strong> ${rowData.cabang}</p>
                    <p><strong>Maqra Tersedia:</strong> ${eligibility.availableMaqra.length}</p>
                </div>

                <div class="maqra-card-container">
                    <div class="maqra-card" id="maqraCard">
                        <div class="maqra-card-front">
                            <div class="maqra-logo">📖</div>
                            <p class="maqra-card-hint">Klik Card untuk Mengambil</p>
                        </div>
                        <div class="maqra-card-back">
                            <div class="maqra-code"></div>
                            <div class="maqra-surah"></div>
                            <div class="maqra-ayat"></div>
                        </div>
                    </div>
                </div>

                <div class="maqra-actions">
                    <button class="btn-draw-maqra" id="drawMaqraBtn">
                        🎲 Ambil Maqra
                    </button>
                </div>

                <div class="maqra-result" id="maqraResult" style="display: none;">
                    <div class="result-animation">✨</div>
                    <h3>Maqra Anda:</h3>
                    <div class="result-code"></div>
                    <div class="result-details"></div>
                    <button class="btn-confirm-maqra" id="confirmMaqraBtn">
                        ✓ Konfirmasi & Simpan
                    </button>
                </div>
            </div>
        `;

        // Add event listeners after modal is created
        setTimeout(() => {
            logger.log('Adding event listeners...');
            
            const closeBtn = modal.querySelector('.maqra-close-btn');
            if (closeBtn) {
                logger.log('Close button found, adding listener');
                closeBtn.addEventListener('click', () => {
                    logger.log('Close button clicked');
                    this.closeDrawModal();
                });
            } else {
                logger.log('❌ Close button not found');
            }

            const card = modal.querySelector('#maqraCard');
            if (card) {
                logger.log('Card found, adding listener');
                card.addEventListener('click', () => {
                    logger.log('Card clicked');
                    this.triggerDrawFromCard();
                });
            } else {
                logger.log('❌ Card not found');
            }

            const drawBtn = modal.querySelector('#drawMaqraBtn');
            if (drawBtn) {
                logger.log('Draw button found, adding listener');
                drawBtn.addEventListener('click', () => {
                    logger.log('Draw button clicked');
                    this.triggerDrawFromButton();
                });
            } else {
                logger.log('❌ Draw button not found');
            }

            const confirmBtn = modal.querySelector('#confirmMaqraBtn');
            if (confirmBtn) {
                logger.log('Confirm button found, adding listener');
                confirmBtn.addEventListener('click', () => {
                    logger.log('Confirm button clicked');
                    this.confirmMaqra();
                });
            } else {
                logger.log('❌ Confirm button not found');
            }
            
            logger.log('✅ Event listeners added');
        }, 10);

        return modal;
    }

    // ===== TRIGGER DRAW FROM CARD =====
    triggerDrawFromCard() {
        logger.log('=== TRIGGER DRAW FROM CARD ===');
        logger.log('Is drawing:', this.isDrawing);
        logger.log('Drawn maqra:', this.drawnMaqra);
        
        if (this.isDrawing && this.drawnMaqra) {
            logger.log('❌ Already drawn');
            return; // Already drawn
        }
        
        if (!this.currentDrawData) {
            logger.log('❌ No current draw data');
            alert('Data tidak tersedia');
            return;
        }
        
        logger.log('Current draw data exists');
        const { nomorPeserta, rowIndex, branchCode, availableMaqra } = this.currentDrawData;
        
        logger.log('Data:', { nomorPeserta, rowIndex, branchCode, availableMaqraCount: availableMaqra?.length });
        
        if (!availableMaqra || availableMaqra.length === 0) {
            logger.log('❌ No available maqra');
            alert('Tidak ada maqra tersedia');
            return;
        }
        
        // Hide button, start card animation
        const drawBtn = document.getElementById('drawMaqraBtn');
        if (drawBtn) {
            logger.log('Hiding draw button');
            drawBtn.style.display = 'none';
        }
        
        logger.log('Starting draw...');
        this.startDraw(nomorPeserta, rowIndex, branchCode, availableMaqra);
    }

    // ===== TRIGGER DRAW FROM BUTTON =====
    triggerDrawFromButton() {
        logger.log('=== TRIGGER DRAW FROM BUTTON ===');
        logger.log('Is drawing:', this.isDrawing);
        logger.log('Drawn maqra:', this.drawnMaqra);
        
        if (this.isDrawing && this.drawnMaqra) {
            logger.log('❌ Already drawn');
            return;
        }
        
        if (!this.currentDrawData) {
            logger.log('❌ No current draw data');
            alert('Data tidak tersedia');
            return;
        }
        
        logger.log('Current draw data exists');
        const { nomorPeserta, rowIndex, branchCode, availableMaqra } = this.currentDrawData;
        
        logger.log('Data:', { nomorPeserta, rowIndex, branchCode, availableMaqraCount: availableMaqra?.length });
        
        if (!availableMaqra || availableMaqra.length === 0) {
            logger.log('❌ No available maqra');
            alert('Tidak ada maqra tersedia');
            return;
        }
        
        logger.log('Starting draw...');
        this.startDraw(nomorPeserta, rowIndex, branchCode, availableMaqra);
    }

    // ===== START MAQRA DRAW ANIMATION ===== (IMPROVED)
    async startDraw(nomorPeserta, rowIndex, branchCode, availableMaqra) {
        logger.log('=== START DRAW ===');
        logger.log('Nomor Peserta:', nomorPeserta);
        logger.log('Row Index:', rowIndex);
        logger.log('Branch Code:', branchCode);
        logger.log('Available Maqra:', availableMaqra.length);
        
        this.isDrawing = true;
        
        const drawBtn = document.getElementById('drawMaqraBtn');
        const card = document.getElementById('maqraCard');
        
        if (!card) {
            logger.log('❌ Card element not found');
            return;
        }
        
        if (drawBtn) {
            logger.log('Disabling draw button');
            drawBtn.disabled = true;
            drawBtn.textContent = '⏳ Mengacak...';
        }

        // Flip card first
        logger.log('Flipping card');
        card.classList.add('flipped');

        // Wait for flip animation
        await new Promise(resolve => setTimeout(resolve, 800));

        // Smooth shuffle animation with easing
        logger.log('Starting smooth shuffle animation...');
        let shuffleCount = 0;
        const totalShuffles = 30; // Increased for smoother effect
        const baseInterval = 50; // Start fast
        const maxInterval = 200; // End slow
        
        // Pre-select final maqra
        const finalRandomIndex = Math.floor(Math.random() * availableMaqra.length);
        const finalMaqra = availableMaqra[finalRandomIndex];
        logger.log('Final maqra pre-selected:', finalMaqra.code);

        const shuffleAnimation = () => {
            if (shuffleCount >= totalShuffles) {
                logger.log('Shuffle complete, showing final result');
                // Show final result
                this.updateCardContent(card, finalMaqra);
                
                // Perform actual draw on server
                setTimeout(() => {
                    this.performActualDraw(nomorPeserta, rowIndex, branchCode, availableMaqra, finalMaqra);
                }, 500);
                return;
            }
            
            // Random maqra for animation (but will end with finalMaqra)
            let tempMaqra;
            if (shuffleCount < totalShuffles - 5) {
                // Random shuffle
                const randomIndex = Math.floor(Math.random() * availableMaqra.length);
                tempMaqra = availableMaqra[randomIndex];
            } else {
                // Last 5 shuffles, show final maqra
                tempMaqra = finalMaqra;
            }
            
            this.updateCardContent(card, tempMaqra);
            
            shuffleCount++;
            logger.log(`Shuffle ${shuffleCount}/${totalShuffles}`);
            
            // Easing: slow down gradually
            const progress = shuffleCount / totalShuffles;
            const easedProgress = this.easeOutCubic(progress);
            const currentInterval = baseInterval + (maxInterval - baseInterval) * easedProgress;
            
            setTimeout(shuffleAnimation, currentInterval);
        };

        shuffleAnimation();
    }

    // Helper: Update card content
    updateCardContent(card, maqra) {
        const backCode = card.querySelector('.maqra-code');
        const backSurah = card.querySelector('.maqra-surah');
        const backAyat = card.querySelector('.maqra-ayat');
        
        if (backCode) backCode.textContent = maqra.code;
        if (backSurah) backSurah.textContent = maqra.surat;
        if (backAyat) backAyat.textContent = `Ayat ${maqra.ayat}`;
    }
    
    // Helper: Easing function for smooth deceleration
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // ===== PERFORM ACTUAL DRAW (Updated signature) =====
    async performActualDraw(nomorPeserta, rowIndex, branchCode, availableMaqra, expectedMaqra) {
        try {
            logger.log('=== PERFORM ACTUAL DRAW ===');
            logger.log('Sending request to server...');
            logger.log('Expected maqra:', expectedMaqra.code);

            const formData = new URLSearchParams({
                action: 'drawMaqra',
                nomorPeserta: nomorPeserta,
                rowIndex: rowIndex,
                branchCode: branchCode
            });

            logger.log('Form data:', formData.toString());

            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            logger.log('Response status:', response.status);
            const result = await response.json();
            logger.log('Server response:', JSON.stringify(result));

            if (result.success) {
                logger.log('✅ Draw successful!');
                // Use the maqra from server (should match expectedMaqra due to random seed)
                this.showDrawnMaqra(result.drawnMaqra);
            } else {
                logger.log('❌ Draw failed:', result.message);
                throw new Error(result.message || 'Gagal mengambil maqra');
            }

        } catch (error) {
            logger.error('❌ Error drawing maqra:', error);
            alert('❌ Terjadi kesalahan: ' + error.message);
            this.closeDrawModal();
        }
    }

    // ===== SHOW DRAWN MAQRA =====
    showDrawnMaqra(maqra) {
        logger.log('=== SHOW DRAWN MAQRA ===');
        logger.log('Maqra:', JSON.stringify(maqra));
        
        const card = document.getElementById('maqraCard');
        const resultDiv = document.getElementById('maqraResult');
        const drawBtn = document.getElementById('drawMaqraBtn');

        // Update card with final result
        const backCode = card.querySelector('.maqra-code');
        const backSurah = card.querySelector('.maqra-surah');
        const backAyat = card.querySelector('.maqra-ayat');
        
        if (backCode) {
            logger.log('Updating card code:', maqra.code);
            backCode.textContent = maqra.code;
        }
        if (backSurah) {
            logger.log('Updating card surah:', maqra.surat);
            backSurah.textContent = maqra.surat;
        }
        if (backAyat) {
            logger.log('Updating card ayat:', maqra.ayat);
            backAyat.textContent = `Ayat ${maqra.ayat}`;
        }

        // Hide draw button
        if (drawBtn) {
            logger.log('Hiding draw button');
            drawBtn.style.display = 'none';
        }

        // Show result
        setTimeout(() => {
            logger.log('Showing result div');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                
                const resultCode = resultDiv.querySelector('.result-code');
                const resultDetails = resultDiv.querySelector('.result-details');
                
                if (resultCode) {
                    resultCode.textContent = maqra.code;
                }
                if (resultDetails) {
                    resultDetails.innerHTML = `
                        <p><strong>${maqra.surat}</strong></p>
                        <p>Ayat ${maqra.ayat}</p>
                    `;
                }

                // Store drawn maqra for confirmation
                this.drawnMaqra = maqra;
                logger.log('✅ Result displayed successfully');
            } else {
                logger.log('❌ Result div not found');
            }
        }, 1000);
    }

    // Update confirmMaqra untuk refresh setelah sukses
    async confirmMaqra() {
        logger.log('=== CONFIRM MAQRA ===');
        logger.log('Drawn maqra:', this.drawnMaqra);
        
        if (!this.drawnMaqra) {
            logger.log('❌ No drawn maqra');
            alert('Tidak ada maqra yang diambil');
            return;
        }

        const confirmBtn = document.querySelector('.btn-confirm-maqra');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '⏳ Menyimpan...';
        }

        try {
            logger.log('Maqra already saved during draw, closing modal...');
            
            setTimeout(() => {
                alert(`✅ Maqra ${this.drawnMaqra.code} berhasil disimpan!\n\n${this.drawnMaqra.surat} ayat ${this.drawnMaqra.ayat}`);
                this.closeDrawModal();
                
                // Refresh page data
                logger.log('Refreshing view data...');
                if (window.viewApp && window.viewApp.viewManager) {
                    window.viewApp.viewManager.refreshData();
                } else {
                    logger.log('⚠️ viewApp not found, reloading page');
                    location.reload();
                }
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

    // ===== CLOSE MODAL (Updated) =====
    closeDrawModal() {
        logger.log('=== CLOSE DRAW MODAL ===');
        
        if (this.currentModal) {
            logger.log('Removing show class');
            this.currentModal.classList.remove('show');
            
            setTimeout(() => {
                if (this.currentModal && this.currentModal.parentNode) {
                    logger.log('Removing modal from DOM');
                    this.currentModal.parentNode.removeChild(this.currentModal);
                }
                this.currentModal = null;
                this.currentDrawData = null;
                this.drawnMaqra = null;
                this.isDrawing = false;
                
                // Release global lock
                this.isProcessingAnyDraw = false;
                logger.log('🔓 Global draw lock released');
                
                // Re-enable all buttons
                this.enableAllDrawButtons();
                
                logger.log('✅ Modal closed, state reset');
            }, 300);
        } else {
            logger.log('⚠️ No current modal to close');
            
            // Ensure lock is released
            this.isProcessingAnyDraw = false;
            this.enableAllDrawButtons();
        }
    }

    // ===== SHOW DRAW MODAL WITH LOADER =====
    async showDrawModalWithLoader(rowData, buttonId) {
        logger.log('=== SHOW DRAW MODAL WITH LOADER ===');
        
        // Show loader on button
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="btn-loader"></span> Memuat...';
        }
        
        // Call original showDrawModal
        await this.showDrawModal(rowData);
        
        // Reset button if modal failed to open
        if (!this.currentModal && button) {
            button.disabled = false;
            button.innerHTML = '🎲 Ambil Maqra';
        }
    }
}