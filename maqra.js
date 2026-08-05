// ============================================================
//  MTQ 2026 — js/maqra.js
//  Pengambilan Maqra (Peserta)
// ============================================================

// API_URL: satu sumber dari js/config.js (window.MTQ_API_URL) — jangan ubah di sini
const API_URL = window.MTQ_API_URL || '';

let _pes       = null;   // verified peserta record
let _maqraList = [];     // available maqra for the cabang
let _spinning  = false;
let _maqraResult = null;

// ── DOM Ready ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  buildStars();

  document.getElementById('nikInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyNIK();
  });
  document.getElementById('nikInput').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });
});

// ── Dark Mode ─────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('mtq-theme') || 'light';
  applyTheme(saved);
  document.getElementById('darkToggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nxt);
    localStorage.setItem('mtq-theme', nxt);
  });
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const ic = document.getElementById('darkToggle');
  if (ic) ic.textContent = t === 'dark' ? '☀️' : '🌙';
}

// ── Build twinkling stars in lantern ──────────────────────────
function buildStars() {
  const sf = document.getElementById('starField');
  if (!sf) return;
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random()*100}%;top:${Math.random()*100}%;
      --s-dur:${(Math.random()*2+1.5).toFixed(1)}s;
      --s-delay:${(Math.random()*3).toFixed(1)}s;`;
    sf.appendChild(s);
  }
}

// ── Verify NIK ────────────────────────────────────────────────
async function verifyNIK() {
  const nik = document.getElementById('nikInput').value.trim();
  if (!nik || nik.length < 16) {
    showToast('Peringatan', 'Masukkan NIK 16 digit yang valid', 'warning');
    return;
  }
  showLoading(true, 'Memverifikasi peserta...');
  document.getElementById('verifyBtn').disabled = true;

  try {
    const data = await jsonpCall(`${API_URL}?action=checkNIK&nik=${encodeURIComponent(nik)}`);

    if (!data.success || !data.found) {
      showToast('Tidak Ditemukan', 'NIK tidak terdaftar di MTQ 2026. Pastikan NIK benar.', 'error', 5000);
      return;
    }

    const rec = data.record;
    const status = (rec.status_verifikasi || '').trim();

    // Only Terverifikasi can pick maqra
    if (status !== 'Terverifikasi') {
      showSection('maqraSection');
      renderProfileBox(rec, status);
      renderNotVerifiedBanner(status, rec.catatan);
      return;
    }

    _pes = rec;

    // Now fetch maqra status + available list
    const maqraData = await jsonpCall(
      `${API_URL}?action=getMaqraStatus&nomor=${encodeURIComponent(rec.nomor_pendaftaran)}&cabang=${encodeURIComponent(rec.cabang_lomba)}`
    );

    showSection('maqraSection');
    renderProfileBox(rec, status);
    renderMaqraSection(maqraData, rec);

  } catch (err) {
    showToast('Error', 'Gagal menghubungi server: ' + err.message, 'error');
    log.error(err);
  } finally {
    showLoading(false);
    document.getElementById('verifyBtn').disabled = false;
  }
}

// ── Render profile box ────────────────────────────────────────
function renderProfileBox(rec, status) {
  const statusMap = {
    'Terverifikasi' : { label:'✅ Terverifikasi', cls:'', bg:'var(--em)' },
    'Menunggu'      : { label:'⏳ Menunggu', cls:'', bg:'#d97706' },
    'Ditolak'       : { label:'❌ Ditolak', cls:'', bg:'var(--red)' },
  };
  const sm = statusMap[status] || { label:status, cls:'', bg:'var(--g400)' };
  const initial = (rec.nama_lengkap||'?')[0].toUpperCase();
  const tipe = (rec.tipe_lomba||'individu').toLowerCase();

  document.getElementById('profileBox').innerHTML = `
    <div class="profile-box">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-info">
        <div class="name">${esc(rec.nama_lengkap||'-')}</div>
        <div class="detail">NIK: ${esc(rec.nik||'-')}</div>
        <div class="detail">Kecamatan: ${esc(rec.kecamatan||'-')}</div>
        <div class="detail">Cabang: ${esc(rec.cabang_lomba||'-')}</div>
      </div>
      <div class="profile-badge" style="background:${sm.bg}">${sm.label}</div>
    </div>`;
}

// ── Render: not verified ──────────────────────────────────────
function renderNotVerifiedBanner(status, catatan) {
  let msg = '';
  if (status === 'Menunggu') {
    msg = `<strong>Pendaftaran belum diverifikasi</strong>Mohon tunggu konfirmasi dari panitia sebelum dapat mengambil maqra.`;
  } else if (status === 'Ditolak') {
    msg = `<strong>Pendaftaran Anda ditolak</strong>Alasan: ${esc(catatan||'Tidak ada keterangan')} — Silakan perbaiki data di halaman <a href="cek.html" style="color:inherit;font-weight:700">Cek Status</a>.`;
  } else {
    msg = `<strong>Status: ${esc(status)}</strong>Pengambilan maqra tidak tersedia untuk status ini.`;
  }
  document.getElementById('infoBanner').innerHTML = `
    <div class="info-banner error">
      <div class="info-banner-icon">⚠️</div>
      <div>${msg}</div>
    </div>`;
}

// ── Render Maqra Section ──────────────────────────────────────
function renderMaqraSection(maqraData, rec) {
  const banner = document.getElementById('infoBanner');
  const already = document.getElementById('alreadyMaqra');
  const spinCard = document.getElementById('spinCard');

  // Check if maqra pengambilan is open
  if (!maqraData.isOpen) {
    const jadwal = maqraData.jadwalBuka
      ? `Pengambilan maqra dibuka pada: <strong>${maqraData.jadwalBuka}</strong>`
      : 'Jadwal belum ditentukan. Hubungi panitia untuk informasi lebih lanjut.';
    banner.innerHTML = `
      <div class="info-banner closed">
        <div class="info-banner-icon">🔒</div>
        <div><strong>Pengambilan Maqra Belum Dibuka</strong>${jadwal}</div>
      </div>`;
    return;
  }

  // Check if already picked
  if (maqraData.sudahAmbil && maqraData.maqra) {
    const m = maqraData.maqra;
    already.innerHTML = `
      <div class="info-banner already">
        <div class="info-banner-icon">✅</div>
        <div><strong>Anda Sudah Mengambil Maqra</strong>Maqra Anda telah tersimpan dan tidak dapat diubah kembali.</div>
      </div>
      <div class="maqra-result-card">
        <div class="maqra-label">📖 Maqra Anda</div>
        <div class="maqra-ayat">${esc(m.maqra_teks||m.maqra||'-')}</div>
        <div class="maqra-surah">${esc(m.maqra_detail||m.surah||'')}</div>
        <div class="maqra-nomor">Nomor Undian: ${esc(m.nomor_maqra||'-')}</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-sm" onclick="downloadBuktiDirect(${JSON.stringify(m).replace(/</g,'\\u003c')},'${esc(rec.nomor_pendaftaran||'')}','${esc(rec.nama_lengkap||'')}','${esc(rec.cabang_lomba||'')}','${esc(rec.kecamatan||'')}')"
                style="background:var(--em);color:#fff">⬇️ Unduh Bukti</button>
        <a href="index.html" class="btn btn-outline btn-sm">🏠 Beranda</a>
      </div>`;
    return;
  }

  // Ready to pick — build list and show spin
  _maqraList = maqraData.list || [];
  if (!_maqraList.length) {
    banner.innerHTML = `
      <div class="info-banner error">
        <div class="info-banner-icon">😔</div>
        <div><strong>Maqra Habis</strong>Semua maqra untuk cabang ini telah diambil. Hubungi panitia.</div>
      </div>`;
    return;
  }

  buildLanternStrip(_maqraList);
  spinCard.style.display = '';
}

// ── Build Lantern Strip ───────────────────────────────────────
function buildLanternStrip(list) {
  const strip = document.getElementById('lanternStrip');
  strip.innerHTML = '';
  // Repeat list 6x agar item tengah selalu bisa dicapai
  const repeated = [...list, ...list, ...list, ...list, ...list, ...list];
  repeated.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'lantern-item';
    div.textContent = item.maqra_teks || item.maqra || '—';
    div.dataset.idx = i;
    strip.appendChild(div);
  });
}

// ── Start Spin Animation ──────────────────────────────────────
async function startSpin() {
  if (_spinning || !_pes || !_maqraList.length) return;
  _spinning = true;

  const btn = document.getElementById('spinBtn');
  const btnWrap = document.getElementById('spinBtnWrap');
  const status = document.getElementById('spinStatus');
  const strip = document.getElementById('lanternStrip');
  const resultReveal = document.getElementById('resultReveal');

  btn.disabled = true;
  resultReveal.classList.remove('show');
  status.textContent = '🌟 Mengambil maqra...';

  // Phase 1: quick spins — mulai dari 1/6 strip agar smooth
  const itemH      = 50;
  const totalItems = strip.childElementCount;
  const safeMax    = Math.floor(totalItems * 0.55) * itemH; // maks 55% strip

  // Mulai dari 1/6 posisi agar tidak lompat dari nol
  let currentOffset = Math.floor(totalItems / 6) * itemH;
  strip.style.transition = 'none';
  strip.style.transform  = `translateY(-${currentOffset}px)`;
  // Force reflow agar transition 'none' langsung diterapkan sebelum animasi
  void strip.offsetHeight;

  const phases = [
    { dur: 320, itemsPerPhase: 6  },
    { dur: 220, itemsPerPhase: 10 },
    { dur: 180, itemsPerPhase: 12 },
    { dur: 160, itemsPerPhase: 12 },
  ];

  for (const ph of phases) {
    for (let i = 0; i < ph.itemsPerPhase; i++) {
      currentOffset += itemH;
      if (currentOffset >= safeMax) currentOffset = Math.floor(totalItems / 6) * itemH;
      strip.style.transition = `transform ${ph.dur}ms ease-in-out`;
      strip.style.transform  = `translateY(-${currentOffset}px)`;
      await sleep(ph.dur + 8);
    }
  }

  // Phase 2: call API to lock the maqra
  status.textContent = '🔐 Mengunci pilihan...';

  let chosenMaqra = null;
  try {
    // JSONP POST — tidak ada fetch/CORS preflight
    const data = await jsonpPost({
      action            : 'ambilMaqra',
      nomor_pendaftaran : _pes.nomor_pendaftaran,
      cabang_lomba      : _pes.cabang_lomba,
      nik               : _pes.nik,
    });

    if (!data.success) {
      showToast('Gagal', data.message || 'Terjadi kesalahan. Coba lagi.', 'error', 6000);
      status.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
      btn.disabled = false;
      _spinning = false;
      return;
    }

    chosenMaqra = data.maqra;
    _maqraResult = data.maqra;

  } catch (err) {
    showToast('Error', 'Gagal menghubungi server: ' + err.message, 'error');
    status.textContent = 'Error. Silakan coba lagi.';
    btn.disabled = false;
    _spinning = false;
    return;
  }

  // Phase 3: slow down to chosen maqra
  status.textContent = '✨ Maqra ditemukan!';

  // Find the chosen item in strip and scroll to it
  const items = Array.from(strip.children);
  let targetIdx = -1;
  // Find in middle repetition to ensure visible
  const midStart = Math.floor(items.length / 3);
  for (let i = midStart; i < items.length - 5; i++) {
    const item = items[i];
    const txt  = (item.textContent || '').trim();
    const ref  = (chosenMaqra.maqra_teks || chosenMaqra.maqra || '').trim();
    if (txt === ref) { targetIdx = i; break; }
  }
  if (targetIdx < 0) targetIdx = midStart; // fallback

  // Hitung windowCenterY secara dinamis dari DOM — bukan hardcode
  const lanternWindow = strip.parentElement;
  const windowH       = lanternWindow ? lanternWindow.clientHeight : 200;
  const windowCenterY = windowH / 2;
  const targetY       = targetIdx * itemH - windowCenterY + itemH / 2;

  // Smooth deceleration ke posisi yang tepat
  strip.style.transition = 'transform 2s cubic-bezier(0.16, 1, 0.3, 1)';
  strip.style.transform  = `translateY(-${targetY}px)`;
  await sleep(2050);

  // Highlight chosen item
  items.forEach(it => it.classList.remove('highlight'));
  if (items[targetIdx]) {
    items[targetIdx].classList.add('highlight');

    // Micro-correction: ukur posisi aktual item vs center container
    // agar teks benar-benar tepat di tengah garis emas, bukan off by a few px
    const container = strip.parentElement;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const itemRect      = items[targetIdx].getBoundingClientRect();
      const itemCenter    = itemRect.top + itemRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;
      const diff = itemCenter - containerCenter;

      if (Math.abs(diff) > 1) {
        // Koreksi sisa offset tanpa animasi baru — langsung snap
        const currentY   = parseFloat(strip.style.transform.replace('translateY(', '').replace('px)', '')) || 0;
        const correctedY = Math.abs(currentY) + diff;
        strip.style.transition = 'transform 0.3s ease-out';
        strip.style.transform  = `translateY(-${correctedY}px)`;
        await sleep(320);
      }
    }
  }

  // Phase 4: reveal result
  await sleep(150);
  showResultReveal(chosenMaqra);

  // Confetti burst!
  launchConfetti();

  // Hide spin button
  btnWrap.style.display = 'none';
  status.textContent = '🎉 Maqra berhasil diperoleh!';

  _spinning = false;
}

// ── Show Result Reveal ────────────────────────────────────────
function showResultReveal(maqra) {
  document.getElementById('resultAyat').textContent  = maqra.maqra_teks  || maqra.maqra  || '—';
  document.getElementById('resultSurah').textContent = maqra.maqra_detail|| maqra.surah  || '—';
  document.getElementById('resultNomor').textContent = `Nomor Undian: ${maqra.nomor_maqra || '—'}`;

  const rr = document.getElementById('resultReveal');
  rr.style.display = 'block';
  rr.classList.add('show');

  // Particle burst
  spawnParticles();
}

// ── Particle burst inside card ────────────────────────────────
function spawnParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#fbbf24','#a7f3d0','#ffffff','#fde68a','#6ee7b7'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 8 + 4;
    const angle = (Math.random() * 360) * (Math.PI / 180);
    const dist  = Math.random() * 80 + 30;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${40+Math.random()*20}%;top:${40+Math.random()*20}%;
      --px:${(Math.cos(angle)*dist).toFixed(0)}px;
      --py:${(Math.sin(angle)*dist).toFixed(0)}px;
      --p-dur:${(Math.random()*.6+.6).toFixed(2)}s;
      --p-delay:${(Math.random()*.2).toFixed(2)}s;
      border-radius:${Math.random()>0.5?'50%':'4px'};`;
    container.appendChild(p);
  }
}

