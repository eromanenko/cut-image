import { dom, getTargetSizes } from './dom.js';
import { state } from './state.js';
import { orderPoints, sortDetectedCards, getPolygonArea } from './utils.js';
import { fitRectCardToDetected } from './rect-mode.js';
import { updateButtonStates, scrollToCorner } from './ui.js';
import { showAlert } from '../dialogs.js';
import { redraw } from './renderer.js';

export async function detectCardsHough() {
    state.detectedCards.length = 0;

    let src = cv.imread(dom.sourceCanvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 30, 100);

    let M = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, M, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let imgArea = src.rows * src.cols;
    let minCardArea = imgArea * 0.01;

    let foundCenters = [];
    const distSq = (p1, p2) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;

    for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        if (area < minCardArea) continue;

        let rect = cv.minAreaRect(contour);
        
        let duplicate = false;
        for (const cx of foundCenters) {
            if (distSq(rect.center, cx) < 2500) { duplicate = true; break; }
        }
        if (duplicate) continue;
        
        foundCenters.push(rect.center);

        // --- HOUGH TRANSFROM REFINEMENT ---
        let boundingRect = cv.boundingRect(contour);
        
        let pad = 20;
        let x = Math.max(0, boundingRect.x - pad);
        let y = Math.max(0, boundingRect.y - pad);
        let w = Math.min(edges.cols - x, boundingRect.width + pad * 2);
        let h = Math.min(edges.rows - y, boundingRect.height + pad * 2);
        
        let roi = edges.roi(new cv.Rect(x, y, w, h));
        let lines = new cv.Mat();
        
        cv.HoughLinesP(roi, lines, 1, Math.PI / 180, 40, 30, 10);
        
        let pts = [];
        let useMinArea = true;

        if (lines.rows >= 4) {
             let topLines = [], bottomLines = [], leftLines = [], rightLines = [];
             for (let j = 0; j < lines.rows; ++j) {
                 let lx1 = lines.data32S[j * 4];
                 let ly1 = lines.data32S[j * 4 + 1];
                 let lx2 = lines.data32S[j * 4 + 2];
                 let ly2 = lines.data32S[j * 4 + 3];
                 
                 let angle = Math.atan2(ly2 - ly1, lx2 - lx1) * 180 / Math.PI;
                 if (angle < 0) angle += 180;
                 
                 let isHoriz = (angle < 45 || angle > 135);
                 
                 let cx = (lx1 + lx2) / 2;
                 let cy = (ly1 + ly2) / 2;
                 
                 if (isHoriz) {
                     if (cy < h / 2) topLines.push({lx1, ly1, lx2, ly2, cy});
                     else bottomLines.push({lx1, ly1, lx2, ly2, cy});
                 } else {
                     if (cx < w / 2) leftLines.push({lx1, ly1, lx2, ly2, cx});
                     else rightLines.push({lx1, ly1, lx2, ly2, cx});
                 }
             }
             
             if (topLines.length > 0 && bottomLines.length > 0 && leftLines.length > 0 && rightLines.length > 0) {
                 topLines.sort((a,b) => a.cy - b.cy);
                 bottomLines.sort((a,b) => b.cy - a.cy);
                 leftLines.sort((a,b) => a.cx - b.cx);
                 rightLines.sort((a,b) => b.cx - a.cx);
                 
                 let t = topLines[0];
                 let b = bottomLines[0];
                 let l = leftLines[0];
                 let r = rightLines[0];
                 
                 const intersect = (l1, l2) => {
                     let denom = (l1.lx1 - l1.lx2)*(l2.ly1 - l2.ly2) - (l1.ly1 - l1.ly2)*(l2.lx1 - l2.lx2);
                     if (Math.abs(denom) < 0.001) return null;
                     
                     let t1 = l1.lx1*l1.ly2 - l1.ly1*l1.lx2;
                     let t2 = l2.lx1*l2.ly2 - l2.ly1*l2.lx2;
                     
                     let px = (t1*(l2.lx1 - l2.lx2) - (l1.lx1 - l1.lx2)*t2) / denom;
                     let py = (t1*(l2.ly1 - l2.ly2) - (l1.ly1 - l1.ly2)*t2) / denom;
                     
                     return {x: px + x, y: py + y};
                 };
                 
                 let p1 = intersect(t, l);
                 let p2 = intersect(t, r);
                 let p3 = intersect(b, r);
                 let p4 = intersect(b, l);
                 
                 if (p1 && p2 && p3 && p4) {
                     pts = [p1, p2, p3, p4];
                     useMinArea = false;
                 }
             }
        }
        
        roi.delete();
        lines.delete();
        
        if (useMinArea) {
            let vertices = cv.RotatedRect.points(rect);
            pts = [];
            for (let j = 0; j < 4; j++) pts.push({ x: vertices[j].x, y: vertices[j].y });
        }

        state.detectedCards.push(orderPoints(pts));
    }

    src.delete(); gray.delete(); blurred.delete(); edges.delete(); M.delete();
    contours.delete(); hierarchy.delete();

    sortDetectedCards();

    if (state.expectedCardCount !== null && state.detectedCards.length > state.expectedCardCount) {
        state.detectedCards.sort((a, b) => {
            return getPolygonArea(b) - getPolygonArea(a);
        });
        state.detectedCards = state.detectedCards.slice(0, state.expectedCardCount);
        sortDetectedCards();
    }

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
        if (state.detectedCards.length > 0) {
            state.selectedPoint = state.detectedCards[0][0];
            scrollToCorner(state.selectedPoint, 0);
        } else {
            state.selectedPoint = null;
        }
    }

    if (state.expectedCardCount !== null) {
        const total = state.editMode === 'rect' ? state.rectCards.length : state.detectedCards.length;
        if (total < state.expectedCardCount) {
            import('../dialogs.js').then(d => d.showToast(`Only ${total} of ${state.expectedCardCount} cards found`));
            import('./ui.js').then(ui => ui.blinkOverviewWindow());
        }
    } else {
        if (state.detectedCards.length === 0 && state.rectCards.length === 0) {
            await showAlert("No cards could be automatically detected by Hough Transform.");
        }
    }

    import('./ini-handler.js').then(m => m.saveCurrentToDatabase(true, false));
    
    redraw();
    updateButtonStates();

    return state.detectedCards.length + state.rectCards.length;
}
