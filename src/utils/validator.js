import logger from './logger.js';

export class Validator {
    static validateNIKLength(nik) {
        if (!nik) return { isValid: false, message: 'NIK belum diisi' };
        if (nik.length !== 16) return { isValid: false, message: 'NIK harus terdiri dari 16 digit' };
        return { isValid: true, message: '' };
    }

    static validateAllNIKs(isTeam, memberCount = 2) {
        const errors = [];
        
        if (isTeam) {
            for (let i = 1; i <= memberCount; i++) {
                const nikInput = document.getElementById(`memberNik${i}`);
                if (nikInput?.value) {
                    const validation = this.validateNIKLength(nikInput.value);
                    if (!validation.isValid) {
                        errors.push(`Anggota #${i}: ${validation.message}`);
                    }
                }
            }
        } else {
            const nikInput = document.getElementById('nik');
            if (nikInput?.value) {
                const validation = this.validateNIKLength(nikInput.value);
                if (!validation.isValid) {
                    errors.push(validation.message);
                }
            }
        }
        
        return errors;
    }

    static calculateAge(birthDateStr) {
        if (!birthDateStr) return null;
        const birthDate = new Date(birthDateStr);
        const refDate = new Date(2025, 10, 1);
        
        let years = refDate.getFullYear() - birthDate.getFullYear();
        let months = refDate.getMonth() - birthDate.getMonth();
        let days = refDate.getDate() - birthDate.getDate();
        
        if (days < 0) {
            months--;
            const prevMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }
        
        return { years, months, days };
    }

    static formatAge(ageObj) {
        return `${ageObj.years}-${String(ageObj.months).padStart(2, '0')}-${String(ageObj.days).padStart(2, '0')}`;
    }

    static isAgeValid(ageObj, maxAgeStr) {
        const [maxYears, maxMonths, maxDays] = maxAgeStr.split('-').map(Number);
        if (ageObj.years > maxYears) return false;
        if (ageObj.years === maxYears && ageObj.months > maxMonths) return false;
        if (ageObj.years === maxYears && ageObj.months === maxMonths && ageObj.days > maxDays) return false;
        return true;
    }

    static validateGender(currentCabang, isTeam, memberCount) {
        if (!currentCabang) return { isValid: true, message: '' };
        
        const genderRestriction = currentCabang.genderRestriction;
        if (!genderRestriction || genderRestriction === 'any') {
            return { isValid: true, message: '' };
        }
        
        const requiredGender = genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
        
        if (isTeam) {
            const expectedGender = genderRestriction === 'male' ? 'Laki-laki' : 'Perempuan';
            for (let i = 1; i <= memberCount; i++) {
                const memberGender = document.querySelector(`[name="memberJenisKelamin${i}"]`)?.value;
                if (memberGender && memberGender !== expectedGender) {
                    return { 
                        isValid: false, 
                        message: `Peserta #${i}: Jenis kelamin tidak sesuai! Semua peserta tim harus ${expectedGender}` 
                    };
                }
            }
        } else {
            const selectedGender = document.getElementById('jenisKelamin')?.value;
            if (selectedGender && selectedGender !== requiredGender) {
                return { 
                    isValid: false, 
                    message: `Jenis kelamin tidak sesuai! Cabang ini khusus untuk ${genderRestriction === 'male' ? 'Laki-laki (Putra)' : 'Perempuan (Putri)'}` 
                };
            }
        }
        
        return { isValid: true, message: '' };
    }

    static checkFileSizes(uploadedFiles, maxSize) {
        logger.log('Validating all uploaded file sizes...');
        const fileSizeIssues = [];
        
        for (let fileKey in uploadedFiles) {
            const file = uploadedFiles[fileKey];
            if (file && file.size > maxSize) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                fileSizeIssues.push(`${file.name} (${sizeMB}MB > ${maxSize / 1024 / 1024}MB)`);
                logger.log(`⚠️ File size issue: ${fileKey} - ${file.name} (${sizeMB}MB)`);
            }
        }
        
        if (fileSizeIssues.length > 0) {
            return {
                isValid: false,
                message: `File terlalu besar: ${fileSizeIssues.join(', ')}`
            };
        }
        
        logger.log('✅ All file sizes valid');
        return { isValid: true };
    }
}