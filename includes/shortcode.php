<?php
// Bloquear acceso directo al archivo
if (! defined('ABSPATH')) exit;

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

class Flipbook_Shortcode
{

    /**
     * Registra el shortcode en WordPress.
     * Se llama desde el hook 'init' del archivo principal.
     */
    public static function init()
    {
        add_shortcode('contraplano_flipbook', [__CLASS__, 'renderizar']);
    }

    /**
     * Encola los assets del visor solo si la página actual usa el shortcode.
     */
    public static function encolar_scripts()
    {
        global $post;

        // Solo encolar si existe el shortcode en el contenido de la página
        if (! $post || ! has_shortcode($post->post_content, 'contraplano_flipbook')) {
            return;
        }

        self::hacer_encolado();
    }

    /**
     * Realiza el encolado real de scripts y estilos del visor.
     */
    public static function hacer_encolado()
    {
        // Cargar Dashicons (Necesario para el icono de pantalla completa)
        wp_enqueue_style('dashicons');

        // PDF.js — renderizado del PDF en canvas
        wp_enqueue_script(
            'pdfjs',
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            [],
            '3.11.174',
            true
        );

        // PageFlip — animación tipo flipbook con páginas
        wp_enqueue_script(
            'st-page-flip',
            'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/page-flip.umd.js',
            [],
            '2.0.7',
            true
        );

        // Script del visor público
        wp_enqueue_script(
            'flipbook-viewer',
            FLIPBOOK_URL . 'assets/js/viewer.js',
            ['pdfjs', 'st-page-flip', 'jquery'],
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
     *
     * @param  array  $atts  Atributos del shortcode (id, width, height).
     * @return string        HTML del visor listo para insertar.
     */
    public static function renderizar($atts)
    {
        $atts = shortcode_atts([
            'id'     => 0,
            'width'  => '100%',
            'height' => '900px',
        ], $atts);

        $flipbook_id = intval($atts['id']);

        if (! $flipbook_id) {
            return '<p>Error: Flipbook no encontrado. Verifica el atributo id del shortcode.</p>';
        }

        // Obtener metadatos del PDF
        $pdf_url = get_post_meta($flipbook_id, '_flipbook_pdf_url',   true);
        $paginas = get_post_meta($flipbook_id, '_flipbook_pdf_pages', true);

        if (! $pdf_url) {
            return '<p>Este flipbook no tiene un PDF asociado aún.</p>';
        }

        // Encolar scripts y estilos si aún no se han encolado
        self::hacer_encolado();

        // Obtener todos los overlays de este flipbook desde la base de datos
        global $wpdb;
        $tabla    = $wpdb->prefix . 'flipbook_overlays';
        $overlays = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM $tabla WHERE flipbook_id = %d ORDER BY id ASC",
                $flipbook_id
            ),
            ARRAY_A
        );

        // Decodificar el JSON de cada overlay e incluir posición/tamaño
        if (! empty($overlays)) {
            foreach ($overlays as &$overlay) {
                $datos_decodificados = json_decode($overlay['datos'], true);
                if (! is_array($datos_decodificados)) {
                    $datos_decodificados = [];
                }
                // Agregar posición y tamaño al objeto datos para que JavaScript los encuentre
                $overlay['datos'] = array_merge($datos_decodificados, [
                    'x' => floatval($overlay['pos_left']),
                    'y' => floatval($overlay['pos_top']),
                    'w' => floatval($overlay['ancho']),
                    'h' => floatval($overlay['alto']),
                ]);
            }
        }

        // Obtener configuración de números de página
        $config_numeros = get_post_meta($flipbook_id, '_flipbook_config_numeros', true);
        if (! $config_numeros || ! is_array($config_numeros)) {
            $config_numeros = [
                'colorNumero'   => '#666666',
                'colorFondo'    => '#FFFFFF',
                'opacidadFondo' => 0.8,
                'posicion'      => 'inferior-derecha',
                'tamanio'       => 14,
                'mostrar'       => true,
            ];
        }

        // Pasar los datos al JavaScript
        $datos_js = [
            'pdf_url'        => $pdf_url,
            'paginas'        => intval($paginas),
            'overlays'       => $overlays,
            'flipbook_id'    => $flipbook_id,
            'config_numeros' => $config_numeros,
        ];

        wp_localize_script('flipbook-viewer', 'flipbookData_' . $flipbook_id, $datos_js);

        // Generar el HTML del contenedor del visor estilo "Paperturn"
        ob_start();
?>
        <div class="flipbook-contenedor"
            data-flipbook-id="<?php echo esc_attr($flipbook_id); ?>"
            style="width:<?php echo esc_attr($atts['width']); ?>; height:<?php echo esc_attr($atts['height']); ?>;">

            <div id="page-flip-container-<?php echo esc_attr($flipbook_id); ?>"
                class="flipbook-canvas-wrapper"
                style="width:100%; height:100%; position:relative; background:#f5f5f5; display:flex; align-items:center; justify-content:center;">
                <canvas class="flipbook-canvas" style="max-width:100%; max-height:100%; display:block;"></canvas>
                <div class="flipbook-overlays"
                    style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10;"></div>
            </div>

            <div class="flipbook-barra">
                <div class="barra-grupo">
                    <button class="flipbook-btn flipbook-inicio" title="Ir al inicio">
                        <span class="dashicons dashicons-controls-skipback"></span>
                    </button>

                    <button class="flipbook-btn flipbook-anterior" title="Anterior">❮</button>

                    <span class="flipbook-info-pagina">
                        <input type="number" class="flipbook-input-pagina" value="1" min="1" max="<?php echo esc_attr($paginas); ?>" style="width: 50px; background: rgba(255,255,255,0.1); border: 1px solid #444; color: white; text-align: center; border-radius: 4px; margin-right: 5px;">
                        <span class="flipbook-separador">/</span>
                        <span class="flipbook-total-paginas"><?php echo esc_html($paginas); ?></span>
                    </span>

                    <button class="flipbook-btn flipbook-siguiente" title="Siguiente">❯</button>

                    <button class="flipbook-btn flipbook-fin" title="Ir al final">
                        <span class="dashicons dashicons-controls-skipforward"></span>
                    </button>
                </div>

                <div class="barra-grupo">
                    <button class="flipbook-btn btn-fullscreen" title="Pantalla Completa">
                        <span class="dashicons dashicons-fullscreen-alt"></span>
                    </button>
                </div>
            </div>
        </div>
<?php
        return ob_get_clean();
    }
}
