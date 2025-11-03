import { CONFIG } from './config.js';

class Logger {
    constructor() {
        this.enabled = CONFIG.DEV_MODE.loggerEnabled;
    }

    log(message, data = null) {
        if (!this.enabled) return;
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`, data || '');
    }

    error(message, error = null) {
        if (!this.enabled) return;
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] ERROR: ${message}`, error || '');
    }

    group(label) {
        if (!this.enabled) return;
        console.group(label);
    }

    groupEnd() {
        if (!this.enabled) return;
        console.groupEnd();
    }
}

export default new Logger();