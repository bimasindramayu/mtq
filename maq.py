# generator_maqra.py

surah_list = [
    "Al-Fatihah", "Al-Baqarah", "Ali Imran", "An-Nisa", "Al-Maidah",
    "Al-An'am", "Al-A'raf", "Al-Anfal", "At-Taubah", "Yunus",
    "Hud", "Yusuf", "Ar-Ra'd", "Ibrahim", "Al-Hijr",
    "An-Nahl", "Al-Isra", "Al-Kahf", "Maryam", "Taha",
    "Al-Anbiya", "Al-Hajj", "Al-Mu'minun", "An-Nur", "Al-Furqan",
    "Ash-Shu'ara", "An-Naml", "Al-Qasas", "Al-Ankabut", "Ar-Rum",
    "Luqman", "As-Sajdah", "Al-Ahzab", "Saba", "Fatir",
    "Ya-Sin", "As-Saffat", "Sad", "Az-Zumar", "Ghafir",
    "Fussilat", "Ash-Shura", "Az-Zukhruf", "Ad-Dukhan", "Al-Jathiyah",
    "Al-Ahqaf", "Muhammad", "Al-Fath", "Al-Hujurat", "Qaf",
    "Adh-Dhariyat", "At-Tur", "An-Najm", "Al-Qamar", "Ar-Rahman",
    "Al-Waqi'ah", "Al-Hadid", "Al-Mujadilah", "Al-Hashr", "Al-Mumtahanah",
    "As-Saff", "Al-Jumu'ah", "Al-Munafiqun", "At-Taghabun", "At-Talaq",
    "At-Tahrim", "Al-Mulk", "Al-Qalam", "Al-Haqqah", "Al-Ma'arij",
    "Nuh", "Al-Jinn", "Al-Muzzammil", "Al-Muddaththir", "Al-Qiyamah",
    "Al-Insan", "Al-Mursalat", "An-Naba", "An-Nazi'at", "Abasa",
    "At-Takwir", "Al-Infitar", "Al-Mutaffifin", "Al-Inshiqaq", "Al-Buruj",
    "At-Tariq", "Al-A'la", "Al-Ghashiyah", "Al-Fajr", "Al-Balad",
    "Ash-Shams", "Al-Lail", "Ad-Duha", "Ash-Sharh", "At-Tin",
    "Al-'Alaq", "Al-Qadr", "Al-Bayyinah", "Az-Zalzalah", "Al-Adiyat",
    "Al-Qari'ah", "At-Takathur", "Al-Asr", "Al-Humazah", "Al-Fil",
    "Quraish", "Al-Ma'un", "Al-Kawthar", "Al-Kafirun", "An-Nasr",
    "Al-Lahab", "Al-Ikhlas", "Al-Falaq", "An-Nas"
]

CABANG_ORDER = {
    'TA': (1, 62),
    'TLA': (63, 124),
    'TLR': (125, 186),
    'TLD': (187, 248),
    'QM': (249, 310),
    'H1J': (311, 372),
    'H5J': (373, 434),
    'H10J': (435, 496),
    'H20J': (497, 558),
    'H30J': (559, 620),
    'TFI': (621, 682),
    'TFA': (683, 744),
    'TFE': (745, 806),
    'FAQ': (1, 62),
    'SAQ': (1, 62),
    'KN': (1, 62),
    'KH': (63, 124),
    'KD': (125, 186),
    'KK': (187, 248),
    'KTIQ': (1, 62)
}

import random

def random_ayat():
    start = random.randint(1, 180)
    end = start + random.randint(3, 10)
    return f"{start}-{end}"

result = "const maqraDatabase = {\n"

for cabang, (start, end) in CABANG_ORDER.items():
    result += f"  '{cabang}': [\n"
    for i, num in enumerate(range(start, end + 1), start=1):
        surat = surah_list[(num - 1) % len(surah_list)]
        surat_escaped = surat.replace("'", "\\'")  # 👈 penting: escape tanda petik
        code = f"{cabang}{num:03}"
        ayat = random_ayat()
        result += f"    {{ code: '{code}', surat: '{surat_escaped}', ayat: '{ayat}' }},\n"
    result += "  ],\n"
result += "};"

with open("maqraDatabase.js", "w", encoding="utf-8") as f:
    f.write(result)

print("✅ File maqraDatabase.js berhasil dibuat dengan escape karakter petik tunggal!")
