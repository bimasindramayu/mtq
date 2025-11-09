// Configuration & Constants
export const CONFIG = {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyw4CWhUl1i5_FSM02kREeFb8r5ktSUDu0rn3WIwTeCx1iGDiE0BwwuheQpZ2ncWb63/exec',
    REGISTRATION_START: new Date('2025-10-29T00:00:00+07:00'),
    REGISTRATION_END: new Date('2025-11-04T00:00:00+07:00'),
    MAX_FILE_SIZE_MB: 5,
    MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
    
    // MAQRA DRAW CONFIGURATION
    MAQRA_DRAW_ENABLED: true, // Master switch untuk pengambilan maqra
    MAQRA_DRAW_START: new Date('2025-11-04T08:00:00+07:00'), // Mulai pengambilan maqra
    MAQRA_DRAW_END: new Date('2025-11-08T23:59:59+07:00'),   // Akhir pengambilan maqra
    
    DEV_MODE: {
        enabled: false,
        loggerEnabled: true
    }
};

// Helper function to check if maqra draw is currently allowed
export function isMaqraDrawTimeActive() {
    if (!CONFIG.MAQRA_DRAW_ENABLED) {
        return true;
    }
    
    const now = new Date();
    return now >= CONFIG.MAQRA_DRAW_START && now <= CONFIG.MAQRA_DRAW_END;
}

