import { dom } from './dom.js';
import { state } from './state.js';
import { injectPngDpi } from './png-modifier.js';

// ── Cut region calculation ─────────────────────────────────────────────────

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

    // gridCols/gridRows = total number of x/y intervals in the grid,
    // including skipped edges — so mirroring indices are always correct.
    state.gridCols = sortedX.length;
    state.gridRows = sortedY.length;

    let rowIdx = 0;
    let lastY = 0;

    for (const y of sortedY) {
        let lastX = 0;
        let colIdx = 0;
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
                    colIdx++;
                    continue;
                }

                if (minSizePx > 0 && (width < minSizePx || height < minSizePx)) {
                    lastX = x;
                    colIdx++;
                    continue;
                }

                state.cutRegions.push({
                    index: index++,
                    row: rowIdx,
                    col: colIdx,
                    x: lastX,
                    y: lastY,
                    w: width,
                    h: height
                });
            }
            lastX = x;
            colIdx++;
        }
        lastY = y;
        rowIdx++;
    }
}

// ── Export helpers ─────────────────────────────────────────────────────────

/** Render a single PDF page to an off-screen canvas and return it. */
async function renderPdfPage(pageNum) {
    const page = await state.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: state.PDF_SCALE });
    const c = document.createElement('canvas');
    c.width = viewport.width;
    c.height = viewport.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
    return c;
}

/** Extract a cut region from a canvas and return a DPI-stamped PNG blob. */
async function extractRegionBlob(sourceCanvas, region, tempCanvas, tempCtx, dpi) {
    const rX = Math.min(region.x, sourceCanvas.width);
    const rY = Math.min(region.y, sourceCanvas.height);
    const rW = Math.min(region.w, sourceCanvas.width - rX);
    const rH = Math.min(region.h, sourceCanvas.height - rY);
    if (rW <= 0 || rH <= 0) return null;
    tempCanvas.width = rW;
    tempCanvas.height = rH;
    tempCtx.drawImage(sourceCanvas, rX, rY, rW, rH, 0, 0, rW, rH);
    const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
    return injectPngDpi(blob, dpi);
}

/** Return the mirrored cut region for paired (double-sided) export. */
function getMirroredRegion(region, pairingMode) {
    const maxCol = state.gridCols - 1;
    const maxRow = state.gridRows - 1;
    if (pairingMode === 'horizontal') {
        const mirroredCol = maxCol - region.col;
        return state.cutRegions.find(r => r.row === region.row && r.col === mirroredCol) || region;
    } else {
        const mirroredRow = maxRow - region.row;
        return state.cutRegions.find(r => r.row === mirroredRow && r.col === region.col) || region;
    }
}

/** Add paired front/back pages to the ZIP (prefix{N}a / prefix{N}b naming). */
async function addPairedPagesToZip(zip, prefix, dpi, pairingMode, tempCanvas, tempCtx) {
    const numPairs = Math.floor(state.pdfDoc.numPages / 2);
    const totalCards = numPairs * state.cutRegions.length;
    const padLen = Math.max(totalCards.toString().length, 1);

    let cardNum = 1;
    for (let pairIdx = 0; pairIdx < numPairs; pairIdx++) {
        const [oddCanvas, evenCanvas] = await Promise.all([
            renderPdfPage(pairIdx * 2 + 1),
            renderPdfPage(pairIdx * 2 + 2),
        ]);

        for (const region of state.cutRegions) {
            const pad = String(cardNum).padStart(padLen, '0');

            const frontBlob = await extractRegionBlob(oddCanvas, region, tempCanvas, tempCtx, dpi);
            if (frontBlob) zip.file(`${prefix}${pad}a.png`, frontBlob);

            const mirroredRegion = getMirroredRegion(region, pairingMode);
            const backBlob = await extractRegionBlob(evenCanvas, mirroredRegion, tempCanvas, tempCtx, dpi);
            if (backBlob) zip.file(`${prefix}${pad}b.png`, backBlob);

            cardNum++;
        }
        await new Promise(r => setTimeout(r, 15));
    }
}

/** Add flat (non-paired) PDF pages to the ZIP (prefix{page}_{piece} naming). */
async function addFlatPagesToZip(zip, prefix, dpi, startPage, endPage, tempCanvas, tempCtx) {
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const pageCanvas = await renderPdfPage(pageNum);

        for (const region of state.cutRegions) {
            const blob = await extractRegionBlob(pageCanvas, region, tempCanvas, tempCtx, dpi);
            if (blob) {
                const padPage = String(pageNum).padStart(2, '0');
                const padPiece = String(region.index).padStart(2, '0');
                zip.file(`${prefix}${padPage}_${padPiece}.png`, blob);
            }
        }
        await new Promise(r => setTimeout(r, 15));
    }
}

// ── Main export ────────────────────────────────────────────────────────────

export async function generateAndDownloadZip() {
    const zip = new JSZip();
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const prefix = dom.prefixInput.value;
    const dpi = parseFloat(dom.dpiInput.value) || 300;

    if (state.isPdf && state.pdfDoc) {
        const allPages = dom.allPagesCheckbox.checked;
        const pairingMode = dom.pairingModeSelect ? dom.pairingModeSelect.value : 'none';

        if (allPages && pairingMode !== 'none') {
            await addPairedPagesToZip(zip, prefix, dpi, pairingMode, tempCanvas, tempCtx);
        } else {
            const startPage = allPages ? 1 : state.currentPreviewPage;
            const endPage = allPages ? state.pdfDoc.numPages : state.currentPreviewPage;
            await addFlatPagesToZip(zip, prefix, dpi, startPage, endPage, tempCanvas, tempCtx);
        }
    } else {
        // Single image export
        for (const region of state.cutRegions) {
            tempCanvas.width = region.w;
            tempCanvas.height = region.h;
            tempCtx.drawImage(
                dom.sourceCanvas,
                region.x, region.y, region.w, region.h,
                0, 0, region.w, region.h
            );
            let blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
            blob = await injectPngDpi(blob, dpi);
            zip.file(`${prefix}${String(region.index).padStart(2, '0')}.png`, blob);
        }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = state.originalFileName + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}
