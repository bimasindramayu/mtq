// ============================================================
//  MTQ 2026 — js/cek-maqra.js
//  Halaman gabungan: Cek Status + Perbaikan Data + Ambil Maqra
//
//  Fixes:
//  ✅ Tidak ada fetch() — semua pakai JSONP (GET & POST tunnel)
//  ✅ NIK disabled di form edit, tidak dikirim ke server
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
  previewer = new DocumentPreviewer({ ...baseCfg, googleDriveApiKey: '' });
  previewer.bindTriggers('.dp-trigger');
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
      scrollToResult();
      return;
    }
    _record = data.record;
    // FIX #2 — teruskan kunci Drive API (dibatasi HTTP referrer + Drive API only, lihat config.gs)
    if (previewer) previewer.config.googleDriveApiKey = data.driveApiKey || '';
    renderStatusCard(_record);
    scrollToResult();   // FIX #3 — langsung bawa user ke hasil, tidak perlu scroll manual

    const status = (_record.status_verifikasi || '').trim();
    if (status === 'Terverifikasi') {
      // Langsung load maqra — NIK sudah ada dari _record
      await loadMaqra(_record);
    }
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
  _maqraList   = [];
  _maqraResult = null;
  _spinning    = false;
}

// ── FIX #3: auto-scroll ke hasil — sebelumnya user harus scroll manual ──
function scrollToResult() {
  setTimeout(() => {
    document.getElementById('statusArea')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 100);
}

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
    bannerHtml = banner('info-green','✅','Terverifikasi','Pendaftaran Anda sudah diverifikasi. Gulir ke bawah untuk mengambil maqra.');
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

  // Action buttons
  let actionHtml = '';
  if (status === 'Ditolak') {
    actionHtml = `<button class="btn btn-red" onclick="showEditForm()">✏️ Perbaiki Data</button>`;
  }
  if (status === 'Terverifikasi') {
    actionHtml += `<button class="btn btn-emerald" onclick="downloadKartuPeserta()" style="background:linear-gradient(135deg,#065f46,#059669);box-shadow:0 2px 8px rgba(5,150,105,.35)">
      🪪 Unduh Kartu Peserta
    </button>`;
  }
  actionHtml += `<a href="index.html" class="btn btn-outline">🏠 Beranda</a>`;

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
//  STEP 2 — Load & Render Maqra Section
// ════════════════════════════════════════════════════════════
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
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:8px;flex-wrap:wrap">
        <button class="btn btn-emerald btn-sm" onclick="downloadKartuPeserta()" style="background:linear-gradient(135deg,#065f46,#059669);gap:6px">🪪 Kartu Peserta PDF</button>
        <button class="btn btn-outline btn-sm" onclick="downloadBukti()">⬇️ Unduh Bukti Maqra</button>
        <a href="index.html" class="btn btn-outline btn-sm">🏠 Beranda</a>
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
            <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">
              <button class="btn btn-emerald btn-sm" onclick="downloadKartuPeserta()" style="background:linear-gradient(135deg,#065f46,#059669)">🪪 Kartu Peserta PDF</button>
              <button class="btn btn-outline btn-sm" onclick="downloadBukti()">⬇️ Unduh Bukti</button>
              <a href="index.html" class="btn btn-outline btn-sm">🏠 Beranda</a>
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
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Bukti Maqra MTQ 2026</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Georgia',serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);width:100%;max-width:480px;overflow:hidden}.header{background:linear-gradient(135deg,#064e3b,#059669);padding:28px 32px;color:#fff;text-align:center}.header h1{font-size:22px;margin-bottom:4px}.header p{font-size:13px;opacity:.8}.body{padding:28px 32px}.ornament{text-align:center;color:#9ca3af;margin:12px 0;letter-spacing:4px}.field{margin-bottom:14px}.field label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;display:block;margin-bottom:3px}.field .val{font-size:15px;font-weight:600;color:#1f2937}.mbox{background:linear-gradient(135deg,#065f46,#047857);color:#fff;border-radius:12px;padding:24px;text-align:center;margin:20px 0}.mbox .ml{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.75;margin-bottom:8px}.mbox .ma{font-size:22px;font-weight:700;margin-bottom:4px}.mbox .ms{font-size:14px;opacity:.85}.mbox .mn{background:rgba(255,255,255,.15);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:600;display:inline-block;margin-top:10px}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#b45309;margin-top:16px}.footer{border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center}@media print{body{background:#fff}.card{box-shadow:none}}</style></head>
<body><div class="card">
<div class="header"><h1>📖 Bukti Maqra MTQ 2026</h1><p>Kabupaten Indramayu — ${new Date().toLocaleString('id-ID')}</p></div>
<div class="body"><div class="ornament">✦ ✦ ✦</div>
<div class="field"><label>Nama Peserta</label><div class="val">${esc(rec.nama_lengkap||'-')}</div></div>
<div class="field"><label>Nomor Pendaftaran</label><div class="val" style="font-family:monospace;letter-spacing:1px">${esc(rec.nomor_pendaftaran||'-')}</div></div>
<div class="field"><label>Cabang Lomba</label><div class="val">${esc(rec.cabang_lomba||'-')}</div></div>
<div class="field"><label>Kecamatan</label><div class="val">${esc(rec.kecamatan||'-')}</div></div>
<div class="mbox"><div class="ml">📖 Maqra</div><div class="ma">${esc(m.maqra_teks||m.maqra||'-')}</div><div class="ms">${esc(m.maqra_detail||m.surah||'')}</div><div class="mn">Nomor Undian: ${esc(m.nomor_maqra||'-')}</div></div>
<div class="warn">⚠️ Simpan dokumen ini. Maqra tidak dapat diubah. Tunjukkan kepada panitia MTQ 2026.</div></div>
<div class="footer">MTQ Kabupaten Indramayu 2026 — Dokumen sah tanpa tanda tangan</div>
</div><script>window.print();<\/script></body></html>`;
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
      const canvas = await renderKartuCanvas(member, rec, i, isTeam, CW, CH);
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

/** Render satu kartu cocard ke canvas dan kembalikan canvas-nya */
async function renderKartuCanvas(member, rec, memberIdx, isTeam, CW, CH) {
  const canvas = document.createElement('canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');

  const nama   = (member.nama_lengkap || rec.nama_lengkap || '—').toUpperCase();
  const cabang = rec.cabang_lomba || '—';
  const kec    = rec.kecamatan    || '—';
  const noReg  = member.no_peserta || rec.nomor_pendaftaran || '—';
  const GOLD   = '#f59e0b';

  // px(mm) → canvas pixel
  const px = mm => mm * (CW / 85.6);

  // ─────────────────────────────────────────────────────────
  // 1. BACKGROUND
  // ─────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CH);
  bgGrad.addColorStop(0,   '#021b12');
  bgGrad.addColorStop(0.4, '#064e3b');
  bgGrad.addColorStop(1,   '#0a6647');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CW, CH);

  // ─────────────────────────────────────────────────────────
  // 2. POLA GEOMETRIK (arabesque grid)
  // ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.055;
  const pts = px(18);
  for (let ry = -pts; ry < CH + pts; ry += pts) {
    for (let cx2 = -pts; cx2 < CW + pts; cx2 += pts) {
      // Segi delapan tipis
      ctx.beginPath();
      const r = px(5.5);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 - Math.PI / 8;
        const mx  = cx2 + Math.cos(ang) * r;
        const my  = ry  + Math.sin(ang) * r;
        a === 0 ? ctx.moveTo(mx, my) : ctx.lineTo(mx, my);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 0.7;
      ctx.stroke();
    }
  }
  ctx.restore();

  // ─────────────────────────────────────────────────────────
  // 3. GARIS SISI EMAS (kiri & kanan)
  // ─────────────────────────────────────────────────────────
  const stripeW = px(3);
  // Left stripe
  const lgL = ctx.createLinearGradient(0, 0, 0, CH);
  lgL.addColorStop(0,   '#fbbf24');
  lgL.addColorStop(0.5, '#fde68a');
  lgL.addColorStop(1,   '#d97706');
  ctx.fillStyle = lgL;
  ctx.fillRect(0, 0, stripeW, CH);
  // Right stripe
  ctx.fillRect(CW - stripeW, 0, stripeW, CH);
  // Inner glow lines
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(stripeW, 0, px(0.7), CH);
  ctx.fillRect(CW - stripeW - px(0.7), 0, px(0.7), CH);

  // ─────────────────────────────────────────────────────────
  // 4. HEADER BAND
  // ─────────────────────────────────────────────────────────
  const hdrH = px(23);
  const hGrad = ctx.createLinearGradient(0, 0, CW, 0);
  hGrad.addColorStop(0, '#047857');
  hGrad.addColorStop(0.5, '#059669');
  hGrad.addColorStop(1, '#047857');
  ctx.fillStyle = hGrad;
  ctx.fillRect(stripeW, 0, CW - stripeW * 2, hdrH);

  // Gold separator bawah header
  ctx.fillStyle = GOLD;
  ctx.fillRect(stripeW, hdrH, CW - stripeW * 2, px(1));

  // Teks header
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';

  // "MTQ" besar
  ctx.font      = `900 ${px(9)}px Georgia,serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor   = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur    = px(2);
  ctx.shadowOffsetY = px(0.8);
  ctx.fillText('MTQ 2026', CW / 2, px(10.5));

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.font      = `600 ${px(3.6)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText('MUSABAQAH TILAWATIL QUR\'AN', CW / 2, px(16));

  ctx.font      = `${px(3)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('KABUPATEN INDRAMAYU', CW / 2, px(20.5));

  // ─────────────────────────────────────────────────────────
  // 5. CHIP PERAN (PESERTA / KETUA TIM / ANGGOTA TIM N)
  // ─────────────────────────────────────────────────────────
  const chipTxt = isTeam
    ? (memberIdx === 0 ? '👑  KETUA TIM' : `ANGGOTA TIM ${memberIdx + 1}`)
    : '✦  PESERTA';
  const chipY = hdrH + px(4.5);
  const chipH = px(5.8);
  const chipW = px(30);
  const chipX = (CW - chipW) / 2;
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur  = px(1.5);
  ctx.shadowOffsetY = px(0.5);
  roundRect(ctx, chipX, chipY, chipW, chipH, px(2.8));
  ctx.fillStyle = isTeam && memberIdx === 0 ? '#d97706' : GOLD;
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.font      = `bold ${px(3)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = '#1a0600';
  ctx.textAlign = 'center';
  ctx.fillText(chipTxt, CW / 2, chipY + chipH * 0.68);

  // ─────────────────────────────────────────────────────────
  // 6. FOTO PESERTA (lingkaran dengan ring emas)
  // ─────────────────────────────────────────────────────────
  const photoR  = px(15.5);
  const photoCX = CW / 2;
  const photoCY = hdrH + px(13.5) + photoR;

  // Ring emas (gradient)
  const ringGrad = ctx.createRadialGradient(photoCX, photoCY, photoR + px(0.5), photoCX, photoCY, photoR + px(3));
  ringGrad.addColorStop(0, '#fde68a');
  ringGrad.addColorStop(0.5, '#f59e0b');
  ringGrad.addColorStop(1, '#b45309');
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + px(2.8), 0, Math.PI * 2);
  ctx.fillStyle = ringGrad;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur  = px(3);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Ring putih tipis
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + px(0.6), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Foto (clip lingkaran)
  ctx.save();
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
  ctx.clip();

  const fotoSrc  = member.foto_url || member.foto_drive_url || member.link_foto || rec.foto_url || '';
  // FIX: sebelumnya coba muat langsung dari drive.google.com/thumbnail
  // & lh3.googleusercontent.com dengan img.crossOrigin='anonymous' —
  // KEDUANYA tidak mengirim header CORS sama sekali, jadi permintaan
  // gambar itu SELALU diblokir browser (bukan cuma "kadang gagal") dan
  // kartu selalu jatuh ke placeholder inisial. Sekarang ambil lewat
  // proxy backend (base64 via getDriveImage, lihat api.gs) — tidak ada
  // isu cross-origin sama sekali karena hasilnya data: URL.
  const img = await loadDriveImageViaProxy(fotoSrc);
  let fotoOk = false;

  if (img) {
    // Object-fit: cover — center crop
    const ar = img.naturalWidth / img.naturalHeight;
    let sw, sh, sx, sy;
    if (ar > 1) { sh = img.naturalHeight; sw = sh; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else         { sw = img.naturalWidth;  sh = sw; sy = (img.naturalHeight - sh) / 2; sx = 0; }
    ctx.drawImage(img, sx, sy, sw, sh,
      photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
    fotoOk = true;
  }

  if (!fotoOk) {
    // Placeholder inisial
    const phG = ctx.createLinearGradient(photoCX - photoR, photoCY - photoR, photoCX + photoR, photoCY + photoR);
    phG.addColorStop(0, '#1d6348'); phG.addColorStop(1, '#0a2e1e');
    ctx.fillStyle = phG;
    ctx.fillRect(photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
    ctx.font      = `bold ${px(18)}px Georgia,serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((nama[0] || '?'), photoCX, photoCY);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // ─────────────────────────────────────────────────────────
  // 7. KARTU INFO PUTIH (nama + data)
  // ─────────────────────────────────────────────────────────
  const cardTop    = photoCY + photoR + px(4.5);
  const cardMargin = stripeW + px(3);
  const cardW      = CW - cardMargin * 2;
  const footH      = px(15);
  const cardH      = CH - cardTop - footH - px(2);

  // Shadow kartu
  ctx.shadowColor   = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur    = px(4);
  ctx.shadowOffsetY = px(1.5);
  roundRect(ctx, cardMargin, cardTop, cardW, cardH, px(4));
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Gold top border kartu
  roundRect(ctx, cardMargin, cardTop, cardW, px(1.5), px(4));
  ctx.fillStyle = GOLD;
  ctx.fill();

  // ── Nama ──────────────────────────────────────────────────
  const namaMaxW = cardW - px(8);
  const namaLines = wrapText(ctx, nama, namaMaxW, `bold ${px(5.4)}px Georgia,serif`);
  ctx.font      = `bold ${px(5.4)}px Georgia,serif`;
  ctx.fillStyle = '#065f46';
  ctx.textAlign = 'center';
  const namaStartY = cardTop + px(7.5);
  namaLines.forEach((line, i) => {
    ctx.fillText(line, CW / 2, namaStartY + i * px(6.6));
  });

  // Garis emas ornamental
  const divY = namaStartY + namaLines.length * px(6.6) + px(1.5);
  const divLen = px(20);
  const divMid = CW / 2;
  ctx.fillStyle = GOLD;
  ctx.fillRect(divMid - divLen, divY, divLen * 2, px(0.7));
  // Diamond tengah
  ctx.save();
  ctx.translate(divMid, divY + px(0.35));
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-px(1.1), -px(1.1), px(2.2), px(2.2));
  ctx.restore();

  // ── Rows info ──────────────────────────────────────────────
  const rowStart = divY + px(5);
  const ROW_H    = px(10);

  drawKartuRow(ctx, px, cardMargin, cardW, rowStart,        GOLD,      '🏆', 'CABANG LOMBA', cabang);
  drawKartuRow(ctx, px, cardMargin, cardW, rowStart + ROW_H, '#059669', '📍', 'KECAMATAN',  kec);

  // ─────────────────────────────────────────────────────────
  // 8. FOOTER BAND
  // ─────────────────────────────────────────────────────────
  const footY = CH - footH;
  const fGrad = ctx.createLinearGradient(0, footY, 0, CH);
  fGrad.addColorStop(0, '#047857');
  fGrad.addColorStop(1, '#021b12');
  ctx.fillStyle = fGrad;
  ctx.fillRect(stripeW, footY, CW - stripeW * 2, footH);

  // Gold line atas footer
  ctx.fillStyle = GOLD;
  ctx.fillRect(stripeW, footY, CW - stripeW * 2, px(0.8));

  // Nomor peserta (monospace, bold)
  ctx.font      = `bold ${px(4.2)}px 'Courier New',monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(noReg, CW / 2, footY + px(7));

  // Teks panitia
  ctx.font      = `${px(2.8)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Panitia MTQ Kabupaten Indramayu 2026', CW / 2, footY + px(12.5));

  // Dots dekoratif
  [-px(16), 0, px(16)].forEach(dx => {
    ctx.beginPath();
    ctx.arc(CW / 2 + dx, footY + px(0.4) + px(0.8), px(0.7), 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
  });

  return canvas;
}

/** Gambar satu baris info (label + value) di dalam kartu putih — anti-overflow */
function drawKartuRow(ctx, px, cardMargin, cardW, y, accentColor, _icon, label, value) {
  const rowH   = px(9);
  const padL   = px(4);
  const x      = cardMargin;
  const boxX   = x + px(2);
  const boxW   = cardW - px(4);

  // Subtle row bg
  roundRect(ctx, boxX, y, boxW, rowH, px(2));
  ctx.fillStyle = 'rgba(5,150,105,0.04)';
  ctx.fill();

  // Accent bar kiri
  ctx.fillStyle = accentColor;
  ctx.fillRect(boxX, y, px(1.5), rowH);

  // ── JARING PENGAMAN: clip semua teks ke kotak baris ini.
  //    Apapun yang terjadi pada pengukuran font, teks TIDAK BISA
  //    tergambar keluar dari kotak ini.
  ctx.save();
  roundRect(ctx, boxX, y, boxW, rowH, px(2));
  ctx.clip();

  const textX    = x + padL + px(1.5);
  const maxTextW = (boxX + boxW) - textX - px(2.5); // margin aman ke tepi kanan

  // Label
  ctx.textAlign = 'left';
  ctx.font      = `500 ${px(2.6)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(truncateText(ctx, label, maxTextW), textX, y + px(3.2));

  // Value — coba kecilkan ukuran font dulu agar teks panjang (mis. nama
  // cabang lomba) tetap terbaca utuh; hanya dipotong jika benar-benar
  // tidak muat bahkan di ukuran font terkecil.
  const fitted = fitTextSize(ctx, String(value), maxTextW, 3.8, 2.5, 'bold', "'Segoe UI',sans-serif", px);
  ctx.fillStyle = '#1f2937';
  ctx.fillText(fitted.text, textX, y + px(7.2));

  ctx.restore();
}

/** Cari ukuran font (mm-equivalent, via px()) terbesar yang masih muat di maxWidth;
 *  jika tetap tidak muat di ukuran minimum, potong dengan ellipsis. */
function fitTextSize(ctx, text, maxWidth, maxPx, minPx, weight, family, pxFn) {
  let size = maxPx;
  ctx.font = `${weight} ${pxFn(size)}px ${family}`;
  while (size > minPx && ctx.measureText(text).width > maxWidth) {
    size = Math.max(minPx, size - 0.2);
    ctx.font = `${weight} ${pxFn(size)}px ${family}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size };
  return { text: truncateText(ctx, text, maxWidth), size };
}

/** Konversi berbagai format URL Google Drive → daftar kandidat URL thumbnail (dicoba berurutan) */
// FIX: pengganti gDriveThumbUrls (lama) — sudah tidak dipakai lagi untuk
// kartu peserta karena kedua kandidat URL-nya (drive.google.com/thumbnail
// & lh3.googleusercontent.com) sama-sama tidak mengirim header CORS,
// jadi img.crossOrigin='anonymous' ke situ SELALU gagal, bukan cuma
// kadang-kadang. Fungsi ini mengambil ID file lalu minta byte gambarnya
// lewat action=getDriveImage di backend (server-ke-server, tidak kena
// CORS sama sekali), dan memuatnya sebagai data: URL — yang mana
// browser TIDAK PERNAH menganggapnya cross-origin, jadi aman dibaca
// canvas (drawImage/toDataURL) tanpa syarat apa pun.
async function loadDriveImageViaProxy(url) {
  if (!url) return null;
  let id = null;
  let m = String(url).match(/[?&]id=([^&]+)/);
  if (m) id = m[1];
  if (!id) { m = String(url).match(/\/file\/d\/([^\/\?&]+)/); if (m) id = m[1]; }
  if (!id) return null;

  try {
    const data = await jsonpGet({ action: 'getDriveImage', id }, 20000);
    if (!data || !data.success || !data.dataUrl) return null;
    return await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = data.dataUrl;
    });
  } catch (err) {
    return null;
  }
}

