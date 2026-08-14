// ============================================================
//  MTQ 2026 — js/admin-penilaian.js
//  Panel Admin Sistem Penilaian — diload oleh admin.html
//
//  Membutuhkan (sudah tersedia dari admin.html):
//    window.adm.token   — token admin yang aktif
//    window.API_URL     — via config.js → window.MTQ_API_URL
//    jsonp(url,prefix,fn) — helper dari admin.html
//    toast(title,msg,type) — dari admin.html
//    showLoading() / hideLoading() — dari admin.html
//    showPage(name) — dari admin.html
// ============================================================

// ── Daftar Cabang MTQ 2026 ───────────────────────────────────
// Cabang list: SATU SUMBER di js/config.js → MTQ_CONFIG.CABANG_LIST
// (jangan hardcode array cabang lagi di sini — edit config.js saja)
const PN_CABANG_LIST = MTQ_CONFIG.CABANG_LIST;

// ── Helpers untuk baca API URL & token admin ─────────────────
// admin.html menyimpan keduanya sebagai `const` lokal (bukan window.*),
// tapi kita bisa membaca dari sumber yang benar:
//   • API URL  → window.MTQ_API_URL (di-set oleh config.js)
//   • Token    → sessionStorage 'mtq_admin_token' (sama yang disimpan admin.html)
function _pnApiUrl() {
  return (window.MTQ_API_URL || '').trim();
}
function _pnToken() {
  // Coba sessionStorage dulu (set saat login admin.html),
  // lalu fallback ke window.adm.token jika ada (jaga kompatibilitas)
  return sessionStorage.getItem('mtq_admin_token')
    || (window.adm && window.adm.token)
    || '';
}

// ── Self-contained JSONP helper — TIDAK bergantung pada jsonp() admin.html ──
// Masalah utama: jsonp() di admin.html membuat callback bernama cbPrefix+'_'+Date.now().
// Jika dua panggilan pnGet('getHakim') terjadi dalam <1ms yang sama (sangat mungkin
// di Promise.all), keduanya mendapat nama yang SAMA → yang kedua menimpa yang pertama
// → saat GAS merespons panggilan pertama, fungsi callback sudah tidak ada → ReferenceError.
//
// Solusi: buat JSONP helper sendiri dengan nama callback yang UNIK menggunakan
// counter global (incrementing) + komponen acak. Tidak pernah bisa collision.
//
// FIX #22: masalah TERPISAH yang sama bahayanya — window[name] dulu dihapus
// di finish(), yang dipanggil dari SEMUA jalur termasuk timeout. Kalau
// timeout "menyerah" duluan lalu respons ASLI baru datang (server cuma
// lambat, bukan mati), callback yang sudah dihapus itu bikin browser
// meledak "ReferenceError: ...is not defined" — bug yang sama persis
// dengan yang ditemukan & diperbaiki di doyourmagic.html (FIX #15),
// penilaian.html (FIX #19), dan admin-maqra.js (FIX #22). Sekarang
// window[name] hanya dihapus di onerror (browser sudah pasti tidak akan
// mencoba lagi), bukan di timeout — respons yang telat tetap diproses
// normal lewat handler sukses.
let _pnSeq = 0;
function _pnFetch(url, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve) {
    // Callback name: _pnCb<seq>_<random5> — tidak pernah collision walau 1000 panggilan/ms
    const name = '_pnCb' + (++_pnSeq) + '_' + Math.random().toString(36).slice(2, 7);
    const s = document.createElement('script');
    let gaveUp = false;

    // Respons ASLI — selalu diproses, baik tepat waktu maupun telat
    // setelah timeout sudah menyerah duluan (self-healing, lihat FIX #22).
    window[name] = function(data) {
      clearTimeout(t);
      try { if (s.parentNode) s.remove(); } catch(e) {}
      resolve(data || { success: false, error: 'no_response' });
    };
    s.onerror = function() {
      if (gaveUp) return;
      gaveUp = true;
      clearTimeout(t);
      try { delete window[name]; } catch(e) {}
      try { if (s.parentNode) s.remove(); } catch(e) {}
      resolve({ success: false, error: 'script_load_failed' });
    };
    var t = setTimeout(function() {
      if (gaveUp) return;
      gaveUp = true;
      try { if (s.parentNode) s.remove(); } catch(e) {}
      resolve({ success: false, error: 'timeout' });
      // FIX #22: window[name] SENGAJA tidak dihapus di sini.
    }, timeout);
    s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
    document.head.appendChild(s);
  });
}

function pnGet(action, extraParams) {
  const token = encodeURIComponent(_pnToken());
  const base  = _pnApiUrl() + '?action=' + action + '&token=' + token;
  const qs    = extraParams ? '&' + new URLSearchParams(extraParams).toString() : '';
  return _pnFetch(base + qs);
}

function pnPost(action, payload) {
  const token      = encodeURIComponent(_pnToken());
  const payloadStr = JSON.stringify(payload || {});
  const url = _pnApiUrl() + '?action=' + action + '&token=' + token + '&payload=' + encodeURIComponent(payloadStr);
  return _pnFetch(url);
}

// ── State lokal untuk modul penilaian ───────────────────────
const PN = {
  tempHakimCabang: [],   // cabang dipilih saat TAMBAH hakim (chips)
  editCabang: {},        // { [hakimId]: string[] } — cabang saat EDIT hakim
  tempParams: [],        // parameter yang sedang diedit
};

// ── Cache sistem penilaian (in-memory, cleared on logout/refresh) ──
// Data di-request sekali dari GAS; berikutnya dibaca dari cache.
// Admin bisa paksa reload via tombol 🔄 Refresh di setiap tab.
const _pnCache = {
  hakim  : null,   // { data: [...], ts: Date }
  param  : null,   // { data: {...}, ts: Date }
  peserta: null,   // { data: {...}, ts: Date }
  rekap  : null,   // { nilai, peserta, hakim } gabungan
};
let _pnCurrentTab = 'hakim';

function pnSetCache(key, data) {
  _pnCache[key] = { data: data, ts: new Date() };
}
function pnGetCache(key) {
  return _pnCache[key] ? _pnCache[key] : null;
}
function pnClearCache() {
  var args = arguments.length ? Array.from(arguments) : Object.keys(_pnCache);
  args.forEach(function(k) { _pnCache[k] = null; });
}
function pnCacheTs(key) {
  var c = _pnCache[key];
  if (!c) return '';
  var d = c.ts;
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') + ':' + d.getSeconds().toString().padStart(2,'0');
}
function pnRefreshCurrentTab() {
  pnClearCache(_pnCurrentTab === 'rekap' ? 'rekap' : _pnCurrentTab === 'peserta' ? 'peserta' : _pnCurrentTab === 'parameter' ? 'param' : 'hakim');
  if (_pnCurrentTab === 'rekap')     { pnClearCache('peserta','hakim'); }
  pnAdminTab(_pnCurrentTab, true);
}

