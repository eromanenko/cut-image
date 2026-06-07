import { dom } from './dom.js';
import { state } from './state.js';
import { redraw, updateZoomWindow } from './renderer.js';
import { handleAutoDetect } from './cv-detector.js';
import { exportCards } from './export.js';
import { handleFileUpload, renderPdfPageForPreview } from './file-loader.js';
import { updateButtonStates, scrollToCorner, scrollToRectCard, applyModeUI, showIniStatsModal, pulseViewCoordsButton, updateSettingsSummary, loadSettingsFromStorage, saveSettingsToStorage, resetSettingsToDefault } from './ui.js';
import { showAlert, showConfirm } from '../dialogs.js';
import { getMousePos, findPointNear, findCardContaining, getPadding } from './utils.js';
import {
    getRectCardCorners,
    createRectCard,
    moveRectCard,
    rotateRectCard,
    pointInRectCard,
} from './rect-mode.js';
import { initCalculator, openCalculator } from './calculator.js';
import { saveCurrentToDatabase, serializeDatabaseToIni, parseIniToDatabase } from './ini-handler.js';

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
    return snapToGap(cx, cy, boxes, cardH, canvasW, canvasH, true);
}

/**
 * For rect mode: scan the canvas top→bottom, left→right with a step equal to
 * the card dimensions. Returns the first center {x, y} where a rect card does
 * not overlap any existing rect card.
 */