/** Helper: roundRect polyfill (cek native dulu) */
function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);      ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

/** Helper: bungkus teks panjang ke array baris */
function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

/** Helper: potong teks agar muat maxWidth */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(String(text)).width <= maxWidth) return text;
  let t = String(text);
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

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
  // Simpan ageRule dari _record untuk dipakai saat validasi DOB
  // Field ini dikirim dari server bersama data peserta (umur_min, umur_max_*)
  const _ageRule = {
    min   : rec.umur_min         ?? 0,
    maxThn: rec.umur_max_tahun   ?? 99,
    maxBln: rec.umur_max_bulan   ?? 11,
    maxHri: rec.umur_max_hari    ?? 30,
    cutoff: (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG.AGE_CUTOFF_DATE : null)
            || rec.age_cutoff || new Date().toISOString().slice(0,10),
  };
  // FIX #1: syarat usia sekarang ditampilkan eksplisit di form (bukan cuma
  // divalidasi diam-diam sesudah user salah isi tanggal lahir).
  const _ageRuleLabel = _ageRule.maxThn < 99
    ? `maks. ${_ageRule.maxThn} thn ${_ageRule.maxBln} bln ${_ageRule.maxHri} hr (per ${fmtTglID(_ageRule.cutoff)})${_ageRule.min>0?`, min. ${_ageRule.min} thn`:''}`
    : (_ageRule.min > 0 ? `min. ${_ageRule.min} tahun` : 'tidak ada batas usia khusus untuk cabang ini');

  let membersHtml = anggota.map((m, idx) => {
    const isKetua = idx === 0;
    const lbl = isTeam ? (isKetua ? '👑 Ketua Tim' : `👤 Anggota ${idx+1}`) : '👤 Data Peserta';
    return `
      <div class="edit-section">
        <div class="edit-section-title">${lbl}</div>
        <div class="two-col">
          <div class="field-group">
            <label class="field-label">Nama Lengkap <span class="req">*</span></label>
            <input class="field-input" id="em_nama_${idx}" value="${esc(m.nama_lengkap||'')}">
          </div>
          <div class="field-group">
            <label class="field-label">NIK</label>
            <div style="position:relative">
              <input class="field-input" value="${esc(m.nik||'')}" disabled
                     style="padding-right:34px;font-family:monospace">
              <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:13px" title="NIK tidak bisa diubah">🔒</span>
            </div>
            <div style="font-size:11px;color:var(--g400);margin-top:3px">NIK tidak dapat diubah</div>
          </div>
          <div class="field-group">
            <label class="field-label">Tempat Lahir</label>
            <input class="field-input" id="em_tl_${idx}" value="${esc(m.tempat_lahir||'')}">
          </div>
          <div class="field-group">
            <label class="field-label">Tanggal Lahir</label>
            <input class="field-input" type="date" id="em_dob_${idx}"
                   value="${esc(m.tanggal_lahir||'')}"
                   onchange="validateDOB(this, ${JSON.stringify(_ageRule)}, '${esc(idx.toString())}')">
            <div class="age-rule-hint">📏 Syarat cabang: ${esc(_ageRuleLabel)}</div>
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
  }).join('');

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
        ${membersHtml}
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
            onclick="submitPerbaikan('${esc(rec.nomor_pendaftaran||'')}', ${anggota.length})">
            ✨ Kirim Perbaikan
          </button>
          <button class="btn btn-outline" onclick="document.getElementById('editArea').innerHTML=''">✕ Batal</button>
        </div>
      </div>
    </div>`;

  // Bind upload zones
  for (let i = 0; i < anggota.length; i++) {
    bindUZ('foto_'+i); bindUZ('ktp_'+i);
    bindUZ('sert_'+i+'_1');
  }
  bindUZ('rekom');
  setTimeout(() => document.getElementById('editArea').scrollIntoView({ behavior:'smooth', block:'start' }), 100);
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
        ${hasExisting ? `<button type="button" class="uz-zoom-btn dp-trigger" data-file-url="${esc(existingUrl)}" data-doc-name="${esc(label)}" onclick="event.stopPropagation()" title="Lihat ukuran penuh">🔍</button>` : ``}
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

async function submitPerbaikan(nomor, memberCount) {
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
    cutoff: (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG.AGE_CUTOFF_DATE : null)
            || _record?.age_cutoff || new Date().toISOString().slice(0,10),
  };
  if (!allDOBValid(memberCount, _ageRule)) {
    showToast('Data Tidak Valid', 'Tanggal lahir tidak memenuhi syarat usia cabang lomba ini', 'error');
    const firstErr = document.querySelector('[id^="age_msg_"]');
    if (firstErr) firstErr.scrollIntoView({ behavior:'smooth', block:'center' });
    return;
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
        nik           : (srcAnggota[i]?.nik||'').trim(),  // ← NIK dari data asli, bukan form
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
    showToast('Error', 'Gagal menghubungi server: ' + err.message, 'error');
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
    if (err.name === 'AbortError') {
      throw new Error('Request timeout (' + Math.round(timeout / 1000) + 's) — server lambat merespons');
    }
    throw new Error(
      'Gagal menghubungi server. Pastikan:\n' +
      '1. Deploy GAS sudah diperbarui (Re-deploy → New version)\n' +
      '2. Akses: "Anyone" (bukan hanya yang punya akun Google)\n' +
      '3. Halaman ini dibuka lewat http/https (mis. server lokal atau GitHub Pages) —\n' +
      '   BUKAN dibuka langsung dari file (file://), karena browser membatasi\n' +
      '   permintaan lintas-origin dari file:// secara berbeda.\n' +
      'Detail teknis: ' + err.message
    );
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
    let   timer;

    window[cbName] = function(data) {
      clearTimeout(timer);
      try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
      script.remove();
      resolve(data);
    };

    script.src = `${baseUrl}${sep}callback=${cbName}`;

    script.onerror = function() {
      clearTimeout(timer);
      try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
      script.remove();
      reject(new Error(
        'Gagal menghubungi server. Pastikan:\n' +
        '1. Deploy GAS sudah diperbarui (Re-deploy)\n' +
        '2. Akses: "Anyone" (bukan hanya yang punya akun Google)\n' +
        '3. URL di config.js sudah benar'
      ));
    };

    timer = setTimeout(function() {
      try { delete window[cbName]; } catch(_) { window[cbName] = undefined; }
      script.remove();
      reject(new Error('Request timeout (' + Math.round(timeout/1000) + 's) — server lambat merespons'));
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