// ════════════════════════════════════════════════════════════════
//  INIT HALAMAN PENILAIAN (dipanggil dari showPage admin.html)
// ════════════════════════════════════════════════════════════════
function initPenilaianPage() {
  pnPopulateCabangDropdowns();
  pnLoadHasilPublikStatus();
  pnAdminTab('hakim');   // show first tab + load hakim list
}

function pnPopulateCabangDropdowns() {
  ['pnHakimCabangSelect','pnParamCabang','pnPesertaCabangFilter','pnRekapCabangFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">-- Pilih Cabang --</option>';
    PN_CABANG_LIST.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c; el.appendChild(o);
    });
    el.value = cur;
  });
}

// ── Tab switching ───────────────────────────────────────────
function pnAdminTab(tab, forceRefresh) {
  _pnCurrentTab = tab;
  forceRefresh  = !!forceRefresh;

  adminLog.group('[PN] pnAdminTab \u2192 ' + tab + (forceRefresh ? ' (force)' : ''));

  // ── 0. Re-aktifkan #page-penilaian setiap kali sub-tab diklik ──────────
  // Root cause "visible:false": browser tidak mem-parse !important dari
  // setAttribute('style','display:block!important') — harus gunakan API
  // yang benar: style.setProperty('display','block','important').
  document.querySelectorAll('.admin-page-section').forEach(function(s) {
    s.classList.remove('active');
    s.style.removeProperty('display');
  });
  var pageSection = document.getElementById('page-penilaian');
  if (pageSection) {
    pageSection.classList.add('active');
    pageSection.style.setProperty('display', 'block', 'important');

    // Juga paksa semua leluhur menjadi visible — ini menangkap kasus
    // di mana <main>, .main-content, #adminWrap, atau wrapper lain
    // masih display:none karena transisi login atau sebab lain
    var ancestor = pageSection.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      var cs = window.getComputedStyle(ancestor);
      if (cs.display === 'none') {
        ancestor.style.setProperty('display', 'block', 'important');
        adminLog.warn('[PN] Force-show hidden ancestor:', ancestor.tagName + (ancestor.id ? '#'+ancestor.id : ''));
      }
      ancestor = ancestor.parentElement;
    }
  }

  // Sidebar
  document.querySelectorAll('.sidebar-item').forEach(function(s) { s.classList.remove('active'); });
  var navItem = document.getElementById('nav-penilaian');
  if (navItem) navItem.classList.add('active');

  // ── 1. Pane visibility via setProperty (bukan setAttribute) ───────────
  document.querySelectorAll('#page-penilaian .pn-tab-pane').forEach(function(p) {
    p.style.setProperty('display', 'none', 'important');
    p.classList.remove('active');
  });
  var pane = document.getElementById('pn-tab-' + tab);
  if (pane) {
    pane.style.setProperty('display', 'block', 'important');
    pane.classList.add('active');
    void pane.offsetHeight;  // paksa reflow
    var computed = window.getComputedStyle(pane).display;
    var visible  = pane.offsetParent !== null;
    adminLog.debug('[PN] Pane #pn-tab-' + tab
      + ' computed.display:' + computed
      + ' visible:' + visible);

    // Jika masih tidak terlihat, log SELURUH rantai leluhur untuk temukan biang kerok
    if (!visible) {
      adminLog.warn('[PN] MASIH hidden. Tracing ancestor chain:');
      var el = pane.parentElement;
      while (el && el !== document.body) {
        var cs = window.getComputedStyle(el);
        adminLog.debug('  ancestor:', el.tagName + (el.id?'#'+el.id:'') + (el.className?' .'+el.className.split(' ').join('.'):''),
          '| display:', cs.display,
          '| visibility:', cs.visibility,
          '| classList:', el.classList.toString(),
          '| inline.display:', el.style.display);
        el = el.parentElement;
      }
    }
  } else {
    adminLog.error('[PN] Pane #pn-tab-' + tab + ' NOT FOUND');
  }

  // ── 2. Button active state ────────────────────────────────
  document.querySelectorAll('#page-penilaian .pn-tab-btn').forEach(function(b) {
    var active = b.getAttribute('data-tab') === tab;
    b.style.background = active ? 'var(--white)'   : 'transparent';
    b.style.color      = active ? 'var(--emerald)' : 'var(--gray-500)';
    b.style.boxShadow  = active ? '0 2px 8px rgba(0,0,0,.08)' : 'none';
    b.style.fontWeight = active ? '700' : '600';
  });

  // ── 3. Load tab data ──────────────────────────────────────
  if (tab === 'rekap') {
    _pnShowWrap('pnRekapTableWrap', '\u23F3 Memuat data nilai...');
    try { pnLoadRekapTable(forceRefresh).catch(function(e){ adminLog.error('[PN] rekap error:', e); _pnShowWrapErr('pnRekapTableWrap', e); }); } catch(e) { _pnShowWrapErr('pnRekapTableWrap', e); }
    try { pnPopulateRekapFilters(forceRefresh).catch(function(){}); } catch(e) {}
  }
  if (tab === 'peserta') {
    _pnShowWrap('pnPesertaTableWrap', '\u23F3 Memuat data peserta...');
    try { pnLoadPesertaTable(forceRefresh).catch(function(e){ adminLog.error('[PN] peserta error:', e); _pnShowWrapErr('pnPesertaTableWrap', e); }); } catch(e) { _pnShowWrapErr('pnPesertaTableWrap', e); }
  }
  if (tab === 'hakim')     { try { pnRenderHakimList(forceRefresh).catch(function(){}); } catch(e) {} }
  if (tab === 'parameter') { try { pnRenderParamSummary(forceRefresh).catch(function(){}); } catch(e) {} }

  adminLog.end();
}

// Tampilkan placeholder segera (sebelum async selesai)
function _pnShowWrap(id, msg) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = '<div style="text-align:center;padding:32px 16px;color:var(--gray-500)">'
    + '<div style="font-size:24px;margin-bottom:8px">⏳</div>'
    + '<div style="font-size:13px;font-weight:600">' + msg + '</div>'
    + '<div style="font-size:12px;color:var(--gray-400);margin-top:4px">Menghubungi server, mohon tunggu...</div>'
    + '</div>';
}
// Tampilkan error di dalam wrap
function _pnShowWrapErr(id, err) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = '<div style="text-align:center;padding:32px 16px;color:#dc2626">'
    + '<div style="font-size:24px;margin-bottom:8px">⚠️</div>'
    + '<div style="font-size:13px;font-weight:600">Gagal memuat data</div>'
    + '<div style="font-size:12px;color:var(--gray-400);margin-top:4px">' + (err && err.message ? err.message : 'Coba klik 🔄 Refresh') + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════