export const CABANG_DATA = {
    'Tartil Al Qur\'an Putra|12-11-29|personal|male|TA': { 
        name: 'Tartil Al Qur\'an Putra', 
        maxAge: '12-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TA' 
    },
    'Tartil Al Qur\'an Putri|12-11-29|personal|female|TA': { 
        name: 'Tartil Al Qur\'an Putri', 
        maxAge: '12-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TA' 
    },
    'Tilawah Anak-anak Putra|14-11-29|personal|male|TLA': { 
        name: 'Tilawah Anak-anak Putra', 
        maxAge: '14-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TLA' 
    },
    'Tilawah Anak-anak Putri|14-11-29|personal|female|TLA': { 
        name: 'Tilawah Anak-anak Putri', 
        maxAge: '14-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TLA' 
    },
    'Tilawah Remaja Putra|24-11-29|personal|male|TLR': { 
        name: 'Tilawah Remaja Putra', 
        maxAge: '24-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TLR' 
    },
    'Tilawah Remaja Putri|24-11-29|personal|female|TLR': { 
        name: 'Tilawah Remaja Putri', 
        maxAge: '24-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TLR' 
    },
    'Tilawah Dewasa Putra|40-11-29|personal|male|TLD': { 
        name: 'Tilawah Dewasa Putra', 
        maxAge: '40-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TLD' 
    },
    'Tilawah Dewasa Putri|40-11-29|personal|female|TLD': { 
        name: 'Tilawah Dewasa Putri', 
        maxAge: '40-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TLD' 
    },
    'Qira\'at Mujawwad Putra|40-11-29|personal|male|QM': { 
        name: 'Qira\'at Mujawwad Putra', 
        maxAge: '40-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'QM' 
    },
    'Qira\'at Mujawwad Putri|40-11-29|personal|female|QM': { 
        name: 'Qira\'at Mujawwad Putri', 
        maxAge: '40-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'QM' 
    },
    'Hafalan 1 Juz Putra|15-11-29|personal|male|H1J': { 
        name: 'Hafalan 1 Juz Putra', 
        maxAge: '15-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'H1J' 
    },
    'Hafalan 1 Juz Putri|15-11-29|personal|female|H1J': { 
        name: 'Hafalan 1 Juz Putri', 
        maxAge: '15-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'H1J' 
    },
    'Hafalan 5 Juz Putra|20-11-29|personal|male|H5J': { 
        name: 'Hafalan 5 Juz Putra', 
        maxAge: '20-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'H5J' 
    },
    'Hafalan 5 Juz Putri|20-11-29|personal|female|H5J': { 
        name: 'Hafalan 5 Juz Putri', 
        maxAge: '20-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'H5J' 
    },
    'Hafalan 10 Juz Putra|20-11-29|personal|male|H10J': { 
        name: 'Hafalan 10 Juz Putra', 
        maxAge: '20-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'H10J' 
    },
    'Hafalan 10 Juz Putri|20-11-29|personal|female|H10J': { 
        name: 'Hafalan 10 Juz Putri', 
        maxAge: '20-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'H10J' 
    },
    'Hafalan 20 Juz Putra|22-11-29|personal|male|H20J': { 
        name: 'Hafalan 20 Juz Putra', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'H20J' 
    },
    'Hafalan 20 Juz Putri|22-11-29|personal|female|H20J': { 
        name: 'Hafalan 20 Juz Putri', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'H20J' 
    },
    'Hafalan 30 Juz Putra|22-11-29|personal|male|H30J': { 
        name: 'Hafalan 30 Juz Putra', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'H30J' 
    },
    'Hafalan 30 Juz Putri|22-11-29|personal|female|H30J': { 
        name: 'Hafalan 30 Juz Putri', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'H30J' 
    },
    'Tafsir Arab Putra|22-11-29|personal|male|TFA': { 
        name: 'Tafsir Arab Putra', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TFA' 
    },
    'Tafsir Arab Putri|22-11-29|personal|female|TFA': { 
        name: 'Tafsir Arab Putri', 
        maxAge: '22-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TFA' 
    },
    'Tafsir Indonesia Putra|34-11-29|personal|male|TFI': { 
        name: 'Tafsir Indonesia Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TFI' 
    },
    'Tafsir Indonesia Putri|34-11-29|personal|female|TFI': { 
        name: 'Tafsir Indonesia Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TFI' 
    },
    'Tafsir Inggris Putra|34-11-29|personal|male|TFE': { 
        name: 'Tafsir Inggris Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'TFE' 
    },
    'Tafsir Inggris Putri|34-11-29|personal|female|TFE': { 
        name: 'Tafsir Inggris Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'TFE' 
    },
    'Kaligrafi Naskah Putra|34-11-29|personal|male|KN': { 
        name: 'Kaligrafi Naskah Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'KN' 
    },
    'Kaligrafi Naskah Putri|34-11-29|personal|female|KN': { 
        name: 'Kaligrafi Naskah Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'KN' 
    },
    'Kaligrafi Hiasan Putra|34-11-29|personal|male|KH': { 
        name: 'Kaligrafi Hiasan Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'KH' 
    },
    'Kaligrafi Hiasan Putri|34-11-29|personal|female|KH': { 
        name: 'Kaligrafi Hiasan Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'KH' 
    },
    'Kaligrafi Dekorasi Putra|34-11-29|personal|male|KD': { 
        name: 'Kaligrafi Dekorasi Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'KD' 
    },
    'Kaligrafi Dekorasi Putri|34-11-29|personal|female|KD': { 
        name: 'Kaligrafi Dekorasi Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'KD' 
    },
    'Kaligrafi Kontemporer Putra|34-11-29|personal|male|KK': { 
        name: 'Kaligrafi Kontemporer Putra', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'KK' 
    },
    'Kaligrafi Kontemporer Putri|34-11-29|personal|female|KK': { 
        name: 'Kaligrafi Kontemporer Putri', 
        maxAge: '34-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'KK' 
    },
    'KTIQ Putra|24-11-29|personal|male|KTIQ': { 
        name: 'KTIQ Putra', 
        maxAge: '24-11-29', 
        isTeam: false, 
        genderRestriction: 'male', 
        code: 'KTIQ' 
    },
    'KTIQ Putri|24-11-29|personal|female|KTIQ': { 
        name: 'KTIQ Putri', 
        maxAge: '24-11-29', 
        isTeam: false, 
        genderRestriction: 'female', 
        code: 'KTIQ' 
    },
    'Fahm Al Qur\'an Putra|18-11-29|tim|3|male|FAQ': { 
        name: 'Fahm Al Qur\'an Putra', 
        maxAge: '18-11-29', 
        isTeam: true, 
        memberCount: 3, 
        genderRestriction: 'male', 
        code: 'FAQ' 
    },
    'Fahm Al Qur\'an Putri|18-11-29|tim|3|female|FAQ': { 
        name: 'Fahm Al Qur\'an Putri', 
        maxAge: '18-11-29', 
        isTeam: true, 
        memberCount: 3, 
        genderRestriction: 'female', 
        code: 'FAQ' 
    },
    'Syarh Al Qur\'an Putra|18-11-29|tim|3|male|SAQ': { 
        name: 'Syarh Al Qur\'an Putra', 
        maxAge: '18-11-29', 
        isTeam: true, 
        memberCount: 3, 
        genderRestriction: 'male', 
        code: 'SAQ' 
    },
    'Syarh Al Qur\'an Putri|18-11-29|tim|3|female|SAQ': { 
        name: 'Syarh Al Qur\'an Putri', 
        maxAge: '18-11-29', 
        isTeam: true, 
        memberCount: 3, 
        genderRestriction: 'female', 
        code: 'SAQ' 
    }
};
