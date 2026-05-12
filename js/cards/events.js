import { dom } from './dom.js';
import { state } from './state.js';
import { redraw, updateZoomWindow } from './renderer.js';
import { handleAutoDetect } from './cv-detector.js';
import { exportCards } from './export.js';
import { handleFileUpload, renderPdfPageForPreview } from './file-loader.js';
import { updateButtonStates, scrollToCorner, scrollToRectCard, applyModeUI } from './ui.js';
import { getMousePos, findPointNear, findCardContaining } from './utils.js';
import {
    getRectCardCorners,
    createRectCard,
    moveRectCard,
    rotateRectCard,
    pointInRectCard,
} from './rect-mode.js';
import { initCalculator } from './calculator.js';

// ---------------------------------------------------------------------------
// Placement helpers: find the first free top-left position for a new card
// ---------------------------------------------------------------------------

/**
 * For freeform mode: scan the canvas top→bottom, left→right with a step equal
 * to the card dimensions. Returns the first center {x, y} where a card of
 * size (w×h) does not overlap any existing freeform card.
 */
function findTopLeftFreePositionFreeform(w, h) {
    const canvasW = dom.sourceCanvas.width  || dom.canvas.width;
    const canvasH = dom.sourceCanvas.height || dom.canvas.height;
    const stepX = Math.max(1, Math.round(w));
    const stepY = Math.max(1, Math.round(h));
    const halfW = w / 2;
    const halfH = h / 2;

    for (let cy = halfH; cy + halfH <= canvasH; cy += stepY) {
        for (let cx = halfW; cx + halfW <= canvasW; cx += stepX) {
            if (!freeformCardOverlapsExisting(cx, cy)) {
                return snapFreeformPosition(cx, cy, canvasW, canvasH);
            }
        }
    }
    // Fallback: top-left corner
    return { x: halfW, y: halfH };
}

/**
 * Returns true if the CENTER point (cx, cy) falls inside any existing
 * freeform card's axis-aligned bounding box.
 */
function freeformCardOverlapsExisting(cx, cy) {
    for (const card of state.detectedCards) {
        const xs = card.map(p => p.x);
        const ys = card.map(p => p.y);
        const cl = Math.min(...xs), cr = Math.max(...xs);
        const ct = Math.min(...ys), cb = Math.max(...ys);
        if (cx >= cl && cx <= cr && cy >= ct && cy <= cb) return true;
    }
    return false;
}

/**
 * Snap the raw free-slot center (cx, cy) to the midpoint of the real gap
 * between neighboring cards' AABB edges. This corrects for the fact that
 * auto-detected cards may have margins not accounted for in the card size.
 *
 * X: centered between the right edge of the nearest left neighbor
 *    and the left edge of the nearest right neighbor.
 * Y: uses the average cy of cards in the same row (cards whose cy is
 *    within 75% of the card height), so new card aligns with the row.
 */
function snapFreeformPosition(cx, cy, canvasW, canvasH) {
    if (state.detectedCards.length === 0) return { x: cx, y: cy };

    const boxes = state.detectedCards.map(card => {
        const xs = card.map(p => p.x);
        const ys = card.map(p => p.y);
        const l = Math.min(...xs), r = Math.max(...xs);
        const t = Math.min(...ys), b = Math.max(...ys);
        return { cx: (l + r) / 2, cy: (t + b) / 2, l, r, t, b };
    });

    const cardH = boxes[0].b - boxes[0].t;

    // Same-row cards: cy within 75% of card height
    const sameRow = boxes.filter(b => Math.abs(b.cy - cy) < cardH * 0.75);

    // --- Snap X: search only within same-row cards ---
    const xPool = sameRow.length > 0 ? sameRow : boxes;
    let leftNeighbor = null, rightNeighbor = null;
    let leftDist = Infinity, rightDist = Infinity;
    for (const b of xPool) {
        if (b.cx < cx) {
            const d = cx - b.cx;
            if (d < leftDist) { leftDist = d; leftNeighbor = b; }
        } else if (b.cx > cx) {
            const d = b.cx - cx;
            if (d < rightDist) { rightDist = d; rightNeighbor = b; }
        }
    }
    const leftEdge  = leftNeighbor  ? leftNeighbor.r  : 0;
    const rightEdge = rightNeighbor ? rightNeighbor.l : canvasW;
    const snappedCx = (leftNeighbor || rightNeighbor)
        ? (leftEdge + rightEdge) / 2
        : cx;

    // --- Snap Y: align with same-row cards ---
    let snappedCy;
    if (sameRow.length > 0) {
        snappedCy = sameRow.reduce((s, b) => s + b.cy, 0) / sameRow.length;
    } else {
        let topNeighbor = null, bottomNeighbor = null;
        let topDist = Infinity, bottomDist = Infinity;
        for (const b of boxes) {
            if (b.cy < cy) {
                const d = cy - b.cy;
                if (d < topDist) { topDist = d; topNeighbor = b; }
            } else if (b.cy > cy) {
                const d = b.cy - cy;
                if (d < bottomDist) { bottomDist = d; bottomNeighbor = b; }
            }
        }
        const topEdge    = topNeighbor    ? topNeighbor.b    : 0;
        const bottomEdge = bottomNeighbor ? bottomNeighbor.t : canvasH;
        snappedCy = (topNeighbor || bottomNeighbor)
            ? (topEdge + bottomEdge) / 2
            : cy;
    }

    return { x: snappedCx, y: snappedCy };
}