//  HAKIM
// ════════════════════════════════════════════════════════════════
function pnGenPin() {
  document.getElementById('pnHakimPin').value = String(Math.floor(100000 + Math.random() * 900000));
}

function pnHakimAddCabang() {
  const val = document.getElementById('pnHakimCabangSelect').value;
  if (!val) { toast('', 'Pilih cabang dahulu', 'warning'); return; }
  if (PN.tempHakimCabang.includes(val)) { toast('', 'Cabang sudah ditambahkan', 'warning'); return; }
  PN.tempHakimCabang.push(val);
  pnRenderHakimCabangChips();
  document.getElementById('pnHakimCabangSelect').value = '';
}

function pnRenderHakimCabangChips() {
  document.getElementById('pnHakimCabangList').innerHTML =
    PN.tempHakimCabang.map((c, i) => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:var(--emerald-xs);color:var(--emerald);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700">
        ${c}
        <button onclick="PN.tempHakimCabang.splice(${i},1);pnRenderHakimCabangChips()"
          style="color:#dc2626;font-size:14px;line-height:1;background:none;border:none;cursor:pointer">×</button>
      </span>`).join('');
}

async function pnSimpanHakim() {
  const nama = document.getElementById('pnHakimNama').value.trim();
  const pin  = document.getElementById('pnHakimPin').value.trim();
  if (!nama) { toast('', 'Nama hakim wajib diisi', 'error'); return; }
  if (!pin || pin.length < 4) { toast('', 'PIN minimal 4 digit', 'error'); return; }
  if (PN.tempHakimCabang.length === 0) {
    const sel = document.getElementById('pnHakimCabangSelect').value;
    if (!sel) { toast('', 'Pilih minimal 1 cabang', 'error'); return; }
    PN.tempHakimCabang.push(sel);
  }

  showLoading('Menyimpan hakim...');
  const hakim = {
    id: 'h_' + Date.now(),
    nama, pin,
    cabang: [...PN.tempHakimCabang],
    createdAt: new Date().toISOString()
  };
  const res = await pnPost('saveHakim', hakim);
  hideLoading();

  if (res && res.success) {
    document.getElementById('pnHakimNama').value = '';
    document.getElementById('pnHakimPin').value  = '';
    document.getElementById('pnHakimCabangSelect').value = '';
    PN.tempHakimCabang = [];
    pnRenderHakimCabangChips();
    await pnRenderHakimList();
    toast('Tersimpan', `${nama} — PIN: ${pin}`, 'success');
  } else {
    toast('Gagal', (res && res.error) || 'Error menyimpan', 'error');
  }
}

let _pnHakimAll = []; // cache for client-side filter

async function pnRenderHakimList(forceRefresh) {
  if (!forceRefresh && pnGetCache('hakim')) {
    _pnHakimAll = pnGetCache('hakim').data || [];
    document.getElementById('pnHakimCount').textContent = _pnHakimAll.length + ' hakim' + ' — cache ' + pnCacheTs('hakim');
    pnRenderHakimCards(_pnHakimAll);
    return;
  }
  const res  = await pnGet('getHakim');
  _pnHakimAll = (res && res.data) || [];
  if (res && res.success) pnSetCache('hakim', _pnHakimAll);
  document.getElementById('pnHakimCount').textContent = _pnHakimAll.length + ' hakim terdaftar';
  pnRenderHakimCards(_pnHakimAll);
}

function pnFilterHakim(q) {
  const term = q.toLowerCase().trim();
  const filtered = !term ? _pnHakimAll : _pnHakimAll.filter(h => {
    const cabs = Array.isArray(h.cabang) ? h.cabang : [String(h.cabang||'')];
    return h.nama.toLowerCase().includes(term) || cabs.some(c => c.toLowerCase().includes(term));
  });
  pnRenderHakimCards(filtered);
}

function pnRenderHakimCards(list) {
  const el = document.getElementById('pnHakimList');
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)"><div style="font-size:32px">👤</div><p>Tidak ada hasil</p></div>';
    return;
  }
  el.innerHTML = list.map(function(h) {
    const cabs = Array.isArray(h.cabang) ? h.cabang : String(h.cabang||'').split('|').filter(Boolean);
    const hId  = h.id;
    // ---- Display card ----
    const viewHtml
      = '<div class="pn-hakim-view" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 16px">'
      +   '<div style="flex:1;min-width:0">'
      +     '<div style="font-weight:700;font-size:14px;color:var(--gray-900)">' + h.nama + '</div>'
      +     '<div style="font-size:11px;font-family:monospace;background:var(--gold-pale);color:var(--gold);padding:2px 8px;border-radius:999px;display:inline-block;margin:4px 0;font-weight:700;letter-spacing:2px">PIN: ' + h.pin + '</div>'
      +     '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">'
      +       cabs.map(function(c){ return '<span style="font-size:11px;background:var(--emerald-xs);color:var(--emerald);padding:2px 8px;border-radius:999px;font-weight:600">' + c + '</span>'; }).join('')
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:6px;flex-shrink:0">'
      +     '<button onclick="pnEditHakim(\'' + hId + '\')" style="background:var(--emerald-xs);color:var(--emerald);border:1.5px solid var(--emerald-light);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">✏️ Edit</button>'
      +     '<button onclick="pnHapusHakim(\'' + hId + '\')" style="background:#fef2f2;color:#dc2626;border:1.5px solid #fecaca;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">🗑 Hapus</button>'
      +   '</div>'
      + '</div>';

    // ---- Edit form (hidden by default) ----
    // Dropdown cabang (same as add-hakim form)
    const cabangOptions = PN_CABANG_LIST.map(function(c){
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');

    const editHtml
      = '<div class="pn-hakim-edit" style="display:none;padding:14px 16px;border-top:1.5px solid var(--emerald-light);background:var(--white)">'
      +   '<div style="font-size:12px;font-weight:700;color:var(--emerald);margin-bottom:12px">✏️ Edit Dewan Hakim</div>'
      +   '<div style="display:flex;flex-direction:column;gap:10px">'
      // Nama
      +     '<div>'
      +       '<label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:4px">NAMA LENGKAP</label>'
      +       '<input type="text" class="field-input" id="pnEditNama_' + hId + '" placeholder="Nama lengkap">'
      +     '</div>'
      // PIN + tombol acak
      +     '<div>'
      +       '<label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:4px">PIN BARU <span style="font-weight:400;color:var(--gray-400)">(kosong = tidak berubah)</span></label>'
      +       '<div style="display:flex;gap:8px">'
      +         '<input type="text" class="field-input" id="pnEditPin_' + hId + '" placeholder="4–6 digit" maxlength="6" inputmode="numeric" style="letter-spacing:4px;font-size:16px;font-family:monospace;text-align:center;flex:1">'
      +         '<button onclick="pnEditHakimRandomPin(\'' + hId + '\')" style="background:var(--gray-100);color:var(--gray-600);border:1.5px solid var(--gray-200);border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;white-space:nowrap">🎲 Acak</button>'
      +       '</div>'
      +     '</div>'
      // Cabang — dropdown + chips (sama dengan form tambah hakim)
      +     '<div>'
      +       '<label style="font-size:11px;font-weight:600;color:var(--gray-500);display:block;margin-bottom:4px">CABANG YANG DINILAI</label>'
      +       '<div style="display:flex;gap:8px;margin-bottom:8px">'
      +         '<select class="field-select" id="pnEditCabangSel_' + hId + '" style="flex:1"><option value="">-- Pilih Cabang --</option>' + cabangOptions + '</select>'
      +         '<button onclick="pnEditHakimAddCabang(\'' + hId + '\')" style="background:var(--emerald);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">+ Tambah</button>'
      +       '</div>'
      +       '<div id="pnEditCabangChips_' + hId + '" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px"></div>'
      +     '</div>'
      // Action buttons
      +     '<div style="display:flex;gap:8px;margin-top:4px">'
      +       '<button onclick="pnUpdateHakim(\'' + hId + '\')" style="background:var(--emerald);color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">💾 Simpan</button>'
      +       '<button onclick="pnCancelEditHakim(\'' + hId + '\')" style="background:var(--gray-100);color:var(--gray-600);border:none;border-radius:8px;padding:9px 14px;font-size:13px;cursor:pointer">Batal</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';

    return '<div id="pnHakimCard_' + hId + '" style="background:var(--gray-50);border:1.5px solid var(--gray-200);border-radius:10px;overflow:hidden;transition:all .2s">'
      + viewHtml + editHtml + '</div>';
  }).join('');
}

// Buka edit form — inisialisasi PN.editCabang[id] dari data hakim saat ini
function pnEditHakim(id) {
  const card = document.getElementById('pnHakimCard_' + id);
  if (!card) return;

  // Cari data hakim di cache
  const hakim = _pnHakimAll.find(function(h){ return h.id === id; });
  const cabs  = hakim ? (Array.isArray(hakim.cabang) ? hakim.cabang.slice() : String(hakim.cabang||'').split('|').filter(Boolean)) : [];
  PN.editCabang[id] = cabs;

  // Isi nama
  const namaEl = document.getElementById('pnEditNama_' + id);
  if (namaEl && hakim) namaEl.value = hakim.nama;

  pnRenderEditCabangChips(id);

  card.querySelector('.pn-hakim-view').style.display = 'none';
  card.querySelector('.pn-hakim-edit').style.display = 'block';
  card.style.borderColor = 'var(--emerald)';
  if (namaEl) namaEl.focus();
}

function pnCancelEditHakim(id) {
  const card = document.getElementById('pnHakimCard_' + id);
  if (!card) return;
  card.querySelector('.pn-hakim-view').style.display = 'flex';
  card.querySelector('.pn-hakim-edit').style.display = 'none';
  card.style.borderColor = 'var(--gray-200)';
  delete PN.editCabang[id];
}

// Render chips cabang di dalam edit form
function pnRenderEditCabangChips(id) {
  const el   = document.getElementById('pnEditCabangChips_' + id);
  if (!el) return;
  const cabs = PN.editCabang[id] || [];
  el.innerHTML = cabs.map(function(c, i) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--emerald-xs);color:var(--emerald);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700">'
      + c
      + '<button onclick="pnEditHakimRemoveCabang(\'' + id + '\',' + i + ')" style="color:#dc2626;font-size:14px;line-height:1;background:none;border:none;cursor:pointer;padding:0 0 1px 2px">×</button>'
      + '</span>';
  }).join('');
  if (!cabs.length) el.innerHTML = '<span style="font-size:12px;color:var(--gray-400)">Belum ada cabang dipilih</span>';
}

function pnEditHakimAddCabang(id) {
  const sel = document.getElementById('pnEditCabangSel_' + id);
  if (!sel || !sel.value) { toast('', 'Pilih cabang dahulu', 'warning'); return; }
  if (!PN.editCabang[id]) PN.editCabang[id] = [];
  if (PN.editCabang[id].includes(sel.value)) { toast('', 'Cabang sudah ditambahkan', 'warning'); return; }
  PN.editCabang[id].push(sel.value);
  sel.value = '';
  pnRenderEditCabangChips(id);
}

function pnEditHakimRemoveCabang(id, idx) {
  if (!PN.editCabang[id]) return;
  PN.editCabang[id].splice(idx, 1);
  pnRenderEditCabangChips(id);
}

function pnEditHakimRandomPin(id) {
  const el = document.getElementById('pnEditPin_' + id);
  if (el) el.value = String(Math.floor(100000 + Math.random() * 900000));
}

async function pnUpdateHakim(id) {
  const nama  = (document.getElementById('pnEditNama_' + id)?.value || '').trim();
  const pin   = (document.getElementById('pnEditPin_'  + id)?.value || '').trim();
  const cabang = PN.editCabang[id] || [];
  if (!nama)         { toast('', 'Nama tidak boleh kosong', 'error'); return; }
  if (!cabang.length){ toast('', 'Pilih minimal 1 cabang', 'error'); return; }
  const payload = { id, nama, cabang };
  if (pin) payload.pin = pin;
  showLoading('Memperbarui hakim...');
  const res = await pnPost('updateHakim', payload);
  hideLoading();
  if (res && res.success) { toast('Berhasil', 'Data hakim diperbarui', 'success'); pnRenderHakimList(); }
  else toast('Gagal', (res && res.error) || 'Error', 'error');
}

async function pnHapusHakim(id) {
  if (!confirm('Hapus dewan hakim ini?')) return;
  showLoading('Menghapus hakim...');
  const res = await pnPost('deleteHakim', { id });
  hideLoading();
  if (res && res.success) { toast('Terhapus', 'Data hakim dihapus', 'success'); pnRenderHakimList(); }
  else toast('Gagal', (res && res.error) || 'Error menghapus', 'error');
}

// ════════════════════════════════════════════════════════════════
//  PARAMETER PENILAIAN
// ════════════════════════════════════════════════════════════════
async function pnLoadParamForCabang(cabangOverride) {
  const cabang = cabangOverride || (document.getElementById('pnParamCabang')?.value || '');
  if (!cabang) return;

  // Sinkronkan dropdown dengan nilai yang dimuat (diperlukan saat dipanggil dari summary)
  const selEl = document.getElementById('pnParamCabang');
  if (selEl && cabangOverride) selEl.value = cabangOverride;

  const res  = await pnGet('getParam', { cabang });
  const data = (res && res.data);

  // CATATAN PENTING: getParam(cabang) mengembalikan ARRAY langsung di `data`,
  // bukan objek { [cabang]: [...] }. Kode lama melakukan `data[cabang]` yang
  // selalu `undefined` pada array → PN.tempParams selalu kosong.
  PN.tempParams = (Array.isArray(data) ? data : (data && data[cabang]) || [])
    .map(function(p) { return Object.assign({}, p); });
  pnRenderParamFields();
}

function pnRenderParamFields() {
  const el = document.getElementById('pnParamExisting');
  if (!PN.tempParams.length) { el.innerHTML = '<p style="color:var(--gray-400);font-size:13px">Belum ada parameter — tambah di bawah</p>'; return; }
  const total = PN.tempParams.reduce((s, p) => s + Number(p.bobot||0), 0);
  el.innerHTML = PN.tempParams.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px">
      <div style="flex:1;font-size:14px;font-weight:600;color:var(--gray-800)">${p.nama}</div>
      <div style="font-size:13px;font-weight:700;color:var(--emerald);min-width:50px;text-align:right">${p.bobot}%</div>
      <div style="height:6px;width:60px;background:var(--gray-200);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100,p.bobot)}%;background:var(--emerald);border-radius:3px"></div>
      </div>
      <button onclick="PN.tempParams.splice(${i},1);pnRenderParamFields()"
        style="background:#fef2f2;color:#dc2626;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">✕</button>
    </div>`).join('') +
    `<div style="font-size:12px;font-weight:700;color:${total===100?'var(--emerald)':'#dc2626'};margin-top:4px;text-align:right">
      Total bobot: ${total}% ${total===100?'✅':'⚠️ harus 100%'}
    </div>`;
}

