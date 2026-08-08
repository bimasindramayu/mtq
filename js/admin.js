// ============================================================
//  MTQ 2026 – daftar.js  (complete rewrite)
//  Handles individu + team, age validation per member
// ============================================================

// API_URL: satu sumber dari js/config.js (window.MTQ_API_URL) — jangan ubah di sini
const API_URL = window.MTQ_API_URL || '';

// ── State ─────────────────────────────────────────────────────
const state = {
  step       : 1,
  config     : [],
  selected   : null,    // { cabang_lomba, golongan, tipe, umur_min, umur_max, kuota }
  kecamatan  : '',
  namaTim    : '',
  members    : [],      // [{ id, data:{}, files:{photo,ktp} }]
  rekomFile  : null,
  submitting : false,
  result     : null,
};

// ── 31 Kecamatan Indramayu (for filter dropdowns) ─────────────
const KEC_INDRAMAYU = [
  'Anjatan','Arahan','Balongan','Bangodua','Bongas','Cantigi','Cikedung',
  'Gabuswetan','Gantar','Haurgeulis','Indramayu','Jatibarang','Juntinyuat',
  'Kandanghaur','Karangampel','Kedokan Bunder','Kertasemaya','Krangkeng',
  'Kroya','Lelea','Lohbener','Losarang','Patrol','Pasekan','Sindang',
  'Sliyeg','Sukagumiwang','Sukra','Terisi','Tukdana','Widasari'
];

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initDarkMode();
  loadConfig();
  bindStep1();
  setupRekomUpload();
});