function findTopLeftFreePositionRect(angle = 0) {
    const W = state.rectWidth;
    const H = state.rectHeight;
    if (W <= 0 || H <= 0) return null;

    const canvasW = dom.canvas.width;
    const canvasH = dom.canvas.height;
    const stepX = Math.max(1, Math.round(W));
    const stepY = Math.max(1, Math.round(H));

    for (let cy = H / 2; cy + H / 2 <= canvasH; cy += stepY) {
        for (let cx = W / 2; cx + W / 2 <= canvasW; cx += stepX) {
            const candidate = createRectCard(cx, cy, angle);
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

    const cardH = state.rectHeight || (canvasH / 2);
    return snapToGap(cx, cy, boxes, cardH, canvasW, canvasH, false);
}

/**
 * Shared snap implementation: given a list of AABB boxes, snap (cx, cy) to
 * the midpoint of the gap between its nearest neighbors.
 *
 * @param {number}  cx         - raw candidate center X
 * @param {number}  cy         - raw candidate center Y
 * @param {Array}   boxes      - [{cx, cy, l, r, t, b}] existing card AABBs
 * @param {number}  cardH      - reference card height for same-row detection
 * @param {number}  canvasW    - canvas width (fallback edge)
 * @param {number}  canvasH    - canvas height (fallback edge)
 * @param {boolean} useRowForX - if true, X-search is limited to same-row cards
 */
function snapToGap(cx, cy, boxes, cardH, canvasW, canvasH, useRowForX) {
    // Cards whose centre-Y is within 75% of cardH are considered the same row
    const sameRow = boxes.filter(b => Math.abs(b.cy - cy) < cardH * 0.75);

    // --- Snap X ---
    const xPool = (useRowForX && sameRow.length > 0) ? sameRow : boxes;
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

    // --- Snap Y ---
    let snappedCy;
    if (sameRow.length > 0) {
        snappedCy = sameRow.reduce((s, b) => s + b.cy, 0) / sameRow.length;
    } else {
        let topNeighbor = null, bottomNeighbor = null;
        let topDist = Infinity, bottomDist = Infinity;
        for (const b of boxes) {
            if (b.cy < cy) {
                const d = cy - b.cy;
                if (d < topDist)    { topDist    = d; topNeighbor    = b; }
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

export async function deleteSelectedCard() {
    if (!state.selectedPoint) return;
    const index = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
    if (index !== -1) {
        state.detectedCards.splice(index, 1);
        if (state.detectedCards.length > 0) {
            const nextIndex = Math.min(index, state.detectedCards.length - 1);
            state.selectedPoint = state.detectedCards[nextIndex][0];
        } else {
            state.selectedPoint = null;
        }
        saveCurrentToDatabase();
        updateButtonStates();
        redraw();
    }
}

// ---------------------------------------------------------------------------
// Rect-mode: delete selected card
// ---------------------------------------------------------------------------

async function deleteSelectedRectCard() {
    if (state.selectedRectCardIndex === -1) return;
    state.rectCards.splice(state.selectedRectCardIndex, 1);
    state.selectedRectCardIndex = state.rectCards.length > 0
        ? Math.min(state.selectedRectCardIndex, state.rectCards.length - 1)
        : -1;
    saveCurrentToDatabase();
    updateButtonStates();
    redraw();
}

// ---------------------------------------------------------------------------
// Mode switching
// ---------------------------------------------------------------------------

function hasCards() {
    return state.detectedCards.length > 0 || state.rectCards.length > 0;
}

async function switchMode(newMode) {
    if (state.editMode === newMode) return;

    if (hasCards()) {
        const msg = `You have ${state.detectedCards.length + state.rectCards.length} card(s). Switching modes will unselect all of them. Continue?`;
        const proceed = await showConfirm(msg);
        if (!proceed) return;
    }

    state.detectedCards.length = 0;
    state.rectCards.length = 0;
    state.selectedPoint = null;
    state.selectedRectCardIndex = -1;
    state.editMode = newMode;

    saveCurrentToDatabase();
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
// Continuous rotation state
// ---------------------------------------------------------------------------

let isRotatingCard = false;
let rotationDelta = 0;
let rotationTargetCard = null;

function rotationLoop() {
    if (!isRotatingCard || !rotationTargetCard) return;
    rotateRectCard(rotationTargetCard, rotationDelta);
    redraw();
    requestAnimationFrame(rotationLoop);
}

// ---------------------------------------------------------------------------
// bindEvents
// ---------------------------------------------------------------------------

export function bindEvents() {
    initCalculator();
    // ── Buttons ─────────────────────────────────────────────────────────────
    dom.processButton.addEventListener('click', handleAutoDetect);
    dom.downloadButton.addEventListener('click', () => { exportCards(); dom.canvas.focus({ preventScroll: true }); });
    dom.fileInput.addEventListener('change', handleFileUpload);

    if (dom.saveCoordsButton) {
        dom.saveCoordsButton.addEventListener('click', () => {
            const ini = serializeDatabaseToIni();
            if (!ini) return;
            const blob = new Blob([ini], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cut-coords.ini';
            a.click();
            URL.revokeObjectURL(url);
            state.hasUnsavedChanges = false;
            dom.canvas.focus({ preventScroll: true });
        });
    }

    if (dom.viewCoordsButton) {
        dom.viewCoordsButton.addEventListener('click', () => {
            saveCurrentToDatabase(false);
            showIniStatsModal(state.coordsDatabase);
            dom.canvas.focus({ preventScroll: true });
        });
    }

    if (dom.loadCoordsButton) {
        dom.loadCoordsButton.addEventListener('click', () => {
            dom.loadCoordsInput.click();
        });
        dom.loadCoordsInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                parseIniToDatabase(ev.target.result);
                state.hasUnsavedChanges = false;
                showIniStatsModal(state.coordsDatabase);
                updateButtonStates();
                dom.canvas.focus({ preventScroll: true });
            };
            reader.readAsText(file);
            // clear value so it can be selected again
            e.target.value = '';
        });
    }

    if (dom.iniStatsOkBtn) dom.iniStatsOkBtn.addEventListener('click', () => { dom.iniStatsModal.style.display = 'none'; pulseViewCoordsButton(); dom.canvas.focus({ preventScroll: true }); });
    if (dom.iniStatsCancelX) dom.iniStatsCancelX.addEventListener('click', () => { dom.iniStatsModal.style.display = 'none'; pulseViewCoordsButton(); dom.canvas.focus({ preventScroll: true }); });

    if (dom.iniStatsLoadMoreBtn && dom.iniStatsLoadMoreInput) {
        dom.iniStatsLoadMoreBtn.addEventListener('click', () => {
            dom.iniStatsLoadMoreInput.click();
        });
        dom.iniStatsLoadMoreInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                parseIniToDatabase(ev.target.result, true); // true = merge
                state.hasUnsavedChanges = false;
                showIniStatsModal(state.coordsDatabase);
                updateButtonStates();
                dom.canvas.focus({ preventScroll: true });
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    // ── Settings Modal ──────────────────────────────────────────────────────
    if (dom.settingsBtn) {
        dom.settingsBtn.addEventListener('click', () => {
            dom.settingsModal.style.display = 'flex';
        });
    }
    const closeSettingsModal = () => {
        dom.settingsModal.style.display = 'none';
        saveSettingsToStorage();
        updateSettingsSummary();
        redraw();
        dom.canvas.focus({ preventScroll: true });
    };
    if (dom.settingsCancelX) dom.settingsCancelX.addEventListener('click', closeSettingsModal);
    if (dom.settingsOkBtn) dom.settingsOkBtn.addEventListener('click', closeSettingsModal);
    
    if (dom.settingsResetBtn) {
        dom.settingsResetBtn.addEventListener('click', () => {
            resetSettingsToDefault();
            updateSettingsSummary();
            redraw();
        });
    }
    
    // Initial update
    loadSettingsFromStorage();
    updateSettingsSummary();

    // Mode toggle
    dom.freeformModeBtn.addEventListener('click', () => { switchMode('freeform'); dom.canvas.focus({ preventScroll: true }); });
    dom.rectModeBtn.addEventListener('click',     () => { switchMode('rect'); dom.canvas.focus({ preventScroll: true }); });

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

    dom.sizeListContainer.addEventListener("click", async (e) => {
        const calcBtn = e.target.closest('.ceFreeformCalcBtn');
        if (calcBtn) {
            const row = calcBtn.closest('.ce-size-row');
            openCalculator('freeform', row);
            return;
        }

        const getBtn = e.target.closest('.ceGetSizeBtn');
        if (getBtn) {
            if (state.detectedCards.length === 0) {
                await showAlert("No cards available. Please add a manual card or detect cards first.");
                return;
            }

            let card = null;
            if (state.selectedPoint) {
                card = state.detectedCards.find(c => c.includes(state.selectedPoint));
            }
            if (!card) card = state.detectedCards[0];

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

            const row = getBtn.closest('.ce-size-row');
            row.querySelector('.ceWidthInput').value  = mmW.toFixed(1);
            row.querySelector('.ceHeightInput').value = mmH.toFixed(1);
            dom.canvas.focus({ preventScroll: true });
            return;
        }

        const rmBtn = e.target.closest('.ceRemoveSizeBtn');
        if (rmBtn) {
            const row = rmBtn.closest('.ce-size-row');
            row.remove();
            const rows = dom.sizeListContainer.querySelectorAll('.ce-size-row');
            if (rows.length === 1) {
                rows[0].querySelector('.ceRemoveSizeBtn').style.display = 'none';
            }
            dom.canvas.focus({ preventScroll: true });
            return;
        }
    });

    dom.addSizeBtn.addEventListener("click", () => {
        const rows = dom.sizeListContainer.querySelectorAll('.ce-size-row');
        const newRow = rows[0].cloneNode(true);
        newRow.querySelector('.ceWidthInput').value = '';
        newRow.querySelector('.ceHeightInput').value = '';
        
        rows[0].querySelector('.ceRemoveSizeBtn').style.display = '';
        newRow.querySelector('.ceRemoveSizeBtn').style.display = '';
        
        dom.sizeListContainer.appendChild(newRow);
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
            dom.canvas.focus({ preventScroll: true });
        }
    });

    dom.nextPageBtn.addEventListener("click", () => {
        if (state.pdfDoc && state.currentPreviewPage < state.pdfDoc.numPages) {
            state.currentPreviewPage++;
            renderPdfPageForPreview(state.currentPreviewPage);
            dom.canvas.focus({ preventScroll: true });
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
        let coordsChanged = false;
        if (state.isDraggingPoint) {
            state.isDraggingPoint = false;
            state.draggedPoint    = null;
            stopAutoScroll();
            coordsChanged = true;
            if (dom.canvas.matches(':hover')) {
                dom.canvas.style.cursor = state.hoveredPoint ? 'grab' : 'crosshair';
            }
        }
        if (state.isDraggingCard) {
            state.isDraggingCard = false;
            state.draggedCard    = null;
            stopAutoScroll();
            coordsChanged = true;
            if (dom.canvas.matches(':hover')) dom.canvas.style.cursor = 'crosshair';
        }
        if (state.isDraggingRectCard) {
            state.isDraggingRectCard   = false;
            state.draggedRectCardIndex = -1;
            stopAutoScroll();
            coordsChanged = true;
            if (dom.canvas.matches(':hover')) dom.canvas.style.cursor = 'move';
        }
        if (coordsChanged) saveCurrentToDatabase();
    });

    // ── Keyboard Events ──────────────────────────────────────────────────────
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === 'INPUT') return;
        const tabCards = document.getElementById("tab-cards");
        if (tabCards && !tabCards.classList.contains("active")) return;

        // Global shortcuts (both modes)
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            const key = e.key.toLowerCase();
            const code = e.code;
            if (key === 'o' || key === 'о' || code === 'KeyO') { dom.fileInput.click(); e.preventDefault(); return; }
            if (key === 'a' || key === 'ф' || code === 'KeyA') { if (!dom.processButton.disabled) dom.processButton.click(); e.preventDefault(); return; }
            if (key === 's' || key === 'і' || key === 'ы' || code === 'KeyS') { if (!dom.downloadButton.disabled) dom.downloadButton.click(); e.preventDefault(); return; }
            if (key === 'z' || key === 'я' || code === 'KeyZ') {
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

    window.addEventListener("keyup", (e) => {
        if (e.code === 'Slash') {
            if (isRotatingCard) {
                isRotatingCard = false;
                saveCurrentToDatabase();
            }
        }
    });

    // ── Warn before leaving with unsaved changes ──
    window.addEventListener("beforeunload", (e) => {
        if (state.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
            return e.returnValue;
        }
    });
}

// ---------------------------------------------------------------------------
// Freeform mouse handlers
// ---------------------------------------------------------------------------

function createFreeformCardAt(cx, cy) {
    // Determine card size in canvas pixels
    const dpi  = parseFloat(dom.dpiInput.value) || 300;
    const targetSizes = dom.getTargetSizes ? dom.getTargetSizes() : [];
    
    let w, h;

    if (targetSizes.length > 0) {
        // Use values from the first size field
        const firstSize = targetSizes[0];
        w = (firstSize.w * dpi) / 25.4;
        h = (firstSize.h * dpi) / 25.4;
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
        // Fallback: default values (61 mm × 112 mm at 300 DPI)
        const phW = 61;
        const phH = 112;
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
        const pad = getPadding();
        const imgW = dom.sourceCanvas.width;
        const imgH = dom.sourceCanvas.height;
        state.draggedPoint.x = Math.max(-pad.x, Math.min(imgW + pad.x, pos.x));
        state.draggedPoint.y = Math.max(-pad.y, Math.min(imgH + pad.y, pos.y));
        dom.canvas.style.cursor = 'grabbing';
        startAutoScroll();
        redraw();
    } else if (state.isDraggingCard && state.draggedCard) {
        lastMouseClientX = e.clientX;
        lastMouseClientY = e.clientY;
        const dx = pos.x - state.dragStartX;
        const dy = pos.y - state.dragStartY;
        for (const pt of state.draggedCard) {
            const pad = getPadding();
            const imgW = dom.sourceCanvas.width;
            const imgH = dom.sourceCanvas.height;
            pt.x = Math.max(-pad.x, Math.min(imgW + pad.x, pt.x + dx));
            pt.y = Math.max(-pad.y, Math.min(imgH + pad.y, pt.y + dy));
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

async function handleRectMouseDown(pos, e) {
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
            await showAlert("Please set Width and Height (px) for Rectangle mode first.");
            return;
        }
        const angle = state.selectedRectCardIndex >= 0 && state.rectCards[state.selectedRectCardIndex] 
            ? state.rectCards[state.selectedRectCardIndex].angle 
            : 0;
        const card = createRectCard(pos.x, pos.y, angle);
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

        const pad = getPadding();
        const imgW = dom.sourceCanvas.width;
        const imgH = dom.sourceCanvas.height;
        state.selectedPoint.x = Math.max(-pad.x, Math.min(imgW + pad.x, state.selectedPoint.x + dx));
        state.selectedPoint.y = Math.max(-pad.y, Math.min(imgH + pad.y, state.selectedPoint.y + dy));

        const actualDx = state.selectedPoint.x - oldX;
        const actualDy = state.selectedPoint.y - oldY;

        if (e.shiftKey && (actualDx !== 0 || actualDy !== 0)) {
            const cardIndex = state.detectedCards.findIndex(card => card.includes(state.selectedPoint));
            if (cardIndex !== -1) {
                const card       = state.detectedCards[cardIndex];
                const pointIndex = card.indexOf(state.selectedPoint);

                if (actualDx !== 0) {
                    const partnerXIndex = 3 - pointIndex;
                    card[partnerXIndex].x = Math.max(-pad.x, Math.min(imgW + pad.x, card[partnerXIndex].x + actualDx));
                }
                if (actualDy !== 0) {
                    const partnerYIndex = pointIndex ^ 1;
                    card[partnerYIndex].y = Math.max(-pad.y, Math.min(imgH + pad.y, card[partnerYIndex].y + actualDy));
                }
            }
        }
    }

    if (handled) { 
        e.preventDefault(); 
        redraw(); 
        if (dx !== 0 || dy !== 0) saveCurrentToDatabase();
    }
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
    if (e.code === 'Slash') {
        e.preventDefault();
        if (e.repeat) return; // ignore auto-repeat, we handle it smoothly
        
        const delta = e.shiftKey ? -0.05 : 0.05;
        // immediate first step
        rotateRectCard(card, delta);
        redraw();
        
        isRotatingCard = true;
        rotationDelta = delta;
        rotationTargetCard = card;
        
        // start continuous rotation after a small delay
        setTimeout(() => {
            if (isRotatingCard) requestAnimationFrame(rotationLoop);
        }, 200);
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

    if (handled) { 
        e.preventDefault(); 
        redraw(); 
        if (dx !== 0 || dy !== 0) saveCurrentToDatabase();
    }
}
