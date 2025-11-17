import logger from './logger.js';
import { CONFIG } from './config.js';

export class FileHandler {
    constructor() {
        this.uploadedFiles = {};
    }

    reset() {
        this.uploadedFiles = {};
        logger.log('FileHandler reset');
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    addFile(key, file) {
        this.uploadedFiles[key] = file;
        logger.log(`File added: ${key} (${file.name})`);
    }

    removeFile(key) {
        delete this.uploadedFiles[key];
        logger.log(`File removed: ${key}`);
    }

    getFile(key) {
        return this.uploadedFiles[key];
    }

    getAllFiles() {
        return this.uploadedFiles;
    }

    getFileCount() {
        return Object.keys(this.uploadedFiles).length;
    }

    clearPersonalFiles() {
        this.uploadedFiles = Object.keys(this.uploadedFiles).reduce((acc, key) => {
            if (!key.startsWith('doc')) acc[key] = this.uploadedFiles[key];
            return acc;
        }, {});
        logger.log('Personal files cleared');
    }

    clearTeamFiles() {
        this.uploadedFiles = Object.keys(this.uploadedFiles).reduce((acc, key) => {
            if (!key.startsWith('teamDoc')) acc[key] = this.uploadedFiles[key];
            return acc;
        }, {});
        logger.log('Team files cleared');
    }

    handleFileUpload(input, labelId, fileKey, clearBtnId) {
        const label = document.getElementById(labelId);
        const clearBtn = document.getElementById(clearBtnId);
        
        if (!input.files || input.files.length === 0) {
            label.textContent = 'Belum ada file';
            label.style.color = '#666';
            if (clearBtn) clearBtn.style.display = 'none';
            this.removeFile(fileKey);
            return;
        }
        
        const file = input.files[0];
        logger.log(`File selected: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        
        // Validate file size
        if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
            logger.log(`⚠️ File too large: ${file.name}`);
            label.textContent = `File terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB > ${CONFIG.MAX_FILE_SIZE_MB} MB)`;
            label.style.color = '#dc3545';
            input.value = '';
            if (clearBtn) clearBtn.style.display = 'none';
            this.removeFile(fileKey);
            return;
        }
        
        // File valid
        logger.log(`✅ File valid: ${file.name}`);
        label.textContent = file.name;
        label.style.color = '#28a745';
        if (clearBtn) clearBtn.style.display = 'inline-block';
        this.addFile(fileKey, file);
    }

    setupFileInput(inputId, clearBtnId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearBtnId);
        const label = document.getElementById(`${inputId}Name`);

        if (!input || !clearBtn || !label) {
            logger.log(`⚠️ Element not found: ${inputId}`);
            return;
        }

        input.addEventListener('change', () => {
            logger.log(`📁 ${inputId} change event triggered`);
            
            if (input.files && input.files.length > 0) {
                const file = input.files[0];
                logger.log(`✅ File selected: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
                
                // Validate file size
                if (file.size > CONFIG.MAX_FILE_SIZE_BYTES) {
                    logger.log(`❌ File too large: ${file.name}`);
                    label.textContent = `File terlalu besar (${(file.size / 1024 / 1024).toFixed(2)} MB > ${CONFIG.MAX_FILE_SIZE_MB} MB)`;
                    label.style.color = '#dc3545';
                    input.value = '';
                    clearBtn.style.display = 'none';
                    
                    // Determine correct fileKey
                    let fileKey = inputId;
                    if (inputId.startsWith('personalDoc')) {
                        fileKey = inputId.replace('personalDoc', 'doc');
                    } else if (inputId.startsWith('teamDoc')) {
                        // Keep as is: teamDoc1_1, etc
                    }
                    
                    this.removeFile(fileKey);
                    return;
                }
                
                // File valid - save it
                let fileKey = inputId;
                if (inputId.startsWith('personalDoc')) {
                    fileKey = inputId.replace('personalDoc', 'doc');
                } else if (inputId.startsWith('teamDoc')) {
                    // Keep as is: teamDoc1_1, etc
                }
                
                logger.log(`💾 Saving file with key: ${fileKey}`);
                this.addFile(fileKey, file);
                
                label.textContent = file.name;
                label.style.color = '#28a745';
                clearBtn.style.display = 'inline-flex';
                
                // ✅ TRIGGER VALIDATION UPDATE
                if (window.mtqApp && window.mtqApp.updateSubmitButton) {
                    logger.log(`🔄 Triggering form validation...`);
                    window.mtqApp.updateSubmitButton();
                }
                
            } else {
                logger.log(`⚠️ No file selected or cancelled`);
                
                // Determine correct fileKey
                let fileKey = inputId;
                if (inputId.startsWith('personalDoc')) {
                    fileKey = inputId.replace('personalDoc', 'doc');
                } else if (inputId.startsWith('teamDoc')) {
                    // Keep as is
                }
                
                // Check if file exists in storage
                if (this.getFile(fileKey)) {
                    const existingFile = this.getFile(fileKey);
                    label.textContent = existingFile.name;
                    label.style.color = '#28a745';
                    clearBtn.style.display = 'inline-flex';
                    logger.log(`✅ Restored previous file: ${existingFile.name}`);
                } else {
                    label.textContent = 'Belum ada file';
                    label.style.color = '#666';
                    clearBtn.style.display = 'none';
                    logger.log(`ℹ️ No previous file`);
                }
            }
        });

        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logger.log(`🗑️ Clear button clicked for ${inputId}`);
            
            input.value = '';
            label.textContent = 'Belum ada file';
            label.style.color = '#666';
            
            let fileKey = inputId;
            if (inputId.startsWith('personalDoc')) {
                fileKey = inputId.replace('personalDoc', 'doc');
            } else if (inputId.startsWith('teamDoc')) {
                // Keep as is
            }
            
            logger.log(`🗑️ Removing file with key: ${fileKey}`);
            this.removeFile(fileKey);
            clearBtn.style.display = 'none';
            
            // ✅ TRIGGER VALIDATION UPDATE
            if (window.mtqApp && window.mtqApp.updateSubmitButton) {
                logger.log(`🔄 Triggering form validation...`);
                window.mtqApp.updateSubmitButton();
            }
        });
    }
}