/**
 * For rect mode: scan the canvas top→bottom, left→right with a step equal to
 * the card dimensions. Returns the first center {x, y} where a rect card does
 * not overlap any existing rect card.
 */
function findTopLeftFreePositionRect() {
    const W = state.rectWidth;
    const H = state.rectHeight;
    if (W <= 0 || H <= 0) return null;

    const canvasW = dom.canvas.width;
    const canvasH = dom.canvas.height;
    const stepX = Math.max(1, Math.round(W));
    const stepY = Math.max(1, Math.round(H));

    for (let cy = H / 2; cy + H / 2 <= canvasH; cy += stepY) {
        for (let cx = W / 2; cx + W / 2 <= canvasW; cx += stepX) {
            const candidate = createRectCard(cx, cy);
            if (!rectCardOverlapsExisting(candidate)) {
                return snapRectPosition(cx, cy, canvasW, canvasH);
            }
        }
    }
    // Fallback: top-left corner
    return { x: W / 2, y: H / 2 };
}

/**
 * Snap the raw rect-mode free-slot center to the midpoint of the actual gap
 * between neighboring rect cards' AABB edges.
 */
function snapRectPosition(cx, cy, canvasW, canvasH) {
    if (state.rectCards.length === 0) return { x: cx, y: cy };

    const boxes = state.rectCards.map(card => {
        const corners = getRectCardCorners(card);
        const xs = corners.map(p => p.x);
        const ys = corners.map(p => p.y);
        const l = Math.min(...xs), r = Math.max(...xs);
        const t = Math.min(...ys), b = Math.max(...ys);
        return { cx: (l + r) / 2, cy: (t + b) / 2, l, r, t, b };
    });

    let leftNeighbor = null, rightNeighbor = null;
    let leftDist = Infinity, rightDist = Infinity;
    for (const b of boxes) {
        if (b.cx < cx) {
            const d = cx - b.cx; if (d < leftDist)  { leftDist  = d; leftNeighbor  = b; }
        } else if (b.cx > cx) {
            const d = b.cx - cx; if (d < rightDist) { rightDist = d; rightNeighbor = b; }
        }
    }
    const leftEdge  = leftNeighbor  ? leftNeighbor.r  : 0;
    const rightEdge = rightNeighbor ? rightNeighbor.l : canvasW;
    const snappedCx = (leftNeighbor || rightNeighbor) ? (leftEdge + rightEdge) / 2 : cx;

    const H = state.rectHeight || (canvasH / 2);
    const sameRow = boxes.filter(b => Math.abs(b.cy - cy) < H * 0.75);
    let snappedCy;
    if (sameRow.length > 0) {
        snappedCy = sameRow.reduce((s, b) => s + b.cy, 0) / sameRow.length;
    } else {
        let topNeighbor = null, bottomNeighbor = null;
        let topDist = Infinity, bottomDist = Infinity;
        for (const b of boxes) {
            if (b.cy < cy) {
                const d = cy - b.cy; if (d < topDist)    { topDist    = d; topNeighbor    = b; }
            } else if (b.cy > cy) {
                const d = b.cy - cy; if (d < bottomDist) { bottomDist = d; bottomNeighbor = b; }
            }
        }
        const topEdge    = topNeighbor    ? topNeighbor.b    : 0;
        const bottomEdge = bottomNeighbor ? bottomNeighbor.t : canvasH;
        snappedCy = (topNeighbor || bottomNeighbor) ? (topEdge + bottomEdge) / 2 : cy;
    }

    return { x: snappedCx, y: snappedCy };
}

/**
 * Returns true if the CENTER point of the candidate rect card falls inside
 * any existing rect card's axis-aligned bounding box.
 */
