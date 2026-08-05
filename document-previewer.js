/**
 * ================================================================
 *  DocumentPreviewer v1.3
 *  Preview PDF & Image dari Google Drive dengan Zoom/Pan/Rotate
 *
 *  Arsitektur v1.3:
 *    - Semua movement (X, Y, zoom) via CSS transform — unified
 *    - Zoom toward center: konten tidak loncat saat zoom in/out
 *    - Page indicator dikalkulasi dari panY + zoom (bukan scrollTop)
 *    - Judul diambil dari metadata Google Drive API
 *
 *  Dependensi:
 *    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
 *    <link rel="stylesheet" href="document-previewer.css">
 * ================================================================
 */

class DocumentPreviewer {

    /* ============================================================
       CONSTRUCTOR
    ============================================================ */
    constructor(config = {}) {
        this.config   = this._mergeConfig(config);
        this._state   = this._defaultState();
        this._dom     = {};
        this._mounted = false;

        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = this.config.pdfWorkerUrl;
        }
    }


    /* ============================================================
       PUBLIC API
    ============================================================ */

    mount(targetSelector = 'body') {
        if (this._mounted) return;
        const root = document.querySelector(targetSelector);
        if (!root) throw new Error(`[DP] Target "${targetSelector}" tidak ditemukan.`);
        root.insertAdjacentHTML('beforeend', this._buildHTML());
        this._cacheDom();
        this._bindInternalEvents();
        this._mounted = true;
        this._log('Mounted OK');
    }

    async open(fileUrl, docName = 'Dokumen') {
        if (!this._mounted) this.mount();
        this._resetState();
        this._state.currentUrl  = fileUrl;
        this._state.currentName = docName;

        this._showModal(docName);
        this._setLoading('Menghubungi Google Drive...');

        try {
            const fileId = this._extractFileId(fileUrl);
            if (!fileId) throw new Error('File ID tidak dapat diekstrak dari URL.');
            this._setLoading('Mengunduh file...');
            await this._fetchFromDrive(fileId);
            this._hideLoading();
            this.config.onOpen?.(fileUrl, docName);
        } catch (err) {
            this._log('Error:', err.message);
            this._showError(err.message);
            this.config.onError?.(err);
        }
    }

    async openDirect(fileUrl, docName = 'Dokumen') {
        if (!this._mounted) this.mount();
        this._resetState();
        this._state.currentUrl  = fileUrl;
        this._state.currentName = docName;

        this._showModal(docName);
        this._setLoading('Mengambil file...');

        try {
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const blob = await res.blob();
            await this._renderBlob(blob);
            this._hideLoading();
            this.config.onOpen?.(fileUrl, docName);
        } catch (err) {
            this._log('Error:', err.message);
            this._showError(err.message);
            this.config.onError?.(err);
        }
    }

    bindTriggers(selector = '.dp-trigger') {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest(selector);
            if (!btn) return;
            const url  = btn.dataset.fileUrl;
            const name = btn.dataset.docName || 'Dokumen';
            if (url) this.open(url, name);
        });
        this._log('Triggers bound:', selector);
    }

    close() {
        this._dom.modal?.classList.remove('show');
        this._cleanupViewer();
        this._resetState();
        this.config.onClose?.();
        this._log('Closed');
    }

    /** Zoom In — zoom toward viewport center */
    zoomIn() {
        const newZoom = Math.min(this._state.zoomLevel + this.config.zoomStep, this.config.zoomMax);
        this._applyZoomToCenter(newZoom);
    }

    /** Zoom Out — zoom toward viewport center */
    zoomOut() {
        const newZoom = Math.max(this._state.zoomLevel - this.config.zoomStep, this.config.zoomMin);
        this._applyZoomToCenter(newZoom);
    }

    /** Rotate 90 degrees, stay on same page */
    async rotate() {
        this._state.rotation = (this._state.rotation + 90) % 360;
        await this._applyRotation();
    }

    /** Reset zoom, pan, rotation */
    async reset() {
        const s      = this._state;
        s.zoomLevel  = 1.0;
        s.zoomTarget = 1.0;
        s.panX       = 0;
        s.panY       = 0;
        this._initPanPosition();
        this._applyTransform();

        if (s.rotation !== 0) {
            s.rotation = 0;
            await this._applyRotation();
        }
    }

    openOriginal() {
        if (this._state.currentUrl) window.open(this._state.currentUrl, '_blank');
    }

    download() {
        const url    = this._state.currentUrl;
        if (!url) return;
        const fileId = this._extractFileId(url);
        window.open(
            fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url,
            '_blank'
        );
    }


    /* ============================================================
       PRIVATE — CONFIG & STATE
    ============================================================ */
    _mergeConfig(c) { return { ...DocumentPreviewer.defaultConfig, ...c }; }

    _defaultState() {
        return {
            zoomLevel  : 1.0,
            zoomTarget : 1.0,
            rotation   : 0,
            panX       : 0,
            panY       : 0,
            isPanning  : false,
            startX     : 0,
            startY     : 0,
            panStartX  : 0,
            panStartY  : 0,
            _lastWheel : 0,
            fileType   : null,
            currentUrl : '',
            currentName: '',
            pdfDoc     : null,
            currentPage: 1
        };
    }

    _resetState() {
        Object.assign(this._state, {
            zoomLevel: 1.0, zoomTarget: 1.0, rotation: 0,
            panX: 0, panY: 0, isPanning: false,
            fileType: null, pdfDoc: null, currentPage: 1
        });
    }


    /* ============================================================
       PRIVATE — DOM BUILDER
    ============================================================ */
    _buildHTML() {
        const id = this.config.modalId;
        return `
        <div id="${id}" class="dp-modal" role="dialog" aria-modal="true">

            <div class="dp-header" id="${id}-header">
                <div class="dp-header-left">
                    <div class="dp-file-icon" id="${id}-file-icon">📄</div>
                    <div class="dp-title-wrap">
                        <div class="dp-title" id="${id}-title">Preview</div>
                        <div class="dp-subtitle" id="${id}-subtitle">Memuat...</div>
                    </div>
                </div>
                <div class="dp-header-right">
                    <div class="dp-page-indicator" id="${id}-page-indicator" style="display:none">
                        <span id="${id}-page-current">1</span>
                        <span class="dp-page-sep">/</span>
                        <span id="${id}-page-total">1</span>
                    </div>
                    <button class="dp-close" id="${id}-close" aria-label="Tutup preview" title="Tutup (Esc)">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="dp-container" id="${id}-container">
                <div class="dp-loading" id="${id}-loading">
                    <div class="dp-spinner-wrap"><div class="dp-spinner"></div></div>
                    <p class="dp-loading-title">Memuat dokumen...</p>
                    <p class="dp-loading-sub" id="${id}-loading-text"></p>
                </div>
                <div id="${id}-viewer"></div>
                <div class="dp-scrollbar dp-scrollbar-v" id="${id}-sb-v" style="display:none">
                    <div class="dp-scrollbar-thumb" id="${id}-sb-v-thumb"></div>
                </div>
                <div class="dp-scrollbar dp-scrollbar-h" id="${id}-sb-h" style="display:none">
                    <div class="dp-scrollbar-thumb" id="${id}-sb-h-thumb"></div>
                </div>
            </div>
            <div class="dp-controls" role="toolbar">
                <div class="dp-controls-group">
                    <button class="dp-btn dp-btn-icon" onclick="window.__dpInstances['${id}'].zoomOut()" title="Zoom Out (-)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                    </button>
                    <div class="dp-zoom-label" id="${id}-zoom-label">100%</div>
                    <button class="dp-btn dp-btn-icon" onclick="window.__dpInstances['${id}'].zoomIn()" title="Zoom In (+)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                    </button>
                </div>
                <div class="dp-divider"></div>
                <div class="dp-controls-group">
                    <button class="dp-btn dp-btn-icon" onclick="window.__dpInstances['${id}'].rotate()" title="Putar 90 deg (R)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                    </button>
                    <button class="dp-btn dp-btn-icon" onclick="window.__dpInstances['${id}'].reset()" title="Reset tampilan (0)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                        </svg>
                    </button>
                </div>
                <div class="dp-divider"></div>
                <div class="dp-controls-group">
                    <button class="dp-btn dp-btn-accent" onclick="window.__dpInstances['${id}'].openOriginal()" title="Buka di Google Drive">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        <span>Buka</span>
                    </button>
                    <button class="dp-btn dp-btn-icon" onclick="window.__dpInstances['${id}'].download()" title="Download file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                </div>
            </div>

        </div>`;
    }

    _cacheDom() {
        const id = this.config.modalId;
        this._dom = {
            modal        : document.getElementById(id),
            title        : document.getElementById(`${id}-title`),
            subtitle     : document.getElementById(`${id}-subtitle`),
            fileIcon     : document.getElementById(`${id}-file-icon`),
            close        : document.getElementById(`${id}-close`),
            container    : document.getElementById(`${id}-container`),
            loading      : document.getElementById(`${id}-loading`),
            loadingTxt   : document.getElementById(`${id}-loading-text`),
            viewer       : document.getElementById(`${id}-viewer`),
            zoomLabel    : document.getElementById(`${id}-zoom-label`),
            pageIndicator: document.getElementById(`${id}-page-indicator`),
            pageCurrent  : document.getElementById(`${id}-page-current`),
            pageTotal    : document.getElementById(`${id}-page-total`),
            sbV          : document.getElementById(`${id}-sb-v`),
            sbVThumb     : document.getElementById(`${id}-sb-v-thumb`),
            sbH          : document.getElementById(`${id}-sb-h`),
            sbHThumb     : document.getElementById(`${id}-sb-h-thumb`)
        };
        window.__dpInstances = window.__dpInstances || {};
        window.__dpInstances[this.config.modalId] = this;
    }

    _bindInternalEvents() {
        this._dom.close.addEventListener('click', () => this.close());

        document.addEventListener('keydown', (e) => {
            if (!this._isOpen()) return;
            if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
            if (e.key === 'Escape')             this.close();
            if (e.key === '+' || e.key === '=') this.zoomIn();
            if (e.key === '-')                  this.zoomOut();
            if (e.key === 'r' || e.key === 'R') this.rotate();
            if (e.key === '0')                  this.reset();
        });

        this._initPan();
        this._initScrollbarDrag();
    }
    // ============================================================ */
    _isOpen() { return this._dom.modal?.classList.contains('show') ?? false; }

    _showModal(docName) {
        this._dom.title.textContent    = this._cleanFileName(docName);
        this._dom.subtitle.textContent = 'Memuat...';
        this._dom.fileIcon.textContent = '📄';
        this._dom.modal.classList.add('show');
        this._dom.viewer.innerHTML     = '';
        this._dom.viewer.style.display = 'none';
        this._dom.pageIndicator.style.display = 'none';
        this._reinitPan();
    }

    /** Hapus ekstensi file dari nama */
    _cleanFileName(name) {
        if (!name) return 'Dokumen';
        return name.replace(/\.[a-zA-Z0-9]{2,5}$/, '').trim() || name;
    }

    _setLoading(msg) {
        this._dom.loading.style.display = 'flex';
        const t = this._dom.loading.querySelector('.dp-loading-title');
        if (t) t.textContent = msg;
        if (this._dom.loadingTxt) this._dom.loadingTxt.textContent = '';
    }

    _hideLoading() {
        this._dom.loading.style.display = 'none';
        this._dom.viewer.style.display  = 'flex';
    }

    _showError(msg) {
        this._dom.loading.style.display = 'flex';
        this._dom.loading.innerHTML = `
            <div class="dp-error-icon">!</div>
            <p class="dp-error-title">Gagal memuat file</p>
            <p class="dp-error-msg">${msg}</p>
            <button class="dp-error-btn" onclick="window.__dpInstances['${this.config.modalId}'].openOriginal()">
                Buka di Google Drive
            </button>`;
    }

    _cleanupViewer() {
        if (this._dom.viewer) this._dom.viewer.innerHTML = '';
        this._state.pdfDoc = null;
    }

    _updateFileInfo() {
        const s = this._state;
        if (s.fileType === 'pdf' && s.pdfDoc) {
            const n = s.pdfDoc.numPages;
            this._dom.subtitle.textContent        = `PDF · ${n} halaman`;
            this._dom.fileIcon.textContent        = '📄';
            this._dom.pageTotal.textContent       = n;
            this._dom.pageCurrent.textContent     = '1';
            this._dom.pageIndicator.style.display = 'flex';
        } else if (s.fileType === 'image') {
            this._dom.subtitle.textContent        = 'Gambar';
            this._dom.fileIcon.textContent        = '🖼️';
            this._dom.pageIndicator.style.display = 'none';
        }
    }


    /* ============================================================
       PRIVATE — FILE LOADING
    ============================================================ */
    _extractFileId(url) {
        const patterns = [
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /[?&]id=([a-zA-Z0-9_-]+)/,
            /uc\?.*id=([a-zA-Z0-9_-]+)/
        ];
        for (const re of patterns) {
            const m = url.match(re);
            if (m) return m[1];
        }
        return null;
    }

    async _fetchFromDrive(fileId) {
        if (!this.config.googleDriveApiKey)
            throw new Error('googleDriveApiKey belum dikonfigurasi.');

        const key = this.config.googleDriveApiKey;

        // Ambil nama file asli dari Drive API metadata
        try {
            const metaRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name&key=${key}`
            );
            if (metaRes.ok) {
                const meta = await metaRes.json();
                if (meta.name) {
                    const clean = this._cleanFileName(meta.name);
                    this._dom.title.textContent = clean;
                    this._state.currentName     = clean;
                }
            }
        } catch (_) { /* metadata optional */ }

        // Unduh konten file
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${key}`
        );
        if (!res.ok) throw new Error(`Drive API: HTTP ${res.status} ${res.statusText}`);

        const blob = await res.blob();
        if (blob.size === 0) throw new Error('File kosong diterima dari Google Drive.');
        await this._renderBlob(blob);
    }

    async _renderBlob(blob) {
        const isPDF = blob.type.includes('pdf') || await this._isPDF(blob);
        if (isPDF) {
            this._state.fileType = 'pdf';
            await this._renderPDF(blob);
        } else {
            this._state.fileType = 'image';
            await this._renderImage(blob);
        }
        this._updateFileInfo();
        // Set posisi awal (top, centered)
        this._initPanPosition();
        this._applyTransform();
        this._updatePageIndicator();
    }

    async _isPDF(blob) {
        try {
            const buf = await blob.slice(0, 4).arrayBuffer();
            return String.fromCharCode(...new Uint8Array(buf)) === '%PDF';
        } catch { return false; }
    }


    /* ============================================================
       PRIVATE — RENDER PDF
    ============================================================ */
    async _renderPDF(blob) {
        if (typeof pdfjsLib === 'undefined')
            throw new Error('PDF.js belum dimuat. Tambahkan script PDF.js di HTML.');

        const buf = await blob.arrayBuffer();
        this._state.pdfDoc = await pdfjsLib.getDocument({
            data: buf, cMapUrl: this.config.pdfCmapUrl, cMapPacked: true
        }).promise;

        this._log('PDF pages:', this._state.pdfDoc.numPages);
        await this._renderAllPDFPages();
    }

    async _renderAllPDFPages(targetPage = null) {
        const { viewer } = this._dom;
        const { pdfDoc, rotation } = this._state;

        viewer.innerHTML     = '';
        viewer.style.cssText = `
            display:flex; flex-direction:column; align-items:center;
            gap:16px; padding:20px; width:100%; box-sizing:border-box;
            transform-origin:0 0; position:relative;
        `;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page     = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: this.config.pdfScale, rotation });

            const canvas   = document.createElement('canvas');
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            canvas.setAttribute('data-page', i);
            canvas.style.cssText = `
                display:block; max-width:90%; height:auto; margin:0 auto;
                box-shadow:0 2px 20px rgba(0,0,0,.5);
                background:white; border-radius:3px;
            `;

            viewer.appendChild(canvas);
            canvas.offsetHeight; // force reflow

            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
            await new Promise(r => requestAnimationFrame(r));
            this._log(`Page ${i}/${pdfDoc.numPages} OK`);
        }

        if (targetPage && targetPage > 1) {
            await new Promise(r => requestAnimationFrame(r));
            this._scrollToPage(targetPage);
        }
    }

    /**
     * Scroll ke halaman via panY transform.
     *
     * Dengan transform-origin:0 0 dan scale(zoom):
     *   screen_Y_of_canvas_top = panY + canvas.offsetTop * zoom
     * Agar canvas.top = 20px dari atas container:
     *   panY = 20 - canvas.offsetTop * zoom
     */
    _scrollToPage(pageNum) {
        const canvas = this._dom.viewer.querySelector(`canvas[data-page="${pageNum}"]`);
        if (!canvas) return;
        const s = this._state;
        s.panY = 20 - canvas.offsetTop * s.zoomLevel;
        this._clampPan();
        this._applyTransform();
        this._updatePageIndicator();
    }

    /**
     * Halaman paling terlihat, dikalkulasi dari panY + zoom.
     * Tidak tergantung scrollTop.
     */
    _getCurrentVisiblePage() {
        const s       = this._state;
        const canvases = this._dom.viewer.querySelectorAll('canvas[data-page]');
        if (!canvases.length) return 1;

        const ch   = this._dom.container.clientHeight;
        // Titik tengah viewport dalam content coordinates:
        // screen_Y = panY + content_Y * zoom  →  content_Y = (screen_Y - panY) / zoom
        const vpCY = (ch * 0.45 - s.panY) / s.zoomLevel;

        let closest = canvases[0], minDist = Infinity;
        canvases.forEach(cv => {
            const dist = Math.abs((cv.offsetTop + cv.offsetHeight / 2) - vpCY);
            if (dist < minDist) { minDist = dist; closest = cv; }
        });
        return parseInt(closest.getAttribute('data-page'), 10);
    }


    /* ============================================================
       PRIVATE — RENDER IMAGE
    ============================================================ */
    async _renderImage(blob) {
        const { viewer } = this._dom;
        viewer.innerHTML     = '';
        viewer.style.cssText = `
            display:flex; justify-content:center; align-items:center;
            width:100%; height:100%; box-sizing:border-box;
            transform-origin:0 0; position:relative;
        `;

        const img  = document.createElement('img');
        img.id     = `${this.config.modalId}-image`;
        img.style.cssText = `
            max-width:none; width:auto; height:auto;
            box-shadow:0 4px 24px rgba(0,0,0,.6);
            border-radius:4px; display:block;
            pointer-events:none; user-select:none;
        `;

        return new Promise((resolve, reject) => {
            img.onload  = () => {
                viewer.appendChild(img);
                this._fitImageToContainer(img);
                resolve();
            };
            img.onerror = () => reject(new Error('Gagal merender gambar.'));
            img.src     = URL.createObjectURL(blob);
        });
    }

    _fitImageToContainer(img) {
        const c  = this._dom.container;
        const cw = c.clientWidth  - 40;
        const ch = c.clientHeight - 40;
        const ir = img.naturalWidth / img.naturalHeight;
        if (ir > cw / ch) {
            img.style.width  = Math.min(img.naturalWidth, cw) + 'px';
            img.style.height = 'auto';
        } else {
            img.style.height = Math.min(img.naturalHeight, ch) + 'px';
            img.style.width  = 'auto';
        }
    }


    /* ============================================================
       PRIVATE — UNIFIED TRANSFORM ENGINE
    ============================================================ */

    /**
     * Set posisi awal setelah dokumen dimuat:
     * - panX = 0 (kiri atas), lalu clamp akan center jika konten sempit
     * - panY = 0 (tampilkan dari atas dokumen)
     */
    _initPanPosition() {
        this._state.panX = 0;
        this._state.panY = 0;
        this._clampPan();
    }

    /**
     * Apply transform ke viewer — unified untuk PDF dan Image.
     *
     * transform-origin: 0 0 (top-left)
     * transform: translate(panX, panY) scale(zoom)
     *
     *   Posisi visual top-left content = (panX, panY) dalam koordinat container
     *   Posisi visual content di (cx, cy) = (panX + cx * zoom, panY + cy * zoom)
     *
     * Image rotation: diterapkan ke <img> itu sendiri (viewer tidak dirotasi).
     */
    _applyTransform() {
        const { viewer } = this._dom;
        const s = this._state;
        if (!viewer) return;

        viewer.style.transformOrigin = '0 0';
        viewer.style.transform       = `translate(${s.panX}px, ${s.panY}px) scale(${s.zoomLevel})`;

        // Image: tambah rotasi ke elemen img
        if (s.fileType === 'image') {
            const img = document.getElementById(`${this.config.modalId}-image`);
            if (img) img.style.transform = `rotate(${s.rotation}deg)`;
        }

        // Update UI elements
        if (this._dom.zoomLabel)
            this._dom.zoomLabel.textContent = Math.round(s.zoomLevel * 100) + '%';

        // Update custom scrollbars
        this._updateScrollbars();

        if (s.fileType === 'pdf') this._updatePageIndicator();
    }

    /**
     * Clamp panX dan panY agar konten tidak keluar viewport.
     *
     * Dengan transform-origin: 0 0:
     *   - panX, panY = posisi top-left konten dalam koordinat screen container
     *   - scaledW = viewerNaturalWidth * zoom
     *   - scaledH = viewerNaturalHeight * zoom
     *
     * Aturan:
     *   - Jika scaled <= container: center konten dalam container
     *   - Jika scaled > container: clamp dalam [-(scaled-container), 0]
     */
    _clampPan() {
        const s  = this._state;
        const c  = this._dom.container;
        const v  = this._dom.viewer;
        if (!c || !v) return;

        const cw = c.clientWidth;
        const ch = c.clientHeight;
        const vw = v.offsetWidth  || cw;   // dimensi alami (sebelum transform)
        const vh = v.offsetHeight || ch;

        const scaledW = vw * s.zoomLevel;
        const scaledH = vh * s.zoomLevel;

        // ── HORIZONTAL ──────────────────────────────────────────
        if (scaledW <= cw) {
            // Konten sempit → center horizontal
            s.panX = (cw - scaledW) / 2;
        } else {
            // Konten lebar → batas kiri [cw-scaledW, 0]
            s.panX = Math.min(0, Math.max(cw - scaledW, s.panX));
        }

        // ── VERTIKAL ────────────────────────────────────────────
        if (scaledH <= ch) {
            // Konten pendek → center vertikal
            s.panY = (ch - scaledH) / 2;
        } else {
            // Konten panjang → batas atas [ch-scaledH, 0]
            s.panY = Math.min(0, Math.max(ch - scaledH, s.panY));
        }
    }

    /**
     * Zoom dengan mempertahankan titik tengah viewport tetap di posisi yang sama.
     *
     * Dengan transform-origin: 0 0:
     *   screen_pos = panXY + content_pos * zoom
     *   content_center = (viewport_center - panXY) / oldZoom
     *
     *   Setelah zoom baru:
     *   panXY_new = viewport_center - content_center * newZoom
     */
    _applyZoomToCenter(newZoom) {
        const s  = this._state;
        const c  = this._dom.container;
        const cw = c.clientWidth;
        const ch = c.clientHeight;

        // Titik tengah viewport dalam content coordinates
        const contentCX = (cw / 2 - s.panX) / s.zoomLevel;
        const contentCY = (ch / 2 - s.panY) / s.zoomLevel;

        // Zoom baru
        s.zoomLevel  = newZoom;
        s.zoomTarget = newZoom;

        // Pan baru: jaga titik yang sama tetap di tengah viewport
        s.panX = cw / 2 - contentCX * newZoom;
        s.panY = ch / 2 - contentCY * newZoom;

        this._clampPan();
        this._applyTransform();
        this._updatePageIndicator();
    }

    /**
     * Update page indicator — kalkulasi dari panY + zoom.
     *
     * Content Y di tengah viewport:
     *   vpCY = (containerHeight * 0.45 - panY) / zoom
     *
     * Canvas paling dekat dengan vpCY = halaman aktif.
     */
    _updatePageIndicator() {
        if (this._state.fileType !== 'pdf') return;
        const s       = this._state;
        const canvases = this._dom.viewer.querySelectorAll('canvas[data-page]');
        if (!canvases.length) return;

        const ch   = this._dom.container.clientHeight;
        const vpCY = (ch * 0.45 - s.panY) / s.zoomLevel;

        let closest = canvases[0], minDist = Infinity;
        canvases.forEach(cv => {
            const dist = Math.abs((cv.offsetTop + cv.offsetHeight / 2) - vpCY);
            if (dist < minDist) { minDist = dist; closest = cv; }
        });

        const page = parseInt(closest.getAttribute('data-page'), 10);
        if (page !== s.currentPage) {
            s.currentPage = page;
            if (this._dom.pageCurrent) this._dom.pageCurrent.textContent = page;
        }
    }


    /* ============================================================
       PRIVATE — ROTATION
    ============================================================ */
    async _applyRotation() {
        const { loading, viewer } = this._dom;

        const savedPage = (this._state.fileType === 'pdf') ? this._getCurrentVisiblePage() : 1;

        loading.style.display = 'flex';
        const t = loading.querySelector('.dp-loading-title');
        if (t) t.textContent = `Memutar ${this._state.rotation}°...`;
        viewer.style.display = 'none';

        try {
            if (this._state.fileType === 'pdf' && this._state.pdfDoc) {
                await this._renderAllPDFPages(savedPage);
                this._updateFileInfo();
                // Re-apply transform with same zoom/pan (page scroll handled in renderAll)
                this._clampPan();
                this._applyTransform();
            } else if (this._state.fileType === 'image') {
                const img = document.getElementById(`${this.config.modalId}-image`);
                if (img) img.style.transform = `rotate(${this._state.rotation}deg)`;
            }
        } finally {
            loading.style.display = 'none';
            viewer.style.display  = 'flex';
        }
    }


    /* ============================================================
       PRIVATE — PAN & WHEEL
    ============================================================ */
    _initPan() {
        const c = this._dom.container;
        if (!c) return;

        const L = {
            down  : e => this._onPanStart(e),
            move  : e => this._onPanMove(e),
            up    : () => this._onPanEnd(),
            wheel : e => this._onWheel(e),
            ts    : e => { if (e.touches[0]) this._onPanStart(e.touches[0]); },
            tm    : e => { e.preventDefault(); if (e.touches[0]) this._onPanMove(e.touches[0]); },
            te    : () => this._onPanEnd()
        };
        c.__panListeners = L;

        c.addEventListener('mousedown',  L.down);
        document.addEventListener('mousemove', L.move);
        document.addEventListener('mouseup',   L.up);
        c.addEventListener('wheel',      L.wheel, { passive: false });
        c.addEventListener('touchstart', L.ts,    { passive: true });
        c.addEventListener('touchmove',  L.tm,    { passive: false });
        c.addEventListener('touchend',   L.te);
        c.style.cursor = 'grab';
    }

    _reinitPan() {
        const c = this._dom.container;
        const L = c?.__panListeners;
        if (!c || !L) return;
        c.removeEventListener('mousedown',  L.down);
        document.removeEventListener('mousemove', L.move);
        document.removeEventListener('mouseup',   L.up);
        c.removeEventListener('wheel',      L.wheel);
        c.removeEventListener('touchstart', L.ts);
        c.removeEventListener('touchmove',  L.tm);
        c.removeEventListener('touchend',   L.te);
        this._initPan();
    }

    _onPanStart(e) {
        if (e.target?.closest?.('.dp-controls, .dp-header')) return;
        const s      = this._state;
        s.isPanning  = true;
        s.panStartX  = s.panX;    // simpan posisi transform saat ini
        s.panStartY  = s.panY;
        s.startX     = e.clientX ?? e.pageX;  // simpan posisi kursor awal
        s.startY     = e.clientY ?? e.pageY;
        this._dom.container.style.cursor = 'grabbing';
    }

    _onPanMove(e) {
        const s = this._state;
        if (!s.isPanning) return;
        e.preventDefault?.();

        // Delta dari posisi awal drag (bukan incremental) — tidak ada drift
        const dx = (e.clientX ?? e.pageX) - s.startX;
        const dy = (e.clientY ?? e.pageY) - s.startY;
        s.panX   = s.panStartX + dx;
        s.panY   = s.panStartY + dy;

        this._clampPan();
        this._applyTransform();
    }

    _onPanEnd() {
        if (!this._state.isPanning) return;
        this._state.isPanning = false;
        this._dom.container.style.cursor = 'grab';
    }

    /**
     * ── WHEEL / TRACKPAD ────────────────────────────────────────
     *
     * ctrlKey (termasuk pinch gesture MacBook) → ZOOM ke center viewport
     * tanpa ctrl → PAN (deltaX = horizontal, deltaY = vertikal)
     *
     * Unified untuk PDF dan Image — keduanya pakai panX/panY transform.
     * Page indicator di-update otomatis via _applyTransform.
     */
    _onWheel(e) {
        e.preventDefault();

        if (e.ctrlKey) {
            // ── ZOOM PROPORSIONAL ──────────────────────────────────
            // factor 0.004: deltaY~20 (cepat) → ~8%; deltaY~2 (pelan) → ~0.8%
            const factor  = 0.004;
            const newZoom = Math.min(
                Math.max(this.config.zoomMin, this._state.zoomLevel * (1 - e.deltaY * factor)),
                this.config.zoomMax
            );
            this._applyZoomToCenter(newZoom);

        } else {
            // ── PAN ─────────────────────────────────────────────────
            // Throttle ~60fps
            const now = Date.now();
            if (now - this._state._lastWheel < 16) return;
            this._state._lastWheel = now;

            this._state.panX -= e.deltaX;
            this._state.panY -= e.deltaY;
            this._clampPan();
            this._applyTransform();
        }
    }


    /* ============================================================
       PRIVATE — CUSTOM SCROLLBARS
       Synced with panX / panY transform — works with overflow:hidden
    ============================================================ */

    /**
     * Recalculate and reposition scrollbar thumbs based on current pan + zoom.
     * Called every time _applyTransform runs.
     */
    _updateScrollbars() {
        const s  = this._state;
        const c  = this._dom.container;
        const v  = this._dom.viewer;
        if (!c || !v || !this._dom.sbV) return;

        const cw = c.clientWidth;
        const ch = c.clientHeight;
        const vw = v.offsetWidth  * s.zoomLevel;
        const vh = v.offsetHeight * s.zoomLevel;

        // ── VERTICAL SCROLLBAR ─────────────────────────────────
        if (vh > ch + 2) {
            this._dom.sbV.style.display = 'block';
            const trackH  = ch - 8;
            const thumbH  = Math.max(32, trackH * (ch / vh));
            const minPan  = ch - vh;
            const range   = -minPan;                    // always positive
            const ratio   = range > 0 ? (-s.panY / range) : 0;
            const thumbY  = 4 + Math.max(0, Math.min(1, ratio)) * (trackH - thumbH);

            this._dom.sbVThumb.style.height = thumbH + 'px';
            this._dom.sbVThumb.style.top    = thumbY  + 'px';
        } else {
            this._dom.sbV.style.display = 'none';
        }

        // ── HORIZONTAL SCROLLBAR ───────────────────────────────
        if (vw > cw + 2) {
            this._dom.sbH.style.display = 'block';
            const trackW  = cw - 8;
            const thumbW  = Math.max(32, trackW * (cw / vw));
            const minPan  = cw - vw;
            const range   = -minPan;
            const ratio   = range > 0 ? (-s.panX / range) : 0;
            const thumbX  = 4 + Math.max(0, Math.min(1, ratio)) * (trackW - thumbW);

            this._dom.sbHThumb.style.width = thumbW + 'px';
            this._dom.sbHThumb.style.left  = thumbX  + 'px';
        } else {
            this._dom.sbH.style.display = 'none';
        }

        // Flash scrollbar visible briefly then fade
        this._flashScrollbar();
    }

    /** Show scrollbar briefly then let it fade via CSS */
    _flashScrollbar() {
        [this._dom.sbV, this._dom.sbH].forEach(sb => {
            if (!sb || sb.style.display === 'none') return;
            sb.classList.add('active');
            clearTimeout(sb.__fadeTimer);
            sb.__fadeTimer = setTimeout(() => sb.classList.remove('active'), 1200);
        });
    }

    /**
     * Drag-to-scroll on the custom scrollbar thumbs.
     */
    _initScrollbarDrag() {
        this._bindThumbDrag(
            this._dom.sbVThumb,
            // onDrag: convert thumb movement → panY
            (startPan, startPos, currentPos) => {
                const s      = this._state;
                const c      = this._dom.container;
                const v      = this._dom.viewer;
                const ch     = c.clientHeight;
                const vh     = v.offsetHeight * s.zoomLevel;
                const trackH = ch - 8;
                const thumbH = Math.max(32, trackH * (ch / vh));
                const scrollRange = vh - ch;
                const thumbRange  = trackH - thumbH;
                if (thumbRange <= 0) return;

                const dy      = currentPos - startPos;
                const ratio   = dy / thumbRange;
                s.panY        = startPan - ratio * scrollRange;
                this._clampPan();
                this._applyTransform();
            },
            'vertical'
        );

        this._bindThumbDrag(
            this._dom.sbHThumb,
            (startPan, startPos, currentPos) => {
                const s      = this._state;
                const c      = this._dom.container;
                const v      = this._dom.viewer;
                const cw     = c.clientWidth;
                const vw     = v.offsetWidth * s.zoomLevel;
                const trackW = cw - 8;
                const thumbW = Math.max(32, trackW * (cw / vw));
                const scrollRange = vw - cw;
                const thumbRange  = trackW - thumbW;
                if (thumbRange <= 0) return;

                const dx      = currentPos - startPos;
                const ratio   = dx / thumbRange;
                s.panX        = startPan - ratio * scrollRange;
                this._clampPan();
                this._applyTransform();
            },
            'horizontal'
        );
    }

    _bindThumbDrag(thumb, onDrag, axis) {
        if (!thumb) return;
        let startPan = 0, startPos = 0, dragging = false;

        const onDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            startPan = axis === 'vertical' ? this._state.panY : this._state.panX;
            startPos = axis === 'vertical'
                ? (e.clientY ?? e.touches?.[0]?.clientY ?? 0)
                : (e.clientX ?? e.touches?.[0]?.clientX ?? 0);
            thumb.classList.add('dragging');
            document.body.style.userSelect = 'none';
        };

        const onMove = (e) => {
            if (!dragging) return;
            const pos = axis === 'vertical'
                ? (e.clientY ?? e.touches?.[0]?.clientY ?? 0)
                : (e.clientX ?? e.touches?.[0]?.clientX ?? 0);
            onDrag(startPan, startPos, pos);
        };

        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            thumb.classList.remove('dragging');
            document.body.style.userSelect = '';
        };

        thumb.addEventListener('mousedown',  onDown);
        thumb.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('mousemove',  onMove);
        document.addEventListener('touchmove',  onMove, { passive: true });
        document.addEventListener('mouseup',    onUp);
        document.addEventListener('touchend',   onUp);
    }


    /* ============================================================
       PRIVATE — UTILS
    ============================================================ */
    // Satu pintu: kalau MTQ_CONFIG global ada (dipakai di dalam proyek
    // MTQ 2026) dan LOGGER_ENABLED=false, logger komponen ini ikut
    // senyap — terlepas dari nilai this.config.debug per-instance.
    // Kalau MTQ_CONFIG tidak ada (dipakai standalone di proyek lain,
    // lihat komentar di document-previewer.config.js), fallback ke
    // this.config.debug seperti semula supaya komponen ini tetap
    // portable di luar proyek MTQ 2026.
    _log(...a) {
        const masterOn = (typeof MTQ_CONFIG === 'undefined' || MTQ_CONFIG.LOGGER_ENABLED !== false);
        if (this.config.debug && masterOn) console.log('[DocumentPreviewer]', ...a);
    }
}


/* ================================================================
   DEFAULT CONFIG
================================================================ */
DocumentPreviewer.defaultConfig = {
    googleDriveApiKey : '',
    modalId           : 'dp-modal',
    zoomStep          : 0.25,
    zoomMin           : 0.25,
    zoomMax           : 5.0,
    wheelZoomStep     : 0.1,
    pdfScale          : 1.5,
    pdfWorkerUrl      : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    pdfCmapUrl        : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    debug             : false,
    onOpen            : null,
    onClose           : null,
    onError           : null
};


/* ================================================================
   EXPORT
================================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentPreviewer;
} else {
    window.DocumentPreviewer = DocumentPreviewer;
}