// ============================================================
//  MTQ 2026 — js/daftar.js  (rev 4)
//  Fix: year clamp, precise age lock, gender lock, file preview,
//       file name overflow, submit logging, CORS POST workaround
//  rev 4 — FIX #15: _jsonpClassic tidak lagi menghapus callback saat
//  timeout, supaya respons yang datang telat (server lambat, bukan
//  benar2 mati) diproses normal alih-alih meledak di console dan
//  datanya dibuang. Lihat catatan lengkap di fungsi itu sendiri.
// ============================================================

// API_URL: satu sumber dari js/config.js (window.MTQ_API_URL) — jangan ubah di sini
const API_URL = window.MTQ_API_URL || '';
let AGE_CUTOFF = MTQ_CONFIG.AGE_CUTOFF_DATE;   // sesuai Juknis; ditimpa nilai server di loadConfig() bila tersedia

// ── State ─────────────────────────────────────────────────────
let state = {
  step: 1,
  config: [],
  currentCfg: null,
  isTeam: false,
  minMembers: 1,
  maxMembers: 1,
  members: [{}],
  files: {},
  isSubmitting: false,
  regNumber: null,
  formData: {},
};

// Fallback config: SATU SUMBER di js/config.js → MTQ_CONFIG.CABANG_CONFIG_FALLBACK
// (jangan hardcode array cabang lagi di sini — edit config.js saja)

// ══════════════════════════════════════════════════════════════
// AGE UTILITIES  (presisi hari, bukan hanya tahun)
// ══════════════════════════════════════════════════════════════

/**
 * Hitung umur presisi (tahun-bulan-hari) pada tanggal cutoff AGE_CUTOFF
 * @param {string} dobStr  'YYYY-MM-DD'
 * @returns {{ tahun:number, bulan:number, hari:number }}
 */
function calcAgeExact(dobStr) {
  const dob    = new Date(dobStr    + 'T00:00:00');
  const cutoff = new Date(AGE_CUTOFF + 'T00:00:00');

  let tahun = cutoff.getFullYear() - dob.getFullYear();
  let bulan = cutoff.getMonth()    - dob.getMonth();
  let hari  = cutoff.getDate()     - dob.getDate();

  if (hari < 0) {
    bulan--;
    const prevMonthEnd = new Date(cutoff.getFullYear(), cutoff.getMonth(), 0);
    hari += prevMonthEnd.getDate();
  }
  if (bulan < 0) { tahun--; bulan += 12; }
  return { tahun, bulan, hari };
}

/**
 * Cek apakah umur masuk rentang [min, max] secara presisi hari
 * @returns {{ ok:boolean, msg:string }}
 */
function checkAgeRange(age, minTahun, maxTahun, maxBulan, maxHari) {
  // FIX #10: jika minTahun=0, tidak ada batas bawah
  if (minTahun > 0 && age.tahun < minTahun) {
    return { ok: false, msg: `Usia kurang dari batas minimum ${minTahun} tahun` };
  }
  if (maxTahun < 99) {
    if (age.tahun > maxTahun) return tooOld(maxTahun, maxBulan, maxHari);
    if (age.tahun === maxTahun) {
      if (age.bulan > maxBulan) return tooOld(maxTahun, maxBulan, maxHari);
      if (age.bulan === maxBulan && age.hari > maxHari) return tooOld(maxTahun, maxBulan, maxHari);
    }
  }
  return { ok: true, msg: fmtAge(age) };
}

function tooOld(thn, bln, hari) {
  return {
    ok: false,
    msg: `Usia melebihi batas: maks. ${thn} thn${bln ? ' ' + bln + ' bln' : ''}${hari ? ' ' + hari + ' hr' : ''} (per ${AGE_CUTOFF})`,
  };
}

function fmtAge(age) {
  return `${age.tahun} thn ${age.bulan} bln ${age.hari} hr`;
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  log.info('DOMContentLoaded — inisialisasi daftar.js');
  initNavbar();
  initDarkMode();
  loadConfig();
  setupRekomUpload();
  // FIX: renderStep(1) TIDAK dipanggil di sini lagi — form baru
  // ditampilkan (lewat revealRegistrationForm_) setelah status
  // pendaftaran dari server dipastikan "buka". Lihat loadConfig().
});

