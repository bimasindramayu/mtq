import logger from './logger.js';
import { CONFIG, isMaqraDrawTimeActive } from './config.js';
import { APIService } from './apiService.js';
import { isMaqraEnabled } from './maqraConfig.js';

export class ViewManager {
    constructor() {
        this.apiService = new APIService();
        this.allData = [];
        this.filteredData = [];
        this.currentKecamatan = '';
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.maqraDrawActive = false;
        logger.log('📊 ViewManager initialized');
    }

    // ===== CHECK MAQRA DRAW TIME =====
    checkMaqraDrawTime() {
        this.maqraDrawActive = isMaqraDrawTimeActive();
        logger.log('Maqra draw active:', this.maqraDrawActive);
        
        if (!this.maqraDrawActive) {
            if (!CONFIG.MAQRA_DRAW_ENABLED) {
                logger.log('Maqra draw globally disabled');
            } else {
                const now = new Date();
                if (now < CONFIG.MAQRA_DRAW_START) {
                    logger.log('Maqra draw not started yet. Starts:', CONFIG.MAQRA_DRAW_START);
                } else if (now > CONFIG.MAQRA_DRAW_END) {
                    logger.log('Maqra draw has ended. Ended:', CONFIG.MAQRA_DRAW_END);
                }
            }
        }
        
        return this.maqraDrawActive;
    }