function pnAddParam() {
  const nama  = document.getElementById('pnParamNama').value.trim();
  const bobot = parseInt(document.getElementById('pnParamBobot').value, 10);
  if (!nama)        { toast('', 'Nama parameter wajib diisi', 'warning'); return; }
  if (!bobot || bobot < 1 || bobot > 100) { toast('', 'Bobot harus 1–100', 'warning'); return; }
  const total = PN.tempParams.reduce((s, p) => s + Number(p.bobot||0), 0);
  if (total + bobot > 100) { toast('', `Total bobot tidak boleh melebihi 100% (sekarang ${total}%)`, 'warning'); return; }
  PN.tempParams.push({ nama, bobot, minNilai: 0, maxNilai: 100 });
  document.getElementById('pnParamNama').value  = '';
  document.getElementById('pnParamBobot').value = '';
  pnRenderParamFields();
}

async function pnSimpanParameter() {
  const cabang = document.getElementById('pnParamCabang').value;
  if (!cabang) { toast('', 'Pilih cabang dahulu', 'warning'); return; }
  const total = PN.tempParams.reduce((s, p) => s + Number(p.bobot||0), 0);
  if (total !== 100) { toast('', `Total bobot harus 100% (saat ini ${total}%)`, 'error'); return; }
  showLoading('Menyimpan parameter...');
  const res = await pnPost('saveParam', { cabang, params: PN.tempParams });
  hideLoading();
  if (res && res.success) { toast('Tersimpan', 'Parameter berhasil disimpan', 'success'); pnRenderParamSummary(); }
  else toast('Gagal', (res && res.error) || 'Error menyimpan', 'error');
}