function rectCardOverlapsExisting(candidate) {
    const corners = getRectCardCorners(candidate);
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    // Center of candidate
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

    for (const card of state.rectCards) {
        const ec = getRectCardCorners(card);
        const exs = ec.map(p => p.x);
        const eys = ec.map(p => p.y);
        const el = Math.min(...exs), er = Math.max(...exs);
        const et = Math.min(...eys), eb = Math.max(...eys);
        if (cx >= el && cx <= er && cy >= et && cy <= eb) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Freeform: delete selected card
// ---------------------------------------------------------------------------

export function deleteSelectedCard() {
    if (!state.selectedPoint) return;
    if (!confirm("Are you sure you want to unselect this card?")) return;
    const index = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
    if (index !== -1) {
        state.detectedCards.splice(index, 1);
        state.selectedPoint = null;
        updateButtonStates();
        redraw();
    }
}

// ---------------------------------------------------------------------------
// Rect-mode: delete selected card
// ---------------------------------------------------------------------------

function deleteSelectedRectCard() {
    if (state.selectedRectCardIndex === -1) return;
    if (!confirm("Are you sure you want to unselect this card?")) return;
    state.rectCards.splice(state.selectedRectCardIndex, 1);
    state.selectedRectCardIndex = state.rectCards.length > 0
        ? Math.min(state.selectedRectCardIndex, state.rectCards.length - 1)
        : -1;
    updateButtonStates();
    redraw();
}

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

function hasCards() {
    return state.detectedCards.length > 0 || state.rectCards.length > 0;
}

function switchMode(newMode) {
    if (state.editMode === newMode) return;

    if (hasCards()) {
        const msg = `You have ${state.detectedCards.length + state.rectCards.length} card(s). Switching modes will unselect all of them. Continue?`;
        if (!confirm(msg)) return;
    }

    state.detectedCards.length = 0;
    state.rectCards.length = 0;
    state.selectedPoint = null;
    state.selectedRectCardIndex = -1;
    state.editMode = newMode;

    applyModeUI(newMode);
    updateButtonStates();
    redraw();
}

// ---------------------------------------------------------------------------
// Auto-scroll (shared between both modes)
// ---------------------------------------------------------------------------

let autoScrollRaf = null;
let lastMouseClientX = 0;
let lastMouseClientY = 0;
const SCROLL_ZONE = 80;
const SCROLL_MAX  = 20;

function getScrollSpeed(distance) {
    const t = 1 - distance / SCROLL_ZONE;
    return Math.round(t * t * SCROLL_MAX);
}

function autoScrollStep() {
    const dragging = state.isDraggingPoint || state.isDraggingCard || state.isDraggingRectCard;
    if (!dragging) { autoScrollRaf = null; return; }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = lastMouseClientX;
    const cy = lastMouseClientY;

    let dx = 0, dy = 0;
    if (cx < SCROLL_ZONE)            dx = -getScrollSpeed(cx);
    else if (cx > vw - SCROLL_ZONE)  dx =  getScrollSpeed(vw - cx);
    if (cy < SCROLL_ZONE)            dy = -getScrollSpeed(cy);
    else if (cy > vh - SCROLL_ZONE)  dy =  getScrollSpeed(vh - cy);

    if (dx !== 0 || dy !== 0) {
        window.scrollBy(dx, dy);
        const scaleX = dom.canvas.getBoundingClientRect().width  / dom.canvas.width;
        const scaleY = dom.canvas.getBoundingClientRect().height / dom.canvas.height;

        if (state.isDraggingPoint && state.draggedPoint) {
            state.draggedPoint.x = Math.max(0, Math.min(dom.canvas.width,  state.draggedPoint.x + dx / scaleX));
            state.draggedPoint.y = Math.max(0, Math.min(dom.canvas.height, state.draggedPoint.y + dy / scaleY));
            redraw();
        } else if (state.isDraggingCard && state.draggedCard) {
            for (const pt of state.draggedCard) {
                pt.x = Math.max(0, Math.min(dom.canvas.width,  pt.x + dx / scaleX));
                pt.y = Math.max(0, Math.min(dom.canvas.height, pt.y + dy / scaleY));
            }
            redraw();
        } else if (state.isDraggingRectCard) {
            const card = state.rectCards[state.draggedRectCardIndex];
            if (card) {
                moveRectCard(card, dx / scaleX, dy / scaleY);
                redraw();
            }
        }
    }

    autoScrollRaf = requestAnimationFrame(autoScrollStep);
}

function startAutoScroll() {
    if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(autoScrollStep);
}

function stopAutoScroll() {
    if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
}

// ---------------------------------------------------------------------------
// Zoom window drag
// ---------------------------------------------------------------------------

let isDraggingZoom = false;
let zoomDragOffsetX = 0;
let zoomDragOffsetY = 0;

function handleZoomTitleMouseDown(e) {
    isDraggingZoom = true;
    const rect = dom.zoomContainer.getBoundingClientRect();
    zoomDragOffsetX = e.clientX - rect.left;
    zoomDragOffsetY = e.clientY - rect.top;
    e.preventDefault();
}

let isResizingZoom = false;
let zoomBaseWidth = 0;
let zoomBaseHeight = 0;
let zoomResizeStartX = 0;
let zoomResizeStartY = 0;

function handleZoomResizerMouseDown(e) {
    isResizingZoom = true;
    zoomBaseWidth = dom.zoomCanvas.width;
    zoomBaseHeight = dom.zoomCanvas.height;
    zoomResizeStartX = e.clientX;
    zoomResizeStartY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
}

// ---------------------------------------------------------------------------
// Read rect-mode pixel dimensions from inputs
// ---------------------------------------------------------------------------

function syncRectDimensions() {
    const w = parseFloat(dom.rectWidthPx.value)  || 0;
    const h = parseFloat(dom.rectHeightPx.value) || 0;
    const s = parseFloat(dom.rectSkewPx.value)   || 0;
    state.rectWidth  = w;
    state.rectHeight = h;
    state.rectSkew   = s;
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents() {
    initCalculator();
    // ── Buttons ─────────────────────────────────────────────────────────────
    dom.processButton.addEventListener('click', handleAutoDetect);
    dom.downloadButton.addEventListener('click', exportCards);
    dom.fileInput.addEventListener('change', handleFileUpload);
    dom.deleteButton.addEventListener('click', () => {
        if (state.editMode === 'rect') deleteSelectedRectCard();
        else deleteSelectedCard();
    });

    // Mode toggle
    dom.freeformModeBtn.addEventListener('click', () => switchMode('freeform'));
    dom.rectModeBtn.addEventListener('click',     () => switchMode('rect'));

    // Rect-mode dimension inputs → update state & redraw
    [dom.rectWidthPx, dom.rectHeightPx, dom.rectSkewPx].forEach(input => {
        input.addEventListener('input', () => { syncRectDimensions(); redraw(); });
    });

    dom.dpiInput.addEventListener('change', () => {
        if (state.isPdf && state.pdfDoc) {
            const requestedDpi = parseInt(dom.dpiInput.value) || 300;
            state.PDF_SCALE = requestedDpi / 72;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    dom.getSizeBtn.addEventListener("click", () => {
        if (state.detectedCards.length === 0) {
            alert("No cards available. Please add a manual card or detect cards first.");
            return;
        }

        const card = state.detectedCards[0];
        const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

        const w1 = dist(card[0], card[1]);
        const w2 = dist(card[2], card[3]);
        const h1 = dist(card[1], card[2]);
        const h2 = dist(card[3], card[0]);

        const avgW = (w1 + w2) / 2;
        const avgH = (h1 + h2) / 2;

        const pxW = Math.min(avgW, avgH);
        const pxH = Math.max(avgW, avgH);

        const dpi  = parseFloat(dom.dpiInput.value) || 300;
        const mmW  = (pxW * 25.4) / dpi;
        const mmH  = (pxH * 25.4) / dpi;

        dom.widthInput.value  = mmW.toFixed(1);
        dom.heightInput.value = mmH.toFixed(1);
    });

    dom.addManualButton.addEventListener('click', () => {
        if (!state.isImageLoaded) return;

        if (state.editMode === 'rect') {
            if (state.rectWidth <= 0 || state.rectHeight <= 0) {
                alert("Please set Width and Height (px) for Rectangle mode first.");
                return;
            }

            const pos = findTopLeftFreePositionRect();
            const card = createRectCard(pos.x, pos.y);
            state.rectCards.push(card);
            state.selectedRectCardIndex = state.rectCards.length - 1;
            // Scroll to the newly placed card
            const newCorners = getRectCardCorners(card);
            scrollToRectCard(card, newCorners);
        } else {
            // Determine card size from width/height/dpi inputs if available
            const dpi = parseFloat(dom.dpiInput.value) || 300;
            const mmW = parseFloat(dom.widthInput.value);
            const mmH = parseFloat(dom.heightInput.value);

            let w, h;
            if (mmW > 0 && mmH > 0) {
                w = (mmW * dpi) / 25.4;
                h = (mmH * dpi) / 25.4;
            } else {
                w = Math.min(dom.sourceCanvas.width * 0.2, dom.sourceCanvas.width * 0.4);
                if (w < 100) w = 100;
                h = w * 1.5;
            }

            const pos = findTopLeftFreePositionFreeform(w, h);
            const pts = [
                { x: pos.x - w/2, y: pos.y - h/2 },
                { x: pos.x + w/2, y: pos.y - h/2 },
                { x: pos.x + w/2, y: pos.y + h/2 },
                { x: pos.x - w/2, y: pos.y + h/2 },
            ];

            state.detectedCards.push(pts);
            // Select TL corner and scroll to it
            state.selectedPoint = pts[0];
            scrollToCorner(pts[0], 0);
        }

        updateButtonStates();
        redraw();
    });

    // ── Styles (freeform only) ───────────────────────────────────────────────
    dom.lineColor.addEventListener("input", redraw);
    document.querySelectorAll(".fixed-color-btn").forEach(btn => {
        btn.addEventListener("click", () => { dom.lineColor.value = btn.dataset.color; redraw(); });
    });

    dom.lineOpacity.addEventListener("input", (e) => {
        dom.lineOpacityVal.textContent = parseFloat(e.target.value).toFixed(2);
        redraw();
    });

    dom.zoomCheckbox.addEventListener("change", updateZoomWindow);

    dom.zoomTitle.addEventListener("mousedown", handleZoomTitleMouseDown);
    dom.zoomResizer.addEventListener("mousedown", handleZoomResizerMouseDown);

    // ── PDF Pagination ───────────────────────────────────────────────────────
    dom.prevPageBtn.addEventListener("click", () => {
        if (state.currentPreviewPage > 1) {
            state.currentPreviewPage--;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    dom.nextPageBtn.addEventListener("click", () => {
        if (state.pdfDoc && state.currentPreviewPage < state.pdfDoc.numPages) {
            state.currentPreviewPage++;
            renderPdfPageForPreview(state.currentPreviewPage);
        }
    });

    // ── Canvas Mouse Events ──────────────────────────────────────────────────
    dom.canvas.addEventListener("mousedown", (e) => {
        if (!state.isImageLoaded) return;
        dom.canvas.focus({ preventScroll: true });

        const pos = getMousePos(e);

        if (state.editMode === 'rect') {
            handleRectMouseDown(pos, e);
        } else {
            handleFreeformMouseDown(pos);
        }

        updateButtonStates();
        redraw();
    });

    dom.canvas.addEventListener("mousemove", (e) => {
        if (!state.isImageLoaded) return;
        const pos = getMousePos(e);

        if (state.editMode === 'rect') {
            handleRectMouseMove(pos, e);
        } else {
            handleFreeformMouseMove(pos, e);
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isDraggingZoom) {
            const x = e.clientX - zoomDragOffsetX;
            const y = e.clientY - zoomDragOffsetY;
            dom.zoomContainer.style.left = `${x}px`;
            dom.zoomContainer.style.top = `${y}px`;
        }
        if (isResizingZoom) {
            const dw = e.clientX - zoomResizeStartX;
            const dh = e.clientY - zoomResizeStartY;
            const newW = Math.max(150, zoomBaseWidth + dw);
            const newH = Math.max(150, zoomBaseHeight + dh);
            dom.zoomCanvas.width = newW;
            dom.zoomCanvas.height = newH;
            updateZoomWindow();
        }
    });

    window.addEventListener("mouseup", () => {
        isDraggingZoom = false;
        isResizingZoom = false;
        if (state.isDraggingPoint) {
            state.isDraggingPoint = false;
            state.draggedPoint    = null;
            stopAutoScroll();
            if (dom.canvas.matches(':hover')) {
                dom.canvas.style.cursor = state.hoveredPoint ? 'grab' : 'crosshair';
            }
        }
        if (state.isDraggingCard) {
            state.isDraggingCard = false;
            state.draggedCard    = null;
            stopAutoScroll();
            if (dom.canvas.matches(':hover')) dom.canvas.style.cursor = 'crosshair';
        }
        if (state.isDraggingRectCard) {
            state.isDraggingRectCard   = false;
            state.draggedRectCardIndex = -1;
            stopAutoScroll();
            if (dom.canvas.matches(':hover')) dom.canvas.style.cursor = 'move';
        }
    });

    // ── Keyboard Events ──────────────────────────────────────────────────────
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === 'INPUT') return;
        const tabCards = document.getElementById("tab-cards");
        if (tabCards && !tabCards.classList.contains("active")) return;

        // Global shortcuts (both modes)
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'o') { dom.fileInput.click(); return; }
            if (key === 'a') { if (!dom.processButton.disabled) dom.processButton.click(); return; }
            if (key === 'n') { if (!dom.addManualButton.disabled) dom.addManualButton.click(); return; }
            if (key === 'd') { if (!dom.deleteButton.disabled) dom.deleteButton.click(); return; }
            if (key === 's') { if (!dom.downloadButton.disabled) dom.downloadButton.click(); return; }
            if (key === 'z') {
                dom.zoomCheckbox.checked = !dom.zoomCheckbox.checked;
                dom.zoomCheckbox.dispatchEvent(new Event('change'));
                return;
            }
            if (key === '+' || key === '=') {
                if (state.editMode === 'rect') {
                    state.rectZoomLevel = Math.min(10, Math.round((state.rectZoomLevel + 0.5) * 10) / 10);
                } else {
                    state.zoomLevel = Math.min(10, Math.round((state.zoomLevel + 0.5) * 10) / 10);
                }
                redraw(); return;
            }
            if (key === '-' || key === '_') {
                if (state.editMode === 'rect') {
                    state.rectZoomLevel = Math.max(1, Math.round((state.rectZoomLevel - 0.5) * 10) / 10);
                } else {
                    state.zoomLevel = Math.max(1, Math.round((state.zoomLevel - 0.5) * 10) / 10);
                }
                redraw(); return;
            }
        }

        if (!state.isImageLoaded) return;

        // ── Rect-mode keyboard ──
        if (state.editMode === 'rect') {
            handleRectKeyDown(e);
            return;
        }

        // ── Freeform keyboard ──
        handleFreeformKeyDown(e);
    });
}

// ---------------------------------------------------------------------------
// Freeform mouse handlers
// ---------------------------------------------------------------------------

function createFreeformCardAt(cx, cy) {
    // Determine card size in canvas pixels
    const dpi  = parseFloat(dom.dpiInput.value) || 300;
    const mmW  = parseFloat(dom.widthInput.value);
    const mmH  = parseFloat(dom.heightInput.value);

    let w, h;

    if (mmW > 0 && mmH > 0) {
        // Use values from the width/height fields
        w = (mmW * dpi) / 25.4;
        h = (mmH * dpi) / 25.4;
    } else if (state.selectedPoint) {
        // Derive size from the currently selected card
        const selCard = state.detectedCards.find(c => c.includes(state.selectedPoint));
        if (selCard) {
            const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
            const w1 = dist(selCard[0], selCard[1]);
            const w2 = dist(selCard[2], selCard[3]);
            const h1 = dist(selCard[1], selCard[2]);
            const h2 = dist(selCard[3], selCard[0]);
            w = (w1 + w2) / 2;
            h = (h1 + h2) / 2;
        }
    }

    if (!w || !h) {
        // Fallback: placeholder values (61 mm × 112 mm at 300 DPI)
        const phW = parseFloat(dom.widthInput.placeholder)  || 61;
        const phH = parseFloat(dom.heightInput.placeholder) || 112;
        w = (phW * dpi) / 25.4;
        h = (phH * dpi) / 25.4;
    }

    return [
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
        { x: cx - w / 2, y: cy + h / 2 },
    ];
}

function handleFreeformMouseDown(pos) {
    const hitPoint = findPointNear(pos.x, pos.y);

    if (hitPoint) {
        state.selectedPoint   = hitPoint;
        state.isDraggingPoint = true;
        state.draggedPoint    = hitPoint;
    } else {
        const hitCard = findCardContaining(pos.x, pos.y);
        if (hitCard) {
            state.isDraggingCard = true;
            state.draggedCard    = hitCard;
            state.dragStartX     = pos.x;
            state.dragStartY     = pos.y;
            state.selectedPoint  = hitCard[0];
        } else {
            // Click on empty space → add new card centred at click point
            const newCard = createFreeformCardAt(pos.x, pos.y);
            state.detectedCards.push(newCard);
            state.selectedPoint  = newCard[0];
            // Start dragging immediately so the user can reposition it
            state.isDraggingCard = true;
            state.draggedCard    = newCard;
            state.dragStartX     = pos.x;
            state.dragStartY     = pos.y;
        }
    }
}

function handleFreeformMouseMove(pos, e) {
    if (state.isDraggingPoint && state.draggedPoint) {
        lastMouseClientX = e.clientX;
        lastMouseClientY = e.clientY;
        state.draggedPoint.x = Math.max(0, Math.min(dom.canvas.width,  pos.x));
        state.draggedPoint.y = Math.max(0, Math.min(dom.canvas.height, pos.y));
        dom.canvas.style.cursor = 'grabbing';
        startAutoScroll();
        redraw();
    } else if (state.isDraggingCard && state.draggedCard) {
        lastMouseClientX = e.clientX;
        lastMouseClientY = e.clientY;
        const dx = pos.x - state.dragStartX;
        const dy = pos.y - state.dragStartY;
        for (const pt of state.draggedCard) {
            pt.x = Math.max(0, Math.min(dom.canvas.width,  pt.x + dx));
            pt.y = Math.max(0, Math.min(dom.canvas.height, pt.y + dy));
        }
        state.dragStartX = pos.x;
        state.dragStartY = pos.y;
        dom.canvas.style.cursor = 'grabbing';
        startAutoScroll();
        redraw();
    } else {
        state.hoveredPoint = findPointNear(pos.x, pos.y);
        state.hoveredCard  = findCardContaining(pos.x, pos.y);
        dom.canvas.style.cursor =
            state.hoveredPoint ? 'grab' :
            state.hoveredCard  ? 'move' : 'crosshair';
        redraw();
    }
}

// ---------------------------------------------------------------------------
// Rect-mode mouse handlers
// ---------------------------------------------------------------------------

function handleRectMouseDown(pos, e) {
    // Find which rect card (if any) was hit — iterate in reverse so topmost card wins
    let hitIdx = -1;
    for (let i = state.rectCards.length - 1; i >= 0; i--) {
        if (pointInRectCard(pos.x, pos.y, state.rectCards[i])) {
            hitIdx = i;
            break;
        }
    }

    if (hitIdx !== -1) {
        state.selectedRectCardIndex = hitIdx;
        state.isDraggingRectCard    = true;
        state.draggedRectCardIndex  = hitIdx;
        state.dragRectStartX        = pos.x;
        state.dragRectStartY        = pos.y;
    } else {
        // Click outside all cards → add new card centred at click
        if (state.rectWidth <= 0 || state.rectHeight <= 0) {
            alert("Please set Width and Height (px) for Rectangle mode first.");
            return;
        }
        const card = createRectCard(pos.x, pos.y);
        state.rectCards.push(card);
        state.selectedRectCardIndex = state.rectCards.length - 1;
        // Start dragging immediately so the user can reposition it
        state.isDraggingRectCard   = true;
        state.draggedRectCardIndex = state.selectedRectCardIndex;
        state.dragRectStartX       = pos.x;
        state.dragRectStartY       = pos.y;
    }
}

function handleRectMouseMove(pos, e) {
    if (state.isDraggingRectCard) {
        lastMouseClientX   = e.clientX;
        lastMouseClientY   = e.clientY;
        const card = state.rectCards[state.draggedRectCardIndex];
        if (card) {
            const dx = pos.x - state.dragRectStartX;
            const dy = pos.y - state.dragRectStartY;
            moveRectCard(card, dx, dy);
            state.dragRectStartX = pos.x;
            state.dragRectStartY = pos.y;
        }
        dom.canvas.style.cursor = 'grabbing';
        startAutoScroll();
        redraw();
    } else {
        // Hover detection
        let hoveredIdx = -1;
        for (let i = state.rectCards.length - 1; i >= 0; i--) {
            if (pointInRectCard(pos.x, pos.y, state.rectCards[i])) {
                hoveredIdx = i;
                break;
            }
        }
        state.hoveredRectCardIndex = hoveredIdx;
        dom.canvas.style.cursor    = hoveredIdx !== -1 ? 'move' : 'crosshair';
        redraw();
    }
}

// ---------------------------------------------------------------------------
// Freeform keyboard handler
// ---------------------------------------------------------------------------

function handleFreeformKeyDown(e) {
    if ((e.key === "Tab" || e.code === "Slash" || e.key === "/" || e.key === ".") && document.activeElement === dom.canvas) {
        e.preventDefault();

        if (state.detectedCards.length === 0) return;

        if (e.shiftKey) {
            if (!state.selectedPoint) {
                state.selectedPoint = state.detectedCards[0][0];
            } else {
                const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                if (cardIdx !== -1) {
                    const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                    state.selectedPoint = state.detectedCards[cardIdx][(cornerIdx + 3) % 4];
                }
            }
        } else {
            if (!state.selectedPoint) {
                state.selectedPoint = state.detectedCards[0][0];
            } else {
                const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                if (cardIdx !== -1) {
                    const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                    state.selectedPoint = state.detectedCards[cardIdx][(cornerIdx + 1) % 4];
                }
            }
        }

        const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
        if (cardIdx !== -1) {
            const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
            scrollToCorner(state.selectedPoint, cornerIdx);
        }

        updateButtonStates();
        redraw();
        return;
    }

    if (e.key === "Enter" && document.activeElement === dom.canvas) {
        e.preventDefault();
        if (state.detectedCards.length === 0) return;

        if (!state.selectedPoint) {
            state.selectedPoint = state.detectedCards[0][0];
        } else {
            const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
            if (e.shiftKey) {
                const prevCardIdx = (cardIdx - 1 + state.detectedCards.length) % state.detectedCards.length;
                state.selectedPoint = state.detectedCards[prevCardIdx][0];
            } else {
                const nextCardIdx = (cardIdx + 1) % state.detectedCards.length;
                state.selectedPoint = state.detectedCards[nextCardIdx][0];
            }
        }

        scrollToCorner(state.selectedPoint, 0);
        updateButtonStates();
        redraw();
        return;
    }

    // Colour cycle (freeform only)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'c' || key === 'с') {
            const colors = ['#000000', '#ffffff', '#808080', '#00ff00', '#0000ff', '#ff0000'];
            let currentIndex = colors.indexOf(dom.lineColor.value.toLowerCase());
            const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % colors.length;
            dom.lineColor.value = colors[nextIndex];
            redraw();
            return;
        }
    }

    if (!state.selectedPoint) return;

    let step    = (e.ctrlKey || e.metaKey) ? 10 : 1;
    let handled = false;
    let dx = 0, dy = 0;

    if      (e.key === "ArrowLeft")  { dx = -step; handled = true; }
    else if (e.key === "ArrowRight") { dx =  step; handled = true; }
    else if (e.key === "ArrowUp")    { dy = -step; handled = true; }
    else if (e.key === "ArrowDown")  { dy =  step; handled = true; }
    else if (e.key === "Delete" || e.key === "Backspace") { deleteSelectedCard(); handled = true; }

    if (handled && (dx !== 0 || dy !== 0)) {
        const oldX = state.selectedPoint.x;
        const oldY = state.selectedPoint.y;

        state.selectedPoint.x = Math.max(0, Math.min(dom.canvas.width,  state.selectedPoint.x + dx));
        state.selectedPoint.y = Math.max(0, Math.min(dom.canvas.height, state.selectedPoint.y + dy));

        const actualDx = state.selectedPoint.x - oldX;
        const actualDy = state.selectedPoint.y - oldY;

        if (e.shiftKey && (actualDx !== 0 || actualDy !== 0)) {
            const cardIndex = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
            if (cardIndex !== -1) {
                const card       = state.detectedCards[cardIndex];
                const pointIndex = card.indexOf(state.selectedPoint);

                if (actualDx !== 0) {
                    const partnerXIndex = 3 - pointIndex;
                    card[partnerXIndex].x = Math.max(0, Math.min(dom.canvas.width, card[partnerXIndex].x + actualDx));
                }
                if (actualDy !== 0) {
                    const partnerYIndex = pointIndex ^ 1;
                    card[partnerYIndex].y = Math.max(0, Math.min(dom.canvas.height, card[partnerYIndex].y + actualDy));
                }
            }
        }
    }

    if (handled) { e.preventDefault(); redraw(); }
}

// ---------------------------------------------------------------------------
// Rect-mode keyboard handler
// ---------------------------------------------------------------------------

function handleRectKeyDown(e) {
    // Navigation: Enter / Shift+Enter (next / prev card)
    if (e.key === "Enter" && document.activeElement === dom.canvas) {
        e.preventDefault();
        if (state.rectCards.length === 0) return;

        if (state.selectedRectCardIndex === -1) {
            state.selectedRectCardIndex = 0;
        } else {
            const n = state.rectCards.length;
            if (e.shiftKey) {
                state.selectedRectCardIndex = (state.selectedRectCardIndex - 1 + n) % n;
            } else {
                state.selectedRectCardIndex = (state.selectedRectCardIndex + 1) % n;
            }
        }

        const card    = state.rectCards[state.selectedRectCardIndex];
        const corners = getRectCardCorners(card);
        scrollToRectCard(card, corners);
        updateButtonStates();
        redraw();
        return;
    }

    if (state.selectedRectCardIndex === -1) return;

    const card = state.rectCards[state.selectedRectCardIndex];

    // Rotation: / (English) or . (Ukrainian physical key).
    // e.code === 'Slash' covers both layouts on that physical key.
    // Guard against keyboard auto-repeat — each press is one deliberate step.
    if (e.code === 'Slash') {
        e.preventDefault();
        if (e.repeat) return;                         // ignore auto-repeat
        const delta = e.shiftKey ? -0.05 : 0.05;     // 0.05\u00B0 per press
        rotateRectCard(card, delta);
        redraw();
        return;
    }

    // Arrow keys: move card
    let step = (e.ctrlKey || e.metaKey) ? 10 : 1;
    let dx = 0, dy = 0;
    let handled = false;

    if      (e.key === "ArrowLeft")  { dx = -step; handled = true; }
    else if (e.key === "ArrowRight") { dx =  step; handled = true; }
    else if (e.key === "ArrowUp")    { dy = -step; handled = true; }
    else if (e.key === "ArrowDown")  { dy =  step; handled = true; }
    else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelectedRectCard();
        handled = true;
    }

    if (handled && (dx !== 0 || dy !== 0)) {
        moveRectCard(card, dx, dy);
    }

    if (handled) { e.preventDefault(); redraw(); }
}
