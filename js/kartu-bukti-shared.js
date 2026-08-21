// ================================================================
//  MTQ 2026 — js/kartu-bukti-shared.js
//  FIX #33: SATU-SATUNYA SUMBER untuk 2 hal yang dipakai bersama oleh
//  cekstatus.html (peserta, self-service) DAN doyourmagic.html/
//  admin-maqra.js (admin, borongan/bulk):
//    1. renderKartuCanvas() + helper-nya  -- kartu ID peserta (canvas)
//    2. buildBuktiMaqraCardHtml() + BUKTI_MAQRA_STYLES -- bukti maqra (HTML)
//  Sebelumnya kode ini HANYA ada di cek-maqra.js -- kalau desain kartu/
//  bukti perlu diubah lagi nanti, cukup edit DI SINI, otomatis konsisten
//  di kedua sisi (peserta & admin), tidak perlu ubah 2 tempat terpisah.
//
//  renderKartuCanvas() menerima imageLoaderFn sebagai parameter opsional
//  (bukan hardcode loadDriveImageViaProxy) karena tiap halaman punya
//  mekanisme JSONP-nya sendiri (jsonpGet() di cek-maqra.js vs jsonp()
//  callback-style di doyourmagic.html) -- lihat pemanggilan di
//  masing-masing file utk implementasi loader-nya.
//
//  Muat file ini SEBELUM cek-maqra.js (cekstatus.html) atau sebelum
//  script yang memanggil renderKartuCanvas/buildBuktiMaqraCardHtml
//  (doyourmagic.html).
// ================================================================