// ── API helper — fetch dulu, JSONP sebagai fallback ───────────
// Menggunakan fetch() agar tidak ada SyntaxError di console
// saat server mengembalikan HTML (mis. redirect login GAS).
function jsonp(url, cbPrefix, fn, timeout = 8000) {
  // Coba fetch terlebih dahulu (no-cors mode tidak bisa baca body,
  // gunakan cors — GAS deployed sebagai "Anyone" sudah support ini)
  const fetchUrl = url.includes('callback=') ? url : url;
  fetch(fetchUrl + '&callback=_noop', {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined,
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(text => {
      // GAS JSONP membungkus JSON dalam callback(_noop(...))
      // Coba ekstrak JSON dari dalam callback wrapper
      let json = null;

      // Pola: cbName({...}) atau cbName([...])
      const match = text.match(/^[^(]+\((.+)\)\s*;?\s*$/s);
      if (match) {
        try { json = JSON.parse(match[1]); } catch(e) { /* bukan JSON */ }
      }

      // Pola langsung: server mengembalikan JSON tanpa wrapper
      if (!json) {
        try { json = JSON.parse(text); } catch(e) { /* bukan JSON */ }
      }

      if (json) {
        try { fn(json); } catch(e) { log.error('API callback error', e); }
      } else {
        // Server mengembalikan HTML atau format tidak dikenal — fallback
        log.warn('API response bukan JSON, memakai fallback. Preview:', text.slice(0, 80));
        fn(null);
      }
    })
    .catch(err => {
      // fetch gagal (network error, timeout, dll) — fallback ke JSONP klasik
      log.warn('fetch gagal, mencoba JSONP klasik:', err.message);
      _jsonpClassic(url, cbPrefix, fn, timeout);
    });
}

// JSONP klasik sebagai fallback jika fetch tidak bisa (mis. CORS block)
// FIX #15: dulu satu `cleanup()` menangani sukses/onerror/timeout SEKALIGUS
// dan langsung `delete window[cbName]` di ketiganya, dijaga flag `done` biar
// cuma jalan sekali. Masalahnya: kalau timeout duluan "menyerah" (fn(null)
// terlanjur dipanggil, mis. saat checkNIK/checkDuplicate/register kena GAS
// yang sedang lambat menjelang penutupan pendaftaran), lalu respons ASLI
// baru sampai setelah itu — nama callback sudah dihapus, jadi <script> yang
// telat itu meledak "Uncaught ReferenceError: ...is not defined" di console
// DAN datanya percuma dibuang (script.remove() tidak menjamin request yang
// sudah terlanjur jalan lewat redirect script.google.com→googleusercontent.com
// benar2 batal). Sekarang: jalur sukses TIDAK dijaga `gaveUp` (respons asli
// selalu diproses, self-healing walau telat), dan window[cbName] TIDAK
// dihapus saat timeout — hanya onerror (browser sudah pasti menyerah total
// di request itu) yang membersihkannya. Lihat penjelasan sama di
// doyourmagic.html/main.js.
function _jsonpClassic(url, cbPrefix, fn, timeout) {
  const cbName = cbPrefix + '_' + Date.now();
  const script = document.createElement('script');
  let gaveUp = false;
  let timer;

  // Respons ASLI — selalu diproses, baik tepat waktu maupun telat setelah
  // timeout sudah melapor gagal duluan (self-healing, lihat catatan di atas).
  window[cbName] = (data) => {
    clearTimeout(timer);
    script.remove();
    try { fn(data); } catch(e) { log.error('JSONP callback error', e); }
  };

  script.src = `${url}&callback=${cbName}`;
  script.onerror = () => {
    if (gaveUp) return;
    gaveUp = true;
    log.warn('JSONP script error for', url);
    script.remove();
    fn(null);
  };
  timer = setTimeout(() => {
    if (gaveUp) return;
    gaveUp = true;
    log.warn('JSONP timeout for', url);
    fn(null);
    // window[cbName] SENGAJA tidak dihapus di sini — lihat FIX #15 di atas.
  }, timeout);

  document.head.appendChild(script);
}

// ── Load Config ───────────────────────────────────────────────
function loadConfig() {
  const sel = document.getElementById('cabang_lomba');
  if (!sel) return;
  sel.innerHTML = '<option value="">Memuat data...</option>';
  sel.disabled  = true;
  log.info('loadConfig → meminta getConfig dari API');

  jsonp(`${API_URL}?action=getConfig`, 'mtqConfig', (data) => {
    let regInfo = null; // { status, buka, tutup, isOpen } — dipakai untuk kunci form di bawah

    if (data && data.success && Array.isArray(data.config) && data.config.length) {
      state.config = data.config;
      log.info(`loadConfig ✓ — ${data.config.length} cabang dimuat dari API`);

      // Sebarkan hasil server ke MTQ_CONFIG (satu tempat bersama di config.js)
      // supaya file lain yang baca MTQ_CONFIG di halaman yang sama ikut ter-update.
      MTQ_CONFIG.applyServerConfig(data);

      // Sinkronkan AGE_CUTOFF lokal dari MTQ_CONFIG — sebelumnya nilai server
      // hanya disimpan ke window._ageCutoff dan TIDAK PERNAH dipakai kalkulasi umur.
      AGE_CUTOFF = MTQ_CONFIG.AGE_CUTOFF_DATE;
      window._ageCutoff = AGE_CUTOFF;
      log.info('AGE_CUTOFF dari server (dipakai untuk kalkulasi):', AGE_CUTOFF);

      if (data.registrationConfig) regInfo = data.registrationConfig;
    } else {
      state.config = MTQ_CONFIG.CABANG_CONFIG_FALLBACK;
      log.warn('loadConfig — API gagal/kosong, memakai MTQ_CONFIG.CABANG_CONFIG_FALLBACK');
      showToast('Info', 'Menggunakan data cabang lomba default (koneksi API gagal).', 'warning');

      // FIX: API tidak terjangkau — tetap hitung status pendaftaran secara
      // lokal (dari MTQ_CONFIG, sumber sama dengan config.gs) supaya form
      // tidak salah terbuka hanya karena API sedang bermasalah.
      const localStatus = getRegStatus();
      regInfo = {
        status: localStatus,
        buka  : MTQ_CONFIG.PENDAFTARAN_BUKA,
        tutup : MTQ_CONFIG.PENDAFTARAN_TUTUP,
        isOpen: localStatus === 'buka',
      };
    }

    populateCabang(sel);
    sel.disabled = false;

    // FIX: kunci form SEJAK AWAL kalau pendaftaran sedang tidak buka.
    // Sebelumnya di sini hanya showToast() yang hilang dalam 10 detik —
    // form tetap bisa diisi lengkap & baru ditolak server saat submit.
    if (regInfo && !regInfo.isOpen) {
      log.warn('Pendaftaran status:', regInfo.status, '— form dikunci di awal');
      lockRegistrationForm_(regInfo);
    } else {
      revealRegistrationForm_();
    }
  });
}

// ── FIX: Kunci form pendaftaran saat status bukan 'buka' ──────
// Menyembunyikan steps-bar + form, menampilkan #closedContainer
// dengan pesan & tanggal yang sesuai (belum_buka vs tutup).
function fmtTanggalIndo_(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return String(iso).slice(0, 10); }
}

function lockRegistrationForm_(regInfo) {
  const closedContainer = document.getElementById('closedContainer');
  if (!closedContainer) { log.error('lockRegistrationForm_ — #closedContainer tidak ditemukan di HTML'); return; }

  document.getElementById('initLoadingContainer')?.classList.add('hidden');
  document.getElementById('formContainer')?.classList.add('hidden');
  document.querySelector('.steps-bar')?.classList.add('hidden');
  closedContainer.classList.remove('hidden');

  const bukaFmt  = fmtTanggalIndo_(regInfo.buka);
  const tutupFmt = fmtTanggalIndo_(regInfo.tutup);
  const icon     = document.getElementById('closedIcon');
  const title    = document.getElementById('closedTitle');
  const msg      = document.getElementById('closedMsg');
  const detail   = document.getElementById('closedDetail');

  if (regInfo.status === 'belum_buka') {
    if (icon)  icon.textContent  = '⏳';
    if (title) title.textContent = 'Pendaftaran Belum Dibuka';
    if (msg)   msg.textContent   = `Pendaftaran online MTQ 2026 akan dibuka pada ${bukaFmt}. Silakan kembali pada tanggal tersebut.`;
  } else {
    if (icon)  icon.textContent  = '🔒';
    if (title) title.textContent = 'Pendaftaran Telah Ditutup';
    if (msg)   msg.textContent   = `Pendaftaran online MTQ 2026 telah ditutup sejak ${tutupFmt}. Hubungi panitia untuk informasi lebih lanjut.`;
  }

  if (detail) {
    detail.innerHTML = `
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="color:var(--gray-400);padding:6px 0;width:45%">Pendaftaran dibuka</td><td style="font-weight:700">${bukaFmt}</td></tr>
        <tr><td style="color:var(--gray-400);padding:6px 0">Pendaftaran ditutup</td><td style="font-weight:700">${tutupFmt}</td></tr>
      </table>`;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  log.warn('Form pendaftaran dikunci —', regInfo.status, '| buka:', regInfo.buka, '| tutup:', regInfo.tutup);
}

// ── FIX: Tampilkan form pendaftaran (dipanggil hanya setelah status ──
// dipastikan "buka" dari loadConfig). Menyembunyikan loading awal,
// memunculkan steps-bar + form, lalu render step 1 seperti biasa.
function revealRegistrationForm_() {
  document.getElementById('initLoadingContainer')?.classList.add('hidden');
  document.querySelector('.steps-bar')?.classList.remove('hidden');
  document.getElementById('formContainer')?.classList.remove('hidden');
  renderStep(1);
  log.info('Pendaftaran sedang buka — form ditampilkan');
}

// ── Populate Cabang Lomba dropdown ───────────────────────────
function populateCabang(sel) {
  sel = sel || document.getElementById('cabang_lomba');
  const aktif = state.config.filter(c => String(c.status_aktif).toLowerCase() === 'aktif');

  const groups = {};
  aktif.forEach(c => {
    const prefix = c.cabang_lomba.split(' ')[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(c);
  });

  sel.innerHTML = '<option value="">-- Pilih Cabang Lomba --</option>';
  Object.entries(groups).forEach(([prefix, items]) => {
    const grp = document.createElement('optgroup');
    grp.label = prefix;
    items.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.cabang_lomba;
      // Tampilkan rentang usia presisi di label
      let ageLabel = `${c.umur_min}`;
      if (c.umur_max_tahun < 99) {
        ageLabel += `–${c.umur_max_tahun}`;
        if (c.umur_max_bulan) ageLabel += ` thn ${c.umur_max_bulan} bln`;
        else ageLabel += ' thn';
        if (c.umur_max_hari) ageLabel += ` ${c.umur_max_hari} hr`;
      } else {
        ageLabel += ' thn+';
      }
      opt.textContent = `${c.cabang_lomba}  (${ageLabel})`;
      opt.dataset.tipe        = c.tipe || 'individu';
      opt.dataset.gender      = c.gender || 'Semua';
      opt.dataset.umurMin     = c.umur_min;
      opt.dataset.umurMaxThn  = c.umur_max_tahun;
      opt.dataset.umurMaxBln  = c.umur_max_bulan || 0;
      opt.dataset.umurMaxHari = c.umur_max_hari  || 0;
      opt.dataset.kuota       = c.kuota;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });

  sel.addEventListener('change', onCabangChange);
}

function onCabangChange() {
  const sel    = document.getElementById('cabang_lomba');
  const opt    = sel.options[sel.selectedIndex];
  const badge  = document.getElementById('quotaBadge');
  const tipeBox = document.getElementById('tipeInfoBox');
  const ageBox  = document.getElementById('ageRuleBox');

  if (!opt || !opt.value) {
    badge.textContent = ''; tipeBox.style.display = 'none'; ageBox.style.display = 'none';
    state.currentCfg = null; return;
  }

  const cfg = state.config.find(c => c.cabang_lomba === opt.value) || {
    tipe: opt.dataset.tipe, gender: opt.dataset.gender,
    umur_min: +opt.dataset.umurMin,
    umur_max_tahun: +opt.dataset.umurMaxThn,
    umur_max_bulan: +opt.dataset.umurMaxBln,
    umur_max_hari:  +opt.dataset.umurMaxHari,
    kuota: +opt.dataset.kuota,
  };
  state.currentCfg = cfg;
  state.isTeam     = cfg.tipe === 'team';
  state.minMembers = state.isTeam ? 2 : 1;
  state.maxMembers = state.isTeam ? 3 : 1;
  log.info('Cabang dipilih:', opt.value, cfg);

  // Tipe badge
  const tipeBadge = document.getElementById('tipeBadge');
  const tipeDesc  = document.getElementById('tipeDesc');
  tipeBox.style.display = 'block';
  if (state.isTeam) {
    tipeBadge.className = 'tipe-badge team';
    tipeBadge.textContent = '👥 Tim (2–3 anggota)';
    tipeDesc.textContent  = 'Pendaftaran dilakukan per tim';
  } else {
    tipeBadge.className = 'tipe-badge individu';
    tipeBadge.textContent = '👤 Individu';
    tipeDesc.textContent  = 'Satu formulir untuk satu peserta';
  }

  // Age rule — presisi hari
  const maxStr = cfg.umur_max_tahun < 99
    ? `${cfg.umur_max_tahun} tahun${cfg.umur_max_bulan ? ' ' + cfg.umur_max_bulan + ' bulan' : ''}${cfg.umur_max_hari ? ' ' + cfg.umur_max_hari + ' hari' : ''}`
    : 'tidak dibatasi';
  const genderStr = cfg.gender === 'L' ? 'Putra (Laki-laki)' : cfg.gender === 'P' ? 'Putri (Perempuan)' : 'Putra & Putri';
  document.getElementById('ageRuleText').innerHTML =
    `<strong>Syarat usia:</strong> ${cfg.umur_min} tahun s.d. ${maxStr} — dihitung per tanggal <strong>${AGE_CUTOFF}</strong> ` +
    `(1 hari pun melebihi batas <u>tidak dapat</u> mendaftar) &nbsp;|&nbsp; <strong>Gender:</strong> ${genderStr}`;
  ageBox.style.display = 'block';

  checkQuota(opt.value, badge);
}

function checkQuota(cabang, badge) {
  // Kuota sisa tidak ditampilkan (bersifat rahasia) — hanya cek apakah penuh
  badge.textContent = ''; badge.className = 'quota-badge';
  jsonp(`${API_URL}?action=getQuota&cabang=${encodeURIComponent(cabang)}`, 'mtqQuota', (data) => {
    if (data && data.success) {
      const cfg  = state.config.find(c => c.cabang_lomba === cabang);
      const sisa = (cfg?.kuota || 0) - (data.count || 0);
      log.info(`Kuota ${cabang}: tersedia=${sisa>0}, penuh=${sisa<=0}`);
      // Hanya tampilkan jika benar-benar penuh (blokir pendaftaran)
      if (sisa <= 0) { badge.textContent = '🚫 Kuota Penuh'; badge.className = 'quota-badge full'; }
      // Jika masih ada slot: badge kosong (jumlah tidak ditampilkan)
    } else { badge.textContent = ''; }
  });
}

// ══════════════════════════════════════════════════════════════
//  STEP NAVIGATION
// ══════════════════════════════════════════════════════════════

function renderStep(n) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${n}`)?.classList.add('active');
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < n)   el.classList.add('done');
    if (i + 1 === n) el.classList.add('active');
  });
  const bar = document.querySelector('.steps-bar');
  window.scrollTo({ top: bar ? bar.offsetTop - 68 : 0, behavior: 'smooth' });
  state.step = n;
  log.info(`renderStep → Step ${n}`);
}

function goToStep2() {
  log.step(1, 'goToStep2');
  const kec = document.getElementById('kecamatan');
  const cab = document.getElementById('cabang_lomba');
  let valid = true;
  clearError(kec); clearError(cab);
  if (!kec?.value) { showError(kec, 'Pilih kecamatan terlebih dahulu'); valid = false; }
  if (!cab?.value) { showError(cab, 'Pilih cabang lomba terlebih dahulu'); valid = false; }
  if (!valid) { showToast('Lengkapi Data', 'Pilih kecamatan dan cabang lomba.', 'warning'); log.end(); return; }

  if (document.getElementById('quotaBadge')?.classList.contains('full')) {
    showToast('Kuota Penuh', 'Maaf, kuota untuk cabang ini sudah habis.', 'error'); log.end(); return;
  }

  // ── Cek duplikat kecamatan + cabang sebelum lanjut ──────────
  const nextBtn = document.querySelector('#step1 .btn-emerald');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff3;border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;margin-right:6px;vertical-align:middle"></span>Memeriksa...'; }

  log.info(`checkDuplicate: kec=${kec.value}, cabang=${cab.value}`);
  jsonp(`${API_URL}?action=checkDuplicate&kecamatan=${encodeURIComponent(kec.value)}&cabang=${encodeURIComponent(cab.value)}`, 'dupCheck', (data) => {
    if (nextBtn) { nextBtn.disabled = false; nextBtn.innerHTML = 'Selanjutnya →'; }

    if (data && data.isDuplicate) {
      log.warn('Duplikat terdeteksi:', data);
      showError(kec, `Kecamatan ${kec.value} sudah mendaftarkan peserta pada cabang ini`);
      showError(cab, 'Pilih cabang lain — satu kecamatan hanya boleh 1 peserta/tim per cabang');
      showToast(
        'Sudah Terdaftar',
        `Kecamatan <strong>${kec.value}</strong> sudah memiliki peserta terdaftar pada cabang <strong>${cab.value}</strong>. Hubungi panitia jika ada kekeliruan.`,
        'error', 8000
      );
      log.end();
      return;
    }

    if (!data) {
      // API gagal — izinkan lanjut dengan peringatan
      log.warn('checkDuplicate: API tidak merespons, lanjut tanpa cek');
      showToast('Peringatan', 'Tidak dapat memverifikasi duplikat secara online. Panitia akan memeriksa saat verifikasi.', 'warning', 6000);
    }

    // Lanjut ke step 2
    _proceedToStep2(kec.value, cab.value);
    log.end();
  });
}

function _proceedToStep2(kecVal, cabVal) {
  state.members = Array.from({ length: state.minMembers }, () => ({}));
  const cabangName = cabVal;

  document.getElementById('step2Title').textContent    = state.isTeam ? 'Data Anggota Tim' : 'Data Peserta';
  document.getElementById('step2Subtitle').textContent = state.isTeam
    ? `${cabangName} — min. ${state.minMembers}, maks. ${state.maxMembers} anggota`
    : `${cabangName} — Isi data diri dengan lengkap`;

  const summaryBar = document.getElementById('teamSummaryBar');
  const addBtn     = document.getElementById('addMemberBtn');
  if (state.isTeam) {
    summaryBar.classList.remove('hidden');
    document.getElementById('teamSummaryText').textContent = `${cabangName} — Tim ${state.minMembers}–${state.maxMembers} anggota`;
    addBtn.classList.remove('hidden');
  } else {
    summaryBar.classList.add('hidden');
    addBtn.classList.add('hidden');
  }

  renderMemberForms();
  renderStep(2);
}

function goToStep3() {
  log.step(2, 'goToStep3');
  if (!validateStep2()) { log.end(); return; }
  renderUploadSections();
  renderStep(3);
  log.end();
}

// ══════════════════════════════════════════════════════════════
//  MEMBER FORMS (Step 2)
// ══════════════════════════════════════════════════════════════

// ── FIX 3: Preserve member field values across add/remove ────────────────
// Reads current DOM values into state.members before any re-render
function collectMemberValues() {
  const FIELDS = ['nama','nik','tempat_lahir','tanggal_lahir','jenis_kelamin','no_hp','alamat'];
  state.members.forEach((m, i) => {
    FIELDS.forEach(f => {
      const el = document.getElementById(`m${i}_${f}`);
      if (el) m[f] = el.value;
    });
    // Bank fields (only on member 0)
    if (i === 0) {
      ['nama_bank','nomor_rekening','nama_rekening'].forEach(f => {
        const el = document.getElementById(f);
        if (el) m[f] = el.value;
      });
    }
  });
}

function renderMemberForms() {
  const container = document.getElementById('memberFormsContainer');
  if (!container) return;
  container.innerHTML = '';
  state.members.forEach((_, i) => container.appendChild(createMemberCard(i)));
  updateAddMemberBtn();
}

function createMemberCard(idx) {
  const isKetua  = idx === 0;
  const badgeCls = isKetua && state.isTeam ? 'ketua' : '';
  const role     = !state.isTeam ? 'Peserta' : isKetua ? 'Ketua Tim' : `Anggota ${idx + 1}`;
  const cfg      = state.currentCfg;

  // Gender lock: jika cabang spesifik gender, kunci field
  const genderLocked = cfg && cfg.gender !== 'Semua' && cfg.gender !== '';
  const genderValue  = cfg?.gender === 'L' ? 'Laki-laki' : cfg?.gender === 'P' ? 'Perempuan' : '';
  const genderHint   = genderLocked
    ? `<div class="field-hint" style="color:var(--emerald)">🔒 Gender dikunci sesuai cabang: <strong>${genderValue}</strong></div>`
    : '';
  const genderOptions = genderLocked
    ? `<option value="${genderValue}" selected>${genderValue}</option>`
    : `<option value="">-- Pilih --</option>
       <option value="Laki-laki">Laki-laki</option>
       <option value="Perempuan">Perempuan</option>`;

  // Age range info — FIX #10: no lower bound shown when umur_min=0
  const maxStr = cfg && cfg.umur_max_tahun < 99
    ? `${cfg.umur_max_tahun} thn${cfg.umur_max_bulan ? ' ' + cfg.umur_max_bulan + ' bln' : ''}${cfg.umur_max_hari ? ' ' + cfg.umur_max_hari + ' hr' : ''}`
    : '∞';
  const ageHint = cfg
    ? `<div class="field-hint">Usia per ${AGE_CUTOFF}: maks. <strong>${maxStr}</strong> — divalidasi presisi hari${cfg.umur_min > 0 ? ` (min. ${cfg.umur_min} thn)` : ''}</div>`
    : '';

  // Date min/max for native date picker
  // FIX 4: maxDate = min(today, cutoff minus umur_min) — year never exceeds current year
  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDate  = cfg && cfg.umur_min > 0
    ? subtractYears(AGE_CUTOFF, cfg.umur_min)
    : todayStr;
  // Date min: cutoff minus max age (earliest valid birthdate, add 1 day for exclusive)
  const minDate = (cfg && cfg.umur_max_tahun < 99)
    ? addDays(subtractYearsMonthsDays(AGE_CUTOFF, cfg.umur_max_tahun, cfg.umur_max_bulan || 0, cfg.umur_max_hari || 0), 1)
    : '1920-01-01';

  const card = document.createElement('div');
  card.className = 'member-card';
  card.id = `member-card-${idx}`;

  card.innerHTML = `
    <div class="member-card-header">
      <div class="member-num">
        <div class="member-num-badge ${badgeCls}">${idx + 1}</div>
        <span class="member-name-preview" id="preview-name-${idx}">${role}</span>
        <span class="member-age-tag" id="age-tag-${idx}" style="display:none"></span>
      </div>
      ${!isKetua ? `<button type="button" class="btn-remove-member" onclick="removeMember(${idx})">✕ Hapus</button>` : ''}
    </div>
    <div class="member-card-body">
      <div class="form-grid">

        <div class="field-group full">
          <label class="field-label">Nama Lengkap <span class="req">*</span></label>
          <input type="text" class="field-input" id="m${idx}_nama"
            placeholder="Nama sesuai KTP/KK/KIA/Akta" autocapitalize="characters"
            value="${state.members[idx]?.nama || ''}"
            oninput="forceUpper(this);updatePreviewName(${idx},this.value)">
          <div class="field-error"></div>
        </div>

        <div class="field-group">
          <label class="field-label">NIK <span class="req">*</span></label>
          <input type="text" class="field-input" id="m${idx}_nik"
            placeholder="16 digit NIK" maxlength="16" inputmode="numeric"
            value="${state.members[idx]?.nik || ''}"
            oninput="this.value=this.value.replace(/\\D/g,'').slice(0,16)"
            onblur="checkNIKDuplicate(${idx}, this.value)">
          <div class="field-error" id="m${idx}_nik_error"></div>
        </div>

        <div class="field-group">
          <label class="field-label">Tempat Lahir <span class="req">*</span></label>
          <input type="text" class="field-input" id="m${idx}_tempat_lahir"
            placeholder="Kota/Kabupaten kelahiran" autocapitalize="characters"
            value="${state.members[idx]?.tempat_lahir || ''}"
            oninput="forceUpper(this)">
          <div class="field-error"></div>
        </div>

        <div class="field-group">
          <label class="field-label">
            Tanggal Lahir <span class="req">*</span>
            <span class="age-chip" id="m${idx}_age_chip"></span>
          </label>
          <input type="date" class="field-input" id="m${idx}_tanggal_lahir"
            min="${minDate}" max="${maxDate}"
            value="${state.members[idx]?.tanggal_lahir || ''}"
            oninput="clampDateYear(this)"
            onkeydown="if(event.key==='Escape'){this.value='';validateMemberAge(${idx});updateStep2NextBtn();event.preventDefault();}"
            onblur="validateMemberAge(${idx}); updateStep2NextBtn()"
            onchange="validateMemberAge(${idx}); updateStep2NextBtn()">
          ${ageHint}
          <div class="field-error" id="m${idx}_age_error"></div>
        </div>

        <div class="field-group">
          <label class="field-label">Jenis Kelamin <span class="req">*</span></label>
          <select class="field-select" id="m${idx}_jenis_kelamin"
            ${genderLocked ? 'disabled style="background:var(--gray-50);color:var(--gray-400)"' : ''}
            onchange="validateMemberGender(${idx}); updateStep2NextBtn()">
            ${genderLocked
              ? genderOptions
              : `<option value="">-- Pilih --</option>
                 <option value="Laki-laki" ${state.members[idx]?.jenis_kelamin==='Laki-laki'?'selected':''}>Laki-laki</option>
                 <option value="Perempuan" ${state.members[idx]?.jenis_kelamin==='Perempuan'?'selected':''}>Perempuan</option>`}
          </select>
          ${genderHint}
          <div class="field-error" id="m${idx}_gender_error"></div>
        </div>

        <div class="field-group">
          <label class="field-label">No. WhatsApp <span class="req">*</span></label>
          <input type="tel" class="field-input" id="m${idx}_no_hp"
            placeholder="08xxxxxxxxxx"
            value="${state.members[idx]?.no_hp || ''}">
          <div class="field-error"></div>
        </div>

        <div class="field-group full">
          <label class="field-label">Alamat Lengkap <span class="req">*</span></label>
          <textarea class="field-textarea" id="m${idx}_alamat" rows="2"
            placeholder="Jalan, RT/RW, Desa/Kel, Kecamatan" autocapitalize="characters"
            oninput="forceUpper(this)">${state.members[idx]?.alamat || ''}</textarea>
          <div class="field-error"></div>
        </div>

      </div>

      ${idx === 0 ? `
      <!-- FIX #6: Bank fields — opsional, hanya untuk ketua/peserta utama -->
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-200)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);margin-bottom:12px">💳 Data Rekening (Opsional — untuk keperluan hadiah/pengembalian biaya)</div>
        <div class="form-grid">
          <div class="field-group">
            <label class="field-label">Nama Bank</label>
            <input type="text" class="field-input" id="nama_bank" placeholder="BRI / BCA / Mandiri / dll" autocapitalize="characters" value="${state.members[idx]?.nama_bank || ''}" oninput="forceUpper(this)">
          </div>
          <div class="field-group">
            <label class="field-label">Nomor Rekening</label>
            <input type="text" class="field-input" id="nomor_rekening" placeholder="Nomor rekening" inputmode="numeric" value="${state.members[0]?.nomor_rekening || ''}" oninput="this.value=this.value.replace(/\\D/g,'')">
          </div>
          <div class="field-group full">
            <label class="field-label">Nama Pemilik Rekening</label>
            <input type="text" class="field-input" id="nama_rekening" placeholder="Nama sesuai buku tabungan" autocapitalize="characters" value="${state.members[idx]?.nama_rekening || ''}" oninput="forceUpper(this)">
          </div>
        </div>
      </div>` : ''}

    </div>`;

  return card;
}

// ── FIX #1: Clamp date year ke maks. 4 digit ─────────────────
function clampDateYear(input) {
  if (!input.value) return;
  const parts = input.value.split('-');
  if (!parts[0] || parts[0].length < 4) return;
  let year = parseInt(parts[0], 10);
  if (isNaN(year)) return;
  const currentYear = new Date().getFullYear();
  if (year > currentYear) {
    parts[0] = String(currentYear);
    input.value = parts.join('-');
  } else if (parts[0].length > 4) {
    parts[0] = parts[0].slice(0, 4);
    input.value = parts.join('-');
  }
}

// ── Date math helpers ─────────────────────────────────────────
function subtractYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
function subtractYearsMonthsDays(dateStr, y, m, d) {
  const dt = new Date(dateStr + 'T00:00:00');
  dt.setFullYear(dt.getFullYear() - y);
  dt.setMonth(dt.getMonth() - m);
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── FIX #2: Precise age validation (day-level), guard partial year ──
function validateMemberAge(idx) {
  const tglEl  = document.getElementById(`m${idx}_tanggal_lahir`);
  const chip   = document.getElementById(`m${idx}_age_chip`);
  const errEl  = document.getElementById(`m${idx}_age_error`);
  const ageTag = document.getElementById(`age-tag-${idx}`);
  const cfg    = state.currentCfg;
  if (!tglEl || !cfg) return;

  const dob = tglEl.value;  // 'YYYY-MM-DD' or empty

  // Guard: skip if empty or year not exactly 4 digits or clearly out of range
  if (!dob) {
    chip.textContent = ''; errEl.classList.remove('show'); ageTag.style.display = 'none'; return;
  }
  const year = parseInt(dob.split('-')[0], 10);
  if (!year || dob.split('-')[0].length !== 4 || year < 1900 || year > 2030) {
    chip.textContent = '⏳ Mengetik...'; chip.className = 'age-chip';
    errEl.classList.remove('show'); ageTag.style.display = 'none';
    return;
  }

  const age    = calcAgeExact(dob);
  const check  = checkAgeRange(age, cfg.umur_min, cfg.umur_max_tahun, cfg.umur_max_bulan || 0, cfg.umur_max_hari || 0);
  const ageStr = fmtAge(age);

  chip.textContent = `📅 ${ageStr}`;
  log.info(`validateMemberAge [${idx}]`, ageStr, check.ok ? '✓' : '✗ ' + check.msg);

  if (!check.ok) {
    chip.className           = 'age-chip err';
    errEl.textContent        = `❌ ${check.msg}`;
    errEl.classList.add('show');
    ageTag.textContent       = `${age.tahun} thn ❌`;
    ageTag.className         = 'member-age-tag err';
    ageTag.style.display     = 'inline-block';
    tglEl.classList.add('error');
  } else {
    chip.className           = 'age-chip';
    errEl.classList.remove('show');
    ageTag.textContent       = `${age.tahun} thn ✓`;
    ageTag.className         = 'member-age-tag ok';
    ageTag.style.display     = 'inline-block';
    tglEl.classList.remove('error');
  }
}

// ── FIX #3: Gender validation per member ─────────────────────
function validateMemberGender(idx) {
  const sel    = document.getElementById(`m${idx}_jenis_kelamin`);
  const errEl  = document.getElementById(`m${idx}_gender_error`);
  const cfg    = state.currentCfg;
  if (!sel || !cfg || cfg.gender === 'Semua' || cfg.gender === '') return;

  const required = cfg.gender === 'L' ? 'Laki-laki' : 'Perempuan';
  if (sel.value && sel.value !== required) {
    if (errEl) { errEl.textContent = `❌ Cabang ini hanya untuk ${required}`; errEl.classList.add('show'); }
    sel.classList.add('error');
    log.warn(`validateMemberGender [${idx}] — gender ${sel.value} tidak sesuai (required: ${required})`);
  } else {
    if (errEl) errEl.classList.remove('show');
    sel.classList.remove('error');
  }
}

// ── FIX #2 cont: Disable Next if any age/gender fails ────────
function updateStep2NextBtn() {
  const btn = document.querySelector('#step2 .btn-emerald');
  if (!btn) return;
  let hasError = false;

  for (let i = 0; i < state.members.length; i++) {
    const ageErr    = document.getElementById(`m${i}_age_error`);
    const genderErr = document.getElementById(`m${i}_gender_error`);
    if (ageErr?.classList.contains('show') || genderErr?.classList.contains('show')) {
      hasError = true; break;
    }
  }

  btn.disabled = hasError;
  btn.title    = hasError ? 'Perbaiki data usia/gender yang tidak valid terlebih dahulu' : '';
  btn.style.opacity = hasError ? '0.45' : '';
}

// ── FIX #3: NIK duplicate check via API ──────────────────────
function checkNIKDuplicate(idx, nik) {
  const el    = document.getElementById(`m${idx}_nik`);
  const errEl = document.getElementById(`m${idx}_nik_error`) || el?.parentElement?.querySelector('.field-error');
  if (!nik || nik.length < 16) return;

  jsonp(`${API_URL}?action=checkNIK&nik=${encodeURIComponent(nik)}`, 'nikChk', (data) => {
    if (data && data.isDuplicate) {
      if (errEl) { errEl.textContent = `❌ NIK ${nik} sudah terdaftar. Satu NIK hanya boleh mendaftar satu kali.`; errEl.classList.add('show'); }
      el?.classList.add('error');
      log.warn(`NIK duplikat terdeteksi: ${nik}`);
    } else {
      if (errEl) errEl.classList.remove('show');
      el?.classList.remove('error');
    }
  });
}

function updatePreviewName(idx, val) {
  const el = document.getElementById(`preview-name-${idx}`);
  if (el) el.textContent = val.trim() || (!state.isTeam ? 'Peserta' : idx === 0 ? 'Ketua Tim' : `Anggota ${idx + 1}`);
}

// ── UX: paksa huruf besar saat mengetik (nama, tempat lahir, alamat, dst) ──
// Nilai FINAL yang benar-benar disimpan ke sheet tetap dijamin oleh
// backend (lihat normalizeUpperText_ di helper.gs, dipanggil dari
// apiRegister_/apiPerbaikan_) — ini hanya supaya tampilan saat mengetik
// sudah cocok dengan hasil akhir (termasuk di halaman sukses & PDF, yang
// memakai data dari form ini apa adanya). Posisi kursor dijaga lewat
// selectionStart/End supaya tidak "loncat" ke akhir teks tiap kali
// mengetik satu huruf. Baris baru pada textarea Alamat SENGAJA tidak
// dirapikan di sini — dibiarkan agar peserta tetap nyaman mengetik
// alamat per baris; perataan jadi satu baris dilakukan di backend saat
// disimpan (bukan di sini), supaya tidak mengganggu saat mengetik.
function forceUpper(el) {
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  el.value = el.value.toUpperCase();
  if (start !== null && end !== null) el.setSelectionRange(start, end);
}

function addMember() {
  if (state.members.length >= state.maxMembers) return;
  collectMemberValues();          // save current inputs before re-render
  state.members.push({});
  renderMemberForms();
}

function removeMember(idx) {
  if (state.members.length <= state.minMembers) {
    showToast('Tidak Bisa Dihapus', `Minimal ${state.minMembers} anggota diperlukan.`, 'warning');
    return;
  }
  collectMemberValues();          // save before remove
  state.members.splice(idx, 1);
  renderMemberForms();
}

function updateAddMemberBtn() {
  const btn = document.getElementById('addMemberBtn');
  if (!btn || !state.isTeam) return;
  const atMax = state.members.length >= state.maxMembers;
  btn.disabled    = atMax;
  btn.textContent = atMax ? `✅ Maksimum ${state.maxMembers} anggota` : `➕ Tambah Anggota (maks. ${state.maxMembers})`;
}

// ── Validate Step 2 ───────────────────────────────────────────
function validateStep2() {
  let valid = true;
  const FIELDS = ['nama','nik','tempat_lahir','tanggal_lahir','jenis_kelamin','no_hp','alamat'];

  for (let i = 0; i < state.members.length; i++) {
    FIELDS.forEach(f => {
      const el = document.getElementById(`m${i}_${f}`);
      if (!el) return;
      clearError(el);
      if (!el.value.trim()) { showError(el, 'Wajib diisi'); valid = false; }
    });

    // NIK 16 digit
    const nik = document.getElementById(`m${i}_nik`);
    if (nik?.value && nik.value.length !== 16) { showError(nik, 'NIK harus tepat 16 digit'); valid = false; }

    // HP format
    const hp = document.getElementById(`m${i}_no_hp`);
    if (hp?.value && !/^(\+62|08)\d{7,12}$/.test(hp.value.replace(/\s/g,''))) {
      showError(hp, 'Nomor HP tidak valid (awali dengan 08 atau +62)'); valid = false;
    }

    // Age error (hari-level) — blokir mutlak
    const ageErr = document.getElementById(`m${i}_age_error`);
    if (ageErr?.classList.contains('show')) {
      log.warn(`validateStep2 — anggota ${i+1} gagal validasi usia`); valid = false;
    }

    // Gender error
    const genErr = document.getElementById(`m${i}_gender_error`);
    if (genErr?.classList.contains('show')) {
      log.warn(`validateStep2 — anggota ${i+1} gagal validasi gender`); valid = false;
    }

    // Re-run age & gender check jika belum dipicu
    validateMemberAge(i);
    validateMemberGender(i);
    if (document.getElementById(`m${i}_age_error`)?.classList.contains('show')) valid = false;
    if (document.getElementById(`m${i}_gender_error`)?.classList.contains('show')) valid = false;
  }

  if (!valid) showToast('Data Tidak Valid', 'Periksa usia dan gender semua peserta.', 'warning');
  return valid;
}

// ══════════════════════════════════════════════════════════════
//  UPLOAD SECTIONS (Step 3)
// ══════════════════════════════════════════════════════════════

function renderUploadSections() {
  const container = document.getElementById('memberUploadsContainer');
  if (!container) return;
  container.innerHTML = '';

  state.members.forEach((_, i) => {
    const nama    = document.getElementById(`m${i}_nama`)?.value?.trim();
    const label   = nama || (!state.isTeam ? 'Peserta' : i === 0 ? 'Ketua Tim' : `Anggota ${i + 1}`);
    const roleStr = !state.isTeam ? '' : i === 0 ? 'Ketua Tim' : `Anggota ${i + 1}`;
    const icon    = state.isTeam && i === 0 ? '👑' : '👤';

    const sec = document.createElement('div');
    sec.className = 'upload-member-section';
    sec.innerHTML = `
      <div class="upload-member-title">
        <span style="font-size:20px">${icon}</span>
        <div>
          <div>${label}</div>
          ${roleStr ? `<div style="font-size:12px;font-weight:400;color:var(--gray-400)">${roleStr}</div>` : ''}
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr">

        <div class="upload-col">
          <div class="upload-zone" id="photoZone_${i}">
            <input type="file" accept="image/*" id="photoInput_${i}">
            <div class="upload-icon" id="photoIcon_${i}">📸</div>
            <h4>Pas Foto</h4>
            <p>JPG/PNG — Maks. 2 MB <span class="req">*</span></p>
            <p style="color:#2563eb;font-weight:600">📘 Wajib latar belakang biru</p>
            <img id="photoThumb_${i}" class="upload-thumb" style="display:none">
          </div>
          <button type="button" class="upload-camera-btn">📷 Ambil Foto dari Kamera</button>
          <input type="file" accept="image/*" capture="environment" class="upload-capture-input" style="display:none">
          <div class="upload-preview" id="photoPreview_${i}">
            <span class="file-icon">🖼️</span>
            <span class="file-name"></span>
            <span class="file-size"></span>
            <button type="button" class="remove-file" onclick="removeFile('photo_${i}')">✕</button>
          </div>
        </div>

        <div class="upload-col">
          <div class="upload-zone" id="ktpZone_${i}">
            <input type="file" accept="image/*,application/pdf" id="ktpInput_${i}">
            <div class="upload-icon" id="ktpIcon_${i}">🪪</div>
            <h4>KTP / KK / KIA</h4>
            <p>JPG/PNG/PDF — Maks. 2 MB <span class="req">*</span></p>
            <img id="ktpThumb_${i}" class="upload-thumb" style="display:none">
          </div>
          <button type="button" class="upload-camera-btn">📷 Ambil Foto dari Kamera</button>
          <input type="file" accept="image/*" capture="environment" class="upload-capture-input" style="display:none">
          <div class="upload-preview" id="ktpPreview_${i}">
            <span class="file-icon">📄</span>
            <span class="file-name"></span>
            <span class="file-size"></span>
            <button type="button" class="remove-file" onclick="removeFile('ktp_${i}')">✕</button>
          </div>
        </div>

        <!-- FIX #7: Sertifikat / piagam lomba (opsional) -->
        <div class="upload-col">
          <div class="upload-zone" id="sertZone_${i}">
            <input type="file" accept="image/*,application/pdf" id="sertInput_${i}">
            <div class="upload-icon" id="sertIcon_${i}">🏅</div>
            <h4>Sertifikat / Piagam</h4>
            <p>JPG/PNG/PDF — Maks. 2 MB <em style="color:var(--gray-400)">(Opsional)</em></p>
            <img id="sertThumb_${i}" class="upload-thumb" style="display:none">
          </div>
          <button type="button" class="upload-camera-btn">📷 Ambil Foto dari Kamera</button>
          <input type="file" accept="image/*" capture="environment" class="upload-capture-input" style="display:none">
          <div class="upload-preview" id="sertPreview_${i}">
            <span class="file-icon">🏅</span>
            <span class="file-name"></span>
            <span class="file-size"></span>
            <button type="button" class="remove-file" onclick="removeFile('sert_${i}')">✕</button>
          </div>
        </div>

      </div>`;

    container.appendChild(sec);
    setupUpload(`photoZone_${i}`, `photo_${i}`, `photoPreview_${i}`, ['image/jpeg','image/png'], 2, `photoThumb_${i}`, `photoIcon_${i}`);
    setupUpload(`ktpZone_${i}`,   `ktp_${i}`,   `ktpPreview_${i}`,   ['image/jpeg','image/png','application/pdf'], 2, `ktpThumb_${i}`, `ktpIcon_${i}`);
    setupUpload(`sertZone_${i}`,  `sert_${i}`,  `sertPreview_${i}`,  ['image/jpeg','image/png','application/pdf'], 2, `sertThumb_${i}`, `sertIcon_${i}`);
  });
}

function setupRekomUpload() {
  // FIX #11: rekom mandatory — setupUpload with preview support
  setupUpload('rekomZone', 'rekom', 'rekomPreview', ['image/jpeg','image/png','application/pdf'], 2, 'rekomThumb', 'rekomIcon');
}

// ── FIX #4 & #5: Upload with preview & overflow-safe filename ─
function setupUpload(zoneId, fileKey, previewId, allowedTypes, maxMB, thumbId, iconId) {
  const zone    = document.getElementById(zoneId);
  const preview = document.getElementById(previewId);
  if (!zone) return;

  const input = zone.querySelector('input[type="file"]');

  // ── FIX Issue 1: explicit zone click → input click ─────────────────────
  // The input is already position:absolute covering the zone (opacity:0 in CSS).
  // This belt-and-suspenders click handler ensures it works across all browsers.
  zone.addEventListener('click', e => {
    // Don't re-trigger if the click already came from the input itself
    if (e.target === input) return;
    // Don't trigger if clicking the remove-file button or preview links
    if (e.target.classList.contains('remove-file') || e.target.tagName === 'BUTTON') return;
    input?.click();
  });

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, fileKey, zone, preview, allowedTypes, maxMB, thumbId, iconId);
  });

  if (input) {
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleFile(file, fileKey, zone, preview, allowedTypes, maxMB, thumbId, iconId);
    });
  }

  // ── FIX: tombol "Ambil Foto" — kamera langsung ──────────────────
  // Beberapa HP (a.l. Samsung/One UI) tidak menampilkan opsi Kamera di
  // pemilih file bawaan ketika accept berisi beberapa tipe/PDF. Input
  // tersembunyi dengan capture="environment" ini menjamin kamera selalu
  // bisa dibuka langsung, terlepas dari perilaku pemilih file HP masing-
  // masing. Tombol & input ini opsional — dicari sebagai saudara zone,
  // bukan parameter, supaya setupUpload tidak perlu diubah tiap dipanggil.
  const col           = zone.closest('.upload-col') || zone.parentElement;
  const captureBtn    = col?.querySelector('.upload-camera-btn');
  const captureInput  = col?.querySelector('.upload-capture-input');
  if (captureBtn && captureInput) {
    captureBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      captureInput.click();
    });
    captureInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleFile(file, fileKey, zone, preview, allowedTypes, maxMB, thumbId, iconId);
      captureInput.value = '';   // reset — supaya foto yang sama bisa diambil ulang bila perlu
    });
  }
}

// ── FIX: kompresi gambar di sisi klien ──────────────────────────
// Foto langsung dari kamera HP modern biasanya 3–8 MB — jauh di atas
// batas 2 MB. Alih-alih menolak file itu, kita kecilkan dulu (resize +
// re-encode JPEG) supaya tetap bisa dipakai tanpa peserta harus cari
// aplikasi kompres sendiri. File non-gambar (PDF) dilewati apa adanya.
function compressImage(file, maxMB = 1.8, maxDim = 1920) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const maxBytes = maxMB * 1024 * 1024;
    if (file.size <= maxBytes) { resolve(file); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      const attempt = () => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error(`Gagal mengompres "${file.name}".`)); return; }
          if (blob.size > maxBytes && quality > 0.35) {
            quality -= 0.15;
            attempt();
            return;
          }
          const newName = file.name.replace(/\.\w+$/, '') + '.jpg';
          resolve(new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
      attempt();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Gagal membaca gambar "${file.name}" untuk dikompres.`)); };
    img.src = url;
  });
}

