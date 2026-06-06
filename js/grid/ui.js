import { dom } from './dom.js';
import { state } from './state.js';
import { calculateCutRegions } from './export.js';
import { redraw } from './renderer.js';

export function updateDownloadButtonText() {
    if (state.lines.length === 0) {
        dom.downloadButton.textContent = 'Download';
        return;
    }
    calculateCutRegions();
    dom.downloadButton.textContent = state.cutRegions.length > 0
        ? `Download ${state.cutRegions.length}`
        : 'Download';
}

export function resetState() {
    state.lines = [];
    state.cutRegions = [];
    state.selectedLine = null;
    state.hoverLine = null;
    state.isDragging = false;
    state.draggedLine = null;
    dom.downloadButton.disabled = true;
    dom.resetButton.disabled = true;
    state.pdfDoc = null;
    state.isPdf = false;
}

export function resetLines() {
    state.lines = [];
    state.cutRegions = [];
    state.selectedLine = null;
    state.hoverLine = null;
    state.isDragging = false;
    state.draggedLine = null;
    dom.downloadButton.disabled = true;
    dom.resetButton.disabled = true;
    if (state.isImageLoaded) redraw();
}

// ── Grid mode ───────────────────────────────────────────────────────────────

export function switchGridMode(mode) {
    state.gridMode = mode;

    const isFree = mode === 'free';
    dom.gridFreeMode.classList.toggle('active', isFree);
    dom.gridGridMode.classList.toggle('active', !isFree);
    dom.gridFreeControls.style.display = isFree ? '' : 'none';
    dom.gridGridControls.style.display = isFree ? 'none' : '';

    // In free mode: Auto-Detect and Reset are available
    // In grid mode: lines are generated, Auto-Detect doesn't apply
    dom.autoDetectButton.style.display = isFree ? '' : 'none';
    dom.resetButton.style.display = isFree ? '' : 'none';

    if (!isFree && state.isImageLoaded) {
        recalcGrid();
    }
}

export function recalcGrid() {
    if (state.gridMode !== 'grid' || !state.isImageLoaded) return;

    const cardW = parseInt(dom.gridCardW.value) || 0;
    const cardH = parseInt(dom.gridCardH.value) || 0;
    if (cardW <= 0 || cardH <= 0) {
        state.lines = [];
        state.cutRegions = [];
        dom.downloadButton.disabled = true;
        dom.downloadButton.textContent = 'Download';
        if (state.isImageLoaded) redraw();
        return;
    }

    const gapX = parseInt(dom.gridGapX.value) || 0;
    const gapY = parseInt(dom.gridGapY.value) || 0;
    const imgW = dom.sourceCanvas.width;
    const imgH = dom.sourceCanvas.height;

    // Calculate how many cards fit
    const cols = Math.max(1, Math.floor((imgW + gapX) / (cardW + gapX)));
    const rows = Math.max(1, Math.floor((imgH + gapY) / (cardH + gapY)));

    // Margins: auto-center if not specified
    const totalW = cols * cardW + Math.max(0, cols - 1) * gapX;
    const totalH = rows * cardH + Math.max(0, rows - 1) * gapY;

    let marginL = dom.gridMarginL.value !== '' ? parseInt(dom.gridMarginL.value) : null;
    let marginT = dom.gridMarginT.value !== '' ? parseInt(dom.gridMarginT.value) : null;

    if (marginL === null || isNaN(marginL)) {
        marginL = Math.round((imgW - totalW) / 2);
    }
    if (marginT === null || isNaN(marginT)) {
        marginT = Math.round((imgH - totalH) / 2);
    }

    // Build cut regions directly — each card is an exact region
    state.cutRegions = [];
    state.gridCols = cols;
    state.gridRows = rows;
    let index = 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = marginL + c * (cardW + gapX);
            const y = marginT + r * (cardH + gapY);
            state.cutRegions.push({
                index: index++,
                row: r,
                col: c,
                x, y,
                w: cardW,
                h: cardH
            });
        }
    }

    // Generate visual lines for the renderer
    state.lines = [];
    const lineSet = new Set();

    for (let c = 0; c <= cols; c++) {
        const xLeft = marginL + c * (cardW + gapX);
        const xRight = xLeft - gapX; // right edge of previous card
        if (c > 0 && gapX > 0 && xRight > 0 && xRight < imgW) {
            const key = `x:${xRight}`;
            if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: xRight, y: null }); }
        }
        if (xLeft > 0 && xLeft < imgW) {
            const key = `x:${xLeft}`;
            if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: xLeft, y: null }); }
        }
    }
    // Right edge of last card
    const xEnd = marginL + cols * cardW + (cols - 1) * gapX;
    if (xEnd > 0 && xEnd < imgW) {
        const key = `x:${xEnd}`;
        if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: xEnd, y: null }); }
    }

    for (let r = 0; r <= rows; r++) {
        const yTop = marginT + r * (cardH + gapY);
        const yBottom = yTop - gapY;
        if (r > 0 && gapY > 0 && yBottom > 0 && yBottom < imgH) {
            const key = `y:${yBottom}`;
            if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: null, y: yBottom }); }
        }
        if (yTop > 0 && yTop < imgH) {
            const key = `y:${yTop}`;
            if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: null, y: yTop }); }
        }
    }
    const yEnd = marginT + rows * cardH + (rows - 1) * gapY;
    if (yEnd > 0 && yEnd < imgH) {
        const key = `y:${yEnd}`;
        if (!lineSet.has(key)) { lineSet.add(key); state.lines.push({ x: null, y: yEnd }); }
    }

    state.selectedLine = null;
    dom.downloadButton.disabled = state.cutRegions.length === 0;
    dom.downloadButton.textContent = state.cutRegions.length > 0
        ? `Download ${state.cutRegions.length}`
        : 'Download';
    redraw();
}
