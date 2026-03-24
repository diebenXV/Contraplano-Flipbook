<?php
/**
 * Agregar botón al editor de WordPress para insertar shortcode del flipbook
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class Flipbook_Shortcode_Button {

    public static function init() {
        add_action( 'admin_head', [ __CLASS__, 'enqueue_button_assets' ] );
        add_filter( 'mce_buttons', [ __CLASS__, 'register_button' ] );
        add_filter( 'mce_external_plugins', [ __CLASS__, 'register_tinymce_plugin' ] );
        add_action( 'wp_ajax_flipbook_get_list', [ __CLASS__, 'get_flipbook_list' ] );
    }

    public static function enqueue_button_assets() {
        global $current_screen;
        
        // Solo en el editor de posts/pages
        if ( ! isset( $current_screen ) || $current_screen->base !== 'post' ) {
            return;
        }

        wp_enqueue_style(
            'flipbook-shortcode-button',
            FLIPBOOK_URL . 'assets/css/shortcode-button.css',
            [],
            FLIPBOOK_VERSION
        );

        wp_enqueue_script(
            'flipbook-shortcode-button',
            FLIPBOOK_URL . 'assets/js/shortcode-button.js',
            [ 'jquery', 'wp-util' ],
            FLIPBOOK_VERSION
        );

        wp_localize_script( 'flipbook-shortcode-button', 'flipbookButton', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( 'flipbook_shortcode_nonce' ),
        ]);
    }

    /**
     * Registrar botón en el editor TinyMCE
     */
    public static function register_button( $buttons ) {
        array_push( $buttons, 'flipbook_button' );
        return $buttons;
    }

    /**
     * Registrar plugin externo de TinyMCE
     */
    public static function register_tinymce_plugin( $plugins ) {
        $plugins['flipbook_button'] = FLIPBOOK_URL . 'assets/js/tinymce-plugin.js';
        return $plugins;
    }

    /**
     * AJAX: Obtener lista de flipbooks
     */
    public static function get_flipbook_list() {
        check_ajax_referer( 'flipbook_shortcode_nonce' );

        $flipbooks = get_posts( [
            'post_type'      => 'flipbook',
            'posts_per_page' => -1,
            'orderby'        => 'title',
            'order'          => 'ASC',
        ]);

        $list = [];
        foreach ( $flipbooks as $post ) {
            $list[] = [
                'id'    => $post->ID,
                'title' => $post->post_title,
            ];
        }

        wp_send_json_success( $list );
    }
}

// Inicializar
Flipbook_Shortcode_Button::init();
?>
