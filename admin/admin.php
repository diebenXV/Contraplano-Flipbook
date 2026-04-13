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
            'Flipbooks Ediciones',
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
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',[], '3.11.174', true
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
                FLIPBOOK_URL . 'assets/css/preview.css',[],
                FLIPBOOK_VERSION
            );
            return;
        }

        // VERIFICACIÓN CORREGIDA:
        // En lugar de usar un array con nombres exactos que fallan, 
        // simplemente verificamos si el nombre de la página contiene "flipbook-lista" o "flipbook-editor".
        if ( ! str_contains( $hook, 'flipbook-lista' ) && ! str_contains( $hook, 'flipbook-editor' ) ) {
            return;
        }

        // PDF.js — renderizado del PDF en el canvas del editor
        wp_enqueue_script(
            'pdfjs',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',[], '3.11.174', true
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
            FLIPBOOK_URL . 'assets/css/editor.css',[],
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
        wp_localize_script( 'flipbook-editor', 'contraplanoFlipbookAdmin',[
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
<script src="https://unpkg.com/page-flip/dist/js/page-flip.browser.js"></script>
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
    pointer-events: none;
}
.ov-layer .ov-html {
    pointer-events: auto;
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
    <!-- StPageFlip renderiza aquí el libro con animación real -->
    <div id="flip-container" style="display:none;"></div>

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

    let totalPags  = <?php echo intval( $paginas ); ?>;
    let pdfDoc     = null;
    let pageFlip   = null;          // instancia de StPageFlip
    let paginas    = [];            // canvases renderizados de cada página
    let paginasListas = 0;         // cuántas ya renderizamos
    let pagActual  = 1;

    const spinner       = document.getElementById('spinner');
    const flipContainer = document.getElementById('flip-container');
    const flechaIzq     = document.getElementById('flecha-izq');
    const flechaDer     = document.getElementById('flecha-der');
    const btnFirst      = document.getElementById('btn-first');
    const btnPrev       = document.getElementById('btn-prev');
    const btnNext       = document.getElementById('btn-next');
    const btnLast       = document.getElementById('btn-last');
    const inpPag        = document.getElementById('inp-pag');
    const lblTotal      = document.getElementById('lbl-total');
    const area          = document.getElementById('flipbook-area');

    /* ── Cargar PDF con PDF.js ── */
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfjsLib.getDocument({
        url:             PDF_URL,
        withCredentials: false,
        cMapUrl:         'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked:      true,
    }).promise.then(async pdf => {
        pdfDoc    = pdf;
        totalPags = pdf.numPages;
        lblTotal.textContent = '/ ' + totalPags;

        // Renderizar todas las páginas como canvases (StPageFlip necesita el HTML ya generado)
        await renderizarTodasLasPaginas();

        // Iniciar StPageFlip
        iniciarPageFlip();

    }).catch(err => {
        spinner.innerHTML = '<p style="color:#f66;text-align:center;">Error al cargar el PDF.<br>' + (err.message||err) + '</p>';
    });

    /* ── Calcular escala según área disponible ── */
    async function calcularEscalaBase() {
        const pag  = await pdfDoc.getPage(1);
        const vp   = pag.getViewport({ scale: 1 });
        const areaW = area.offsetWidth  - 140;
        const areaH = area.offsetHeight - 20;
        const porAncho = (areaW / 2) / vp.width;
        const porAlto  = areaH      / vp.height;
        return Math.min(porAncho, porAlto, 2.5);
    }

    /* ── Renderizar todas las páginas del PDF como canvases ── */
    async function renderizarTodasLasPaginas() {
        const esc = await calcularEscalaBase();

        // Renderizar la primera página para saber las dimensiones
        const pag1   = await pdfDoc.getPage(1);
        const vp1    = pag1.getViewport({ scale: esc });
        const W      = Math.round(vp1.width);
        const H      = Math.round(vp1.height);

        // Limpiar el contenedor del flipbook
        flipContainer.innerHTML = '';

        for (let i = 1; i <= totalPags; i++) {
            const pag = await pdfDoc.getPage(i);
            const vp  = pag.getViewport({ scale: esc });

            const cv = document.createElement('canvas');
            cv.width  = W;
            cv.height = H;
            cv.style.cssText = `display:block;width:${W}px;height:${H}px;`;

            await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;

            // Dibujar número de página si está configurado
            if (CONFIG_NUM && CONFIG_NUM.mostrar !== false) {
                dibujarNumPag(cv, i, totalPags, CONFIG_NUM);
            }

            // Cada página es un div que StPageFlip va a usar
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page-item';
            pageDiv.dataset.page = i;
            pageDiv.style.cssText = `width:${W}px;height:${H}px;overflow:hidden;position:relative;`;
            pageDiv.appendChild(cv);
            inyectarOverlaysEnPagina(pageDiv, i, W, H);
            flipContainer.appendChild(pageDiv);

            paginas[i] = { div: pageDiv, canvas: cv, W, H };
        }

        return { W, H };
    }

    /* ── Inicializar StPageFlip ── */
    function iniciarPageFlip() {
        if (!paginas[1]) return;
        const { W, H } = paginas[1];

        spinner.style.display = 'none';
        flipContainer.style.display = 'block';

        pageFlip = new St.PageFlip(flipContainer, {
            width:            W,
            height:           H,
            size:             'fixed',
            minWidth:         W,
            maxWidth:         W,
            minHeight:        H,
            maxHeight:        H,
            drawShadow:       true,
            flippingTime:     700,
            usePortrait:      true,
            startPage:        0,
            showCover:        true,      // primera y última página sola (portada/contraportada)
            mobileScrollSupport: false,
            clickEventForward:   true,
            useMouseEvents:      true,
            swipeDistance:       30,
            showPageCorners:     true,
            disableFlipByClick:  false,
        });

        // Cargar todas las páginas
        pageFlip.loadFromHTML(flipContainer.querySelectorAll('.page-item'));

        // Eventos de StPageFlip
        pageFlip.on('flip', function(e) {
            const idx = e.data;                // índice 0-based de la página izquierda visible
            pagActual = idx + 1;
            inpPag.value = pagActual;
            actualizarBotones();

            // Pausar audios anteriores y reproducir los de la página actual
            pausarAudiosDelLibro();
        });

        pageFlip.on('changeState', function(e) {
            if (e.data === 'read') {
                reproducirAutoplaySecuencial();
            }
        });

        // Autoplay en portada al cargar
        setTimeout(function() { reproducirAutoplaySecuencial(); }, 600);

        pageFlip.on('changeOrientation', function() {
            irA(pagActual);
        });

        actualizarBotones();
    }

    function inyectarOverlaysEnPagina(pageDiv, numPag, W, H) {
        const capa = document.createElement('div');
        capa.className = 'ov-layer';
        capa.style.cssText = 'position:absolute;inset:0;z-index:20;';

        (OVERLAYS || [])
            .filter(ov => parseInt(ov.pagina) === numPag)
            .forEach(ov => {
                const left  = (parseFloat(ov.pos_left) / 100) * W;
                const top   = (parseFloat(ov.pos_top ) / 100) * H;
                const ancho = (parseFloat(ov.ancho    ) / 100) * W;
                const alto  = (parseFloat(ov.alto     ) / 100) * H;

                if (ancho < 2 || alto < 2) return;

                const wrap = document.createElement('div');
                wrap.className = 'ov-html';
                wrap.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${ancho}px;height:${alto}px;overflow:hidden;border-radius:4px;z-index:25;`;

                let d = ov.datos || {};
                if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = {}; } }

                switch (ov.tipo) {
                    case 'youtube':      ytOverlay   (wrap, d); break;
                    case 'imagen':       imgOverlay  (wrap, d); break;
                    case 'presentacion': slideOverlay(wrap, d); break;
                    case 'audio':        audioOverlay(wrap, d); break;
                    case 'link':         linkOverlay (wrap, d); break;
                    default: return;
                }
                capa.appendChild(wrap);
            });

        pageDiv.appendChild(capa);
    }

    function pausarAudiosDelLibro() {
        flipContainer.querySelectorAll('audio').forEach(a => {
            try { a.pause(); a.currentTime = 0; } catch(_) {}
        });
    }

    function reproducirAutoplaySecuencial() {
        if (!pageFlip) return;
        var idx = pageFlip.getCurrentPageIndex();
        var allPages = flipContainer.querySelectorAll('.page-item');
        // En portada (idx=0, showCover:true) solo se ve la portada, no el spread
        var visibles = (idx === 0) ? [0] : [idx, idx + 1];

        var audios = [];
        visibles.forEach(function(pi) {
            if (pi < 0 || pi >= allPages.length) return;
            allPages[pi].querySelectorAll('audio[data-autoplay="1"]').forEach(function(a) {
                audios.push(a);
            });
        });
        if (!audios.length) return;

        var i = 0;
        function playNext() {
            if (i >= audios.length) return;
            var a = audios[i];
            a.currentTime = 0;
            a.play().then(function() {
                a.addEventListener('ended', function() { i++; playNext(); }, { once: true });
            }).catch(function() { i++; playNext(); });
        }
        playNext();
    }

    /* ── Overlays builders ── */
    function bloquearFlipEnInteraccion(el) {
        const eventos = ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick'];
        eventos.forEach(evt => {
            el.addEventListener(evt, function(e) {
                e.stopPropagation();
            });
        });
    }

    function ytOverlay(wrap, d) {
        bloquearFlipEnInteraccion(wrap);
        const p = new URLSearchParams({autoplay:d.autoplay||0,controls:d.controles!==undefined?d.controles:1,mute:d.silencio||0,loop:d.loop||0,start:d.inicio||0,playlist:d.videoId});
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${d.videoId}?${p}`;
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
        iframe.allowFullscreen = true;
        wrap.appendChild(iframe);
    }
    function imgOverlay(wrap, d) {
        const img = document.createElement('img');
        img.src = d.url||''; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
        wrap.appendChild(img);
    }
    function slideOverlay(wrap, d) {
        const imgs=d.imagenes||[]; if(!imgs.length) return;
        wrap.style.position='relative';
        let lista=d.aleatorio?mezclar([...imgs]):[...imgs],idx=0,timer=null;
        const dur=(parseInt(d.duracion)||3)*1000;
        const inner=document.createElement('div'); inner.style.cssText='position:relative;width:100%;height:100%;overflow:hidden;';
        lista.forEach((src,i)=>{const s=document.createElement('div');s.style.cssText=`position:absolute;inset:0;background:url('${src}') center/cover no-repeat;opacity:${i===0?1:0};transition:opacity .5s;`;inner.appendChild(s);});
        wrap.appendChild(inner);
        function mostrar(n){const t=lista.length;idx=d.loop?(((n%t)+t)%t):Math.max(0,Math.min(n,t-1));Array.from(inner.children).forEach((s,i)=>{s.style.opacity=i===idx?'1':'0';});}
        if(d.autoplay)timer=setInterval(()=>mostrar(idx+1),dur);
        if(d.flechas){const bs='position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';const bp=document.createElement('button');bp.style.cssText=bs+'left:4px;';bp.innerHTML='‹';const bn=document.createElement('button');bn.style.cssText=bs+'right:4px;';bn.innerHTML='›';bp.onclick=()=>{if(timer)clearInterval(timer);mostrar(idx-1);};bn.onclick=()=>{if(timer)clearInterval(timer);mostrar(idx+1);};wrap.appendChild(bp);wrap.appendChild(bn);}
    }
    function audioOverlay(wrap, d) {
        bloquearFlipEnInteraccion(wrap);
        const iconColor = d.iconColor || d.colorIcono || d.color || '#ffffff';
        const bgIdle = 'transparent';
        const bgActive = 'rgba(0,0,0,.25)';
        const borderIdle = 'rgba(255,255,255,.45)';
        const borderActive = 'rgba(255,255,255,.95)';
        // Ícono parlante (speaker) — igual que viewer.js
        const playPath = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a7.007 7.007 0 010 13.42v2.06A9.013 9.013 0 0023 12 9.013 9.013 0 0014 3.23z';
        const pausePath = 'M16.5 12A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM3 9v6h4l5 5V4L7 9H3z';

        // z-index alto para que quede por encima de otros overlays (sliders, etc.)
        wrap.style.zIndex = '50';
        wrap.style.display='flex';
        wrap.style.alignItems='center';
        wrap.style.justifyContent='center';
        wrap.style.cursor='pointer';
        wrap.style.borderRadius='4px';
        wrap.style.background = bgIdle;
        wrap.style.border = '1px solid ' + borderIdle;

        const audio=document.createElement('audio');
        audio.src=d.url||'';
        audio.preload='auto';
        if(d.autoplay)audio.dataset.autoplay='1';

        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 24 24');
        svg.setAttribute('fill', iconColor);
        svg.setAttribute('width', '55%');
        svg.setAttribute('height', '55%');
        svg.style.pointerEvents = 'none';
        svg.innerHTML='<path d="' + playPath + '"/>';

        let playing=false;
        wrap.appendChild(audio);
        wrap.appendChild(svg);
        if (playing) {
            wrap.style.background = bgActive;
            wrap.style.borderColor = borderActive;
            svg.innerHTML = '<path d="' + pausePath + '"/>';
        }

        wrap.onclick=(e)=>{
            e.preventDefault();
            e.stopPropagation();
            if(playing){
                audio.pause();
                wrap.style.background = bgIdle;
                wrap.style.borderColor = borderIdle;
                svg.innerHTML = '<path d="' + playPath + '"/>';
                playing=false;
            }else{
                audio.play().then(()=>{
                    wrap.style.background = bgActive;
                    wrap.style.borderColor = borderActive;
                    svg.innerHTML = '<path d="' + pausePath + '"/>';
                    playing=true;
                }).catch(()=>{
                    playing=false;
                });
            }
        };
        audio.addEventListener('ended',()=>{
            playing=false;
            wrap.style.background = bgIdle;
            wrap.style.borderColor = borderIdle;
            svg.innerHTML = '<path d="' + playPath + '"/>';
        });
    }
    function linkOverlay(wrap, d) {
        bloquearFlipEnInteraccion(wrap);
        const href=d.href||''; wrap.style.cursor='pointer';
        if(href.startsWith('pagina:')){
            const n=parseInt(href.replace('pagina:',''));
            wrap.style.background='rgba(26,111,207,0.18)'; wrap.style.border='2px solid rgba(26,111,207,0.5)'; wrap.style.borderRadius='6px'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.justifyContent='center';
            wrap.title=d.titulo||('Ir a página '+n);
            const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','rgba(26,111,207,0.9)'); svg.style.cssText='width:50%;height:50%;max-width:36px;max-height:36px;pointer-events:none;';
            svg.innerHTML='<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>';
            wrap.appendChild(svg);
            wrap.onmouseenter=()=>{wrap.style.background='rgba(26,111,207,0.32)';};
            wrap.onmouseleave=()=>{wrap.style.background='rgba(26,111,207,0.18)';};
            wrap.onclick=e=>{e.stopPropagation();irA(n);};
        } else if(href){
            const a=document.createElement('a'); a.href=href; a.title=d.titulo||href; a.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
            if(d.nuevaPestana&&!href.startsWith('mailto:')&&!href.startsWith('tel:')){a.target='_blank';a.rel='noopener noreferrer';}
            wrap.appendChild(a);
        }
    }
    function mezclar(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}

    /* ── Número de página sobre canvas ── */
    function dibujarNumPag(canvas, pag, total, cfg) {
        if(!cfg||!cfg.mostrar) return;
        const ctx=canvas.getContext('2d'),pad=15,fs=Math.max(cfg.tamanio||14,canvas.width*0.015),txt=pag+' / '+total;
        ctx.font='bold '+fs+'px Arial,sans-serif'; ctx.textBaseline='bottom';
        const pos=cfg.posicion||'inferior-derecha'; let x,y;
        if(pos==='inferior-derecha'){ctx.textAlign='right';x=canvas.width-pad;y=canvas.height-pad;}
        else if(pos==='inferior-izquierda'){ctx.textAlign='left';x=pad;y=canvas.height-pad;}
        else if(pos==='inferior-centro'){ctx.textAlign='center';x=canvas.width/2;y=canvas.height-pad;}
        else if(pos==='superior-derecha'){ctx.textAlign='right';x=canvas.width-pad;y=pad+fs;}
        else if(pos==='superior-izquierda'){ctx.textAlign='left';x=pad;y=pad+fs;}
        else if(pos==='superior-centro'){ctx.textAlign='center';x=canvas.width/2;y=pad+fs;}
        else{ctx.textAlign='center';x=canvas.width/2;y=canvas.height/2+fs/2;}
        const mw=ctx.measureText(txt).width,mh=fs+4;
        let bx,by;
        if(pos==='inferior-derecha'){bx=canvas.width-mw-pad-4;by=canvas.height-mh-pad;}
        else if(pos==='inferior-izquierda'){bx=pad-4;by=canvas.height-mh-pad;}
        else if(pos==='inferior-centro'){bx=canvas.width/2-mw/2-4;by=canvas.height-mh-pad;}
        else if(pos==='superior-derecha'){bx=canvas.width-mw-pad-4;by=pad-4;}
        else if(pos==='superior-izquierda'){bx=pad-4;by=pad-4;}
        else if(pos==='superior-centro'){bx=canvas.width/2-mw/2-4;by=pad-4;}
        else{bx=canvas.width/2-mw/2-4;by=canvas.height/2-mh/2;}
        const rgb=hexRgb(cfg.colorFondo||'#FFFFFF');
        ctx.fillStyle='rgba('+rgb.r+','+rgb.g+','+rgb.b+','+(cfg.opacidadFondo||0.8)+')';
        ctx.fillRect(bx,by,mw+8,mh+4); ctx.fillStyle=cfg.colorNumero||'#666666'; ctx.fillText(txt,x,y);
    }
    function hexRgb(h){const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return r?{r:parseInt(r[1],16),g:parseInt(r[2],16),b:parseInt(r[3],16)}:{r:102,g:102,b:102};}

    /* ── Navegación ── */
    function irA(n) {
        if (!pageFlip) return;
        if (n < 1) n = 1;
        if (n > totalPags) n = totalPags;
        // StPageFlip usa índice 0-based
        pageFlip.flip(n - 1);
        pagActual = n;
        inpPag.value = n;
        actualizarBotones();
    }

    function actualizarBotones() {
        const inicio = pagActual <= 1;
        const fin    = pagActual >= totalPags;
        flechaIzq.disabled = inicio;
        flechaDer.disabled = fin;
        btnFirst.disabled  = inicio;
        btnPrev.disabled   = inicio;
        btnNext.disabled   = fin;
        btnLast.disabled   = fin;
    }

    flechaIzq.onclick = () => pageFlip && pageFlip.flipPrev();
    flechaDer.onclick = () => pageFlip && pageFlip.flipNext();
    btnFirst.onclick  = () => irA(1);
    btnLast.onclick   = () => irA(totalPags);
    btnPrev.onclick   = () => pageFlip && pageFlip.flipPrev();
    btnNext.onclick   = () => pageFlip && pageFlip.flipNext();

    inpPag.addEventListener('change', () => { const n=parseInt(inpPag.value); if(!isNaN(n)) irA(n); });
    inpPag.addEventListener('keypress', e => { if(e.key==='Enter'){const n=parseInt(inpPag.value);if(!isNaN(n))irA(n);} });

    document.addEventListener('keydown', e => {
        if (e.key==='ArrowLeft')  { if(pageFlip) pageFlip.flipPrev(); }
        if (e.key==='ArrowRight') { if(pageFlip) pageFlip.flipNext(); }
        if (e.key==='Home')       irA(1);
        if (e.key==='End')        irA(totalPags);
    });

    /* ── Pantalla completa ── */
    document.getElementById('btn-fs').onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
        else document.exitFullscreen();
    };

    /* ── Ajuste al redimensionar ── */
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (pageFlip && pageFlip.update) {
                pageFlip.update();
            }
        }, 200);
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
