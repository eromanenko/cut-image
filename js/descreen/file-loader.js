import { dom } from './dom.js';
import { state } from './state.js';
import { updateButtonStates } from './ui.js';

import { extractTiffDpi, extractImageDpi } from '../grid/dpi.js';

export async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    state.originalFileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    if (dom.fileNameDisplay) dom.fileNameDisplay.textContent = file.name;

    const fileBuffer = await file.arrayBuffer();
    
    const isTiff = file.type === 'image/tiff' || file.type === 'image/tif' 
        || file.name.toLowerCase().endsWith('.tif') 
        || file.name.toLowerCase().endsWith('.tiff');

    if (isTiff && typeof UTIF !== 'undefined') {
        try {
            const ifds = UTIF.decode(fileBuffer);
            if (ifds.length > 0) {
                UTIF.decodeImage(fileBuffer, ifds[0]);
                const rgba = UTIF.toRGBA8(ifds[0]);
                const w = ifds[0].width;
                const h = ifds[0].height;

                const tiffDpi = extractTiffDpi(ifds[0]);
                if (tiffDpi) {
                    dom.dpiInput.value = tiffDpi;
                } else {
                    dom.dpiInput.value = 300;
                }

                dom.sourceCanvas.width = w;
                dom.sourceCanvas.height = h;
                const imgData = dom.sourceCtx.createImageData(w, h);
                imgData.data.set(new Uint8Array(rgba));
                dom.sourceCtx.putImageData(imgData, 0, 0);

                setupCanvasSizes(w, h);
            }
        } catch (err) {
            console.error("TIFF decode error:", err);
            alert("Error decoding TIFF file: " + err.message);
        }
    } else {
        const detectedDpi = extractImageDpi(new Uint8Array(fileBuffer), file.type);
        if (detectedDpi) {
            dom.dpiInput.value = detectedDpi;
        } else {
            dom.dpiInput.value = 300;
        }

        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            dom.sourceCanvas.width = image.width;
            dom.sourceCanvas.height = image.height;
            dom.sourceCtx.drawImage(image, 0, 0);
            
            setupCanvasSizes(image.width, image.height);
            URL.revokeObjectURL(objectUrl);
        };
        image.src = objectUrl;
    }
}

function setupCanvasSizes(width, height) {
    dom.resultCanvas.width = width;
    dom.resultCanvas.height = height;
    dom.resultCtx.drawImage(dom.sourceCanvas, 0, 0);

    dom.canvas.width = width;
    dom.canvas.height = height;
    dom.ctx.drawImage(dom.sourceCanvas, 0, 0);

    state.history = [dom.resultCtx.getImageData(0, 0, width, height)];
    state.historyIndex = 0;

    state.isImageLoaded = true;
    dom.canvas.parentElement.style.display = 'inline-block';
    updateButtonStates();
}