async function renderKartuCanvas(member, rec, memberIdx, isTeam, CW, CH, imageLoaderFn = null) {
  const canvas = document.createElement('canvas');
  canvas.width  = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');

  const nama   = (member.nama_lengkap || rec.nama_lengkap || '—').toUpperCase();
  const cabang = rec.cabang_lomba || '—';
  const kec    = rec.kecamatan    || '—';
  const noReg  = member.no_peserta || rec.nomor_pendaftaran || '—';
  const GOLD   = '#f59e0b';

  // px(mm) → canvas pixel
  const px = mm => mm * (CW / 85.6);

  // ─────────────────────────────────────────────────────────
  // 1. BACKGROUND
  // ─────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CH);
  bgGrad.addColorStop(0,   '#021b12');
  bgGrad.addColorStop(0.4, '#064e3b');
  bgGrad.addColorStop(1,   '#0a6647');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CW, CH);

  // ─────────────────────────────────────────────────────────
  // 2. POLA GEOMETRIK (arabesque grid)
  // ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.055;
  const pts = px(18);
  for (let ry = -pts; ry < CH + pts; ry += pts) {
    for (let cx2 = -pts; cx2 < CW + pts; cx2 += pts) {
      // Segi delapan tipis
      ctx.beginPath();
      const r = px(5.5);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 - Math.PI / 8;
        const mx  = cx2 + Math.cos(ang) * r;
        const my  = ry  + Math.sin(ang) * r;
        a === 0 ? ctx.moveTo(mx, my) : ctx.lineTo(mx, my);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 0.7;
      ctx.stroke();
    }
  }
  ctx.restore();

  // ─────────────────────────────────────────────────────────
  // 3. GARIS SISI EMAS (kiri & kanan)
  // ─────────────────────────────────────────────────────────
  const stripeW = px(3);
  // Left stripe
  const lgL = ctx.createLinearGradient(0, 0, 0, CH);
  lgL.addColorStop(0,   '#fbbf24');
  lgL.addColorStop(0.5, '#fde68a');
  lgL.addColorStop(1,   '#d97706');
  ctx.fillStyle = lgL;
  ctx.fillRect(0, 0, stripeW, CH);
  // Right stripe
  ctx.fillRect(CW - stripeW, 0, stripeW, CH);
  // Inner glow lines
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(stripeW, 0, px(0.7), CH);
  ctx.fillRect(CW - stripeW - px(0.7), 0, px(0.7), CH);

  // ─────────────────────────────────────────────────────────
  // 4. HEADER BAND
  // ─────────────────────────────────────────────────────────
  const hdrH = px(23);
  const hGrad = ctx.createLinearGradient(0, 0, CW, 0);
  hGrad.addColorStop(0,   '#047857');
  // FIX #31 (poin 1): sentuhan biru di tengah header — persis di
  // belakang nomor peserta yang sekarang jadi elemen utama di sini.
  hGrad.addColorStop(0.5, '#0e7490');
  hGrad.addColorStop(1,   '#047857');
  ctx.fillStyle = hGrad;
  ctx.fillRect(stripeW, 0, CW - stripeW * 2, hdrH);

  // Gold separator bawah header
  ctx.fillStyle = GOLD;
  ctx.fillRect(stripeW, hdrH, CW - stripeW * 2, px(1));

  // Teks header
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';

  // FIX #31 (poin 1): "MTQ 2026" yang sebelumnya jadi judul utama
  // ditukar jadi Nomor Peserta — inilah info yang paling sering dicari
  // panitia/peserta sendiri saat cek kartu, jadi dibuat paling besar &
  // paling atas. Label kecil "NOMOR PESERTA" ditambahkan di atasnya biar
  // tetap jelas ini angka apa. "MTQ 2026" tidak hilang total — pindah ke
  // subtitle baris kedua (lebih kecil) dan tetap ada di footer kartu.
  ctx.font      = `600 ${px(2.4)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = '#bae6fd';  // biru muda — FIX #31 poin 1: sentuhan biru
  ctx.fillText('NOMOR PESERTA', CW / 2, px(5.3));

  ctx.font      = `900 ${px(8.2)}px Georgia,serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor   = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur    = px(2);
  ctx.shadowOffsetY = px(0.8);
  ctx.fillText(noReg, CW / 2, px(13.8));

  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.font      = `600 ${px(3.2)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText('MUSABAQAH TILAWATIL QUR\'AN', CW / 2, px(18.3));

  ctx.font      = `${px(2.6)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('KABUPATEN INDRAMAYU 2026', CW / 2, px(21.5));

  // ─────────────────────────────────────────────────────────
  // 5. CHIP PERAN (PESERTA / KETUA TIM / ANGGOTA TIM N)
  // ─────────────────────────────────────────────────────────
  const chipTxt = isTeam
    ? (memberIdx === 0 ? '👑  KETUA TIM' : `ANGGOTA TIM ${memberIdx + 1}`)
    : '✦  PESERTA';
  const chipY = hdrH + px(4.5);
  const chipH = px(5.8);
  const chipW = px(30);
  const chipX = (CW - chipW) / 2;
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur  = px(1.5);
  ctx.shadowOffsetY = px(0.5);
  roundRect(ctx, chipX, chipY, chipW, chipH, px(2.8));
  ctx.fillStyle = isTeam && memberIdx === 0 ? '#d97706' : GOLD;
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.font      = `bold ${px(3)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = '#1a0600';
  ctx.textAlign = 'center';
  ctx.fillText(chipTxt, CW / 2, chipY + chipH * 0.68);

  // ─────────────────────────────────────────────────────────
  // 6. FOTO PESERTA (lingkaran dengan ring emas)
  // ─────────────────────────────────────────────────────────
  const photoR  = px(15.5);
  const photoCX = CW / 2;
  const photoCY = hdrH + px(13.5) + photoR;

  // Ring emas (gradient)
  const ringGrad = ctx.createRadialGradient(photoCX, photoCY, photoR + px(0.5), photoCX, photoCY, photoR + px(3));
  ringGrad.addColorStop(0, '#fde68a');
  ringGrad.addColorStop(0.5, '#f59e0b');
  ringGrad.addColorStop(1, '#b45309');
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + px(2.8), 0, Math.PI * 2);
  ctx.fillStyle = ringGrad;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur  = px(3);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Ring putih tipis
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + px(0.6), 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Foto (clip lingkaran)
  ctx.save();
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
  ctx.clip();

  const fotoSrc  = member.foto_url || member.foto_drive_url || member.link_foto || rec.foto_url || '';
  // FIX: sebelumnya coba muat langsung dari drive.google.com/thumbnail
  // & lh3.googleusercontent.com dengan img.crossOrigin='anonymous' —
  // KEDUANYA tidak mengirim header CORS sama sekali, jadi permintaan
  // gambar itu SELALU diblokir browser (bukan cuma "kadang gagal") dan
  // kartu selalu jatuh ke placeholder inisial. Sekarang ambil lewat
  // proxy backend (base64 via getDriveImage, lihat api.gs) — tidak ada
  // isu cross-origin sama sekali karena hasilnya data: URL.
  const img = imageLoaderFn ? await imageLoaderFn(fotoSrc) : null;
  let fotoOk = false;

  if (img) {
    // Object-fit: cover — center crop
    const ar = img.naturalWidth / img.naturalHeight;
    let sw, sh, sx, sy;
    if (ar > 1) { sh = img.naturalHeight; sw = sh; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else         { sw = img.naturalWidth;  sh = sw; sy = (img.naturalHeight - sh) / 2; sx = 0; }
    ctx.drawImage(img, sx, sy, sw, sh,
      photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
    fotoOk = true;
  }

  if (!fotoOk) {
    // Placeholder inisial
    const phG = ctx.createLinearGradient(photoCX - photoR, photoCY - photoR, photoCX + photoR, photoCY + photoR);
    phG.addColorStop(0, '#1d6348'); phG.addColorStop(1, '#0a2e1e');
    ctx.fillStyle = phG;
    ctx.fillRect(photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
    ctx.font      = `bold ${px(18)}px Georgia,serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((nama[0] || '?'), photoCX, photoCY);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // ─────────────────────────────────────────────────────────
  // 7. KARTU INFO PUTIH (nama + data)
  // ─────────────────────────────────────────────────────────
  const cardTop    = photoCY + photoR + px(4.5);
  const cardMargin = stripeW + px(3);
  const cardW      = CW - cardMargin * 2;
  const footH      = px(15);
  const cardH      = CH - cardTop - footH - px(2);

  // Shadow kartu
  ctx.shadowColor   = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur    = px(4);
  ctx.shadowOffsetY = px(1.5);
  roundRect(ctx, cardMargin, cardTop, cardW, cardH, px(4));
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Gold top border kartu
  roundRect(ctx, cardMargin, cardTop, cardW, px(1.5), px(4));
  ctx.fillStyle = GOLD;
  ctx.fill();

  // ── Nama ──────────────────────────────────────────────────
  const namaMaxW = cardW - px(8);
  const namaLines = wrapText(ctx, nama, namaMaxW, `bold ${px(5.4)}px Georgia,serif`);
  ctx.font      = `bold ${px(5.4)}px Georgia,serif`;
  ctx.fillStyle = '#065f46';
  ctx.textAlign = 'center';
  const namaStartY = cardTop + px(7.5);
  namaLines.forEach((line, i) => {
    ctx.fillText(line, CW / 2, namaStartY + i * px(6.6));
  });

  // Garis emas ornamental
  const divY = namaStartY + namaLines.length * px(6.6) + px(1.5);
  const divLen = px(20);
  const divMid = CW / 2;
  ctx.fillStyle = GOLD;
  ctx.fillRect(divMid - divLen, divY, divLen * 2, px(0.7));
  // Diamond tengah
  ctx.save();
  ctx.translate(divMid, divY + px(0.35));
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-px(1.1), -px(1.1), px(2.2), px(2.2));
  ctx.restore();

  // ── Rows info ──────────────────────────────────────────────
  const rowStart = divY + px(5);
  const ROW_H    = px(10);

  drawKartuRow(ctx, px, cardMargin, cardW, rowStart,        GOLD,      '🏆', 'CABANG LOMBA', cabang);
  drawKartuRow(ctx, px, cardMargin, cardW, rowStart + ROW_H, '#059669', '📍', 'KECAMATAN',  kec);

  // ─────────────────────────────────────────────────────────
  // 8. FOOTER BAND
  // ─────────────────────────────────────────────────────────
  const footY = CH - footH;
  const fGrad = ctx.createLinearGradient(0, footY, 0, CH);
  fGrad.addColorStop(0, '#047857');
  fGrad.addColorStop(1, '#021b12');
  ctx.fillStyle = fGrad;
  ctx.fillRect(stripeW, footY, CW - stripeW * 2, footH);

  // Gold line atas footer
  ctx.fillStyle = GOLD;
  ctx.fillRect(stripeW, footY, CW - stripeW * 2, px(0.8));

  // FIX #31 (poin 1): nomor peserta sudah tampil besar di header —
  // tidak diulang lagi di footer supaya tidak dobel. Teks panitia
  // dipusatkan vertikal di ruang yang jadi lega.
  ctx.font      = `${px(3)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'center';
  ctx.fillText('Panitia MTQ Kabupaten Indramayu 2026', CW / 2, footY + px(8.5));

  // Dots dekoratif
  [-px(16), 0, px(16)].forEach(dx => {
    ctx.beginPath();
    ctx.arc(CW / 2 + dx, footY + px(3.2), px(0.7), 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
  });

  return canvas;
}

/** Gambar satu baris info (label + value) di dalam kartu putih — anti-overflow */
function drawKartuRow(ctx, px, cardMargin, cardW, y, accentColor, _icon, label, value) {
  const rowH   = px(9);
  const padL   = px(4);
  const x      = cardMargin;
  const boxX   = x + px(2);
  const boxW   = cardW - px(4);

  // Subtle row bg
  roundRect(ctx, boxX, y, boxW, rowH, px(2));
  ctx.fillStyle = 'rgba(5,150,105,0.04)';
  ctx.fill();

  // Accent bar kiri
  ctx.fillStyle = accentColor;
  ctx.fillRect(boxX, y, px(1.5), rowH);

  // ── JARING PENGAMAN: clip semua teks ke kotak baris ini.
  //    Apapun yang terjadi pada pengukuran font, teks TIDAK BISA
  //    tergambar keluar dari kotak ini.
  ctx.save();
  roundRect(ctx, boxX, y, boxW, rowH, px(2));
  ctx.clip();

  const textX    = x + padL + px(1.5);
  const maxTextW = (boxX + boxW) - textX - px(2.5); // margin aman ke tepi kanan

  // Label
  ctx.textAlign = 'left';
  ctx.font      = `500 ${px(2.6)}px 'Segoe UI',sans-serif`;
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(truncateText(ctx, label, maxTextW), textX, y + px(3.2));

  // Value — coba kecilkan ukuran font dulu agar teks panjang (mis. nama
  // cabang lomba) tetap terbaca utuh; hanya dipotong jika benar-benar
  // tidak muat bahkan di ukuran font terkecil.
  const fitted = fitTextSize(ctx, String(value), maxTextW, 3.8, 2.5, 'bold', "'Segoe UI',sans-serif", px);
  ctx.fillStyle = '#1f2937';
  ctx.fillText(fitted.text, textX, y + px(7.2));

  ctx.restore();
}

/** Cari ukuran font (mm-equivalent, via px()) terbesar yang masih muat di maxWidth;
 *  jika tetap tidak muat di ukuran minimum, potong dengan ellipsis. */
function fitTextSize(ctx, text, maxWidth, maxPx, minPx, weight, family, pxFn) {
  let size = maxPx;
  ctx.font = `${weight} ${pxFn(size)}px ${family}`;
  while (size > minPx && ctx.measureText(text).width > maxWidth) {
    size = Math.max(minPx, size - 0.2);
    ctx.font = `${weight} ${pxFn(size)}px ${family}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size };
  return { text: truncateText(ctx, text, maxWidth), size };
}

