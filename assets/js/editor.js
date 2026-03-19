/**
 * editor.js — Editor visual de Flipbook (panel de administración)
 * v2 — Con previsualizaciones reales: miniatura YouTube, imagen visible,
 *       slider de presentación navegable, audio con reproductor de preview.
 */

(function ($) {
    'use strict';

    /* =========================================================
       ESTADO
    ========================================================= */
    const estado = {
        flipbookId:      parseInt( flipbookAdmin.flipbook_id ) || 0,
        pdfUrl:          flipbookAdmin.pdf_url || '',
        totalPaginas:    parseInt( flipbookAdmin.pdf_paginas ) || 0,
        paginaActual:    1,
        pdfDoc:          null,
        overlays:        [],
        seleccionado:    null,
        arrastrando:     false,
        redimensionando: false,
        arrastre:        { offsetX: 0, offsetY: 0 },
        resize:          { startX: 0, startY: 0, startW: 0, startH: 0 },
    };

    const COLOR_AUDIO = '#C70000';
    let contadorTemp  = 1;

    // Estado interno del slider de preview en modal
    let previewSlides = [];
    let previewIndice = 0;

    /* =========================================================
       INIT
    ========================================================= */
    $( document ).ready( function () {
        construirEditor();
        if ( estado.pdfUrl && estado.totalPaginas > 0 ) cargarPDF( estado.pdfUrl );
        if ( estado.flipbookId ) cargarOverlays();
    });

    /* =========================================================
       HTML DEL EDITOR
    ========================================================= */
    function construirEditor() {
        const html = `
        <div id="editor-app">

            <div class="barra-superior">
                <div class="barra-izquierda">
                    <label>Título:</label>
                    <input type="text" id="input-titulo"
                           value="${escaparHtml(flipbookAdmin.titulo)}"
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
                    <button id="btn-preview" class="btn-herramienta" style="background:#4CAF50;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;">👁️ Vista previa</button>
                    <button id="btn-descargar-pdf" class="btn-secundario">⬇️ Descargar PDF</button>
                    <button id="btn-guardar" class="btn-primario">💾 Guardar cambios</button>
                </div>
            </div>

            <div class="area-principal">

                <div class="sidebar">
                    <div class="sidebar-titulo">Insertar elemento</div>

                    <button class="btn-herramienta" data-tipo="youtube">
                        <span class="icono-herramienta yt-icono">▶</span>
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
                    <button class="btn-herramienta" data-tipo="numero-pagina">
                        <span class="icono-herramienta">🔢</span>
                        Insertar número de página
                    </button>

                    <div class="separador"></div>
                    <div class="sidebar-titulo">Página</div>
                    <div class="nav-paginas">
                        <button id="btn-anterior">‹</button>
                        <span>
                            <input type="number" id="input-pagina" min="1" value="1" />
                            / <span id="total-paginas">0</span>
                        </span>
                        <button id="btn-siguiente">›</button>
                    </div>

                    <div id="panel-posicion" style="display:none;">
                        <div class="sidebar-titulo" style="margin-top:12px;">Posición y tamaño</div>
                        <div class="grilla-posicion">
                            <div class="campo-posicion">
                                <label>Izquierda:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-left" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Parte superior:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-top" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Ancho:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-ancho" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-posicion">
                                <label>Altura:</label>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-alto" step="0.1" /><span>%</span>
                                </div>
                            </div>
                        </div>
                        <button id="btn-eliminar" class="btn-peligro">🗑 Eliminar elemento</button>
                    </div>
                </div>

                <div class="area-canvas">
                    <div id="contenedor-pagina">
                        <canvas id="canvas-pdf"></canvas>
                        <div id="capa-overlays"></div>
                    </div>
                </div>
            </div>
        </div>

        <div id="fondo-modal" style="display:none;"></div>

        <!-- MODAL YouTube -->
        <div id="modal-youtube" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar video de Youtube</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <label>URL de Youtube:</label>
                    <input type="text" id="yt-url"
                           placeholder="https://youtu.be/... o https://www.youtube.com/watch?v=..." />
                    <small>Acepta: URL completa, youtu.be o solo el ID del video</small>

                    <div id="yt-preview-wrap" style="display:none;">
                        <div class="yt-preview-box">
                            <img id="yt-preview-img" src="" alt="Miniatura del video" />
                            <div class="yt-play-overlay">▶</div>
                        </div>
                        <p id="yt-video-id-label" class="yt-id-label"></p>
                    </div>

                    <div class="grupo-checkboxes">
                        <label><input type="checkbox" id="yt-controles" checked /> Mostrar controles</label>
                        <label><input type="checkbox" id="yt-autoplay" /> Reproducción automática</label>
                        <label><input type="checkbox" id="yt-silencio" /> Silenciado</label>
                        <label><input type="checkbox" id="yt-loop" /> Loop</label>
                    </div>
                    <label>Comienza en:</label>
                    <input type="text" id="yt-inicio" value="00:00" />
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

        <!-- MODAL Imagen -->
        <div id="modal-imagen" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar imagen</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="zona-arrastre clickable" id="zona-imagen-click">
                        <span id="zona-imagen-texto">⬆ Haz clic aquí para seleccionar una imagen</span>
                        <input type="file" id="archivo-imagen" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none;" />
                    </div>
                    <div id="vista-previa-imagen" style="display:none;">
                        <img id="img-previa" src="" alt="Vista previa" />
                        <p id="img-nombre-label"></p>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-imagen" class="btn-confirmar" disabled>De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL Presentación -->
        <div id="modal-presentacion" class="modal" style="display:none;">
            <div class="modal-contenido modal-ancho">
                <div class="modal-cabecera">
                    <h3>Insertar presentación de diapositivas</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="zona-arrastre clickable" id="zona-slides-click">
                        <span>⬆ Haz clic para seleccionar imágenes (máx. 10)</span>
                        <input type="file" id="archivos-slides" accept="image/*" multiple style="display:none;" />
                    </div>

                    <div id="slides-preview-area" style="display:none;">
                        <div class="slides-preview-header">
                            <span id="slides-preview-contador"></span>
                        </div>
                        <div class="slides-slider-wrap">
                            <button class="slide-nav-btn slide-prev-btn" type="button">‹</button>
                            <div class="slide-viewport">
                                <div id="slides-track"></div>
                            </div>
                            <button class="slide-nav-btn slide-next-btn" type="button">›</button>
                        </div>
                        <div class="slides-dots" id="slides-dots"></div>
                    </div>

                    <small>La primera imagen establece la relación de aspecto del overlay.</small>
                    <div class="separador"></div>
                    <strong>Configuración</strong>
                    <div class="grupo-checkboxes">
                        <label><input type="checkbox" id="slide-autoplay" checked /> Reproducción automática</label>
                        <label><input type="checkbox" id="slide-loop" checked /> Loop</label>
                        <label><input type="checkbox" id="slide-aleatorio" /> Aleatorio</label>
                        <label><input type="checkbox" id="slide-flechas" checked /> Mostrar flechas de navegación</label>
                    </div>
                    <div class="dos-columnas">
                        <div>
                            <label>Tiempo por imagen:</label>
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
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-presentacion" class="btn-confirmar" disabled>De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL Audio -->
        <div id="modal-audio" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar sonido</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="fila-toggle-audio">
                        <label>Autoplay</label>
                        <label class="toggle">
                            <input type="checkbox" id="audio-autoplay" />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="zona-arrastre clickable" id="zona-audio-click">
                        <span id="audio-zona-texto">⬆ Haz clic para seleccionar audio (mp3, wav, ogg)</span>
                        <input type="file" id="archivo-audio"
                               accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
                               style="display:none;" />
                    </div>

                    <div id="audio-preview" style="display:none;">
                        <div class="audio-player-preview">
                            <button id="audio-play-btn" class="audio-play-btn" type="button">▶</button>
                            <div class="audio-meta">
                                <span id="audio-nombre-archivo" class="audio-filename"></span>
                                <div class="audio-progress-track">
                                    <div id="audio-progress-fill"></div>
                                </div>
                                <div class="audio-time-row">
                                    <span id="audio-tiempo-actual">0:00</span>
                                    <span id="audio-duracion-total">0:00</span>
                                </div>
                            </div>
                        </div>
                        <audio id="audio-el-preview" preload="metadata"></audio>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-audio" class="btn-confirmar" disabled>De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL Número de Página -->
        <div id="modal-numero-pagina" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar número de página</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <label>Color del número:</label>
                    <input type="color" id="num-color" value="#000000" />
                    
                    <label style="margin-top:12px;">Tamaño (px):</label>
                    <input type="number" id="num-tamanio" value="24" min="8" max="100" />
                    
                    <label style="margin-top:12px;">Peso de fuente:</label>
                    <select id="num-peso">
                        <option value="400">Normal</option>
                        <option value="600" selected>Semi-bold</option>
                        <option value="700">Bold</option>
                    </select>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-numero-pagina" class="btn-confirmar">De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL Descargar PDF -->
        <div id="modal-descargar-pdf" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Descargar como PDF</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <label style="margin-bottom:15px; display:block; font-weight:600;">Selecciona qué descargar:</label>
                    <div style="display:flex; flex-direction:column; gap:12px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="radio" name="pdf-type" value="original" />
                            <span>📄 PDF original (sin cambios)</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="radio" name="pdf-type" value="con-overlays" checked />
                            <span>🎨 Con todos los elementos (vídeos, imágenes, etc.)</span>
                        </label>
                    </div>
                    <div style="margin-top:15px; padding:10px; background:#f5f5f5; border-radius:4px; font-size:12px; color:#666;">
                        <strong>Nota:</strong> La descarga con elementos renderizados generará imágenes de cada página. Esto puede tomar unos momentos.
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-descargar-pdf" class="btn-confirmar">Descargar</button>
                </div>
            </div>
        </div>

        <!-- MODAL PREVIEW FULLSCREEN -->
        <div id="modal-preview" style="display:none;position:fixed;inset:0;background:#fff;z-index:99999;">
            <div style="background:#2c3e50;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;">
                <h3 style="margin:0;font-size:18px;">👁️ Vista previa del Flipbook</h3>
                <div style="display:flex;gap:12px;align-items:center;">
                    <button id="btn-preview-descargar" class="btn-confirmar" style="background:#ff9800;">⬇️ Descargar PDF</button>
                    <button id="btn-cerrar-preview" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">✕</button>
                </div>
            </div>
            <div style="flex:1;display:flex;overflow:hidden;height:calc(100% - 57px);">
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f5f5;overflow:auto;padding:20px;">
                    <div id="preview-contenedor" style="position:relative;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.15);border-radius:4px;width:100%;max-width:800px;">
                        <canvas id="preview-canvas" style="display:block;width:100%;border:1px solid #ddd;"></canvas>
                        <div id="preview-overlays" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>
                    </div>
                    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;">
                        <button id="preview-anterior" style="padding:8px 16px;background:#34495e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px;">‹ Anterior</button>
                        <span style="min-width:120px;text-align:center;">
                            <input type="number" id="preview-pagina" min="1" value="1" style="width:50px;padding:4px;text-align:center;" />
                            / <span id="preview-total">0</span>
                        </span>
                        <button id="preview-siguiente" style="padding:8px 16px;background:#34495e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:16px;">Siguiente ›</button>
                    </div>
                </div>
            </div>
        </div>
        `;

        $( '#flipbook-cargando' ).replaceWith( html );
        vincularEventos();
    }

    /* =========================================================
       EVENTOS
    ========================================================= */
    function vincularEventos() {

        // PDF upload
        $( '#input-pdf' ).on( 'change', function () {
            if ( this.files[0] ) subirPDF( this.files[0] );
        });

        // Herramientas
        $( document ).on( 'click', '.btn-herramienta', function () {
            abrirModal( $( this ).data( 'tipo' ) );
        });

        // Cerrar modales
        $( document ).on( 'click', '.cerrar-modal, #fondo-modal', cerrarTodosLosModales );

        // ---- YouTube: miniatura en tiempo real ----
        $( '#yt-url' ).on( 'input', function () {
            const vid = extraerIdYoutube( $( this ).val().trim() );
            if ( vid ) {
                $( '#yt-preview-img' ).attr( 'src',
                    `https://img.youtube.com/vi/${vid}/hqdefault.jpg` );
                $( '#yt-video-id-label' ).text( 'ID del video: ' + vid );
                $( '#yt-preview-wrap' ).show();
            } else {
                $( '#yt-preview-wrap' ).hide();
            }
        });

        // ---- Imagen: abrir file input al hacer clic en la zona ----
        $( document ).on( 'click', '#zona-imagen-click', function ( e ) {
            if ( $( e.target ).is( 'input' ) ) return;
            $( '#archivo-imagen' ).click();
        });
        $( document ).on( 'change', '#archivo-imagen', function () {
            const f = this.files[0];
            if ( ! f ) return;
            if ( ! f.type.startsWith( 'image/' ) ) {
                alert( 'Selecciona un archivo de imagen válido (jpg, png, gif, webp).' );
                this.value = '';
                return;
            }
            const r = new FileReader();
            r.onload = e => {
                $( '#img-previa' ).attr( 'src', e.target.result );
                $( '#img-nombre-label' ).text( f.name );
                $( '#vista-previa-imagen' ).show();
                $( '#zona-imagen-texto' ).text( '✓ Imagen lista' );
                $( '#confirmar-imagen' ).prop( 'disabled', false );
            };
            r.readAsDataURL( f );
        });

        // ---- Presentación: slider de preview ----
        $( document ).on( 'click', '#zona-slides-click', function ( e ) {
            if ( $( e.target ).is( 'input' ) ) return;
            $( '#archivos-slides' ).click();
        });
        $( document ).on( 'change', '#archivos-slides', function () {
            if ( this.files.length ) cargarPreviewSlides( this.files );
        });
        $( document ).on( 'click', '.slide-prev-btn', () => navegarPreviewSlide( -1 ) );
        $( document ).on( 'click', '.slide-next-btn', () => navegarPreviewSlide( +1 ) );
        $( document ).on( 'click', '.slide-dot', function () {
            previewIndice = parseInt( $( this ).data( 'i' ) );
            actualizarDotsSlide();
            actualizarTrackSlide();
        });

        // ---- Audio: abrir file input al hacer clic ----
        $( document ).on( 'click', '#zona-audio-click', function ( e ) {
            if ( $( e.target ).is( 'input' ) ) return;
            $( '#archivo-audio' ).click();
        });
        $( document ).on( 'change', '#archivo-audio', function () {
            const f = this.files[0];
            if ( ! f ) return;

            // Validar tamaño máximo de 10 MB en el frontend antes de siquiera intentar subir
            const maxBytes = 10 * 1024 * 1024; // 10 MB
            if ( f.size > maxBytes ) {
                const tamanio = ( f.size / ( 1024 * 1024 ) ).toFixed( 2 );
                alert(
                    `El archivo "${f.name}" pesa ${tamanio} MB.\n\n` +
                    'El tamaño máximo permitido para archivos de audio es 10 MB.\n' +
                    'Por favor selecciona un archivo más pequeño.'
                );
                // Limpiar el input para que el usuario pueda seleccionar otro
                $( this ).val( '' );
                return;
            }

            iniciarPreviewAudio( f );
        });
        $( document ).on( 'click', '#audio-play-btn', function () {
            const ae = document.getElementById( 'audio-el-preview' );
            if ( ! ae ) return;
            if ( ae.paused ) {
                ae.play();
                $( this ).text( '⏸' ).addClass( 'pausando' );
            } else {
                ae.pause();
                $( this ).text( '▶' ).removeClass( 'pausando' );
            }
        });

        // Confirmaciones
        $( '#confirmar-youtube'      ).on( 'click', confirmarYoutube );
        $( '#confirmar-imagen'       ).on( 'click', confirmarImagen );
        $( '#confirmar-presentacion' ).on( 'click', confirmarPresentacion );
        $( '#confirmar-audio'        ).on( 'click', confirmarAudio );
        $( '#confirmar-numero-pagina' ).on( 'click', confirmarNumeroPagina );

        // Botones de preview y descarga
        $( '#btn-descargar-pdf'  ).on( 'click', () => abrirModal( 'descargar-pdf' ) );
        $( '#btn-preview'        ).on( 'click', abrirPreview );
        $( '#confirmar-descargar-pdf'   ).on( 'click', descargarPDF );

        // Preview fullscreen
        $( '#btn-cerrar-preview' ).on( 'click', cerrarPreview );
        $( '#btn-preview-descargar' ).on( 'click', descargarDesdePreview );
        $( '#preview-anterior' ).on( 'click', () => navPreview( -1 ) );
        $( '#preview-siguiente' ).on( 'click', () => navPreview( 1 ) );
        $( '#preview-pagina' ).on( 'change', function () { irAPreview( parseInt( this.value ) ); });

        // Navegación páginas
        $( '#btn-anterior' ).on( 'click', () => irAPagina( estado.paginaActual - 1 ) );
        $( '#btn-siguiente' ).on( 'click', () => irAPagina( estado.paginaActual + 1 ) );
        $( '#input-pagina'  ).on( 'change', function () { irAPagina( parseInt( this.value ) ); });

        // Panel de posición
        $( '#pos-left, #pos-top, #pos-ancho, #pos-alto' ).on( 'input', actualizarDesdeInputs );
        $( '#btn-eliminar' ).on( 'click', eliminarSeleccionado );
        $( '#btn-guardar'  ).on( 'click', guardarTodo );
    }



    /* =========================================================
       PREVIEW SLIDER (modal presentación)
    ========================================================= */
    function cargarPreviewSlides( archivos ) {
        previewSlides = [];
        previewIndice = 0;
        const max     = Math.min( archivos.length, 10 );
        let cargados  = 0;

        $( '#slides-preview-area' ).hide();
        $( '#confirmar-presentacion' ).prop( 'disabled', true );

        for ( let i = 0; i < max; i++ ) {
            const r = new FileReader();
            const idx = i;
            r.onload = e => {
                previewSlides[ idx ] = e.target.result;
                cargados++;
                if ( cargados === max ) renderizarPreviewSlider( max );
            };
            r.readAsDataURL( archivos[ i ] );
        }
    }

    function renderizarPreviewSlider( total ) {
        const track = $( '#slides-track' ).empty();
        const dots  = $( '#slides-dots'  ).empty();

        previewSlides.forEach( ( src, i ) => {
            track.append(
                `<div class="slide-item${i === 0 ? ' activo' : ''}"
                      style="background-image:url('${src}')"></div>`
            );
            dots.append(
                `<span class="slide-dot${i === 0 ? ' activo' : ''}" data-i="${i}"></span>`
            );
        });

        $( '#slides-preview-contador' ).text( `${total} imagen${total > 1 ? 'es' : ''} seleccionada${total > 1 ? 's' : ''}` );
        $( '#slides-preview-area' ).show();
        $( '#confirmar-presentacion' ).prop( 'disabled', false );
    }

    function navegarPreviewSlide( dir ) {
        const total = previewSlides.length;
        if ( ! total ) return;
        previewIndice = ( ( previewIndice + dir ) % total + total ) % total;
        actualizarDotsSlide();
        actualizarTrackSlide();
    }

    function actualizarTrackSlide() {
        $( '#slides-track .slide-item' ).each( ( i, el ) => {
            $( el ).toggleClass( 'activo', i === previewIndice );
        });
    }

    function actualizarDotsSlide() {
        $( '#slides-dots .slide-dot' ).each( ( i, el ) => {
            $( el ).toggleClass( 'activo', i === previewIndice );
        });
    }

    /* =========================================================
       PREVIEW AUDIO
    ========================================================= */
    function iniciarPreviewAudio( archivo ) {
        const blobUrl = URL.createObjectURL( archivo );
        const ae      = document.getElementById( 'audio-el-preview' );
        ae.src        = blobUrl;
        ae.load();

        $( '#audio-nombre-archivo' ).text( archivo.name );
        $( '#audio-zona-texto'     ).text( '✓ Audio listo' );
        $( '#audio-play-btn'       ).text( '▶' ).removeClass( 'pausando' );
        $( '#audio-progress-fill'  ).css( 'width', '0%' );
        $( '#audio-tiempo-actual'  ).text( '0:00' );
        $( '#audio-duracion-total' ).text( '…' );
        $( '#audio-preview'        ).show();
        $( '#confirmar-audio'      ).prop( 'disabled', false );

        ae.addEventListener( 'loadedmetadata', function () {
            $( '#audio-duracion-total' ).text( formatTiempo( ae.duration ) );
        }, { once: true });

        ae.addEventListener( 'timeupdate', function () {
            if ( ae.duration ) {
                const pct = ( ae.currentTime / ae.duration ) * 100;
                $( '#audio-progress-fill' ).css( 'width', pct + '%' );
                $( '#audio-tiempo-actual' ).text( formatTiempo( ae.currentTime ) );
            }
        });

        ae.addEventListener( 'ended', function () {
            $( '#audio-play-btn' ).text( '▶' ).removeClass( 'pausando' );
        });
    }

    /* =========================================================
       PDF
    ========================================================= */
    function subirPDF( archivo ) {
        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_pdf' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'pdf_file', archivo );
        fd.append( 'titulo', $( '#input-titulo' ).val() || archivo.name );
        fd.append( 'flipbook_id', estado.flipbookId );

        $( '#info-pdf' ).text( 'Subiendo y comprimiendo PDF…' );

        $.ajax({
            url: flipbookAdmin.ajax_url, method: 'POST',
            data: fd, processData: false, contentType: false,
            success( r ) {
                if ( r.success ) {
                    const d = r.data;
                    console.log( '✓ PDF subido exitosamente', d );
                    
                    // Mostrar confirmación
                    $( '#info-pdf' ).html( `✓ PDF cargado (${d.tamanio}) — ${d.paginas} páginas<br><small style="color:green;">Redirigiendo para cargar datos...</small>` );
                    
                    // Redirigir a la página con el nuevo flipbook_id
                    // Esto fuerza que PHP lea nuevamente los metadatos de la BD
                    setTimeout( () => {
                        const nueva_url = new URL( window.location );
                        nueva_url.searchParams.set( 'flipbook_id', d.flipbook_id );
                        window.location.href = nueva_url.toString();
                    }, 800 );
                } else {
                    $( '#info-pdf' ).text( '❌ Error: ' + r.data );
                    console.error( 'Error al subir PDF:', r );
                }
            },
            error( xhr, status, error ) {
                console.error( 'Error AJAX:', error );
                $( '#info-pdf' ).text( '❌ Error al conectar con el servidor.' );
            }
        });
    }

    function cargarPDF( url ) {
        console.log( '📥 Cargando PDF desde:', url );
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument( url ).promise.then( pdf => {
            console.log( '✓ PDF cargado. Páginas:', pdf.numPages );
            estado.pdfDoc       = pdf;
            estado.totalPaginas = pdf.numPages;
            $( '#total-paginas' ).text( pdf.numPages );
            $( '#input-pagina'  ).attr( 'max', pdf.numPages );
            renderizarPagina( 1 );
        }).catch( err => {
            console.error( '❌ Error cargando PDF:', err );
        });
    }

    function renderizarPagina( num ) {
        if ( ! estado.pdfDoc ) {
            console.log( '❌ No hay PDF cargado' );
            return;
        }
        num = Math.max( 1, Math.min( num, estado.totalPaginas ) );
        estado.paginaActual = num;
        $( '#input-pagina' ).val( num );

        console.log( '📄 Renderizando página:', num, 'Total:', estado.totalPaginas );

        estado.pdfDoc.getPage( num ).then( pag => {
            const vp = pag.getViewport({ scale: 1.5 });
            const cv = document.getElementById( 'canvas-pdf' );
            cv.width  = vp.width;
            cv.height = vp.height;
            $( '#contenedor-pagina' ).css({ width: vp.width + 'px', height: vp.height + 'px' });
            pag.render({ canvasContext: cv.getContext( '2d' ), viewport: vp })
               .promise.then( () => {
                   console.log( '✓ PDF página renderizada, ahora los overlays' );
                   renderizarOverlays();
               });
        }).catch( err => {
            console.error( '❌ Error cargando página:', err );
        });
    }

    function irAPagina( n ) {
        console.log( '⬅️➡️  Navegando a página:', n );
        renderizarPagina( n );
    }

    /* =========================================================
       OVERLAYS
    ========================================================= */
    function renderizarOverlays() {
        const capa = $( '#capa-overlays' );
        const C    = document.getElementById( 'contenedor-pagina' );
        const W    = C ? C.offsetWidth : 0;
        const H    = C ? C.offsetHeight : 0;

        console.log( '🎨 Renderizando overlays - Página actual:', estado.paginaActual, 'Contenedor:', W, 'x', H );
        console.log( '📦 Total overlays:', estado.overlays.length );

        // Detener audios antes de limpiar
        capa.find( '.ov-audio-el' ).each( function () { this.pause(); });
        capa.empty().css({ width: W + 'px', height: H + 'px' });

        const overlaysAMostrar = estado.overlays.filter( ov => {
            const paginaIgual = parseInt( ov.pagina ) === parseInt( estado.paginaActual );
            if ( ! paginaIgual ) {
                console.log( `  X Overlay en página ${ov.pagina} (esperaba ${estado.paginaActual})` );
            }
            return paginaIgual;
        });

        console.log( `✓ Mostrando ${overlaysAMostrar.length} overlays en esta página` );

        overlaysAMostrar.forEach( ov => {
            const el = construirElOverlay( ov, W, H );
            if ( el ) capa.append( el );
        });

        vincularEventosOverlay();
    }

    function construirElOverlay( ov, W, H ) {
        const left  = ( ov.left  / 100 ) * W;
        const top   = ( ov.top   / 100 ) * H;
        const ancho = ( ov.ancho / 100 ) * W;
        const alto  = ( ov.alto  / 100 ) * H;
        const sel   = estado.seleccionado === ov.tempId;

        let inner = '';

        switch ( ov.tipo ) {
            case 'youtube': {
                // Miniatura real de YouTube visible en el editor
                const vid   = ov.datos.videoId || '';
                const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '';
                inner = `<div class="ov-yt-container">
                    ${thumb
                        ? `<img class="ov-yt-thumb" src="${thumb}" />`
                        : `<div class="ov-yt-empty">YouTube</div>`}
                    <div class="ov-yt-play-icon">▶</div>
                </div>`;
                break;
            }
            case 'imagen': {
                // Imagen real visible en el editor
                inner = `<img class="ov-imagen-real"
                              src="${escaparHtml(ov.datos.url || '')}"
                              alt="Imagen" />`;
                break;
            }
            case 'presentacion': {
                // Primer slide visible + flechas para navegar en el editor
                const imgs = ov.datos.imagenes || [];
                inner = `<div class="ov-presentacion" data-tempid="${ov.tempId}">
                    ${imgs.map( ( src, i ) =>
                        `<div class="ov-slide${i === 0 ? ' activo' : ''}"
                              style="background-image:url('${src}')"></div>`
                    ).join('')}
                    ${imgs.length > 1 ? `
                        <button class="ov-slide-prev" data-tempid="${ov.tempId}" type="button">‹</button>
                        <button class="ov-slide-next" data-tempid="${ov.tempId}" type="button">›</button>
                        <div class="ov-slide-pager">
                            <span class="ov-slide-cur">1</span>/${imgs.length}
                        </div>` : ''}
                </div>`;
                break;
            }
            case 'audio': {
                // Botón rojo #C70000 con ícono de altavoz SVG + elemento audio
                const url = escaparHtml( ov.datos.url || '' );
                inner = `<div class="ov-audio-container">
                    <div class="ov-audio-btn" style="background:${COLOR_AUDIO};">
                        <svg viewBox="0 0 24 24" fill="white" width="55%" height="55%">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                        </svg>
                    </div>
                    ${url ? `<audio class="ov-audio-el" src="${url}" preload="none"></audio>` : ''}
                </div>`;
                break;
            }
            case 'numero-pagina': {
                // Número de página con color y tamaño personalizables
                const color = ov.datos.color || '#000000';
                const tam = ov.datos.tamanio || 24;
                const peso = ov.datos.peso || 600;
                inner = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                                 color:${color};font-size:${tam}px;font-weight:${peso};">${estado.paginaActual}</div>`;
                break;
            }
        }

        return $(`
            <div class="overlay${sel ? ' overlay-seleccionado' : ''}"
                 data-tempid="${ov.tempId}"
                 style="left:${left}px;top:${top}px;width:${ancho}px;height:${alto}px;">
                ${inner}
                <div class="handle-resize"></div>
            </div>
        `);
    }

    function vincularEventosOverlay() {

        // Reproducir/pausar audio del overlay en el editor
        $( '.ov-audio-btn' ).on( 'click', function ( e ) {
            e.stopPropagation();
            const ae = $( this ).closest( '.ov-audio-container' ).find( '.ov-audio-el' )[0];
            if ( ! ae ) return;
            if ( ae.paused ) { ae.play(); $( this ).addClass( 'activo' ); }
            else             { ae.pause(); $( this ).removeClass( 'activo' ); }
        });

        // Navegar slides del overlay en el editor
        $( '.ov-slide-prev, .ov-slide-next' ).on( 'click', function ( e ) {
            e.stopPropagation();
            const tempId  = $( this ).data( 'tempid' );
            const wrapper = $( `.ov-presentacion[data-tempid="${tempId}"]` );
            const items   = wrapper.find( '.ov-slide' );
            const total   = items.length;
            const actual  = items.index( items.filter( '.activo' ) );
            const dir     = $( this ).hasClass( 'ov-slide-prev' ) ? -1 : +1;
            const nuevo   = ( ( actual + dir ) % total + total ) % total;
            items.removeClass( 'activo' );
            items.eq( nuevo ).addClass( 'activo' );
            wrapper.find( '.ov-slide-cur' ).text( nuevo + 1 );
        });

        // Drag
        $( '.overlay' ).on( 'mousedown', function ( e ) {
            if (
                $( e.target ).hasClass( 'handle-resize' ) ||
                $( e.target ).closest( '.ov-slide-prev,.ov-slide-next,.ov-audio-btn' ).length
            ) return;

            e.preventDefault();
            const tempId = $( this ).data( 'tempid' );
            seleccionarOverlay( tempId );
            estado.arrastrando = true;
            const rect = this.getBoundingClientRect();
            estado.arrastre.offsetX = e.clientX - rect.left;
            estado.arrastre.offsetY = e.clientY - rect.top;

            $( document ).on( 'mousemove.drag', function ( ev ) {
                if ( ! estado.arrastrando ) return;
                const C  = document.getElementById( 'contenedor-pagina' );
                const rc = C.getBoundingClientRect();
                const W  = C.offsetWidth, H = C.offsetHeight;
                const ov = obtenerOverlay( estado.seleccionado );
                if ( ! ov ) return;
                const ovW = ( ov.ancho / 100 ) * W;
                const ovH = ( ov.alto  / 100 ) * H;
                let nl = ev.clientX - rc.left - estado.arrastre.offsetX;
                let nt = ev.clientY - rc.top  - estado.arrastre.offsetY;
                nl = Math.max( 0, Math.min( nl, W - ovW ) );
                nt = Math.max( 0, Math.min( nt, H - ovH ) );
                ov.left = ( nl / W ) * 100;
                ov.top  = ( nt / H ) * 100;
                $( `.overlay[data-tempid="${ov.tempId}"]` ).css({ left: nl + 'px', top: nt + 'px' });
                actualizarPanelPosicion( ov );
            });

            $( document ).on( 'mouseup.drag', function () {
                estado.arrastrando = false;
                $( document ).off( 'mousemove.drag mouseup.drag' );
            });
        });

        // Resize
        $( '.handle-resize' ).on( 'mousedown', function ( e ) {
            e.preventDefault(); e.stopPropagation();
            const tempId = $( this ).closest( '.overlay' ).data( 'tempid' );
            seleccionarOverlay( tempId );
            estado.redimensionando = true;
            estado.resize.startX   = e.clientX;
            estado.resize.startY   = e.clientY;
            const ov = obtenerOverlay( tempId );
            const C  = document.getElementById( 'contenedor-pagina' );
            estado.resize.startW = ( ov.ancho / 100 ) * C.offsetWidth;
            estado.resize.startH = ( ov.alto  / 100 ) * C.offsetHeight;

            $( document ).on( 'mousemove.resize', function ( ev ) {
                if ( ! estado.redimensionando ) return;
                const C2 = document.getElementById( 'contenedor-pagina' );
                const nw = Math.max( 60, estado.resize.startW + ev.clientX - estado.resize.startX );
                const nh = Math.max( 40, estado.resize.startH + ev.clientY - estado.resize.startY );
                ov.ancho = ( nw / C2.offsetWidth  ) * 100;
                ov.alto  = ( nh / C2.offsetHeight ) * 100;
                $( `.overlay[data-tempid="${ov.tempId}"]` ).css({ width: nw + 'px', height: nh + 'px' });
                actualizarPanelPosicion( ov );
            });
            $( document ).on( 'mouseup.resize', function () {
                estado.redimensionando = false;
                $( document ).off( 'mousemove.resize mouseup.resize' );
            });
        });
    }

    function seleccionarOverlay( tempId ) {
        estado.seleccionado = tempId;
        $( '.overlay' ).removeClass( 'overlay-seleccionado' );
        $( `.overlay[data-tempid="${tempId}"]` ).addClass( 'overlay-seleccionado' );
        const ov = obtenerOverlay( tempId );
        if ( ov ) actualizarPanelPosicion( ov );
        $( '#panel-posicion' ).show();
    }

    function actualizarPanelPosicion( ov ) {
        $( '#pos-left'  ).val( r2( ov.left  ) );
        $( '#pos-top'   ).val( r2( ov.top   ) );
        $( '#pos-ancho' ).val( r2( ov.ancho ) );
        $( '#pos-alto'  ).val( r2( ov.alto  ) );
    }

    function actualizarDesdeInputs() {
        if ( ! estado.seleccionado ) return;
        const ov = obtenerOverlay( estado.seleccionado );
        if ( ! ov ) return;
        ov.left  = parseFloat( $( '#pos-left'  ).val() ) || ov.left;
        ov.top   = parseFloat( $( '#pos-top'   ).val() ) || ov.top;
        ov.ancho = parseFloat( $( '#pos-ancho' ).val() ) || ov.ancho;
        ov.alto  = parseFloat( $( '#pos-alto'  ).val() ) || ov.alto;
        renderizarOverlays();
    }

    function eliminarSeleccionado() {
        if ( ! estado.seleccionado ) return;
        const ov = obtenerOverlay( estado.seleccionado );
        if ( ! ov ) return;
        if ( ov.id ) {
            $.post( flipbookAdmin.ajax_url, {
                action: 'flipbook_eliminar_overlay',
                nonce:  flipbookAdmin.nonce,
                overlay_id: ov.id,
            });
        }
        estado.overlays    = estado.overlays.filter( o => o.tempId !== estado.seleccionado );
        estado.seleccionado = null;
        $( '#panel-posicion' ).hide();
        renderizarOverlays();
    }

    /* =========================================================
       MODALES
    ========================================================= */
    function abrirModal( tipo ) {
        cerrarTodosLosModales();

        if ( tipo === 'audio' ) {
            $( '#archivo-audio' ).val( '' );
            $( '#audio-preview' ).hide();
            $( '#audio-zona-texto' ).text( '⬆ Haz clic para seleccionar audio (mp3, wav, ogg)' );
            $( '#confirmar-audio' ).prop( 'disabled', true );
            $( '#audio-play-btn' ).text( '▶' ).removeClass( 'pausando' );
            const ae = document.getElementById( 'audio-el-preview' );
            if ( ae ) { ae.pause(); ae.src = ''; }
        }
        if ( tipo === 'imagen' ) {
            $( '#archivo-imagen' ).val( '' );
            $( '#vista-previa-imagen' ).hide();
            $( '#zona-imagen-texto' ).text( '⬆ Haz clic aquí para seleccionar una imagen' );
            $( '#confirmar-imagen' ).prop( 'disabled', true );
        }
        if ( tipo === 'youtube' ) {
            $( '#yt-url' ).val( '' );
            $( '#yt-preview-wrap' ).hide();
        }
        if ( tipo === 'presentacion' ) {
            $( '#archivos-slides' ).val( '' );
            $( '#slides-preview-area' ).hide();
            $( '#slides-track' ).empty();
            $( '#slides-dots'  ).empty();
            $( '#confirmar-presentacion' ).prop( 'disabled', true );
            previewSlides = []; previewIndice = 0;
        }

        $( '#fondo-modal' ).show();
        $( '#modal-' + tipo ).show();
    }

    function cerrarTodosLosModales() {
        const ae = document.getElementById( 'audio-el-preview' );
        if ( ae ) ae.pause();
        $( '.modal' ).hide();
        $( '#fondo-modal' ).hide();
    }

    /* =========================================================
       CONFIRMACIONES
    ========================================================= */
    function confirmarYoutube() {
        const url = $( '#yt-url' ).val().trim();
        if ( ! url ) { alert( 'Ingresa una URL de YouTube.' ); return; }
        const videoId = extraerIdYoutube( url );
        if ( ! videoId ) { alert( 'URL de YouTube no válida.' ); return; }

        agregarOverlay( 'youtube', {
            videoId,
            controles: $( '#yt-controles' ).is( ':checked' ) ? 1 : 0,
            autoplay:  $( '#yt-autoplay'  ).is( ':checked' ) ? 1 : 0,
            silencio:  $( '#yt-silencio'  ).is( ':checked' ) ? 1 : 0,
            loop:      $( '#yt-loop'      ).is( ':checked' ) ? 1 : 0,
            inicio:    tiempoASegundos( $( '#yt-inicio' ).val() ),
            modo:      $( 'input[name="yt-modo"]:checked' ).val(),
        }, 20, 20, 30, 18 );
        cerrarTodosLosModales();
    }

    function confirmarImagen() {
        const f = $( '#archivo-imagen' )[0].files[0];
        if ( ! f ) { alert( 'Selecciona una imagen.' ); return; }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_imagen' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'imagen', f );

        $( '#confirmar-imagen' ).text( 'Subiendo…' ).prop( 'disabled', true );
        $.ajax({
            url: flipbookAdmin.ajax_url, method: 'POST',
            data: fd, processData: false, contentType: false,
            success( r ) {
                $( '#confirmar-imagen' ).text( 'De acuerdo' ).prop( 'disabled', false );
                if ( r.success ) {
                    agregarOverlay( 'imagen', { url: r.data.url, attachment_id: r.data.attachment_id }, 10, 10, 30, 25 );
                    cerrarTodosLosModales();
                } else { alert( 'Error al subir: ' + r.data ); }
            }
        });
    }

    function confirmarPresentacion() {
        const archivos = $( '#archivos-slides' )[0].files;
        if ( ! archivos || ! archivos.length ) { alert( 'Selecciona imágenes.' ); return; }

        const max = Math.min( archivos.length, 10 );
        const promesas = [];
        $( '#confirmar-presentacion' ).text( 'Subiendo…' ).prop( 'disabled', true );

        for ( let i = 0; i < max; i++ ) {
            const fd = new FormData();
            fd.append( 'action', 'flipbook_subir_imagen' );
            fd.append( 'nonce',  flipbookAdmin.nonce );
            fd.append( 'imagen', archivos[i] );
            promesas.push( $.ajax({ url: flipbookAdmin.ajax_url, method: 'POST', data: fd, processData: false, contentType: false }) );
        }

        Promise.all( promesas ).then( rs => {
            $( '#confirmar-presentacion' ).text( 'De acuerdo' ).prop( 'disabled', false );
            const urls = rs.filter( r => r.success ).map( r => r.data.url );
            if ( ! urls.length ) { alert( 'No se pudieron subir las imágenes.' ); return; }

            agregarOverlay( 'presentacion', {
                imagenes:   urls,
                autoplay:   $( '#slide-autoplay'  ).is( ':checked' ),
                loop:       $( '#slide-loop'       ).is( ':checked' ),
                aleatorio:  $( '#slide-aleatorio'  ).is( ':checked' ),
                flechas:    $( '#slide-flechas'    ).is( ':checked' ),
                duracion:   parseInt( $( '#slide-duracion' ).val() ),
                transicion: $( '#slide-transicion' ).val(),
            }, 10, 10, 35, 28 );
            cerrarTodosLosModales();
        });
    }

    function confirmarAudio() {
        const f = $( '#archivo-audio' )[0].files[0];
        if ( ! f ) { alert( 'Selecciona un archivo de audio.' ); return; }

        const fd = new FormData();
        fd.append( 'action', 'flipbook_subir_audio' );
        fd.append( 'nonce',  flipbookAdmin.nonce );
        fd.append( 'audio',  f );

        $( '#confirmar-audio' ).text( 'Subiendo…' ).prop( 'disabled', true );
        $.ajax({
            url: flipbookAdmin.ajax_url, method: 'POST',
            data: fd, processData: false, contentType: false,
            success( r ) {
                $( '#confirmar-audio' ).text( 'De acuerdo' ).prop( 'disabled', false );
                if ( r.success ) {
                    agregarOverlay( 'audio', {
                        url:     r.data.url,
                        autoplay: $( '#audio-autoplay' ).is( ':checked' ),
                    }, 5, 5, 8, 9 );
                    cerrarTodosLosModales();
                } else { alert( 'Error al subir el audio: ' + r.data ); }
            }
        });
    }

    function confirmarNumeroPagina() {
        const datos = {
            color: $( '#num-color' ).val(),
            tamanio: parseInt( $( '#num-tamanio' ).val() ) || 24,
            peso: parseInt( $( '#num-peso' ).val() ) || 600,
        };
        
        agregarOverlay( 'numero-pagina', datos, 85, 90, 8, 5 );
        cerrarTodosLosModales();
    }

    /* =========================================================
       DESCARGAR PDF
    ========================================================= */

    function descargarPDF() {
        const $btn = $( '#confirmar-descargar-pdf' );
        const textoOriginal = $btn.text();

        console.log( '📥 Datos para descargar:', {
            flipbook_id: flipbookAdmin.flipbook_id,
            pdf_url: flipbookAdmin.pdf_url
        });

        if ( ! flipbookAdmin.flipbook_id ) {
            alert( '❌ ERROR: El flipbook no existe.\n\n' +
                   'PASOS:\n' +
                   '1. Carga un PDF con "📄 Cargar PDF"\n' +
                   '2. Haz clic en "💾 Guardar cambios"\n' +
                   '3. Recarga la página (F5)\n' +
                   '4. Luego podrás descargar' );
            return;
        }

        if ( ! flipbookAdmin.pdf_url ) {
            alert( '❌ ERROR: No hay PDF cargado en este flipbook.\n\n' +
                   'Carga un PDF primero usando "📄 Cargar PDF"' );
            return;
        }

        const tipo = $( 'input[name="pdf-type"]:checked' ).val();

        console.log( '📥 Descargando PDF tipo:', tipo );
        
        $btn.prop( 'disabled', true ).text( '⏳ Descargando...' );

        if ( tipo === 'original' ) {
            // Descargar PDF original directamente
            console.log( '📄 Descargando PDF original desde:', flipbookAdmin.pdf_url );
            
            setTimeout( () => {
                const link = document.createElement( 'a' );
                link.href = flipbookAdmin.pdf_url;
                link.download = 'flipbook-original.pdf';
                link.style.display = 'none';
                document.body.appendChild( link );
                link.click();
                document.body.removeChild( link );
                
                mostrarNotificacion( '✓ PDF descargándose...', 'exito' );
                cerrarTodosLosModales();
                $btn.prop( 'disabled', false ).text( textoOriginal );
            }, 300 );
        } else {
            // Descargar con overlays (copia del PDF optimizado)
            $.ajax({
                url: flipbookAdmin.ajax_url,
                type: 'POST',
                dataType: 'json',
                timeout: 30000,
                data: {
                    action: 'flipbook_descargar_con_overlays',
                    nonce: flipbookAdmin.nonce,
                    flipbook_id: flipbookAdmin.flipbook_id,
                },
                success: function ( response ) {
                    console.log( '✓ Respuesta descarga:', response );
                    if ( response.success && response.data && response.data.download_url ) {
                        const link = document.createElement( 'a' );
                        link.href = response.data.download_url;
                        link.download = response.data.filename || 'flipbook.pdf';
                        link.style.display = 'none';
                        document.body.appendChild( link );
                        link.click();
                        document.body.removeChild( link );
                        
                        mostrarNotificacion( '✓ PDF descargándose...', 'exito' );
                        cerrarTodosLosModales();
                    } else {
                        mostrarNotificacion( '❌ Error al generar descarga', 'error' );
                    }
                    $btn.prop( 'disabled', false ).text( textoOriginal );
                },
                error: function ( xhr, status, error ) {
                    console.error( '❌ Error AJAX descarga:', { status, error, response: xhr.responseText } );
                    mostrarNotificacion( '❌ Error al descargar PDF', 'error' );
                    $btn.prop( 'disabled', false ).text( textoOriginal );
                },
                complete: function () {
                    if ( ! $btn.prop( 'disabled' ) ) {
                        $btn.prop( 'disabled', false ).text( textoOriginal );
                    }
                }
            });
        }
    }

    /* =========================================================
       OVERLAYS ARRAY
    ========================================================= */
    function agregarOverlay( tipo, datos, left, top, ancho, alto ) {
        const ov = {
            tempId: 'temp_' + ( contadorTemp++ ), id: null,
            tipo, pagina: estado.paginaActual, left, top, ancho, alto, datos,
        };
        estado.overlays.push( ov );
        renderizarOverlays();
        seleccionarOverlay( ov.tempId );
    }

    function obtenerOverlay( tempId ) {
        return estado.overlays.find( o => o.tempId === tempId );
    }

    /* =========================================================
       GUARDAR / CARGAR
    ========================================================= */
    function cargarOverlays() {
        console.log( '🔄 Cargando overlays desde servidor...' );
        $.post( flipbookAdmin.ajax_url, {
            action: 'flipbook_obtener_overlays',
            nonce:  flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
        }, function ( r ) {
            if ( r.success && r.data ) {
                console.log( '✓ Se cargaron', r.data.length, 'overlays' );
                estado.overlays = r.data.map( f => ({
                    tempId: 'server_' + f.id, id: f.id, tipo: f.tipo,
                    pagina: parseInt( f.pagina ),
                    left:  parseFloat( f.pos_left ), top:  parseFloat( f.pos_top ),
                    ancho: parseFloat( f.ancho ),    alto: parseFloat( f.alto ),
                    datos: f.datos,
                }));
                console.log( '📦 Overlays procesados:', estado.overlays.map( o => ({ tipo: o.tipo, pagina: o.pagina }) ) );
                renderizarOverlays();
            } else {
                console.log( '⚠️  Sin overlays para cargar' );
            }
        });
    }

    function guardarTodo() {
        if ( ! estado.flipbookId ) { alert( 'Primero carga un PDF.' ); return; }
        $( '#btn-guardar' ).text( 'Guardando…' ).prop( 'disabled', true );
        $.post( flipbookAdmin.ajax_url, {
            action: 'flipbook_guardar_overlays',
            nonce:  flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            overlays: JSON.stringify( estado.overlays.map( ov => ({
                id: ov.id, tipo: ov.tipo, pagina: ov.pagina,
                left: ov.left, top: ov.top, ancho: ov.ancho, alto: ov.alto, datos: ov.datos,
            }))),
        }, function ( r ) {
            $( '#btn-guardar' ).text( '💾 Guardar cambios' ).prop( 'disabled', false );
            if ( r.success ) {
                mostrarNotificacion( '✓ Guardado correctamente.', 'exito' );
                cargarOverlays();
            } else {
                mostrarNotificacion( 'Error: ' + r.data, 'error' );
            }
        });
    }

    /* =========================================================
       UTILIDADES
    ========================================================= */
    function extraerIdYoutube( url ) {
        const m = url.match( /(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/ );
        if ( m ) return m[1];
        if ( /^[A-Za-z0-9_-]{11}$/.test( url ) ) return url;
        return null;
    }
    function tiempoASegundos( t ) {
        if ( ! t ) return 0;
        const p = t.split( ':' ).map( Number );
        return p.length === 2 ? p[0] * 60 + p[1] : parseInt( t ) || 0;
    }
    function formatTiempo( s ) {
        if ( isNaN( s ) ) return '0:00';
        const m = Math.floor( s / 60 );
        const ss = Math.floor( s % 60 ).toString().padStart( 2, '0' );
        return `${m}:${ss}`;
    }
    function mostrarNotificacion( msg, tipo ) {
        const cls = tipo === 'exito' ? 'notice-success' : 'notice-error';
        const n   = $( `<div class="notice ${cls} is-dismissible"><p>${msg}</p></div>` );
        $( '.barra-superior' ).after( n );
        setTimeout( () => n.fadeOut( 300, () => n.remove() ), 3500 );
    }
    function r2( n ) { return Math.round( n * 100 ) / 100; }
    function escaparHtml( s ) {
        return String( s ).replace( /&/g,'&amp;' ).replace( /</g,'&lt;' )
                          .replace( />/g,'&gt;'  ).replace( /"/g,'&quot;' );
    }

    /* =========================================================
       PREVIEW FULLSCREEN
    ========================================================= */
    let previewState = {
        pdfDoc:       null,
        paginaActual: 1,
        totalPaginas: 0,
    };

    function abrirPreview() {
        if ( ! flipbookAdmin.flipbook_id ) {
            alert( '❌ ERROR: El flipbook no existe.\n\nPrimero debes guardar cambios en un flipbook existente.' );
            return;
        }

        if ( ! flipbookAdmin.pdf_url ) {
            alert( '❌ ERROR: No hay PDF cargado.\n\nCarga un PDF primero.' );
            return;
        }

        console.log( '📂 Abriendo preview del flipbook...' );
        console.log( 'PDF URL:', flipbookAdmin.pdf_url );
        console.log( 'Total páginas:', flipbookAdmin.pdf_paginas );

        previewState.totalPaginas = flipbookAdmin.pdf_paginas;
        $( '#preview-total' ).text( previewState.totalPaginas );
        $( '#preview-pagina' ).attr( 'max', previewState.totalPaginas );

        $( '#modal-preview' ).show();

        // Cargar PDF
        pdfjsLib.getDocument( flipbookAdmin.pdf_url ).promise.then( function ( pdf ) {
            previewState.pdfDoc = pdf;
            irAPreview( 1 );
        }).catch( err => {
            console.error( '❌ Error cargando PDF:', err );
            alert( '❌ Error al cargar el PDF en la vista previa.' );
        });
    }

    function cerrarPreview() {
        $( '#modal-preview' ).hide();
        previewState.pdfDoc = null;
    }

    function navPreview( direccion ) {
        const nueva = previewState.paginaActual + direccion;
        if ( nueva >= 1 && nueva <= previewState.totalPaginas ) {
            irAPreview( nueva );
        }
    }

    function irAPreview( n ) {
        if ( ! previewState.pdfDoc || n < 1 || n > previewState.totalPaginas ) return;
        
        previewState.paginaActual = n;
        $( '#preview-pagina' ).val( n );

        previewState.pdfDoc.getPage( n ).then( function ( page ) {
            const vp = page.getViewport({ scale: 1 });
            const canvas = document.getElementById( 'preview-canvas' );
            const ctx = canvas.getContext( '2d' );
            
            canvas.width  = vp.width;
            canvas.height = vp.height;

            page.render({ canvasContext: ctx, viewport: vp }).promise.then( () => {
                renderizarOverlaysPreview( n, vp.width, vp.height );
            });
        });
    }

    function renderizarOverlaysPreview( numPag, W, H ) {
        const $overlays = $( '#preview-overlays' );
        $overlays.html( '' );
        $overlays.css({ width: W + 'px', height: H + 'px' });

        ( estado.overlays || [] )
            .filter( ov => parseInt( ov.pagina ) === numPag )
            .forEach( ov => {
                const el = crearOverlayParaPreview( ov, W, H );
                if ( el ) $overlays.append( el );
            });
    }

    function crearOverlayParaPreview( ov, W, H ) {
        const left  = ( parseFloat( ov.left || 0 ) / 100 ) * W;
        const top   = ( parseFloat( ov.top  || 0 ) / 100 ) * H;
        const ancho = ( parseFloat( ov.ancho || 20 ) / 100 ) * W;
        const alto  = ( parseFloat( ov.alto  || 10 ) / 100 ) * H;

        const wrap = $( '<div></div>' ).css({
            position: 'absolute',
            left:  left + 'px',
            top:   top + 'px',
            width: ancho + 'px',
            height: alto + 'px',
            overflow: 'hidden',
            borderRadius: '4px',
            opacity: 0.8,
            border: '1px solid #999'
        });

        const d = ov.datos || {};

        switch ( ov.tipo ) {
            case 'youtube':
                if ( d.modo === 'popup' ) {
                    const thumb = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
                    wrap.css({ background: '#000', cursor: 'pointer' })
                        .html( `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;opacity:.7;" />` );
                } else {
                    wrap.html( `<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;">🎬 Video YouTube</div>` );
                }
                break;

            case 'imagen':
                wrap.html( `<img src="${d.url}" style="width:100%;height:100%;object-fit:cover;" />` );
                break;

            case 'presentacion':
                wrap.html( `<div style="width:100%;height:100%;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);display:flex;align-items:center;justify-content:center;color:#fff;">📽 Presentación (${d.slides ? d.slides.length : 0} img.)</div>` );
                break;

            case 'audio':
                wrap.css({ background: '#C70000' })
                    .html( `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;">🔊</div>` );
                break;

            case 'numero-pagina':
                wrap.css({ border: 'none', background: 'transparent' })
                    .html( `<div style="font-weight:bold;font-size:18px;color:#000;">${previewState.paginaActual}</div>` );
                break;

            default:
                return null;
        }

        return wrap;
    }

    function descargarDesdePreview() {
        $( '#modal-preview' ).hide();
        setTimeout( () => {
            $( '#modal-descargar-pdf' ).show();
        }, 200 );
    }

})( jQuery );