let _pnParamAllData = {};

async function pnRenderParamSummary(forceRefresh) {
  const el = document.getElementById('pnParamSummary');
  if (!el) return;

  var allData;
  if (!forceRefresh && pnGetCache('param')) {
    allData = pnGetCache('param').data || {};
    var tsEl = document.getElementById('pnParamCacheTs');
    if (tsEl) tsEl.textContent = 'cache ' + pnCacheTs('param');
  } else {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);font-size:13px">Memuat...</div>';
    const res = await pnGet('getParam');
    allData = (res && res.data) || {};
    if (res && res.success) pnSetCache('param', allData);
    var tsEl2 = document.getElementById('pnParamCacheTs');
    if (tsEl2) tsEl2.textContent = 'diperbarui ' + pnCacheTs('param');
  }

  _pnParamAllData = allData;
  pnFilterParamSummary(document.getElementById('pnParamSearch') ? document.getElementById('pnParamSearch').value : '');
}

function pnFilterParamSummary(q) {
  const el   = document.getElementById('pnParamSummary');
  if (!el) return;
  const term = (q || '').toLowerCase().trim();
  const all  = _pnParamAllData || {};
  const keys = Object.keys(all).filter(function(k) {
    return all[k] && all[k].length > 0 && (!term || k.toLowerCase().includes(term));
  });

  if (!keys.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--gray-400)"><div style="font-size:28px">📋</div><p>'
      + (term ? 'Tidak ditemukan cabang &ldquo;' + term + '&rdquo;' : 'Parameter belum dikonfigurasi')
      + '</p></div>';
    return;
  }

  el.innerHTML = keys.map(function(cab) {
    var cabEsc = cab.replace(/'/g, "\'");
    return '<div style="margin-bottom:14px;border:1px solid var(--gray-200);border-radius:10px;overflow:hidden">'
      + '<div style="background:var(--emerald-xs);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +   '<div style="font-size:13px;font-weight:700;color:var(--emerald);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + cab + '</div>'
      +   '<button onclick=\'pnEditParamForCabang("' + cabEsc + '")\'  style="background:var(--emerald);color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0">✏️ Edit</button>'
      + '</div>'
      + '<div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px">'
      +   all[cab].map(function(p) {
            var barW = Math.min(100, p.bobot);
            return '<div style="font-size:12px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:7px 12px;display:flex;align-items:center;gap:8px">'
              + '<span style="font-weight:600;color:var(--gray-800)">' + p.nama + '</span>'
              + '<span style="background:var(--emerald-xs);color:var(--emerald);border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700">' + p.bobot + '%</span>'
              + '<div style="height:4px;width:50px;background:var(--gray-200);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + barW + '%;background:var(--emerald);border-radius:2px"></div></div>'
              + '</div>';
          }).join('')
      + '</div>'
      + (function() {
          var total = all[cab].reduce(function(s,p){ return s + Number(p.bobot||0); }, 0);
          var color = total === 100 ? 'var(--emerald)' : '#dc2626';
          var icon  = total === 100 ? '✅' : '⚠️';
          return '<div style="padding:6px 14px 10px;font-size:11px;font-weight:600;color:' + color + ';text-align:right">' + icon + ' Total bobot: ' + total + '%</div>';
        })()
      + '</div>';
  }).join('');
}

