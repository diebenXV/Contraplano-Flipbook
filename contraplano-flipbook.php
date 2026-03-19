<?php
/*
Plugin Name: Contraplano Flipbook
Description: Editor interactivo de PDF tipo flipbook con soporte para video YouTube,
 *           audio, imágenes y presentaciones tipo slider. Comprime el PDF al cargarlo.
Version: 3.0
Author: Diego Montecinos y Maverick Valdes
*/

// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

// Constantes globales del plugin
define( 'FLIPBOOK_VERSION',    '1.0.0' );
define( 'FLIPBOOK_DIR',        plugin_dir_path( __FILE__ ) );
define( 'FLIPBOOK_URL',        plugin_dir_url( __FILE__ ) );

// Incluir todas las clases necesarias
require_once FLIPBOOK_DIR . 'includes/post-type.php';
require_once FLIPBOOK_DIR . 'includes/upload.php';
require_once FLIPBOOK_DIR . 'includes/ajax.php';
require_once FLIPBOOK_DIR . 'includes/shortcode.php';
require_once FLIPBOOK_DIR . 'admin/admin.php';

// Hooks de activación y desactivación
register_activation_hook( __FILE__, 'flipbook_activar' );
register_deactivation_hook( __FILE__, 'flipbook_desactivar' );

/**
 * Se ejecuta al activar el plugin.
 * Crea la tabla de base de datos para almacenar los overlays.
 */
function flipbook_activar() {
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
    dbDelta( $sql );
}

/**
 * Se ejecuta al desactivar el plugin.
 * Por ahora no realiza ninguna acción destructiva.
 */
function flipbook_desactivar() {}

// Inicializar el Custom Post Type y el shortcode en el hook 'init'
add_action( 'init', function() {
    Flipbook_Post_Type::init();
    Flipbook_Shortcode::init();
});

// Registrar el menú de administración
add_action( 'admin_menu', [ 'Flipbook_Admin', 'agregar_menu' ] );

// Encolar scripts y estilos en el panel de administración
add_action( 'admin_enqueue_scripts', [ 'Flipbook_Admin', 'encolar_scripts' ] );

// Encolar scripts y estilos en el frontend público
add_action( 'wp_enqueue_scripts', [ 'Flipbook_Shortcode', 'encolar_scripts' ] );

// Registrar todos los handlers AJAX del plugin
add_action( 'wp_ajax_flipbook_subir_pdf',         [ 'Flipbook_Ajax', 'subir_pdf' ] );
add_action( 'wp_ajax_flipbook_guardar_overlays',  [ 'Flipbook_Ajax', 'guardar_overlays' ] );
add_action( 'wp_ajax_flipbook_obtener_overlays',  [ 'Flipbook_Ajax', 'obtener_overlays' ] );
add_action( 'wp_ajax_flipbook_eliminar_overlay',  [ 'Flipbook_Ajax', 'eliminar_overlay' ] );
add_action( 'wp_ajax_flipbook_subir_imagen',      [ 'Flipbook_Ajax', 'subir_imagen' ] );
add_action( 'wp_ajax_flipbook_subir_audio',       [ 'Flipbook_Ajax', 'subir_audio' ] );
add_action( 'wp_ajax_flipbook_eliminar_flipbook', [ 'Flipbook_Ajax', 'eliminar_flipbook' ] );
add_action( 'wp_ajax_flipbook_eliminar_audios',   [ 'Flipbook_Ajax', 'eliminar_audios' ] );
add_action( 'wp_ajax_flipbook_descargar_con_overlays', [ 'Flipbook_Ajax', 'descargar_con_overlays' ] );