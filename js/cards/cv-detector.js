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
    cv.Canny(blurred, edges, 50, 150);

    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let imgArea = src.rows * src.cols;
    let minCardArea = imgArea * 0.01;

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        if (area < minCardArea) {
            continue;
        }

        let perimeter = cv.arcLength(contour, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
            let pts = [];
            for (let j = 0; j < 4; j++) {
                pts.push({
                    x: approx.data32S[j * 2],
                    y: approx.data32S[j * 2 + 1]
                });
            }
            state.detectedCards.push(orderPoints(pts));
        }
        approx.delete();
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
