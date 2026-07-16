import { dom, getTargetSizes } from './dom.js';
import { state } from './state.js';
import { orderPoints } from './utils.js';
import { redraw } from './renderer.js';
import { updateButtonStates, scrollToCorner } from './ui.js';
import { fitRectCardToDetected } from './rect-mode.js';
import { sortDetectedCards } from './utils.js';
import { showAlert, showConfirm } from '../dialogs.js';

export async function detectCards() {
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

    let targetParams = [];

    if (state.editMode === 'rect') {
        if (state.rectWidth > 0 && state.rectHeight > 0) {
            const w = state.rectWidth;
            const h = state.rectHeight;
            targetParams.push({
                area: w * h,
                ar: Math.max(w / h, h / w),
                minPx: Math.min(w, h),
                maxPx: Math.max(w, h)
            });
        }
    } else {
        const dpi = parseFloat(dom.dpiInput.value) || 300;
        const targetSizes = getTargetSizes();
        for (const size of targetSizes) {
            if (size.w > 0 && size.h > 0) {
                const w = (size.w * dpi) / 25.4;
                const h = (size.h * dpi) / 25.4;
                targetParams.push({
                    area: w * h,
                    ar: Math.max(w / h, h / w),
                    minPx: Math.min(w, h),
                    maxPx: Math.max(w, h)
                });
            }
        }
    }

    let foundCenters = [];
    const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area    = cv.contourArea(contour);

        if (area < minCardArea && targetParams.length === 0) continue;

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

        if (targetParams.length > 0) {
            let matchedParam = null;
            for (const param of targetParams) {
                if (rectArea >= param.area * 0.40 && rectArea <= param.area * 1.30) {
                    if (param.ar > 0 && Math.abs(rectAR - param.ar) / param.ar <= 0.20) {
                        matchedParam = param;
                        break;
                    }
                }
            }
            if (!matchedParam) continue;

            // Snap to exact physical dimensions
            if (rect.size.width < rect.size.height) {
                rect.size.width  = matchedParam.minPx;
                rect.size.height = matchedParam.maxPx;
            } else {
                rect.size.width  = matchedParam.maxPx;
                rect.size.height = matchedParam.minPx;
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
            await showAlert("Please set Width and Height (px) for Rectangle mode before Auto-Detect.");
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
        await showAlert("No cards could be automatically detected. Make sure the background contrasts with the cards.");
    }

    import('./ini-handler.js').then(m => m.saveCurrentToDatabase(true, false));

    redraw();
    updateButtonStates();
}

export async function handleAutoDetect() {
    if (!state.isCvReady) {
        await showAlert("OpenCV is not ready yet.");
        return;
    }

    const totalCards = state.detectedCards.length + state.rectCards.length;
    if (totalCards > 0) {
        const proceed = await showConfirm(`You have ${totalCards} card${totalCards !== 1 ? 's' : ''}. Auto-detect will unselect all of them. Continue?`);
        if (!proceed) return;
    }

    dom.processButton.disabled    = true;
    dom.processButton.textContent = "Processing...";

    setTimeout(async () => {
        try {
            if (state.detectionEngine === 'ai') {
                const { detectCardsML } = await import('./ml-detector.js');
                const count = await detectCardsML();
                if (count === 0) {
                    await showAlert("No cards detected by AI. Try OpenCV mode in Settings.");
                } else {
                    // Similar post-processing as OpenCV
                    if (state.editMode === 'freeform') {
                        state.selectedPoint = state.detectedCards[0][0];
                        scrollToCorner(state.selectedPoint, 0);
                    }
                    state.userEditedCoords = false;
                    import('./ini-handler.js').then(m => m.saveCurrentToDatabase(true, false));
                    redraw();
                }
            } else {
                await detectCards();
                state.userEditedCoords = false;
            }
        } catch (err) {
            console.error("Processing Error:", err);
            await showAlert("An error occurred during card detection.");
        } finally {
            dom.processButton.disabled    = false;
            dom.processButton.textContent = "Auto-Detect";
            updateButtonStates();
            // Focus canvas so keyboard navigation works immediately
            dom.canvas.focus({ preventScroll: true });
        }
    }, 50);
}
