import { dom } from './dom.js';
import { state } from './state.js';
import { orderPoints } from './utils.js';
import { redraw } from './renderer.js';
import { updateButtonStates, scrollToCorner } from './ui.js';
import { fitRectCardToDetected } from './rect-mode.js';
import { sortDetectedCards } from './utils.js';

export function detectCards() {
    state.detectedCards.length = 0;

    let src     = cv.imread(dom.sourceCanvas);
    let gray    = new cv.Mat();
    let blurred = new cv.Mat();
    let edges   = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 30, 100);

    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours  = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let imgArea    = src.rows * src.cols;
    let minCardArea = imgArea * 0.01;

    // For freeform mode, use mm dimensions from the freeform inputs.
    // For rect mode, use pixel dimensions directly.
    let targetW_px = 0, targetH_px = 0, targetArea = 0, targetAR = 0;
    let targetMinPx = 0, targetMaxPx = 0;

    if (state.editMode === 'rect') {
        targetW_px = state.rectWidth;
        targetH_px = state.rectHeight;
    } else {
        const expectedW = parseFloat(dom.widthInput.value)  || 0;
        const expectedH = parseFloat(dom.heightInput.value) || 0;
        const dpi       = parseFloat(dom.dpiInput.value)    || 300;
        targetW_px = (expectedW * dpi) / 25.4;
        targetH_px = (expectedH * dpi) / 25.4;
    }

    if (targetW_px > 0 && targetH_px > 0) {
        targetArea   = targetW_px * targetH_px;
        targetAR     = Math.max(targetW_px / targetH_px, targetH_px / targetW_px);
        targetMinPx  = Math.min(targetW_px, targetH_px);
        targetMaxPx  = Math.max(targetW_px, targetH_px);
    }

    let foundCenters = [];
    const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area    = cv.contourArea(contour);

        if (area < minCardArea && targetArea === 0) continue;

        let rect    = cv.minAreaRect(contour);

        // Prevent duplicate detections
        let duplicate = false;
        for (const cx of foundCenters) {
            if (distSq(rect.center, cx) < 2500) { duplicate = true; break; }
        }
        if (duplicate) continue;

        let rectW    = rect.size.width;
        let rectH    = rect.size.height;
        let rectArea = rectW * rectH;
        let rectAR   = rectW > 0 && rectH > 0 ? Math.max(rectW / rectH, rectH / rectW) : 0;

        if (targetArea > 0) {
            if (rectArea < targetArea * 0.40 || rectArea > targetArea * 1.30) continue;
            if (targetAR > 0 && Math.abs(rectAR - targetAR) / targetAR > 0.20) continue;

            // Snap to exact physical dimensions
            if (rect.size.width < rect.size.height) {
                rect.size.width  = targetMinPx;
                rect.size.height = targetMaxPx;
            } else {
                rect.size.width  = targetMaxPx;
                rect.size.height = targetMinPx;
            }
        } else {
            if (area < minCardArea) continue;
            let perimeter = cv.arcLength(contour, true);
            let approx    = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
            let isQuad = (approx.rows === 4 && cv.isContourConvex(approx));
            approx.delete();
            if (!isQuad) continue;
        }

        foundCenters.push(rect.center);

        let vertices = cv.RotatedRect.points(rect);
        let pts = [];
        for (let j = 0; j < 4; j++) pts.push({ x: vertices[j].x, y: vertices[j].y });

        state.detectedCards.push(orderPoints(pts));
    }

    src.delete(); gray.delete(); blurred.delete(); edges.delete(); M.delete();
    contours.delete(); hierarchy.delete();

    // Sort detected cards (top-to-bottom, left-to-right)
    sortDetectedCards();

    // ── Rect mode: convert detected quads to rect-mode cards ─────────────
    if (state.editMode === 'rect') {
        if (state.rectWidth <= 0 || state.rectHeight <= 0) {
            alert("Please set Width and Height (px) for Rectangle mode before Auto-Detect.");
            state.detectedCards.length = 0;
        } else {
            state.rectCards = state.detectedCards.map(corners => fitRectCardToDetected(corners));
            state.detectedCards.length = 0;
            state.selectedRectCardIndex = state.rectCards.length > 0 ? 0 : -1;
        }
    } else {
        // Freeform mode: select the first corner of the first card
        if (state.detectedCards.length > 0) {
            state.selectedPoint = state.detectedCards[0][0];
            // Also scroll to it so the user sees the selection
            scrollToCorner(state.selectedPoint, 0);
        } else {
            state.selectedPoint = null;
        }
    }

    if (state.detectedCards.length === 0 && state.rectCards.length === 0) {
        alert("No cards could be automatically detected. Make sure the background contrasts with the cards.");
    }

    import('./ini-handler.js').then(m => m.saveCurrentToDatabase());

    redraw();
    updateButtonStates();
}

export function handleAutoDetect() {
    if (!state.isCvReady) {
        alert("OpenCV is not ready yet.");
        return;
    }

    const totalCards = state.detectedCards.length + state.rectCards.length;
    if (totalCards > 0) {
        if (!confirm(`You have ${totalCards} card${totalCards !== 1 ? 's' : ''}. Auto-detect will unselect all of them. Continue?`)) {
            return;
        }
    }

    dom.processButton.disabled    = true;
    dom.processButton.textContent = "Processing...";

    setTimeout(() => {
        try {
            detectCards();
        } catch (err) {
            console.error("OpenCV Processing Error:", err);
            alert("An error occurred during card detection.");
        } finally {
            dom.processButton.disabled    = false;
            dom.processButton.textContent = "Auto-Detect";
            updateButtonStates();
            // Focus canvas so keyboard navigation works immediately
            dom.canvas.focus({ preventScroll: true });
        }
    }, 50);
}
