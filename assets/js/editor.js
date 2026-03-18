/**
 * editor.js — Editor visual de Flipbook (panel de administración)
 *
 * Gestiona toda la interfaz del editor: construcción del HTML,
 * carga del PDF con PDF.js, drag & drop de overlays, modales
 * de inserción y comunicación AJAX con el servidor.
 */

(function ($) {
    'use strict';

    // Estado global
    const estado = {
        flipbookId:    parseInt( flipbookAdmin.flipbook_id ) || 0,
        pdfUrl:        flipbookAdmin.pdf_url || '',
        totalPaginas:  parseInt( flipbookAdmin.pdf_paginas ) || 0,
        paginaActual:  1,
        pdfDoc:        null,
        overlays:      [],
        seleccionado:  null,
        arrastrando:   false,
        redimensionando: false,
        arrastre: { offsetX: 0, offsetY: 0 },
        resize: { startX: 0, startY: 0, startW: 0, startH: 0 },
    };

    const COLOR_AUDIO = '#C70000';
    let contadorTemp = 1;

    // Inicialización
    $( document ).ready( function () {
        construirEditor();
        if ( estado.pdfUrl && estado.totalPaginas > 0 ) {
            cargarPDF( estado.pdfUrl );
        }
        if ( estado.flipbookId ) {
            cargarOverlays();
        }
    });

    // Construir interfaz
    function construirEditor() {
        const html = `
        <div id="editor-app">

            <!-- BARRA SUPERIOR: título, cargador de PDF y botón guardar -->
            <div class="barra-superior">
                <div class="barra-izquierda">
                    <label>Título:</label>
                    <input type="text" id="input-titulo"
                           value="${escaparHtml( flipbookAdmin.titulo )}"
                           placeholder="Nombre del flipbook" />
                </div>
                <div class="barra-centro">
                    <label class="label-subir-pdf">
                        <span>📄 Cargar PDF</span>
                        <input type="file" id="input-pdf" accept=".pdf" />
                    </label>
                    <span id="info-pdf"></span>
                </div>
                <div class="barra-derecha">
                    <button id="btn-guardar" class="btn-primario">💾 Guardar cambios</button>
                </div>
            </div>

            <!-- ÁREA PRINCIPAL: sidebar de herramientas + canvas del PDF -->
            <div class="area-principal">

                <!-- SIDEBAR IZQUIERDO: herramientas y controles -->
                <div class="sidebar">

                    <div class="sidebar-titulo">Insertar elemento</div>

                    <!-- Botones de herramientas multimedia -->
                    <button class="btn-herramienta" data-tipo="youtube">
                        <span class="icono-herramienta">▶</span>
                        Insertar video de YouTube
                    </button>
                    <button class="btn-herramienta" data-tipo="imagen">
                        <span class="icono-herramienta">🖼</span>
                        Insertar imagen
                    </button>
                    <button class="btn-herramienta" data-tipo="presentacion">
                        <span class="icono-herramienta">📽</span>
                        Insertar presentación
                    </button>
                    <button class="btn-herramienta" data-tipo="audio">
                        <span class="icono-herramienta" style="color:${COLOR_AUDIO}">🔊</span>
                        Insertar sonido
                    </button>

                    <div class="separador"></div>
                    <div class="sidebar-titulo">Página</div>

                    <!-- Navegación entre páginas del PDF -->
                    <div class="nav-paginas">
                        <button id="btn-anterior">‹</button>
                        <span>
                            <input type="number" id="input-pagina" min="1" value="1" />
                            / <span id="total-paginas">0</span>
                        </span>
                        <button id="btn-siguiente">›</button>
                    </div>

                    <!-- Panel de posición y tamaño (visible al seleccionar un overlay) -->
                    <div id="panel-posicion" style="display:none;">
                        <div class="sidebar-titulo">Posición y tamaño</div>
                        <div class="grilla-posicion">
                            <div class="campo-posicion">
                                <label>Izquierda:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-left" step="0.1" />
                                    <span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Parte superior:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-top" step="0.1" />
                                    <span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Ancho:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-ancho" step="0.1" />
                                    <span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Altura:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-alto" step="0.1" />
                                    <span>%</span>
                                </div>
                            </div>
                        </div>
                        <button id="btn-eliminar" class="btn-peligro">🗑 Eliminar elemento</button>
                    </div>

                </div>

                <!-- ÁREA DEL CANVAS: donde se renderiza el PDF y se posicionan los overlays -->
                <div class="area-canvas">
                    <div id="contenedor-pagina">
                        <canvas id="canvas-pdf"></canvas>
                        <!-- Capa transparente sobre el PDF donde se dibujan los overlays -->
                        <div id="capa-overlays"></div>
                    </div>
                </div>

            </div>
        </div>

        <!-- FONDO OSCURO de los modales -->
        <div id="fondo-modal" style="display:none;"></div>

        <!-- MODAL: Insertar video de YouTube -->
        <div id="modal-youtube" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar video de Youtube</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <label>URL de Youtube:</label>
                    <input type="text" id="yt-url"
                           placeholder="https://youtu.be/z1FaIXbVKZk o https://www.youtube.com/watch?v=z1FaIXbVKZk" />
                    <small>Ejemplo: https://youtu.be/z1FaIXbVKZk, https://www.youtube.com/watch?v=z1FaIXbVKZk o z1FaIXbVKZk</small>

                    <div class="grupo-checkboxes">
                        <label><input type="checkbox" id="yt-controles" checked /> Mostrar controles</label>
                        <label><input type="checkbox" id="yt-autoplay" /> Reproducción automática</label>
                        <label><input type="checkbox" id="yt-silencio" /> Silenciado</label>
                        <label><input type="checkbox" id="yt-loop" /> Loop</label>
                    </div>

                    <label>Comienza en:</label>
                    <input type="text" id="yt-inicio" value="00:00" placeholder="00:00" />

                    <div class="grupo-radio">
                        <label><input type="radio" name="yt-modo" value="embed" checked /> Embed</label>
                        <label><input type="radio" name="yt-modo" value="popup" /> Popup</label>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-youtube" class="btn-confirmar">De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL: Insertar imagen -->
        <div id="modal-imagen" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar imagen</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="zona-arrastre" id="zona-imagen" style="cursor: pointer;">
                        <span style="pointer-events: none;">⬆ Selecciona o arrastra una imagen aquí</span>
                        <input type="file" id="archivo-imagen" accept="image/*" style="cursor: pointer;" />
                    </div>
                    <div id="vista-previa-imagen" style="display:none;">
                        <img id="img-previa" src="" style="max-width:100%;max-height:200px;" />
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-imagen" class="btn-confirmar">De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL: Insertar presentación de diapositivas -->
        <div id="modal-presentacion" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar presentación de diapositivas</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="zona-arrastre" id="zona-presentacion" style="cursor: pointer;">
                        <span style="pointer-events: none;">⬆ Selecciona un archivo de imagen. Tamaño máximo permitido: 10 MB.</span>
                        <button id="btn-seleccionar-slides" class="btn-secundario" type="button">Seleccionar archivos</button>
                        <input type="file" id="archivos-slides" accept="image/*" multiple style="display:none; cursor: pointer;" />
                    </div>
                    <div id="miniaturas-slides"></div>
                    <small>Se pueden seleccionar como máximo 10 imágenes. La primera imagen establece la relación de aspecto.</small>

                    <div class="separador"></div>
                    <strong>Configuración de la presentación de diapositivas</strong>

                    <div class="grupo-checkboxes">
                        <label><input type="checkbox" id="slide-autoplay" checked /> Reproducción automática</label>
                        <label><input type="checkbox" id="slide-loop" checked /> Loop</label>
                        <label><input type="checkbox" id="slide-aleatorio" /> Aleatorio</label>
                        <label><input type="checkbox" id="slide-flechas" /> Mostrar flechas de navegación</label>
                    </div>

                    <div class="dos-columnas">
                        <div>
                            <label>Tiempo de visualización de la imagen:</label>
                            <select id="slide-duracion">
                                <option value="1">1 segundo</option>
                                <option value="2">2 segundo</option>
                                <option value="3" selected>3 segundo</option>
                                <option value="4">4 segundo</option>
                                <option value="5">5 segundo</option>
                            </select>
                        </div>
                        <div>
                            <label>Transición:</label>
                            <select id="slide-transicion">
                                <option value="slide" selected>Diapositiva</option>
                                <option value="fade">Fundido</option>
                                <option value="zoom">Zoom</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-presentacion" class="btn-confirmar">De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL: Insertar sonido -->
        <div id="modal-audio" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar sonido</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <!-- Toggle de reproducción automática -->
                    <div class="fila-toggle-audio">
                        <label>Autoplay</label>
                        <label class="toggle">
                            <input type="checkbox" id="audio-autoplay" />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="zona-arrastre" id="zona-audio" style="cursor: pointer;">
                        <span style="pointer-events: none;">⬆ Selecciona un archivo de audio (mp3, wav, ogg)</span>
                        <input type="file" id="archivo-audio" accept="audio/*" style="cursor: pointer;" />
                    </div>
                    <div id="nombre-audio" style="display:none;"></div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-audio" class="btn-confirmar">De acuerdo</button>
                </div>
            </div>
        </div>
        `;

        $( '#flipbook-cargando' ).replaceWith( html );
        vincularEventos();
    }

    // Vincular eventos
    function vincularEventos() {

        // Subida de PDF
        $( '#input-pdf' ).on( 'change', function () {
            const archivo = this.files[0];
            if ( archivo ) subirPDF( archivo );
        });

        // Abrir modales al hacer clic en los botones de herramienta
        $( document ).on( 'click', '.btn-herramienta', function () {
            abrirModal( $( this ).data( 'tipo' ) );
        });

        // Cerrar modales
        $( document ).on( 'click', '.cerrar-modal, #fondo-modal', cerrarTodosLosModales );

        // Confirmaciones de cada modal
        $( '#confirmar-youtube'      ).on( 'click', confirmarYoutube );
        $( '#confirmar-imagen'       ).on( 'click', confirmarImagen );
        $( '#confirmar-presentacion' ).on( 'click', confirmarPresentacion );
        $( '#confirmar-audio'        ).on( 'click', confirmarAudio );

        // Botón para abrir el selector de archivos de slides
        $( '#btn-seleccionar-slides' ).on( 'click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $( '#archivos-slides' ).trigger( 'click' );
        });
        
        $( '#archivos-slides' ).on( 'change', function () {
            previsualizarSlides( this.files );
        });

        // Vista previa de imagen seleccionada
        $( '#archivo-imagen' ).on( 'change', function () {
            const archivo = this.files[0];
            if ( ! archivo ) return;
            const lector = new FileReader();
            lector.onload = e => {
                $( '#img-previa' ).attr( 'src', e.target.result );
                $( '#vista-previa-imagen' ).show();
            };
            lector.readAsDataURL( archivo );
        });

        // Mostrar nombre del audio seleccionado
        $( '#archivo-audio' ).on( 'change', function () {
            const archivo = this.files[0];
            if ( archivo ) {
                $( '#nombre-audio' ).text( 'Archivo: ' + archivo.name ).show();
            }
        });

        // Navegación entre páginas del PDF
        $( '#btn-anterior' ).on( 'click', () => irAPagina( estado.paginaActual - 1 ) );
        $( '#btn-siguiente' ).on( 'click', () => irAPagina( estado.paginaActual + 1 ) );
        $( '#input-pagina' ).on( 'change', function () {
            irAPagina( parseInt( this.value ) );
        });

        // Cambios en los inputs numéricos de posición/tamaño
        $( '#pos-left, #pos-top, #pos-ancho, #pos-alto' ).on( 'input', actualizarDesdeInputs );

        // Eliminar el overlay seleccionado
        $( '#btn-eliminar' ).on( 'click', eliminarSeleccionado );

        // Guardar todos los overlays
        $( '#btn-guardar' ).on( 'click', guardarTodo );

        // Configurar drag & drop en las zonas de arrastre
        configurarArrastrable( '#zona-imagen', '#archivo-imagen' );
        configurarArrastrable( '#zona-presentacion', '#archivos-slides' );
        configurarArrastrable( '#zona-audio', '#archivo-audio' );
    }

    // PDF.js y renderizado
    function cargarPDF( url ) {
        const fd = new FormData();
        fd.append( 'action',       'flipbook_subir_pdf' );
        fd.append( 'nonce',        flipbookAdmin.nonce );
        fd.append( 'pdf_file',     archivo );
        fd.append( 'titulo',       $( '#input-titulo' ).val() || archivo.name );
        fd.append( 'flipbook_id',  estado.flipbookId );

        $( '#info-pdf' ).text( 'Subiendo y comprimiendo PDF...' );

        $.ajax({
            url:         flipbookAdmin.ajax_url,
            method:      'POST',
            data:        fd,
            processData: false,
            contentType: false,
            success( respuesta ) {
                if ( respuesta.success ) {
                    const datos = respuesta.data;
                    estado.flipbookId   = datos.flipbook_id;
                    estado.pdfUrl       = datos.pdf_url;
                    estado.totalPaginas = datos.paginas;

                    $( '#info-pdf' ).text(
                        `✓ PDF cargado (${datos.tamanio}) — ${datos.paginas} páginas`
                    );
                    $( '#total-paginas' ).text( estado.totalPaginas );
                    $( '#input-pagina' ).attr( 'max', estado.totalPaginas );

                    cargarPDF( datos.pdf_url );
                } else {
                    $( '#info-pdf' ).text( 'Error: ' + respuesta.data );
                }
            },
            error() {
                $( '#info-pdf' ).text( 'Error al conectar con el servidor.' );
            }
        });
    }

    // Cargar PDF desde URL
    function cargarPDF( url ) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        pdfjsLib.getDocument( url ).promise.then( pdf => {
            estado.pdfDoc       = pdf;
            estado.totalPaginas = pdf.numPages;
            $( '#total-paginas' ).text( estado.totalPaginas );
            $( '#input-pagina' ).attr( 'max', estado.totalPaginas );
            renderizarPagina( estado.paginaActual );
        });
    }

    // Renderizar página del PDF en canvas
    function renderizarPagina( num ) {
        if ( ! estado.pdfDoc ) return;

        // Limitar el número de página al rango válido
        num = Math.max( 1, Math.min( num, estado.totalPaginas ) );
        estado.paginaActual = num;
        $( '#input-pagina' ).val( num );

        estado.pdfDoc.getPage( num ).then( pagina => {
            const viewport = pagina.getViewport({ scale: 1.5 });
            const canvas   = document.getElementById( 'canvas-pdf' );
            const ctx      = canvas.getContext( '2d' );

            canvas.width  = viewport.width;
            canvas.height = viewport.height;

            // Ajustar el contenedor al tamaño del canvas
            $( '#contenedor-pagina' ).css({
                width:  viewport.width  + 'px',
                height: viewport.height + 'px',
            });

            pagina.render({ canvasContext: ctx, viewport }).promise.then( () => {
                renderizarOverlays();
            });
        });
    }

    function irAPagina( n ) {
        renderizarPagina( n );
    }

    // Overlays
    function renderizarOverlays() {
        const capa = $( '#capa-overlays' );
        const contenedor = document.getElementById( 'contenedor-pagina' );
        const W = contenedor.offsetWidth;
        const H = contenedor.offsetHeight;

        // Limpiar la capa y ajustar su tamaño al canvas
        capa.empty().css({ width: W + 'px', height: H + 'px' });

        // Filtrar solo los overlays de la página actual
        const overlaysPagina = estado.overlays.filter(
            ov => ov.pagina === estado.paginaActual
        );

        overlaysPagina.forEach( ov => {
            const el = construirElementoOverlay( ov, W, H );
            capa.append( el );
        });

        vincularEventosOverlay();
    }

    // Construir elemento overlay
    function construirElementoOverlay( ov, W, H ) {
        const left   = ( ov.left  / 100 ) * W;
        const top    = ( ov.top   / 100 ) * H;
        const ancho  = ( ov.ancho / 100 ) * W;
        const alto   = ( ov.alto  / 100 ) * H;

        const estaSeleccionado = estado.seleccionado === ov.tempId;

        let contenidoInterno = '';
        switch ( ov.tipo ) {
            case 'youtube':
                contenidoInterno = `<div class="overlay-icono overlay-yt">▶</div>`;
                break;
            case 'imagen':
                contenidoInterno = `<img src="${escaparHtml( ov.datos.url || '' )}"
                                        style="width:100%;height:100%;object-fit:cover;" />`;
                break;
            case 'presentacion':
                contenidoInterno = `<div class="overlay-icono overlay-slide">📽</div>`;
                break;
            case 'audio':
                contenidoInterno = `
                    <div class="overlay-audio" style="background:${COLOR_AUDIO};">
                        <svg viewBox="0 0 24 24" fill="white" width="50%" height="50%">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                        </svg>
                    </div>`;
                break;
        }

        const el = $(`
            <div class="overlay${estaSeleccionado ? ' overlay-seleccionado' : ''}"
                 data-tempid="${ov.tempId}"
                 style="left:${left}px; top:${top}px; width:${ancho}px; height:${alto}px;">
                ${contenidoInterno}
                <div class="handle-resize"></div>
            </div>
        `);

        return el;
    }

    // Eventos de overlays
    function vincularEventosOverlay() {
        // Arrastrar overlay
        $( '.overlay' ).on( 'mousedown', function ( e ) {
            if ( $( e.target ).hasClass( 'handle-resize' ) ) return;
            e.preventDefault();

            const tempId = $( this ).data( 'tempid' );
            seleccionarOverlay( tempId );

            estado.arrastrando = true;
            const rect = this.getBoundingClientRect();
            estado.arrastre.offsetX = e.clientX - rect.left;
            estado.arrastre.offsetY = e.clientY - rect.top;

            // Usar document para capturar el movimiento fuera del elemento
            $( document ).on( 'mousemove.arrastre', function ( ev ) {
                if ( ! estado.arrastrando ) return;

                const contenedor = document.getElementById( 'contenedor-pagina' );
                const rectConten = contenedor.getBoundingClientRect();
                const W = contenedor.offsetWidth;
                const H = contenedor.offsetHeight;

                const ov   = obtenerOverlay( estado.seleccionado );
                if ( ! ov ) return;

                const ovAncho = ( ov.ancho / 100 ) * W;
                const ovAlto  = ( ov.alto  / 100 ) * H;

                // Calcular nueva posición y limitar dentro del canvas
                let nuevoLeft = ev.clientX - rectConten.left - estado.arrastre.offsetX;
                let nuevoTop  = ev.clientY - rectConten.top  - estado.arrastre.offsetY;
                nuevoLeft = Math.max( 0, Math.min( nuevoLeft, W - ovAncho ) );
                nuevoTop  = Math.max( 0, Math.min( nuevoTop,  H - ovAlto ) );

                // Actualizar el estado con las nuevas coordenadas porcentuales
                ov.left = ( nuevoLeft / W ) * 100;
                ov.top  = ( nuevoTop  / H ) * 100;

                // Mover el elemento visualmente
                $( `.overlay[data-tempid="${ov.tempId}"]` ).css({
                    left: nuevoLeft + 'px',
                    top:  nuevoTop  + 'px',
                });

                actualizarPanelPosicion( ov );
            });

            $( document ).on( 'mouseup.arrastre', function () {
                estado.arrastrando = false;
                $( document ).off( 'mousemove.arrastre mouseup.arrastre' );
            });
        });

        // Evento de redimensionado por el handle de la esquina inferior derecha
        $( '.handle-resize' ).on( 'mousedown', function ( e ) {
            e.preventDefault();
            e.stopPropagation();

            const tempId = $( this ).closest( '.overlay' ).data( 'tempid' );
            seleccionarOverlay( tempId );

            estado.redimensionando = true;
            estado.resize.startX = e.clientX;
            estado.resize.startY = e.clientY;

            const ov        = obtenerOverlay( tempId );
            const contenedor = document.getElementById( 'contenedor-pagina' );
            const W = contenedor.offsetWidth;
            const H = contenedor.offsetHeight;

            // Guardar dimensiones iniciales en píxeles
            estado.resize.startW = ( ov.ancho / 100 ) * W;
            estado.resize.startH = ( ov.alto  / 100 ) * H;

            $( document ).on( 'mousemove.resize', function ( ev ) {
                if ( ! estado.redimensionando ) return;

                const contenedor2 = document.getElementById( 'contenedor-pagina' );
                const W2 = contenedor2.offsetWidth;
                const H2 = contenedor2.offsetHeight;

                const dx = ev.clientX - estado.resize.startX;
                const dy = ev.clientY - estado.resize.startY;

                // Aplicar nueva dimensión con mínimo de 50x30 píxeles
                const nuevoAncho = Math.max( 50, estado.resize.startW + dx );
                const nuevoAlto  = Math.max( 30, estado.resize.startH + dy );

                ov.ancho = ( nuevoAncho / W2 ) * 100;
                ov.alto  = ( nuevoAlto  / H2 ) * 100;

                $( `.overlay[data-tempid="${ov.tempId}"]` ).css({
                    width:  nuevoAncho + 'px',
                    height: nuevoAlto  + 'px',
                });

                actualizarPanelPosicion( ov );
            });

            $( document ).on( 'mouseup.resize', function () {
                estado.redimensionando = false;
                $( document ).off( 'mousemove.resize mouseup.resize' );
            });
        });
    }

    // Seleccionar overlay en canvas
    function seleccionarOverlay( tempId ) {
        estado.seleccionado = tempId;
        $( '.overlay' ).removeClass( 'overlay-seleccionado' );
        $( `.overlay[data-tempid="${tempId}"]` ).addClass( 'overlay-seleccionado' );

        const ov = obtenerOverlay( tempId );
        if ( ov ) actualizarPanelPosicion( ov );
        $( '#panel-posicion' ).show();
    }

    // Actualizar inputs del panel de posición
    function actualizarPanelPosicion( ov ) {
        $( '#pos-left'  ).val( redondear2( ov.left ) );
        $( '#pos-top'   ).val( redondear2( ov.top ) );
        $( '#pos-ancho' ).val( redondear2( ov.ancho ) );
        $( '#pos-alto'  ).val( redondear2( ov.alto ) );
    }

    // Actualizar overlay desde inputs numéricos
    function actualizarDesdeInputs() {
        if ( ! estado.seleccionado ) return;
        const ov = obtenerOverlay( estado.seleccionado );
        if ( ! ov ) return;

        ov.left  = parseFloat( $( '#pos-left'  ).val() ) || ov.left;
        ov.top   = parseFloat( $( '#pos-top'   ).val() ) || ov.top;
        ov.ancho = parseFloat( $( '#pos-ancho' ).val() ) || ov.ancho;
        ov.alto  = parseFloat( $( '#pos-alto'  ).val() ) || ov.alto;

        // Re-renderizar para reflejar los cambios visuales
        renderizarOverlays();
    }

    // Eliminar overlay seleccionado
    function eliminarSeleccionado() {
        if ( ! estado.seleccionado ) return;
        const ov = obtenerOverlay( estado.seleccionado );
        if ( ! ov ) return;

        // Si ya fue guardado en BD, eliminarlo del servidor
        if ( ov.id ) {
            $.post( flipbookAdmin.ajax_url, {
                action:     'flipbook_eliminar_overlay',
                nonce:      flipbookAdmin.nonce,
                overlay_id: ov.id,
            });
        }

        // Quitar del estado local
        estado.overlays    = estado.overlays.filter( o => o.tempId !== estado.seleccionado );
        estado.seleccionado = null;
        $( '#panel-posicion' ).hide();
        renderizarOverlays();
    }

    // Modales
    function abrirModal( tipo ) {
        cerrarTodosLosModales();
        $( '#fondo-modal' ).show();
        $( '#modal-' + tipo ).show();
    }

    function cerrarTodosLosModales() {
        $( '.modal' ).hide();
        $( '#fondo-modal' ).hide();
        
        // Reiniciar todos los inputs de archivo al cerrar los modales
        $( '#archivo-imagen' ).val( '' );
        $( '#archivo-audio' ).val( '' );
        $( '#archivos-slides' ).val( '' );
        
        // Limpiar vistas previas
        $( '#vista-previa-imagen' ).hide();
        $( '#img-previa' ).attr( 'src', '' );
        $( '#nombre-audio' ).hide().text( '' );
        $( '#miniaturas-slides' ).empty();
    }

    // Procesar imagen arrastrada (drag & drop)
    function procesarImagenArrastrada( archivo ) {
        if ( ! archivo ) {
            alert( 'Por favor, selecciona una imagen.' );
            return;
        }

        // Validación de tipo MIME en el cliente
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if ( ! tiposPermitidos.includes( archivo.type ) ) {
            alert( 'Por favor, selecciona una imagen válida (JPEG, PNG, GIF, WebP).' );
            return;
        }

        // Validación de tamaño (máximo 5MB)
        const tamanoMaximo = 5 * 1024 * 1024;
        if ( archivo.size > tamanoMaximo ) {
            alert( 'La imagen es demasiado grande. Máximo: 5 MB.' );
            return;
        }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_imagen' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'imagen', archivo );

        $.ajax({
            url: flipbookAdmin.ajax_url,
            method: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            success( respuesta ) {
                if ( respuesta.success ) {
                    agregarOverlay( 'imagen', {
                        url:           respuesta.data.url,
                        attachment_id: respuesta.data.attachment_id,
                    }, 10, 10, 30, 25 );
                    cerrarTodosLosModales();
                } else {
                    alert( 'Error al subir la imagen: ' + respuesta.data );
                }
            },
            error() {
                alert( 'Error de conexión al subir la imagen.' );
            }
        });
    }

    // Procesar audio arrastrado (drag & drop)
    function procesarAudioArrastrado( archivo ) {
        if ( ! archivo ) {
            alert( 'Por favor, selecciona un archivo de audio.' );
            return;
        }

        // Validación de tipo MIME en el cliente
        const tiposPermitidos = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'];
        if ( ! tiposPermitidos.includes( archivo.type ) ) {
            alert( 'Por favor, selecciona un audio válido (MP3, WAV, OGG, M4A).' );
            return;
        }

        // Validación de tamaño (máximo 50MB)
        const tamanoMaximo = 50 * 1024 * 1024;
        if ( archivo.size > tamanoMaximo ) {
            alert( 'El archivo es demasiado grande. Máximo: 50 MB.' );
            return;
        }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_audio' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'audio',  archivo );

        $.ajax({
            url: flipbookAdmin.ajax_url,
            method: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            success( respuesta ) {
                if ( respuesta.success ) {
                    agregarOverlay( 'audio', {
                        url:      respuesta.data.url,
                        autoplay: $( '#audio-autoplay' ).is( ':checked' ),
                    }, 5, 5, 8, 9 );
                    cerrarTodosLosModales();
                } else {
                    alert( 'Error al subir el audio: ' + respuesta.data );
                }
            },
            error() {
                alert( 'Error de conexión al subir el audio.' );
            }
        });
    }

    // Procesar múltiples imágenes arrastradas (slides)
    function procesarSlidesArrastrados( archivos ) {
        if ( ! archivos || archivos.length === 0 ) {
            alert( 'Por favor, selecciona al menos una imagen.' );
            return;
        }

        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const tamanoMaximo = 10 * 1024 * 1024; // 10 MB por archivo

        // Validar todos los archivos
        let archivosValidos = [];
        for ( let i = 0; i < archivos.length; i++ ) {
            const archivo = archivos[i];
            
            if ( ! tiposPermitidos.includes( archivo.type ) ) {
                console.warn( 'Archivo omitido - tipo no permitido: ' + archivo.name );
                continue;
            }
            
            if ( archivo.size > tamanoMaximo ) {
                console.warn( 'Archivo omitido - muy grande: ' + archivo.name );
                continue;
            }
            
            archivosValidos.push( archivo );
            if ( archivosValidos.length >= 10 ) break; // Máximo 10 imágenes
        }

        if ( archivosValidos.length === 0 ) {
            alert( 'No se encontraron imágenes válidas. Asegúrate de que sean JPEG, PNG, GIF o WebP y menores a 10 MB.' );
            return;
        }

        const promesas = [];

        // Subir todas las imágenes en paralelo
        for ( let i = 0; i < archivosValidos.length; i++ ) {
            const fd = new FormData();
            fd.append( 'action', 'flipbook_subir_imagen' );
            fd.append( 'nonce',  flipbookAdmin.nonce );
            fd.append( 'imagen', archivosValidos[i] );

            promesas.push( $.ajax({
                url: flipbookAdmin.ajax_url,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
            }));
        }

        Promise.all( promesas ).then( resultados => {
            const urls = resultados
                .filter( r => r.success )
                .map( r => r.data.url );

            if ( ! urls.length ) {
                alert( 'No se pudieron subir las imágenes.' );
                return;
            }

            const datos = {
                imagenes:   urls,
                autoplay:   $( '#slide-autoplay'  ).is( ':checked' ),
                loop:       $( '#slide-loop'       ).is( ':checked' ),
                aleatorio:  $( '#slide-aleatorio'  ).is( ':checked' ),
                flechas:    $( '#slide-flechas'    ).is( ':checked' ),
                duracion:   parseInt( $( '#slide-duracion'   ).val() ),
                transicion: $( '#slide-transicion' ).val(),
            };

            agregarOverlay( 'presentacion', datos, 10, 10, 35, 28 );
            cerrarTodosLosModales();
        }).catch( error => {
            alert( 'Error al subir las imágenes. Por favor, intenta de nuevo.' );
            console.error( error );
        });
    }

    // Configurar drag & drop en zona de arrastre
    function configurarArrastrable( selectoreZona, selectorInput ) {
        const $zona = $( selectoreZona );
        const $input = $( selectorInput );
        const inputElement = $input[0];

        if ( ! inputElement ) {
            console.error( 'No se encontró el input: ' + selectorInput );
            return;
        }

        // Click en la zona para abrir file picker
        $zona.on( 'click', function (e) {
            // Evitar que el click en el input en sí lo duplique
            if ( e.target === inputElement ) {
                return;
            }
            // Hacer focus en el input y disparar click
            inputElement.focus();
            inputElement.click();
        });

        // Prevenir comportamiento por defecto en drag events
        $zona.on( 'dragover', function ( e ) {
            e.preventDefault();
            e.stopPropagation();
            $zona.addClass( 'drag-over' ).css({
                borderColor: '#3b82f6',
                backgroundColor: '#eff6ff',
            });
        });

        $zona.on( 'dragenter', function ( e ) {
            e.preventDefault();
            e.stopPropagation();
            $zona.addClass( 'drag-over' ).css({
                borderColor: '#3b82f6',
                backgroundColor: '#eff6ff',
            });
        });

        $zona.on( 'dragleave', function ( e ) {
            e.preventDefault();
            if ( $zona.find( '.drag-over' ).length === 0 ) {
                $zona.removeClass( 'drag-over' ).css({
                    borderColor: '#d1d5db',
                    backgroundColor: 'transparent',
                });
            }
        });

        // Manejar el drop
        $zona.on( 'drop', function ( e ) {
            e.preventDefault();
            e.stopPropagation();

            $zona.removeClass( 'drag-over' ).css({
                borderColor: '#d1d5db',
                backgroundColor: 'transparent',
            });

            const dt = e.dataTransfer || e.originalEvent.dataTransfer;
            if ( dt && dt.files && dt.files.length > 0 ) {
                const archivos = dt.files;
                
                // Obtener el ID del input para saber qué tipo de archivo es
                const inputId = inputElement.id;
                
                // Para slides, procesar múltiples; para otros, solo el primero
                if ( inputId === 'archivos-slides' ) {
                    procesarSlidesArrastrados( archivos );
                } else if ( inputId === 'archivo-imagen' ) {
                    procesarImagenArrastrada( archivos[0] );
                } else if ( inputId === 'archivo-audio' ) {
                    procesarAudioArrastrado( archivos[0] );
                }
            }

            return false;
        });
    }

    // Confirmaciones de modales
    function confirmarYoutube() {
        const url = $( '#yt-url' ).val().trim();
        if ( ! url ) { alert( 'Ingresa una URL de YouTube.' ); return; }

        const videoId = extraerIdYoutube( url );
        if ( ! videoId ) { alert( 'URL de YouTube no válida.' ); return; }

        const datos = {
            videoId:   videoId,
            controles: $( '#yt-controles' ).is( ':checked' ) ? 1 : 0,
            autoplay:  $( '#yt-autoplay'  ).is( ':checked' ) ? 1 : 0,
            silencio:  $( '#yt-silencio'  ).is( ':checked' ) ? 1 : 0,
            loop:      $( '#yt-loop'      ).is( ':checked' ) ? 1 : 0,
            inicio:    tiempoASegundos( $( '#yt-inicio' ).val() ),
            modo:      $( 'input[name="yt-modo"]:checked' ).val(),
        };

        agregarOverlay( 'youtube', datos, 20, 20, 30, 18 );
        cerrarTodosLosModales();
    }

    function confirmarImagen() {
        const $input = $( '#archivo-imagen' );
        const archivo = $input[0].files[0];

        if ( ! archivo ) {
            alert( 'Por favor, selecciona una imagen.' );
            return;
        }

        // Validación de tipo MIME en el cliente
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if ( ! tiposPermitidos.includes( archivo.type ) ) {
            alert( 'Por favor, selecciona una imagen válida (JPEG, PNG, GIF, WebP).' );
            return;
        }

        // Validación de tamaño (máximo 5MB)
        const tamanoMaximo = 5 * 1024 * 1024;
        if ( archivo.size > tamanoMaximo ) {
            alert( 'La imagen es demasiado grande. Máximo: 5 MB.' );
            return;
        }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_imagen' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'imagen', archivo );

        // Mostrar mensaje temporal durante la carga
        const $vistaPrevia = $( '#vista-previa-imagen' );
        const $img = $( '#img-previa' );
        $vistaPrevia.html( '<p style="padding:20px;">Subiendo imagen...</p>' );
        $vistaPrevia.show();

        $.ajax({
            url: flipbookAdmin.ajax_url,
            method: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            success( respuesta ) {
                if ( respuesta.success ) {
                    agregarOverlay( 'imagen', {
                        url:           respuesta.data.url,
                        attachment_id: respuesta.data.attachment_id,
                    }, 10, 10, 30, 25 );
                    cerrarTodosLosModales();
                } else {
                    alert( 'Error al subir la imagen: ' + respuesta.data );
                }
            },
            error() {
                alert( 'Error de conexión al subir la imagen.' );
            }
        });
    }

    function confirmarPresentacion() {
        const $input = $( '#archivos-slides' );
        const archivos = $input[0].files;

        if ( ! archivos || archivos.length === 0 ) {
            alert( 'Por favor, selecciona al menos una imagen.' );
            return;
        }

        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const tamanoMaximo = 10 * 1024 * 1024; // 10 MB por archivo

        // Validar todos los archivos
        let archivosValidos = [];
        for ( let i = 0; i < archivos.length; i++ ) {
            const archivo = archivos[i];
            
            if ( ! tiposPermitidos.includes( archivo.type ) ) {
                console.warn( 'Archivo omitido - tipo no permitido: ' + archivo.name );
                continue;
            }
            
            if ( archivo.size > tamanoMaximo ) {
                console.warn( 'Archivo omitido - muy grande: ' + archivo.name );
                continue;
            }
            
            archivosValidos.push( archivo );
            if ( archivosValidos.length >= 10 ) break; // Máximo 10 imágenes
        }

        if ( archivosValidos.length === 0 ) {
            alert( 'No se encontraron imágenes válidas. Asegúrate de que sean JPEG, PNG, GIF o WebP y menores a 10 MB.' );
            return;
        }

        const promesas = [];

        // Subir todas las imágenes en paralelo
        for ( let i = 0; i < archivosValidos.length; i++ ) {
            const fd = new FormData();
            fd.append( 'action', 'flipbook_subir_imagen' );
            fd.append( 'nonce',  flipbookAdmin.nonce );
            fd.append( 'imagen', archivosValidos[i] );

            promesas.push( $.ajax({
                url: flipbookAdmin.ajax_url,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
            }));
        }

        Promise.all( promesas ).then( resultados => {
            const urls = resultados
                .filter( r => r.success )
                .map( r => r.data.url );

            if ( ! urls.length ) {
                alert( 'No se pudieron subir las imágenes.' );
                return;
            }

            const datos = {
                imagenes:   urls,
                autoplay:   $( '#slide-autoplay'  ).is( ':checked' ),
                loop:       $( '#slide-loop'       ).is( ':checked' ),
                aleatorio:  $( '#slide-aleatorio'  ).is( ':checked' ),
                flechas:    $( '#slide-flechas'    ).is( ':checked' ),
                duracion:   parseInt( $( '#slide-duracion'   ).val() ),
                transicion: $( '#slide-transicion' ).val(),
            };

            agregarOverlay( 'presentacion', datos, 10, 10, 35, 28 );
            cerrarTodosLosModales();
        }).catch( error => {
            alert( 'Error al subir las imágenes. Por favor, intenta de nuevo.' );
            console.error( error );
        });
    }

    function confirmarAudio() {
        const $input = $( '#archivo-audio' );
        const archivo = $input[0].files[0];

        if ( ! archivo ) {
            alert( 'Por favor, selecciona un archivo de audio.' );
            return;
        }

        // Validación de tipo MIME en el cliente
        const tiposPermitidos = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'];
        if ( ! tiposPermitidos.includes( archivo.type ) ) {
            alert( 'Por favor, selecciona un audio válido (MP3, WAV, OGG, M4A).' );
            return;
        }

        // Validación de tamaño (máximo 50MB)
        const tamanoMaximo = 50 * 1024 * 1024;
        if ( archivo.size > tamanoMaximo ) {
            alert( 'El archivo es demasiado grande. Máximo: 50 MB.' );
            return;
        }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_audio' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'audio',  archivo );

        // Mostrar mensaje temporal durante la carga
        $( '#nombre-audio' ).text( 'Subiendo: ' + archivo.name + '...' ).show();

        $.ajax({
            url: flipbookAdmin.ajax_url,
            method: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            success( respuesta ) {
                if ( respuesta.success ) {
                    agregarOverlay( 'audio', {
                        url:      respuesta.data.url,
                        autoplay: $( '#audio-autoplay' ).is( ':checked' ),
                    }, 5, 5, 8, 9 );
                    cerrarTodosLosModales();
                } else {
                    alert( 'Error al subir el audio: ' + respuesta.data );
                }
            },
            error() {
                alert( 'Error de conexión al subir el audio.' );
            }
        });
    }

    // Gestionar overlays
    // Agregar nuevo overlay
    function agregarOverlay( tipo, datos, left, top, ancho, alto ) {
        const ov = {
            tempId: 'temp_' + ( contadorTemp++ ),
            id:     null,       // Será asignado por la BD al guardar
            tipo,
            pagina: estado.paginaActual,
            left, top, ancho, alto,
            datos,
        };
        estado.overlays.push( ov );
        renderizarOverlays();
        seleccionarOverlay( ov.tempId );
    }

    // Buscar overlay por tempId
    function obtenerOverlay( tempId ) {
        return estado.overlays.find( o => o.tempId === tempId );
    }

    // Servidor
    // Cargar overlays desde BD
    function cargarOverlays() {
        $.post( flipbookAdmin.ajax_url, {
            action:      'flipbook_obtener_overlays',
            nonce:       flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
        }, function ( respuesta ) {
            if ( respuesta.success && respuesta.data ) {
                estado.overlays = respuesta.data.map( fila => ({
                    tempId: 'server_' + fila.id,
                    id:     fila.id,
                    tipo:   fila.tipo,
                    pagina: parseInt( fila.pagina ),
                    left:   parseFloat( fila.pos_left ),
                    top:    parseFloat( fila.pos_top ),
                    ancho:  parseFloat( fila.ancho ),
                    alto:   parseFloat( fila.alto ),
                    datos:  fila.datos,
                }));
                renderizarOverlays();
            }
        });
    }

    // Guardar todos los overlays en servidor
    function guardarTodo() {
        if ( ! estado.flipbookId ) {
            alert( 'Primero carga un PDF para crear el flipbook.' );
            return;
        }

        const carga = estado.overlays.map( ov => ({
            id:     ov.id,
            tipo:   ov.tipo,
            pagina: ov.pagina,
            left:   ov.left,
            top:    ov.top,
            ancho:  ov.ancho,
            alto:   ov.alto,
            datos:  ov.datos,
        }));

        $.post( flipbookAdmin.ajax_url, {
            action:      'flipbook_guardar_overlays',
            nonce:       flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            overlays:    JSON.stringify( carga ),
        }, function ( respuesta ) {
            if ( respuesta.success ) {
                mostrarNotificacion( '✓ Cambios guardados correctamente.', 'exito' );
                cargarOverlays(); // Sincronizar IDs reales de la BD
            } else {
                mostrarNotificacion( 'Error: ' + respuesta.data, 'error' );
            }
        });
    }

    // Utilidades
    // Extraer ID de YouTube
    function extraerIdYoutube( url ) {
        const regex = /(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;
        const coincidencia = url.match( regex );
        if ( coincidencia ) return coincidencia[1];
        // Verificar si es solo el ID
        if ( /^[A-Za-z0-9_-]{11}$/.test( url ) ) return url;
        return null;
    }

    // Convertir tiempo MM:SS a segundos
    function tiempoASegundos( t ) {
        if ( ! t ) return 0;
        const partes = t.split( ':' ).map( Number );
        if ( partes.length === 2 ) return partes[0] * 60 + partes[1];
        return parseInt( t ) || 0;
    }

    // Vista previa de imágenes para slideshow
    function previsualizarSlides( archivos ) {
        const contenedor = $( '#miniaturas-slides' ).empty();
        const max = Math.min( archivos.length, 10 );
        for ( let i = 0; i < max; i++ ) {
            const lector = new FileReader();
            lector.onload = e => {
                contenedor.append(
                    `<img src="${e.target.result}" class="miniatura-slide" />`
                );
            };
            lector.readAsDataURL( archivos[i] );
        }
    }

    // Notificación temporal en la barra superior
    function mostrarNotificacion( mensaje, tipo ) {
        const clase   = tipo === 'exito' ? 'notice-success' : 'notice-error';
        const notif   = $( `<div class="notice ${clase} is-dismissible"><p>${mensaje}</p></div>` );
        $( '.barra-superior' ).after( notif );
        setTimeout( () => notif.fadeOut( 300, () => notif.remove() ), 3500 );
    }

    // Redondear a 2 decimales
    function redondear2( n ) {
        return Math.round( n * 100 ) / 100;
    }

    // Escapar caracteres HTML
    function escaparHtml( s ) {
        return String( s )
            .replace( /&/g,  '&amp;'  )
            .replace( /</g,  '&lt;'   )
            .replace( />/g,  '&gt;'   )
            .replace( /"/g,  '&quot;' );
    }

})( jQuery );
