// ================================================================
//  MTQ 2026 — js/kartu-bukti-shared.js
//  KARTU_BUKTI_REV = 18  <-- kalau meragukan browser masih pakai versi
//  lama, ketik KARTU_BUKTI_REV di Console (F12) lalu Enter: kalau
//  hasilnya BUKAN 18, berkas ini belum ter-update di browser (cache /
//  file lama) -- hard refresh (Ctrl+Shift+R) atau naikkan angka ?v=
//  pada tag <script> yang memuat berkas ini.
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

var KARTU_BUKTI_REV = 18;
if (typeof window !== 'undefined') window.KARTU_BUKTI_REV = KARTU_BUKTI_REV;

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
//  PARSER FORMAT MAQRA  (rev 14)
//  ---------------------------------------------------------------
//  Format baku yang diketik admin di tab "Kelola Maqra", satu baris
//  satu maqra:
//      SURAT AL-BAQARAH - AYAT : 21 – HAL : 5
//      SURAT AL-BAQARAH - AYAT : 113 – HAL : 17
//  Dulu string ini dipakai APA ADANYA sebagai satu blok teks di
//  bukti PDF, jadi nama suratnya tenggelam di tengah kalimat dan
//  sulit dibaca sekilas. parseMaqra() memecahnya jadi 3 bagian
//  (surat / ayat / halaman) supaya bisa ditata bertingkat di kartu.
//  Pemisahan TIDAK boleh dilakukan dengan split('-'): nama surat
//  sendiri sering mengandung tanda hubung ("AL-BAQARAH", "AL-A'RAF"),
//  jadi patokannya kata kunci AYAT & HAL/HALAMAN, bukan tanda baca.
//  Toleran terhadap: hyphen "-" / en-dash "–" / em-dash "—", titik
//  dua opsional, "HAL" atau "HALAMAN", kata "SURAT"/"SURAH" opsional,
//  spasi berlebih, dan baris yang tidak lengkap (mis. hanya ayat).
//  Kalau baris sama sekali tidak mengenali polanya, .ok = false dan
//  pemanggil menampilkan teks aslinya utuh — tidak pernah hilang.
// ================================================================
function parseMaqra(teks) {
  var raw = String(teks == null ? '' : teks).replace(/\s+/g, ' ').trim();
  var out = { surat: '', ayat: '', halaman: '', raw: raw, ok: false };
  if (!raw) return out;

  var iAyat = raw.search(/\bAYAT\b/i);
  var iHal  = raw.search(/\bHAL(?:AMAN)?\b/i);
  var trim  = function (s) {
    return String(s).replace(/^[\s:.\-–—]+/, '').replace(/[\s:.\-–—]+$/, '').trim();
  };

  if (iAyat >= 0) {
    out.surat = raw.slice(0, iAyat);
    var seg = (iHal > iAyat ? raw.slice(iAyat, iHal) : raw.slice(iAyat));
    out.ayat = trim(seg.replace(/^\s*AYAT\b/i, ''));
  } else if (iHal > 0) {
    out.surat = raw.slice(0, iHal);
  } else {
    out.surat = raw;
  }

  if (iHal >= 0 && (iAyat < 0 || iHal > iAyat)) {
    out.halaman = trim(raw.slice(iHal).replace(/^\s*HAL(?:AMAN)?\b/i, ''));
  }

  out.surat = trim(out.surat).replace(/^SURA[HT]\b[\s:.]*/i, '').trim();
  out.ok    = !!(out.surat || out.ayat || out.halaman);
  return out;
}

/** Rakit ulang jadi format baku — dipakai utk tampilan 1 baris. */
function formatMaqra(teks) {
  var p = parseMaqra(teks);
  // Tanpa ayat & halaman, baris itu bukan format baku (mis. catatan bebas
  // "Juz 30 acak") — kembalikan apa adanya, jangan dipaksa berawalan SURAT.
  if (!p.ok || (!p.ayat && !p.halaman)) return p.raw;
  var bag = [];
  if (p.surat)   bag.push('SURAT ' + p.surat.toUpperCase());
  if (p.ayat)    bag.push('AYAT : ' + p.ayat);
  if (p.halaman) bag.push('HAL : ' + p.halaman);
  if (!bag.length) return p.raw;
  return bag.length === 3
    ? bag[0] + ' - ' + bag[1] + ' – ' + bag[2]
    : bag.join(' – ');
}

if (typeof window !== 'undefined') {
  window.parseMaqra  = parseMaqra;
  window.formatMaqra = formatMaqra;
}

