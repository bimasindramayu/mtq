// ============================================================
//  MTQ 2026 — js/cek-maqra.js
//  Halaman gabungan: Cek Status + Perbaikan Data + Ambil Maqra
//
//  Fixes:
//  ✅ Tidak ada fetch() — semua pakai JSONP (GET & POST tunnel)
//  ✅ NIK bisa diubah di form edit (lihat FIX terbaru di bawah) — dulu
//     selalu disabled & tidak dikirim ke server sama sekali
//  ✅ Upload Sertifikat/Piagam di form perbaikan
//  ✅ Setelah verify, langsung tampilkan maqra tanpa input NIK ulang
//  ✅ Validasi umur form perbaikan memakai syarat cabang dari server
//     (sebelumnya selalu "tanpa batas" karena field-nya kosong)
//  ✅ Dokumen existing (foto/KTP/sertifikat/rekom) bisa di-preview via
//     DocumentPreviewer — peserta bebas pakai yang lama atau ganti baru
//  ✅ Auto-scroll ke hasil setelah "Cek Status" — tidak perlu scroll manual
//  ✅ FIX: submitPerbaikan() dengan foto/KTP baru dulu dikirim lewat
//     jsonpPost (base64 dijejalkan ke query string URL) → PASTI GAGAL untuk
//     foto (bisa >1 juta karakter, jauh melebihi batas panjang URL browser
//     & server). api.gs SUDAH punya doPost(e) yang benar (dipakai untuk
//     pendaftaran awal — lihat komentar "doPost kept for registration
//     only"), tapi form perbaikan tidak pernah memakainya. Sekarang
//     submitPerbaikan() memakai postJSON() — fetch() POST asli dengan
//     Content-Type text/plain (menghindari CORS preflight yang tidak
//     ditangani GAS) — ke endpoint doPost yang sama.
//  ✅ FIX #15: _jsonp() dulu langsung `delete window[cbName]` begitu
//     timeout/onerror "menyerah". Kalau server ternyata cuma lambat (bukan
//     benar2 mati) dan responsnya baru sampai setelah itu, browser tetap
//     mengeksekusi <script> yang telat itu dan meledak "Uncaught
//     ReferenceError: ...is not defined" di console. Sekarang window[cbName]
//     tidak dihapus saat timeout — respons telat diproses dengan aman
//     (walau, beda dari jsonp()/_jsonpClassic di main.js/daftar.js/
//     doyourmagic.html, Promise di sini cuma bisa settle sekali: kalau
//     timeout sudah reject() duluan, resolve() yang telat cuma jadi no-op
//     aman, bukan "menghidupkan lagi" hasil .then() pemanggil — tapi
//     setidaknya tidak lagi crash).
//  ✅ FIX: NIK pada form perbaikan sekarang BISA diubah (dulu selalu
//     dikunci total). Peserta individu bisa membetulkan NIK yang salah
//     ketik; 1 anggota tim bisa diganti dengan peserta baru lewat tombol
//     "🔁 Ganti dengan Peserta Baru" (gantiPeserta()/batalGantiPeserta()).
//     Setiap perubahan NIK dicek real-time (checkNikAvailability()) &
//     divalidasi ulang di server (apiPerbaikan_ → checkNIKDuplicate_ di
//     helper.gs) supaya tidak ada NIK ganda antar-pendaftaran.
// ============================================================

// API_URL dibaca LAZILY saat dipakai (bukan saat file di-parse)
// karena config.js mungkin belum selesai dieksekusi saat baris ini dijalankan
function getApiUrl() {
  const url = window.MTQ_API_URL || (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG.API_URL : '') || '';
  if (!url) log.error('[MTQ] API_URL kosong — pastikan js/config.js dimuat sebelum cek-maqra.js');
  return url;
}

let _record       = null;   // data peserta dari server
let _editFiles    = {};     // file untuk form perbaikan
let _maqraList    = [];     // daftar maqra tersedia
let _spinning     = false;
let _maqraResult  = null;
let _captchaCode  = '';     // captcha saat ini
let previewer     = null;   // instance DocumentPreviewer (FIX #2 — preview dokumen existing)

// ── Canvas Image Captcha ──────────────────────────────────────
function generateCaptcha() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _captchaCode = Array.from({length:6}, () => pool[Math.floor(Math.random()*pool.length)]).join('');

  const canvas = document.getElementById('captchaCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0,   '#064e3b');
  grad.addColorStop(0.5, '#047857');
  grad.addColorStop(1,   '#059669');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 160; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*w, Math.random()*h, Math.random()*1.6+0.3, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${0.06+Math.random()*0.18})`;
    ctx.fill();
  }
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random()*w, Math.random()*h);
    ctx.bezierCurveTo(Math.random()*w, Math.random()*h, Math.random()*w, Math.random()*h, Math.random()*w, Math.random()*h);
    ctx.strokeStyle = `rgba(255,255,255,${0.12+Math.random()*0.18})`;
    ctx.lineWidth = 0.8 + Math.random()*1.2;
    ctx.stroke();
  }

  const charW = (w - 20) / 6;
  const lightColors = ['#ffffff','#d1fae5','#a7f3d0','#fef3c7','#fde68a','#bbf7d0'];
  _captchaCode.split('').forEach((char, i) => {
    ctx.save();
    ctx.translate(12 + i * charW + charW / 2, h / 2 + 5);
    ctx.rotate((Math.random() - 0.5) * 0.52);
    ctx.font      = `bold ${22 + Math.floor(Math.random()*7)}px 'Courier New',monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor   = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.strokeStyle   = 'rgba(0,0,0,0.25)';
    ctx.lineWidth     = 2.5;
    ctx.strokeText(char, 0, 0);
    ctx.fillStyle = lightColors[i % lightColors.length];
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillRect(0, h-3, w, 3);

  const inp = document.getElementById('captchaInput');
  if (inp) { inp.value = ''; inp.style.borderColor = 'var(--g200)'; inp.style.boxShadow = 'none'; }
  const err = document.getElementById('captchaErr');
  if (err) err.style.display = 'none';
}

function refreshCaptcha() {
  generateCaptcha();
  document.getElementById('captchaInput')?.focus();
}

// ── DOM Ready ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  generateCaptcha();
  initDocumentPreviewer();   // FIX #2 — siapkan DocumentPreviewer untuk "Lihat Dokumen"
  updateNavDaftarStatus_();  // FIX: nonaktifkan link "Daftar" kalau pendaftaran sedang tidak buka
  // FIX: file:// punya pembatasan request lintas-origin yang berbeda dari
  // http(s) dan bisa memicu error yang membingungkan di halaman ini.
  // Untuk uji coba lokal, jalankan lewat server (mis. `python3 -m http.server`)
  // atau langsung di domain hosting (GitHub Pages), jangan buka file langsung.
  if (location.protocol === 'file:') {
    log.warn('[MTQ] Halaman dibuka lewat file:// — beberapa fitur (kirim perbaikan, preview dokumen) butuh http/https untuk berfungsi normal. Gunakan server lokal atau domain hosting untuk uji coba.');
  }
  const input = document.getElementById('nikInput');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') cekStatus(); });
  input.addEventListener('input',   e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  // Enter di captcha input juga trigger cek
  document.getElementById('captchaInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') cekStatus();
  });
  // FIX: Escape untuk tutup modal "Daftar Peserta Ditolak" (lihat openDitolakModal())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDitolakModal();
  });
});

