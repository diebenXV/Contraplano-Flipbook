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
            'Contraplano Flipbook',
            'Flipbooks',
            'edit_posts',
            'flipbook-lista',
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

        // Submenú oculto: vista previa del flipbook (no aparece en el menú lateral)
        add_submenu_page(
            null,                          // Sin padre → no aparece en menú
            'Vista previa del Flipbook',
            'Vista previa',
            'edit_posts',
            'flipbook-preview',
            [ __CLASS__, 'pagina_preview' ]
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

        // Deshabilitar caché de LiteSpeed en todas las páginas del plugin
        // para evitar que se cachee el nonce y cause errores AJAX
        if ( str_contains( $hook, 'flipbook' ) ) {
            header( 'X-LiteSpeed-Cache-Control: no-cache' );
            do_action( 'litespeed_control_set_nocache', 'flipbook admin page' );
        }

        // La preview tiene su propio hook aunque el parent sea null
        if ( str_contains( $hook, 'flipbook-preview' ) ) {
            // Encolar solo PDF.js y el visor para la página de preview
            wp_enqueue_script(
                'pdfjs',
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
                [], '3.11.174', true
            );
            wp_enqueue_script(
                'flipbook-viewer',
                FLIPBOOK_URL . 'assets/js/viewer.js',
                [ 'pdfjs', 'jquery' ],
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

        // URL de la vista previa para pasarla al JS del editor
        $preview_url = $flipbook_id
            ? admin_url( 'admin.php?page=flipbook-preview&flipbook_id=' . $flipbook_id )
            : '';

        // Pasar configuración inicial al JavaScript del editor
        wp_localize_script( 'flipbook-editor', 'contraplanoFlipbookAdmin', [
            'ajax_url'    => admin_url( 'admin-ajax.php' ),
            'nonce'       => wp_create_nonce( 'flipbook_nonce' ),
            'plugin_url'  => FLIPBOOK_URL,
            'flipbook_id' => $flipbook_id,
            'pdf_url'     => $pdf_url,
            'pdf_paginas' => intval( $pdf_paginas ),
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
    public static function servir_preview() {
        $flipbook_id = intval( $_GET['flipbook_id'] ?? 0 );

        if ( ! $flipbook_id ) {
            // Limpiar cualquier output previo antes de mostrar el error
            if ( ob_get_level() ) ob_end_clean();
            wp_die( 'Flipbook no encontrado. Vuelve al editor y guarda primero.' );
        }

        $pdf_url = get_post_meta( $flipbook_id, '_flipbook_pdf_url',   true );
        $paginas = intval( get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true ) );
        $post    = get_post( $flipbook_id );
        $titulo  = $post ? $post->post_title : 'Flipbook';

        if ( ! $pdf_url ) {
            if ( ob_get_level() ) ob_end_clean();
            wp_die( 'Este flipbook no tiene un PDF asociado.' );
        }

        // Obtener overlays
        global $wpdb;
        $tabla    = $wpdb->prefix . 'flipbook_overlays';
        $overlays = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM $tabla WHERE flipbook_id = %d ORDER BY id ASC",
                $flipbook_id
            ),
            ARRAY_A
        );
        foreach ( $overlays as &$ov ) {
            $ov['datos'] = json_decode( $ov['datos'], true );
        }

        // Configuración de números de página
        $config_numeros = get_post_meta( $flipbook_id, '_flipbook_config_numeros', true );
        if ( ! $config_numeros || ! is_array( $config_numeros ) ) {
            $config_numeros = [
                'colorNumero'   => '#666666',
                'colorFondo'    => '#FFFFFF',
                'opacidadFondo' => 0.8,
                'posicion'      => 'inferior-derecha',
                'tamanio'       => 14,
                'mostrar'       => true,
            ];
        }

        $editor_url = admin_url( 'admin.php?page=flipbook-editor&flipbook_id=' . $flipbook_id );

        // Limpiar TODO output previo (warnings de PHP, notices de WordPress, etc.)
        // antes de enviar los headers y el HTML limpio del visor.
        while ( ob_get_level() > 0 ) {
            ob_end_clean();
        }

        // Ahora sí: enviar headers y HTML
        header( 'Content-Type: text/html; charset=UTF-8' );
        header( 'X-Frame-Options: SAMEORIGIN' );
        ?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title><?php echo esc_html( $titulo ); ?> — Vista previa</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<style>
/* ── Reset total ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    width: 100%; height: 100%;
    overflow: hidden;
    background: #3d3d3d;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #fff;
}
body { display: flex; flex-direction: column; }

/* ── Barra superior ── */
#top-bar {
    flex-shrink: 0;
    height: 46px;
    background: #222;
    border-bottom: 1px solid #111;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    gap: 10px;
    z-index: 200;
}
#top-titulo {
    font-size: 14px;
    font-weight: 600;
    color: #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
}
.top-acciones { display: flex; gap: 8px; align-items: center; }
.top-btn {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 5px;
    color: #ddd;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 13px;
    text-decoration: none;
    cursor: pointer;
    transition: background .15s, color .15s;
    white-space: nowrap;
}
.top-btn:hover { background: rgba(255,255,255,.22); color: #fff; }

/* ── Área central del libro ── */
#flipbook-area {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;     /* crítico: permite que flex:1 respete el overflow */
    min-width: 0;
    padding: 10px 70px; /* espacio interno para las flechas laterales */
}

/* ── Spread (doble página) ── */
#spread {
    display: flex;
    position: relative;
    box-shadow: 0 12px 50px rgba(0,0,0,.75);
    /* El spread se auto-dimensiona por el canvas; no forzamos max-width/height aquí
       porque la función escalaOptima() en JS ya calcula el tamaño exacto */
}
.slot {
    position: relative;
    overflow: hidden;
    background: #fff;
    flex-shrink: 0;
    line-height: 0;
    transform-style: preserve-3d;
    backface-visibility: hidden;
}
.slot canvas { display: block; }
.ov-layer {
    position: absolute;
    top: 0; left: 0;
    pointer-events: all;
}
/* Sombra del lomo */
#lomo {
    position: absolute;
    top: 0; bottom: 0;
    left: 50%; width: 12px;
    transform: translateX(-50%);
    background: linear-gradient(to right,
        rgba(0,0,0,.22) 0%,
        rgba(0,0,0,.05) 40%,
        rgba(0,0,0,.05) 60%,
        rgba(0,0,0,.22) 100%
    );
    pointer-events: none;
    z-index: 5;
}