// ================================================================
//  TEKS AYAT AL-QUR'AN UNTUK BUKTI MAQRA  (rev 15)
//  ---------------------------------------------------------------
//  Sumber teks: Mushaf Standar Indonesia (Kemenag) — 6.236 ayat,
//  disimpan sebagai berkas statis di data/quran/{nomor-surat}.json
//  (1 berkas per surat, hanya surat yang dibutuhkan yang diunduh;
//  paling besar Al-Baqarah ~110 KB, rata-rata ~12 KB). Berkas itu
//  di-cache di localStorage, jadi unduhan borongan 100 peserta yang
//  suratnya sama hanya sekali menyentuh jaringan.
//
//  KENAPA BERKAS STATIS, BUKAN API PIHAK KETIGA: bukti maqra dicetak
//  saat acara berlangsung, sering dari HP dengan sinyal seadanya, dan
//  tidak boleh gagal/ salah cetak gara-gara API pihak lain sedang
//  down atau kena rate limit. Berkas statis ikut di-hosting bersama
//  situs ini, jadi selama situsnya kebuka, ayatnya pasti ada.
//
//  PENTING soal keakuratan: teks di berkas itu disimpan dalam bentuk
//  NFC. Huruf & harakatnya identik dengan mushaf Kemenag — normalisasi
//  NFC hanya menyeragamkan URUTAN SIMPAN tanda (mis. shadda sebelum
//  atau sesudah fathah), bukan mengubah tandanya. Hasil render di
//  layar & PDF sama persis.
//
//  Path berkas bisa diubah lewat MTQ_CONFIG.QURAN_BASE kalau struktur
//  folder situs berbeda (default: 'data/quran', relatif thd halaman).
// ================================================================
const QURAN_SURAT = [[1,"Al-Fatihah"],[2,"Al-Baqarah"],[3,"Ali 'Imran"],[4,"An-Nisa'"],[5,"Al-Ma'idah"],[6,"Al-An'am"],[7,"Al-A'raf"],[8,"Al-Anfal"],[9,"At-Taubah"],[10,"Yunus"],[11,"Hud"],[12,"Yusuf"],[13,"Ar-Ra'd"],[14,"Ibrahim"],[15,"Al-Hijr"],[16,"An-Nahl"],[17,"Al-Isra'"],[18,"Al-Kahf"],[19,"Maryam"],[20,"Taha"],[21,"Al-Anbiya'"],[22,"Al-Hajj"],[23,"Al-Mu'minun"],[24,"An-Nur"],[25,"Al-Furqan"],[26,"Asy-Syu'ara'"],[27,"An-Naml"],[28,"Al-Qasas"],[29,"Al-'Ankabut"],[30,"Ar-Rum"],[31,"Luqman"],[32,"As-Sajdah"],[33,"Al-Ahzab"],[34,"Saba'"],[35,"Fatir"],[36,"Yasin"],[37,"As-Saffat"],[38,"Sad"],[39,"Az-Zumar"],[40,"Gafir"],[41,"Fussilat"],[42,"Asy-Syura"],[43,"Az-Zukhruf"],[44,"Ad-Dukhan"],[45,"Al-Jasiyah"],[46,"Al-Ahqaf"],[47,"Muhammad"],[48,"Al-Fath"],[49,"Al-Hujurat"],[50,"Qaf"],[51,"Az-Zariyat"],[52,"At-Tur"],[53,"An-Najm"],[54,"Al-Qamar"],[55,"Ar-Rahman"],[56,"Al-Waqi'ah"],[57,"Al-Hadid"],[58,"Al-Mujadalah"],[59,"Al-Hasyr"],[60,"Al-Mumtahanah"],[61,"As-Saff"],[62,"Al-Jumu'ah"],[63,"Al-Munafiqun"],[64,"At-Tagabun"],[65,"At-Talaq"],[66,"At-Tahrim"],[67,"Al-Mulk"],[68,"Al-Qalam"],[69,"Al-Haqqah"],[70,"Al-Ma'arij"],[71,"Nuh"],[72,"Al-Jinn"],[73,"Al-Muzzammil"],[74,"Al-Muddassir"],[75,"Al-Qiyamah"],[76,"Al-Insan"],[77,"Al-Mursalat"],[78,"An-Naba'"],[79,"An-Nazi'at"],[80,"'Abasa"],[81,"At-Takwir"],[82,"Al-Infitar"],[83,"Al-Mutaffifin"],[84,"Al-Insyiqaq"],[85,"Al-Buruj"],[86,"At-Tariq"],[87,"Al-A'la"],[88,"Al-Gasyiyah"],[89,"Al-Fajr"],[90,"Al-Balad"],[91,"Asy-Syams"],[92,"Al-Lail"],[93,"Ad-Duha"],[94,"Asy-Syarh"],[95,"At-Tin"],[96,"Al-'Alaq"],[97,"Al-Qadr"],[98,"Al-Bayyinah"],[99,"Az-Zalzalah"],[100,"Al-'Adiyat"],[101,"Al-Qari'ah"],[102,"At-Takasur"],[103,"Al-'Asr"],[104,"Al-Humazah"],[105,"Al-Fil"],[106,"Quraisy"],[107,"Al-Ma'un"],[108,"Al-Kausar"],[109,"Al-Kafirun"],[110,"An-Nasr"],[111,"Al-Lahab"],[112,"Al-Ikhlas"],[113,"Al-Falaq"],[114,"An-Nas"]];

// Nama lain yang lazim dipakai panitia untuk surat yang sama.
const QURAN_ALIAS = {
  'BARAAH':9, 'BARAAT':9, 'BANIISRAIL':17, 'BANISRAIL':17, 'SUBHANA':17,
  'MALAIKAT':35, 'YASIN':36, 'YAASIN':36, 'HAMIMSAJDAH':41, 'HAMIM':41,
  'ALMUMIN':40, 'ATTAHRIM':66, 'ADDAHR':76, 'ALINSYIRAH':94, 'ALAMNASYRAH':94,
  'ALLAHAB':111, 'ATTABBAT':111, 'ALMASAD':111, 'ALMASADD':111, 'ALIIMRAN':3, 'AALIIMRAN':3, 'ALFATEHAH':1,
  'ALFATIHA':1, 'UMMULKITAB':1, 'FATIHAH':1, 'ALKAHFI':18, 'ANNAHL':16, 'ANNAS':114, 'ALFALAQ':113, 'ALIKHLAS':112,
  // 'Thaha' (ejaan umum) TIDAK senasib dgn normalisasi kanonik 'Taha': aturan
  // TH->S di quranNormNama() (utk menyeragamkan ejaan TSA/DZA/dst.) ikut
  // memakan T+H di sini, padahal keduanya huruf hijaiyah terpisah (Tha-Ha),
  // bukan 1 bunyi gabungan -- jadi dipetakan manual: quranNormNama('Thaha')='SAHA'.
  'SAHA':20,
};

