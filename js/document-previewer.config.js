/**
 * ================================================================
 *  document-previewer.config.js
 *
 *  ⚠️  JANGAN isi googleDriveApiKey di sini — file ini ada di GitHub.
 *
 *  API Key diambil otomatis dari kolom DRIVE_API_KEY di Sheet Config
 *  oleh bop-script.js saat runtime. Tidak perlu diubah file ini.
 *
 *  `debug` di bawah ini khusus untuk log internal komponen
 *  DocumentPreviewer saja. Kalau dipakai di dalam proyek MTQ 2026
 *  (MTQ_CONFIG tersedia), log ini JUGA tunduk pada satu pintu
 *  MTQ_CONFIG.LOGGER_ENABLED di js/config.js — jadi biar debug:true
 *  di sini, tetap senyap kalau LOGGER_ENABLED di-set false secara
 *  global. Kalau dipakai standalone di proyek lain (tanpa
 *  MTQ_CONFIG), flag debug di sini berlaku sendiri seperti biasa.
 * ================================================================
 */

const MY_DP_CONFIG = {
    modalId      : 'dp-modal',
    zoomStep     : 0.25,
    zoomMin      : 0.25,
    zoomMax      : 5.0,
    wheelZoomStep: 0.1,
    pdfScale     : 1.5,
    pdfWorkerUrl : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    pdfCmapUrl   : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    debug        : false,
    // FIX #23: kalau file yang dipratinjau ada di Google Drive, JANGAN
    // andalkan googleDriveApiKey saja — Drive API tidak mengirim header
    // CORS untuk endpoint unduh konten (alt=media), jadi fetch() langsung
    // dari browser akan gagal "blocked by CORS policy" di hampir semua
    // origin. Isi driveFetcher dengan fungsi yang mengambil file lewat
    // backend Anda sendiri (server-side, tidak kena CORS) sebagai
    // gantinya — lihat contoh pemakaiannya di doyourmagic.html (proyek
    // MTQ 2026), yang mengambil file lewat Apps Script + JSONP.
    driveFetcher : null,
    onOpen       : null,
    onClose      : null,
    onError      : null
};