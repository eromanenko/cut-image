import { state } from './state.js';

// ---------------------------------------------------------------------------
// Core geometry
// ---------------------------------------------------------------------------

/**
 * Rotate a single point around a center by angleRad radians.
 */
function rotatePoint(pt, center, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

/**
 * Return the geometric center of a rect-mode card (in canvas coordinates).
 * The unrotated parallelogram TL is at (card.x, card.y), so the center lies at:
 *   cx = card.x + W/2
 *   cy = card.y + S/2 + H/2
 * where W=rectWidth, H=rectHeight, S=rectSkew.
 */
export function getRectCardCenter(card) {
    const W = state.rectWidth;
    const H = state.rectHeight;
    const S = state.rectSkew;
    return {
        x: card.x + W / 2,
        y: card.y + S / 2 + H / 2,
    };
}

/**
 * Compute the 4 canvas corners of a rect-mode card.
 * Corner order: [TL, TR, BR, BL] — same convention as freeform mode.
 *
 * Unrotated parallelogram:
 *   TL = (x,      y          )
 *   TR = (x + W,  y + S      )
 *   BR = (x + W,  y + S + H  )
 *   BL = (x,      y + H      )
 * Then the whole shape is rotated by card.angle° around the center.
 */
export function getRectCardCorners(card) {
    const W = state.rectWidth;
    const H = state.rectHeight;
    const S = state.rectSkew;

    const unrotated = [
        { x: card.x,     y: card.y         },  // TL
        { x: card.x + W, y: card.y + S     },  // TR
        { x: card.x + W, y: card.y + S + H },  // BR
        { x: card.x,     y: card.y + H     },  // BL
    ];

    if (card.angle === 0) return unrotated;

    const center = getRectCardCenter(card);
    const angleRad = (card.angle * Math.PI) / 180;
    return unrotated.map(pt => rotatePoint(pt, center, angleRad));
}

// ---------------------------------------------------------------------------
// Card CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Create a new rect-mode card whose *center* sits at (cx, cy).
 */
export function createRectCard(cx, cy) {
    const W = state.rectWidth;
    const H = state.rectHeight;
    const S = state.rectSkew;
    return {
        x: cx - W / 2,
        y: cy - S / 2 - H / 2,
        angle: 0,
    };
}

/** Translate a rect-mode card by (dx, dy). */
export function moveRectCard(card, dx, dy) {
    card.x += dx;
    card.y += dy;
}

/**
 * Rotate a rect-mode card by deltaDeg degrees around its own center.
 * The center remains fixed, so (card.x, card.y) shifts correspondingly.
 */
export function rotateRectCard(card, deltaDeg) {
    const oldCenter = getRectCardCenter(card);
    card.angle = (card.angle + deltaDeg) % 360;
    // After the angle changes the stored (x,y) — which is the TL of the
    // *unrotated* parallelogram — must be recalculated so the visual center
    // stays in the same place.
    const newCenter = getRectCardCenter(card);
    card.x += oldCenter.x - newCenter.x;
    card.y += oldCenter.y - newCenter.y;
}

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/** Ray-casting polygon point-in-polygon test. */
function pointInPolygon(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > py) !== (yj > py)) &&
            (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Returns true if canvas point (px, py) is inside the given rect-mode card.
 */
export function pointInRectCard(px, py, card) {
    return pointInPolygon(px, py, getRectCardCorners(card));
}

// ---------------------------------------------------------------------------
// CV-detector helper
// ---------------------------------------------------------------------------

/**
 * Given 4 detected corner points (TL, TR, BR, BL order from freeform detector),
 * produce a rect-mode card { x, y, angle } that best fits them, using the
 * current global rectWidth / rectHeight / rectSkew dimensions.
 */
export function fitRectCardToDetected(corners4pts) {
    // Center of the detected quad
    const cx = corners4pts.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners4pts.reduce((s, p) => s + p.y, 0) / 4;

    // Angle from the top edge TL→TR
    const tl = corners4pts[0];
    const tr = corners4pts[1];
    const angle = Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180 / Math.PI;

    // Build a card centered at (cx, cy) with this angle.
    const W = state.rectWidth;
    const H = state.rectHeight;
    const S = state.rectSkew;

    const card = { x: cx - W / 2, y: cy - S / 2 - H / 2, angle };
    // Compensate so center of the *new* card lands exactly at (cx, cy)
    const center = getRectCardCenter(card);
    card.x += cx - center.x;
    card.y += cy - center.y;
    return card;
}


export function sortRectCards() {
    if (state.rectCards.length <= 1) return;
    const selectedCard = state.selectedRectCardIndex >= 0
        ? state.rectCards[state.selectedRectCardIndex] : null;
    const rowTolerance = (state.rectHeight || 100) * 0.5;
    state.rectCards.sort((a, b) => {
        const ca = getRectCardCenter(a);
        const cb = getRectCardCenter(b);
        if (Math.abs(ca.y - cb.y) < rowTolerance) return ca.x - cb.x;
        return ca.y - cb.y;
    });
    if (selectedCard !== null) {
        state.selectedRectCardIndex = state.rectCards.indexOf(selectedCard);
    }
}