/**
 * Normalisasi nama surat supaya ejaan bebas panitia tetap ketemu.
 * Dibuat agresif dengan sengaja: "AL-BAQARAH", "Al Baqoroh", "albaqarah",
 * dan "AL BAQARAH" semuanya jatuh ke kunci yang sama. Urutannya penting —
 * gabungan konsonan (TS/SY/DZ/...) harus diringkas SEBELUM vokal dilipat.
 */
function quranNormNama(s) {
  let t = String(s || '').toUpperCase();
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  t = t.replace(/^(SURA[HT]|QS)\b[\s:.]*/i, '');
  t = t.replace(/[^A-Z]/g, '');
  // Hanya lipatan yang BENAR-BENAR dipakai di ejaan Indonesia. Sengaja TIDAK
  // melipat U/E/Y/W: pelipatan itu sempat membuat "Asy-Syura" (42) dan
  // "Asy-Syu'ara" (26) jatuh ke kunci yang sama — salah tebak surat pada
  // dokumen resmi jauh lebih buruk daripada sekadar gagal mengenali.
  t = t.replace(/TS|TH/g, 'S').replace(/SY|SH/g, 'S').replace(/DZ|DH/g, 'D')
       .replace(/KH/g, 'H').replace(/GH/g, 'G').replace(/Q/g, 'K')
       .replace(/O/g, 'A').replace(/(.)\1+/g, '$1');
  return t;
}

function _lev(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Nama surat (ejaan bebas) → nomor surat 1..114, atau 0 kalau tak dikenali. */
function quranCariSurat(nama) {
  const q = quranNormNama(nama);
  if (!q) return 0;
  if (QURAN_ALIAS[q]) return QURAN_ALIAS[q];
  for (const [k, v] of Object.entries(QURAN_ALIAS)) if (quranNormNama(k) === q) return v;
  let exact = 0, best = 0, bestD = 99;
  for (const [n, nm] of QURAN_SURAT) {
    const c = quranNormNama(nm);
    if (c === q) { exact = n; break; }
    const d = _lev(c, q);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (exact) return exact;
  // Toleransi salah ketik HANYA untuk nama yang cukup panjang (>=7 huruf
  // setelah dinormalkan, kira-kira 1 kesalahan per 7 huruf). Di bawah itu
  // WAJIB persis (atau lewat alias di atas) -- pernah ketahuan bug nyata:
  // "AN'AM" tanpa awalan "AL-" (admin lupa/singkat) ternormalisasi jadi
  // "ANAM" (4 huruf), dan dengan toleransi lama (selalu minimal 1 walau
  // nama pendek) itu malah dianggap "mirip" AN-NAML ("ANAML") dan salah
  // menampilkan ayat surat lain sama sekali. Nama pendek terlalu mudah
  // "mirip" ke surat yang sama sekali berbeda kalau toleransinya disamakan
  // dengan nama panjang -- salah tebak nama surat pada dokumen resmi jauh
  // lebih buruk daripada sekadar gagal mengenali & tidak menampilkan ayat.
  if (q.length < 7) return 0;
  return (bestD <= Math.floor(q.length / 7)) ? best : 0;
}

function quranNamaSurat(n) {
  const row = QURAN_SURAT.find(r => r[0] === n);
  return row ? row[1] : '';
}

// ── Pemuatan & cache berkas surat ───────────────────────────────────────
const _quranMem = {};
function _quranBase() {
  return (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.QURAN_BASE) || 'data/quran';
}

// v2: kunci cache diberi versi (rev 17). Kalau berkas data/quran/*.json
// pernah diperbarui setelah sempat ter-cache di localStorage seseorang
// (mis. saat masih tahap uji coba), versi lama ini membuat salinan basi itu
// otomatis diabaikan sekali saja -- tanpa perlu minta orangnya membersihkan
// localStorage manual. Naikkan angka v ini lagi kalau berkas data diganti.
async function quranMuatSurat(n) {
  if (_quranMem[n]) return _quranMem[n];
  const lsKey = 'mtq_quran_v2_s' + n;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) { const o = JSON.parse(raw); if (o && o.ayat && o.ayat.length) return (_quranMem[n] = o); }
  } catch (e) {}
  const res = await fetch(`${_quranBase()}/${n}.json`, { cache: 'force-cache' });
  if (!res.ok) throw new Error('Berkas surat ' + n + ' tidak ditemukan (HTTP ' + res.status + ')');
  const o = await res.json();
  if (!o || !Array.isArray(o.ayat) || !o.ayat.length) throw new Error('Berkas surat ' + n + ' formatnya tidak valid');
  _quranMem[n] = o;
  try { localStorage.setItem(lsKey, JSON.stringify(o)); } catch (e) { /* kuota penuh — cukup cache memori */ }
  return o;
}

/** "21", "102-109", "5 – 7" → [dari, sampai] (sampai = dari kalau bukan rentang). */
function quranParseRentang(spec) {
  const m = String(spec || '').match(/(\d+)\s*[-–—s.d/]+\s*(\d+)/);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  const one = String(spec || '').match(/(\d+)/);
  return one ? [parseInt(one[1], 10), parseInt(one[1], 10)] : [0, 0];
}

const QURAN_MAKS_AYAT = 10;   // di atas ini dipotong, biar 1 kartu tetap 1 halaman

/**
 * Ambil teks ayat untuk satu baris maqra.
 * @param {string} maqraTeks  - mis. "SURAT AL-BAQARAH - AYAT : 168 – HAL : 24"
 * @param {string} cadSurat   - isi kolom maqra_detail, dipakai kalau baris
 *                              maqra tidak memuat nama surat
 * @returns {Promise<object|null>} {nomorSurat, namaSurat, ayat:[{no,arab}], dipotong, sisa}
 *          atau null kalau surat/ayat tidak bisa ditentukan (kartu tetap
 *          dicetak, hanya tanpa blok ayat — lebih baik kosong daripada salah).
 */
