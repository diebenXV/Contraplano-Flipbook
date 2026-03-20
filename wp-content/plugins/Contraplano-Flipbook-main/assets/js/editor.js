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

    // Configuración de números de página
    const configNumerosPage = {
        colorNumero:     '#666666',
        colorFondo:      '#FFFFFF',
        opacidadFondo:   0.8,
        posicion:        'inferior-derecha', // inferior-derecha, inferior-izquierda, superior-derecha, superior-izquierda, centro, superior-centro, inferior-centro
        tamanio:         14,
        mostrar:         true,
    };

    /* =========================================================
       INIT
    ========================================================= */
    $( document ).ready( function () {
        construirEditor();
        if ( estado.pdfUrl && estado.totalPaginas > 0 ) cargarPDF( estado.pdfUrl );
        if ( estado.flipbookId ) {
            cargarOverlays();
            mostrarBotonPreview( estado.flipbookId );
        }
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
                    <button id="btn-preview" class="btn-preview" style="display:none;">
                        👁 Vista previa
                    </button>
                    <button id="btn-guardar" class="btn-primario">💾 Guardar cambios</button>
                </div>
            </div>

            <div class="area-principal">

                <div class="sidebar">
                    <div class="sidebar-titulo">Insertar elemento</div>

                    <button class="btn-herramienta" data-tipo="link">
                        <span class="icono-herramienta">🔗</span>
                        Insertar enlace
                    </button>
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

                    <div class="separador"></div>
                    <div class="sidebar-titulo">⚙ Números de página</div>
                    
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox-label">
                            <input type="checkbox" id="cfg-mostrar-numeros" checked />
                            Mostrar números
                        </label>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label>Color del número:</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="color" id="cfg-color-numero" value="#666666" />
                            <span id="cfg-color-numero-hex" style="font-size: 12px; color: #666;">#666666</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label>Color fondo:</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="color" id="cfg-color-fondo" value="#FFFFFF" />
                            <span id="cfg-color-fondo-hex" style="font-size: 12px; color: #666;">#FFFFFF</span>
                        </div>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label>Opacidad fondo: <span id="cfg-opacidad-val">80</span>%</label>
                        <input type="range" id="cfg-opacidad" min="0" max="100" value="80" style="width: 100%; cursor: pointer;" />
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label>Posición:</label>
                        <select id="cfg-posicion" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 12px;">
                            <option value="inferior-derecha">Inferior derecha</option>
                            <option value="inferior-izquierda">Inferior izquierda</option>
                            <option value="inferior-centro">Inferior centro</option>
                            <option value="superior-derecha">Superior derecha</option>
                            <option value="superior-izquierda">Superior izquierda</option>
                            <option value="superior-centro">Superior centro</option>
                            <option value="centro">Centro</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label>Tamaño de fuente: <span id="cfg-tamanio-val">14</span>px</label>
                        <input type="range" id="cfg-tamanio" min="8" max="32" value="14" style="width: 100%; cursor: pointer;" />
                    </div>

                    <div class="separador"></div>
                    <div class="sidebar-titulo">Página</div>
                    <div class="nav-paginas">
                        <button id="btn-anterior">‹</button>
                        <input type="text"
                               id="input-pagina"
                               value="1"
                               inputmode="numeric"
                               pattern="[0-9]*" />
                        <span class="nav-sep">/</span>
                        <span id="total-paginas">0</span>
                        <button id="btn-siguiente">›</button>
                    </div>

                    <div id="panel-posicion" style="display:none;">
                        <div class="sidebar-titulo" style="margin-top:10px;">Posición y tamaño</div>
                        <div class="grilla-posicion-compacta">
                            <div class="campo-pos-compacto">
                                <span class="pos-label">Izquierda</span>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-left" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-pos-compacto">
                                <span class="pos-label">Superior</span>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-top" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-pos-compacto">
                                <span class="pos-label">Ancho</span>
                                <div class="input-porcentaje">
                                    <input type="number" id="pos-ancho" step="0.1" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-pos-compacto">
                                <span class="pos-label">Altura</span>
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

        <!-- MODAL Insertar enlace -->
        <div id="modal-link" class="modal" style="display:none;">
            <div class="modal-contenido">
                <div class="modal-cabecera">
                    <h3>Insertar enlace</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">

                    <!-- Tipo de enlace -->
                    <label>Tipo:</label>
                    <div class="link-tipos">
                        <label class="link-tipo-opcion activa" data-tipo="url">
                            <input type="radio" name="link-tipo" value="url" checked /> URL
                        </label>
                        <label class="link-tipo-opcion" data-tipo="pagina">
                            <input type="radio" name="link-tipo" value="pagina" /> Página
                        </label>
                        <label class="link-tipo-opcion" data-tipo="email">
                            <input type="radio" name="link-tipo" value="email" /> E-mail
                        </label>
                        <label class="link-tipo-opcion" data-tipo="telefono">
                            <input type="radio" name="link-tipo" value="telefono" /> Teléfono
                        </label>
                    </div>

                    <!-- Campo URL -->
                    <div id="link-campo-url">
                        <label>URL:</label>
                        <input type="text" id="link-url"
                               placeholder="https://ejemplo.com o ejemplo.com" />
                        <small>Ejemplo: https://contraplano.cl o contraplano.cl</small>
                    </div>

                    <!-- Campo Página (número de página del flipbook) -->
                    <div id="link-campo-pagina" style="display:none;">
                        <label>Número de página:</label>
                        <input type="number" id="link-pagina" min="1" placeholder="Ej: 3" />
                        <small>Al hacer clic irá a esa página del flipbook.</small>
                    </div>

                    <!-- Campo E-mail -->
                    <div id="link-campo-email" style="display:none;">
                        <label>Dirección de e-mail:</label>
                        <input type="email" id="link-email" placeholder="correo@ejemplo.com" />
                    </div>

                    <!-- Campo Teléfono -->
                    <div id="link-campo-telefono" style="display:none;">
                        <label>Número de teléfono:</label>
                        <input type="tel" id="link-telefono" placeholder="+56912345678" />
                        <small>Incluye el código de país. Ej: +56912345678</small>
                    </div>

                    <!-- Título / tooltip del enlace -->
                    <label>Título (tooltip opcional):</label>
                    <input type="text" id="link-titulo" placeholder="Texto que aparece al pasar el cursor" />

                    <!-- Ícono visible -->
                    <label>Ícono:</label>
                    <div class="link-iconos">
                        <button class="link-icono-btn activo" data-icono="ninguno" type="button" title="Sin ícono">
                            Ninguno
                        </button>
                        <button class="link-icono-btn" data-icono="mas" type="button" title="Más / Añadir">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                        </button>
                        <button class="link-icono-btn" data-icono="check" type="button" title="Check / Confirmar">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/></svg>
                        </button>
                        <button class="link-icono-btn" data-icono="info" type="button" title="Información">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        </button>
                        <button class="link-icono-btn" data-icono="pregunta" type="button" title="Ayuda">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
                        </button>
                        <button class="link-icono-btn" data-icono="carrito" type="button" title="Comprar">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.25 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </button>
                    </div>

                    <!-- Color del ícono -->
                    <div id="link-color-wrap" style="display:none;">
                        <label>Color del ícono:</label>
                        <div class="link-color-fila">
                            <input type="color" id="link-color" value="#1a6fcf" />
                            <span id="link-color-hex">#1a6fcf</span>
                        </div>
                    </div>

                    <!-- Abrir en nueva pestaña (solo para URL y email) -->
                    <div id="link-nueva-pestana-wrap">
                        <label class="link-check-inline">
                            <input type="checkbox" id="link-nueva-pestana" checked />
                            Abrir en nueva pestaña
                        </label>
                    </div>

                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-link" class="btn-confirmar">De acuerdo</button>
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

        // ---- Configuración de números de página ----
        $( '#cfg-mostrar-numeros' ).on( 'change', function () {
            configNumerosPage.mostrar = this.checked;
            renderizarPagina( estado.paginaActual );
        });

        $( '#cfg-color-numero' ).on( 'input', function () {
            configNumerosPage.colorNumero = this.value;
            $( '#cfg-color-numero-hex' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });

        $( '#cfg-color-fondo' ).on( 'input', function () {
            configNumerosPage.colorFondo = this.value;
            $( '#cfg-color-fondo-hex' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });

        $( '#cfg-opacidad' ).on( 'input', function () {
            configNumerosPage.opacidadFondo = parseInt( this.value ) / 100;
            $( '#cfg-opacidad-val' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });

        $( '#cfg-posicion' ).on( 'change', function () {
            configNumerosPage.posicion = this.value;
            renderizarPagina( estado.paginaActual );
        });

        $( '#cfg-tamanio' ).on( 'input', function () {
            configNumerosPage.tamanio = parseInt( this.value );
            $( '#cfg-tamanio-val' ).text( this.value );
            renderizarPagina( estado.paginaActual );
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
        $( '#confirmar-link'         ).on( 'click', confirmarLink );

        // ---- Eventos del modal de enlace ----

        // Cambiar tipo de enlace: URL / Página / E-mail / Teléfono
        $( document ).on( 'change', 'input[name="link-tipo"]', function () {
            const tipo = $( this ).val();
            $( '#link-campo-url, #link-campo-pagina, #link-campo-email, #link-campo-telefono' ).hide();
            $( `#link-campo-${tipo}` ).show();
            // Mostrar/ocultar "abrir en nueva pestaña" solo para URL y email
            $( '#link-nueva-pestana-wrap' ).toggle( tipo === 'url' || tipo === 'email' );
            // Resaltar opción activa
            $( '.link-tipo-opcion' ).removeClass( 'activa' );
            $( this ).closest( '.link-tipo-opcion' ).addClass( 'activa' );
        });

        // Seleccionar ícono
        $( document ).on( 'click', '.link-icono-btn', function () {
            $( '.link-icono-btn' ).removeClass( 'activo' );
            $( this ).addClass( 'activo' );
            const tieneIcono = $( this ).data( 'icono' ) !== 'ninguno';
            $( '#link-color-wrap' ).toggle( tieneIcono );
        });

        // Actualizar hex al cambiar color
        $( document ).on( 'input', '#link-color', function () {
            $( '#link-color-hex' ).text( $( this ).val() );
        });

        // Navegación páginas (input manual sin flechas tipo number)
        $( '#btn-anterior' ).on( 'click', () => irAPagina( estado.paginaActual - 1 ) );
        $( '#btn-siguiente' ).on( 'click', () => irAPagina( estado.paginaActual + 1 ) );
        $( document ).on( 'change blur', '#input-pagina', function () {
            const n = parseInt( this.value );
            if ( ! isNaN( n ) ) irAPagina( n );
        });
        // Permitir solo dígitos en el input de página
        $( document ).on( 'keypress', '#input-pagina', function ( e ) {
            if ( e.which === 13 ) { // Enter
                const n = parseInt( this.value );
                if ( ! isNaN( n ) ) irAPagina( n );
            }
        });

        // Panel de posición
        $( '#pos-left, #pos-top, #pos-ancho, #pos-alto' ).on( 'input', actualizarDesdeInputs );
        $( '#btn-eliminar' ).on( 'click', eliminarSeleccionado );
        $( '#btn-guardar'  ).on( 'click', guardarTodo );

        // Vista previa — abre el visor en nueva pestaña
        $( document ).on( 'click', '#btn-preview', function () {
            if ( ! estado.flipbookId ) { alert( 'Primero guarda el flipbook.' ); return; }
            const url = flipbookAdmin.ajax_url.replace( 'admin-ajax.php', '' )
                + 'admin.php?page=flipbook-preview&flipbook_id=' + estado.flipbookId;
            window.open( url, '_blank' );
        });
    }

    /**
     * Muestra el botón de Vista previa y actualiza su URL.
     * Se llama cuando el flipbookId está disponible (al cargar o al subir el primer PDF).
     */
    function mostrarBotonPreview( id ) {
        if ( ! id ) return;
        $( '#btn-preview' ).show();
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
                    estado.flipbookId   = d.flipbook_id;
                    estado.pdfUrl       = d.pdf_url;
                    estado.totalPaginas = d.paginas;
                    $( '#info-pdf' ).text( `✓ PDF cargado (${d.tamanio}) — ${d.paginas} páginas` );
                    $( '#total-paginas' ).text( d.paginas );
                    $( '#input-pagina'  ).attr( 'max', d.paginas );
                    // Mostrar botón de vista previa ahora que el flipbook existe
                    mostrarBotonPreview( d.flipbook_id );
                    cargarPDF( d.pdf_url );
                } else {
                    $( '#info-pdf' ).text( 'Error: ' + r.data );
                }
            },
            error() { $( '#info-pdf' ).text( 'Error al conectar con el servidor.' ); }
        });
    }

    function cargarPDF( url ) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument( url ).promise.then( pdf => {
            estado.pdfDoc       = pdf;
            estado.totalPaginas = pdf.numPages;
            $( '#total-paginas' ).text( pdf.numPages );
            $( '#input-pagina'  ).attr( 'max', pdf.numPages );
            renderizarPagina( 1 );
        });
    }

    function renderizarPagina( num ) {
        if ( ! estado.pdfDoc ) return;
        num = Math.max( 1, Math.min( num, estado.totalPaginas ) );
        estado.paginaActual = num;
        $( '#input-pagina' ).val( num );

        estado.pdfDoc.getPage( num ).then( pag => {
            const vp = pag.getViewport({ scale: 1.5 });
            const cv = document.getElementById( 'canvas-pdf' );
            cv.width  = vp.width;
            cv.height = vp.height;
            $( '#contenedor-pagina' ).css({ width: vp.width + 'px', height: vp.height + 'px' });
            pag.render({ canvasContext: cv.getContext( '2d' ), viewport: vp })
               .promise.then( () => {
                   dibujarNumeroPagina( cv, num, estado.totalPaginas );
                   renderizarOverlays();
               });
        });
    }

    function dibujarNumeroPagina( canvas, paginaActual, totalPaginas ) {
        if ( ! configNumerosPage.mostrar ) return;

        const ctx = canvas.getContext( '2d' );
        const padding = 15;
        const fontSize = Math.max( configNumerosPage.tamanio, canvas.width * 0.015 );
        const texto = `${paginaActual} / ${totalPaginas}`;

        // Configurar fuente
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = configNumerosPage.colorNumero;
        ctx.textBaseline = 'bottom';

        // Medir ancho del texto para agregar fondo
        const metrics = ctx.measureText( texto );
        const textWidth = metrics.width;
        const textHeight = fontSize + 4;

        // Calcular posición según configuración
        let x, y;
        const posicion = configNumerosPage.posicion;

        if ( posicion === 'inferior-derecha' ) {
            ctx.textAlign = 'right';
            x = canvas.width - padding;
            y = canvas.height - padding;
        } else if ( posicion === 'inferior-izquierda' ) {
            ctx.textAlign = 'left';
            x = padding;
            y = canvas.height - padding;
        } else if ( posicion === 'inferior-centro' ) {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = canvas.height - padding;
        } else if ( posicion === 'superior-derecha' ) {
            ctx.textAlign = 'right';
            x = canvas.width - padding;
            y = padding + fontSize;
        } else if ( posicion === 'superior-izquierda' ) {
            ctx.textAlign = 'left';
            x = padding;
            y = padding + fontSize;
        } else if ( posicion === 'superior-centro' ) {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = padding + fontSize;
        } else if ( posicion === 'centro' ) {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = ( canvas.height / 2 ) + ( fontSize / 2 );
        }

        // Calcular posición del fondo
        let bgX, bgY, bgWidth = textWidth + 8, bgHeight = textHeight + 4;

        if ( posicion === 'inferior-derecha' ) {
            bgX = canvas.width - textWidth - padding - 4;
            bgY = canvas.height - textHeight - padding;
        } else if ( posicion === 'inferior-izquierda' ) {
            bgX = padding - 4;
            bgY = canvas.height - textHeight - padding;
        } else if ( posicion === 'inferior-centro' ) {
            bgX = ( canvas.width / 2 ) - ( bgWidth / 2 );
            bgY = canvas.height - textHeight - padding;
        } else if ( posicion === 'superior-derecha' ) {
            bgX = canvas.width - textWidth - padding - 4;
            bgY = padding - 4;
        } else if ( posicion === 'superior-izquierda' ) {
            bgX = padding - 4;
            bgY = padding - 4;
        } else if ( posicion === 'superior-centro' ) {
            bgX = ( canvas.width / 2 ) - ( bgWidth / 2 );
            bgY = padding - 4;
        } else if ( posicion === 'centro' ) {
            bgX = ( canvas.width / 2 ) - ( bgWidth / 2 );
            bgY = ( canvas.height / 2 ) - ( bgHeight / 2 );
        }

        // Dibujar fondo semi-transparente
        const rgbColor = hexToRgb( configNumerosPage.colorFondo );
        ctx.fillStyle = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${configNumerosPage.opacidadFondo})`;
        ctx.fillRect( bgX, bgY, bgWidth, bgHeight );

        // Dibujar texto
        ctx.fillStyle = configNumerosPage.colorNumero;
        ctx.fillText( texto, x, y );
    }

    function hexToRgb( hex ) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec( hex );
        return result ? {
            r: parseInt( result[1], 16 ),
            g: parseInt( result[2], 16 ),
            b: parseInt( result[3], 16 )
        } : { r: 102, g: 102, b: 102 };
    }

    function irAPagina( n ) { renderizarPagina( n ); }

    /* =========================================================
       OVERLAYS
    ========================================================= */
    function renderizarOverlays() {
        const capa = $( '#capa-overlays' );
        const C    = document.getElementById( 'contenedor-pagina' );
        const W    = C.offsetWidth;
        const H    = C.offsetHeight;

        // Detener audios antes de limpiar
        capa.find( '.ov-audio-el' ).each( function () { this.pause(); });
        capa.empty().css({ width: W + 'px', height: H + 'px' });

        estado.overlays
            .filter( ov => ov.pagina === estado.paginaActual )
            .forEach( ov => capa.append( construirElOverlay( ov, W, H ) ) );

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
            case 'link': {
                // Área clicable que muestra el ícono elegido y un borde de enlace
                const d        = ov.datos;
                const etiqueta = d.titulo || d.href || 'Enlace';
                const color    = escaparHtml( d.color || '#1a6fcf' );

                const svgIconos = {
                    mas:       '<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>',
                    check:     '<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/></svg>',
                    info:      '<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
                    pregunta:  '<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>',
                    carrito:   '<svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.25 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>',
                };

                const tieneIcono = d.icono && d.icono !== 'ninguno' && svgIconos[ d.icono ];

                inner = `<div class="ov-link-container" style="border-color:${color};" title="${escaparHtml(etiqueta)}">
                    ${tieneIcono
                        ? `<div class="ov-link-icono" style="color:${color};">${svgIconos[d.icono]}</div>`
                        : `<div class="ov-link-label" style="color:${color};">🔗 ${escaparHtml(etiqueta.substring(0,20))}</div>`
                    }
                </div>`;
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

        if ( tipo === 'link' ) {
            $( '#link-url' ).val( '' );
            $( '#link-pagina' ).val( '' );
            $( '#link-email' ).val( '' );
            $( '#link-telefono' ).val( '' );
            $( '#link-titulo' ).val( '' );
            $( '#link-nueva-pestana' ).prop( 'checked', true );
            $( 'input[name="link-tipo"][value="url"]' ).prop( 'checked', true ).trigger( 'change' );
            $( '.link-icono-btn' ).removeClass( 'activo' );
            $( '.link-icono-btn[data-icono="ninguno"]' ).addClass( 'activo' );
            $( '#link-color-wrap' ).hide();
            $( '#link-color' ).val( '#1a6fcf' );
            $( '#link-color-hex' ).text( '#1a6fcf' );
        }
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

    function confirmarLink() {
        const tipo = $( 'input[name="link-tipo"]:checked' ).val();
        let href    = '';
        let valido  = true;

        switch ( tipo ) {
            case 'url': {
                let url = $( '#link-url' ).val().trim();
                if ( ! url ) { alert( 'Ingresa una URL.' ); return; }
                // Agregar https:// si no tiene protocolo
                if ( ! /^https?:\/\//i.test( url ) ) url = 'https://' + url;
                href = url;
                break;
            }
            case 'pagina': {
                const pag = parseInt( $( '#link-pagina' ).val() );
                if ( ! pag || pag < 1 ) { alert( 'Ingresa un número de página válido.' ); return; }
                href = 'pagina:' + pag;
                break;
            }
            case 'email': {
                const email = $( '#link-email' ).val().trim();
                if ( ! email || ! email.includes( '@' ) ) { alert( 'Ingresa un e-mail válido.' ); return; }
                href = 'mailto:' + email;
                break;
            }
            case 'telefono': {
                const tel = $( '#link-telefono' ).val().trim().replace( /\s/g, '' );
                if ( ! tel ) { alert( 'Ingresa un número de teléfono.' ); return; }
                href = 'tel:' + tel;
                break;
            }
        }

        const icono        = $( '.link-icono-btn.activo' ).data( 'icono' ) || 'ninguno';
        const color        = $( '#link-color' ).val() || '#1a6fcf';
        const titulo       = $( '#link-titulo' ).val().trim();
        const nuevaPestana = $( '#link-nueva-pestana' ).is( ':checked' );

        agregarOverlay( 'link', {
            href, tipo, icono, color, titulo, nuevaPestana,
        }, 15, 15, 20, 10 );

        cerrarTodosLosModales();
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
        $.post( flipbookAdmin.ajax_url, {
            action: 'flipbook_obtener_overlays',
            nonce:  flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
        }, function ( r ) {
            if ( r.success && r.data ) {
                estado.overlays = r.data.map( f => ({
                    tempId: 'server_' + f.id, id: f.id, tipo: f.tipo,
                    pagina: parseInt( f.pagina ),
                    left:  parseFloat( f.pos_left ), top:  parseFloat( f.pos_top ),
                    ancho: parseFloat( f.ancho ),    alto: parseFloat( f.alto ),
                    datos: f.datos,
                }));
                renderizarOverlays();
            }
        });

        // Cargar configuración de números de página
        $.post( flipbookAdmin.ajax_url, {
            action: 'flipbook_cargar_config_numeros',
            nonce:  flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
        }, function ( r ) {
            if ( r.success && r.data ) {
                configNumerosPage.colorNumero    = r.data.colorNumero    || '#666666';
                configNumerosPage.colorFondo     = r.data.colorFondo     || '#FFFFFF';
                configNumerosPage.opacidadFondo  = r.data.opacidadFondo  || 0.8;
                configNumerosPage.posicion       = r.data.posicion       || 'inferior-derecha';
                configNumerosPage.tamanio        = r.data.tamanio        || 14;
                configNumerosPage.mostrar        = r.data.mostrar !== false;

                // Actualizar UI
                $( '#cfg-mostrar-numeros' ).prop( 'checked', configNumerosPage.mostrar );
                $( '#cfg-color-numero' ).val( configNumerosPage.colorNumero );
                $( '#cfg-color-numero-hex' ).text( configNumerosPage.colorNumero );
                $( '#cfg-color-fondo' ).val( configNumerosPage.colorFondo );
                $( '#cfg-color-fondo-hex' ).text( configNumerosPage.colorFondo );
                $( '#cfg-opacidad' ).val( Math.round( configNumerosPage.opacidadFondo * 100 ) );
                $( '#cfg-opacidad-val' ).text( Math.round( configNumerosPage.opacidadFondo * 100 ) );
                $( '#cfg-posicion' ).val( configNumerosPage.posicion );
                $( '#cfg-tamanio' ).val( configNumerosPage.tamanio );
                $( '#cfg-tamanio-val' ).text( configNumerosPage.tamanio );
            }
        });
    }

    function guardarTodo() {
        if ( ! estado.flipbookId ) { alert( 'Primero carga un PDF.' ); return; }
        $( '#btn-guardar' ).text( 'Guardando…' ).prop( 'disabled', true );

        const tituloNuevo = $( '#input-titulo' ).val().trim() || 'Flipbook sin título';

        // Guardar el título del post en WordPress
        $.post( flipbookAdmin.ajax_url, {
            action:      'flipbook_guardar_titulo',
            nonce:       flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            titulo:      tituloNuevo,
        });

        // Guardar la configuración de números de página
        $.post( flipbookAdmin.ajax_url, {
            action:      'flipbook_guardar_config_numeros',
            nonce:       flipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            config:      JSON.stringify( configNumerosPage ),
        });

        // Guardar los overlays
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

})( jQuery );
