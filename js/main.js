// ============================================
//  MTQ 2026 - Main JS (index.html)
// ============================================

// ── Config ──────────────────────────────────
// SATU SUMBER: js/config.js (MTQ_CONFIG) — jangan hardcode ulang di sini.
// Getter dipakai supaya selalu baca nilai MTQ_CONFIG terbaru (termasuk
// setelah ditimpa data live dari server oleh file lain di halaman yang sama).
const CONFIG = {
  get API_URL() { return window.MTQ_API_URL || ''; },
  get EVENT_DATE() { return MTQ_CONFIG.EVENT_DATE_START; },
  get EVENT_DATE_DISPLAY() { return MTQ_CONFIG.EVENT_DATE_DISPLAY; },
  get EVENT_LOCATION() { return MTQ_CONFIG.EVENT_LOCATION; },
  get EVENT_THEME() { return MTQ_CONFIG.EVENT_THEME; },
};

// ── On DOM Ready ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initDarkMode();
  initCountdown();
  initFAQ();
  initAnimations();
  loadStats();
  loadRegStatus();   // FIX #12 — status pendaftaran di beranda
  setEventInfo();
  if (typeof initHasilPenilaian === 'function') initHasilPenilaian();
});

// ── Navbar ───────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  hamburger?.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
  });

  // Close mobile nav on link click
  mobileNav?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => mobileNav.classList.remove('open'));
  });

  // Active link highlight
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a, .mobile-nav a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 100) current = s.id;
    });
    navLinks.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === `#${current}`) a.classList.add('active');
    });
  });
}

