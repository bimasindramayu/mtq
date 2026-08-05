// ════════════════════════════════════════════════════════════════
//  MTQ 2026 — penilaian.js (embedded)
//  Self-contained: semua data di localStorage (untuk demo/prod
//  sambungkan ke API_URL sama seperti config.js)
// ════════════════════════════════════════════════════════════════

const API_URL = window.MTQ_API_URL || '';

// ── ADMIN PIN (untuk demo — ganti via config atau API) ────────
const ADMIN_PIN = '1234';

// ── Data Store (localStorage-backed) ─────────────────────────
function store(key, val) {
  try { localStorage.setItem('mtq_' + key, JSON.stringify(val)); } catch(e) {}
}
function load(key, def = null) {
  try {
    const v = localStorage.getItem('mtq_' + key);
    return v !== null ? JSON.parse(v) : def;
  } catch { return def; }
}

// ── Initial seed data ─────────────────────────────────────────
// Cabang list: SATU SUMBER di js/config.js → MTQ_CONFIG.CABANG_LIST
// (jangan hardcode array cabang lagi di sini — edit config.js saja)
const CABANG_LIST = MTQ_CONFIG.CABANG_LIST;

// Seed default parameters if not set
if (!load('params')) {
  const params = {};
  CABANG_LIST.forEach(c => {
    params[c] = [
      { nama: 'Tajwid', bobot: 35 },
      { nama: 'Fashahah', bobot: 30 },
      { nama: 'Suara & Lagu', bobot: 25 },
      { nama: 'Adab & Penampilan', bobot: 10 }
    ];
  });
  store('params', params);
}

// Seed demo peserta per cabang if not set
if (!load('peserta')) {
  const peserta = {};
  const kecList = ['Indramayu','Jatibarang','Haurgeulis','Patrol','Kandanghaur','Lelea','Sindang','Sliyeg'];
  CABANG_LIST.forEach(c => {
    peserta[c] = Array.from({length: 5}, (_, i) => ({
      id: c + '_' + (i+1),
      nama: ['Ahmad Fauzi','Siti Aisyah','Muhammad Rizki','Nur Laila','Dedy Kurniawan'][i] + ' (Demo)',
      kecamatan: kecList[i % kecList.length],
      nomor_urut: i + 1
    }));
  });
  store('peserta', peserta);
}

// ── State ─────────────────────────────────────────────────────
let S = {
  adminLoggedIn: false,
  hakimSession: null,    // { id, nama, cabang:[], pin }
  currentView: 'publik',
  currentPesertaIdx: 0,
  currentScoringCabang: null,
  tempParams: [],        // parameter being edited
  tempHakimCabang: [],   // cabang being added to hakim form
  publicActiveCabang: null,
  scores: {},            // { hakimId_pesertaId_cabang: { params, total, catatan, bukti, submittedAt } }
};

// Load persisted scores
S.scores = load('nilai', {});

// ════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initPinInputs();
  populateCabangDropdowns();
  checkPersistentSession();
  initPublicView();
  setInterval(refreshPublicResults, 30000);
});

function initDarkMode() {
  const btn = document.getElementById('darkBtn');
  const saved = localStorage.getItem('mtq-theme') || 'light';
  applyTheme(saved);
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('mtq-theme', next);
  });
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('darkBtn').textContent = t === 'dark' ? '☀️' : '🌙';
}

function populateCabangDropdowns() {
  const selectors = ['hakimCabangSelect','paramCabang','pesertaCabangFilter','rekapCabangFilter'];
  selectors.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    CABANG_LIST.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      el.appendChild(o);
    });
  });
}

function checkPersistentSession() {
  const sess = load('hakimSession');
  if (sess) {
    S.hakimSession = sess;
    showHakimSession(sess);
  }
}

// ════════════════════════════════════════════════════════════════
//  VIEW SWITCHING
// ════════════════════════════════════════════════════════════════
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.mobile-tab-btn').forEach(t => t.classList.remove('active'));

  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelector(`.nav-tab[data-view="${view}"]`)?.classList.add('active');
  document.querySelector(`.mobile-tab-btn[data-view="${view}"]`)?.classList.add('active');
  S.currentView = view;

  if (view === 'publik') initPublicView();
  if (view === 'admin' && S.adminLoggedIn) { renderHakimList(); renderParamSummary(); }
  if (view === 'login' && S.hakimSession) switchView_scoring();
}

function toggleMobileMenu() {
  document.getElementById('mainNavbar').classList.toggle('mobile-open');
}
function closeMobileMenu() {
  document.getElementById('mainNavbar').classList.remove('mobile-open');
}

// ════════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════════
function adminLogin() {
  const pin = document.getElementById('adminPinInput').value.trim();
  if (pin !== ADMIN_PIN) { toast('PIN Salah', 'PIN admin tidak valid', 'error'); return; }
  S.adminLoggedIn = true;
  document.getElementById('adminGate').classList.add('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  renderHakimList();
  renderParamSummary();
  toast('Login Berhasil', 'Selamat datang di panel admin', 'success');
}

function adminTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`#admin-tab-${tab}`)?.classList.add('active');
  event.target.classList.add('active');
  if (tab === 'rekap') { loadRekapTable(); populateRekapFilters(); }
  if (tab === 'peserta') loadPesertaTable();
}

// ── Hakim ──────────────────────────────────────────────────────
function genPin() {
  const p = String(Math.floor(100000 + Math.random() * 900000));
  document.getElementById('hakimPin').value = p;
}

function hakimAddCabang() {
  const sel = document.getElementById('hakimCabangSelect');
  const val = sel.value;
  if (!val) { toast('', 'Pilih cabang terlebih dahulu', 'warning'); return; }
  if (S.tempHakimCabang.includes(val)) { toast('', 'Cabang sudah ditambahkan', 'warning'); return; }
  S.tempHakimCabang.push(val);
  renderHakimCabangChips();
  sel.value = '';
}

function renderHakimCabangChips() {
  const el = document.getElementById('hakimCabangList');
  el.innerHTML = S.tempHakimCabang.map((c, i) => `
    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--em-pale);color:var(--em);border-radius:var(--r-full);padding:4px 10px;font-size:12px;font-weight:700">
      ${c} <button onclick="S.tempHakimCabang.splice(${i},1);renderHakimCabangChips()" style="color:var(--ruby);font-size:14px;line-height:1;background:none;border:none;cursor:pointer">×</button>
    </span>`).join('');
}

function simpanHakim() {
  const nama = document.getElementById('hakimNama').value.trim();
  const pin  = document.getElementById('hakimPin').value.trim();
  if (!nama) { toast('', 'Nama hakim wajib diisi', 'error'); return; }
  if (S.tempHakimCabang.length === 0) {
    // fallback: use select value
    const sel = document.getElementById('hakimCabangSelect').value;
    if (!sel) { toast('', 'Pilih minimal 1 cabang', 'error'); return; }
    S.tempHakimCabang.push(sel);
  }
  if (!pin || pin.length < 4) { toast('', 'PIN minimal 4 digit', 'error'); return; }

  const hakimList = load('hakim', []);
  // Check duplicate PIN
  if (hakimList.some(h => h.pin === pin)) { toast('PIN Duplikat', 'PIN sudah digunakan hakim lain', 'error'); return; }

  hakimList.push({
    id: 'h_' + Date.now(),
    nama, pin,
    cabang: [...S.tempHakimCabang],
    createdAt: new Date().toISOString()
  });
  store('hakim', hakimList);

  // Reset form
  document.getElementById('hakimNama').value = '';
  document.getElementById('hakimPin').value = '';
  document.getElementById('hakimCabangSelect').value = '';
  S.tempHakimCabang = [];
  renderHakimCabangChips();

  renderHakimList();
  toast('Tersimpan', `Hakim ${nama} berhasil ditambahkan`, 'success');
}

