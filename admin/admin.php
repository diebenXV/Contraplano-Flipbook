<?php
// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

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
class Flipbook_Admin {

    /**
     * Registra el menú principal y los submenús en el panel de WordPress.
     * Enganchado a admin_menu en el archivo principal.
     */
    public static function agregar_menu() {
        // Menú principal
        add_menu_page(
            'Contraplano Flipbook',     // Título de la página
            'Flipbooks',                // Texto del menú
            'edit_posts',               // Capacidad requerida
            'flipbook-lista',           // Slug del menú
            [ __CLASS__, 'pagina_lista' ],
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
            [ __CLASS__, 'pagina_lista' ]
        );

        // Submenú: crear/editar flipbook
        add_submenu_page(
            'flipbook-lista',
            'Nuevo Flipbook',
            'Añadir nuevo',
            'edit_posts',
            'flipbook-editor',
            [ __CLASS__, 'pagina_editor' ]
        );
    }

    /**
     * Encola los scripts y estilos del editor de administración.
     * Solo se cargan cuando el hook activo corresponde a las páginas del plugin.
     * Enganchado a admin_enqueue_scripts en el archivo principal.
     *
     * @param string $hook  Identificador de la página de administración activa.
     */
    public static function encolar_scripts( $hook ) {
        // Solo cargar en las páginas del plugin
        $paginas_validas = [
            'toplevel_page_flipbook-lista',
            'flipbooks_page_flipbook-editor',
        ];

        if ( ! in_array( $hook, $paginas_validas ) ) return;

        // PDF.js — renderizado del PDF en el canvas del editor
        wp_enqueue_script(
            'pdfjs',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            [], '3.11.174', true
        );

        // Script principal del editor visual
        wp_enqueue_script(
            'flipbook-editor',
            FLIPBOOK_URL . 'assets/js/editor.js',
            [ 'jquery', 'pdfjs' ],
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
        $flipbook_id = intval( $_GET['flipbook_id'] ?? 0 );
        $pdf_url     = '';
        $pdf_paginas = 0;
        $titulo      = '';

        if ( $flipbook_id ) {
            $pdf_url     = get_post_meta( $flipbook_id, '_flipbook_pdf_url',   true );
            $pdf_paginas = get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true );
            $post        = get_post( $flipbook_id );
            $titulo      = $post ? $post->post_title : '';
        }

        // Pasar configuración inicial al JavaScript del editor
        wp_localize_script( 'flipbook-editor', 'flipbookAdmin', [
            'ajax_url'                => admin_url( 'admin-ajax.php' ),
            'nonce'                   => wp_create_nonce( 'flipbook_nonce' ),
            'plugin_url'              => FLIPBOOK_URL,
            'flipbook_id'             => $flipbook_id,
            'pdf_url'                 => $pdf_url,
            'pdf_paginas'             => intval( $pdf_paginas ),
            'titulo'                  => $titulo,
        ]);
    }

