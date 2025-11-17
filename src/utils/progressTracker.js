import logger from './logger.js';

class ProgressTracker {
    constructor() {
        this.totalSteps = 3;
        this.currentStep = 0;
        this.filesTotal = 0;
        this.filesProcessed = 0;
    }

    reset() {
        this.currentStep = 0;
        this.filesTotal = 0;
        this.filesProcessed = 0;
        logger.log('Progress tracker reset');
    }

    setFilesTotal(total) {
        this.filesTotal = total;
        logger.log(`Files total set: ${total}`);
    }

    incrementFile() {
        this.filesProcessed++;
        logger.log(`File processed: ${this.filesProcessed}/${this.filesTotal}`);
    }

    nextStep() {
        this.currentStep++;
        logger.log(`Step ${this.currentStep}/${this.totalSteps}`);
    }

    calculateProgress() {
        let baseProgress = (this.currentStep / this.totalSteps) * 60;
        let fileProgress = (this.filesProcessed / Math.max(this.filesTotal, 1)) * 25;
        return Math.min(Math.round(baseProgress + fileProgress + 15), 99);
    }

    getDetailedMessage() {
        const steps = ['Validasi Data', 'Konversi File', 'Upload ke Server'];
        const step = steps[this.currentStep] || 'Memproses';
        
        if (this.filesTotal > 0 && this.currentStep > 0) {
            return `${step}... (${this.filesProcessed}/${this.filesTotal} file)`;
        }
        return step;
    }

    // ADD NEW METHOD
    getLoadingMessage(progress) {
        const steps = ['Validasi Data', 'Konversi File', 'Upload ke Server'];
        const step = steps[this.currentStep] || 'Memproses';
        
        let message = `Progress: ${progress}%\n${step}`;
        
        if (this.filesTotal > 0 && this.currentStep > 0) {
            message += `\n(${this.filesProcessed}/${this.filesTotal} file)`;
        }
        
        return message;
    }
}

export default new ProgressTracker();