/**
 * Ambil teks ayat untuk satu baris maqra.
 * @param {string} maqraTeks  - mis. "SURAT AL-BAQARAH - AYAT : 168 – HAL : 24"
 * @param {string} cadSurat   - isi kolom maqra_detail, dipakai kalau baris
 *                              maqra tidak memuat nama surat
 * @returns {Promise<object|null>} {nomorSurat, namaSurat, ayat:[{no,arab}], dipotong, sisa}
 *          atau null kalau surat/ayat tidak bisa ditentukan (kartu tetap
 *          dicetak, hanya tanpa blok ayat — lebih baik kosong daripada salah).
 *
 * SEMUA jalur null di bawah mencetak console.warn dengan alasan spesifik
 * (bukan cuma error tak terduga di try/catch) -- kalau suatu saat ada baris
 * maqra yang ayatnya tidak muncul di PDF, buka Console browser (F12) saat
 * mengunduh buktinya: pesannya langsung bilang persisnya kenapa (nama surat
 * tidak dikenali, atau nomor ayat tidak terbaca dari baris maqra, dsb.),
 * jadi tidak perlu menebak-nebak lagi.
 */
async function quranAmbilUntukMaqra(maqraTeks, cadSurat) {
  const warn = (typeof console !== 'undefined' && console.warn) ? console.warn.bind(console) : function () {};
  try {
    const p = parseMaqra(maqraTeks);
    const namaDicoba = p.surat || cadSurat || '';
    const n = quranCariSurat(namaDicoba);
    if (!n) {
      warn('[Maqra] Teks ayat TIDAK ditampilkan -- nama surat tidak dikenali:',
           JSON.stringify(namaDicoba), '(dari baris maqra:', JSON.stringify(maqraTeks) + ')');
      return null;
    }
    const [dari, sampai] = quranParseRentang(p.ayat);
    if (!dari) {
      warn('[Maqra] Teks ayat TIDAK ditampilkan -- nomor ayat tidak terbaca dari baris maqra:',
           JSON.stringify(maqraTeks), '(surat terdeteksi:', quranNamaSurat(n) + ', tapi field ayat kosong/tidak berpola angka)');
      return null;
    }
    const s = await quranMuatSurat(n);
    if (dari > s.ayat.length) {
      warn('[Maqra] Teks ayat TIDAK ditampilkan -- nomor ayat', dari, 'melebihi jumlah ayat',
           quranNamaSurat(n), '(' + s.ayat.length + ' ayat). Cek penulisan ayat pada baris maqra:', JSON.stringify(maqraTeks));
      return null;
    }
    const akhir = Math.min(Math.max(sampai, dari), s.ayat.length);
    const jml = akhir - dari + 1;
    const tampil = Math.min(jml, QURAN_MAKS_AYAT);
    const ayat = [];
    for (let i = 0; i < tampil; i++) ayat.push({ no: dari + i, arab: s.ayat[dari + i - 1] });
    return { nomorSurat: n, namaSurat: s.nama || quranNamaSurat(n), ayat,
             dipotong: jml > tampil, sisa: akhir };
  } catch (e) {
    warn('[Maqra] Teks ayat TIDAK ditampilkan -- gagal memuat berkas surat (cek folder data/quran/ ter-upload lengkap & bisa diakses):', e && e.message);
    return null;
  }
}

/** 168 → ١٦٨ (angka Arab-Timur, utk penanda akhir ayat). */
function quranAngkaArab(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

// ── Font Arab ───────────────────────────────────────────────────────────
// Scheherazade New (SIL) dipilih karena memang dirancang untuk teks Arab
// BERHARAKAT PENUH gaya mushaf Indonesia/Indopak: tanda baca dicetak besar
// dan tidak bertabrakan, jadi tetap terbaca setelah html2canvas mengecilkan
// kartu ke ~180 mm di kertas A4. Amiri jadi cadangan. Font WAJIB selesai
// dimuat sebelum html2canvas memotret — kalau tidak, yang terpotret adalah
// font pengganti sistem yang harakatnya berantakan.
const QURAN_FONT_URL = 'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Amiri:wght@400;700&display=swap';

async function quranMuatFont() {
  if (!document.getElementById('_quranFontLink')) {
    const l = document.createElement('link');
    l.id = '_quranFontLink'; l.rel = 'stylesheet'; l.href = QURAN_FONT_URL;
    document.head.appendChild(l);
  }
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load('400 32px "Scheherazade New"'),
        document.fonts.load('700 32px "Scheherazade New"'),
      ]);
      await document.fonts.ready;
    } else {
      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (e) { await new Promise(r => setTimeout(r, 800)); }
}

if (typeof window !== 'undefined') {
  window.quranCariSurat      = quranCariSurat;
  window.quranAmbilUntukMaqra = quranAmbilUntukMaqra;
  window.quranMuatFont       = quranMuatFont;
}