function handleFile(file, key, zone, preview, allowedTypes, maxMB, thumbId, iconId) {
  log.info(`handleFile — key=${key}, name=${file.name}, size=${fmtSize(file.size)}, type=${file.type}`);

  if (!allowedTypes.includes(file.type)) {
    showToast('Format Salah', `Gunakan: ${allowedTypes.map(t => t.split('/')[1].toUpperCase()).join(', ')}`, 'error');
    return;
  }

  handleFileAsync_(file, key, zone, preview, maxMB, thumbId, iconId);
}

async function handleFileAsync_(file, key, zone, preview, maxMB, thumbId, iconId) {
  // FIX: kompres dulu kalau gambar & melebihi batas — supaya foto dari
  // kamera langsung tetap terpakai tanpa perlu ditolak.
  if (file.type.startsWith('image/') && file.size > maxMB * 1024 * 1024) {
    zone.classList.add('compressing');
    try {
      const before = file.size;
      file = await compressImage(file, maxMB * 0.9);
      log.info(`handleFile — kompresi ${key}: ${fmtSize(before)} → ${fmtSize(file.size)}`);
    } catch (e) {
      log.error('handleFile — kompresi gagal:', e);
      showToast('Kompresi Gagal', e.message || 'Gagal mengompres gambar, coba foto lain.', 'error');
      zone.classList.remove('compressing');
      return;
    }
    zone.classList.remove('compressing');
  }

  if (file.size > maxMB * 1024 * 1024) {
    showToast('File Terlalu Besar', `Maksimal ${maxMB} MB per file — file ini masih ${fmtSize(file.size)} setelah dikompres otomatis. Coba gunakan foto lain.`, 'error');
    return;
  }

  state.files[key] = file;
  zone.classList.add('has-file');

  // FIX #4: file-name truncated with CSS via class
  const nameEl = preview?.querySelector('.file-name');
  const sizeEl = preview?.querySelector('.file-size');
  const iconEl = preview?.querySelector('.file-icon');
  if (nameEl) { nameEl.textContent = file.name; nameEl.title = file.name; }
  if (sizeEl)  sizeEl.textContent  = fmtSize(file.size);
  if (iconEl)  iconEl.textContent  = file.type === 'application/pdf' ? '📄' : '🖼️';
  preview?.classList.add('show');

  // FIX #5: show preview thumbnail
  if (thumbId) {
    const thumb = document.getElementById(thumbId);
    const icon  = iconId ? document.getElementById(iconId) : null;
    if (thumb) {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        thumb.src = url;
        thumb.style.display = 'block';
        thumb.onload = () => URL.revokeObjectURL(url);
        if (icon) icon.style.display = 'none';
      } else if (file.type === 'application/pdf') {
        // PDF: tampilkan badge PDF
        thumb.style.display = 'none';
        if (icon) { icon.textContent = '📑'; icon.style.display = 'block'; icon.style.fontSize = '40px'; }
        // Show PDF first page via iframe small preview
        showPdfPreviewBadge(zone);
      }
    }
  }
}