#flip-sombra-movil {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 26%;
    transform: translateX(-50%);
    pointer-events: none;
    opacity: 0;
    z-index: 8;
    background: linear-gradient(to right,
        rgba(0,0,0,0.00) 0%,
        rgba(0,0,0,0.04) 26%,
        rgba(0,0,0,0.14) 50%,
        rgba(0,0,0,0.04) 74%,
        rgba(0,0,0,0.00) 100%
    );
}

.flip-turn-layer {
    position: absolute;
    overflow: hidden;
    background: #fff;
    pointer-events: none;
    z-index: 14;
    backface-visibility: visible;
    transform-style: preserve-3d;
}

.flip-turn-face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
}

.flip-turn-front { transform: rotateY(0deg); }

.flip-turn-back {
    transform: rotateY(180deg);
    background: #f7f7f7;
}

.flip-turn-layer canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.flip-turn-back::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
        linear-gradient(to right,
            rgba(0,0,0,.10) 0%,
            rgba(0,0,0,.03) 18%,
            rgba(255,255,255,.65) 55%,
            rgba(255,255,255,.2) 100%
        ),
        #f6f1e9;
}

.flip-turn-shadow {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20%;
    pointer-events: none;
    opacity: 0;
}

/* ── Spinner ── */
#spinner {
    position: absolute;
    display: flex; flex-direction: column;
    align-items: center; gap: 14px;
    color: #bbb; font-size: 14px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.spin-ring {
    width: 40px; height: 40px;
    border: 3px solid rgba(255,255,255,.15);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
}

/* ── Flechas laterales ── */
.flecha {
    position: absolute;
    top: 50%; transform: translateY(-50%);
    width: 50px; height: 90px;
    background: rgba(0,0,0,.38);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 32px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    z-index: 50;
    transition: background .15s, transform .1s;
    flex-shrink: 0;
}
.flecha:hover { background: rgba(0,0,0,.65); }
.flecha:active { transform: translateY(-50%) scale(.94); }
.flecha:disabled { opacity: .18; cursor: default; }
#flecha-izq { left: 12px; }
#flecha-der { right: 12px; }

/* ── Botón pantalla completa ── */
#btn-fs {
    position: absolute;
    bottom: 12px; right: 12px;
    width: 34px; height: 34px;
    background: rgba(0,0,0,.45);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 5px;
    color: #fff;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    z-index: 50;
    transition: background .15s;
}
#btn-fs:hover { background: rgba(0,0,0,.75); }

/* ── Barra inferior ── */
#bottom-bar {
    flex-shrink: 0;
    height: 50px;
    background: #222;
    border-top: 1px solid #111;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    z-index: 200;
}
.nav-btn {
    width: 36px; height: 36px;
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 5px;
    color: #ddd;
    font-size: 15px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
}
.nav-btn:hover    { background: rgba(255,255,255,.22); }
.nav-btn:disabled { opacity: .22; cursor: default; }
#inp-pag {
    width: 48px;
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 5px;
    color: #fff;
    text-align: center;
    font-size: 13px;
    padding: 5px 0;
    -moz-appearance: textfield;
    appearance: textfield;
}
#inp-pag::-webkit-outer-spin-button,
#inp-pag::-webkit-inner-spin-button { -webkit-appearance: none; }
#lbl-total { font-size: 13px; color: #999; }
.sep { width: 1px; height: 22px; background: rgba(255,255,255,.12); }
</style>
</head>
<body>

