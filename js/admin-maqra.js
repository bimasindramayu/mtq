// ============================================================
//  MTQ 2026 — js/admin-maqra.js  (v3 — embedded in admin.html)
//  Semua fungsi di-prefix "maqra" agar tidak konflik dengan admin.js
//  API_URL: satu sumber dari js/config.js (window.MTQ_API_URL)
// ============================================================

// API_URL: satu sumber dari js/config.js (window.MTQ_API_URL) — jangan ubah di sini
const MAQRA_API_URL = () => window.MTQ_API_URL || '';

let _maqraToken    = null;   // diambil dari sesi admin yang sudah login
let _allMaqra      = [];
let _allHasil      = [];
let _globalCfg     = null;
// FIX: dipakai supaya grup cabang yang barusan ditambah/diganti maqra-nya
// otomatis terbuka setelah maqraLoadData() me-render ulang — soalnya
// sekarang semua grup mulai dalam keadaan tertutup (lihat
// maqraRenderMaqraTable), jadi tanpa ini user harus klik manual buat
// lihat hasil yang baru saja disimpan.
let _maqraAutoExpandCabang = null;

// Cabang list: SATU SUMBER di js/config.js → MTQ_CONFIG.CABANG_LIST
// (jangan hardcode array cabang lagi di sini — edit config.js saja)
const MAQRA_CABANG_LIST = MTQ_CONFIG.CABANG_LIST;

// ── Init: dipanggil saat tab Maqra dibuka ─────────────────────
function maqraInit() {
  // Ambil token dari sesi admin.js yang sudah login
  _maqraToken = sessionStorage.getItem('mtq_admin_token') || null;
  maqraPopulateCabangSelects();
  maqraLoadData();
}

// ── Populate select cabang ────────────────────────────────────
function maqraPopulateCabangSelects() {
  ['maqraCabang', 'maqraFilterCabang'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Hindari duplikat saat init ulang
    while (sel.options.length > 1) sel.remove(1);
    MAQRA_CABANG_LIST.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  });
}

// ── Load all maqra data ───────────────────────────────────────
async function maqraLoadData() {
  if (!_maqraToken) {
    // Coba ambil token lagi (mungkin baru login)
    _maqraToken = sessionStorage.getItem('mtq_admin_token') || null;
    if (!_maqraToken) {
      maqraSetEl('maqraStatTotal', '—');
      maqraSetEl('maqraStatTersedia', '—');
      maqraSetEl('maqraStatDiambil', '—');
      return;
    }
  }
  maqraShowLoading(true, 'Memuat data maqra...');
  try {
    const data = await maqraJsonpGet({ action: 'getMaqraAdmin', token: _maqraToken });
    if (!data.success) {
      if (data.message === 'Sesi tidak valid') { maqraHandleSessionExpired(); return; }
      maqraShowToast('Error', data.message, 'error');
      return;
    }
    _allMaqra  = data.maqraList || [];
    _allHasil  = data.results   || [];
    _globalCfg = (data.config || []).find(c => c.cabang_lomba === 'GLOBAL') || null;

    maqraUpdateStats(data.stats || {});
    maqraRenderMaqraTable(_allMaqra);
    maqraRenderGlobalConfigSection();
    maqraRenderHasilTable(_allHasil);
    maqraUpdateFilterCabang(_allMaqra);
  } catch (err) {
    maqraShowToast('Error', 'Gagal memuat data: ' + err.message, 'error');
  } finally {
    maqraShowLoading(false);
  }
}

// ── Stats ─────────────────────────────────────────────────────
function maqraUpdateStats(stats) {
  maqraSetEl('maqraStatTotal',    stats.total        ?? 0);
  maqraSetEl('maqraStatTersedia', stats.tersedia     ?? 0);
  maqraSetEl('maqraStatDiambil',  stats.sudahDiambil ?? 0);
}

