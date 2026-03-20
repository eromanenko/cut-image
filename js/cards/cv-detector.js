import { dom } from './dom.js';
import { state } from './state.js';
import { orderPoints } from './utils.js';
import { redraw } from './renderer.js';
import { updateButtonStates } from './ui.js';

export function detectCards() {
    state.detectedCards.length = 0; // Clear array while preserving reference

    let src = cv.imread(dom.sourceCanvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 30, 100); // Lowered threshold to catch faint borders

    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let imgArea = src.rows * src.cols;
    let minCardArea = imgArea * 0.01;

    let expectedW = parseFloat(dom.widthInput.value) || 0;
    let expectedH = parseFloat(dom.heightInput.value) || 0;
    let dpi = parseFloat(dom.dpiInput.value) || 300;

    let targetW_px = (expectedW * dpi) / 25.4;
    let targetH_px = (expectedH * dpi) / 25.4;
    let targetArea = targetW_px * targetH_px;
    let targetAR = targetW_px > 0 && targetH_px > 0 ? Math.max(targetW_px / targetH_px, targetH_px / targetW_px) : 0;

    let targetMinPx = Math.min(targetW_px, targetH_px);
    let targetMaxPx = Math.max(targetW_px, targetH_px);

    let foundCenters = [];
    const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        if (area < minCardArea && targetArea === 0) {
            continue;
        }

        let rect = cv.minAreaRect(contour);
        
        // Prevent duplicate detections of the same card (e.g. outer border and inner border)
        let duplicate = false;
        for (const cx of foundCenters) {
            if (distSq(rect.center, cx) < 2500) { // 50px distance squared
                duplicate = true; break;
            }
        }
        if (duplicate) continue;

        let rectW = rect.size.width;
        let rectH = rect.size.height;
        let rectArea = rectW * rectH;
        let rectAR = rectW > 0 && rectH > 0 ? Math.max(rectW / rectH, rectH / rectW) : 0;

        let hasTargetDimensions = (targetW_px > 0 && targetH_px > 0);

        if (hasTargetDimensions) {
            // Area tolerance from 40% (inner frame) up to 130%
            if (rectArea < targetArea * 0.40 || rectArea > targetArea * 1.30) {
                continue;
            }
            
            // Aspect Ratio tolerance ±20%
            if (targetAR > 0 && Math.abs(rectAR - targetAR) / targetAR > 0.20) {
                continue;
            }

            // SNAP size to exact physical dimensions maintaining orientation
            if (rect.size.width < rect.size.height) {
                rect.size.width = targetMinPx;
                rect.size.height = targetMaxPx;
            } else {
                rect.size.width = targetMaxPx;
                rect.size.height = targetMinPx;
            }

        } else {
            // Fallback for when sizes are unknown: ensure it's a convex quadrilateral
            if (area < minCardArea) continue;

            let perimeter = cv.arcLength(contour, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
            
            let isQuad = (approx.rows === 4 && cv.isContourConvex(approx));
            approx.delete();
            
            if (!isQuad) continue;
        }

        foundCenters.push(rect.center);

        // Use minAreaRect to perfectly box rounded corners
        let vertices = cv.RotatedRect.points(rect);
        let pts = [];
        for (let j = 0; j < 4; j++) {
            pts.push({ x: vertices[j].x, y: vertices[j].y });
        }
        
        state.detectedCards.push(orderPoints(pts));
    }

    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    M.delete();
    contours.delete();
    hierarchy.delete();

    if (state.detectedCards.length === 0) {
        alert("No cards could be automatically detected with clarity. Make sure the background contrasts with the cards.");
    }

    redraw();
    updateButtonStates();
}

export function handleAutoDetect() {
    if (!state.isCvReady) {
        alert("OpenCV is not ready yet.");
        return;
    }

    if (state.detectedCards.length > 0) {
        if (!confirm(`You have ${state.detectedCards.length} card${state.detectedCards.length !== 1 ? 's' : ''} selected. Auto-detect will reset them. Continue?`)) {
            return;
        }
    }

    dom.processButton.disabled = true;
    dom.processButton.textContent = "Processing...";

    setTimeout(() => {
        try {
            detectCards();
        } catch (err) {
            console.error("OpenCV Processing Error:", err);
            alert("An error occurred during card detection.");
        } finally {
            dom.processButton.disabled = false;
            dom.processButton.textContent = "Auto-Detect Cards";
            updateButtonStates();
        }
    }, 50);
}
