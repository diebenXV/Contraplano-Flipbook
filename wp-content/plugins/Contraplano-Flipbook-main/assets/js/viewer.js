/**
 * viewer.js — Visor con Animación StPageFlip + Soporte de Audio
 */
(function ($) {
    'use strict';

    document.querySelectorAll('.flipbook-contenedor').forEach(function (contenedor) {
        const flipbookId = contenedor.dataset.flipbookId;
        const datos = window['flipbookData_' + flipbookId];
        if (!datos) return;

        const canvasWrapper = contenedor.querySelector('.flipbook-canvas-wrapper');
        const capaOverlays = contenedor.querySelector('.flipbook-overlays');
        const paginaActualEl = contenedor.querySelector('.flipbook-pagina-actual');
        const btnAnt = contenedor.querySelector('.flipbook-anterior');
        const btnSig = contenedor.querySelector('.flipbook-siguiente');
        const btnFS = contenedor.querySelector('.btn-fullscreen');

        let pdfDoc = null;
        let pageFlip = null;
        let paginasRenderizadas = [];
        const total = datos.paginas;
        let audioActual = null; 

        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        async function inicializarVisor() {
            try {
                pdfDoc = await pdfjsLib.getDocument(datos.pdf_url).promise;
                for (let i = 1; i <= total; i++) {
                    const imgData = await renderizarPaginaAImagen(i);
                    paginasRenderizadas.push(imgData);
                }

                let pageWidth = 550;
                let pageHeight = 733;
                
                const containerWidth = canvasWrapper.clientWidth;
                if (containerWidth > 0) {
                    const maxWidth = Math.max(containerWidth - 40, 500);
                    const aspectRatio = 733 / 550;
                    pageWidth = Math.min(maxWidth, 900);
                    pageHeight = pageWidth * aspectRatio;
                }

                pageFlip = new St.PageFlip(canvasWrapper, {
                    width: pageWidth, 
                    height: pageHeight, 
                    size: "stretch",
                    showCover: true, 
                    mobileScrollSupport: true
                });

                pageFlip.loadFromImages(paginasRenderizadas);

                pageFlip.on('flip', (e) => {
                    const indice = e.data + 1;
                    paginaActualEl.textContent = indice;
                    renderizarOverlays(indice);
                });

                renderizarOverlays(1);
            } catch (err) { console.error("Error:", err); }
        }

        async function renderizarPaginaAImagen(num) {
            const page = await pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.height = viewport.height; canvas.width = viewport.width;
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            return canvas.toDataURL('image/jpeg', 0.8);
        }

        function renderizarOverlays(pagina) {
            if (audioActual) { audioActual.pause(); audioActual = null; } // Detener audio al cambiar
            capaOverlays.innerHTML = '';
            const overlays = datos.overlays.filter(o => parseInt(o.pagina) === pagina);

            overlays.forEach(ov => {
                const d = ov.datos;
                const div = document.createElement('div');
                div.className = `flipbook-overlay overlay-${ov.tipo}`;
                div.style = `position:absolute; left:${d.x}%; top:${d.y}%; width:${d.w}%; height:${d.h}%; z-index:10;`;

                if (ov.tipo === 'audio') { 
                    const btnAudio = document.createElement('button');
                    btnAudio.className = 'btn-reproducir-audio';
                    const iconColor = (d.iconColor && d.iconColor !== 'undefined') ? d.iconColor : '#ffffff';
                    btnAudio.innerHTML = `<svg viewBox="0 0 24 24" fill="${iconColor}" width="60%" height="60%" style="pointer-events: none;">
                        <path d="M8 5v14l11-7z"/>
                    </svg>`;
                    btnAudio.onclick = () => {
                        if (audioActual) audioActual.pause();
                        audioActual = new Audio(d.url);
                        audioActual.play();
                    };
                    div.appendChild(btnAudio);
                } else if (ov.tipo === 'link') {
                    div.innerHTML = `<a href="${d.url}" target="_blank" style="display:block;width:100%;height:100%;"></a>`;
                } else if (ov.tipo === 'video') {
                    const idV = d.url.match(/(?:youtu\.be\/|v=|\/v\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)[1];
                    div.innerHTML = `<iframe src="https://www.youtube.com/embed/${idV}" style="width:100%;height:100%;border:none;" allowfullscreen></iframe>`;
                }
                capaOverlays.appendChild(div);
            });
        }

        btnAnt.onclick = () => pageFlip.flipPrev();
        btnSig.onclick = () => pageFlip.flipNext();
        btnFS.onclick = () => {
            if (!document.fullscreenElement) contenedor.requestFullscreen();
            else document.exitFullscreen();
        };

        inicializarVisor();
    });
})(jQuery);