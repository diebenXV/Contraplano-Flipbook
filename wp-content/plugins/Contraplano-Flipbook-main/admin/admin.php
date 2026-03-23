<?php
// Bloquear acceso directo al archivo
if (! defined('ABSPATH')) exit;

/**
 * Clase Flipbook_Admin
 *
 * Gestiona todo el panel de administración del plugin:
 *   - Registro del menú lateral de WordPress
 *   - Encolado de scripts y estilos del editor
 *   - Renderización de la página de lista de flipbooks
 *   - Renderización de la página del editor visual
 *
 * El HTML real del editor es generado por editor.js (JavaScript),
 * esta clase solo provee el contenedor y los datos iniciales.
 */
class Flipbook_Admin
{

    /**
     * Registra el menú principal y los submenús en el panel de WordPress.
     * Enganchado a admin_menu en el archivo principal.
     */
    public static function agregar_menu()
    {
        // Menú principal
        add_menu_page(
            'Contraplano Flipbook',
            'Flipbooks',
            'edit_posts',
            'flipbook-lista',
            [__CLASS__, 'pagina_lista'],
            'dashicons-book-alt',
            25
        );

        // Submenú: lista de flipbooks
        add_submenu_page(
            'flipbook-lista',
            'Todos los Flipbooks',
            'Todos los Flipbooks',
            'edit_posts',
            'flipbook-lista',
            [__CLASS__, 'pagina_lista']
        );

        // Submenú: crear/editar flipbook
        add_submenu_page(
            'flipbook-lista',
            'Nuevo Flipbook',
            'Añadir nuevo',
            'edit_posts',
            'flipbook-editor',
            [__CLASS__, 'pagina_editor']
        );

        // Submenú oculto: vista previa del flipbook (no aparece en el menú lateral)
        add_submenu_page(
            null,                          // Sin padre → no aparece en menú
            'Vista previa del Flipbook',
            'Vista previa',
            'edit_posts',
            'flipbook-preview',
            [__CLASS__, 'pagina_preview']
        );
    }

    /**
     * Encola los scripts y estilos del editor de administración.
     * Solo se cargan cuando el hook activo corresponde a las páginas del plugin.
     * Enganchado a admin_enqueue_scripts en el archivo principal.
     *
     * @param string $hook  Identificador de la página de administración activa.
     */
    public static function encolar_scripts($hook)
    {
        // Solo cargar en las páginas del plugin
        $paginas_validas = [
            'toplevel_page_flipbook-lista',
            'flipbooks_page_flipbook-editor',
        ];

        // Deshabilitar caché de LiteSpeed en todas las páginas del plugin
        // para evitar que se cachee el nonce y cause errores AJAX
        if (str_contains($hook, 'flipbook')) {
            header('X-LiteSpeed-Cache-Control: no-cache');
            do_action('litespeed_control_set_nocache', 'flipbook admin page');
        }

        // La preview tiene su propio hook aunque el parent sea null
        if (str_contains($hook, 'flipbook-preview')) {
            // Encolar solo PDF.js y el visor para la página de preview
            wp_enqueue_script(
                'pdfjs',
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
                [],
                '3.11.174',
                true
            );
            wp_enqueue_script(
                'flipbook-viewer',
                FLIPBOOK_URL . 'assets/js/viewer.js',
                ['pdfjs', 'jquery'],
                FLIPBOOK_VERSION,
                true
            );
            wp_enqueue_style(
                'flipbook-preview-css',
                FLIPBOOK_URL . 'assets/css/preview.css',
                [],
                FLIPBOOK_VERSION
            );
            return;
        }

        if (! in_array($hook, $paginas_validas)) return;

        // PDF.js — renderizado del PDF en el canvas del editor
        wp_enqueue_script(
            'pdfjs',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            [],
            '3.11.174',
            true
        );

        // Script principal del editor visual
        wp_enqueue_script(
            'flipbook-editor',
            FLIPBOOK_URL . 'assets/js/editor.js',
            ['jquery', 'pdfjs'],
            FLIPBOOK_VERSION,
            true
        );

        // Estilos del editor visual
        wp_enqueue_style(
            'flipbook-editor',
            FLIPBOOK_URL . 'assets/css/editor.css',
            [],
            FLIPBOOK_VERSION
        );

        // Leer datos del flipbook si se está editando uno existente
        $flipbook_id = intval($_GET['flipbook_id'] ?? 0);
        $pdf_url     = '';
        $pdf_paginas = 0;
        $titulo      = '';

        if ($flipbook_id) {
            $pdf_url     = get_post_meta($flipbook_id, '_flipbook_pdf_url',   true);
            $pdf_paginas = get_post_meta($flipbook_id, '_flipbook_pdf_pages', true);
            $post        = get_post($flipbook_id);
            $titulo      = $post ? $post->post_title : '';
        }

        // URL de la vista previa para pasarla al JS del editor
        $preview_url = $flipbook_id
            ? admin_url('admin.php?page=flipbook-preview&flipbook_id=' . $flipbook_id)
            : '';

        // Pasar configuración inicial al JavaScript del editor
        wp_localize_script('flipbook-editor', 'contraplanoFlipbookAdmin', [
            'ajax_url'    => admin_url('admin-ajax.php'),
            'nonce'       => wp_create_nonce('flipbook_nonce'),
            'plugin_url'  => FLIPBOOK_URL,
            'flipbook_id' => $flipbook_id,
            'pdf_url'     => $pdf_url,
            'pdf_paginas' => intval($pdf_paginas),
            'titulo'      => $titulo,
            'preview_url' => $preview_url,
        ]);
    }

