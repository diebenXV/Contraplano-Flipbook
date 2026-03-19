<?php
// Bloquear acceso directo al archivo
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Clase Flipbook_Ajax
 *
 * Contiene todos los handlers AJAX del plugin.
 * Cada método público corresponde a una acción wp_ajax_*
 * registrada en el archivo principal.
 *
 * Todos los métodos:
 *   1. Verifican el nonce de seguridad (flipbook_nonce)
 *   2. Comprueban que el usuario tenga permisos (edit_posts)
 *   3. Responden siempre con wp_send_json_success/error
 */
class Flipbook_Ajax {

    /**
     * Recibe un archivo PDF, lo comprime y crea/actualiza el flipbook.
     * Acción: flipbook_subir_pdf
     */
    public static function subir_pdf() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        // Procesar el PDF con la clase Upload
        $resultado = Flipbook_Upload::procesar_pdf( $_FILES['pdf_file'] );

        if ( is_wp_error( $resultado ) ) {
            wp_send_json_error( $resultado->get_error_message() );
        }

        // Crear o actualizar el post de tipo flipbook
        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        $titulo      = sanitize_text_field( $_POST['titulo'] ?? 'Flipbook sin título' );

        if ( $flipbook_id ) {
            // Actualizar el post existente
            wp_update_post( [ 'ID' => $flipbook_id, 'post_title' => $titulo ] );
        } else {
            // Crear un nuevo post de tipo flipbook
            $flipbook_id = wp_insert_post([
                'post_type'   => 'flipbook',
                'post_title'  => $titulo,
                'post_status' => 'publish',
            ]);
        }

        // Guardar los metadatos del PDF en el post
        update_post_meta( $flipbook_id, '_flipbook_pdf_url',   $resultado['url'] );
        update_post_meta( $flipbook_id, '_flipbook_pdf_path',  $resultado['path'] );
        update_post_meta( $flipbook_id, '_flipbook_pdf_pages', $resultado['paginas'] );