// ================================================================
//  BUKTI PENGAMBILAN MAQRA -- template HTML dipakai bersama:
//  - cek-maqra.js   (downloadBukti(): 1 peserta, self-service)
//  - admin-maqra.js (maqraDownloadAllBukti(): banyak peserta sekaligus,
//    tab Hasil Pengambilan -> cetak semua jadi 1 file, 1 kartu/halaman)
//  Satu sumber supaya kedua jalur selalu identik desainnya.
//  ---------------------------------------------------------------
//  rev 15 — tata letak DUA KOLOM, lebar panggung 620px.
//  Alasannya murni soal keterbacaan cetak, bukan selera: kartu difoto
//  html2canvas lalu ditempel ke A4, dan penskalaan di
//  downloadBuktiMaqraPdf() memakai sisi yang lebih sesak. Versi 1 kolom
//  + blok ayat punya rasio tinggi:lebar ~2,3 sedangkan area cetak A4
//  hanya 1,46 — jadi kartunya dipaksa mengecil sampai ~120 mm dan
//  menyisakan 70 mm kertas kosong di kiri-kanan. Dengan identitas
//  peserta dikolomkan di sebelah kotak maqra, rasionya turun ke ~1,4
//  sehingga kartu dicetak selebar 190 mm penuh dan SEMUA teks jadi
//  lebih besar di kertas meski ukuran px-nya sama.
//  Catatan teknis html2canvas 1.4.1: JANGAN pakai `gap` pada flex
//  (tidak dihitung benar) -- kolom memakai inline-block + padding, dan
//  induknya font-size:0 untuk membuang celah spasi antar inline-block.
// ================================================================
<<<<<<< HEAD
const BUKTI_MAQRA_STYLES = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Georgia',serif;background:#f9fafb;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);width:100%;max-width:480px;overflow:hidden;margin:0 auto 24px}.header{background:linear-gradient(135deg,#064e3b,#059669);padding:28px 32px;color:#fff;text-align:center}.header h1{font-size:22px;margin-bottom:4px}.header p{font-size:13px;opacity:.8}.body{padding:28px 32px}.ornament{text-align:center;color:#9ca3af;margin:12px 0;letter-spacing:4px}.field{margin-bottom:14px}.field label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;display:block;margin-bottom:3px}.field .val{font-size:15px;font-weight:600;color:#1f2937}.mbox{background:linear-gradient(135deg,#065f46,#047857);color:#fff;border-radius:12px;padding:24px;text-align:center;margin:20px 0}.mbox .ml{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.75;margin-bottom:8px}.mbox .ma{font-size:22px;font-weight:700;margin-bottom:4px}.mbox .ms{font-size:14px;opacity:.85}.mbox .mn{background:rgba(255,255,255,.15);border-radius:999px;padding:5px 16px;font-size:12px;font-weight:600;display:inline-block;margin-top:10px}.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#b45309;margin-top:16px}.ttd-section{display:flex;gap:18px;margin-top:26px;padding-top:18px;border-top:1px dashed #d1d5db}.ttd-box{flex:1;text-align:center}.ttd-role{font-size:10.5px;color:#6b7280;margin-bottom:46px;line-height:1.4;white-space:nowrap}.ttd-name{font-size:9.5px;color:#9ca3af;margin-top:4px;font-style:italic}.ttd-printed-name{font-size:11px;color:#374151;margin-top:4px;font-weight:600}.ttd-printed-nip{font-size:9.5px;color:#6b7280;margin-top:1px}.ttd-line{border-bottom:1px solid #9ca3af;margin:0 6px}.footer{border-top:1px solid #e5e7eb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center}@media print{body{background:#fff}.card{box-shadow:none;page-break-after:always}.card:last-child{page-break-after:auto}}`;
=======
const BUKTI_MAQRA_STYLES = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Georgia','Times New Roman',serif;background:#eef2f1;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);width:100%;max-width:620px;overflow:hidden;margin:0 auto 24px;border:1px solid #d7e0dc}.header{background:linear-gradient(135deg,#064e3b,#059669);padding:22px 30px;color:#fff;text-align:center}.header h1{font-size:25px;line-height:1.25;margin-bottom:5px;letter-spacing:.3px}.header p{font-size:12.5px;color:#d1fae5;letter-spacing:.3px}.body{padding:20px 26px 22px}.cols{font-size:0;margin:0 -9px}.col{display:inline-block;vertical-align:top;padding:0 9px}.col-a{width:45%}.col-b{width:55%}.field{margin-bottom:13px}.field label{font-size:10px;text-transform:uppercase;letter-spacing:1.1px;color:#3f5b52;display:block;margin-bottom:2px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700}.field .val{font-size:15.5px;line-height:1.3;font-weight:700;color:#000;word-break:break-word}.mbox{background:linear-gradient(135deg,#064e3b,#047857);border:1px solid #043d2e;color:#fff;border-radius:13px;padding:16px 14px 14px;text-align:center}.mbox .ml{font-size:9.5px;text-transform:uppercase;letter-spacing:1.8px;color:#a7f3d0;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;margin-bottom:7px}.mbox .msurat{font-size:28px;line-height:1;font-weight:700;letter-spacing:.3px;margin-bottom:11px;color:#fff}.mbox .msurat.long{font-size:22px}.mbox .msurat.xlong{font-size:17px}.mbox .mgrid{font-size:0;margin:0 -3px 9px}.mbox .mcell{display:inline-block;width:50%;padding:0 3px;vertical-align:top}.mbox .mcell.solo{width:100%}.mbox .mcin{background:#fff;border-radius:9px;padding:9px 4px;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center}.mbox .mck{font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:1.3px;color:#047857;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif}.mbox .mcv{font-size:23px;line-height:1;font-weight:700;color:#053d2c;word-break:break-word;margin-top:6px}.mbox .mraw{font-size:10px;line-height:1.45;color:#d1fae5;letter-spacing:.2px;font-family:'Helvetica Neue',Arial,sans-serif;margin-bottom:9px;word-break:break-word}.mbox .mn{background:#fff;color:#053d2c;border-radius:999px;padding:5px 16px;font-size:11.5px;font-weight:700;display:inline-block;letter-spacing:.5px;font-family:'Helvetica Neue',Arial,sans-serif}.abox{background:#fff;border:1.5px solid #047857;border-radius:12px;padding:14px 16px 10px;margin:16px 0 12px;text-align:center}.abox .al{font-size:9.5px;text-transform:uppercase;letter-spacing:1.8px;color:#047857;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;margin-bottom:8px}.abox .ar{font-family:'Scheherazade New','Amiri','Traditional Arabic',serif;color:#000;direction:rtl;text-align:center;unicode-bidi:plaintext;font-size:31px;line-height:2.05;margin-bottom:8px}.abox .ar.s2{font-size:27px;line-height:2}.abox .ar.s3{font-size:23px;line-height:1.95}.abox .ar.s4{font-size:20px;line-height:1.9}.abox .ar.s5{font-size:18px;line-height:1.85}.abox .anum{font-size:.78em;white-space:nowrap}.abox .asrc{font-size:9.5px;line-height:1.5;color:#1f3b32;font-family:'Helvetica Neue',Arial,sans-serif;letter-spacing:.2px;border-top:1px solid #dbe6e1;padding-top:7px}.warn{background:#fffbeb;border:1px solid #f0c14b;border-radius:8px;padding:9px 13px;font-size:11px;line-height:1.5;color:#000;font-family:'Helvetica Neue',Arial,sans-serif}.ttd-section{display:flex;margin-top:18px;padding-top:14px;border-top:1px dashed #b9c6c1}.ttd-box{flex:1;text-align:center;padding:0 10px}.ttd-role{font-size:10.5px;color:#000;margin-bottom:42px;line-height:1.4;white-space:nowrap;font-family:'Helvetica Neue',Arial,sans-serif}.ttd-printed-name{font-size:11px;color:#000;margin-top:4px;font-weight:700}.ttd-printed-nip{font-size:9.5px;color:#000;margin-top:1px}.ttd-line{border-bottom:1px solid #000;margin:0 6px}.footer{border-top:1px solid #d7e0dc;padding:11px 30px;font-size:10.5px;line-height:1.45;color:#000;text-align:center;background:#f6f9f8;font-family:'Helvetica Neue',Arial,sans-serif}@media print{body{background:#fff}.card{box-shadow:none;page-break-after:always}.card:last-child{page-break-after:auto}}`;

