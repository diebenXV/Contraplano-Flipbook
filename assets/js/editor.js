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
        flipbookId:      parseInt( contraplanoFlipbookAdmin.flipbook_id ) || 0,
        pdfUrl:          contraplanoFlipbookAdmin.pdf_url || '',
        totalPaginas:    parseInt( contraplanoFlipbookAdmin.pdf_paginas ) || 0,
        paginaActual:    1,
        pdfDoc:          null,
        overlays:        [],
        seleccionado:    null,
        pageMap:         [],
        arrastrando:     false,
        redimensionando: false,
        arrastre:        { offsetX: 0, offsetY: 0 },
        resize:          { startX: 0, startY: 0, startW: 0, startH: 0 },
    };

    // Configuración de números de página (objeto separado, se persiste en BD)
    const configNumerosPage = {
        colorNumero:    '#666666',
        colorFondo:     '#00FFFF',
        opacidadFondo:  1,
        mostrarFondo:   true,
        posicion:       'inferior-centro',
        tamanio:        14,
        mostrar:        true,
    };

    // Snapshot de los colores globales originales. Se usa para distinguir overrides
    // por página de los valores globales. Debe vivir en el scope exterior porque lo
    // leen tanto construirEditor() como cargarOverlays() (callback asíncrono).
    var _globalOriginal = {
        colorNumero:   configNumerosPage.colorNumero,
        colorFondo:    configNumerosPage.colorFondo,
        opacidadFondo: configNumerosPage.opacidadFondo,
        mostrarFondo:  configNumerosPage.mostrarFondo,
    };

    const COLOR_AUDIO = '#C70000';
    let contadorTemp  = 1;

    // Límite de tamaño por imagen del slider (bytes). 10 MB, igual que audio.
    const MAX_SLIDE_BYTES = 10 * 1024 * 1024;

    // Estado interno del slider de preview en modal.
    // Cada entrada es { src: dataURL|urlPublica, tamanio: bytes|0 }.
    // Las imágenes cargadas al editar un overlay existente tienen tamanio=0
    // porque solo conocemos su URL pública, no su peso en disco.
    let previewSlides = [];
    let previewIndice = 0;

    function formatearBytes( bytes ) {
        if ( ! bytes ) return '';
        if ( bytes >= 1048576 ) return ( bytes / 1048576 ).toFixed( 2 ) + ' MB';
        if ( bytes >= 1024 )    return ( bytes / 1024 ).toFixed( 2 ) + ' KB';
        return bytes + ' B';
    }

    // PDF cargado para insertar página
    var _insertarPdfDoc = null;

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
                           value="${escaparHtml(contraplanoFlipbookAdmin.titulo)}"
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
                    <button class="btn-herramienta" data-tipo="pagina">
                        <span class="icono-herramienta">📄</span>
                        Insertar página
                    </button>

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
                    <button id="btn-mover-pagina" class="btn-secundario" style="width:100%;margin-top:8px;font-size:12px;padding:6px;">↔ Mover esta página</button>
                    <button id="btn-eliminar-pagina" class="btn-peligro" style="width:100%;margin-top:4px;font-size:12px;padding:6px;">🗑 Eliminar esta página</button>

                    <!-- SECCIÓN NÚMEROS DE PÁGINA -->
                    <div class="separador"></div>
                    <div class="sidebar-titulo">⚙ Números de página</div>

                    <div style="margin-bottom:10px;">
                        <label class="pnum-check-label">
                            <input type="checkbox" id="cfg-mostrar-numeros" checked />
                            Mostrar números
                        </label>
                    </div>
                    <div style="margin-bottom:8px;">
                        <label class="pnum-check-label">
                            <input type="checkbox" id="cfg-solo-esta-pagina" checked />
                            Aplicar colores solo a esta página
                        </label>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label class="pnum-label">Color del número:</label>
                        <div class="pnum-color-fila">
                            <input type="color" id="cfg-color-numero" value="#666666" />
                            <span id="cfg-color-numero-hex" class="pnum-hex">#666666</span>
                        </div>
                    </div>
                    <div style="margin-bottom:6px;">
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;">
                            <input type="checkbox" id="cfg-mostrar-fondo" checked />
                            Mostrar color de fondo
                        </label>
                    </div>
                    <div id="cfg-fondo-controles">
                        <div style="margin-bottom:10px;">
                            <label class="pnum-label">Color fondo:</label>
                            <div class="pnum-color-fila">
                                <input type="color" id="cfg-color-fondo" value="#00FFFF" />
                                <span id="cfg-color-fondo-hex" class="pnum-hex">#00FFFF</span>
                            </div>
                        </div>
                        <div style="margin-bottom:10px;">
                            <label class="pnum-label">Opacidad fondo: <span id="cfg-opacidad-val">100</span>%</label>
                            <input type="range" id="cfg-opacidad" min="0" max="100" value="100" class="pnum-slider" />
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label class="pnum-label">Posición:</label>
                        <select id="cfg-posicion" class="pnum-select">
                            <option value="inferior-derecha">Inferior derecha</option>
                            <option value="inferior-izquierda">Inferior izquierda</option>
                            <option value="inferior-centro" selected>Inferior centro</option>
                            <option value="superior-derecha">Superior derecha</option>
                            <option value="superior-izquierda">Superior izquierda</option>
                            <option value="superior-centro">Superior centro</option>
                            <option value="centro">Centro</option>
                            <option value="personalizada">Personalizada (X, Y)</option>
                        </select>
                    </div>
                    <div id="cfg-pos-custom" style="display:none;margin-bottom:10px;">
                        <div class="grilla-posicion-compacta">
                            <div class="campo-pos-compacto">
                                <span class="pos-label">X</span>
                                <div class="input-porcentaje">
                                    <input type="number" id="cfg-num-x" step="0.1" value="50" /><span>%</span>
                                </div>
                            </div>
                            <div class="campo-pos-compacto">
                                <span class="pos-label">Y</span>
                                <div class="input-porcentaje">
                                    <input type="number" id="cfg-num-y" step="0.1" value="95" /><span>%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label class="pnum-label">Tamaño de fuente: <span id="cfg-tamanio-val">14</span>px</label>
                        <input type="range" id="cfg-tamanio" min="8" max="32" value="14" class="pnum-slider" />
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

                        <!-- Opciones específicas de audio (solo visible cuando se selecciona un audio) -->
                        <div id="panel-audio-opciones" style="display:none;margin-top:10px;">
                            <div class="separador"></div>
                            <div class="sidebar-titulo">🔊 Opciones de audio</div>
                            <label class="pnum-check-label" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
                                <span>Autoplay</span>
                                <div class="toggle-switch">
                                    <input type="checkbox" id="ov-audio-autoplay" />
                                    <span class="toggle-slider-ui"></span>
                                </div>
                            </label>
                        </div>

                        <!-- Opciones específicas de presentación -->
                        <div id="panel-presentacion-opciones" style="display:none;margin-top:10px;">
                            <div class="separador"></div>
                            <div class="sidebar-titulo">📽 Opciones de presentación</div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button id="btn-editar-presentacion" class="btn-accion-ov" type="button">✏ Editar</button>
                                <button id="btn-copiar-presentacion" class="btn-accion-ov" type="button">📋 Copiar</button>
                                <button id="btn-eliminar-presentacion" class="btn-accion-ov btn-accion-ov-danger" type="button">🗑 Eliminar</button>
                            </div>
                        </div>
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
                        <span>⬆ Haz clic para seleccionar imágenes (máx. 10, 10 MB por imagen)</span>
                        <input type="file" id="archivos-slides" accept="image/*" multiple style="display:none;" />
                    </div>

                    <div id="slides-preview-area" style="display:none;">
                        <div class="slides-preview-header">
                            <span id="slides-preview-contador"></span>
                        </div>
                        <!-- Lista de imágenes con drag & drop para reordenar -->
                        <div id="slides-list" class="slides-sortable-list"></div>
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
                                <option value="2">2 segundos</option>
                                <option value="3" selected>3 segundos</option>
                                <option value="4">4 segundos</option>
                                <option value="5">5 segundos</option>
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
                            <input type="checkbox" id="audio-autoplay" checked />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="audio-color-config">
                        <label for="audio-icon-color">Color del ícono:</label>
                        <div class="audio-color-fila">
                            <input type="color" id="audio-icon-color" value="#C70000" />
                            <span id="audio-icon-color-hex">#C70000</span>
                        </div>
                    </div>

                    <div class="zona-arrastre clickable" id="zona-audio-click">
                        <span id="audio-zona-texto">⬆ Haz clic para seleccionar audio (<<mp3>>, wav, ogg, m4a)</span>
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
                        <button class="link-icono-btn" data-icono="invisible" type="button" title="Área invisible (sin ícono ni borde en el visor)">
                            Invisible
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

        <!-- MODAL Insertar página -->
        <div id="modal-pagina" class="modal" style="display:none;">
            <div class="modal-contenido modal-ancho">
                <div class="modal-cabecera">
                    <h3>Insertar página</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div class="zona-arrastre clickable" id="zona-pdf-insertar">
                        <span id="pdf-insertar-texto">Selecciona un archivo PDF. Tamaño máximo permitido: 512 MB.</span>
                        <button class="btn-seleccionar-archivo" type="button">Seleccionar archivo</button>
                        <input type="file" id="archivo-pdf-insertar" accept=".pdf" style="display:none;" />
                    </div>

                    <div id="insertar-opciones" style="display:none;">
                        <div style="margin-bottom:12px;">
                            <label class="pnum-label">Página del PDF:</label>
                            <select id="insertar-pagina-pdf" class="pnum-select"></select>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label class="pnum-label">Insertar:</label>
                            <div class="dos-columnas" style="grid-template-columns:1fr 1fr;">
                                <label class="pnum-check-label"><input type="radio" name="insertar-posicion" value="antes" checked /> Antes de</label>
                                <label class="pnum-check-label"><input type="radio" name="insertar-posicion" value="despues" /> Después de</label>
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label class="pnum-label">Página del flipbook:</label>
                            <select id="insertar-pagina-flipbook" class="pnum-select"></select>
                        </div>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-insertar-pagina" class="btn-confirmar" disabled>De acuerdo</button>
                </div>
            </div>
        </div>

        <!-- MODAL Mover página -->
        <div id="modal-mover" class="modal" style="display:none;">
            <div class="modal-contenido modal-ancho">
                <div class="modal-cabecera">
                    <h3>Mover página</h3>
                    <button class="cerrar-modal">✕</button>
                </div>
                <div class="modal-cuerpo">
                    <div style="margin-bottom:12px;">
                        <label class="pnum-label">Página a mover:</label>
                        <select id="mover-pagina-origen" class="pnum-select" disabled></select>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label class="pnum-label">Mover:</label>
                        <div class="dos-columnas" style="grid-template-columns:1fr 1fr;">
                            <label class="pnum-check-label"><input type="radio" name="mover-posicion" value="antes" checked /> Antes de</label>
                            <label class="pnum-check-label"><input type="radio" name="mover-posicion" value="despues" /> Después de</label>
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label class="pnum-label">Página del flipbook:</label>
                        <select id="mover-pagina-flipbook" class="pnum-select"></select>
                    </div>
                </div>
                <div class="modal-pie">
                    <button class="btn-secundario cerrar-modal">Cancelar</button>
                    <button id="confirmar-mover-pagina" class="btn-confirmar">De acuerdo</button>
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

        // Actualizar título de la pestaña del navegador con el nombre del flipbook
        function actualizarTituloPestana() {
            var t = $( '#input-titulo' ).val().trim();
            document.title = ( t || 'Nuevo Flipbook' ) + ' — Flipbook Editor';
        }
        actualizarTituloPestana();
        $( '#input-titulo' ).on( 'input', actualizarTituloPestana );

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
        $( '#confirmar-insertar-pagina' ).on( 'click', confirmarInsertarPagina );

        // ---- Insertar página: abrir file input ----
        $( document ).on( 'click', '#zona-pdf-insertar', function ( e ) {
            if ( $( e.target ).is( 'input' ) ) return;
            $( '#archivo-pdf-insertar' ).click();
        });
        $( document ).on( 'click', '.btn-seleccionar-archivo', function () {
            $( '#archivo-pdf-insertar' ).click();
        });
        _insertarPdfDoc = null;
        $( document ).on( 'change', '#archivo-pdf-insertar', function () {
            var f = this.files[0];
            if ( ! f ) return;
            var reader = new FileReader();
            reader.onload = function ( ev ) {
                pdfjsLib.getDocument({ data: new Uint8Array( ev.target.result ) }).promise.then( function ( pdf ) {
                    _insertarPdfDoc = pdf;
                    var sel = $( '#insertar-pagina-pdf' ).empty();
                    for ( var i = 1; i <= pdf.numPages; i++ ) {
                        sel.append( '<option value="' + i + '">Página ' + i + '</option>' );
                    }
                    // Poblar dropdown de páginas del flipbook
                    var selFb = $( '#insertar-pagina-flipbook' ).empty();
                    for ( var j = 1; j <= estado.totalPaginas; j++ ) {
                        selFb.append( '<option value="' + j + '">Página ' + j + '</option>' );
                    }
                    $( '#insertar-opciones' ).show();
                    $( '#pdf-insertar-texto' ).text( '✓ ' + f.name + ' (' + pdf.numPages + ' páginas)' );
                    $( '#confirmar-insertar-pagina' ).prop( 'disabled', false );
                }).catch( function () {
                    alert( 'Error al cargar el PDF.' );
                });
            };
            reader.readAsArrayBuffer( f );
        });

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
            const iconoSel   = $( this ).data( 'icono' );
            const tieneIcono = iconoSel !== 'ninguno' && iconoSel !== 'invisible';
            $( '#link-color-wrap' ).toggle( tieneIcono );
        });

        // Actualizar hex al cambiar color
        $( document ).on( 'input', '#link-color', function () {
            $( '#link-color-hex' ).text( $( this ).val() );
        });

        $( document ).on( 'input', '#audio-icon-color', function () {
            $( '#audio-icon-color-hex' ).text( $( this ).val() );
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

        // ---- Acciones de presentación (editar, copiar, eliminar) ----
        $( '#btn-eliminar-presentacion' ).on( 'click', eliminarSeleccionado );

        $( '#btn-copiar-presentacion' ).on( 'click', function () {
            if ( ! estado.seleccionado ) return;
            var ov = obtenerOverlay( estado.seleccionado );
            if ( ! ov || ov.tipo !== 'presentacion' ) return;
            agregarOverlay( 'presentacion',
                JSON.parse( JSON.stringify( ov.datos ) ),
                ov.left + 2, ov.top + 2, ov.ancho, ov.alto
            );
        });

        $( '#btn-editar-presentacion' ).on( 'click', function () {
            if ( ! estado.seleccionado ) return;
            var ov = obtenerOverlay( estado.seleccionado );
            if ( ! ov || ov.tipo !== 'presentacion' ) return;

            // Abrir modal de presentación pre-llenado con los datos actuales
            abrirModal( 'presentacion' );

            // Cargar las imágenes existentes en previewSlides.
            // Solo conocemos la URL pública; el peso no está disponible en el cliente.
            var imgs = ov.datos.imagenes || [];
            previewSlides = imgs.map( function ( u ) {
                return { src: u, tamanio: 0 };
            });

            if ( previewSlides.length ) {
                renderizarListaSlides( previewSlides.length );
            }

            // Restaurar checkboxes y selects
            $( '#slide-autoplay'  ).prop( 'checked', !! ov.datos.autoplay );
            $( '#slide-loop'      ).prop( 'checked', !! ov.datos.loop );
            $( '#slide-aleatorio' ).prop( 'checked', !! ov.datos.aleatorio );
            $( '#slide-flechas'   ).prop( 'checked', ov.datos.flechas !== false );
            $( '#slide-duracion'  ).val( ov.datos.duracion || 3 );
            $( '#slide-transicion').val( ov.datos.transicion || 'slide' );

            // Marcar que estamos editando (no creando nuevo)
            $( '#confirmar-presentacion' ).data( 'editando', ov.tempId );
        });
        $( '#btn-guardar'  ).on( 'click', guardarTodo );

        // ---- Eliminar página ----
        $( '#btn-eliminar-pagina' ).on( 'click', function () {
            if ( ! estado.flipbookId || ! estado.pageMap.length ) return;

            var entry = estado.pageMap[ estado.paginaActual - 1 ];
            if ( ! entry ) return;

            var tipo = entry.type === 'inserted' ? 'insertada' : 'del PDF';
            if ( ! confirm( '¿Eliminar la página ' + estado.paginaActual + ' (' + tipo + ')?\n\nEsta acción no se puede deshacer.' ) ) return;

            $( '#btn-eliminar-pagina' ).text( 'Eliminando…' ).prop( 'disabled', true );

            $.post( contraplanoFlipbookAdmin.ajax_url, {
                action:       'flipbook_eliminar_pagina',
                nonce:        contraplanoFlipbookAdmin.nonce,
                flipbook_id:  estado.flipbookId,
                pagina_index: estado.paginaActual - 1,
                tipo_pagina:  entry.type,
            }, function ( r ) {
                $( '#btn-eliminar-pagina' ).text( '🗑 Eliminar esta página' ).prop( 'disabled', false );
                if ( r.success ) {
                    var paginaEliminada = estado.paginaActual; // 1-based

                    // Eliminar overlays de la página borrada y desplazar los posteriores
                    estado.overlays = estado.overlays.filter( function ( ov ) {
                        return ov.pagina !== paginaEliminada;
                    });
                    estado.overlays.forEach( function ( ov ) {
                        if ( ov.pagina > paginaEliminada ) ov.pagina--;
                    });

                    // Desplazar config de números por página (porPagina)
                    var ppNuevo = {};
                    Object.keys( configNumerosPage.porPagina || {} ).forEach( function ( k ) {
                        var p = parseInt( k );
                        if ( p === paginaEliminada ) return; // la página eliminada se descarta
                        if ( p > paginaEliminada ) ppNuevo[ p - 1 ] = configNumerosPage.porPagina[ k ];
                        else ppNuevo[ p ] = configNumerosPage.porPagina[ k ];
                    });
                    configNumerosPage.porPagina = ppNuevo;

                    // Remover del pageMap local
                    estado.pageMap.splice( estado.paginaActual - 1, 1 );
                    estado.totalPaginas = estado.pageMap.length;
                    $( '#total-paginas' ).text( estado.totalPaginas );
                    $( '#input-pagina' ).attr( 'max', estado.totalPaginas );

                    // Actualizar page_order local (fuente de verdad)
                    contraplanoFlipbookAdmin.page_order = estado.pageMap.slice();

                    // Navegar a la página anterior o la primera
                    var nuevaPag = Math.min( estado.paginaActual, estado.totalPaginas );
                    if ( nuevaPag < 1 ) nuevaPag = 1;
                    renderizarPagina( nuevaPag );
                } else {
                    alert( 'Error: ' + ( r.data || 'No se pudo eliminar.' ) );
                }
            });
        });

        // ---- Mover página ----
        $( '#btn-mover-pagina' ).on( 'click', function () {
            if ( ! estado.flipbookId || ! estado.pageMap.length ) return;
            if ( estado.totalPaginas < 2 ) { alert( 'No hay suficientes páginas para mover.' ); return; }

            // Mostrar la página que se va a mover (select deshabilitado, solo informativo)
            $( '#mover-pagina-origen' ).empty().append(
                '<option value="' + estado.paginaActual + '">Página ' + estado.paginaActual + '</option>'
            );

            // Poblar dropdown de destino con todas las páginas
            var sel = $( '#mover-pagina-flipbook' ).empty();
            for ( var j = 1; j <= estado.totalPaginas; j++ ) {
                sel.append( '<option value="' + j + '">Página ' + j + '</option>' );
            }
            $( '#confirmar-mover-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
            $( '#fondo-modal' ).show();
            $( '#modal-mover' ).show();
        });
        $( '#confirmar-mover-pagina' ).on( 'click', confirmarMoverPagina );

        // Vista previa — abre el visor en nueva pestaña
        $( document ).on( 'click', '#btn-preview', function () {
            if ( ! estado.flipbookId ) { alert( 'Primero guarda el flipbook.' ); return; }
            const url = contraplanoFlipbookAdmin.ajax_url.replace( 'admin-ajax.php', '' )
                + 'admin.php?page=flipbook-preview&flipbook_id=' + estado.flipbookId;
            window.open( url, '_blank' );
        });

        // ---- Números de página (con soporte por página) ----
        if ( ! configNumerosPage.porPagina ) configNumerosPage.porPagina = {};

        function getNumCfgActual() {
            var pp = configNumerosPage.porPagina[ estado.paginaActual ];
            if ( pp ) {
                return Object.assign( {}, configNumerosPage, pp );
            }
            return configNumerosPage;
        }

        function setNumProp( prop, val ) {
            // SIEMPRE: si la página actual tiene override, guardar ahí
            // Si no tiene override pero el checkbox está marcado, crear uno
            var pp = configNumerosPage.porPagina[ estado.paginaActual ];
            if ( pp || $( '#cfg-solo-esta-pagina' ).is( ':checked' ) ) {
                if ( ! configNumerosPage.porPagina[ estado.paginaActual ] ) {
                    configNumerosPage.porPagina[ estado.paginaActual ] = {};
                }
                configNumerosPage.porPagina[ estado.paginaActual ][ prop ] = val;
            } else {
                // Sin override y sin checkbox: cambiar el global
                configNumerosPage[ prop ] = val;
                // Actualizar snapshot del global
                if ( prop in _globalOriginal ) _globalOriginal[ prop ] = val;
            }
        }

        function sincronizarUINumeros() {
            var cfg = getNumCfgActual();
            $( '#cfg-color-numero' ).val( cfg.colorNumero || '#666666' );
            $( '#cfg-color-numero-hex' ).text( cfg.colorNumero || '#666666' );
            $( '#cfg-color-fondo' ).val( cfg.colorFondo || '#00FFFF' );
            $( '#cfg-color-fondo-hex' ).text( cfg.colorFondo || '#00FFFF' );
            $( '#cfg-opacidad' ).val( Math.round( ( cfg.opacidadFondo != null ? cfg.opacidadFondo : 1 ) * 100 ) );
            $( '#cfg-opacidad-val' ).text( Math.round( ( cfg.opacidadFondo != null ? cfg.opacidadFondo : 1 ) * 100 ) );
            var mostrarFondo = ( cfg.mostrarFondo !== false );
            $( '#cfg-mostrar-fondo' ).prop( 'checked', mostrarFondo );
            $( '#cfg-fondo-controles' ).toggle( mostrarFondo );
            // No tocamos #cfg-solo-esta-pagina: se mantiene como la dejó el usuario.
        }
        _sincronizarUINumeros = sincronizarUINumeros;

        $( '#cfg-mostrar-numeros' ).on( 'change', function () {
            configNumerosPage.mostrar = this.checked;
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-color-numero' ).on( 'input', function () {
            setNumProp( 'colorNumero', this.value );
            $( '#cfg-color-numero-hex' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });

        // Toggle autoplay en sidebar para audio seleccionado
        $( '#ov-audio-autoplay' ).on( 'change', function () {
            if ( ! estado.seleccionado ) return;
            var ov = obtenerOverlay( estado.seleccionado );
            if ( ov && ov.tipo === 'audio' && ov.datos ) {
                ov.datos.autoplay = this.checked;
                renderizarOverlays();
            }
        });
        $( '#cfg-color-fondo' ).on( 'input', function () {
            setNumProp( 'colorFondo', this.value );
            $( '#cfg-color-fondo-hex' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-opacidad' ).on( 'input', function () {
            setNumProp( 'opacidadFondo', parseInt( this.value ) / 100 );
            $( '#cfg-opacidad-val' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-mostrar-fondo' ).on( 'change', function () {
            setNumProp( 'mostrarFondo', this.checked );
            $( '#cfg-fondo-controles' ).toggle( this.checked );
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-posicion' ).on( 'change', function () {
            configNumerosPage.posicion = this.value;
            if ( this.value === 'personalizada' ) {
                $( '#cfg-pos-custom' ).show();
                configNumerosPage.customX = parseFloat( $( '#cfg-num-x' ).val() ) || 50;
                configNumerosPage.customY = parseFloat( $( '#cfg-num-y' ).val() ) || 95;
            } else {
                $( '#cfg-pos-custom' ).hide();
            }
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-num-x, #cfg-num-y' ).on( 'input', function () {
            configNumerosPage.customX = parseFloat( $( '#cfg-num-x' ).val() ) || 50;
            configNumerosPage.customY = parseFloat( $( '#cfg-num-y' ).val() ) || 95;
            renderizarPagina( estado.paginaActual );
        });
        $( '#cfg-tamanio' ).on( 'input', function () {
            configNumerosPage.tamanio = parseInt( this.value );
            $( '#cfg-tamanio-val' ).text( this.value );
            renderizarPagina( estado.paginaActual );
        });
        // Cuando se activa "solo esta página", crear override con valores actuales de los inputs
        // Cuando se desactiva, eliminar el override y restaurar inputs a los globales
        $( '#cfg-solo-esta-pagina' ).on( 'change', function () {
            if ( this.checked ) {
                configNumerosPage.porPagina[ estado.paginaActual ] = {
                    colorNumero:   $( '#cfg-color-numero' ).val(),
                    colorFondo:    $( '#cfg-color-fondo' ).val(),
                    opacidadFondo: parseInt( $( '#cfg-opacidad' ).val() ) / 100,
                    mostrarFondo:  $( '#cfg-mostrar-fondo' ).is( ':checked' ),
                };
                // Restaurar los globales a sus valores originales (antes de que el usuario los editara)
                configNumerosPage.colorNumero   = _globalOriginal.colorNumero;
                configNumerosPage.colorFondo    = _globalOriginal.colorFondo;
                configNumerosPage.opacidadFondo = _globalOriginal.opacidadFondo;
                configNumerosPage.mostrarFondo  = _globalOriginal.mostrarFondo;
            } else {
                delete configNumerosPage.porPagina[ estado.paginaActual ];
                // Restaurar inputs a los valores globales
                sincronizarUINumeros();
            }
            renderizarPagina( estado.paginaActual );
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
        // Siempre se agrega al array existente. El reset a [] ocurre al abrir el modal;
        // al editar, previewSlides ya viene precargado con las imágenes actuales.
        var existentes = previewSlides.length;
        var espacioDisponible = 10 - existentes;

        if ( espacioDisponible <= 0 ) {
            alert( 'Ya tienes el máximo de 10 imágenes.' );
            $( '#archivos-slides' ).val( '' );
            return;
        }

        // Filtrar archivos que excedan el límite de tamaño por imagen
        var candidatos = [];
        var rechazados = [];
        for ( let i = 0; i < archivos.length && candidatos.length < espacioDisponible; i++ ) {
            if ( archivos[ i ].size > MAX_SLIDE_BYTES ) {
                rechazados.push( archivos[ i ].name + ' (' + formatearBytes( archivos[ i ].size ) + ')' );
            } else {
                candidatos.push( archivos[ i ] );
            }
        }

        if ( rechazados.length ) {
            alert( 'Las siguientes imágenes superan el límite de 10 MB y no se cargaron:\n\n' + rechazados.join( '\n' ) );
        }

        $( '#archivos-slides' ).val( '' );

        if ( ! candidatos.length ) return;

        previewIndice = 0;
        let cargados  = 0;
        var max = candidatos.length;

        for ( let i = 0; i < max; i++ ) {
            const r = new FileReader();
            const idx = existentes + i;
            const tamanio = candidatos[ i ].size;
            r.onload = e => {
                previewSlides[ idx ] = { src: e.target.result, tamanio: tamanio };
                cargados++;
                if ( cargados === max ) {
                    renderizarListaSlides( previewSlides.length );
                }
            };
            r.readAsDataURL( candidatos[ i ] );
        }
    }

    function renderizarListaSlides( total ) {
        const list = $( '#slides-list' ).empty();

        previewSlides.forEach( ( slide, i ) => {
            var pesoTexto = slide.tamanio ? formatearBytes( slide.tamanio ) : '';
            list.append(
                `<div class="slide-list-item" data-idx="${i}">
                    <div class="slide-drag-handle" title="Arrastrar para reordenar">☰</div>
                    <div class="slide-list-thumb" style="background-image:url('${slide.src}')"></div>
                    <div class="slide-list-info">
                        <div>Imagen ${i + 1}</div>
                        ${pesoTexto ? `<div class="slide-list-peso">${pesoTexto}</div>` : ''}
                    </div>
                    <button class="slide-list-delete" data-idx="${i}" title="Eliminar">🗑</button>
                </div>`
            );
        });

        // Drag & drop para reordenar
        initSlideDragDrop();

        $( '#slides-preview-contador' ).text( `${total} imagen${total > 1 ? 'es' : ''} seleccionada${total > 1 ? 's' : ''}` );
        $( '#slides-preview-area' ).show();
        $( '#confirmar-presentacion' ).prop( 'disabled', false );
    }

    // ── Drag & drop nativo para lista de slides ──
    function initSlideDragDrop() {
        var list = document.getElementById('slides-list');
        if (!list) return;
        var dragItem = null;
        var placeholder = document.createElement('div');
        placeholder.className = 'slide-list-placeholder';

        list.querySelectorAll('.slide-drag-handle').forEach(function(handle) {
            handle.addEventListener('mousedown', startDrag);
            handle.addEventListener('touchstart', startDragTouch, { passive: false });
        });

        function startDrag(e) {
            dragItem = e.target.closest('.slide-list-item');
            if (!dragItem) return;
            dragItem.classList.add('dragging');
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', endDrag);
            e.preventDefault();
        }
        function startDragTouch(e) {
            dragItem = e.target.closest('.slide-list-item');
            if (!dragItem) return;
            dragItem.classList.add('dragging');
            document.addEventListener('touchmove', onDragTouch, { passive: false });
            document.addEventListener('touchend', endDragTouch);
            e.preventDefault();
        }
        function onDrag(e) { moveDrag(e.clientY); }
        function onDragTouch(e) {
            if (e.touches.length) moveDrag(e.touches[0].clientY);
            e.preventDefault();
        }
        function moveDrag(clientY) {
            if (!dragItem) return;
            var items = list.querySelectorAll('.slide-list-item:not(.dragging)');
            var inserted = false;
            items.forEach(function(item) {
                var rect = item.getBoundingClientRect();
                if (clientY < rect.top + rect.height / 2 && !inserted) {
                    list.insertBefore(dragItem, item);
                    inserted = true;
                }
            });
            if (!inserted) list.appendChild(dragItem);
        }
        function endDrag() {
            finishDrag();
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
        }
        function endDragTouch() {
            finishDrag();
            document.removeEventListener('touchmove', onDragTouch);
            document.removeEventListener('touchend', endDragTouch);
        }
        function finishDrag() {
            if (!dragItem) return;
            dragItem.classList.remove('dragging');
            // Reordenar previewSlides según el nuevo orden del DOM
            var newOrder = [];
            list.querySelectorAll('.slide-list-item').forEach(function(item) {
                var idx = parseInt(item.dataset.idx);
                newOrder.push(previewSlides[idx]);
            });
            previewSlides = newOrder;
            // Actualizar índices
            list.querySelectorAll('.slide-list-item').forEach(function(item, i) {
                item.dataset.idx = i;
                item.querySelector('.slide-list-info').textContent = 'Imagen ' + (i + 1);
                item.querySelector('.slide-list-delete').dataset.idx = i;
            });
            dragItem = null;
        }
    }

    // Eliminar slide de la lista
    $( document ).on( 'click', '.slide-list-delete', function () {
        var idx = parseInt( $( this ).data( 'idx' ) );
        previewSlides.splice( idx, 1 );
        if ( previewSlides.length === 0 ) {
            $( '#slides-preview-area' ).hide();
            $( '#confirmar-presentacion' ).prop( 'disabled', true );
        } else {
            renderizarListaSlides( previewSlides.length );
        }
    });

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
        fd.append( 'nonce',  contraplanoFlipbookAdmin.nonce );
        fd.append( 'pdf_file', archivo );
        fd.append( 'titulo', $( '#input-titulo' ).val() || archivo.name );
        fd.append( 'flipbook_id', estado.flipbookId );

        $( '#info-pdf' ).text( 'Subiendo y comprimiendo PDF…' );

        $.ajax({
            url: contraplanoFlipbookAdmin.ajax_url, method: 'POST',
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

        pdfjsLib.getDocument({
            url:             url,
            withCredentials: false,
            cMapUrl:         'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked:      true,
        }).promise.then( pdf => {
            estado.pdfDoc = pdf;

            // Construir pageMap: usar page_order si existe, sino reconstruir desde inserted/hidden
            var pageOrder = contraplanoFlipbookAdmin.page_order || [];
            if ( pageOrder.length > 0 ) {
                estado.pageMap = pageOrder.slice();
            } else {
                estado.pageMap = [];
                var hiddenPages = contraplanoFlipbookAdmin.hidden_pages || [];
                for ( var pi = 1; pi <= pdf.numPages; pi++ ) {
                    if ( hiddenPages.indexOf( pi ) === -1 ) {
                        estado.pageMap.push({ type: 'pdf', num: pi });
                    }
                }
                var insertedPages = contraplanoFlipbookAdmin.inserted_pages || [];
                var inserts = insertedPages.slice().sort( function ( a, b ) {
                    return ( b.pagina_flipbook || 0 ) - ( a.pagina_flipbook || 0 );
                });
                inserts.forEach( function ( ins ) {
                    var idx = ( ins.pagina_flipbook || 1 ) - 1;
                    if ( idx < 0 ) idx = 0;
                    if ( idx > estado.pageMap.length ) idx = estado.pageMap.length;
                    if ( ins.posicion === 'despues' ) idx++;
                    estado.pageMap.splice( idx, 0, { type: 'inserted', url: ins.url } );
                });
            }

            estado.totalPaginas = estado.pageMap.length;
            $( '#total-paginas' ).text( estado.totalPaginas );
            $( '#input-pagina'  ).attr( 'max', estado.totalPaginas );
            const infoActual = $( '#info-pdf' ).text();
            if ( infoActual && infoActual.includes( 'páginas' ) ) {
                $( '#info-pdf' ).text(
                    infoActual.replace( /\d+ páginas/, estado.totalPaginas + ' páginas' )
                );
            }
            renderizarPagina( 1 );
        }).catch( err => {
            $( '#info-pdf' ).text( 'Error al cargar el PDF: ' + ( err.message || err ) );
            console.error( 'PDF.js error:', err );
        });
    }

    // Referencia a sincronizarUINumeros (se asigna en el ready block)
    var _sincronizarUINumeros = null;

    function renderizarPagina( num ) {
        if ( ! estado.pdfDoc ) return;
        num = Math.max( 1, Math.min( num, estado.totalPaginas ) );
        estado.paginaActual = num;
        $( '#input-pagina' ).val( num );

        // Actualizar UI de números según la página actual
        if ( _sincronizarUINumeros ) _sincronizarUINumeros();

        var entry = estado.pageMap[ num - 1 ];
        if ( ! entry ) entry = { type: 'pdf', num: num };

        if ( entry.type === 'inserted' ) {
            // Página insertada: mostrar imagen en el canvas
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                var cv = document.getElementById( 'canvas-pdf' );
                var alturaDisponible = window.innerHeight - 160;
                var escala = Math.min( 1.5, alturaDisponible / img.naturalHeight );
                var w = Math.round( img.naturalWidth * escala );
                var h = Math.round( img.naturalHeight * escala );
                cv.width = w;
                cv.height = h;
                $( '#contenedor-pagina' ).css({ width: w + 'px', height: h + 'px' });
                var ctx = cv.getContext( '2d' );
                ctx.drawImage( img, 0, 0, w, h );
                dibujarNumeroPagina( cv, num, estado.totalPaginas );
                renderizarOverlays();
            };
            img.src = entry.url;
        } else {
            // Página del PDF
            estado.pdfDoc.getPage( entry.num ).then( pag => {
                const alturaDisponible = window.innerHeight - 160;
                const vpBase = pag.getViewport({ scale: 1 });
                const escala = Math.min( 1.5, alturaDisponible / vpBase.height );
                const vp = pag.getViewport({ scale: escala });
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
    }

    /**
     * Dibuja el número de página sobre el canvas del PDF.
     * Implementación idéntica a la de Maverick para consistencia.
     */
    function dibujarNumeroPagina( canvas, paginaActual, totalPaginas ) {
        if ( ! configNumerosPage.mostrar ) return;

        // Merge global config with per-page override
        var pp = configNumerosPage.porPagina ? configNumerosPage.porPagina[ paginaActual ] : null;
        var cfg = pp ? Object.assign( {}, configNumerosPage, pp ) : configNumerosPage;

        const ctx      = canvas.getContext( '2d' );
        const padding  = 5;
        const fontSize = cfg.tamanio || 14;
        const texto    = `${paginaActual}`;

        ctx.font          = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle     = cfg.colorNumero;
        ctx.textBaseline  = 'bottom';

        const metrics    = ctx.measureText( texto );
        const textWidth  = metrics.width;
        const textHeight = fontSize + 4;

        let x, y;
        const pos = cfg.posicion || 'inferior-centro';

        if      ( pos === 'inferior-derecha'   ) { ctx.textAlign = 'right';  x = canvas.width - padding;  y = canvas.height - padding; }
        else if ( pos === 'inferior-izquierda' ) { ctx.textAlign = 'left';   x = padding;                 y = canvas.height - padding; }
        else if ( pos === 'inferior-centro'    ) { ctx.textAlign = 'center'; x = canvas.width / 2;        y = canvas.height - padding; }
        else if ( pos === 'superior-derecha'   ) { ctx.textAlign = 'right';  x = canvas.width - padding;  y = padding + fontSize; }
        else if ( pos === 'superior-izquierda' ) { ctx.textAlign = 'left';   x = padding;                 y = padding + fontSize; }
        else if ( pos === 'superior-centro'    ) { ctx.textAlign = 'center'; x = canvas.width / 2;        y = padding + fontSize; }
        else if ( pos === 'personalizada'      ) {
            ctx.textAlign = 'center';
            x = ( cfg.customX || 50 ) / 100 * canvas.width;
            y = ( cfg.customY || 95 ) / 100 * canvas.height;
        }
        else if ( pos === 'centro'             ) { ctx.textAlign = 'center'; x = canvas.width / 2;        y = ( canvas.height / 2 ) + ( fontSize / 2 ); }

        const bgW = textWidth + 8, bgH = textHeight + 4;
        let bgX, bgY;

        if      ( pos === 'inferior-derecha'   ) { bgX = canvas.width - textWidth - padding - 4; bgY = canvas.height - textHeight - padding; }
        else if ( pos === 'inferior-izquierda' ) { bgX = padding - 4;                            bgY = canvas.height - textHeight - padding; }
        else if ( pos === 'inferior-centro'    ) { bgX = ( canvas.width / 2 ) - ( bgW / 2 );     bgY = canvas.height - textHeight - padding; }
        else if ( pos === 'superior-derecha'   ) { bgX = canvas.width - textWidth - padding - 4; bgY = padding - 4; }
        else if ( pos === 'superior-izquierda' ) { bgX = padding - 4;                            bgY = padding - 4; }
        else if ( pos === 'superior-centro'    ) { bgX = ( canvas.width / 2 ) - ( bgW / 2 );     bgY = padding - 4; }
        else if ( pos === 'personalizada'      ) { bgX = x - bgW / 2;                            bgY = y - bgH; }
        else if ( pos === 'centro'             ) { bgX = ( canvas.width / 2 ) - ( bgW / 2 );     bgY = ( canvas.height / 2 ) - ( bgH / 2 ); }

        // Fondo semi-transparente (solo si mostrarFondo no es false)
        if ( cfg.mostrarFondo !== false ) {
            const rgb = hexARgb( cfg.colorFondo || '#00FFFF' );
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${cfg.opacidadFondo != null ? cfg.opacidadFondo : 1})`;
            ctx.fillRect( bgX, bgY, bgW, bgH );
        }

        // Texto del número
        ctx.fillStyle = cfg.colorNumero || '#666666';
        ctx.fillText( texto, x, y );
    }

    function hexARgb( hex ) {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec( hex );
        return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : { r:102, g:102, b:102 };
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
                const url = escaparHtml( ov.datos.url || '' );
                const iconColor = escaparHtml( ov.datos.iconColor || '#ffffff' );
                // Mismo ícono de parlante que usa el viewer público
                const speakerPath = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7.007 7.007 0 010 13.42v2.06A9.013 9.013 0 0023 12 9.013 9.013 0 0014 3.23z';
                inner = `<div class="ov-audio-container">
                    <div class="ov-audio-btn" style="background:transparent;border:none;">
                        <svg viewBox="0 0 24 24" fill="${iconColor}" width="100%" height="100%">
                            <path d="${speakerPath}"/>
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

                const esInvisible = d.icono === 'invisible';
                const tieneIcono  = d.icono && d.icono !== 'ninguno' && !esInvisible && svgIconos[ d.icono ];

                if ( esInvisible ) {
                    inner = `<div class="ov-link-container ov-link-invisible" style="border:2px dashed #888;background:rgba(180,180,180,.12);display:flex;align-items:center;justify-content:center;" title="${escaparHtml(etiqueta)} (invisible en el visor)">
                        <div class="ov-link-label" style="color:#666;font-size:11px;opacity:.75;">👁‍🗨 Invisible</div>
                    </div>`;
                } else {
                    inner = `<div class="ov-link-container" style="border-color:${color};" title="${escaparHtml(etiqueta)}">
                        ${tieneIcono
                            ? `<div class="ov-link-icono" style="color:${color};">${svgIconos[d.icono]}</div>`
                            : `<div class="ov-link-label" style="color:${color};">🔗 ${escaparHtml(etiqueta.substring(0,20))}</div>`
                        }
                    </div>`;
                }
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
        // Usa los mismos iconos del viewer: parlante (parado) / dos barras (reproduciendo)
        $( '.ov-audio-btn' ).on( 'click', function ( e ) {
            e.stopPropagation();
            const playPath  = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7.007 7.007 0 010 13.42v2.06A9.013 9.013 0 0023 12 9.013 9.013 0 0014 3.23z';
            const pausePath = 'M6 5h4v14H6zM14 5h4v14h-4z';
            const pathEl    = $( this ).find( 'path' )[0];
            const ae = $( this ).closest( '.ov-audio-container' ).find( '.ov-audio-el' )[0];
            if ( ! ae ) return;
            if ( ae.paused ) {
                ae.play();
                $( this ).addClass( 'activo' );
                if ( pathEl ) pathEl.setAttribute( 'd', pausePath );
            } else {
                ae.pause();
                $( this ).removeClass( 'activo' );
                if ( pathEl ) pathEl.setAttribute( 'd', playPath );
            }
            ae.onended = () => {
                $( this ).removeClass( 'activo' );
                if ( pathEl ) pathEl.setAttribute( 'd', playPath );
            };
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
                $( e.target ).closest( '.ov-slide-prev,.ov-slide-next' ).length
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

        // Mostrar/ocultar opciones según el tipo de overlay
        $( '#panel-audio-opciones' ).toggle( ov && ov.tipo === 'audio' );
        $( '#panel-presentacion-opciones' ).toggle( ov && ov.tipo === 'presentacion' );

        if ( ov && ov.tipo === 'audio' ) {
            $( '#ov-audio-autoplay' ).prop( 'checked', !!( ov.datos && ov.datos.autoplay ) );
        }
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
        // No usar `|| ov.xxx` porque 0 es falsy y se rechazaría.
        const pl = parseFloat( $( '#pos-left'  ).val() );
        const pt = parseFloat( $( '#pos-top'   ).val() );
        const pw = parseFloat( $( '#pos-ancho' ).val() );
        const ph = parseFloat( $( '#pos-alto'  ).val() );
        if ( ! isNaN( pl ) ) ov.left  = pl;
        if ( ! isNaN( pt ) ) ov.top   = pt;
        if ( ! isNaN( pw ) && pw > 0 ) ov.ancho = pw;
        if ( ! isNaN( ph ) && ph > 0 ) ov.alto  = ph;
        renderizarOverlays();
    }

    function eliminarSeleccionado() {
        if ( ! estado.seleccionado ) return;
        const ov = obtenerOverlay( estado.seleccionado );
        if ( ! ov ) return;
        if ( ov.id ) {
            $.post( contraplanoFlipbookAdmin.ajax_url, {
                action: 'flipbook_eliminar_overlay',
                nonce:  contraplanoFlipbookAdmin.nonce,
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
            $( '#audio-icon-color' ).val( '#C70000' );
            $( '#audio-icon-color-hex' ).text( '#C70000' );
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
            $( '#slides-list' ).empty();
            $( '#confirmar-presentacion' ).prop( 'disabled', true ).removeData( 'editando' );
            previewSlides = []; previewIndice = 0;
        }
        if ( tipo === 'pagina' ) {
            $( '#archivo-pdf-insertar' ).val( '' );
            $( '#insertar-opciones' ).hide();
            $( '#pdf-insertar-texto' ).text( 'Selecciona un archivo PDF. Tamaño máximo permitido: 512 MB.' );
            $( '#confirmar-insertar-pagina' ).prop( 'disabled', true ).text( 'De acuerdo' );
            $( '#insertar-pagina-pdf' ).empty();
            $( '#insertar-pagina-flipbook' ).empty();
            _insertarPdfDoc = null;
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

        $( '#confirmar-imagen' ).text( 'Comprimiendo…' ).prop( 'disabled', true );

        // Comprimir en el cliente antes de subir. Si el módulo no está cargado o la
        // compresión falla, comprimirImagen devuelve el archivo original → upload normal.
        var comprimir = (window.ContraplanoCompresion && window.ContraplanoCompresion.comprimirImagen)
            ? window.ContraplanoCompresion.comprimirImagen(f)
            : Promise.resolve(f);

        comprimir.then(function (fileFinal) {
            const fd = new FormData();
            fd.append( 'action', 'flipbook_subir_imagen' );
            fd.append( 'nonce',  contraplanoFlipbookAdmin.nonce );
            fd.append( 'imagen', fileFinal, fileFinal.name || f.name );

            $( '#confirmar-imagen' ).text( 'Subiendo…' );
            $.ajax({
                url: contraplanoFlipbookAdmin.ajax_url, method: 'POST',
                data: fd, processData: false, contentType: false,
                success( r ) {
                    $( '#confirmar-imagen' ).text( 'De acuerdo' ).prop( 'disabled', false );
                    if ( r.success ) {
                        agregarOverlay( 'imagen', { url: r.data.url, attachment_id: r.data.attachment_id }, 10, 10, 30, 25 );
                        cerrarTodosLosModales();
                    } else { alert( 'Error al subir: ' + r.data ); }
                },
                error() {
                    $( '#confirmar-imagen' ).text( 'De acuerdo' ).prop( 'disabled', false );
                    alert( 'Error de red al subir la imagen.' );
                }
            });
        });
    }

    function confirmarPresentacion() {
        if ( ! previewSlides || ! previewSlides.length ) { alert( 'Selecciona imágenes.' ); return; }

        var editandoId = $( '#confirmar-presentacion' ).data( 'editando' ) || null;
        const max = Math.min( previewSlides.length, 10 );
        $( '#confirmar-presentacion' ).text( 'Subiendo…' ).prop( 'disabled', true );

        function dataUrlToBlob( dataUrl ) {
            var parts = dataUrl.split( ',' );
            var mime = parts[0].match( /:(.*?);/ )[1];
            var b64 = atob( parts[1] );
            var arr = new Uint8Array( b64.length );
            for ( var i = 0; i < b64.length; i++ ) arr[i] = b64.charCodeAt(i);
            return new Blob( [arr], { type: mime } );
        }

        // Sube una sola imagen con XHR nativo. Se evita $.ajax porque algunos
        // plugins de terceros enganchan ajaxSend y asumen que settings.data es
        // un string (llamando settings.data.split), lo que rompe envíos con FormData.
        function subirImagenNativo( blob, nombre ) {
            return new Promise( function ( resolve, reject ) {
                var fd = new FormData();
                fd.append( 'action', 'flipbook_subir_imagen' );
                fd.append( 'nonce',  contraplanoFlipbookAdmin.nonce );
                fd.append( 'imagen', blob, nombre );
                var xhr = new XMLHttpRequest();
                xhr.open( 'POST', contraplanoFlipbookAdmin.ajax_url, true );
                xhr.onload = function () {
                    if ( xhr.status < 200 || xhr.status >= 300 ) {
                        reject( new Error( 'HTTP ' + xhr.status ) );
                        return;
                    }
                    try {
                        var r = JSON.parse( xhr.responseText );
                        if ( r && r.success && r.data && r.data.url ) {
                            resolve( r.data.url );
                        } else {
                            reject( new Error( ( r && r.data ) ? r.data : 'Respuesta inválida del servidor' ) );
                        }
                    } catch ( e ) {
                        reject( new Error( 'Respuesta no es JSON: ' + xhr.responseText.substring( 0, 120 ) ) );
                    }
                };
                xhr.onerror = function () { reject( new Error( 'Error de red' ) ); };
                xhr.send( fd );
            });
        }

        // Subir secuencialmente para evitar choques con interceptores ajaxSend
        // de otros plugins y facilitar el diagnóstico si alguna falla.
        var urls = new Array( max );

        // Helper: comprimir si el módulo está disponible.
        function comprimirSiPosible( blobOFile ) {
            if ( window.ContraplanoCompresion && window.ContraplanoCompresion.comprimirImagen ) {
                // comprimirImagen espera un File con .name; creamos uno si es Blob puro.
                var f = blobOFile;
                if ( ! ( f instanceof File ) ) {
                    try { f = new File( [ blobOFile ], 'slide.jpg', { type: blobOFile.type || 'image/jpeg' } ); }
                    catch ( e ) { f = blobOFile; }
                }
                return window.ContraplanoCompresion.comprimirImagen( f );
            }
            return Promise.resolve( blobOFile );
        }

        (async function () {
            for ( let i = 0; i < max; i++ ) {
                var src = previewSlides[ i ].src;
                if ( src.startsWith( 'data:' ) ) {
                    try {
                        $( '#confirmar-presentacion' ).text( 'Comprimiendo ' + (i+1) + '/' + max + '…' );
                        var blobOriginal = dataUrlToBlob( src );
                        var fileComprimido = await comprimirSiPosible( blobOriginal );
                        $( '#confirmar-presentacion' ).text( 'Subiendo ' + (i+1) + '/' + max + '…' );
                        urls[ i ] = await subirImagenNativo( fileComprimido, 'slide_' + i + '.jpg' );
                    } catch ( err ) {
                        $( '#confirmar-presentacion' ).text( 'De acuerdo' ).prop( 'disabled', false );
                        alert( 'Error al subir la imagen ' + ( i + 1 ) + ': ' + err.message );
                        return;
                    }
                } else {
                    urls[ i ] = src;
                }
            }

            $( '#confirmar-presentacion' ).text( 'De acuerdo' ).prop( 'disabled', false );

            var urlsFinales = urls.filter( Boolean );
            if ( ! urlsFinales.length ) { alert( 'No se pudieron subir las imágenes.' ); return; }

            var datos = {
                imagenes:   urlsFinales,
                autoplay:   $( '#slide-autoplay'  ).is( ':checked' ),
                loop:       $( '#slide-loop'       ).is( ':checked' ),
                aleatorio:  $( '#slide-aleatorio'  ).is( ':checked' ),
                flechas:    $( '#slide-flechas'    ).is( ':checked' ),
                duracion:   parseInt( $( '#slide-duracion' ).val() ),
                transicion: $( '#slide-transicion' ).val(),
            };

            if ( editandoId ) {
                var ov = obtenerOverlay( editandoId );
                if ( ov ) {
                    ov.datos = datos;
                    renderizarOverlays();
                    seleccionarOverlay( editandoId );
                }
                $( '#confirmar-presentacion' ).removeData( 'editando' );
            } else {
                agregarOverlay( 'presentacion', datos, 10, 10, 35, 28 );
            }

            cerrarTodosLosModales();
        })();
    }

    function confirmarAudio() {
        const f = $( '#archivo-audio' )[0].files[0];
        if ( ! f ) { alert( 'Selecciona un archivo de audio.' ); return; }

        $( '#confirmar-audio' ).text( 'Comprimiendo…' ).prop( 'disabled', true );

        // Comprimir audio con lamejs (MP3 mono 64 kbps) antes de subir.
        // La compresión de audio puede tardar unos segundos — por eso actualizamos el
        // botón. Si lamejs no está cargado o el archivo ya está bien optimizado, se
        // sube tal cual.
        var comprimir = (window.ContraplanoCompresion && window.ContraplanoCompresion.comprimirAudio)
            ? window.ContraplanoCompresion.comprimirAudio(f)
            : Promise.resolve(f);

        comprimir.then(function (fileFinal) {
            const fd = new FormData();
            fd.append( 'action', 'flipbook_subir_audio' );
            fd.append( 'nonce',  contraplanoFlipbookAdmin.nonce );
            fd.append( 'audio',  fileFinal, fileFinal.name || f.name );

            $( '#confirmar-audio' ).text( 'Subiendo…' );
            $.ajax({
                url: contraplanoFlipbookAdmin.ajax_url, method: 'POST',
                data: fd, processData: false, contentType: false,
                success( r ) {
                    $( '#confirmar-audio' ).text( 'De acuerdo' ).prop( 'disabled', false );
                    if ( r.success ) {
                        var audioW = 11;
                        var audioH = 4.1;
                        var audioLeft = (100 - audioW) / 2;
                        var audioTop  = 0;
                        agregarOverlay( 'audio', {
                            url:      r.data.url,
                            autoplay: $( '#audio-autoplay' ).is( ':checked' ),
                            iconColor: $( '#audio-icon-color' ).val() || '#C70000',
                        }, audioLeft, audioTop, audioW, audioH );
                        cerrarTodosLosModales();
                    } else { alert( 'Error al subir el audio: ' + r.data ); }
                },
                error() {
                    $( '#confirmar-audio' ).text( 'De acuerdo' ).prop( 'disabled', false );
                    alert( 'Error de red al subir el audio.' );
                }
            });
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

    function confirmarInsertarPagina() {
        if ( ! _insertarPdfDoc ) { alert( 'Carga un archivo PDF primero.' ); return; }
        if ( ! estado.flipbookId ) { alert( 'Primero guarda el flipbook.' ); return; }

        var numPaginaPdf = parseInt( $( '#insertar-pagina-pdf' ).val() );
        var posicion = $( 'input[name="insertar-posicion"]:checked' ).val();
        var numPaginaFlipbook = parseInt( $( '#insertar-pagina-flipbook' ).val() );

        $( '#confirmar-insertar-pagina' ).text( 'Procesando…' ).prop( 'disabled', true );

        // Renderizar la página del nuevo PDF a canvas → blob
        _insertarPdfDoc.getPage( numPaginaPdf ).then( function ( page ) {
            var vp = page.getViewport({ scale: 2.0 });
            var canvas = document.createElement( 'canvas' );
            canvas.width = vp.width;
            canvas.height = vp.height;
            return page.render({ canvasContext: canvas.getContext( '2d' ), viewport: vp }).promise.then( function () {
                return new Promise( function ( resolve ) {
                    canvas.toBlob( function ( blob ) { resolve( blob ); }, 'image/jpeg', 0.92 );
                });
            });
        }).then( function ( blob ) {
            // Calcular idx (posición en el pageMap actual)
            var idx = numPaginaFlipbook - 1;
            if ( idx < 0 ) idx = 0;
            if ( idx > estado.pageMap.length ) idx = estado.pageMap.length;
            if ( posicion === 'despues' ) idx++;

            // Subir imagen y registrar inserción
            var fd = new FormData();
            fd.append( 'action', 'flipbook_insertar_pagina' );
            fd.append( 'nonce', contraplanoFlipbookAdmin.nonce );
            fd.append( 'flipbook_id', estado.flipbookId );
            fd.append( 'imagen', blob, 'pagina_insertada.jpg' );
            fd.append( 'posicion', posicion );
            fd.append( 'pagina_flipbook', numPaginaFlipbook );

            return $.ajax({
                url: contraplanoFlipbookAdmin.ajax_url,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
            }).then( function ( r ) { return { r: r, idx: idx }; });
        }).then( function ( result ) {
            var r = result.r;
            var idx = result.idx;
            $( '#confirmar-insertar-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
            if ( r.success ) {
                // Insertar en el pageMap del editor sin recargar
                estado.pageMap.splice( idx, 0, { type: 'inserted', url: r.data.url } );
                estado.totalPaginas = estado.pageMap.length;
                $( '#total-paginas' ).text( estado.totalPaginas );
                $( '#input-pagina' ).attr( 'max', estado.totalPaginas );

                // Desplazar overlays de páginas afectadas (misma lógica que el servidor)
                var desdePagina = idx + 1; // 1-based
                estado.overlays.forEach( function ( ov ) {
                    if ( ov.pagina >= desdePagina ) ov.pagina++;
                });

                // Desplazar config de números por página (porPagina)
                var ppNuevo = {};
                Object.keys( configNumerosPage.porPagina || {} ).forEach( function ( k ) {
                    var p = parseInt( k );
                    if ( p >= desdePagina ) ppNuevo[ p + 1 ] = configNumerosPage.porPagina[ k ];
                    else ppNuevo[ p ] = configNumerosPage.porPagina[ k ];
                });
                configNumerosPage.porPagina = ppNuevo;

                // Actualizar page_order local (fuente de verdad)
                contraplanoFlipbookAdmin.page_order = estado.pageMap.slice();

                cerrarTodosLosModales();
                // Navegar a la página insertada
                renderizarPagina( idx + 1 );
            } else {
                alert( 'Error: ' + ( r.data || 'No se pudo insertar la página.' ) );
            }
        }).catch( function ( err ) {
            $( '#confirmar-insertar-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
            alert( 'Error al procesar la página: ' + ( err.message || err ) );
        });
    }

    /* =========================================================
       MOVER PÁGINA
    ========================================================= */
    function confirmarMoverPagina() {
        if ( ! estado.flipbookId ) return;

        var srcPage = estado.paginaActual; // 1-based
        var posicion = $( 'input[name="mover-posicion"]:checked' ).val();
        var destPage = parseInt( $( '#mover-pagina-flipbook' ).val() );

        // Calcular destIdx en el pageMap actual
        var srcIdx = srcPage - 1;
        var rawDestIdx = destPage - 1;
        if ( posicion === 'despues' ) rawDestIdx++;
        var adjDestIdx = rawDestIdx;
        if ( rawDestIdx > srcIdx ) adjDestIdx--;

        if ( adjDestIdx === srcIdx ) {
            alert( 'La página ya está en esa posición.' );
            return;
        }

        $( '#confirmar-mover-pagina' ).text( 'Procesando…' ).prop( 'disabled', true );

        var entry = estado.pageMap[ srcIdx ];

        // Función que envía el AJAX después de tener la imagen (si es PDF)
        function enviarMover( blob ) {
            var fd = new FormData();
            fd.append( 'action', 'flipbook_mover_pagina' );
            fd.append( 'nonce', contraplanoFlipbookAdmin.nonce );
            fd.append( 'flipbook_id', estado.flipbookId );
            fd.append( 'src_page', srcPage );
            fd.append( 'dest_page', destPage );
            fd.append( 'posicion', posicion );
            if ( blob ) fd.append( 'imagen', blob, 'pagina_movida.jpg' );

            $.ajax({
                url: contraplanoFlipbookAdmin.ajax_url,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
            }).then( function ( r ) {
                $( '#confirmar-mover-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
                if ( ! r.success ) { alert( 'Error: ' + ( r.data || 'No se pudo mover.' ) ); return; }

                var newPage = r.data.nueva_pagina; // 1-based

                // Actualizar overlays locales
                estado.overlays.forEach( function ( ov ) {
                    if ( ov.pagina === srcPage ) {
                        ov.pagina = newPage;
                    } else if ( srcPage < newPage && ov.pagina > srcPage && ov.pagina <= newPage ) {
                        ov.pagina--;
                    } else if ( srcPage > newPage && ov.pagina >= newPage && ov.pagina < srcPage ) {
                        ov.pagina++;
                    }
                });

                // Actualizar porPagina config
                var pp = configNumerosPage.porPagina || {};
                var ppNuevo = {};
                Object.keys( pp ).forEach( function ( k ) {
                    var p = parseInt( k );
                    if ( p === srcPage ) {
                        ppNuevo[ newPage ] = pp[ k ];
                    } else if ( srcPage < newPage && p > srcPage && p <= newPage ) {
                        ppNuevo[ p - 1 ] = pp[ k ];
                    } else if ( srcPage > newPage && p >= newPage && p < srcPage ) {
                        ppNuevo[ p + 1 ] = pp[ k ];
                    } else {
                        ppNuevo[ p ] = pp[ k ];
                    }
                });
                configNumerosPage.porPagina = ppNuevo;

                // Actualizar pageMap local
                var movedEntry = estado.pageMap.splice( srcIdx, 1 )[0];
                // Si era PDF, ahora es inserted con la URL devuelta por el servidor
                if ( movedEntry.type === 'pdf' && r.data.url ) {
                    movedEntry = { type: 'inserted', url: r.data.url };
                }
                estado.pageMap.splice( adjDestIdx, 0, movedEntry );

                // Actualizar page_order local
                contraplanoFlipbookAdmin.page_order = estado.pageMap.slice();

                cerrarTodosLosModales();
                renderizarPagina( newPage );
            }).catch( function ( err ) {
                $( '#confirmar-mover-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
                alert( 'Error al mover la página: ' + ( err.message || err ) );
            });
        }

        if ( entry.type === 'pdf' ) {
            // Renderizar la página PDF a imagen antes de mover
            estado.pdfDoc.getPage( entry.num ).then( function ( page ) {
                var vp = page.getViewport({ scale: 2.0 });
                var canvas = document.createElement( 'canvas' );
                canvas.width = vp.width;
                canvas.height = vp.height;
                return page.render({ canvasContext: canvas.getContext( '2d' ), viewport: vp }).promise.then( function () {
                    return new Promise( function ( resolve ) {
                        canvas.toBlob( function ( b ) { resolve( b ); }, 'image/jpeg', 0.92 );
                    });
                });
            }).then( function ( blob ) {
                enviarMover( blob );
            }).catch( function ( err ) {
                $( '#confirmar-mover-pagina' ).text( 'De acuerdo' ).prop( 'disabled', false );
                alert( 'Error al procesar la página: ' + ( err.message || err ) );
            });
        } else {
            // Página insertada: ya tiene URL, no necesita imagen
            enviarMover( null );
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
        $.post( contraplanoFlipbookAdmin.ajax_url, {
            action: 'flipbook_obtener_overlays',
            nonce:  contraplanoFlipbookAdmin.nonce,
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

        // Cargar configuración de números de página desde la BD
        $.post( contraplanoFlipbookAdmin.ajax_url, {
            action:      'flipbook_cargar_config_numeros',
            nonce:       contraplanoFlipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
        }, function ( r ) {
            if ( r.success && r.data ) {
                configNumerosPage.colorNumero   = r.data.colorNumero   || '#666666';
                configNumerosPage.colorFondo    = r.data.colorFondo    || '#00FFFF';
                configNumerosPage.opacidadFondo = r.data.opacidadFondo != null ? r.data.opacidadFondo : 1;
                configNumerosPage.mostrarFondo  = r.data.mostrarFondo !== false;
                configNumerosPage.posicion      = r.data.posicion      || 'inferior-centro';
                configNumerosPage.tamanio       = r.data.tamanio       || 14;
                configNumerosPage.mostrar       = r.data.mostrar !== false;
                configNumerosPage.customX       = r.data.customX       || 50;
                configNumerosPage.customY       = r.data.customY       || 95;
                configNumerosPage.porPagina     = r.data.porPagina     || {};

                // Actualizar snapshot de globales originales
                _globalOriginal.colorNumero   = configNumerosPage.colorNumero;
                _globalOriginal.colorFondo    = configNumerosPage.colorFondo;
                _globalOriginal.opacidadFondo = configNumerosPage.opacidadFondo;
                _globalOriginal.mostrarFondo  = configNumerosPage.mostrarFondo;

                // Sincronizar controles del sidebar con los valores cargados
                $( '#cfg-mostrar-numeros' ).prop( 'checked', configNumerosPage.mostrar );
                $( '#cfg-color-numero' ).val( configNumerosPage.colorNumero );
                $( '#cfg-color-numero-hex' ).text( configNumerosPage.colorNumero );
                $( '#cfg-color-fondo' ).val( configNumerosPage.colorFondo );
                $( '#cfg-color-fondo-hex' ).text( configNumerosPage.colorFondo );
                $( '#cfg-opacidad' ).val( Math.round( configNumerosPage.opacidadFondo * 100 ) );
                $( '#cfg-opacidad-val' ).text( Math.round( configNumerosPage.opacidadFondo * 100 ) );
                $( '#cfg-mostrar-fondo' ).prop( 'checked', configNumerosPage.mostrarFondo );
                $( '#cfg-fondo-controles' ).toggle( configNumerosPage.mostrarFondo );
                $( '#cfg-posicion' ).val( configNumerosPage.posicion );
                $( '#cfg-tamanio' ).val( configNumerosPage.tamanio );
                $( '#cfg-tamanio-val' ).text( configNumerosPage.tamanio );
                $( '#cfg-num-x' ).val( configNumerosPage.customX );
                $( '#cfg-num-y' ).val( configNumerosPage.customY );
                $( '#cfg-pos-custom' ).toggle( configNumerosPage.posicion === 'personalizada' );

                // Re-renderizar para mostrar el número con la config cargada
                if ( estado.pdfDoc ) renderizarPagina( estado.paginaActual );
            }
        });
    }

    function guardarTodo() {
        if ( ! estado.flipbookId ) { alert( 'Primero carga un PDF.' ); return; }
        $( '#btn-guardar' ).text( 'Guardando…' ).prop( 'disabled', true );

        const tituloNuevo = $( '#input-titulo' ).val().trim() || 'Flipbook sin título';

        // Guardar el título del post en WordPress
        $.post( contraplanoFlipbookAdmin.ajax_url, {
            action:      'flipbook_guardar_titulo',
            nonce:       contraplanoFlipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            titulo:      tituloNuevo,
        });

        // Guardar la configuración de números de página
        $.post( contraplanoFlipbookAdmin.ajax_url, {
            action:      'flipbook_guardar_config_numeros',
            nonce:       contraplanoFlipbookAdmin.nonce,
            flipbook_id: estado.flipbookId,
            config:      JSON.stringify( configNumerosPage ),
        });

        // Guardar los overlays
        $.post( contraplanoFlipbookAdmin.ajax_url, {
            action: 'flipbook_guardar_overlays',
            nonce:  contraplanoFlipbookAdmin.nonce,
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