    /**
     * Renderiza la página de lista de todos los flipbooks.
     * Muestra título, páginas, shortcode y tres acciones:
     *   - Editar       → abre el editor visual
     *   - Borrar audio → elimina solo los archivos mp3/wav/ogg del disco + BD
     *   - Eliminar     → borra el flipbook completo (PDF + overlays + post)
     */
    public static function pagina_lista()
    {

        // Obtener todos los flipbooks publicados
        $flipbooks = get_posts([
            'post_type'      => 'flipbook',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
        ]);

        // Nonce para las llamadas AJAX de la lista
        $nonce     = wp_create_nonce('flipbook_nonce');
        $ajax_url  = admin_url('admin-ajax.php');
?>
        <div class="wrap">
            <h1 class="wp-heading-inline">
                Flipbooks
                <a href="<?php echo admin_url('admin.php?page=flipbook-editor'); ?>"
                    class="page-title-action">Añadir nuevo</a>
            </h1>

            <?php if (isset($_GET['mensaje'])) : ?>
                <div class="notice notice-success is-dismissible">
                    <p><?php echo esc_html(urldecode($_GET['mensaje'])); ?></p>
                </div>
            <?php endif; ?>

            <style>
                /* Estilos de la tabla de lista de flipbooks */
                .flipbook-acciones {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .fb-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    text-decoration: none;
                    cursor: pointer;
                    border: 1px solid transparent;
                    transition: all .15s;
                    line-height: 1.6;
                }

                .fb-btn-editar {
                    background: #f0f6fc;
                    color: #0073aa;
                    border-color: #0073aa;
                }

                .fb-btn-editar:hover {
                    background: #0073aa;
                    color: #fff;
                }

                .fb-btn-audio {
                    background: #fff8f0;
                    color: #b45309;
                    border-color: #d97706;
                }

                .fb-btn-audio:hover {
                    background: #d97706;
                    color: #fff;
                }

                .fb-btn-eliminar {
                    background: #fff5f5;
                    color: #dc2626;
                    border-color: #dc2626;
                }

                .fb-btn-eliminar:hover {
                    background: #dc2626;
                    color: #fff;
                }

                .fb-btn:disabled {
                    opacity: .5;
                    cursor: not-allowed;
                }

                /* Indicador de carga en los botones */
                .fb-btn-loading {
                    opacity: .6;
                    cursor: wait !important;
                }
            </style>

            <table class="wp-list-table widefat fixed striped" id="tabla-flipbooks">
                <thead>
                    <tr>
                        <th style="width:30%">Título</th>
                        <th style="width:8%">Páginas</th>
                        <th style="width:32%">Shortcode</th>
                        <th style="width:30%">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($flipbooks)) : ?>
                        <tr id="fila-vacia">
                            <td colspan="4">
                                No hay flipbooks creados aún.
                                <a href="<?php echo admin_url('admin.php?page=flipbook-editor'); ?>">Crear el primero</a>.
                            </td>
                        </tr>
                    <?php else : ?>
                        <?php foreach ($flipbooks as $flip) :
                            $paginas    = get_post_meta($flip->ID, '_flipbook_pdf_pages', true);
                            $url_editor = admin_url('admin.php?page=flipbook-editor&flipbook_id=' . $flip->ID);
                        ?>
                            <tr id="fila-<?php echo $flip->ID; ?>">
                                <td><strong><?php echo esc_html($flip->post_title); ?></strong></td>
                                <td><?php echo intval($paginas); ?></td>
                                <td>
                                    <code>[contraplano_flipbook id="<?php echo $flip->ID; ?>"]</code>
                                </td>
                                <td>
                                    <div class="flipbook-acciones">

