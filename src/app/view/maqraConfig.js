// maqraConfig.js
export const MAQRA_CONFIG = {
    // Enable/disable maqra per cabang
    // Set false untuk cabang yang tidak boleh ambil maqra
    ENABLED_BRANCHES: [
        'TA',    // Tartil Al Qur'an - ENABLED
        'TLA',   // Tilawah Anak-anak - ENABLED
        'TLR',   // Tilawah Remaja - ENABLED
        // 'TLD',   // Tilawah Dewasa - DISABLED (commented out)
        'QM',    // Qira'at Mujawwad - ENABLED
        'H1J',   // Hafalan 1 Juz - ENABLED
        'H5J',   // Hafalan 5 Juz - ENABLED
        'H10J',  // Hafalan 10 Juz - ENABLED
        'H20J',  // Hafalan 20 Juz - ENABLED
        'H30J',  // Hafalan 30 Juz - ENABLED
        'TFI',   // Tafsir Indonesia - ENABLED
        'TFA',   // Tafsir Arab - ENABLED
        'TFE'    // Tafsir Inggris - ENABLED
        // FAQ, SAQ, KN, KH, KD, KK, KTIQ - DISABLED (not in list)
    ],
    
    // Maqra data untuk setiap cabang
    MAQRA_DATA: {
        'TA': generateMaqraList('TA', 62, [
            { surat: 'Al-Fatihah', ayat: '1-7' },
            { surat: 'Al-Baqarah', ayat: '1-5' },
            { surat: 'Al-Baqarah', ayat: '183-186' },
            { surat: 'Ali Imran', ayat: '1-9' },
            { surat: 'Ali Imran', ayat: '190-200' },
            { surat: 'An-Nisa', ayat: '1-10' },
            { surat: 'Al-Maidah', ayat: '1-5' },
            { surat: 'Al-An\'am', ayat: '1-10' },
            { surat: 'Al-A\'raf', ayat: '1-10' },
            { surat: 'Al-Anfal', ayat: '1-10' }
        ]),
        'TLA': generateMaqraList('TLA', 62, [
            { surat: 'At-Taubah', ayat: '1-10' },
            { surat: 'Yunus', ayat: '1-10' },
            { surat: 'Hud', ayat: '1-10' },
            { surat: 'Yusuf', ayat: '1-10' },
            { surat: 'Ar-Ra\'d', ayat: '1-10' },
            { surat: 'Ibrahim', ayat: '1-10' },
            { surat: 'Al-Hijr', ayat: '1-10' },
            { surat: 'An-Nahl', ayat: '1-10' },
            { surat: 'Al-Isra', ayat: '1-10' },
            { surat: 'Al-Kahf', ayat: '1-10' }
        ]),
        'TLR': generateMaqraList('TLR', 62, [
            { surat: 'Maryam', ayat: '1-10' },
            { surat: 'Taha', ayat: '1-10' },
            { surat: 'Al-Anbiya', ayat: '1-10' },
            { surat: 'Al-Hajj', ayat: '1-10' },
            { surat: 'Al-Mu\'minun', ayat: '1-10' },
            { surat: 'An-Nur', ayat: '1-10' },
            { surat: 'Al-Furqan', ayat: '1-10' },
            { surat: 'Ash-Shu\'ara', ayat: '1-10' },
            { surat: 'An-Naml', ayat: '1-10' },
            { surat: 'Al-Qasas', ayat: '1-10' }
        ]),
        'TLD': generateMaqraList('TLD', 62, [
            { surat: 'Al-Ankabut', ayat: '1-10' },
            { surat: 'Ar-Rum', ayat: '1-10' },
            { surat: 'Luqman', ayat: '1-10' },
            { surat: 'As-Sajdah', ayat: '1-10' },
            { surat: 'Al-Ahzab', ayat: '1-10' },
            { surat: 'Saba', ayat: '1-10' },
            { surat: 'Fatir', ayat: '1-10' },
            { surat: 'Ya-Sin', ayat: '1-10' },
            { surat: 'As-Saffat', ayat: '1-10' },
            { surat: 'Sad', ayat: '1-10' }
        ]),
        'QM': generateMaqraList('QM', 62, [
            { surat: 'Az-Zumar', ayat: '1-10' },
            { surat: 'Ghafir', ayat: '1-10' },
            { surat: 'Fussilat', ayat: '1-10' },
            { surat: 'Ash-Shura', ayat: '1-10' },
            { surat: 'Az-Zukhruf', ayat: '1-10' },
            { surat: 'Ad-Dukhan', ayat: '1-10' },
            { surat: 'Al-Jathiyah', ayat: '1-10' },
            { surat: 'Al-Ahqaf', ayat: '1-10' },
            { surat: 'Muhammad', ayat: '1-10' },
            { surat: 'Al-Fath', ayat: '1-10' }
        ]),
        'H1J': generateMaqraList('H1J', 62, [
            { surat: 'Al-Hujurat', ayat: '1-18' },
            { surat: 'Qaf', ayat: '1-45' },
            { surat: 'Adh-Dhariyat', ayat: '1-60' },
            { surat: 'At-Tur', ayat: '1-49' },
            { surat: 'An-Najm', ayat: '1-62' },
            { surat: 'Al-Qamar', ayat: '1-55' },
            { surat: 'Ar-Rahman', ayat: '1-78' },
            { surat: 'Al-Waqi\'ah', ayat: '1-96' },
            { surat: 'Al-Hadid', ayat: '1-29' },
            { surat: 'Al-Mujadilah', ayat: '1-22' }
        ]),
        'H5J': generateMaqraList('H5J', 62, [
            { surat: 'Al-Hashr', ayat: '1-24' },
            { surat: 'Al-Mumtahanah', ayat: '1-13' },
            { surat: 'As-Saff', ayat: '1-14' },
            { surat: 'Al-Jumu\'ah', ayat: '1-11' },
            { surat: 'Al-Munafiqun', ayat: '1-11' },
            { surat: 'At-Taghabun', ayat: '1-18' },
            { surat: 'At-Talaq', ayat: '1-12' },
            { surat: 'At-Tahrim', ayat: '1-12' },
            { surat: 'Al-Mulk', ayat: '1-30' },
            { surat: 'Al-Qalam', ayat: '1-52' }
        ]),
        'H10J': generateMaqraList('H10J', 62, [
            { surat: 'Al-Haqqah', ayat: '1-52' },
            { surat: 'Al-Ma\'arij', ayat: '1-44' },
            { surat: 'Nuh', ayat: '1-28' },
            { surat: 'Al-Jinn', ayat: '1-28' },
            { surat: 'Al-Muzzammil', ayat: '1-20' },
            { surat: 'Al-Muddaththir', ayat: '1-56' },
            { surat: 'Al-Qiyamah', ayat: '1-40' },
            { surat: 'Al-Insan', ayat: '1-31' },
            { surat: 'Al-Mursalat', ayat: '1-50' },
            { surat: 'An-Naba', ayat: '1-40' }
        ]),
        'H20J': generateMaqraList('H20J', 62, [
            { surat: 'An-Nazi\'at', ayat: '1-46' },
            { surat: 'Abasa', ayat: '1-42' },
            { surat: 'At-Takwir', ayat: '1-29' },
            { surat: 'Al-Infitar', ayat: '1-19' },
            { surat: 'Al-Mutaffifin', ayat: '1-36' },
            { surat: 'Al-Inshiqaq', ayat: '1-25' },
            { surat: 'Al-Buruj', ayat: '1-22' },
            { surat: 'At-Tariq', ayat: '1-17' },
            { surat: 'Al-A\'la', ayat: '1-19' },
            { surat: 'Al-Ghashiyah', ayat: '1-26' }
        ]),
        'H30J': generateMaqraList('H30J', 62, [
            { surat: 'Al-Fajr', ayat: '1-30' },
            { surat: 'Al-Balad', ayat: '1-20' },
            { surat: 'Ash-Shams', ayat: '1-15' },
            { surat: 'Al-Lail', ayat: '1-21' },
            { surat: 'Ad-Duha', ayat: '1-11' },
            { surat: 'Ash-Sharh', ayat: '1-8' },
            { surat: 'At-Tin', ayat: '1-8' },
            { surat: 'Al-Alaq', ayat: '1-19' },
            { surat: 'Al-Qadr', ayat: '1-5' },
            { surat: 'Al-Bayyinah', ayat: '1-8' }
        ]),
        'TFI': generateMaqraList('TFI', 62, [
            { surat: 'Az-Zalzalah', ayat: '1-8' },
            { surat: 'Al-Adiyat', ayat: '1-11' },
            { surat: 'Al-Qari\'ah', ayat: '1-11' },
            { surat: 'At-Takathur', ayat: '1-8' },
            { surat: 'Al-Asr', ayat: '1-3' },
            { surat: 'Al-Humazah', ayat: '1-9' },
            { surat: 'Al-Fil', ayat: '1-5' },
            { surat: 'Quraish', ayat: '1-4' },
            { surat: 'Al-Ma\'un', ayat: '1-7' },
            { surat: 'Al-Kawthar', ayat: '1-3' }
        ]),
        'TFA': generateMaqraList('TFA', 62, [
            { surat: 'Al-Kafirun', ayat: '1-6' },
            { surat: 'An-Nasr', ayat: '1-3' },
            { surat: 'Al-Masad', ayat: '1-5' },
            { surat: 'Al-Ikhlas', ayat: '1-4' },
            { surat: 'Al-Falaq', ayat: '1-5' },
            { surat: 'An-Nas', ayat: '1-6' },
            { surat: 'Al-Fatihah', ayat: '1-7' },
            { surat: 'Al-Baqarah', ayat: '255-257' },
            { surat: 'Ali Imran', ayat: '26-27' },
            { surat: 'Al-Isra', ayat: '23-24' }
        ]),
        'TFE': generateMaqraList('TFE', 62, [
            { surat: 'Al-Baqarah', ayat: '1-5' },
            { surat: 'Al-Baqarah', ayat: '183-186' },
            { surat: 'Ali Imran', ayat: '190-200' },
            { surat: 'An-Nisa', ayat: '1-10' },
            { surat: 'Al-Maidah', ayat: '1-5' },
            { surat: 'Al-An\'am', ayat: '1-10' },
            { surat: 'Al-A\'raf', ayat: '1-10' },
            { surat: 'Al-Anfal', ayat: '1-10' },
            { surat: 'At-Taubah', ayat: '1-10' },
            { surat: 'Yunus', ayat: '1-10' }
        ]),
        'FAQ': generateMaqraList('FAQ', 62, [
            { surat: 'Hud', ayat: '1-10' },
            { surat: 'Yusuf', ayat: '1-10' },
            { surat: 'Ar-Ra\'d', ayat: '1-10' },
            { surat: 'Ibrahim', ayat: '1-10' },
            { surat: 'Al-Hijr', ayat: '1-10' },
            { surat: 'An-Nahl', ayat: '1-10' },
            { surat: 'Al-Isra', ayat: '1-10' },
            { surat: 'Al-Kahf', ayat: '1-10' },
            { surat: 'Maryam', ayat: '1-10' },
            { surat: 'Taha', ayat: '1-10' }
        ]),
        'SAQ': generateMaqraList('SAQ', 62, [
            { surat: 'Al-Anbiya', ayat: '1-10' },
            { surat: 'Al-Hajj', ayat: '1-10' },
            { surat: 'Al-Mu\'minun', ayat: '1-10' },
            { surat: 'An-Nur', ayat: '1-10' },
            { surat: 'Al-Furqan', ayat: '1-10' },
            { surat: 'Ash-Shu\'ara', ayat: '1-10' },
            { surat: 'An-Naml', ayat: '1-10' },
            { surat: 'Al-Qasas', ayat: '1-10' },
            { surat: 'Al-Ankabut', ayat: '1-10' },
            { surat: 'Ar-Rum', ayat: '1-10' }
        ]),
        'KN': generateMaqraList('KN', 62, [
            { surat: 'Luqman', ayat: '1-10' },
            { surat: 'As-Sajdah', ayat: '1-10' },
            { surat: 'Al-Ahzab', ayat: '1-10' },
            { surat: 'Saba', ayat: '1-10' },
            { surat: 'Fatir', ayat: '1-10' },
            { surat: 'Ya-Sin', ayat: '1-10' },
            { surat: 'As-Saffat', ayat: '1-10' },
            { surat: 'Sad', ayat: '1-10' },
            { surat: 'Az-Zumar', ayat: '1-10' },
            { surat: 'Ghafir', ayat: '1-10' }
        ]),
        'KH': generateMaqraList('KH', 62, [
            { surat: 'Fussilat', ayat: '1-10' },
            { surat: 'Ash-Shura', ayat: '1-10' },
            { surat: 'Az-Zukhruf', ayat: '1-10' },
            { surat: 'Ad-Dukhan', ayat: '1-10' },
            { surat: 'Al-Jathiyah', ayat: '1-10' },
            { surat: 'Al-Ahqaf', ayat: '1-10' },
            { surat: 'Muhammad', ayat: '1-10' },
            { surat: 'Al-Fath', ayat: '1-10' },
            { surat: 'Al-Hujurat', ayat: '1-18' },
            { surat: 'Qaf', ayat: '1-10' }
        ]),
        'KD': generateMaqraList('KD', 62, [
            { surat: 'Adh-Dhariyat', ayat: '1-10' },
            { surat: 'At-Tur', ayat: '1-10' },
            { surat: 'An-Najm', ayat: '1-10' },
            { surat: 'Al-Qamar', ayat: '1-10' },
            { surat: 'Ar-Rahman', ayat: '1-10' },
            { surat: 'Al-Waqi\'ah', ayat: '1-10' },
            { surat: 'Al-Hadid', ayat: '1-10' },
            { surat: 'Al-Mujadilah', ayat: '1-10' },
            { surat: 'Al-Hashr', ayat: '1-10' },
            { surat: 'Al-Mumtahanah', ayat: '1-10' }
        ]),
        'KK': generateMaqraList('KK', 62, [
            { surat: 'As-Saff', ayat: '1-14' },
            { surat: 'Al-Jumu\'ah', ayat: '1-11' },
            { surat: 'Al-Munafiqun', ayat: '1-11' },
            { surat: 'At-Taghabun', ayat: '1-18' },
            { surat: 'At-Talaq', ayat: '1-12' },
            { surat: 'At-Tahrim', ayat: '1-12' },
            { surat: 'Al-Mulk', ayat: '1-10' },
            { surat: 'Al-Qalam', ayat: '1-10' },
            { surat: 'Al-Haqqah', ayat: '1-10' },
            { surat: 'Al-Ma\'arij', ayat: '1-10' }
        ]),
        'KTIQ': generateMaqraList('KTIQ', 62, [
            { surat: 'Nuh', ayat: '1-28' },
            { surat: 'Al-Jinn', ayat: '1-28' },
            { surat: 'Al-Muzzammil', ayat: '1-20' },
            { surat: 'Al-Muddaththir', ayat: '1-10' },
            { surat: 'Al-Qiyamah', ayat: '1-10' },
            { surat: 'Al-Insan', ayat: '1-10' },
            { surat: 'Al-Mursalat', ayat: '1-10' },
            { surat: 'An-Naba', ayat: '1-10' },
            { surat: 'An-Nazi\'at', ayat: '1-10' },
            { surat: 'Abasa', ayat: '1-10' }
        ])
    }
};

