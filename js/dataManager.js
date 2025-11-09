import logger from './logger.js';
import { APIService } from './apiService.js';

export class DataManager {
    constructor() {
        this.apiService = new APIService();
        this.rejectedDataInitialized = false;
    }

    // ===== REJECTED DATA =====
    async loadRejectedData() {
        try {
            logger.log('📊 Starting to load rejected data from server');
            
            this.showPageLoading(true);
            this.showLoadStatus('⏳ Data sedang dimuat...');
            
            const result = await this.apiService.getRejectedData();
            
            if (result.success) {
                logger.log('✅ Success! Data received');
                
                if (result.data && result.data.length > 0) {
                    logger.log(`✅ Found ${result.data.length} rejected participants`);
                    this.displayRejectedData(result.data);
                    this.showRejectedContainer(true);
                    this.showLoadStatus(`✅ Berhasil dimuat (${result.data.length} peserta ditolak)`, 'success');
                } else {
                    logger.log('ℹ️ No rejected data found');
                    this.showNoDataMessage(true);
                    this.showLoadStatus('ℹ️ Tidak ada data peserta yang ditolak saat ini', 'info');
                }
            } else {
                logger.error('❌ API Error:', result.message);
                this.showLoadStatus('❌ Gagal: ' + (result.message || 'Error tidak diketahui'), 'error');
            }
            
            this.showPageLoading(false);
            logger.log('Load rejected data complete');
            
        } catch (error) {
            logger.error('❌ Fetch Error:', error.message);
            this.showPageLoading(false);
            this.showLoadStatus('❌ Kesalahan Network: ' + error.message, 'error');
        }
    }