/**
 * Rakit blok teks ayat (hasil quranAmbilUntukMaqra). Ukuran font diturunkan
 * bertingkat mengikuti panjang total teks — 1 ayat pendek dicetak besar, satu
 * rentang panjang dikecilkan supaya kartu tetap muat 1 halaman A4 tanpa
 * diperkecil paksa oleh penyesuaian tinggi di downloadBuktiMaqraPdf().
 */
function _buktiMaqraAyatHtml(q, esc) {
  if (!q || !q.ayat || !q.ayat.length) return '';
  const total = q.ayat.reduce((a, x) => a + x.arab.length, 0);
  const cls = total <= 200 ? '' : (total <= 420 ? ' s2' : (total <= 760 ? ' s3' : (total <= 1300 ? ' s4' : ' s5')));
  const multi = q.ayat.length > 1;
  const teks = q.ayat.map(a =>
    esc(a.arab) + (multi ? ' <span class="anum">\uFD3E' + quranAngkaArab(a.no) + '\uFD3F</span> ' : '')
  ).join('');
  const rentang = multi ? (q.ayat[0].no + '-' + q.ayat[q.ayat.length - 1].no) : String(q.ayat[0].no);
  const potong = q.dipotong
    ? ' \u00b7 ditampilkan ' + q.ayat.length + ' ayat pertama (sampai ayat ' + esc(String(q.sisa)) + ')'
    : '';
  return `<div class="abox"><div class="al">Teks Ayat</div>
<div class="ar${cls}">${teks}</div>
<div class="asrc">QS. ${esc(q.namaSurat)} : ${esc(rentang)} \u2014 Mushaf Standar Indonesia (Kemenag)${potong}</div></div>`;
}

/**
 * Versi async: mengambil teks ayatnya dulu, lalu merakit kartu. INI yang
 * dipakai semua tombol unduh. Kalau surat/ayat tidak bisa ditentukan atau
 * berkasnya gagal dimuat, quranAmbilUntukMaqra() mengembalikan null dan kartu
 * tetap tercetak tanpa blok ayat — lebih baik kosong daripada salah.
 *
 * rev 18: menghormati MTQ_CONFIG.MAQRA_PDF_VERSION (js/config.js).
 * Versi 1 (lama) SENGAJA melewati pengambilan ayat sama sekali -- bukan
 * cuma menyembunyikan hasilnya lewat CSS, supaya kartu versi 1 tetap
 * secepat sebelum fitur ayat ada (tidak ada fetch data/quran/ sama sekali)
 * dan tidak bisa gagal karena masalah folder data/quran/. Titik keputusan
 * SATU-SATUNYA ada di sini, jadi ke-4 jalur unduh (peserta & admin, satuan
 * & borongan) otomatis konsisten tanpa perlu diubah satu-satu.
 */
async function buildBuktiMaqraCardHtmlAsync(rec, m, esc) {
  const versi = (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.MAQRA_PDF_VERSION) || 2;
  let q = null;
  if (versi !== 1 && typeof quranAmbilUntukMaqra === 'function') {
    q = await quranAmbilUntukMaqra(m.maqra_teks || m.maqra || '', m.maqra_detail || m.surah || '');
  }
  return buildBuktiMaqraCardHtml(rec, m, esc, q);
}
>>>>>>> bfde93a3277144a52aa7195815205331005e64be

/**
 * Bangun 1 kartu "Bukti Maqra" (fragment <div class="card">...</div>).
 * @param {object} rec - data peserta {nama_lengkap, nomor_pendaftaran, cabang_lomba, kecamatan}
 * @param {object} m   - data maqra {maqra_teks|maqra, maqra_detail|surah, nomor_maqra}
 * @param {function} esc - fungsi escape HTML (nama beda tapi isi sama di tiap file pemanggil)
 * @param {object} [ayatQuran] - hasil quranAmbilUntukMaqra(); boleh dikosongkan
 *
 * Nama surat diambil dari hasil parseMaqra(maqra_teks); kalau baris itu tidak
 * memuat nama surat (mis. admin hanya menulis "AYAT : 21 – HAL : 5"), dipakai
 * maqra_detail/surah sebagai cadangan — field itu memang dipakai admin untuk
 * menulis surat satu kali untuk seluruh batch.
 *
 * Kolom "Panitia Pengambilan Maqra" diisi otomatis dari
 * MTQ_CONFIG.PANITIA_MAQRA_NAMA/PANITIA_MAQRA_NIP (js/config.js) — edit di sana
 * kalau ganti panitia, JANGAN hardcode ulang di sini. Kolom "Admin Kecamatan"
 * sengaja dibiarkan kosong (beda orang per kecamatan, bukan nilai config
 * tunggal) — nama & tanda tangan ditulis tangan.
 */