async function pnEditParamForCabang(cabang) {
  const sel = document.getElementById('pnParamCabang');
  if (!sel) return;
  if (!sel.querySelector('option[value="' + cabang + '"]')) {
    const opt = document.createElement('option');
    opt.value = cabang; opt.textContent = cabang;
    sel.appendChild(opt);
  }
  sel.value = cabang;
  showLoading('Memuat parameter...');
  await pnLoadParamForCabang(cabang);
  hideLoading();
  const formCard = sel.closest ? sel.closest('.admin-card') : null;
  if (formCard) {
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formCard.style.outline = '2.5px solid var(--emerald)';
    setTimeout(function() { formCard.style.outline = ''; }, 1800);
  }
  toast('', 'Mengedit parameter: ' + cabang, 'info');
}

// ════════════════════════════════════════════════════════════════
//  PESERTA
// ════════════════════════════════════════════════════════════════
async function pnLoadPesertaTable(forceRefresh) {
  var cabang  = (document.getElementById('pnPesertaCabangFilter')?.value) || '';
  var wrap    = document.getElementById('pnPesertaTableWrap');

  adminLog.group('[PN] pnLoadPesertaTable cabang="' + cabang + '" force=' + !!forceRefresh);
  adminLog.debug('[PN] wrap element:', wrap ? 'found' : 'NULL — berhenti');
  if (!wrap) { adminLog.end(); return; }

  var cacheKey = 'peserta';

  try {
    var cachedData = pnGetCache(cacheKey);
    adminLog.debug('[PN] cache hit:', !!cachedData, cachedData ? '(' + pnCacheTs(cacheKey) + ')' : '');

    var allData;

    if (!forceRefresh && cachedData) {
      allData = cachedData.data;
      var tsEl = document.getElementById('pnPesertaCacheTs');
      if (tsEl) tsEl.textContent = 'cache ' + pnCacheTs(cacheKey);
      adminLog.debug('[PN] menggunakan cache peserta, keys:', Object.keys(allData || {}).length);
    } else {
      wrap.innerHTML = '<div style="text-align:center;padding:28px;color:var(--gray-500);font-size:13px"><div style="font-size:24px;margin-bottom:8px">⏳</div><div>Memuat data peserta...</div></div>';
      adminLog.debug('[PN] memanggil pnGet(getPeserta, {adminView:true})...');
      var res = await pnGet('getPeserta', { adminView: 'true' });
      adminLog.debug('[PN] pnGet getPeserta response:', JSON.stringify(res).slice(0,200));
      if (!res || !res.success) {
        var errMsg = (res && res.error) ? res.error : 'Timeout/no_response — coba klik 🔄 Refresh';
        adminLog.error('[PN] getPeserta gagal:', errMsg);
        wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#dc2626"><div style="font-size:28px">⚠️</div><p style="font-weight:600;margin:8px 0">Gagal memuat peserta</p><p style="font-size:12px;color:var(--gray-400)">' + errMsg + '</p><p style="font-size:12px;margin-top:8px">Pastikan GAS sudah di-deploy ulang, lalu klik 🔄 Refresh</p></div>';
        adminLog.end(); return;
      }
      allData = res.data || {};
      pnSetCache(cacheKey, allData);
      var tsEl2 = document.getElementById('pnPesertaCacheTs');
      if (tsEl2) tsEl2.textContent = 'diperbarui ' + pnCacheTs(cacheKey);
      adminLog.debug('[PN] peserta data type:', Array.isArray(allData) ? 'array' : 'object', 'keys:', Array.isArray(allData) ? allData.length : Object.keys(allData).length);
    }

    var list;
    if (cabang) {
      list = Array.isArray(allData) ? allData : (allData[cabang] || []);
    } else {
      list = Array.isArray(allData) ? allData : Object.values(allData).flat();
    }
    adminLog.debug('[PN] peserta list.length:', list.length, '(cabang filter: "' + cabang + '")');

    if (!list.length) {
      var note = cabang
        ? 'Tidak ada peserta untuk cabang "' + cabang + '".'
        : 'Tidak ada data peserta. Pastikan ada pendaftar & GAS sudah di-deploy ulang dengan kode terbaru.';
      wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-500)">'
        + '<div style="font-size:32px">🧑</div>'
        + '<p style="margin:8px 0 4px;font-weight:600;color:var(--gray-700)">Data Kosong</p>'
        + '<p style="font-size:12px;color:var(--gray-400);margin:0 0 4px">' + note + '</p>'
        + '<p style="font-size:12px;color:var(--gray-400)">Gunakan tombol 🔄 Refresh untuk memuat ulang.</p>'
        + '</div>';
      adminLog.end(); return;
    }

    // FIX: sebelumnya style="width:100%" mengunci tabel selalu sama
    // lebar dengan container (.table-wrap), jadi overflow-x:auto tidak
    // pernah punya apa pun untuk di-scroll — kolom malah dipaksa
    // menyempit di layar sempit. Dihapus supaya tabel boleh melebar
    // mengikuti konten lalu discroll, konsisten dengan .data-table di
    // admin.html (lihat komentar FIX di sana).
    wrap.innerHTML = '<table class="data-table">'
      + '<thead><tr><th style="width:40px">#</th><th>Nama / Tim</th><th>Kecamatan</th><th>Cabang</th><th>No. Pendaftaran</th><th>Status</th></tr></thead>'
      + '<tbody>'
      + list.map(function(p, idx) {
          var cabangVal  = p.cabang || cabang || '—';
          var isVerif    = p.status === 'Terverifikasi';
          var statusChip = isVerif
            ? '<span style="font-size:11px;background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:999px;font-weight:600">✅ Terverifikasi</span>'
            : '<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-weight:600">' + (p.status || 'Menunggu') + '</span>';
          return '<tr>'
            + '<td style="font-weight:700;color:var(--emerald)">' + (p.nomor_urut || idx+1) + '</td>'
            + '<td style="font-weight:600;color:var(--gray-900)">' + (p.nama || '—') + '</td>'
            + '<td style="color:var(--gray-600)">' + (p.kecamatan || '—') + '</td>'
            + '<td style="font-size:12px;color:var(--gray-600)">' + cabangVal + '</td>'
            + '<td style="font-family:monospace;font-size:12px;color:var(--gray-500)">' + (p.nomor_pendaftaran || p.id || '—') + '</td>'
            + '<td>' + statusChip + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>'
      + '<div style="padding:10px 14px;font-size:12px;color:var(--gray-400);border-top:1px solid var(--gray-100)">👥 ' + list.length + ' peserta' + (cabang ? ' — ' + cabang : '') + '</div>';

    adminLog.debug('[PN] tabel peserta berhasil dirender, rows:', list.length);

  } catch(err) {
    adminLog.error('[PN] pnLoadPesertaTable ERROR:', err);
    if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#dc2626"><div style="font-size:28px">❌</div><p style="font-weight:600;margin:8px 0">Error</p><p style="font-size:12px;color:var(--gray-400)">' + (err && err.message ? err.message : String(err)) + '</p><p style="font-size:12px;margin-top:8px">Lihat console browser (F12) untuk detail.</p></div>';
  }

  adminLog.end();
}

async function pnTambahPeserta() {
  const cabang = document.getElementById('pnPesertaCabangFilter').value;
  const nama   = document.getElementById('pnPesertaNamaBaru').value.trim();
  if (!cabang) { toast('', 'Pilih cabang dahulu', 'warning'); return; }
  if (!nama)   { toast('', 'Nama peserta wajib diisi', 'warning'); return; }
  const peserta = { id: 'p_'+Date.now(), nama, cabang, createdAt: new Date().toISOString() };
  showLoading('Menambah peserta...');
  const res = await pnPost('savePeserta', { cabang, peserta });
  hideLoading();
  if (res && res.success) {
    document.getElementById('pnPesertaNamaBaru').value = '';
    toast('Ditambahkan', nama, 'success');
    pnLoadPesertaTable();
  } else toast('Gagal', (res && res.error) || 'Error', 'error');
}

async function pnImportPeserta() {
  const cabang = document.getElementById('pnPesertaCabangFilter').value;
  if (!cabang) { toast('', 'Pilih cabang dahulu sebelum import', 'warning'); return; }
  if (!confirm(`Import peserta cabang "${cabang}" dari data Pendaftaran?\n\nPeserta yang sudah ada tidak akan ditambah ulang. Status Ditolak/Nonaktif akan dilewati.`)) return;
  showLoading('Mengimpor peserta dari Pendaftaran...');
  const res = await pnGet('importPesertaFromPendaftaran', { cabang });
  hideLoading();
  if (res && res.success) {
    toast('Berhasil', `${res.count || 0} peserta berhasil diimpor`, 'success');
    pnLoadPesertaTable();
  } else {
    toast('Gagal', (res && res.error) || 'Tidak ada peserta yang diimpor', res && res.count === 0 ? 'warning' : 'error');
  }
}

async function pnHapusPeserta(cabang, id) {
  if (!confirm('Hapus peserta ini?')) return;
  showLoading('Menghapus peserta...');
  const res = await pnPost('deletePeserta', { cabang, id });
  hideLoading();
  if (res && res.success) { toast('Terhapus', 'Peserta dihapus', 'success'); pnLoadPesertaTable(); }
  else toast('Gagal', (res && res.error) || 'Error', 'error');
}

// ════════════════════════════════════════════════════════════════
//  REKAP NILAI
// ════════════════════════════════════════════════════════════════
async function pnPopulateRekapFilters(forceRefresh) {
  // Gunakan cache hakim & peserta jika ada
  var hakimData   = !forceRefresh && pnGetCache('hakim')   ? pnGetCache('hakim').data   : null;
  var pesertaData = !forceRefresh && pnGetCache('peserta') ? pnGetCache('peserta').data : null;

  var promises = [];
  if (!hakimData)   promises.push(pnGet('getHakim').then(function(r){ if(r&&r.success){ pnSetCache('hakim',r.data); } return r; }));
  else              promises.push(Promise.resolve({ success:true, data: hakimData }));
  if (!pesertaData) promises.push(pnGet('getPeserta', { adminView: 'true' }).then(function(r){ if(r&&r.success){ pnSetCache('peserta',r.data); } return r; }));
  else              promises.push(Promise.resolve({ success:true, data: pesertaData }));

  var results   = await Promise.all(promises);
  var hakimList  = (results[0] && results[0].data) || [];
  var pesertaAll = (results[1] && results[1].data) || {};

  var hSel = document.getElementById('pnRekapHakimFilter');
  if (hSel) {
    var cur = hSel.value;
    hSel.innerHTML = '<option value="">-- Semua Hakim --</option>';
    hakimList.forEach(function(h) {
      var o = document.createElement('option');
      o.value = h.id; o.textContent = h.nama; hSel.appendChild(o);
    });
    hSel.value = cur;
  }
  var cabs = Array.isArray(pesertaAll) ? [] : Object.keys(pesertaAll).filter(function(k){ return pesertaAll[k] && pesertaAll[k].length > 0; });
  var cSel = document.getElementById('pnRekapCabangFilter');
  if (cSel) {
    var cur2 = cSel.value;
    cSel.innerHTML = '<option value="">-- Semua Cabang --</option>';
    cabs.forEach(function(c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; cSel.appendChild(o);
    });
    cSel.value = cur2;
  }
}

async function pnLoadRekapTable(forceRefresh) {
  var cabang  = document.getElementById('pnRekapCabangFilter')?.value  || null;
  var hakimId = document.getElementById('pnRekapHakimFilter')?.value   || null;
  var wrap    = document.getElementById('pnRekapTableWrap');

  adminLog.group('[PN] pnLoadRekapTable cabang="' + cabang + '" hakimId="' + hakimId + '" force=' + !!forceRefresh);
  adminLog.debug('[PN] wrap element:', wrap ? 'found' : 'NULL — berhenti');
  if (!wrap) { adminLog.end(); return; }

  try {
    var rekap = !forceRefresh && pnGetCache('rekap') ? pnGetCache('rekap').data : null;
    adminLog.debug('[PN] rekap cache hit:', !!rekap);

    if (!rekap) {
      wrap.innerHTML = '<div style="text-align:center;padding:28px;color:var(--gray-500);font-size:13px"><div style="font-size:24px;margin-bottom:8px">⏳</div><div>Memuat rekap nilai...</div></div>';
      adminLog.debug('[PN] memanggil 3 pnGet paralel (getNilai, getPeserta, getHakim)...');
      var r = await Promise.all([
        pnGet('getNilai', {}),
        pnGet('getPeserta', { adminView: 'true' }),
        pnGet('getHakim'),
      ]);
      adminLog.debug('[PN] getNilai success:', !!(r[0]&&r[0].success), 'data keys:', r[0]&&r[0].data ? Object.keys(r[0].data).length : 0);
      adminLog.debug('[PN] getPeserta success:', !!(r[1]&&r[1].success), 'type:', r[1]&&r[1].data ? (Array.isArray(r[1].data)?'array':'object') : 'null');
      adminLog.debug('[PN] getHakim success:', !!(r[2]&&r[2].success), 'count:', r[2]&&r[2].data ? r[2].data.length : 0);
      rekap = {
        nilaiMap  : (r[0] && r[0].data) || {},
        pesertaAll: (r[1] && r[1].data) || {},
        hakimList : (r[2] && r[2].data) || []
      };
      pnSetCache('rekap', rekap);
      if (r[1] && r[1].success) pnSetCache('peserta', rekap.pesertaAll);
      if (r[2] && r[2].success) pnSetCache('hakim',   rekap.hakimList);
      var tsEl = document.getElementById('pnRekapCacheTs');
      if (tsEl) tsEl.textContent = 'diperbarui ' + pnCacheTs('rekap');
    } else {
      var tsEl2 = document.getElementById('pnRekapCacheTs');
      if (tsEl2) tsEl2.textContent = 'cache ' + pnCacheTs('rekap');
    }

    var allRows = Object.values(rekap.nilaiMap || {});
    adminLog.debug('[PN] nilaiMap total rows sebelum filter:', allRows.length);
    var rows = allRows.filter(function(d) {
      if (cabang  && d.cabang  !== cabang)  return false;
      if (hakimId && d.hakimId !== hakimId) return false;
      return true;
    });
    adminLog.debug('[PN] rows setelah filter:', rows.length);

    if (!rows.length) {
      wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-500)">'
        + '<div style="font-size:32px">📊</div>'
        + '<p style="font-weight:600;color:var(--gray-700);margin:8px 0 4px">Belum ada nilai yang disubmit</p>'
        + '<p style="font-size:12px;color:var(--gray-400);margin:0">Hakim perlu login di <strong>penilaian.html</strong> dan submit nilai untuk cabang yang ditugaskan.</p>'
        + '<p style="font-size:12px;color:var(--gray-400);margin:4px 0 0">Setelah submit, klik 🔄 Refresh untuk melihat data terbaru.</p>'
        + '</div>';
      adminLog.end(); return;
    }

    document.getElementById('pnRekapExportBtn')?.removeAttribute('disabled');

    // FIX: sama seperti pnLoadPesertaTable — width:100% dihapus supaya
    // tabel bisa melebar & discroll di layar sempit.
    wrap.innerHTML = '<table class="data-table" style="font-size:13px">'
      + '<thead><tr><th>Peserta</th><th>Cabang</th><th>Hakim</th><th>Total</th><th>Parameter</th><th>Catatan</th><th>Waktu</th></tr></thead>'
      + '<tbody>'
      + rows.map(function(d) {
          var paramStr = (d.params || []).map(function(p){ return p.nama + ': <strong>' + p.nilai + '</strong>'; }).join(' · ');
          var waktu    = d.submittedAt ? new Date(d.submittedAt).toLocaleString('id-ID') : '—';
          return '<tr>'
            + '<td style="font-weight:700">' + (d.pesertaNama||'—') + '<br><span style="font-size:11px;color:var(--gray-400)">' + (d.pesertaKecamatan||'') + '</span></td>'
            + '<td style="font-size:12px">' + (d.cabang||'—') + '</td>'
            + '<td>' + (d.hakimNama||'—') + '</td>'
            + '<td><strong style="color:var(--emerald);font-size:15px">' + Number(d.total||0).toFixed(2) + '</strong></td>'
            + '<td style="font-size:12px">' + paramStr + '</td>'
            + '<td style="font-size:12px;color:var(--gray-500);font-style:italic">' + (d.catatan||'—') + '</td>'
            + '<td style="font-size:11px;color:var(--gray-400)">' + waktu + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>';

    adminLog.debug('[PN] rekap tabel berhasil dirender, rows:', rows.length);

  } catch(err) {
    adminLog.error('[PN] pnLoadRekapTable ERROR:', err);
    if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:32px;color:#dc2626">'
      + '<div style="font-size:28px">❌</div>'
      + '<p style="font-weight:600;margin:8px 0">Error memuat rekap</p>'
      + '<p style="font-size:12px;color:var(--gray-400)">' + (err && err.message ? err.message : String(err)) + '</p>'
      + '<p style="font-size:12px;margin-top:8px">Lihat console browser (F12) untuk detail error.</p>'
      + '</div>';
  }

  adminLog.end();
}
function pnExportRekapCSV() {
  const rows  = [['Cabang','Peserta','Kecamatan','Hakim','Parameter','Nilai','Bobot%','Total','Catatan','Waktu']];
  document.querySelectorAll('#pnRekapTableWrap tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')];
    if (cells.length < 7) return;
    rows.push([
      cells[1].textContent.trim(),
      cells[0].childNodes[0]?.textContent.trim()||'',
      cells[0].querySelector('span')?.textContent.trim()||'',
      cells[2].textContent.trim(),
      '', '', '',
      cells[3].textContent.trim(),
      cells[5].textContent.trim(),
      cells[6].textContent.trim(),
    ]);
  });
  const csv  = rows.map(r => r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'rekap_nilai_mtq2026.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Export OK', 'File CSV berhasil diunduh', 'success');
}

