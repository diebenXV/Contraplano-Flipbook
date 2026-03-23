(function () {
    'use strict';

    document.querySelectorAll('.flipbook-contenedor').forEach(async function (contenedor) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos = window['flipbookData_' + flipbookId];
        if (!datos) return;

        const canvasWrapper = contenedor.querySelector('.flipbook-canvas-wrapper');
        const capaOverlays = contenedor.querySelector('.flipbook-overlays');
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

            // Limpiar y preparar contenedor para la animación
            canvasWrapper.innerHTML = '<div id="flip-target-' + flipbookId + '"></div>';
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

            // 4. Sincronización de la capa de Overlays
            const ajustarCapaOverlays = () => {
                const bookElement = canvasWrapper.querySelector('.stPageFlip');
                if (bookElement && capaOverlays) {
                    capaOverlays.style.width = bookElement.clientWidth + 'px';
                    capaOverlays.style.height = bookElement.clientHeight + 'px';
                    capaOverlays.style.left = bookElement.offsetLeft + 'px';
                    capaOverlays.style.top = bookElement.offsetTop + 'px';
                    capaOverlays.style.display = 'block';
                }
            };

            pageFlip.on('flip', (e) => {
                const num = e.data + 1;
                if (paginaActualEl) paginaActualEl.textContent = num;
                renderizarContenidoMultimedia(num, datos.overlays);
                setTimeout(ajustarCapaOverlays, 100);
            });

            // Navegación
            contenedor.querySelector('.flipbook-anterior').onclick = () => pageFlip.flipPrev();
            contenedor.querySelector('.flipbook-siguiente').onclick = () => pageFlip.flipNext();

            // Carga inicial
            renderizarContenidoMultimedia(1, datos.overlays);
            setTimeout(ajustarCapaOverlays, 800);

        } catch (e) { console.error("Error al cargar flipbook:", e); }

        // --- FUNCIÓN RECUPERADA: Renderiza Imágenes, Videos, Links y Audios ---
        function renderizarContenidoMultimedia(pagina, lista) {
            capaOverlays.innerHTML = '';
            if (audioActual) { audioActual.pause(); audioActual = null; }

            const items = lista ? lista.filter(o => parseInt(o.pagina) === pagina) : [];
            
            items.forEach(ov => {
                const d = ov.datos;
                const div = document.createElement('div');
                div.className = 'flipbook-overlay';
                div.style = `position:absolute; left:${d.x}%; top:${d.y}%; width:${d.w}%; height:${d.h}%; pointer-events:auto;`;

                switch (ov.tipo) {
                    case 'imagen':
                        div.innerHTML = `<img src="${d.url}" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
                        break;
                    
                    case 'video':
                        const ytId = extraerIdYoutube(d.url);
                        if (ytId) {
                            div.innerHTML = `<iframe src="https://www.youtube.com/embed/${ytId}" style="width:100%; height:100%; border:none;" allowfullscreen></iframe>`;
                        }
                        break;

                    case 'audio':
                        const btn = document.createElement('button');
                        btn.className = 'btn-reproducir-audio';
                        btn.innerHTML = '▶';
                        btn.style = "width:40px; height:40px; border-radius:50%; border:none; background:#1cbfb8; color:white; cursor:pointer; font-size:18px;";
                        btn.onclick = () => {
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
                        div.innerHTML = `<a href="${d.url}" target="_blank" style="display:block; width:100%; height:100%;"></a>`;
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