function buildBuktiMaqraCardHtml(rec, m, esc, ayatQuran) {
  const panitiaNama = (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.PANITIA_MAQRA_NAMA) || '';
  const panitiaNip  = (typeof MTQ_CONFIG !== 'undefined' && MTQ_CONFIG.PANITIA_MAQRA_NIP)  || '';

  const teks     = m.maqra_teks || m.maqra || '';
  const p        = parseMaqra(teks);
  const cadSurat = String(m.maqra_detail || m.surah || '').trim();
  const surat    = (p.surat || cadSurat.replace(/^SURA[HT]\b[\s:.]*/i, '')).toUpperCase();

  // Nama surat panjang ("ALI 'IMRAN", "AL-MU'MINUN") dikecilkan bertahap supaya
  // tetap 1-2 baris & tidak pernah terpotong di tepi kotak.
  const suratCls = surat.length > 22 ? ' xlong' : (surat.length > 13 ? ' long' : '');

  // Dua kartu AYAT & HALAMAN; kalau salah satunya kosong, yang tersisa melebar
  // penuh (.solo) daripada menyisakan kotak kosong di dokumen resmi.
  const cells = [];
  if (p.ayat)    cells.push(['Ayat', p.ayat]);
  if (p.halaman) cells.push(['Halaman', p.halaman]);
  const cellCls  = cells.length === 1 ? ' solo' : '';
  const gridHtml = cells.length
    ? `<div class="mgrid">${cells.map(([k, v]) =>
        `<div class="mcell${cellCls}"><div class="mcin"><div class="mck">${esc(k)}</div><div class="mcv">${esc(v)}</div></div></div>`
      ).join('')}</div>`
    : '';

  // Baris utama: nama surat kalau terbaca; kalau parser gagal total, teks asli
  // ditampilkan besar di sini supaya isinya tidak pernah hilang.
  const judulHtml = surat
    ? `<div class="msurat${suratCls}">${esc(surat)}</div>`
    : `<div class="msurat${teks.length > 22 ? ' xlong' : ' long'}">${esc(teks || '-')}</div>`;

  // Baris asli untuk verifikasi manual panitia — hanya ditampilkan kalau memang
  // menambah informasi (bukan pengulangan persis judul di atas).
  const rawLine = formatMaqra(teks);
  const rawHtml = (rawLine && rawLine.toUpperCase() !== surat) ? `<div class="mraw">${esc(rawLine)}</div>` : '';

  return `<div class="card">
<div class="header"><h1>Bukti Pengambilan Maqra</h1><p>MTQ ke-56 Kabupaten Indramayu 2026 &mdash; ${new Date().toLocaleString('id-ID')}</p></div>
<div class="body">
<div class="cols">
  <div class="col col-a">
    <div class="field"><label>Nama Peserta</label><div class="val">${esc(rec.nama_lengkap||'-')}</div></div>
    <div class="field"><label>Nomor Pendaftaran</label><div class="val" style="font-family:'Courier New',monospace;letter-spacing:.5px">${esc(rec.nomor_pendaftaran||'-')}</div></div>
    <div class="field"><label>Cabang Lomba</label><div class="val">${esc(rec.cabang_lomba||'-')}</div></div>
    <div class="field" style="margin-bottom:0"><label>Kecamatan</label><div class="val">${esc(rec.kecamatan||'-')}</div></div>
  </div>
  <div class="col col-b">
    <div class="mbox"><div class="ml">Maqra yang Diperoleh</div>
${judulHtml}
${gridHtml}
${rawHtml}
<div class="mn">Nomor Undian: ${esc(m.nomor_maqra||'-')}</div></div>
  </div>
</div>
${_buktiMaqraAyatHtml(ayatQuran, esc)}
<div class="warn"><b>Simpan dokumen ini.</b> Maqra yang telah diambil tidak dapat diubah. Cetak dan mintakan tanda tangan panitia serta admin kecamatan di bawah sebagai bukti sah.</div>
<div class="ttd-section">
  <div class="ttd-box">
    <div class="ttd-role">Panitia Pengambilan Maqra</div>
    <div class="ttd-line"></div>
    <div class="ttd-printed-name">${esc(panitiaNama)}</div>
    ${panitiaNip ? `<div class="ttd-printed-nip">NIP. ${esc(panitiaNip)}</div>` : ''}
  </div>
  <div class="ttd-box">
    <div class="ttd-role">Admin Kecamatan ${esc(rec.kecamatan||'-')}</div>
    <div class="ttd-line"></div>
  </div>
</div>
</div>
<div class="footer">MTQ Kabupaten Indramayu 2026 &mdash; Sah setelah ditandatangani panitia &amp; admin kecamatan</div>
</div>`;
}

