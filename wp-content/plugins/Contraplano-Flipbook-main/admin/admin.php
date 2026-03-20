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
        wp_localize_script( 'flipbook-editor', 'flipbookAdmin', [
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

        // Obtener configuración de números de página
        $config_numeros = get_post_meta( $flipbook_id, '_flipbook_config_numeros', true );
        if ( ! $config_numeros ) {
            $config_numeros = [
                'colorNumero'    => '#666666',
                'colorFondo'     => '#FFFFFF',
                'opacidadFondo'  => 0.8,
                'posicion'       => 'inferior-derecha',
                'tamanio'        => 14,
                'mostrar'        => true,
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

/* ── Animación flip ── */
@keyframes flip { 0%{opacity:1;transform:perspective(1200px) rotateY(0)} 45%{opacity:.4;transform:perspective(1200px) rotateY(-18deg)} 100%{opacity:1;transform:perspective(1200px) rotateY(0)} }
.flip-anim { animation: flip .38s ease-in-out; }

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

    const PDF_URL      = <?php echo json_encode( $pdf_url   ); ?>;
    const TOTAL_PAGS   = <?php echo intval( $paginas ); ?>;
    const OVERLAYS     = <?php echo wp_json_encode( array_values( $overlays ) ); ?>;
    const CONFIG_NUMEROS = <?php echo wp_json_encode( $config_numeros ); ?>;

    let pdfDoc   = null;
    let pagActual = 1;
    let enRender  = false;

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
    const flechaIzq = document.getElementById('flecha-izq');
    const flechaDer = document.getElementById('flecha-der');
    const btnFirst  = document.getElementById('btn-first');
    const btnPrev   = document.getElementById('btn-prev');
    const btnNext   = document.getElementById('btn-next');
    const btnLast   = document.getElementById('btn-last');
    const inpPag    = document.getElementById('inp-pag');
    const area      = document.getElementById('flipbook-area');

    /* ── Cargar PDF.js ── */
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfjsLib.getDocument(PDF_URL).promise.then(pdf => {
        pdfDoc = pdf;
        spinner.style.display = 'none';
        spread.style.display  = 'flex';
        irA(1, false);
    }).catch(() => {
        spinner.innerHTML = '<p style="color:#f66;text-align:center;">Error al cargar el PDF.<br>Verifica que el archivo exista.</p>';
    });

    /* ── Calcular escala óptima para el spread ── */
    async function escalaOptima() {
        const pag  = await pdfDoc.getPage(1);
        const vp   = pag.getViewport({ scale: 1 });

        // El área ya tiene padding:10px 70px en CSS, así que el espacio real
        // disponible para el spread es el offsetWidth/Height del área menos ese padding.
        const areaW = area.offsetWidth  - 140;  // 70px cada lado
        const areaH = area.offsetHeight - 20;   // 10px arriba y abajo

        // Dividimos el ancho entre 2 porque son dos páginas en paralelo
        const porAncho = ( areaW / 2 ) / vp.width;
        const porAlto  = areaH         / vp.height;

        // Tomamos el mínimo para que quepa en cualquier dimensión, con tope de 2.5x
        return Math.min( porAncho, porAlto, 2.5 );
    }

    /* ── Renderizar spread ── */
    async function renderSpread(numIzq, animar) {
        if (enRender) return;
        enRender = true;

        const esc    = await escalaOptima();
        const numDer = numIzq + 1;

        // Página izquierda
        await renderPagina(numIzq, cvL, ovL, slotL, esc);

        // Página derecha (si existe)
        if (numDer <= TOTAL_PAGS) {
            slotR.style.display = '';
            lomo.style.display  = '';
            await renderPagina(numDer, cvR, ovR, slotR, esc);
        } else {
            slotR.style.display = 'none';
            lomo.style.display  = 'none';
        }

        // Animación
        if (animar) {
            spread.classList.remove('flip-anim');
            void spread.offsetWidth;  // forzar reflow
            spread.classList.add('flip-anim');
        }

        inpPag.value = numIzq;
        actualizarBotones();
        enRender = false;
    }

    /* ── Renderizar una página en un canvas ── */
    async function renderPagina(num, cv, ovLayer, slot, esc) {
        if (num < 1 || num > TOTAL_PAGS) return;
        const pag = await pdfDoc.getPage(num);
        const vp  = pag.getViewport({ scale: esc });

        cv.width  = vp.width;
        cv.height = vp.height;
        slot.style.width  = vp.width  + 'px';
        slot.style.height = vp.height + 'px';

        await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        
        // Dibujar número de página
        dibujarNumeroPagina(cv, num, TOTAL_PAGS);

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

    function dibujarNumeroPagina(canvas, paginaActual, totalPaginas) {
        if (!CONFIG_NUMEROS.mostrar) return;

        const ctx = canvas.getContext('2d');
        const padding = 15;
        const fontSize = Math.max(CONFIG_NUMEROS.tamanio, canvas.width * 0.015);
        const texto = paginaActual + ' / ' + totalPaginas;

        // Configurar fuente
        ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
        ctx.fillStyle = CONFIG_NUMEROS.colorNumero;
        ctx.textBaseline = 'bottom';

        // Medir ancho del texto para agregar fondo
        const metrics = ctx.measureText(texto);
        const textWidth = metrics.width;
        const textHeight = fontSize + 4;

        // Calcular posición según configuración
        let x, y;
        const posicion = CONFIG_NUMEROS.posicion;

        if (posicion === 'inferior-derecha') {
            ctx.textAlign = 'right';
            x = canvas.width - padding;
            y = canvas.height - padding;
        } else if (posicion === 'inferior-izquierda') {
            ctx.textAlign = 'left';
            x = padding;
            y = canvas.height - padding;
        } else if (posicion === 'inferior-centro') {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = canvas.height - padding;
        } else if (posicion === 'superior-derecha') {
            ctx.textAlign = 'right';
            x = canvas.width - padding;
            y = padding + fontSize;
        } else if (posicion === 'superior-izquierda') {
            ctx.textAlign = 'left';
            x = padding;
            y = padding + fontSize;
        } else if (posicion === 'superior-centro') {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = padding + fontSize;
        } else if (posicion === 'centro') {
            ctx.textAlign = 'center';
            x = canvas.width / 2;
            y = (canvas.height / 2) + (fontSize / 2);
        }

        // Calcular posición del fondo
        let bgX, bgY, bgWidth = textWidth + 8, bgHeight = textHeight + 4;

        if (posicion === 'inferior-derecha') {
            bgX = canvas.width - textWidth - padding - 4;
            bgY = canvas.height - textHeight - padding;
        } else if (posicion === 'inferior-izquierda') {
            bgX = padding - 4;
            bgY = canvas.height - textHeight - padding;
        } else if (posicion === 'inferior-centro') {
            bgX = (canvas.width / 2) - (bgWidth / 2);
            bgY = canvas.height - textHeight - padding;
        } else if (posicion === 'superior-derecha') {
            bgX = canvas.width - textWidth - padding - 4;
            bgY = padding - 4;
        } else if (posicion === 'superior-izquierda') {
            bgX = padding - 4;
            bgY = padding - 4;
        } else if (posicion === 'superior-centro') {
            bgX = (canvas.width / 2) - (bgWidth / 2);
            bgY = padding - 4;
        } else if (posicion === 'centro') {
            bgX = (canvas.width / 2) - (bgWidth / 2);
            bgY = (canvas.height / 2) - (bgHeight / 2);
        }

        // Dibujar fondo semi-transparente
        const rgbColor = hexToRgb(CONFIG_NUMEROS.colorFondo);
        ctx.fillStyle = 'rgba(' + rgbColor.r + ', ' + rgbColor.g + ', ' + rgbColor.b + ', ' + CONFIG_NUMEROS.opacidadFondo + ')';
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

        // Dibujar texto
        ctx.fillStyle = CONFIG_NUMEROS.colorNumero;
        ctx.fillText(texto, x, y);
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : {r: 102, g: 102, b: 102};
    }

    /* ── Crear overlay ── */
    function crearOverlay(ov, W, H) {
        const left  = (parseFloat(ov.pos_left) / 100) * W;
        const top   = (parseFloat(ov.pos_top ) / 100) * H;
        const ancho = (parseFloat(ov.ancho    ) / 100) * W;
        const alto  = (parseFloat(ov.alto     ) / 100) * H;
        const wrap  = document.createElement('div');
        wrap.style.cssText =
            `position:absolute;left:${left}px;top:${top}px;`
          + `width:${ancho}px;height:${alto}px;overflow:hidden;border-radius:4px;`;
        const d = ov.datos || {};
        switch (ov.tipo) {
            case 'youtube':      ytOverlay   (wrap, d); break;
            case 'imagen':       imgOverlay  (wrap, d); break;
            case 'presentacion': slideOverlay(wrap, d); break;
            case 'audio':        audioOverlay(wrap, d); break;
            case 'link':         linkOverlay (wrap, d, alto, ancho); break;
            default: return null;
        }
        return wrap;
    }

    function ytOverlay(wrap, d) {
        if (d.modo === 'popup') {
            const thumb = `https://img.youtube.com/vi/${d.videoId}/hqdefault.jpg`;
            wrap.style.cursor = 'pointer';
            wrap.innerHTML = `<div style="position:relative;width:100%;height:100%;background:#000;"><img src="${thumb}" style="width:100%;height:100%;object-fit:cover;opacity:.85;"/><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:50px;height:50px;background:rgba(0,0,0,.7);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">▶</div></div></div>`;
            wrap.onclick = () => abrirPopupYT(d);
        } else {
            const p = new URLSearchParams({autoplay:d.autoplay||0,controls:d.controles!==undefined?d.controles:1,mute:d.silencio||0,loop:d.loop||0,start:d.inicio||0,playlist:d.videoId});
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${d.videoId}?${p}`;
            iframe.style.cssText = 'width:100%;height:100%;border:none;';
            iframe.allow = 'accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
            iframe.allowFullscreen = true;
            wrap.appendChild(iframe);
        }
    }
    function abrirPopupYT(d) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
        const p = new URLSearchParams({autoplay:1,controls:d.controles!==undefined?d.controles:1,mute:d.silencio||0,loop:d.loop||0,start:d.inicio||0,playlist:d.videoId});
        modal.innerHTML = `<div style="position:relative;width:90vw;max-width:800px;"><button style="position:absolute;top:-42px;right:0;background:none;border:none;color:#fff;font-size:30px;cursor:pointer;">✕</button><div style="position:relative;padding-bottom:56.25%;height:0;"><iframe src="https://www.youtube.com/embed/${d.videoId}?${p}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" allowfullscreen></iframe></div></div>`;
        modal.querySelector('button').onclick = () => document.body.removeChild(modal);
        modal.onclick = e => { if (e.target === modal) document.body.removeChild(modal); };
        document.body.appendChild(modal);
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
        function mostrar(n) { const t = lista.length; idx = d.loop ? (((n%t)+t)%t) : Math.max(0,Math.min(n,t-1)); Array.from(inner.children).forEach((s,i)=>{s.style.opacity=i===idx?'1':'0';}); }
        if (d.autoplay) timer = setInterval(() => mostrar(idx+1), dur);
        if (d.flechas) {
            const bs = 'position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);color:#fff;border:none;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
            const bp = document.createElement('button'); bp.style.cssText = bs+'left:4px;'; bp.innerHTML = '‹';
            const bn = document.createElement('button'); bn.style.cssText = bs+'right:4px;'; bn.innerHTML = '›';
            bp.onclick = () => { if(timer) clearInterval(timer); mostrar(idx-1); };
            bn.onclick = () => { if(timer) clearInterval(timer); mostrar(idx+1); };
            wrap.appendChild(bp); wrap.appendChild(bn);
        }
    }
    function audioOverlay(wrap, d) {
        wrap.style.cssText = 'background:#C70000;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:6px;';
        const audio = document.createElement('audio'); audio.src = d.url||''; audio.preload='auto'; if(d.autoplay) audio.autoplay=true;
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','white'); svg.setAttribute('width','45%'); svg.setAttribute('height','45%');
        svg.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
        let playing = !!d.autoplay; wrap.appendChild(audio); wrap.appendChild(svg);
        wrap.onclick = () => { if(playing){audio.pause();wrap.style.background='#C70000';}else{audio.play();wrap.style.background='#9B0000';} playing=!playing; };
        audio.addEventListener('ended',()=>{ playing=false; wrap.style.background='#C70000'; });
    }
    function linkOverlay(wrap, d) {
        const href = d.href || '';
        if (href.startsWith('pagina:')) {
            const n = parseInt(href.replace('pagina:',''));
            wrap.style.cursor = 'pointer'; wrap.title = d.titulo||'Ir a página '+n;
            wrap.onclick = () => irA(n);
        } else {
            const a = document.createElement('a'); a.href=href; a.title=d.titulo||href;
            a.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none;';
            if (d.nuevaPestana && !href.startsWith('mailto:') && !href.startsWith('tel:')) { a.target='_blank'; a.rel='noopener noreferrer'; }
            wrap.appendChild(a);
        }
    }
    function mezclar(arr) { for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

    /* ── Navegación ── */
    function irA(n, animar = true) {
        if (!pdfDoc) return;
        // Asegurar página impar (izquierda del spread), excepto la 1
        if (n < 1) n = 1;
        if (n > TOTAL_PAGS) n = TOTAL_PAGS;
        if (n > 1 && n % 2 === 0) n--;  // ajustar a impar
        const anterior = pagActual;
        pagActual = n;
        renderSpread(n, animar && n !== anterior);
    }

    function actualizarBotones() {
        const inicio = pagActual <= 1;
        const fin    = pagActual >= TOTAL_PAGS - 1;
        flechaIzq.disabled = inicio;
        flechaDer.disabled = fin;
        btnFirst.disabled  = inicio;
        btnPrev.disabled   = inicio;
        btnNext.disabled   = fin;
        btnLast.disabled   = fin;
        inpPag.value = pagActual;
    }

    flechaIzq.onclick = () => irA(pagActual - 2);
    flechaDer.onclick = () => irA(pagActual + 2);
    btnFirst.onclick  = () => irA(1);
    btnLast.onclick   = () => irA(TOTAL_PAGS);
    btnPrev.onclick   = () => irA(pagActual - 2);
    btnNext.onclick   = () => irA(pagActual + 2);

    inpPag.addEventListener('change', () => { const n=parseInt(inpPag.value); if(!isNaN(n)) irA(n); });
    inpPag.addEventListener('keypress', e => { if(e.key==='Enter'){const n=parseInt(inpPag.value);if(!isNaN(n))irA(n);} });

    document.addEventListener('keydown', e => {
        if (e.key==='ArrowLeft')  irA(pagActual - 2);
        if (e.key==='ArrowRight') irA(pagActual + 2);
        if (e.key==='Home')       irA(1);
        if (e.key==='End')        irA(TOTAL_PAGS);
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
