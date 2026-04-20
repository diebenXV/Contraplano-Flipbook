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
     * Guarda la configuración de números de página en los metadatos del flipbook.
     * Acción: flipbook_guardar_config_numeros
     */
    public static function guardar_config_numeros() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        $config      = json_decode( stripslashes( $_POST['config'] ?? '{}' ), true );

        if ( ! $flipbook_id || ! is_array( $config ) ) {
            wp_send_json_error( 'Datos inválidos.' );
        }

        // Sanitizar y validar cada campo de la configuración
        $posiciones_validas = [
            'inferior-derecha', 'inferior-izquierda', 'inferior-centro',
            'superior-derecha', 'superior-izquierda', 'superior-centro',
            'centro', 'personalizada',
        ];

        $config_limpia = [
            'colorNumero'   => sanitize_hex_color( $config['colorNumero']  ?? '#666666' ) ?: '#666666',
            'colorFondo'    => sanitize_hex_color( $config['colorFondo']   ?? '#00FFFF' ) ?: '#00FFFF',
            'opacidadFondo' => floatval( $config['opacidadFondo'] ?? 1 ),
            'mostrarFondo'  => (bool) ( $config['mostrarFondo'] ?? true ),
            'posicion'      => in_array( $config['posicion'] ?? 'inferior-centro', $posiciones_validas )
                                ? $config['posicion'] : 'inferior-centro',
            'tamanio'       => intval( $config['tamanio'] ?? 14 ),
            'mostrar'       => (bool) ( $config['mostrar'] ?? true ),
            'customX'       => floatval( $config['customX'] ?? 50 ),
            'customY'       => floatval( $config['customY'] ?? 95 ),
        ];

        // Guardar overrides por página si existen
        if ( ! empty( $config['porPagina'] ) && is_array( $config['porPagina'] ) ) {
            $porPagina = [];
            foreach ( $config['porPagina'] as $pag => $pp ) {
                if ( ! is_array( $pp ) ) continue;
                $pagSanitizada = [];
                if ( isset( $pp['colorNumero'] ) )   $pagSanitizada['colorNumero']   = sanitize_hex_color( $pp['colorNumero'] ) ?: '#666666';
                if ( isset( $pp['colorFondo'] ) )     $pagSanitizada['colorFondo']    = sanitize_hex_color( $pp['colorFondo'] ) ?: '#00FFFF';
                if ( isset( $pp['opacidadFondo'] ) )  $pagSanitizada['opacidadFondo'] = floatval( $pp['opacidadFondo'] );
                if ( isset( $pp['mostrarFondo'] ) )   $pagSanitizada['mostrarFondo']  = (bool) $pp['mostrarFondo'];
                if ( ! empty( $pagSanitizada ) ) $porPagina[ intval( $pag ) ] = $pagSanitizada;
            }
            if ( ! empty( $porPagina ) ) $config_limpia['porPagina'] = $porPagina;
        }

        update_post_meta( $flipbook_id, '_flipbook_config_numeros', $config_limpia );

        wp_send_json_success( 'Configuración de números guardada.' );
    }

    /**
     * Recupera la configuración de números de página del flipbook.
     * Retorna valores por defecto si no existe configuración guardada.
     * Acción: flipbook_cargar_config_numeros
     */
    public static function cargar_config_numeros() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );

        if ( ! $flipbook_id ) {
            wp_send_json_error( 'ID de flipbook inválido.' );
        }

        $config = get_post_meta( $flipbook_id, '_flipbook_config_numeros', true );

        // Si no hay configuración guardada, devolver valores por defecto
        if ( ! $config || ! is_array( $config ) ) {
            $config = [
                'colorNumero'   => '#666666',
                'colorFondo'    => '#00FFFF',
                'opacidadFondo' => 1,
                'mostrarFondo'  => true,
                'posicion'      => 'inferior-derecha',
                'tamanio'       => 14,
                'mostrar'       => true,
            ];
        }

        wp_send_json_success( $config );
    }

    /**
     * Actualiza solo el título del post flipbook.
     * Se llama desde el botón "Guardar cambios" del editor
     * para que el nombre se refleje en el listado de flipbooks.
     * Acción: flipbook_guardar_titulo
     */
    public static function guardar_titulo() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso para realizar esta acción.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        $titulo      = sanitize_text_field( $_POST['titulo'] ?? '' );

        if ( ! $flipbook_id || ! $titulo ) {
            wp_send_json_error( 'Datos inválidos.' );
        }

        $resultado = wp_update_post([
            'ID'         => $flipbook_id,
            'post_title' => $titulo,
        ]);

        if ( is_wp_error( $resultado ) ) {
            wp_send_json_error( $resultado->get_error_message() );
        }

        wp_send_json_success( 'Título actualizado.' );
    }

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

        // Validar tamaño máximo: 10 MB = 10 * 1024 * 1024 bytes
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

        // MIME types aceptados. Incluye variantes que finfo puede devolver para m4a:
        // audio/mp4 (estándar), audio/x-m4a, audio/mp4a-latm, audio/aac, y también
        // video/mp4 / application/octet-stream (algunos servidores devuelven esto para .m4a).
        $permitidos = [
            'audio/mpeg', 'audio/mp3',
            'audio/wav', 'audio/x-wav', 'audio/wave',
            'audio/ogg', 'application/ogg',
            'audio/mp4', 'audio/x-m4a', 'audio/mp4a-latm', 'audio/aac',
            'video/mp4',
        ];

        // Validar tipo MIME real del archivo (no solo la extensión)
        $finfo = finfo_open( FILEINFO_MIME_TYPE );
        $mime  = finfo_file( $finfo, $archivo['tmp_name'] );
        finfo_close( $finfo );

        // Fallback: si el MIME detectado es octet-stream o no está en la lista,
        // permitir según extensión del archivo (mp3, wav, ogg, m4a, aac).
        $ext = strtolower( pathinfo( $archivo['name'], PATHINFO_EXTENSION ) );
        $ext_permitidas = [ 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'mp4' ];

        if ( ! in_array( $mime, $permitidos, true ) && ! in_array( $ext, $ext_permitidas, true ) ) {
            wp_send_json_error( 'Tipo de archivo de audio no permitido. Use mp3, wav, ogg o m4a. (MIME detectado: ' . $mime . ')' );
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

    /**
     * Inserta una página (imagen renderizada) en un flipbook.
     * Guarda la imagen en el servidor y registra la inserción en post_meta.
     * Acción: flipbook_insertar_pagina
     */
    public static function insertar_pagina() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso.' );
        }

        $flipbook_id      = intval( $_POST['flipbook_id'] ?? 0 );
        $posicion          = sanitize_text_field( $_POST['posicion'] ?? 'despues' );
        $pagina_flipbook   = intval( $_POST['pagina_flipbook'] ?? 1 );

        if ( ! $flipbook_id || empty( $_FILES['imagen'] ) ) {
            wp_send_json_error( 'Datos incompletos.' );
        }

        // Guardar la imagen
        $dir_subidas = wp_upload_dir();
        $directorio  = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-pages/';
        $url_base    = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-pages/';

        if ( ! file_exists( $directorio ) ) {
            wp_mkdir_p( $directorio );
        }

        $archivo    = $_FILES['imagen'];
        $nombre     = 'fb' . $flipbook_id . '_inserted_' . time() . '_' . wp_rand( 100, 999 ) . '.jpg';
        $destino    = $directorio . $nombre;

        if ( ! move_uploaded_file( $archivo['tmp_name'], $destino ) ) {
            wp_send_json_error( 'Error al guardar la imagen.' );
        }

        $url_imagen = $url_base . $nombre;

        // Calcular idx (posición en el pageMap actual)
        $idx = $pagina_flipbook - 1;
        if ( $idx < 0 ) $idx = 0;
        if ( $posicion === 'despues' ) $idx++;
        $desde_pagina = $idx + 1; // 1-based

        // Actualizar page_order: insertar la nueva página en la posición correcta
        $page_order = self::obtener_page_order( $flipbook_id );
        if ( $idx > count( $page_order ) ) $idx = count( $page_order );
        array_splice( $page_order, $idx, 0, [ [ 'type' => 'inserted', 'url' => $url_imagen ] ] );
        update_post_meta( $flipbook_id, '_flipbook_page_order', $page_order );

        // Actualizar conteo de páginas
        $paginas_actual = intval( get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true ) );
        update_post_meta( $flipbook_id, '_flipbook_pdf_pages', $paginas_actual + 1 );

        // Desplazar overlays
        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';
        $wpdb->query( $wpdb->prepare(
            "UPDATE $tabla SET pagina = pagina + 1 WHERE flipbook_id = %d AND pagina >= %d",
            $flipbook_id,
            $desde_pagina
        ) );

        // Desplazar claves de porPagina en la config de números de página
        self::desplazar_porPagina( $flipbook_id, $desde_pagina, +1 );

        wp_send_json_success( [
            'mensaje'      => 'Página insertada correctamente.',
            'url'          => $url_imagen,
            'total'        => $paginas_actual + 1,
            'desde_pagina' => $desde_pagina,
        ] );
    }

    /**
     * Elimina una página del flipbook.
     * Para páginas insertadas: elimina el archivo de imagen y la entrada del meta.
     * Para páginas del PDF: las marca como ocultas en un meta separado.
     * Acción: flipbook_eliminar_pagina
     */
    public static function eliminar_pagina() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso.' );
        }

        $flipbook_id  = intval( $_POST['flipbook_id'] ?? 0 );
        $pagina_index = intval( $_POST['pagina_index'] ?? -1 );
        $tipo_pagina  = sanitize_text_field( $_POST['tipo_pagina'] ?? '' );

        if ( ! $flipbook_id || $pagina_index < 0 ) {
            wp_send_json_error( 'Datos incompletos.' );
        }

        // Obtener page_order actual
        $page_order = self::obtener_page_order( $flipbook_id );

        if ( ! isset( $page_order[ $pagina_index ] ) ) {
            wp_send_json_error( 'Índice de página inválido.' );
        }

        $entry = $page_order[ $pagina_index ];

        if ( $entry['type'] === 'inserted' ) {
            // Eliminar archivo físico de la página insertada
            $dir_subidas = wp_upload_dir();
            $ruta = str_replace( $dir_subidas['baseurl'], $dir_subidas['basedir'], $entry['url'] );
            if ( file_exists( $ruta ) ) unlink( $ruta );
        } else {
            // Página del PDF: marcar como oculta
            $hidden = get_post_meta( $flipbook_id, '_flipbook_hidden_pages', true );
            if ( ! is_array( $hidden ) ) $hidden = [];
            $hidden[] = $entry['num'];
            update_post_meta( $flipbook_id, '_flipbook_hidden_pages', $hidden );
        }

        // Remover del page_order y guardar
        array_splice( $page_order, $pagina_index, 1 );
        update_post_meta( $flipbook_id, '_flipbook_page_order', $page_order );

        // Decrementar conteo
        $total = intval( get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true ) );
        if ( $total > 0 ) update_post_meta( $flipbook_id, '_flipbook_pdf_pages', $total - 1 );

        // Desplazar overlays: la página eliminada estaba en posición pagina_index (0-based).
        // Los overlays de esa página se eliminan, los de páginas posteriores se corren -1.
        $pagina_eliminada = $pagina_index + 1; // 1-based
        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';

        // Eliminar overlays de la página borrada
        $wpdb->delete( $tabla, [
            'flipbook_id' => $flipbook_id,
            'pagina'      => $pagina_eliminada,
        ] );

        // Desplazar overlays de páginas posteriores
        $wpdb->query( $wpdb->prepare(
            "UPDATE $tabla SET pagina = pagina - 1 WHERE flipbook_id = %d AND pagina > %d",
            $flipbook_id,
            $pagina_eliminada
        ) );

        // Desplazar claves de porPagina en la config de números de página
        self::desplazar_porPagina( $flipbook_id, $pagina_eliminada, -1 );

        wp_send_json_success( [
            'mensaje'          => 'Página eliminada.',
            'pagina_eliminada' => $pagina_eliminada,
        ] );
    }

    /**
     * Desplaza las claves del objeto porPagina en la config de números de página
     * cuando se inserta o elimina una página.
     *
     * @param int $flipbook_id  ID del flipbook.
     * @param int $desde        Número de página (1-based) a partir del cual desplazar.
     * @param int $direccion    +1 para inserción (empujar hacia adelante), -1 para eliminación.
     */
    private static function desplazar_porPagina( $flipbook_id, $desde, $direccion ) {
        $config = get_post_meta( $flipbook_id, '_flipbook_config_numeros', true );

        if ( ! is_array( $config ) || empty( $config['porPagina'] ) || ! is_array( $config['porPagina'] ) ) {
            return;
        }

        $porPagina = $config['porPagina'];
        $nuevo     = [];

        if ( $direccion === 1 ) {
            // Inserción: claves >= $desde se incrementan en 1
            foreach ( $porPagina as $pag => $val ) {
                $pag = intval( $pag );
                if ( $pag >= $desde ) {
                    $nuevo[ $pag + 1 ] = $val;
                } else {
                    $nuevo[ $pag ] = $val;
                }
            }
        } else {
            // Eliminación: eliminar la clave $desde, claves > $desde se decrementan en 1
            foreach ( $porPagina as $pag => $val ) {
                $pag = intval( $pag );
                if ( $pag === $desde ) {
                    continue; // eliminar esta clave
                } elseif ( $pag > $desde ) {
                    $nuevo[ $pag - 1 ] = $val;
                } else {
                    $nuevo[ $pag ] = $val;
                }
            }
        }

        $config['porPagina'] = $nuevo;
        update_post_meta( $flipbook_id, '_flipbook_config_numeros', $config );
    }

    /**
     * Obtiene el page_order de un flipbook.
     * Si no existe, lo reconstruye desde el formato legado (inserted_pages + hidden_pages).
     *
     * @param  int   $flipbook_id  ID del flipbook.
     * @return array               Array de entradas [{type, num?, url?}, ...]
     */
    private static function obtener_page_order( $flipbook_id ) {
        $page_order = get_post_meta( $flipbook_id, '_flipbook_page_order', true );
        if ( is_array( $page_order ) && ! empty( $page_order ) ) {
            return $page_order;
        }

        // Reconstruir desde formato legado
        $hidden = get_post_meta( $flipbook_id, '_flipbook_hidden_pages', true );
        if ( ! is_array( $hidden ) ) $hidden = [];

        $inserted = get_post_meta( $flipbook_id, '_flipbook_inserted_pages', true );
        if ( ! is_array( $inserted ) ) $inserted = [];

        // Obtener el número real de páginas del PDF (sin ajustar por inserciones)
        $total_meta = intval( get_post_meta( $flipbook_id, '_flipbook_pdf_pages', true ) );
        // Calcular páginas PDF originales: total_meta es el total ajustado por inserciones/eliminaciones
        // Necesitamos el número original: total_meta - count(inserted) + count(hidden)
        $pdf_original = $total_meta - count( $inserted ) + count( $hidden );
        if ( $pdf_original < 1 ) $pdf_original = $total_meta;

        $page_order = [];
        for ( $i = 1; $i <= $pdf_original; $i++ ) {
            if ( ! in_array( $i, $hidden ) ) {
                $page_order[] = [ 'type' => 'pdf', 'num' => $i ];
            }
        }

        // Insertar en orden inverso (formato legado con posicion/pagina_flipbook)
        $sorted = $inserted;
        usort( $sorted, function( $a, $b ) {
            return ( $b['pagina_flipbook'] ?? 0 ) - ( $a['pagina_flipbook'] ?? 0 );
        });
        foreach ( $sorted as $ins ) {
            $idx = ( $ins['pagina_flipbook'] ?? 1 ) - 1;
            if ( $idx < 0 ) $idx = 0;
            if ( $idx > count( $page_order ) ) $idx = count( $page_order );
            if ( ( $ins['posicion'] ?? '' ) === 'despues' ) $idx++;
            array_splice( $page_order, $idx, 0, [ [ 'type' => 'inserted', 'url' => $ins['url'] ] ] );
        }

        return $page_order;
    }

    /**
     * Mueve una página de una posición a otra dentro del flipbook.
     * Actualiza page_order, overlays y porPagina.
     * Si la página es del PDF, la oculta y la convierte en insertada con imagen.
     * Acción: flipbook_mover_pagina
     */
    public static function mover_pagina() {
        check_ajax_referer( 'flipbook_nonce', 'nonce' );

        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'No tienes permiso.' );
        }

        $flipbook_id = intval( $_POST['flipbook_id'] ?? 0 );
        $src_page    = intval( $_POST['src_page'] ?? 0 );    // 1-based
        $dest_page   = intval( $_POST['dest_page'] ?? 0 );   // 1-based en el pageMap actual
        $posicion    = sanitize_text_field( $_POST['posicion'] ?? 'antes' );

        if ( ! $flipbook_id || ! $src_page || ! $dest_page ) {
            wp_send_json_error( 'Datos incompletos.' );
        }

        $srcIdx     = $src_page - 1;
        $rawDestIdx = $dest_page - 1;
        if ( $posicion === 'despues' ) $rawDestIdx++;
        $adjDestIdx = $rawDestIdx;
        if ( $rawDestIdx > $srcIdx ) $adjDestIdx--;

        if ( $adjDestIdx === $srcIdx ) {
            wp_send_json_error( 'La página ya está en esa posición.' );
        }

        // Obtener page_order actual
        $page_order = self::obtener_page_order( $flipbook_id );

        if ( ! isset( $page_order[ $srcIdx ] ) ) {
            wp_send_json_error( 'Índice de página origen inválido.' );
        }

        $movedEntry = $page_order[ $srcIdx ];
        $movedUrl   = $movedEntry['url'] ?? '';

        // Si es una página del PDF, necesita la imagen renderizada y se oculta
        if ( $movedEntry['type'] === 'pdf' ) {
            if ( empty( $_FILES['imagen'] ) ) {
                wp_send_json_error( 'Se requiere la imagen de la página PDF.' );
            }

            $dir_subidas = wp_upload_dir();
            $directorio  = trailingslashit( $dir_subidas['basedir'] ) . 'flipbook-pages/';
            $url_base    = trailingslashit( $dir_subidas['baseurl'] ) . 'flipbook-pages/';
            if ( ! file_exists( $directorio ) ) wp_mkdir_p( $directorio );

            $archivo = $_FILES['imagen'];
            $nombre  = 'fb' . $flipbook_id . '_moved_' . time() . '_' . wp_rand( 100, 999 ) . '.jpg';
            $destino = $directorio . $nombre;

            if ( ! move_uploaded_file( $archivo['tmp_name'], $destino ) ) {
                wp_send_json_error( 'Error al guardar la imagen.' );
            }

            $movedUrl = $url_base . $nombre;

            // Ocultar la página del PDF
            $hidden = get_post_meta( $flipbook_id, '_flipbook_hidden_pages', true );
            if ( ! is_array( $hidden ) ) $hidden = [];
            $hidden[] = $movedEntry['num'];
            update_post_meta( $flipbook_id, '_flipbook_hidden_pages', $hidden );

            $movedEntry = [ 'type' => 'inserted', 'url' => $movedUrl ];
        }

        // Mover en page_order: quitar de la posición original e insertar en la nueva
        array_splice( $page_order, $srcIdx, 1 );
        if ( $adjDestIdx > count( $page_order ) ) $adjDestIdx = count( $page_order );
        array_splice( $page_order, $adjDestIdx, 0, [ $movedEntry ] );
        update_post_meta( $flipbook_id, '_flipbook_page_order', $page_order );

        // Calcular newPage (1-based)
        $newPage = $adjDestIdx + 1;

        // Actualizar overlays con SQL
        global $wpdb;
        $tabla = $wpdb->prefix . 'flipbook_overlays';

        // Paso 1: Marcar overlays de la página origen con valor temporal negativo
        $wpdb->query( $wpdb->prepare(
            "UPDATE $tabla SET pagina = -%d WHERE flipbook_id = %d AND pagina = %d",
            $src_page, $flipbook_id, $src_page
        ) );

        // Paso 2: Desplazar overlays intermedios
        if ( $src_page < $newPage ) {
            $wpdb->query( $wpdb->prepare(
                "UPDATE $tabla SET pagina = pagina - 1 WHERE flipbook_id = %d AND pagina > %d AND pagina <= %d",
                $flipbook_id, $src_page, $newPage
            ) );
        } else {
            $wpdb->query( $wpdb->prepare(
                "UPDATE $tabla SET pagina = pagina + 1 WHERE flipbook_id = %d AND pagina >= %d AND pagina < %d",
                $flipbook_id, $newPage, $src_page
            ) );
        }

        // Paso 3: Asignar página destino a los overlays marcados
        $wpdb->query( $wpdb->prepare(
            "UPDATE $tabla SET pagina = %d WHERE flipbook_id = %d AND pagina = -%d",
            $newPage, $flipbook_id, $src_page
        ) );

        // Actualizar porPagina en la config de números de página
        $config = get_post_meta( $flipbook_id, '_flipbook_config_numeros', true );
        if ( is_array( $config ) && ! empty( $config['porPagina'] ) && is_array( $config['porPagina'] ) ) {
            $pp = $config['porPagina'];
            $ppNuevo = [];
            foreach ( $pp as $pag => $val ) {
                $pag = intval( $pag );
                if ( $pag === $src_page ) {
                    $ppNuevo[ $newPage ] = $val;
                } elseif ( $src_page < $newPage && $pag > $src_page && $pag <= $newPage ) {
                    $ppNuevo[ $pag - 1 ] = $val;
                } elseif ( $src_page > $newPage && $pag >= $newPage && $pag < $src_page ) {
                    $ppNuevo[ $pag + 1 ] = $val;
                } else {
                    $ppNuevo[ $pag ] = $val;
                }
            }
            $config['porPagina'] = $ppNuevo;
            update_post_meta( $flipbook_id, '_flipbook_config_numeros', $config );
        }

        wp_send_json_success( [
            'mensaje'      => 'Página movida correctamente.',
            'nueva_pagina' => $newPage,
            'url'          => $movedUrl,
        ] );
    }
}