<!-- BARRA SUPERIOR -->
<div id="top-bar">
    <span id="top-titulo"><?php echo esc_html( $titulo ); ?></span>
    <div class="top-acciones">
        <a href="<?php echo esc_url( $editor_url ); ?>" class="top-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            Volver al editor
        </a>
        <a href="<?php echo esc_url( $pdf_url ); ?>" download class="top-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            Descargar PDF
        </a>
    </div>
</div>

<!-- ÁREA DEL LIBRO -->
<div id="flipbook-area">
    <div id="spinner">
        <div class="spin-ring"></div>
        <span>Cargando flipbook…</span>
    </div>

    <div id="spread" style="display:none;">
        <div class="slot" id="slot-l"><canvas id="cv-l"></canvas><div class="ov-layer" id="ov-l"></div></div>
        <div id="lomo"></div>
        <div id="flip-sombra-movil"></div>
        <div class="slot" id="slot-r"><canvas id="cv-r"></canvas><div class="ov-layer" id="ov-r"></div></div>
    </div>

    <button class="flecha" id="flecha-izq" disabled>&#8249;</button>
    <button class="flecha" id="flecha-der" disabled>&#8250;</button>

    <button id="btn-fs" title="Pantalla completa">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
    </button>
</div>

<!-- BARRA INFERIOR -->
<div id="bottom-bar">
    <button class="nav-btn" id="btn-first" title="Primera página">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/></svg>
    </button>
    <button class="nav-btn" id="btn-prev" title="Anterior">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    </button>
    <div class="sep"></div>
    <input type="text" id="inp-pag" value="1" inputmode="numeric" pattern="[0-9]*" />
    <span id="lbl-total">/ <?php echo intval( $paginas ); ?></span>
    <div class="sep"></div>
    <button class="nav-btn" id="btn-next" title="Siguiente">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </button>
    <button class="nav-btn" id="btn-last" title="Última página">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/></svg>
    </button>
</div>