                                        <!-- Editar flipbook -->
                                        <a href="<?php echo esc_url($url_editor); ?>"
                                            class="fb-btn fb-btn-editar">
                                            ✏️ Editar
                                        </a>

                                        <!-- Borrar solo los audios (archivos físicos + overlays de BD) -->
                                        <button class="fb-btn fb-btn-audio"
                                            data-id="<?php echo $flip->ID; ?>"
                                            data-accion="borrar-audio"
                                            title="Elimina solo los archivos de audio (.mp3, .wav, .ogg) de este flipbook de manera permanente">
                                            🔇 Borrar audio
                                        </button>

                                        <!-- Eliminar flipbook completo -->
                                        <button class="fb-btn fb-btn-eliminar"
                                            data-id="<?php echo $flip->ID; ?>"
                                            data-accion="eliminar-flipbook"
                                            title="Elimina el flipbook completo: PDF, overlays y todos sus archivos">
                                            🗑 Eliminar
                                        </button>

                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <script>
            (function($) {
                // Datos pasados desde PHP al JS de la lista
                var ajaxUrl = <?php echo json_encode($ajax_url); ?>;
                var nonce = <?php echo json_encode($nonce); ?>;

                $('#tabla-flipbooks').on('click', '[data-accion]', function() {
                    var $btn = $(this);
                    var accion = $btn.data('accion');
                    var id = $btn.data('id');

                    if (accion === 'borrar-audio') {
                        // Confirmación antes de borrar los audios
                        if (!confirm(
                                '¿Eliminar TODOS los archivos de audio de este flipbook?\n\n' +
                                'Esta acción borra los archivos .mp3/.wav/.ogg del servidor de manera permanente.\n' +
                                'Los demás elementos (video, imágenes, presentación) se conservan.'
                            )) return;

                        $btn.addClass('fb-btn-loading').prop('disabled', true).text('⏳ Borrando…');

                        $.post(ajaxUrl, {
                            action: 'flipbook_eliminar_audios',
                            nonce: nonce,
                            flipbook_id: id
                        }, function(respuesta) {
                            if (respuesta.success) {
                                mostrarNotificacion('✓ ' + respuesta.data.mensaje, 'success');
                            } else {
                                mostrarNotificacion('✗ ' + respuesta.data, 'error');
                            }
                            // Restaurar botón
                            $btn.removeClass('fb-btn-loading')
                                .prop('disabled', false)
                                .text('🔇 Borrar audio');
                        }).fail(function() {
                            mostrarNotificacion('✗ Error de conexión con el servidor.', 'error');
                            $btn.removeClass('fb-btn-loading')
                                .prop('disabled', false)
                                .text('🔇 Borrar audio');
                        });

                    } else if (accion === 'eliminar-flipbook') {
                        // Confirmación antes de eliminar todo el flipbook
                        if (!confirm(
                                '¿Eliminar este flipbook de manera permanente?\n\n' +
                                'Se borrarán:\n' +
                                '  • El archivo PDF del servidor\n' +
                                '  • Todos los archivos de audio\n' +
                                '  • Todos los overlays (video, imágenes, presentación, audio)\n' +
                                '  • El flipbook de la base de datos\n\n' +
                                'Esta acción NO se puede deshacer.'
                            )) return;

                        $btn.addClass('fb-btn-loading').prop('disabled', true).text('⏳ Eliminando…');

                        $.post(ajaxUrl, {
                            action: 'flipbook_eliminar_flipbook',
                            nonce: nonce,
                            flipbook_id: id
                        }, function(respuesta) {
                            if (respuesta.success) {
                                // Quitar la fila de la tabla con animación
                                $('#fila-' + id).fadeOut(400, function() {
                                    $(this).remove();
                                    // Si ya no quedan filas, mostrar mensaje vacío
                                    if ($('#tabla-flipbooks tbody tr').length === 0) {
                                        $('#tabla-flipbooks tbody').html(
                                            '<tr id="fila-vacia"><td colspan="4">' +
                                            'No hay flipbooks creados aún. ' +
                                            '<a href="admin.php?page=flipbook-editor">Crear el primero</a>.' +
                                            '</td></tr>'
                                        );
                                    }
                                });
                                mostrarNotificacion('✓ Flipbook eliminado correctamente.', 'success');
                            } else {
                                mostrarNotificacion('✗ ' + respuesta.data, 'error');
                                $btn.removeClass('fb-btn-loading')
                                    .prop('disabled', false)
                                    .text('🗑 Eliminar');
                            }
                        }).fail(function() {
                            mostrarNotificacion('✗ Error de conexión con el servidor.', 'error');
                            $btn.removeClass('fb-btn-loading')
                                .prop('disabled', false)
                                .text('🗑 Eliminar');
                        });
                    }
                });

                /**
                 * Muestra una notificación temporal en la parte superior de la página.
                 * @param {string} mensaje  Texto a mostrar.
                 * @param {string} tipo     'success' o 'error'.
                 */
                function mostrarNotificacion(mensaje, tipo) {
                    var cls = tipo === 'success' ? 'notice-success' : 'notice-error';
                    var $n = $('<div class="notice ' + cls + ' is-dismissible"><p>' + mensaje + '</p></div>');
                    $('h1.wp-heading-inline').closest('.wrap').prepend($n);
                    // Auto-cerrar después de 4 segundos
                    setTimeout(function() {
                        $n.fadeOut(300, function() {
                            $n.remove();
                        });
                    }, 4000);
                }

            })(jQuery);
        </script>
    <?php
    }

    /**
     * Renderiza el contenedor vacío del editor visual.
     * Todo el HTML real del editor es generado por editor.js al cargar la página.
     */
    public static function pagina_editor()
    {
    ?>
        <div class="wrap flipbook-editor-wrap">
            <h1>Editor de Flipbook</h1>
            <!-- El editor es generado dinámicamente por editor.js -->
            <div id="flipbook-app">
                <div id="flipbook-cargando">Cargando editor...</div>
            </div>
        </div>
    <?php
    }

    /**
     * Sirve la página de vista previa fullscreen del flipbook.
     * Se llama desde admin_init ANTES de que WordPress imprima el layout del admin,
     * por lo que este método controla el HTML completo de la respuesta.
     * Renderiza el PDF en modo doble página (spread) estilo Paperturn.
     */
    public static function servir_preview()
    {
        $flipbook_id = intval($_GET['flipbook_id'] ?? 0);

        if (! $flipbook_id) {
            if (ob_get_level()) ob_end_clean();
            wp_die('Flipbook no encontrado. Vuelve al editor y guarda primero.');
        }

        $pdf_url = get_post_meta($flipbook_id, '_flipbook_pdf_url',   true);
        $paginas = intval(get_post_meta($flipbook_id, '_flipbook_pdf_pages', true));
        $post    = get_post($flipbook_id);
        $titulo  = $post ? $post->post_title : 'Flipbook';

        if (! $pdf_url) {
            if (ob_get_level()) ob_end_clean();
            wp_die('Este flipbook no tiene un PDF asociado.');
        }

        // Obtener overlays (audios, links, videos)
        global $wpdb;
        $tabla    = $wpdb->prefix . 'flipbook_overlays';
        $overlays = $wpdb->get_results($wpdb->prepare("SELECT * FROM $tabla WHERE flipbook_id = %d", $flipbook_id), ARRAY_A);

        foreach ($overlays as &$ov) {
            $ov['datos'] = json_decode($ov['datos'], true);
        }

        // Limpiar output previo para evitar errores visuales
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        header('Content-Type: text/html; charset=UTF-8');
    ?>
        <!DOCTYPE html>
        <html lang="es">

        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title><?php echo esc_html($titulo); ?> — Vista previa</title>

            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js"></script>
            <link rel="stylesheet" href="<?php echo FLIPBOOK_URL; ?>assets/css/viewer.css">

            <style>
                body {
                    margin: 0;
                    background: #1a1a1a;
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                    font-family: sans-serif;
                }

                /* Ajuste de escalado (Recuperado de admin2.php) */
                #canvas-wrapper {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                    background: radial-gradient(circle, #2c2c2c 0%, #1a1a1a 100%);
                    padding: 40px;
                    /* Margen para que el libro no se vea gigante */
                    box-sizing: border-box;
                }

                #flipbook-render {
                    box-shadow: 0 0 50px rgba(0, 0, 0, 0.8);
                    max-width: 100%;
                    max-height: 100%;
                }

                .flipbook-overlays {
                    position: absolute;
                    pointer-events: none;
                    z-index: 10;
                }

                .flipbook-overlay {
                    pointer-events: auto;
                }

                /* Estilo Audio Compañero */
                .btn-reproducir-audio {
                    background: #1cbfb8;
                    border: none;
                    color: white;
                    border-radius: 50%;
                    width: 44px;
                    height: 44px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
                    transition: transform 0.2s;
                }

                .btn-reproducir-audio:hover {
                    transform: scale(1.1);
                }
            </style>
        </head>

        <body>

            <div id="canvas-wrapper">
                <div id="flipbook-render"></div>
                <div class="flipbook-overlays" id="capa-overlays"></div>
            </div>

            <div class="flipbook-barra">
                <div class="barra-grupo">
                    <button class="flipbook-btn" id="btn-prev">❮ Anterior</button>
                    <span class="flipbook-info-pagina">
                        <span class="flipbook-pagina-actual" id="pag-actual">1</span> / <?php echo $paginas; ?>
                    </span>
                    <button class="flipbook-btn" id="btn-next">Siguiente ❯</button>
                </div>
            </div>

            <script>
                const datos = {
                    pdfUrl: '<?php echo esc_js($pdf_url); ?>',
                    total: <?php echo $paginas; ?>,
                    overlays: <?php echo json_encode($overlays); ?>
                };

                let pageFlip = null;
                let audioActual = null;

                async function iniciar() {
                    const pdfjsLib = window['pdfjs-dist/build/pdf'];
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    try {
                        const loadingTask = pdfjsLib.getDocument(datos.pdfUrl);
                        const pdf = await loadingTask.promise;
                        const images = [];

                        // Renderizado de páginas para la animación
                        for (let i = 1; i <= datos.total; i++) {
                            const page = await pdf.getPage(i);
                            const viewport = page.getViewport({
                                scale: 1.5
                            });
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            await page.render({
                                canvasContext: ctx,
                                viewport: viewport
                            }).promise;
                            images.push(canvas.toDataURL('image/jpeg', 0.8));
                        }

                        // Inicializar PageFlip con modo STRETCH para escalado dinámico
                        pageFlip = new St.PageFlip(document.getElementById('flipbook-render'), {
                            width: 550,
                            height: 733,
                            size: "stretch",
                            showCover: true,
                            maxShadowOpacity: 0.5
                        });

                        pageFlip.loadFromImages(images);

                        // Evento al pasar página
                        pageFlip.on('flip', (e) => {
                            const num = e.data + 1;
                            document.getElementById('pag-actual').textContent = num;
                            renderOverlays(num);
                        });

                        renderOverlays(1);
                    } catch (e) {
                        console.error("Error en Vista Previa:", e);
                    }
                }

                function renderOverlays(pagina) {
                    const capa = document.getElementById('capa-overlays');
                    capa.innerHTML = '';
                    if (audioActual) {
                        audioActual.pause();
                        audioActual = null;
                    }

                    // SINCRONIZACIÓN: Ajustar capa de botones al tamaño real del libro escalado
                    const bookElement = document.querySelector('.stPageFlip');
                    if (bookElement) {
                        capa.style.width = bookElement.clientWidth + 'px';
                        capa.style.height = bookElement.clientHeight + 'px';
                        capa.style.left = bookElement.offsetLeft + 'px';
                        capa.style.top = bookElement.offsetTop + 'px';
                    }

                    const items = datos.overlays.filter(o => parseInt(o.pagina) === pagina);
                    items.forEach(ov => {
                        const d = ov.datos;
                        const div = document.createElement('div');
                        div.className = 'flipbook-overlay';
                        div.style = `position:absolute; left:${d.x}%; top:${d.y}%; width:${d.w}%; height:${d.h}%;`;

                        if (ov.tipo === 'audio') {
                            div.innerHTML = `<button class="btn-reproducir-audio" onclick="reproducir('${d.url}')">▶</button>`;
                        } else if (ov.tipo === 'link') {
                            div.innerHTML = `<a href="${d.url}" target="_blank" style="display:block;width:100%;height:100%;"></a>`;
                        } else if (ov.tipo === 'video') {
                            const m = d.url.match(/(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
                            if (m) div.innerHTML = `<iframe src="https://www.youtube.com/embed/${m[1]}" style="width:100%;height:100%;border:none;" allowfullscreen></iframe>`;
                        }
                        capa.appendChild(div);
                    });
                }

                function reproducir(url) {
                    if (audioActual) audioActual.pause();
                    audioActual = new Audio(url);
                    audioActual.play();
                }

                document.getElementById('btn-prev').onclick = () => pageFlip.flipPrev();
                document.getElementById('btn-next').onclick = () => pageFlip.flipNext();

                iniciar();
            </script>
        </body>

        </html>
<?php
        exit;
    }
}
