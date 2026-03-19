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

        error_log( '📥 [FLIPBOOK] Procesando PDF: ' . print_r( $archivo, true ) );

        // Validar tipo MIME real del archivo (no solo la extensión)
        $finfo = finfo_open( FILEINFO_MIME_TYPE );
        $mime  = finfo_file( $finfo, $archivo['tmp_name'] );
        finfo_close( $finfo );

        error_log( '📥 [FLIPBOOK] MIME detectado: ' . $mime );

        if ( $mime !== 'application/pdf' ) {
            return new WP_Error( 'tipo_invalido', 'Solo se permiten archivos PDF. Se detectó: ' . $mime );
        }

        // Preparar directorio de destino
        $dir_subidas  = wp_upload_dir();
        error_log( '📥 [FLIPBOOK] wp_upload_dir: ' . print_r( $dir_subidas, true ) );

        $directorio   = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-pdfs/';
        $url_base     = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-pdfs/';

        error_log( '📥 [FLIPBOOK] Directorio destino: ' . $directorio );
        error_log( '📥 [FLIPBOOK] URL base: ' . $url_base );

        // Crear directorio si no existe
        if ( ! file_exists( $directorio ) ) {
            error_log( '📥 [FLIPBOOK] Directorio no existe, creando...' );
            if ( ! wp_mkdir_p( $directorio ) ) {
                error_log( '❌ [FLIPBOOK] Error: No se pudo crear el directorio' );
                return new WP_Error( 'directorio_error', 'No se pudo crear el directorio de PDFs: ' . $directorio );
            }
            error_log( '✓ [FLIPBOOK] Directorio creado exitosamente' );
            file_put_contents( $directorio . '.htaccess', 'Options -Indexes' );
        }

        // Verificar que el directorio es escribible
        if ( ! is_writable( $directorio ) ) {
            error_log( '❌ [FLIPBOOK] Error: Directorio no tiene permisos de escritura: ' . $directorio );
            return new WP_Error( 'permisos_error', 'El directorio de PDFs no tiene permisos de escritura: ' . $directorio );
        }

        error_log( '✓ [FLIPBOOK] Directorio escribible, continuando...' );

        // Generar nombre de archivo único y sanitizado
        $nombre_archivo = sanitize_file_name(
            wp_unique_filename( $directorio, $archivo['name'] )
        );
        $ruta_destino = $directorio . $nombre_archivo;

        error_log( '📥 [FLIPBOOK] Ruta destino final: ' . $ruta_destino );

        // Guardar el archivo (sin intentar comprimir)
        if ( ! move_uploaded_file( $archivo['tmp_name'], $ruta_destino ) ) {
            error_log( '❌ [FLIPBOOK] Error: move_uploaded_file falló' );
            return new WP_Error( 'error_guardado', 'No se pudo guardar el archivo PDF en: ' . $ruta_destino );
        }

        error_log( '✓ [FLIPBOOK] move_uploaded_file exitoso' );

        // Verificar que el archivo se guardó correctamente
        if ( ! file_exists( $ruta_destino ) ) {
            error_log( '❌ [FLIPBOOK] Error: Archivo no existe después de move_uploaded_file' );
            return new WP_Error( 'verificacion_error', 'El archivo PDF se intentó guardar pero no se encontró en: ' . $ruta_destino );
        }

        error_log( '✓ [FLIPBOOK] Archivo verificado, existe en: ' . $ruta_destino );

        $tamanio_archivo = filesize( $ruta_destino );
        $paginas = self::contar_paginas( $ruta_destino );

        error_log( '✓ [FLIPBOOK] PDF procesado exitosamente. Páginas: ' . $paginas . ', Tamaño: ' . $tamanio_archivo );
        
        return [
            'url'      => $url_base . $nombre_archivo,
            'path'     => $ruta_destino,
            'filename' => $nombre_archivo,
            'paginas'  => $paginas,
            'tamanio'  => $tamanio_archivo,
        ];
    }

    /**
     * Intenta comprimir el PDF usando Ghostscript.
     * NOTA: Actualmente esta función se salta y el PDF se guarda sin comprimir
     * para asegurar compatibilidad con todos los servidores.
     *
     * @param  string $entrada  Ruta del archivo original (temporal).
     * @param  string $salida   Ruta donde guardar el PDF comprimido.
     * @return bool             true si la operación fue exitosa.
     */
    private static function comprimir_con_ghostscript( $entrada, $salida ) {
        // Deshabilitado por compatibilidad. Los PDFs se guardan sin comprimir.
        return false;
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

    /**
     * Agrega páginas en blanco a un PDF existente.
     * Intenta varios métodos según las herramientas disponibles:
     *   1. Primero: ImageMagick convert (crea un PDF con páginas en blanco y lo concatena)
     *   2. Segundo: Ghostscript (genera blanco y concatena PDF)
     *   3. Tercero: PHP puro usando FPDF/TCPDF si está disponible
     *
     * @param  string $ruta_pdf      Ruta absoluta al PDF existente.
     * @param  int    $numero_paginas Número de páginas en blanco a agregar.
     * @return bool                   true si se agregaron las páginas, false si falló.
     */
    public static function agregar_paginas_a_pdf( $ruta_pdf, $numero_paginas ) {

        if ( ! file_exists( $ruta_pdf ) ) {
            return false;
        }

        if ( $numero_paginas < 1 ) {
            return false;
        }

        // Crear directorio temporal si no existe
        $temp_dir = wp_upload_dir()['basedir'] . '/flipbook-temp/';
        if ( ! file_exists( $temp_dir ) ) {
            wp_mkdir_p( $temp_dir );
        }

        // Métodos a intentar
        $metodos = [
            'convert',       // ImageMagick
            'ghostscript',   // Ghostscript
            'gs',           // Ghostscript (comando corto)
        ];

        foreach ( $metodos as $metodo ) {
            switch ( $metodo ) {
                case 'convert':
                    if ( self::agregar_paginas_convert( $ruta_pdf, $numero_paginas, $temp_dir ) ) {
                        return true;
                    }
                    break;

                case 'ghostscript':
                case 'gs':
                    if ( self::agregar_paginas_ghostscript( $ruta_pdf, $numero_paginas, $temp_dir, $metodo ) ) {
                        return true;
                    }
                    break;
            }
        }

        return false;
    }

    /**
     * Agrega páginas usando ImageMagick convert.
     * Este es el método más confiable y ampliamente disponible.
     *
     * @param  string $ruta_pdf       Ruta al PDF existente.
     * @param  int    $numero_paginas Número de páginas a agregar.
     * @param  string $temp_dir       Directorio temporal.
     * @return bool                   true si fue exitoso.
     */
    private static function agregar_paginas_convert( $ruta_pdf, $numero_paginas, $temp_dir ) {

        // Verificar que convert esté disponible
        exec( 'which convert 2>/dev/null', $out, $codigo );
        if ( $codigo !== 0 ) {
            return false;
        }

        $pdf_esc = escapeshellarg( $ruta_pdf );
        $temp_blanco = $temp_dir . 'blanco_' . time() . '.pdf';
        $temp_combinado = $temp_dir . 'combinado_' . time() . '.pdf';

        // Crear PDF con páginas en blanco usando ImageMagick
        $comando_blanco = "convert -size 612x792 xc:white " .
                         str_repeat( "xc:white ", $numero_paginas - 1 ) .
                         escapeshellarg( $temp_blanco ) . " 2>/dev/null";

        exec( $comando_blanco, $resultado, $codigo_blanco );

        if ( $codigo_blanco !== 0 || ! file_exists( $temp_blanco ) ) {
            return false;
        }

        // Combinar PDFs: original + páginas en blanco
        $comando_combinar = "convert $pdf_esc " . escapeshellarg( $temp_blanco ) . 
                           " " . escapeshellarg( $temp_combinado ) . " 2>/dev/null";

        exec( $comando_combinar, $resultado, $codigo_combinar );

        if ( $codigo_combinar !== 0 || ! file_exists( $temp_combinado ) ) {
            @unlink( $temp_blanco );
            return false;
        }

        // Reemplazar el PDF original con el combinado
        if ( ! rename( $temp_combinado, $ruta_pdf ) ) {
            @unlink( $temp_blanco );
            @unlink( $temp_combinado );
            return false;
        }

        // Limpiar temporal
        @unlink( $temp_blanco );

        return true;
    }

    /**
     * Agrega páginas usando Ghostscript.
     * Es un método alternativo si ImageMagick no está disponible.
     *
     * @param  string $ruta_pdf       Ruta al PDF existente.
     * @param  int    $numero_paginas Número de páginas a agregar.
     * @param  string $temp_dir       Directorio temporal.
     * @param  string $binario        Nombre del binario ('ghostscript' o 'gs').
     * @return bool                   true si fue exitoso.
     */
    private static function agregar_paginas_ghostscript( $ruta_pdf, $numero_paginas, $temp_dir, $binario ) {

        // Verificar disponibilidad
        exec( "which $binario 2>/dev/null", $out, $codigo );
        if ( $codigo !== 0 ) {
            return false;
        }

        $pdf_esc = escapeshellarg( $ruta_pdf );
        $temp_blanco = $temp_dir . 'blanco_gs_' . time() . '.pdf';
        $temp_combinado = $temp_dir . 'combinado_gs_' . time() . '.pdf';

        // Crear PDF con páginas en blanco usando Ghostscript
        $comando_blanco = "$binario -sDEVICE=pdfwrite -dNOPAUSE -dBATCH " .
                         "-dDEVICEWIDTHPOINTS=612 -dDEVICEHEIGHTPOINTS=792 " .
                         "-sOutputFile=" . escapeshellarg( $temp_blanco ) .
                         " -c \"[ /CIDFont <<>> /FontDescriptor << >> /W [ 0 [ 500 ] ] >> /Type /Font /Subtype /Type0 /Encoding /Identity-H /DescendantFonts [ << >> ] /ToUnicode << >> >> ] forall " .
                         str_repeat( "showpage ", $numero_paginas ) . 
                         "\" 2>/dev/null";

        exec( $comando_blanco, $resultado, $codigo_blanco );

        if ( $codigo_blanco !== 0 || ! file_exists( $temp_blanco ) ) {
            return false;
        }

        // Combinar con qpdf si está disponible, sino con Ghostscript
        exec( 'which qpdf 2>/dev/null', $out_qpdf, $codigo_qpdf );

        if ( $codigo_qpdf === 0 ) {
            // Usar qpdf para combinar
            $comando_combinar = "qpdf --empty --pages $pdf_esc " . 
                               escapeshellarg( $temp_blanco ) . " -- " .
                               escapeshellarg( $temp_combinado ) . " 2>/dev/null";
        } else {
            // Fallback: usar Ghostscript para combinar
            $comando_combinar = "$binario -sDEVICE=pdfwrite -dNOPAUSE -dBATCH " .
                               "-sOutputFile=" . escapeshellarg( $temp_combinado ) .
                               " $pdf_esc " . escapeshellarg( $temp_blanco ) . " 2>/dev/null";
        }

        exec( $comando_combinar, $resultado, $codigo_combinar );

        if ( $codigo_combinar !== 0 || ! file_exists( $temp_combinado ) ) {
            @unlink( $temp_blanco );
            return false;
        }

        // Reemplazar original
        if ( ! rename( $temp_combinado, $ruta_pdf ) ) {
            @unlink( $temp_blanco );
            @unlink( $temp_combinado );
            return false;
        }

        @unlink( $temp_blanco );
        return true;
    }
}