// ── Confetti ──────────────────────────────────────────────────
function launchConfetti() {
  const cc = document.getElementById('confettiContainer');
  if (!cc) return;
  cc.innerHTML = '';
  const colors = ['#059669','#fbbf24','#3b82f6','#ec4899','#a855f7','#f97316','#10b981'];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'conf-piece';
    p.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      width:${Math.random()*8+5}px;height:${Math.random()*8+5}px;
      border-radius:${Math.random()>0.5?'50%':'2px'};
      --c-dx:${(Math.random()*200-100).toFixed(0)}px;
      --c-dur:${(Math.random()*2+2).toFixed(1)}s;
      --c-delay:${(Math.random()*.5).toFixed(2)}s;`;
    cc.appendChild(p);
  }
  setTimeout(() => { cc.innerHTML = ''; }, 5000);
}

// ── Download Bukti ────────────────────────────────────────────
function downloadBukti() {
  if (!_maqraResult || !_pes) return;
  downloadBuktiDirect(_maqraResult, _pes.nomor_pendaftaran, _pes.nama_lengkap, _pes.cabang_lomba, _pes.kecamatan);
}

function downloadBuktiDirect(maqra, nomor, nama, cabang, kecamatan) {
  // Generate HTML and open in new window for print/save
  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>Bukti Maqra MTQ 2026</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Georgia',serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);width:100%;max-width:480px;overflow:hidden}
  .header{background:linear-gradient(135deg,#064e3b,#059669);padding:28px 32px;color:#fff;text-align:center}
  .header h1{font-size:22px;margin-bottom:4px}
  .header p{font-size:13px;opacity:.8}
  .body{padding:28px 32px}
  .ornament{text-align:center;color:#9ca3af;margin:12px 0;letter-spacing:4px}
  .field{margin-bottom:14px}
  .field label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;display:block;margin-bottom:3px}
  .field .val{font-size:15px;font-weight:600;color:#1f2937}
  .maqra-box{background:linear-gradient(135deg,#065f46,#047857);color:#fff;border-radius:12px;padding:24px;text-align:center;margin:20px 0}
  .maqra-box .label{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.75;margin-bottom:8px}
  .maqra-box .main{font-size:22px;font-weight:700;margin-bottom:4px}
  .maqra-box .sub{font-size:14px;opacity:.85}
  .nomor-badge{background:rgba(255,255,255,.15);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:600;display:inline-block;margin-top:10px}
  .footer{border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center}
  .warning{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#b45309;margin-top:16px}
  @media print{body{background:#fff}.card{box-shadow:none}}
</style></head><body>
<div class="card">
  <div class="header">
    <h1>📖 Bukti Maqra MTQ 2026</h1>
    <p>Kabupaten Indramayu — Dicetak: ${new Date().toLocaleString('id-ID')}</p>
  </div>
  <div class="body">
    <div class="ornament">✦ ✦ ✦</div>
    <div class="field"><label>Nama Peserta</label><div class="val">${esc(nama||'-')}</div></div>
    <div class="field"><label>Nomor Pendaftaran</label><div class="val" style="font-family:monospace;letter-spacing:1px">${esc(nomor||'-')}</div></div>
    <div class="field"><label>Cabang Lomba</label><div class="val">${esc(cabang||'-')}</div></div>
    <div class="field"><label>Kecamatan</label><div class="val">${esc(kecamatan||'-')}</div></div>
    <div class="maqra-box">
      <div class="label">📖 Maqra</div>
      <div class="main">${esc(maqra.maqra_teks||maqra.maqra||'-')}</div>
      <div class="sub">${esc(maqra.maqra_detail||maqra.surah||'')}</div>
      <div class="nomor-badge">Nomor Undian: ${esc(maqra.nomor_maqra||'-')}</div>
    </div>
    <div class="warning">⚠️ Simpan dokumen ini. Maqra yang sudah diperoleh tidak dapat diubah. Tunjukkan kepada panitia MTQ 2026.</div>
  </div>
  <div class="footer">MTQ Kabupaten Indramayu 2026 — Dokumen ini sah tanpa tanda tangan</div>
</div>
<script>window.print();<\/script>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Bukti_Maqra_${(nomor||'MTQ').replace(/[^A-Za-z0-9]/g,'_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── JSONP helper ──────────────────────────────────────────────
// ── JSONP GET ─────────────────────────────────────────────────
function jsonpCall(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cb = 'mtqMaqra_' + Date.now() + Math.floor(Math.random()*9999);
    const s  = document.createElement('script');
    let timer;
    window[cb] = (d) => { clearTimeout(timer); delete window[cb]; s.remove(); resolve(d); };
    s.src = `${url}&callback=${cb}`;
    s.onerror = () => { clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer = setTimeout(() => { delete window[cb]; s.remove(); reject(new Error('Timeout')); }, timeout);
    document.head.appendChild(s);
  });
}

// ── JSONP POST (no fetch — no CORS preflight) ─────────────────
// Payload JSON dikirim sebagai ?postData=... di URL GET.
// GAS doGet mendeteksi postData dan menjalankan handler POST.
function jsonpPost(payload, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const cb  = 'mtqMaqraP_' + Date.now() + Math.floor(Math.random()*9999);
    const enc = encodeURIComponent(JSON.stringify(payload));
    const s   = document.createElement('script');
    let timer;
    window[cb] = (d) => { clearTimeout(timer); delete window[cb]; s.remove(); resolve(d); };
    s.src = `${API_URL}?postData=${enc}&callback=${cb}`;
    s.onerror = () => { clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer = setTimeout(() => { delete window[cb]; s.remove(); reject(new Error('Timeout')); }, timeout);
    document.head.appendChild(s);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function showSection(id) {
  document.getElementById(id).style.display = '';
  // Hide NIK card after successful verify
  document.getElementById('nikCard').style.display = 'none';
}

function showLoading(show, msg = 'Memuat...') {
  const ov = document.getElementById('loadingOverlay');
  const lm = document.getElementById('loadingMsg');
  if (ov) ov.classList.toggle('show', show);
  if (lm) lm.textContent = msg;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(title, msg, type = 'info', duration = 4000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, duration);
}