function renderHakimList() {
  const hakimList = load('hakim', []);
  const el = document.getElementById('hakimList');
  const cnt = document.getElementById('hakimCount');
  cnt.textContent = hakimList.length + ' hakim terdaftar';

  if (!hakimList.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>Belum ada dewan hakim</p></div>';
    return;
  }
  el.innerHTML = hakimList.map(h => `
    <div class="judge-card">
      <div class="judge-avatar">${h.nama.charAt(0).toUpperCase()}</div>
      <div class="judge-info">
        <div class="judge-name">${h.nama}</div>
        <div class="judge-cabang">${h.cabang.join(', ')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div class="judge-pin">🔑 ${h.pin}</div>
        <button class="btn btn-danger btn-sm" onclick="hapusHakim('${h.id}')">✕</button>
      </div>
    </div>`).join('');
}

function hapusHakim(id) {
  if (!confirm('Hapus dewan hakim ini?')) return;
  let list = load('hakim', []);
  list = list.filter(h => h.id !== id);
  store('hakim', list);
  renderHakimList();
  toast('Dihapus', 'Dewan hakim berhasil dihapus', 'success');
}

// ── Parameter ─────────────────────────────────────────────────
function loadParamForCabang() {
  const cabang = document.getElementById('paramCabang').value;
  if (!cabang) { document.getElementById('paramExisting').innerHTML = ''; return; }
  const params = load('params', {});
  S.tempParams = params[cabang] ? [...params[cabang]] : [];
  renderParamChips();
  updateBobotTotal();
}

function renderParamChips() {
  const el = document.getElementById('paramExisting');
  if (!S.tempParams.length) { el.innerHTML = '<div class="text-sm text-muted">Belum ada parameter. Tambahkan di bawah.</div>'; return; }
  el.innerHTML = S.tempParams.map((p, i) => `
    <div class="param-chip">
      <div class="param-chip-name">${p.nama}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="param-chip-bobot">${p.bobot}%</div>
        <div class="progress-bobot" style="width:60px"><div class="progress-bobot-fill" style="width:${p.bobot}%"></div></div>
        <button class="param-chip-del" onclick="removeParam(${i})">✕</button>
      </div>
    </div>`).join('');
}

function addParam() {
  const nama  = document.getElementById('paramNama').value.trim();
  const bobot = parseInt(document.getElementById('paramBobot').value);
  if (!nama) { toast('', 'Nama parameter wajib diisi', 'error'); return; }
  if (!bobot || bobot < 1 || bobot > 100) { toast('', 'Bobot harus 1–100', 'error'); return; }
  const total = S.tempParams.reduce((s, p) => s + p.bobot, 0);
  if (total + bobot > 100) { toast('Bobot Melebihi', `Total bobot akan menjadi ${total + bobot}% (maks. 100%)`, 'error'); return; }
  S.tempParams.push({ nama, bobot });
  document.getElementById('paramNama').value = '';
  document.getElementById('paramBobot').value = '';
  renderParamChips();
  updateBobotTotal();
}

function removeParam(i) {
  S.tempParams.splice(i, 1);
  renderParamChips();
  updateBobotTotal();
}

function updateBobotTotal() {
  const total = S.tempParams.reduce((s, p) => s + p.bobot, 0);
  const el = document.getElementById('paramBobotTotal');
  el.style.display = S.tempParams.length ? 'flex' : 'none';
  el.className = 'alert mb-16 ' + (total === 100 ? 'alert-success' : total > 100 ? 'alert-danger' : 'alert-warn');
  el.textContent = `Total Bobot: ${total}% ${total === 100 ? '✅ Sempurna!' : total > 100 ? '❌ Melebihi 100%!' : '⚠️ Belum 100%'}`;
}

function simpanParameter() {
  const cabang = document.getElementById('paramCabang').value;
  if (!cabang) { toast('', 'Pilih cabang terlebih dahulu', 'error'); return; }
  const total = S.tempParams.reduce((s, p) => s + p.bobot, 0);
  if (total !== 100) { toast('Bobot Belum 100%', `Total bobot saat ini ${total}%. Harus tepat 100%.`, 'error'); return; }
  if (!S.tempParams.length) { toast('', 'Tambahkan minimal 1 parameter', 'error'); return; }

  const params = load('params', {});
  params[cabang] = [...S.tempParams];
  store('params', params);
  renderParamSummary();
  toast('Tersimpan', `Parameter untuk ${cabang} berhasil disimpan`, 'success');
}

