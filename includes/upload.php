<?php
// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Clase Flipbook_Upload
 *
 * Gestiona la subida y compresión de archivos PDF.
 * Es la única clase que escribe archivos PDF.
 * todas las operaciones de subida pasan por aquí.
 *
 * Flujo principal:
 *   1. Validar que el archivo sea un PDF real
 *   2. Crear el directorio de destino si no existe
 *   3. Intentar comprimir con Ghostscript(Tiene herramientas de compresion de archivos PDF)
 *   4. Si falla, copiar el archivo original sin comprimir
 *   5. Contar las páginas del PDF resultante
 *   6. Retornar url, path, filename, pages y size
 */
class Flipbook_Upload {

    /**
     * Procesa la subida de un archivo PDF.
     *
     * @param  array       
     * @return array|WP_Error         
     */
    public static function procesar_pdf( $archivo ) {

        // Verificar que se recibió un archivo
        if ( empty( $archivo['tmp_name'] ) ) {
            return new WP_Error( 'sin_archivo', 'No se recibió ningún archivo.' );
        }

        // Validar tipo MIME real del archivo (no solo la extensión)
        $finfo = finfo_open( FILEINFO_MIME_TYPE );
        $mime  = finfo_file( $finfo, $archivo['tmp_name'] );
        finfo_close( $finfo );

        if ( $mime !== 'application/pdf' ) {
            return new WP_Error( 'tipo_invalido', 'Solo se permiten archivos PDF.' );
        }

        // Preparar directorio de destino
        $dir_subidas  = wp_upload_dir();
        $directorio   = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-pdfs/';
        $url_base     = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-pdfs/';

        if ( ! file_exists( $directorio ) ) {
            wp_mkdir_p( $directorio );
            // Proteger el directorio de listados públicos
            file_put_contents( $directorio . '.htaccess', 'Options -Indexes' );
        }

        // Generar nombre de archivo único y sanitizado
        $nombre_archivo = sanitize_file_name(
            wp_unique_filename( $directorio, $archivo['name'] )
        );
        $ruta_destino = $directorio . $nombre_archivo;

        // Intentar comprimir con Ghostscript; si falla, mover el archivo tal cual
        $comprimido = self::comprimir_con_ghostscript( $archivo['tmp_name'], $ruta_destino );

        if ( ! $comprimido ) {
            if ( ! move_uploaded_file( $archivo['tmp_name'], $ruta_destino ) ) {
                return new WP_Error( 'error_guardado', 'No se pudo guardar el archivo PDF.' );
            }
        }

        return [
            'url'      => $url_base . $nombre_archivo,
            'path'     => $ruta_destino,
            'filename' => $nombre_archivo,
            'paginas'  => self::contar_paginas( $ruta_destino ),
            'tamanio'  => filesize( $ruta_destino ),
        ];
    }

    /**
     * Intenta comprimir el PDF usando Ghostscript.
     * Si el archivo resultante es más grande que el original,
     * descarta la compresión y copia el original.
     *
     * @param  string $entrada  Ruta del archivo original (temporal).
     * @param  string $salida   Ruta donde guardar el PDF comprimido.
     * @return bool             true si la operación fue exitosa.
     */
    private static function comprimir_con_ghostscript( $entrada, $salida ) {

        // Verificar si Ghostscript está disponible en el servidor
        exec( 'which gs 2>/dev/null', $out, $codigo );
        if ( $codigo !== 0 ) {
            exec( 'which ghostscript 2>/dev/null', $out2, $codigo2 );
            if ( $codigo2 !== 0 ) return false;  // Ghostscript no disponible
            $binario = 'ghostscript';
        } else {
            $binario = 'gs';
        }

        $entrada_esc = escapeshellarg( $entrada );
        $salida_esc  = escapeshellarg( $salida );

        // Ejecutar compresión con perfil /ebook (balance calidad/tamaño)
        $comando = "$binario -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 "
                 . "-dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH "
                 . "-sOutputFile=$salida_esc $entrada_esc 2>/dev/null";

        exec( $comando, $resultado, $codigo_salida );

        // Si falló o no se creó el archivo, reportar error
        if ( $codigo_salida !== 0 || ! file_exists( $salida ) ) {
            return false;
        }

        // Si el comprimido es más grande, descartar y usar el original
        if ( filesize( $salida ) > filesize( $entrada ) ) {
            unlink( $salida );
            copy( $entrada, $salida );
        }

        return true;
    }

    /**
     * Obtiene el número de páginas de un PDF.
     * Intenta con pdfinfo primero; si no está disponible,
     * busca objetos /Type /Page en el contenido binario.
     *
     * @param  string $ruta  Ruta absoluta al archivo PDF.
     * @return int           Número de páginas (mínimo 1).
     */
    public static function contar_paginas( $ruta ) {

        // Método 1: pdfinfo (poppler-utils)
        exec( 'which pdfinfo 2>/dev/null', $out, $codigo );
        if ( $codigo === 0 ) {
            exec( 'pdfinfo ' . escapeshellarg( $ruta ) . ' 2>/dev/null', $lineas );
            foreach ( $lineas as $linea ) {
                if ( preg_match( '/^Pages:\s+(\d+)/i', $linea, $coincidencia ) ) {
                    return (int) $coincidencia[1];
                }
            }
        }

        // Método 2 (fallback): contar objetos /Page en el binario
        $contenido = file_get_contents( $ruta );
        preg_match_all( '/\/Type\s*\/Page\b/', $contenido, $coincidencias );
        $total = count( $coincidencias[0] );

        return $total > 0 ? $total : 1;
    }
}
