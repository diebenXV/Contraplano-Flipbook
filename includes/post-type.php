<?php
// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Clase Flipbook_Post_Type
 *
 * Registra el tipo de contenido personalizado (CPT) 'flipbook'
 * en WordPress. Cada flipbook creado en el plugin es un post
 * de este tipo. Sus metadatos almacenan la URL del PDF, la
 * ruta en disco y el número de páginas.
 *
 * Meta fields asociados al post:
 *   _flipbook_pdf_url   — URL pública del PDF comprimido
 *   _flipbook_pdf_path  — Ruta absoluta en disco del archivo
 *   _flipbook_pdf_pages — Número total de páginas del PDF
 */
class Flipbook_Post_Type {

    /**
     * Registra el CPT en WordPress.
     * Se llama desde el hook 'init' del archivo principal.
     */
    public static function init() {
        register_post_type( 'flipbook', [
            'labels' => [
                'name'          => __( 'Flipbooks',            'contraplano-flipbook' ),
                'singular_name' => __( 'Flipbook',             'contraplano-flipbook' ),
                'add_new'       => __( 'Añadir nuevo',         'contraplano-flipbook' ),
                'add_new_item'  => __( 'Añadir nuevo Flipbook','contraplano-flipbook' ),
                'edit_item'     => __( 'Editar Flipbook',      'contraplano-flipbook' ),
                'view_item'     => __( 'Ver Flipbook',         'contraplano-flipbook' ),
            ],
            'public'       => true,
            'show_in_menu' => false,   // Se muestra bajo nuestro propio menú
            'supports'     => [ 'title' ],
            'menu_icon'    => 'dashicons-book-alt',
        ]);
    }
}
