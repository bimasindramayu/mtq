import logger from './logger.js';
import {
    ViewManager
} from './viewManager.js';
class ViewApp {
    constructor() {
        this.viewManager = new ViewManager();
        logger.log('🚀 View App initialized');
    }
    init() {
        logger.log('=== VIEW APP INITIALIZATION START ===');

        // Setup search input listener
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.viewManager.searchData());
        }

        // Initialize view manager
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
}

// Initialize
const viewApp = new ViewApp();
window.viewApp = viewApp; // Expose for global access
document.addEventListener('DOMContentLoaded', () => {
    logger.log('DOM Content Loaded - View Page');
    viewApp.init();
}, {
    once: true
});
// Global functions for onclick handlers
window.refreshData = () => viewApp.refreshData();
window.exportToCSV = () => viewApp.exportToCSV();
window.sortData = (column) => viewApp.sortData(column);
window.searchData = () => viewApp.viewManager.searchData();