<script>
(function () {
    'use strict';

    const PDF_URL    = <?php echo json_encode( $pdf_url   ); ?>;
    const OVERLAYS   = <?php echo wp_json_encode( array_values( $overlays ) ); ?>;
    const CONFIG_NUM = <?php echo wp_json_encode( $config_numeros ?? [] ); ?>;

    // totalPags se actualiza desde pdf.numPages al cargar — no confiamos en el meta de WP
    let totalPags = <?php echo intval( $paginas ); ?>;
    let pdfDoc    = null;
    let pagActual = 1;
    let enRender  = false;
    // Estado de la animación de volteo
    let animando  = false;
    let pendiente = null;   // {n, dir} solicitud pendiente durante animación

    // DOM refs
    const spinner   = document.getElementById('spinner');
    const spread    = document.getElementById('spread');
    const cvL       = document.getElementById('cv-l');
    const cvR       = document.getElementById('cv-r');
    const ovL       = document.getElementById('ov-l');
    const ovR       = document.getElementById('ov-r');
    const slotL     = document.getElementById('slot-l');
    const slotR     = document.getElementById('slot-r');
    const lomo      = document.getElementById('lomo');
    const sombraMovil = document.getElementById('flip-sombra-movil');
    const flechaIzq = document.getElementById('flecha-izq');
    const flechaDer = document.getElementById('flecha-der');
    const btnFirst  = document.getElementById('btn-first');
    const btnPrev   = document.getElementById('btn-prev');
    const btnNext   = document.getElementById('btn-next');
    const btnLast   = document.getElementById('btn-last');
    const inpPag    = document.getElementById('inp-pag');
    const lblTotal  = document.getElementById('lbl-total');
    const area      = document.getElementById('flipbook-area');

    /* ── Cargar PDF.js ── */
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfjsLib.getDocument({
        url:             PDF_URL,
        withCredentials: false,
        cMapUrl:         'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked:      true,
    }).promise.then(pdf => {
        pdfDoc    = pdf;
        totalPags = pdf.numPages;
        lblTotal.textContent = '/ ' + totalPags;
        spinner.style.display = 'none';
        spread.style.display  = 'flex';
        irA(1, false);
    }).catch(() => {
        spinner.innerHTML = '<p style="color:#f66;text-align:center;">Error al cargar el PDF.<br>Verifica que el archivo exista.</p>';
    });

    /* ── Calcular escala óptima ── */
    async function escalaOptima(doblesPaginas) {
        const pag  = await pdfDoc.getPage(1);
        const vp   = pag.getViewport({ scale: 1 });
        const areaW = area.offsetWidth  - 140;
        const areaH = area.offsetHeight - 20;
        // Si es portada (página sola), usar todo el ancho; si es spread, dividir entre 2
        const divisor = doblesPaginas ? 2 : 1;
        const porAncho = ( areaW / divisor ) / vp.width;
        const porAlto  = areaH / vp.height;
        return Math.min( porAncho, porAlto, 2.5 );
    }

    /* ── Decidir si es spread o página sola ── */
    function esPortada(n) {
        // Página 1: portada sola
        // Última página cuando el total es PAR: contraportada sola
        if (n === 1) return true;
        if (n === totalPags && totalPags % 2 === 0) return true;
        return false;
    }

    /* ── Renderizar spread o página sola ── */
    async function renderSpread(numIzq, animMode = 'none', dir = 'adelante') {
        if (enRender) return;
        enRender = true;

        try {
            if (animMode === 'normal') {
                await animarVolteoReal(numIzq, dir);
            } else if (animMode === 'cover-open' || animMode === 'cover-close') {
                await animarTransicionPortada(numIzq, animMode);
            } else {
                await dibujarSpread(numIzq);
            }

            inpPag.value = numIzq;
            actualizarBotones();
        } finally {
            enRender = false;

            if (pendiente) {
                const p = pendiente;
                pendiente = null;
                irA(p.n, true);
            }
        }
    }

    async function dibujarSpread(numIzq) {
        const portada = esPortada(numIzq);
        const esc     = await escalaOptima(!portada);
        const numDer  = numIzq + 1;

        // Portada/contraportada: centrar la única página visible.
        spread.style.justifyContent = portada ? 'center' : 'flex-start';

        await renderPagina(numIzq, cvL, ovL, slotL, esc);

        if (!portada && numDer <= totalPags) {
            slotR.style.display = '';
            lomo.style.display  = '';
            await renderPagina(numDer, cvR, ovR, slotR, esc);
        } else {
            slotR.style.display = 'none';
            lomo.style.display  = 'none';
        }
    }

    /* ── Animación de volteo de hoja (estilo libro) ── */
    function obtenerSlotAnimacion(dir) {
        const derechaVisible = slotR.style.display !== 'none';
        if (dir === 'adelante') return derechaVisible ? slotR : slotL;
        return slotL;
    }

    function crearCapaVolteo(dir, slotOverride = null, originOverride = null) {
        const slot = slotOverride || obtenerSlotAnimacion(dir);
        const cv = slot.querySelector('canvas');
        if (!cv || !cv.width || !cv.height) return null;

        const slotRect   = slot.getBoundingClientRect();
        const spreadRect = spread.getBoundingClientRect();

        const capa = document.createElement('div');
        capa.className = 'flip-turn-layer';
        capa.style.left = (slotRect.left - spreadRect.left) + 'px';
        capa.style.top = (slotRect.top - spreadRect.top) + 'px';
        capa.style.width = slotRect.width + 'px';
        capa.style.height = slotRect.height + 'px';
        capa.style.transformOrigin = originOverride || (dir === 'adelante' ? 'left center' : 'right center');
        capa.style.transform = 'perspective(2200px) rotateY(0deg)';

        const front = document.createElement('div');
        front.className = 'flip-turn-face flip-turn-front';
        const frontCanvas = document.createElement('canvas');
        frontCanvas.width = cv.width;
        frontCanvas.height = cv.height;
        const fctx = frontCanvas.getContext('2d');
        if (!fctx) return null;
        fctx.drawImage(cv, 0, 0);
        front.appendChild(frontCanvas);

        const back = document.createElement('div');
        back.className = 'flip-turn-face flip-turn-back';

        capa.appendChild(front);
        capa.appendChild(back);

        const sh = document.createElement('div');
        sh.className = 'flip-turn-shadow';
        if (dir === 'adelante') {
            sh.style.left = '0';
            sh.style.background = 'linear-gradient(to right, rgba(0,0,0,.28), rgba(0,0,0,0))';
        } else {
            sh.style.right = '0';
            sh.style.background = 'linear-gradient(to left, rgba(0,0,0,.28), rgba(0,0,0,0))';
        }
        capa.appendChild(sh);

        spread.appendChild(capa);
        return { capa, shadow: sh };
    }

    async function animarTransicionPortada(numIzq, mode) {
        const sourceSlot = slotL;
        const sourceRect = sourceSlot.getBoundingClientRect();

        const origin = mode === 'cover-open' ? 'left center' : 'right center';
        const layer = crearCapaVolteo(
            mode === 'cover-open' ? 'adelante' : 'atras',
            sourceSlot,
            origin
        );

        await dibujarSpread(numIzq);

        if (!layer) return;

        const { capa, shadow } = layer;
        const targetRect = slotL.getBoundingClientRect();
        const dx = ( targetRect.left - sourceRect.left );
        const dy = ( targetRect.top  - sourceRect.top );
        const finRot = mode === 'cover-open' ? -170 : 170;

        return new Promise(resolve => {
            animando = true;

            if ( mode === 'cover-open' ) {
                slotR.style.transition = 'none';
                slotR.style.opacity = '0';
                slotR.style.transform = 'translateX(26px)';
                lomo.style.transition = 'none';
                lomo.style.opacity = '0.15';
            }

            sombraMovil.style.transition = 'opacity 1.65s ease-in-out, transform 1.65s ease-in-out';
            sombraMovil.style.opacity = '0.34';
            sombraMovil.style.transform = `translateX(-50%) translateX(${mode === 'cover-open' ? '-3%' : '3%'})`;

            // Trigger transition
            void capa.offsetWidth;
            if ( mode === 'cover-open' ) void slotR.offsetWidth;

            capa.style.transition = 'transform 1.65s ease-in-out, box-shadow 1.65s ease-in-out';
            shadow.style.transition = 'opacity 1.2s ease-in-out';
            capa.style.transform = `translate(${dx}px, ${dy}px) perspective(2200px) rotateY(${finRot}deg)`;
            capa.style.boxShadow = mode === 'cover-open'
                ? '-14px 0 20px rgba(0,0,0,.22)'
                : '14px 0 20px rgba(0,0,0,.22)';
            shadow.style.opacity = '0.5';

            if ( mode === 'cover-open' ) {
                slotR.style.transition = 'opacity 1.28s ease, transform 1.28s ease';
                slotR.style.opacity = '1';
                slotR.style.transform = 'translateX(0)';

                lomo.style.transition = 'opacity 1.28s ease';
                lomo.style.opacity = '1';
            }

            setTimeout(() => {
                if (capa.parentNode) capa.parentNode.removeChild(capa);
                sombraMovil.style.opacity = '0';
                sombraMovil.style.transform = 'translateX(-50%) translateX(0)';
                slotR.style.transition = '';
                slotR.style.opacity = '';
                slotR.style.transform = '';
                lomo.style.transition = '';
                lomo.style.opacity = '';
                animando = false;
                resolve();
            }, 1720);
        });
    }

    async function animarVolteoReal(numIzq, dir) {
        const layer = crearCapaVolteo(dir);

        // Renderizar nuevo spread por debajo de la hoja que gira
        await dibujarSpread(numIzq);

        if (!layer) return;

        const { capa, shadow } = layer;

        return new Promise(resolve => {
            animando = true;

            const finRot = dir === 'adelante' ? -168 : 168;

            sombraMovil.style.transition = 'opacity 1.65s ease-in-out, transform 1.65s ease-in-out';
            sombraMovil.style.opacity = '0.34';
            sombraMovil.style.transform = `translateX(-50%) translateX(${dir === 'adelante' ? '-3%' : '3%'})`;

            // Trigger transition
            void capa.offsetWidth;

            capa.style.transition = 'transform 1.65s ease-in-out, box-shadow 1.65s ease-in-out';
            shadow.style.transition = 'opacity 1.2s ease-in-out';
            capa.style.transform = `perspective(2200px) rotateY(${finRot}deg)`;
            capa.style.boxShadow = dir === 'adelante'
                ? '-14px 0 20px rgba(0,0,0,.22)'
                : '14px 0 20px rgba(0,0,0,.22)';
            shadow.style.opacity = '0.5';

            setTimeout(() => {
                if (capa.parentNode) capa.parentNode.removeChild(capa);
            sombraMovil.style.opacity = '0';
            sombraMovil.style.transform = 'translateX(-50%) translateX(0)';
                animando = false;
                resolve();
            }, 1720);
        });
    }

    /* ── Renderizar una página en un canvas ── */
    async function renderPagina(num, cv, ovLayer, slot, esc) {
        if (num < 1 || num > totalPags) return;
        const pag = await pdfDoc.getPage(num);
        const vp  = pag.getViewport({ scale: esc });

        cv.width  = vp.width;
        cv.height = vp.height;
        slot.style.width  = vp.width  + 'px';
        slot.style.height = vp.height + 'px';

        await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;

        // Dibujar número de página si está configurado
        if (CONFIG_NUM && CONFIG_NUM.mostrar !== false) {
            dibujarNumPag(cv, num, totalPags, CONFIG_NUM);
        }

        // Overlays de esta página
        ovLayer.innerHTML = '';
        ovLayer.style.width  = vp.width  + 'px';
        ovLayer.style.height = vp.height + 'px';

        (OVERLAYS || [])
            .filter(o => parseInt(o.pagina) === num)
            .forEach(o => {
                const el = crearOverlay(o, vp.width, vp.height);
                if (el) ovLayer.appendChild(el);
            });
    }

    /* ── Número de página ── */
    function dibujarNumPag(canvas, pagActual, totalPags, cfg) {
        if (!cfg || !cfg.mostrar) return;
        const ctx = canvas.getContext('2d');
        const pad = 15;
        const fs  = Math.max(cfg.tamanio || 14, canvas.width * 0.015);
        const txt = pagActual + ' / ' + totalPags;
        ctx.font = 'bold ' + fs + 'px Arial,sans-serif';
        ctx.textBaseline = 'bottom';
        const pos = cfg.posicion || 'inferior-derecha';
        let x, y;
        if      (pos==='inferior-derecha'  ) { ctx.textAlign='right';  x=canvas.width-pad;  y=canvas.height-pad; }
        else if (pos==='inferior-izquierda') { ctx.textAlign='left';   x=pad;               y=canvas.height-pad; }
        else if (pos==='inferior-centro'   ) { ctx.textAlign='center'; x=canvas.width/2;    y=canvas.height-pad; }
        else if (pos==='superior-derecha'  ) { ctx.textAlign='right';  x=canvas.width-pad;  y=pad+fs; }
        else if (pos==='superior-izquierda') { ctx.textAlign='left';   x=pad;               y=pad+fs; }
        else if (pos==='superior-centro'   ) { ctx.textAlign='center'; x=canvas.width/2;    y=pad+fs; }
        else                                 { ctx.textAlign='center'; x=canvas.width/2;    y=canvas.height/2+fs/2; }
        const mw = ctx.measureText(txt).width;
        const mh = fs + 4;
        let bx, by;
        if      (pos==='inferior-derecha'  ) { bx=canvas.width-mw-pad-4; by=canvas.height-mh-pad; }
        else if (pos==='inferior-izquierda') { bx=pad-4;                  by=canvas.height-mh-pad; }
        else if (pos==='inferior-centro'   ) { bx=canvas.width/2-mw/2-4; by=canvas.height-mh-pad; }
        else if (pos==='superior-derecha'  ) { bx=canvas.width-mw-pad-4; by=pad-4; }
        else if (pos==='superior-izquierda') { bx=pad-4;                  by=pad-4; }
        else if (pos==='superior-centro'   ) { bx=canvas.width/2-mw/2-4; by=pad-4; }
        else                                 { bx=canvas.width/2-mw/2-4; by=canvas.height/2-mh/2; }
        const rgb = hexRgb(cfg.colorFondo||'#FFFFFF');
        ctx.fillStyle = 'rgba('+rgb.r+','+rgb.g+','+rgb.b+','+(cfg.opacidadFondo||0.8)+')';
        ctx.fillRect(bx, by, mw+8, mh+4);
        ctx.fillStyle = cfg.colorNumero || '#666666';
        ctx.fillText(txt, x, y);
    }
    function hexRgb(h){const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return r?{r:parseInt(r[1],16),g:parseInt(r[2],16),b:parseInt(r[3],16)}:{r:102,g:102,b:102};}

    /* ── Crear overlay ── */
    function crearOverlay(ov, W, H) {
        const left  = (parseFloat(ov.pos_left) / 100) * W;
        const top   = (parseFloat(ov.pos_top ) / 100) * H;
        const ancho = (parseFloat(ov.ancho    ) / 100) * W;
        const alto  = (parseFloat(ov.alto     ) / 100) * H;

        if (ancho < 1 || alto < 1) return null;

        const wrap  = document.createElement('div');
        wrap.style.cssText =
            `position:absolute;left:${left}px;top:${top}px;`
          + `width:${ancho}px;height:${alto}px;overflow:hidden;border-radius:4px;z-index:10;`;

        // datos puede llegar como string JSON en algunos casos — parsear si es necesario
        let d = ov.datos || {};
        if (typeof d === 'string') {
            try { d = JSON.parse(d); } catch(e) { d = {}; }
        }

        switch (ov.tipo) {
            case 'youtube':      ytOverlay   (wrap, d); break;
            case 'imagen':       imgOverlay  (wrap, d); break;
            case 'presentacion': slideOverlay(wrap, d); break;
            case 'audio':        audioOverlay(wrap, d); break;
            case 'link':         linkOverlay (wrap, d); break;
            default: return null;
        }
        return wrap;
    }

    /* YouTube — siempre embed en su cuadrado, sin abrir popup */
    function ytOverlay(wrap, d) {
        const p = new URLSearchParams({
            autoplay:  d.autoplay  || 0,
            controls:  d.controles !== undefined ? d.controles : 1,
            mute:      d.silencio  || 0,
            loop:      d.loop      || 0,
            start:     d.inicio    || 0,
            playlist:  d.videoId,
        });
        const iframe = document.createElement('iframe');
        iframe.src   = `https://www.youtube.com/embed/${d.videoId}?${p}`;
        iframe.style.cssText   = 'width:100%;height:100%;border:none;';
        iframe.allow           = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
        iframe.allowFullscreen = true;
        wrap.appendChild(iframe);
    }

    function imgOverlay(wrap, d) {
        const img = document.createElement('img');
        img.src = d.url || '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        wrap.appendChild(img);
    }

    function slideOverlay(wrap, d) {
        const imgs = d.imagenes || []; if (!imgs.length) return;
        wrap.style.position = 'relative';
        let lista = d.aleatorio ? mezclar([...imgs]) : [...imgs], idx = 0, timer = null;
        const dur = (parseInt(d.duracion) || 3) * 1000;
        const inner = document.createElement('div');
        inner.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
        lista.forEach((src, i) => {
            const s = document.createElement('div');
            s.style.cssText = `position:absolute;inset:0;background:url('${src}') center/cover no-repeat;opacity:${i===0?1:0};transition:opacity .5s;`;
            inner.appendChild(s);
        });
        wrap.appendChild(inner);
        function mostrar(n) { const t=lista.length; idx=d.loop?(((n%t)+t)%t):Math.max(0,Math.min(n,t-1)); Array.from(inner.children).forEach((s,i)=>{s.style.opacity=i===idx?'1':'0';}); }
        if (d.autoplay) timer = setInterval(() => mostrar(idx+1), dur);
        if (d.flechas) {
            const bs='position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
            const bp=document.createElement('button'); bp.style.cssText=bs+'left:4px;'; bp.innerHTML='‹';
            const bn=document.createElement('button'); bn.style.cssText=bs+'right:4px;'; bn.innerHTML='›';
            bp.onclick=()=>{if(timer)clearInterval(timer);mostrar(idx-1);}; bn.onclick=()=>{if(timer)clearInterval(timer);mostrar(idx+1);};
            wrap.appendChild(bp); wrap.appendChild(bn);
        }
    }

    function audioOverlay(wrap, d) {
        const playPath  = 'M8 5v14l11-7z';
        const pausePath = 'M7 5h3v14H7zm7 0h3v14h-3z';

        // NO sobreescribir wrap.style.cssText — ya tiene position/left/top/width/height
        // Solo agregar los estilos adicionales del audio
        wrap.style.background   = '#C70000';
        wrap.style.display      = 'flex';
        wrap.style.alignItems   = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.cursor       = 'pointer';
        wrap.style.borderRadius = '6px';

        const audio = document.createElement('audio');
        audio.src     = d.url || '';
        audio.preload = 'auto';
        if (d.autoplay) audio.autoplay = true;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'white');
        // Tamaño relativo al contenedor, no fijo
        svg.style.cssText = 'width:60%;height:60%;max-width:48px;max-height:48px;pointer-events:none;';
        svg.innerHTML = `<path d="${playPath}"/>`;

        let playing = !!d.autoplay;
        wrap.appendChild(audio);
        wrap.appendChild(svg);

        wrap.onclick = () => {
            if (playing) {
                audio.pause();
                wrap.style.background = '#C70000';
                svg.innerHTML = `<path d="${playPath}"/>`;
            } else {
                audio.play();
                wrap.style.background = '#9B0000';
                svg.innerHTML = `<path d="${pausePath}"/>`;
            }
            playing = !playing;
        };
        audio.addEventListener('ended', () => {
            playing = false;
            wrap.style.background = '#C70000';
            svg.innerHTML = `<path d="${playPath}"/>`;
        });
    }

    /* Link — navega dentro del visor o abre URL */
    function linkOverlay(wrap, d) {
        const href = d.href || '';
        wrap.style.cursor = 'pointer';

        if (href.startsWith('pagina:')) {
            const n = parseInt(href.replace('pagina:', ''));
            wrap.title = d.titulo || ('Ir a página ' + n);

            // Fondo semitransparente con flecha para que sea visible
            wrap.style.background   = 'rgba(26,111,207,0.18)';
            wrap.style.border       = '2px solid rgba(26,111,207,0.5)';
            wrap.style.borderRadius = '6px';
            wrap.style.display      = 'flex';
            wrap.style.alignItems   = 'center';
            wrap.style.justifyContent = 'center';
            wrap.style.transition   = 'background 0.2s';

            // Ícono de flecha hacia la página
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'rgba(26,111,207,0.9)');
            svg.style.cssText = 'width:50%;height:50%;max-width:36px;max-height:36px;pointer-events:none;';
            svg.innerHTML = '<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>';
            wrap.appendChild(svg);

            wrap.onmouseenter = () => wrap.style.background = 'rgba(26,111,207,0.32)';
            wrap.onmouseleave = () => wrap.style.background = 'rgba(26,111,207,0.18)';
            wrap.onclick = (e) => { e.stopPropagation(); irA(n); };

        } else if (href) {
            const a = document.createElement('a');
            a.href  = href;
            a.title = d.titulo || href;
            a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
            if (d.nuevaPestana && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                a.target = '_blank'; a.rel = 'noopener noreferrer';
            }
            wrap.appendChild(a);

            // Mostrar ícono si tiene uno
            if (d.icono && d.icono !== 'ninguno') {
                const paths = {
                    mas:     'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z',
                    check:   'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z',
                    info:    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
                    pregunta:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
                    carrito: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96C5 16.1 6.1 17 7 17h11v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63H19c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0023.25 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
                };
                if (paths[d.icono]) {
                    const color = d.color || '#1a6fcf';
                    const svgI  = document.createElementNS('http://www.w3.org/2000/svg','svg');
                    svgI.setAttribute('viewBox','0 0 24 24'); svgI.setAttribute('fill',color);
                    svgI.style.cssText = 'width:55%;height:55%;max-width:40px;max-height:40px;pointer-events:none;';
                    svgI.innerHTML = `<path d="${paths[d.icono]}"/>`;
                    a.appendChild(svgI);
                }
            }
        }
    }

    function mezclar(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}

    /* ── Navegación ── */
    // Lógica de páginas igual a Paperturn:
    // - Página 1: portada sola
    // - Páginas 2-3, 4-5, 6-7...: spreads dobles
    // - Última página si total es par: contraportada sola
    //
    // paginaIzquierda(n) = la página izquierda del spread que contiene la página n
    function paginaIzquierda(n) {
        if (n <= 1) return 1;               // portada
        if (n % 2 === 0) return n;          // página par → ya es izquierda del spread
        return n - 1;                       // página impar → izquierda es n-1
    }

    function irA(n, animar = true) {
        if (!pdfDoc) return;
        if (n < 1) n = 1;
        if (n > totalPags) n = totalPags;
        n = paginaIzquierda(n);

        if (enRender || animando) {
            pendiente = { n };
            return;
        }

        const anterior = pagActual;
        let animMode = 'none';
        if ( animar && n !== anterior ) {
            if ( anterior === 1 && n === 2 ) {
                animMode = 'cover-open';
            } else if ( anterior === 2 && n === 1 ) {
                // Volver a portada sin animación evita una "tapa" invertida artificial.
                animMode = 'none';
            } else if ( !esPortada( anterior ) && !esPortada( n ) ) {
                animMode = 'normal';
            }
        }

        pagActual = n;
        renderSpread(n, animMode, n > anterior ? 'adelante' : 'atras');
    }

    function actualizarBotones() {
        const inicio = pagActual <= 1;
        // Fin: estamos en el último spread (página izquierda del último spread)
        const ultimaIzq = paginaIzquierda(totalPags);
        const fin = pagActual >= ultimaIzq;
        flechaIzq.disabled = inicio;
        flechaDer.disabled = fin;
        btnFirst.disabled  = inicio;
        btnPrev.disabled   = inicio;
        btnNext.disabled   = fin;
        btnLast.disabled   = fin;
        inpPag.value = pagActual;
    }

    // Navegación: desde portada (1) el siguiente es página 2; desde spread 2-3 el siguiente es 4, etc.
    function paginaSiguiente() {
        if (pagActual === 1) return 2;      // portada → primer spread
        return pagActual + 2;               // spread → spread siguiente
    }
    function paginaAnterior() {
        if (pagActual <= 2) return 1;       // primer spread o portada → portada
        return pagActual - 2;              // spread → spread anterior
    }

    flechaIzq.onclick = () => irA(paginaAnterior());
    flechaDer.onclick = () => irA(paginaSiguiente());
    btnFirst.onclick  = () => irA(1);
    btnLast.onclick   = () => irA(totalPags);
    btnPrev.onclick   = () => irA(paginaAnterior());
    btnNext.onclick   = () => irA(paginaSiguiente());

    inpPag.addEventListener('change', () => { const n=parseInt(inpPag.value); if(!isNaN(n)) irA(n); });
    inpPag.addEventListener('keypress', e => { if(e.key==='Enter'){const n=parseInt(inpPag.value);if(!isNaN(n))irA(n);} });

    document.addEventListener('keydown', e => {
        if (e.key==='ArrowLeft')  irA(paginaAnterior());
        if (e.key==='ArrowRight') irA(paginaSiguiente());
        if (e.key==='Home')       irA(1);
        if (e.key==='End')        irA(totalPags);
    });

    /* ── Pantalla completa ── */
    document.getElementById('btn-fs').onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
        else document.exitFullscreen();
    };

    /* ── Re-render al redimensionar ── */
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderSpread(pagActual, false), 180);
    });

})();
</script>
</body>
</html>
<?php
    }

    /**
     * Stub vacío para el submenú de preview registrado en agregar_menu().
     * La lógica real está en servir_preview(), que intercepta en admin_init.
     */
    public static function pagina_preview() {}
}