// ── FIX: link "Daftar" di navbar dinonaktifkan otomatis kalau ──────
// pendaftaran online sedang tidak buka (belum mulai / sudah tutup).
// Sebelumnya link ini selalu aktif tanpa memandang status pendaftaran,
// jadi peserta bisa saja diarahkan ke daftar.html padahal pendaftaran
// sudah tutup (di sana form-nya sendiri sekarang sudah terkunci, tapi
// idealnya pengguna tahu dari sini dulu tanpa perlu pindah halaman).
async function updateNavDaftarStatus_() {
  const link = document.getElementById('navDaftarLink');
  if (!link) return;

  function applyDaftarStatus(isOpen, status) {
    if (isOpen) {
      link.classList.remove('nav-link-disabled');
      link.removeAttribute('aria-disabled');
      link.removeAttribute('title');
      link.textContent = '📝 Daftar';
    } else {
      link.classList.add('nav-link-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.title = status === 'belum_buka'
        ? 'Pendaftaran belum dibuka'
        : 'Pendaftaran sudah ditutup';
      link.textContent = '🔒 Daftar';
    }
  }

  try {
    const data = await jsonpGet({ action: 'getStats' });
    if (!data || !data.success) throw new Error('respons getStats tidak valid');
    applyDaftarStatus(data.isOpen, data.status);
  } catch (err) {
    log.warn('[MTQ] updateNavDaftarStatus_ — API gagal, pakai fallback lokal:', err.message);
    // Fallback: hitung status dari MTQ_CONFIG (config.js) kalau API tidak terjangkau
    if (typeof getRegStatus === 'function') {
      const status = getRegStatus();
      applyDaftarStatus(status === 'buka', status);
    }
  }
}

// ── FIX #2: DocumentPreviewer — preview dokumen existing (foto/KTP/rekom) ──
// Dibind sekali di sini; DocumentPreviewer.bindTriggers() memakai event
// delegation di document, jadi tombol .dp-trigger yang baru dirender
// belakangan (mis. di dalam showEditForm()) otomatis ikut tertangkap juga.
function initDocumentPreviewer() {
  if (typeof DocumentPreviewer === 'undefined') {
    log.warn('[MTQ] DocumentPreviewer tidak dimuat — pastikan document-previewer.js & document-previewer.css sudah di-include di cekstatus.html. Fitur "Lihat Dokumen" akan nonaktif.');
    return;
  }
  const baseCfg = (typeof MY_DP_CONFIG !== 'undefined') ? MY_DP_CONFIG : {};
  previewer = new DocumentPreviewer({
    ...baseCfg,
    // FIX: googleDriveApiKey SENGAJA dikosongkan — jalur fetch() langsung
    // ke Drive API dari browser di document-previewer.js SELALU gagal
    // CORS untuk endpoint alt=media (unduh konten biner), apa pun nilai
    // key-nya (lihat komentar panjang di document-previewer.js →
    // _fetchFromDrive() dan di api.gs → apiGetDriveFile_). driveFetcher
    // di bawah ini yang benar-benar dipakai.
    googleDriveApiKey: '',
    // FIX: proxy lewat backend kita sendiri (action=getDriveFile di
    // api.gs, server-ke-server jadi tidak kena CORS sama sekali) — lihat
    // dpDriveFetcher() di bawah. Efek samping yang disengaja: URL Drive
    // asli tidak pernah diminta langsung oleh browser peserta.
    driveFetcher: dpDriveFetcher,
  });
  previewer.bindTriggers('.dp-trigger');
}

// FIX: driveFetcher untuk DocumentPreviewer. Menerima fileId (sudah
// diekstrak duluan oleh DocumentPreviewer dari URL Drive lewat
// _extractFileId()), mengambil bytenya lewat action=getDriveFile
// (JSONP, sama seperti seluruh transport lain di file ini), lalu
// mengembalikan { blob, name } — atau { error } kalau gagal, sesuai
// kontrak yang diharapkan _fetchFromDrive() di document-previewer.js.
async function dpDriveFetcher(fileId) {
  try {
    const data = await jsonpGet({ action: 'getDriveFile', id: fileId }, 25000);
    if (!data || !data.success || !data.base64) {
      return { error: (data && data.message) || 'Gagal mengambil dokumen dari server.' };
    }
    return {
      blob: dpBase64ToBlob(data.base64, data.mimeType || 'application/octet-stream'),
      name: data.name || '',
    };
  } catch (err) {
    return { error: err.message || 'Tidak bisa menghubungi server.' };
  }
}

function dpBase64ToBlob(base64, mimeType) {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

// FIX: dipanggil LANGSUNG dari tombol .uz-zoom-btn (bukan lewat delegasi
// previewer.bindTriggers() ke document) — tombol itu sengaja memanggil
// event.stopPropagation() supaya kliknya tidak ikut membuka file picker
// milik .uz-photo di belakangnya (lihat uzMini()), tapi stopPropagation()
// itu juga menghentikan event sebelum sempat bubbling naik ke listener
// document yang dipasang bindTriggers() — jadi delegasi itu TIDAK PERNAH
// menyala untuk tombol ini kalau tidak dipanggil langsung seperti ini.
function openDocPreview(url, name) {
  if (!url) { showToast('Info', 'Dokumen belum tersedia untuk peserta ini.', 'warning'); return; }
  if (!previewer) { showToast('Error', 'Komponen preview belum siap, muat ulang halaman.', 'error'); return; }
  previewer.open(url, name || 'Dokumen');
}

function initDarkMode() {
  applyTheme(localStorage.getItem('mtq-theme') || 'light');
  document.getElementById('darkToggle')?.addEventListener('click', () => {
    const nxt = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark';
    applyTheme(nxt);
    localStorage.setItem('mtq-theme', nxt);
  });
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const ic = document.getElementById('darkToggle');
  if (ic) ic.textContent = t === 'dark' ? '☀️' : '🌙';
}

// ── Navigasi Tahapan (ganti "halaman") ──────────────────────────
// FIX: sebelumnya panel lama (mis. searchCard) tetap ada di DOM dan
// cuma discroll lewat — jadi kontennya menumpuk ke bawah (searchCard
// masih kelihatan di atas walau user sudah pindah tahap). goToPanel()
// membuat hanya SATU .tahapan-panel yang tampil (display:block),
// panel lain disembunyikan (display:none) — benar-benar berpindah
// "halaman", bukan cuma scroll. Dipanggil dari:
//   - fetchAndRenderStatus()  → panel 2 (hasil pencarian NIK tampil)
//   - goToMaqraStep()         → panel 3 (user lanjut ke ambil maqra)
//   - tombol "← Kembali"      → panel 1 atau 2 (mundur satu tahap)
// FIX: indikator langkah 1/2/3 (#tahapanBar / #tpStep1-3) sudah dihapus
// dari cekstatus.html atas permintaan — logika penyinkronan status
// aktif/selesai & auto-scroll ke situ yang dulu ada di sini ikut
// dihapus juga karena elemen targetnya sudah tidak ada.
function goToPanel(step) {
  // FIX #29 (Bug 2): tutup dp-modal (DocumentPreviewer) setiap kali
  // pindah panel — sebelumnya kalau preview dokumen dibuka (mis. dari
  // statusArea atau form perbaikan) lalu user pindah panel (klik
  // "← Kembali", lanjut ke ambil maqra, dst.), dp-modal nyangkut tetap
  // terbuka walau panel yang membukanya sudah tidak tampil lagi.
  // previewer?.close() aman dipanggil walau previewer belum ada/sudah
  // tertutup (optional chaining + close() sendiri idempotent).
  previewer?.close();
  document.querySelectorAll('.tahapan-panel').forEach(function(p) { p.classList.remove('active'); });
  const target = document.getElementById('panel' + step);
  if (target) target.classList.add('active');
}

// FIX: tombol "← Kembali ke Pencarian" di atas panel2 sekarang sadar
// konteks. statusArea & editArea adalah 2 "tab" terpisah di dalam
// panel2 (lihat showEditForm()/closeEditForm()) — kalau editArea yang
// lagi tampil (form perbaikan terbuka), "kembali" seharusnya balik ke
// kartu status dulu (statusArea), BUKAN langsung lompat ke panel
// pencarian (panel1) — sebelumnya itu yang terjadi, dan form perbaikan
// yang sedang diisi jadi hilang begitu saja tanpa konfirmasi. Kalau
// statusArea yang tampil (kondisi normal), perilakunya seperti biasa:
// balik ke panel1. Dipanggil dari tombol id="panel2BackBtn".
function backFromPanel2() {
  const editArea = document.getElementById('editArea');
  if (editArea && editArea.style.display === 'block') {
    closeEditForm();
  } else {
    goToPanel(1);
  }
}

// ════════════════════════════════════════════════════════════
//  STEP 1 — Cek Status NIK
// ════════════════════════════════════════════════════════════
async function cekStatus() {
  const nik     = document.getElementById('nikInput').value.trim();
  const capInp  = (document.getElementById('captchaInput')?.value || '').trim().toUpperCase();
  const capErr  = document.getElementById('captchaErr');

  if (!nik || nik.length < 16) {
    showToast('Peringatan', 'Masukkan NIK 16 digit yang valid', 'warning');
    document.getElementById('nikInput').focus();
    return;
  }

  // Validasi captcha
  if (capInp !== _captchaCode) {
    if (capErr) { capErr.style.display = 'block'; capErr.textContent = 'Kode verifikasi tidak sesuai'; }
    const ci = document.getElementById('captchaInput');
    if (ci) { ci.style.borderColor = 'var(--red, #dc2626)'; ci.value = ''; ci.focus(); }
    generateCaptcha();   // ganti captcha baru
    showToast('Verifikasi Gagal', 'Kode keamanan salah — kode baru telah dibuat', 'warning');
    return;
  }
  if (capErr) capErr.style.display = 'none';

  await fetchAndRenderStatus(nik);
}

// FIX: logika fetch+render dipisah dari validasi captcha di atas, supaya
// bisa dipakai ulang untuk refresh status setelah submitPerbaikan() SUKSES.
// Sebelumnya, refresh setelah perbaikan memanggil cekStatus() lagi — yang
// menolaknya karena captchaInput di titik itu sudah tidak sesuai/relevan,
// memunculkan toast "Kode keamanan salah" dan membiarkan status yang
// tampil tetap status LAMA (Ditolak), padahal di server sudah berubah.
// Identitas peserta di titik ini sudah terverifikasi lewat pengiriman
// perbaikan itu sendiri (nomor_pendaftaran valid + lolos validasi server),
// jadi mengecek captcha lagi di sini tidak perlu.
async function fetchAndRenderStatus(nik) {
  showLoading(true, 'Mencari data peserta...');
  document.getElementById('searchBtn').disabled = true;
  clearAreas();

  // Guard: pastikan API_URL sudah tersedia sebelum request
  if (!getApiUrl()) {
    showLoading(false);
    document.getElementById('searchBtn').disabled = false;
    showToast('Konfigurasi Error', 'API URL belum terkonfigurasi. Periksa js/config.js', 'error', 8000);
    log.error('[MTQ] window.MTQ_API_URL kosong saat cekStatus dipanggil');
    return;
  }

  try {
    const data = await jsonpGet({ action: 'checkNIK', nik });
    if (!data.success || !data.found) {
      renderNotFound(nik);
      goToPanel(2);   // FIX: pindah ke panel status, panel pencarian disembunyikan
      return;
    }
    _record = data.record;
    // FIX: baris "previewer.config.googleDriveApiKey = data.driveApiKey"
    // yang lama dihapus dari sini — driveFetcher (lihat initDocumentPreviewer())
    // sekarang jadi satu-satunya jalur DocumentPreviewer mengambil file,
    // dan itu dikonfigurasi sekali saja saat halaman dimuat, tidak perlu
    // diperbarui per-record seperti ini.
    renderStatusCard(_record);
    goToPanel(2);   // FIX #3 — pindah ke panel status (searchCard ikut disembunyikan), tidak perlu scroll manual

    // FIX: maqra TIDAK lagi otomatis dimuat di sini. Sebelumnya baris ini
    // langsung memanggil loadMaqra() begitu status Terverifikasi diketahui,
    // sehingga kartu status + kartu maqra + tombol spin semua muncul
    // sekaligus dalam satu layar (terasa seperti landing page — user
    // bingung mau klik yang mana). Sekarang pengambilan maqra jadi
    // langkah terpisah (Tahap 3) yang baru dimuat saat user menekan
    // tombol "Lanjut: Ambil Maqra" di action-row status card — lihat
    // goToMaqraStep() di bagian STEP 2 di bawah.
  } catch (err) {
    showToast('Error', 'Gagal menghubungi server. Coba lagi.', 'error');
    log.error(err);
  } finally {
    showLoading(false);
    document.getElementById('searchBtn').disabled = false;
    generateCaptcha();   // selalu refresh captcha setelah submit
  }
}

function clearAreas() {
  ['statusArea','maqraArea','editArea'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  // FIX: statusArea & editArea sekarang berperilaku seperti 2 "tab" yang
  // saling eksklusif di panel2 (lihat showEditForm()/closeEditForm()) —
  // bukan lagi menumpuk vertikal. Setiap kali area di-reset (pencarian
  // NIK baru, atau refresh setelah kirim perbaikan berhasil), pastikan
  // mulai dari kondisi "tab" statusArea yang tampil.
  const statusEl = document.getElementById('statusArea');
  const editEl   = document.getElementById('editArea');
  if (statusEl) statusEl.style.display = 'block';
  if (editEl)   editEl.style.display   = 'none';
  const backBtn = document.getElementById('panel2BackBtn');
  if (backBtn) backBtn.textContent = '← Kembali ke Pencarian';
  _maqraList   = [];
  _maqraResult = null;
  _spinning    = false;
}

// ── STEP 1 selesai — lanjut ke render kartu status di bawah ──

// ════════════════════════════════════════════════════════════
//  STATUS CARD
// ════════════════════════════════════════════════════════════
function renderStatusCard(rec) {
  const status = (rec.status_verifikasi || 'Menunggu').trim();
  const isTeam = (rec.tipe_lomba || '').toLowerCase() === 'team';
  const anggota = rec.anggota || [];

  const SM = {
    'Menunggu'      : { cls:'badge-menunggu',      hdr:'status-menunggu',      icon:'⏳', label:'Menunggu Verifikasi' },
    'Terverifikasi' : { cls:'badge-terverifikasi', hdr:'status-terverifikasi', icon:'✅', label:'Terverifikasi' },
    'Ditolak'       : { cls:'badge-ditolak',       hdr:'status-ditolak',       icon:'❌', label:'Ditolak' },
    'Nonaktif'      : { cls:'badge-nonaktif',      hdr:'status-nonaktif',      icon:'🚫', label:'Nonaktif' },
  };
  const sm = SM[status] || SM['Menunggu'];

  // Info banner
  let bannerHtml = '';
  if (status === 'Menunggu') {
    bannerHtml = banner('info-gold','⏳','Sedang Diverifikasi','Mohon tunggu konfirmasi dari panitia via WhatsApp.');
  } else if (status === 'Terverifikasi') {
    bannerHtml = banner('info-green','✅','Terverifikasi','Pendaftaran Anda sudah diverifikasi. Tekan tombol di bawah untuk lanjut ke Tahap 3: Ambil Maqra.');
  } else if (status === 'Ditolak') {
    bannerHtml = banner('info-red','❌','Pendaftaran Ditolak',esc(rec.catatan || 'Tidak ada keterangan'));
  } else if (status === 'Nonaktif') {
    bannerHtml = banner('info-lock','🚫','Nonaktif','Pendaftaran Anda telah dinonaktifkan. Hubungi panitia.');
  }

  // Members (tim)
  let membersHtml = '';
  if (isTeam && anggota.length) {
    membersHtml = `<div class="info-divider"></div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--g400);margin-bottom:10px">👥 Anggota Tim</div>
      <div class="member-list">
        ${anggota.map((m,i) => `
          <div class="member-row">
            <div class="member-badge ${i===0?'ketua':''}">${i===0?'K':i+1}</div>
            <div style="flex:1">
              <div class="member-name">${esc(m.nama_lengkap||'-')}</div>
              <div class="member-nik">NIK: ${esc(m.nik||'-')}</div>
            </div>
            ${i===0?'<span style="font-size:11px;background:#fffbeb;color:#b45309;padding:2px 8px;border-radius:999px;font-weight:700">Ketua</span>':''}
          </div>`).join('')}
      </div>`;
  }

  // Action buttons — FIX: satu tombol UTAMA per status (bukan beberapa
  // tombol sejajar dengan bobot visual sama) supaya jelas satu aksi yang
  // harus diklik. Aksi lain (unduh kartu, beranda) jadi link kecil di
  // bawahnya (.secondary-links), bukan tombol penuh — lihat juga
  // perubahan CSS .action-row di cekstatus.html.
  let actionHtml = '';
  if (status === 'Ditolak') {
    actionHtml = `
      <button class="btn btn-red" onclick="showEditForm()" style="width:100%;justify-content:center;font-size:15px;padding:13px">✏️ Perbaiki Data</button>
      <div class="secondary-links"><a href="index.html">🏠 Beranda</a></div>`;
  } else if (status === 'Terverifikasi') {
    actionHtml = `
      <button class="btn btn-emerald" onclick="goToMaqraStep()" style="width:100%;justify-content:center;font-size:15px;padding:13px;background:linear-gradient(135deg,#065f46,#059669);box-shadow:0 2px 8px rgba(5,150,105,.35)">➡️ Lanjut: Ambil Maqra</button>
      <div class="secondary-links">
        <button onclick="downloadKartuPeserta()">🪪 Unduh Kartu Peserta</button>
        <a href="index.html">🏠 Beranda</a>
      </div>`;
  } else {
    // Menunggu / Nonaktif — belum ada aksi yang bisa dilakukan user
    actionHtml = `<div class="secondary-links"><a href="index.html">🏠 Beranda</a></div>`;
  }

  document.getElementById('statusArea').innerHTML = `
    <div class="result-card">
      <div class="result-header ${sm.hdr}">
        <div class="status-icon-big">${sm.icon}</div>
        <div>
          <div style="font-size:11px;color:var(--g500);margin-bottom:3px">Nomor Pendaftaran</div>
          <div class="nomor-highlight">${esc(rec.nomor_pendaftaran||'-')}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            <span class="status-badge ${sm.cls}">${sm.label}</span>
            <span class="status-badge" style="background:${isTeam?'#fef3c7':'#eff6ff'};color:${isTeam?'#b45309':'#2563eb'}">
              ${isTeam?'👥 Tim':'👤 Individu'}
            </span>
          </div>
        </div>
      </div>
      <div class="result-body">
        ${bannerHtml}
        <div class="info-grid">
          <div class="info-item"><label>Nama Lengkap</label><div class="val">${esc(rec.nama_lengkap||'-')}</div></div>
          <div class="info-item"><label>NIK</label><div class="val" style="font-family:monospace">${esc(rec.nik||'-')}</div></div>
          <div class="info-item"><label>Kecamatan</label><div class="val">${esc(rec.kecamatan||'-')}</div></div>
          <div class="info-item"><label>Cabang Lomba</label><div class="val">${esc(rec.cabang_lomba||'-')}</div></div>
          <div class="info-item"><label>No. HP</label><div class="val">${esc(rec.no_hp||'-')}</div></div>
          <div class="info-item"><label>Jenis Kelamin</label><div class="val">${esc(rec.jenis_kelamin||'-')}</div></div>
        </div>
        ${membersHtml}
      </div>
      <div class="action-row">${actionHtml}</div>
    </div>`;
}

function banner(cls, icon, title, msg) {
  return `<div class="info-banner ${cls}">
    <div class="info-banner-icon">${icon}</div>
    <div><strong>${title}</strong>${esc(msg)}</div>
  </div>`;
}

function renderNotFound(nik) {
  document.getElementById('statusArea').innerHTML = `
    <div class="result-card">
      <div style="text-align:center;padding:40px 24px;color:var(--g400)">
        <div style="font-size:48px;margin-bottom:12px">🔍</div>
        <div style="font-size:16px;font-weight:600;color:var(--g600);margin-bottom:8px">Data Tidak Ditemukan</div>
        <p style="font-size:14px;margin-bottom:16px">NIK <strong>${esc(nik)}</strong> tidak terdaftar di MTQ 2026.</p>
        <a href="daftar.html" class="btn btn-emerald" style="display:inline-flex">📝 Daftar Sekarang</a>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  MODAL — Daftar Peserta Ditolak (publik, tanpa perlu NIK)
// ════════════════════════════════════════════════════════════
// Dipicu dari link "📋 Lihat Peserta Ditolak" di search-card (Panel 1).
// Server (apiGetDitolak_ di api.gs) SENGAJA hanya mengembalikan field
// yang aman untuk publik (nama, cabang, kecamatan, catatan) — TIDAK ada
// NIK/alamat/no_hp/email seperti checkNIK, dan TIDAK butuh token admin
// seperti getAllPendaftar.
let _dtData = [];
let _dtSort = { field: 'nama_peserta', dir: 1 };   // dir: 1 = A→Z, -1 = Z→A

const DT_COLS = [
  { key: 'nama_peserta', label: 'Nama Peserta' },
  { key: 'cabang_lomba', label: 'Cabang Lomba' },
  { key: 'kecamatan',    label: 'Kecamatan' },
  { key: 'catatan',      label: 'Catatan' },
];

async function openDitolakModal() {
  document.getElementById('dtOverlay')?.classList.add('show');
  document.body.style.overflow = 'hidden';
  await loadDitolakData();
}

function closeDitolakModal() {
  document.getElementById('dtOverlay')?.classList.remove('show');
  document.body.style.overflow = '';
}

async function loadDitolakData() {
  const body = document.getElementById('dtModalBody');
  const sub  = document.getElementById('dtModalSub');
  if (!body) return;

  body.innerHTML = dtStateHtml('⏳', 'Memuat Data...', 'Mohon tunggu sebentar.');
  if (sub) sub.textContent = 'Memuat data…';

  if (!getApiUrl()) {
    body.innerHTML = dtStateHtml('⚠️', 'Konfigurasi Bermasalah', 'API_URL belum terkonfigurasi di js/config.js.');
    if (sub) sub.textContent = 'Gagal memuat';
    return;
  }

  try {
    const data = await jsonpGet({ action: 'getDitolak' });
    if (!data.success) throw new Error(data.message || 'Gagal memuat data.');
    _dtData = data.data || [];
    _dtSort = { field: 'nama_peserta', dir: 1 };
    renderDitolakTable();
  } catch (err) {
    body.innerHTML = dtStateHtml('⚠️', 'Gagal Memuat Data', err.message || 'Tidak bisa menghubungi server.');
    if (sub) sub.textContent = 'Gagal memuat';
    log.error('[MTQ] loadDitolakData error:', err);
  }
}

function renderDitolakTable() {
  const body = document.getElementById('dtModalBody');
  const sub  = document.getElementById('dtModalSub');
  if (!body) return;

  if (!_dtData.length) {
    body.innerHTML = dtStateHtml('✅', 'Tidak Ada Peserta Ditolak', 'Semua pendaftar saat ini berstatus menunggu, terverifikasi, atau nonaktif.');
    if (sub) sub.textContent = '0 peserta';
    return;
  }

  if (sub) sub.textContent = `${_dtData.length} peserta ditolak — klik judul kolom untuk urutkan`;

  const sorted = [..._dtData].sort((a, b) => {
    const va = String(a[_dtSort.field] || '');
    const vb = String(b[_dtSort.field] || '');
    return va.localeCompare(vb, 'id', { sensitivity: 'base' }) * _dtSort.dir;
  });

  const theadHtml = DT_COLS.map(c => {
    const active = _dtSort.field === c.key;
    const arrow  = active ? (_dtSort.dir === 1 ? '▲' : '▼') : '↕';
    return `<th class="${active ? 'is-sorted' : ''}" onclick="sortDitolakBy('${c.key}')">${esc(c.label)}<span class="dt-arrow">${arrow}</span></th>`;
  }).join('');

  const rowsHtml = sorted.map(r => {
    const isTeam   = r.tipe_lomba === 'team';
    const tagCls   = isTeam ? 'team' : 'individu';
    const tagLabel = isTeam ? 'Tim' : 'Individu';
    return `<tr>
      <td>${esc(r.nama_peserta || '-')}<span class="dt-name-tag ${tagCls}">${tagLabel}</span></td>
      <td>${esc(r.cabang_lomba || '-')}</td>
      <td>${esc(r.kecamatan || '-')}</td>
      <td class="dt-catatan">${esc(r.catatan || 'Tidak ada keterangan')}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div class="dt-table-wrap">
      <table class="dt-table">
        <thead><tr>${theadHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function sortDitolakBy(field) {
  if (_dtSort.field === field) _dtSort.dir *= -1;
  else { _dtSort.field = field; _dtSort.dir = 1; }
  renderDitolakTable();
}

function dtStateHtml(icon, title, msg) {
  return `<div class="dt-state">
    <div class="dt-state-icon">${icon}</div>
    <div class="dt-state-title">${esc(title)}</div>
    <div class="dt-state-msg">${esc(msg)}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  STEP 2 — Load & Render Maqra Section
// ════════════════════════════════════════════════════════════

// Dipanggil dari tombol "➡️ Lanjut: Ambil Maqra" di action-row status
// card (renderStatusCard). Ini titik masuk Panel 3 — sengaja dibuat
// eksplisit lewat klik, bukan otomatis, supaya alurnya terasa bertahap
// dan panel status (panel 2) benar-benar berpindah/hilang, bukan cuma
// discroll lewat.
async function goToMaqraStep() {
  if (!_record) return;
  await loadMaqra(_record);
  goToPanel(3);
}

async function loadMaqra(rec) {
  showLoading(true, 'Memuat data maqra...');
  try {
    const maqraData = await jsonpGet({
      action : 'getMaqraStatus',
      nomor  : rec.nomor_pendaftaran,
      cabang : rec.cabang_lomba,
    });
    renderMaqraArea(maqraData, rec);
  } catch (err) {
    showToast('Error', 'Gagal memuat status maqra: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderMaqraArea(maqraData, rec) {
  const area = document.getElementById('maqraArea');
  area.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'maqra-section';

  // Profile box (compact)
  const initial = (rec.nama_lengkap || '?')[0].toUpperCase();
  wrap.innerHTML = `
    <div class="profile-box">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-info">
        <div class="p-name">${esc(rec.nama_lengkap||'-')}</div>
        <div class="p-det">Cabang: ${esc(rec.cabang_lomba||'-')}</div>
        <div class="p-det">Kecamatan: ${esc(rec.kecamatan||'-')}</div>
      </div>
      <div class="profile-badge">✅ Terverifikasi</div>
    </div>`;
  area.appendChild(wrap);

  // Maqra pengambilan belum dibuka
  if (!maqraData.isOpen) {
    const jadwal = maqraData.jadwalBuka
      ? `Dibuka pada: <strong>${maqraData.jadwalBuka}</strong>`
      : 'Jadwal belum ditentukan. Pantau pengumuman dari panitia.';
    wrap.innerHTML += `
      <div class="info-banner info-lock">
        <div class="info-banner-icon">🔒</div>
        <div><strong>Pengambilan Maqra Belum Dibuka</strong>${jadwal}</div>
      </div>`;
    return;
  }

  // Sudah punya maqra
  if (maqraData.sudahAmbil && maqraData.maqra) {
    const m = maqraData.maqra;
    _maqraResult = m;
    wrap.innerHTML += `
      <div class="info-banner info-green" style="margin-bottom:16px">
        <div class="info-banner-icon">✅</div>
        <div><strong>Anda Sudah Mengambil Maqra</strong>Tersimpan permanen — tidak dapat diubah kembali.</div>
      </div>
      <div class="maqra-result-card">
        <div class="particles" id="particles"></div>
        <div class="mrc-label">📖 Maqra Anda</div>
        <div class="mrc-ayat">${esc(m.maqra_teks||m.maqra||'-')}</div>
        <div class="mrc-surah">${esc(m.maqra_detail||m.surah||'')}</div>
        <div class="mrc-nomor">Nomor Undian: ${esc(m.nomor_maqra||'-')}</div>
      </div>
      <div style="max-width:380px;margin:0 auto 8px">
        <button class="btn btn-emerald" onclick="downloadKartuPeserta()" style="width:100%;justify-content:center;font-size:15px;padding:13px;background:linear-gradient(135deg,#065f46,#059669);box-shadow:0 2px 8px rgba(5,150,105,.35)">🪪 Unduh Kartu Peserta PDF</button>
        <div class="secondary-links">
          <button onclick="downloadBukti()">⬇️ Unduh Bukti Maqra</button>
          <a href="index.html">🏠 Beranda</a>
        </div>
      </div>`;
    return;
  }

  // Maqra habis
  _maqraList = maqraData.list || [];
  if (!_maqraList.length) {
    wrap.innerHTML += `
      <div class="info-banner info-red">
        <div class="info-banner-icon">😔</div>
        <div><strong>Maqra Habis</strong>Semua maqra untuk cabang ini sudah diambil. Hubungi panitia.</div>
      </div>`;
    return;
  }

  // Siap ambil maqra — tampilkan spin card
  wrap.innerHTML += buildSpinCardHtml();
  area.appendChild(wrap);
  buildStars();
  buildLanternStrip(_maqraList);
}

function buildSpinCardHtml() {
  return `
    <div class="spin-card">
      <div class="spin-card-header">
        <div class="spin-card-icon">✨</div>
        <div>
          <div class="spin-card-title">Pengambilan Maqra</div>
          <div class="spin-card-sub">Maqra dipilih secara acak — adil untuk semua peserta</div>
        </div>
      </div>
      <div class="spin-body">
        <div class="spin-stage" id="spinStage">
          <div class="glow-ring"></div>
          <div class="lantern-container" id="lanternBox">
            <div class="lantern-strip" id="lanternStrip"></div>
            <div class="lantern-window">
              <div class="lantern-window-border"></div>
            </div>
            <div class="star-field" id="starField"></div>
          </div>
          <div class="spin-status" id="spinStatus">Siap mengambil maqra...</div>
          <div class="result-reveal" id="resultReveal" style="margin-top:20px">
            <div class="maqra-result-card" id="resultCard">
              <div class="particles" id="particles"></div>
              <div class="mrc-label">📖 Maqra Anda</div>
              <div class="mrc-ayat" id="resultAyat">—</div>
              <div class="mrc-surah" id="resultSurah">—</div>
              <div class="mrc-nomor" id="resultNomor">—</div>
            </div>
            <div style="max-width:340px;margin:14px auto 0">
              <button class="btn btn-emerald" onclick="downloadKartuPeserta()" style="width:100%;justify-content:center;font-size:15px;padding:13px;background:linear-gradient(135deg,#065f46,#059669)">🪪 Unduh Kartu Peserta PDF</button>
              <div class="secondary-links">
                <button onclick="downloadBukti()">⬇️ Unduh Bukti</button>
                <a href="index.html">🏠 Beranda</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="spin-trigger" id="spinTrigger">
        <button class="btn btn-emerald" style="width:100%;justify-content:center;font-size:15px;padding:13px"
                id="spinBtn" onclick="startSpin()">
          🌟 Ambil Maqra Saya
        </button>
        <p style="font-size:12px;color:var(--g400);text-align:center;margin-top:10px">
          ⚠️ Maqra yang sudah diperoleh tidak dapat diubah kembali
        </p>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════
//  MAQRA SPIN LOGIC
// ════════════════════════════════════════════════════════════
function buildStars() {
  const sf = document.getElementById('starField');
  if (!sf) return;
  sf.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 3 + 1;
    s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--s-dur:${(Math.random()*2+1.5).toFixed(1)}s;--s-delay:${(Math.random()*3).toFixed(1)}s`;
    sf.appendChild(s);
  }
}

function buildLanternStrip(list) {
  const strip = document.getElementById('lanternStrip');
  if (!strip) return;
  strip.innerHTML = '';
  // 6x repeat agar zona aman cukup panjang
  [...list,...list,...list,...list,...list,...list].forEach(item => {
    const div = document.createElement('div');
    div.className   = 'lantern-item';
    div.textContent = item.maqra_teks || item.maqra || '—';
    strip.appendChild(div);
  });
}

async function startSpin() {
  if (_spinning || !_record || !_maqraList.length) return;
  _spinning = true;

  const btn      = document.getElementById('spinBtn');
  const trigger  = document.getElementById('spinTrigger');
  const status   = document.getElementById('spinStatus');
  const strip    = document.getElementById('lanternStrip');
  const reveal   = document.getElementById('resultReveal');

  if (btn) btn.disabled = true;
  if (reveal) reveal.classList.remove('show');
  if (status) status.textContent = '🌟 Mengambil maqra...';

  const itemH      = 50;
  const totalItems = strip.childElementCount;
  const safeMax    = Math.floor(totalItems * 0.55) * itemH;
  const wrapPos    = Math.floor(totalItems / 6) * itemH;

  // Mulai dari 1/6 posisi agar tidak lompat dari nol
  let offset = wrapPos;
  strip.style.transition = 'none';
  strip.style.transform  = `translateY(-${offset}px)`;
  void strip.offsetHeight; // force reflow

  // FIX: satu langkah animasi, dipakai bersama oleh teaser spin (Phase 1)
  // dan spin lambat selama menunggu server (Phase 2 baru). Saat offset
  // wrap-around ke awal, transisi dimatikan sesaat (transition:none)
  // supaya loncatannya instan, bukan ikut dianimasikan mundur — itulah
  // sebabnya sebelumnya animasi terlihat "tersentak"/tidak smooth tiap
  // kali strip mengulang dari awal.
  function stepSpin(durMs) {
    offset += itemH;
    if (offset >= safeMax) {
      offset = wrapPos;
      strip.style.transition = 'none';
      strip.style.transform  = `translateY(-${offset}px)`;
      void strip.offsetHeight;
    } else {
      strip.style.transition = `transform ${durMs}ms ease-in-out`;
      strip.style.transform  = `translateY(-${offset}px)`;
    }
  }

  // Phase 1: teaser spin — akselerasi bertahap
  const phases = [
    { dur:320, count:5  },
    { dur:220, count:8  },
    { dur:175, count:10 },
    { dur:150, count:10 },
  ];
  for (const ph of phases) {
    for (let i = 0; i < ph.count; i++) {
      stepSpin(ph.dur);
      await sleep(ph.dur + 8);
    }
  }

  // Phase 2: call API via JSONP POST (no fetch, no CORS)
  // FIX: sebelumnya strip diam TOTAL di sini menunggu respons server —
  // panggilan ambilMaqra ke Apps Script bisa makan beberapa detik
  // (baca+tulis sheet), dan tanpa gerakan sama sekali itu terlihat
  // seperti nge-freeze 6-10 detik. Sekarang strip terus berputar pelan
  // selama menunggu, baru berhenti begitu respons (sukses/gagal) datang.
  if (status) status.textContent = '🔐 Mengunci pilihan...';
  let keepSpinning = true;
  (async () => {
    while (keepSpinning) {
      stepSpin(260);
      await sleep(268);
    }
  })();

  let chosen = null;
  try {
    const data = await jsonpPost({
      action            : 'ambilMaqra',
      nomor_pendaftaran : _record.nomor_pendaftaran,
      cabang_lomba      : _record.cabang_lomba,
      nik               : _record.nik,
    });

    if (!data.success) {
      showToast('Gagal', data.message || 'Terjadi kesalahan. Coba lagi.', 'error', 6000);
      if (status) status.textContent = 'Gagal. Silakan coba lagi.';
      if (btn) btn.disabled = false;
      _spinning = false;
      return;
    }
    chosen       = data.maqra;
    _maqraResult = data.maqra;
  } catch (err) {
    showToast('Error', 'Gagal menghubungi server: ' + err.message, 'error');
    if (status) status.textContent = 'Error. Silakan coba lagi.';
    if (btn) btn.disabled = false;
    _spinning = false;
    return;
  } finally {
    keepSpinning = false;
  }

  // Phase 3: decelerate to chosen item
  // FIX: sebelumnya mencari target dari titik TETAP (midStart = 1/3 dari
  // total item), tidak peduli strip sedang berada di posisi mana. Kalau
  // titik tetap itu kebetulan lebih "ke atas" dari offset saat ini
  // (sangat mungkin, karena Phase 1+2 terus maju dan bisa sudah lewat
  // 1/3 itu), strip terpaksa meluncur MUNDUR dulu untuk mencapainya —
  // itulah "loncat ke atas" yang terlihat. Sekarang dicari MULAI dari
  // beberapa item DI DEPAN posisi sekarang, jadi geraknya selalu lanjut
  // ke bawah, tidak pernah berbalik arah.
  if (status) status.textContent = '✨ Maqra ditemukan!';
  const items     = Array.from(strip.children);
  const refTxt    = (chosen.maqra_teks || chosen.maqra || '').trim();
  const curIdx    = offset / itemH;
  const minAhead  = 15;   // jarak minimum di depan supaya deselerasi masih terasa mulus
  let targetIdx = -1;
  for (let i = Math.ceil(curIdx) + minAhead; i < items.length - 5; i++) {
    if ((items[i].textContent || '').trim() === refTxt) { targetIdx = i; break; }
  }
  if (targetIdx === -1) {
    // Reel pendek / posisi sudah dekat ujung — cari lagi dengan jarak
    // minimum yang lebih longgar, TETAP tidak boleh mundur dari posisi
    // sekarang.
    for (let i = Math.ceil(curIdx) + 1; i < items.length; i++) {
      if ((items[i].textContent || '').trim() === refTxt) { targetIdx = i; break; }
    }
  }
  if (targetIdx === -1) targetIdx = items.length - 1; // fallback terakhir, seharusnya tak pernah kepakai
  // Hitung windowCenterY dinamis dari DOM
  const lanternBox  = document.getElementById('lanternBox');
  const windowH     = lanternBox ? lanternBox.clientHeight : 200;
  const windowCenterY = windowH / 2;
  const targetY     = targetIdx * itemH - windowCenterY + itemH / 2;

  strip.style.transition = 'transform 2s cubic-bezier(0.16,1,0.3,1)';
  strip.style.transform  = `translateY(-${targetY}px)`;
  await sleep(2100);

  items.forEach(it => it.classList.remove('highlight'));
  if (items[targetIdx]) {
    items[targetIdx].classList.add('highlight');

    // Micro-correction: koreksi sisa selisih agar teks persis di tengah garis emas
    if (lanternBox) {
      const containerRect = lanternBox.getBoundingClientRect();
      const itemRect      = items[targetIdx].getBoundingClientRect();
      const diff = (itemRect.top + itemRect.height / 2) - (containerRect.top + containerRect.height / 2);
      if (Math.abs(diff) > 1) {
        const cur = parseFloat(strip.style.transform.replace('translateY(','').replace('px)','')) || 0;
        strip.style.transition = 'transform 0.3s ease-out';
        strip.style.transform  = `translateY(-${Math.abs(cur) + diff}px)`;
        await sleep(320);
      }
    }
  }

  // Phase 4: reveal
  await sleep(120);
  const ayat  = document.getElementById('resultAyat');
  const surah = document.getElementById('resultSurah');
  const nomor = document.getElementById('resultNomor');
  if (ayat)  ayat.textContent  = chosen.maqra_teks || chosen.maqra || '—';
  if (surah) surah.textContent = chosen.maqra_detail || chosen.surah || '—';
  if (nomor) nomor.textContent = `Nomor Undian: ${chosen.nomor_maqra || '—'}`;
  if (reveal) { reveal.style.display = 'block'; reveal.classList.add('show'); }
  spawnParticles();
  launchConfetti();
  if (trigger) trigger.style.display = 'none';
  if (status)  status.textContent = '🎉 Maqra berhasil diperoleh!';
  _spinning = false;
}

function spawnParticles() {
  const c = document.getElementById('particles');
  if (!c) return;
  c.innerHTML = '';
  const cols = ['#fbbf24','#a7f3d0','#fff','#fde68a','#6ee7b7'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const sz = Math.random()*8+4, ang = Math.random()*360*(Math.PI/180), d = Math.random()*80+30;
    p.style.cssText = `width:${sz}px;height:${sz}px;background:${cols[Math.floor(Math.random()*cols.length)]};left:${40+Math.random()*20}%;top:${40+Math.random()*20}%;--px:${(Math.cos(ang)*d).toFixed(0)}px;--py:${(Math.sin(ang)*d).toFixed(0)}px;--p-dur:${(Math.random()*.6+.6).toFixed(2)}s;--p-delay:${(Math.random()*.2).toFixed(2)}s;border-radius:${Math.random()>.5?'50%':'4px'}`;
    c.appendChild(p);
  }
}

function launchConfetti() {
  const cc = document.getElementById('confettiContainer');
  if (!cc) return;
  cc.innerHTML = '';
  const cols = ['#059669','#fbbf24','#3b82f6','#ec4899','#a855f7','#f97316','#10b981'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('div');
    p.className = 'conf-piece';
    p.style.cssText = `left:${Math.random()*100}%;background:${cols[Math.floor(Math.random()*cols.length)]};width:${Math.random()*8+5}px;height:${Math.random()*8+5}px;border-radius:${Math.random()>.5?'50%':'2px'};--c-dx:${(Math.random()*200-100).toFixed(0)}px;--c-dur:${(Math.random()*2+2).toFixed(1)}s;--c-delay:${(Math.random()*.5).toFixed(2)}s`;
    cc.appendChild(p);
  }
  setTimeout(() => { cc.innerHTML = ''; }, 5500);
}

function downloadBukti() {
  if (!_maqraResult || !_record) return;
  const m = _maqraResult, rec = _record;
  // FIX #33: template kartu diambil dari kartu-bukti-shared.js (SATU
  // SUMBER dipakai bersama admin-maqra.js utk unduh borongan) -- lihat
  // file itu utk detail markup/style, jangan duplikasi lagi di sini.
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Bukti Maqra MTQ 2026</title>
<style>${BUKTI_MAQRA_STYLES}</style></head>
<body>${buildBuktiMaqraCardHtml(rec, m, esc)}</body></html>`;
  const a = Object.assign(document.createElement('a'), {
    href    : URL.createObjectURL(new Blob([html], { type:'text/html;charset=utf-8' })),
    download: `Bukti_Maqra_${(rec.nomor_pendaftaran||'MTQ').replace(/[^A-Za-z0-9]/g,'_')}.html`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ════════════════════════════════════════════════════════════
//  KARTU PESERTA — PDF cocard (Canvas → jsPDF)
// ════════════════════════════════════════════════════════════

/**
 * Entry point — kumpulkan anggota, render canvas per member, gabung jadi PDF
 */
async function downloadKartuPeserta() {
  if (!_record) return;
  const rec     = _record;
  const isTeam  = (rec.tipe_lomba || '').toLowerCase() === 'team';

  // Bangun daftar member: untuk tim pakai rec.anggota, individu bungkus jadi array 1 item
  // CATATAN PERBAIKAN: foto disimpan sebagai `link_foto` di anggota_json (lihat api.gs/apiRegister_),
  // bukan `foto_url`/`foto_drive_url` — sebelumnya field ini selalu kosong sehingga foto tak pernah tampil.
  const leadFoto = (rec.anggota && rec.anggota[0] && rec.anggota[0].link_foto) || rec.foto_url || rec.foto_drive_url || '';
  const anggota = isTeam && Array.isArray(rec.anggota) && rec.anggota.length
    ? rec.anggota
    : [{ nama_lengkap: rec.nama_lengkap, nik: rec.nik,
         foto_url: leadFoto,
         no_peserta: rec.nomor_pendaftaran }];

  showLoading(true, 'Membuat kartu peserta...');
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    // Dimensi cocard: 85.6 × 140 mm, @3× scale untuk kualitas cetak
    const CARD_W_MM = 85.6;
    const CARD_H_MM = 140;
    const SCALE     = 3.0;
    const PX_PER_MM = 96 / 25.4 * SCALE;
    const CW        = Math.round(CARD_W_MM * PX_PER_MM);
    const CH        = Math.round(CARD_H_MM * PX_PER_MM);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:[CARD_W_MM, CARD_H_MM] });

    for (let i = 0; i < anggota.length; i++) {
      const member = anggota[i];
      if (i > 0) pdf.addPage([CARD_W_MM, CARD_H_MM], 'portrait');
      const canvas = await renderKartuCanvas(member, rec, i, isTeam, CW, CH, loadDriveImageViaProxy);
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, CARD_W_MM, CARD_H_MM);
    }

    const fname = `Kartu_Peserta_MTQ2026_${(rec.nomor_pendaftaran||'MTQ').replace(/[^A-Za-z0-9]/g,'_')}.pdf`;
    pdf.save(fname);
    showToast('Berhasil', `Kartu peserta diunduh — ${anggota.length} halaman`, 'success', 5000);
  } catch (err) {
    log.error('[KartuPeserta]', err);
    showToast('Error', 'Gagal membuat kartu: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

/** Render satu kartu cocard ke canvas -- lihat renderKartuCanvas() di
 * js/kartu-bukti-shared.js (FIX #33: dipakai bersama admin-maqra.js utk
 * unduh kartu borongan, jadi definisinya dipindah ke sana). */
// FIX #35: tambah 1x percobaan ulang sebelum menyerah — pelengkap fix di
// backend (apiGetDriveImage_ sekarang kirim thumbnail kecil, bukan file
// asli). Payload yang jauh lebih kecil seharusnya sudah menghilangkan
// sebagian besar timeout, tapi jaringan tetap bisa transient gagal
// sesekali — 1x retry dengan jeda singkat menangkap kasus itu tanpa
// perlu peserta/admin mengunduh ulang secara manual dari awal.
async function loadDriveImageViaProxy(url, _attempt = 1) {
  if (!url) return null;
  let id = null;
  let m = String(url).match(/[?&]id=([^&]+)/);
  if (m) id = m[1];
  if (!id) { m = String(url).match(/\/file\/d\/([^\/\?&]+)/); if (m) id = m[1]; }
  if (!id) return null;

  try {
    const data = await jsonpGet({ action: 'getDriveImage', id }, 20000);
    if (!data || !data.success || !data.dataUrl) {
      if (_attempt < 2) { await sleep(500); return loadDriveImageViaProxy(url, _attempt + 1); }
      return null;
    }
    const img = await new Promise(resolve => {
      const im = new Image();
      im.onload  = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = data.dataUrl;
    });
    if (!img && _attempt < 2) { await sleep(500); return loadDriveImageViaProxy(url, _attempt + 1); }
    return img;
  } catch (err) {
    if (_attempt < 2) { await sleep(500); return loadDriveImageViaProxy(url, _attempt + 1); }
    return null;
  }
}

/** Helper: roundRect polyfill (cek native dulu) */

/** FIX: loadImageSafe (lama, img.crossOrigin='anonymous' ke URL Drive
 * langsung) dihapus dari sini — sudah digantikan loadDriveImageViaProxy
 * di atas untuk kasus kartu peserta. Lihat komentar di sana untuk
 * alasannya (Drive tidak pernah mengirim header CORS untuk thumbnail).
 */

/** Helper: lazy-load script tag (skip jika sudah ada) */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src     = src;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Gagal load: ' + src));
    document.head.appendChild(s);
  });
}

// ════════════════════════════════════════════════════════════
//  PERBAIKAN DATA (status = Ditolak)
// ════════════════════════════════════════════════════════════
function showEditForm() {
  if (!_record) return;
  // FIX: editArea sekarang tampil sebagai "tab"/halaman terpisah dari
  // statusArea (bukan menumpuk di bawahnya) — lihat closeEditForm() untuk
  // arah sebaliknya, dan clearAreas() untuk reset state saat pencarian
  // baru / setelah kirim perbaikan berhasil.
  document.getElementById('statusArea').style.display = 'none';
  // FIX: label tombol "← Kembali" di atas panel2 ikut disesuaikan supaya
  // sesuai dengan tujuannya yang sekarang (lihat backFromPanel2()).
  const backBtn = document.getElementById('panel2BackBtn');
  if (backBtn) backBtn.textContent = '← Kembali ke Status';
  const rec     = _record;
  const isTeam  = (rec.tipe_lomba || '').toLowerCase() === 'team';
  // FIX #2: sebelumnya syarat "isTeam &&" di sini membuat peserta INDIVIDU
  // tidak pernah memakai rec.anggota — padahal link_foto/link_ktp (dan hasil
  // perbaikan sebelumnya) tersimpan di situ untuk SEMUA tipe peserta, karena
  // apiRegister_ selalu mengisi anggota_json walau untuk pendaftar individu.
  const anggota = (rec.anggota && rec.anggota.length)
    ? rec.anggota
    : [{ nama_lengkap:rec.nama_lengkap, nik:rec.nik, tempat_lahir:rec.tempat_lahir,
         tanggal_lahir:rec.tanggal_lahir, jenis_kelamin:rec.jenis_kelamin,
         alamat:rec.alamat, no_hp:rec.no_hp }];
  _editFiles = {};
  // FIX: NIK sekarang bisa diubah/diganti di form ini (lihat blok NIK &
  // gantiPeserta() di bawah) — reset state validasi NIK dari sesi
  // showEditForm() SEBELUMNYA (kalau ada) supaya tidak nyangkut dan
  // keliru memblokir/meloloskan submit utk record yang BERBEDA.
  resetNikValidationState();
  // Snapshot data anggota ASLI dari server — dipakai gantiPeserta()/
  // batalGantiPeserta() supaya tombol "↩ Batal" bisa mengembalikan slot
  // anggota tim persis seperti semula (termasuk link_foto/link_ktp lama).
  _originalMembers = {};
  anggota.forEach((m, idx) => { _originalMembers[idx] = { ...m }; });
  // Simpan ageRule dari _record untuk dipakai saat validasi DOB
  // Field ini dikirim dari server bersama data peserta (umur_min, umur_max_*)
  const _ageRule = {
    min   : rec.umur_min         ?? 0,
    maxThn: rec.umur_max_tahun   ?? 99,
    maxBln: rec.umur_max_bulan   ?? 11,
    maxHri: rec.umur_max_hari    ?? 30,
    // FIX #26 (Bug 3): urutan fallback DIBALIK — rec.age_cutoff sekarang
    // menang duluan. rec.age_cutoff dikirim FRESH oleh server di setiap
    // respons checkNIK (lihat _buildNIKRecord di api.gs, field age_cutoff
    // = PENDAFTARAN_CONFIG.AGE_CUTOFF_DATE), jadi selalu akurat. Sebelumnya
    // MTQ_CONFIG.AGE_CUTOFF_DATE (fallback statis dari config.js) dicek
    // LEBIH DULU — karena nilai itu SELALU ada (bukan kosong/undefined),
    // rec.age_cutoff yang live jadi tidak akan pernah kepakai sama sekali.
    // Tidak salah SAAT INI (kedua nilai kebetulan sama), tapi kalau
    // AGE_CUTOFF_DATE diubah di config.gs tanpa mengubah config.js juga,
    // form perbaikan ini diam-diam akan validasi pakai tanggal cutoff yang
    // salah walau server sendiri sudah benar.
    cutoff: rec.age_cutoff
            || (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG.AGE_CUTOFF_DATE : null)
            || new Date().toISOString().slice(0,10),
  };
  // FIX #1: syarat usia sekarang ditampilkan eksplisit di form (bukan cuma
  // divalidasi diam-diam sesudah user salah isi tanggal lahir).
  const _ageRuleLabel = _ageRule.maxThn < 99
    ? `maks. ${_ageRule.maxThn} thn ${_ageRule.maxBln} bln ${_ageRule.maxHri} hr (per ${fmtTglID(_ageRule.cutoff)})${_ageRule.min>0?`, min. ${_ageRule.min} thn`:''}`
    : (_ageRule.min > 0 ? `min. ${_ageRule.min} tahun` : 'tidak ada batas usia khusus untuk cabang ini');

  // FIX: dipakai tambahAnggotaTim() supaya bisa membangun kartu anggota
  // baru dengan konteks (aturan umur, nomor pendaftaran) yang sama persis
  // dengan render awal ini, walau dipanggil belakangan dari klik tombol
  // (di luar closure showEditForm() ini).
  _teamCtx = { isTeam, ageRule: _ageRule, ageRuleLabel: _ageRuleLabel, nomorPendaftaran: rec.nomor_pendaftaran || '' };
  _originalMemberCount = anggota.length;

  let membersHtml = anggota.map((m, idx) => buildMemberCardHtml(m, idx, isTeam, _ageRule, _ageRuleLabel, rec.nomor_pendaftaran)).join('');

  document.getElementById('editArea').innerHTML = `
    <div class="edit-card">
      <div class="edit-header">
        <h3>✏️ Perbaikan Data Pendaftaran</h3>
        <p>Nomor: <strong>${esc(rec.nomor_pendaftaran||'')}</strong></p>
      </div>
      <div class="edit-body">
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#dc2626">
          <strong>📋 Alasan Penolakan:</strong> ${esc(rec.catatan||'Tidak ada keterangan')}
        </div>
        <div id="membersContainer">${membersHtml}</div>
        ${isTeam ? `
        <div id="tambahAnggotaWrap" style="display:${anggota.length<3?'block':'none'};margin-bottom:16px">
          <button type="button" onclick="tambahAnggotaTim()" style="width:100%;justify-content:center;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#059669;background:#ecfdf5;border:1.5px dashed #6ee7b7;border-radius:8px;padding:12px;cursor:pointer">➕ Tambah Anggota ke-3</button>
        </div>` : ``}
        <div class="edit-section">
          <div class="edit-section-title">📋 Surat Rekomendasi <span class="req">*</span></div>
          ${uzMini('rekom','Surat Rekomendasi',rec.link_rekom)}
          <div style="font-size:11px;color:var(--g400);margin-top:4px">${rec.link_rekom ? 'Bisa memakai berkas yang sudah ada, atau ganti dengan yang baru.' : 'Wajib diunggah — belum ada berkas tersimpan.'}</div>
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px;border:1.5px solid var(--g200);border-radius:8px;margin-bottom:16px">
          <input type="checkbox" id="editAgree" style="margin-top:2px;width:16px;height:16px;accent-color:var(--em);flex-shrink:0">
          <span style="font-size:13px;color:var(--g600)">Saya menyatakan data yang diisikan sudah benar dan lengkap.</span>
        </label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-red" id="submitPerbBtn"
            onclick="submitPerbaikan('${esc(rec.nomor_pendaftaran||'')}')">
            ✨ Kirim Perbaikan
          </button>
          <button type="button" class="btn btn-outline" onclick="closeEditForm()">✕ Batal</button>
        </div>
      </div>
    </div>`;

  document.getElementById('editArea').style.display = 'block';

  // Bind upload zones
  for (let i = 0; i < anggota.length; i++) {
    bindUZ('foto_'+i); bindUZ('ktp_'+i);
    bindUZ('sert_'+i+'_1');
  }
  bindUZ('rekom');
  setTimeout(() => document.getElementById('editArea').scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}

// FIX: kebalikan dari showEditForm() — kembali ke "tab" statusArea.
// Dipanggil dari tombol "✕ Batal" di form perbaikan, dan dari
// backFromPanel2() saat tombol "← Kembali" di atas panel2 diklik
// ketika editArea sedang tampil.
function closeEditForm() {
  // FIX #29 (Bug 2): sama seperti goToPanel() — tutup dp-modal kalau
  // sedang terbuka saat form perbaikan ditutup/dibatalkan lewat tombol
  // "✕ Batal" (fungsi ini juga dipanggil dari backFromPanel2()).
  previewer?.close();
  const editEl = document.getElementById('editArea');
  editEl.innerHTML    = '';
  editEl.style.display = 'none';
  document.getElementById('statusArea').style.display = 'block';
  const backBtn = document.getElementById('panel2BackBtn');
  if (backBtn) backBtn.textContent = '← Kembali ke Pencarian';
}

// ── Validasi Tanggal Lahir pada Edit Form ────────────────────
function validateDOB(input, ageRule, idx) {
  const dob     = input.value;
  const msgEl   = document.getElementById('age_msg_' + idx);
  if (!msgEl) return;

  if (!dob) { msgEl.style.display = 'none'; return; }

  // Gunakan calcAgeAt dari config.js jika tersedia
  let age;
  if (typeof calcAgeAt === 'function') {
    age = calcAgeAt(dob, ageRule.cutoff);
  } else {
    // Fallback manual
    const cutoff = new Date(ageRule.cutoff + 'T00:00:00');
    const dobD   = new Date(dob + 'T00:00:00');
    let yr = cutoff.getFullYear() - dobD.getFullYear();
    let mo = cutoff.getMonth()    - dobD.getMonth();
    let dy = cutoff.getDate()     - dobD.getDate();
    if (dy < 0) { mo--; dy += new Date(cutoff.getFullYear(), cutoff.getMonth(), 0).getDate(); }
    if (mo < 0) { yr--; mo += 12; }
    age = { tahun: yr, bulan: mo, hari: dy };
  }

  let ok = true, msg = '';
  const { min, maxThn, maxBln, maxHri } = ageRule;

  // Cek minimum
  if (age.tahun < min) {
    ok = false;
    msg = `⚠️ Usia terlalu muda — minimum ${min} tahun (usia Anda: ${age.tahun} thn ${age.bulan} bln ${age.hari} hr)`;
  }
  // Cek maximum (presisi hari)
  else if (maxThn < 99) {
    const melebihiThn = age.tahun > maxThn;
    const melebihiBln = age.tahun === maxThn && age.bulan > maxBln;
    const melebihiHri = age.tahun === maxThn && age.bulan === maxBln && age.hari > maxHri;
    if (melebihiThn || melebihiBln || melebihiHri) {
      ok = false;
      msg = `⚠️ Usia melebihi batas — maksimal ${maxThn} thn ${maxBln} bln ${maxHri} hr ` +
            `(usia Anda: ${age.tahun} thn ${age.bulan} bln ${age.hari} hr)`;
    }
  }

  if (ok) {
    msg = `✅ Usia valid: ${age.tahun} thn ${age.bulan} bln ${age.hari} hr`;
    msgEl.style.color       = 'var(--em, #059669)';
    input.style.borderColor = 'var(--em, #059669)';
    input.style.boxShadow   = '0 0 0 3px rgba(5,150,105,.1)';
  } else {
    msgEl.style.color       = 'var(--red, #dc2626)';
    input.style.borderColor = 'var(--red, #dc2626)';
    input.style.boxShadow   = '0 0 0 3px rgba(220,38,38,.1)';
  }

  msgEl.textContent    = msg;
  msgEl.style.display  = 'block';
}

// Validasi semua DOB sebelum submit
function allDOBValid(anggotaCount, ageRule) {
  for (let i = 0; i < anggotaCount; i++) {
    const inp = document.getElementById('em_dob_' + i);
    if (!inp || !inp.value) continue;
    // Trigger ulang validasi untuk memperbarui visual
    validateDOB(inp, ageRule, i.toString());
    const msgEl = document.getElementById('age_msg_' + i);
    if (msgEl && msgEl.textContent.startsWith('⚠️')) return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════
//  VALIDASI NIK PADA EDIT FORM
// ════════════════════════════════════════════════════════════
// FIX: NIK pada form perbaikan dulu SELALU dikunci (lihat komentar lama
// "NIK tidak pernah diupdate dari body" yang sudah dihapus di apiPerbaikan_,
// api.gs). Sekarang NIK boleh diubah — dipakai utk 2 skenario: (1) peserta
// individu membetulkan NIK yang salah ketik, (2) mengganti satu anggota
// tim dengan peserta yang sama sekali baru (lihat gantiPeserta() di bawah).
// Supaya tidak menimbulkan NIK ganda, tiap perubahan NIK dicek instan ke
// server (action=checkNIK) — TAPI ini cuma feedback cepat di UI. Penjagaan
// yang MENGIKAT tetap di server: apiPerbaikan_ (api.gs) memanggil
// checkNIKDuplicate_ (helper.gs) sebelum menyimpan apa pun, jadi walau
// validasi di sini dilewati/dimanipulasi, server tetap menolak NIK bentrok.
const _nikState       = {};   // idx -> 'ok' | 'dup' | 'invalid' | 'checking' | 'unknown'
const _nikCheckTimers = {};   // idx -> id setTimeout (debounce 500ms)
let   _originalMembers = {};  // idx -> snapshot asli anggota dari server (diisi showEditForm())
// FIX: dipakai fitur "Tambah Anggota" / "Hapus Anggota" (lihat
// buildMemberCardHtml/tambahAnggotaTim/hapusAnggotaTim di bawah) — kedua
// tombol itu dipanggil dari klik user, DI LUAR closure showEditForm(),
// jadi butuh state ini di level modul supaya tetap tahu konteks form
// yang sedang terbuka (aturan umur, nomor pendaftaran, jumlah anggota
// ASLI saat form pertama kali dibuka).
let _teamCtx = { isTeam:false, ageRule:null, ageRuleLabel:'', nomorPendaftaran:'' };
let _originalMemberCount = 0;

// Dipanggil dari showEditForm() supaya state sesi form SEBELUMNYA (kalau
// ada) tidak nyangkut ke record yang baru dibuka.
function resetNikValidationState() {
  Object.values(_nikCheckTimers).forEach(t => clearTimeout(t));
  for (const k in _nikCheckTimers) delete _nikCheckTimers[k];
  for (const k in _nikState) delete _nikState[k];
}

// Dipakai via oninput="sanitizeNikInput(this)" — hanya izinkan angka & maks
// 16 digit, sambil mempertahankan posisi kursor (pola sama seperti
// toUpperInput() di doyourmagic.html).
function sanitizeNikInput(el) {
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.replace(/\D/g, '').slice(0, 16);
  try { el.setSelectionRange(s, e); } catch(_) {}
}

function checkNikAvailability(input, idx, nomorSelf, immediate) {
  const idxKey   = String(idx);
  const msgEl    = document.getElementById('nik_msg_' + idxKey);
  const val      = input.value.trim();
  const original = input.dataset.original || '';
  const showMsg  = (color, text) => { if (msgEl) { msgEl.style.display='block'; msgEl.style.color=color; msgEl.textContent=text; } };
  const setBorder = (ok) => {
    input.style.borderColor = ok ? 'var(--em, #059669)' : 'var(--red, #dc2626)';
    input.style.boxShadow   = ok ? '0 0 0 3px rgba(5,150,105,.1)' : '0 0 0 3px rgba(220,38,38,.1)';
  };
  const clearVisual = () => { input.style.borderColor = ''; input.style.boxShadow = ''; if (msgEl) msgEl.style.display = 'none'; };

  clearTimeout(_nikCheckTimers[idxKey]);

  if (!val) {
    _nikState[idxKey] = 'invalid';
    clearVisual();
    return;
  }
  if (!/^\d{16}$/.test(val)) {
    _nikState[idxKey] = 'invalid'; setBorder(false);
    showMsg('var(--red, #dc2626)', '⚠️ NIK harus 16 digit angka');
    return;
  }
  // Cek bentrok dengan NIK anggota LAIN di form yang sama ini dulu — murni
  // lokal, tidak perlu ke server.
  const others = document.querySelectorAll('[id^="em_nik_"]');
  for (const other of others) {
    if (other === input) continue;
    if (other.value.trim() === val) {
      _nikState[idxKey] = 'dup'; setBorder(false);
      showMsg('var(--red, #dc2626)', '⚠️ NIK sama dengan anggota lain di form ini');
      return;
    }
  }
  if (val === original) {
    _nikState[idxKey] = 'ok';
    clearVisual();
    return;
  }

  _nikState[idxKey] = 'checking';
  showMsg('var(--g500, #6b7280)', '⏳ Memeriksa NIK...');

  const run = async () => {
    try {
      const res = await jsonpGet({ action:'checkNIK', nik: val }, 12000);
      if (input.value.trim() !== val) return;   // input sudah berubah lagi — abaikan hasil basi ini
      const status  = String(res?.record?.status_verifikasi || '').trim().toLowerCase();
      const isSelf  = res?.found && res.record && String(res.record.nomor_pendaftaran||'') === String(nomorSelf||'');
      const isFreed = status === 'nonaktif';   // konsisten dgn checkNIKDuplicate_ di helper.gs
      if (res?.found && !isSelf && !isFreed) {
        _nikState[idxKey] = 'dup'; setBorder(false);
        showMsg('var(--red, #dc2626)', '⚠️ NIK sudah terdaftar atas nama ' + (res.record?.nama_lengkap || '-'));
      } else {
        _nikState[idxKey] = 'ok'; setBorder(true);
        showMsg('var(--em, #059669)', '✅ NIK tersedia');
      }
    } catch (e) {
      _nikState[idxKey] = 'unknown';
      clearVisual();
      log.warn('[MTQ] checkNikAvailability gagal', e);
    }
  };

  if (immediate) run();
  else _nikCheckTimers[idxKey] = setTimeout(run, 500);
}

// Validasi semua NIK sebelum submit — TIDAK memicu request baru (biar
// tidak menahan submit menunggu jaringan), cukup baca status hasil cek
// terakhir. 'checking'/'unknown' tetap diizinkan lewat di sini karena
// checkNIKDuplicate_ di server tetap jadi penjaga terakhir yang mengikat.
function allNikValid(anggotaCount) {
  for (let i = 0; i < anggotaCount; i++) {
    const state = _nikState[String(i)];
    if (state === 'dup' || state === 'invalid') return false;
  }
  return true;
}

// ── FIX: fitur "Ganti Peserta" untuk anggota TIM ───────────────────
// Mengosongkan satu slot anggota supaya bisa diisi ulang dengan data
// peserta yang SAMA SEKALI BARU (dipakai kalau satu anggota tim
// mengundurkan diri / tidak memenuhi syarat dan perlu digantikan orang
// lain). Semua field slot ini (nama, NIK, tempat/tanggal lahir, alamat,
// no HP, foto, KTP, sertifikat) dikosongkan — foto/KTP WAJIB diunggah
// ulang karena bukan orang yang sama. NIK slot yang baru ini tetap wajib
// lolos checkNikAvailability()/checkNIKDuplicate_ seperti biasa sebelum
// bisa disimpan. Bisa dibatalkan lewat tombol "↩ Batal" (batalGantiPeserta)
// yang mengembalikan slot ini persis seperti data asli dari server.
function gantiPeserta(idx) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('em_nama_'+idx, ''); setVal('em_tl_'+idx, ''); setVal('em_dob_'+idx, '');
  setVal('em_alamat_'+idx, ''); setVal('em_hp_'+idx, '');

  const ageMsg = document.getElementById('age_msg_'+idx); if (ageMsg) ageMsg.style.display = 'none';

  const nikEl = document.getElementById('em_nik_'+idx);
  if (nikEl) {
    nikEl.value = '';
    nikEl.dataset.original = '\u0000GANTI\u0000';   // nilai yang mustahil sama dgn NIK asli — apa pun yg diisi nanti dianggap "berubah", wajib dicek ulang
    nikEl.style.borderColor = ''; nikEl.style.boxShadow = '';
  }
  const nikMsg = document.getElementById('nik_msg_'+idx); if (nikMsg) nikMsg.style.display = 'none';
  delete _nikState[String(idx)];

  ['foto_'+idx, 'ktp_'+idx, 'sert_'+idx+'_1'].forEach(key => {
    delete _editFiles[key];
    const wrap = document.getElementById('uzwrap_'+key);
    if (wrap) {
      const label = key.startsWith('foto_') ? 'Foto' : key.startsWith('ktp_') ? 'KTP/Akte' : 'Sertifikat / Piagam';
      wrap.outerHTML = uzMini(key, label, '');
      bindUZ(key);
    }
  });

  const labelEl = document.getElementById('anggotaLabel_'+idx);
  if (labelEl) labelEl.innerHTML = `🆕 Peserta Baru <button type="button" onclick="batalGantiPeserta(${idx})" style="margin-left:8px;font-size:11px;font-weight:600;color:var(--g500,#6b7280);background:#fff;border:1px solid var(--g300,#d1d5db);border-radius:6px;padding:2px 8px;cursor:pointer">↩ Batal</button>`;
  const gantiBtn = document.getElementById('gantiBtn_'+idx); if (gantiBtn) gantiBtn.style.display = 'none';

  document.getElementById('em_nama_'+idx)?.focus();
  showToast('Slot Dikosongkan', 'Isi data peserta baru untuk anggota ini, lalu unggah foto & KTP baru.', 'info');
}

function batalGantiPeserta(idx) {
  const orig = _originalMembers[idx];
  if (!orig) return;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('em_nama_'+idx, orig.nama_lengkap);
  setVal('em_tl_'+idx, orig.tempat_lahir);
  setVal('em_dob_'+idx, orig.tanggal_lahir);
  setVal('em_alamat_'+idx, orig.alamat);
  setVal('em_hp_'+idx, orig.no_hp);

  const nikEl = document.getElementById('em_nik_'+idx);
  if (nikEl) {
    nikEl.value = orig.nik || '';
    nikEl.dataset.original = orig.nik || '';
    nikEl.style.borderColor = ''; nikEl.style.boxShadow = '';
  }
  const nikMsg = document.getElementById('nik_msg_'+idx); if (nikMsg) nikMsg.style.display = 'none';
  const ageMsg = document.getElementById('age_msg_'+idx); if (ageMsg) ageMsg.style.display = 'none';
  delete _nikState[String(idx)];

  ['foto_'+idx, 'ktp_'+idx, 'sert_'+idx+'_1'].forEach(key => {
    delete _editFiles[key];
    const wrap = document.getElementById('uzwrap_'+key);
    if (wrap) {
      const label = key.startsWith('foto_') ? 'Foto' : key.startsWith('ktp_') ? 'KTP/Akte' : 'Sertifikat / Piagam';
      const url   = key.startsWith('foto_') ? orig.link_foto : key.startsWith('ktp_') ? orig.link_ktp : orig.link_sertifikat;
      wrap.outerHTML = uzMini(key, label, url || '');
      bindUZ(key);
    }
  });

  const isTeam  = (_record?.tipe_lomba||'').toLowerCase() === 'team';
  const labelEl = document.getElementById('anggotaLabel_'+idx);
  if (labelEl) labelEl.textContent = isTeam ? (idx===0 ? '👑 Ketua Tim' : `👤 Anggota ${idx+1}`) : '👤 Data Peserta';
  const gantiBtn = document.getElementById('gantiBtn_'+idx); if (gantiBtn) gantiBtn.style.display = '';

  showToast('Dibatalkan', 'Data anggota dikembalikan seperti semula.', 'info');
}

// ════════════════════════════════════════════════════════════
//  TAMBAH / HAPUS ANGGOTA TIM (2-3 anggota per tim, sama seperti batas di
//  apiRegister_ & apiPerbaikan_: cabang tim MTQ min. 2, maks. 3 anggota)
// ════════════════════════════════════════════════════════════
// Template kartu satu anggota — diekstrak dari showEditForm() supaya bisa
// dipakai ulang oleh tambahAnggotaTim() saat menambah kartu baru secara
// dinamis (dulu template ini cuma ada sekali, tertanam langsung di dalam
// showEditForm(), jadi tidak bisa dipanggil ulang dari luar).
function buildMemberCardHtml(m, idx, isTeam, ageRule, ageRuleLabel, nomorPendaftaran) {
  const isKetua = idx === 0;
  const lbl = isTeam ? (isKetua ? '👑 Ketua Tim' : `👤 Anggota ${idx+1}`) : '👤 Data Peserta';
  // Hanya anggota ke-3 (idx===2, slot OPSIONAL) yang bisa dihapus — ketua
  // & anggota ke-2 wajib ada di tim manapun (minimal 2 anggota), jadi
  // sengaja tidak ditawarkan tombol hapus supaya tim tidak bisa turun di
  // bawah minimum tanpa sadar.
  const canRemove = isTeam && idx === 2;
  // "Ganti Peserta" cuma masuk akal utk slot yang SUDAH ADA datanya sejak
  // form ini dibuka (_originalMemberCount, diisi showEditForm()) — kartu
  // yang baru saja ditambahkan lewat tambahAnggotaTim() sudah kosong
  // (tidak ada yang perlu "diganti"), dan batalGantiPeserta() tidak
  // punya snapshot _originalMembers[idx] utk slot semacam itu.
  const showGantiBtn = isTeam && idx < _originalMemberCount;
  return `
    <div class="edit-section" id="memberCard_${idx}">
      <div class="edit-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <span id="anggotaLabel_${idx}">${lbl}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${showGantiBtn ? `<button type="button" id="gantiBtn_${idx}" onclick="gantiPeserta(${idx})" style="font-size:11px;font-weight:600;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:4px 10px;cursor:pointer;white-space:nowrap">🔁 Ganti dengan Peserta Baru</button>` : ``}
          ${canRemove ? `<button type="button" onclick="hapusAnggotaTim(${idx})" style="font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:4px 10px;cursor:pointer;white-space:nowrap">🗑 Hapus Anggota Ini</button>` : ``}
        </div>
      </div>
      <div class="two-col">
        <div class="field-group">
          <label class="field-label">Nama Lengkap <span class="req">*</span></label>
          <input class="field-input" id="em_nama_${idx}" value="${esc(m.nama_lengkap||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">NIK <span class="req">*</span></label>
          <input class="field-input" id="em_nik_${idx}" value="${esc(m.nik||'')}"
                 data-original="${esc(m.nik||'')}" maxlength="16" inputmode="numeric"
                 style="font-family:monospace"
                 oninput="sanitizeNikInput(this); checkNikAvailability(this, ${idx}, '${esc(nomorPendaftaran||'')}')"
                 onblur="checkNikAvailability(this, ${idx}, '${esc(nomorPendaftaran||'')}', true)">
          <div style="font-size:11px;color:var(--g400);margin-top:3px">Bisa diperbaiki kalau salah ketik — pastikan belum terdaftar atas nama orang lain.</div>
          <div id="nik_msg_${idx}" style="margin-top:5px;font-size:12px;font-weight:600;display:none"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Tempat Lahir</label>
          <input class="field-input" id="em_tl_${idx}" value="${esc(m.tempat_lahir||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">Tanggal Lahir</label>
          <input class="field-input" type="date" id="em_dob_${idx}"
                 value="${esc(m.tanggal_lahir||'')}"
                 onchange="validateDOB(this, ${JSON.stringify(ageRule)}, '${esc(idx.toString())}')">
          <div class="age-rule-hint">📏 Syarat cabang: ${esc(ageRuleLabel)}</div>
          <div id="age_msg_${idx}" style="margin-top:5px;font-size:12px;font-weight:600;display:none"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Alamat</label>
          <input class="field-input" id="em_alamat_${idx}" value="${esc(m.alamat||'')}">
        </div>
        <div class="field-group">
          <label class="field-label">No. HP</label>
          <input class="field-input" id="em_hp_${idx}" value="${esc(m.no_hp||'')}">
        </div>
      </div>
      <div class="two-col" style="margin-top:10px">
        <div class="field-group">
          <label class="field-label">📸 Foto Terbaru</label>
          ${uzMini('foto_'+idx,'Foto',m.link_foto)}
        </div>
        <div class="field-group">
          <label class="field-label">🪪 KTP / Akte</label>
          ${uzMini('ktp_'+idx,'KTP/Akte',m.link_ktp)}
        </div>
      </div>
      <div class="field-group" style="margin-top:10px">
        <label class="field-label">🏅 Sertifikat / Piagam (opsional)</label>
        ${uzMini('sert_'+idx+'_1','Sertifikat / Piagam',m.link_sertifikat)}
        <div style="font-size:11px;color:var(--g400);margin-top:4px">JPG/PNG/PDF — maks. 2 MB. Kosongkan jika tidak ingin menambah/mengganti.</div>
      </div>
    </div>`;
}

// Tombol "➕ Tambah Anggota ke-3" — hanya tampil kalau tim baru punya 2
// anggota (lihat display:none/block pada #tambahAnggotaWrap di
// showEditForm()). Menambahkan SATU kartu anggota kosong di index
// berikutnya (selalu idx 2, karena maksimal tim = 3).
function tambahAnggotaTim() {
  const container = document.getElementById('membersContainer');
  if (!container) return;
  const count = container.querySelectorAll('[id^="memberCard_"]').length;
  if (count >= 3) return;   // defensif — tombol seharusnya sudah disembunyikan di titik ini
  const idx = count;
  const html = buildMemberCardHtml({}, idx, true, _teamCtx.ageRule, _teamCtx.ageRuleLabel, _teamCtx.nomorPendaftaran);
  container.insertAdjacentHTML('beforeend', html);
  bindUZ('foto_'+idx); bindUZ('ktp_'+idx); bindUZ('sert_'+idx+'_1');

  const wrap = document.getElementById('tambahAnggotaWrap');
  if (wrap) wrap.style.display = 'none';

  const namaEl = document.getElementById('em_nama_'+idx);
  namaEl?.scrollIntoView({ behavior:'smooth', block:'center' });
  namaEl?.focus();
  showToast('Anggota Ditambahkan', 'Isi data anggota ke-3, lalu unggah foto & KTP.', 'info');
}

// Menghapus kartu anggota ke-3 (satu-satunya slot yang boleh dihapus —
// lihat canRemove di buildMemberCardHtml). Membersihkan seluruh state
// terkait (berkas terupload, status validasi NIK/umur, snapshot asli)
// supaya tidak nyangkut & keliru ikut divalidasi/dikirim saat submit.
function hapusAnggotaTim(idx) {
  const card = document.getElementById('memberCard_'+idx);
  if (card) card.remove();

  ['foto_'+idx, 'ktp_'+idx, 'sert_'+idx+'_1'].forEach(key => delete _editFiles[key]);
  clearTimeout(_nikCheckTimers[String(idx)]);
  delete _nikCheckTimers[String(idx)];
  delete _nikState[String(idx)];
  delete _originalMembers[idx];

  const wrap = document.getElementById('tambahAnggotaWrap');
  if (wrap) wrap.style.display = 'block';

  showToast('Anggota Dihapus', 'Anggota ke-3 sudah dihapus dari tim.', 'info');
}

// FIX (v2 — UI/UX diminta disederhanakan lagi): sebelumnya kartu info
// "dokumen tersimpan" + 2 tombol terpisah (Lihat/Ganti) masih bikin
// bingung. Sekarang dokumen existing tampil sebagai THUMBNAIL ASLI —
// tap di mana saja pada thumbnail = langsung buka pemilih file untuk
// ganti (gaya WhatsApp/Instagram ganti foto profil). Lihat ukuran penuh
// lewat ikon 🔍 kecil di pojok (memicu DocumentPreviewer, terpisah dari
// area tap-untuk-ganti supaya tidak ketukar).
function uzMini(key, label, existingUrl) {
  const hasExisting = !!existingUrl;
  const thumb = hasExisting ? driveThumbUrl(existingUrl) : '';
  return `
    <div class="uz-wrap" id="uzwrap_${key}">
      <div class="uz-photo${hasExisting ? '' : ' empty'}" id="uzphoto_${key}"
           onclick="document.getElementById('uinput_${key}').click()">
        ${hasExisting ? `<img src="${esc(thumb)}" alt="" onerror="this.style.display='none';this.parentElement.classList.add('thumb-fail')">` : ``}
        <div class="uz-photo-overlay">
          <span>${hasExisting ? '🔄' : '📷'}</span>
          <span>${hasExisting ? 'Tap untuk ganti' : 'Tap untuk upload'}</span>
        </div>
        ${hasExisting ? `<button type="button" class="uz-zoom-btn dp-trigger" data-file-url="${esc(existingUrl)}" data-doc-name="${esc(label)}" onclick="event.stopPropagation();openDocPreview('${esc(existingUrl)}','${esc(label)}')" title="Lihat ukuran penuh">🔍</button>` : ``}
      </div>
      <div class="uz-caption">
        <span class="uz-caption-label">${esc(label)}</span>
        <span class="uz-caption-status" id="uzstatus_${key}">${hasExisting ? 'Tersimpan' : 'Belum ada'}</span>
      </div>
      <button type="button" class="uz-undo-btn" id="uzundo_${key}" onclick="undoReplace('${key}','${esc(label)}','${esc(existingUrl||'')}')">↩ Batal, pakai yang lama</button>
      <input type="file" accept="image/jpeg,image/png,application/pdf" id="uinput_${key}" style="display:none">
    </div>`;
}

// Bentuk URL thumbnail Drive dari URL .../file/d/{id}/view — tidak perlu
// API key, cukup untuk file yang sharing-nya "Anyone with link" (semua
// file upload sistem ini memang begitu, lihat uploadFile_ di upload.gs).
function driveThumbUrl(driveViewUrl, size) {
  if (!driveViewUrl) return '';
  const m = String(driveViewUrl).match(/[-\w]{20,}/);
  if (!m) return '';
  return `https://drive.google.com/thumbnail?id=${m[0]}&sz=w${size || 300}`;
}

// Batal ganti — kembali ke dokumen lama (atau kotak kosong kalau memang
// belum ada). Render ulang dari uzMini supaya state selalu konsisten,
// lalu bind ulang input file-nya (outerHTML menghapus listener lama).
function undoReplace(key, label, existingUrl) {
  delete _editFiles[key];
  const wrap = document.getElementById('uzwrap_' + key);
  if (wrap) {
    wrap.outerHTML = uzMini(key, label, existingUrl);
    bindUZ(key);
  }
}

function bindUZ(key) {
  document.getElementById('uinput_'+key)?.addEventListener('change', e => handleFile(key, e.target.files[0]));
}

async function handleFile(key, file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Peringatan','File terlalu besar (maks 2 MB)','warning'); return; }

  let dataUrl;
  try {
    dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result);
      r.onerror = () => rej(new Error('Gagal membaca file'));
      r.readAsDataURL(file);
    });
  } catch (e) { showToast('Error', e.message, 'error'); return; }

  _editFiles[key] = { name: file.name, type: file.type, data: dataUrl.split(',')[1] };

  // Preview instan pakai file yang baru dipilih — tidak perlu upload dulu
  const photo = document.getElementById('uzphoto_' + key);
  if (photo) {
    photo.classList.remove('empty', 'thumb-fail');
    photo.classList.add('has-new');
    let img = photo.querySelector('img');
    if (file.type.startsWith('image/')) {
      if (!img) { img = document.createElement('img'); img.alt=''; photo.insertBefore(img, photo.firstChild); }
      img.style.display = '';
      img.src = dataUrl;
    } else if (img) {
      img.style.display = 'none';   // PDF dll: tidak ada thumbnail gambar
    }
    const overlaySpans = photo.querySelectorAll('.uz-photo-overlay span');
    if (overlaySpans[1]) overlaySpans[1].textContent = 'Tap untuk ganti lagi';
  }
  const statusEl = document.getElementById('uzstatus_' + key);
  if (statusEl) statusEl.textContent = '🆕 ' + file.name;
  const undoBtn = document.getElementById('uzundo_' + key);
  if (undoBtn) undoBtn.style.display = 'inline-block';
}

async function submitPerbaikan(nomor) {
  // FIX: memberCount dulu dikirim sebagai argumen TETAP dari HTML
  // (di-bake saat showEditForm() pertama kali render) — jadi kalau
  // anggota ditambah/dihapus lewat tambahAnggotaTim()/hapusAnggotaTim()
  // sesudahnya, angka ini jadi basi. Sekarang selalu dihitung ULANG dari
  // jumlah kartu anggota yang benar-benar ada di DOM saat submit ditekan.
  const memberCount = document.querySelectorAll('#membersContainer [id^="memberCard_"]').length;

  if (!document.getElementById('editAgree').checked) {
    showToast('Peringatan','Centang persetujuan terlebih dahulu','warning'); return;
  }
  // FIX #2: rekom wajib ADA (baru atau existing), tapi tidak wajib
  // diupload ULANG setiap kali — boleh memakai berkas yang sudah tersimpan.
  const hasExistingRekom = !!(_record && _record.link_rekom);
  if (!_editFiles['rekom'] && !hasExistingRekom) {
    showToast('Peringatan','Surat rekomendasi wajib diupload','warning'); return;
  }

  // Validasi usia semua anggota sebelum submit
  const _ageRule = {
    min   : _record?.umur_min       ?? 0,
    maxThn: _record?.umur_max_tahun ?? 99,
    maxBln: _record?.umur_max_bulan ?? 11,
    maxHri: _record?.umur_max_hari  ?? 30,
    // FIX #26 (Bug 3): lihat catatan yang sama di showEditForm() di atas —
    // _record?.age_cutoff (live dari server saat checkNIK) sekarang menang
    // duluan atas MTQ_CONFIG.AGE_CUTOFF_DATE (fallback statis).
    cutoff: _record?.age_cutoff
            || (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG.AGE_CUTOFF_DATE : null)
            || new Date().toISOString().slice(0,10),
  };
  if (!allDOBValid(memberCount, _ageRule)) {
    showToast('Data Tidak Valid', 'Tanggal lahir tidak memenuhi syarat usia cabang lomba ini', 'error');
    const firstErr = document.querySelector('[id^="age_msg_"]');
    if (firstErr) firstErr.scrollIntoView({ behavior:'smooth', block:'center' });
    return;
  }
  // FIX: NIK sekarang bisa diubah — cek status hasil checkNikAvailability()
  // terakhir sebelum submit (lihat fungsi itu & allNikValid() di atas).
  // Ini feedback cepat di UI; penjagaan yang MENGIKAT tetap di server
  // (apiPerbaikan_ → checkNIKDuplicate_).
  if (!allNikValid(memberCount)) {
    showToast('Data Tidak Valid', 'Periksa kembali NIK yang belum valid atau sudah terdaftar', 'error');
    for (let i = 0; i < memberCount; i++) {
      const st = _nikState[String(i)];
      if (st === 'dup' || st === 'invalid') {
        document.getElementById('em_nik_'+i)?.scrollIntoView({ behavior:'smooth', block:'center' });
        break;
      }
    }
    return;
  }
  // FIX: foto & KTP WAJIB diunggah baru utk (a) slot yang sedang dalam mode
  // "🔁 Ganti dengan Peserta Baru" (gantiPeserta() menandai dataset.original
  // dgn sentinel khusus), MAUPUN (b) anggota ke-3 yang baru ditambahkan lewat
  // "➕ Tambah Anggota ke-3" (tambahAnggotaTim() — idx-nya berada di luar
  // _originalMemberCount, artinya slot ini memang belum pernah ada sebelum
  // form ini dibuka, jadi tidak punya berkas lama utk dipertahankan). Tanpa
  // cek ini, server akan diam-diam mempertahankan foto/KTP milik peserta
  // LAMA (skenario a) atau menyimpan anggota baru TANPA foto/KTP sama
  // sekali (skenario b) — lihat apiPerbaikan_.
  for (let i = 0; i < memberCount; i++) {
    const nikInput    = document.getElementById('em_nik_'+i);
    const isReplacing = nikInput?.dataset.original === '\u0000GANTI\u0000';
    const isNewSlot   = i >= _originalMemberCount;
    if ((isReplacing || isNewSlot) && (!_editFiles['foto_'+i] || !_editFiles['ktp_'+i])) {
      showToast('Peringatan', `Anggota ${i+1} adalah peserta baru — foto & KTP/Akte wajib diunggah.`, 'warning');
      document.getElementById('uzwrap_foto_'+i)?.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }
  }
  showLoading(true,'Mengirim perbaikan...');
  const btn = document.getElementById('submitPerbBtn');
  if (btn) btn.disabled = true;

  try {
    const srcAnggota = _record?.anggota || [{ nik: _record?.nik }];
    const members = Array.from({ length: memberCount }, (_, i) => {
      const serts = [_editFiles['sert_'+i+'_1']].filter(Boolean);
      return {
        nama_lengkap  : (document.getElementById('em_nama_'+i)?.value||'').trim(),
        // FIX: NIK sekarang dibaca dari FORM (boleh diubah oleh peserta
        // individu, atau diisi baru lewat gantiPeserta() utk anggota tim) —
        // fallback ke data asli hanya kalau input-nya entah kenapa tidak
        // ada di DOM. Dulu selalu dipaksa memakai srcAnggota[i]?.nik saja.
        nik           : (document.getElementById('em_nik_'+i)?.value || srcAnggota[i]?.nik || '').trim(),
        tempat_lahir  : (document.getElementById('em_tl_'+i)?.value||'').trim(),
        tanggal_lahir : (document.getElementById('em_dob_'+i)?.value||'').trim(),
        alamat        : (document.getElementById('em_alamat_'+i)?.value||'').trim(),
        no_hp         : (document.getElementById('em_hp_'+i)?.value||'').trim(),
        foto          : _editFiles['foto_'+i] || null,
        ktp           : _editFiles['ktp_'+i]  || null,
        sertifikat    : serts.length ? serts : null,
      };
    });

    // FIX: pakai postJSON (fetch POST asli ke doPost), BUKAN jsonpPost.
    // payload ini bisa membawa foto/KTP base64 yang jauh melebihi batas
    // panjang URL kalau dikirim lewat jsonpPost (lihat catatan di header file).
    const data = await postJSON({
      action            : 'perbaikan',
      nomor_pendaftaran : nomor,
      members,
      rekom             : _editFiles['rekom'] || null,
    });

    if (data.success) {
      showToast('Berhasil','Perbaikan berhasil dikirim. Silakan tunggu verifikasi ulang.','success',6000);
      document.getElementById('editArea').innerHTML = '';
      // FIX: refresh langsung tanpa validasi captcha ulang — lihat catatan
      // di fetchAndRenderStatus(). Sebelumnya manggil cekStatus() di sini
      // membuat toast "Kode keamanan salah" muncul dan status yang tampil
      // tetap Ditolak (status lama), padahal sudah reset ke Menunggu di server.
      if (_record?.nik) await fetchAndRenderStatus(_record.nik);
    } else {
      showToast('Gagal', data.message || 'Terjadi kesalahan', 'error', 5000);
    }
  } catch (err) {
    // FIX #21: sama seperti submitForm() di daftar.js — kalau errornya
    // AMBIGU (timeout/koneksi putus, bukan penolakan jelas dari server),
    // kita tidak tahu apakah perbaikan ini sebenarnya sudah tersimpan.
    // apiPerbaikan_ mensyaratkan status SAAT INI = 'Ditolak' dan resetnya
    // ke status lain setelah berhasil (lihat api.gs) — jadi status yang
    // sudah TIDAK LAGI 'Ditolak' adalah sinyal kuat kalau perbaikan ini
    // sebenarnya sukses, meski responsnya gagal sampai ke browser.
    const isAmbiguous = err?.name === 'AbortError' ||
      /gagal menghubungi server|tidak merespons/i.test(err?.message || '');
    let reconciled = false;
    if (isAmbiguous && _record?.nik) {
      try {
        const recon = await jsonpGet({ action: 'checkNIK', nik: _record.nik }, 15000);
        if (recon?.found && recon.record && String(recon.record.status_verifikasi||'').trim() !== 'Ditolak') {
          reconciled = true;
          showToast('Sudah Tersimpan', 'Koneksi sempat bermasalah, tapi perbaikan Anda ternyata sudah berhasil tersimpan.', 'success', 8000);
          document.getElementById('editArea').innerHTML = '';
          await fetchAndRenderStatus(_record.nik);
        }
      } catch (reconErr) {
        log.error('[MTQ] submitPerbaikan reconciliation gagal', reconErr);
      }
    }
    if (!reconciled) {
      showToast('Error', 'Gagal menghubungi server: ' + err.message, 'error');
    }
  } finally {
    showLoading(false);
    if (btn) btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════
//  TRANSPORT — JSONP only (no fetch, no CORS)
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  TRANSPORT — Pure JSONP (satu-satunya cara yang benar untuk GAS)
//
//  Kenapa bukan fetch():
//  GAS /exec redirect script.google.com → script.googleusercontent.com.
//  fetch() kena CORS block di redirect tersebut.
//
//  Kenapa JSONP dengan ?callback= berhasil:
//  Saat GAS menerima ?callback=xxx, ia TIDAK melakukan redirect —
//  langsung return: xxx({...}) dengan MimeType.JAVASCRIPT dari
//  script.google.com itu sendiri. <script> tag tidak perlu CORS.
// ════════════════════════════════════════════════════════════

/**
 * GET request ke GAS via JSONP — selalu sertakan ?callback=
 */
function jsonpGet(params, timeout = 20000) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return Promise.reject(new Error('API_URL tidak terkonfigurasi — periksa js/config.js'));

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return _jsonp(`${apiUrl}?${qs}`, timeout);
}

/**
 * POST-via-GET tunnel — payload JSON di ?postData=, dengan ?callback=
 */
function jsonpPost(payload, timeout = 30000) {
  const apiUrl = getApiUrl();
  if (!apiUrl) return Promise.reject(new Error('API_URL tidak terkonfigurasi — periksa js/config.js'));

  const enc = encodeURIComponent(JSON.stringify(payload));
  return _jsonp(`${apiUrl}?postData=${enc}`, timeout);
}

/**
 * FIX: POST asli (fetch) ke doPost — dipakai KHUSUS untuk payload yang bisa
 * membawa file base64 (foto/KTP/sertifikat), karena jsonpPost/_jsonp di atas
 * menjejalkan payload ke query string URL — foto sekalipun sudah dikompres
 * bisa dengan mudah >100.000 karakter, jauh melebihi batas panjang URL yang
 * ditoleransi browser & infrastruktur Google, dan akan gagal secara diam-diam
 * atau dengan error yang membingungkan ("Unexpected end of input", dst).
 *
 * api.gs SUDAH punya doPost(e) yang benar untuk kasus ini (dipakai proses
 * pendaftaran awal — lihat komentar "doPost kept for registration only" di
 * api.gs) — jadi tidak perlu kirim query string sama sekali, cukup fetch()
 * POST biasa dengan body JSON. Content-Type text/plain (BUKAN application/json)
 * sengaja dipakai supaya browser menganggap ini "simple request" dan tidak
 * mengirim CORS preflight (OPTIONS) — Apps Script tidak menangani preflight.
 */
async function postJSON(payload, timeout = 30000) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error('API_URL tidak terkonfigurasi — periksa js/config.js');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(apiUrl, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // hindari CORS preflight
      body   : JSON.stringify(payload),
      signal : controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // FIX: detail troubleshooting (Deploy GAS, akses "Anyone", dst) SEBELUMNYA
    // langsung jadi err.message yang di-throw — dan di banyak tempat pemanggil
    // fungsi ini, err.message ditempel langsung ke showToast(...) yang tampil
    // ke user biasa. User biasa (atau admin yang cuma salah ketik password di
    // halaman lain yang pola errornya sama) tidak bisa & tidak perlu tahu soal
    // "Deploy GAS" — itu instruksi buat developer, bukan buat mereka. Sekarang:
    // detail lengkap hanya masuk console (buat developer buka devtools), yang
    // di-throw ke pemanggil cuma pesan pendek yang wajar dibaca siapa saja.
    if (err.name === 'AbortError') {
      log.error('[MTQ] postJSON timeout ke', apiUrl, '— server lambat merespons');
      throw new Error('Server tidak merespons — coba lagi sesaat lagi.');
    }
    log.error('[MTQ] postJSON gagal ke', apiUrl, '—', err.message,
      '| Cek: (1) deploy GAS versi terbaru, (2) akses deployment "Anyone", (3) halaman dibuka via http/https bukan file://.');
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.');
  }
  clearTimeout(timer);

  if (!res.ok) throw new Error('Server merespons dengan status ' + res.status);
  return res.json();
}

/**
 * Core JSONP — tambahkan &callback=xxx ke URL, inject <script>, tunggu callback
 * GAS tidak redirect ketika ada parameter callback=
 */
function _jsonp(baseUrl, timeout) {
  return new Promise((resolve, reject) => {
    const cbName = 'mtq_' + Date.now() + '_' + Math.floor(Math.random() * 999999);
    const sep    = baseUrl.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    let   timer, gaveUp = false;

    // Respons ASLI — tetap diproses walau baru datang setelah timeout
    // sudah reject() duluan (lihat FIX #15 di header file). resolve() yang
    // telat begini otomatis jadi no-op aman kalau promise-nya sudah settle
    // (perilaku bawaan Promise) — tidak lagi meledak ReferenceError.
    window[cbName] = function(data) {
      clearTimeout(timer);
      script.remove();
      resolve(data);
    };

    script.src = `${baseUrl}${sep}callback=${cbName}`;

    script.onerror = function() {
      if (gaveUp) return;
      gaveUp = true;
      clearTimeout(timer);
      script.remove();
      // FIX: sama seperti postJSON() di atas — detail troubleshooting hanya
      // ke console, pesan yang di-reject() (sering langsung tampil ke user
      // via showToast(...+err.message)) sekarang pendek & tidak teknis.
      log.error('[MTQ] JSONP gagal untuk', baseUrl,
        '| Cek: (1) deploy GAS versi terbaru, (2) akses deployment "Anyone", (3) URL di config.js benar.');
      reject(new Error('Tidak bisa terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.'));
    };

    timer = setTimeout(function() {
      if (gaveUp) return;
      gaveUp = true;
      log.error('[MTQ] JSONP timeout untuk', baseUrl);
      reject(new Error('Server tidak merespons — coba lagi sesaat lagi.'));
      // FIX #15: window[cbName] SENGAJA tidak dihapus di sini — lihat
      // catatan di atas fungsi ini / di header file.
    }, timeout);

    document.head.appendChild(script);
  });
}

// ── Utils ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function showLoading(show, msg = 'Memuat...') {
  document.getElementById('loadingOverlay')?.classList.toggle('show', show);
  const el = document.getElementById('loadingMsg'); if (el) el.textContent = msg;
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// FIX #1: format tanggal ISO (YYYY-MM-DD) → "1 November 2026" untuk label syarat usia
function fmtTglID(iso) {
  try {
    return new Date(String(iso)+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  } catch(e) { return String(iso); }
}
function showToast(title, msg, type='info', dur=4000) {
  const icons = { success:'✅',error:'❌',warning:'⚠️',info:'ℹ️' };
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, dur);
}