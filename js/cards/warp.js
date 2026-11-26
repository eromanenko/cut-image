/**
 * Perspective warp helper with OpenCV fast path and pure-JS bilinear fallback.
 * Keeps Card Extraction export working even when OpenCV.js fails to load.
 */

/**
 * Solve an 8x8 linear system A * x = b using Gaussian elimination with partial pivoting.
 * Mutates A and b in place.
 * @param {number[][]} A
 * @param {number[]} b
 * @returns {number[]}
 */
function solveLinear8x8(A, b) {
    const n = 8;
    for (let col = 0; col < n; col++) {
        let maxRow = col;
        let maxVal = Math.abs(A[col][col]);
        for (let row = col + 1; row < n; row++) {
            const val = Math.abs(A[row][col]);
            if (val > maxVal) {
                maxVal = val;
                maxRow = row;
            }
        }
        if (maxVal < 1e-12) {
            throw new Error('Singular matrix while computing homography');
        }
        if (maxRow !== col) {
            [A[col], A[maxRow]] = [A[maxRow], A[col]];
            [b[col], b[maxRow]] = [b[maxRow], b[col]];
        }

        const pivot = A[col][col];
        for (let row = col + 1; row < n; row++) {
            const factor = A[row][col] / pivot;
            if (factor === 0) continue;
            A[row][col] = 0;
            for (let k = col + 1; k < n; k++) {
                A[row][k] -= factor * A[col][k];
            }
            b[row] -= factor * b[col];
        }
    }

    const x = new Array(n);
    for (let row = n - 1; row >= 0; row--) {
        let sum = b[row];
        for (let k = row + 1; k < n; k++) {
            sum -= A[row][k] * x[k];
        }
        x[row] = sum / A[row][row];
    }
    return x;
}

/**
 * Compute a 3x3 homography matrix mapping 4 source points to 4 destination points.
 * Returns a flat 9-element array [h0..h8] with h8 = 1.
 * @param {{x: number, y: number}[]} src
 * @param {{x: number, y: number}[]} dst
 * @returns {number[]}
 */
export function computeHomography(src, dst) {
    if (!src || !dst || src.length !== 4 || dst.length !== 4) {
        throw new Error('computeHomography requires exactly 4 source and 4 destination points');
    }

    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
        const { x, y } = src[i];
        const { x: u, y: v } = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
    }

    const h = solveLinear8x8(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Pure-JS bilinear perspective warp (inverse mapping from dst to src).
 * @param {ImageData} srcImageData
 * @param {{x: number, y: number}[]} pts - 4 source corners
 * @param {number} outW
 * @param {number} outH
 * @returns {HTMLCanvasElement}
 */
function warpCanvasJS(srcImageData, pts, outW, outH) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    if (outW <= 0 || outH <= 0) return outCanvas;

    const dstCorners = [
        { x: 0, y: 0 },
        { x: outW - 1, y: 0 },
        { x: outW - 1, y: outH - 1 },
        { x: 0, y: outH - 1 },
    ];
    const [h0, h1, h2, h3, h4, h5, h6, h7] = computeHomography(dstCorners, pts);

    const srcW = srcImageData.width;
    const srcH = srcImageData.height;
    const srcData = srcImageData.data;

    const outCtx = outCanvas.getContext('2d');
    const outImageData = outCtx.createImageData(outW, outH);
    const dstData = outImageData.data;

    for (let y = 0; y < outH; y++) {
        const rowOffset = y * outW * 4;
        for (let x = 0; x < outW; x++) {
            const idx = rowOffset + x * 4;
            const denom = h6 * x + h7 * y + 1;
            const sx = (h0 * x + h1 * y + h2) / denom;
            const sy = (h3 * x + h4 * y + h5) / denom;

            if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) {
                dstData[idx] = 255;
                dstData[idx + 1] = 255;
                dstData[idx + 2] = 255;
                dstData[idx + 3] = 255;
                continue;
            }

            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = x0 + 1 < srcW ? x0 + 1 : x0;
            const y1 = y0 + 1 < srcH ? y0 + 1 : y0;
            const dx = sx - x0;
            const dy = sy - y0;

            const w00 = (1 - dx) * (1 - dy);
            const w10 = dx * (1 - dy);
            const w01 = (1 - dx) * dy;
            const w11 = dx * dy;

            const i00 = (y0 * srcW + x0) * 4;
            const i10 = (y0 * srcW + x1) * 4;
            const i01 = (y1 * srcW + x0) * 4;
            const i11 = (y1 * srcW + x1) * 4;

            dstData[idx] = Math.round(srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11);
            dstData[idx + 1] = Math.round(srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11);
            dstData[idx + 2] = Math.round(srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11);
            dstData[idx + 3] = Math.round(srcData[i00 + 3] * w00 + srcData[i10 + 3] * w10 + srcData[i01 + 3] * w01 + srcData[i11 + 3] * w11);
        }
    }

    outCtx.putImageData(outImageData, 0, 0);
    return outCanvas;
}

/**
 * Create a reusable perspective warper bound to srcCanvas.
 * Uses OpenCV when ready, otherwise falls back to pure-JS bilinear warping.
 * @param {HTMLCanvasElement} srcCanvas
 */
export function createWarper(srcCanvas) {
    const hasCv = typeof window !== 'undefined' && window.openCvReady === true && window.cv && window.cv.Mat;

    if (hasCv) {
        let srcMat = cv.imread(srcCanvas);
        return {
            warp(pts, outW, outH) {
                if (!srcMat) throw new Error('Warper has been disposed');
                const tempCanvas = document.createElement('canvas');
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
                const M = cv.getPerspectiveTransform(srcTri, dstTri);
                const dst = new cv.Mat();
                const dsize = new cv.Size(outW, outH);
                try {
                    cv.warpPerspective(srcMat, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
                    cv.imshow(tempCanvas, dst);
                } finally {
                    srcTri.delete();
                    dstTri.delete();
                    M.delete();
                    dst.delete();
                }
                return tempCanvas;
            },
            dispose() {
                if (srcMat) {
                    srcMat.delete();
                    srcMat = null;
                }
            }
        };
    }

    let srcImageData = null;
    return {
        warp(pts, outW, outH) {
            if (!srcImageData) {
                const ctx = srcCanvas.getContext('2d');
                srcImageData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
            }
            return warpCanvasJS(srcImageData, pts, outW, outH);
        },
        dispose() {
            srcImageData = null;
        }
    };
}
