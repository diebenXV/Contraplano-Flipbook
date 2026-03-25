<?php
/*
Plugin Name: Contraplano Flipbook
Description: Editor interactivo de PDF tipo flipbook con soporte para video YouTube, audio, imágenes y presentaciones tipo slider. Comprime el PDF al cargarlo.
Version: 4.3
Author: Diego Montecinos y Maverick Valdes
*/

// Bloquear acceso directo al archivo
if (! defined('ABSPATH')) exit;

// Constantes globales del plugin
define('FLIPBOOK_VERSION',    '1.0.6');
define('FLIPBOOK_DIR',        plugin_dir_path(__FILE__));
define('FLIPBOOK_URL',        plugin_dir_url(__FILE__));

// Incluir todas las clases necesarias
require_once FLIPBOOK_DIR . 'includes/post-type.php';
require_once FLIPBOOK_DIR . 'includes/upload.php';
require_once FLIPBOOK_DIR . 'includes/ajax.php';
require_once FLIPBOOK_DIR . 'includes/shortcode.php';
require_once FLIPBOOK_DIR . 'includes/shortcode-button.php';
require_once FLIPBOOK_DIR . 'admin/admin.php';

// Hooks de activación y desactivación
register_activation_hook(__FILE__, 'flipbook_activar');
register_deactivation_hook(__FILE__, 'flipbook_desactivar');

/**
 * Se ejecuta al activar el plugin.
 * Crea la tabla de base de datos para almacenar los overlays.
 * Se creara apenas activar el plugin.
 * Si el plugin se desactiva o borra la tabla en la DB seguira ahi.
 */
function flipbook_activar()
{
    global $wpdb;

    $tabla          = $wpdb->prefix . 'flipbook_overlays';
    $charset_collate = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE IF NOT EXISTS $tabla (
        id          mediumint(9)  NOT NULL AUTO_INCREMENT,
        flipbook_id mediumint(9)  NOT NULL,
        pagina      int(5)        NOT NULL DEFAULT 1,
        tipo        varchar(20)   NOT NULL,
        datos       longtext      NOT NULL,
        pos_left    float         NOT NULL DEFAULT 10,
        pos_top     float         NOT NULL DEFAULT 10,
        ancho       float         NOT NULL DEFAULT 20,
        alto        float         NOT NULL DEFAULT 10,
        creado_en   datetime      DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        KEY flipbook_id (flipbook_id)
    ) $charset_collate;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);

    // Agregar regla CORS en .htaccess para los PDFs del plugin
    $htaccess = ABSPATH . '.htaccess';
    $marker   = 'Contraplano Flipbook CORS';
    $rules    = "<FilesMatch \"\\.pdf$\">\n    Header set Access-Control-Allow-Origin \"*\"\n</FilesMatch>";
    insert_with_markers($htaccess, $marker, $rules);
}

/**
 * Se ejecuta al desactivar el plugin.
 * Por ahora no realiza ninguna acción destructiva.
 */
function flipbook_desactivar() {}

// Inicializar el Custom Post Type y el shortcode en el hook 'init'
add_action('init', function () {
    Flipbook_Post_Type::init();
    Flipbook_Shortcode::init();
});

// Agregar headers CORS para que PDF.js pueda leer los archivos PDF
// desde cualquier página del sitio sin errores de cross-origin
add_action('send_headers', function () {
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    if (str_contains($request_uri, 'flipbook-pdfs')) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET');
    }
});

// Deshabilitar caché de LiteSpeed en las páginas admin del plugin
// para que el nonce siempre sea fresco y las peticiones AJAX funcionen
add_action('admin_init', function () {
    if (isset($_GET['page']) && str_contains($_GET['page'], 'flipbook')) {
        header('X-LiteSpeed-Cache-Control: no-cache');
        if (function_exists('do_action')) {
            do_action('litespeed_control_set_nocache', 'flipbook');
        }
    }
});

// Suprimir warnings de deprecación de PHP en las páginas del plugin.
// Estos warnings vienen de funciones internas de WordPress (no del plugin)
// cuando WP_DEBUG está activo en el servidor local.
// En producción esto no afecta porque WP_DEBUG suele estar desactivado.
add_action('admin_init', function () {
    if (! isset($_GET['page'])) return;
    $paginas_plugin = ['flipbook-lista', 'flipbook-editor', 'flipbook-preview'];
    if (in_array($_GET['page'], $paginas_plugin)) {
        error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
    }
});

// Registrar el menú de administración
add_action('admin_menu', ['Flipbook_Admin', 'agregar_menu']);

// Encolar scripts y estilos en el panel de administración
add_action('admin_enqueue_scripts', ['Flipbook_Admin', 'encolar_scripts']);

// Interceptar la vista previa ANTES de que WordPress imprima el layout del admin.
// ob_start() captura cualquier output que PHP haya emitido antes (warnings, notices),
// lo descarta con ob_end_clean(), y luego sirve el HTML limpio del visor.
add_action('admin_init', function () {
    if (
        isset($_GET['page']) &&
        $_GET['page'] === 'flipbook-preview' &&
        current_user_can('edit_posts')
    ) {
        // Iniciar buffer de salida para capturar warnings/notices de WordPress o PHP
        // que se hayan podido imprimir antes de llegar a este punto.
        ob_start();

        // Suprimir warnings de deprecación de PHP para que no rompan el HTML
        $nivel_anterior = error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING);

        Flipbook_Admin::servir_preview();

        // Descartar cualquier output acumulado antes del HTML del visor
        ob_end_clean();

        error_reporting($nivel_anterior);
        exit;
    }
});

// Encolar scripts y estilos en el frontend público
add_action('wp_enqueue_scripts', ['Flipbook_Shortcode', 'encolar_scripts']);

// Registrar todos los handlers AJAX del plugin
add_action('wp_ajax_flipbook_subir_pdf',         ['Flipbook_Ajax', 'subir_pdf']);
add_action('wp_ajax_flipbook_guardar_overlays',  ['Flipbook_Ajax', 'guardar_overlays']);
add_action('wp_ajax_flipbook_obtener_overlays',  ['Flipbook_Ajax', 'obtener_overlays']);
add_action('wp_ajax_flipbook_eliminar_overlay',  ['Flipbook_Ajax', 'eliminar_overlay']);
add_action('wp_ajax_flipbook_subir_imagen',      ['Flipbook_Ajax', 'subir_imagen']);
add_action('wp_ajax_flipbook_subir_audio',       ['Flipbook_Ajax', 'subir_audio']);
add_action('wp_ajax_flipbook_eliminar_flipbook', ['Flipbook_Ajax', 'eliminar_flipbook']);
add_action('wp_ajax_flipbook_eliminar_audios',   ['Flipbook_Ajax', 'eliminar_audios']);
add_action('wp_ajax_flipbook_guardar_titulo',         ['Flipbook_Ajax', 'guardar_titulo']);
add_action('wp_ajax_flipbook_guardar_config_numeros', ['Flipbook_Ajax', 'guardar_config_numeros']);
add_action('wp_ajax_flipbook_cargar_config_numeros',  ['Flipbook_Ajax', 'cargar_config_numeros']);