// ── Load CONFIG from Apps Script ──────────────────────────────
async function loadConfig() {
  const cabangSel = document.getElementById('s1_cabang');
  cabangSel.innerHTML = '<option value="">Memuat data...</option>';
  cabangSel.disabled = true;

  try {
    const res  = await fetch(`${API_URL}?action=getConfig`);
    const data = await res.json();
    if (data.success && data.config) {
      state.config = data.config;
    } else throw new Error('config empty');
  } catch {
    // Fallback config
    state.config = [
      // Tartil
      { cabang_lomba:"Tartil Al Qur'an Putra", tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:12, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:"Tartil Al Qur'an Putri", tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:12, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Tilawah
      { cabang_lomba:'Tilawah Anak-anak Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:14, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Tilawah Anak-anak Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:14, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Tilawah Remaja Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:24, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Tilawah Remaja Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:24, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Tilawah Dewasa Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Tilawah Dewasa Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Qira'at
      { cabang_lomba:"Qira'at Mujawwad Putra", tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:"Qira'at Mujawwad Putri", tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:40, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Hafalan
      { cabang_lomba:'Hafalan 1 Juz dan Tilawah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:15, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Hafalan 1 Juz dan Tilawah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:15, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Hafalan 5 Juz dan Tilawah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Hafalan 5 Juz dan Tilawah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Hafalan 10 Juz Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Hafalan 10 Juz Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:20, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Tafsir
      { cabang_lomba:'Tafsir Bahasa Indonesia Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Tafsir Bahasa Indonesia Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Kaligrafi
      { cabang_lomba:'Kaligrafi Naskah Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Kaligrafi Naskah Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Kaligrafi Hiasan Mushaf Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Kaligrafi Hiasan Mushaf Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:'Kaligrafi Dekorasi Putra', tipe:'individu', gender:'L', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:'Kaligrafi Dekorasi Putri', tipe:'individu', gender:'P', umur_min:0, umur_max_tahun:34, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      // Tim
      { cabang_lomba:"Fahm Al Qur'an Putra", tipe:'team', gender:'L', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:"Fahm Al Qur'an Putri", tipe:'team', gender:'P', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },

      { cabang_lomba:"Syarh Al Qur'an Putra", tipe:'team', gender:'L', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' },
      { cabang_lomba:"Syarh Al Qur'an Putri", tipe:'team', gender:'P', umur_min:0, umur_max_tahun:18, umur_max_bulan:11, umur_max_hari:29, kuota:31, status_aktif:'Aktif' }
    ];
    showToast('Peringatan','Menggunakan data default (server tidak terjangkau)','warning');
  }

  populateCabangSelect();
  cabangSel.disabled = false;
}

function populateCabangSelect() {
  const sel    = document.getElementById('s1_cabang');
  const cabangs = [...new Set(state.config.map(c => c.cabang_lomba))];
  sel.innerHTML = '<option value="">-- Pilih Cabang Lomba --</option>';
  cabangs.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
}

// ── Step 1 Bindings ───────────────────────────────────────────
function bindStep1() {
  document.getElementById('s1_cabang')?.addEventListener('change', onCabangChange);
  document.getElementById('s1_golongan')?.addEventListener('change', onGolonganChange);
}

function onCabangChange() {
  const cabang  = document.getElementById('s1_cabang').value;
  const golSel  = document.getElementById('s1_golongan');
  golSel.innerHTML = '<option value="">-- Pilih Golongan --</option>';
  document.getElementById('tipeBox').style.display    = 'none';
  document.getElementById('namaTimBox').style.display = 'none';
  document.getElementById('ageRuleBox').style.display = 'none';
  document.getElementById('quotaBadge').textContent   = '';
  state.selected = null;

  if (!cabang) return;
  const filtered = state.config.filter(c => c.cabang_lomba === cabang);
  filtered.forEach(c => {
    const o = document.createElement('option');
    o.value = c.golongan;
    o.textContent = `${c.golongan} (Usia ${c.umur_min}–${c.umur_max} thn, ${c.tipe})`;
    golSel.appendChild(o);
  });
}

function onGolonganChange() {
  const cabang  = document.getElementById('s1_cabang').value;
  const golongan = document.getElementById('s1_golongan').value;
  if (!cabang || !golongan) return;

  const cfg = state.config.find(c => c.cabang_lomba === cabang && c.golongan === golongan);
  if (!cfg) return;
  state.selected = cfg;

  // Show tipe badge
  const tipeBox   = document.getElementById('tipeBox');
  const tipeBadge = document.getElementById('tipeBadge');
  const tipeDesc  = document.getElementById('tipeDesc');
  tipeBox.style.display = 'flex';

  if (cfg.tipe === 'team') {
    tipeBadge.className  = 'tipe-badge team';
    tipeBadge.textContent = '👥 Tim';
    tipeDesc.textContent  = 'Pendaftaran tim: minimal 2, maksimal 3 anggota. Setiap anggota wajib memenuhi syarat usia.';
    document.getElementById('namaTimBox').style.display = 'block';
  } else {
    tipeBadge.className  = 'tipe-badge individu';
    tipeBadge.textContent = '👤 Individu';
    tipeDesc.textContent  = 'Pendaftaran perorangan.';
    document.getElementById('namaTimBox').style.display = 'none';
  }

  // Show age rule
  document.getElementById('ageRuleBox').style.display = 'block';
  document.getElementById('ageRuleText').textContent  =
    `Syarat usia untuk ${golongan}: ${cfg.umur_min} – ${cfg.umur_max} tahun`;

  checkQuota(cabang, golongan, cfg.kuota);
}

async function checkQuota(cabang, golongan, maxKuota) {
  const badge = document.getElementById('quotaBadge');
  badge.textContent = '⏳';
  badge.className   = 'quota-badge';
  try {
    const res  = await fetch(`${API_URL}?action=getQuota&cabang=${encodeURIComponent(cabang)}&golongan=${encodeURIComponent(golongan)}`);
    const data = await res.json();
    const sisa = maxKuota - (data.count || 0);
    if (sisa <= 0) {
      badge.textContent = '🚫 Penuh';  badge.className = 'quota-badge full';
    } else if (sisa <= 5) {
      badge.textContent = `⚠️ Sisa ${sisa}`;  badge.className = 'quota-badge warn';
    } else {
      badge.textContent = `✅ Sisa ${sisa}`;  badge.className = 'quota-badge ok';
    }
  } catch {
    badge.textContent = '';
  }
}

// ── Step 1 → Step 2 ───────────────────────────────────────────
function goToStep2() {
  const kec    = document.getElementById('s1_kecamatan').value;
  const cabang = document.getElementById('s1_cabang').value;
  const gol    = document.getElementById('s1_golongan').value;

  if (!kec)    { showFieldErr(document.getElementById('s1_kecamatan'),'Pilih kecamatan'); return; }
  if (!cabang) { showFieldErr(document.getElementById('s1_cabang'),'Pilih cabang lomba'); return; }
  if (!gol)    { showFieldErr(document.getElementById('s1_golongan'),'Pilih golongan'); return; }
  if (!state.selected) return;

  // Quota full check
  if (document.getElementById('quotaBadge')?.classList.contains('full')) {
    showToast('Kuota Penuh','Kuota untuk cabang dan golongan ini sudah habis.','error'); return;
  }

  if (state.selected.tipe === 'team') {
    const namaTim = document.getElementById('s1_namatim')?.value?.trim();
    if (!namaTim) { showFieldErr(document.getElementById('s1_namatim'),'Nama tim wajib diisi'); return; }
    state.namaTim = namaTim;
  }

  state.kecamatan = kec;

  // Init members
  if (state.selected.tipe === 'team') {
    // Minimal 2 anggota untuk team
    state.members = [createMember(1), createMember(2)];
  } else {
    state.members = [createMember(1)];
  }

  buildStep2UI();
  renderStep(2);
}

function createMember(id) {
  return { id, data: {}, files: { photo: null, ktp: null } };
}

// ── Build Step 2 UI ───────────────────────────────────────────
function buildStep2UI() {
  const isTeam = state.selected?.tipe === 'team';

  // Title
  document.getElementById('step2Title').textContent    = isTeam ? 'Data Tim & Anggota' : 'Data Peserta';
  document.getElementById('step2Subtitle').textContent = isTeam
    ? `Tim: ${state.namaTim} — Isi data setiap anggota (minimal 2, maksimal 3 orang)`
    : 'Isi data diri dengan benar sesuai identitas resmi';

  // Summary bar
  const summaryBar = document.getElementById('teamSummaryBar');
  summaryBar.classList.toggle('hidden', !isTeam);
  if (isTeam) updateTeamSummary();

  // Add member button
  const addBtn = document.getElementById('addMemberBtn');
  addBtn.classList.toggle('hidden', !isTeam);

  renderMemberForms();
}

function updateTeamSummary() {
  const txt  = document.getElementById('teamSummaryText');
  const n    = state.members.length;
  const min2 = n >= 2;
  const max3 = n < 3;
  txt.textContent = `👥 Anggota tim: ${n} orang (min. 2, maks. 3) • Tim: ${state.namaTim}`;
  document.getElementById('addMemberBtn').disabled = !max3;
}

// ── Render all member data forms ──────────────────────────────
function renderMemberForms() {
  const container = document.getElementById('memberFormsContainer');
  container.innerHTML = state.members.map((m, i) => memberFormHTML(m, i)).join('');
  state.members.forEach(m => bindMemberInputs(m.id));
}

function memberFormHTML(member, index) {
  const isTeam  = state.selected?.tipe === 'team';
  const isFirst = index === 0;
  const label   = isTeam
    ? (isFirst ? `Anggota 1 (Ketua)` : `Anggota ${index + 1}`)
    : 'Data Peserta';
  const badgeCls = isFirst && isTeam ? 'ketua' : '';

  return `
  <div class="member-card" id="memberCard${member.id}">
    <div class="member-card-header">
      <div class="member-num">
        <div class="member-num-badge ${badgeCls}">${index + 1}</div>
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--gray-800)">${label}</div>
          <div class="member-name-preview" id="namePreview${member.id}">Belum diisi</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="member-age-tag" id="ageTag${member.id}"></span>
        ${isTeam && !isFirst
          ? `<button type="button" class="btn-remove-member" onclick="removeMember(${member.id})">✕ Hapus</button>`
          : ''}
      </div>
    </div>
    <div class="member-card-body">
      <div class="form-grid">
        <div class="field-group full">
          <label class="field-label">Nama Lengkap <span class="req">*</span></label>
          <input type="text" class="field-input m-input" data-mid="${member.id}" data-field="nama_lengkap"
            placeholder="Nama sesuai identitas resmi" value="${member.data.nama_lengkap||''}">
          <div class="field-error"></div>
        </div>
        <div class="field-group">
          <label class="field-label">NIK <span class="req">*</span></label>
          <input type="text" class="field-input m-input" data-mid="${member.id}" data-field="nik"
            placeholder="16 digit NIK" maxlength="16" value="${member.data.nik||''}">
          <div class="field-error"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Tanggal Lahir <span class="req">*</span></label>
          <input type="date" class="field-input m-input" data-mid="${member.id}" data-field="tanggal_lahir"
            max="2026-01-01" value="${member.data.tanggal_lahir||''}">
          <div class="field-error" id="ageErr${member.id}"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Tempat Lahir <span class="req">*</span></label>
          <input type="text" class="field-input m-input" data-mid="${member.id}" data-field="tempat_lahir"
            placeholder="Kota tempat lahir" value="${member.data.tempat_lahir||''}">
          <div class="field-error"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Jenis Kelamin <span class="req">*</span></label>
          <select class="field-select m-input" data-mid="${member.id}" data-field="jenis_kelamin">
            <option value="">-- Pilih --</option>
            <option ${member.data.jenis_kelamin==='Laki-laki'?'selected':''}>Laki-laki</option>
            <option ${member.data.jenis_kelamin==='Perempuan'?'selected':''}>Perempuan</option>
          </select>
          <div class="field-error"></div>
        </div>
        <div class="field-group">
          <label class="field-label">No. WhatsApp <span class="req">*</span></label>
          <input type="tel" class="field-input m-input" data-mid="${member.id}" data-field="no_hp"
            placeholder="08xxxxxxxxxx" value="${member.data.no_hp||''}">
          <div class="field-error"></div>
        </div>
        <div class="field-group">
          <label class="field-label">Email <span class="req">*</span></label>
          <input type="email" class="field-input m-input" data-mid="${member.id}" data-field="email"
            placeholder="email@domain.com" value="${member.data.email||''}">
          <div class="field-error"></div>
        </div>
        <div class="field-group full">
          <label class="field-label">Alamat Lengkap <span class="req">*</span></label>
          <textarea class="field-textarea m-input" data-mid="${member.id}" data-field="alamat"
            placeholder="RT/RW, Desa, Kecamatan, Kab. Indramayu">${member.data.alamat||''}</textarea>
          <div class="field-error"></div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Bind member inputs ────────────────────────────────────────
function bindMemberInputs(memberId) {
  document.querySelectorAll(`.m-input[data-mid="${memberId}"]`).forEach(input => {
    const field = input.dataset.field;
    input.addEventListener('input', () => {
      const m = getMember(memberId);
      if (!m) return;
      m.data[field] = input.value;
      // Update name preview
      if (field === 'nama_lengkap') {
        const el = document.getElementById(`namePreview${memberId}`);
        if (el) el.textContent = input.value || 'Belum diisi';
      }
      // Age validation on dob change
      if (field === 'tanggal_lahir') validateMemberAge(memberId);
      // Clear error
      clearErr(input);
    });
    input.addEventListener('change', () => {
      const m = getMember(memberId);
      if (m) m.data[field] = input.value;
      if (field === 'tanggal_lahir') validateMemberAge(memberId);
    });
  });
}

function getMember(id) {
  return state.members.find(m => m.id === id);
}

// ── Age Validation per Member ─────────────────────────────────
function validateMemberAge(memberId) {
  const m = getMember(memberId);
  if (!m || !state.selected) return;

  const dob = m.data.tanggal_lahir;
  if (!dob) return;

  const age    = calcAge(dob);
  const { umur_min, umur_max } = state.selected;
  const tag    = document.getElementById(`ageTag${memberId}`);
  const errEl  = document.getElementById(`ageErr${memberId}`);
  const card   = document.getElementById(`memberCard${memberId}`);

  m.data.umur = age;

  if (age < umur_min || age > umur_max) {
    tag.textContent = `⚠️ ${age} thn`;
    tag.className   = 'member-age-tag err';
    errEl.textContent = `❌ Usia ${age} tahun tidak sesuai (syarat: ${umur_min}–${umur_max} tahun)`;
    errEl.classList.add('show');
    card?.classList.add('error-card');
  } else {
    tag.textContent = `✅ ${age} thn`;
    tag.className   = 'member-age-tag ok';
    errEl.classList.remove('show');
    errEl.textContent = '';
    card?.classList.remove('error-card');
  }
}

function calcAge(dobStr) {
  const dob = new Date(dobStr);
  const now = new Date();
  let age   = now.getFullYear() - dob.getFullYear();
  const m   = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

// ── Add / Remove Team Member ──────────────────────────────────
function addMember() {
  if (state.members.length >= 3) return;
  const nextId = Math.max(...state.members.map(m => m.id)) + 1;
  state.members.push(createMember(nextId));
  renderMemberForms();
  updateTeamSummary();
  buildStep3Uploads(); // rebuild step3 if already rendered
}

function removeMember(memberId) {
  if (state.members.length <= 2) {
    showToast('Minimal 2 Anggota','Tim harus memiliki minimal 2 anggota.','warning'); return;
  }
  state.members = state.members.filter(m => m.id !== memberId);
  renderMemberForms();
  updateTeamSummary();
  buildStep3Uploads();
}

// ── Step 2 → Step 3 ───────────────────────────────────────────
function goToStep3() {
  if (!validateStep2()) return;
  buildStep3Uploads();
  renderStep(3);
}

function validateStep2() {
  let ok = true;
  const requiredFields = ['nama_lengkap','nik','tanggal_lahir','tempat_lahir','jenis_kelamin','no_hp','email','alamat'];

  for (const m of state.members) {
    // Validate age first
    if (m.data.tanggal_lahir) validateMemberAge(m.id);

    for (const field of requiredFields) {
      const input = document.querySelector(`.m-input[data-mid="${m.id}"][data-field="${field}"]`);
      if (!input) continue;
      const val = input.value.trim();
      if (!val) {
        showErr(input, 'Wajib diisi');
        ok = false;
      }
    }

    // NIK length
    const nikInput = document.querySelector(`.m-input[data-mid="${m.id}"][data-field="nik"]`);
    if (nikInput && nikInput.value && nikInput.value.length !== 16) {
      showErr(nikInput, 'NIK harus 16 digit');
      ok = false;
    }

    // Age validity
    if (m.data.tanggal_lahir && state.selected) {
      const age = calcAge(m.data.tanggal_lahir);
      if (age < state.selected.umur_min || age > state.selected.umur_max) {
        ok = false;
      }
    }
  }

  if (!ok) {
    showToast('Data Tidak Lengkap','Mohon lengkapi semua kolom dan pastikan usia sesuai syarat.','warning');
  }

  // Team minimum check
  if (state.selected?.tipe === 'team' && state.members.length < 2) {
    showToast('Kurang Anggota','Tim harus memiliki minimal 2 anggota.','error');
    return false;
  }

  return ok;
}

// ── Build Step 3 Upload Sections ──────────────────────────────
function buildStep3Uploads() {
  const container = document.getElementById('memberUploadsContainer');
  container.innerHTML = state.members.map((m, i) => memberUploadHTML(m, i)).join('');
  state.members.forEach(m => setupMemberUploads(m.id));
}

function memberUploadHTML(member, index) {
  const name  = member.data.nama_lengkap || `Anggota ${index + 1}`;
  const label = state.selected?.tipe === 'team'
    ? (index === 0 ? `Anggota 1 – Ketua (${name})` : `Anggota ${index + 1} (${name})`)
    : `Peserta: ${name}`;

  return `
  <div class="upload-member-section">
    <div class="upload-member-title">
      <span style="font-size:20px">${index === 0 && state.selected?.tipe === 'team' ? '👑' : '👤'}</span>
      <div>
        <div>${label}</div>
        <div style="font-size:12px;font-weight:400;color:var(--gray-400)">Upload pas foto dan KTP/KK/KIA</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- Pas Foto -->
      <div class="field-group">
        <label class="field-label">Pas Foto <span class="req">*</span></label>
        <div class="upload-zone" id="photoZone${member.id}">
          <input type="file" accept="image/jpeg,image/png" id="photoInput${member.id}">
          <div class="upload-icon">📷</div>
          <h4 style="font-size:13px">Upload Pas Foto</h4>
          <p>JPG/PNG — Maks. 2 MB</p>
        </div>
        <div class="upload-preview" id="photoPreview${member.id}">
          <span class="file-icon">🖼️</span>
          <span class="file-name"></span>
          <span class="file-size"></span>
          <button type="button" class="remove-file" onclick="removeMemberFile(${member.id},'photo')">✕</button>
        </div>
      </div>

      <!-- KTP/KK/KIA -->
      <div class="field-group">
        <label class="field-label">KTP / KK / KIA <span class="req">*</span></label>
        <div class="upload-zone" id="ktpZone${member.id}">
          <input type="file" accept="image/jpeg,image/png,application/pdf" id="ktpInput${member.id}">
          <div class="upload-icon">🪪</div>
          <h4 style="font-size:13px">Upload KTP/KK/KIA</h4>
          <p>JPG/PNG/PDF — Maks. 2 MB</p>
        </div>
        <div class="upload-preview" id="ktpPreview${member.id}">
          <span class="file-icon">📄</span>
          <span class="file-name"></span>
          <span class="file-size"></span>
          <button type="button" class="remove-file" onclick="removeMemberFile(${member.id},'ktp')">✕</button>
        </div>
      </div>

    </div>
  </div>`;
}

function setupMemberUploads(memberId) {
  setupFileInput(`photoInput${memberId}`, `photoZone${memberId}`, `photoPreview${memberId}`,
    memberId, 'photo', ['image/jpeg','image/png']);
  setupFileInput(`ktpInput${memberId}`, `ktpZone${memberId}`, `ktpPreview${memberId}`,
    memberId, 'ktp', ['image/jpeg','image/png','application/pdf']);
}

function setupFileInput(inputId, zoneId, previewId, memberId, fileKey, allowedTypes) {
  const input   = document.getElementById(inputId);
  const zone    = document.getElementById(zoneId);
  const preview = document.getElementById(previewId);
  if (!input || !zone) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) handleMemberFile(file, memberId, fileKey, zone, preview, allowedTypes);
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleMemberFile(file, memberId, fileKey, zone, preview, allowedTypes);
  });
}

function handleMemberFile(file, memberId, fileKey, zone, preview, allowedTypes) {
  if (!allowedTypes.includes(file.type)) {
    showToast('Format Salah', `Format harus: ${allowedTypes.map(t=>t.split('/')[1].toUpperCase()).join(', ')}`, 'error');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('File Terlalu Besar', 'Maksimal 2 MB per file', 'error'); return;
  }
  const m = getMember(memberId);
  if (!m) return;
  m.files[fileKey] = file;
  zone.classList.add('has-file');
  preview?.querySelector('.file-name') && (preview.querySelector('.file-name').textContent = file.name);
  preview?.querySelector('.file-size') && (preview.querySelector('.file-size').textContent = fmtSize(file.size));
  preview?.querySelector('.file-icon') && (preview.querySelector('.file-icon').textContent = file.type === 'application/pdf' ? '📄' : '🖼️');
  preview?.classList.add('show');
}

function removeMemberFile(memberId, fileKey) {
  const m = getMember(memberId);
  if (m) m.files[fileKey] = null;
  const zone    = document.getElementById(`${fileKey === 'photo' ? 'photo' : 'ktp'}Zone${memberId}`);
  const preview = document.getElementById(`${fileKey === 'photo' ? 'photo' : 'ktp'}Preview${memberId}`);
  zone?.classList.remove('has-file');
  preview?.classList.remove('show');
}

// ── Rekom Upload ──────────────────────────────────────────────
function setupRekomUpload() {
  const zone    = document.getElementById('rekomZone');
  const input   = document.getElementById('rekomInput');
  const preview = document.getElementById('rekomPreview');
  if (!zone || !input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) handleRekomFile(file, zone, preview);
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleRekomFile(file, zone, preview);
  });
}

function handleRekomFile(file, zone, preview) {
  const allowed = ['image/jpeg','image/png','application/pdf'];
  if (!allowed.includes(file.type)) { showToast('Format Salah','JPG/PNG/PDF saja','error'); return; }
  if (file.size > 2 * 1024 * 1024)  { showToast('File Terlalu Besar','Maks 2 MB','error'); return; }
  state.rekomFile = file;
  zone.classList.add('has-file');
  preview?.querySelector('.file-name') && (preview.querySelector('.file-name').textContent = file.name);
  preview?.querySelector('.file-size') && (preview.querySelector('.file-size').textContent = fmtSize(file.size));
  preview?.classList.add('show');
}

function removeFile(key) {
  if (key === 'rekom') {
    state.rekomFile = null;
    document.getElementById('rekomZone')?.classList.remove('has-file');
    document.getElementById('rekomPreview')?.classList.remove('show');
  }
}

// ── Submit ────────────────────────────────────────────────────
async function submitForm() {
  if (state.submitting) return;

  // Validate agreement
  if (!document.getElementById('agreement')?.checked) {
    showToast('Persetujuan Diperlukan','Centang persetujuan sebelum mengirim.','warning'); return;
  }

  // Validate files per member
  for (const m of state.members) {
    const name = m.data.nama_lengkap || `Anggota ${m.id}`;
    if (!m.files.photo) { showToast('Upload Diperlukan',`Pas foto ${name} belum diupload.`,'error'); return; }
    if (!m.files.ktp)   { showToast('Upload Diperlukan',`KTP/KK/KIA ${name} belum diupload.`,'error'); return; }
  }

  state.submitting = true;
  document.getElementById('submitBtn').disabled = true;
  showLoading();

  try {
    // Convert all files to base64
    const processedMembers = await Promise.all(state.members.map(async m => ({
      ...m.data,
      photo: await toBase64Obj(m.files.photo),
      ktp  : await toBase64Obj(m.files.ktp),
    })));

    const payload = {
      action       : 'register',
      kecamatan    : state.kecamatan,
      cabang_lomba : state.selected.cabang_lomba,
      golongan     : state.selected.golongan,
      tipe_lomba   : state.selected.tipe,
      nama_tim     : state.namaTim,
      members      : processedMembers,
      rekom        : state.rekomFile ? await toBase64Obj(state.rekomFile) : null,
    };

    const res    = await fetch(API_URL, {
      method  : 'POST',
      redirect: 'follow',
      body    : JSON.stringify(payload),
    });
    const result = await res.json();

    if (result.success) {
      state.result = result;
      hideLoading();
      showSuccessPage(result);
    } else {
      throw new Error(result.message || 'Pendaftaran gagal');
    }
  } catch (err) {
    hideLoading();
    showToast('Gagal Mendaftar', err.message || 'Terjadi kesalahan. Silakan coba lagi.', 'error');
    state.submitting = false;
    document.getElementById('submitBtn').disabled = false;
  }
}

async function toBase64Obj(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ name: file.name, type: file.type, data: reader.result.split(',')[1] });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Success Page ──────────────────────────────────────────────
function showSuccessPage(result) {
  document.getElementById('formContainer').classList.add('hidden');
  document.getElementById('successContainer').classList.remove('hidden');

  document.getElementById('successRegNum').textContent = result.nomor_pendaftaran;

  const isTeam = result.tipe_lomba === 'team';
  const lead   = state.members[0].data;
  let detailHTML = `
    <div class="row"><span class="key">No. Pendaftaran</span><span class="val">${result.nomor_pendaftaran}</span></div>
    <div class="row"><span class="key">Kecamatan</span><span class="val">${state.kecamatan}</span></div>
    <div class="row"><span class="key">Cabang Lomba</span><span class="val">${result.cabang_lomba} – ${result.golongan}</span></div>
    <div class="row"><span class="key">Tipe</span><span class="val">${isTeam ? '👥 Tim' : '👤 Individu'}</span></div>`;

  if (isTeam) {
    detailHTML += `<div class="row"><span class="key">Nama Tim</span><span class="val">${result.nama_tim}</span></div>`;
    detailHTML += `<div class="row"><span class="key">Jumlah Anggota</span><span class="val">${result.jumlah_anggota} orang</span></div>`;
    state.members.forEach((m, i) => {
      detailHTML += `<div class="row"><span class="key">Anggota ${i+1}</span><span class="val">${m.data.nama_lengkap} (${m.data.umur||calcAge(m.data.tanggal_lahir)} thn)</span></div>`;
    });
  } else {
    detailHTML += `<div class="row"><span class="key">Nama</span><span class="val">${lead.nama_lengkap}</span></div>`;
    detailHTML += `<div class="row"><span class="key">No. HP</span><span class="val">${lead.no_hp}</span></div>`;
    detailHTML += `<div class="row"><span class="key">Email</span><span class="val">${lead.email}</span></div>`;
  }

  detailHTML += `<div class="row"><span class="key">Status</span><span class="val"><span class="status-badge pending">⏳ Menunggu Verifikasi</span></span></div>`;
  document.getElementById('successDetail').innerHTML = detailHTML;

  generateQR(result.nomor_pendaftaran);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Berhasil 🎉','Pendaftaran Anda berhasil diterima!','success',8000);
}

function generateQR(text) {
  const el = document.getElementById('qrcode');
  if (!el || typeof QRCode === 'undefined') return;
  el.innerHTML = '';
  new QRCode(el, { text, width:180, height:180, colorDark:'#065f46', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.H });
}

// ── PDF Download ──────────────────────────────────────────────
function downloadPDF() {
  if (typeof window.jspdf === 'undefined') { showToast('Error','Library PDF tidak tersedia','error'); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ unit:'mm', format:'a4' });
  const r    = state.result;
  const lead = state.members[0].data;

  // Header
  doc.setFillColor(6,95,70); doc.rect(0,0,210,48,'F');
  doc.setFillColor(245,158,11); doc.rect(0,48,210,2,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('BUKTI PENDAFTARAN MTQ 2026', 105, 20, {align:'center'});
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Musabaqah Tilawatil Qur\'an – Kabupaten Indramayu', 105, 30, {align:'center'});
  doc.text('www.mtq-indramayu.go.id', 105, 39, {align:'center'});

  // Reg number box
  doc.setFillColor(240,253,245); doc.roundedRect(20,56,170,20,4,4,'F');
  doc.setTextColor(6,95,70); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('NOMOR PENDAFTARAN: ' + r.nomor_pendaftaran, 105, 69, {align:'center'});

  // Type badge
  const tipeLabel = r.tipe_lomba === 'team' ? '👥 PENDAFTARAN TIM' : '👤 PENDAFTARAN INDIVIDU';
  doc.setFillColor(r.tipe_lomba === 'team' ? 254 : 240, r.tipe_lomba === 'team' ? 243 : 253, r.tipe_lomba === 'team' ? 199 : 245);
  doc.roundedRect(70,80,70,10,2,2,'F');
  doc.setFontSize(9); doc.setTextColor(r.tipe_lomba === 'team' ? 180 : 6, r.tipe_lomba === 'team' ? 83 : 95, r.tipe_lomba === 'team' ? 9 : 70);
  doc.text(tipeLabel, 105, 87, {align:'center'});

  // Info rows
  const rows = [
    ['Kecamatan/Kafilah', state.kecamatan],
    ['Cabang Lomba', r.cabang_lomba],
    ['Golongan', r.golongan],
  ];
  if (r.tipe_lomba === 'team') rows.push(['Nama Tim', r.nama_tim]);
  rows.push(['Status', 'Menunggu Verifikasi Panitia']);

  let y = 96;
  rows.forEach(([k,v], i) => {
    doc.setFillColor(i%2===0 ? 249:255, i%2===0 ? 250:255, i%2===0 ? 247:255);
    doc.rect(20,y,170,8,'F');
    doc.setTextColor(107,114,128); doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(k,24,y+5.5);
    doc.setTextColor(30,41,59); doc.setFont('helvetica','bold');
    doc.text(String(v),90,y+5.5);
    y+=8;
  });

  // Member list
  y += 4;
  doc.setFillColor(6,95,70); doc.rect(20,y,170,7,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(r.tipe_lomba === 'team' ? 'DATA ANGGOTA TIM' : 'DATA PESERTA', 24, y+5);
  y += 7;

  state.members.forEach((m, i) => {
    const memberRows = [
      [`Anggota ${i+1}`, m.data.nama_lengkap],
      ['NIK', m.data.nik],
      ['Tgl. Lahir', `${m.data.tempat_lahir}, ${m.data.tanggal_lahir} (${m.data.umur||calcAge(m.data.tanggal_lahir)} tahun)`],
      ['Jenis Kelamin', m.data.jenis_kelamin],
      ['No. HP', m.data.no_hp],
    ];
    memberRows.forEach(([k,v], j) => {
      doc.setFillColor(j%2===0 ? 245:255, j%2===0 ? 250:255, j%2===0 ? 245:255);
      doc.rect(20,y,170,7,'F');
      doc.setTextColor(107,114,128); doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text(k,24,y+5);
      doc.setTextColor(30,41,59); doc.setFont('helvetica','bold');
      doc.text(String(v||'-'),90,y+5);
      y+=7;
    });
    if (i < state.members.length - 1) { doc.setDrawColor(200,220,200); doc.line(24, y+1, 186, y+1); y+=4; }
  });

  // QR
  const qrCanvas = document.querySelector('#qrcode canvas');
  if (qrCanvas) {
    const qrImg = qrCanvas.toDataURL('image/png');
    doc.addImage(qrImg,'PNG',78,y+6,54,54);
    doc.setFontSize(8); doc.setTextColor(107,114,128); doc.setFont('helvetica','normal');
    doc.text('Scan QR untuk verifikasi', 105, y+64, {align:'center'});
    y += 68;
  }

  // Footer
  doc.setFillColor(6,95,70); doc.rect(0,280,210,17,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}  |  Panitia MTQ Kab. Indramayu 2026`, 105, 290, {align:'center'});

  doc.save(`BuktiPendaftaran_MTQ2026_${r.nomor_pendaftaran}.pdf`);
}

// ── Step Rendering ────────────────────────────────────────────
function renderStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`)?.classList.add('active');
  ['si1','si2','si3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active','done');
    if (i+1 === n)  el.classList.add('active');
    if (i+1 < n)    el.classList.add('done');
  });
  state.step = n;
  window.scrollTo({ top: document.querySelector('.steps-bar')?.offsetTop - 68 || 0, behavior:'smooth' });
}

// ── Helpers ───────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}
function showErr(el, msg) {
  el.classList.add('error');
  const e = el.parentElement?.querySelector('.field-error');
  if (e) { e.textContent = msg; e.classList.add('show'); }
}
function clearErr(el) {
  el.classList.remove('error');
  const e = el.parentElement?.querySelector('.field-error');
  if (e) e.classList.remove('show');
}
function showFieldErr(el, msg) {
  el.classList.add('error');
  const e = el.parentElement?.querySelector('.field-error');
  if (e) { e.textContent = msg; e.classList.add('show'); }
  el.focus();
}
function showLoading() { document.getElementById('loadingOverlay')?.classList.add('show'); }
function hideLoading()  { document.getElementById('loadingOverlay')?.classList.remove('show'); }

function showToast(title, msg, type='info', dur=4000) {
  const icons = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  const cont  = document.getElementById('toastContainer');
  if (!cont) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span>
    <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  cont.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, dur);
}

function initNavbar() {
  const nb = document.getElementById('navbar');
  window.addEventListener('scroll', () => nb?.classList.toggle('scrolled', window.scrollY>40));
  document.getElementById('hamburger')?.addEventListener('click', () =>
    document.getElementById('mobileNav')?.classList.toggle('open'));
}
function initDarkMode() {
  const toggle = document.getElementById('darkToggle');
  const saved  = localStorage.getItem('mtq-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (toggle) toggle.textContent = saved==='dark' ? '☀️' : '🌙';
  toggle?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur==='dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mtq-theme', next);
    toggle.textContent = next==='dark' ? '☀️' : '🌙';
  });
}