    displayRejectedData(data) {
        logger.log('Displaying', data.length, 'rows to table');
        
        const tbody = document.getElementById('rejectedDataBody');
        const noDataMsg = document.getElementById('noDataMessage');
        
        if (tbody) tbody.innerHTML = '';
        
        if (!data || data.length === 0) {
            if (noDataMsg) noDataMsg.style.display = 'block';
            logger.log('No data to display');
            return;
        }
        
        if (noDataMsg) noDataMsg.style.display = 'none';
        
        data.forEach((item, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td><strong>${item.nomorPeserta || '-'}</strong></td>
                <td>${item.namaTimPeserta || '-'}</td>
                <td>${item.cabang || '-'}</td>
                <td>${item.kecamatan || '-'}</td>
                <td><span class="status-badge status-ditolak">Ditolak</span></td>
                <td>${item.alasan || '-'}</td>
            `;
            if (tbody) tbody.appendChild(row);
        });
        
        logger.log(`✅ ${data.length} rows displayed successfully`);
    }

    showPageLoading(show) {
        const pageLoadingDiv = document.getElementById('pageLoadingIndicator');
        if (pageLoadingDiv) {
            pageLoadingDiv.style.display = show ? 'block' : 'none';
        }
    }

    showLoadStatus(message, type = 'info') {
        const loadStatusDiv = document.getElementById('loadStatus');
        if (!loadStatusDiv) return;

        loadStatusDiv.innerHTML = message;
        loadStatusDiv.style.display = 'block';
        
        if (type === 'success') {
            loadStatusDiv.style.background = '#d4edda';
            loadStatusDiv.style.color = '#155724';
        } else if (type === 'error') {
            loadStatusDiv.style.background = '#ffe7e7';
            loadStatusDiv.style.color = '#c82333';
        } else {
            loadStatusDiv.style.background = '#cce5ff';
            loadStatusDiv.style.color = '#004085';
        }
    }

    showRejectedContainer(show) {
        const container = document.getElementById('rejectedDataContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (container) container.style.display = show ? 'block' : 'none';
        if (emptyState) emptyState.style.display = show ? 'none' : 'block';
    }

    showNoDataMessage(show) {
        const noDataMsg = document.getElementById('noDataMessage');
        if (noDataMsg) noDataMsg.style.display = show ? 'block' : 'none';
    }

    // ===== SEARCH BY NIK =====
    async searchPesertaByNIK(nik) {
        try {
            logger.log('🔍 Starting NIK search for:', nik);
            
            if (!nik || !/^\d{16}$/.test(nik)) {
                throw new Error('NIK harus terdiri dari 16 digit angka');
            }
            
            this.showSearchLoading(true);
            this.showSearchEmptyState(false);
            this.showSearchNotFound(false);
            this.showSearchResultTable(false);
            
            const result = await this.apiService.getAllData();
            
            if (!result.success) {
                throw new Error(result.message || 'Gagal mengambil data');
            }
            
            const foundRows = this.findRowsByNIK(result, nik);
            
            this.showSearchLoading(false);
            
            // Tampilkan container hasil pencarian
            const searchResultContainer = document.getElementById('searchResultContainer');
            if (searchResultContainer) {
                searchResultContainer.style.display = 'block';
            }
            
            if (foundRows.length === 0) {
                logger.log('⚠️ No data found for NIK:', nik);
                this.showSearchNotFound(true);
                this.showSearchResultTable(false);
            } else {
                logger.log(`✅ Found ${foundRows.length} record(s)`);
                this.displaySearchResult(foundRows);
                this.showSearchNotFound(false);
                this.showSearchResultTable(true);
            }
            
            this.showSearchEmptyState(false);
            
        } catch (error) {
            logger.error('Search error:', error.message);
            this.showSearchLoading(false);
            alert('Terjadi kesalahan saat mencari data: ' + error.message);
        }
    }

    findRowsByNIK(result, nikInput) {
        const foundRows = [];
        
        const nikColIdx = result.headers.indexOf('NIK');
        const nomorPesertaColIdx = result.headers.indexOf('Nomor Peserta');
        const cabangColIdx = result.headers.indexOf('Cabang Lomba');
        const kecamatanColIdx = result.headers.indexOf('Kecamatan');
        const namaReguColIdx = result.headers.indexOf('Nama Regu/Tim');
        const namaLengkapColIdx = result.headers.indexOf('Nama Lengkap');
        const statusColIdx = result.headers.indexOf('Status');
        const alasanColIdx = result.headers.indexOf('Alasan Ditolak');
        
        const memberNikCols = [
            result.headers.indexOf('Anggota Tim #1 - NIK'),
            result.headers.indexOf('Anggota Tim #2 - NIK'),
            result.headers.indexOf('Anggota Tim #3 - NIK')
        ];
        
        logger.log('Searching through', result.data.length, 'records...');
        
        for (let i = 0; i < result.data.length; i++) {
            const row = result.data[i];
            let nikFound = false;
            
            // Check personal NIK
            if (row[nikColIdx] && row[nikColIdx].toString().trim() === nikInput) {
                nikFound = true;
            }
            
            // Check member NIKs
            if (!nikFound) {
                for (let memberColIdx of memberNikCols) {
                    if (memberColIdx !== -1 && row[memberColIdx] && row[memberColIdx].toString().trim() === nikInput) {
                        nikFound = true;
                        break;
                    }
                }
            }
            
            if (nikFound) {
                foundRows.push({
                    nomorPeserta: row[nomorPesertaColIdx] || '-',
                    namaTimPeserta: row[namaReguColIdx] && row[namaReguColIdx] !== '-' ? row[namaReguColIdx] : row[namaLengkapColIdx],
                    cabang: row[cabangColIdx] || '-',
                    kecamatan: row[kecamatanColIdx] || '-',
                    status: row[statusColIdx] || 'Menunggu Verifikasi',
                    alasan: row[alasanColIdx] || '-'
                });
                
                logger.log('✅ Found match at row', i + 2);
            }
        }
        
        return foundRows;
    }

    displaySearchResult(data) {
        logger.log('Displaying', data.length, 'search result(s)');
        
        const tbody = document.getElementById('searchResultBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        data.forEach((item, index) => {
            const row = document.createElement('tr');
            
            let statusClass = 'status-menunggu-verifikasi';
            let statusText = item.status;
            
            if (statusText === 'Ditolak') {
                statusClass = 'status-ditolak';
            } else if (statusText === 'Diterima' || statusText === 'Terverifikasi' || statusText === 'Verified') {
                statusClass = 'status-diterima';
                statusText = 'Terverifikasi';
            }
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td><strong>${item.nomorPeserta || '-'}</strong></td>
                <td>${item.namaTimPeserta || '-'}</td>
                <td>${item.cabang || '-'}</td>
                <td>${item.kecamatan || '-'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${item.alasan || '-'}</td>
            `;
            tbody.appendChild(row);
        });
        
        logger.log('✅ Search results displayed');
    }

    showSearchLoading(show) {
        const searchLoadingDiv = document.getElementById('searchLoadingIndicator');
        if (searchLoadingDiv) {
            searchLoadingDiv.style.display = show ? 'block' : 'none';
        }
    }

    showSearchNotFound(show) {
        const searchNotFound = document.getElementById('searchNotFound');
        if (searchNotFound) {
            searchNotFound.style.display = show ? 'block' : 'none';
        }
    }

    showSearchResultTable(show) {
        const searchResultTable = document.getElementById('searchResultTable');
        if (searchResultTable) {
            searchResultTable.style.display = show ? 'block' : 'none';
        }
    }

    showSearchEmptyState(show) {
        const searchEmptyState = document.getElementById('searchEmptyState');
        if (searchEmptyState) {
            searchEmptyState.style.display = show ? 'block' : 'none';
        }
    }
}