    // ===== GET KECAMATAN FROM URL =====
    getKecamatanFromURL() {
        let encodedPart = window.location.hash.replace('#', '').trim();

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

            if (decoded.startsWith('kecamatan-')) {
                const kecamatan = decoded.replace('kecamatan-', '');
                logger.log('Kecamatan extracted:', kecamatan);
                return kecamatan;
            }

            logger.error('Invalid format: does not start with "kecamatan-"');
            return null;
        } catch (e) {
            logger.error('Decode error:', e);
            return null;
        }
    }

    // ===== LOAD DATA =====
    async loadData() {
        try {
            logger.log('Loading data for kecamatan:', this.currentKecamatan);

            const result = await this.apiService.getAllData();

            if (!result.success) {
                throw new Error(result.message || 'Gagal mengambil data');
            }

            const kecamatanIdx = result.headers.indexOf('Kecamatan');
            const nomorPesertaIdx = result.headers.indexOf('Nomor Peserta');
            const namaReguIdx = result.headers.indexOf('Nama Regu/Tim');
            const namaLengkapIdx = result.headers.indexOf('Nama Lengkap');
            const cabangIdx = result.headers.indexOf('Cabang Lomba');
            const nikIdx = result.headers.indexOf('NIK');
            const statusIdx = result.headers.indexOf('Status');
            const maqraIdx = result.headers.indexOf('Maqra');

            // Filter data by kecamatan
            this.allData = result.data
                .map((row, index) => ({
                    rowIndex: index,
                    nomorPeserta: row[nomorPesertaIdx] || '-',
                    nama: row[namaReguIdx] && row[namaReguIdx] !== '-' ? row[namaReguIdx] : row[namaLengkapIdx],
                    cabang: row[cabangIdx] || '-',
                    nik: row[nikIdx] || '-',
                    status: row[statusIdx] || 'Menunggu Verifikasi',
                    kecamatan: row[kecamatanIdx] || '-',
                    maqra: row[maqraIdx] || '-'
                }))
                .filter(item => item.kecamatan === this.currentKecamatan);

            this.filteredData = [...this.allData];

            logger.log('Data loaded:', this.allData.length, 'peserta');
            return this.allData;

        } catch (error) {
            logger.error('Error loading data:', error);
            throw error;
        }
    }

    // ===== RENDER DATA (Updated) =====
    renderData() {
        const tbody = document.getElementById('dataTableBody');
        tbody.innerHTML = '';

        if (this.filteredData.length === 0) {
            document.getElementById('noResults').style.display = 'block';
            return;
        }

        document.getElementById('noResults').style.display = 'none';
        
        // Check maqra draw time
        const maqraActive = this.checkMaqraDrawTime();

        this.filteredData.forEach((item, index) => {
            const row = document.createElement('tr');

            let statusClass = 'status-menunggu';
            let statusText = item.status;

            if (statusText === 'Diterima' || statusText === 'Terverifikasi' || statusText === 'Verified') {
                statusClass = 'status-terverifikasi';
                statusText = 'Terverifikasi';
            } else if (statusText === 'Ditolak') {
                statusClass = 'status-ditolak';
            } else if (statusText === 'Menunggu Verifikasi' || statusText === 'Menunggu') {
                statusClass = 'status-menunggu';
                statusText = 'Menunggu Verifikasi';
            }

            // Maqra cell - only show if active
            let maqraCell = '';
            if (maqraActive) {
                if (item.maqra && item.maqra !== '-' && item.maqra.trim() !== '') {
                    // Already has maqra - display it
                    maqraCell = `<span class="maqra-badge" id="maqra-result-${index}">${item.maqra}</span>`;
                } else if (statusText === 'Terverifikasi') {
                    // Check if branch is enabled for maqra
                    const branchCode = this.extractBranchCode(item.cabang);
                    if (branchCode && isMaqraEnabled(branchCode)) {
                        // Can draw maqra
                        const dataIndex = `maqra-data-${index}`;
                        window[dataIndex] = item;
                        maqraCell = `
                            <div id="maqra-cell-${index}">
                                <button class="btn-draw-maqra-small" id="btn-draw-${index}" 
                                        onclick="window.viewApp.handleMaqraDraw(window['${dataIndex}'], ${index})">
                                    🎲 Ambil Maqra
                                </button>
                            </div>
                        `;
                    } else {
                        // Branch not enabled for maqra
                        maqraCell = '<span style="color: #999; font-size: 0.85em;">Tidak tersedia</span>';
                    }
                } else {
                    // Not eligible
                    maqraCell = '<span style="color: #999;">-</span>';
                }
            }

            // Build row HTML
            let rowHTML = `
                <td>${index + 1}</td>
                <td><strong>${item.nomorPeserta}</strong></td>
                <td>${item.nama}</td>
                <td>${item.cabang}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            `;
            
            // Only add maqra column if draw is active
            if (maqraActive) {
                rowHTML += `<td class="maqra-cell">${maqraCell}</td>`;
            }

            row.innerHTML = rowHTML;
            tbody.appendChild(row);
        });

        this.updateStatistics();
    }

    // Extract branch code helper
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

    // ===== UPDATE TABLE HEADERS =====
    updateTableHeaders() {
        const thead = document.querySelector('.data-table thead');
        if (!thead) return;
        
        const maqraActive = this.maqraDrawActive;
        const hasMaqraData = this.allData.some(d => d.maqra && d.maqra !== '-' && d.maqra.trim() !== '');
        
        // Check if maqra header exists
        let maqraHeader = thead.querySelector('th.maqra-header');
        
        if (maqraActive || hasMaqraData) {
            // Show maqra column
            if (!maqraHeader) {
                // Add maqra header if not exists
                const headerRow = thead.querySelector('tr');
                const th = document.createElement('th');
                th.className = 'maqra-header';
                th.textContent = 'Maqra';
                headerRow.appendChild(th);
            }
        } else {
            // Hide maqra column
            if (maqraHeader) {
                maqraHeader.remove();
            }
        }
    }

    // ===== UPDATE STATISTICS =====
    updateStatistics() {
        const total = this.allData.length;
        const menunggu = this.allData.filter(item =>
            item.status === 'Menunggu Verifikasi' || item.status === 'Menunggu'
        ).length;
        const diterima = this.allData.filter(item =>
            item.status === 'Diterima' || item.status === 'Terverifikasi' || item.status === 'Verified'
        ).length;
        const ditolak = this.allData.filter(item => item.status === 'Ditolak').length;

        document.getElementById('totalPeserta').textContent = total;
        document.getElementById('totalMenunggu').textContent = menunggu;
        document.getElementById('totalDiterima').textContent = diterima;
        document.getElementById('totalDitolak').textContent = ditolak;
    }

    // ===== SEARCH DATA =====
    searchData() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        if (!searchTerm.trim()) {
            this.filteredData = [...this.allData];
        } else {
            this.filteredData = this.allData.filter(item => {
                const nama = (item.nama || '').toString().toLowerCase();
                const nomorPeserta = (item.nomorPeserta || '').toString().toLowerCase();
                const nik = (item.nik || '').toString().toLowerCase();
                const cabang = (item.cabang || '').toString().toLowerCase();

                return nama.includes(searchTerm) ||
                    nomorPeserta.includes(searchTerm) ||
                    nik.includes(searchTerm) ||
                    cabang.includes(searchTerm);
            });
        }

        this.renderData();
    }

    // ===== REFRESH DATA =====
    async refreshData() {
        try {
            this.showLoadingState();

            await this.loadData();
            this.renderData();

            this.showContentState();

            alert('✅ Data berhasil diperbarui!');
        } catch (error) {
            logger.error('Refresh error:', error);
            alert('❌ Gagal memperbarui data: ' + error.message);
            this.showContentState();
        }
    }

    // ===== EXPORT TO CSV =====
    exportToCSV() {
        if (this.filteredData.length === 0) {
            alert('Tidak ada data untuk diexport!');
            return;
        }

        let csv = 'No,Nomor Peserta,Nama/Tim,Cabang Lomba,NIK,Status\n';

        this.filteredData.forEach((item, index) => {
            csv += `${index + 1},"${item.nomorPeserta}","${item.nama}","${item.cabang}","${item.nik}","${item.status}"\n`;
        });

        const blob = new Blob([csv], {
            type: 'text/csv;charset=utf-8;'
        });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `Data_Peserta_${this.currentKecamatan}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        logger.log('CSV exported:', this.filteredData.length, 'rows');
    }

    // ===== SORT DATA =====
    sortData(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.filteredData.sort((a, b) => {
            let aVal = a[column] || '';
            let bVal = b[column] || '';

            aVal = aVal.toString().toLowerCase();
            bVal = bVal.toString().toLowerCase();

            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.updateSortIndicators(column);
        this.renderData();
    }

    updateSortIndicators(activeColumn) {
        document.querySelectorAll('.data-table thead th .sort-indicator').forEach(indicator => {
            indicator.textContent = '';
        });

        const columnMap = {
            'nomorPeserta': 1,
            'nama': 2,
            'cabang': 3,
            'status': 4
        };

        const thIndex = columnMap[activeColumn];
        if (thIndex !== undefined) {
            const th = document.querySelectorAll('.data-table thead th')[thIndex];
            const indicator = th.querySelector('.sort-indicator');
            if (indicator) {
                const arrow = this.sortDirection === 'asc' ? '▲' : '▼';
                indicator.textContent = ' ' + arrow;
            }
        }
    }

    // ===== STATE MANAGEMENT =====
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
            this.currentKecamatan = this.getKecamatanFromURL();

            if (!this.currentKecamatan) {
                throw new Error('Link tidak valid.');
            }

            logger.log('Current Kecamatan:', this.currentKecamatan);

            document.getElementById('kecamatanBadge').textContent = this.currentKecamatan;
            
            // Setup headers FIRST before loading data
            this.setupTableHeaders();
            
            this.setupEventListeners();
            await this.loadData();
            this.renderData();
            this.showContentState();

        } catch (error) {
            logger.error('Init error:', error);
            this.showErrorState(error.message);
        }
    }

    // ===== SETUP TABLE HEADERS =====
    setupTableHeaders() {
        const thead = document.querySelector('.data-table thead tr');
        if (!thead) return;
        
        // Clear existing headers
        thead.innerHTML = '';
        
        // Add fixed headers
        const headers = [
            { text: 'No', sortable: false },
            { text: 'Nomor Peserta', sortable: true, key: 'nomorPeserta' },
            { text: 'Nama/Tim', sortable: true, key: 'nama' },
            { text: 'Cabang', sortable: true, key: 'cabang' },
            { text: 'Status', sortable: true, key: 'status' }
        ];
        
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header.text;
            
            if (header.sortable) {
                th.setAttribute('data-sort', header.key);
                th.style.cursor = 'pointer';
                
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                th.appendChild(indicator);
            }
            
            thead.appendChild(th);
        });
        
        // Add maqra header if active
        const maqraActive = this.checkMaqraDrawTime();
        if (maqraActive) {
            const th = document.createElement('th');
            th.className = 'maqra-header';
            th.textContent = 'Maqra';
            thead.appendChild(th);
        }
        
        logger.log('Table headers setup complete');
    }

    // ===== SETUP EVENT LISTENERS =====
    setupEventListeners() {
        const sortHeaders = document.querySelectorAll('.data-table thead th[data-sort]');
        sortHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const column = th.getAttribute('data-sort');
                this.sortData(column);
            });
        });

        logger.log('Event listeners setup complete');
    }
}