<?php
// Temporal diagnostic script for audio overlays
require 'wp-load.php';

global $wpdb;
$table = $wpdb->prefix . 'flipbook_overlays';

$audios = $wpdb->get_results("SELECT id, flipbook_id, pagina, tipo, datos, pos_left, pos_top, ancho, alto FROM $table WHERE tipo='audio' ORDER BY flipbook_id, pagina");

echo "=== AUDIOS DESCUADRADOS ===\n\n";

if (empty($audios)) {
    echo "No hay audios registrados.\n";
} else {
    foreach ($audios as $audio) {
        $datos = json_decode($audio->datos, true);
        echo "ID: {$audio->id} | Flipbook: {$audio->flipbook_id} | Página: {$audio->pagina}\n";
        echo "  Posición: Left={$audio->pos_left}px, Top={$audio->pos_top}px\n";
        echo "  Tamaño: {$audio->ancho}px x {$audio->alto}px\n";
        echo "  Datos: " . json_encode($datos) . "\n";
        echo "---\n";
    }
}

// Listar archivos MP3 y tamaño
echo "\n=== ARCHIVOS MP3 ===\n\n";
$upload_dir = wp_upload_dir();
$audio_dir = $upload_dir['basedir'] . '/flipbook-audio/';

if (is_dir($audio_dir)) {
    $files = scandir($audio_dir);
    foreach ($files as $file) {
        if (substr($file, -4) === '.mp3') {
            $filepath = $audio_dir . $file;
            $size = filesize($filepath);
            $size_mb = round($size / (1024 * 1024), 2);
            echo "$file: {$size_mb} MB ({$size} bytes)\n";
        }
    }
}
?>
