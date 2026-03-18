/**
 * Soporta los cuatro tipos de overlay:
 *   - youtube:      iframe embed o modal popup
 *   - imagen:       etiqueta img con object-fit: cover
 *   - presentacion: slider con autoplay, flechas y transiciones
 *   - audio:        botón rojo con ícono SVG, toggle play/pause
 */

(function () {
    'use strict';

    // Inicializar todos los flipbooks presentes en la página
    document.querySelectorAll( '.flipbook-contenedor' ).forEach( function ( contenedor ) {

        const flipbookId = contenedor.dataset.flipbookId;
        const datos      = window[ 'flipbookData_' + flipbookId ];

        if ( ! datos ) return;

        // Referencias a elementos del DOM del visor
        const canvas         = contenedor.querySelector( '.flipbook-canvas' );
        const capaOverlays   = contenedor.querySelector( '.flipbook-overlays' );
        const paginaActualEl = contenedor.querySelector( '.flipbook-pagina-actual' );
        const btnAnterior    = contenedor.querySelector( '.flipbook-anterior' );
        const btnSiguiente   = contenedor.querySelector( '.flipbook-siguiente' );

        let pdfDoc       = null;
        let paginaActual = 1;
        const totalPaginas = datos.paginas;

        // Configurar el worker de PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Cargar el documento PDF
        pdfjsLib.getDocument( datos.pdf_url ).promise.then( function ( pdf ) {
            pdfDoc = pdf;
            renderizarPagina( 1 );
        });

        // Eventos de navegación entre páginas
        btnAnterior.addEventListener( 'click', function () { irAPagina( paginaActual - 1 ); });
        btnSiguiente.addEventListener( 'click', function () { irAPagina( paginaActual + 1 ); });

        function irAPagina( n ) {
            if ( n < 1 || n > totalPaginas ) return;
            paginaActual = n;
            renderizarPagina( n );
            if ( paginaActualEl ) paginaActualEl.textContent = n;
        }

        function renderizarPagina( num ) {
            pdfDoc.getPage( num ).then( function ( pagina ) {
                const viewport    = pagina.getViewport({ scale: 1.5 });
                canvas.width  = viewport.width;
                canvas.height = viewport.height;

                capaOverlays.style.width  = viewport.width  + 'px';
                capaOverlays.style.height = viewport.height + 'px';

                pagina.render({
                    canvasContext: canvas.getContext( '2d' ),
                    viewport
                }).promise.then( function () {
                    renderizarOverlays( num, viewport.width, viewport.height );
                });
            });
        }

        function renderizarOverlays( numPagina, W, H ) {
            capaOverlays.innerHTML = '';

            const overlaysPagina = ( datos.overlays || [] ).filter(
                ov => parseInt( ov.pagina ) === numPagina
            );

            overlaysPagina.forEach( function ( ov ) {
                const el = crearElementoOverlay( ov, W, H );
                if ( el ) capaOverlays.appendChild( el );
            });
        }

        function crearElementoOverlay( ov, W, H ) {
            const left  = ( parseFloat( ov.pos_left ) / 100 ) * W;
            const top   = ( parseFloat( ov.pos_top )  / 100 ) * H;
            const ancho = ( parseFloat( ov.ancho )     / 100 ) * W;
            const alto  = ( parseFloat( ov.alto )      / 100 ) * H;

            const contenedor = document.createElement( 'div' );
            contenedor.style.cssText =
                `position:absolute; left:${left}px; top:${top}px;`
              + `width:${ancho}px; height:${alto}px;`
              + `overflow:hidden; border-radius:4px;`;

            const d = ov.datos || {};

            switch ( ov.tipo ) {
                case 'youtube':     construirYoutube     ( contenedor, d ); break;
                case 'imagen':      construirImagen      ( contenedor, d ); break;
                case 'presentacion': construirPresentacion( contenedor, d ); break;
                case 'audio':       construirAudio       ( contenedor, d ); break;
                default: return null;
            }

            return contenedor;
        }

        /* =========================================================
           CONSTRUCTORES DE OVERLAY POR TIPO
        ========================================================= */

        /**
         * Overlay de YouTube.
         */
        function construirYoutube( wrap, d ) {
            if ( d.modo === 'popup' ) {
                // Miniatura del video de YouTube
                const urlMiniatura = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
                wrap.style.cursor = 'pointer';
                wrap.innerHTML = `
                    <div style="position:relative; width:100%; height:100%;">
                        <img src="${urlMiniatura}"
                             style="width:100%; height:100%; object-fit:cover;" />
                        <!-- Ícono de play superpuesto -->
                        <div style="position:absolute; inset:0; display:flex;
                                    align-items:center; justify-content:center;">
                            <div style="width:54px; height:54px; background:rgba(0,0,0,.7);
                                        border-radius:50%; display:flex; align-items:center;
                                        justify-content:center;">
                                <svg viewBox="0 0 24 24" fill="white" width="28" height="28">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </div>
                        </div>
                    </div>`;

                wrap.addEventListener( 'click', function () {
                    abrirPopupYoutube( d );
                });

            } else {
                // Modo embed: iframe directo del video
                const parametros = new URLSearchParams({
                    autoplay: d.autoplay  || 0,
                    controls: d.controles !== undefined ? d.controles : 1,
                    mute:     d.silencio  || 0,
                    loop:     d.loop      || 0,
                    start:    d.inicio    || 0,
                    playlist: d.videoId,   // Necesario para que funcione 
                });

                const iframe = document.createElement( 'iframe' );
                iframe.src   = `https://www.youtube.com/embed/${d.videoId}?${parametros}`;
                iframe.style.cssText   = 'width:100%; height:100%; border:none;';
                iframe.allow           = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                iframe.allowFullscreen = true;
                wrap.appendChild( iframe );
            }
        }

        /**
         * Abre un modal fullscreen con el video de YouTube.
         */
        function abrirPopupYoutube( d ) {
            const modal = document.createElement( 'div' );
            modal.style.cssText =
                'position:fixed; inset:0; background:rgba(0,0,0,.85);'
              + 'z-index:999999; display:flex; align-items:center; justify-content:center;';

            const parametros = new URLSearchParams({
                autoplay: 1,
                controls: d.controles !== undefined ? d.controles : 1,
                mute:     d.silencio  || 0,
                loop:     d.loop      || 0,
                start:    d.inicio    || 0,
                playlist: d.videoId,
            });

            modal.innerHTML = `
                <div style="position:relative; width:90vw; max-width:800px;">
                    <!-- Botón de cierre del modal -->
                    <button style="position:absolute; top:-40px; right:0; background:none;
                                   border:none; color:#fff; font-size:30px; cursor:pointer;">✕</button>
                    <!-- Contenedor responsivo 16:9 -->
                    <div style="position:relative; padding-bottom:56.25%; height:0;">
                        <iframe src="https://www.youtube.com/embed/${d.videoId}?${parametros}"
                                style="position:absolute; inset:0; width:100%; height:100%; border:none;"
                                allowfullscreen></iframe>
                    </div>
                </div>`;

            // Cerrar al hacer clic en el botón o en el fondo del modal
            modal.querySelector( 'button' ).addEventListener( 'click',
                () => document.body.removeChild( modal )
            );
            modal.addEventListener( 'click', e => {
                if ( e.target === modal ) document.body.removeChild( modal );
            });

            document.body.appendChild( modal );
        }

        /**
         * Overlay de imagen.
         */
        function construirImagen( wrap, d ) {
            const img = document.createElement( 'img' );
            img.src   = d.url || '';
            img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
            wrap.appendChild( img );
        }

        /**
         * Overlay de presentación (slider).
         */
        function construirPresentacion( wrap, d ) {
            const imagenes = d.imagenes || [];
            if ( ! imagenes.length ) return;

            wrap.style.position = 'relative';

            // Mezclar aleatoriamente si la opción está activa
            let lista = d.aleatorio ? mezclarArray( [ ...imagenes ] ) : [ ...imagenes ];
            let indice = 0;
            let temporizador = null;
            const duracion = ( parseInt( d.duracion ) || 3 ) * 1000;

            // Crear el contenedor interno de slides
            const inner = document.createElement( 'div' );
            inner.style.cssText = 'position:relative; width:100%; height:100%; overflow:hidden;';

            // Crear un div por cada imagen
            lista.forEach( function ( src, i ) {
                const slide = document.createElement( 'div' );
                slide.style.cssText =
                    `position:absolute; inset:0;`
                  + `background: url(${src}) center/cover no-repeat;`
                  + `opacity: ${i === 0 ? 1 : 0};`
                  + `transition: opacity .5s;`;
                slide.dataset.indice = i;
                inner.appendChild( slide );
            });

            wrap.appendChild( inner );

            // Agregar flechas de navegación 
            if ( d.flechas ) {
                const estiloBoton =
                    'position:absolute; top:50%; transform:translateY(-50%);'
                  + 'background:rgba(0,0,0,.5); color:#fff; border:none;'
                  + 'width:28px; height:28px; border-radius:50%;'
                  + 'cursor:pointer; font-size:16px; z-index:10;'
                  + 'display:flex; align-items:center; justify-content:center;';

                const btnPrev = document.createElement( 'button' );
                btnPrev.style.cssText = estiloBoton + 'left:6px;';
                btnPrev.innerHTML = '‹';

                const btnNext = document.createElement( 'button' );
                btnNext.style.cssText = estiloBoton + 'right:6px;';
                btnNext.innerHTML = '›';

                btnPrev.addEventListener( 'click', () => { detenerTemporizador(); mostrarSlide( indice - 1 ); });
                btnNext.addEventListener( 'click', () => { detenerTemporizador(); mostrarSlide( indice + 1 ); });

                wrap.appendChild( btnPrev );
                wrap.appendChild( btnNext );
            }

            function mostrarSlide( n ) {
                const total  = lista.length;
                if ( d.loop ) {
                    indice = ( ( n % total ) + total ) % total;
                } else {
                    indice = Math.max( 0, Math.min( n, total - 1 ) );
                }
                Array.from( inner.children ).forEach( ( slide, i ) => {
                    slide.style.opacity = i === indice ? '1' : '0';
                });
            }

            function iniciarTemporizador() {
                if ( ! d.autoplay ) return;
                temporizador = setInterval( () => mostrarSlide( indice + 1 ), duracion );
            }

            function detenerTemporizador() {
                if ( temporizador ) { clearInterval( temporizador ); temporizador = null; }
            }

            iniciarTemporizador();
        }

        /**
         * Overlay de audio.
         */
        function construirAudio( wrap, d ) {
            // Estilos del botón rojo
            wrap.style.background     = '#C70000';
            wrap.style.display        = 'flex';
            wrap.style.alignItems     = 'center';
            wrap.style.justifyContent = 'center';
            wrap.style.cursor         = 'pointer';
            wrap.style.borderRadius   = '6px';

            // Elemento de audio HTML
            const audio = document.createElement( 'audio' );
            audio.src     = d.url || '';
            audio.preload = 'auto';
            if ( d.autoplay ) audio.autoplay = true;

            // Ícono de altavoz en blanco
            const iconoSVG = document.createElementNS( 'http://www.w3.org/2000/svg', 'svg' );
            iconoSVG.setAttribute( 'viewBox', '0 0 24 24' );
            iconoSVG.setAttribute( 'fill',    'white' );
            iconoSVG.setAttribute( 'width',   '40%' );
            iconoSVG.setAttribute( 'height',  '40%' );
            iconoSVG.innerHTML =
                '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';

            let reproduciendo = d.autoplay || false;

            wrap.appendChild( audio );
            wrap.appendChild( iconoSVG );

            // Alternar play/pause al hacer clic
            wrap.addEventListener( 'click', function () {
                if ( reproduciendo ) {
                    audio.pause();
                    wrap.style.background = '#C70000';   // Rojo normal al pausar
                } else {
                    audio.play();
                    wrap.style.background = '#9B0000';   // Rojo más oscuro al reproducir
                }
                reproduciendo = ! reproduciendo;
            });
        }

        /* =========================================================
           UTILIDADES
        ========================================================= */

        function mezclarArray( arr ) {
            for ( let i = arr.length - 1; i > 0; i-- ) {
                const j = Math.floor( Math.random() * ( i + 1 ) );
                [ arr[i], arr[j] ] = [ arr[j], arr[i] ];
            }
            return arr;
        }

    }); 

})();
