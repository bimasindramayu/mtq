import logger from './logger.js';
import { CONFIG } from './config.js';

export class APIService {
    constructor() {
        this.baseURL = CONFIG.APPS_SCRIPT_URL;
    }

    async submitRegistration(formData) {
        try {
            logger.log('Sending registration data to server...');
            
            const response = await fetch(this.baseURL, {
                method: 'POST',
                body: formData
            });

            logger.log('Server response status:', response.status);
            const result = await response.json();
            logger.log('Server response:', JSON.stringify(result));

            return result;
        } catch (error) {
            logger.error('API Error in submitRegistration:', error.message);
            throw error;
        }
    }

    async uploadFiles(fileFormData) {
        try {
            logger.log('Uploading files to server...');
            
            const response = await fetch(this.baseURL, {
                method: 'POST',
                body: fileFormData
            });

            logger.log('File upload response status:', response.status);
            const result = await response.json();
            logger.log('File upload response:', JSON.stringify(result));

            return result;
        } catch (error) {
            logger.error('API Error in uploadFiles:', error.message);
            throw error;
        }
    }

    async getAllData() {
        try {
            logger.log('Fetching all data from server...');
            
            const response = await fetch(`${this.baseURL}?action=getData`);
            const result = await response.json();
            
            logger.log('Data fetched:', result.data?.length || 0, 'rows');
            return result;
        } catch (error) {
            logger.error('API Error in getAllData:', error.message);
            throw error;
        }
    }

    async getRejectedData() {
        try {
            logger.log('Fetching rejected data from server...');
            
            const response = await fetch(`${this.baseURL}?action=getRejectedData`);
            const result = await response.json();
            
            logger.log('Rejected data fetched:', result.data?.length || 0, 'rows');
            return result;
        } catch (error) {
            logger.error('API Error in getRejectedData:', error.message);
            throw error;
        }
    }
}