/* ============================================================
 * MTQ 2026 — js/admin-juara.js
 * Menu "🏆 Slide Juara" di doyourmagic.html: admin memilih juara 1–3
 * per cabang (putra/putri), mengisi nilai, lalu mengunduh slide
 * 1920×1080 sebagai PNG atau PDF.
 *
 * Memakai yang sudah ada di halaman: adm, API_URL, MTQ_CONFIG, jsonp(),
 * toast(), loadAll(), extractDriveIdClient_(), _prefetchDriveImagesBatch_(),
 * loadDriveImageForKartu_(), html2canvas, jsPDF.
 * Pilihan juara disimpan di localStorage browser ini (kunci mtq_juara_v1).
 * Logo: img/logo-{indramayu,kemenag,lptq,baznas}.png, atau unggah lewat menu.
 * ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'mtq_juara_v1';
  const LOGOS = [['indramayu', 'Kab. Indramayu'], ['kemenag', 'Kemenag'], ['lptq', 'LPTQ'], ['baznas', 'BAZNAS']];
  const ROLE = ['Juara 1', 'Juara 2', 'Juara 3'];
  const PW = 297, PH = 167.0625;   // halaman PDF 16:9 selebar A4 (mm)
  const S = { cab: '', list: [], rank: [], rankMap: {}, picks: [{}, {}, {}], img: {}, logo: {}, built: false };

  const CSS = `
.jr-s,.jr-s *{box-sizing:border-box}
.jr-s{position:relative;width:1920px;height:1080px;overflow:hidden;color:#10231f;font-family:'Figtree','Segoe UI',Arial,sans-serif;
 background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Cg fill='none' stroke='%23e9c46a' stroke-opacity='.12' stroke-width='1.6'%3E%3Crect x='20' y='20' width='56' height='56'/%3E%3Crect x='20' y='20' width='56' height='56' transform='rotate(45 48 48)'/%3E%3C/g%3E%3C/svg%3E"),radial-gradient(1300px 760px at 50% 34%,#0f6f5a 0%,#0a4c40 46%,#052a25 100%)}
.jr-fr{position:absolute;inset:24px;border:2px solid rgba(233,196,106,.7);border-radius:28px}
.jr-fr div{position:absolute;inset:9px;border:1px solid rgba(233,196,106,.35);border-radius:20px}
.jr-lgs{position:absolute;top:44px;left:0;right:0;display:flex;justify-content:center;gap:28px}
.jr-lg{width:108px;height:108px;border-radius:50%;background:#fbf6e6;border:4px solid #d9b45a;box-shadow:0 8px 20px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.jr-lg img{max-width:74%;max-height:74%}
.jr-tt{position:absolute;top:162px;left:0;right:0;text-align:center;font:400 96px/1.05 'Marcellus',Georgia,serif;color:#fbf3d9;text-shadow:0 4px 0 rgba(0,0,0,.28)}
.jr-tt.lg{font-size:80px}
.jr-sb{position:absolute;top:272px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:24px;font-size:30px;font-weight:600;color:rgba(251,243,217,.9)}
.jr-gd{padding:4px 32px 6px;border-radius:999px;background:linear-gradient(#f6dd8e,#d9b45a);color:#0a3d33;font:400 36px/1.2 'Marcellus',Georgia,serif}
.jr-row{position:absolute;left:72px;right:72px;top:346px;bottom:82px;display:flex;align-items:flex-end;justify-content:center;gap:44px}
.jr-c{position:relative;width:500px;padding:18px 18px 22px;border-radius:26px;background:#fbf6e6;border:3px solid #d9b45a;box-shadow:0 20px 44px rgba(0,0,0,.4)}
.jr-c.r1{width:568px;box-shadow:0 0 0 7px rgba(233,196,106,.32),0 26px 56px rgba(0,0,0,.5)}
.jr-ph{display:flex;gap:6px;height:300px;border-radius:16px;overflow:hidden;background:#cfe3dc}
.jr-c.r1 .jr-ph{height:360px}
.jr-c.team .jr-ph{height:200px}
.jr-c.team.r1 .jr-ph{height:260px}
.jr-tp{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;background:#cfe3dc center 18%/cover no-repeat}
.jr-tp b{font:400 96px 'Marcellus',Georgia,serif;color:#0a4c40;opacity:.5}
.jr-rb{position:relative;width:236px;height:66px;margin:-33px auto 0;border:3px solid #fbf6e6;border-radius:999px;text-align:center;font:400 40px/60px 'Marcellus',Georgia,serif;color:#0a3d33;box-shadow:0 6px 14px rgba(0,0,0,.3)}
.jr-c.r1 .jr-rb{background:linear-gradient(#f8e39c,#d9a93a)}
.jr-c.r2 .jr-rb{background:linear-gradient(#f6f8fa,#aeb8c1)}
.jr-c.r3 .jr-rb{background:linear-gradient(#f2c9a4,#b9773f)}
.jr-nm{margin-top:12px;text-align:center;font-weight:800;font-size:38px;line-height:1.14;text-transform:uppercase;color:#10231f}
.jr-nm.sm{font-size:32px}
.jr-nm.xs{font-size:27px}
.jr-mem{margin-top:8px;text-align:center;font-size:24px;font-weight:600;line-height:30px;color:#2b4a42}
.jr-mem i{display:inline-block;width:8px;height:8px;margin-right:10px;border-radius:50%;background:#c9992b;vertical-align:middle}
.jr-ft{margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.jr-kv{flex:1;min-width:0}
.jr-kv>div{display:flex;align-items:baseline;gap:8px;height:42px;line-height:42px;white-space:nowrap}
.jr-kv span{width:108px;flex:none;font-size:21px;font-weight:500;color:#5a6f67}
.jr-kv b{min-width:0;font-size:27px;font-weight:700;color:#10231f;overflow:hidden}
.jr-sc{flex:none;width:150px;height:104px;border-radius:18px;border:3px solid #d9b45a;text-align:center;background:linear-gradient(#0f6f5a,#063a32)}
.jr-sc b{display:block;padding-top:8px;font:400 46px/56px 'Marcellus',Georgia,serif;color:#f3d98b}
.jr-sc b.s{font-size:34px}
.jr-sc span{display:block;font-size:20px;font-weight:600;line-height:22px;color:#fbf3d9}
.jr-c.jr-empty{height:420px;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(251,246,230,.07);border:3px dashed rgba(233,196,106,.6);box-shadow:none;color:#f3d98b;font:400 44px 'Marcellus',Georgia,serif}
.jr-empty small{display:block;margin-top:6px;font:500 24px 'Figtree',sans-serif;opacity:.8}
.jr-ev{position:absolute;left:0;right:0;bottom:38px;text-align:center;font-size:24px;font-weight:600;color:rgba(251,243,217,.72)}
#jrStage{position:absolute;left:0;top:0;transform-origin:0 0}
.jr-view{position:relative;width:100%;max-width:1400px;overflow:hidden;border-radius:14px;background:#052a25;box-shadow:var(--shadow-md)}
#juaraRoot .jr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:16px 20px}
#juaraRoot .f{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--gray-500)}
#juaraRoot select,#juaraRoot input[type=number]{width:100%;padding:9px 12px;border:1px solid var(--gray-300);border-radius:10px;background:var(--white);color:var(--gray-800);font:600 14px 'Plus Jakarta Sans',sans-serif}
#juaraRoot .jr-pk{display:grid;grid-template-columns:92px minmax(0,1fr) 120px;gap:10px;align-items:center;padding:5px 20px}
#juaraRoot .jr-tag{padding:7px 0;border-radius:999px;text-align:center;font-size:13px;font-weight:800;color:#0a3d33}
#juaraRoot .jr-tag.r1{background:linear-gradient(#f8e39c,#d9a93a)}
#juaraRoot .jr-tag.r2{background:linear-gradient(#f6f8fa,#aeb8c1)}
#juaraRoot .jr-tag.r3{background:linear-gradient(#f2c9a4,#b9773f)}
#juaraRoot .jr-hint{padding:6px 20px 14px;font-size:12px;color:var(--gray-500)}
#juaraRoot details{padding:0 20px 16px;font-size:13px;color:var(--gray-600)}
#juaraRoot summary{cursor:pointer;font-weight:700;margin-bottom:10px}
#juaraRoot .jr-up{cursor:pointer;margin:0 8px 8px 0}
@media(max-width:640px){#juaraRoot .jr-pk{grid-template-columns:minmax(0,1fr) 100px}#juaraRoot .jr-tag{grid-column:1/-1}}
`;

  // ── Helper umum ───────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numOf = (n) => { const m = String(n || '').match(/(\d+)\s*$/); return m ? m[1] : String(n || ''); };   // "TAP-095" → "095"
  const tc = (s) => String(s || '').toLowerCase().replace(/(^|[\s.-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const cfg = () => (typeof MTQ_CONFIG !== 'undefined' ? MTQ_CONFIG : {});
  const apiUrl = () => (typeof API_URL !== 'undefined' ? API_URL : (window.MTQ_API_URL || ''));
  const readStore = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } };
  const writeStore = (o) => { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) { /* penuh/diblokir: abaikan */ } };
  const hasPicks = (a) => Array.isArray(a) && a.some((p) => p && p.n);

  // ── Data peserta ──────────────────────────────────────────
  const cabList = () => {
    const l = cfg().CABANG_LIST || [];
    if (l.length) return l.slice();
    const seen = {};
    (adm.allData || []).forEach((r) => { if (r.cabang_lomba) seen[r.cabang_lomba] = 1; });
    return Object.keys(seen).sort();
  };
  const split = (c) => { const m = /^(.*?)\s+(Putra|Putri)\s*$/i.exec(c || ''); return m ? { base: m[1], gen: tc(m[2]) } : { base: c || '', gen: '' }; };
  const isTeam = (r) => /^(team|tim)$/i.test(String(r.tipe_lomba || '').trim());
  const membersOf = (r) => {
    let a = Array.isArray(r.anggota) ? r.anggota : [];
    if (!a.length && r.anggota_json) { try { a = JSON.parse(r.anggota_json) || []; } catch (e) { a = []; } }
    return Array.isArray(a) ? a : [];
  };
  const fotoOf = (m, r) => (m && (m.link_foto || m.foto_url || m.foto_drive_url)) || r.foto_url || '';
  const nameOf = (r) => (isTeam(r) ? (r.nama_tim || 'Tim ' + tc(r.kecamatan)) : r.nama_lengkap) || '';
  const byNomor = (n) => (adm.allData || []).find((r) => r.nomor_pendaftaran === n);
  const listFor = (cab) => (adm.allData || [])
    .filter((r) => r.cabang_lomba === cab && r.status_verifikasi !== 'Ditolak' && r.status_verifikasi !== 'Nonaktif')
    .sort((a, b) => (parseInt(numOf(a.nomor_pendaftaran), 10) || 0) - (parseInt(numOf(b.nomor_pendaftaran), 10) || 0));

  const winnerOf = (p) => {
    const r = p && p.n ? byNomor(p.n) : null;
    if (!r) return null;
    const a = membersOf(r), team = isTeam(r);
    return {
      team, nomor: numOf(r.nomor_pendaftaran), kec: tc(r.kecamatan), nama: nameOf(r),
      nilai: p.v == null ? '' : String(p.v),
      mem: team ? a.map((m) => m.nama_lengkap).filter(Boolean) : [],
      fotos: (team ? (a.length ? a : [{}]).slice(0, 3) : [a[0] || {}]).map((m) => fotoOf(m, r)),
    };
  };
  const wsNow = () => S.picks.map(winnerOf);

  // ── Foto & logo ───────────────────────────────────────────
  function ensureImgs(ws) {
    const need = {};
    ws.forEach((w) => { if (w) w.fotos.forEach((u) => { const id = u && extractDriveIdClient_(u); if (id && !S.img[id]) need[id] = u; }); });
    const ids = Object.keys(need);
    if (!ids.length) return Promise.resolve(0);
    return _prefetchDriveImagesBatch_(ids).then((got) => {
      const miss = ids.filter((id) => { if (got[id]) { S.img[id] = got[id]; return false; } return true; });
      return Promise.all(miss.map((id) => loadDriveImageForKartu_(need[id]).then((im) => { if (im && im.src) S.img[id] = im.src; })));
    }).then(() => ids.length).catch(() => 0);
  }

  const checkLogos = () => Promise.all(LOGOS.map(([k]) => new Promise((res) => {
    let src = '';
    try { src = localStorage.getItem('mtq_juara_logo_' + k) || ''; } catch (e) { /* abaikan */ }
    src = src || 'img/logo-' + k + '.png';
    const im = new Image();
    im.onload = () => { S.logo[k] = src; res(); };
    im.onerror = () => { S.logo[k] = ''; res(); };
    im.src = src;
  })));

  // ── Slide ─────────────────────────────────────────────────
  function photoBox(w) {
    const tile = (url, i) => {
      const id = url ? extractDriveIdClient_(url) : '';
      const src = id && S.img[id];
      const ini = (((w.team && w.mem[i]) || w.nama || '?').trim().charAt(0) || '?').toUpperCase();
      return `<div class="jr-tp"${src ? ` style="background-image:url('${src}')"` : ''}>${src ? '' : `<b>${esc(ini)}</b>`}</div>`;
    };
    return `<div class="jr-ph">${w.fotos.map(tile).join('')}</div>`;
  }

  function card(w, i) {
    if (!w) return `<div class="jr-c jr-empty r${i + 1}"><div>${ROLE[i]}<small>belum dipilih</small></div></div>`;
    const n = w.nama.length, nm = n > 30 ? ' xs' : n > 19 ? ' sm' : '';
    const mem = w.team && w.mem.length
      ? `<div class="jr-mem">${w.mem.slice(0, 4).map((m) => `<div><i></i>${esc(m)}</div>`).join('')}</div>` : '';
    return `<div class="jr-c r${i + 1}${w.team ? ' team' : ''}">${photoBox(w)}<div class="jr-rb">${ROLE[i]}</div>` +
      `<div class="jr-nm${nm}">${esc(w.nama)}</div>${mem}` +
      `<div class="jr-ft"><div class="jr-kv"><div><span>Nomor</span><b>${esc(w.nomor)}</b></div><div><span>Kecamatan</span><b>${esc(w.kec)}</b></div></div>` +
      `<div class="jr-sc"><b${w.nilai.length > 5 ? ' class="s"' : ''}>${esc(w.nilai || '–')}</b><span>Nilai</span></div></div></div>`;
  }

  // Urutan tampil: juara 2 — juara 1 (tengah, paling besar) — juara 3
  function slide(cab, ws) {
    const sp = split(cab), C = cfg();
    const logos = LOGOS.filter((l) => S.logo[l[0]]).map((l) => `<div class="jr-lg"><img src="${S.logo[l[0]]}" alt=""></div>`).join('');
    const ev = [C.EVENT_DATE_DISPLAY, C.EVENT_LOCATION].filter(Boolean).join(', ');
    return `<div class="jr-fr"><div></div></div><div class="jr-lgs">${logos}</div>` +
      `<div class="jr-tt${sp.base.length > 26 ? ' lg' : ''}">${esc(sp.base)}</div>` +
      `<div class="jr-sb">${sp.gen ? `<span class="jr-gd">${esc(sp.gen)}</span>` : ''}<span>${esc(C.EVENT_TITLE || 'MTQ ke-56 Kabupaten Indramayu Tahun 2026')}</span></div>` +
      `<div class="jr-row">${card(ws[1], 1)}${card(ws[0], 0)}${card(ws[2], 2)}</div>` +
      (ev ? `<div class="jr-ev">${esc(ev)}</div>` : '');
  }

  function fit() {
    const v = $('jrView'), s = $('jrStage');
    if (!v || !s || !v.clientWidth) return;
    const k = v.clientWidth / 1920;
    s.style.transform = `scale(${k})`;
    v.style.height = `${1080 * k}px`;
  }
  function paint() { const st = $('jrStage'); if (st) { st.innerHTML = slide(S.cab, wsNow()); fit(); } }
  function draw() { paint(); ensureImgs(wsNow()).then((n) => { if (n) paint(); }); }

  // ── Panel pilihan juara ───────────────────────────────────
  const hint = (t) => { const el = $('jrHint'); if (el) el.textContent = t; };
  const logoSummary = () => { const el = $('jrLgSum'); if (el) el.textContent = `Logo di slide (${LOGOS.filter((l) => S.logo[l[0]]).length}/${LOGOS.length} terpasang)`; };
  function markCab() {
    const op = $('jrCab') && $('jrCab').selectedOptions[0];
    if (op) op.textContent = (hasPicks(S.picks) ? '✓ ' : '') + S.cab;
  }
  function persist() {
    if (!S.cab) return;
    const o = readStore();
    o[S.cab] = S.picks.map((p) => ({ n: (p && p.n) || '', v: p && p.v != null ? String(p.v) : '' }));
    writeStore(o);
  }
  function opts(sel) {
    let h = '<option value="">— pilih peserta —</option>';
    S.list.forEach((r) => {
      const sc = S.rankMap[r.nomor_pendaftaran];
      const t = `${numOf(r.nomor_pendaftaran)} — ${nameOf(r)} (${tc(r.kecamatan)})${sc != null ? ' — nilai ' + sc : ''}`;
      h += `<option value="${esc(r.nomor_pendaftaran)}"${sel === r.nomor_pendaftaran ? ' selected' : ''}>${esc(t)}</option>`;
    });
    return h;
  }
  function fillPicks() {
    $('jrPicks').innerHTML = [0, 1, 2].map((i) => {
      const p = S.picks[i] || {};
      return `<div class="jr-pk"><b class="jr-tag r${i + 1}">${ROLE[i]}</b>` +
        `<select class="jr-sel" data-i="${i}">${opts(p.n)}</select>` +
        `<input type="number" step="0.01" min="0" class="jr-val" data-i="${i}" placeholder="Nilai" value="${esc(p.v == null ? '' : p.v)}"></div>`;
    }).join('');
  }
  function auto() {
    const ok = S.rank.filter((r) => S.list.some((x) => x.nomor_pendaftaran === r.id)).slice(0, 3);
    if (!ok.length) { toast('Belum ada nilai', 'Sistem Penilaian belum punya nilai untuk cabang ini.', 'warning'); return; }
    S.picks = [0, 1, 2].map((i) => (ok[i] ? { n: ok[i].id, v: S.rankMap[ok[i].id] } : {}));
    fillPicks(); persist(); markCab(); draw();
  }
  function pick(cab) {
    if (!cab) return;
    S.cab = cab; S.list = listFor(cab); S.rank = []; S.rankMap = {};
    const sv = readStore()[cab];
    S.picks = [0, 1, 2].map((i) => (sv && sv[i] ? { n: sv[i].n, v: sv[i].v } : {}));
    fillPicks(); draw();
    hint(S.list.length ? 'Memuat nilai dari Sistem Penilaian…' : 'Belum ada peserta di cabang ini.');
    if (!S.list.length) return;
    jsonp(`${apiUrl()}?action=getPeringkat&cabang=${encodeURIComponent(cab)}`, 'juaraRank', (res) => {
      if (S.cab !== cab) return;   // admin sudah pindah cabang
      const rows = res && res.success && Array.isArray(res.data) ? res.data : [];
      S.rank = rows.filter((r) => r.avgTotal != null);
      S.rank.forEach((r) => { S.rankMap[r.id] = Math.round(r.avgTotal * 100) / 100; });
      S.picks.forEach((p) => { if (p.n && (p.v === '' || p.v == null) && S.rankMap[p.n] != null) p.v = S.rankMap[p.n]; });
      hint(S.rank.length
        ? 'Nilai terisi dari Sistem Penilaian (rata-rata total hakim) dan bisa diubah manual.'
        : 'Belum ada nilai di Sistem Penilaian untuk cabang ini — isi nilai secara manual.');
      if (!sv && S.rank.length) auto(); else { fillPicks(); paint(); }
    }, 30000);
  }
  function fillCab() {
    const sel = $('jrCab'), sv = readStore(), keep = S.cab;
    sel.innerHTML = cabList().map((c) => `<option value="${esc(c)}">${hasPicks(sv[c]) ? '✓ ' : ''}${esc(c)}</option>`).join('');
    if (keep) sel.value = keep;
    if (sel.value && sel.value !== S.cab) pick(sel.value);
    else if (S.cab) { S.list = listFor(S.cab); fillPicks(); paint(); }
  }

  // ── Unduh ─────────────────────────────────────────────────
  const fonts = () => {
    const f = document.fonts;
    if (!f || !f.load) return Promise.resolve();
    return Promise.all(['400 40px Marcellus', '500 20px Figtree', '700 20px Figtree', '800 20px Figtree'].map((x) => f.load(x, 'Juara 1 Ab')))
      .then(() => f.ready).catch(() => {});
  };
  function shot(cab, ws) {
    const off = document.createElement('div');
    off.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;pointer-events:none';
    off.innerHTML = `<div class="jr-s">${slide(cab, ws)}</div>`;
    document.body.appendChild(off);
    return fonts()
      .then(() => html2canvas(off.firstChild, { scale: 1, useCORS: true, backgroundColor: '#052a25', width: 1920, height: 1080, logging: false, imageTimeout: 20000 }))
      .then((c) => { off.remove(); return c; }, (e) => { off.remove(); throw e; });
  }
  function busy(id, on, txt) {
    const b = $(id); if (!b) return;
    if (on) { if (b.dataset.t === undefined) b.dataset.t = b.innerHTML; b.disabled = true; b.innerHTML = `<span class="spin"></span> ${txt}`; }
    else { b.disabled = false; if (b.dataset.t !== undefined) { b.innerHTML = b.dataset.t; delete b.dataset.t; } }
  }
  function dl(id, kind) {
    const ws = wsNow();
    if (!ws.some(Boolean)) { toast('Belum ada juara', 'Pilih minimal satu peserta dulu.', 'warning'); return; }
    const name = 'Juara_' + slug(S.cab);
    busy(id, true, 'Menyiapkan…');
    ensureImgs(ws).then(() => shot(S.cab, ws)).then((c) => {
      if (kind === 'png') {
        c.toBlob((b) => {
          const u = URL.createObjectURL(b), a = document.createElement('a');
          a.href = u; a.download = name + '.png'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(u), 4000);
        }, 'image/png');
      } else {
        const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] });
        pdf.addImage(c.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, PW, PH);
        pdf.save(name + '.pdf');
      }
      toast('Berhasil', `Slide ${S.cab} diunduh.`, 'success');
    }).catch((e) => toast('Gagal', 'Slide gagal dibuat: ' + ((e && e.message) || e), 'error'))
      .then(() => busy(id, false));
  }
  function dlAll() {
    const sv = readStore(), order = cabList().filter((c) => hasPicks(sv[c]));
    if (!order.length) { toast('Belum ada juara', 'Belum ada cabang yang juaranya sudah diatur.', 'warning'); return; }
    busy('jrAll', true, 'Mengambil foto…');
    const jobs = order.map((c) => ({ c, ws: sv[c].map(winnerOf) }));
    ensureImgs([].concat(...jobs.map((j) => j.ws))).then(() => {
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] });
      let p = Promise.resolve();
      jobs.forEach((j, k) => {
        p = p.then(() => {
          $('jrAll').innerHTML = `<span class="spin"></span> ${k + 1}/${jobs.length}`;
          return shot(j.c, j.ws).then((cv) => {
            if (k) pdf.addPage([PW, PH], 'landscape');
            pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PW, PH);
          });
        });
      });
      return p.then(() => { pdf.save(`Slide_Juara_MTQ2026_${jobs.length}_cabang.pdf`); toast('Berhasil', `${jobs.length} slide diunduh dalam 1 PDF.`, 'success'); });
    }).catch((e) => toast('Gagal', 'PDF gagal dibuat: ' + ((e && e.message) || e), 'error'))
      .then(() => busy('jrAll', false));
  }

  // ── Bangun halaman (sekali) ───────────────────────────────
  function build() {
    const root = $('juaraRoot');
    if (!root || S.built) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root.innerHTML = `
      <div class="page-header"><div>
        <div class="page-title">🏆 Slide Juara</div>
        <div class="page-sub">Pilih juara 1–3 tiap cabang, isi nilai, lalu unduh slide sebagai gambar atau PDF</div>
      </div></div>
      <div class="admin-card" style="margin-bottom:18px">
        <div class="jr-bar">
          <label class="f" style="flex:1;min-width:240px">Cabang lomba<select id="jrCab"></select></label>
          <button class="btn btn-outline btn-sm" id="jrAuto">Isi dari peringkat</button>
          <button class="btn btn-emerald btn-sm" id="jrPng">⬇ PNG</button>
          <button class="btn btn-emerald btn-sm" id="jrPdf">⬇ PDF</button>
          <button class="btn btn-outline btn-sm" id="jrAll">PDF semua cabang</button>
        </div>
        <div id="jrPicks"></div>
        <div class="jr-hint" id="jrHint"></div>
        <details><summary id="jrLgSum">Logo di slide</summary>
          <div id="jrLogos">${LOGOS.map((l) => `<label class="btn btn-outline btn-sm jr-up">${l[1]}<input type="file" accept="image/*" data-k="${l[0]}" hidden></label>`).join('')}</div>
          <div style="margin-top:4px;font-size:12px;color:var(--gray-500)">Logo dibaca dari <code>img/logo-indramayu.png</code>, <code>logo-kemenag.png</code>, <code>logo-lptq.png</code>, <code>logo-baznas.png</code>. Belum ada berkasnya? Unggah di sini (tersimpan di browser ini).</div>
        </details>
      </div>
      <div class="jr-view" id="jrView"><div class="jr-s" id="jrStage"></div></div>`;

    $('jrCab').addEventListener('change', (e) => pick(e.target.value));
    $('jrAuto').addEventListener('click', auto);
    $('jrPng').addEventListener('click', () => dl('jrPng', 'png'));
    $('jrPdf').addEventListener('click', () => dl('jrPdf', 'pdf'));
    $('jrAll').addEventListener('click', dlAll);

    $('jrPicks').addEventListener('change', (e) => {
      const t = e.target, i = +t.getAttribute('data-i');
      if (!t.classList.contains('jr-sel')) return;
      const n = t.value;
      if (n && S.picks.some((p, k) => k !== i && p.n === n)) {
        toast('Sudah dipilih', 'Peserta ini sudah dipilih di juara lain.', 'warning');
        t.value = (S.picks[i] && S.picks[i].n) || '';
        return;
      }
      const sc = S.rankMap[n], same = S.picks[i] && S.picks[i].n === n;
      S.picks[i] = { n, v: sc != null ? sc : (same ? S.picks[i].v : '') };
      const inp = document.querySelector(`.jr-val[data-i="${i}"]`);
      if (inp) inp.value = S.picks[i].v == null ? '' : S.picks[i].v;
      persist(); markCab(); draw();
    });
    $('jrPicks').addEventListener('input', (e) => {
      const t = e.target;
      if (!t.classList.contains('jr-val')) return;
      const i = +t.getAttribute('data-i');
      S.picks[i] = { n: (S.picks[i] && S.picks[i].n) || '', v: t.value };
      persist(); markCab(); paint();
    });

    $('jrLogos').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0], k = e.target.getAttribute('data-k');
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          const h = Math.min(256, im.height), w = Math.round(im.width * h / im.height), cv = document.createElement('canvas');
          cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h);
          try { localStorage.setItem('mtq_juara_logo_' + k, cv.toDataURL('image/png')); }
          catch (er) { toast('Gagal', 'Logo tidak bisa disimpan di browser ini.', 'error'); return; }
          checkLogos().then(() => { logoSummary(); paint(); });
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
      e.target.value = '';
    });

    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe($('jrView'));
    S.built = true;
  }

  // Dipanggil showPage('juara') di doyourmagic.html
  window.juaraInit = function () {
    build();
    if (!(adm.allData || []).length && typeof loadAll === 'function') loadAll(fillCab); else fillCab();
    checkLogos().then(() => { logoSummary(); paint(); });
    fit();
  };
})();