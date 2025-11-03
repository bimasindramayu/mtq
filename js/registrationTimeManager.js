import logger from './logger.js';
import { CONFIG } from './config.js';

export class RegistrationTimeManager {
    constructor() {
        this.countdownInterval = null;
    }

    checkRegistrationTime() {
        const now = new Date();
        const isOpen = now >= CONFIG.REGISTRATION_START && now <= CONFIG.REGISTRATION_END;
        
        const registrationClosed = document.getElementById('registrationClosed');
        const registrationOpen = document.getElementById('registrationOpen');

        const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' };
        const formattedDateStart = CONFIG.REGISTRATION_START.toLocaleDateString('id-ID', options);
        const hoursStart = String(CONFIG.REGISTRATION_START.getHours()).padStart(2, '0');
        const minutesStart = String(CONFIG.REGISTRATION_START.getMinutes()).padStart(2, '0');
        const formattedDateEnd = CONFIG.REGISTRATION_END.toLocaleDateString('id-ID', options);
        const hoursEnd = String(CONFIG.REGISTRATION_END.getHours()).padStart(2, '0');
        const minutesEnd = String(CONFIG.REGISTRATION_END.getMinutes()).padStart(2, '0');
        if (isOpen) {
            if (registrationClosed) registrationClosed.style.display = 'none';
            if (registrationOpen) registrationOpen.style.display = 'block';
            this.stopCountdown();
            logger.log('Registration is OPEN');
        } else {
            if (registrationClosed) registrationClosed.style.display = 'block';
            if (registrationOpen) registrationOpen.style.display = 'none';
            
            if (now < CONFIG.REGISTRATION_START) {
                document.getElementById('closedMessage').textContent = 
                    `Pendaftaran peserta MTQ ke-55 akan dibuka pada tanggal ${formattedDateStart} pukul ${hoursStart}:${minutesStart} WIB.`;
                document.getElementById('countdownTimer').style.display = 'block';
                this.startCountdown();
                logger.log('Registration CLOSED - before start time');
            } else {
                document.getElementById('closedMessage').textContent = 
                    `Mohon maaf, pendaftaran peserta MTQ ke-55 telah ditutup pada tanggal ${formattedDateEnd} pukul ${hoursEnd}:${minutesEnd} WIB.`;
                document.getElementById('countdownTimer').style.display = 'none';
                this.stopCountdown();
                logger.log('Registration CLOSED - after end time');
            }
        }
        
        return isOpen;
    }

    startCountdown() {
        const update = () => {
            const now = new Date();
            const diff = CONFIG.REGISTRATION_START - now;
            
            if (diff <= 0) {
                this.stopCountdown();
                this.checkRegistrationTime();
                return;
            }
            
            document.getElementById('days').textContent = 
                String(Math.floor(diff / (1000*60*60*24))).padStart(2, '0');
            document.getElementById('hours').textContent = 
                String(Math.floor((diff % (1000*60*60*24)) / (1000*60*60))).padStart(2, '0');
            document.getElementById('minutes').textContent = 
                String(Math.floor((diff % (1000*60*60)) / (1000*60))).padStart(2, '0');
            document.getElementById('seconds').textContent = 
                String(Math.floor((diff % (1000*60)) / 1000)).padStart(2, '0');
        };
        
        update();
        this.countdownInterval = setInterval(update, 1000);
        logger.log('Countdown started');
    }

    stopCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
            logger.log('Countdown stopped');
        }
    }

    updateRejectedDataTabVisibility() {
        const now = new Date();
        const isOpen = now >= CONFIG.REGISTRATION_START && now <= CONFIG.REGISTRATION_END;
        
        const pesertaDitolakClosed = document.getElementById('pesertaDitolakClosed');
        const pesertaDitolakOpen = document.getElementById('pesertaDitolakOpen');
        
        logger.log('Checking registration status for rejected data tab - isOpen:', isOpen);
        
        if (isOpen) {
            if (pesertaDitolakClosed) pesertaDitolakClosed.style.display = 'none';
            if (pesertaDitolakOpen) pesertaDitolakOpen.style.display = 'block';
        } else {
            if (pesertaDitolakClosed) pesertaDitolakClosed.style.display = 'block';
            if (pesertaDitolakOpen) pesertaDitolakOpen.style.display = 'none';
            logger.log('Registration closed - hiding rejected data content');
        }
    }
}