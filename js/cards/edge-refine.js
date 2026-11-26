/**
 * Pure-JS sub-pixel card edge refinement for AI (YOLO-OBB) detections.
 * Samples intensity profiles perpendicular to each predicted side, finds the
 * outermost strong edge peak, fits a robust line via TLS + MAD outlier
 * rejection, and intersects the 4 fitted lines to produce exact corners.
 */

function bilinearSample(gray, gw, gh, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > gw - 1 || y > gh - 1) {
        return null;
    }
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1 < gw ? x0 + 1 : x0;
    const y1 = y0 + 1 < gh ? y0 + 1 : y0;
    const dx = x - x0;
    const dy = y - y0;

    const i00 = y0 * gw + x0;
    const i10 = y0 * gw + x1;
    const i01 = y1 * gw + x0;
    const i11 = y1 * gw + x1;

    return (
        gray[i00] * (1 - dx) * (1 - dy) +
        gray[i10] * dx * (1 - dy) +
        gray[i01] * (1 - dx) * dy +
        gray[i11] * dx * dy
    );
}

function fitLineTLS(points, refDir) {
    const n = points.length;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
        mx += points[i].x;
        my += points[i].y;
    }
    mx /= n;
    my /= n;

    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
        const dx = points[i].x - mx;
        const dy = points[i].y - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }

    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let ux = Math.cos(theta);
    let uy = Math.sin(theta);
    if (ux * refDir.x + uy * refDir.y < 0) {
        ux = -ux;
        uy = -uy;
    }

    return { px: mx, py: my, ux, uy };
}

