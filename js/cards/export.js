import { dom } from './dom.js';
import { state } from './state.js';
import { updateButtonStates } from './ui.js';
import { getRectCardCorners } from './rect-mode.js';
import { injectPngDpi } from '../grid/png-modifier.js';
import { generateCurrentIniFileContent } from './ini-handler.js';
import { showAlert } from '../dialogs.js';
import { sendTelemetryData } from './telemetry.js';

export async function exportCards() {
    const isRect = state.editMode === 'rect';
    const cardCount = isRect ? state.rectCards.length : state.detectedCards.length;

    if (cardCount === 0) return;

    // Send telemetry in the background if the user agreed
    sendTelemetryData();

    dom.downloadButton.disabled = true;
    dom.downloadButton.textContent = "Processing Archive...";
    const prefix = dom.prefixInput.value;
    const dpi = parseFloat(dom.dpiInput.value) || 300;
    
    const format = dom.exportFormatJpg && dom.exportFormatJpg.checked ? 'jpg' : 'png';
    const quality = dom.exportQualitySlider ? parseInt(dom.exportQualitySlider.value, 10) : 90;
    const ext = format === 'jpg' ? 'jpg' : 'png';

    try {
        const zip = new JSZip();
        let srcMat = cv.imread(dom.sourceCanvas);

        for (let i = 0; i < cardCount; i++) {
            let pts = isRect ? getRectCardCorners(state.rectCards[i]) : state.detectedCards[i];
            const tempCanvas = document.createElement('canvas');

            if (pts.length === 4) {
                let outW, outH;
                if (isRect) {
                    outW = state.rectWidth;
                    outH = state.rectHeight;
                } else {
                    let widthA = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
                    let widthB = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                    let heightA = Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y);
                    let heightB = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y);
                    outW = Math.round(Math.max(widthA, widthB));
                    outH = Math.round(Math.max(heightA, heightB));
                }

                let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    pts[0].x, pts[0].y,
                    pts[1].x, pts[1].y,
                    pts[2].x, pts[2].y,
                    pts[3].x, pts[3].y,
                ]);

                let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                    0, 0,
                    outW - 1, 0,
                    outW - 1, outH - 1,
                    0, outH - 1,
                ]);

                let M = cv.getPerspectiveTransform(srcTri, dstTri);
                let dst = new cv.Mat();
                let dsize = new cv.Size(outW, outH);

                cv.warpPerspective(srcMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
                cv.imshow(tempCanvas, dst);

                srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
            } else {
                // For N-sided polygons, find bounding box and mask
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                for (const p of pts) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }

                // Keep within image bounds
                minX = Math.max(0, Math.floor(minX));
                minY = Math.max(0, Math.floor(minY));
                maxX = Math.min(dom.sourceCanvas.width, Math.ceil(maxX));
                maxY = Math.min(dom.sourceCanvas.height, Math.ceil(maxY));

                const outW = maxX - minX;
                const outH = maxY - minY;

                tempCanvas.width = outW;
                tempCanvas.height = outH;
                const tCtx = tempCanvas.getContext('2d');

                // Create clipping mask
                tCtx.beginPath();
                tCtx.moveTo(pts[0].x - minX, pts[0].y - minY);
                for (let j = 1; j < pts.length; j++) {
                    tCtx.lineTo(pts[j].x - minX, pts[j].y - minY);
                }
                tCtx.closePath();
                tCtx.clip();

                // Draw image portion
                tCtx.drawImage(
                    dom.sourceCanvas,
                    minX, minY, outW, outH,
                    0, 0, outW, outH
                );
            }
            let blob;
            if (format === 'jpg') {
                const flatCanvas = document.createElement('canvas');
                flatCanvas.width = tempCanvas.width;
                flatCanvas.height = tempCanvas.height;
                const flatCtx = flatCanvas.getContext('2d');
                flatCtx.fillStyle = '#ffffff';
                flatCtx.fillRect(0, 0, flatCanvas.width, flatCanvas.height);
                flatCtx.drawImage(tempCanvas, 0, 0);
                blob = await new Promise(resolve => flatCanvas.toBlob(resolve, 'image/jpeg', quality / 100));
            } else {
                blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
                blob = await injectPngDpi(blob, dpi);
            }

            const padIndex = String(i + 1).padStart(2, '0');
            zip.file(`${prefix}${padIndex}.${ext}`, blob);
        }

        srcMat.delete();

        const iniContent = generateCurrentIniFileContent();
        if (iniContent) {
            zip.file(`${state.originalFileName}.ini`, iniContent);
        }

        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = state.originalFileName + "_cards.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

    } catch (e) {
        console.error(e);
        await showAlert("Error generating card archive.");
    } finally {
        dom.downloadButton.disabled = false;
        updateButtonStates();
    }
}
