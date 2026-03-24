<?php
/**
 * Archivo de diagnóstico — debug.php
 * Acceder a: sitio.local/wp-content/plugins/Contraplano-Flipbook-main/debug.php?flipbook_id=37345
 * 
 * Este archivo verificará:
 * 1. Si la tabla de overlays existe
 * 2. Cuántos overlays hay para el flipbook
 * 3. Si los metadatos se están guardando correctamente
 * 4. Si el shortcode recupera los datos
 */

// No incluir WordPress — lectura directa
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Conectar a la BD directamente
require_once dirname(__FILE__) . '/../../../../../../wp-config.php';
require_once dirname(__FILE__) . '/../../../../../../wp-load.php';

$flipbook_id = intval($_GET['flipbook_id'] ?? 0);

if (!$flipbook_id) {
    die('❌ No se especificó flipbook_id. Usa ?flipbook_id=37345');
}

global $wpdb;

echo "<h2>Diagnóstico del Flipbook ID: $flipbook_id</h2>";

// 1. Verificar que el post existe
$post = get_post($flipbook_id);
if (!$post) {
    die("❌ El post de flipbook $flipbook_id no existe.");
}
echo "<p>✅ Post existe: <strong>$post->post_title</strong></p>";

// 2. Verificar metadatos del PDF
$pdf_url = get_post_meta($flipbook_id, '_flipbook_pdf_url', true);
$pdf_pages = get_post_meta($flipbook_id, '_flipbook_pdf_pages', true);
echo "<p><strong>PDF URL:</strong> " . ($pdf_url ? '✅ ' . esc_html($pdf_url) : '❌ No encontrada') . "</p>";
echo "<p><strong>PDF Páginas:</strong> " . ($pdf_pages ? "✅ $pdf_pages" : '❌ No encontrado') . "</p>";

// 3. Verificar tabla de overlays
$tabla = $wpdb->prefix . 'flipbook_overlays';
$tabla_existe = $wpdb->get_var("SHOW TABLES LIKE '$tabla'");
echo "<p><strong>Tabla de overlays:</strong> " . ($tabla_existe ? "✅ Existe" : '❌ No existe') . "</p>";

// 4. Contar overlays
if ($tabla_existe) {
    $total_overlays = $wpdb->get_var(
        $wpdb->prepare("SELECT COUNT(*) FROM $tabla WHERE flipbook_id = %d", $flipbook_id)
    );
    echo "<p><strong>Total de overlays:</strong> $total_overlays</p>";
    
    // 5. Mostrar todos los overlays
    if ($total_overlays > 0) {
        $overlays = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM $tabla WHERE flipbook_id = %d ORDER BY id ASC", $flipbook_id),
            ARRAY_A
        );
        echo "<table border='1' style='border-collapse:collapse; margin-top:20px;'>";
        echo "<tr style='background:#ccc;'>";
        echo "<th>ID</th><th>Página</th><th>Tipo</th><th>Posición</th><th>Tamaño</th>";
        echo "</tr>";
        foreach ($overlays as $ov) {
            $datos = json_decode($ov['datos'], true);
            echo "<tr>";
            echo "<td>{$ov['id']}</td>";
            echo "<td>{$ov['pagina']}</td>";
            echo "<td>{$ov['tipo']}</td>";
            echo "<td>L:{$ov['pos_left']}% T:{$ov['pos_top']}%</td>";
            echo "<td>W:{$ov['ancho']}% H:{$ov['alto']}%</td>";
            echo "</tr>";
        }
        echo "</table>";
    }
}

// 6. Verificar configuración de números
$config_numeros = get_post_meta($flipbook_id, '_flipbook_config_numeros', true);
echo "<p><strong>Configuración de números:</strong> " . ($config_numeros ? '✅ Existe' : '❌ No existe') . "</p>";
if ($config_numeros) {
    echo "<pre>";
    print_r($config_numeros);
    echo "</pre>";
}

// 7. Simular lo que el shortcode recupera
echo "<h3>Lo que el shortcode recuperaría:</h3>";
$datos_shortcode = [
    'pdf_url'        => $pdf_url,
    'paginas'        => intval($pdf_pages),
    'flipbook_id'    => $flipbook_id,
    'config_numeros' => $config_numeros ?: [
        'colorNumero'   => '#666666',
        'colorFondo'    => '#FFFFFF',
        'opacidadFondo' => 0.8,
        'posicion'      => 'inferior-derecha',
        'tamanio'       => 14,
        'mostrar'       => true,
    ],
];

echo "<pre>";
print_r($datos_shortcode);
echo "</pre>";

echo "<hr>";
echo "<p><small>Si los datos no aparecen aquí, significa que NO se están guardando en la BD.</small></p>";
?>
