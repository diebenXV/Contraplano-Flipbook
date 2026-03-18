<?php
// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Clase Flipbook_Shortcode
 *
 * Registra el shortcode [contraplano_flipbook] para el visor público.
 * Permite insertar el flipbook en cualquier página o entrada de WordPress.
 *
 * Uso básico:
 *   [contraplano_flipbook id="5"]
 *
 * Parámetros opcionales:
 *   width  — Ancho del visor (por defecto: 100%)
 *   height — Alto del visor  (por defecto: 600px)
 */
class Flipbook_Shortcode {

    /**
     * Registra el shortcode en WordPress.
     * Se llama desde el hook 'init' del archivo principal.
     */
    public static function init() {
        add_shortcode( 'contraplano_flipbook', [ __CLASS__, 'renderizar' ] );
    }

    /**
     * Encola los assets del visor solo si la página actual usa el shortcode.
     * Así evitamos cargar PDF.js en todas las páginas del sitio.
     * Enganchado a wp_enqueue_scripts en el archivo principal.
     */
    public static function encolar_scripts() {
        global $post;

        // Solo encolar si existe el shortcode en el contenido de la página
        if ( ! $post || ! has_shortcode( $post->post_content, 'contraplano_flipbook' ) ) {
            return;
        }

        self::hacer_encolado();
    }

    /**
     * Realiza el encolado real de scripts y estilos del visor.
     * Se extrae en método propio porque render() también lo necesita
     * cuando el shortcode se procesa sin haber pasado por wp_enqueue_scripts.
     */
    public static function hacer_encolado() {
        // PDF.js — renderizado del PDF en canvas
        wp_enqueue_script(
            'pdfjs',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            [], '3.11.174', true
        );

        // Script del visor público
        wp_enqueue_script(
            'flipbook-viewer',
            FLIPBOOK_URL . 'assets/js/viewer.js',
            [ 'pdfjs', 'jquery' ],
            FLIPBOOK_VERSION,
            true
        );

        // Estilos del visor público
        wp_enqueue_style(
            'flipbook-viewer',
            FLIPBOOK_URL . 'assets/css/viewer.css',
            [],
            FLIPBOOK_VERSION
        );
    }

    /**
     * Renderiza el HTML del visor público del flipbook.
     * Consulta la base de datos para obtener los overlays del flipbook
     * y los serializa en una variable JavaScript para que viewer.js los use.
     *
     * @param  array  $atts  Atributos del shortcode (id, width, height).
     * @return string        HTML del visor listo para insertar.
     */
    public static function renderizar( $atts ) {
        $atts = shortcode_atts([
            'id'     => 0,
            'width'  => '100%',
            'height' => '600px',
        ], $atts );

        $flipbook_id = intval( $atts['id'] );

        if ( ! $flipbook_id ) {
            return '<p>Error: Flipbook no encontrado. Verifica el atributo id del shortcode.</p>';
        }

        // Obtener metadatos del PDF
        $pdf_url = get_post_meta( $flipbook_id, '_flipbook_pdf_url',   true );
        $paginas = get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true );

        if ( ! $pdf_url ) {
            return '<p>Este flipbook no tiene un PDF asociado aún.</p>';
        }

        // Encolar scripts y estilos si aún no se han encolado
        self::hacer_encolado();

        // Obtener todos los overlays de este flipbook desde la base de datos
        global $wpdb;
        $tabla   = $wpdb->prefix . 'flipbook_overlays';
        $overlays = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM $tabla WHERE flipbook_id = %d ORDER BY id ASC",
                $flipbook_id
            ),
            ARRAY_A
        );

        // Decodificar el JSON de configuración de cada overlay
        foreach ( $overlays as &$overlay ) {
            $overlay['datos'] = json_decode( $overlay['datos'], true );
        }

        // Pasar los datos al JavaScript del visor
        $datos_js = [
            'pdf_url'     => $pdf_url,
            'paginas'     => intval( $paginas ),
            'overlays'    => $overlays,
            'flipbook_id' => $flipbook_id,
        ];

        wp_localize_script( 'flipbook-viewer', 'flipbookData_' . $flipbook_id, $datos_js );

        // Generar el HTML del contenedor del visor
        ob_start();
        ?>
        <div class="flipbook-contenedor"
             data-flipbook-id="<?php echo esc_attr( $flipbook_id ); ?>"
             style="width:<?php echo esc_attr( $atts['width'] ); ?>; height:<?php echo esc_attr( $atts['height'] ); ?>;">

            <!-- Barra de navegación entre páginas -->
            <div class="flipbook-barra">
                <button class="flipbook-btn flipbook-anterior">&#8249; Anterior</button>
                <span class="flipbook-info-pagina">
                    Página <span class="flipbook-pagina-actual">1</span>
                    de <span class="flipbook-total-paginas"><?php echo esc_html( $paginas ); ?></span>
                </span>
                <button class="flipbook-btn flipbook-siguiente">Siguiente &#8250;</button>
            </div>

            <!-- Área del canvas donde se renderiza el PDF -->
            <div class="flipbook-canvas-wrapper">
                <canvas class="flipbook-canvas"></canvas>
                <!-- Capa donde se posicionan los overlays sobre el PDF -->
                <div class="flipbook-overlays"></div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}
