import { dom } from './dom.js';
import { state } from './state.js';
import { updateButtonStates } from './ui.js';

export async function exportCards() {
    if (state.detectedCards.length === 0) return;

    dom.downloadButton.disabled = true;
    dom.downloadButton.textContent = "Processing Archive...";
    const prefix = dom.prefixInput.value;

    try {
        const zip = new JSZip();
        let srcMat = cv.imread(dom.sourceCanvas);

        for (let i = 0; i < state.detectedCards.length; i++) {
            let card = state.detectedCards[i];

            let widthA = Math.hypot(card[2].x - card[3].x, card[2].y - card[3].y);
            let widthB = Math.hypot(card[1].x - card[0].x, card[1].y - card[0].y);
            let maxWidth = Math.max(widthA, widthB);

            let heightA = Math.hypot(card[1].x - card[2].x, card[1].y - card[2].y);
            let heightB = Math.hypot(card[0].x - card[3].x, card[0].y - card[3].y);
            let maxHeight = Math.max(heightA, heightB);

            let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                card[0].x, card[0].y,
                card[1].x, card[1].y,
                card[2].x, card[2].y,
                card[3].x, card[3].y
            ]);

            let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                maxWidth - 1, 0,
                maxWidth - 1, maxHeight - 1,
                0, maxHeight - 1
            ]);

            let M = cv.getPerspectiveTransform(srcTri, dstTri);
            let dst = new cv.Mat();
            let dsize = new cv.Size(maxWidth, maxHeight);

            cv.warpPerspective(srcMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            const tempCanvas = document.createElement('canvas');
            cv.imshow(tempCanvas, dst);

            srcTri.delete();
            dstTri.delete();
            M.delete();
            dst.delete();

            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, "image/png"));
            const padIndex = String(i + 1).padStart(2, '0');
            zip.file(`${prefix}${padIndex}.png`, blob);
        }

        srcMat.delete();

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
        alert("Error generating card archive.");
    } finally {
        dom.downloadButton.disabled = false;
        updateButtonStates();
    }
}