// ── Dark Mode ────────────────────────────────
function initDarkMode() {
  const toggle = document.getElementById('darkToggle');
  const saved = localStorage.getItem('mtq-theme') || 'light';
  applyTheme(saved);

  toggle?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('mtq-theme', next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('#darkToggle');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Countdown ────────────────────────────────
function initCountdown() {
  const target = new Date(CONFIG.EVENT_DATE).getTime();
  const els = {
    days: document.getElementById('cdDays'),
    hours: document.getElementById('cdHours'),
    mins: document.getElementById('cdMins'),
    secs: document.getElementById('cdSecs'),
  };

  function update() {
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) {
      document.getElementById('countdown-section')?.remove();
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (els.days)  els.days.textContent  = String(d).padStart(2, '0');
    if (els.hours) els.hours.textContent = String(h).padStart(2, '0');
    if (els.mins)  els.mins.textContent  = String(m).padStart(2, '0');
    if (els.secs)  els.secs.textContent  = String(s).padStart(2, '0');
  }
  update();
  setInterval(update, 1000);
}

// ── Load Stats ───────────────────────────────
// Menggunakan JSONP agar tidak ada CORS error di console.
function loadStats() {
  const statEls = document.querySelectorAll('[data-stat]');
  if (!statEls.length) return;

  statEls.forEach(el => { el.textContent = '–'; });

  jsonp(`${CONFIG.API_URL}?action=getStats`, 'mtqStats', (data) => {
    if (data && data.success) {
      statEls.forEach(el => {
        const key = el.dataset.stat;
        if (data[key] !== undefined) animateCounter(el, Number(data[key]) || 0);
        else el.textContent = '0';
      });
    } else {
      statEls.forEach(el => { el.textContent = '0'; });
    }
  });
}

// ── FIX #13: Load Registration Status ────────
// SEBELUMNYA: fungsi ini hanya menyasar elemen [data-reg-status],
// #regStatusBox, #regStatusText, dan .btn-daftar/[data-daftar-btn] —
// tidak satu pun elemen itu ada di index.html, jadi #heroRegBanner
// (dan #countdownSection 3-state yang sudah dibuat di HTML/CSS tapi
// tidak pernah disentuh JS) macet permanen di teks placeholder
// "⏳ Memuat status pendaftaran...".
// SEKARANG: menyasar elemen yang benar-benar ada di halaman —
// #heroRegBanner, #cdStateSoon/#cdStateOpen/#cdStateClosed (dengan
// angka soonDays/openDays dst. yang di-countdown live tiap detik),
// #heroRegPeriod, dan tombol daftar (#navDaftarBtn/#heroDaftarBtn/
// #mobileNavDaftarBtn).
let _regCountdownTimer = null;

function loadRegStatus() {
  const banner     = document.getElementById('heroRegBanner');
  const periodEl   = document.getElementById('heroRegPeriod');
  const daftarBtns = document.querySelectorAll('#navDaftarBtn, #heroDaftarBtn, #mobileNavDaftarBtn');

  // Fallback: baca dari MTQ_CONFIG jika API tidak terjangkau
  const localBuka  = (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.PENDAFTARAN_BUKA)  ? MTQ_CONFIG.PENDAFTARAN_BUKA  : null;
  const localTutup = (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.PENDAFTARAN_TUTUP) ? MTQ_CONFIG.PENDAFTARAN_TUTUP : null;

  function fmtLong(iso) {
    return iso ? new Date(iso).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }) : '—';
  }
  function fmtShort(iso) {
    return iso ? new Date(iso).toLocaleDateString('id-ID', { day:'numeric', month:'short' }) : '—';
  }

  function applyStatus(isOpen, status, buka, tutup) {
    const bukaDate  = fmtLong(buka);
    const tutupDate = fmtLong(tutup);

    // ── Banner pil di hero ──
    if (banner) {
      banner.classList.remove('open', 'soon', 'closed');
      if (status === 'belum_buka') {
        banner.classList.add('soon');
        banner.textContent = `🔔 Pendaftaran dibuka ${bukaDate}`;
      } else if (isOpen) {
        banner.classList.add('open');
        banner.textContent = `🟢 Pendaftaran sedang dibuka — hingga ${tutupDate}`;
      } else {
        banner.classList.add('closed');
        banner.textContent = `🔒 Pendaftaran ditutup sejak ${tutupDate}`;
      }
    }

    // ── Info periode di hero-info-card (data live, bukan hardcode) ──
    if (periodEl && buka && tutup) {
      periodEl.textContent = `${fmtShort(buka)}–${fmtShort(tutup)}`;
    }

    // ── Tombol "Daftar Sekarang" (navbar, hero, mobile) ──
    daftarBtns.forEach(btn => {
      if (!isOpen) { btn.classList.add('btn-daftar-disabled'); btn.setAttribute('aria-disabled', 'true'); }
      else { btn.classList.remove('btn-daftar-disabled'); btn.removeAttribute('aria-disabled'); }
    });

    // ── Countdown 3-state (#countdownSection: soon/open/closed) ──
    document.querySelectorAll('.cd-state').forEach(el => el.classList.remove('show'));
    if (_regCountdownTimer) { clearInterval(_regCountdownTimer); _regCountdownTimer = null; }

    if (status === 'belum_buka' && buka) {
      document.getElementById('cdStateSoon')?.classList.add('show');
      runRegCountdown(new Date(buka).getTime(), 'soon');
    } else if (isOpen && tutup) {
      document.getElementById('cdStateOpen')?.classList.add('show');
      runRegCountdown(new Date(tutup).getTime(), 'open');
    } else {
      document.getElementById('cdStateClosed')?.classList.add('show');
    }
  }

  // FIX UTAMA: tampilkan status dari MTQ_CONFIG (lokal) DULU, sinkron,
  // SEBELUM request network apa pun dikirim. MTQ_CONFIG.PENDAFTARAN_BUKA/
  // TUTUP adalah sumber yang sama dengan PENDAFTARAN_CONFIG di config.gs
  // (lihat catatan SATU-SATUNYA SUMBER di config.js) — jadi ini sudah benar
  // untuk hampir semua kasus, dan sama sekali tidak bergantung ke jaringan.
  // Banner TIDAK MUNGKIN lagi macet di teks loading walau request ke API
  // gagal, lambat, atau diblokir di device tertentu. Pola ini menyamakan
  // dengan fix yang sudah ada di loadConfig() → daftar.js.
  if (localBuka && localTutup) {
    const localStat = getRegStatus();   // dari config.js: 'belum_buka'|'buka'|'tutup'
    applyStatus(localStat === 'buka', localStat, localBuka, localTutup);
  }

  // Baru setelah itu, coba upgrade ke data LIVE dari server. Satu-satunya
  // hal yang bisa beda dari perhitungan lokal di atas adalah OVERRIDE manual
  // admin (PENDAFTARAN_CONFIG.OVERRIDE di config.gs), yang memang tidak ada
  // representasinya di MTQ_CONFIG. Kalau gagal/timeout: diamkan saja — banner
  // sudah benar sejak baris di atas, tidak perlu fallback apa pun lagi di sini.
  jsonp(`${CONFIG.API_URL}?action=getStats`, 'mtqRegStatus', (data) => {
    if (data && data.success) {
      applyStatus(data.isOpen, data.status, data.buka, data.tutup);
    } else if (!localBuka || !localTutup) {
      if (banner) banner.textContent = 'ℹ️ Status pendaftaran tidak tersedia';
    }
  });
}

// Countdown detik-per-detik untuk state 'soon' (dibuka dalam ...) atau
// 'open' (ditutup dalam ...). `prefix` menentukan target id: soonDays/
// soonHours/soonMins/soonSecs, atau openDays/openHours/openMins/openSecs.
function runRegCountdown(target, prefix) {
  const els = {
    days : document.getElementById(prefix + 'Days'),
    hours: document.getElementById(prefix + 'Hours'),
    mins : document.getElementById(prefix + 'Mins'),
    secs : document.getElementById(prefix + 'Secs'),
  };
  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      clearInterval(_regCountdownTimer);
      _regCountdownTimer = null;
      loadRegStatus();   // waktu tercapai — muat ulang status terbaru dari server
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (els.days)  els.days.textContent  = String(d).padStart(2, '0');
    if (els.hours) els.hours.textContent = String(h).padStart(2, '0');
    if (els.mins)  els.mins.textContent  = String(m).padStart(2, '0');
    if (els.secs)  els.secs.textContent  = String(s).padStart(2, '0');
  }
  tick();
  _regCountdownTimer = setInterval(tick, 1000);
}

