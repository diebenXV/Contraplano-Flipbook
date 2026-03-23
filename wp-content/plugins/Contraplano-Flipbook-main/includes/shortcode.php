<?php
if (! defined('ABSPATH')) exit;

class Flipbook_Shortcode
{

    public static function init()
    {
        add_shortcode('contraplano_flipbook', [__CLASS__, 'renderizar']);
    }

    public static function encolar_scripts()
    {
        global $post;
        if (! $post || ! has_shortcode($post->post_content, 'contraplano_flipbook')) {
            return;
        }
        self::hacer_encolado();
    }

    public static function hacer_encolado()
    {
        wp_enqueue_style('dashicons');

        // PDF.js
        wp_enqueue_script('pdfjs', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', [], '3.11.174', true);

        // LIBRERÍA DE ANIMACIÓN (Fundamental)
        wp_enqueue_script(
            'st-page-flip',
            'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js',
            [],
            '2.0.7',
            true
        );

        wp_enqueue_script(
            'flipbook-viewer',
            FLIPBOOK_URL . 'assets/js/viewer.js',
            ['pdfjs', 'st-page-flip', 'jquery'],
            FLIPBOOK_VERSION,
            true
        );

        wp_enqueue_style('flipbook-viewer', FLIPBOOK_URL . 'assets/css/viewer.css', [], FLIPBOOK_VERSION);
    }

    public static function renderizar($atts)
    {
        $atts = shortcode_atts(['id' => 0, 'width' => '100%', 'height' => '900px'], $atts);
        $flipbook_id = intval($atts['id']);

        if (! $flipbook_id) return '<p>ID de Flipbook no válido.</p>';

        $pdf_url = get_post_meta($flipbook_id, '_flipbook_pdf_url', true);
        $paginas = get_post_meta($flipbook_id, '_flipbook_pdf_pages', true);

        if (! $pdf_url) return '<p>Flipbook sin PDF.</p>';

        self::hacer_encolado();

        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';
        $overlays = $wpdb->get_results($wpdb->prepare("SELECT * FROM $tabla WHERE flipbook_id = %d", $flipbook_id), ARRAY_A);

        foreach ($overlays as &$ov) {
            $ov['datos'] = json_decode($ov['datos'], true);
        }

        $config_numeros = get_post_meta($flipbook_id, '_flipbook_config_numeros', true) ?: [
            'colorNumero' => '#666666',
            'colorFondo' => '#FFFFFF',
            'opacidadFondo' => 0.8,
            'posicion' => 'inferior-derecha',
            'tamanio' => 14,
            'mostrar' => true,
        ];

        $datos_js = [
            'pdf_url' => $pdf_url,
            'paginas' => intval($paginas),
            'overlays' => $overlays,
            'config_numeros' => $config_numeros,
        ];

        wp_localize_script('flipbook-viewer', 'flipbookData_' . $flipbook_id, $datos_js);

        ob_start();
?>
        <div class="flipbook-contenedor"
            id="fb-<?php echo $flipbook_id; ?>"
            data-flipbook-id="<?php echo $flipbook_id; ?>"
            style="width: <?php echo esc_attr($atts['width']); ?>; height: <?php echo esc_attr($atts['height']); ?>; display: flex; flex-direction: column;">

            <div class="flipbook-canvas-wrapper" id="canvas-wrapper-<?php echo $flipbook_id; ?>">
                <div id="flipbook-render-<?php echo $flipbook_id; ?>"></div>
                <div class="flipbook-overlays" id="capa-overlays-<?php echo $flipbook_id; ?>"></div>
            </div>

            <div class="flipbook-barra">
                <div class="barra-grupo">
                    <button class="flipbook-btn flipbook-anterior">❮ Anterior</button>
                    <span class="flipbook-info-pagina">
                        <span class="flipbook-pagina-actual">1</span> / <?php echo $paginas; ?>
                    </span>
                    <button class="flipbook-btn flipbook-siguiente">Siguiente ❯</button>
                </div>
            </div>
        </div>
<?php
        return ob_get_clean();
    }
}
