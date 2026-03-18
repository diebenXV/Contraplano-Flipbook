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
            'ajax_url'    => admin_url( 'admin-ajax.php' ),
            'nonce'       => wp_create_nonce( 'flipbook_nonce' ),
            'plugin_url'  => FLIPBOOK_URL,
            'flipbook_id' => $flipbook_id,
            'pdf_url'     => $pdf_url,
            'pdf_paginas' => intval( $pdf_paginas ),
            'titulo'      => $titulo,
        ]);
    }

    /**
     * Renderiza la página de lista de todos los flipbooks.
     * Muestra título, número de páginas, shortcode y enlace al editor.
     */
    public static function pagina_lista() {
        // Obtener todos los flipbooks publicados
        $flipbooks = get_posts([
            'post_type'      => 'flipbook',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
        ]);
        ?>
        <div class="wrap">
            <h1 class="wp-heading-inline">
                Flipbooks
                <a href="<?php echo admin_url( 'admin.php?page=flipbook-editor' ); ?>"
                   class="page-title-action">Añadir nuevo</a>
            </h1>

            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th>Título</th>
                        <th>Páginas</th>
                        <th>Shortcode</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                <?php if ( empty( $flipbooks ) ) : ?>
                    <tr>
                        <td colspan="4">No hay flipbooks creados aún. <a href="<?php echo admin_url('admin.php?page=flipbook-editor'); ?>">Crear el primero</a>.</td>
                    </tr>
                <?php else : ?>
                    <?php foreach ( $flipbooks as $flip ) :
                        $paginas = get_post_meta( $flip->ID, '_flipbook_pdf_pages', true );
                    ?>
                    <tr>
                        <td><strong><?php echo esc_html( $flip->post_title ); ?></strong></td>
                        <td><?php echo intval( $paginas ); ?></td>
                        <td>
                            <code>[contraplano_flipbook id="<?php echo $flip->ID; ?>"]</code>
                        </td>
                        <td>
                            <a href="<?php echo admin_url( 'admin.php?page=flipbook-editor&flipbook_id=' . $flip->ID ); ?>">
                                Editar
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>
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
}
