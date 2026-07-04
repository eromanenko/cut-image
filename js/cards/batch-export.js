import { state } from './state.js';
import { dom } from './dom.js';
import { injectPngDpi } from '../grid/png-modifier.js';

// ---------------------------------------------------------------------------
// Geometry helpers (standalone, no state dependency)
// ---------------------------------------------------------------------------

/**
 * Compute the 4 corners of a rect-mode card given explicit dimensions.
 * Mirror of getRectCardCorners() from rect-mode.js but without state dependency.
 */
function getRectCornersFromRecord(card, rectWidth, rectHeight, rectSkew) {
    const W = rectWidth;
    const H = rectHeight;
    const S = rectSkew;

    const unrotated = [
        { x: card.x,     y: card.y         },
        { x: card.x + W, y: card.y + S     },
        { x: card.x + W, y: card.y + S + H },
        { x: card.x,     y: card.y + H     },
    ];

    if (!card.angle || card.angle === 0) return unrotated;

    const cx = card.x + W / 2;
    const cy = card.y + S / 2 + H / 2;
    const rad = (card.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return unrotated.map(pt => {
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        return {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos,
        };
    });
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

/**
 * Load a File into an ImageBitmap, respecting EXIF orientation via canvas trick.
 */
function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to load image: ${file.name}`));
        };
        img.src = url;
    });
}

// ---------------------------------------------------------------------------
// Single-card cutting (mirrors export.js logic)
// ---------------------------------------------------------------------------

/**
 * Cut one card (defined by pts array) from srcCanvas.
 * Returns a Blob (PNG).
 */
async function cutCardToBlob(srcCanvas, pts, outW, outH, dpi, format = 'png', quality = 90) {
    const tempCanvas = document.createElement('canvas');

    if (pts.length === 4) {
        // Perspective transform via OpenCV
        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            pts[0].x, pts[0].y,
            pts[1].x, pts[1].y,
            pts[2].x, pts[2].y,
            pts[3].x, pts[3].y,
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            outW - 1, 0,
            outW - 1, outH - 1,
            0, outH - 1,
        ]);

        const srcMat = cv.imread(srcCanvas);
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        const dst = new cv.Mat();
        const dsize = new cv.Size(outW, outH);

        cv.warpPerspective(srcMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
        cv.imshow(tempCanvas, dst);

        srcTri.delete(); dstTri.delete(); srcMat.delete(); M.delete(); dst.delete();
    } else {
        // Polygon clip (N-sided)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(srcCanvas.width, Math.ceil(maxX));
        maxY = Math.min(srcCanvas.height, Math.ceil(maxY));

        const w = maxX - minX;
        const h = maxY - minY;
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext('2d');

        tCtx.beginPath();
        tCtx.moveTo(pts[0].x - minX, pts[0].y - minY);
        for (let j = 1; j < pts.length; j++) {
            tCtx.lineTo(pts[j].x - minX, pts[j].y - minY);
        }
        tCtx.closePath();
        tCtx.clip();
        tCtx.drawImage(srcCanvas, minX, minY, w, h, 0, 0, w, h);
    }

    let blob;
    if (format === 'jpg') {
        // For JPEG: fill transparent areas white (JPEG has no alpha)
        const flatCanvas = document.createElement('canvas');
        flatCanvas.width = tempCanvas.width;
        flatCanvas.height = tempCanvas.height;
        const flatCtx = flatCanvas.getContext('2d');
        flatCtx.fillStyle = '#ffffff';
        flatCtx.fillRect(0, 0, flatCanvas.width, flatCanvas.height);
        flatCtx.drawImage(tempCanvas, 0, 0);
        blob = await new Promise(resolve => flatCanvas.toBlob(resolve, 'image/jpeg', quality / 100));
    } else {
        blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        blob = await injectPngDpi(blob, dpi);
    }
    return blob;
}

// ---------------------------------------------------------------------------
// Progress UI helpers
// ---------------------------------------------------------------------------

function showProgress(label, percent) {
    if (dom.batchProgressContainer) dom.batchProgressContainer.style.display = 'block';
    if (dom.batchProgressLabel) dom.batchProgressLabel.textContent = label;
    if (dom.batchProgressBar) dom.batchProgressBar.style.width = `${Math.round(percent)}%`;
}

function hideProgress() {
    if (dom.batchProgressContainer) dom.batchProgressContainer.style.display = 'none';
    if (dom.batchProgressBar) dom.batchProgressBar.style.width = '0%';
}

function showSummary(processedCount, totalCards, notFound) {
    if (!dom.batchSummaryContainer) return;

    const notFoundHtml = notFound.length > 0
        ? `<div class="ce-batch-summary-warn">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-top:2px">
                   <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
               </svg>
               <span>No coords found for: ${notFound.map(n => `<em>${n}</em>`).join(', ')}</span>
           </div>`
        : '';

    const loadErrorsHtml = (window._loadErrors || []).length > 0
        ? `<div class="ce-batch-summary-warn">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;margin-top:2px">
                   <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
               </svg>
               <span>Failed to load image: ${(window._loadErrors || []).map(n => `<em>${n}</em>`).join(', ')}</span>
           </div>`
        : '';

    dom.batchSummaryContainer.innerHTML = `
        <div class="ce-batch-summary-ok">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Done! <strong>${totalCards}</strong> card${totalCards !== 1 ? 's' : ''} from <strong>${processedCount}</strong> file${processedCount !== 1 ? 's' : ''} saved to ZIP.</span>
        </div>
        ${notFoundHtml}
        ${loadErrorsHtml}
    `;
    dom.batchSummaryContainer.style.display = 'block';
    dom.batchSummaryContainer.addEventListener('click', clearSummary, { once: true });
}

export function clearSummary() {
    if (dom.batchSummaryContainer) {
        dom.batchSummaryContainer.innerHTML = '';
        dom.batchSummaryContainer.style.display = 'none';
    }
}

// ---------------------------------------------------------------------------
// Main batch export function
// ---------------------------------------------------------------------------

/**
 * @param {File[]} files - image files to process
 * @param {{ format: 'png'|'jpg', quality: number }} [settings] - export settings
 */
export async function runBatchExport(files, settings = {}) {
    if (!files || files.length === 0) return;

    const db = state.coordsDatabase;
    if (!db || Object.keys(db).length === 0) return;

    clearSummary();

    const format = settings.format || 'png';
    const quality = settings.quality != null ? settings.quality : 90;
    const ext = format === 'jpg' ? 'jpg' : 'png';

    // Disable the button during processing
    if (dom.batchExportBtn) {
        dom.batchExportBtn.disabled = true;
        dom.batchExportBtn.textContent = 'Processing…';
    }

    const zip = new JSZip();
    let totalCards = 0;
    let processedFiles = 0;
    const notFound = [];
    const loadErrors = [];
    window._loadErrors = loadErrors; // Hack to pass it to showSummary without changing its signature

    try {
        for (let fi = 0; fi < files.length; fi++) {
            const file = files[fi];
            const fileName = file.name;
            const baseName = fileName;

            // Update progress before processing each file
            const progressPercent = (fi / files.length) * 100;
            showProgress(`Processing ${fi + 1} / ${files.length}: ${fileName}`, progressPercent);

            // Yield to browser so the UI can repaint
            await new Promise(r => setTimeout(r, 0));

            // Look up record in database by exact filename
            const record = db[baseName];
            const cardList = record
                ? (record.editMode === 'freeform' ? (record.cards || []) : (record.rectCards || []))
                : [];

            if (!record || cardList.length === 0) {
                notFound.push(fileName);
                continue;
            }

            const srcCanvas = document.createElement('canvas');
            const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
            
            try {
                const isTiff = file.type.includes('tiff') || file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');
                if (isTiff && typeof UTIF !== 'undefined') {
                    const fileBuffer = await file.arrayBuffer();
                    const ifds = UTIF.decode(fileBuffer);
                    if (ifds.length === 0) throw new Error("Could not decode TIFF file.");
                    UTIF.decodeImage(fileBuffer, ifds[0]);
                    const rgba = UTIF.toRGBA8(ifds[0]);
                    const w = ifds[0].width;
                    const h = ifds[0].height;
                    
                    srcCanvas.width = w;
                    srcCanvas.height = h;
                    const imgData = srcCtx.createImageData(w, h);
                    imgData.data.set(new Uint8Array(rgba));
                    srcCtx.putImageData(imgData, 0, 0);
                } else {
                    const img = await loadImageFile(file);
                    srcCanvas.width = img.naturalWidth;
                    srcCanvas.height = img.naturalHeight;
                    srcCtx.drawImage(img, 0, 0);
                }
            } catch (e) {
                console.warn(`Batch export: could not load ${fileName}`, e);
                loadErrors.push(fileName);
                continue;
            }

            const dpi = record.dpi || 300;
            const isRect = record.editMode === 'rect';
            const prefix = fileName.replace(/\.[^/.]+$/, ''); // strip extension

            for (let i = 0; i < cardList.length; i++) {
                let pts, outW, outH;

                if (isRect) {
                    pts = getRectCornersFromRecord(cardList[i], record.rectWidth, record.rectHeight, record.rectSkew || 0);
                    outW = Math.round(record.rectWidth);
                    outH = Math.round(record.rectHeight);
                } else {
                    pts = cardList[i];
                    // Compute natural dimensions from the quad
                    if (pts.length === 4) {
                        const wA = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
                        const wB = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
                        const hA = Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y);
                        const hB = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y);
                        outW = Math.round(Math.max(wA, wB));
                        outH = Math.round(Math.max(hA, hB));
                    }
                    // For N-sided polygons outW/outH are computed inside cutCardToBlob
                }

                const blob = await cutCardToBlob(srcCanvas, pts, outW, outH, dpi, format, quality);
                const padIndex = String(i + 1).padStart(2, '0');
                zip.file(`${prefix}-${padIndex}.${ext}`, blob);
                totalCards++;
            }

            processedFiles++;

            // Update progress bar to reflect completion of this file
            showProgress(`Processing ${fi + 2} / ${files.length}…`, ((fi + 1) / files.length) * 100);
            await new Promise(r => setTimeout(r, 0));
        }

        if (totalCards === 0) {
            hideProgress();
            showSummary(0, 0, notFound);
            return;
        }

        showProgress('Generating archive…', 99);
        await new Promise(r => setTimeout(r, 0));

        const content = await zip.generateAsync({ type: 'blob' });
        const date = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `cards_batch_${date}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

    } catch (e) {
        console.error('Batch export error:', e);
    } finally {
        hideProgress();
        showSummary(processedFiles, totalCards, notFound);

        if (dom.batchExportBtn) {
            dom.batchExportBtn.disabled = false;
            dom.batchExportBtn.textContent = 'Batch Export…';
        }
    }
}
