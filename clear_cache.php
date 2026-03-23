<?php
// Limpiador de caché de WordPress
define( 'WP_USE_THEMES', false );
require( './wp-load.php' );

// Limpiar todos los cachés
wp_cache_flush();

// Limpiar caché de objetos
if ( function_exists( 'wp_cache_flush_group' ) ) {
    wp_cache_flush_group( 'flipbook' );
}

// Si hay plugins de caché, limpiarlos también
if ( function_exists( 'litespeed_purge_all' ) ) {
    litespeed_purge_all();
}

if ( function_exists( 'wp_rocket_clean_domain' ) ) {
    wp_rocket_clean_domain();
}

if ( class_exists( 'WP_Super_Cache' ) ) {
    wp_cache_flush();
}

echo "Caché limpiado correctamente.";
?>