/** Konversi berbagai format URL Google Drive → daftar kandidat URL thumbnail (dicoba berurutan) */
// FIX: pengganti gDriveThumbUrls (lama) — sudah tidak dipakai lagi untuk
// kartu peserta karena kedua kandidat URL-nya (drive.google.com/thumbnail
// & lh3.googleusercontent.com) sama-sama tidak mengirim header CORS,
// jadi img.crossOrigin='anonymous' ke situ SELALU gagal, bukan cuma
// kadang-kadang. Fungsi ini mengambil ID file lalu minta byte gambarnya
// lewat action=getDriveImage di backend (server-ke-server, tidak kena
// CORS sama sekali), dan memuatnya sebagai data: URL — yang mana
// browser TIDAK PERNAH menganggapnya cross-origin, jadi aman dibaca
// canvas (drawImage/toDataURL) tanpa syarat apa pun.
/** Helper: roundRect polyfill (cek native dulu) */
function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);      ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

/** Helper: bungkus teks panjang ke array baris */
function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

/** Helper: potong teks agar muat maxWidth */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(String(text)).width <= maxWidth) return text;
  let t = String(text);
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// ================================================================
//  BUKTI PENGAMBILAN MAQRA -- template HTML dipakai bersama:
//  - cek-maqra.js   (downloadBukti(): 1 peserta, self-service)
//  - admin-maqra.js (maqraDownloadAllBukti(): banyak peserta sekaligus,
//    tab Hasil Pengambilan -> cetak semua jadi 1 file, 1 kartu/halaman)
//  Satu sumber supaya kedua jalur selalu identik desainnya.
// ================================================================
const BUKTI_MAQRA_STYLES = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Georgia',serif;background:#f9fafb;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);width:100%;max-width:480px;overflow:hidden;margin:0 auto 24px}.header{background:linear-gradient(135deg,#064e3b,#059669);padding:28px 32px;color:#fff;text-align:center}.header h1{font-size:22px;margin-bottom:4px}.header p{font-size:13px;opacity:.8}.body{padding:28px 32px}.ornament{text-align:center;color:#9ca3af;margin:12px 0;letter-spacing:4px}.field{margin-bottom:14px}.field label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;display:block;margin-bottom:3px}.field .val{font-size:15px;font-weight:600;color:#1f2937}.mbox{background:linear-gradient(135deg,#065f46,#047857);color:#fff;border-radius:12px;padding:24px;text-align:center;margin:20px 0}.mbox .ml{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.75;margin-bottom:8px}.mbox .ma{font-size:22px;font-weight:700;margin-bottom:4px}.mbox .ms{font-size:14px;opacity:.85}.mbox .mn{background:rgba(255,255,255,.15);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:600;display:inline-block;margin-top:10px}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#b45309;margin-top:16px}.ttd-section{display:flex;gap:18px;margin-top:26px;padding-top:18px;border-top:1px dashed #d1d5db}.ttd-box{flex:1;text-align:center}.ttd-role{font-size:10.5px;color:#6b7280;margin-bottom:46px;line-height:1.4}.ttd-name{font-size:9.5px;color:#9ca3af;margin-top:4px;font-style:italic}.ttd-line{border-bottom:1px solid #9ca3af;margin:0 6px}.footer{border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center}@media print{body{background:#fff}.card{box-shadow:none;page-break-after:always}.card:last-child{page-break-after:auto}}`;