function showPdfPreviewBadge(zone) {
  // Menambahkan badge "PDF" di atas upload zone
  let badge = zone.querySelector('.pdf-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'pdf-badge';
    badge.style.cssText = 'position:absolute;top:8px;right:8px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.5px;';
    badge.textContent = 'PDF';
    zone.style.position = 'relative';
    zone.appendChild(badge);
  }
}

function removeFile(key) {
  state.files[key] = null;
  let zoneId, previewId, inputId, thumbId, iconId;

  if (key === 'rekom') {
    zoneId = 'rekomZone'; previewId = 'rekomPreview'; inputId = 'rekomInput';
    thumbId = 'rekomThumb'; iconId = 'rekomIcon';
  } else {
    const parts = key.split('_');
    const idx   = parts[parts.length - 1];
    const type  = parts.slice(0, -1).join('_');
    // type is 'photo', 'ktp', or 'sert'
    const zonePrefix    = type === 'sert' ? 'sert' : type;
    zoneId    = `${zonePrefix}Zone_${idx}`;
    previewId = `${zonePrefix}Preview_${idx}`;
    inputId   = `${zonePrefix}Input_${idx}`;
    thumbId   = `${zonePrefix}Thumb_${idx}`;
    iconId    = `${zonePrefix}Icon_${idx}`;
  }

  const zone = document.getElementById(zoneId);
  zone?.classList.remove('has-file');
  zone?.querySelector('.pdf-badge')?.remove();
  document.getElementById(previewId)?.classList.remove('show');

  const inp   = document.getElementById(inputId);
  if (inp) inp.value = '';

  if (thumbId) {
    const thumb = document.getElementById(thumbId);
    if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
  }
  if (iconId) {
    const icon = document.getElementById(iconId);
    if (icon) { icon.style.display = ''; icon.style.fontSize = ''; }
  }
  log.info(`removeFile — key=${key} dihapus`);
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ── Validate Step 3 ───────────────────────────────────────────
function validateStep3() {
  let valid = true;
  for (let i = 0; i < state.members.length; i++) {
    if (!state.files[`photo_${i}`]) {
      showToast('Upload Diperlukan', `Pas foto peserta ke-${i+1} belum diupload.`, 'error'); valid = false;
    }
    if (!state.files[`ktp_${i}`]) {
      showToast('Upload Diperlukan', `KTP/KK/KIA peserta ke-${i+1} belum diupload.`, 'error'); valid = false;
    }
  }
  // FIX #11: Surat Rekomendasi wajib
  if (!state.files.rekom) {
    showToast('Upload Diperlukan', 'Surat Rekomendasi wajib diupload.', 'error'); valid = false;
  }
  if (!document.getElementById('agreement')?.checked) {
    showToast('Persetujuan Diperlukan', 'Centang persetujuan sebelum mengirim.', 'error'); valid = false;
  }
  return valid;
}

// ══════════════════════════════════════════════════════════════
//  SUBMIT  — FIX #6 (log) & FIX #7 (CORS POST workaround)
// ══════════════════════════════════════════════════════════════

async function submitForm() {
  if (state.isSubmitting) return;
  if (!validateStep3()) return;

  state.isSubmitting = true;
  log.step(3, 'submitForm START');
  log.time('submitForm');
  showProgress(0, 'Mempersiapkan data...', 'Mohon tunggu, jangan tutup halaman ini.');

  try {
    const kec    = document.getElementById('kecamatan').value;
    const cabang = document.getElementById('cabang_lomba').value;
    log.info(`Submit — kecamatan: ${kec}, cabang: ${cabang}`);

    // Build members data
    showProgress(10, 'Mengkonversi file ke base64...', `Memproses ${state.members.length} peserta`);
    log.info('submitForm — mengkonversi file ke base64...');
    const totalMembers = state.members.length;
    const membersData = await Promise.all(state.members.map(async (_, i) => {
      const pct = 10 + Math.round(((i+1)/totalMembers) * 40);
      showProgress(pct, `Konversi dokumen peserta ${i+1}/${totalMembers}...`,
        `Foto, KTP/KK/KIA, Sertifikat — ${String(document.getElementById('m'+i+'_nama')?.value||'Anggota '+(i+1)).replace(/[<>&"]/g,'')}`);
      log.info(`  → anggota ${i+1}: konversi foto, ktp, sertifikat`);
      const photoB64 = state.files[`photo_${i}`] ? await toBase64(state.files[`photo_${i}`]) : null;
      const ktpB64   = state.files[`ktp_${i}`]   ? await toBase64(state.files[`ktp_${i}`])   : null;
      const sertB64  = state.files[`sert_${i}`]  ? await toBase64(state.files[`sert_${i}`])  : null;
      return {
        nama_lengkap  : document.getElementById(`m${i}_nama`)?.value?.trim()         || '',
        nik           : document.getElementById(`m${i}_nik`)?.value?.trim()           || '',
        tempat_lahir  : document.getElementById(`m${i}_tempat_lahir`)?.value?.trim() || '',
        tanggal_lahir : document.getElementById(`m${i}_tanggal_lahir`)?.value         || '',
        jenis_kelamin : document.getElementById(`m${i}_jenis_kelamin`)?.value         || '',
        no_hp         : document.getElementById(`m${i}_no_hp`)?.value?.trim()         || '',
        alamat        : document.getElementById(`m${i}_alamat`)?.value?.trim()        || '',
        photo     : photoB64 ? { name: state.files[`photo_${i}`].name, type: state.files[`photo_${i}`].type, data: photoB64 } : null,
        ktp       : ktpB64   ? { name: state.files[`ktp_${i}`].name,   type: state.files[`ktp_${i}`].type,   data: ktpB64   } : null,
        sertifikat: sertB64  ? { name: state.files[`sert_${i}`].name,  type: state.files[`sert_${i}`].type,  data: sertB64  } : null,
      };
    }));
    log.info(`submitForm — ${membersData.length} anggota dikemas`);
    showProgress(52, 'Mengkonversi surat rekomendasi...', 'Hampir selesai menyiapkan berkas');
    const rekomB64 = state.files.rekom ? await toBase64(state.files.rekom) : null;

    const payload = {
      action          : 'register',
      tipe_lomba      : state.isTeam ? 'team' : 'individu',
      kecamatan       : kec,
      cabang_lomba    : cabang,
      // FIX #6: bank fields
      nama_bank       : document.getElementById('nama_bank')?.value?.trim()       || '',
      nomor_rekening  : document.getElementById('nomor_rekening')?.value?.trim()  || '',
      nama_rekening   : document.getElementById('nama_rekening')?.value?.trim()   || '',
      members         : membersData,
      rekom           : rekomB64 ? { name: state.files.rekom.name, type: state.files.rekom.type, data: rekomB64 } : null,
    };
    const payloadSize = JSON.stringify(payload).length;
    const payloadKB   = (payloadSize / 1024).toFixed(1);
    log.info('submitForm — payload siap, size ≈', payloadSize, 'bytes');
    showProgress(60, 'Mengunggah data ke server...', `Ukuran data: ${payloadKB} KB — proses ini bisa 30–60 detik tergantung koneksi, mohon jangan tutup halaman.`);
    log.info('submitForm — mengirim POST ke GAS...');

    // ── FIX: batas waktu request (AbortController) ─────────────────
    // fetch() tanpa timeout bisa menggantung tanpa batas di koneksi
    // seluler yang lemah — pengguna hanya melihat loading tanpa
    // kepastian. 100 detik memberi ruang untuk proses upload beberapa
    // berkas ke Drive di sisi server (per FIX #7, upload.gs) sambil
    // tetap memberi kepastian ke pengguna kalau memang macet.
    const controller = new AbortController();
    const submitTimeoutId = setTimeout(() => controller.abort(), 100000);

    // ── FIX #7: Content-Type: text/plain → simple request, no CORS preflight ──
    let res;
    try {
      res = await fetch(API_URL, {
        method   : 'POST',
        headers  : { 'Content-Type': 'text/plain;charset=UTF-8' },
        body     : JSON.stringify(payload),
        redirect : 'follow',
        signal   : controller.signal,
      });
    } finally {
      clearTimeout(submitTimeoutId);
    }
    log.info(`submitForm — response status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      throw new Error(`Server merespons dengan status ${res.status}. Coba beberapa saat lagi.`);
    }

    showProgress(90, 'Memproses respons server...', 'Server sedang menyimpan data');
    const result = await res.json();
    log.info('submitForm — response body:', result);

    if (result.success) {
      showProgress(100, 'Pendaftaran berhasil! 🎉', 'Data tersimpan — menyiapkan bukti pendaftaran...');
      state.regNumber = result.nomor_pendaftaran;
      state.formData  = { kecamatan: kec, cabang_lomba: cabang, members: membersData };
      log.info('submitForm ✓ — nomor:', result.nomor_pendaftaran);
      log.timeEnd('submitForm');
      await new Promise(r => setTimeout(r, 800)); // brief pause to show 100%
      hideLoading();
      showSuccessPage(result);
    } else {
      const rawErr = result.message || 'Pendaftaran gagal';
      const isStale = rawErr.includes('is not defined') || rawErr.includes('not found');
      throw new Error(isStale
        ? 'Server GAS perlu di-deploy ulang. Buka Apps Script → Deploy → New version → Deploy.'
        : rawErr);
    }
  } catch (err) {
    log.error('submitForm ✗ —', err?.name, err?.message, err);
    log.timeEnd('submitForm');
    hideLoading();
    // FIX: pesan lebih spesifik untuk kasus timeout/jaringan, supaya
    // tidak semua kegagalan tampil sebagai pesan generik yang sama.
    let userMsg = err?.message || '';
    if (err?.name === 'AbortError') {
      userMsg = 'Koneksi terlalu lama merespons (lebih dari 100 detik). Periksa sinyal/koneksi internet Anda lalu coba lagi — jika file cukup besar, coba gunakan WiFi.';
    } else if (err?.name === 'TypeError' && /fetch|network/i.test(userMsg)) {
      userMsg = 'Gagal terhubung ke server. Periksa koneksi internet Anda dan coba lagi.';
    } else if (!userMsg) {
      userMsg = 'Terjadi kesalahan. Coba beberapa saat lagi.';
    }
    showToast('Gagal Mendaftar', userMsg, 'error', 7000);
    state.isSubmitting = false;
  }
  log.end();
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    // FIX: FileReader.onerror memberi ProgressEvent, bukan Error — tidak
    // punya .message, jadi submitForm() dulu selalu jatuh ke pesan generik
    // "Terjadi kesalahan..." tanpa petunjuk apa yang sebenarnya gagal.
    r.onerror = () => rej(new Error(`Gagal membaca file "${file.name}". Coba pilih ulang filenya.`));
    r.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════
//  SUCCESS PAGE
// ══════════════════════════════════════════════════════════════

function showSuccessPage(result) {
  document.getElementById('formContainer')?.classList.add('hidden');
  const succ = document.getElementById('successContainer');
  succ?.classList.remove('hidden');
  document.getElementById('successRegNum').textContent = result.nomor_pendaftaran;

  const det   = document.getElementById('successDetail');
  const fd    = state.formData;
  const ketua = fd.members?.[0];
  if (det && ketua) {
    det.innerHTML = `
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="color:var(--gray-400);padding:6px 0;width:40%">Nama Peserta</td><td style="font-weight:700">${ketua.nama_lengkap}</td></tr>
        <tr><td style="color:var(--gray-400);padding:6px 0">Kecamatan</td><td>${fd.kecamatan}</td></tr>
        <tr><td style="color:var(--gray-400);padding:6px 0">Cabang Lomba</td><td>${fd.cabang_lomba}</td></tr>
        <tr><td style="color:var(--gray-400);padding:6px 0">Tipe</td><td>${state.isTeam ? 'Tim (' + fd.members.length + ' anggota)' : 'Individu'}</td></tr>
        <tr><td style="color:var(--gray-400);padding:6px 0">No. HP</td><td>${ketua.no_hp}</td></tr>
      </table>`;
  }
  generateQRCode(result.nomor_pendaftaran);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Berhasil! 🎉', 'Pendaftaran Anda berhasil diterima.', 'success', 7000);
}

function generateQRCode(text) {
  const el = document.getElementById('qrcode');
  if (!el) return;
  el.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(el, {
      text: `MTQ2026|${text}|${state.formData.cabang_lomba}`,
      width: 180, height: 180,
      colorDark: '#065f46', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  }
}

// FIX: tombol "Daftar Peserta Lain" di halaman sukses. Form ini punya
// banyak state (anggota, file terupload, langkah aktif, dsb.) — reload
// halaman adalah cara paling aman untuk kembali ke kondisi bersih tanpa
// risiko ada sisa state/listener dari pendaftaran sebelumnya yang
// kebawa. Sekaligus otomatis memuat ulang kuota/config terbaru dari
// server (berguna kalau kuota berubah sejak form pertama dibuka).
function daftarPesertaLain() {
  log.info('daftarPesertaLain — reload untuk pendaftaran baru');
  location.href = location.pathname;
}

function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const fd    = state.formData;
  const reg   = state.regNumber;
  const ketua = fd.members?.[0] || {};

  doc.setFillColor(6,95,70); doc.rect(0,0,210,50,'F');
  doc.setFillColor(245,158,11); doc.rect(0,50,210,2,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('BUKTI PENDAFTARAN MTQ 2026', 105, 22, {align:'center'});
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.text("Musabaqah Tilawatil Qur'an — Kab. Indramayu", 105, 32, {align:'center'});

  doc.setFillColor(240,253,245);
  doc.roundedRect(20,58,170,22,4,4,'F');
  doc.setTextColor(6,95,70);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('Nomor Pendaftaran', 105, 67, {align:'center'});
  doc.setFontSize(18); doc.text(reg, 105, 76, {align:'center'});

  const rows = [
    ['Nama Peserta/Ketua', ketua.nama_lengkap || ''],
    ['NIK', ketua.nik || ''],
    ['Tempat, Tgl Lahir', `${ketua.tempat_lahir||''}, ${ketua.tanggal_lahir||''}`],
    ['Jenis Kelamin', ketua.jenis_kelamin || ''],
    ['No. WhatsApp', ketua.no_hp || ''],
    ['Kecamatan/Kafilah', fd.kecamatan || ''],
    ['Cabang Lomba', fd.cabang_lomba || ''],
    ['Tipe Lomba', state.isTeam ? `Tim (${fd.members?.length||1} anggota)` : 'Individu'],
  ];

  let y = 90;
  doc.setFontSize(10);
  rows.forEach(([k, v], i) => {
    doc.setFillColor(i%2===0?249:255, i%2===0?250:255, i%2===0?247:255);
    doc.rect(20,y,170,9,'F');
    doc.setTextColor(100,116,139); doc.setFont('helvetica','normal'); doc.text(k,24,y+6);
    doc.setTextColor(30,41,59);   doc.setFont('helvetica','bold');   doc.text(String(v),90,y+6);
    doc.setDrawColor(229,231,235); doc.line(20,y+9,190,y+9);
    y += 9;
  });

  const qrCanvas = document.querySelector('#qrcode canvas');
  if (qrCanvas) {
    doc.addImage(qrCanvas.toDataURL('image/png'), 'PNG', 75, y+10, 60, 60);
    doc.setFontSize(9); doc.setTextColor(107,114,128);
    doc.text('Scan QR untuk verifikasi pendaftaran', 105, y+74, {align:'center'});
  }

  doc.setFillColor(6,95,70); doc.rect(0,280,210,17,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}  |  Panitia MTQ 2026`, 105, 290, {align:'center'});
  doc.save(`Bukti_Pendaftaran_MTQ2026_${reg}.pdf`);
}

// ══════════════════════════════════════════════════════════════
//  UI UTILITIES
// ══════════════════════════════════════════════════════════════

function showLoading(msg = 'Memproses...', sub = '') {
  const ov = document.getElementById('loadingOverlay');
  if (!ov) return;
  ov.querySelector('.loading-msg').textContent = msg;
  ov.querySelector('.loading-sub').textContent = sub;
  const bar = ov.querySelector('.progress-bar-inner');
  if (bar) bar.style.width = '0%';
  const pct = ov.querySelector('.progress-pct');
  if (pct) pct.textContent = '';
  ov.classList.add('show');
}

function showProgress(percent, msg, sub = '') {
  const ov = document.getElementById('loadingOverlay');
  if (!ov) { return; }
  ov.classList.add('show');
  const msgEl = ov.querySelector('.loading-msg');
  const subEl = ov.querySelector('.loading-sub');
  const bar   = ov.querySelector('.progress-bar-inner');
  const pct   = ov.querySelector('.progress-pct');
  if (msgEl) msgEl.textContent = msg;
  if (subEl) subEl.textContent = sub;
  if (bar)   bar.style.width   = Math.min(100, percent) + '%';
  if (pct)   pct.textContent   = Math.min(100, percent) + '%';
  log.info(`[Progress ${percent}%] ${msg}`);
}

function hideLoading() { document.getElementById('loadingOverlay')?.classList.remove('show'); }

function showToast(title, msg, type = 'info', dur = 4000) {
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 250); }, dur);
}

function showError(field, msg) {
  if (!field) return;
  field.classList.add('error');
  const e = field.parentElement?.querySelector('.field-error');
  if (e) { e.textContent = msg; e.classList.add('show'); }
}
function clearError(field) {
  if (!field) return;
  field.classList.remove('error');
  const e = field.parentElement?.querySelector('.field-error');
  if (e) e.classList.remove('show');
}

// ── Navbar & Dark Mode ────────────────────────────────────────
function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 40));
  hamburger?.addEventListener('click', () => mobileNav?.classList.toggle('open'));
  mobileNav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('open')));
}

function initDarkMode() {
  const toggle = document.getElementById('darkToggle');
  const saved  = localStorage.getItem('mtq-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (toggle) toggle.textContent = saved === 'dark' ? '☀️' : '🌙';
  toggle?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mtq-theme', next);
    if (toggle) toggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}