function medianOf(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function fitRobustLine(points, refDir, requiredMin) {
    let active = points;
    let line = null;

    for (let iter = 0; iter < 3; iter++) {
        if (active.length < requiredMin) return null;
        line = fitLineTLS(active, refDir);

        const residuals = new Array(active.length);
        for (let i = 0; i < active.length; i++) {
            const dx = active[i].x - line.px;
            const dy = active[i].y - line.py;
            residuals[i] = Math.abs(dx * -line.uy + dy * line.ux);
        }

        const mad = medianOf(residuals);
        const thresh = Math.min(3.0, Math.max(1.0, 3 * 1.4826 * mad));
        const inliers = [];
        for (let i = 0; i < active.length; i++) {
            if (residuals[i] <= thresh) inliers.push(active[i]);
        }

        if (inliers.length === active.length) break;
        if (inliers.length < requiredMin) return null;
        active = inliers;
        line = fitLineTLS(active, refDir);
    }

    if (!line || active.length < requiredMin) return null;

    const finalResiduals = new Array(active.length);
    for (let i = 0; i < active.length; i++) {
        const dx = active[i].x - line.px;
        const dy = active[i].y - line.py;
        finalResiduals[i] = Math.abs(dx * -line.uy + dy * line.ux);
    }
    const finalMad = medianOf(finalResiduals);
    if (finalMad > 1.0) return null;

    return line;
}

function intersectLines(lineA, lineB) {
    const cross = lineA.ux * lineB.uy - lineA.uy * lineB.ux;
    if (Math.abs(cross) < 1e-6) return null;
    const dx = lineB.px - lineA.px;
    const dy = lineB.py - lineA.py;
    const t = (dx * lineB.uy - dy * lineB.ux) / cross;
    return {
        x: lineA.px + t * lineA.ux,
        y: lineA.py + t * lineA.uy,
    };
}

function passesSanityChecks(originalQuad, newQuad, band) {
    const maxShift = 1.5 * band;
    const maxCosAngle = Math.cos((60 * Math.PI) / 180); // [60°, 120°]

    for (let i = 0; i < 4; i++) {
        const p = newQuad[i];
        const orig = originalQuad[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
        if (Math.hypot(p.x - orig.x, p.y - orig.y) > maxShift) return false;
    }

    let expectedSign = 0;
    for (let i = 0; i < 4; i++) {
        const prev = newQuad[(i + 3) % 4];
        const curr = newQuad[i];
        const next = newQuad[(i + 1) % 4];

        const e1x = curr.x - prev.x;
        const e1y = curr.y - prev.y;
        const e2x = next.x - curr.x;
        const e2y = next.y - curr.y;

        const len1 = Math.hypot(e1x, e1y);
        const len2 = Math.hypot(e2x, e2y);
        if (len1 < 4 || len2 < 4) return false;

        const cosAngle = (e1x * e2x + e1y * e2y) / (len1 * len2);
        if (Math.abs(cosAngle) > maxCosAngle) return false;

        const cross = e1x * e2y - e1y * e2x;
        if (Math.abs(cross) < 1e-6) return false;
        const sign = cross > 0 ? 1 : -1;
        if (expectedSign === 0) {
            expectedSign = sign;
        } else if (sign !== expectedSign) {
            return false;
        }
    }

    return true;
}

/**
 * Refine a 4-corner quad against a grayscale ROI buffer.
 * @param {Float32Array} gray - luminance (0-255) of size gw * gh
 * @param {number} gw - ROI width
 * @param {number} gh - ROI height
 * @param {number} ox - ROI top-left X in image coords
 * @param {number} oy - ROI top-left Y in image coords
 * @param {{x: number, y: number}[]} quad - 4 corners ordered TL, TR, BR, BL
 * @param {{band?: number, step?: number, minSamples?: number, endTrim?: number}} [opts]
 * @returns {{corners: {x: number, y: number}[], refinedSides: number}}
 */
export function refineQuadOnGray(gray, gw, gh, ox, oy, quad, opts = {}) {
    if (!quad || quad.length !== 4) {
        return { corners: quad ? quad.map(p => ({ x: p.x, y: p.y })) : [], refinedSides: 0 };
    }

    const band = opts.band ?? 20;
    const step = opts.step ?? 0.5;
    const minSamples = opts.minSamples ?? 8;
    const endTrim = opts.endTrim ?? 0.12;

    const origCopy = quad.map(p => ({ x: p.x, y: p.y }));
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;

    const numS = Math.floor((2 * band) / step) + 1;
    if (numS < 5) {
        return { corners: origCopy, refinedSides: 0 };
    }

    const sideLines = new Array(4);
    let refinedSides = 0;

    for (let i = 0; i < 4; i++) {
        const p0 = quad[i];
        const p1 = quad[(i + 1) % 4];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const L = Math.hypot(dx, dy);

        if (L < 4) {
            sideLines[i] = { px: p0.x, py: p0.y, ux: 1, uy: 0 };
            continue;
        }

        const dir = { x: dx / L, y: dy / L };
        const fallbackLine = { px: p0.x, py: p0.y, ux: dir.x, uy: dir.y };

        let nx = -dir.y;
        let ny = dir.x;
        const midX = 0.5 * (p0.x + p1.x);
        const midY = 0.5 * (p0.y + p1.y);
        if (nx * (midX - cx) + ny * (midY - cy) < 0) {
            nx = -nx;
            ny = -ny;
        }

        const K = Math.max(12, Math.min(160, Math.round(L / 6)));
        const validProfiles = [];
        const sumG = new Float32Array(numS);
        const v = new Float32Array(numS);

        for (let m = 0; m < K; m++) {
            const t = K === 1 ? 0.5 : endTrim + ((1 - 2 * endTrim) * m) / (K - 1);
            const bx = p0.x + dir.x * (t * L);
            const by = p0.y + dir.y * (t * L);

            let valid = true;
            for (let k = 0; k < numS; k++) {
                const s = -band + k * step;
                // Image pixels are centered at (i + 0.5, j + 0.5) in canvas coordinates
                const val = bilinearSample(gray, gw, gh, bx + nx * s - ox - 0.5, by + ny * s - oy - 0.5);
                if (val === null) {
                    valid = false;
                    break;
                }
                v[k] = val;
            }
            if (!valid) continue;

            const g = new Float32Array(numS);
            const inv2Step = 1 / (2 * step);
            for (let k = 1; k < numS - 1; k++) {
                const deriv = (v[k + 1] - v[k - 1]) * inv2Step;
                g[k] = deriv;
                sumG[k] += deriv;
            }
            validProfiles.push({ bx, by, g });
        }

        const requiredMin = Math.max(minSamples, Math.ceil(0.3 * K));
        if (validProfiles.length < requiredMin) {
            sideLines[i] = fallbackLine;
            continue;
        }

        let bestAbsSum = 0;
        let signedBest = 0;
        for (let k = 2; k < numS - 2; k++) {
            const absVal = Math.abs(sumG[k]);
            if (absVal > bestAbsSum) {
                bestAbsSum = absVal;
                signedBest = sumG[k];
            }
        }
        if (bestAbsSum === 0) {
            sideLines[i] = fallbackLine;
            continue;
        }
        const polarity = signedBest > 0 ? 1 : -1;

        const edgePoints = [];
        const h = new Float32Array(numS);

        for (let pIdx = 0; pIdx < validProfiles.length; pIdx++) {
            const { bx, by, g } = validProfiles[pIdx];
            let maxH = -Infinity;
            for (let k = 1; k < numS - 1; k++) {
                const hk = polarity * g[k];
                h[k] = hk;
                if (k >= 2 && k <= numS - 3 && hk > maxH) {
                    maxH = hk;
                }
            }

            const thresh = Math.max(6, 0.5 * maxH);
            if (maxH < thresh) continue;

            // Choose the outermost local maximum (largest k) to prefer the outer card edge
            let chosenK = -1;
            for (let k = numS - 3; k >= 2; k--) {
                if (
                    h[k] >= thresh &&
                    h[k] >= h[k - 1] &&
                    h[k] >= h[k + 1] &&
                    (h[k] > h[k - 1] || h[k] > h[k + 1])
                ) {
                    chosenK = k;
                    break;
                }
            }
            if (chosenK === -1) continue;

            const hPrev = h[chosenK - 1];
            const hCurr = h[chosenK];
            const hNext = h[chosenK + 1];
            const denom = hPrev - 2 * hCurr + hNext;
            let delta = Math.abs(denom) > 1e-9 ? (0.5 * (hPrev - hNext)) / denom : 0;
            delta = Math.max(-0.5, Math.min(0.5, delta));

            const sStar = -band + (chosenK + delta) * step;
            edgePoints.push({ x: bx + nx * sStar, y: by + ny * sStar });
        }

        const fitted = fitRobustLine(edgePoints, dir, requiredMin);
        if (fitted) {
            sideLines[i] = fitted;
            refinedSides++;
        } else {
            sideLines[i] = fallbackLine;
        }
    }

    if (refinedSides === 0) {
        return { corners: origCopy, refinedSides: 0 };
    }

    const newCorners = new Array(4);
    for (let j = 0; j < 4; j++) {
        const hit = intersectLines(sideLines[(j + 3) % 4], sideLines[j]);
        newCorners[j] = hit || { x: origCopy[j].x, y: origCopy[j].y };
    }

    if (!passesSanityChecks(origCopy, newCorners, band)) {
        return { corners: origCopy, refinedSides: 0 };
    }

    return { corners: newCorners, refinedSides };
}

/**
 * Browser wrapper that extracts an ROI luminance buffer from srcCanvas and
 * refines the 4 corners of a single detected card.
 * @param {HTMLCanvasElement} srcCanvas
 * @param {{x: number, y: number}[]} quad
 * @param {{band?: number, step?: number, minSamples?: number, endTrim?: number}} [opts]
 * @returns {{x: number, y: number}[]}
 */
export function refineCardCorners(srcCanvas, quad, opts = {}) {
    if (!srcCanvas || !quad || quad.length !== 4) return quad;

    try {
        const band = opts.band ?? 20;
        const pad = Math.ceil(band + 3);

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of quad) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        const ox = Math.max(0, Math.floor(minX - pad));
        const oy = Math.max(0, Math.floor(minY - pad));
        const x2 = Math.min(srcCanvas.width, Math.ceil(maxX + pad));
        const y2 = Math.min(srcCanvas.height, Math.ceil(maxY + pad));
        const gw = x2 - ox;
        const gh = y2 - oy;

        if (gw < 8 || gh < 8) return quad;

        const ctx = srcCanvas.getContext('2d');
        const rgba = ctx.getImageData(ox, oy, gw, gh).data;
        const gray = new Float32Array(gw * gh);
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
            gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
        }

        const { corners } = refineQuadOnGray(gray, gw, gh, ox, oy, quad, opts);
        return corners;
    } catch (err) {
        console.warn('Edge refinement failed, using raw AI corners:', err);
        return quad;
    }
}
