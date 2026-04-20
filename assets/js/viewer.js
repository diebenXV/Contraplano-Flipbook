/**
 * viewer.js — Contraplano Flipbook
 *
 * Para depurar audios que no arrancan:
 *   En la consola del navegador ejecuta:  window.__fbDebugAudio = true
 *   Luego navega por el flipbook. Verás logs de cada intento de autoplay.
 *   Para desactivar:  window.__fbDebugAudio = false
 */
(function () {
    'use strict';

    // Helper de log condicional. Sin coste si el flag no está activo.
    function _dbg() {
        if (!window.__fbDebugAudio) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[fb-audio]');
        console.log.apply(console, args);
    }

    const ES_MOVIL = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    document.querySelectorAll('.flipbook-contenedor').forEach(async function (contenedor) {
        // Ocultar el contenido del flipbook (el canvas del libro) mientras carga, sin
        // ocultar el contenedor entero — así el loader que montamos dentro sigue visible.
        // El canvasWrapper se localiza después (línea ~64), pero guardamos una referencia
        // temprana para poder ocultarlo ya.
        var _canvasWrapperInicial = contenedor.querySelector('.flipbook-canvas-wrapper');
        if (_canvasWrapperInicial) {
            _canvasWrapperInicial.style.opacity = '0';
            _canvasWrapperInicial.style.transition = 'opacity .4s ease';
        }
        var _tiempoInicio = Date.now();

        // ── Loader de preparación (INVISIBLE) ──
        // Funcionalmente hace de gatekeeper para el reveal del flipbook: solo cuando
        // todas las precargas terminan (o se cumple el timeout) se muestra el flipbook.
        // PERO no es visible para el usuario — queda a opacity 0 — para no "ensuciar"
        // la vista. El usuario ve fondo transparente/limpio mientras internamente se
        // descargan los audios.
        //
        // Si en el futuro quieres volverlo visible, cambia opacity:0 a opacity:1 abajo
        // (y la transición ya está configurada).
        var _loader = document.createElement('div');
        _loader.className = 'fb-loader';
        _loader.setAttribute('style',
            'position:absolute !important;' +
            'top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;' +
            'z-index:0 !important;' +       // no encima de nada — invisible
            'opacity:0 !important;' +       // invisible
            'visibility:hidden !important;' +
            'pointer-events:none !important;' +
            'display:block !important;'
        );
        // Sin contenido visible.
        _loader.innerHTML = '';

        // Asegurar que el contenedor tenga position:relative (sino el loader absolute
        // se iría al body y no se vería alineado con el flipbook).
        var _posComputed = window.getComputedStyle(contenedor).position;
        if (_posComputed === 'static' || !_posComputed) {
            contenedor.style.position = 'relative';
        }
        // Asegurar altura mínima para que el loader sea visible aunque el contenedor
        // aún no tenga contenido medido.
        if (contenedor.offsetHeight < 100) {
            contenedor.style.minHeight = '90vh';
        }

        contenedor.appendChild(_loader);
        var _loaderProgreso = _loader.querySelector('.fb-loader-progreso');

        function ocultarLoader() {
            if (!_loader) return;
            _loader.style.opacity = '0';
            _loader.style.pointerEvents = 'none';
            // Quitarlo del DOM tras la transición para liberar el z-index.
            setTimeout(function () {
                if (_loader && _loader.parentNode) _loader.parentNode.removeChild(_loader);
                _loader = null;
            }, 400);
        }

        function actualizarLoaderProgreso(actual, total) {
            if (!_loaderProgreso) return;
            if (total > 0) {
                _loaderProgreso.textContent = 'Cargando audios… ' + actual + '/' + total;
            } else {
                _loaderProgreso.textContent = '';
            }
        }

        function mostrarFlipbook() {
            if (_canvasWrapperInicial) _canvasWrapperInicial.style.opacity = '1';
        }

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

        // Ícono parlante (speaker con onda) — estado play (esperando reproducir o reproduciéndose)
        var PLAY_PATH = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
        // Ícono pausa — círculo relleno con dos barras
        var PAUSE_PATH = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z';

        // Referencia a pausarAudios accesible desde los builders (fuera del try)
        let pausarAudiosRef = function () { };
        // Referencia a asegurarPaginasVisibles para renderizar bajo demanda desde builders
        let asegurarPaginasVisiblesRef = function () { return Promise.resolve(); };

        // Cursores personalizados de lupa (16x16, + y línea marcados)
        var CURSOR_ZOOM_IN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='6.5' cy='6.5' r='5.5' fill='white' stroke='%23222' stroke-width='1.5'/%3E%3Cline x1='10.5' y1='10.5' x2='15' y2='15' stroke='%23222' stroke-width='2.5' stroke-linecap='round'/%3E%3Cline x1='4' y1='6.5' x2='9' y2='6.5' stroke='%23222' stroke-width='2' stroke-linecap='round'/%3E%3Cline x1='6.5' y1='4' x2='6.5' y2='9' stroke='%23222' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E\") 6 6, zoom-in";
        var CURSOR_ZOOM_OUT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='6.5' cy='6.5' r='5.5' fill='white' stroke='%23222' stroke-width='1.5'/%3E%3Cline x1='10.5' y1='10.5' x2='15' y2='15' stroke='%23222' stroke-width='2.5' stroke-linecap='round'/%3E%3Cline x1='4' y1='6.5' x2='9' y2='6.5' stroke='%23222' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E\") 6 6, zoom-out";

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
            var stf = flipEl.closest('.stf__parent') || flipEl.parentElement;

            function setCursor(c) { if (stf) stf.style.setProperty('--fb-cursor', c); }
            setCursor(CURSOR_ZOOM_IN);

            document.addEventListener('mousemove', function (e) {
                if (!flipEl._isDragging || !zoomActivo) return;
                panX = flipEl._panStartX + (e.clientX - flipEl._dragStartX);
                panY = flipEl._panStartY + (e.clientY - flipEl._dragStartY);
                aplicarZoom(false);
            }, true);

            document.addEventListener('mouseup', function () {
                if (flipEl._isDragging) {
                    flipEl._isDragging = false;
                    if (zoomActivo) setCursor(CURSOR_ZOOM_OUT);
                }
            }, true);

            // Exponer setCursor para el controlador unificado
            flipEl._setCursor = setCursor;
        }

        function iniciarGestosMovil(flipEl) {
            if (!flipEl) return;
            var lastTap = 0;
            var lastTouchX = 0, lastTouchY = 0;

            // ── Pinch-to-zoom ──
            var pinchStartDist = 0;
            var isPinching = false;
            var pinchCooldown = 0; // timestamp: bloquear eventos después de pinch

            function getTouchDist(t1, t2) {
                return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            }
            function getTouchCenter(t1, t2) {
                return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
            }

            flipEl.addEventListener('touchstart', function (e) {
                // Durante cooldown post-pinch, bloquear todo
                if (Date.now() - pinchCooldown < 400) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                if (e.touches.length === 2) {
                    isPinching = true;
                    pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                if (e.touches.length === 1) {
                    lastTouchX = e.touches[0].clientX;
                    lastTouchY = e.touches[0].clientY;
                }
                if (zoomActivo) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, { passive: false, capture: true });

            flipEl.addEventListener('touchmove', function (e) {
                if (Date.now() - pinchCooldown < 400) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                if (isPinching && e.touches.length === 2) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                if (isPinching || zoomActivo) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }, { passive: false, capture: true });

            flipEl.addEventListener('touchend', function (e) {
                // Durante cooldown post-pinch, bloquear todo
                if (Date.now() - pinchCooldown < 400) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }

                // Detectar fin de pinch
                if (isPinching) {
                    isPinching = false;
                    pinchCooldown = Date.now(); // activar cooldown

                    if (e.changedTouches.length > 0 && e.touches.length <= 1) {
                        var endDist = pinchStartDist;
                        if (e.touches.length === 1 && e.changedTouches.length >= 1) {
                            endDist = getTouchDist(e.touches[0], e.changedTouches[0]);
                        } else if (e.changedTouches.length >= 2) {
                            endDist = getTouchDist(e.changedTouches[0], e.changedTouches[1]);
                        }
                        var ratio = endDist / pinchStartDist;
                        if (ratio > 1.3 && !zoomActivo) {
                            var wrapRect = canvasWrapper.getBoundingClientRect();
                            var cx = lastTouchX - wrapRect.left;
                            var cy = lastTouchY - wrapRect.top;
                            if (e.changedTouches.length >= 2) {
                                var center = getTouchCenter(e.changedTouches[0], e.changedTouches[1]);
                                cx = center.x - wrapRect.left;
                                cy = center.y - wrapRect.top;
                            }
                            zoomInAt(cx, cy);
                        } else if (ratio < 0.7 && zoomActivo) {
                            zoomOutReset();
                        }
                    }
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }

                // Bloquear swipe de StPageFlip cuando hay zoom
                if (zoomActivo) {
                    e.stopPropagation();
                    e.preventDefault();
                }

                // Detectar double-tap
                if (e.touches.length > 0) return;
                var now = Date.now();
                if (now - lastTap < 300) {
                    e.preventDefault();
                    if (zoomActivo) {
                        zoomOutReset();
                    } else {
                        var wrapRect = canvasWrapper.getBoundingClientRect();
                        zoomInAt(lastTouchX - wrapRect.left, lastTouchY - wrapRect.top);
                    }
                    lastTap = 0;
                    return;
                }
                lastTap = now;
            }, { passive: false, capture: true });
        }

        // ── Número de página ──────────────────────────────────────────────
        // Genera un <div> absoluto con el número de página listo para insertarlo encima
        // de la imagen dentro de un .fb-page-item (que tiene position:relative).
        //
        // `pag`      = posición en el flipbook (1-based).
        // `cfg`      = config_numeros global.
        // `divW`     = ancho del .fb-page-item donde se insertará.
        // `anchoRef` = ancho del div que se usa en desktop (referencia para escalar móvil).
        //              En desktop `divW === anchoRef` → escala = 1 (no toca cfg.tamanio).
        //              En móvil `divW < anchoRef` → escala < 1 → fuente proporcionalmente menor.
        //
        // Por qué solo se escala en móvil:
        //   - En desktop, StPageFlip usa `size: 'stretch'` que aplica `transform: scale`
        //     para adaptar el libro al contenedor. Ese transform ya escala automáticamente
        //     cualquier fuente en px, así que cfg.tamanio se ve con el tamaño correcto.
        //   - En móvil, StPageFlip usa `size: 'fixed'` — el div tiene tamaño fijo y no hay
        //     transform. Un cfg.tamanio=14 se renderiza como 14px literales sobre un div
        //     mucho más angosto, viéndose desproporcionadamente grande. Escalarlo por la
        //     razón `divW/anchoRef` iguala la proporción visual con desktop.
        function crearNumeroPaginaElement(pag, tot, cfg, divW, anchoRef) {
            if (!cfg || !cfg.mostrar) return null;
            var pp = cfg.porPagina ? cfg.porPagina[pag] : null;
            if (pp) cfg = Object.assign({}, cfg, pp);

            var el = document.createElement('div');
            el.className = 'fb-numero-pagina';
            el.textContent = '' + pag;

            var escala = (divW && anchoRef && divW < anchoRef) ? (divW / anchoRef) : 1;
            var fs = Math.max(6, (cfg.tamanio || 14) * escala);
            var padY = Math.max(1, Math.round(2 * escala));
            var padX = Math.max(2, Math.round(4 * escala));
            var borde = Math.max(3, Math.round(5 * escala)) + 'px';

            var css = 'position:absolute;z-index:30;pointer-events:none;'
                    + 'font:bold ' + fs + 'px Arial,sans-serif;'
                    + 'color:' + (cfg.colorNumero || '#666666') + ';'
                    + 'line-height:1;padding:' + padY + 'px ' + padX + 'px;'
                    + 'white-space:nowrap;';

            if (cfg.mostrarFondo !== false) {
                var rgb = hexRgb(cfg.colorFondo || '#00FFFF');
                var op = (cfg.opacidadFondo != null ? cfg.opacidadFondo : 1);
                css += 'background:rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + op + ');';
            }

            var pos = cfg.posicion || 'inferior-centro';
            if (pos === 'inferior-derecha')       css += 'right:' + borde + ';bottom:' + borde + ';text-align:right;';
            else if (pos === 'inferior-izquierda') css += 'left:' + borde + ';bottom:' + borde + ';text-align:left;';
            else if (pos === 'inferior-centro')    css += 'left:50%;bottom:' + borde + ';transform:translateX(-50%);text-align:center;';
            else if (pos === 'superior-derecha')   css += 'right:' + borde + ';top:' + borde + ';text-align:right;';
            else if (pos === 'superior-izquierda') css += 'left:' + borde + ';top:' + borde + ';text-align:left;';
            else if (pos === 'superior-centro')    css += 'left:50%;top:' + borde + ';transform:translateX(-50%);text-align:center;';
            else if (pos === 'personalizada') {
                var cx = (cfg.customX != null ? cfg.customX : 50);
                var cy = (cfg.customY != null ? cfg.customY : 95);
                css += 'left:' + cx + '%;top:' + cy + '%;transform:translate(-50%,-100%);text-align:center;';
            } else {
                css += 'left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;';
            }

            el.style.cssText = css;
            return el;
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

            // ── Construir mapa de páginas ──
            var pageOrder = datos.page_order || [];
            var pageMap = [];

            if (pageOrder.length > 0) {
                pageMap = pageOrder.slice();
            } else {
                // Fallback: reconstruir desde inserted_pages + hidden_pages (formato legado)
                var insertedPages = datos.inserted_pages || [];
                var hiddenPages = datos.hidden_pages || [];
                var pdfPageCount = pdf.numPages;

                for (var pi = 1; pi <= pdfPageCount; pi++) {
                    if (hiddenPages.indexOf(pi) === -1) {
                        pageMap.push({ type: 'pdf', num: pi });
                    }
                }
                var inserts = insertedPages.slice().sort(function (a, b) {
                    return (b.pagina_flipbook || 0) - (a.pagina_flipbook || 0);
                });
                inserts.forEach(function (ins) {
                    var idx = (ins.pagina_flipbook || 1) - 1;
                    if (idx < 0) idx = 0;
                    if (idx > pageMap.length) idx = pageMap.length;
                    if (ins.posicion === 'despues') idx++;
                    pageMap.splice(idx, 0, { type: 'inserted', url: ins.url });
                });
            }

            var totalPaginas = pageMap.length;
            // Actualizar datos.paginas para que el resto del código use el total correcto
            datos.paginas = totalPaginas;

            const images = new Array(totalPaginas);

            // Variables para guardar el tamaño real del PDF
            let pdfAnchoReal = 550;
            let pdfAltoReal = 733;

            // Obtener dimensiones reales desde la primera página del PDF
            const firstPage = await pdf.getPage(1);
            const vpReal = firstPage.getViewport({ scale: 1 });
            pdfAnchoReal = vpReal.width;
            pdfAltoReal = vpReal.height;

            // Parámetros separados para móvil y desktop
            const SCALE_RENDER = ES_MOVIL ? 1.2 : 2.0;
            const JPEG_QUALITY = ES_MOVIL ? 0.82 : 0.92;

            // Renderiza una página del PDF a un blob URL.
            // Nota: ya NO se dibuja el número en el bitmap — eso ahora es un overlay HTML
            // que se inyecta al crear el pageDiv. Mantener el render "limpio" significa
            // que las páginas insertadas y las del PDF reciben exactamente el mismo tratamiento
            // y que no pagamos coste de re-codificación de imagen.
            async function renderPaginaABlobUrl(numPag, pageObj) {
                const page = pageObj || await pdf.getPage(numPag);
                const viewport = page.getViewport({ scale: SCALE_RENDER });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                return new Promise(function (resolve) {
                    canvas.toBlob(function (blob) {
                        resolve(URL.createObjectURL(blob));
                    }, 'image/jpeg', JPEG_QUALITY);
                });
            }

            // Renderiza una entrada del pageMap (PDF o insertada)
            async function renderMapEntry(mapIdx, pageObj) {
                var entry = pageMap[mapIdx];
                if (!entry) return null;
                if (entry.type === 'inserted') {
                    // Para páginas insertadas, usar la URL directamente
                    return entry.url;
                }
                // Página del PDF
                return renderPaginaABlobUrl(entry.num, pageObj);
            }

            // ── Render TODAS las páginas en paralelo por lotes ──
            // Lote 1: primeras páginas para mostrar el flipbook rápido.
            // Lote 2+: el resto en lotes paralelos, sin esperas artificiales.
            const PAG_INICIALES = Math.min(ES_MOVIL ? 4 : 6, totalPaginas);
            const CONCURRENCIA = ES_MOVIL ? 3 : 6;

            // Primera página con el pageObj que ya tenemos si es PDF
            if (pageMap[0] && pageMap[0].type === 'pdf' && pageMap[0].num === 1) {
                images[0] = await renderMapEntry(0, firstPage);
            } else {
                images[0] = await renderMapEntry(0);
            }

            // Lote inicial: páginas 2..PAG_INICIALES en paralelo
            if (PAG_INICIALES > 1) {
                const promesas = [];
                for (let i = 1; i < PAG_INICIALES; i++) {
                    promesas.push(renderMapEntry(i));
                }
                const lote = await Promise.all(promesas);
                lote.forEach(function (url, idx) { images[1 + idx] = url; });
            }

            var placeholderSrc = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
            var paginasRenderizadas = new Set();
            for (let i = 0; i < PAG_INICIALES; i++) paginasRenderizadas.add(i);
            for (let i = PAG_INICIALES; i < totalPaginas; i++) {
                images[i] = placeholderSrc;
            }

            // ── Render bajo demanda: renderiza página(s) si aún tienen placeholder ──
            var _renderEnCurso = {}; // promesas por índice para evitar renders duplicados
            function asegurarPaginaRenderizada(idx) {
                if (idx < 0 || idx >= totalPaginas) return Promise.resolve();
                if (paginasRenderizadas.has(idx)) return Promise.resolve();
                if (_renderEnCurso[idx]) return _renderEnCurso[idx];

                _renderEnCurso[idx] = renderMapEntry(idx).then(function (url) {
                    if (url && pageImgs[idx]) {
                        pageImgs[idx].src = url;
                    }
                    paginasRenderizadas.add(idx);
                    delete _renderEnCurso[idx];
                }).catch(function (e) {
                    console.warn('Error renderizando página bajo demanda', idx + 1, e);
                    delete _renderEnCurso[idx];
                });
                return _renderEnCurso[idx];
            }

            // Renderiza la página actual + vecinas (lo que el usuario ve o está por ver)
            function asegurarPaginasVisibles(idx) {
                var paginas = ES_MOVIL ? [idx] : [idx, idx + 1];
                // También pre-renderizar una página antes y después para navegación fluida
                paginas.push(idx - 1, idx + 2);
                var promesas = [];
                paginas.forEach(function (p) {
                    if (p >= 0 && p < datos.paginas && !paginasRenderizadas.has(p)) {
                        promesas.push(asegurarPaginaRenderizada(p));
                    }
                });
                return Promise.all(promesas);
            }

            // ── Dimensiones móvil (calcular ANTES de crear divs) ──
            var PAGE_RATIO = pdfAltoReal / pdfAnchoReal;
            var mobileW = 0, mobileH = 0;
            if (ES_MOVIL) {
                mobileW = window.innerWidth - 40;
                mobileH = Math.round(mobileW * PAGE_RATIO);
                var maxH = window.innerHeight * 0.75;
                if (mobileH > maxH) {
                    mobileH = Math.round(maxH);
                    mobileW = Math.round(mobileH / PAGE_RATIO);
                }
            }

            // ── Crear divs de página con overlays embebidos (como el editor) ──
            var W = Math.round(pdfAnchoReal * 1.5);
            var H = Math.round(pdfAltoReal * 1.5);
            var divW = ES_MOVIL ? mobileW : W;
            var divH = ES_MOVIL ? mobileH : H;
            var pageDivs = [];
            var pageImgs = []; // refs para actualizar img.src en background
            for (var pi = 0; pi < images.length; pi++) {
                var pageDiv = document.createElement('div');
                pageDiv.className = 'fb-page-item';
                pageDiv.style.cssText = 'width:' + divW + 'px;height:' + divH + 'px;overflow:hidden;position:relative;background:#fff;';
                var img = document.createElement('img');
                img.src = images[pi];
                img.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
                pageDiv.appendChild(img);
                pageImgs.push(img);
                // Número de página como overlay HTML (posición en flipbook, 1-based).
                // En desktop pasamos anchoRef = W (divW === W → escala 1, sin cambio).
                // En móvil pasamos anchoRef = W también (divW < W → escala < 1) para
                // que el tamaño se vea proporcional al de desktop, ya que móvil no tiene
                // el stretch automático de StPageFlip que desktop sí aplica.
                var numEl = crearNumeroPaginaElement(pi + 1, images.length, configNumeros, divW, W);
                if (numEl) pageDiv.appendChild(numEl);
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

            // Flechas dentro de canvasWrapper (tiene position:relative)
            canvasWrapper.appendChild(flechaIzq);
            canvasWrapper.appendChild(flechaDer);

            // En móvil ocultar flechas flotantes — usamos navbar inferior
            if (ES_MOVIL) {
                flechaIzq.style.display = 'none';
                flechaDer.style.display = 'none';

                // ── Navbar de navegación móvil ──
                var navbarMovil = document.createElement('div');
                navbarMovil.className = 'fb-navbar-movil';
                var btnNavPrev = document.createElement('button');
                btnNavPrev.className = 'fb-nav-btn';
                btnNavPrev.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
                var btnNavFs = document.createElement('button');
                btnNavFs.className = 'fb-nav-btn fb-nav-fs';
                btnNavFs.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
                var btnNavNext = document.createElement('button');
                btnNavNext.className = 'fb-nav-btn';
                btnNavNext.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

                // Funciones de navegación para prev/next con debounce anti-doble-tap.
                // turnToPrevPage/turnToNextPage son instantáneas (sin animación).
                var _navDebounce = 0;
                function navRetroceder() {
                    var now = Date.now();
                    if (now - _navDebounce < 250) return;
                    _navDebounce = now;
                    if (_autoplayTimer) { clearTimeout(_autoplayTimer); _autoplayTimer = null; }
                    _lastAutoplayIdx = -1;
                    // Desbloquear audios de la página destino DENTRO del user gesture,
                    // antes de que pageFlip cambie y se pierda el contexto del gesto.
                    if (pageFlip) {
                        var idxActual = pageFlip.getCurrentPageIndex();
                        desbloquearAudiosPagina(idxActual - 1);
                        if (!ES_MOVIL) desbloquearAudiosPagina(idxActual - 2);
                    }
                    pausarMedia();
                    if (pageFlip) {
                        pageFlip.turnToPrevPage();
                        _autoplayTimer = setTimeout(reproducirAutoplaySecuencial, 200);
                    }
                }
                function navAvanzar() {
                    var now = Date.now();
                    if (now - _navDebounce < 250) return;
                    _navDebounce = now;
                    if (_autoplayTimer) { clearTimeout(_autoplayTimer); _autoplayTimer = null; }
                    // Desbloquear audios de la página destino DENTRO del user gesture.
                    if (pageFlip) {
                        var idxAct = pageFlip.getCurrentPageIndex();
                        desbloquearAudiosPagina(idxAct + 1);
                        if (!ES_MOVIL) desbloquearAudiosPagina(idxAct + 2);
                    }
                    pausarMedia();
                    if (pageFlip) {
                        pageFlip.turnToNextPage();
                        _autoplayTimer = setTimeout(reproducirAutoplaySecuencial, 200);
                    }
                }

                // Prev: touchend como handler principal (respuesta inmediata en móvil)
                btnNavPrev.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
                btnNavPrev.addEventListener('touchend', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    navRetroceder();
                }, { passive: false });
                btnNavPrev.addEventListener('click', function (e) {
                    e.stopPropagation();
                    navRetroceder();
                });

                // Next: touchend como handler principal
                btnNavNext.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
                btnNavNext.addEventListener('touchend', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    navAvanzar();
                }, { passive: false });
                btnNavNext.addEventListener('click', function (e) {
                    e.stopPropagation();
                    navAvanzar();
                });

                // Fullscreen
                btnNavFs.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
                btnNavFs.addEventListener('touchend', function (e) {
                    e.preventDefault(); e.stopPropagation();
                    if (!document.fullscreenElement) contenedor.requestFullscreen().catch(function () { });
                    else document.exitFullscreen();
                }, { passive: false });
                btnNavFs.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (!document.fullscreenElement) contenedor.requestFullscreen().catch(function () { });
                    else document.exitFullscreen();
                });

                navbarMovil.appendChild(btnNavPrev);
                navbarMovil.appendChild(btnNavFs);
                navbarMovil.appendChild(btnNavNext);
                contenedor.appendChild(navbarMovil);
            }

            const btnFsFlotante = document.createElement('button');
            btnFsFlotante.className = 'fb-btn-fs-flotante';
            btnFsFlotante.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg> Full screen';
            btnFsFlotante.style.opacity = '0';
            btnFsFlotante.style.transition = 'opacity .3s';
            canvasWrapper.appendChild(btnFsFlotante);

            // Fullscreen solo en móvil — en desktop se oculta
            if (!ES_MOVIL) {
                btnFsFlotante.style.display = 'none';
            } else {
                btnFsFlotante.style.opacity = '1';
            }

            btnFsFlotante.addEventListener('click', function () {
                if (!document.fullscreenElement) contenedor.requestFullscreen().catch(function () { });
                else document.exitFullscreen();
            });

            // Ya no necesitamos capa flotante de overlays — están embebidos en cada página

            const target = document.getElementById('flip-target-' + flipbookId);

            if (ES_MOVIL) {
                target.style.width = mobileW + 'px';
                target.style.height = mobileH + 'px';
                target.style.margin = '0 auto';
                canvasWrapper.style.height = (window.innerHeight * 0.85) + 'px';
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
                // Desktop: 9999 bloquea swipe (solo arrastre en esquinas).
                // Móvil: 30 es el default de StPageFlip — fiable y sin saltos accidentales.
                swipeDistance: ES_MOVIL ? 50 : 9999,
                clickEventForward: false,
                disableFlipByClick: true,
                // Móvil: animación más lenta tipo Paperturn/demo de StPageFlip
                flippingTime: ES_MOVIL ? 700 : 600,
            });

            pageFlip.loadFromHTML(targetDiv.querySelectorAll('.fb-page-item'));

            // ── Monkey-patch: cambiar umbral de flip de 1/2 a 1/3 del ancho ──
            // StPageFlip decide si completar o revertir un drag en stopMove():
            //   position.x <= 0  → completar flip (0 = centro de la página)
            //   position.x > 0   → revertir
            // Esto equivale a requerir arrastrar >50%. Parcheamos para usar 1/3:
            //   position.x <= pageWidth/3  → completar flip
            if (ES_MOVIL && pageFlip.getFlipController) {
                var fc = pageFlip.getFlipController();
                if (fc && fc.stopMove) {
                    var _originalStopMove = fc.stopMove.bind(fc);
                    fc.stopMove = function () {
                        var calc = fc.getCalculation ? fc.getCalculation() : (fc.calc || null);
                        if (calc === null) { _originalStopMove(); return; }
                        var pos = calc.getPosition();
                        var bounds = fc.getBoundsRect ? fc.getBoundsRect() : null;
                        if (!bounds) { _originalStopMove(); return; }

                        // pos.x va de ~pageWidth (sin mover) a -pageWidth (completado).
                        // Original: pos.x <= 0 → completar (hay que arrastrar 50%).
                        // Para 1/3: pos.x <= pageWidth/3 → completar al arrastrar ~1/3.
                        // pageWidth/3 ≈ 33% desde el borde izquierdo = ~33% de arrastre.
                        var umbral = bounds.pageWidth / 3;
                        var corner = calc.getCorner();
                        var h = corner === 'bottom' ? bounds.height : 0;

                        if (pos.x <= umbral) {
                            fc.animateFlippingTo(pos, { x: -bounds.pageWidth, y: h }, true);
                        } else {
                            fc.animateFlippingTo(pos, { x: bounds.pageWidth, y: h }, false);
                        }
                    };
                }
            }

            // ── Background render: páginas restantes en lotes paralelos ──
            function hayAudioActivo() {
                if (audioActual && !audioActual.paused) return true;
                var containers = [targetDiv];
                var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                if (sink) containers.push(sink);
                for (var c = 0; c < containers.length; c++) {
                    var audios = containers[c].querySelectorAll('audio');
                    for (var i = 0; i < audios.length; i++) {
                        if (!audios[i].paused && audios[i].currentTime > 0) return true;
                    }
                }
                return false;
            }

            if (PAG_INICIALES < datos.paginas) {
                // Renderizar el resto en lotes paralelos de CONCURRENCIA páginas
                (async function renderRestante() {
                    // Pequeño delay para que el flipbook y autoplay se estabilicen
                    await new Promise(function (r) { setTimeout(r, 1500); });

                    for (var start = PAG_INICIALES; start < datos.paginas; start += CONCURRENCIA) {
                        // Si hay audio activo, esperar hasta que termine
                        while (hayAudioActivo()) {
                            await new Promise(function (r) { setTimeout(r, 500); });
                        }
                        var lotePromesas = [];
                        var loteIndices = [];
                        for (var j = start; j < Math.min(start + CONCURRENCIA, datos.paginas); j++) {
                            // Saltar páginas ya renderizadas bajo demanda
                            if (paginasRenderizadas.has(j)) continue;
                            loteIndices.push(j);
                            lotePromesas.push(
                                renderMapEntry(j).catch(function (e) {
                                    console.warn('Error renderizando página', j + 1, e);
                                    return null;
                                })
                            );
                        }
                        if (lotePromesas.length > 0) {
                            var resultados = await Promise.all(lotePromesas);
                            resultados.forEach(function (url, idx) {
                                var pi = loteIndices[idx];
                                if (url && pageImgs[pi]) {
                                    pageImgs[pi].src = url;
                                    paginasRenderizadas.add(pi);
                                }
                            });
                        }
                        // Micro-pausa entre lotes para no congelar la UI
                        await new Promise(function (r) { setTimeout(r, 50); });
                    }
                })();
            }

            // ── Controlador unificado: esquinas, zoom, cursor, pan ──
            // Todo en stfParent capture phase para evitar conflictos de propagación.
            setTimeout(function () {
                var stfParent = canvasWrapper.querySelector('.stf__parent');
                var flipEl = canvasWrapper.querySelector('[id^="flip-target"]');
                if (stfParent && flipEl && !ES_MOVIL) {
                    var mouseDown = false;
                    var enEsquina = false;
                    var mdX = 0, mdY = 0;

                    function esEsquina(clientX, clientY) {
                        var rect = stfParent.getBoundingClientRect();
                        var x = clientX - rect.left;
                        var y = clientY - rect.top;
                        var w = rect.width;
                        var h = rect.height;
                        return (x < 55 || x > w - 55) && (y < 55 || y > h - 55);
                    }

                    function esOverlayInteractivo(clientX, clientY) {
                        var el = document.elementFromPoint(clientX, clientY);
                        if (!el) return false;
                        var ovEl = el.closest('.fb-ov');
                        if (!ovEl) return false;
                        return !!(ovEl.dataset.audioId || ovEl.querySelector('a') ||
                            ovEl.querySelector('iframe') || ovEl.style.cursor === 'pointer');
                    }

                    // Cursor: lupa(+) en centro, grab en esquinas, lupa(-) con zoom activo
                    stfParent.addEventListener('mousemove', function (e) {
                        var sc = flipEl._setCursor || function () {};
                        if (!mouseDown) {
                            if (zoomActivo) {
                                sc(flipEl._isDragging ? 'grabbing' : CURSOR_ZOOM_OUT);
                            } else {
                                sc(esEsquina(e.clientX, e.clientY) ? 'grab' : CURSOR_ZOOM_IN);
                            }
                        }
                        // Bloquear StPageFlip mousemove si no es esquina drag
                        if (zoomActivo || !mouseDown || !enEsquina) {
                            e.stopImmediatePropagation();
                        }
                    }, true);

                    stfParent.addEventListener('mousedown', function (e) {
                        mouseDown = true;
                        mdX = e.clientX;
                        mdY = e.clientY;
                        enEsquina = false;

                        if (zoomActivo) {
                            // Iniciar pan
                            flipEl._isDragging = true;
                            flipEl._dragStartX = e.clientX;
                            flipEl._dragStartY = e.clientY;
                            flipEl._panStartX = panX;
                            flipEl._panStartY = panY;
                            flipEl.style.cursor = 'grabbing';
                            var sc = flipEl._setCursor || function () {};
                            sc('grabbing');
                            e.stopImmediatePropagation();
                            e.preventDefault();
                            return;
                        }

                        enEsquina = esEsquina(e.clientX, e.clientY);
                        if (!enEsquina) {
                            // Bloquear StPageFlip fuera de esquinas
                            e.stopImmediatePropagation();
                        }
                    }, true);

                    document.addEventListener('mouseup', function (e) {
                        if (mouseDown) {
                            var dist = Math.hypot(e.clientX - mdX, e.clientY - mdY);
                            // Click sin movimiento y fuera de esquinas → zoom
                            if (dist < 5 && !enEsquina) {
                                if (zoomActivo) {
                                    zoomOutReset();
                                    var sc = flipEl._setCursor || function () {};
                                    sc(CURSOR_ZOOM_IN);
                                } else if (!esOverlayInteractivo(e.clientX, e.clientY)) {
                                    var wrapRect = canvasWrapper.getBoundingClientRect();
                                    zoomInAt(e.clientX - wrapRect.left, e.clientY - wrapRect.top);
                                    var sc2 = flipEl._setCursor || function () {};
                                    sc2(CURSOR_ZOOM_OUT);
                                }
                            }
                        }
                        mouseDown = false;
                        enEsquina = false;
                    }, true);
                }
            }, 100);



            function actualizarIconoAudio(audioEl, isPlaying) {
                var wrap = audioEl.closest('.fb-ov');
                if (!wrap && audioEl.id) {
                    wrap = targetDiv.querySelector('[data-audio-id="' + audioEl.id + '"]');
                }
                if (!wrap) return;
                var path = wrap.querySelector('svg path');
                if (path) path.setAttribute('d', isPlaying ? PAUSE_PATH : PLAY_PATH);
            }

            function pausarAudios() {
                var allAudios = [];
                targetDiv.querySelectorAll('audio').forEach(function (a) { allAudios.push(a); });
                var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                if (sink) sink.querySelectorAll('audio').forEach(function (a) { allAudios.push(a); });
                allAudios.forEach(function (a) {
                    a.pause(); a.currentTime = 0;
                    // Limpiar la marca de "pausado manualmente" al cambiar de página.
                    // Si el usuario vuelve a esta página, el autoplay debe poder arrancar.
                    a._pausadoManual = false;
                    actualizarIconoAudio(a, false);
                });
                if (audioActual) { audioActual.pause(); audioActual = null; }
            }

            // Pausar todos los videos YouTube (iframes).
            // En móvil, postMessage 'pauseVideo' no siempre detiene el audio cuando la pestaña
            // pasa a segundo plano (iOS Safari especialmente). Como fallback fiable, vaciamos
            // el src del iframe guardando el original en un data-attr para restaurarlo luego.
            function pausarVideos() {
                targetDiv.querySelectorAll('iframe').forEach(function (iframe) {
                    var src = iframe.src || '';
                    if (src.indexOf('youtube.com') === -1 && src.indexOf('youtu.be') === -1) return;
                    try {
                        iframe.contentWindow.postMessage(JSON.stringify({
                            event: 'command', func: 'pauseVideo', args: []
                        }), '*');
                    } catch (e) {}
                });
            }

            function restaurarVideos() { }

            // ── Autoplay secuencial: izquierda primero, luego derecha ──
            var autoplayDesbloqueado = false;
            var autoplayPendiente = false;

            var _lastAutoplay = 0;
            var _autoplayTimer = null;
            var _lastAutoplayIdx = -1;
            // Token de cancelación: se incrementa cada vez que se inicia un autoplay nuevo
            // o se llama pausarMedia. Las cadenas asíncronas (esperarCarga → play) comprueban
            // el token antes de continuar; si cambió, significa que el usuario ya cambió de página.
            var _autoplayToken = 0;
            // Flag para saber si hay un watchdog vivo o intentos en curso para la página
            // actual. Se activa al armar un watchdog y se desactiva al cancelarlo o agotar
            // reintentos. Usado por reproducirAutoplaySecuencial para evitar reiniciar un
            // intento que ya está progresando.
            var _watchdogActivo = false;
            // Flag que indica que HAY una cadena de playNext en curso para la página
            // actual. Se activa al inicio de cada reproducirAutoplaySecuencial que pase
            // los chequeos, y se desactiva al terminar la cadena o al cambiar de página.
            // Cubre el caso de audios con precarga completa (que no arman watchdog) para
            // que llamadas duplicadas (flip + changeState) no reinicien el audio.
            var _intentoActivo = false;

            // Función combinada: pausar todo el media (audio + video).
            // También invalida el token de autoplay para cancelar cadenas pendientes
            // (e.g., audio cargándose asíncronamente de la página que acabamos de dejar).
            function pausarMedia() {
                _autoplayToken++;
                _watchdogActivo = false; // cualquier watchdog vivo comprobará token y saldrá
                _intentoActivo = false;  // cualquier intento comprobará token y saldrá
                pausarAudios();
                pausarVideos();
            }
            // IMPORTANTE: pausarAudiosRef solo pausa audios, NO videos.
            // Los builders de audio/youtube la llaman al reproducir — no deben destruir iframes.
            pausarAudiosRef = pausarAudios;
            asegurarPaginasVisiblesRef = asegurarPaginasVisibles;

            // ── Precarga ligera del audio de la SIGUIENTE página ──
            // Objetivo: cuando el usuario avance a la siguiente página, su audio ya estará
            // (total o parcialmente) descargado → play() responde casi instantáneo.
            //
            // Restricciones para NO afectar el rendimiento:
            //   • Solo UN audio — el de la página idx+1, nada más. No tocamos audios anteriores
            //     ni el resto del flipbook.
            //   • Se ejecuta en requestIdleCallback → si el navegador está ocupado renderizando
            //     PDF o animando el flip, la precarga espera a que termine.
            //   • Se llama SOLO en `changeState 'read'` (página asentada), nunca en `flip`
            //     (que se dispara muchas veces durante un drag).
            //   • Marca _precargado en el elemento para no repetir trabajo.
            //   • Si el audio ya tiene datos suficientes (readyState >= 2), ni siquiera
            //     toca preload — ya está listo.
            var _idleFn = window.requestIdleCallback || function (fn) { return setTimeout(fn, 300); };

            function precargarAudioSiguiente(idx) {
                if (idx == null || idx < 0) return;
                var siguiente = idx + 1;
                _idleFn(function () {
                    var allPages = targetDiv.querySelectorAll('.fb-page-item');
                    if (siguiente >= allPages.length) return;
                    var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                    if (!sink) return;

                    allPages[siguiente].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (w) {
                        var aid = w.dataset.audioId;
                        if (!aid) return;
                        var a = sink.querySelector('#' + CSS.escape(aid));
                        if (!a) return;
                        if (a._precargado) return;
                        if (a.readyState >= 2) return;
                        a._precargado = true;
                        a.preload = 'auto';
                        try { a.load(); } catch (e) {}
                    });
                });
            }

            // Desbloquea los audios de una página dada haciendo play() silencioso
            // dentro del user gesture actual. Crítico para iOS Safari: sin este
            // unlock, play() asíncrono posterior queda en silencio aunque resuelva.
            //
            // Se llama desde los handlers de navegación (flechas desktop, nav móvil)
            // que SÍ están dentro del user gesture. Desbloqueamos los audios de la
            // página destino — no todos del flipbook — para evitar saturar la red.
            //
            // Idempotente: si un audio ya fue desbloqueado antes (flag _unlocked),
            // no se vuelve a tocar.
            function desbloquearAudiosPagina(pagIdx) {
                if (pagIdx == null || pagIdx < 0) return;
                var allPages = targetDiv.querySelectorAll('.fb-page-item');
                if (pagIdx >= allPages.length) return;
                var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                if (!sink) return;
                allPages[pagIdx].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (w) {
                    var aid = w.dataset.audioId;
                    if (!aid) return;
                    var a = sink.querySelector('#' + CSS.escape(aid));
                    if (!a || a._unlocked) return;
                    a._unlocked = true;
                    a.muted = true;
                    var p = a.play();
                    if (p && p.then) {
                        p.then(function () {
                            a.pause();
                            a.currentTime = 0;
                            a.muted = false;
                        }).catch(function () {
                            a.muted = false;
                            a._unlocked = false; // permitir reintento
                        });
                    } else {
                        try { a.pause(); } catch (e) {}
                        a.muted = false;
                    }
                });
            }

            // Precarga BLOQUEANTE (retorna Promise) de los audios de una página dada.
            // A diferencia de precargarAudioSiguiente(), esta espera a que los audios
            // estén realmente completos (readyState >= 4) antes de resolver. Se usa en
            // el arranque para saber cuándo ocultar el loader.
            //
            // IMPORTANTE: usamos `canplaythrough` (no `canplay`) porque necesitamos que
            // el audio esté COMPLETAMENTE cargado, no solo "suficiente para empezar".
            // Si resolvemos con canplay, el play() posterior tendrá que seguir descargando
            // y volvemos al problema original de "audios que tardan al navegar".
            //
            // Timeout de 6s por página: si uno no carga completo a tiempo, no bloquea al
            // resto (seguirá descargando en background).
            function precargarAudioPaginaPromise(paginaIdx) {
                return new Promise(function (resolve) {
                    var allPages = targetDiv.querySelectorAll('.fb-page-item');
                    if (paginaIdx < 0 || paginaIdx >= allPages.length) { resolve(); return; }
                    var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                    if (!sink) { resolve(); return; }

                    var audiosPagina = [];
                    allPages[paginaIdx].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (w) {
                        var aid = w.dataset.audioId;
                        if (!aid) return;
                        var a = sink.querySelector('#' + CSS.escape(aid));
                        if (!a) return;
                        audiosPagina.push(a);
                    });

                    if (!audiosPagina.length) { resolve(); return; }

                    var pendientes = audiosPagina.length;
                    var timeoutId = setTimeout(function () {
                        // Timeout: resolvemos aunque no todos estén completos.
                        // Los que no terminaron seguirán descargando en background.
                        pendientes = 0;
                        resolve();
                    }, 8000);

                    audiosPagina.forEach(function (a) {
                        // Si ya está completo (readyState 4), saltamos directo.
                        if (a.readyState >= 4) {
                            if (--pendientes === 0) { clearTimeout(timeoutId); resolve(); }
                            return;
                        }
                        // Marcar como precargado ANTES del load para que el watchdog y la
                        // red de seguridad respeten este audio como "ya en proceso de carga".
                        a._precargado = true;
                        a._precargaCompleta = false; // flag crítico: aún no está completo

                        var limpiar = function () {
                            a.removeEventListener('canplaythrough', onComplete);
                            a.removeEventListener('error', onComplete);
                        };
                        var onComplete = function () {
                            limpiar();
                            a._precargaCompleta = true;
                            if (--pendientes === 0) { clearTimeout(timeoutId); resolve(); }
                        };
                        a.addEventListener('canplaythrough', onComplete);
                        a.addEventListener('error', onComplete);
                        a.preload = 'auto';
                        try { a.load(); } catch (e) {}
                    });
                });
            }

            function reproducirAutoplaySecuencial() {
                _dbg('reproducirAutoplaySecuencial() llamada — idx actual:', pageFlip.getCurrentPageIndex());
                var now = Date.now();
                var transcurrido = now - _lastAutoplay;
                if (transcurrido < 300) {
                    if (_autoplayTimer) { _dbg('  → debounce: timer ya programado, salgo'); return; }
                    _dbg('  → debounce: programando para', (300 - transcurrido), 'ms');
                    _autoplayTimer = setTimeout(function () {
                        _autoplayTimer = null;
                        reproducirAutoplaySecuencial();
                    }, 300 - transcurrido);
                    return;
                }

                var idx = pageFlip.getCurrentPageIndex();

                if (idx === _lastAutoplayIdx) {
                    var audioYaSonando = audioActual && !audioActual.paused && audioActual.currentTime > 0;
                    var intentoEnCurso = _watchdogActivo || _intentoActivo;
                    if (audioYaSonando || intentoEnCurso) {
                        _dbg('  → idempotencia: misma página idx=' + idx + ', sonando=' + audioYaSonando + ', intentoEnCurso=' + intentoEnCurso + ', salgo');
                        return;
                    }
                    _dbg('  → misma página idx=' + idx + ' pero sin intento activo, continúo');
                }

                _lastAutoplay = now;
                _lastAutoplayIdx = idx;
                _intentoActivo = true; // marca que hay una cadena de playNext en progreso
                var miToken = ++_autoplayToken;

                var allPages = targetDiv.querySelectorAll('.fb-page-item');
                var visibles = ES_MOVIL ? [idx] : (idx === 0 ? [0] : [idx, idx + 1]);

                var audios = [];
                var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                visibles.forEach(function (pi) {
                    if (pi < 0 || pi >= allPages.length) return;
                    allPages[pi].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (wrap) {
                        var aid = wrap.dataset.audioId;
                        if (!aid) return;
                        var a = sink ? sink.querySelector('#' + CSS.escape(aid)) : null;
                        if (a && a.dataset.autoplay === '1') audios.push(a);
                    });
                });

                if (!audios.length) return;

                // Asegura que el audio esté cargado antes de intentar play().
                // Con preload='none', play() puede fallar si el archivo aún no se ha descargado.
                // CRÍTICO: si el audio ya fue precargado (o está en proceso de precarga
                // desde el arranque), NO hacemos a.load() porque eso descartaría todo el
                // buffer ya descargado y reiniciaría desde cero.
                function esperarCarga(a) {
                    return new Promise(function (resolve) {
                        if (a.readyState >= 2) { resolve(); return; }
                        // Solo llamar load() si el audio NO ha sido precargado previamente.
                        // Si _precargado es true, ya hay una descarga en curso o completada —
                        // solo tenemos que esperar a que llegue a readyState >= 2.
                        if (!a._precargado) {
                            a._precargado = true;
                            a.preload = 'auto';
                            try { a.load(); } catch (e) {}
                        }
                        var resuelto = false;
                        var onReady = function () {
                            if (resuelto) return;
                            resuelto = true;
                            a.removeEventListener('canplay', onReady);
                            a.removeEventListener('loadeddata', onReady);
                            a.removeEventListener('error', onErr);
                            resolve();
                        };
                        var onErr = function () {
                            if (resuelto) return;
                            resuelto = true;
                            a.removeEventListener('canplay', onReady);
                            a.removeEventListener('loadeddata', onReady);
                            a.removeEventListener('error', onErr);
                            resolve();
                        };
                        a.addEventListener('canplay', onReady);
                        a.addEventListener('loadeddata', onReady);
                        a.addEventListener('error', onErr);
                        setTimeout(onReady, 5000);
                    });
                }

                var i = 0;
                function playNext() {
                    // Si el token cambió, el usuario ya cambió de página → abortar
                    if (_autoplayToken !== miToken) { _intentoActivo = false; return; }
                    if (i >= audios.length) { _intentoActivo = false; return; }
                    var a = audios[i];
                    // Si el audio fue pausado manualmente por el usuario, saltar al
                    // siguiente. La marca se limpia al cambiar de página.
                    if (a._pausadoManual) { i++; playNext(); return; }
                    audioActual = a;
                    // Solo resetear currentTime si el audio NO está ya sonando.
                    // Si ya arrancó (por un playNext anterior que quedó vivo), este
                    // reset lo cortaría y lo haría empezar de nuevo — causa directa
                    // del corte reportado en páginas con audios precargados.
                    if (a.paused || a.currentTime === 0) {
                        a.currentTime = 0;
                    }

                    // ── Watchdog de reintento ──
                    // Si tras 800ms el audio no está sonando (!paused && currentTime > 0),
                    // asumimos que el play() se quedó colgado (red lenta, buffer vacío) y
                    // hacemos un nuevo intento. Máximo 2 reintentos (3 intentos totales).
                    //
                    // Rendimiento: el watchdog es un setTimeout simple. Cuando el audio
                    // arranca bien (caso común), el propio watchdog se autocancela en la
                    // primera comprobación al ver `a.currentTime > 0`. Coste = 1 setTimeout
                    // por intento, que se limpia solo. Cero trabajo continuo.
                    //
                    // NO reintenta si:
                    //   • Cambió el token (usuario ya pasó a otra página).
                    //   • El fallo fue `NotAllowedError` (política autoplay — reintentar
                    //     no ayuda, solo gesto del usuario).
                    //   • Ya se agotaron los 2 reintentos.
                    // Máximo de reintentos. Con 3 tenemos 4 intentos totales (0, 1, 2, 3),
                    // con delays 1200, 2000, 2000, 2000ms. Solo corren si el audio NO
                    // suena — en caso normal, cero reintentos y cero coste.
                    var MAX_REINTENTOS = 3;
                    var intento = 0;
                    var watchdogId = null;
                    var bloqueadoPorPolitica = false;

                    function limpiarWatchdog() {
                        if (watchdogId) { clearTimeout(watchdogId); watchdogId = null; }
                        _watchdogActivo = false;
                    }

                    function programarWatchdog(delay) {
                        limpiarWatchdog();
                        _watchdogActivo = true;
                        watchdogId = setTimeout(function () {
                            watchdogId = null;
                            // El usuario ya cambió de página → nada que hacer.
                            if (_autoplayToken !== miToken) { _watchdogActivo = false; return; }
                            // El usuario pausó manualmente → respetar, no reintentar.
                            if (a._pausadoManual) { _watchdogActivo = false; return; }
                            // El audio está sonando correctamente → nada que hacer.
                            if (!a.paused && a.currentTime > 0) { _watchdogActivo = false; return; }
                            // Audio precargado completo y ya hizo play() exitoso pero aún
                            // ct=0: puede ser que 'playing' todavía no haya llegado. Darle
                            // un chequeo extra en 500ms antes de reintentar destructivamente.
                            if (a._precargaCompleta && a.readyState >= 4 && !a.paused) {
                                _watchdogActivo = false;
                                // Esperar un poco más — el audio puede estar arrancando.
                                setTimeout(function () {
                                    if (_autoplayToken !== miToken) return;
                                    if (a._pausadoManual) return;
                                    if (!a.paused && a.currentTime > 0) return; // arrancó bien
                                    // Aún sin avanzar tras 500ms extra — ahora sí reintento.
                                    if (intento < MAX_REINTENTOS) {
                                        intento++;
                                        try { a.pause(); } catch (e) {}
                                        intentarPlay();
                                    }
                                }, 500);
                                return;
                            }
                            // El audio fue bloqueado por política → reintentar no sirve.
                            if (bloqueadoPorPolitica) { _watchdogActivo = false; return; }
                            // Reintento si queda presupuesto
                            if (intento < MAX_REINTENTOS) {
                                intento++;
                                // Antes de reintentar, forzar recarga del audio por si
                                // el error anterior dejó el elemento en mal estado.
                                // PERO: si el audio ya fue precargado completo al inicio,
                                // NO hacemos load() porque descartaría el buffer completo
                                // y volveríamos al problema de "tarda en cargar al navegar".
                                try { a.pause(); } catch (e) {}
                                if (!a._precargaCompleta) {
                                    try { a.load(); } catch (e) {}
                                }
                                intentarPlay();
                            } else {
                                // Agotamos reintentos: pasamos al siguiente audio del grupo
                                // (si hay). Esto evita que una falla de red en un audio
                                // bloquee a los demás.
                                _watchdogActivo = false;
                                saltarAlSiguiente();
                            }
                        }, delay);
                    }

                    function intentarPlay() {
                        if (_autoplayToken !== miToken) return;
                        // Defensa en profundidad: si el usuario pausó manualmente entre
                        // reintentos, no volver a lanzar play().
                        if (a._pausadoManual) { limpiarWatchdog(); return; }

                        // ── Watchdog PREVIO al play ──
                        // Solo armamos watchdog para audios NO precargados completos.
                        // Los audios con _precargaCompleta ya tienen todo el buffer — si
                        // no arrancan, es un problema que reintentar no resuelve. El
                        // watchdog sobre estos audios causaba cortes por race condition
                        // con el evento 'playing'. La red de seguridad (setInterval) sigue
                        // como fallback para estos casos.
                        if (!a._precargaCompleta) {
                            programarWatchdog(intento === 0 ? 1200 : 2000);
                        }

                        // Registrar el listener de 'playing' ANTES de llamar play(). Para
                        // audios precargados completos, play() arranca tan rápido que el
                        // evento 'playing' puede dispararse ANTES de que el .then() se
                        // ejecute. Si no registramos el listener primero, perdemos el
                        // evento, el watchdog no se limpia, y a los 1200ms "reintenta"
                        // un audio que ya estaba sonando → lo corta.
                        var onPlaying = function () {
                            a.removeEventListener('playing', onPlaying);
                            limpiarWatchdog();
                        };
                        a.addEventListener('playing', onPlaying, { once: true });

                        esperarCarga(a).then(function () {
                            if (_autoplayToken !== miToken) return;
                            // Si el usuario pausó mientras esperábamos carga, abortar.
                            if (a._pausadoManual) { limpiarWatchdog(); return; }
                            return a.play();
                        }).then(function () {
                            if (_autoplayToken !== miToken) { a.pause(); return; }
                            // Si el usuario pausó justo ahora (entre play() y su resolución),
                            // respetar: pausar inmediatamente.
                            if (a._pausadoManual) { try { a.pause(); } catch (e) {} limpiarWatchdog(); return; }
                            autoplayDesbloqueado = true;
                            actualizarIconoAudio(a, true);
                            // Si 'playing' ya se había disparado antes del .then (normal
                            // con audios precargados), currentTime ya es > 0. En ese caso,
                            // limpiamos el watchdog también desde aquí por seguridad.
                            if (!a.paused && a.currentTime > 0) {
                                limpiarWatchdog();
                            }
                            a.addEventListener('ended', function () {
                                limpiarWatchdog();
                                actualizarIconoAudio(a, false);
                                audioActual = null;
                                i++;
                                playNext();
                            }, { once: true });
                        }).catch(function (err) {
                            if (_autoplayToken !== miToken) return;
                            var nombre = err && err.name ? err.name : '';
                            // Política de autoplay del navegador: no reintentamos, esperamos gesto.
                            // Marcamos el flag para que el watchdog (que YA está programado)
                            // no intente de nuevo cuando se dispare.
                            if (nombre === 'NotAllowedError' && !autoplayDesbloqueado) {
                                bloqueadoPorPolitica = true;
                                autoplayPendiente = true;
                                limpiarWatchdog();
                                return;
                            }
                            // Otro error (red, buffer, formato): dejamos que el watchdog
                            // reintente automáticamente. No hacemos i++ aquí — eso mataría
                            // al audio si la página tiene uno solo. El watchdog hará su
                            // trabajo; si se agotan los reintentos, él mismo llamará a
                            // saltarAlSiguiente().
                        });
                    }

                    function saltarAlSiguiente() {
                        limpiarWatchdog();
                        i++;
                        playNext();
                    }

                    intentarPlay();
                }
                playNext();
            }

            // Si el navegador bloquea autoplay, al primer click/touch desbloqueamos
            function desbloquearAutoplay() {
                if (!autoplayPendiente) return;
                autoplayPendiente = false;
                autoplayDesbloqueado = true;
                reproducirAutoplaySecuencial();
            }
            document.addEventListener('click', desbloquearAutoplay, { once: true });
            document.addEventListener('touchend', desbloquearAutoplay, { once: true });

            // ── Autoplay en primera carga: desbloquear con primera interacción ──
            // No usar overlay invisible que bloquea interacciones.
            // En su lugar, escuchar la primera interacción en el contenedor.
            var _autoplayUnlocked = false;
            function desbloquearYReproducir() {
                if (_autoplayUnlocked) return;
                _autoplayUnlocked = true;
                autoplayDesbloqueado = true;

                // ── Pre-unlock de audios iniciales (crítico para iOS Safari) ──
                // iOS Safari exige que play() se llame DENTRO del mismo event handler
                // de un user gesture. Cualquier play() posterior asíncrono (por ejemplo,
                // tras una navegación por flecha que dispara reproducirAutoplaySecuencial)
                // puede resolver sin decodificar audio → estado "zombie" (suena en silencio).
                //
                // Truco: aprovechamos ESTE primer user gesture para llamar play() silencioso
                // (muted) sobre los audios que vayamos a necesitar pronto, luego pausarlos.
                // Esto "marca" cada elemento como user-activated por el resto de la sesión.
                //
                // CRÍTICO: solo hacemos pre-unlock de los audios de las PRIMERAS PÁGINAS
                // (idx 0, 1, 2). Antes hacíamos unlock de TODOS los audios del flipbook, pero
                // eso causaba que el navegador intentara descargar 60+ archivos en paralelo,
                // saturando conexiones (stalled/suspend) y cortando la reproducción de los
                // audios que sí estaban sonando. Los audios de páginas posteriores se
                // desbloquean naturalmente cuando el usuario navega hacia ellas.
                //
                // Además, solo aplica en móvil. En desktop el autoplay funciona bien sin
                // pre-unlock explícito y cualquier play()/pause() extra solo suma ruido.
                if (ES_MOVIL) {
                    try {
                        var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                        var allPages = targetDiv ? targetDiv.querySelectorAll('.fb-page-item') : null;
                        if (sink && allPages && allPages.length) {
                            var paginasUnlock = [0, 1, 2]; // portada + páginas 2 y 3
                            var audiosUnlock = [];
                            paginasUnlock.forEach(function (pi) {
                                if (pi < 0 || pi >= allPages.length) return;
                                allPages[pi].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (w) {
                                    var aid = w.dataset.audioId;
                                    if (!aid) return;
                                    var a = sink.querySelector('#' + CSS.escape(aid));
                                    if (a) audiosUnlock.push(a);
                                });
                            });
                            audiosUnlock.forEach(function (a) {
                                a.muted = true;
                                var p = a.play();
                                if (p && p.then) {
                                    p.then(function () {
                                        a.pause();
                                        a.currentTime = 0;
                                        a.muted = false;
                                    }).catch(function () {
                                        a.muted = false;
                                    });
                                } else {
                                    try { a.pause(); } catch (e) {}
                                    a.muted = false;
                                }
                            });
                        }
                    } catch (e) {}
                }

                if (autoplayPendiente) {
                    autoplayPendiente = false;
                    _lastAutoplayIdx = -1;
                    reproducirAutoplaySecuencial();
                }
                // Limpiar listeners
                contenedor.removeEventListener('click', desbloquearYReproducir, true);
                contenedor.removeEventListener('touchend', _touchEndUnlock, true);
            }
            // Usar touchend en vez de touchstart para no interferir con flip/drag
            function _touchEndUnlock() { desbloquearYReproducir(); }
            contenedor.addEventListener('click', desbloquearYReproducir, { capture: true });
            contenedor.addEventListener('touchend', _touchEndUnlock, { capture: true });

            // ── Pausar audio/video cuando la pestaña está en segundo plano ──
            // Escuchamos tanto visibilitychange como pagehide. En móvil (iOS Safari sobre todo),
            // pagehide es más fiable cuando el usuario deja la app en segundo plano o bloquea la pantalla.
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                    pausarMedia();
                } else {
                    restaurarVideos();
                }
            });
            window.addEventListener('pagehide', function () {
                pausarMedia();
            });

            // ── RED DE SEGURIDAD ──
            // Comprobación periódica (cada 1s) que detecta el caso puntual: hay un audio
            // con autoplay en la página actual que NO está sonando y el usuario está
            // ESTÁTICO en esa página hace más de 1.5 segundos.
            //
            // Este mecanismo es intencionalmente simple y brutal: llama play() directo,
            // sin pasar por el watchdog ni el token. Es el PLAN B para cuando la lógica
            // principal falla por alguna razón que no hemos identificado.
            //
            // Diseño:
            //   • Chequeo SOLO si la página está asentada ≥1.5s (no durante flips).
            //   • Chequeo SOLO si el usuario ya interactuó (autoplayDesbloqueado) — si
            //     no, el navegador va a rechazar play() igual y no sirve de nada.
            //   • play() a pelo. Sin reintentos adicionales aquí: si sigue sin arrancar,
            //     la siguiente iteración lo probará 1s después.
            //
            // Los valores (1.5s de espera, 1s de intervalo) están calibrados para
            // intervenir rápido SIN interferir con arranques normales de audio que
            // tarden un poco por red lenta.
            //
            // Coste: un setInterval de 1s que en la mayoría de iteraciones solo hace
            // 3 comprobaciones baratas y sale.
            var _ultimoCambioPagina = Date.now();
            var _paginaEstablePrevio = -1;

            function resetearTiempoEstable() {
                _ultimoCambioPagina = Date.now();
            }

            setInterval(function () {
                if (!pageFlip) return;
                // No operar si la pestaña está oculta — play() en background es poco
                // fiable y además no queremos "resucitar" un audio que fue pausado
                // intencionalmente al salir de pestaña.
                if (document.hidden) return;
                // No operar si aún no hubo interacción del usuario — play() fallaría.
                if (!autoplayDesbloqueado) return;

                var idx = pageFlip.getCurrentPageIndex();
                if (idx == null || idx < 0) return;

                // Detectar cambio de página para resetear el contador de "estable".
                if (idx !== _paginaEstablePrevio) {
                    _paginaEstablePrevio = idx;
                    _ultimoCambioPagina = Date.now();
                    return;
                }

                // Esperar a que la página esté asentada al menos 1.5s antes de intervenir.
                if (Date.now() - _ultimoCambioPagina < 1500) return;

                // Examinar los audios de autoplay de las páginas visibles.
                var allPages = targetDiv.querySelectorAll('.fb-page-item');
                var visibles = ES_MOVIL ? [idx] : (idx === 0 ? [0] : [idx, idx + 1]);
                var sink = document.getElementById('fb-audio-sink-' + flipbookId);
                if (!sink) return;

                // ── Recopilación SECUENCIAL de audios ──
                // Orden: páginas de izquierda a derecha, y dentro de cada página en
                // orden del DOM. Esto coincide con el orden que usa reproducirAutoplay
                // (izquierda primero, luego derecha) para mantener la secuencia natural.
                var todosAudios = [];
                var paginaDeAudio = []; // paralelo: índice de página de cada audio
                visibles.forEach(function (pi) {
                    if (pi < 0 || pi >= allPages.length) return;
                    allPages[pi].querySelectorAll('.fb-ov[data-audio-id]').forEach(function (wrap) {
                        var aid = wrap.dataset.audioId;
                        if (!aid) return;
                        var a = sink.querySelector('#' + CSS.escape(aid));
                        if (!a || a.dataset.autoplay !== '1') return;
                        todosAudios.push(a);
                        paginaDeAudio.push(pi);
                    });
                });

                if (!todosAudios.length) return;

                // ── Decidir qué audio evaluar ──
                //
                // Estrategia: encontramos el PRIMER audio que aún no ha terminado. Todos
                // los posteriores los ignoramos — sonarán cuando les toque (el evento
                // 'ended' de playNext() se encarga de encadenar).
                //
                // Un audio se considera "terminado" cuando:
                //   - a.ended === true, o
                //   - currentTime >= duration (redundante pero seguro)
                //
                // Si el primer audio no-terminado YA está sonando bien, no hacemos nada
                // (seguirá sonando solo). Si está en un estado zombie (inconsistente o
                // fantasma) o nunca arrancó, intervenimos SOLO sobre él.
                var primerNoTerminado = null;
                var piPrimero = -1;
                for (var k = 0; k < todosAudios.length; k++) {
                    var ai = todosAudios[k];
                    var terminado = ai.ended || (ai.duration > 0 && ai.currentTime >= ai.duration - 0.1);
                    if (!terminado) {
                        primerNoTerminado = ai;
                        piPrimero = paginaDeAudio[k];
                        break;
                    }
                }

                // Si no hay ninguno no-terminado, todos ya sonaron. Nada que hacer.
                if (!primerNoTerminado) return;

                // Evaluar el estado del primer no-terminado.
                var a = primerNoTerminado;
                var pi = piPrimero;

                // Si el usuario pausó este audio manualmente, NO tocar bajo ninguna
                // circunstancia. Aunque esté en estado "zombie", fue decisión explícita
                // del usuario y debemos respetarla hasta que cambie de página.
                if (a._pausadoManual) return;

                // ── Detección de estado ──
                //
                // Casos:
                //   A) Sonando bien:  !paused && currentTime > 0 y avanzando → no tocar.
                //   B) Nunca arrancó: paused === true && currentTime === 0 → play().
                //   C) Fantasma:      paused === false pero ct no avanza → reset + play.
                //   D) Inconsistente: paused === false && ct === 0 → reset + play.
                //   E) Pausado manual: paused === true && ct > 0 → NO tocar.

                var paused = a.paused;
                var ct = a.currentTime;

                // Caso E: pausado por el usuario. No tocar.
                if (paused && ct > 0) return;

                // Caso A: sonando bien. Guardar currentTime para próximo chequeo.
                if (!paused && ct > 0) {
                    // Verificación de "fantasma": si en la iteración anterior
                    // teníamos el mismo ct, el audio no está avanzando realmente.
                    //
                    // UMBRAL: para audios precargados completos somos MUY conservadores
                    // (requerimos 4+ iteraciones = ~10s congelado antes de intervenir)
                    // porque esos audios ya tienen buffer completo y es muy improbable
                    // que estén zombie de verdad — más probable que sea una falsa alarma
                    // (ej. el navegador nos devolvió currentTime redondeado igual). Para
                    // audios NO precargados seguimos con 2 iteraciones (~5s).
                    var umbralCongelado = a._precargaCompleta ? 4 : 2;
                    if (a._ultimoCtCheck !== undefined && a._ultimoCtCheck === ct) {
                        a._iterCongelado = (a._iterCongelado || 0) + 1;
                        if (a._iterCongelado >= umbralCongelado) {
                            _dbg('RED DE SEGURIDAD: audio FANTASMA (ct congelado en ' + ct + ', precargaCompleta=' + !!a._precargaCompleta + '), reset. idx=' + idx);
                            a._iterCongelado = 0;
                            a._ultimoCtCheck = undefined;
                            forzarReproduccion(a, pi);
                            return;
                        }
                    } else {
                        a._iterCongelado = 0;
                    }
                    a._ultimoCtCheck = ct;
                    return;
                }

                // Caso D: paused=false y currentTime=0 → estado inconsistente.
                // Si tiene precarga completa, puede ser que acabe de llegar a la página
                // y aún no ha empezado — damos una pasada más antes de intervenir.
                if (!paused && ct === 0) {
                    if (a._precargaCompleta && !a._vistoInconsistente) {
                        a._vistoInconsistente = true;
                        return;
                    }
                    a._vistoInconsistente = false;
                    _dbg('RED DE SEGURIDAD: audio INCONSISTENTE (!paused, ct=0), reset. idx=' + idx);
                    forzarReproduccion(a, pi);
                    return;
                }

                // Caso B: nunca arrancó (paused=true, ct=0). Lanzar.
                forzarReproduccion(a, pi);
            }, 2500);

            // Fuerza reproducción limpia: pause → load → play.
            // Usa el mismo patrón que ya tenía la red de seguridad: token check para
            // evitar sonar después de que el usuario ya navegó.
            function forzarReproduccion(a, pi) {
                var tokenLanzamiento = _autoplayToken;
                try {
                    // Reset: pausa, reset de ct. Si el audio NO está precargado completo,
                    // hacemos load() para reiniciar el decoder en caso zombie. Pero si SÍ
                    // está precargado completo, NO tocamos load() — el buffer ya está OK,
                    // solo necesitamos un pause+play limpio.
                    a.pause();
                    a.currentTime = 0;
                    if (!a._precargaCompleta) {
                        a.preload = 'auto';
                        a.load();
                    }
                    var p = a.play();
                    if (p && p.then) {
                        p.then(function () {
                            if (_autoplayToken !== tokenLanzamiento) {
                                try { a.pause(); a.currentTime = 0; } catch (e) {}
                                _dbg('  RED DE SEGURIDAD: token cambió durante play(), cancelando');
                            }
                        }).catch(function (e) {
                            _dbg('  RED DE SEGURIDAD: play() rechazado:', e && e.name);
                        });
                    }
                } catch (e) {
                    _dbg('  RED DE SEGURIDAD: excepción:', e);
                }
            }

            pageFlip.on('flip', (e) => {
                if (zoomActivo) zoomOutReset();
                const numLeft = e.data + 1;
                if (paginaActualEl) paginaActualEl.textContent = numLeft;

                flechaIzq.style.opacity = (e.data === 0) ? '0.25' : '0.8';
                flechaIzq.style.pointerEvents = (e.data === 0) ? 'none' : 'auto';
                flechaDer.style.opacity = (e.data >= datos.paginas - 1) ? '0.25' : '0.8';
                flechaDer.style.pointerEvents = (e.data >= datos.paginas - 1) ? 'none' : 'auto';

                contenedor.classList.toggle('en-portada', e.data === 0);
                contenedor.classList.toggle('en-contraportada', e.data >= datos.paginas - 1);

                // Renderizar bajo demanda las páginas visibles + vecinas
                asegurarPaginasVisibles(e.data);

                // Pausar audios de la página anterior y lanzar autoplay de la nueva.
                pausarMedia();
                _lastAutoplayIdx = -1;
                if (_autoplayTimer) { clearTimeout(_autoplayTimer); _autoplayTimer = null; }
                _autoplayTimer = setTimeout(reproducirAutoplaySecuencial, 250);
            });

            pageFlip.on('changeState', (e) => {
                if (e.data === 'user_fold' || e.data === 'flipping') {
                    pausarMedia();
                    contenedor.classList.remove('en-portada', 'en-contraportada');
                    if (zoomActivo) zoomOutReset();
                }
                if (e.data === 'read') {
                    var idx = pageFlip.getCurrentPageIndex();
                    contenedor.classList.toggle('en-portada', idx === 0);
                    contenedor.classList.toggle('en-contraportada', idx >= datos.paginas - 1);
                    reproducirAutoplaySecuencial();
                    // Precarga ligera de la página siguiente — solo se ejecuta cuando
                    // el navegador esté ocioso (requestIdleCallback).
                    precargarAudioSiguiente(idx);
                }
            });

            flechaIzq.addEventListener('mousedown', function (e) { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
            flechaIzq.addEventListener('click', function (e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (_autoplayTimer) { clearTimeout(_autoplayTimer); _autoplayTimer = null; }
                // Desbloquear audios de la página destino dentro del user gesture.
                if (pageFlip) {
                    var idxActual = pageFlip.getCurrentPageIndex();
                    desbloquearAudiosPagina(idxActual - 1);
                    if (!ES_MOVIL) desbloquearAudiosPagina(idxActual - 2);
                }
                pausarMedia();
                if (pageFlip) {
                    pageFlip.flipPrev();
                    _autoplayTimer = setTimeout(reproducirAutoplaySecuencial, 500);
                }
            });
            flechaDer.addEventListener('mousedown', function (e) { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
            flechaDer.addEventListener('click', function (e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (_autoplayTimer) { clearTimeout(_autoplayTimer); _autoplayTimer = null; }
                // Desbloquear audios de la página destino dentro del user gesture.
                if (pageFlip) {
                    var idxAct = pageFlip.getCurrentPageIndex();
                    desbloquearAudiosPagina(idxAct + 1);
                    if (!ES_MOVIL) desbloquearAudiosPagina(idxAct + 2);
                }
                pausarMedia();
                if (pageFlip) {
                    pageFlip.flipNext();
                    _autoplayTimer = setTimeout(reproducirAutoplaySecuencial, 500);
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft' && pageFlip) pageFlip.flipPrev();
                if (e.key === 'ArrowRight' && pageFlip) pageFlip.flipNext();
            });

            flechaIzq.style.opacity = '0.25';
            flechaIzq.style.pointerEvents = 'none';

            setTimeout(() => {
                contenedor.classList.add('en-portada');
                // Intentar autoplay en portada al cargar
                reproducirAutoplaySecuencial();
            }, 500);

            // ── Preparación inicial: precargar audios de páginas 1, 2 y 3 (idx 0,1,2) ──
            // Mostramos un loader con progreso y vamos descargando los audios iniciales
            // en SERIE (uno tras otro). Así el usuario ve feedback real y cuando el
            // flipbook aparece, los audios están listos para reproducir sin demora aunque
            // haga click inmediato.
            //
            // Garantías:
            //   • Timeout global de 12s: si la red es muy lenta, revelamos el flipbook
            //     igual. Como el loader es invisible, el usuario solo ve pantalla en
            //     blanco — no percibe que está "cargando", así que podemos esperar más.
            //   • En serie, no en paralelo: evita saturar el navegador/servidor.
            //   • Respeta el delay mínimo de 3500ms del render del PDF: aunque las
            //     precargas terminen antes, esperamos a que el render acabe.
            //   • Si algún audio falla o tarda más de 4s individuales, seguimos con los
            //     demás (la promise interna tiene su propio timeout).
            //   • Controlable con flag: window.__fbPrefetchInicial = false lo desactiva.
            (async function prepararFlipbook() {
                try {
                    var paginasAPrecargar = [0, 1, 2]; // idx 0,1,2 → portada + páginas 2 y 3
                    var totalAudios = 0;
                    var audiosListos = 0;

                    // Contar cuántos audios hay en esas páginas para el progreso.
                    var allPages = targetDiv.querySelectorAll('.fb-page-item');
                    paginasAPrecargar.forEach(function (pi) {
                        if (pi < 0 || pi >= allPages.length) return;
                        totalAudios += allPages[pi].querySelectorAll('.fb-ov[data-audio-id]').length;
                    });

                    actualizarLoaderProgreso(0, totalAudios);

                    // Timeout global: aunque no terminen las precargas, revelamos tras 12s.
                    // Como el loader es invisible (el usuario no ve "cargando..."), podemos
                    // permitirnos más margen para redes lentas. 12s es el tiempo máximo que
                    // esperaría un usuario antes de refrescar, así que es un buen límite.
                    var globalTimeout = false;
                    var globalTimeoutId = setTimeout(function () { globalTimeout = true; }, 12000);

                    if (window.__fbPrefetchInicial !== false && totalAudios > 0) {
                        for (var p = 0; p < paginasAPrecargar.length; p++) {
                            if (globalTimeout) break;
                            var pagIdx = paginasAPrecargar[p];
                            var audiosEnPagina = 0;
                            if (pagIdx >= 0 && pagIdx < allPages.length) {
                                audiosEnPagina = allPages[pagIdx].querySelectorAll('.fb-ov[data-audio-id]').length;
                            }
                            if (audiosEnPagina > 0) {
                                await precargarAudioPaginaPromise(pagIdx);
                                audiosListos += audiosEnPagina;
                                actualizarLoaderProgreso(audiosListos, totalAudios);
                            }
                        }
                    }

                    clearTimeout(globalTimeoutId);

                    // Respetar el delay mínimo del render del PDF (3500ms desde el inicio).
                    var transcurrido = Date.now() - _tiempoInicio;
                    var restante = Math.max(0, 3500 - transcurrido);
                    if (restante > 0) await new Promise(function (r) { setTimeout(r, restante); });
                } catch (e) {
                    console.warn('Error en preparación del flipbook:', e);
                }
                // Revelar el flipbook y ocultar el loader SIEMPRE, pase lo que pase.
                mostrarFlipbook();
                ocultarLoader();
            })();

            if (!ES_MOVIL) iniciarZoomDesktop(target);
            else iniciarGestosMovil(target);

        } catch (e) {
            console.error('Error al cargar flipbook:', e);
            // Si algo falla en el arranque, al menos quitar el loader para no trabar al usuario.
            ocultarLoader();
            mostrarFlipbook();
        }

        // (Overlays embebidos en páginas — no se necesita ajustarCapaOverlays ni renderizarContenidoMultimedia)

        // ── Builders ─────────────────────────────────────────────────────
        function buildAudio(wrap, d) {
            const iconColor = (d.iconColor && d.iconColor !== 'undefined') ? d.iconColor : '#C70000';
            const playPath = PLAY_PATH;
            const pausePath = PAUSE_PATH;
            wrap.style.cssText += ';display:block;cursor:pointer;background:transparent;border:none;z-index:50;padding:0;margin:0;';

            // Crear audio y sacarlo completamente del flipbook a un contenedor off-screen.
            // Es la ÚNICA forma confiable de que ningún navegador muestre controles nativos.
            const audio = document.createElement('audio');
            audio.src = d.url || ''; audio.preload = 'none';
            audio.controls = false;
            audio.removeAttribute('controls');
            // Estilos explícitos para que ningún navegador móvil muestre controles
            audio.style.cssText = 'display:none;width:0;height:0;position:absolute;opacity:0;pointer-events:none;';
            if (d.autoplay) audio.dataset.autoplay = '1';

            // Contenedor off-screen (lazy, uno por flipbook)
            var sink = document.getElementById('fb-audio-sink-' + flipbookId);
            if (!sink) {
                sink = document.createElement('div');
                sink.id = 'fb-audio-sink-' + flipbookId;
                sink.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;';
                document.body.appendChild(sink);
            }
            sink.appendChild(audio);

            // ID para vincular wrap ↔ audio
            wrap.dataset.audioId = 'fb-audio-' + Math.random().toString(36).substr(2, 9);
            audio.id = wrap.dataset.audioId;

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', iconColor);
            svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
            svg.style.pointerEvents = 'none';
            const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            svgPath.setAttribute('d', playPath);
            svg.appendChild(svgPath);
            wrap.appendChild(svg);

            // Usa audio.paused como fuente de verdad para que el autoplay
            // y el toggle manual estén siempre sincronizados.
            function toggleAudio() {
                if (audioActual && audioActual !== audio) { audioActual.pause(); }
                if (!audio.paused) {
                    audio.pause();
                    // Marcar que fue pausado manualmente por el usuario. Esto evita que:
                    //   1) reproducirAutoplaySecuencial lo reinicie en el próximo changeState.
                    //   2) La red de seguridad lo considere un caso a "rescatar".
                    // La marca se borra si el usuario lo vuelve a reproducir manualmente, o
                    // si el audio llega a su final naturalmente, o si cambia la página.
                    audio._pausadoManual = true;
                    svgPath.setAttribute('d', playPath);
                    audioActual = null;
                } else {
                    // El usuario lo reanuda: quitar la marca.
                    audio._pausadoManual = false;
                    audio.play().then(function () {
                        audioActual = audio;
                        svgPath.setAttribute('d', pausePath);
                    }).catch(function () { });
                }
            }

            wrap.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                toggleAudio();
            });
            // Móvil: touchend con detección de tap (StPageFlip puede consumir clicks sintéticos)
            var _tapX = 0, _tapY = 0;
            wrap.addEventListener('touchstart', function (e) {
                if (e.touches.length === 1) { _tapX = e.touches[0].clientX; _tapY = e.touches[0].clientY; }
                e.stopPropagation();
            }, { passive: false, capture: false });
            wrap.addEventListener('touchend', function (e) {
                if (e.changedTouches.length === 0) return;
                var dx = Math.abs(e.changedTouches[0].clientX - _tapX);
                var dy = Math.abs(e.changedTouches[0].clientY - _tapY);
                if (dx < 10 && dy < 10) {
                    e.preventDefault(); e.stopPropagation();
                    toggleAudio();
                }
            }, { passive: false });

            audio.addEventListener('ended', function () {
                svgPath.setAttribute('d', playPath); audioActual = null;
            });
            audio.addEventListener('pause', function () {
                svgPath.setAttribute('d', playPath);
            });
            audio.addEventListener('play', function () {
                svgPath.setAttribute('d', pausePath);
            });
        }

        function buildYoutube(wrap, d) {
            const videoId = d.videoId || extraerIdYoutube(d.url || '');
            if (!videoId) return;

            // Construir URL del embed
            const p = new URLSearchParams({
                autoplay: d.autoplay || 0,
                controls: d.controles !== undefined ? d.controles : 1,
                mute: d.silencio || 0,
                loop: d.loop || 0,
                start: d.inicio || 0,
                playlist: videoId,
                enablejsapi: 1,
                origin: window.location.origin
            });
            var embedUrl = 'https://www.youtube.com/embed/' + videoId + '?' + p;

            // ── Lazy loading: mostrar thumbnail + botón play ──
            // El iframe solo se crea cuando el usuario hace click/tap.
            // Esto evita cargar múltiples iframes de YT simultáneamente.
            wrap.style.cssText += ';cursor:pointer;background:#000;';

            // Thumbnail de YouTube (maxresdefault con fallback a hqdefault)
            var thumb = document.createElement('img');
            thumb.className = 'fb-yt-thumb';
            thumb.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            thumb.src = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
            // Intentar maxres, si falla usar hq
            var thumbHR = new Image();
            thumbHR.onload = function () {
                if (thumbHR.naturalWidth > 200) thumb.src = thumbHR.src;
            };
            thumbHR.src = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';

            // Botón play overlay
            var playBtn = document.createElement('div');
            playBtn.className = 'fb-yt-play';
            playBtn.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
            playBtn.innerHTML = '<svg viewBox="0 0 68 48" width="68" height="48" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.4));">'
                + '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>'
                + '<path d="M45 24L27 14v20" fill="#fff"/></svg>';

            wrap.appendChild(thumb);
            wrap.appendChild(playBtn);

            wrap._iframeCargado = false;

            function cargarIframe(e) {
                if (e) { e.stopPropagation(); e.preventDefault(); }
                if (wrap._iframeCargado) return;

                // Pausar audios
                pausarAudiosRef();
                // Pausar otros iframes de YouTube via postMessage (no destruir)
                contenedor.querySelectorAll('iframe').forEach(function (otroIframe) {
                    var src = otroIframe.src || '';
                    if (src.indexOf('youtube.com') !== -1) {
                        try {
                            otroIframe.contentWindow.postMessage(JSON.stringify({
                                event: 'command', func: 'pauseVideo', args: []
                            }), '*');
                        } catch (ex) {}
                    }
                });

                wrap._iframeCargado = true;

                // Forzar autoplay y unmute al hacer click manual
                var clickUrl = embedUrl.replace('autoplay=0', 'autoplay=1');

                var iframe = document.createElement('iframe');
                iframe.src = clickUrl;
                iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;display:block;z-index:2;';
                iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
                iframe.allowFullscreen = true;
                iframe.loading = 'lazy';
                wrap.appendChild(iframe);

                // Ocultar thumbnail y botón
                thumb.style.display = 'none';
                playBtn.style.display = 'none';
            }

            // Click / tap para cargar
            wrap.addEventListener('click', cargarIframe);
            var _tapX = 0, _tapY = 0;
            wrap.addEventListener('touchstart', function (e) {
                if (e.touches.length === 1) { _tapX = e.touches[0].clientX; _tapY = e.touches[0].clientY; }
                e.stopPropagation();
            }, { passive: false, capture: false });
            wrap.addEventListener('touchend', function (e) {
                if (e.changedTouches.length === 0) return;
                var dx = Math.abs(e.changedTouches[0].clientX - _tapX);
                var dy = Math.abs(e.changedTouches[0].clientY - _tapY);
                if (dx < 10 && dy < 10) {
                    e.preventDefault(); e.stopPropagation();
                    cargarIframe();
                }
            }, { passive: false });
        }

        function buildImagen(wrap, d) {
            const img = document.createElement('img');
            img.src = d.url || '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;';
            wrap.appendChild(img);
        }

        // Autoplay de slider que solo avanza cuando su página es visible en el flipbook.
        // Usa setTimeout recursivo en vez de setInterval para poder verificar visibilidad en cada tick.
        function iniciarAutoSlide(wrap, avanzar, intervalo) {
            (function tick() {
                setTimeout(function () {
                    if (!wrap.isConnected) return; // overlay eliminado del DOM
                    if (pageFlip) {
                        var pd = wrap.closest('.fb-page-item');
                        if (pd) {
                            var all = pd.parentElement ? pd.parentElement.querySelectorAll('.fb-page-item') : [];
                            var pi = Array.from(all).indexOf(pd);
                            var ci = pageFlip.getCurrentPageIndex();
                            var visible = ES_MOVIL
                                ? (pi === ci)
                                : (ci === 0 ? pi === 0 : (pi === ci || pi === ci + 1));
                            if (visible && !document.hidden) avanzar();
                        }
                    }
                    tick();
                }, intervalo);
            })();
        }

        function buildSlide(wrap, d) {
            const imgs = d.imagenes || []; if (!imgs.length) return;
            wrap.style.position = 'relative';
            const dur = (parseInt(d.duracion) || 3) * 1000;
            const transicion = d.transicion || 'fade';
            let lista = d.aleatorio ? mezclar([...imgs]) : [...imgs]; let idx = 0;
            const inner = document.createElement('div');
            // Sin background: si la imagen del slider aún no ha cargado, se ve lo que
            // haya detrás (normalmente la foto de referencia dibujada en la página del PDF),
            // que es exactamente lo que se quiere. Cuando la imagen llega, se pinta encima.
            inner.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';

            if (transicion === 'slide') {
                // Transición slide: strip horizontal con loop infinito
                // Se agrega un clon de la primera imagen al final para que la transición
                // de la última a la primera siempre vaya hacia la derecha.
                var stripItems = lista.slice();
                if (d.loop && lista.length > 1) stripItems.push(lista[0]); // clon al final
                var totalStrip = stripItems.length;

                var strip = document.createElement('div');
                strip.style.cssText = 'display:flex;width:' + (totalStrip * 100) + '%;height:100%;transition:transform .5s ease;';
                stripItems.forEach(function (src) {
                    var s = document.createElement('div');
                    s.style.cssText = 'flex:0 0 ' + (100 / totalStrip) + '%;height:100%;background:url(\'' + src + '\') center/cover no-repeat;';
                    strip.appendChild(s);
                });
                inner.appendChild(strip);
                wrap.appendChild(inner);

                var animando = false;
                function mostrar(n) {
                    if (animando) return;
                    var t = lista.length;

                    if (d.loop && n >= t) {
                        // Avanzar al clon (posición t) con animación
                        animando = true;
                        strip.style.transition = 'transform .5s ease';
                        strip.style.transform = 'translateX(-' + (t * (100 / totalStrip)) + '%)';
                        // Después de la animación, saltar sin transición a la posición 0
                        setTimeout(function () {
                            strip.style.transition = 'none';
                            strip.style.transform = 'translateX(0%)';
                            idx = 0;
                            animando = false;
                        }, 520);
                        return;
                    }

                    idx = d.loop ? (((n % t) + t) % t) : Math.max(0, Math.min(n, t - 1));
                    strip.style.transition = 'transform .5s ease';
                    strip.style.transform = 'translateX(-' + (idx * (100 / totalStrip)) + '%)';
                }
                if (d.autoplay) iniciarAutoSlide(wrap, function () { mostrar(idx + 1); }, dur);
                if (d.flechas) {
                    const bs = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
                    const bp = document.createElement('button'); bp.style.cssText = bs + 'left:4px;'; bp.innerHTML = '‹';
                    const bn = document.createElement('button'); bn.style.cssText = bs + 'right:4px;'; bn.innerHTML = '›';
                    bp.onclick = function (e) { e.stopPropagation(); mostrar(idx - 1); };
                    bn.onclick = function (e) { e.stopPropagation(); mostrar(idx + 1); };
                    wrap.appendChild(bp); wrap.appendChild(bn);
                }
            } else {
                // Transición fade: opacidad
                lista.forEach(function (src, i) {
                    var s = document.createElement('div');
                    s.style.cssText = 'position:absolute;inset:0;background:url(\'' + src + '\') center/cover no-repeat;opacity:' + (i === 0 ? 1 : 0) + ';transition:opacity .5s;';
                    inner.appendChild(s);
                });
                wrap.appendChild(inner);

                function mostrar(n) {
                    var t = lista.length;
                    idx = d.loop ? (((n % t) + t) % t) : Math.max(0, Math.min(n, t - 1));
                    Array.from(inner.children).forEach(function (s, i) { s.style.opacity = i === idx ? '1' : '0'; });
                }
                if (d.autoplay) iniciarAutoSlide(wrap, function () { mostrar(idx + 1); }, dur);
                if (d.flechas) {
                    const bs = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
                    const bp = document.createElement('button'); bp.style.cssText = bs + 'left:4px;'; bp.innerHTML = '‹';
                    const bn = document.createElement('button'); bn.style.cssText = bs + 'right:4px;'; bn.innerHTML = '›';
                    bp.onclick = function (e) { e.stopPropagation(); mostrar(idx - 1); };
                    bn.onclick = function (e) { e.stopPropagation(); mostrar(idx + 1); };
                    wrap.appendChild(bp); wrap.appendChild(bn);
                }
            }
        }

        function buildLink(wrap, d) {
            const href = d.href || d.url || '';
            const esInvisible = d.icono === 'invisible';
            wrap.style.cursor = 'pointer';
            if (href.startsWith('pagina:')) {
                const n = parseInt(href.replace('pagina:', ''));
                if (esInvisible) {
                    wrap.style.cssText += ';background:transparent;border:none;';
                } else {
                    wrap.style.cssText += ';background:rgba(26,111,207,.18);border:2px solid rgba(26,111,207,.5);border-radius:6px;display:flex;align-items:center;justify-content:center;';
                }
                wrap.title = d.titulo || ('Ir a página ' + n);
                if (!esInvisible) {
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'rgba(26,111,207,0.9)');
                    svg.style.cssText = 'width:50%;height:50%;max-width:36px;max-height:36px;pointer-events:none;';
                    svg.innerHTML = '<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>';
                    wrap.appendChild(svg);
                    wrap.onmouseenter = function () { wrap.style.background = 'rgba(26,111,207,.32)'; };
                    wrap.onmouseleave = function () { wrap.style.background = 'rgba(26,111,207,.18)'; };
                }
                var irAPagina = function (e) {
                    e.stopPropagation();
                    pausarAudiosRef();
                    if (!pageFlip) return;
                    var destIdx = Math.max(0, n - 1);
                    // Pre-renderizar la página destino + vecinas antes de navegar
                    asegurarPaginasVisiblesRef(destIdx).then(function () {
                        pageFlip.flip(destIdx);
                    });
                };
                // Desktop: click normal
                wrap.addEventListener('click', irAPagina);
                // Móvil: touchend con detección de tap (StPageFlip consume los clicks sintéticos en overlays)
                var _tapX = 0, _tapY = 0;
                wrap.addEventListener('touchstart', function (e) {
                    if (e.touches.length === 1) {
                        _tapX = e.touches[0].clientX;
                        _tapY = e.touches[0].clientY;
                    }
                }, { passive: true });
                wrap.addEventListener('touchend', function (e) {
                    if (e.changedTouches.length === 0) return;
                    var dx = Math.abs(e.changedTouches[0].clientX - _tapX);
                    var dy = Math.abs(e.changedTouches[0].clientY - _tapY);
                    // Si es un tap (sin desplazamiento), navegar. preventDefault cancela el click sintético para no duplicar.
                    if (dx < 10 && dy < 10) {
                        e.preventDefault();
                        irAPagina(e);
                    }
                }, { passive: false });
            } else if (href) {
                var linkColor = d.color || '#1a6fcf';
                if (esInvisible) {
                    wrap.style.cssText += ';background:transparent;border:none;';
                } else {
                    wrap.style.cssText += ';background:rgba(26,111,207,.18);border:2px solid ' + linkColor + ';border-radius:6px;display:flex;align-items:center;justify-content:center;';
                }
                var a = document.createElement('a');
                a.href = href; a.title = d.titulo || href;
                a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
                if (!href.startsWith('mailto:') && !href.startsWith('tel:')) {
                    a.target = '_blank'; a.rel = 'noopener noreferrer';
                }
                if (!esInvisible) {
                    // Ícono según tipo de link
                    var iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    iconSvg.setAttribute('viewBox', '0 0 24 24'); iconSvg.setAttribute('fill', linkColor);
                    iconSvg.style.cssText = 'width:50%;height:50%;max-width:36px;max-height:36px;pointer-events:none;';
                    var iconPath = 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 000-10z'; // link icon
                    if (href.startsWith('mailto:')) iconPath = 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z'; // email
                    else if (href.startsWith('tel:')) iconPath = 'M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.11-.27c1.21.49 2.53.76 3.89.76.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z'; // phone
                    iconSvg.innerHTML = '<path d="' + iconPath + '"/>';
                    a.appendChild(iconSvg);
                }
                wrap.appendChild(a);
                if (!esInvisible) {
                    wrap.onmouseenter = function () { wrap.style.background = 'rgba(26,111,207,.32)'; };
                    wrap.onmouseleave = function () { wrap.style.background = 'rgba(26,111,207,.18)'; };
                }
            }
        }

        function extraerIdYoutube(url) {
            const m = url.match(/(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }

    });
})();