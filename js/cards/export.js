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

    try {
        const zip = new JSZip();
        let srcMat = cv.imread(dom.sourceCanvas);

        for (let i = 0; i < cardCount; i++) {
            let card4pts; // [TL, TR, BR, BL]
            let outW, outH;

            if (isRect) {
                const rc = state.rectCards[i];
                card4pts = getRectCardCorners(rc);
                outW = state.rectWidth;
                outH = state.rectHeight;
            } else {
                card4pts = state.detectedCards[i];
                // Compute output size from the card's actual edge lengths
                let widthA = Math.hypot(card4pts[2].x - card4pts[3].x, card4pts[2].y - card4pts[3].y);
                let widthB = Math.hypot(card4pts[1].x - card4pts[0].x, card4pts[1].y - card4pts[0].y);
                let heightA = Math.hypot(card4pts[1].x - card4pts[2].x, card4pts[1].y - card4pts[2].y);
                let heightB = Math.hypot(card4pts[0].x - card4pts[3].x, card4pts[0].y - card4pts[3].y);
                outW = Math.round(Math.max(widthA, widthB));
                outH = Math.round(Math.max(heightA, heightB));


            }

            let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                card4pts[0].x, card4pts[0].y,
                card4pts[1].x, card4pts[1].y,
                card4pts[2].x, card4pts[2].y,
                card4pts[3].x, card4pts[3].y,
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

            const tempCanvas = document.createElement('canvas');
            cv.imshow(tempCanvas, dst);

            srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();

            let blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
            blob = await injectPngDpi(blob, dpi);

            const padIndex = String(i + 1).padStart(2, '0');
            zip.file(`${prefix}${padIndex}.png`, blob);
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
