import { dom } from './dom.js';
import { state } from './state.js';
import { resetState } from './ui.js';
import { extractTiffDpi, extractImageDpi } from './dpi.js';
import { redraw } from './renderer.js';
import { showAlert } from '../dialogs.js';

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
        dom.dpiInput.value = pdfDpi;
        
        state.isImageLoaded = true;
        dom.canvas.parentElement.style.display = 'inline-block';
        dom.autoDetectButton.disabled = false;
        redraw();
    } catch (err) {
        console.error("Error rendering PDF page:", err);
    }
}

export async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    resetState();
    
    state.originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    dom.prefixInput.value = state.originalFileName + "-";
    if (dom.fileNameDisplay) dom.fileNameDisplay.textContent = file.name;

    const fileBuffer = await file.arrayBuffer();
    
    if (file.type === "application/pdf") {
        state.isPdf = true;
        const requestedDpi = parseInt(dom.dpiInput.value) || 300;
        state.PDF_SCALE = requestedDpi / 72;
        dom.pdfControls.style.display = "flex";
        dom.downloadButton.textContent = "Download Archive";
        
        try {
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            state.pdfDoc = await pdfjsLib.getDocument({data: fileBuffer}).promise;
            state.currentPreviewPage = 1;

            if (state.pdfDoc.numPages <= 1) {
                dom.allPagesCheckContainer.style.display = "none";
                dom.allPagesCheckbox.checked = false;
                dom.pairingModeContainer.style.display = "none";
                dom.pairingModeSelect.value = "none";
            } else {
                dom.allPagesCheckContainer.style.display = "inline-flex";
                dom.allPagesCheckbox.checked = true;
                dom.pairingModeContainer.style.display = "inline-flex";
            }

            await renderPdfPageForPreview(state.currentPreviewPage);
        } catch (err) {
            console.error("PDF load error:", err);
            await showAlert("Error loading PDF document.");
        }
    } else {
        state.isPdf = false;
        dom.pdfControls.style.display = "none";
        dom.downloadButton.textContent = "Download Archive";

        const isTiff = file.type === 'image/tiff' || file.type === 'image/tif' 
            || file.name.toLowerCase().endsWith('.tif') 
            || file.name.toLowerCase().endsWith('.tiff');

        if (isTiff && typeof UTIF !== 'undefined') {
            try {
                const ifds = UTIF.decode(fileBuffer);
                if (ifds.length === 0) {
                    await showAlert("Could not decode TIFF file.");
                    return;
                }
                UTIF.decodeImage(fileBuffer, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);
                const w = ifds[0].width;
                const h = ifds[0].height;

                const tiffDpi = extractTiffDpi(ifds[0]);
                if (tiffDpi) {
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
                dom.canvas.parentElement.style.display = 'inline-block';
                dom.autoDetectButton.disabled = false;
                redraw();
            } catch (err) {
                console.error("TIFF decode error:", err);
                await showAlert("Error decoding TIFF file: " + err.message);
            }
        } else {
            const detectedDpi = extractImageDpi(new Uint8Array(fileBuffer), file.type);
            if (detectedDpi) {
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
                    dom.canvas.parentElement.style.display = 'inline-block';
                    dom.autoDetectButton.disabled = false;
                    redraw();
                };
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }
}
