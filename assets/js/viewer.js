/**
 * viewer.js — Contraplano Flipbook
 */
(function () {
    'use strict';

    const ES_MOVIL = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    document.querySelectorAll('.flipbook-contenedor').forEach(async function (contenedor) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos = window['flipbookData_' + flipbookId];
        if (!datos) return;

        const canvasWrapper = contenedor.querySelector('.flipbook-canvas-wrapper');
        const paginaActualEl = contenedor.querySelector('.flipbook-pagina-actual');
        const btnZoomIn = contenedor.querySelector('.btn-zoom-in');
        const btnZoomOut = contenedor.querySelector('.btn-zoom-out');
        const btnZoomReset = contenedor.querySelector('.btn-zoom-reset');

        const configNumeros = datos.config_numeros || {};

        let pageFlip = null;
        let audioActual = null;
        let zoomActivo = false;
        const ZOOM_AMP = 2.5;
        let zoomCx = 0, zoomCy = 0, panX = 0, panY = 0;

        let flechaIzq = null;
        let flechaDer = null;

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // ── Zoom estilo Paperturn (lupa → click → zoom at point → drag to pan) ──
        function aplicarZoom(animate) {
            var S = ZOOM_AMP;
            var tx = zoomCx * (1 - S) + panX;
            var ty = zoomCy * (1 - S) + panY;
            canvasWrapper.style.transformOrigin = '0 0';
            canvasWrapper.style.transition = animate ? 'transform .25s ease' : 'none';
            canvasWrapper.style.transform = 'matrix(' + S + ',0,0,' + S + ',' + tx + ',' + ty + ')';
        }

        function zoomInAt(cx, cy) {
            zoomActivo = true;
            zoomCx = cx; zoomCy = cy;
            panX = 0; panY = 0;
            aplicarZoom(true);
        }

        function zoomOutReset() {
            zoomActivo = false;
            panX = 0; panY = 0;
            canvasWrapper.style.transition = 'transform .25s ease';
            canvasWrapper.style.transform = 'scale(1)';
            canvasWrapper.style.transformOrigin = '0 0';
        }

        function toggleZoom(e) {
            if (e) e.stopPropagation();
            if (zoomActivo) { zoomOutReset(); }
            else { var r = canvasWrapper.getBoundingClientRect(); zoomInAt(r.width / 2, r.height / 2); }
        }
        function resetZoom() { zoomOutReset(); }

        if (btnZoomIn) btnZoomIn.addEventListener('click', toggleZoom);
        if (btnZoomOut) btnZoomOut.addEventListener('click', toggleZoom);
        if (btnZoomReset) btnZoomReset.addEventListener('click', resetZoom);

        function iniciarZoomDesktop(flipEl) {
            if (!flipEl) return;

            var clickStartX = 0, clickStartY = 0;
            var isDragging = false;
            var dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

            flipEl.style.cursor = 'zoom-in';

            // Bordes: cursor grab (arrastrar hoja), centro: zoom-in
            flipEl.addEventListener('mousemove', function (e) {
                if (zoomActivo || isDragging) return;
                var rect = flipEl.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var w = rect.width;
                flipEl.style.cursor = (x < w * 0.15 || x > w * 0.85) ? 'grab' : 'zoom-in';
            }, true);

            // Capture phase: fires BEFORE .stf__parent blocker
            flipEl.addEventListener('mousedown', function (e) {
                clickStartX = e.clientX;
                clickStartY = e.clientY;
                if (zoomActivo) {
                    isDragging = true;
                    dragStartX = e.clientX;
                    dragStartY = e.clientY;
                    panStartX = panX;
                    panStartY = panY;
                    flipEl.style.cursor = 'grabbing';
                    e.preventDefault();
                }
            }, true);

            // Capture phase on document: pan while zoomed
            document.addEventListener('mousemove', function (e) {
                if (!isDragging || !zoomActivo) return;
                panX = panStartX + (e.clientX - dragStartX);
                panY = panStartY + (e.clientY - dragStartY);
                aplicarZoom(false);
            }, true);

            document.addEventListener('mouseup', function () {
                if (isDragging) {
                    isDragging = false;
                    if (zoomActivo) flipEl.style.cursor = 'grab';
                }
            }, true);

            // Click: bubble phase (click propagates independently of mousedown blocking)
            flipEl.addEventListener('click', function (e) {
                if (e.target.closest('.fb-ov') || e.target.closest('.flipbook-overlay')) return;

                var dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
                if (dist > 5) return;

                if (zoomActivo) {
                    zoomOutReset();
                    flipEl.style.cursor = 'zoom-in';
                    return;
                }

                var rect = flipEl.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var w = rect.width;

                if (x > w * 0.85) {
                    e.stopPropagation();
                    pageFlip.flipNext();
                } else if (x < w * 0.15) {
                    e.stopPropagation();
                    pageFlip.flipPrev();
                } else {
                    var wrapRect = canvasWrapper.getBoundingClientRect();
                    zoomInAt(e.clientX - wrapRect.left, e.clientY - wrapRect.top);
                    flipEl.style.cursor = 'grab';
                }
            });
        }

        function iniciarGestosMovil(flipEl) {
            if (!flipEl) return;
            let lastTap = 0, initDist = 0, initZoom = 1, curZoom = 1;

            flipEl.addEventListener('touchend', function (e) {
                if (e.touches.length > 0) return;
                const now = Date.now();
                if (now - lastTap < 300) {
                    zoomActivo = !zoomActivo;
                    curZoom = zoomActivo ? ZOOM_AMP : 1;
                    canvasWrapper.style.transform = 'scale(' + curZoom + ')';
                    canvasWrapper.style.transformOrigin = 'top center';
                    e.preventDefault();
                }
                lastTap = now;
            }, { passive: false });

            flipEl.addEventListener('touchstart', function (e) {
                if (e.touches.length === 2) {
                    initDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                    initZoom = curZoom; e.preventDefault();
                }
            }, { passive: false });

            flipEl.addEventListener('touchmove', function (e) {
                if (e.touches.length === 2 && initDist > 0) {
                    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                    curZoom = Math.max(1, Math.min(3, initZoom * (dist / initDist)));
                    canvasWrapper.style.transform = 'scale(' + curZoom + ')';
                    canvasWrapper.style.transformOrigin = 'top center';
                    e.preventDefault();
                }
            }, { passive: false });
        }

        // ── Número de página ──────────────────────────────────────────────
        function dibujarNumeroPagina(cv, pag, tot, cfg) {
            if (!cfg || !cfg.mostrar) return;
            const ctx = cv.getContext('2d'), pad = 15, fs = Math.max(cfg.tamanio || 14, cv.width * 0.015), txt = pag + ' / ' + tot;
            ctx.font = 'bold ' + fs + 'px Arial,sans-serif'; ctx.textBaseline = 'bottom';
            const pos = cfg.posicion || 'inferior-derecha'; let x, y;
            if (pos === 'inferior-derecha') { ctx.textAlign = 'right'; x = cv.width - pad; y = cv.height - pad; }
            else if (pos === 'inferior-izquierda') { ctx.textAlign = 'left'; x = pad; y = cv.height - pad; }
            else if (pos === 'inferior-centro') { ctx.textAlign = 'center'; x = cv.width / 2; y = cv.height - pad; }
            else if (pos === 'superior-derecha') { ctx.textAlign = 'right'; x = cv.width - pad; y = pad + fs; }
            else if (pos === 'superior-izquierda') { ctx.textAlign = 'left'; x = pad; y = pad + fs; }
            else if (pos === 'superior-centro') { ctx.textAlign = 'center'; x = cv.width / 2; y = pad + fs; }
            else { ctx.textAlign = 'center'; x = cv.width / 2; y = cv.height / 2 + fs / 2; }
            const mw = ctx.measureText(txt).width, mh = fs + 4; let bx, by;
            if (pos === 'inferior-derecha') { bx = cv.width - mw - pad - 4; by = cv.height - mh - pad; }
            else if (pos === 'inferior-izquierda') { bx = pad - 4; by = cv.height - mh - pad; }
            else if (pos === 'inferior-centro') { bx = cv.width / 2 - mw / 2 - 4; by = cv.height - mh - pad; }
            else if (pos === 'superior-derecha') { bx = cv.width - mw - pad - 4; by = pad - 4; }
            else if (pos === 'superior-izquierda') { bx = pad - 4; by = pad - 4; }
            else if (pos === 'superior-centro') { bx = cv.width / 2 - mw / 2 - 4; by = pad - 4; }
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
            for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr;
        }

        // ── Normalizar datos ──────────────────────────────────────────────
        function normalizarDatos(ov) {
            let d = ov.datos;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
            if (!d || typeof d !== 'object') d = {};

            if (d.x === undefined || d.x === null) d.x = parseFloat(ov.pos_left) || 0;
            if (d.y === undefined || d.y === null) d.y = parseFloat(ov.pos_top) || 0;
            if (d.w === undefined || d.w === null) d.w = parseFloat(ov.ancho) || 10;
            if (d.h === undefined || d.h === null) d.h = parseFloat(ov.alto) || 10;

            return d;
        }

        // ── Inyectar overlays DENTRO de cada página (como el editor) ──
        function inyectarOverlaysEnPagina(pageDiv, numPag, lista) {
            var items = (lista || []).filter(function (o) { return parseInt(o.pagina) === numPag; });
            if (!items.length) return;

            var capa = document.createElement('div');
            capa.className = 'fb-ov-layer';
            capa.style.cssText = 'position:absolute;inset:0;z-index:20;pointer-events:none;';

            items.forEach(function (ov) {
                var d = normalizarDatos(ov);
                var left = parseFloat(d.x) || 0;
                var top = parseFloat(d.y) || 0;
                var ancho = parseFloat(d.w) || 10;
                var alto = parseFloat(d.h) || 10;
                if (ancho < 0.5 || alto < 0.5) return;

                var wrap = document.createElement('div');
                wrap.className = 'flipbook-overlay fb-ov';
                wrap.style.cssText = 'position:absolute;left:' + left + '%;top:' + top + '%;width:' + ancho + '%;height:' + alto + '%;pointer-events:auto;overflow:hidden;border-radius:4px;z-index:25;';

                switch (ov.tipo) {
                    case 'imagen': buildImagen(wrap, d); break;
                    case 'youtube':
                    case 'video': buildYoutube(wrap, d); break;
                    case 'audio': buildAudio(wrap, d); break;
                    case 'link': buildLink(wrap, d); break;
                    case 'presentacion': buildSlide(wrap, d); break;
                }
                capa.appendChild(wrap);
            });

            pageDiv.appendChild(capa);
        }

        try {
            const pdf = await pdfjsLib.getDocument(datos.pdf_url).promise;
            const images = [];

            // Variables para guardar el tamaño real del PDF
            let pdfAnchoReal = 550;
            let pdfAltoReal = 733;

            for (let i = 1; i <= datos.paginas; i++) {
                const page = await pdf.getPage(i);

                // Obtener dimensiones reales de la primera página para mantener la proporción
                if (i === 1) {
                    const vpReal = page.getViewport({ scale: 1 });
                    pdfAnchoReal = vpReal.width;
                    pdfAltoReal = vpReal.height;
                }

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

            // ── Crear divs de página con overlays embebidos (como el editor) ──
            var W = Math.round(pdfAnchoReal * 1.5);
            var H = Math.round(pdfAltoReal * 1.5);
            var pageDivs = [];
            for (var pi = 0; pi < images.length; pi++) {
                var pageDiv = document.createElement('div');
                pageDiv.className = 'fb-page-item';
                pageDiv.style.cssText = 'width:' + W + 'px;height:' + H + 'px;overflow:hidden;position:relative;background:#fff;';
                var img = document.createElement('img');
                img.src = images[pi];
                img.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
                pageDiv.appendChild(img);
                // Inyectar overlays de esta página DENTRO del div
                inyectarOverlaysEnPagina(pageDiv, pi + 1, datos.overlays);
                pageDivs.push(pageDiv);
            }

            const targetDiv = document.createElement('div');
            targetDiv.id = 'flip-target-' + flipbookId;
            canvasWrapper.innerHTML = '';
            // Agregar pageDivs al target antes de StPageFlip
            pageDivs.forEach(function (pd) { targetDiv.appendChild(pd); });
            canvasWrapper.appendChild(targetDiv);

            // ── Flechas flotantes y Fullscreen ─────────────────────────────
            flechaIzq = document.createElement('button');
            flechaIzq.className = 'fb-flecha fb-flecha-izq';
            flechaIzq.innerHTML = '&#8249;';

            flechaDer = document.createElement('button');
            flechaDer.className = 'fb-flecha fb-flecha-der';
            flechaDer.innerHTML = '&#8250;';

            canvasWrapper.appendChild(flechaIzq);
            canvasWrapper.appendChild(flechaDer);

            // En móvil ocultar flechas — se pasa página arrastrando con el dedo
            if (ES_MOVIL) {
                flechaIzq.style.display = 'none';
                flechaDer.style.display = 'none';
            }

            const btnFsFlotante = document.createElement('button');
            btnFsFlotante.className = 'fb-btn-fs-flotante';
            btnFsFlotante.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg> Full screen';
            btnFsFlotante.style.opacity = '0';
            btnFsFlotante.style.transition = 'opacity .3s';
            canvasWrapper.appendChild(btnFsFlotante);

            // Solo mostrar el botón fullscreen cuando el mouse está sobre el flipbook
            if (!ES_MOVIL) {
                contenedor.addEventListener('mouseenter', function () {
                    btnFsFlotante.style.opacity = '1';
                });
                contenedor.addEventListener('mouseleave', function () {
                    btnFsFlotante.style.opacity = '0';
                });
            } else {
                btnFsFlotante.style.opacity = '1';
            }

            btnFsFlotante.addEventListener('click', function () {
                if (!document.fullscreenElement) contenedor.requestFullscreen().catch(function () { });
                else document.exitFullscreen();
            });

            // Ya no necesitamos capa flotante de overlays — están embebidos en cada página

            const target = document.getElementById('flip-target-' + flipbookId);

            // ── Dimensiones móvil: calcular tamaño real basado en viewport ──
            var mobileW = 0, mobileH = 0;
            // AHORA USAMOS LA PROPORCIÓN REAL DEL PDF
            var PAGE_RATIO = pdfAltoReal / pdfAnchoReal;

            if (ES_MOVIL) {
                // Dejamos un poco más de margen lateral (40px en total) para que respire
                mobileW = window.innerWidth - 40;
                mobileH = Math.round(mobileW * PAGE_RATIO);

                // Limitamos la altura máxima al 75% de la pantalla para dejar espacio arriba/abajo
                var maxH = window.innerHeight * 0.75;
                if (mobileH > maxH) {
                    mobileH = Math.round(maxH);
                    mobileW = Math.round(mobileH / PAGE_RATIO);
                }

                target.style.width = mobileW + 'px';
                target.style.height = mobileH + 'px';
                target.style.margin = '0 auto';
                canvasWrapper.style.height = (window.innerHeight * 0.85) + 'px'; // Forzamos altura al contenedor
                canvasWrapper.style.padding = '0';
                contenedor.style.height = 'auto';
                void target.offsetWidth;
            }

            pageFlip = new St.PageFlip(target, {
                width: ES_MOVIL ? mobileW : pdfAnchoReal,
                height: ES_MOVIL ? mobileH : pdfAltoReal,
                maxWidth: ES_MOVIL ? mobileW : 2000,
                maxHeight: ES_MOVIL ? mobileH : 2000,
                size: ES_MOVIL ? 'fixed' : 'stretch',
                showCover: true,
                maxShadowOpacity: 0.5,
                mobileScrollSupport: false,
                usePortrait: ES_MOVIL,
                swipeDistance: ES_MOVIL ? 15 : 9999,
                clickEventForward: false,
                disableFlipByClick: true,
                flippingTime: 400,
            });

            pageFlip.loadFromHTML(targetDiv.querySelectorAll('.fb-page-item'));

            // Drag-flip SÍ, corner fold NO.
            // mousedown: pasa a StPageFlip para que inicie drag (bloquear solo si zoom)
            // mousemove sin botón: bloquear (evita corner fold hover)
            // mousemove con botón: pasar (la hoja sigue el cursor)
            setTimeout(function () {
                var stfParent = canvasWrapper.querySelector('.stf__parent');
                if (stfParent && !ES_MOVIL) {
                    var mouseDown = false;

                    stfParent.addEventListener('mousedown', function (e) {
                        mouseDown = true;
                        if (zoomActivo) e.stopImmediatePropagation();
                    }, true);

                    document.addEventListener('mouseup', function () {
                        mouseDown = false;
                    }, true);

                    stfParent.addEventListener('mousemove', function (e) {
                        if (!mouseDown || zoomActivo) {
                            e.stopImmediatePropagation();
                        }
                    }, true);
                }
            }, 100);

            // ── Móvil: completar flip al arrastrar 33% del ancho ──
            if (ES_MOVIL) {
                setTimeout(function () {
                    var stfEl = canvasWrapper.querySelector('.stf__parent');
                    if (!stfEl) return;
                    var touchStartX = 0;
                    var pageW = mobileW || stfEl.offsetWidth;

                    stfEl.addEventListener('touchstart', function (e) {
                        if (e.touches.length === 1) {
                            touchStartX = e.touches[0].clientX;
                        }
                    }, { passive: true });

                    stfEl.addEventListener('touchend', function (e) {
                        if (e.changedTouches.length === 0) return;
                        var dx = e.changedTouches[0].clientX - touchStartX;
                        var umbral = pageW * 0.33;
                        if (Math.abs(dx) >= umbral) {
                            if (dx < 0) pageFlip.flipNext();
                            else pageFlip.flipPrev();
                        }
                    }, { passive: true });
                }, 200);
            }

            function pausarAudios() {
                targetDiv.querySelectorAll('audio').forEach(function (a) { a.pause(); });
                if (audioActual) { audioActual.pause(); audioActual = null; }
            }

            pageFlip.on('flip', (e) => {
                if (zoomActivo) zoomOutReset();
                pausarAudios();
                const numLeft = e.data + 1;
                if (paginaActualEl) paginaActualEl.textContent = numLeft;

                flechaIzq.style.opacity = (e.data === 0) ? '0.25' : '';
                flechaIzq.style.pointerEvents = (e.data === 0) ? 'none' : '';
                flechaDer.style.opacity = (e.data >= datos.paginas - 1) ? '0.25' : '';
                flechaDer.style.pointerEvents = (e.data >= datos.paginas - 1) ? 'none' : '';

                contenedor.classList.toggle('en-portada', e.data === 0);
                contenedor.classList.toggle('en-contraportada', e.data >= datos.paginas - 1);
            });

            pageFlip.on('changeState', (e) => {
                if (e.data === 'user_fold' || e.data === 'flipping') {
                    pausarAudios();
                    contenedor.classList.remove('en-portada', 'en-contraportada');
                    if (zoomActivo) zoomOutReset();
                }
                if (e.data === 'read') {
                    var idx = pageFlip.getCurrentPageIndex();
                    contenedor.classList.toggle('en-portada', idx === 0);
                    contenedor.classList.toggle('en-contraportada', idx >= datos.paginas - 1);
                }
            });

            flechaIzq.addEventListener('click', function () { pausarAudios(); if (pageFlip) pageFlip.flipPrev(); });
            flechaDer.addEventListener('click', function () { pausarAudios(); if (pageFlip) pageFlip.flipNext(); });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') pageFlip.flipPrev();
                if (e.key === 'ArrowRight') pageFlip.flipNext();
            });

            flechaIzq.style.opacity = '0.25';
            flechaIzq.style.pointerEvents = 'none';

            setTimeout(() => {
                contenedor.classList.add('en-portada');
            }, 500);

            if (!ES_MOVIL) iniciarZoomDesktop(target);
            else iniciarGestosMovil(target);

        } catch (e) { console.error('Error al cargar flipbook:', e); }

        // (Overlays embebidos en páginas — no se necesita ajustarCapaOverlays ni renderizarContenidoMultimedia)

        // ── Builders ─────────────────────────────────────────────────────
        function buildAudio(wrap, d) {
            const iconColor = (d.iconColor && d.iconColor !== 'undefined') ? d.iconColor : '#ffffff';
            const playPath = 'M8 5v14l11-7z', pausePath = 'M7 5h3v14H7zm7 0h3v14h-3z';
            wrap.style.cssText += ';display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(255,255,255,.45);';
            const audio = document.createElement('audio');
            audio.src = d.url || ''; audio.preload = 'auto';
            audio.style.display = 'none';
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

    });
})();