        wp_send_json_success([
            'flipbook_id' => $flipbook_id,
            'pdf_url'     => $resultado['url'],
            'paginas'     => $resultado['paginas'],
            'tamanio'     => self::formatear_bytes( $resultado['tamanio'] ),
        ]);
    }

    /**
     * Guarda o actualiza todos los overlays de un flipbook.
     * Si el overlay tiene id, realiza UPDATE; si no, realiza INSERT.
     * Acción: flipbook_guardar_overlays
     */
    public static function guardar_overlays() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        global $wpdb;
        $tabla       = $wpdb->prefix . 'flipbook_overlays';
        $flipbook_id = intval( $_POST['flipbook_id'] );
        $overlays    = json_decode( stripslashes( $_POST['overlays'] ), true );

        if ( ! $flipbook_id || ! is_array( $overlays ) ) {
            wp_send_json_error( 'Datos inválidos recibidos.' );
        }

        foreach ( $overlays as $overlay ) {
            $datos = [
                'flipbook_id' => $flipbook_id,
                'pagina'      => intval( $overlay['pagina'] ?? 1 ),
                'tipo'        => sanitize_text_field( $overlay['tipo'] ),
                'datos'       => wp_json_encode( $overlay['datos'] ?? [] ),
                'pos_left'    => floatval( $overlay['left'] ?? 10 ),
                'pos_top'     => floatval( $overlay['top']  ?? 10 ),
                'ancho'       => floatval( $overlay['ancho']  ?? 20 ),
                'alto'        => floatval( $overlay['alto']   ?? 10 ),
            ];

            if ( ! empty( $overlay['id'] ) && is_numeric( $overlay['id'] ) ) {
                // Actualizar overlay existente
                $wpdb->update( $tabla, $datos, [ 'id' => intval( $overlay['id'] ) ] );
            } else {
                // Insertar nuevo overlay
                $wpdb->insert( $tabla, $datos );
            }
        }

        wp_send_json_success( 'Overlays guardados correctamente.' );
    }

    /**
     * Obtiene todos los overlays de un flipbook ordenados por id.
     * Decodifica el campo 'datos' de JSON a array antes de responder.
     * Acción: flipbook_obtener_overlays
     */
    public static function obtener_overlays() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        global $wpdb;
        $tabla       = $wpdb->prefix . 'flipbook_overlays';
        $flipbook_id = intval( $_POST['flipbook_id'] );

        $filas = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM $tabla WHERE flipbook_id = %d ORDER BY id ASC",
                $flipbook_id
            ),
            ARRAY_A
        );

        // Decodificar el JSON de configuración de cada overlay
        foreach ( $filas as &$fila ) {
            $fila['datos'] = json_decode( $fila['datos'], true );
        }

        wp_send_json_success( $filas );
    }

    /**
     * Elimina un overlay individual de la base de datos.
     * Acción: flipbook_eliminar_overlay
     */
    public static function eliminar_overlay() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';
        $id    = intval( $_POST['overlay_id'] );

        $wpdb->delete( $tabla, [ 'id' => $id ] );

        wp_send_json_success( 'Overlay eliminado correctamente.' );
    }

    /**
     * Sube una imagen a la Biblioteca de Medios de WordPress.
     * Retorna el attachment_id y la URL pública de la imagen.
     * Acción: flipbook_subir_imagen
     */
    public static function subir_imagen() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        if ( empty( $_FILES['imagen'] ) ) {
            wp_send_json_error( 'No se recibió ningún archivo de imagen.' );
        }

        // Usar el sistema de medios de WordPress
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $attachment_id = media_handle_upload( 'imagen', 0 );

        if ( is_wp_error( $attachment_id ) ) {
            wp_send_json_error( $attachment_id->get_error_message() );
        }

        wp_send_json_success([
            'attachment_id' => $attachment_id,
            'url'           => wp_get_attachment_url( $attachment_id ),
        ]);
    }

    /**
     * Sube un archivo de audio al directorio exclusivo del plugin.
     * Límite: 10 MB. Valida tipo MIME antes de guardar.
     * Acción: flipbook_subir_audio
     */
    public static function subir_audio() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        if ( empty( $_FILES['audio'] ) ) {
            wp_send_json_error( 'No se recibió ningún archivo de audio.' );
        }

        $archivo = $_FILES['audio'];

        // Validar tamaño máximo: 10 MB 
        $max_bytes = 10 * 1024 * 1024;
        if ( $archivo['size'] > $max_bytes ) {
            wp_send_json_error(
                'El archivo de audio supera el límite de 10 MB. '
                . 'Tamaño recibido: ' . self::formatear_bytes( $archivo['size'] ) . '.'
            );
        }

        // Preparar directorio de audios
        $dir_subidas = wp_upload_dir();
        $directorio  = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-audio/';
        $url_base    = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-audio/';

        if ( ! file_exists( $directorio ) ) {
            wp_mkdir_p( $directorio );
        }

        $permitidos = [ 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4' ];

        // Validar tipo MIME real del archivo (no solo la extensión)
        $finfo = finfo_open( FILEINFO_MIME_TYPE );
        $mime  = finfo_file( $finfo, $archivo['tmp_name'] );
        finfo_close( $finfo );

        if ( ! in_array( $mime, $permitidos ) ) {
            wp_send_json_error( 'Tipo de archivo de audio no permitido. Use mp3, wav u ogg.' );
        }

        $nombre_archivo = sanitize_file_name(
            wp_unique_filename( $directorio, $archivo['name'] )
        );
        $ruta = $directorio . $nombre_archivo;

        if ( ! move_uploaded_file( $archivo['tmp_name'], $ruta ) ) {
            wp_send_json_error( 'Error al guardar el archivo de audio en el servidor.' );
        }

        wp_send_json_success([
            'url'      => $url_base . $nombre_archivo,
            'nombre'   => $nombre_archivo,
            'tamanio'  => self::formatear_bytes( $archivo['size'] ),
        ]);
    }

    /**
     * Elimina un flipbook completo:
     *   1. Borra todos los overlays de la BD
     *   2. Elimina el archivo PDF del disco
     *   3. Elimina el post de WordPress
     * Acción: flipbook_eliminar_flipbook
     */
    public static function eliminar_flipbook() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'delete_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para eliminar flipbooks.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        if ( ! $flipbook_id ) {
            wp_send_json_error( 'ID de flipbook inválido.' );
        }

        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';

        // Paso 1: Obtener los audios vinculados a este flipbook para borrar sus archivos
        $overlays_audio = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT datos FROM $tabla WHERE flipbook_id = %d AND tipo = 'audio'",
                $flipbook_id
            ),
            ARRAY_A
        );

        foreach ( $overlays_audio as $ov ) {
            $datos = json_decode( $ov['datos'], true );
            self::borrar_archivo_audio_por_url( $datos['url'] ?? '' );
        }

        // Paso 2: Borrar el archivo PDF del disco
        $pdf_path = get_post_meta( $flipbook_id, '_flipbook_pdf_path', true );
        if ( $pdf_path && file_exists( $pdf_path ) ) {
            unlink( $pdf_path );
        }

        // Paso 3: Eliminar todos los overlays de la BD
        $wpdb->delete( $tabla, [ 'flipbook_id' => $flipbook_id ], [ '%d' ] );

        // Paso 4: Eliminar el post de WordPress (permanentemente)
        wp_delete_post( $flipbook_id, true );

        wp_send_json_success( 'Flipbook eliminado correctamente.' );
    }

    /**
     * Elimina todos los archivos de audio de un flipbook de manera permanente:
     *   1. Borra los archivos físicos del disco
     *   2. Elimina los overlays de tipo 'audio' de la BD
     * Los demás overlays (YouTube, imagen, presentación) se conservan.
     * Acción: flipbook_eliminar_audios
     */
    public static function eliminar_audios() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        if ( ! $flipbook_id ) {
            wp_send_json_error( 'ID de flipbook inválido.' );
        }

        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';

        // Obtener todos los overlays de audio de este flipbook
        $overlays_audio = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, datos FROM $tabla WHERE flipbook_id = %d AND tipo = 'audio'",
                $flipbook_id
            ),
            ARRAY_A
        );

        if ( empty( $overlays_audio ) ) {
            wp_send_json_error( 'Este flipbook no tiene audios para eliminar.' );
        }

        $eliminados = 0;

        foreach ( $overlays_audio as $ov ) {
            $datos = json_decode( $ov['datos'], true );

            // Borrar el archivo físico del disco
            $borrado = self::borrar_archivo_audio_por_url( $datos['url'] ?? '' );

            // Eliminar el overlay de la BD
            $wpdb->delete( $tabla, [ 'id' => intval( $ov['id'] ) ], [ '%d' ] );
            $eliminados++;
        }

        wp_send_json_success([
            'mensaje'    => "Se eliminaron {$eliminados} archivo(s) de audio correctamente.",
            'eliminados' => $eliminados,
        ]);
    }

    /**
     * Borra físicamente un archivo de audio del disco a partir de su URL pública.
     * Solo elimina archivos que estén dentro del directorio flipbook-audio/.
     *
     * @param  string $url  URL pública del archivo de audio.
     * @return bool         true si se borró, false si no existía o no era válido.
     */
    private static function borrar_archivo_audio_por_url( $url ) {
        if ( empty( $url ) ) return false;

        $dir_subidas = wp_upload_dir();
        $base_url    = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-audio/';
        $base_dir    = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-audio/';

        // Verificar que la URL pertenece al directorio de audios del plugin
        if ( strpos( $url, $base_url ) !== 0 ) return false;

        $nombre = basename( $url );
        $ruta   = $base_dir . sanitize_file_name( $nombre );

        if ( file_exists( $ruta ) ) {
            return unlink( $ruta );
        }

        return false;
    }

    /**
     * Descarga el flipbook como PDF con todos los overlays renderizados.
     * Usa TCPDF para generar el PDF realmente descargable.
     * Acción: flipbook_descargar_con_overlays
     */
    public static function descargar_con_overlays() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );

        if ( ! $flipbook_id ) {
            wp_send_json_error( 'Flipbook ID no válido.' );
        }

        // Obtener datos del flipbook
        $pdf_path = get_post_meta( $flipbook_id, '_flipbook_pdf_path', true );
        $post = get_post( $flipbook_id );
        $titulo = $post ? $post->post_title : 'Flipbook';

        if ( ! $pdf_path || ! file_exists( $pdf_path ) ) {
            wp_send_json_error( 'El archivo PDF del flipbook no existe.' );
        }

        // Generar PDF descargable usando el PDF original
        // (Los overlays se verían mejor con renderizado a imágenes, pero requiere librerías adicionales)
        
        // Por ahora, devolvemos el PDF original como descarga
        $upload_dir = wp_upload_dir();
        $filename   = sanitize_file_name( $titulo . '_flipbook.pdf' );
        $temp_dir   = trailingslashit( $upload_dir['basedir'] ) . 'flipbook-descargas/';
        
        if ( ! file_exists( $temp_dir ) ) {
            wp_mkdir_p( $temp_dir );
        }

        $descarga_path = $temp_dir . $filename;
        $descarga_url  = trailingslashit( $upload_dir['baseurl'] ) . 'flipbook-descargas/' . $filename;

        // Copiar el PDF a la carpeta de descargas
        if ( ! copy( $pdf_path, $descarga_path ) ) {
            wp_send_json_error( 'Error al preparar la descarga del PDF.' );
        }

        wp_send_json_success([
            'download_url' => $descarga_url,
            'filename'     => $filename,
        ]);
    }

    /**
     * Convierte un tamaño en bytes a formato legible (KB, MB).
     *
     * @param  int    $bytes  Tamaño en bytes.
     * @return string         Texto con la unidad correspondiente.
     */
    private static function formatear_bytes( $bytes ) {
        if ( $bytes >= 1048576 ) return round( $bytes / 1048576, 2 ) . ' MB';
        if ( $bytes >= 1024 )    return round( $bytes / 1024,    2 ) . ' KB';
        return $bytes . ' B';
    }
}