// Helper function to generate maqra list
function generateMaqraList(branchCode, count, surahData) {
    const maqraList = [];
    
    for (let i = 1; i <= count; i++) {
        const surahIndex = (i - 1) % surahData.length;
        const surah = surahData[surahIndex];
        
        maqraList.push({
            code: `${branchCode}${String(i).padStart(branchCode.length > 2 ? 2 : 3, '0')}`,
            surat: surah.surat,
            ayat: surah.ayat,
            description: `${surah.surat} ayat ${surah.ayat}`,
            available: true
        });
    }
    
    return maqraList;
}

// Function to check if maqra is enabled for a branch
export function isMaqraEnabled(branchCode) {
    const enabled = MAQRA_CONFIG.ENABLED_BRANCHES.includes(branchCode);
    // logger.log(`Checking maqra enabled for ${branchCode}: ${enabled}`);
    return enabled;
}

// Function to get available maqra for a branch
export function getAvailableMaqra(branchCode, takenMaqraCodes = []) {
    if (!isMaqraEnabled(branchCode)) {
        // logger.log(`Maqra not enabled for branch: ${branchCode}`);
        return [];
    }
    
    const allMaqra = MAQRA_CONFIG.MAQRA_DATA[branchCode] || [];
    return allMaqra.filter(maqra => !takenMaqraCodes.includes(maqra.code));
}

// Get list of enabled branch names (for display)
export function getEnabledBranchNames() {
    const branchNames = {
        'TA': 'Tartil Al Qur\'an',
        'TLA': 'Tilawah Anak-anak',
        'TLR': 'Tilawah Remaja',
        'TLD': 'Tilawah Dewasa',
        'QM': 'Qira\'at Mujawwad',
        'H1J': 'Hafalan 1 Juz',
        'H5J': 'Hafalan 5 Juz',
        'H10J': 'Hafalan 10 Juz',
        'H20J': 'Hafalan 20 Juz',
        'H30J': 'Hafalan 30 Juz',
        'TFI': 'Tafsir Indonesia',
        'TFA': 'Tafsir Arab',
        'TFE': 'Tafsir Inggris',
        'FAQ': 'Fahm Al Qur\'an',
        'SAQ': 'Syarh Al Qur\'an',
        'KN': 'Kaligrafi Naskah',
        'KH': 'Kaligrafi Hiasan',
        'KD': 'Kaligrafi Dekorasi',
        'KK': 'Kaligrafi Kontemporer',
        'KTIQ': 'KTIQ'
    };
    
    return MAQRA_CONFIG.ENABLED_BRANCHES.map(code => branchNames[code] || code);
}