/**
 * API helper — fetch dulu, JSONP klasik sebagai fallback.
 * FIX: disamakan dengan pola yang sudah terbukti jalan di daftar.js.
 * Ini LEBIH TANGGUH daripada JSONP murni: fetch() bisa membaca body
 * response walau server balas HTML (mis. halaman "Sign in" Google saat
 * setting akses deployment tidak "Anyone", atau halaman error lain) —
 * kasus yang bikin JSONP murni gagal TOTAL DIAM-DIAM (bukan cuma di
 * fn() tidak terpanggil, tapi juga console error yang tidak pernah
 * masuk ke onerror karena script-nya "berhasil" dimuat, isinya saja
 * yang bukan JS valid). Kalau fetch gagal (mis. network benar2 putus),
 * baru turun ke JSONP klasik sebagai jalur kedua.
 * @param {string} url       - URL endpoint (sudah termasuk ?action=...)
 * @param {string} cbPrefix  - prefix nama callback global (dipakai jalur fallback)
 * @param {Function} fn      - callback(data) — dipanggil dgn null kalau gagal/timeout
 * @param {number} timeout   - ms sebelum dianggap gagal (default 8000)
 */
function jsonp(url, cbPrefix, fn, timeout = 8000) {
  fetch(url + '&callback=_noop', {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined,
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(text => {
      // GAS JSONP membungkus JSON dalam callback(...) — coba ekstrak dulu
      let json = null;
      const match = text.match(/^[^(]+\((.+)\)\s*;?\s*$/s);
      if (match) { try { json = JSON.parse(match[1]); } catch(e) { /* bukan JSON */ } }
      if (!json) { try { json = JSON.parse(text); } catch(e) { /* bukan JSON juga */ } }

      if (json) {
        try { fn(json); } catch(e) { log.error('jsonp callback error', e); }
      } else {
        // Server balas HTML/format tak dikenal (mis. redirect login) — fallback
        log.warn('Response bukan JSON, memakai fallback. Preview:', text.slice(0, 80));
        fn(null);
      }
    })
    .catch(err => {
      // fetch gagal (network error, timeout, CORS block, dll) — coba JSONP klasik
      log.warn('fetch gagal, mencoba JSONP klasik:', err.message);
      _jsonpClassic(url, cbPrefix, fn, timeout);
    });
}

// JSONP klasik — jalur kedua kalau fetch() sama sekali tidak bisa dipakai
function _jsonpClassic(url, cbPrefix, fn, timeout) {
  const cbName = cbPrefix + '_' + Date.now();
  const script = document.createElement('script');
  let done = false;
  let timer;

  function cleanup(result) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    delete window[cbName];
    script.remove();
    try { fn(result); } catch(e) { log.error('JSONP callback error', e); }
  }

  window[cbName] = (data) => cleanup(data);

  script.src = `${url}&callback=${cbName}`;
  script.onerror = () => { log.warn('JSONP script error for', url); cleanup(null); };
  timer = setTimeout(() => { log.warn('JSONP timeout for', url); cleanup(null); }, timeout);

  document.head.appendChild(script);
}

function animateCounter(el, target) {
  const duration = 1500;
  const start = performance.now();
  const startVal = 0;
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(startVal + (target - startVal) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Set Event Info ───────────────────────────
function setEventInfo() {
  const locEls = document.querySelectorAll('[data-info="location"]');
  const themeEls = document.querySelectorAll('[data-info="theme"]');
  const dateEls = document.querySelectorAll('[data-info="date"]');

  const dateStr = CONFIG.EVENT_DATE_DISPLAY || new Date(CONFIG.EVENT_DATE).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  locEls.forEach(el => { el.textContent = CONFIG.EVENT_LOCATION; });
  themeEls.forEach(el => { el.textContent = CONFIG.EVENT_THEME; });
  dateEls.forEach(el => { el.textContent = dateStr; });
}

// ── FAQ ──────────────────────────────────────
function initFAQ() {
  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ── Scroll Animations ────────────────────────
function initAnimations() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = `${i * 0.08}s`;
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.animate-in').forEach(el => obs.observe(el));
}

// ── Toast ─────────────────────────────────────
function showToast(title, msg, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div>
    </div>
    <button class="toast-close" onclick="removeToast(this.parentElement)">✕</button>
  `;
  container.appendChild(toast);

  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 250);
}