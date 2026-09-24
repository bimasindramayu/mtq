/* ============================================================
 * MTQ 2026 — js/admin-juara.js
 * Menu "🏆 Slide Juara" di doyourmagic.html: admin memilih juara 1–3
 * per cabang (putra/putri), mengisi nilai, lalu mengunduh slide
 * 1920×1080 sebagai PNG atau PDF.
 *
 * Memakai yang sudah ada di halaman: adm, API_URL, MTQ_CONFIG, jsonp(),
 * toast(), loadAll(), extractDriveIdClient_(), _prefetchDriveImagesBatch_(),
 * loadDriveImageForKartu_(), jsPDF.
 * Pilihan juara + posisi/zoom foto disimpan di localStorage browser ini (kunci mtq_juara_v1).
 * Logo: assets/{indramayu,kemenag,mtq,baznas}.png (sudah ada di repo).
 * ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'mtq_juara_v1';
  const LOGOS = [['indramayu', 'Kab. Indramayu'], ['kemenag', 'Kemenag'], ['mtq', 'MTQ'], ['baznas', 'BAZNAS']];
  const ROLE = ['Juara 1', 'Juara 2', 'Juara 3'];
  const PW = 297, PH = 167.0625;   // halaman PDF 16:9 selebar A4 (mm)
  const S = { cab: '', list: [], rank: [], rankMap: {}, picks: [{}, {}, {}], img: {}, dim: {}, ts: [0, 0, 0], open: {}, logo: {}, built: false };

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
.jr-tp{position:relative;flex:none;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#cfe3dc}
.jr-tp[data-i]{cursor:grab;touch-action:none;user-select:none}
.jr-tp img{position:absolute;max-width:none;display:block}
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
#juaraRoot select,#juaraRoot input[type=number]{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--gray-300);border-radius:10px;background:var(--white);color:var(--gray-800);font:600 14px 'Plus Jakarta Sans',sans-serif}
#juaraRoot .jr-pk{display:grid;grid-template-columns:92px minmax(0,1fr) 120px auto;gap:10px;align-items:center;padding:5px 20px}
#juaraRoot .jr-tag{padding:7px 0;border-radius:999px;text-align:center;font-size:13px;font-weight:800;color:#0a3d33}
#juaraRoot .jr-tag.r1{background:linear-gradient(#f8e39c,#d9a93a)}
#juaraRoot .jr-tag.r2{background:linear-gradient(#f6f8fa,#aeb8c1)}
#juaraRoot .jr-tag.r3{background:linear-gradient(#f2c9a4,#b9773f)}
#juaraRoot .jr-hint{padding:6px 20px 14px;font-size:12px;color:var(--gray-500)}
#juaraRoot .jr-adj{grid-column:1/-1;font-size:12px;color:var(--gray-600)}
#juaraRoot .jr-adj summary{cursor:pointer;font-weight:700}
#juaraRoot .jr-adjb{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;padding:8px 0 4px}
#juaraRoot .jr-adjb label{display:flex;align-items:center;gap:6px;font-weight:600}
#juaraRoot .jr-adjb input[type=range]{width:130px}
#juaraRoot .jr-adjb select{width:auto;max-width:260px}
@media(max-width:640px){#juaraRoot .jr-pk{grid-template-columns:minmax(0,1fr) 100px auto}#juaraRoot .jr-tag{grid-column:1/-1}}
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
      team, nomor: String(r.nomor_pendaftaran || ''), kec: tc(r.kecamatan), nama: nameOf(r), ph: p.ph || {},
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
    }).then(() => Promise.all(ids.map((id) => (S.img[id] ? loadImg(S.img[id]).then((im) => {   // ukuran asli dipakai untuk zoom/geser
      if (im) S.dim[id] = [im.naturalWidth || im.width, im.naturalHeight || im.height]; else delete S.img[id];
    }) : null)))).then(() => ids.length).catch(() => 0);
  }

  const checkLogos = () => Promise.all(LOGOS.map(([k]) => new Promise((res) => {
    const src = 'assets/' + k + '.png';
    const im = new Image();
    im.onload = () => { S.logo[k] = src; res(); };
    im.onerror = () => { S.logo[k] = ''; res(); };
    im.src = src;
  })));

  // ── Slide ─────────────────────────────────────────────────
  // Geometri bingkai foto — dipakai bersama oleh preview (DOM) dan unduhan (canvas)
  const DEF = { z: 1, x: 50, y: 18 };   // z: 1 = foto memenuhi bingkai; x/y: posisi dalam persen
  const viewOf = (w, t) => Object.assign({}, DEF, (w.ph || {})[t]);
  const geo = (w, i) => {
    const r1 = i === 0, cw = r1 ? 568 : 500, inW = cw - 42, n = w.fotos.length;
    return { r1, cw, inW, phH: w.team ? (r1 ? 260 : 200) : (r1 ? 360 : 300), tw: (inW - 6 * (n - 1)) / n };
  };
  const frame = (iw, ih, fw, fh, v) => {
    const k = Math.max(fw / iw, fh / ih) * v.z, dw = iw * k, dh = ih * k;
    return { dw, dh, dx: (fw - dw) * v.x / 100, dy: (fh - dh) * v.y / 100 };
  };
  const imgCss = (f) => `left:${f.dx}px;top:${f.dy}px;width:${f.dw}px;height:${f.dh}px`;

  function photoBox(w, i) {
    const g = geo(w, i);
    const tile = (url, t) => {
      const id = url ? extractDriveIdClient_(url) : '', src = id && S.img[id], d = id && S.dim[id];
      const ini = (((w.team && w.mem[t]) || w.nama || '?').trim().charAt(0) || '?').toUpperCase();
      return src && d
        ? `<div class="jr-tp" data-i="${i}" data-t="${t}" style="width:${g.tw}px"><img src="${src}" draggable="false" alt="" style="${imgCss(frame(d[0], d[1], g.tw, g.phH, viewOf(w, t)))}"></div>`
        : `<div class="jr-tp" style="width:${g.tw}px"><b>${esc(ini)}</b></div>`;
    };
    return `<div class="jr-ph">${w.fotos.map(tile).join('')}</div>`;
  }

  function card(w, i) {
    if (!w) return `<div class="jr-c jr-empty r${i + 1}"><div>${ROLE[i]}<small>belum dipilih</small></div></div>`;
    const n = w.nama.length, nm = n > 30 ? ' xs' : n > 19 ? ' sm' : '';
    const ks = (t) => { const o = t.length - (i === 0 ? 15 : 11); return o <= 0 ? '' : ` style="font-size:${o === 1 ? 25 : o === 2 ? 23 : 21}px"`; };
    const mem = w.team && w.mem.length
      ? `<div class="jr-mem">${w.mem.slice(0, 4).map((m) => `<div><i></i>${esc(m)}</div>`).join('')}</div>` : '';
    return `<div class="jr-c r${i + 1}${w.team ? ' team' : ''}">${photoBox(w, i)}<div class="jr-rb">${ROLE[i]}</div>` +
      `<div class="jr-nm${nm}">${esc(w.nama)}</div>${mem}` +
      `<div class="jr-ft"><div class="jr-kv"><div><span>Nomor</span><b${ks(w.nomor)}>${esc(w.nomor)}</b></div><div><span>Kecamatan</span><b${ks(w.kec)}>${esc(w.kec)}</b></div></div>` +
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
  function markCab() {
    const op = $('jrCab') && $('jrCab').selectedOptions[0];
    if (op) op.textContent = (hasPicks(S.picks) ? '✓ ' : '') + S.cab;
  }
  function persist() {
    if (!S.cab) return;
    const o = readStore();
    o[S.cab] = S.picks.map((p) => ({ n: (p && p.n) || '', v: p && p.v != null ? String(p.v) : '', ph: p && p.ph && Object.keys(p.ph).length ? p.ph : undefined }));
    writeStore(o);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const persistSoon = () => { clearTimeout(S.pt); S.pt = setTimeout(persist, 250); };
  function applyView(i, t) {   // perbarui <img> saja (tanpa render ulang slide) saat digeser / di-zoom
    const w = winnerOf(S.picks[i]), d = w && S.dim[extractDriveIdClient_(w.fotos[t])];
    const img = d && document.querySelector(`#jrStage .jr-tp[data-i="${i}"][data-t="${t}"] img`);
    if (!img) return;
    const g = geo(w, i);
    img.style.cssText = imgCss(frame(d[0], d[1], g.tw, g.phH, viewOf(w, t)));
  }
  function syncAdj(i) {   // samakan slider "Atur foto" dengan foto yang sedang dipilih
    const d = document.querySelector(`.jr-adj[data-i="${i}"]`), w = winnerOf(S.picks[i]);
    if (!d || !w) return;
    const t = S.ts[i] || 0, v = viewOf(w, t), at = d.querySelector('.jr-at');
    d.querySelector('.jr-z').value = v.z; d.querySelector('.jr-x').value = v.x; d.querySelector('.jr-y').value = v.y;
    if (at) at.value = t;
  }
  function setView(i, t, patch, fromSlider) {
    const p = S.picks[i], w = winnerOf(p);
    if (!w) return;
    const v = Object.assign(viewOf(w, t), patch);
    p.ph = Object.assign({}, p.ph, { [t]: { z: +clamp(v.z, 0.4, 3).toFixed(3), x: +clamp(v.x, 0, 100).toFixed(2), y: +clamp(v.y, 0, 100).toFixed(2) } });
    applyView(i, t);
    if (!fromSlider) syncAdj(i);
    persistSoon();
  }
  function resetView(i) {
    const p = S.picks[i], t = S.ts[i] || 0;
    if (p && p.ph) { p.ph = Object.assign({}, p.ph); delete p.ph[t]; }
    applyView(i, t); syncAdj(i); persistSoon();
  }
  function adj(i, p) {
    const w = winnerOf(p);
    if (!w) return '';
    const t = S.ts[i] || 0, v = viewOf(w, t);
    const sel = w.team
      ? `<select class="jr-at" data-i="${i}">${w.fotos.map((u, k) => `<option value="${k}"${k === t ? ' selected' : ''}>Foto ${k + 1}${w.mem[k] ? ' — ' + esc(w.mem[k]) : ''}</option>`).join('')}</select>` : '';
    const rg = (c, lb, min, max, st, val) => `<label>${lb}<input type="range" class="${c}" data-i="${i}" min="${min}" max="${max}" step="${st}" value="${val}"></label>`;
    return `<details class="jr-adj" data-i="${i}"${S.open[i] ? ' open' : ''}><summary>🖼 Atur foto</summary><div class="jr-adjb">${sel}` +
      rg('jr-z', 'Zoom', 0.4, 3, 0.01, v.z) + rg('jr-x', 'Kiri–kanan', 0, 100, 1, v.x) + rg('jr-y', 'Atas–bawah', 0, 100, 1, v.y) +
      `<button type="button" class="btn btn-outline btn-sm jr-rs" data-i="${i}">Reset</button></div></details>`;
  }
  function opts(sel) {
    let h = '<option value="">— pilih peserta —</option>';
    S.list.forEach((r) => {
      const sc = S.rankMap[r.nomor_pendaftaran];
      const t = `${r.nomor_pendaftaran} — ${nameOf(r)} (${tc(r.kecamatan)})${sc != null ? ' — nilai ' + sc : ''}`;
      h += `<option value="${esc(r.nomor_pendaftaran)}"${sel === r.nomor_pendaftaran ? ' selected' : ''}>${esc(t)}</option>`;
    });
    return h;
  }
  function fillPicks() {
    $('jrPicks').innerHTML = [0, 1, 2].map((i) => {
      const p = S.picks[i] || {};
      return `<div class="jr-pk"><b class="jr-tag r${i + 1}">${ROLE[i]}</b>` +
        `<select class="jr-sel" data-i="${i}">${opts(p.n)}</select>` +
        `<input type="number" step="0.01" min="0" class="jr-val" data-i="${i}" placeholder="Nilai" value="${esc(p.v == null ? '' : p.v)}">` +
        `<button type="button" class="btn btn-outline btn-sm jr-dlf" data-i="${i}" title="Unduh foto peserta saja">📷 Foto</button>${adj(i, p)}</div>`;
    }).join('');
  }
  function auto() {
    const ok = S.rank.filter((r) => S.list.some((x) => x.nomor_pendaftaran === r.id)).slice(0, 3);
    if (!ok.length) { toast('Belum ada nilai', 'Sistem Penilaian belum punya nilai untuk cabang ini.', 'warning'); return; }
    S.picks = [0, 1, 2].map((i) => (ok[i] ? { n: ok[i].id, v: S.rankMap[ok[i].id] } : {}));
    S.ts = [0, 0, 0]; fillPicks(); persist(); markCab(); draw();
  }
  function pick(cab) {
    if (!cab) return;
    S.cab = cab; S.list = listFor(cab); S.rank = []; S.rankMap = {};
    const sv = readStore()[cab];
    S.picks = [0, 1, 2].map((i) => (sv && sv[i] ? { n: sv[i].n, v: sv[i].v, ph: sv[i].ph } : {}));
    S.ts = [0, 0, 0];
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
  const fonts = (t) => {
    const f = document.fonts;
    if (!f || !f.load) return Promise.resolve();
    return Promise.all(['400 40px Marcellus', '500 20px Figtree', '700 20px Figtree', '800 20px Figtree'].map((x) => f.load(x, t || 'Juara 1 Ab')))
      .then(() => f.ready).catch(() => {});
  };
  const loadImg = (src) => new Promise((res) => {
    if (!src) { res(null); return; }
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
  });

  // Slide digambar LANGSUNG ke <canvas> (bukan html2canvas): font & posisi teks dipasang oleh
  // Canvas 2D sendiri, jadi hasil unduhan tidak bergantung pada cara html2canvas mengukur font web.
  // Angka-angkanya mengikuti CSS .jr-* di atas — kalau desain diubah, ubah keduanya.
  async function shot(cab, ws) {
    const sp = split(cab), C = cfg();
    const evt = C.EVENT_TITLE || 'MTQ ke-56 Kabupaten Indramayu Tahun 2026';
    const ev = [C.EVENT_DATE_DISPLAY, C.EVENT_LOCATION].filter(Boolean).join(', ');
    await fonts([cab, evt, ev, 'Nomor Kecamatan Nilai Juara belum dipilih 0123456789.,–']
      .concat(...ws.map((w) => (w ? [w.nama, w.kec, w.nomor, w.nilai].concat(w.mem) : []))).join(' '));
    const imgOf = (u) => { const id = u && extractDriveIdClient_(u); return (id && S.img[id]) || ''; };
    const logoK = LOGOS.filter((l) => S.logo[l[0]]).map((l) => l[0]);
    const logoIm = await Promise.all(logoK.map((k) => loadImg(S.logo[k])));
    const fotoIm = await Promise.all(ws.map((w) => Promise.all(w ? w.fotos.map((u) => loadImg(imgOf(u))) : [])));

    const W = 1920, H = 1080, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const F = "'Figtree','Segoe UI',Arial,sans-serif", M = "'Marcellus',Georgia,serif";
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const vg = (y0, y1, a, b) => { const q = g.createLinearGradient(0, y0, 0, y1); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
    const shadow = (col, blur, dy) => { g.shadowColor = col; g.shadowBlur = blur; g.shadowOffsetY = dy; };
    // baseline yang sama dengan kotak baris CSS: tinggi baris L, mulai dari `top`
    const bl = (top, L, font) => {
      g.font = font; const m = g.measureText('Hg');
      return m.fontBoundingBoxAscent != null
        ? top + (L - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent
        : top + L / 2 + parseFloat(/([\d.]+)px/.exec(font)[1]) * 0.35;
    };
    const tx = (s, x, top, L, font, col, al) => { const y = bl(top, L, font); g.fillStyle = col; g.textAlign = al || 'left'; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); };
    const wrap = (s, font, maxW) => {
      g.font = font; const out = []; let cur = '';
      String(s).split(/\s+/).filter(Boolean).forEach((wd) => {
        const t = cur ? cur + ' ' + wd : wd;
        if (cur && g.measureText(t).width > maxW) { out.push(cur); cur = wd; } else cur = t;
      });
      if (cur) out.push(cur);
      return out.length ? out : [''];
    };

    // latar: sorotan zamrud + pola bintang
    g.save(); g.translate(960, 367.2); g.scale(1, 760 / 1300);
    const bg = g.createRadialGradient(0, 0, 0, 0, 0, 1300);
    bg.addColorStop(0, '#0f6f5a'); bg.addColorStop(0.46, '#0a4c40'); bg.addColorStop(1, '#052a25');
    g.fillStyle = bg; g.fillRect(-960, -367.2 * 1300 / 760, W, H * 1300 / 760); g.restore();
    g.strokeStyle = 'rgba(233,196,106,.12)'; g.lineWidth = 1.6;
    for (let ty = 0; ty < H; ty += 96) for (let tx0 = 0; tx0 < W; tx0 += 96) {
      g.strokeRect(tx0 + 20, ty + 20, 56, 56);
      g.save(); g.translate(tx0 + 48, ty + 48); g.rotate(Math.PI / 4); g.strokeRect(-28, -28, 56, 56); g.restore();
    }
    g.strokeStyle = 'rgba(233,196,106,.7)'; g.lineWidth = 2; rr(25, 25, 1870, 1030, 27); g.stroke();
    g.strokeStyle = 'rgba(233,196,106,.35)'; g.lineWidth = 1; rr(35.5, 35.5, 1849, 1009, 19.5); g.stroke();

    // logo
    const totL = logoK.length * 136 - 28;
    logoK.forEach((k, i) => {
      const cx = (W - totL) / 2 + i * 136 + 54, cy = 98, im = logoIm[i];
      g.save(); shadow('rgba(0,0,0,.35)', 20, 8); g.fillStyle = '#fbf6e6'; g.beginPath(); g.arc(cx, cy, 54, 0, 7); g.fill(); g.restore();
      g.strokeStyle = '#d9b45a'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.stroke();
      if (im) { const s = Math.min(74 / im.width, 74 / im.height); g.drawImage(im, cx - im.width * s / 2, cy - im.height * s / 2, im.width * s, im.height * s); }
    });

    // judul + lencana gender + nama acara
    let fs = sp.base.length > 26 ? 80 : 96;
    while (fs > 40 && (g.font = `400 ${fs}px ${M}`, g.measureText(sp.base).width) > 1760) fs -= 2;
    g.save(); shadow('rgba(0,0,0,.28)', 0, 4); tx(sp.base, 960, 162, fs * 1.05, `400 ${fs}px ${M}`, '#fbf3d9', 'center'); g.restore();
    const sf = `600 30px ${F}`, gf = `400 36px ${M}`, pillH = 53.2;
    g.font = sf; const evW = g.measureText(evt).width;
    g.font = gf; const gdW = sp.gen ? g.measureText(sp.gen).width + 64 : 0, gap = sp.gen ? 24 : 0;
    const x0 = (W - (gdW + gap + evW)) / 2;
    if (sp.gen) {
      g.fillStyle = vg(272, 272 + pillH, '#f6dd8e', '#d9b45a'); rr(x0, 272, gdW, pillH, pillH / 2); g.fill();
      tx(sp.gen, x0 + gdW / 2, 276, 43.2, gf, '#0a3d33', 'center');
    }
    tx(evt, x0 + gdW + gap, 272 + pillH / 2 - 18, 36, sf, 'rgba(251,243,217,.9)', 'left');

    // kartu juara: urutan tampil 2 — 1 — 3, rata bawah di y=998
    const RIB = [['#f8e39c', '#d9a93a'], ['#f6f8fa', '#aeb8c1'], ['#f2c9a4', '#b9773f']], BOT = 998, XS = [132, 676, 1288];
    [1, 0, 2].forEach((wi, pos) => {
      const w = ws[wi], r1 = wi === 0, cw = r1 ? 568 : 500, x = XS[pos], cx = x + cw / 2;
      if (!w) {
        const h = 420, y = BOT - h;
        g.fillStyle = 'rgba(251,246,230,.07)'; rr(x, y, cw, h, 26); g.fill();
        g.strokeStyle = 'rgba(233,196,106,.6)'; g.lineWidth = 3; g.setLineDash([9, 6]); rr(x + 1.5, y + 1.5, cw - 3, h - 3, 24.5); g.stroke(); g.setLineDash([]);
        tx(ROLE[wi], cx, y + 166, 53, `400 44px ${M}`, '#f3d98b', 'center');
        tx('belum dipilih', cx, y + 225, 29, `500 24px ${F}`, 'rgba(243,217,139,.8)', 'center');
        return;
      }
      const inW = cw - 42, team = w.team, phH = team ? (r1 ? 260 : 200) : (r1 ? 360 : 300);
      const nfs = w.nama.length > 30 ? 27 : w.nama.length > 19 ? 32 : 38, nf = `800 ${nfs}px ${F}`, nlh = nfs * 1.14;
      const lines = wrap(w.nama.toUpperCase(), nf, inW), mem = team ? w.mem.slice(0, 4) : [];
      const h = phH + lines.length * nlh + (mem.length ? 8 + mem.length * 30 : 0) + 209, y = BOT - h;

      g.save(); r1 ? shadow('rgba(0,0,0,.5)', 56, 26) : shadow('rgba(0,0,0,.4)', 44, 20);
      g.fillStyle = '#fbf6e6'; rr(x, y, cw, h, 26); g.fill(); g.restore();
      if (r1) { g.strokeStyle = 'rgba(233,196,106,.32)'; g.lineWidth = 7; rr(x - 3.5, y - 3.5, cw + 7, h + 7, 29.5); g.stroke(); }
      g.strokeStyle = '#d9b45a'; g.lineWidth = 3; rr(x + 1.5, y + 1.5, cw - 3, h - 3, 24.5); g.stroke();

      // foto (tim: sampai 3 foto berjajar)
      const px = x + 21, py = y + 21, nT = w.fotos.length, tw = (inW - 6 * (nT - 1)) / nT;
      g.save(); rr(px, py, inW, phH, 16); g.clip(); g.fillStyle = '#cfe3dc'; g.fillRect(px, py, inW, phH);
      w.fotos.forEach((u, t) => {
        const tl = px + t * (tw + 6), im = fotoIm[wi][t];
        if (im) {
          const f = frame(im.width, im.height, tw, phH, viewOf(w, t));
          g.save(); g.beginPath(); g.rect(tl, py, tw, phH); g.clip(); g.drawImage(im, tl + f.dx, py + f.dy, f.dw, f.dh); g.restore();
        } else {
          g.globalAlpha = 0.5;
          tx((((w.team && w.mem[t]) || w.nama || '?').trim().charAt(0) || '?').toUpperCase(), tl + tw / 2, py + phH / 2 - 57.5, 115, `400 96px ${M}`, '#0a4c40', 'center');
          g.globalAlpha = 1;
        }
      });
      g.restore();

      // pita "Juara N" menindih tepi bawah foto
      const ry = py + phH - 33, rx = cx - 118;
      g.save(); shadow('rgba(0,0,0,.3)', 14, 6); g.fillStyle = vg(ry, ry + 66, RIB[wi][0], RIB[wi][1]); rr(rx, ry, 236, 66, 33); g.fill(); g.restore();
      g.strokeStyle = '#fbf6e6'; g.lineWidth = 3; rr(rx + 1.5, ry + 1.5, 233, 63, 31.5); g.stroke();
      tx(ROLE[wi], cx, ry + 3, 60, `400 40px ${M}`, '#0a3d33', 'center');

      // nama (+ anggota tim)
      let cy = py + phH + 45;
      lines.forEach((ln) => { tx(ln, cx, cy, nlh, nf, '#10231f', 'center'); cy += nlh; });
      if (mem.length) {
        cy += 8;
        mem.forEach((m) => {
          const mf = `600 24px ${F}`; g.font = mf;
          const x1 = cx - (g.measureText(m).width + 18) / 2;
          g.fillStyle = '#c9992b'; g.beginPath(); g.arc(x1 + 4, cy + 15, 4, 0, 7); g.fill();
          tx(m, x1 + 18, cy, 30, mf, '#2b4a42', 'left');
          cy += 30;
        });
      }

      // nomor + kecamatan (kiri), kotak nilai (kanan)
      const fy = cy + 14, kvW = inW - 162;
      [['Nomor', w.nomor], ['Kecamatan', w.kec]].forEach(([lb, val], k) => {
        const rt = fy + 10 + k * 42, by = bl(rt, 42, `700 27px ${F}`);   // baseline baris 27px (flex align-items:baseline)
        let vs = 27;
        while (vs > 18 && (g.font = `700 ${vs}px ${F}`, g.measureText(val).width) > kvW - 116) vs--;
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.font = `500 21px ${F}`; g.fillStyle = '#5a6f67'; g.fillText(lb, px, by);
        g.font = `700 ${vs}px ${F}`; g.fillStyle = '#10231f'; g.fillText(val, px + 116, by);
      });
      const bx = px + inW - 150;
      g.fillStyle = vg(fy, fy + 104, '#0f6f5a', '#063a32'); rr(bx, fy, 150, 104, 18); g.fill();
      g.strokeStyle = '#d9b45a'; g.lineWidth = 3; rr(bx + 1.5, fy + 1.5, 147, 101, 16.5); g.stroke();
      tx(w.nilai || '–', bx + 75, fy + 11, 56, `400 ${w.nilai.length > 5 ? 34 : 46}px ${M}`, '#f3d98b', 'center');
      tx('Nilai', bx + 75, fy + 67, 22, `600 20px ${F}`, '#fbf3d9', 'center');
    });

    if (ev) tx(ev, 960, 1013, 29, `600 24px ${F}`, 'rgba(251,243,217,.72)', 'center');
    return c;
  }

  // ── Unduh foto peserta saja ───────────────────────────────
  // Nama berkas: {cabang}_{gender}_{nomor_peserta}_{nama_peserta}_{kecamatan}  (tim: satu berkas per anggota)
  const jget = (url, tag, ms) => new Promise((res) => jsonp(url, tag, res, ms));
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_');
  const fname = (r, nama) => {
    const sp = split(r.cabang_lomba);
    return [sp.base, sp.gen.toLowerCase(), r.nomor_pendaftaran, nama, tc(r.kecamatan)].map(safe).filter(Boolean).join('_');
  };
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const b64Blob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return new Blob([u], { type }); };
  const saveBlob = (blob, name) => {
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  async function dlFoto(i, btn) {
    const p = S.picks[i], r = p && p.n ? byNomor(p.n) : null;
    if (!r) { toast('Pilih peserta dulu', `Pilih peserta ${ROLE[i]} terlebih dahulu.`, 'warning'); return; }
    const team = isTeam(r), a = membersOf(r);
    const items = (team && a.length ? a : [a[0] || {}])
      .map((m) => ({ url: fotoOf(m, r), nama: (team ? m.nama_lengkap : r.nama_lengkap) || nameOf(r) })).filter((it) => it.url);
    if (!items.length) { toast('Tidak ada foto', 'Peserta ini belum punya foto.', 'warning'); return; }
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    let ok = 0, kecil = 0;
    for (const it of items) {
      const id = extractDriveIdClient_(it.url);
      const res = id ? await jget(`${apiUrl()}?action=getDriveFile&id=${encodeURIComponent(id)}`, 'juaraFoto', 60000) : null;
      let blob = null, ext = 'jpg';
      if (res && res.success && res.base64) {                       // berkas asli
        blob = b64Blob(res.base64, res.mimeType);
        ext = EXT[res.mimeType] || ((/\.(\w+)$/.exec(res.name || '') || [])[1] || 'jpg').toLowerCase();
      } else if (id) {                                              // cadangan: thumbnail 500px
        await ensureImgs([{ fotos: [it.url] }]);
        const m = /^data:([^;]+);base64,(.*)$/.exec(S.img[id] || '');
        if (m) { blob = b64Blob(m[2], m[1]); ext = EXT[m[1]] || 'jpg'; kecil++; }
      }
      if (!blob) continue;
      saveBlob(blob, `${fname(r, it.nama)}.${ext}`); ok++;
      await new Promise((z) => setTimeout(z, 350));                 // jeda antar unduhan (peserta tim)
    }
    btn.disabled = false; btn.innerHTML = old;
    if (ok) toast('Berhasil', `${ok} foto diunduh${kecil ? ` (${kecil} berupa versi kecil, berkas asli gagal diambil)` : ''}.`, kecil ? 'warning' : 'success');
    else toast('Gagal', 'Foto tidak bisa diunduh. Coba lagi beberapa saat.', 'error');
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
      </div>
      <div class="jr-view" id="jrView"><div class="jr-s" id="jrStage"></div></div>
      <div class="jr-hint" style="padding:10px 4px">Atur foto: geser foto di dalam bingkai pada slide dan putar roda mouse untuk zoom — atau buka “Atur foto” di tiap juara. Pengaturan tersimpan otomatis.</div>`;

    $('jrCab').addEventListener('change', (e) => pick(e.target.value));
    $('jrAuto').addEventListener('click', auto);
    $('jrPng').addEventListener('click', () => dl('jrPng', 'png'));
    $('jrPdf').addEventListener('click', () => dl('jrPdf', 'pdf'));
    $('jrAll').addEventListener('click', dlAll);

    const pk = $('jrPicks');
    pk.addEventListener('change', (e) => {
      const t = e.target, i = +t.getAttribute('data-i');
      if (t.classList.contains('jr-at')) { S.ts[i] = +t.value; syncAdj(i); return; }
      if (!t.classList.contains('jr-sel')) return;
      const n = t.value;
      if (n && S.picks.some((p, k) => k !== i && p.n === n)) {
        toast('Sudah dipilih', 'Peserta ini sudah dipilih di juara lain.', 'warning');
        t.value = (S.picks[i] && S.picks[i].n) || '';
        return;
      }
      const sc = S.rankMap[n], old = S.picks[i] || {}, same = old.n === n;
      S.picks[i] = { n, v: sc != null ? sc : (same ? old.v : ''), ph: same ? old.ph : undefined };
      S.ts[i] = 0;
      persist(); markCab(); fillPicks(); draw();
    });
    pk.addEventListener('input', (e) => {
      const t = e.target, i = +t.getAttribute('data-i'), c = t.classList;
      if (c.contains('jr-z') || c.contains('jr-x') || c.contains('jr-y')) {
        setView(i, S.ts[i] || 0, { [c.contains('jr-z') ? 'z' : c.contains('jr-x') ? 'x' : 'y']: +t.value }, true);
        return;
      }
      if (!c.contains('jr-val')) return;
      const p = S.picks[i] || {};
      S.picks[i] = { n: p.n || '', v: t.value, ph: p.ph };
      persist(); markCab(); paint();
    });
    pk.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.jr-dlf, .jr-rs');
      if (!b) return;
      const i = +b.getAttribute('data-i');
      if (b.classList.contains('jr-rs')) resetView(i); else dlFoto(i, b);
    });
    pk.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d.classList && d.classList.contains('jr-adj')) S.open[+d.getAttribute('data-i')] = d.open;
    }, true);

    // geser (drag) & zoom (roda mouse) foto langsung di slide
    let dr = null;
    const stage = $('jrStage');
    stage.addEventListener('pointerdown', (e) => {
      const el = e.target.closest && e.target.closest('.jr-tp[data-i]');
      if (!el || e.button) return;
      e.preventDefault();
      const i = +el.dataset.i, t = +el.dataset.t;
      S.ts[i] = t; syncAdj(i);
      dr = { i, t, x: e.clientX, y: e.clientY, v: viewOf(winnerOf(S.picks[i]), t) };
    });
    window.addEventListener('pointermove', (e) => {
      if (!dr) return;
      const w = winnerOf(S.picks[dr.i]), d = w && S.dim[extractDriveIdClient_(w.fotos[dr.t])];
      if (!d) return;
      const g = geo(w, dr.i), k = $('jrView').clientWidth / 1920, f = frame(d[0], d[1], g.tw, g.phH, dr.v), patch = {};
      if (Math.abs(g.tw - f.dw) > 1) patch.x = dr.v.x + ((e.clientX - dr.x) / k) / (g.tw - f.dw) * 100;
      if (Math.abs(g.phH - f.dh) > 1) patch.y = dr.v.y + ((e.clientY - dr.y) / k) / (g.phH - f.dh) * 100;
      setView(dr.i, dr.t, patch);
    });
    window.addEventListener('pointerup', () => { dr = null; });
    stage.addEventListener('wheel', (e) => {
      const el = e.target.closest && e.target.closest('.jr-tp[data-i]');
      if (!el) return;
      e.preventDefault();
      const i = +el.dataset.i, t = +el.dataset.t;
      S.ts[i] = t;
      setView(i, t, { z: viewOf(winnerOf(S.picks[i]), t).z * Math.exp(-e.deltaY * 0.0015) });
    }, { passive: false });

    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe($('jrView'));
    S.built = true;
  }

  // Dipanggil showPage('juara') di doyourmagic.html
  window.juaraInit = function () {
    build();
    if (!(adm.allData || []).length && typeof loadAll === 'function') loadAll(fillCab); else fillCab();
    checkLogos().then(paint);
    fit();
  };
})();