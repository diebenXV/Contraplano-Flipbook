/**
 * compresion.js — Contraplano Flipbook
 *
 * Helpers de compresión cliente-side para imágenes y audio.
 * Se ejecutan en el navegador ANTES de subir al servidor, así:
 *   • El archivo que llega al servidor ya es pequeño → upload rápido.
 *   • El flipbook carga los archivos más rápido en el visor.
 *   • No requiere instalar ffmpeg ni extensiones PHP adicionales.
 *
 * Uso:
 *   ContraplanoCompresion.comprimirImagen(file).then(blob => { ... });
 *   ContraplanoCompresion.comprimirAudio(file).then(blob => { ... });
 *
 * Ambas funciones retornan una Promise con el Blob comprimido.
 * Si la compresión falla o hace que el archivo crezca, devuelve el original.
 */
(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────
    // IMÁGENES
    // ─────────────────────────────────────────────────────────────────
    //
    // Estrategia: redimensionar con Canvas + re-comprimir a JPEG.
    // Parámetros elegidos para un flipbook web:
    //   • 1600px lado mayor: suficiente para cualquier retina sin exceso.
    //   • Calidad JPEG 0.78: balance perceptiblemente idéntico con ahorro 60-80%.
    //   • Respeta proporciones, no upscaling (si la imagen ya es chica, no crece).
    //
    // Resultado típico: 4-5 MB → 200-400 KB.

    var IMAGEN_LADO_MAX = 1600;
    var IMAGEN_CALIDAD  = 0.78;
    // Archivos ya pequeños (menos de este umbral) se suben tal cual:
    // comprimir una imagen ya optimizada suele dar resultado peor.
    var IMAGEN_MIN_BYTES_COMPRIMIR = 150 * 1024; // 150 KB

    function comprimirImagen(file, opciones) {
        opciones = opciones || {};
        var ladoMax = opciones.ladoMax || IMAGEN_LADO_MAX;
        var calidad = (typeof opciones.calidad === 'number') ? opciones.calidad : IMAGEN_CALIDAD;

        // PNG con transparencia NO debería re-codificarse a JPEG (fondos negros en transparencias).
        // Solo comprimimos imágenes opacas. Para PNGs, el usuario ya decidió usar PNG; lo
        // respetamos y solo redimensionamos manteniendo PNG.
        var esTransparente = (file.type === 'image/png' || file.type === 'image/gif');

        // Si es muy pequeña, no tiene sentido re-procesar.
        if (file.size < IMAGEN_MIN_BYTES_COMPRIMIR) {
            return Promise.resolve(file);
        }

        return cargarImagen(file).then(function (img) {
            var w = img.naturalWidth;
            var h = img.naturalHeight;
            if (!w || !h) return file;

            var lado = Math.max(w, h);
            var escala = (lado > ladoMax) ? (ladoMax / lado) : 1;
            var nw = Math.round(w * escala);
            var nh = Math.round(h * escala);

            // Si no hace falta redimensionar Y ya está en un formato compreso,
            // sólo re-comprimir tiene sentido para reducir calidad JPEG.
            var canvas = document.createElement('canvas');
            canvas.width = nw;
            canvas.height = nh;
            var ctx = canvas.getContext('2d');

            // Si NO es transparente, pintar fondo blanco antes (evita bordes raros
            // cuando se exporta a JPEG una imagen con canal alpha que no se usa).
            if (!esTransparente) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, nw, nh);
            }

            ctx.drawImage(img, 0, 0, nw, nh);

            var mimeSalida = esTransparente ? 'image/png' : 'image/jpeg';
            var calidadSalida = esTransparente ? undefined : calidad;

            return new Promise(function (resolve) {
                canvas.toBlob(function (blob) {
                    if (!blob) { resolve(file); return; }
                    // Si la compresión hizo el archivo MÁS GRANDE (puede pasar con
                    // PNGs muy optimizados), devolvemos el original para no empeorar.
                    if (blob.size >= file.size) {
                        resolve(file);
                        return;
                    }
                    // Copiar nombre si se puede (algunos navegadores permiten set name sobre Blob
                    // creando un File; otros no — quien consume debe pasarle un nombre al FormData).
                    try {
                        var nuevo = new File([blob], renombrarExtension(file.name, mimeSalida), { type: mimeSalida });
                        resolve(nuevo);
                    } catch (e) {
                        resolve(blob);
                    }
                }, mimeSalida, calidadSalida);
            });
        }).catch(function () {
            return file; // Fallback silencioso: si algo falla, se sube el original.
        });
    }

    function cargarImagen(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
            img.src = url;
        });
    }

    function renombrarExtension(nombre, mime) {
        var ext = mime === 'image/png' ? '.png' : '.jpg';
        var sinExt = nombre.replace(/\.[^.]+$/, '');
        return sinExt + ext;
    }

    // ─────────────────────────────────────────────────────────────────
    // AUDIO
    // ─────────────────────────────────────────────────────────────────
    //
    // Estrategia: decodificar con WebAudio API → recodificar MP3 con lamejs.
    //
    // ¿Por qué MP3 de salida aunque el input sea m4a?
    //   - Codificar AAC/m4a en el browser requiere WebAssembly pesado (FFmpeg/fdk-aac).
    //   - MP3 cubre todos los navegadores sin dependencias extra (~156KB lamejs).
    //   - A 96 kbps MP3 stereo la diferencia perceptual con m4a es mínima.
    //
    // ¿Por qué el INPUT m4a funciona sin problema?
    //   - decodeAudioData() de WebAudio API decodifica m4a/AAC nativamente en
    //     Chrome, Safari, Firefox y Edge (todos los navegadores modernos).
    //
    // Parámetros:
    //   • 96 kbps: buen balance para m4a típico (narración + música/ambiente).
    //     A 64 la voz suena bien pero la música se degrada. 96 es el punto dulce.
    //   • Se preserva stereo si el source es stereo (música/ambiente se escucha
    //     mejor). Si es mono, se codifica mono (ahorra ancho de banda).
    //   • Sample rate: se mantiene el del archivo original.
    //
    // Resultado típico para un m4a del iPhone (AAC stereo 128-256 kbps):
    //   Input 10 MB → Output MP3 3-4 MB (60-70% reducción).
    // Para un WAV sin comprimir:
    //   Input 30 MB → Output MP3 3-4 MB (85% reducción).

    var AUDIO_KBPS = 96;
    var AUDIO_MIN_BYTES_COMPRIMIR = 256 * 1024; // 256 KB: <= esto, no compensa

    function comprimirAudio(file, opciones) {
        opciones = opciones || {};
        var kbps = opciones.kbps || AUDIO_KBPS;
        var forzarMono = !!opciones.mono; // opt-in, por defecto preservamos stereo

        if (typeof global.lamejs === 'undefined' || !global.lamejs.Mp3Encoder) {
            return Promise.resolve(file);
        }

        if (file.size < AUDIO_MIN_BYTES_COMPRIMIR) {
            return Promise.resolve(file);
        }

        var AudioCtxClass = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtxClass) return Promise.resolve(file);

        return file.arrayBuffer().then(function (arrayBuffer) {
            var ctx = new AudioCtxClass();
            return ctx.decodeAudioData(arrayBuffer).then(function (audioBuffer) {
                try { ctx.close(); } catch (e) {}

                var n = audioBuffer.length;
                var sampleRate = audioBuffer.sampleRate;
                var canalesSource = audioBuffer.numberOfChannels;
                var canalesSalida = (canalesSource >= 2 && !forzarMono) ? 2 : 1;

                // Helper para convertir Float32 → Int16 con clipping.
                function f32ToI16(src) {
                    var out = new Int16Array(src.length);
                    for (var i = 0; i < src.length; i++) {
                        var s = src[i];
                        if (s > 1) s = 1; else if (s < -1) s = -1;
                        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    return out;
                }

                var leftI16, rightI16;
                if (canalesSalida === 1) {
                    // Mono: si source es stereo, promediamos L+R.
                    if (canalesSource === 1) {
                        leftI16 = f32ToI16(audioBuffer.getChannelData(0));
                    } else {
                        var L = audioBuffer.getChannelData(0);
                        var R = audioBuffer.getChannelData(1);
                        var mix = new Float32Array(n);
                        for (var i = 0; i < n; i++) mix[i] = (L[i] + R[i]) * 0.5;
                        leftI16 = f32ToI16(mix);
                    }
                } else {
                    // Stereo
                    leftI16  = f32ToI16(audioBuffer.getChannelData(0));
                    rightI16 = f32ToI16(audioBuffer.getChannelData(1));
                }

                var encoder = new global.lamejs.Mp3Encoder(canalesSalida, sampleRate, kbps);
                var bloque = 1152; // múltiplo estándar usado por LAME
                var mp3Data = [];
                var offset = 0;
                while (offset < leftI16.length) {
                    var fin = Math.min(offset + bloque, leftI16.length);
                    var chunkL = leftI16.subarray(offset, fin);
                    var buf;
                    if (canalesSalida === 1) {
                        buf = encoder.encodeBuffer(chunkL);
                    } else {
                        var chunkR = rightI16.subarray(offset, fin);
                        buf = encoder.encodeBuffer(chunkL, chunkR);
                    }
                    if (buf.length > 0) mp3Data.push(buf);
                    offset = fin;
                }
                var cola = encoder.flush();
                if (cola.length > 0) mp3Data.push(cola);

                var blob = new Blob(mp3Data, { type: 'audio/mpeg' });

                // Si el MP3 quedó más grande (source ya muy comprimido), devolver original.
                if (blob.size >= file.size) return file;

                try {
                    var nombre = file.name.replace(/\.[^.]+$/, '') + '.mp3';
                    return new File([blob], nombre, { type: 'audio/mpeg' });
                } catch (e) {
                    return blob;
                }
            }).catch(function () {
                try { ctx.close(); } catch (e) {}
                return file;
            });
        }).catch(function () {
            return file;
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // EXPORT
    // ─────────────────────────────────────────────────────────────────
    global.ContraplanoCompresion = {
        comprimirImagen: comprimirImagen,
        comprimirAudio:  comprimirAudio,
    };

})(window);