// ================================================================
//  loadScript / downloadBuktiMaqraPdf -- unduh Bukti Maqra sbg PDF
//  ---------------------------------------------------------------
//  Dipakai bersama oleh:
//   - cek-maqra.js   (downloadBukti(): 1 peserta, self-service)
//   - admin-maqra.js (maqraDownloadAllBukti(): banyak peserta sekaligus
//     dari tab Hasil Pengambilan; maqraAmbilDownloadBukti(): 1 peserta
//     dari modal tab Ambil Maqra Peserta)
//  Sebelumnya tiap jalur mengunduh .html (dgn window.print() utk versi
//  admin-bulk) dan mengandalkan admin/peserta menyimpan manual sbg PDF
//  lewat dialog print browser. Sekarang PDF asli dibuat langsung di
//  browser: html2canvas "memotret" tiap kartu (elemen HTML/CSS yang
//  SAMA persis dgn buildBuktiMaqraCardHtml di atas, jadi tampilannya
//  tetap identik), lalu jsPDF menyusun potretnya jadi 1 file PDF
//  (1 kartu = 1 halaman A4). jsPDF sendiri sudah dimuat statis di
//  cekstatus.html & doyourmagic.html; html2canvas belum, makanya
//  dimuat dinamis di sini (sama seperti downloadKartuPeserta() di
//  cek-maqra.js memuat ulang jsPDF secara dinamis juga — loadScript()
//  idempoten, aman dipanggil walau skrip-nya sudah ada).
//  CATATAN utk yang membaca downloadStatsPdf()/_runDownloadAllKartu_()
//  di doyourmagic.html dan heran kenapa di sini malah PAKAI html2canvas:
//  keduanya SENGAJA menghindari jsPDF.html() (yang otomatis pakai
//  html2canvas di baliknya) karena kontrol layout/ukurannya kurang
//  cocok utk TABEL LEBAR/dinamis. Di sini beda kasus — kartunya
//  ukuran TETAP & HTML/CSS-nya sederhana (bukan tabel), dan kita
//  TIDAK memakai jsPDF.html() sama sekali: html2canvas cuma dipakai
//  manual utk "memotret" jadi 1 gambar, lalu ditempel ke halaman PDF
//  dengan perhitungan ukuran/posisi sendiri (persis pola manual yang
//  sama dgn downloadStatsPdf()/_runDownloadAllKartu_(), cuma sumber
//  gambarnya dari html2canvas krn kartunya HTML/CSS, bukan <canvas>
//  yang digambar langsung).
// ================================================================

/** Muat 1 script CDN via tag <script>, idempoten (aman dipanggil berkali-kali). */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Gagal memuat pustaka: ' + src));
    document.head.appendChild(s);
  });
}

/**
 * Ubah 1 atau lebih kartu bukti maqra (fragment HTML dari
 * buildBuktiMaqraCardHtml) menjadi 1 file PDF (1 kartu = 1 halaman A4),
 * lalu langsung diunduh ke browser.
 * @param {string[]} cardsHtml - array fragment `<div class="card">...</div>`, satu per kartu
 * @param {string}   filename  - nama file .pdf yang diunduh
 * @param {function} [onProgress] - opsional, dipanggil (i, total) sebelum kartu ke-i diproses
 */
async function downloadBuktiMaqraPdf(cardsHtml, filename, onProgress) {
  if (!cardsHtml || !cardsHtml.length) throw new Error('Tidak ada kartu untuk diunduh');

  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  // Font Arab HARUS selesai dimuat sebelum html2canvas memotret; kalau tidak,
  // yang terpotret adalah font pengganti sistem dan harakatnya berantakan.
  if (typeof quranMuatFont === 'function') { try { await quranMuatFont(); } catch (e) {} }
  if (typeof html2canvas !== 'function') throw new Error('Pustaka html2canvas gagal dimuat');
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Pustaka jsPDF gagal dimuat');

  // Style tag BUKTI_MAQRA_STYLES perlu ada di document (di mana pun --
  // browser tetap menerapkannya walau bukan di <head>) supaya
  // html2canvas membaca computed style yang benar saat "memotret".
  // PENTING: textContent DIPAKSA ditulis ulang tiap panggilan (bukan
  // cuma dibuat sekali lalu dibiarkan) -- kalau tab sempat memuat versi
  // lama lalu berkas .js ini diperbarui tanpa reload penuh, cara lama
  // (skip kalau tag sudah ada) akan mengunci CSS versi lama itu
  // SELAMANYA di tab tsb, walau logika JS lain sudah berjalan dgn kode
  // terbaru -- persis pola yang bikin membingungkan saat debug (kode
  // sudah benar tapi tampilan masih versi lama). Sekarang setiap
  // download dijamin memakai CSS TERBARU dari berkas ini, titik.
  let styleTag = document.getElementById('_buktiMaqraPdfStyle');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = '_buktiMaqraPdfStyle';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = BUKTI_MAQRA_STYLES;

  // Panggung di luar viewport tempat tiap kartu dirender satu-satu
  // sebelum difoto -- html2canvas butuh elemen yang benar-benar
  // ter-layout (bukan display:none), jadi digeser ke luar layar,
  // bukan disembunyikan.
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:-99999px;top:0;width:620px;background:#eef2f1';
  document.body.appendChild(stage);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = 210, PAGE_H = 297, MARGIN = 10;   // rev 15: dikecilkan, kartu kini memuat teks ayat

  try {
    for (let i = 0; i < cardsHtml.length; i++) {
      if (onProgress) onProgress(i, cardsHtml.length);

      stage.innerHTML = cardsHtml[i];
      // Beri waktu 2 frame supaya layout & font selesai settle sebelum
      // dipotret -- memotret persis setelah innerHTML diisi kadang masih
      // menangkap kondisi belum sepenuhnya ter-layout.
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(stage.firstElementChild, {
        scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const availW = PAGE_W - MARGIN * 2;
      const availH = PAGE_H - MARGIN * 2;
      let imgWmm = availW;
      let imgHmm = canvas.height * (imgWmm / canvas.width);
      if (imgHmm > availH) { imgHmm = availH; imgWmm = canvas.width * (imgHmm / canvas.height); }
      const x = MARGIN + (availW - imgWmm) / 2;
      const y = MARGIN;

      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', x, y, imgWmm, imgHmm);
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(stage);
  }
}