function renderParamSummary() {
  const params = load('params', {});
  const el = document.getElementById('paramSummary');
  const cabangWithParams = Object.keys(params).filter(c => params[c]?.length);
  if (!cabangWithParams.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Parameter belum dikonfigurasi</p></div>';
    return;
  }
  el.innerHTML = cabangWithParams.map(c => `
    <div style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--g800);margin-bottom:6px">${c}</div>
      ${params[c].map(p => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="flex:1;font-size:12px;color:var(--g600)">${p.nama}</div>
          <div class="progress-bobot" style="width:80px"><div class="progress-bobot-fill" style="width:${p.bobot}%"></div></div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--em);font-weight:700;width:32px;text-align:right">${p.bobot}%</div>
        </div>`).join('')}
    </div>`).join('<div class="sec-div"><div class="sec-div-line"></div></div>');
}

// ── Peserta ────────────────────────────────────────────────────
function loadPesertaTable() {
  const cabang = document.getElementById('pesertaCabangFilter').value;
  const pesertaAll = load('peserta', {});
  const wrap = document.getElementById('pesertaTableWrap');

  if (!cabang) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🧑</div><p>Pilih cabang untuk melihat peserta</p></div>'; return; }

  const list = pesertaAll[cabang] || [];
  if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🧑</div><p>Belum ada peserta di cabang ini</p></div>'; return; }

  wrap.innerHTML = `<table><thead><tr>
    <th>#</th><th>Nama Peserta</th><th>Kecamatan</th><th>Aksi</th>
  </tr></thead><tbody>
  ${list.map((p, i) => `<tr>
    <td class="mono">${p.nomor_urut || i+1}</td>
    <td style="font-weight:600">${p.nama}</td>
    <td>${p.kecamatan}</td>
    <td><button class="btn btn-danger btn-sm" onclick="hapusPeserta('${cabang}',${i})">Hapus</button></td>
  </tr>`).join('')}</tbody></table>`;
}

function tambahPeserta() {
  const cabang = document.getElementById('pesertaCabangFilter').value;
  const nama   = document.getElementById('pesertaNamaBaru').value.trim();
  if (!cabang) { toast('', 'Pilih cabang terlebih dahulu', 'error'); return; }
  if (!nama) { toast('', 'Nama peserta wajib diisi', 'error'); return; }

  const pesertaAll = load('peserta', {});
  if (!pesertaAll[cabang]) pesertaAll[cabang] = [];
  pesertaAll[cabang].push({
    id: cabang + '_' + Date.now(),
    nama, kecamatan: '-',
    nomor_urut: pesertaAll[cabang].length + 1
  });
  store('peserta', pesertaAll);
  document.getElementById('pesertaNamaBaru').value = '';
  loadPesertaTable();
  toast('Ditambahkan', `Peserta ${nama} berhasil ditambahkan`, 'success');
}

function hapusPeserta(cabang, idx) {
  if (!confirm('Hapus peserta ini?')) return;
  const pesertaAll = load('peserta', {});
  pesertaAll[cabang].splice(idx, 1);
  store('peserta', pesertaAll);
  loadPesertaTable();
}

// ── Rekap ──────────────────────────────────────────────────────
function populateRekapFilters() {
  const hakimList = load('hakim', []);
  const rSel = document.getElementById('rekapHakimFilter');
  // Clear except first option
  while (rSel.options.length > 1) rSel.remove(1);
  hakimList.forEach(h => {
    const o = document.createElement('option'); o.value = h.id; o.textContent = h.nama;
    rSel.appendChild(o);
  });
}

function loadRekapTable() {
  const cabangF  = document.getElementById('rekapCabangFilter').value;
  const hakimF   = document.getElementById('rekapHakimFilter').value;
  const hakimList = load('hakim', []);
  const wrap = document.getElementById('rekapTableWrap');

  const rows = [];
  Object.entries(S.scores).forEach(([key, data]) => {
    const parts = key.split('|||');
    if (parts.length < 3) return;
    const [hakimId, pesertaId, cabang] = parts;
    if (cabangF && cabang !== cabangF) return;
    if (hakimF && hakimId !== hakimF) return;
    const hakim = hakimList.find(h => h.id === hakimId);
    rows.push({ hakimNama: hakim?.nama || hakimId, pesertaId, cabang, ...data });
  });

  if (!rows.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Belum ada nilai yang disubmit</p></div>';
    return;
  }

  rows.sort((a, b) => b.total - a.total);
  wrap.innerHTML = `<table><thead><tr>
    <th>Hakim</th><th>Cabang</th><th>Peserta</th><th>Total</th><th>Waktu</th>
  </tr></thead><tbody>
  ${rows.map(r => `<tr>
    <td>${r.hakimNama}</td>
    <td><span class="badge badge-em">${r.cabang}</span></td>
    <td style="font-weight:600">${r.pesertaNama || r.pesertaId}</td>
    <td><span class="score-display" style="font-size:16px;padding:4px 12px">${Number(r.total).toFixed(2)}</span></td>
    <td class="text-sm text-muted">${r.submittedAt ? new Date(r.submittedAt).toLocaleString('id-ID') : '-'}</td>
  </tr>`).join('')}</tbody></table>`;
}

// ════════════════════════════════════════════════════════════════
//  HAKIM LOGIN & SCORING
// ════════════════════════════════════════════════════════════════
function initPinInputs() {
  const inputs = document.querySelectorAll('#pinInputs .pin-box');
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      inp.classList.toggle('filled', !!inp.value);
      if (inp.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      inputs.forEach((box, i) => { box.value = paste[i] || ''; box.classList.toggle('filled', !!box.value); });
      if (paste.length > 0) inputs[Math.min(paste.length, inputs.length - 1)].focus();
    });
  });
}

function getPinValue() {
  return Array.from(document.querySelectorAll('#pinInputs .pin-box')).map(i => i.value).join('');
}

function hakimLogin() {
  const pin = getPinValue();
  if (pin.length < 4) { toast('', 'Masukkan PIN lengkap', 'warning'); return; }

  const hakimList = load('hakim', []);
  const hakim = hakimList.find(h => h.pin === pin);
  if (!hakim) { toast('PIN Salah', 'Tidak ada dewan hakim dengan PIN tersebut', 'error'); return; }

  S.hakimSession = hakim;
  store('hakimSession', hakim);
  showHakimSession(hakim);
  switchView_scoring();
  toast('Selamat Datang', `Halo, ${hakim.nama}!`, 'success');
}

function showHakimSession(hakim) {
  document.getElementById('sessionChip').classList.remove('hidden');
  document.getElementById('sessionName').textContent = hakim.nama;
  document.getElementById('logoutBtn').classList.remove('hidden');
}

function switchView_scoring() {
  document.getElementById('hakimLoginScreen').classList.add('hidden');
  document.getElementById('hakimScoringScreen').classList.remove('hidden');

  const hakim = S.hakimSession;
  document.getElementById('scoringHakimName').textContent = hakim.nama;

  // Populate cabang picker (hanya cabang milik hakim)
  const picker = document.getElementById('scoringCabangPicker');
  picker.innerHTML = hakim.cabang.map(c => `<option value="${c}">${c}</option>`).join('');
  S.currentScoringCabang = hakim.cabang[0];
  onCabangPickerChange();
}

function onCabangPickerChange() {
  S.currentScoringCabang = document.getElementById('scoringCabangPicker').value;
  S.currentPesertaIdx = 0;
  document.getElementById('scoringCabangLabel').textContent = S.currentScoringCabang;
  loadScoringPeserta();
}

function loadScoringPeserta() {
  const pesertaAll = load('peserta', {});
  const list = pesertaAll[S.currentScoringCabang] || [];

  if (!list.length) {
    document.getElementById('currentPesertaName').textContent = 'Tidak ada peserta';
    document.getElementById('pesertaCounter').textContent = '0/0';
    document.getElementById('paramScoreContainer').innerHTML = '<div class="empty-state"><div class="empty-icon">🧑</div><p>Belum ada peserta terdaftar</p></div>';
    return;
  }

  if (S.currentPesertaIdx >= list.length) S.currentPesertaIdx = list.length - 1;
  if (S.currentPesertaIdx < 0) S.currentPesertaIdx = 0;

  const p = list[S.currentPesertaIdx];
  document.getElementById('currentPesertaName').textContent = p.nama;
  document.getElementById('currentPesertaKec').textContent = p.kecamatan;
  document.getElementById('pesertaCounter').textContent = `${S.currentPesertaIdx + 1}/${list.length}`;
  document.getElementById('prevPesertaBtn').disabled = S.currentPesertaIdx === 0;
  document.getElementById('nextPesertaBtn').disabled = S.currentPesertaIdx === list.length - 1;

  const scoreKey = `${S.hakimSession.id}|||${p.id}|||${S.currentScoringCabang}`;
  const existing = S.scores[scoreKey];

  const alreadyEl = document.getElementById('alreadySubmittedAlert');
  const submitBtn = document.getElementById('submitNilaiBtn');

  if (existing) {
    alreadyEl.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = '🔒 Nilai Sudah Disubmit';
    document.getElementById('catatanHakim').value = existing.catatan || '';
    document.getElementById('catatanHakim').disabled = true;
    renderParamScores(existing.params, true);
    document.getElementById('scoreTotalNum').textContent = Number(existing.total).toFixed(2);
    return;
  }

  alreadyEl.classList.add('hidden');
  submitBtn.disabled = false;
  submitBtn.textContent = '✅ Submit Nilai';
  document.getElementById('catatanHakim').disabled = false;
  document.getElementById('catatanHakim').value = '';
  removeBukti();
  renderParamScores(null, false);
}

function renderParamScores(existingVals, readonly) {
  const params = load('params', {});
  const cabangParams = params[S.currentScoringCabang] || [];
  const el = document.getElementById('paramScoreContainer');

  if (!cabangParams.length) {
    el.innerHTML = '<div class="alert alert-warn">⚠️ Parameter penilaian belum dikonfigurasi untuk cabang ini. Hubungi admin.</div>';
    document.getElementById('scoreTotalBar').style.display = 'none';
    return;
  }

  document.getElementById('scoreTotalBar').style.display = 'flex';
  el.innerHTML = cabangParams.map((p, i) => {
    const val = existingVals ? (existingVals[i]?.nilai || 0) : 0;
    return `
    <div class="param-score-row">
      <div style="min-width:0">
        <div class="param-score-name">${p.nama}</div>
        <div class="param-score-bobot">Bobot ${p.bobot}%</div>
      </div>
      <input type="range" class="param-score-slider" min="0" max="100" value="${val}" step="1"
        ${readonly ? 'disabled' : ''}
        oninput="syncScore(${i},this.value,'num')">
      <input type="number" class="param-score-input" min="0" max="100" value="${val}"
        ${readonly ? 'disabled' : ''}
        oninput="syncScore(${i},this.value,'range')"
        onblur="clampScore(this)" data-idx="${i}">
    </div>`;
  }).join('');

  calcTotal();
}

function syncScore(idx, val, target) {
  const v = Math.min(100, Math.max(0, parseFloat(val) || 0));
  const row = document.querySelectorAll('.param-score-row')[idx];
  if (target === 'num') row.querySelector('.param-score-input').value = v;
  else row.querySelector('.param-score-slider').value = v;
  calcTotal();
}

function clampScore(inp) {
  const v = parseFloat(inp.value);
  if (isNaN(v) || v < 0) inp.value = 0;
  if (v > 100) inp.value = 100;
  calcTotal();
}

function calcTotal() {
  const params = (load('params', {}))[S.currentScoringCabang] || [];
  const rows = document.querySelectorAll('.param-score-row');
  let total = 0;
  rows.forEach((row, i) => {
    const val = parseFloat(row.querySelector('.param-score-input').value) || 0;
    total += val * ((params[i]?.bobot || 0) / 100);
  });
  document.getElementById('scoreTotalNum').textContent = total.toFixed(2);
  return total;
}

function navPeserta(dir) {
  const pesertaAll = load('peserta', {});
  const list = pesertaAll[S.currentScoringCabang] || [];
  const newIdx = S.currentPesertaIdx + dir;
  if (newIdx < 0 || newIdx >= list.length) return;
  S.currentPesertaIdx = newIdx;
  loadScoringPeserta();
}

function previewBukti(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('File Terlalu Besar', 'Maksimal 5 MB', 'error'); input.value = ''; return; }

  document.getElementById('buktiName').textContent = file.name;
  document.getElementById('buktiSize').textContent = (file.size / 1024).toFixed(1) + ' KB';

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('buktiThumb').src = e.target.result;
      document.getElementById('buktiThumb').style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    document.getElementById('buktiThumb').style.display = 'none';
  }
  document.getElementById('buktiPreview').classList.add('show');
}

function removeBukti() {
  document.getElementById('buktiInput').value = '';
  document.getElementById('buktiPreview').classList.remove('show');
  document.getElementById('buktiThumb').src = '';
}

async function submitNilai() {
  const pesertaAll = load('peserta', {});
  const list = pesertaAll[S.currentScoringCabang] || [];
  if (!list.length) { toast('', 'Tidak ada peserta', 'error'); return; }

  const peserta = list[S.currentPesertaIdx];
  const params  = (load('params', {}))[S.currentScoringCabang] || [];
  const rows    = document.querySelectorAll('.param-score-row');

  if (!rows.length) { toast('', 'Parameter belum dikonfigurasi', 'error'); return; }

  // Collect values
  const paramVals = Array.from(rows).map((row, i) => ({
    nama: params[i]?.nama,
    bobot: params[i]?.bobot,
    nilai: parseFloat(row.querySelector('.param-score-input').value) || 0
  }));

  const total = calcTotal();
  const catatan = document.getElementById('catatanHakim').value.trim();

  if (!confirm(`Submit nilai ${peserta.nama}?\nTotal: ${total.toFixed(2)}\n\nNilai tidak dapat diubah setelah disubmit.`)) return;

  const scoreKey = `${S.hakimSession.id}|||${peserta.id}|||${S.currentScoringCabang}`;

  showOverlay('Menyimpan nilai...');

  // Simulate upload delay then save
  await new Promise(r => setTimeout(r, 800));

  S.scores[scoreKey] = {
    hakimId: S.hakimSession.id,
    hakimNama: S.hakimSession.nama,
    pesertaId: peserta.id,
    pesertaNama: peserta.nama,
    pesertaKecamatan: peserta.kecamatan,
    cabang: S.currentScoringCabang,
    params: paramVals,
    total,
    catatan,
    submittedAt: new Date().toISOString()
  };
  store('nilai', S.scores);

  hideOverlay();
  toast('Nilai Disimpan!', `Nilai ${peserta.nama}: ${total.toFixed(2)}`, 'success');
  loadScoringPeserta();

  // Auto-advance to next unscored peserta
  const nextUnscored = list.findIndex((p, i) => {
    if (i <= S.currentPesertaIdx) return false;
    const k = `${S.hakimSession.id}|||${p.id}|||${S.currentScoringCabang}`;
    return !S.scores[k];
  });
  if (nextUnscored !== -1) {
    setTimeout(() => { S.currentPesertaIdx = nextUnscored; loadScoringPeserta(); }, 1200);
  }
}

function logoutHakim() {
  if (!confirm('Keluar dari sesi hakim?')) return;
  S.hakimSession = null;
  localStorage.removeItem('mtq_hakimSession');
  document.getElementById('sessionChip').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('hakimLoginScreen').classList.remove('hidden');
  document.getElementById('hakimScoringScreen').classList.add('hidden');
  document.querySelectorAll('#pinInputs .pin-box').forEach(b => { b.value = ''; b.classList.remove('filled'); });
  switchView('login');
  toast('Keluar', 'Sesi hakim telah diakhiri', 'info');
}

// ════════════════════════════════════════════════════════════════
//  PUBLIC RESULTS
// ════════════════════════════════════════════════════════════════
let publicActiveCabang = null;

function initPublicView() {
  // Find cabang that have at least some scores or peserta
  const pesertaAll = load('peserta', {});
  const activeCabang = CABANG_LIST.filter(c => (pesertaAll[c] || []).length > 0);

  const filterEl = document.getElementById('publicCabangFilter');
  filterEl.innerHTML = '';

  activeCabang.forEach((c, i) => {
    const pill = document.createElement('div');
    pill.className = 'cabang-pill' + (i === 0 ? ' active' : '');
    pill.textContent = c;
    pill.onclick = () => {
      document.querySelectorAll('.cabang-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      publicActiveCabang = c;
      renderPublicResults(c);
    };
    filterEl.appendChild(pill);
  });

  if (activeCabang.length) {
    publicActiveCabang = activeCabang[0];
    renderPublicResults(activeCabang[0]);
  }
}

function refreshPublicResults() {
  S.scores = load('nilai', {});
  if (publicActiveCabang) renderPublicResults(publicActiveCabang);
  initPublicView();
}

function renderPublicResults(cabang) {
  publicActiveCabang = cabang;
  S.scores = load('nilai', {});

  const pesertaAll = load('peserta', {});
  const list = pesertaAll[cabang] || [];

  // Aggregate scores per peserta (average of all hakim)
  const aggregated = list.map(p => {
    const hakimScores = Object.entries(S.scores)
      .filter(([k]) => k.includes(`|||${p.id}|||${cabang}`))
      .map(([, v]) => v);

    const avgTotal = hakimScores.length
      ? hakimScores.reduce((s, v) => s + v.total, 0) / hakimScores.length
      : null;

    return { ...p, avgTotal, hakimCount: hakimScores.length, hakimScores };
  });

  // Sort: scored first (desc), then unscored
  aggregated.sort((a, b) => {
    if (a.avgTotal === null && b.avgTotal === null) return 0;
    if (a.avgTotal === null) return 1;
    if (b.avgTotal === null) return -1;
    return b.avgTotal - a.avgTotal;
  });

  // Update subtitle
  const scored = aggregated.filter(p => p.avgTotal !== null).length;
  document.getElementById('publicTableSubtitle').textContent =
    `${cabang} — ${scored}/${list.length} peserta dinilai`;

  // Podium
  renderPodium(aggregated.filter(p => p.avgTotal !== null));

  // Table
  const wrap = document.getElementById('publicResultTable');
  if (!list.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🧑</div><p>Belum ada peserta di cabang ini</p></div>';
    return;
  }

  wrap.innerHTML = `<table><thead><tr>
    <th>Peringkat</th><th>Nama Peserta</th><th>Kecamatan</th><th>Nilai Rata-rata</th><th>Jumlah Hakim</th><th>Status</th>
  </tr></thead><tbody>
  ${aggregated.map((p, i) => {
    const rank = p.avgTotal !== null ? (i + 1) : '-';
    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    return `<tr class="${rankClass}" onclick="toggleHakimDetail(this,'${p.id}','${cabang}')" style="cursor:pointer">
      <td class="rank-cell">${rank === '-' ? '—' : '#' + rank}</td>
      <td style="font-weight:700">${p.nama}</td>
      <td>${p.kecamatan}</td>
      <td>${p.avgTotal !== null ? `<span class="score-display" style="font-size:15px;padding:4px 12px">${p.avgTotal.toFixed(2)}</span>` : '<span class="text-muted">Belum Dinilai</span>'}</td>
      <td><span class="badge ${p.hakimCount ? 'badge-em' : 'badge-gray'}">${p.hakimCount} hakim</span></td>
      <td><span class="badge ${p.avgTotal !== null ? 'badge-em result-status-submitted' : 'result-status-pending badge-gray'}">${p.avgTotal !== null ? '✅ Dinilai' : '⏳ Menunggu'}</span></td>
    </tr>
    <tr class="detail-row" id="detail-${p.id.replace(/[^a-z0-9]/gi,'-')}-${cabang.replace(/[^a-z0-9]/gi,'-')}" style="display:none;background:var(--g50)">
      <td colspan="6" style="padding:12px 20px">
        ${p.hakimScores.length ? `
          <div style="font-size:12px;font-weight:700;color:var(--g500);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">Detail Nilai Per Hakim</div>
          ${p.hakimScores.map(hs => `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
              <div style="font-size:13px;font-weight:700;color:var(--g700);min-width:160px">${hs.hakimNama}</div>
              ${hs.params.map(pr => `<span class="badge badge-sky">${pr.nama}: ${pr.nilai}</span>`).join('')}
              <span class="badge badge-em">Total: ${Number(hs.total).toFixed(2)}</span>
              ${hs.catatan ? `<span style="font-size:11px;color:var(--g500);font-style:italic">"${hs.catatan}"</span>` : ''}
            </div>`).join('')}
        ` : '<div class="text-sm text-muted">Belum ada nilai dari dewan hakim</div>'}
      </td>
    </tr>`;
  }).join('')}
  </tbody></table>`;
}

function toggleHakimDetail(tr, pesertaId, cabang) {
  const safeId = pesertaId.replace(/[^a-z0-9]/gi,'-');
  const safeCabang = cabang.replace(/[^a-z0-9]/gi,'-');
  const detailRow = document.getElementById(`detail-${safeId}-${safeCabang}`);
  if (detailRow) detailRow.style.display = detailRow.style.display === 'none' ? 'table-row' : 'none';
}

function renderPodium(topList) {
  const el = document.getElementById('podiumSection');
  if (!topList.length) { el.innerHTML = ''; return; }
  const top3 = topList.slice(0, 3);
  if (top3.length < 1) { el.innerHTML = ''; return; }

  const medals = ['🥇','🥈','🥉'];
  const classes = ['podium-1','podium-2','podium-3'];
  const labels = ['Juara I','Juara II','Juara III'];

  // Reorder: 2nd, 1st, 3rd for visual podium
  const order = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
    ? [null, top3[0], top3[1]]
    : [null, top3[0], null];

  el.innerHTML = `<div class="podium-row">
    ${order.map((p, vi) => {
      if (!p) return '<div></div>';
      const actualRank = top3.indexOf(p);
      return `<div class="podium-card ${classes[actualRank]}">
        <div class="podium-medal">${medals[actualRank]}</div>
        <div class="podium-rank">${labels[actualRank]}</div>
        <div class="podium-name">${p.nama}</div>
        <div class="podium-kec">${p.kecamatan}</div>
        <div class="podium-score">${p.avgTotal.toFixed(2)}</div>
        <div style="font-size:11px;opacity:.6;margin-top:2px">${p.hakimCount} hakim</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ════════════════════════════════════════════════════════════════
//  UI UTILITIES
// ════════════════════════════════════════════════════════════════
function showOverlay(msg = 'Memproses...', sub = 'Mohon tunggu') {
  document.getElementById('overlayMsg').textContent = msg;
  document.getElementById('overlaySub').textContent = sub;
  document.getElementById('globalOverlay').classList.add('show');
}
function hideOverlay() { document.getElementById('globalOverlay').classList.remove('show'); }

function toast(title, msg, type = 'info', dur = 4000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div><button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, dur);
}

// ════════════════════════════════════════════════════════════════
//  API BRIDGE — kirim/ambil data dari Google Apps Script
//  Fallback otomatis ke localStorage jika API tidak tersedia
// ════════════════════════════════════════════════════════════════

/**
 * POST ke Apps Script dengan fallback localStorage
 * @param {string} action
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function apiPost(action, payload = {}) {
  if (!API_URL || API_URL.includes('YOUR_SCRIPT_ID')) {
    // Mode lokal — semua data di localStorage
    return handleLocalAction(action, payload);
  }
  try {
    const fd = new FormData();
    fd.append('action', action);
    fd.append('payload', JSON.stringify(payload));
    const resp = await fetch(API_URL, { method: 'POST', body: fd });
    const data = await resp.json();
    return data;
  } catch (e) {
    log.warn('[MTQ] API POST gagal, fallback localStorage:', e.message);
    return handleLocalAction(action, payload);
  }
}

/**
 * GET dari Apps Script dengan fallback localStorage
 */
async function apiGet(action, params = {}) {
  if (!API_URL || API_URL.includes('YOUR_SCRIPT_ID')) {
    return handleLocalAction(action, params);
  }
  try {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const resp = await fetch(`${API_URL}?${qs}`);
    const data = await resp.json();
    return data;
  } catch (e) {
    log.warn('[MTQ] API GET gagal, fallback localStorage:', e.message);
    return handleLocalAction(action, params);
  }
}

/**
 * Handler lokal untuk semua aksi — localStorage sebagai DB
 */
function handleLocalAction(action, payload) {
  switch (action) {
    case 'saveNilai': {
      S.scores[payload.key] = payload.data;
      store('nilai', S.scores);
      return { success: true };
    }
    case 'getNilai': {
      return { success: true, data: load('nilai', {}) };
    }
    case 'saveHakim': {
      const list = load('hakim', []);
      list.push(payload);
      store('hakim', list);
      return { success: true };
    }
    case 'getHakim': {
      return { success: true, data: load('hakim', []) };
    }
    case 'deleteHakim': {
      let list = load('hakim', []);
      list = list.filter(h => h.id !== payload.id);
      store('hakim', list);
      return { success: true };
    }
    case 'saveParam': {
      const params = load('params', {});
      params[payload.cabang] = payload.params;
      store('params', params);
      return { success: true };
    }
    case 'getParam': {
      return { success: true, data: load('params', {}) };
    }
    case 'savePeserta': {
      const pesertaAll = load('peserta', {});
      if (!pesertaAll[payload.cabang]) pesertaAll[payload.cabang] = [];
      pesertaAll[payload.cabang].push(payload.peserta);
      store('peserta', pesertaAll);
      return { success: true };
    }
    case 'getPeserta': {
      return { success: true, data: load('peserta', {}) };
    }
    case 'deletePeserta': {
      const pesertaAll = load('peserta', {});
      if (pesertaAll[payload.cabang]) {
        pesertaAll[payload.cabang] = pesertaAll[payload.cabang].filter((_, i) => i !== payload.idx);
      }
      store('peserta', pesertaAll);
      return { success: true };
    }
    case 'getStats': {
      const nilai = load('nilai', {});
      const peserta = load('peserta', {});
      const hakim = load('hakim', []);
      const totalPeserta = Object.values(peserta).reduce((s, arr) => s + arr.length, 0);
      const totalNilai = Object.keys(nilai).length;
      return {
        success: true,
        totalHakim: hakim.length,
        totalPeserta,
        totalNilaiSubmit: totalNilai
      };
    }
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// ════════════════════════════════════════════════════════════════
//  STATS BAR — inject ke halaman publik
// ════════════════════════════════════════════════════════════════
async function loadPublicStats() {
  const res = await apiGet('getStats');
  if (!res.success) return;

  const barEl = document.getElementById('publicStatsBar');
  if (!barEl) return;

  barEl.innerHTML = `
    <div class="stat-pill">
      <span class="stat-num">${res.totalHakim || 0}</span>
      <span class="stat-lbl">Dewan Hakim</span>
    </div>
    <div class="stat-sep">·</div>
    <div class="stat-pill">
      <span class="stat-num">${res.totalPeserta || 0}</span>
      <span class="stat-lbl">Total Peserta</span>
    </div>
    <div class="stat-sep">·</div>
    <div class="stat-pill">
      <span class="stat-num">${res.totalNilaiSubmit || 0}</span>
      <span class="stat-lbl">Nilai Disubmit</span>
    </div>
    <div class="stat-sep">·</div>
    <div class="stat-pill">
      <span class="stat-num" id="lastRefreshTime">Baru saja</span>
      <span class="stat-lbl">Diperbarui</span>
    </div>`;
}

function updateLastRefresh() {
  const el = document.getElementById('lastRefreshTime');
  if (el) el.textContent = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

// ════════════════════════════════════════════════════════════════
//  EXPORT CSV — rekap nilai ke CSV
// ════════════════════════════════════════════════════════════════
function exportCSV() {
  const cabangF = document.getElementById('rekapCabangFilter')?.value || '';
  const hakimList = load('hakim', []);
  const rows = [];

  rows.push(['Cabang','Nama Peserta','Kecamatan','Hakim Penilai','Parameter','Nilai Parameter','Bobot (%)','Total Nilai','Catatan','Waktu Submit']);

  Object.entries(S.scores).forEach(([key, data]) => {
    const parts = key.split('|||');
    if (parts.length < 3) return;
    const [hakimId, , cabang] = parts;
    if (cabangF && cabang !== cabangF) return;
    const hakim = hakimList.find(h => h.id === hakimId);

    (data.params || []).forEach(p => {
      rows.push([
        cabang,
        data.pesertaNama || '',
        data.pesertaKecamatan || '',
        hakim?.nama || hakimId,
        p.nama,
        p.nilai,
        p.bobot,
        Number(data.total).toFixed(2),
        data.catatan || '',
        data.submittedAt ? new Date(data.submittedAt).toLocaleString('id-ID') : ''
      ]);
    });
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap_nilai_mtq2026_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export Berhasil', 'File CSV berhasil diunduh', 'success');
}

// Export peringkat per cabang
function exportRankingCSV() {
  const cabang = publicActiveCabang;
  if (!cabang) { toast('', 'Pilih cabang terlebih dahulu', 'warning'); return; }

  const pesertaAll = load('peserta', {});
  const list = pesertaAll[cabang] || [];

  const aggregated = list.map(p => {
    const hakimScores = Object.entries(S.scores)
      .filter(([k]) => k.includes(`|||${p.id}|||${cabang}`))
      .map(([, v]) => v);
    const avgTotal = hakimScores.length
      ? hakimScores.reduce((s, v) => s + v.total, 0) / hakimScores.length
      : null;
    return { ...p, avgTotal, hakimCount: hakimScores.length };
  }).sort((a, b) => (b.avgTotal ?? -1) - (a.avgTotal ?? -1));

  const rows = [['Peringkat','Nama Peserta','Kecamatan','Nilai Rata-rata','Jumlah Hakim','Cabang']];
  aggregated.forEach((p, i) => {
    rows.push([
      p.avgTotal !== null ? i + 1 : '-',
      p.nama, p.kecamatan,
      p.avgTotal !== null ? Number(p.avgTotal).toFixed(2) : '-',
      p.hakimCount, cabang
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `peringkat_${cabang.replace(/[^a-z0-9]/gi,'_')}_mtq2026.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export Berhasil', `Peringkat ${cabang} berhasil diunduh`, 'success');
}

// ════════════════════════════════════════════════════════════════
//  SEARCH PESERTA — filter di halaman publik
// ════════════════════════════════════════════════════════════════
function filterPublicTable(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#publicResultTable tbody tr:not(.detail-row)').forEach(tr => {
    const text = tr.textContent.toLowerCase();
    tr.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

// ════════════════════════════════════════════════════════════════
//  KONFIRMASI MODAL — ganti native confirm()
// ════════════════════════════════════════════════════════════════
function showConfirm(title, msg, onConfirm, onCancel) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').innerHTML = msg;
  modal.classList.add('show');

  const btnOk  = document.getElementById('confirmOk');
  const btnCcl = document.getElementById('confirmCancel');

  const cleanup = () => {
    modal.classList.remove('show');
    btnOk.replaceWith(btnOk.cloneNode(true));
    btnCcl.replaceWith(btnCcl.cloneNode(true));
  };

  document.getElementById('confirmOk').addEventListener('click', () => { cleanup(); onConfirm?.(); }, { once: true });
  document.getElementById('confirmCancel').addEventListener('click', () => { cleanup(); onCancel?.(); }, { once: true });
}

// ════════════════════════════════════════════════════════════════
//  SINKRONISASI API — coba sinkron nilai ke GAS setiap submit
// ════════════════════════════════════════════════════════════════
async function syncNilaiToAPI(scoreKey, scoreData) {
  try {
    await apiPost('saveNilai', { key: scoreKey, data: scoreData });
  } catch(e) {
    // Sudah tersimpan di localStorage, sync gagal diam-diam
    log.warn('[MTQ] Sync API gagal:', e.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  PATCH: ganti confirm() native di fungsi submitNilai
//  dengan modal kustom
// ════════════════════════════════════════════════════════════════
// Override submitNilai agar pakai modal, bukan native confirm
const _origSubmit = submitNilai;
window.submitNilai = async function() {
  const pesertaAll = load('peserta', {});
  const list = pesertaAll[S.currentScoringCabang] || [];
  if (!list.length) { toast('', 'Tidak ada peserta', 'error'); return; }

  const peserta = list[S.currentPesertaIdx];
  const params  = (load('params', {}))[S.currentScoringCabang] || [];
  const rows    = document.querySelectorAll('.param-score-row');
  if (!rows.length) { toast('', 'Parameter belum dikonfigurasi', 'error'); return; }

  const paramVals = Array.from(rows).map((row, i) => ({
    nama: params[i]?.nama,
    bobot: params[i]?.bobot,
    nilai: parseFloat(row.querySelector('.param-score-input').value) || 0
  }));

  const total = calcTotal();
  const catatan = document.getElementById('catatanHakim').value.trim();

  const scoreKey = `${S.hakimSession.id}|||${peserta.id}|||${S.currentScoringCabang}`;

  // Validasi — semua parameter harus diisi (> 0 wajib diisi secara sadar)
  const allZero = paramVals.every(p => p.nilai === 0);
  if (allZero) {
    toast('Nilai Masih 0', 'Pastikan Anda sudah mengisi nilai setiap parameter sebelum submit', 'warning');
    return;
  }

  showConfirm(
    '✅ Konfirmasi Submit Nilai',
    `<div style="margin-bottom:10px"><strong>${peserta.nama}</strong><br><span style="color:var(--g500);font-size:12px">${S.currentScoringCabang}</span></div>
     <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
       ${paramVals.map(p => `<div style="display:flex;justify-content:space-between;font-size:13px"><span>${p.nama}</span><strong>${p.nilai}</strong></div>`).join('')}
     </div>
     <div style="background:var(--em-xs);border-radius:8px;padding:10px;text-align:center">
       <div style="font-size:11px;color:var(--g500)">Total Nilai</div>
       <div style="font-size:24px;font-weight:800;color:var(--em);font-family:var(--font-mono)">${total.toFixed(2)}</div>
     </div>
     <p style="font-size:12px;color:var(--ruby);margin-top:10px;text-align:center">⚠️ Nilai tidak dapat diubah setelah disubmit.</p>`,
    async () => {
      showOverlay('Menyimpan nilai...', 'Mohon tunggu sebentar');
      await new Promise(r => setTimeout(r, 600));

      // Handle bukti upload (base64 jika ada)
      let buktiData = null;
      const buktiFile = document.getElementById('buktiInput').files[0];
      if (buktiFile) {
        try {
          buktiData = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res({ name: buktiFile.name, size: buktiFile.size, type: buktiFile.type, base64: reader.result.split(',')[1] });
            reader.onerror = rej;
            reader.readAsDataURL(buktiFile);
          });
        } catch(e) { buktiData = null; }
      }

      const scoreData = {
        hakimId: S.hakimSession.id,
        hakimNama: S.hakimSession.nama,
        pesertaId: peserta.id,
        pesertaNama: peserta.nama,
        pesertaKecamatan: peserta.kecamatan,
        cabang: S.currentScoringCabang,
        params: paramVals,
        total,
        catatan,
        bukti: buktiData ? { name: buktiData.name, size: buktiData.size } : null,
        submittedAt: new Date().toISOString()
      };

      S.scores[scoreKey] = scoreData;
      store('nilai', S.scores);

      // Coba sync ke API (fire & forget)
      syncNilaiToAPI(scoreKey, scoreData);

      hideOverlay();
      toast('✅ Nilai Tersimpan!', `${peserta.nama} — Total: ${total.toFixed(2)}`, 'success');
      loadScoringPeserta();
      updateProgressBar();

      // Auto-advance ke peserta berikutnya yang belum dinilai
      const nextUnscored = list.findIndex((p, i) => {
        if (i <= S.currentPesertaIdx) return false;
        const k = `${S.hakimSession.id}|||${p.id}|||${S.currentScoringCabang}`;
        return !S.scores[k];
      });
      if (nextUnscored !== -1) {
        setTimeout(() => { S.currentPesertaIdx = nextUnscored; loadScoringPeserta(); }, 1400);
      }
    }
  );
};

// ════════════════════════════════════════════════════════════════
//  PROGRESS BAR — berapa peserta sudah dinilai (per hakim per cabang)
// ════════════════════════════════════════════════════════════════
function updateProgressBar() {
  if (!S.hakimSession || !S.currentScoringCabang) return;
  const pesertaAll = load('peserta', {});
  const list = pesertaAll[S.currentScoringCabang] || [];
  if (!list.length) return;

  const done = list.filter(p => {
    const k = `${S.hakimSession.id}|||${p.id}|||${S.currentScoringCabang}`;
    return !!S.scores[k];
  }).length;

  const pct = Math.round((done / list.length) * 100);
  const el = document.getElementById('hakimProgressBar');
  const lbl = document.getElementById('hakimProgressLabel');
  if (el) {
    el.style.width = pct + '%';
    el.setAttribute('aria-valuenow', pct);
  }
  if (lbl) lbl.textContent = `${done}/${list.length} peserta dinilai (${pct}%)`;
}

// ════════════════════════════════════════════════════════════════
//  PATCH: onCabangPickerChange — inject progress bar setelah load
// ════════════════════════════════════════════════════════════════
const _origCabangChange = onCabangPickerChange;
window.onCabangPickerChange = function() {
  S.currentScoringCabang = document.getElementById('scoringCabangPicker').value;
  S.currentPesertaIdx = 0;
  document.getElementById('scoringCabangLabel').textContent = S.currentScoringCabang;
  loadScoringPeserta();
  updateProgressBar();
  injectProgressBar();
};

function injectProgressBar() {
  if (document.getElementById('hakimProgressWrap')) return; // already injected
  const selector = document.getElementById('pesertaSelector');
  if (!selector) return;

  const wrap = document.createElement('div');
  wrap.id = 'hakimProgressWrap';
  wrap.style.cssText = 'margin-bottom:16px';
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
      <span style="font-size:11px;font-weight:700;color:var(--g500);text-transform:uppercase;letter-spacing:.4px">Progress Penilaian</span>
      <span id="hakimProgressLabel" style="font-size:12px;font-weight:700;color:var(--em)">0/0 peserta dinilai</span>
    </div>
    <div style="height:8px;background:var(--g200);border-radius:999px;overflow:hidden">
      <div id="hakimProgressBar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"
        style="height:100%;width:0%;background:linear-gradient(90deg,var(--em),var(--em-lt));border-radius:999px;transition:width .5s ease"></div>
    </div>`;
  selector.insertAdjacentElement('beforebegin', wrap);
}

// ════════════════════════════════════════════════════════════════
//  PATCH: switchView_scoring — inject progress bar on first load
// ════════════════════════════════════════════════════════════════
const _origSwitchScoring = switchView_scoring;
window.switchView_scoring = function() {
  document.getElementById('hakimLoginScreen').classList.add('hidden');
  document.getElementById('hakimScoringScreen').classList.remove('hidden');

  const hakim = S.hakimSession;
  document.getElementById('scoringHakimName').textContent = hakim.nama;

  const picker = document.getElementById('scoringCabangPicker');
  picker.innerHTML = hakim.cabang.map(c => `<option value="${c}">${c}</option>`).join('');
  S.currentScoringCabang = hakim.cabang[0];

  document.getElementById('scoringCabangLabel').textContent = S.currentScoringCabang;
  loadScoringPeserta();

  setTimeout(() => {
    injectProgressBar();
    updateProgressBar();
  }, 100);
};

// ════════════════════════════════════════════════════════════════
//  PATCH: initPublicView — inject stats bar & search & export btn
// ════════════════════════════════════════════════════════════════
const _origInitPublic = initPublicView;
window.initPublicView = function() {
  // Inject stats bar jika belum ada
  if (!document.getElementById('publicStatsBar')) {
    const header = document.querySelector('.results-header');
    if (header) {
      const bar = document.createElement('div');
      bar.id = 'publicStatsBar';
      bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:16px;position:relative';
      bar.innerHTML = '<span style="font-size:12px;color:rgba(255,255,255,.5)">Memuat statistik...</span>';
      header.appendChild(bar);
      loadPublicStats().then(updateLastRefresh);
    }
  }

  // Inject search + export di atas tabel
  if (!document.getElementById('publicSearchWrap')) {
    const tableCard = document.querySelector('#publicResultTable')?.closest('.card');
    if (tableCard) {
      const searchWrap = document.createElement('div');
      searchWrap.id = 'publicSearchWrap';
      searchWrap.style.cssText = 'display:flex;gap:10px;align-items:center;padding:16px 20px;border-bottom:1px solid var(--g200);flex-wrap:wrap';
      searchWrap.innerHTML = `
        <input type="search" id="publicSearchInput" placeholder="🔍 Cari nama peserta atau kecamatan..."
          oninput="filterPublicTable(this.value)"
          style="flex:1;min-width:200px;padding:9px 14px;border:1.5px solid var(--g200);border-radius:8px;font-size:13px;background:var(--white);color:var(--g800);outline:none;transition:border-color .2s"
          onfocus="this.style.borderColor='var(--em-lt)'" onblur="this.style.borderColor='var(--g200)'">
        <button class="btn btn-outline btn-sm" onclick="exportRankingCSV()" title="Download peringkat sebagai CSV">
          ⬇️ Export CSV
        </button>`;
      tableCard.querySelector('.card-head').insertAdjacentElement('afterend', searchWrap);
    }
  }

  // Run original
  _origInitPublic();
};

// ════════════════════════════════════════════════════════════════
//  PATCH: refreshPublicResults — juga update stats bar
// ════════════════════════════════════════════════════════════════
const _origRefresh = refreshPublicResults;
window.refreshPublicResults = function() {
  S.scores = load('nilai', {});
  if (publicActiveCabang) renderPublicResults(publicActiveCabang);
  _origInitPublic();
  loadPublicStats().then(updateLastRefresh);
};

// ════════════════════════════════════════════════════════════════
//  PATCH: rekap tab — tambah tombol Export CSV
// ════════════════════════════════════════════════════════════════
const _origAdminTab = adminTab;
window.adminTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`#admin-tab-${tab}`)?.classList.add('active');
  event.target.classList.add('active');

  if (tab === 'rekap') {
    loadRekapTable();
    populateRekapFilters();
    // Inject export button jika belum ada
    if (!document.getElementById('rekapExportBtn')) {
      const rekapHead = document.querySelector('#admin-tab-rekap .card-head');
      if (rekapHead) {
        const btn = document.createElement('button');
        btn.id = 'rekapExportBtn';
        btn.className = 'btn btn-outline btn-sm';
        btn.style.marginLeft = 'auto';
        btn.innerHTML = '⬇️ Export CSV';
        btn.onclick = exportCSV;
        rekapHead.appendChild(btn);
      }
    }
  }
  if (tab === 'peserta') loadPesertaTable();
};

// ════════════════════════════════════════════════════════════════
//  INJECT: Stats CSS untuk results header
// ════════════════════════════════════════════════════════════════
(function injectStatsCSS() {
  const style = document.createElement('style');
  style.textContent = `
    .stat-pill { display:flex; flex-direction:column; align-items:center }
    .stat-num { font-family:var(--font-mono); font-size:18px; font-weight:800; color:#fff }
    .stat-lbl { font-size:10px; color:rgba(255,255,255,.6); font-weight:600; text-transform:uppercase; letter-spacing:.5px }
    .stat-sep { color:rgba(255,255,255,.25); font-size:20px; font-weight:300 }

    /* Confirm modal */
    #confirmModal {
      position:fixed; inset:0; background:rgba(10,24,34,.6); backdrop-filter:blur(5px);
      z-index:1000; display:none; align-items:center; justify-content:center; padding:20px;
    }
    #confirmModal.show { display:flex; animation:fadeSlide .25s ease }
    .confirm-box {
      background:var(--white); border-radius:var(--r-xl); padding:28px 24px;
      max-width:380px; width:100%; box-shadow:var(--sh-lg);
    }
    #confirmTitle {
      font-size:16px; font-weight:800; color:var(--g800); margin-bottom:14px;
    }
    #confirmMsg { font-size:14px; color:var(--g700); margin-bottom:20px; line-height:1.6 }
    .confirm-actions { display:flex; gap:10px }
    .confirm-actions .btn { flex:1 }

    /* Peringkat #1 glow */
    .rank-1 td { background:linear-gradient(90deg,rgba(245,158,11,.05),transparent) }
    .podium-card { transition:transform .2s, box-shadow .2s }
    .podium-card:hover { transform:translateY(-4px); box-shadow:var(--sh-lg) }

    /* Mobile scoring fullscreen feel */
    @media(max-width:600px) {
      .pin-box { width:44px; height:52px; font-size:20px }
      .param-score-slider { min-width:80px }
    }
  `;
  document.head.appendChild(style);
})();

// ════════════════════════════════════════════════════════════════
//  INJECT: Confirm Modal HTML
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.innerHTML = `
    <div class="confirm-box">
      <div id="confirmTitle">Konfirmasi</div>
      <div id="confirmMsg"></div>
      <div class="confirm-actions">
        <button class="btn btn-outline" id="confirmCancel">Batal</button>
        <button class="btn btn-em" id="confirmOk">✅ Ya, Submit</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
});

// ════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUT — ESC tutup modal
// ════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('confirmModal')?.classList.remove('show');
    hideOverlay();
  }
  // Admin shortcut: Ctrl+Shift+A buka admin
  if (e.ctrlKey && e.shiftKey && e.key === 'A') switchView('admin');
});