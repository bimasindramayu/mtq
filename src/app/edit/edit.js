import logger from '../../logger.js';
import {
    EditManager
} from './editManager.js';
class EditApp {
    constructor() {
        this.editManager = new EditManager();
        logger.log('🚀 Edit App initialized');
    }
    init() {
        logger.log('=== EDIT APP INITIALIZATION START ===');

        // Setup form submit listener
        const editForm = document.getElementById('editForm');
        if (editForm) {
            editForm.addEventListener('submit', (e) => this.editManager.handleFormSubmit(e));
        }

        // Initialize edit manager
        this.editManager.init();

        logger.log('✅ EDIT APP INITIALIZATION COMPLETE');
    }

    closeResultModal() {
        this.editManager.uiManager.closeResultModal();
        // Redirect to home after success
        if (this.editManager.uiManager.lastRegistrationWasSuccessful) {
            window.location.href = './';
        }
    }
}
// Initialize
const editApp = new EditApp();
window.editApp = editApp; // Expose for global access
document.addEventListener('DOMContentLoaded', () => {
    logger.log('DOM Content Loaded - Edit Page');
    editApp.init();
}, {
    once: true
});
// Global functions
window.closeResultModal = () => editApp.closeResultModal();