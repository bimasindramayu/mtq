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
// FIX #34 (poin 2/3): hasil YANG SEDANG TAMPIL di tabel Hasil Pengambilan
// (setelah pencarian + filter cabang). Dipakai maqraDownloadAllBukti()
// supaya unduhan borongan ikut filter yang aktif, bukan selalu semua data.
let _filteredHasil = [];
let _globalCfg     = null;
// FIX: dipakai supaya grup cabang yang barusan ditambah/diganti maqra-nya
// otomatis terbuka setelah maqraLoadData() me-render ulang — soalnya
// sekarang semua grup mulai dalam keadaan tertutup (lihat
// maqraRenderMaqraTable), jadi tanpa ini user harus klik manual buat
// lihat hasil yang baru saja disimpan.
let _maqraAutoExpandCabang = null;
// FIX: dulu maqraLoadData() (network) dipanggil ULANG setiap kali tab
// "Manajemen Maqra" dibuka (lihat monkey-patch showPage() di
// doyourmagic.html yang memanggil maqraInit() tiap page==='maqra') —
// jadi pindah ke tab lain lalu balik lagi selalu memuat ulang dari
// server. Flag ini dipakai maqraInit() supaya load pertama itu SATU-
// SATUNYA load otomatis per sesi halaman; sesudahnya user bebas
// berpindah tab tanpa memicu request baru. Muat ulang manual → tombol
// "🔄 Refresh" di halaman Maqra (maqraRefresh(), lihat di bawah).
let _maqraLoaded = false;

// Cabang list: SATU SUMBER di js/config.js → MTQ_CONFIG.CABANG_LIST
// (jangan hardcode array cabang lagi di sini — edit config.js saja)
const MAQRA_CABANG_LIST = MTQ_CONFIG.CABANG_LIST;

// FIX #30: Manajemen Maqra sebelumnya menampilkan Putra & Putri dari
// cabang yang sama sebagai 2 entri terpisah di dropdown & 2 kartu
// terpisah di daftar — padahal untuk keperluan maqra ("masih 1 cabang")
// admin cuma perlu kelola satu pool bersama. maqraKelompok() melepas
// akhiran " Putra"/" Putri" — SAMA PERSIS dengan getMaqraKelompok_() di
// maqra.gs (backend), supaya perbandingan grup di FE selalu konsisten
// dengan bagaimana backend mencocokkan data. MAQRA_KELOMPOK_LIST adalah
// versi MAQRA_CABANG_LIST yang sudah dilepas gender & di-dedup, dipakai
// utk isi dropdown pilih cabang & filter — bukan lagi 28 opsi, tapi 14.
function maqraKelompok(cabang) {
  return String(cabang || '').trim().replace(/\s+(Putra|Putri)$/i, '').trim();
}
const MAQRA_KELOMPOK_LIST = [...new Set(MAQRA_CABANG_LIST.map(maqraKelompok))];

// ── Init: dipanggil saat tab Maqra dibuka ─────────────────────
// Token sesi admin dibagi antar tab lewat localStorage (kunci sama dgn
// mtqTokenGet() di doyourmagic.html); sessionStorage = cadangan/sesi lama.
function maqraGetToken_() {
  try { const t = localStorage.getItem('mtq_admin_token'); if (t) return t; } catch (e) {}
  try { return sessionStorage.getItem('mtq_admin_token') || null; } catch (e) {}
  return null;
}
function maqraClearToken_() {
  try { localStorage.removeItem('mtq_admin_token'); } catch (e) {}
  try { sessionStorage.removeItem('mtq_admin_token'); } catch (e) {}
}

function maqraInit() {
  // Ambil token dari sesi admin.js yang sudah login
  _maqraToken = maqraGetToken_();
  maqraPopulateCabangSelects();
  // FIX: lihat catatan _maqraLoaded di atas — hanya memuat dari server
  // kalau BELUM PERNAH berhasil dimuat di sesi halaman ini.
  if (_maqraLoaded) return;
  maqraLoadData();
}

// Dipanggil dari tombol "🔄 Refresh" di halaman Manajemen Maqra —
// satu-satunya cara memuat ulang data dari server setelah load pertama
// (lihat _maqraLoaded).
function maqraRefresh() {
  maqraLoadData();
}

