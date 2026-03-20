import { dom } from './dom.js';
import { state, resetState } from './state.js';
import { redraw } from './renderer.js';
import { updateButtonStates } from './ui.js';
import { extractTiffDpi, extractImageDpi } from '../grid/dpi.js';

export async function renderPdfPageForPreview(pageNumber) {
    if (!state.pdfDoc) return;
    try {
        const page = await state.pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: state.PDF_SCALE });

        dom.sourceCanvas.width = viewport.width;
        dom.sourceCanvas.height = viewport.height;

        dom.sourceCtx.clearRect(0, 0, dom.sourceCanvas.width, dom.sourceCanvas.height);
        await page.render({
            canvasContext: dom.sourceCtx,
            viewport: viewport
        }).promise;

        dom.canvas.width = dom.sourceCanvas.width;
        dom.canvas.height = dom.sourceCanvas.height;

        dom.pageIndicator.textContent = `Page ${pageNumber} / ${state.pdfDoc.numPages}`;
        dom.prevPageBtn.disabled = pageNumber <= 1;
        dom.nextPageBtn.disabled = pageNumber >= state.pdfDoc.numPages;

        const pdfDpi = Math.round(72 * state.PDF_SCALE);
        if (dom.dpiInput) dom.dpiInput.value = pdfDpi;

        state.isImageLoaded = true;
        state.detectedCards = []; // clear previous detections on new page
        redraw();
        updateButtonStates();
    } catch (err) {
        console.error("Error rendering PDF page:", err);
    }
}

export function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    resetState();
    state.originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    dom.prefixInput.value = state.originalFileName + "-";

    if (file.type === "application/pdf") {
        state.isPdf = true;
        dom.pdfControls.style.display = "flex";

        file.arrayBuffer().then(async arrayBuffer => {
            try {
                const pdfjsLib = window['pdfjs-dist/build/pdf'];
                state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                state.currentPreviewPage = 1;
                await renderPdfPageForPreview(state.currentPreviewPage);
            } catch (err) {
                console.error("PDF load error:", err);
                alert("Error loading PDF document.");
            }
        });
    } else {
        state.isPdf = false;
        dom.pdfControls.style.display = "none";

        file.arrayBuffer().then(async fileBuffer => {
            const isTiff = file.type === 'image/tiff' || file.type === 'image/tif'
                || file.name.toLowerCase().endsWith('.tif')
                || file.name.toLowerCase().endsWith('.tiff');

            if (isTiff && typeof UTIF !== 'undefined') {
                try {
                    const ifds = UTIF.decode(fileBuffer);
                    if (ifds.length === 0) {
                        alert("Could not decode TIFF file.");
                        return;
                    }
                    UTIF.decodeImage(fileBuffer, ifds[0]);
                    const rgba = UTIF.toRGBA8(ifds[0]);
                    const w = ifds[0].width;
                    const h = ifds[0].height;

                    const tiffDpi = extractTiffDpi(ifds[0]);
                    if (tiffDpi && dom.dpiInput) {
                        dom.dpiInput.value = tiffDpi;
                    }

                    dom.sourceCanvas.width = w;
                    dom.sourceCanvas.height = h;
                    const imgData = dom.sourceCtx.createImageData(w, h);
                    imgData.data.set(new Uint8Array(rgba));
                    dom.sourceCtx.putImageData(imgData, 0, 0);

                    dom.canvas.width = w;
                    dom.canvas.height = h;
                    state.isImageLoaded = true;
                    redraw();
                    updateButtonStates();
                } catch (err) {
                    console.error("TIFF decode error:", err);
                    alert("Error decoding TIFF file: " + err.message);
                }
            } else {
                const detectedDpi = extractImageDpi(new Uint8Array(fileBuffer), file.type);
                if (detectedDpi && dom.dpiInput) {
                    dom.dpiInput.value = detectedDpi;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    const image = new Image();
                    image.onload = () => {
                        dom.sourceCanvas.width = image.width;
                        dom.sourceCanvas.height = image.height;
                        dom.sourceCtx.drawImage(image, 0, 0);

                        dom.canvas.width = image.width;
                        dom.canvas.height = image.height;
                        state.isImageLoaded = true;
                        redraw();
                        updateButtonStates();
                    };
                    image.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}
