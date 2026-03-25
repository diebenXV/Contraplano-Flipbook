(function () {
    'use strict';

    const ES_MOVIL = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    document.querySelectorAll('.flipbook-contenedor').forEach(async function (contenedor) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos = window['flipbookData_' + flipbookId];
        if (!datos) return;

        const canvasWrapper = contenedor.querySelector('.flipbook-canvas-wrapper');
        let capaOverlays = contenedor.querySelector('.flipbook-overlays');
        const paginaActualEl = contenedor.querySelector('.flipbook-pagina-actual');
        const btnAnt = contenedor.querySelector('.flipbook-anterior');
        const btnSig = contenedor.querySelector('.flipbook-siguiente');
        const btnZoomIn = contenedor.querySelector('.btn-zoom-in');
        const btnZoomOut = contenedor.querySelector('.btn-zoom-out');
        const btnZoomReset = contenedor.querySelector('.btn-zoom-reset');
        const btnFullscreen = contenedor.querySelector('.btn-fullscreen');
        const zoomViewport = contenedor.querySelector('.flipbook-zoom-viewport');

        const configNumeros = datos.config_numeros || {};

        let pageFlip = null;
        let audioActual = null;
        let zoomLevel = 1;
        const ZOOM_MIN = 1;
        const ZOOM_MAX = 3;
        const ZOOM_STEP = 0.4;

        // ── PDF.js ────────────────────────────────────────────────────────
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // ── Zoom ──────────────────────────────────────────────────────────
        function aplicarZoom(nivel) {
            zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nivel));
            const target = zoomViewport || canvasWrapper;
            if (target) {
                target.style.transform = 'scale(' + zoomLevel + ')';
                target.style.transformOrigin = 'top center';
            }
        }

        function iniciarZoomDesktop(flipEl) {
            if (!flipEl) return;
            let lastClick = 0;
            flipEl.addEventListener('click', function (e) {
                if (e.target.closest('.fb-ov') || e.target.closest('.flipbook-overlay')) return;
                const now = Date.now();
                if (now - lastClick < 300) {
                    aplicarZoom(ZOOM_MIN);
                } else {
                    aplicarZoom(zoomLevel >= ZOOM_MAX ? ZOOM_MIN : zoomLevel + ZOOM_STEP);
                }
                lastClick = now;
            });
        }

        function iniciarGestosMovil(flipEl) {
            if (!flipEl) return;
            let lastTap = 0, initDist = 0, initZoom = 1;

            flipEl.addEventListener('touchend', function (e) {
                if (e.touches.length > 0) return;
                const now = Date.now();
                if (now - lastTap < 300) {
                    aplicarZoom(zoomLevel > ZOOM_MIN + 0.1 ? ZOOM_MIN : ZOOM_MIN + ZOOM_STEP * 2);
                    e.preventDefault();
                }
                lastTap = now;
            }, { passive: false });

            flipEl.addEventListener('touchstart', function (e) {
                if (e.touches.length === 2) {
                    initDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    initZoom = zoomLevel;
                    e.preventDefault();
                }
            }, { passive: false });

            flipEl.addEventListener('touchmove', function (e) {
                if (e.touches.length === 2 && initDist > 0) {
                    const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    aplicarZoom(initZoom * (dist / initDist));
                    e.preventDefault();
                }
            }, { passive: false });

            flipEl.addEventListener('touchend', function (e) {
                if (e.touches.length < 2) initDist = 0;
            });
        }

        // ── Botones de zoom ───────────────────────────────────────────────
        if (btnZoomIn)    btnZoomIn.addEventListener('click',    function () { aplicarZoom(zoomLevel + ZOOM_STEP); });
        if (btnZoomOut)   btnZoomOut.addEventListener('click',   function () { aplicarZoom(zoomLevel - ZOOM_STEP); });
        if (btnZoomReset) btnZoomReset.addEventListener('click', function () { aplicarZoom(ZOOM_MIN); });

        // ── Pantalla completa ─────────────────────────────────────────────
        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', function () {
                if (!document.fullscreenElement) {
                    contenedor.requestFullscreen().catch(function () {});
                } else {
                    document.exitFullscreen();
                }
            });
        }

        // ── Número de página ──────────────────────────────────────────────
        function dibujarNumeroPagina(cv, pag, tot, cfg) {
            if (!cfg || !cfg.mostrar) return;
            const ctx = cv.getContext('2d'), pad = 15, fs = Math.max(cfg.tamanio || 14, cv.width * 0.015), txt = pag + ' / ' + tot;
            ctx.font = 'bold ' + fs + 'px Arial,sans-serif'; ctx.textBaseline = 'bottom';
            const pos = cfg.posicion || 'inferior-derecha'; let x, y;
            if      (pos === 'inferior-derecha')   { ctx.textAlign = 'right';  x = cv.width - pad; y = cv.height - pad; }
            else if (pos === 'inferior-izquierda') { ctx.textAlign = 'left';   x = pad;            y = cv.height - pad; }
            else if (pos === 'inferior-centro')    { ctx.textAlign = 'center'; x = cv.width / 2;   y = cv.height - pad; }
            else if (pos === 'superior-derecha')   { ctx.textAlign = 'right';  x = cv.width - pad; y = pad + fs; }
            else if (pos === 'superior-izquierda') { ctx.textAlign = 'left';   x = pad;            y = pad + fs; }
            else if (pos === 'superior-centro')    { ctx.textAlign = 'center'; x = cv.width / 2;   y = pad + fs; }
            else { ctx.textAlign = 'center'; x = cv.width / 2; y = cv.height / 2 + fs / 2; }
            const mw = ctx.measureText(txt).width, mh = fs + 4; let bx, by;
            if      (pos === 'inferior-derecha')   { bx = cv.width - mw - pad - 4; by = cv.height - mh - pad; }
            else if (pos === 'inferior-izquierda') { bx = pad - 4;                 by = cv.height - mh - pad; }
            else if (pos === 'inferior-centro')    { bx = cv.width / 2 - mw / 2 - 4; by = cv.height - mh - pad; }
            else if (pos === 'superior-derecha')   { bx = cv.width - mw - pad - 4; by = pad - 4; }
            else if (pos === 'superior-izquierda') { bx = pad - 4;                 by = pad - 4; }
            else if (pos === 'superior-centro')    { bx = cv.width / 2 - mw / 2 - 4; by = pad - 4; }
            else { bx = cv.width / 2 - mw / 2 - 4; by = cv.height / 2 - mh / 2; }
            const rgb = hexRgb(cfg.colorFondo || '#FFFFFF');
            ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (cfg.opacidadFondo || 0.8) + ')';
            ctx.fillRect(bx, by, mw + 8, mh + 4);
            ctx.fillStyle = cfg.colorNumero || '#666666';
            ctx.fillText(txt, x, y);
        }

        function hexRgb(h) {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
            return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 102, g: 102, b: 102 };
        }

        function mezclar(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        // ── Normalizar datos del overlay ──────────────────────────────────
        // El shortcode hace array_merge añadiendo x,y,w,h a los datos del overlay.
        // Esta función garantiza que siempre tengamos x,y,w,h disponibles en d,
        // tomándolos del nivel raíz del overlay si no están en datos.
        function normalizarDatos(ov) {
            let d = ov.datos;
            if (typeof d === 'string') {
                try { d = JSON.parse(d); } catch (e) { d = {}; }
            }
            if (!d || typeof d !== 'object') d = {};

            if (d.x === undefined || d.x === null) d.x = parseFloat(ov.pos_left) || 0;
            if (d.y === undefined || d.y === null) d.y = parseFloat(ov.pos_top)  || 0;
            if (d.w === undefined || d.w === null) d.w = parseFloat(ov.ancho)    || 10;
            if (d.h === undefined || d.h === null) d.h = parseFloat(ov.alto)     || 10;

            return d;
        }

        try {
            const pdf = await pdfjsLib.getDocument(datos.pdf_url).promise;
            const images = [];

            // Renderizar páginas
            for (let i = 1; i <= datos.paginas; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                if (configNumeros && configNumeros.mostrar !== false) {
                    dibujarNumeroPagina(canvas, i, datos.paginas, configNumeros);
                }
                images.push(canvas.toDataURL('image/jpeg', 0.8));
            }

            // Limpiar wrapper y crear target para PageFlip
            const targetDiv = document.createElement('div');
            targetDiv.id = 'flip-target-' + flipbookId;
            canvasWrapper.innerHTML = '';
            canvasWrapper.appendChild(targetDiv);

            // Recrear capa de overlays
            const nuevaCapaOverlays = document.createElement('div');
            nuevaCapaOverlays.className = 'flipbook-overlays';
            nuevaCapaOverlays.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; pointer-events:none;';
            canvasWrapper.appendChild(nuevaCapaOverlays);
            capaOverlays = nuevaCapaOverlays;

            const target = document.getElementById('flip-target-' + flipbookId);

            // Inicializar PageFlip
            // showCover:true  → portada centrada sola al inicio
            // usePortrait     → en móvil muestra 1 página a la vez
            pageFlip = new St.PageFlip(target, {
                width: 550,
                height: 733,
                size: 'stretch',
                showCover: true,
                maxShadowOpacity: 0.5,
                mobileScrollSupport: false,
                usePortrait: ES_MOVIL,
                swipeDistance: ES_MOVIL ? 30 : 9999,
                clickEventForward: false,
                disableFlipByClick: true,
            });

            pageFlip.loadFromImages(images);

            // Limpiar overlays inmediatamente — antes del giro
            function limpiarOverlays() {
                capaOverlays.querySelectorAll('audio').forEach(a => a.pause());
                capaOverlays.innerHTML = '';
                if (audioActual) { audioActual.pause(); audioActual = null; }
            }

            // Evento flip — se dispara al TERMINAR la animacion -> mostrar nuevos overlays
            pageFlip.on('flip', (e) => {
                const numLeft = e.data + 1;
                if (paginaActualEl) paginaActualEl.textContent = numLeft;

                const inputPag = contenedor.querySelector('.flipbook-input-pagina');
                if (inputPag) inputPag.value = numLeft;

                const visibles = ES_MOVIL ? [numLeft] : [numLeft, numLeft + 1];
                renderizarContenidoMultimedia(visibles, datos.overlays);
                setTimeout(ajustarCapaOverlays, 60);
            });

            // Cuando el usuario EMPIEZA a arrastrar la pagina con el mouse/dedo,
            // limpiar overlays inmediatamente para que no floten sobre la animacion
            pageFlip.on('changeState', (e) => {
                // 'user_fold' = usuario arrastrando, 'flipping' = animacion automatica
                if (e.data === 'user_fold' || e.data === 'flipping') {
                    limpiarOverlays();
                }
            });

            // Navegacion — limpiar overlays ANTES del giro
            if (btnAnt) btnAnt.addEventListener('click', function () { limpiarOverlays(); if (pageFlip) pageFlip.flipPrev(); });
            if (btnSig) btnSig.addEventListener('click', function () { limpiarOverlays(); if (pageFlip) pageFlip.flipNext(); });

            const btnInicio = contenedor.querySelector('.flipbook-inicio');
            if (btnInicio) btnInicio.onclick = () => pageFlip.flip(0);

            const btnFin = contenedor.querySelector('.flipbook-fin');
            if (btnFin) btnFin.onclick = () => pageFlip.flip(datos.paginas - 1);

            const inputPagina = contenedor.querySelector('.flipbook-input-pagina');
            if (inputPagina) {
                inputPagina.onchange = (e) => {
                    let p = parseInt(e.target.value);
                    if (!isNaN(p) && p > 0 && p <= datos.paginas) {
                        pageFlip.flip(p - 1);
                    } else {
                        e.target.value = pageFlip.getCurrentPageIndex() + 1;
                    }
                };
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft')  pageFlip.flipPrev();
                if (e.key === 'ArrowRight') pageFlip.flipNext();
            });

            // Render inicial de overlays
            setTimeout(() => {
                // Página 1 = portada centrada sola (showCover:true)
                renderizarContenidoMultimedia([1], datos.overlays);
                ajustarCapaOverlays();
            }, 500);

            // Iniciar gestos de zoom
            if (!ES_MOVIL) {
                iniciarZoomDesktop(target);
            } else {
                iniciarGestosMovil(target);
            }

        } catch (e) { console.error('Error al cargar flipbook:', e); }

        // ── Resize ────────────────────────────────────────────────────────
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(ajustarCapaOverlays, 200);
        });

        function ajustarCapaOverlays() {
            // PageFlip genera un wrapper interno — buscar por ambas posibles clases
            const bookElement = canvasWrapper.querySelector('.stf__parent') || canvasWrapper.querySelector('.stPageFlip');
            if (bookElement && capaOverlays) {
                capaOverlays.style.left   = bookElement.offsetLeft + 'px';
                capaOverlays.style.top    = bookElement.offsetTop  + 'px';
                capaOverlays.style.width  = bookElement.offsetWidth  + 'px';
                capaOverlays.style.height = bookElement.offsetHeight + 'px';
            }
        }

        // ── Renderizar overlays ───────────────────────────────────────────
        function renderizarContenidoMultimedia(paginas, lista) {
            capaOverlays.querySelectorAll('audio').forEach(a => a.pause());
            capaOverlays.innerHTML = '';
            if (audioActual) { audioActual.pause(); audioActual = null; }

            if (!Array.isArray(paginas)) paginas = [paginas];

            const bookElement = canvasWrapper.querySelector('.stf__parent') || canvasWrapper.querySelector('.stPageFlip');
            let spreadW = 550, H = 733;
            if (bookElement && bookElement.offsetWidth > 0) {
                spreadW = bookElement.offsetWidth;
                H = bookElement.offsetHeight;
            }

            // En móvil o cuando hay 1 sola página visible, el ancho de página = spreadW
            const pageWidth = (ES_MOVIL || paginas.length === 1) ? spreadW : spreadW / 2;

            const items = lista ? lista.filter(o => paginas.includes(parseInt(o.pagina))) : [];

            items.forEach(ov => {
                const pageNum = parseInt(ov.pagina);
                const d = normalizarDatos(ov);

                let leftPercent   = parseFloat(d.x) || 0;
                let topPercent    = parseFloat(d.y) || 0;
                let widthPercent  = parseFloat(d.w) || 10;
                let heightPercent = parseFloat(d.h) || 10;

                let leftPx    = (leftPercent   / 100) * pageWidth;
                let topPx     = (topPercent    / 100) * H;
                const anchoPx = (widthPercent  / 100) * pageWidth;
                const altoPx  = (heightPercent / 100) * H;

                // En desktop con spread de 2 páginas:
                // La primera página del par va a la izquierda (sin offset)
                // La segunda va a la derecha (offset + pageWidth)
                if (!ES_MOVIL && paginas.length === 2 && pageNum !== paginas[0]) {
                    leftPx = pageWidth + leftPx;
                }

                const div = document.createElement('div');
                div.className = 'flipbook-overlay fb-ov';
                div.style.cssText = `position:absolute; left:${leftPx}px; top:${topPx}px; width:${anchoPx}px; height:${altoPx}px; pointer-events:auto; overflow:hidden; border-radius:4px;`;

                switch (ov.tipo) {
                    case 'imagen':      buildImagen(div, d);   break;
                    case 'youtube':
                    case 'video':       buildYoutube(div, d);  break;
                    case 'audio':       buildAudio(div, d);    break;
                    case 'link':        buildLink(div, d);     break;
                    case 'presentacion':buildSlide(div, d);    break;
                }

                capaOverlays.appendChild(div);
            });
        }

        // ── Builders ─────────────────────────────────────────────────────
        function buildAudio(wrap, d) {
            const iconColor = (d.iconColor && d.iconColor !== 'undefined') ? d.iconColor : '#ffffff';
            const playPath  = 'M8 5v14l11-7z';
            const pausePath = 'M7 5h3v14H7zm7 0h3v14h-3z';
            wrap.style.cssText += ';display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(255,255,255,.45);';
            const audio = document.createElement('audio');
            audio.src = d.url || ''; audio.preload = 'auto';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', iconColor);
            svg.setAttribute('width', '55%'); svg.setAttribute('height', '55%');
            svg.style.pointerEvents = 'none';
            svg.innerHTML = '<path d="' + playPath + '"/>';
            let playing = false;
            wrap.appendChild(audio); wrap.appendChild(svg);
            wrap.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (audioActual && audioActual !== audio) { audioActual.pause(); }
                if (playing) {
                    audio.pause();
                    wrap.style.background = 'transparent'; wrap.style.borderColor = 'rgba(255,255,255,.45)';
                    svg.innerHTML = '<path d="' + playPath + '"/>'; playing = false; audioActual = null;
                } else {
                    audio.play().then(function () {
                        audioActual = audio;
                        wrap.style.background = 'rgba(0,0,0,.25)'; wrap.style.borderColor = 'rgba(255,255,255,.95)';
                        svg.innerHTML = '<path d="' + pausePath + '"/>'; playing = true;
                    }).catch(function () { playing = false; });
                }
            });
            audio.addEventListener('ended', function () {
                playing = false;
                wrap.style.background = 'transparent'; wrap.style.borderColor = 'rgba(255,255,255,.45)';
                svg.innerHTML = '<path d="' + playPath + '"/>'; audioActual = null;
            });
        }

        function buildYoutube(wrap, d) {
            const videoId = d.videoId || extraerIdYoutube(d.url || '');
            if (!videoId) return;
            const p = new URLSearchParams({
                autoplay: d.autoplay || 0,
                controls: d.controles !== undefined ? d.controles : 1,
                mute: d.silencio || 0,
                loop: d.loop || 0,
                start: d.inicio || 0,
                playlist: videoId
            });
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.youtube.com/embed/' + videoId + '?' + p;
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
            iframe.allowFullscreen = true;
            wrap.appendChild(iframe);
        }

        function buildImagen(wrap, d) {
            const img = document.createElement('img');
            img.src = d.url || '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
            wrap.appendChild(img);
        }

        function buildSlide(wrap, d) {
            const imgs = d.imagenes || []; if (!imgs.length) return;
            wrap.style.position = 'relative';
            const dur = (parseInt(d.duracion) || 3) * 1000;
            let lista = d.aleatorio ? mezclar([...imgs]) : [...imgs]; let idx = 0;
            const inner = document.createElement('div');
            inner.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
            lista.forEach(function (src, i) {
                const s = document.createElement('div');
                s.style.cssText = 'position:absolute;inset:0;background:url(\'' + src + '\') center/cover no-repeat;opacity:' + (i === 0 ? 1 : 0) + ';transition:opacity .5s;';
                inner.appendChild(s);
            });
            wrap.appendChild(inner);
            function mostrar(n) {
                const t = lista.length;
                idx = d.loop ? (((n % t) + t) % t) : Math.max(0, Math.min(n, t - 1));
                Array.from(inner.children).forEach(function (s, i) { s.style.opacity = i === idx ? '1' : '0'; });
            }
            if (d.autoplay) setInterval(function () { mostrar(idx + 1); }, dur);
            if (d.flechas) {
                const bs = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
                const bp = document.createElement('button'); bp.style.cssText = bs + 'left:4px;'; bp.innerHTML = '‹';
                const bn = document.createElement('button'); bn.style.cssText = bs + 'right:4px;'; bn.innerHTML = '›';
                bp.onclick = function (e) { e.stopPropagation(); mostrar(idx - 1); };
                bn.onclick = function (e) { e.stopPropagation(); mostrar(idx + 1); };
                wrap.appendChild(bp); wrap.appendChild(bn);
            }
        }

        function buildLink(wrap, d) {
            const href = d.href || d.url || '';
            wrap.style.cursor = 'pointer';
            if (href.startsWith('pagina:')) {
                const n = parseInt(href.replace('pagina:', ''));
                wrap.style.cssText += ';background:rgba(26,111,207,.18);border:2px solid rgba(26,111,207,.5);border-radius:6px;display:flex;align-items:center;justify-content:center;';
                wrap.title = d.titulo || ('Ir a página ' + n);
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'rgba(26,111,207,0.9)');
                svg.style.cssText = 'width:50%;height:50%;max-width:36px;max-height:36px;pointer-events:none;';
                svg.innerHTML = '<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>';
                wrap.appendChild(svg);
                wrap.onmouseenter = function () { wrap.style.background = 'rgba(26,111,207,.32)'; };
                wrap.onmouseleave = function () { wrap.style.background = 'rgba(26,111,207,.18)'; };
                wrap.onclick = function (e) { e.stopPropagation(); if (pageFlip) pageFlip.flip(Math.max(0, n - 1)); };
            } else if (href) {
                const a = document.createElement('a');
                a.href = href; a.title = d.titulo || href;
                a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
                if (!href.startsWith('mailto:') && !href.startsWith('tel:')) {
                    a.target = '_blank'; a.rel = 'noopener noreferrer';
                }
                wrap.appendChild(a);
            }
        }

        function extraerIdYoutube(url) {
            const m = url.match(/(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }

        window.addEventListener('resize', () => setTimeout(ajustarCapaOverlays, 300));
    });
})();