/**
 * Bangun 1 kartu "Bukti Maqra" (fragment <div class="card">...</div>).
 * @param {object} rec - data peserta {nama_lengkap, nomor_pendaftaran, cabang_lomba, kecamatan}
 * @param {object} m   - data maqra {maqra_teks|maqra, maqra_detail|surah, nomor_maqra}
 * @param {function} esc - fungsi escape HTML (nama beda tapi isi sama di tiap file pemanggil)
 */
function buildBuktiMaqraCardHtml(rec, m, esc) {
  return `<div class="card">
<div class="header"><h1>📖 Bukti Maqra MTQ 2026</h1><p>Kabupaten Indramayu — ${new Date().toLocaleString('id-ID')}</p></div>
<div class="body"><div class="ornament">✦ ✦ ✦</div>
<div class="field"><label>Nama Peserta</label><div class="val">${esc(rec.nama_lengkap||'-')}</div></div>
<div class="field"><label>Nomor Pendaftaran</label><div class="val" style="font-family:monospace;letter-spacing:1px">${esc(rec.nomor_pendaftaran||'-')}</div></div>
<div class="field"><label>Cabang Lomba</label><div class="val">${esc(rec.cabang_lomba||'-')}</div></div>
<div class="field"><label>Kecamatan</label><div class="val">${esc(rec.kecamatan||'-')}</div></div>
<div class="mbox"><div class="ml">📖 Maqra</div><div class="ma">${esc(m.maqra_teks||m.maqra||'-')}</div><div class="ms">${esc(m.maqra_detail||m.surah||'')}</div><div class="mn">Nomor Undian: ${esc(m.nomor_maqra||'-')}</div></div>
<div class="warn">⚠️ Simpan dokumen ini. Maqra tidak dapat diubah. Cetak dan mintakan tanda tangan panitia serta admin kecamatan di bawah sebagai bukti sah.</div>
<div class="ttd-section">
  <div class="ttd-box">
    <div class="ttd-role">Panitia Pengambilan Maqra</div>
    <div class="ttd-line"></div>
    <div class="ttd-name">( Nama &amp; Tanda Tangan )</div>
  </div>
  <div class="ttd-box">
    <div class="ttd-role">Admin Kecamatan<br>${esc(rec.kecamatan||'-')}</div>
    <div class="ttd-line"></div>
    <div class="ttd-name">( Nama &amp; Tanda Tangan )</div>
  </div>
</div>
</div>
<div class="footer">MTQ Kabupaten Indramayu 2026 — Sah setelah ditandatangani panitia &amp; admin kecamatan</div>
</div>`;
}