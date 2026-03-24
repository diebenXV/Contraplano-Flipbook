(function () {
    'use strict';

    document.querySelectorAll('.flipbook-contenedor').forEach(async function (contenedor) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos = window['flipbookData_' + flipbookId];
        if (!datos) return;

        const canvasWrapper = contenedor.querySelector('.flipbook-canvas-wrapper');
        let capaOverlays = contenedor.querySelector('.flipbook-overlays');
        const paginaActualEl = contenedor.querySelector('.flipbook-pagina-actual');

        let pageFlip = null;
        let audioActual = null;

        // 1. Configurar PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        try {
            const pdf = await pdfjsLib.getDocument(datos.pdf_url).promise;
            const images = [];

            // 2. Renderizar páginas (Calidad optimizada)
            for (let i = 1; i <= datos.paginas; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.8));
            }

            // Limpiar y preparar contenedor, pero PRESERVAR la capa de overlays
            const targetDiv = document.createElement('div');
            targetDiv.id = 'flip-target-' + flipbookId;
            canvasWrapper.innerHTML = '';
            canvasWrapper.appendChild(targetDiv);

            // Recrear la capa de overlays después de limpiar
            const nuevaCapaOverlays = document.createElement('div');
            nuevaCapaOverlays.className = 'flipbook-overlays';
            nuevaCapaOverlays.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; pointer-events:none;';
            canvasWrapper.appendChild(nuevaCapaOverlays);

            // Actualizar referencia
            capaOverlays = nuevaCapaOverlays;

            const target = document.getElementById('flip-target-' + flipbookId);

            // 3. Inicializar Animación
            pageFlip = new St.PageFlip(target, {
                width: 550,
                height: 733,
                size: "stretch",
                showCover: true,
                maxShadowOpacity: 0.5,
                mobileScrollSupport: true
            });

            pageFlip.loadFromImages(images);

            pageFlip.on('flip', (e) => {
                const numLeft = e.data + 1;  // Página izquierda (1-based)
                if (paginaActualEl) paginaActualEl.textContent = numLeft;
                // Renderizar solo los overlays de AMBAS páginas visibles correctamente
                renderizarContenidoMultimedia([numLeft, numLeft + 1], datos.overlays);
                setTimeout(ajustarCapaOverlays, 50);
            });

            // --- NUEVAS FUNCIONES DE NAVEGACIÓN ---

            // 1. Sincronizar el input cuando se pasa de página
            pageFlip.on('flip', (e) => {
                const num = e.data + 1;
                const inputPag = contenedor.querySelector('.flipbook-input-pagina');
                if (inputPag) inputPag.value = num;

                if (paginaActualEl) paginaActualEl.textContent = num;
                renderizarContenidoMultimedia(num, datos.overlays);
                setTimeout(ajustarCapaOverlays, 100);
            });

            // 2. Botón Inicio
            const btnInicio = contenedor.querySelector('.flipbook-inicio');
            if (btnInicio) btnInicio.onclick = () => pageFlip.flip(0);

            // 3. Botón Fin
            const btnFin = contenedor.querySelector('.flipbook-fin');
            if (btnFin) btnFin.onclick = () => pageFlip.flip(datos.paginas - 1);

            // 4. Salto por número escrito (Input)
            const inputPagina = contenedor.querySelector('.flipbook-input-pagina');
            if (inputPagina) {
                inputPagina.onchange = (e) => {
                    let p = parseInt(e.target.value);
                    if (!isNaN(p) && p > 0 && p <= datos.paginas) {
                        pageFlip.flip(p - 1);
                    } else {
                        e.target.value = pageFlip.getCurrentPageIndex() + 1;
                    }
                };
            }

            // 5. Flechas del teclado
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') pageFlip.flipPrev();
                if (e.key === 'ArrowRight') pageFlip.flipNext();
            });


            // Navegación
            contenedor.querySelector('.flipbook-anterior').onclick = () => pageFlip.flipPrev();
            contenedor.querySelector('.flipbook-siguiente').onclick = () => pageFlip.flipNext();

            // Carga inicial - mostrar spread inicial (páginas 1 y 2)
            setTimeout(() => {
                renderizarContenidoMultimedia([1, 2], datos.overlays);
                ajustarCapaOverlays();
            }, 500);

        } catch (e) { console.error("Error al cargar flipbook:", e); }

        // Sincronizar overlays al redimensionar la ventana
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const bookElement = canvasWrapper.querySelector('.stPageFlip');
                if (bookElement) {
                    ajustarCapaOverlays();
                }
            }, 200);
        });

        function ajustarCapaOverlays() {
            const bookElement = canvasWrapper.querySelector('.stPageFlip');
            if (bookElement && capaOverlays) {
                capaOverlays.style.width = bookElement.offsetWidth + 'px';
                capaOverlays.style.height = bookElement.offsetHeight + 'px';
                capaOverlays.style.display = 'block';
            }
        }

        // --- FUNCIÓN RECUPERADA: Renderiza Imágenes, Videos, Links y Audios ---
        function renderizarContenidoMultimedia(paginas, lista) {
            capaOverlays.innerHTML = '';
            if (audioActual) { audioActual.pause(); audioActual = null; }

            // Convertir a array si no lo es
            if (!Array.isArray(paginas)) {
                paginas = [paginas];
            }

            const bookElement = canvasWrapper.querySelector('.stPageFlip');

            // Obtener dimensiones reales midiendo el elemento PageFlip
            let spreadW = 550;
            let H = 733;

            if (bookElement && bookElement.offsetWidth > 0) {
                // Medir el elemento real de PageFlip (el wrapper visual)
                spreadW = bookElement.offsetWidth;
                H = bookElement.offsetHeight;

                console.log('🎯 PageFlip medido:', { spreadW, H });
            }

            // El width que obtenemos es del SPREAD COMPLETO (dos páginas lado a lado)
            // Cada página individual tiene spreadW/2 de ancho
            const pageWidth = spreadW / 2;

            console.log('📏 Dimensiones por página:', { pageWidth, H });

            // Filtrar overlays de ambas páginas visibles
            // IMPORTANTE: SUMAR 1 a los números de página porque el editor guarda los overlays en la página anterior
            // (página 1 en la BD = página 2 en el PDF real, porque hay una página blanca inicial)
            const items = lista ? lista.filter(o => {
                const pageAjustada = parseInt(o.pagina) + 1;
                return paginas.includes(pageAjustada);
            }) : [];

            console.log('📋 Overlays a renderizar:', items.length, 'páginas', paginas);

            items.forEach(ov => {
                const pageNum = parseInt(ov.pagina) + 1;  // SUMAR 1 para compensar página inicial en blanco
                const d = ov.datos;

                // Las coordenadas en la BD son relativas a UNA SOLA PÁGINA (0-100%)
                let leftPercent = parseFloat(d.x);  // Porcentaje dentro de la página (0-100)
                let topPercent = parseFloat(d.y);
                let widthPercent = parseFloat(d.w);
                let heightPercent = parseFloat(d.h);

                // Convertir porcentajes a píxeles
                let leftPx = (leftPercent / 100) * pageWidth;
                let topPx = (topPercent / 100) * H;
                const anchoPx = (widthPercent / 100) * pageWidth;
                const altoPx = (heightPercent / 100) * H;

                // Ajustar offset X: Los overlays BD página 1 van al lado DERECHO (página 2 del spread)
                // Si pageNum es IMPAR, aplicar offset
                if (pageNum % 2 !== 0) {
                    leftPx = pageWidth + leftPx;
                }

                console.log(`📍 Page ${pageNum}: left=${leftPercent}% → ${leftPx}px, top=${topPercent}% → ${topPx}px, w=${widthPercent}% → ${anchoPx}px, h=${heightPercent}% → ${altoPx}px`);

                const div = document.createElement('div');
                div.className = 'flipbook-overlay';
                div.style.cssText = `position:absolute; left:${leftPx}px; top:${topPx}px; width:${anchoPx}px; height:${altoPx}px; pointer-events:auto; overflow:hidden; border-radius:4px;`;

                switch (ov.tipo) {
                    case 'imagen':
                        div.innerHTML = `<img src="${d.url}" style="width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;">`;
                        break;

                    case 'video':
                        const ytId = extraerIdYoutube(d.url);
                        if (ytId) {
                            div.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=0&controls=1" style="width:100%; height:100%; border:none;" allowfullscreen></iframe>`;
                        }
                        break;

                    case 'audio':
                        const btn = document.createElement('button');
                        btn.className = 'btn-reproducir-audio';
                        btn.innerHTML = '▶';
                        btn.style.cssText = "width:40px; height:40px; border-radius:50%; border:none; background:#1cbfb8; color:white; cursor:pointer; font-size:18px; flex-shrink:0;";
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            if (audioActual) audioActual.pause();
                            audioActual = new Audio(d.url);
                            audioActual.play();
                        };
                        div.style.display = 'flex';
                        div.style.alignItems = 'center';
                        div.style.justifyContent = 'center';
                        div.appendChild(btn);
                        break;

                    case 'link':
                        div.innerHTML = `<a href="${d.url}" target="_blank" style="display:block; width:100%; height:100%; text-decoration:none;"></a>`;
                        break;
                }
                capaOverlays.appendChild(div);
            });
        }

        function extraerIdYoutube(url) {
            const m = url.match(/(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }

        window.addEventListener('resize', () => setTimeout(ajustarCapaOverlays, 300));
    });
})();