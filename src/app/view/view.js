import logger from '../../utils/logger.js';
import { ViewManager } from './viewManager.js';
import { MaqraManager } from './maqraManager.js';

class ViewApp {
    constructor() {
        this.viewManager = new ViewManager();
        this.maqraManager = new MaqraManager();
        window.maqraManager = this.maqraManager;
        logger.log('🚀 View App initialized');
    }

    init() {
        logger.log('=== VIEW APP INITIALIZATION START ===');
        this.viewManager.init();
        logger.log('✅ VIEW APP INITIALIZATION COMPLETE');
    }

    refreshData() {
        this.viewManager.refreshData();
    }

    exportToCSV() {
        this.viewManager.exportToCSV();
    }

    sortData(column) {
        this.viewManager.sortData(column);
    }

    // ===== HANDLE MAQRA DRAW WITH LOADING =====
    async handleMaqraDraw(rowData, cellIndex) {
        logger.log('=== HANDLE MAQRA DRAW ===');
        logger.log('Cell index:', cellIndex);
        logger.log('Row data:', rowData);
        
        const buttonId = `btn-draw-${cellIndex}`;
        
        // Store cell index globally for later update
        window._maqraCellIndex = cellIndex;
        window._maqraRowData = rowData;
        
        logger.log('Calling showDrawModalWithLoader...');
        
        // Call maqra manager with loader (INI YANG DIPERBAIKI)
        await this.maqraManager.showDrawModalWithLoader(rowData, buttonId);
        
        logger.log('showDrawModalWithLoader completed');
    }

    // ===== UPDATE MAQRA CELL AFTER DRAW =====
    updateMaqraCell(cellIndex, maqraText) {
        logger.log('=== UPDATE MAQRA CELL ===');
        logger.log('Cell index:', cellIndex);
        logger.log('Maqra text:', maqraText);
        
        const cellId = `maqra-cell-${cellIndex}`;
        const cell = document.getElementById(cellId);
        
        logger.log('Looking for cell:', cellId);
        logger.log('Cell found:', !!cell);
        
        if (cell) {
            cell.innerHTML = `<span class="maqra-badge">${maqraText}</span>`;
            logger.log('✅ Maqra cell updated successfully');
        } else {
            logger.log('❌ Cell not found:', cellId);
            // Fallback: try to find by button and replace parent
            const button = document.getElementById(`btn-draw-${cellIndex}`);
            if (button && button.parentElement) {
                logger.log('Found button parent, updating...');
                button.parentElement.innerHTML = `<span class="maqra-badge">${maqraText}</span>`;
                logger.log('✅ Updated via button parent');
            }
        }
    }
}

// Initialize
const viewApp = new ViewApp();
window.viewApp = viewApp;

document.addEventListener('DOMContentLoaded', () => {
    logger.log('DOM Content Loaded - View Page');
    viewApp.init();
}, { once: true });

// Global functions
window.refreshData = () => viewApp.refreshData();
window.exportToCSV = () => viewApp.exportToCSV();
window.sortData = (column) => viewApp.sortData(column);
window.searchData = () => viewApp.viewManager.searchData();