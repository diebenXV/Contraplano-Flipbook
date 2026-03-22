/**
 * viewer.js — Visor público de Flipbook (frontend)
 * Renderiza el PDF y los overlays multimedia para los visitantes del sitio.
 */
(function () {
    'use strict';

    document.querySelectorAll( '.flipbook-contenedor' ).forEach( function ( contenedor ) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos      = window[ 'flipbookData_' + flipbookId ];
        if ( ! datos ) return;

        const canvas         = contenedor.querySelector( '.flipbook-canvas' );
        const canvasWrapper  = contenedor.querySelector( '.flipbook-canvas-wrapper' );
        const capaOverlays   = contenedor.querySelector( '.flipbook-overlays' );
        const paginaActualEl = contenedor.querySelector( '.flipbook-pagina-actual' );
        const btnAnt         = contenedor.querySelector( '.flipbook-anterior' );
        const btnSig         = contenedor.querySelector( '.flipbook-siguiente' );

        let pdfDoc       = null;
        let paginaActual = 1;
        const total      = datos.paginas;
        let ultimaDireccion = 'next';
        let resizeTimer = null;
        let renderToken = 0;

        // Configuración de números de página (viene desde PHP vía shortcode)
        const configNumeros = datos.config_numeros || {
            colorNumero:   '#666666',
            colorFondo:    '#FFFFFF',
            opacidadFondo: 0.8,
            posicion:      'inferior-derecha',
            tamanio:       14,
            mostrar:       true,
        };

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        pdfjsLib.getDocument({
            url:             datos.pdf_url,
            withCredentials: false,
            cMapUrl:         'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked:      true,
        }).promise.then( function ( pdf ) {
            pdfDoc = pdf;
            renderizarPagina( 1, false );
        }).catch( function(err) {
            console.error( 'PDF.js viewer error:', err );
        });

        btnAnt.addEventListener( 'click', () => {
            ultimaDireccion = 'prev';
            irA( paginaActual - 1 );
        });
        btnSig.addEventListener( 'click', () => {
            ultimaDireccion = 'next';
            irA( paginaActual + 1 );
        });

        window.addEventListener( 'resize', function () {
            clearTimeout( resizeTimer );
            resizeTimer = setTimeout( function () {
                if ( pdfDoc ) renderizarPagina( paginaActual, false );
            }, 120 );
        });

        function irA( n ) {
            if ( n < 1 || n > total || ! pdfDoc ) return;
            ultimaDireccion = n > paginaActual ? 'next' : 'prev';
            paginaActual = n;
            renderizarPagina( n, true );
            if ( paginaActualEl ) paginaActualEl.textContent = n;
        }

        function renderizarPagina( num, animar ) {
            const token = ++renderToken;

            pdfDoc.getPage( num ).then( function ( pag ) {
                if ( token !== renderToken ) return;

                const baseVp = pag.getViewport({ scale: 1 });
                const hostEl = canvasWrapper || contenedor;
                const hostStyle = window.getComputedStyle( hostEl );
                const paddingX =
                    parseFloat( hostStyle.paddingLeft || '0' ) +
                    parseFloat( hostStyle.paddingRight || '0' );
                const anchoDisponible = Math.max( 220, hostEl.clientWidth - paddingX - 2 );
                const escalaMaxima = 1.5;
                const escala = Math.max( 0.35, Math.min( escalaMaxima, anchoDisponible / baseVp.width ) );
                const vp = pag.getViewport({ scale: escala });

                if ( animar ) aplicarAnimacionCambio( ultimaDireccion );

                canvas.width  = vp.width;
                canvas.height = vp.height;
                capaOverlays.style.width  = vp.width  + 'px';
                capaOverlays.style.height = vp.height + 'px';

                pag.render({ canvasContext: canvas.getContext( '2d' ), viewport: vp })
                   .promise.then( () => {
                       if ( token !== renderToken ) return;
                       dibujarNumeroPagina( canvas, num, total, configNumeros );
                       renderizarOverlays( num, vp.width, vp.height );
                   });
            });
        }

        function aplicarAnimacionCambio( direccion ) {
            if ( ! canvasWrapper ) return;
            const clase = direccion === 'prev' ? 'flipbook-turn-prev' : 'flipbook-turn-next';
            canvasWrapper.classList.remove( 'flipbook-turn-prev', 'flipbook-turn-next' );
            void canvasWrapper.offsetWidth;
            canvasWrapper.classList.add( clase );
            setTimeout( function () {
                canvasWrapper.classList.remove( clase );
            }, 460 );
        }

        function renderizarOverlays( numPag, W, H ) {
            // Detener audios antes de limpiar
            capaOverlays.querySelectorAll( 'audio' ).forEach( function ( a ) {
                a.pause();
                if ( a.parentElement ) {
                    a.parentElement.style.background = 'transparent';
                    a.parentElement.style.borderColor = 'rgba(255,255,255,0.45)';
                }
            });
            capaOverlays.innerHTML = '';

            ( datos.overlays || [] )
                .filter( ov => parseInt( ov.pagina ) === numPag )
                .forEach( ov => {
                    const el = crearOverlay( ov, W, H );
                    if ( el ) capaOverlays.appendChild( el );
                });
        }

        function crearOverlay( ov, W, H ) {
            const left  = ( parseFloat( ov.pos_left ) / 100 ) * W;
            const top   = ( parseFloat( ov.pos_top  ) / 100 ) * H;
            const ancho = ( parseFloat( ov.ancho     ) / 100 ) * W;
            const alto  = ( parseFloat( ov.alto      ) / 100 ) * H;

            const wrap = document.createElement( 'div' );
            wrap.style.cssText =
                `position:absolute;left:${left}px;top:${top}px;`
              + `width:${ancho}px;height:${alto}px;overflow:hidden;border-radius:4px;`;

            const d = ov.datos || {};

            switch ( ov.tipo ) {
                case 'youtube':      buildYoutube     ( wrap, d ); break;
                case 'imagen':       buildImagen      ( wrap, d ); break;
                case 'presentacion': buildPresentacion( wrap, d ); break;
                case 'audio':        buildAudio       ( wrap, d ); break;
                case 'link':         buildLink        ( wrap, d ); break;
                default: return null;
            }
            return wrap;
        }

        /* ── YouTube ── */
        function buildYoutube( wrap, d ) {
            if ( d.modo === 'popup' ) {
                const thumb = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
                wrap.style.cursor = 'pointer';
                wrap.innerHTML = `
                    <div style="position:relative;width:100%;height:100%;background:#000;">
                        <img src="${thumb}" style="width:100%;height:100%;object-fit:cover;opacity:.85;" />
                        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                            <div style="width:52px;height:52px;background:rgba(0,0,0,.72);border-radius:50%;
                                        display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">▶</div>
                        </div>
                    </div>`;
                wrap.addEventListener( 'click', () => abrirPopupYT( d ) );
            } else {
                const p = new URLSearchParams({
                    autoplay: d.autoplay  || 0,
                    controls: d.controles !== undefined ? d.controles : 1,
                    mute:     d.silencio  || 0,
                    loop:     d.loop      || 0,
                    start:    d.inicio    || 0,
                    playlist: d.videoId,
                });
                const iframe = document.createElement( 'iframe' );
                iframe.src   = `https://www.youtube.com/embed/${d.videoId}?${p}`;
                iframe.style.cssText   = 'width:100%;height:100%;border:none;';
                iframe.allow           = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
                iframe.allowFullscreen = true;
                wrap.appendChild( iframe );
            }
        }

        function abrirPopupYT( d ) {
            const modal = document.createElement( 'div' );
            modal.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999999;'
              + 'display:flex;align-items:center;justify-content:center;';
            const p = new URLSearchParams({
                autoplay: 1, controls: d.controles !== undefined ? d.controles : 1,
                mute: d.silencio || 0, loop: d.loop || 0,
                start: d.inicio || 0, playlist: d.videoId,
            });
            modal.innerHTML = `
                <div style="position:relative;width:90vw;max-width:800px;">
                    <button style="position:absolute;top:-42px;right:0;background:none;border:none;
                                   color:#fff;font-size:30px;cursor:pointer;line-height:1;">✕</button>
                    <div style="position:relative;padding-bottom:56.25%;height:0;">
                        <iframe src="https://www.youtube.com/embed/${d.videoId}?${p}"
                                style="position:absolute;inset:0;width:100%;height:100%;border:none;"
                                allowfullscreen></iframe>
                    </div>
                </div>`;
            modal.querySelector( 'button' ).onclick = () => document.body.removeChild( modal );
            modal.onclick = e => { if ( e.target === modal ) document.body.removeChild( modal ); };
            document.body.appendChild( modal );
        }

        /* ── Imagen ── */
        function buildImagen( wrap, d ) {
            const img = document.createElement( 'img' );
            img.src   = d.url || '';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            wrap.appendChild( img );
        }

        /* ── Presentación ── */
        function buildPresentacion( wrap, d ) {
            const imgs = d.imagenes || [];
            if ( ! imgs.length ) return;

            wrap.style.position = 'relative';
            let lista    = d.aleatorio ? mezclar( [...imgs] ) : [...imgs];
            let idx      = 0;
            let timer    = null;
            const dur    = ( parseInt( d.duracion ) || 3 ) * 1000;

            const inner = document.createElement( 'div' );
            inner.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';

            lista.forEach( ( src, i ) => {
                const s = document.createElement( 'div' );
                s.style.cssText =
                    `position:absolute;inset:0;`
                  + `background:url('${src}') center/cover no-repeat;`
                  + `opacity:${i === 0 ? 1 : 0};transition:opacity .5s;`;
                inner.appendChild( s );
            });
            wrap.appendChild( inner );

            if ( d.flechas ) {
                const btnStyle =
                    'position:absolute;top:50%;transform:translateY(-50%);'
                  + 'background:rgba(0,0,0,.55);color:#fff;border:none;'
                  + 'width:28px;height:28px;border-radius:50%;cursor:pointer;'
                  + 'font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
                const bp = document.createElement( 'button' );
                bp.style.cssText = btnStyle + 'left:5px;';
                bp.innerHTML = '‹';
                const bn = document.createElement( 'button' );
                bn.style.cssText = btnStyle + 'right:5px;';
                bn.innerHTML = '›';
                bp.onclick = () => { pararTimer(); mostrar( idx - 1 ); };
                bn.onclick = () => { pararTimer(); mostrar( idx + 1 ); };
                wrap.appendChild( bp );
                wrap.appendChild( bn );
            }

            function mostrar( n ) {
                const sl = inner.children;
                const t  = lista.length;
                idx = d.loop ? ( ( n % t ) + t ) % t : Math.max( 0, Math.min( n, t - 1 ) );
                Array.from( sl ).forEach( ( s, i ) => { s.style.opacity = i === idx ? '1' : '0'; });
            }
            function pararTimer() { if ( timer ) { clearInterval( timer ); timer = null; } }
            function arrancarTimer() {
                if ( ! d.autoplay ) return;
                timer = setInterval( () => mostrar( idx + 1 ), dur );
            }
            arrancarTimer();
        }

        /* ── Audio ── */
        function buildAudio( wrap, d ) {
                        const colorIcono = d.iconColor || d.colorIcono || d.color || '#FFFFFF';
                        const bgIdle = 'rgba(0,0,0,0.28)';
                        const bgActivo = 'rgba(0,0,0,0.46)';
                        const borderIdle = 'rgba(255,255,255,0.72)';
                        const borderActive = 'rgba(255,255,255,0.98)';
            const playPath = 'M8 5v14l11-7z';
            const pausePath = 'M7 5h3v14H7zm7 0h3v14h-3z';

                        wrap.classList.add( 'flipbook-audio-overlay' );
            wrap.style.cssText =
                                'background:' + bgIdle + ';display:flex;align-items:center;justify-content:center;'
                            + 'cursor:pointer;border-radius:6px;border:1px solid ' + borderIdle + ';'
                            + 'backdrop-filter:blur(1px);';

            const audio = document.createElement( 'audio' );
            audio.src     = d.url || '';
            audio.preload = 'auto';
            if ( d.autoplay ) audio.autoplay = true;

            const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
            svg.setAttribute( 'viewBox', '0 0 24 24' );
            svg.setAttribute( 'fill', colorIcono );
            svg.setAttribute( 'width',   '45%' );
            svg.setAttribute( 'height',  '45%' );
            svg.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.65))';
            svg.innerHTML = `<path d="${playPath}"/>`;

            let playing = !! d.autoplay;
            wrap.appendChild( audio );
            wrap.appendChild( svg );
            if ( playing ) {
                wrap.style.background = bgActivo;
                wrap.style.borderColor = borderActive;
                svg.innerHTML = `<path d="${pausePath}"/>`;
            }

            wrap.addEventListener( 'click', function () {
                if ( playing ) {
                    audio.pause();
                    wrap.style.background = bgIdle;
                    wrap.style.borderColor = borderIdle;
                    svg.innerHTML = `<path d="${playPath}"/>`;
                    playing = false;
                } else {
                    audio.play().then( function () {
                        wrap.style.background = bgActivo;
                        wrap.style.borderColor = borderActive;
                        svg.innerHTML = `<path d="${pausePath}"/>`;
                        playing = true;
                    }).catch( function () {
                        playing = false;
                    });
                }
            });
            audio.addEventListener( 'ended', function () {
                playing = false;
                wrap.style.background = bgIdle;
                wrap.style.borderColor = borderIdle;
                svg.innerHTML = `<path d="${playPath}"/>`;
            });
        }

        /* ── Enlace ── */
        function buildLink( wrap, d ) {
            let href = d.href || '';

            // Si es un enlace interno a página del flipbook
            if ( href.startsWith( 'pagina:' ) ) {
                const numPag = parseInt( href.replace( 'pagina:', '' ) );
                wrap.style.cursor = 'pointer';
                wrap.style.background = 'rgba(255,255,255,0.01)';
                wrap.title = d.titulo || ( 'Ir a página ' + numPag );
                wrap.addEventListener( 'click', () => irA( numPag ) );
            } else {
                // URL externa, email o teléfono
                const a  = document.createElement( 'a' );
                a.href   = href;
                a.title  = d.titulo || href;
                a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
                if ( d.nuevaPestana && ! href.startsWith( 'mailto:' ) && ! href.startsWith( 'tel:' ) ) {
                    a.target = '_blank';
                    a.rel    = 'noopener noreferrer';
                }
                wrap.appendChild( a );
                wrap = a; // las referencias de ícono van dentro del <a>
            }

            // Mostrar ícono si se configuró uno
            if ( d.icono && d.icono !== 'ninguno' ) {
                const color   = d.color || '#1a6fcf';
                const svgPaths = {
                    mas:      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z',
                    check:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z',
                    info:     'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
                    pregunta: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
                    carrito:  'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.25 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
                };
                if ( svgPaths[ d.icono ] ) {
                    const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
                    svg.setAttribute( 'viewBox', '0 0 24 24' );
                    svg.setAttribute( 'fill', color );
                    svg.setAttribute( 'width', '55%' );
                    svg.setAttribute( 'height', '55%' );
                    svg.innerHTML = `<path d="${svgPaths[d.icono]}"/>`;
                    wrap.appendChild( svg );
                }
            }
        }

        /* ── Número de página sobre el canvas ── */
        function dibujarNumeroPagina( canvas, paginaActual, totalPaginas, config ) {
            if ( ! config.mostrar ) return;

            const ctx      = canvas.getContext( '2d' );
            const padding  = 15;
            const fontSize = Math.max( config.tamanio, canvas.width * 0.015 );
            const texto    = paginaActual + ' / ' + totalPaginas;

            ctx.font         = 'bold ' + fontSize + 'px Arial, sans-serif';
            ctx.textBaseline = 'bottom';

            const metrics    = ctx.measureText( texto );
            const textWidth  = metrics.width;
            const textHeight = fontSize + 4;
            const pos        = config.posicion;

            let x, y;
            if      ( pos === 'inferior-derecha'   ) { ctx.textAlign='right';  x=canvas.width-padding;  y=canvas.height-padding; }
            else if ( pos === 'inferior-izquierda' ) { ctx.textAlign='left';   x=padding;               y=canvas.height-padding; }
            else if ( pos === 'inferior-centro'    ) { ctx.textAlign='center'; x=canvas.width/2;        y=canvas.height-padding; }
            else if ( pos === 'superior-derecha'   ) { ctx.textAlign='right';  x=canvas.width-padding;  y=padding+fontSize; }
            else if ( pos === 'superior-izquierda' ) { ctx.textAlign='left';   x=padding;               y=padding+fontSize; }
            else if ( pos === 'superior-centro'    ) { ctx.textAlign='center'; x=canvas.width/2;        y=padding+fontSize; }
            else if ( pos === 'centro'             ) { ctx.textAlign='center'; x=canvas.width/2;        y=(canvas.height/2)+(fontSize/2); }

            const bgW = textWidth+8, bgH = textHeight+4;
            let bgX, bgY;
            if      ( pos === 'inferior-derecha'   ) { bgX=canvas.width-textWidth-padding-4; bgY=canvas.height-textHeight-padding; }
            else if ( pos === 'inferior-izquierda' ) { bgX=padding-4;                        bgY=canvas.height-textHeight-padding; }
            else if ( pos === 'inferior-centro'    ) { bgX=(canvas.width/2)-(bgW/2);         bgY=canvas.height-textHeight-padding; }
            else if ( pos === 'superior-derecha'   ) { bgX=canvas.width-textWidth-padding-4; bgY=padding-4; }
            else if ( pos === 'superior-izquierda' ) { bgX=padding-4;                        bgY=padding-4; }
            else if ( pos === 'superior-centro'    ) { bgX=(canvas.width/2)-(bgW/2);         bgY=padding-4; }
            else if ( pos === 'centro'             ) { bgX=(canvas.width/2)-(bgW/2);         bgY=(canvas.height/2)-(bgH/2); }

            const rgb = hexRgb( config.colorFondo );
            ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + config.opacidadFondo + ')';
            ctx.fillRect( bgX, bgY, bgW, bgH );

            ctx.fillStyle = config.colorNumero;
            ctx.fillText( texto, x, y );
        }

        function hexRgb( hex ) {
            const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec( hex );
            return r ? { r:parseInt(r[1],16), g:parseInt(r[2],16), b:parseInt(r[3],16) } : {r:102,g:102,b:102};
        }

        /* ── Util ── */
        function mezclar( arr ) {
            for ( let i = arr.length - 1; i > 0; i-- ) {
                const j = Math.floor( Math.random() * ( i + 1 ) );
                [ arr[i], arr[j] ] = [ arr[j], arr[i] ];
            }
            return arr;
        }
    });
})();
