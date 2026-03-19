/**
 * viewer.js — Visor público de Flipbook (frontend)
 * Renderiza el PDF y los overlays multimedia para los visitantes del sitio.
 */
(function () {
    'use strict';

    document.querySelectorAll( '.flipbook-contenedor' ).forEach( function ( contenedor ) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos      = window[ 'flipbookData_' + flipbookId ];
        
        console.log( '📖 Flipbook ID:', flipbookId );
        console.log( '📊 Datos recibidos:', datos );
        
        if ( ! datos ) {
            console.error( '❌ No hay datos para flipbook:', flipbookId );
            return;
        }

        const canvas         = contenedor.querySelector( '.flipbook-canvas' );
        const capaOverlays   = contenedor.querySelector( '.flipbook-overlays' );
        const paginaActualEl = contenedor.querySelector( '.flipbook-pagina-actual' );
        const btnAnt         = contenedor.querySelector( '.flipbook-anterior' );
        const btnSig         = contenedor.querySelector( '.flipbook-siguiente' );

        let pdfDoc       = null;
        let paginaActual = 1;
        const total      = datos.paginas;

        console.log( '⚙️  Page numbers config:', datos.page_numbers_config );

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        pdfjsLib.getDocument( datos.pdf_url ).promise.then( function ( pdf ) {
            pdfDoc = pdf;
            renderizarPagina( 1 );
        });

        btnAnt.addEventListener( 'click', () => irA( paginaActual - 1 ) );
        btnSig.addEventListener( 'click', () => irA( paginaActual + 1 ) );

        function irA( n ) {
            if ( n < 1 || n > total ) return;
            paginaActual = n;
            renderizarPagina( n );
            if ( paginaActualEl ) paginaActualEl.textContent = n;
        }

        function renderizarPagina( num ) {
            pdfDoc.getPage( num ).then( function ( pag ) {
                const vp = pag.getViewport({ scale: 1.5 });
                canvas.width  = vp.width;
                canvas.height = vp.height;
                capaOverlays.style.width  = vp.width  + 'px';
                capaOverlays.style.height = vp.height + 'px';
                pag.render({ canvasContext: canvas.getContext( '2d' ), viewport: vp })
                   .promise.then( () => renderizarOverlays( num, vp.width, vp.height ) );
            });
        }

        function renderizarOverlays( numPag, W, H ) {
            // Detener audios antes de limpiar
            capaOverlays.querySelectorAll( 'audio' ).forEach( a => a.pause() );
            capaOverlays.innerHTML = '';

            ( datos.overlays || [] )
                .filter( ov => parseInt( ov.pagina ) === numPag )
                .forEach( ov => {
                    const el = crearOverlay( ov, W, H, numPag );
                    if ( el ) capaOverlays.appendChild( el );
                });
        }

        function crearOverlay( ov, W, H, numPag ) {
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
                case 'numero-pagina': buildNumeroPagina ( wrap, d, numPag ); break;
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
            wrap.style.cssText =
                'background:#C70000;display:flex;align-items:center;justify-content:center;'
              + 'cursor:pointer;border-radius:6px;';

            const audio = document.createElement( 'audio' );
            audio.src     = d.url || '';
            audio.preload = 'auto';
            if ( d.autoplay ) audio.autoplay = true;

            const svg = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
            svg.setAttribute( 'viewBox', '0 0 24 24' );
            svg.setAttribute( 'fill',    'white' );
            svg.setAttribute( 'width',   '45%' );
            svg.setAttribute( 'height',  '45%' );
            svg.innerHTML =
                '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';

            let playing = !! d.autoplay;
            wrap.appendChild( audio );
            wrap.appendChild( svg );

            wrap.addEventListener( 'click', function () {
                if ( playing ) { audio.pause(); wrap.style.background = '#C70000'; }
                else           { audio.play();  wrap.style.background = '#9B0000'; }
                playing = ! playing;
            });
            audio.addEventListener( 'ended', function () {
                playing = false; wrap.style.background = '#C70000';
            });
        }

        /* ── Número de Página ── */
        function buildNumeroPagina( wrap, d, numPag ) {
            const color = d.color || '#000000';
            const tam = d.tamanio || 24;
            const peso = d.peso || 600;
            
            wrap.style.cssText = 
                `display:flex;align-items:center;justify-content:center;`
              + `color:${color};font-size:${tam}px;font-weight:${peso};`
              + `background:rgba(255,255,255,0.05);border-radius:4px;`;
            
            wrap.innerHTML = `<div style="line-height:1;">${numPag}</div>`;
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