function maqraUpdateFilterCabang(list) {
  const cabangs = [...new Set(list.map(m => m.cabang_lomba).filter(Boolean))].sort();
  const sel = document.getElementById('maqraFilterCabang');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  cabangs.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

// ── Maqra Table ───────────────────────────────────────────────
// FIX: versi lama fungsi ini (target #maqraTableBody) dihapus dari sini —
// elemen itu sudah tidak ada di admin.html (UI sekarang pakai kartu
// grouped-by-cabang di #maqraCabangGroups, lihat definisi di bawah).
// Fungsi lama itu 100% tidak pernah jalan karena tertimpa definisi
// kedua (nama fungsi sama, JS pakai yang terakhir) — dihapus supaya
// tidak membingungkan pembaca berikutnya.

// ── UI Helpers: Mode toggle ───────────────────────────────────
let _maqraMode = 'tambah'; // 'tambah' | 'ganti'

function maqraSetMode(mode) {
  _maqraMode = mode;
  const isTambah = mode === 'tambah';

  const btnT = document.getElementById('maqraModeTambah');
  const btnG = document.getElementById('maqraModeGanti');
  const warn = document.getElementById('maqraReplaceWarn');
  const inp  = document.getElementById('maqraReplace');

  if (btnT) {
    btnT.style.border     = isTambah ? '2px solid var(--emerald)' : '2px solid var(--gray-200)';
    btnT.style.background = isTambah ? 'var(--emerald-xs)' : 'var(--white)';
    btnT.style.color      = isTambah ? 'var(--emerald)' : 'var(--gray-600)';
  }
  if (btnG) {
    btnG.style.border     = !isTambah ? '2px solid #dc2626' : '2px solid var(--gray-200)';
    btnG.style.background = !isTambah ? '#fef2f2' : 'var(--white)';
    btnG.style.color      = !isTambah ? '#dc2626' : 'var(--gray-600)';
  }
  if (warn) warn.style.display = isTambah ? 'none' : 'block';
  if (inp)  inp.value = isTambah ? 'false' : 'true';
}

// ── Hitung baris textarea ─────────────────────────────────────
function maqraCountLines() {
  const bulk = document.getElementById('maqraBulk')?.value || '';
  const count = bulk.split('\n').map(l => l.trim()).filter(Boolean).length;
  const el = document.getElementById('maqraBulkCount');
  if (el) el.textContent = count + (count === 1 ? ' baris' : ' baris');
}

// ── Info maqra yang sudah ada saat pilih cabang ───────────────
function maqraOnCabangChange() {
  const cabang  = document.getElementById('maqraCabang')?.value || '';
  const infoBox = document.getElementById('maqraCabangInfo');
  if (!infoBox) return;
  if (!cabang) { infoBox.style.display = 'none'; return; }

  const existing = _allMaqra.filter(m => m.cabang_lomba === cabang);
  const tersedia = existing.filter(m => !m.sudah_diambil).length;
  const diambil  = existing.filter(m => m.sudah_diambil).length;

  if (!existing.length) {
    infoBox.style.cssText = 'display:block;margin-top:8px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.6;background:var(--emerald-xs);border:1px solid var(--emerald-light);color:#065f46';
    infoBox.innerHTML = '✅ Belum ada maqra untuk cabang ini. Silakan tambahkan.';
  } else {
    infoBox.style.cssText = 'display:block;margin-top:8px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.6;background:#fef3c7;border:1px solid #fde68a;color:#b45309';
    infoBox.innerHTML = `⚠️ Sudah ada <strong>${existing.length} maqra</strong> — Tersedia: <strong>${tersedia}</strong> · Diambil: <strong>${diambil}</strong><br>
      Mode <strong>Tambah</strong>: maqra baru ditambahkan di bawah yang ada.<br>
      Mode <strong>Ganti Semua</strong>: maqra belum diambil (${tersedia}) akan <span style="color:#dc2626;font-weight:700">dihapus</span>.`;
  }
}

// ── Render tabel sebagai grouped-by-cabang cards ──────────────
function maqraRenderMaqraTable(list) {
  // Legacy ID masih digunakan oleh beberapa tempat, buat dummy
  const legacyTbody = document.getElementById('maqraTableBody');
  if (legacyTbody) legacyTbody.innerHTML = '';

  const container = document.getElementById('maqraCabangGroups');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--gray-400)">
      <div style="font-size:40px;margin-bottom:12px">📭</div>
      <div style="font-size:15px;font-weight:600">Belum ada maqra</div>
      <div style="font-size:13px;margin-top:6px">Tambahkan maqra menggunakan form di sebelah kiri</div>
    </div>`;
    return;
  }

  // Group by cabang
  const groups = {};
  list.forEach(m => {
    if (!groups[m.cabang_lomba]) groups[m.cabang_lomba] = [];
    groups[m.cabang_lomba].push(m);
  });

  const sortedCabangs = Object.keys(groups).sort();
  container.innerHTML = sortedCabangs.map(cabang => {
    const items    = groups[cabang];
    const tersedia = items.filter(m => !m.sudah_diambil).length;
    const diambil  = items.filter(m =>  m.sudah_diambil).length;
    const pct      = items.length ? Math.round(diambil / items.length * 100) : 0;
    const groupId  = `grp_${cabang.replace(/[^a-zA-Z0-9]/g,'_')}`;

    const rows = items.map((m, i) => `
      <tr style="${m.sudah_diambil ? 'opacity:.55' : ''}">
        <td style="width:30px">
          ${!m.sudah_diambil
            ? `<input type="checkbox" class="maqra-del-check" data-group="${groupId}" data-id="${maqraEsc(m.id_maqra)}" onchange="maqraUpdateBulkBtn('${groupId}')" style="width:15px;height:15px;cursor:pointer">`
            : ''}
        </td>
        <td style="color:var(--gray-400);font-size:11px;white-space:nowrap">${m.nomor_urut || i+1}</td>
        <td>
          <span style="font-weight:600;color:var(--gray-800)">${maqraEsc(m.maqra_teks)}</span>
          ${m.maqra_detail ? `<span style="font-size:11px;color:var(--gray-400);margin-left:6px">${maqraEsc(m.maqra_detail)}</span>` : ''}
        </td>
        <td>
          ${m.sudah_diambil
            ? `<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap">✅ Diambil</span>
               ${m.diambil_oleh ? `<div style="font-size:10px;color:var(--gray-400);margin-top:2px">→ ${maqraEsc(m.diambil_oleh)}</div>` : ''}`
            : `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">⏳ Tersedia</span>`}
        </td>
        <td>
          ${!m.sudah_diambil
            ? `<button onclick="maqraDelete('${maqraEsc(m.id_maqra)}')"
                style="background:#fef2f2;color:#dc2626;border:none;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;transition:all .2s"
                onmouseover="this.style.background='#dc2626';this.style.color='#fff'"
                onmouseout="this.style.background='#fef2f2';this.style.color='#dc2626'">🗑️</button>`
            : '<span style="color:var(--gray-300);font-size:12px">—</span>'}
        </td>
      </tr>`).join('');

    return `
      <div class="admin-card" style="margin-bottom:14px">
        <div class="admin-card-header" style="cursor:pointer;user-select:none"
          onclick="maqraToggleCabangGroup('${groupId}')"
          title="Klik untuk buka/tutup">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
            <span style="font-size:16px">📖</span>
            <span style="font-weight:700;font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${maqraEsc(cabang)}</span>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${tersedia} tersedia</span>
              ${diambil > 0 ? `<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${diambil} diambil</span>` : ''}
            </div>
          </div>
          <!-- Progress bar -->
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:10px">
            <div style="width:80px;height:6px;background:var(--gray-200);border-radius:999px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${pct===100?'#22c55e':'var(--gold)'};border-radius:999px;transition:width .4s"></div>
            </div>
            <span style="font-size:11px;color:var(--gray-400);font-weight:600;min-width:28px">${pct}%</span>
            <!-- FIX #4: mulai tertutup (▸), bukan terbuka (▾) — lihat max-height:0 di bawah -->
            <span id="${groupId}_arrow" style="font-size:14px;color:var(--gray-400)">▸</span>
          </div>
        </div>
        <!-- FIX #4: max-height:0 — grup mulai tertutup, tidak auto-expand -->
        <div id="${groupId}" style="overflow:hidden;transition:max-height .3s ease;max-height:0px">
          <div style="padding:8px 16px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gray-500);cursor:pointer">
              <input type="checkbox" onchange="maqraToggleSelectAllInGroup(this,'${groupId}')" style="width:14px;height:14px;cursor:pointer">
              Pilih semua yang tersedia
            </label>
            <button id="bulkDelBtn_${groupId}" onclick="maqraBulkDelete('${groupId}','${maqraEsc(cabang)}')"
              style="display:none;font-size:12px;padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">
              🗑️ Hapus Terpilih (<span id="bulkDelCount_${groupId}">0</span>)
            </button>
          </div>
          <div class="table-wrap">
            <table class="data-table" style="font-size:12px">
              <thead><tr><th style="width:30px"></th><th style="width:40px">#</th><th>Maqra</th><th style="width:120px">Status</th><th style="width:44px">Aksi</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div style="padding:10px 16px;border-top:1px solid var(--gray-100);display:flex;align-items:center;gap:8px">
            <button onclick="maqraPresetTambah('${maqraEsc(cabang)}')"
              style="font-size:12px;padding:5px 10px;background:var(--emerald-xs);color:var(--emerald);border:1px solid var(--emerald-light);border-radius:6px;cursor:pointer;font-weight:600">
              ➕ Tambah Maqra
            </button>
            ${tersedia > 0
              ? `<button onclick="maqraPresetGanti('${maqraEsc(cabang)}')"
                  style="font-size:12px;padding:5px 10px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-weight:600">
                  🔄 Ganti Semua
                </button>`
              : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  // FIX: buka otomatis grup yang barusan disimpan (lihat _maqraAutoExpandCabang)
  if (_maqraAutoExpandCabang) {
    const gid = `grp_${_maqraAutoExpandCabang.replace(/[^a-zA-Z0-9]/g,'_')}`;
    const el  = document.getElementById(gid);
    if (el) {
      el.style.maxHeight = (el.scrollHeight + 200) + 'px';
      const arrow = document.getElementById(gid + '_arrow');
      if (arrow) arrow.textContent = '▾';
      el.closest('.admin-card')?.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    _maqraAutoExpandCabang = null;
  }
}

// FIX #2: pilih semua checkbox yang tersedia dalam satu grup sekaligus
function maqraToggleSelectAllInGroup(masterCheckbox, groupId) {
  const boxes = document.querySelectorAll(`.maqra-del-check[data-group="${groupId}"]`);
  boxes.forEach(b => { b.checked = masterCheckbox.checked; });
  maqraUpdateBulkBtn(groupId);
}

// FIX #2: tampilkan/perbarui tombol "Hapus Terpilih" sesuai jumlah yang dicentang
function maqraUpdateBulkBtn(groupId) {
  const checked = document.querySelectorAll(`.maqra-del-check[data-group="${groupId}"]:checked`);
  const btn   = document.getElementById(`bulkDelBtn_${groupId}`);
  const count = document.getElementById(`bulkDelCount_${groupId}`);
  if (count) count.textContent = checked.length;
  if (btn)   btn.style.display = checked.length ? 'inline-flex' : 'none';
}

// FIX #2: hapus semua maqra yang dicentang dalam satu grup — satu
// panggilan backend (action deleteMaqraBulk) untuk semuanya sekaligus,
// bukan satu-satu, supaya tidak lambat kalau yang dipilih banyak.
async function maqraBulkDelete(groupId, cabang) {
  const checked = document.querySelectorAll(`.maqra-del-check[data-group="${groupId}"]:checked`);
  const ids = Array.from(checked).map(el => el.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Hapus ${ids.length} maqra terpilih dari "${cabang}"?\n\nTindakan ini tidak bisa dibatalkan.`)) return;

  maqraShowLoading(true, `Menghapus ${ids.length} maqra...`);
  try {
    const data = await maqraPostJSON({ action:'deleteMaqraBulk', token:_maqraToken, id_maqra_list: ids });
    if (data.success) {
      maqraShowToast('Berhasil', `${data.deleted} maqra dihapus dari ${cabang}`, 'success');
    } else {
      if (data.message === 'Sesi tidak valid') { maqraHandleSessionExpired(); return; }
      maqraShowToast('Gagal', data.message || 'Terjadi kesalahan', 'error');
    }
    maqraLoadData();
  } catch (err) {
    maqraShowToast('Error', err.message + ' — memuat ulang untuk memastikan status...', 'error', 6000);
    maqraLoadData();
  } finally {
    maqraShowLoading(false);
  }
}

// Toggle expand/collapse group card
function maqraToggleCabangGroup(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isOpen = el.style.maxHeight && el.style.maxHeight !== '0px';
  el.style.maxHeight = isOpen ? '0px' : (el.scrollHeight + 200) + 'px';
  const arrow = document.getElementById(id + '_arrow');
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}

// Quick-fill form dari tombol cabang card
function maqraPresetTambah(cabang) {
  const sel = document.getElementById('maqraCabang');
  if (sel) { sel.value = cabang; maqraOnCabangChange(); }
  maqraSetMode('tambah');
  document.getElementById('maqraBulk')?.focus();
  document.getElementById('maqraBulk')?.scrollIntoView({ behavior:'smooth', block:'center' });
}
function maqraPresetGanti(cabang) {
  const sel = document.getElementById('maqraCabang');
  if (sel) { sel.value = cabang; maqraOnCabangChange(); }
  maqraSetMode('ganti');
  document.getElementById('maqraBulk')?.focus();
  document.getElementById('maqraBulk')?.scrollIntoView({ behavior:'smooth', block:'center' });
}

// ── Updated filter: search + cabang + status ──────────────────
function maqraFilterTable() {
  const cabang = document.getElementById('maqraFilterCabang')?.value || '';
  const status = document.getElementById('maqraFilterStatus')?.value || '';
  const query  = (document.getElementById('maqraSearchInput')?.value || '').toLowerCase().trim();

  let filtered = _allMaqra;
  if (cabang) filtered = filtered.filter(m => m.cabang_lomba === cabang);
  if (status === 'tersedia') filtered = filtered.filter(m => !m.sudah_diambil);
  if (status === 'diambil')  filtered = filtered.filter(m =>  m.sudah_diambil);
  if (query)  filtered = filtered.filter(m =>
    maqraEsc(m.maqra_teks).toLowerCase().includes(query) ||
    maqraEsc(m.cabang_lomba).toLowerCase().includes(query) ||
    (m.maqra_detail||'').toLowerCase().includes(query)
  );
  maqraRenderMaqraTable(filtered);
}

// ── Global Config Section ─────────────────────────────────────
function maqraRenderGlobalConfigSection() {
  const cfg = _globalCfg;
  const now = new Date();

  let isOpen = false, statusLabel = '🔒 Tutup', statusColor = '#dc2626';
  if (cfg) {
    const ov = (cfg.override || '').toLowerCase();
    if (ov === 'buka') {
      isOpen = true; statusLabel = '⚡ Override: DIBUKA PAKSA'; statusColor = 'var(--emerald)';
    } else if (ov === 'tutup') {
      isOpen = false; statusLabel = '⛔ Override: DITUTUP PAKSA';
    } else if (cfg.buka && cfg.tutup) {
      const b = new Date(cfg.buka), t = new Date(cfg.tutup);
      isOpen = now >= b && now < t;
      if (now < b)       { statusLabel = '⏳ Belum Dibuka'; statusColor = '#b45309'; }
      else if (isOpen)   { statusLabel = '✅ Sedang Buka';  statusColor = 'var(--emerald)'; }
      else               { statusLabel = '🔒 Sudah Tutup'; }
    }
  }

  const fmt = d => d ? new Date(d).toLocaleString('id-ID', {
    day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'
  }) : '—';

  const statusBox = document.getElementById('maqraGlobalStatusBox');
  if (statusBox) {
    statusBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="width:12px;height:12px;border-radius:50%;background:${isOpen?'#22c55e':'#dc2626'};flex-shrink:0"></div>
        <span style="font-size:15px;font-weight:700;color:${statusColor}">${statusLabel}</span>
        ${cfg ? `
          <span style="font-size:12px;color:var(--gray-400);margin-left:auto">
            📅 ${fmt(cfg.buka)} — 🔒 ${fmt(cfg.tutup)}
          </span>` : '<span style="font-size:12px;color:var(--gray-400)">Belum dikonfigurasi</span>'}
      </div>`;
    statusBox.style.background = isOpen ? '#f0fdf4' : '#fef2f2';
    statusBox.style.borderColor = isOpen ? '#86efac' : '#fca5a5';
  }

  // Isi form fields
  if (cfg) {
    try {
      if (cfg.buka)  document.getElementById('maqraCfgBuka').value  = maqraToDatetimeLocal(new Date(cfg.buka));
      if (cfg.tutup) document.getElementById('maqraCfgTutup').value = maqraToDatetimeLocal(new Date(cfg.tutup));
    } catch(e) {}
    const ov = cfg.override || '';
    document.getElementById('maqraCfgOverride').value = ov;
    maqraSetOverride(ov);
    const ketEl = document.getElementById('maqraCfgKeterangan');
    if (ketEl) ketEl.value = cfg.keterangan || '';
  }
}

function maqraToDatetimeLocal(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Hasil Table ───────────────────────────────────────────────
function maqraRenderHasilTable(list) {
  const tbody = document.getElementById('maqraHasilTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--gray-400)">Belum ada peserta yang mengambil maqra.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((r, i) => `
    <tr>
      <td style="color:var(--gray-400)">${i + 1}</td>
      <td style="font-family:monospace;font-size:12px">${maqraEsc(r.nomor_pendaftaran)}</td>
      <td style="font-weight:600">${maqraEsc(r.nama_lengkap || '—')}</td>
      <td style="font-size:12px">${maqraEsc(r.kecamatan || '—')}</td>
      <td style="font-size:12px">${maqraEsc(r.cabang_lomba || '—')}</td>
      <td>
        <div style="font-weight:600;color:var(--emerald)">${maqraEsc(r.maqra_teks || '—')}</div>
        ${r.maqra_detail ? `<div style="font-size:11px;color:var(--gray-400)">${maqraEsc(r.maqra_detail)}</div>` : ''}
        <div style="font-size:11px;color:var(--gray-400)">No. ${maqraEsc(r.nomor_maqra || '—')}</div>
      </td>
      <td style="font-size:12px;color:var(--gray-400)">${maqraEsc(r.timestamp || '—')}</td>
    </tr>`).join('');
}

function maqraFilterHasil() {
  const q = (document.getElementById('maqraSearchHasil')?.value || '').toLowerCase().trim();
  if (!q) { maqraRenderHasilTable(_allHasil); return; }
  maqraRenderHasilTable(_allHasil.filter(r =>
    (r.nama_lengkap||'').toLowerCase().includes(q) ||
    (r.nomor_pendaftaran||'').toLowerCase().includes(q) ||
    (r.maqra_teks||'').toLowerCase().includes(q) ||
    (r.kecamatan||'').toLowerCase().includes(q)
  ));
}

// ── Save Maqra ────────────────────────────────────────────────
// ── Save Maqra ────────────────────────────────────────────────
// Frontend parse bulk_text → items[] sebelum dikirim ke backend
// karena backend mengharapkan body.items bukan body.bulk_text
async function maqraSaveMaqra() {
  const cabang  = document.getElementById('maqraCabang')?.value.trim();
  const bulk    = document.getElementById('maqraBulk')?.value.trim();
  const detail  = document.getElementById('maqraDetailPrefix')?.value.trim() || '';
  // Baca dari hidden input (value 'true'/'false') atau dari _maqraMode
  const replaceEl = document.getElementById('maqraReplace');
  const replace = replaceEl ? (replaceEl.value === 'true' || replaceEl.checked === true) : (_maqraMode === 'ganti');

  if (!cabang) { maqraShowToast('Peringatan', 'Pilih cabang lomba terlebih dahulu', 'warning'); return; }
  if (!bulk)   { maqraShowToast('Peringatan', 'Isi daftar maqra terlebih dahulu', 'warning'); return; }

  const lines = bulk.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { maqraShowToast('Peringatan', 'Tidak ada maqra yang dapat dibaca', 'warning'); return; }

  // ── Hitung nomor urut mulai dari maqra terakhir cabang ini ──
  // Agar penambahan baru tidak bentrok dengan yang sudah ada
  const existingForCabang = _allMaqra.filter(m => m.cabang_lomba === cabang);
  const startUrut = replace ? 1 : existingForCabang.length + 1;

  // FIX #2: penjagaan duplikat — sebelumnya baris yang teksnya PERSIS
  // sama dengan maqra yang sudah ada di cabang yang sama tetap bisa
  // ditambahkan berulang kali (id_maqra selalu baru karena nomor urut
  // increment, jadi lolos begitu saja). Dicek terhadap _allMaqra — data
  // yang sama yang dipakai merender #maqraCabangGroups — supaya sinkron
  // dengan apa yang terlihat di layar. Hanya relevan untuk mode Tambah;
  // mode Ganti Semua memang menghapus dulu sebelum menulis ulang.
  if (!replace) {
    const existingTexts = new Set(existingForCabang.map(m => (m.maqra_teks || '').trim().toLowerCase()));
    const dupes = lines.filter(l => existingTexts.has(l.toLowerCase()));
    if (dupes.length) {
      const listTxt = dupes.map(d => `• ${d}`).join('\n');
      const proceed = confirm(
        `⚠️ ${dupes.length} baris berikut SUDAH ADA di "${cabang}":\n\n${listTxt}\n\n` +
        `Lanjutkan tetap menyimpan? (akan jadi entri duplikat)`
      );
      if (!proceed) return;
    }
  }

  // ── Build items array — ini yang diharapkan backend ─────────
  const items = lines.map((line, idx) => {
    const nomorUrut = startUrut + idx;
    const idSuffix  = String(nomorUrut).padStart(3, '0');
    const cabangKey = cabang.replace(/[^A-Za-z0-9]/g, '_').toUpperCase().substring(0, 20);
    return {
      id_maqra    : `${cabangKey}_${idSuffix}`,
      cabang_lomba: cabang,
      maqra_teks  : line,
      maqra_detail: detail,
      nomor_urut  : nomorUrut,
    };
  });

  const modeLabel = replace ? 'GANTI SEMUA' : 'TAMBAH';
  const msg = `${modeLabel} ${items.length} maqra untuk "${cabang}"?`
    + (replace ? '\n\n⚠️ Maqra lama yang BELUM diambil akan dihapus.' : '');
  if (!confirm(msg)) return;

  maqraShowLoading(true, `Menyimpan ${items.length} maqra...`);
  try {
    const data = await maqraPostJSON({
      action      : 'saveMaqra',
      token       : _maqraToken,
      cabang_lomba: cabang,
      items,                   // ← array yang benar, bukan bulk_text
      replace,
    });
    if (data.success) {
      maqraShowToast('Berhasil', `${data.added} maqra berhasil disimpan untuk ${cabang}`, 'success', 5000);
      document.getElementById('maqraBulk').value = '';
      document.getElementById('maqraDetailPrefix').value = '';
      if (replaceEl) replaceEl.value = 'false';
      maqraSetMode('tambah');
      maqraCountLines();
      _maqraAutoExpandCabang = cabang;
      maqraLoadData();
    } else {
      if (data.message === 'Sesi tidak valid') { maqraHandleSessionExpired(); return; }
      maqraShowToast('Gagal', data.message || 'Terjadi kesalahan', 'error');
      maqraLoadData();   // FIX: sinkronkan tampilan — barangkali sebagian sempat tersimpan
    }
  } catch (err) {
    // FIX: sebelumnya berhenti di sini meninggalkan tampilan basi —
    // request bisa saja SUDAH diproses & tersimpan di server walau
    // klien gagal menerima balasannya (mis. timeout). Muat ulang
    // otomatis supaya user tidak perlu refresh manual untuk tahu
    // status sebenarnya.
    maqraShowToast('Error', 'Gagal mengirim data: ' + err.message + ' — memuat ulang untuk memastikan status...', 'error', 6000);
    maqraLoadData();
  } finally {
    maqraShowLoading(false);
  }
}

// ── Delete Maqra ──────────────────────────────────────────────
async function maqraDelete(idMaqra) {
  if (!confirm(`Hapus maqra "${idMaqra}"?`)) return;
  maqraShowLoading(true, 'Menghapus...');
  try {
    const data = await maqraPostJSON({ action:'deleteMaqra', token:_maqraToken, id_maqra:idMaqra });
    if (data.success) {
      maqraShowToast('Berhasil', 'Maqra dihapus', 'success');
      maqraLoadData();
    } else {
      if (data.message === 'Sesi tidak valid') { maqraHandleSessionExpired(); return; }
      maqraShowToast('Gagal', data.message, 'error');
      maqraLoadData();
    }
  } catch (err) {
    maqraShowToast('Error', err.message + ' — memuat ulang untuk memastikan status...', 'error', 6000);
    maqraLoadData();
  } finally {
    maqraShowLoading(false);
  }
}

// ── Save Global Config ────────────────────────────────────────
async function maqraSaveConfig() {
  const buka     = document.getElementById('maqraCfgBuka')?.value;
  const tutup    = document.getElementById('maqraCfgTutup')?.value;
  const override = document.getElementById('maqraCfgOverride')?.value || '';
  const ket      = document.getElementById('maqraCfgKeterangan')?.value.trim() || '';

  if (!override && (!buka || !tutup)) {
    maqraShowToast('Peringatan', 'Isi waktu buka dan tutup, atau pilih override manual', 'warning');
    return;
  }
  if (buka && tutup && new Date(buka) >= new Date(tutup)) {
    maqraShowToast('Peringatan', 'Waktu tutup harus setelah waktu buka', 'warning');
    return;
  }

  maqraShowLoading(true, 'Menyimpan konfigurasi...');
  try {
    const data = await maqraPostJSON({
      action       : 'saveMaqraConfig',
      token        : _maqraToken,
      cabang_lomba : 'GLOBAL',
      buka         : buka  ? new Date(buka).toISOString()  : '',
      tutup        : tutup ? new Date(tutup).toISOString() : '',
      override,
      keterangan   : ket,
    });
    if (data.success) {
      maqraShowToast('Berhasil', 'Konfigurasi waktu global berhasil disimpan ✅', 'success', 5000);
      maqraLoadData();
    } else {
      if (data.message === 'Sesi tidak valid') { maqraHandleSessionExpired(); return; }
      maqraShowToast('Gagal', data.message, 'error');
      maqraLoadData();
    }
  } catch (err) {
    maqraShowToast('Error', err.message + ' — memuat ulang untuk memastikan status...', 'error', 6000);
    maqraLoadData();
  } finally {
    maqraShowLoading(false);
  }
}

// ── Export Hasil CSV ──────────────────────────────────────────
function maqraExportHasil() {
  if (!_allHasil.length) { maqraShowToast('Info', 'Belum ada data untuk diekspor', 'info'); return; }
  const header = ['No','Nomor Pendaftaran','Nama','Kecamatan','Cabang Lomba','Maqra','Detail Maqra','Nomor Undian','Waktu'];
  const rows   = _allHasil.map((r, i) => [
    i+1, r.nomor_pendaftaran||'', r.nama_lengkap||'', r.kecamatan||'',
    r.cabang_lomba||'', r.maqra_teks||'', r.maqra_detail||'', r.nomor_maqra||'', r.timestamp||''
  ]);
  const csv  = [header,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `HasilMaqra_MTQ2026_${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  maqraShowToast('Berhasil', 'File CSV berhasil diunduh', 'success');
}

// ── Session expired ───────────────────────────────────────────
function maqraHandleSessionExpired() {
  _maqraToken = null;
  sessionStorage.removeItem('mtq_admin_token');
  // Kembalikan ke halaman login admin.js
  if (typeof showLoginGate === 'function') showLoginGate();
  maqraShowToast('Sesi Habis', 'Silakan login kembali', 'warning', 5000);
}

// ── JSONP Transport ───────────────────────────────────────────
function maqraJsonpGet(params, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cb  = 'mtqMqG_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    const qs  = Object.entries(params)
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const s   = document.createElement('script');
    let timer;
    window[cb] = d => { clearTimeout(timer); delete window[cb]; s.remove(); resolve(d); };
    s.src    = `${MAQRA_API_URL()}?${qs}&callback=${cb}`;
    s.onerror = () => { clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer    = setTimeout(() => { delete window[cb]; s.remove(); reject(new Error('Timeout')); }, timeout);
    document.head.appendChild(s);
  });
}

// FIX: DEPRECATED untuk mutasi (save/delete) — JANGAN dipakai lagi untuk
// itu. Payload di sini dijejalkan ke query string URL (?postData=...),
// dan teks maqra (bisa beberapa ayat) gampang menembus batas panjang URL
// yang ditoleransi browser/infrastruktur Google. Efeknya: server tetap
// menerima & memproses (data BENAR-BENAR tersimpan), tapi <script> tag
// JSONP gagal memuat balasannya di sisi klien → muncul "Network error"
// padahal datanya sudah masuk (baru kelihatan setelah refresh manual).
// Dipertahankan di sini HANYA untuk kompatibilitas kalau ada pemanggil
// lama; mutasi baru pakai maqraPostJSON di bawah (fetch POST asli, body
// di request body bukan URL — sama seperti postJSON() di cek-maqra.js
// yang sudah terbukti jalan untuk kasus serupa).
function maqraJsonpPost(payload, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const cb  = 'mtqMqP_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    const enc = encodeURIComponent(JSON.stringify(payload));
    const s   = document.createElement('script');
    let timer;
    window[cb] = d => { clearTimeout(timer); delete window[cb]; s.remove(); resolve(d); };
    s.src    = `${MAQRA_API_URL()}?postData=${enc}&callback=${cb}`;
    s.onerror = () => { clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer    = setTimeout(() => { delete window[cb]; s.remove(); reject(new Error('Timeout')); }, timeout);
    document.head.appendChild(s);
  });
}

// FIX: transport POST asli untuk mutasi (save/delete maqra & config).
// Body dikirim di request body (fetch), bukan di URL — tidak ada batas
// panjang seperti JSONP tunnel. Content-Type text/plain (bukan
// application/json) sengaja dipakai supaya browser menganggap ini
// "simple request" dan tidak mengirim CORS preflight (OPTIONS), karena
// Apps Script (api.gs → doPost) tidak menangani preflight. api.gs sudah
// punya doPost(e) yang dipakai bersama oleh registrasi & perbaikan
// (lihat postJSON() di cek-maqra.js) — action saveMaqra/deleteMaqra/
// saveMaqraConfig sudah dirutekan lewat _dispatchPost(body) yang sama
// persis dengan tunnel ?postData=, jadi tinggal ganti cara kirimnya saja.
async function maqraPostJSON(payload, timeout = 30000) {
  const apiUrl = MAQRA_API_URL();
  if (!apiUrl) throw new Error('API_URL tidak terkonfigurasi — periksa js/config.js');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(apiUrl, {
      method : 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body   : JSON.stringify(payload),
      signal : controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout (' + Math.round(timeout / 1000) + 's) — server lambat merespons. Data mungkin sudah tersimpan; refresh untuk memastikan.');
    }
    throw new Error('Gagal menghubungi server: ' + err.message);
  }
  clearTimeout(timer);

  if (!res.ok) throw new Error('Server merespons dengan status ' + res.status);
  return res.json();
}

// ── Utilities (private, prefix maqra agar tidak konflik) ──────
function maqraSetEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function maqraEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function maqraShowLoading(show, msg = 'Memuat...') {
  // showLoading(msg,sub) dan hideLoading() dari admin.js — signature berbeda,
  // JANGAN panggil showLoading(show,msg) karena itu selalu menampilkan overlay.
  if (show) {
    if (typeof showLoading  === 'function') { showLoading(msg, 'Mohon tunggu'); return; }
  } else {
    if (typeof hideLoading  === 'function') { hideLoading(); return; }
  }
  // Fallback jika admin.js belum tersedia
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
  const lm = document.getElementById('loadingMsg'); if (lm && show) lm.textContent = msg;
}
function maqraShowToast(title, msg, type = 'info', duration = 4000) {
  // FIX: sebelumnya cek `showToast` — fungsi itu HANYA didefinisikan di
  // admin.js, yang (lihat catatan sesi sebelumnya) ternyata tidak pernah
  // dimuat admin.html sama sekali. Akibatnya kondisi ini selalu false,
  // dan kode SELALU jatuh ke fallback adminLog.warn di bawah — yang
  // cuma menulis ke console, tidak pernah menampilkan apa pun di layar.
  // Fungsi toast yang benar-benar aktif di admin.html bernama `toast`
  // (lihat definisinya di inline script admin.html, dipakai refreshData()
  // dkk. — signature-nya sudah sama persis: title, msg, type, duration).
  if (typeof toast === 'function') { toast(title, msg, type, duration); return; }
  adminLog.warn(`[Maqra Toast] ${type}: ${title} — ${msg}`);
}