// ── Populate select cabang ────────────────────────────────────
function maqraPopulateCabangSelects() {
  // FIX #34 (poin 2): maqraFilterHasilCabang ikut diisi otomatis dari
  // sumber yang sama (MAQRA_KELOMPOK_LIST) — tab Hasil Pengambilan.
  ['maqraCabang', 'maqraFilterCabang', 'maqraFilterHasilCabang'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Hindari duplikat saat init ulang
    while (sel.options.length > 1) sel.remove(1);
    // FIX #30: MAQRA_KELOMPOK_LIST (14, tanpa gender) — bukan lagi
    // MAQRA_CABANG_LIST (28, dengan Putra/Putri terpisah).
    MAQRA_KELOMPOK_LIST.forEach(c => {
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
    _maqraToken = maqraGetToken_();
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
    // FIX: ditandai "sudah dimuat" HANYA setelah berhasil — kalau load
    // pertama gagal (mis. error jaringan), tab Maqra akan tetap mencoba
    // lagi di kunjungan berikutnya, bukan diam2 dianggap "sudah pernah".
    _maqraLoaded = true;

    maqraUpdateStats(data.stats || {});
    maqraRenderMaqraTable(_allMaqra);
    maqraRenderGlobalConfigSection();
    // FIX #34 (poin 2/3): lewat maqraFilterHasil() (bukan langsung
    // maqraRenderHasilTable(_allHasil)) supaya _filteredHasil ikut terisi
    // sejak data pertama kali dimuat — kalau tidak, klik langsung
    // "Download Semua Bukti" tanpa menyentuh pencarian/filter dulu akan
    // dapat _filteredHasil kosong ([] dari deklarasi awal), padahal
    // tabelnya sendiri menampilkan semua data.
    maqraFilterHasil();
    maqraUpdateFilterCabang(_allMaqra);
    // FIX: tab "🎯 Ambil Maqra Peserta" — re-render juga di sini (bukan
    // cuma saat tab-nya sendiri diklik, lihat maqraAmbilInit() di bawah)
    // supaya kalau admin kebetulan sudah berada di tab itu ketika
    // maqraLoadData() ini dipanggil ulang (mis. lewat tombol Refresh di
    // tab lain), datanya ikut tersinkron tanpa perlu pindah tab bolak-
    // balik. typeof-check karena fungsinya didefinisikan di bagian bawah
    // file ini (setelah maqraLoadData) — pola sama dgn pengecekan
    // showPage di doyourmagic.html.
    if (typeof maqraAmbilFilter === 'function') maqraAmbilFilter(true);   // tetap di halaman aktif
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
  // FIX #30: dedup lewat kelompok (tanpa gender) — supaya data lama yang
  // masih tersimpan sebagai "... Putra"/"... Putri" tidak muncul sebagai
  // 2 opsi filter terpisah.
  const cabangs = [...new Set(list.map(m => maqraKelompok(m.cabang_lomba)).filter(Boolean))].sort();
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

  // FIX #30: cabang di sini sekarang nama KELOMPOK (dropdown sudah
  // MAQRA_KELOMPOK_LIST) — cocokkan lewat maqraKelompok() juga di sisi
  // data, supaya baris lama yang masih ber-gender ikut terhitung.
  const existing = _allMaqra.filter(m => maqraKelompok(m.cabang_lomba) === cabang);
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

  // FIX #30: Group by KELOMPOK (tanpa gender), bukan cabang_lomba persis
  // — inilah perbaikan utama yang diminta: Putra & Putri dari cabang yang
  // sama sekarang tampil sebagai SATU kartu gabungan, bukan 2 kartu
  // terpisah. Baris lama yang masih tersimpan dengan cabang_lomba
  // ber-akhiran " Putra"/" Putri" otomatis ikut tergabung lewat
  // maqraKelompok() ini juga — tidak perlu migrasi data manual.
  const groups = {};
  list.forEach(m => {
    const kelompok = maqraKelompok(m.cabang_lomba);
    if (!groups[kelompok]) groups[kelompok] = [];
    groups[kelompok].push(m);
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
  // FIX #30: maqraFilterCabang sekarang berisi nama kelompok (lihat
  // maqraUpdateFilterCabang) — cocokkan lewat maqraKelompok() juga.
  if (cabang) filtered = filtered.filter(m => maqraKelompok(m.cabang_lomba) === cabang);
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
  const q      = (document.getElementById('maqraSearchHasil')?.value || '').toLowerCase().trim();
  // FIX #34 (poin 2): filter cabang, digabung dengan pencarian teks yang
  // sudah ada. maqraKelompok() menyamakan "... Putra"/"... Putri" jadi 1
  // kelompok — sama seperti tab Daftar Maqra, jadi hasil utk cabang yang
  // sama tergabung juga di sini biarpun cabang_lomba tersimpan ber-gender.
  const cabang = document.getElementById('maqraFilterHasilCabang')?.value || '';

  let base = _allHasil;
  if (cabang) base = base.filter(r => maqraKelompok(r.cabang_lomba) === cabang);

  _filteredHasil = q ? base.filter(r =>
    (r.nama_lengkap||'').toLowerCase().includes(q) ||
    (r.nomor_pendaftaran||'').toLowerCase().includes(q) ||
    (r.maqra_teks||'').toLowerCase().includes(q) ||
    (r.kecamatan||'').toLowerCase().includes(q)
  ) : base;

  maqraRenderHasilTable(_filteredHasil);
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
  // FIX #30: cabang di sini nama kelompok — cocokkan existingForCabang
  // lewat maqraKelompok() juga, supaya baris lama ber-gender ikut
  // terhitung (nomor urut & cek duplikat tetap akurat gabungan).
  const existingForCabang = _allMaqra.filter(m => maqraKelompok(m.cabang_lomba) === cabang);
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
// FIX #38: sebelumnya SELALU mengekspor _allHasil (SEMUA hasil,
// mengabaikan filter cabang & kotak pencarian yang sedang aktif di
// tabel) — tidak konsisten dgn maqraDownloadAllBukti() tepat di bawah
// (FIX #34 poin 3) yang sudah lebih dulu mengikuti filter aktif.
// Sekarang keduanya konsisten: "Export CSV" mengekspor PERSIS baris
// yang sedang TAMPIL di tabel "Hasil Pengambilan Maqra" saat tombol
// ini diklik. _filteredHasil SELALU sinkron dgn tabel — diperbarui di
// maqraFilterHasil(), yang dipanggil baik saat data pertama kali
// dimuat (lihat maqraLoadData()) MAUPUN setiap kali cabang/pencarian
// diubah (oninput/onchange #maqraSearchHasil & #maqraFilterHasilCabang
// di doyourmagic.html) — jadi dipakai LANGSUNG di sini tanpa fallback
// diam-diam ke _allHasil: kalau filter yang aktif memang menghasilkan
// 0 baris, ekspornya pun SEHARUSNYA kosong (bukan malah mengekspor
// semua data begitu saja).
function maqraExportHasil() {
  const rows = _filteredHasil;
  if (!rows.length) {
    maqraShowToast(
      'Kosong',
      _allHasil.length
        ? 'Tidak ada hasil yang cocok dengan filter/pencarian saat ini untuk diekspor. Ubah/hapus filter dulu kalau ingin ekspor semua data.'
        : 'Belum ada data untuk diekspor',
      'info'
    );
    return;
  }
  const header  = ['No','Nomor Pendaftaran','Nama','Kecamatan','Cabang Lomba','Maqra','Detail Maqra','Nomor Undian','Waktu'];
  const csvRows = rows.map((r, i) => [
    i+1, r.nomor_pendaftaran||'', r.nama_lengkap||'', r.kecamatan||'',
    r.cabang_lomba||'', r.maqra_teks||'', r.maqra_detail||'', r.nomor_maqra||'', r.timestamp||''
  ]);
  const csv  = [header,...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `HasilMaqra_MTQ2026_${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const filterAktif = rows.length !== _allHasil.length;
  maqraShowToast('Berhasil', `File CSV berhasil diunduh (${rows.length} baris${filterAktif ? ', sesuai filter aktif' : ''})`, 'success');
}

// FIX #34 (poin 3): download semua "Bukti Maqra" dari data yang SEDANG
// TAMPIL di tabel Hasil Pengambilan (ikut filter cabang + pencarian aktif
// — lihat maqraFilterHasil()/_filteredHasil di atas), digabung jadi 1
// file HTML. Tiap bukti otomatis di halaman cetak sendiri lewat
// page-break-after (sudah diatur di BUKTI_MAQRA_STYLES, bukan diulang
// di sini). Pakai buildBuktiMaqraCardHtml() yang SAMA dengan
// downloadBukti() perorangan di cek-maqra.js (keduanya dari
// js/kartu-bukti-shared.js) — jadi desain per-kartunya selalu identik,
// termasuk kolom tanda tangan panitia & admin kecamatan.
// FIX: dulu diunduh sbg 1 file .html + window.print() (mengandalkan
// dialog print browser utk "Simpan sbg PDF" manual) -- sekarang PDF
// asli langsung disusun lewat downloadBuktiMaqraPdf() (SATU SUMBER jg
// dgn downloadBukti() perorangan di cek-maqra.js dan
// maqraAmbilDownloadBukti() di bawah), 1 kartu = 1 halaman.
async function maqraDownloadAllBukti() {
  const rows = (_filteredHasil && _filteredHasil.length) ? _filteredHasil : _allHasil;
  if (!rows.length) {
    maqraShowToast('Kosong', 'Tidak ada hasil pengambilan maqra untuk diunduh (cek filter/pencarian).', 'warning');
    return;
  }
  if (typeof buildBuktiMaqraCardHtml !== 'function' || typeof downloadBuktiMaqraPdf !== 'function') {
    maqraShowToast('Error', 'Komponen bukti maqra belum termuat — muat ulang halaman.', 'error');
    return;
  }

  // Tiap baris "hasil" sudah gabungan data peserta + data maqra dalam 1
  // objek datar (nama_lengkap, nomor_pendaftaran, cabang_lomba,
  // kecamatan, maqra_teks, maqra_detail, nomor_maqra) — jadi bisa dikirim
  // sebagai rec MAUPUN m sekaligus ke buildBuktiMaqraCardHtml().
  const cards = rows.map(r => buildBuktiMaqraCardHtml(r, r, maqraEsc));
  const fname = `Bukti_Maqra_MTQ2026_Borongan_${rows.length}_${new Date().toISOString().slice(0,10)}.pdf`;

  maqraShowLoading(true, `Membuat PDF 0/${rows.length}...`);
  try {
    await downloadBuktiMaqraPdf(cards, fname, (i, total) => {
      maqraShowLoading(true, `Membuat PDF ${i+1}/${total}...`);
    });
    maqraShowToast('Berhasil', `${rows.length} bukti maqra diunduh dalam 1 file PDF (${rows.length} halaman).`, 'success');
  } catch (err) {
    maqraShowToast('Gagal', 'Gagal membuat PDF: ' + err.message, 'error', 6000);
  } finally {
    maqraShowLoading(false);
  }
}

// ── Session expired ───────────────────────────────────────────
function maqraHandleSessionExpired() {
  _maqraToken = null;
  maqraClearToken_();
  // Kembalikan ke halaman login admin.js
  if (typeof showLoginGate === 'function') showLoginGate();
  else if (typeof doLogout === 'function') doLogout();
  maqraShowToast('Sesi Habis', 'Silakan login kembali', 'warning', 5000);
}

// ── JSONP Transport ───────────────────────────────────────────
// FIX #22: sama seperti FIX #15 (doyourmagic.html) / FIX #19 (penilaian.html)
// — dulu `delete window[cb]` dipanggil di jalur timeout juga, jadi kalau
// respons ASLI baru datang setelah kita menyerah (server cuma lambat),
// browser meledak "ReferenceError: ...is not defined" alih-alih memproses
// data yang sebenarnya sudah berhasil. Sekarang window[cb] hanya dihapus
// di onerror (yang berarti browser sudah pasti tidak akan mencoba lagi),
// bukan di timeout.
// rev 13: fetch TANPA cookie lebih dulu (MTQ_HTTP di js/config.js) — <script>
// membawa cookie Google browser dan memicu "404 Not Found" saat browser login
// ke >1 akun Google. <script> lama (maqraJsonpGetScript_) jadi cadangan.
function maqraJsonpGet(params, timeout = 15000) {
  if (typeof MTQ_HTTP === 'undefined' || !MTQ_HTTP.available) return maqraJsonpGetScript_(params, timeout);
  const qs  = Object.entries(params)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return MTQ_HTTP.request(`${MAQRA_API_URL()}?${qs}`, { timeout: Math.max(timeout, 35000) })
    .catch((err) => {
      if (err && err.code === 'TIMEOUT') throw new Error('Timeout');
      return maqraJsonpGetScript_(params, timeout);
    });
}

function maqraJsonpGetScript_(params, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cb  = 'mtqMqG_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    const qs  = Object.entries(params)
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const s   = document.createElement('script');
    let timer, gaveUp = false;
    window[cb] = d => { clearTimeout(timer); s.remove(); resolve(d); };
    s.src    = `${MAQRA_API_URL()}?${qs}&callback=${cb}`;
    s.onerror = () => { if (gaveUp) return; gaveUp = true; clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer    = setTimeout(() => { if (gaveUp) return; gaveUp = true; s.remove(); reject(new Error('Timeout')); }, timeout);
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
// FIX #22: sama seperti maqraJsonpGet di atas — window[cb] tidak lagi
// dihapus di jalur timeout, cuma di onerror, supaya respons asli yang
// telat (bukan cuma teori — komentar di atas ini SENDIRI mendeskripsikan
// persis kejadian nyatanya: data tersimpan, respons gagal sampai) tidak
// meledak ReferenceError kalau toh masih ada pemanggil lama yang pakai
// fungsi deprecated ini.
function maqraJsonpPost(payload, timeout = 30000) {
  if (typeof MTQ_HTTP === 'undefined' || !MTQ_HTTP.available) return maqraJsonpPostScript_(payload, timeout);
  const enc = encodeURIComponent(JSON.stringify(payload));
  return MTQ_HTTP.request(`${MAQRA_API_URL()}?postData=${enc}`, { timeout: Math.max(timeout, 35000) })
    .catch((err) => {
      if (err && err.code === 'TIMEOUT') throw new Error('Timeout');
      return maqraJsonpPostScript_(payload, timeout);
    });
}

function maqraJsonpPostScript_(payload, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const cb  = 'mtqMqP_' + Date.now() + '_' + Math.floor(Math.random()*9999);
    const enc = encodeURIComponent(JSON.stringify(payload));
    const s   = document.createElement('script');
    let timer, gaveUp = false;
    window[cb] = d => { clearTimeout(timer); s.remove(); resolve(d); };
    s.src    = `${MAQRA_API_URL()}?postData=${enc}&callback=${cb}`;
    s.onerror = () => { if (gaveUp) return; gaveUp = true; clearTimeout(timer); delete window[cb]; s.remove(); reject(new Error('Network error')); };
    timer    = setTimeout(() => { if (gaveUp) return; gaveUp = true; s.remove(); reject(new Error('Timeout')); }, timeout);
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
// rev 13: aksi yang IDEMPOTEN di server (ambilMaqraAdmin: sudah punya maqra →
// hasil lama dikembalikan; saveMaqraConfig: upsert; deleteMaqra/Bulk: hapus
// yang sudah tiada = aman) diulang otomatis 2x dgn jeda acak bila gagal
// KONEKSI (bukan timeout, bukan respons server). Aksi lain (saveMaqra yang
// MENAMBAH baris) TIDAK diulang — bisa menggandakan data.
const MAQRA_IDEMPOTENT_POST_ = { ambilMaqraAdmin:1, saveMaqraConfig:1, deleteMaqra:1, deleteMaqraBulk:1 };
async function maqraPostJSON(payload, timeout = 30000) {
  const retries = (payload && MAQRA_IDEMPOTENT_POST_[payload.action]) ? 2 : 0;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await maqraPostJSONOnce_(payload, timeout); }
    catch (err) {
      lastErr = err;
      if (err && err.noRetry) throw err;
      if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1) + Math.floor(Math.random() * 800)));
    }
  }
  throw lastErr;
}

async function maqraPostJSONOnce_(payload, timeout = 30000) {
  const apiUrl = MAQRA_API_URL();
  if (!apiUrl) { const e = new Error('API_URL tidak terkonfigurasi — periksa js/config.js'); e.noRetry = true; throw e; }

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
      const te = new Error('Request timeout (' + Math.round(timeout / 1000) + 's) — server lambat merespons. Data mungkin sudah tersimpan; refresh untuk memastikan.');
      te.noRetry = true;   // timeout: request pertama mungkin masih berjalan — jangan digandakan
      throw te;
    }
    throw new Error('Gagal menghubungi server: ' + err.message);
  }
  clearTimeout(timer);

  if (!res.ok) { const he = new Error('Server merespons dengan status ' + res.status); if (res.status !== 404 && res.status < 500) he.noRetry = true; throw he; }
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
// ════════════════════════════════════════════════════════════
//  TAB: 🎯 Ambil Maqra Peserta — admin mengambilkan maqra ATAS
//  NAMA peserta (bukan peserta sendiri yang menekan tombol).
//  ────────────────────────────────────────────────────────────
//  • Sumber daftar peserta: adm.allData (state peserta yang sama
//    dipakai tab "👥 Daftar Peserta", dimuat via loadAll() di inline
//    script doyourmagic.html) — BUKAN endpoint baru, supaya tetap
//    SATU SUMBER data peserta untuk seluruh halaman admin.
//  • Backend: action POST 'ambilMaqraAdmin' (maqra.gs, apiAmbilMaqraAdmin_).
//    Sama persis dengan 'ambilMaqra' (peserta) — pilih acak dari maqra
//    tersedia utk cabang peserta, kunci hasil, idempoten (tidak bisa
//    ditarik ulang) — TAPI mengabaikan jadwal buka/tutup di tab
//    ⚙️ Jadwal Pengambilan, sesuai kebutuhan admin override.
//  • Animasi lantern-strip (teaser spin → panggil API sambil tetap
//    berputar pelan → deselerasi mendarat tepat di hasil → reveal +
//    partikel/confetti) mereplikasi startSpin() di cek-maqra.js
//    (dipakai cekstatus.html, sisi peserta) — mekanisme step-by-step-
//    nya SAMA PERSIS, cuma target elemen DOM & prefix nama fungsi beda
//    ("maqraAmbil...") karena beda dokumen/scope sepenuhnya.
// ════════════════════════════════════════════════════════════

let _maqraAmbilPage       = 1;
const MAQRA_AMBIL_PER_PAGE = 10;
let _maqraAmbilFiltered   = [];
// Urutan kolom tabel Ambil Maqra. key: null (urutan asli) | 'nomor' | 'nama' |
// 'kec' | 'cabang' | 'status'. dir: 'asc' | 'desc'. Lihat maqraAmbilSortBy().
let _maqraAmbilSort       = { key: null, dir: 'asc' };
let _maqraAmbilTarget     = null;   // peserta (row adm.allData) yang sedang diproses di modal
let _maqraAmbilSpinning   = false;
let _maqraAmbilLastResult = null;   // { peserta, maqra } — utk tombol "Download Bukti" di modal

// ── Init: dipanggil tiap kali tab "Ambil Maqra Peserta" dibuka ──
// (bukan cuma sekali per sesi halaman seperti maqraInit() —  tabel
// peserta di sini perlu selalu mencerminkan status verifikasi/hasil
// pengambilan TERBARU tiap kali admin membuka tab ini).
function maqraAmbilInit() {
  if (typeof adm === 'undefined') {
    maqraSetTbodyMsg_('maqraAmbilTbody', 6, 'Gagal memuat: state admin tidak ditemukan.');
    return;
  }
  // Data peserta (adm.allData) mungkin belum pernah dimuat kalau admin
  // langsung membuka Manajemen Maqra tanpa pernah membuka tab Daftar
  // Peserta lebih dulu — muat dulu kalau masih kosong.
  if (!adm.allData || !adm.allData.length) {
    maqraSetTbodyMsg_('maqraAmbilTbody', 6, '⏳ Memuat data peserta...');
    if (typeof loadAll === 'function') {
      loadAll(() => { maqraAmbilPopulateFilters(); maqraAmbilFilter(); });
    }
    return;
  }
  maqraAmbilPopulateFilters();
  maqraAmbilFilter();
}

// Tombol "🔄 Refresh" di tab ini — muat ulang peserta (loadAll) DAN
// data maqra (maqraLoadData, utk status tersedia/diambil paling baru),
// baru render ulang. maqraLoadData() sudah membawa loading overlay-nya
// sendiri (lihat maqraShowLoading di dalamnya), jadi tidak perlu
// dibungkus loading terpisah di sini.
async function maqraAmbilRefresh() {
  await new Promise(res => {
    if (typeof loadAll === 'function') loadAll(() => res());
    else res();
  });
  maqraAmbilPopulateFilters();
  await maqraLoadData();   // hook di maqraLoadData() akan memanggil maqraAmbilFilter() lagi di akhir
}

function maqraSetTbodyMsg_(id, colspan, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:24px;color:var(--gray-400)">${msg}</td></tr>`;
}

// ── Filter dropdowns ────────────────────────────────────────
// Kecamatan: unik dari adm.allData (SAMA seperti populateFilterDropdowns()
// di tab Daftar Peserta — tidak menyalin daftar kecamatan secara terpisah).
// Cabang: SATU SUMBER yang sama dgn tab lain di halaman Maqra ini
// (MAQRA_KELOMPOK_LIST — 14 kelompok, tanpa akhiran Putra/Putri).
function maqraAmbilPopulateFilters() {
  const kecs = [...new Set((adm.allData || []).map(r => r.kecamatan).filter(Boolean))].sort();
  const kecSel = document.getElementById('maqraAmbilFilterKec');
  if (kecSel) {
    const sv = kecSel.value;
    kecSel.innerHTML = '<option value="">Semua Kecamatan</option>' + kecs.map(k => `<option>${maqraEsc(k)}</option>`).join('');
    kecSel.value = sv;
  }
  const cabSel = document.getElementById('maqraAmbilFilterCabang');
  if (cabSel) {
    const sv = cabSel.value;
    while (cabSel.options.length > 1) cabSel.remove(1);
    MAQRA_KELOMPOK_LIST.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      cabSel.appendChild(opt);
    });
    cabSel.value = sv;
  }
}

// Sumber kebenaran "sudah ambil maqra?" SAMA dengan tab "Hasil
// Pengambilan" (_allHasil) — bukan dihitung ulang dengan cara lain,
// supaya kedua tab selalu konsisten satu sama lain.
function maqraAmbilSudahAmbil_(nomor) {
  return _allHasil.find(r => r.nomor_pendaftaran === nomor) || null;
}

// Masih ada maqra yang tersedia (belum diambil) di kelompok/cabang peserta
// ini? Dipakai maqraAmbilFilter() untuk menyembunyikan peserta yang
// cabangnya sudah kehabisan maqra (belum ambil + tidak ada maqra tersedia).
// (Pemanggil WAJIB sudah memastikan data maqra termuat — _maqraLoaded —
// lihat guard di awal maqraAmbilFilter().)
function maqraAmbilAdaMaqraTersedia_(r) {
  const kelompok = maqraKelompok(r.cabang_lomba);
  return _allMaqra.some(m => maqraKelompok(m.cabang_lomba) === kelompok && !m.sudah_diambil);
}

// ── Filter + render ─────────────────────────────────────────
// keepPage=false (default, dipakai pencarian/filter/sort/buka tab) → kembali
// ke halaman 1 karena hasil filternya berubah. keepPage=true (dipakai setelah
// pengambilan maqra / tutup modal / refresh data) → tetap di halaman yang
// sedang dibuka admin (otomatis dikurangi kalau halamannya sudah tidak ada,
// mis. karena baris hilang setelah maqra cabang itu habis).
function maqraAmbilFilter(keepPage) {
  if (typeof adm === 'undefined') return;

  // Data maqra (_allMaqra/_allHasil) belum termuat dari server → status
  // "tersedia/habis" belum bisa ditentukan. Jangan render baris dulu:
  // dengan _allMaqra masih kosong SEMUA peserta akan salah tampil sebagai
  // "Maqra habis". maqraLoadData() memanggil maqraAmbilFilter() lagi
  // begitu data berhasil dimuat, jadi tabel terisi otomatis setelahnya.
  if (!_maqraLoaded) {
    _maqraAmbilFiltered = [];
    maqraSetTbodyMsg_('maqraAmbilTbody', 6, '⏳ Memuat data maqra... (jika terlalu lama, klik 🔄 Refresh)');
    const bar = document.getElementById('maqraAmbilPagination');
    if (bar) bar.innerHTML = '';
    return;
  }

  const q      = (document.getElementById('maqraAmbilSearch')?.value || '').toLowerCase().trim();
  const kec    = document.getElementById('maqraAmbilFilterKec')?.value || '';
  const cabang = document.getElementById('maqraAmbilFilterCabang')?.value || '';
  const status = document.getElementById('maqraAmbilFilterStatus')?.value || '';

  // Hanya peserta Terverifikasi — sama seperti gerbang di FE peserta
  // (cek-maqra.js hanya menampilkan langkah "Ambil Maqra" utk status
  // ini, lihat goToMaqraStep()/renderStatusArea() di sana).
  const base = (adm.allData || []).filter(r => String(r.status_verifikasi || '').trim() === 'Terverifikasi');

  // Statistik SELALU dari base (peserta Terverifikasi) — tidak ikut
  // menyempit oleh pencarian/filter tabel di bawah, sama seperti kartu
  // statistik di tab "📋 Daftar Maqra" yang juga selalu menunjukkan
  // total keseluruhan, bukan hasil filter tabel saat itu.
  const sudahCount = base.filter(r => !!maqraAmbilSudahAmbil_(r.nomor_pendaftaran)).length;
  maqraSetEl('maqraAmbilStatTotal', base.length);
  maqraSetEl('maqraAmbilStatSudah', sudahCount);
  maqraSetEl('maqraAmbilStatBelum', base.length - sudahCount);

  // Sembunyikan peserta yang belum ambil maqra DAN maqra di cabangnya sudah
  // habis. Yang tampil hanya: (a) yang masih bisa diambilkan maqra (cabang
  // ready di tab Daftar Maqra), dan (b) yang sudah pernah mengambil maqra.
  // Kartu statistik di atas tetap dihitung dari `base` (total sebenarnya).
  let rows = base.filter(r =>
    !!maqraAmbilSudahAmbil_(r.nomor_pendaftaran) || maqraAmbilAdaMaqraTersedia_(r)
  );
  if (q) rows = rows.filter(r =>
    String(r.nama_lengkap || '').toLowerCase().includes(q) ||
    String(r.nomor_pendaftaran || '').toLowerCase().includes(q)
  );
  if (kec)    rows = rows.filter(r => r.kecamatan === kec);
  if (cabang) rows = rows.filter(r => maqraKelompok(r.cabang_lomba) === cabang);
  if (status === 'sudah') rows = rows.filter(r =>  !!maqraAmbilSudahAmbil_(r.nomor_pendaftaran));
  if (status === 'belum') rows = rows.filter(r =>  !maqraAmbilSudahAmbil_(r.nomor_pendaftaran));

  rows = maqraAmbilApplySort_(rows);

  _maqraAmbilFiltered = rows;
  if (keepPage === true) {
    const totalPages = Math.max(1, Math.ceil(rows.length / MAQRA_AMBIL_PER_PAGE));
    _maqraAmbilPage = Math.min(Math.max(1, _maqraAmbilPage), totalPages);
  } else {
    _maqraAmbilPage = 1;
  }
  maqraAmbilUpdateSortHeaders_();
  maqraAmbilRenderList();
}

// ── Sort per kolom ───────────────────────────────────────────
const _maqraAmbilCollator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

function maqraAmbilSortValue_(r, key) {
  switch (key) {
    case 'nomor':  return String(r.nomor_pendaftaran || '');
    case 'nama':   return String(r.nama_lengkap || '');
    case 'kec':    return String(r.kecamatan || '');
    case 'cabang': return String(r.cabang_lomba || '');
    // Belum Ambil (0) lebih dulu dari Sudah Ambil (1) pada urutan naik.
    case 'status': return maqraAmbilSudahAmbil_(r.nomor_pendaftaran) ? 1 : 0;
    default:       return '';
  }
}

function maqraAmbilApplySort_(rows) {
  const { key, dir } = _maqraAmbilSort;
  if (!key) return rows;
  const mul = dir === 'desc' ? -1 : 1;
  const byNomor = (a, b) => _maqraAmbilCollator.compare(String(a.nomor_pendaftaran || ''), String(b.nomor_pendaftaran || ''));
  return rows.slice().sort((a, b) => {
    const va = maqraAmbilSortValue_(a, key), vb = maqraAmbilSortValue_(b, key);
    const c = (typeof va === 'number' && typeof vb === 'number')
      ? va - vb
      : _maqraAmbilCollator.compare(va, vb);
    if (c !== 0) return c * mul;
    return byNomor(a, b);   // tie-breaker: No. Daftar naik (tidak ikut dibalik)
  });
}

// Klik header: urutan naik → turun → kembali ke urutan asli.
function maqraAmbilSortBy(key) {
  if (_maqraAmbilSort.key !== key)          _maqraAmbilSort = { key, dir: 'asc' };
  else if (_maqraAmbilSort.dir === 'asc')   _maqraAmbilSort = { key, dir: 'desc' };
  else                                       _maqraAmbilSort = { key: null, dir: 'asc' };
  maqraAmbilFilter();   // urutan berubah → mulai dari halaman 1
}

// Panah "⇅" pudar = kolom belum jadi acuan urutan; "▲"/"▼" = kolom aktif.
// Memakai kelas .stats-th-sort / .stats-sort-arrow yang sudah ada di
// doyourmagic.html (sama seperti tabel Rekap di halaman Statistik).
function maqraAmbilUpdateSortHeaders_() {
  document.querySelectorAll('#maqraAmbilThead th[data-sort-key]').forEach(th => {
    const active = th.getAttribute('data-sort-key') === _maqraAmbilSort.key;
    th.classList.toggle('active', active);
    const arrow = th.querySelector('.stats-sort-arrow');
    if (arrow) arrow.textContent = active ? (_maqraAmbilSort.dir === 'asc' ? '▲' : '▼') : '⇅';
    th.setAttribute('aria-sort', active ? (_maqraAmbilSort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

function maqraAmbilRenderList() {
  const tbody = document.getElementById('maqraAmbilTbody');
  if (!tbody) return;
  const rows = _maqraAmbilFiltered;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="ei">📭</div><div>Tidak ada peserta yang cocok dengan filter ini (peserta dengan maqra habis disembunyikan)</div></div></td></tr>`;
    const bar = document.getElementById('maqraAmbilPagination');
    if (bar) bar.innerHTML = '';
    return;
  }

  const start = (_maqraAmbilPage - 1) * MAQRA_AMBIL_PER_PAGE;
  const slice = rows.slice(start, start + MAQRA_AMBIL_PER_PAGE);

  tbody.innerHTML = slice.map(r => {
    const hasil    = maqraAmbilSudahAmbil_(r.nomor_pendaftaran);
    const kelompok = maqraKelompok(r.cabang_lomba);
    const tersedia = _allMaqra.filter(m => maqraKelompok(m.cabang_lomba) === kelompok && !m.sudah_diambil).length;
    const n        = maqraEsc(r.nomor_pendaftaran);

    let statusCell, actionCell;
    if (hasil) {
      statusCell = `<span class="status-badge maqra-sudah">✅ Sudah Ambil</span>
        <div style="font-size:11px;color:var(--gray-400);margin-top:3px;max-width:210px;white-space:normal">${maqraEsc(hasil.maqra_teks || '')}</div>`;
      // FIX #37: sebelumnya cuma label statis "🔒 Terkunci" — maqra
      // MEMANG tidak bisa ditarik ulang (itu tetap benar, tidak
      // berubah), tapi kolom aksinya jadi mubazir/tidak berguna.
      // Sekarang jadi tombol unduh bukti PDF utk peserta ini, supaya
      // admin tidak perlu pindah ke tab "📊 Hasil Pengambilan Maqra"
      // dulu hanya utk mencetak ulang 1 bukti yang sudah lama diambil
      // (mis. berkasnya hilang/rusak). Lihat maqraAmbilDownloadBuktiRow().
      actionCell = `<button class="action-btn view" onclick="maqraAmbilDownloadBuktiRow('${n}')" title="Unduh ulang bukti maqra peserta ini sebagai PDF">🖨️ Unduh Bukti</button>`;
    } else if (!tersedia) {
      statusCell = `<span class="status-badge maqra-habis">⚠️ Belum Ambil</span>`;
      actionCell = `<span style="color:#dc2626;font-size:11px;font-weight:600">Maqra habis</span>`;
    } else {
      statusCell = `<span class="status-badge maqra-belum">⏳ Belum Ambil</span>`;
      actionCell = `<button class="action-btn verify" onclick="maqraAmbilOpenModal('${n}')">🎯 Ambilkan Maqra</button>`;
    }

    return `<tr>
      <td class="col-num">${n}</td>
      <td class="col-name">${maqraEsc(r.nama_lengkap || '—')}</td>
      <td class="col-kec">${maqraEsc(r.kecamatan || '—')}</td>
      <td class="col-cabang" style="font-size:12px">${maqraEsc(r.cabang_lomba || '—')}</td>
      <td>${statusCell}</td>
      <td class="col-act">${actionCell}</td>
    </tr>`;
  }).join('');

  maqraAmbilRenderPagination(rows.length);
}

function maqraAmbilRenderPagination(total) {
  const bar = document.getElementById('maqraAmbilPagination');
  if (!bar) return;
  const totalPages = Math.ceil(total / MAQRA_AMBIL_PER_PAGE);
  if (totalPages <= 1) { bar.innerHTML = `<span class="page-info">Total: ${total} peserta</span>`; return; }
  let html = `<button class="page-btn" ${_maqraAmbilPage===1?'disabled':''} onclick="maqraAmbilGoPage(${_maqraAmbilPage-1})">‹</button>`;
  for (let p = Math.max(1,_maqraAmbilPage-2); p <= Math.min(totalPages,_maqraAmbilPage+2); p++) {
    html += `<button class="page-btn ${p===_maqraAmbilPage?'active':''}" onclick="maqraAmbilGoPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" ${_maqraAmbilPage===totalPages?'disabled':''} onclick="maqraAmbilGoPage(${_maqraAmbilPage+1})">›</button>`;
  html += `<span class="page-info">Total: ${total} peserta</span>`;
  bar.innerHTML = html;
}
function maqraAmbilGoPage(p) { _maqraAmbilPage = p; maqraAmbilRenderList(); }

// ── Modal: buka ─────────────────────────────────────────────
function maqraAmbilOpenModal(nomor) {
  const peserta = (adm.allData || []).find(r => r.nomor_pendaftaran === nomor);
  if (!peserta) { maqraShowToast('Gagal', 'Data peserta tidak ditemukan — refresh dan coba lagi.', 'error'); return; }
  if (maqraAmbilSudahAmbil_(nomor)) {
    maqraShowToast('Info', 'Peserta ini sudah mengambil maqra sebelumnya.', 'info');
    maqraAmbilFilter(true);
    return;
  }

  const kelompok  = maqraKelompok(peserta.cabang_lomba);
  const available = _allMaqra.filter(m => maqraKelompok(m.cabang_lomba) === kelompok && !m.sudah_diambil);
  if (!available.length) {
    maqraShowToast('Maqra Habis', `Semua maqra untuk "${kelompok}" sudah diambil. Tambahkan maqra baru di tab 📋 Daftar Maqra.`, 'warning', 6000);
    return;
  }

  _maqraAmbilTarget = peserta;

  document.getElementById('ambilMaqraNomor').textContent  = peserta.nomor_pendaftaran;
  document.getElementById('ambilMaqraNama').textContent   = peserta.nama_lengkap || '—';
  document.getElementById('ambilMaqraKec').textContent    = peserta.kecamatan || '—';
  document.getElementById('ambilMaqraCabang').textContent = peserta.cabang_lomba || '—';

  // Reset tampilan ke kondisi awal (siap, belum spin) — penting kalau
  // modal ini sebelumnya sudah dipakai utk peserta lain.
  const reveal = document.getElementById('admResultReveal');
  reveal.classList.remove('show');
  reveal.style.display = 'none';
  document.getElementById('admSpinStatus').textContent = 'Siap mengambil maqra...';
  document.getElementById('ambilMaqraActionsIdle').style.display = 'flex';
  document.getElementById('ambilMaqraActionsDone').style.display = 'none';
  document.getElementById('ambilMaqraWarnNote').style.display = 'block';
  const btn = document.getElementById('admSpinBtn');
  if (btn) btn.disabled = false;

  maqraAmbilBuildStars();
  maqraAmbilBuildLanternStrip(available);

  document.getElementById('ambilMaqraModal').removeAttribute('data-locked');
  openModal('ambilMaqraModal');
}

// Wrapper close — menolak menutup selagi proses pengambilan berjalan
// (data-locked juga menjaga klik-backdrop, lihat handler generik di
// inline script doyourmagic.html; ini menjaga tombol ✕/Batal/Escape).
function maqraAmbilCloseModal() {
  if (_maqraAmbilSpinning) return;
  closeModal('ambilMaqraModal');
  maqraAmbilFilter(true);   // sinkronkan tabel (tetap di halaman yang sedang dibuka)
}

function maqraAmbilBuildStars() {
  const sf = document.getElementById('admStarField');
  if (!sf) return;
  sf.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random()*3+1;
    s.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;--s-dur:${(Math.random()*2+1.5).toFixed(1)}s;--s-delay:${(Math.random()*3).toFixed(1)}s`;
    sf.appendChild(s);
  }
}

function maqraAmbilBuildLanternStrip(list) {
  const strip = document.getElementById('admLanternStrip');
  if (!strip) return;
  strip.innerHTML = '';
  // 6x repeat agar zona aman cukup panjang — sama seperti buildLanternStrip() di cek-maqra.js
  [...list,...list,...list,...list,...list,...list].forEach(item => {
    const div = document.createElement('div');
    div.className   = 'lantern-item';
    div.textContent = item.maqra_teks || '—';
    strip.appendChild(div);
  });
}

// FIX #36: pemanggil khusus action 'ambilMaqraAdmin' dgn retry OTOMATIS
// — pelengkap perubahan di apiAmbilMaqraAdmin_ (maqra.gs): lock di
// server sekarang menunggu s/d 30 dtk (naik dari 10 dtk) sebelum
// menyerah, jadi timeout di sini SENGAJA dibuat lebih besar (40 dtk)
// supaya klien tidak menyerah duluan sebelum server sempat membalas
// apa pun. Kalau server MASIH balas busy:true juga (antrean admin
// benar2 sangat panjang/ekstrem — kasus langka, karena 30 dtk di
// server SUDAH menampung sebagian besar tabrakan wajar), coba SEKALI
// LAGI otomatis dgn jeda singkat, sambil memberi tahu admin lewat
// statusEl — supaya tabrakan antar-admin pulih sendiri ("smooth")
// tanpa admin perlu sadar ada error lalu klik ulang manual. Respons
// gagal LAIN (peserta tak ditemukan, belum Terverifikasi, maqra
// habis, sesi tidak valid, dst) TIDAK diulang — itu bukan soal
// tabrakan/antre, mengulang tidak akan mengubah hasilnya, jadi
// langsung dikembalikan ke pemanggil apa adanya.
async function maqraAmbilCallAmbilAdmin_(nomor, statusEl) {
  const RETRY_DELAYS_MS = [2000];   // 1x percobaan ulang, jeda 2 dtk
  for (let attempt = 0; ; attempt++) {
    const data = await maqraPostJSON(
      { action:'ambilMaqraAdmin', token:_maqraToken, nomor_pendaftaran:nomor },
      40000
    );
    if (data.success || !data.busy || attempt >= RETRY_DELAYS_MS.length) {
      return data;
    }
    const wait = RETRY_DELAYS_MS[attempt];
    if (statusEl) statusEl.textContent = `⏳ Server sibuk (banyak admin bersamaan), mencoba lagi...`;
    await maqraSleep_(wait);
    if (statusEl) statusEl.textContent = '🔐 Mengunci pilihan...';
  }
}

// ── Modal: mulai pengambilan (spin) ────────────────────────
// Logika step-by-step mereplikasi startSpin() di cek-maqra.js — lihat
// komentar di sana utk penjelasan lengkap tiap fase. Beda di sini:
// action backend 'ambilMaqraAdmin' (bukan 'ambilMaqra'), pemanggilan
// lewat maqraAmbilCallAmbilAdmin_() yang otomatis retry sekali kalau
// server balas busy:true (FIX #36 — lihat komentarnya), dan pemulihan
// tambahan lewat maqraLoadData() kalau respons jaringan tidak jelas.
async function maqraAmbilStartDraw() {
  if (_maqraAmbilSpinning || !_maqraAmbilTarget) return;
  _maqraAmbilSpinning = true;

  const overlay = document.getElementById('ambilMaqraModal');
  overlay.setAttribute('data-locked', '1');   // cegah tutup lewat klik backdrop selama proses (pola sama dgn confirmModal)

  const btn    = document.getElementById('admSpinBtn');
  const status = document.getElementById('admSpinStatus');
  const strip  = document.getElementById('admLanternStrip');
  const reveal = document.getElementById('admResultReveal');

  if (btn) btn.disabled = true;
  reveal.classList.remove('show');
  status.textContent = '🌟 Mengambil maqra...';

  const itemH      = 50;
  const totalItems = strip.childElementCount;
  const safeMax    = Math.floor(totalItems * 0.55) * itemH;
  const wrapPos    = Math.floor(totalItems / 6) * itemH;

  let offset = wrapPos;
  strip.style.transition = 'none';
  strip.style.transform  = `translateY(-${offset}px)`;
  void strip.offsetHeight;

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

  function finishWithError_(msg) {
    maqraShowToast('Gagal', msg, 'error', 6000);
    status.textContent = 'Gagal. Silakan coba lagi.';
    if (btn) btn.disabled = false;
    overlay.removeAttribute('data-locked');
    _maqraAmbilSpinning = false;
  }

  // Phase 1: teaser spin — akselerasi bertahap
  const phases = [ { dur:320, count:5 }, { dur:220, count:8 }, { dur:175, count:10 }, { dur:150, count:10 } ];
  for (const ph of phases) {
    for (let i = 0; i < ph.count; i++) { stepSpin(ph.dur); await maqraSleep_(ph.dur + 8); }
  }

  // Phase 2: panggil backend sambil tetap berputar pelan (supaya tidak
  // terlihat freeze selama menunggu server, yang bisa makan beberapa detik)
  status.textContent = '🔐 Mengunci pilihan...';
  let keepSpinning = true;
  (async () => { while (keepSpinning) { stepSpin(260); await maqraSleep_(268); } })();

  let chosen = null, wasAlready = false;
  try {
    const data = await maqraAmbilCallAmbilAdmin_(_maqraAmbilTarget.nomor_pendaftaran, status);
    keepSpinning = false;

    if (!data.success) {
      if (data.message === 'Sesi tidak valid') {
        overlay.removeAttribute('data-locked');
        _maqraAmbilSpinning = false;
        maqraHandleSessionExpired();
        return;
      }
      finishWithError_(data.message || 'Terjadi kesalahan. Coba lagi.');
      return;
    }
    chosen     = data.maqra;
    wasAlready = !!data.sudahAmbil;
    if (wasAlready) maqraShowToast('Info', data.message || 'Peserta ini sudah mengambil maqra sebelumnya.', 'info', 5000);
  } catch (err) {
    keepSpinning = false;
    // FIX: respons gagal sampai BUKAN berarti operasinya gagal di server
    // — bisa saja sudah tersimpan, cuma balasannya yang tidak sampai ke
    // browser (pola sama dgn reconcileAfterWriteError_ di inline script
    // utama doyourmagic.html). Cek ulang lewat maqraLoadData(), baru
    // putuskan gagal/berhasil yang sebenarnya — bukan langsung diasumsikan
    // gagal begitu saja.
    status.textContent = '🔎 Memeriksa status ke server...';
    maqraShowToast('Memeriksa…', 'Respons tidak jelas — memeriksa ulang ke server', 'info', 3000);
    try {
      await maqraLoadData();
      const recheck = maqraAmbilSudahAmbil_(_maqraAmbilTarget.nomor_pendaftaran);
      if (recheck) {
        chosen     = { maqra_teks:recheck.maqra_teks, maqra_detail:recheck.maqra_detail, nomor_maqra:recheck.nomor_maqra };
        wasAlready = true;
        maqraShowToast('Sudah tersimpan', 'Ternyata berhasil di server — respons-nya saja yang sempat gagal sampai.', 'success', 5000);
      } else {
        finishWithError_(err.message + ' — silakan coba lagi.');
        return;
      }
    } catch (err2) {
      finishWithError_('Tidak bisa memastikan status — silakan refresh manual.');
      return;
    }
  }

  // Phase 3: deselerasi mendarat tepat di maqra terpilih. Kalau
  // wasAlready (hasil lama, atau hasil dari pemeriksaan ulang di atas),
  // langsung lompat ke reveal — tidak ada "penarikan baru" yang perlu
  // dianimasikan mendarat.
  if (!wasAlready) {
    status.textContent = '✨ Maqra ditemukan!';
    const items    = Array.from(strip.children);
    const refTxt   = (chosen.maqra_teks || '').trim();
    const curIdx   = offset / itemH;
    const minAhead = 15;
    let targetIdx = -1;
    for (let i = Math.ceil(curIdx) + minAhead; i < items.length - 5; i++) {
      if ((items[i].textContent || '').trim() === refTxt) { targetIdx = i; break; }
    }
    if (targetIdx === -1) {
      for (let i = Math.ceil(curIdx) + 1; i < items.length; i++) {
        if ((items[i].textContent || '').trim() === refTxt) { targetIdx = i; break; }
      }
    }
    if (targetIdx === -1) targetIdx = items.length - 1;

    const lanternBox    = document.getElementById('admLanternBox');
    const windowH       = lanternBox ? lanternBox.clientHeight : 190;
    const windowCenterY = windowH / 2;
    const targetY       = targetIdx * itemH - windowCenterY + itemH / 2;

    strip.style.transition = 'transform 2s cubic-bezier(0.16,1,0.3,1)';
    strip.style.transform  = `translateY(-${targetY}px)`;
    await maqraSleep_(2100);

    items.forEach(it => it.classList.remove('highlight'));
    if (items[targetIdx]) {
      items[targetIdx].classList.add('highlight');
      if (lanternBox) {
        const containerRect = lanternBox.getBoundingClientRect();
        const itemRect      = items[targetIdx].getBoundingClientRect();
        const diff = (itemRect.top + itemRect.height/2) - (containerRect.top + containerRect.height/2);
        if (Math.abs(diff) > 1) {
          const cur = parseFloat(strip.style.transform.replace('translateY(','').replace('px)','')) || 0;
          strip.style.transition = 'transform 0.3s ease-out';
          strip.style.transform  = `translateY(-${Math.abs(cur)+diff}px)`;
          await maqraSleep_(320);
        }
      }
    }
    await maqraSleep_(120);
  }

  // Phase 4: reveal
  document.getElementById('admResultAyat').textContent  = chosen.maqra_teks   || '—';
  document.getElementById('admResultSurah').textContent = chosen.maqra_detail || '—';
  document.getElementById('admResultNomor').textContent = `Nomor Undian: ${chosen.nomor_maqra || '—'}`;
  reveal.style.display = 'block';
  reveal.classList.add('show');
  if (!wasAlready) { maqraAmbilSpawnParticles(); maqraAmbilLaunchConfetti(); }

  document.getElementById('ambilMaqraActionsIdle').style.display = 'none';
  document.getElementById('ambilMaqraActionsDone').style.display = 'flex';
  document.getElementById('ambilMaqraWarnNote').style.display    = 'none';
  status.textContent = wasAlready ? 'ℹ️ Maqra peserta ini (sudah diambil sebelumnya)' : '🎉 Maqra berhasil diambilkan!';

  _maqraAmbilLastResult = { peserta:_maqraAmbilTarget, maqra:chosen };

  overlay.removeAttribute('data-locked');
  _maqraAmbilSpinning = false;

  // Sinkronkan _allMaqra/_allHasil (dipakai tab Daftar Maqra & Hasil
  // Pengambilan) + tabel di tab ini sendiri. SAMA seperti mutasi lain
  // di file ini (maqraSaveMaqra/maqraDelete/maqraSaveConfig dst SELALU
  // maqraLoadData() ulang setelah sukses, bukan menambal array lokal
  // secara manual) — supaya semua tab tetap konsisten dgn server, dan
  // tidak salah tandai kalau ada 2 maqra berteks identik dalam satu
  // cabang (lihat catatan anti-duplikat di maqraSaveMaqra).
  if (!wasAlready) maqraLoadData(); else maqraAmbilFilter(true);
}

function maqraSleep_(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Download Bukti (hasil pengambilan barusan di modal) ────
// Pakai buildBuktiMaqraCardHtml()/downloadBuktiMaqraPdf() yang SAMA dgn
// downloadBukti() di cek-maqra.js (peserta) dan maqraDownloadAllBukti()
// di file ini (borongan, tab Hasil Pengambilan) — satu sumber desain
// & mekanisme PDF utk ketiganya (lihat js/kartu-bukti-shared.js).
async function maqraAmbilDownloadBukti() {
  if (!_maqraAmbilLastResult) return;
  const { peserta, maqra } = _maqraAmbilLastResult;
  if (typeof buildBuktiMaqraCardHtml !== 'function' || typeof downloadBuktiMaqraPdf !== 'function') {
    maqraShowToast('Error', 'Komponen bukti maqra belum termuat — muat ulang halaman.', 'error');
    return;
  }
  maqraShowLoading(true, 'Membuat PDF bukti maqra...');
  try {
    const cardHtml = buildBuktiMaqraCardHtml(peserta, maqra, maqraEsc);
    const fname = `Bukti_Maqra_${(peserta.nomor_pendaftaran||'MTQ').replace(/[^A-Za-z0-9]/g,'_')}.pdf`;
    await downloadBuktiMaqraPdf([cardHtml], fname);
    maqraShowToast('Berhasil', 'Bukti maqra (PDF) diunduh', 'success');
  } catch (err) {
    maqraShowToast('Gagal', 'Gagal membuat PDF: ' + err.message, 'error', 6000);
  } finally {
    maqraShowLoading(false);
  }
}

// FIX #37: unduh bukti PDF langsung dari BARIS TABEL di tab "🎯 Ambil
// Maqra Peserta" — utk peserta yang SUDAH ambil maqra (kapan pun,
// bukan cuma hasil barusan di modal seperti maqraAmbilDownloadBukti()
// di atas). Dipanggil dari tombol "🖨️ Unduh Bukti" di
// maqraAmbilRenderList() (menggantikan label statis "🔒 Terkunci").
// Sumber data: _allHasil lewat maqraAmbilSudahAmbil_(nomor) — SATU
// SUMBER yang sama dgn yang dipakai merender status/kolom Aksi tabel
// ini sendiri, jadi selalu konsisten dgn apa yang terlihat di layar.
// Objek hasil (MAQRA_RESULT — lihat maqra.gs) sudah memuat SEMUA field
// yang dibutuhkan buildBuktiMaqraCardHtml (data peserta MAUPUN data
// maqra sekaligus dalam satu objek datar), jadi dikirim sebagai rec
// MAUPUN m sekaligus — pola SAMA PERSIS dgn maqraDownloadAllBukti()
// (borongan, tab Hasil Pengambilan) di atas file ini.
async function maqraAmbilDownloadBuktiRow(nomor) {
  const hasil = maqraAmbilSudahAmbil_(nomor);
  if (!hasil) {
    maqraShowToast('Gagal', 'Data bukti peserta ini tidak ditemukan — coba klik 🔄 Refresh lalu ulangi.', 'error');
    return;
  }
  if (typeof buildBuktiMaqraCardHtml !== 'function' || typeof downloadBuktiMaqraPdf !== 'function') {
    maqraShowToast('Error', 'Komponen bukti maqra belum termuat — muat ulang halaman.', 'error');
    return;
  }
  maqraShowLoading(true, 'Membuat PDF bukti maqra...');
  try {
    const cardHtml = buildBuktiMaqraCardHtml(hasil, hasil, maqraEsc);
    const fname = `Bukti_Maqra_${(hasil.nomor_pendaftaran||'MTQ').replace(/[^A-Za-z0-9]/g,'_')}.pdf`;
    await downloadBuktiMaqraPdf([cardHtml], fname);
    maqraShowToast('Berhasil', 'Bukti maqra (PDF) diunduh', 'success');
  } catch (err) {
    maqraShowToast('Gagal', 'Gagal membuat PDF: ' + err.message, 'error', 6000);
  } finally {
    maqraShowLoading(false);
  }
}

// ── Partikel & confetti (efek reveal) ──────────────────────
// Direplikasi dari spawnParticles()/launchConfetti() di cek-maqra.js —
// mekanisme SAMA persis, target elemen saja yang beda (#admParticles,
// #maqraAmbilConfetti — lihat markup modal & konten div confetti-
// container di doyourmagic.html).
function maqraAmbilSpawnParticles() {
  const c = document.getElementById('admParticles');
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

function maqraAmbilLaunchConfetti() {
  const cc = document.getElementById('maqraAmbilConfetti');
  if (!cc) return;
  cc.innerHTML = '';
  const cols = ['#059669','#fbbf24','#3b82f6','#ec4899','#a855f7','#f97316','#10b981'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('div');
    p.className = 'conf-piece';
    p.style.cssText = `left:${Math.random()*100}%;background:${cols[Math.floor(Math.random()*cols.length)]};width:${Math.random()*8+5}px;height:${Math.random()*8+5}px;border-radius:${Math.random()>.5?'50%':'2px'};--c-dx:${(Math.random()*200-100).toFixed(0)}px;--c-dur:${(Math.random()*2+2).toFixed(1)}s;--c-delay:${(Math.random()*.5).toFixed(2)}s`;
    cc.appendChild(p);
  }
  setTimeout(() => { cc.innerHTML = ''; }, 5500);
}