    /**
     * Renderiza la página de lista de todos los flipbooks.
     * Muestra título, páginas, shortcode y tres acciones:
     *   - Editar       → abre el editor visual
     *   - Borrar audio → elimina solo los archivos mp3/wav/ogg del disco + BD
     *   - Eliminar     → borra el flipbook completo (PDF + overlays + post)
     */
    public static function pagina_lista() {

        // Obtener todos los flipbooks publicados
        $flipbooks = get_posts([
            'post_type'      => 'flipbook',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
        ]);

        // Nonce para las llamadas AJAX de la lista
        $nonce     = wp_create_nonce( 'flipbook_nonce' );
        $ajax_url  = admin_url( 'admin-ajax.php' );
        ?>
        <div class="wrap">
            <h1 class="wp-heading-inline">
                Flipbooks
                <a href="<?php echo admin_url( 'admin.php?page=flipbook-editor' ); ?>"
                   class="page-title-action">Añadir nuevo</a>
            </h1>

            <?php if ( isset( $_GET['mensaje'] ) ) : ?>
                <div class="notice notice-success is-dismissible">
                    <p><?php echo esc_html( urldecode( $_GET['mensaje'] ) ); ?></p>
                </div>
            <?php endif; ?>

            <style>
                /* Estilos de la tabla de lista de flipbooks */
                .flipbook-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

                .fb-btn {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 4px 10px; border-radius: 4px;
                    font-size: 12px; font-weight: 600;
                    text-decoration: none; cursor: pointer;
                    border: 1px solid transparent;
                    transition: all .15s;
                    line-height: 1.6;
                }
                .fb-btn-editar {
                    background: #f0f6fc; color: #0073aa;
                    border-color: #0073aa;
                }
                .fb-btn-editar:hover { background: #0073aa; color: #fff; }

                .fb-btn-audio {
                    background: #fff8f0; color: #b45309;
                    border-color: #d97706;
                }
                .fb-btn-audio:hover { background: #d97706; color: #fff; }

                .fb-btn-eliminar {
                    background: #fff5f5; color: #dc2626;
                    border-color: #dc2626;
                }
                .fb-btn-eliminar:hover { background: #dc2626; color: #fff; }

                .fb-btn:disabled { opacity: .5; cursor: not-allowed; }

                /* Indicador de carga en los botones */
                .fb-btn-loading { opacity: .6; cursor: wait !important; }
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
                <?php if ( empty( $flipbooks ) ) : ?>
                    <tr id="fila-vacia">
                        <td colspan="4">
                            No hay flipbooks creados aún.
                            <a href="<?php echo admin_url('admin.php?page=flipbook-editor'); ?>">Crear el primero</a>.
                        </td>
                    </tr>
                <?php else : ?>
                    <?php foreach ( $flipbooks as $flip ) :
                        $paginas    = get_post_meta( $flip->ID, '_flipbook_pdf_pages', true );
                        $url_editor = admin_url( 'admin.php?page=flipbook-editor&flipbook_id=' . $flip->ID );
                    ?>
                    <tr id="fila-<?php echo $flip->ID; ?>">
                        <td><strong><?php echo esc_html( $flip->post_title ); ?></strong></td>
                        <td><?php echo intval( $paginas ); ?></td>
                        <td>
                            <code>[contraplano_flipbook id="<?php echo $flip->ID; ?>"]</code>
                        </td>
                        <td>
                            <div class="flipbook-acciones">

                                <!-- Editar flipbook -->
                                <a href="<?php echo esc_url( $url_editor ); ?>"
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
        (function($){
            // Datos pasados desde PHP al JS de la lista
            var ajaxUrl = <?php echo json_encode( $ajax_url ); ?>;
            var nonce   = <?php echo json_encode( $nonce   ); ?>;

            $( '#tabla-flipbooks' ).on( 'click', '[data-accion]', function() {
                var $btn    = $( this );
                var accion  = $btn.data( 'accion' );
                var id      = $btn.data( 'id' );

                if ( accion === 'borrar-audio' ) {
                    // Confirmación antes de borrar los audios
                    if ( ! confirm(
                        '¿Eliminar TODOS los archivos de audio de este flipbook?\n\n' +
                        'Esta acción borra los archivos .mp3/.wav/.ogg del servidor de manera permanente.\n' +
                        'Los demás elementos (video, imágenes, presentación) se conservan.'
                    ) ) return;

                    $btn.addClass( 'fb-btn-loading' ).prop( 'disabled', true ).text( '⏳ Borrando…' );

                    $.post( ajaxUrl, {
                        action:      'flipbook_eliminar_audios',
                        nonce:       nonce,
                        flipbook_id: id
                    }, function( respuesta ) {
                        if ( respuesta.success ) {
                            mostrarNotificacion( '✓ ' + respuesta.data.mensaje, 'success' );
                        } else {
                            mostrarNotificacion( '✗ ' + respuesta.data, 'error' );
                        }
                        // Restaurar botón
                        $btn.removeClass( 'fb-btn-loading' )
                            .prop( 'disabled', false )
                            .text( '🔇 Borrar audio' );
                    }).fail( function() {
                        mostrarNotificacion( '✗ Error de conexión con el servidor.', 'error' );
                        $btn.removeClass( 'fb-btn-loading' )
                            .prop( 'disabled', false )
                            .text( '🔇 Borrar audio' );
                    });

                } else if ( accion === 'eliminar-flipbook' ) {
                    // Confirmación antes de eliminar todo el flipbook
                    if ( ! confirm(
                        '¿Eliminar este flipbook de manera permanente?\n\n' +
                        'Se borrarán:\n' +
                        '  • El archivo PDF del servidor\n' +
                        '  • Todos los archivos de audio\n' +
                        '  • Todos los overlays (video, imágenes, presentación, audio)\n' +
                        '  • El flipbook de la base de datos\n\n' +
                        'Esta acción NO se puede deshacer.'
                    ) ) return;

                    $btn.addClass( 'fb-btn-loading' ).prop( 'disabled', true ).text( '⏳ Eliminando…' );

                    $.post( ajaxUrl, {
                        action:      'flipbook_eliminar_flipbook',
                        nonce:       nonce,
                        flipbook_id: id
                    }, function( respuesta ) {
                        if ( respuesta.success ) {
                            // Quitar la fila de la tabla con animación
                            $( '#fila-' + id ).fadeOut( 400, function() {
                                $( this ).remove();
                                // Si ya no quedan filas, mostrar mensaje vacío
                                if ( $( '#tabla-flipbooks tbody tr' ).length === 0 ) {
                                    $( '#tabla-flipbooks tbody' ).html(
                                        '<tr id="fila-vacia"><td colspan="4">' +
                                        'No hay flipbooks creados aún. ' +
                                        '<a href="admin.php?page=flipbook-editor">Crear el primero</a>.' +
                                        '</td></tr>'
                                    );
                                }
                            });
                            mostrarNotificacion( '✓ Flipbook eliminado correctamente.', 'success' );
                        } else {
                            mostrarNotificacion( '✗ ' + respuesta.data, 'error' );
                            $btn.removeClass( 'fb-btn-loading' )
                                .prop( 'disabled', false )
                                .text( '🗑 Eliminar' );
                        }
                    }).fail( function() {
                        mostrarNotificacion( '✗ Error de conexión con el servidor.', 'error' );
                        $btn.removeClass( 'fb-btn-loading' )
                            .prop( 'disabled', false )
                            .text( '🗑 Eliminar' );
                    });
                }
            });

            /**
             * Muestra una notificación temporal en la parte superior de la página.
             * @param {string} mensaje  Texto a mostrar.
             * @param {string} tipo     'success' o 'error'.
             */
            function mostrarNotificacion( mensaje, tipo ) {
                var cls  = tipo === 'success' ? 'notice-success' : 'notice-error';
                var $n   = $( '<div class="notice ' + cls + ' is-dismissible"><p>' + mensaje + '</p></div>' );
                $( 'h1.wp-heading-inline' ).closest( '.wrap' ).prepend( $n );
                // Auto-cerrar después de 4 segundos
                setTimeout( function() { $n.fadeOut( 300, function() { $n.remove(); }); }, 4000 );
            }

        })(jQuery);
        </script>
        <?php
    }

    /**
     * Renderiza el contenedor vacío del editor visual.
     * Todo el HTML real del editor es generado por editor.js al cargar la página.
     */
    public static function pagina_editor() {
        $flipbook_id = intval( $_GET['flipbook_id'] ?? 0 );
        
        // Obtener datos del flipbook si existe
        $debug_info = [];
        if ( $flipbook_id ) {
            $pdf_path   = get_post_meta( $flipbook_id, '_flipbook_pdf_path', true );
            $pdf_url    = get_post_meta( $flipbook_id, '_flipbook_pdf_url', true );
            $pdf_paginas = get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true );
            $post       = get_post( $flipbook_id );
            
            $archivo_existe = false;
            if ( $pdf_path && file_exists( $pdf_path ) ) {
                $archivo_existe = true;
            }
            
            $debug_info = [
                'flipbook_id'     => $flipbook_id,
                'pdf_path'        => $pdf_path ?: '(vacío)',
                'pdf_url'         => $pdf_url ?: '(vacío)',
                'pdf_paginas'     => $pdf_paginas ?: '(vacío)',
                'archivo_existe'  => $archivo_existe ? '✓ SÍ EXISTE' : '✗ NO EXISTE',
                'post_title'      => $post ? $post->post_title : 'N/A',
            ];
        }
        ?>
        <div class="wrap flipbook-editor-wrap">
            <h1>Editor de Flipbook</h1>
            
            <?php if ( ! empty( $debug_info ) ) : ?>
                <div style="background:#fffbea;padding:15px;margin:15px 0;border:2px solid #ff9800;border-radius:4px;">
                    <strong style="color:#ff6b00;font-size:14px;">⚠️ INFORMACIÓN DE LA BASE DE DATOS</strong>
                    <table style="width:100%;margin-top:10px;border-collapse:collapse;">
                    <?php foreach ( $debug_info as $key => $value ) : ?>
                        <tr style="border-bottom:1px solid #ddd;">
                            <td style="padding:8px;font-weight:600;width:30%;"><?php echo esc_html( $key ); ?></td>
                            <td style="padding:8px;font-family:monospace;word-break:break-all;"><?php echo esc_html( $value ); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </table>
                </div>
            <?php endif; ?>
            
            <!-- El editor es generado dinámicamente por editor.js -->
            <div id="flipbook-app">
                <div id="flipbook-cargando">Cargando editor...</div>
            </div>
        </div>
        <?php
    }
}