// ════════════════════════════════════════════════════════════════
//  TOGGLE HASIL PUBLIK
// ════════════════════════════════════════════════════════════════
async function pnLoadHasilPublikStatus() {
  const res = await pnGet('getHasilPublikStatus');
  const isOpen = res && res.isOpen;
  const chip   = document.getElementById('pnPublikStatusChip');
  const btn    = document.getElementById('pnPublikToggleBtn');
  if (chip) {
    chip.textContent = isOpen ? '🟢 Sedang Dibuka' : '🔒 Ditutup';
    chip.style.background = isOpen ? '#d1fae5' : '#fee2e2';
    chip.style.color      = isOpen ? '#065f46'  : '#991b1b';
  }
  if (btn) {
    btn.textContent = isOpen ? '🔒 Tutup Hasil Publik' : '🔓 Buka Hasil Publik';
    btn.style.background = isOpen ? '#fef2f2' : 'var(--emerald)';
    btn.style.color      = isOpen ? '#dc2626'  : '#fff';
    btn.onclick = () => pnToggleHasilPublik(!isOpen);
  }
}

async function pnToggleHasilPublik(open) {
  const label = open ? 'Membuka' : 'Menutup';
  showLoading(`${label} hasil penilaian publik...`);
  const res = await pnPost('setHasilPublikStatus', { status: open ? 'buka' : 'tutup' });
  hideLoading();
  if (res && res.success) {
    toast(open ? 'Dibuka' : 'Ditutup', `Hasil penilaian publik ${open?'kini bisa dilihat di Beranda':'sudah ditutup'}`, open ? 'success' : 'info');
    pnLoadHasilPublikStatus();
  } else {
    toast('Gagal', (res && res.error) || 'Error', 'error');
  }
}