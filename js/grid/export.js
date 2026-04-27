import { dom } from './dom.js';
import { state } from './state.js';
import { updateDownloadButtonText } from './ui.js';
import { injectPngDpi } from './png-modifier.js';

export function calculateCutRegions() {
    state.cutRegions = [];
    let index = 1;
    
    const hasVerticalLines = state.lines.some(l => l.x !== null);
    const hasHorizontalLines = state.lines.some(l => l.y !== null);
    
    const dpi = parseFloat(dom.dpiInput.value) || 300;
    const minSizeMm = parseFloat(dom.minSizeInput.value) || 0;
    const minSizePx = (minSizeMm / 25.4) * dpi;
    
    const sortedX = [];
    const sortedY = [];
    
    for (const l of state.lines) {
        if (l.x !== null) sortedX.push(l.x);
        else if (l.y !== null) sortedY.push(l.y);
    }

    sortedX.sort((a, b) => a - b);
    sortedY.sort((a, b) => a - b);
    
    sortedX.push(dom.canvas.width);
    sortedY.push(dom.canvas.height);

    let lastY = 0;
    for (const y of sortedY) {
        let lastX = 0;
        for (const x of sortedX) {
            const width = x - lastX;
            const height = y - lastY;
            
            if (width > 0 && height > 0) {
                let isEdgeX = lastX === 0 || x === dom.canvas.width;
                let isEdgeY = lastY === 0 || y === dom.canvas.height;
                
                if (!hasVerticalLines) isEdgeX = false;
                if (!hasHorizontalLines) isEdgeY = false;

                if (dom.skipEdgesCheckbox.checked && (isEdgeX || isEdgeY)) {
                    lastX = x;
                    continue;
                }

                if (minSizePx > 0 && (width < minSizePx || height < minSizePx)) {
                    lastX = x;
                    continue;
                }

                state.cutRegions.push({ 
                    index: index++, 
                    x: lastX, 
                    y: lastY, 
                    w: width, 
                    h: height 
                });
            }
            lastX = x;
        }
        lastY = y;
    }
}

export async function generateAndDownloadZip() {
    const zip = new JSZip();
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    const prefix = dom.prefixInput.value;
    const dpi = parseFloat(dom.dpiInput.value) || 300;

    if (state.isPdf && state.pdfDoc) {
        const startPage = dom.allPagesCheckbox.checked ? 1 : state.currentPreviewPage;
        const endPage = dom.allPagesCheckbox.checked ? state.pdfDoc.numPages : state.currentPreviewPage;

        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            const page = await state.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: state.PDF_SCALE });
            
            const pageCanvas = document.createElement("canvas");
            pageCanvas.width = viewport.width;
            pageCanvas.height = viewport.height;
            const pageCtx = pageCanvas.getContext("2d");
            
            await page.render({canvasContext: pageCtx, viewport: viewport}).promise;

            for (const region of state.cutRegions) {
                const rX = Math.min(region.x, pageCanvas.width);
                const rY = Math.min(region.y, pageCanvas.height);
                const rW = Math.min(region.w, pageCanvas.width - rX);
                const rH = Math.min(region.h, pageCanvas.height - rY);
                
                if (rW > 0 && rH > 0) {
                    tempCanvas.width = rW;
                    tempCanvas.height = rH;
                    
                    tempCtx.drawImage(
                        pageCanvas, 
                        rX, rY, rW, rH, 
                        0, 0, rW, rH
                    );
                    
                    let blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
                    blob = await injectPngDpi(blob, dpi);
                    
                    const padPage = String(pageNum).padStart(2, '0');
                    const padPiece = String(region.index).padStart(2, '0');
                    zip.file(`${prefix}${padPage}_${padPiece}.png`, blob);
                }
            }
            await new Promise(r => setTimeout(r, 15));
        }
    } else {
        for (const region of state.cutRegions) {
            tempCanvas.width = region.w;
            tempCanvas.height = region.h;
            
            tempCtx.drawImage(
                dom.sourceCanvas, 
                region.x, region.y, region.w, region.h, 
                0, 0, region.w, region.h
            );
            
            let blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
            blob = await injectPngDpi(blob, dpi);
            zip.file(`${prefix}${String(region.index).padStart(2, '0')}.png`, blob);
        }
    }

    const content = await zip.generateAsync({ type: "blob" });
    
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = state.originalFileName + ".zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href); 
}
