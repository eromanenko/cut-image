import { state } from './state.js';
import { dom, getTargetSizes } from './dom.js';
import { redraw } from './renderer.js';
import { getMousePos, findPointNear, findCardContaining, getPadding } from './utils.js';
import { createRectCard, moveRectCard, pointInRectCard } from './rect-mode.js';
import { showAlert } from '../dialogs.js';
import { startAutoScroll, stopAutoScroll, updateAutoScrollMousePos } from './auto-scroll.js';
import { saveCurrentToDatabase } from './ini-handler.js';
import { updateButtonStates } from './ui.js';

function createFreeformCardAt(cx, cy) {
    const dpi  = parseFloat(dom.dpiInput.value) || 300;
    const targetSizes = getTargetSizes();
    
    let w, h;

    if (state.selectedPoint) {
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

    if ((!w || !h) && targetSizes.length > 0) {
        const firstSize = targetSizes[0];
        w = (firstSize.w * dpi) / 25.4;
        h = (firstSize.h * dpi) / 25.4;
    }

    if (!w || !h) {
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
    if (state.isDrawingPolygon) {
        if (state.draftPolygon.length > 0) {
            const firstPt = state.draftPolygon[0];
            const dist = Math.hypot(pos.x - firstPt.x, pos.y - firstPt.y);
            // If clicked near the first point, close the polygon
            if (dist < 20) {
                if (state.draftPolygon.length >= 3) {
                    state.detectedCards.push([...state.draftPolygon]);
                    saveCurrentToDatabase();
                    updateButtonStates();
                }
                state.isDrawingPolygon = false;
                state.draftPolygon = [];
                if (dom.drawShapeBtn) dom.drawShapeBtn.classList.remove('active');
                redraw();
                return;
            }
        }
        state.draftPolygon.push({ x: pos.x, y: pos.y });
        redraw();
        return;
    }

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
            const newCard = createFreeformCardAt(pos.x, pos.y);
            state.detectedCards.push(newCard);
            state.selectedPoint  = newCard[0];
            state.isDraggingCard = true;
            state.draggedCard    = newCard;
            state.dragStartX     = pos.x;
            state.dragStartY     = pos.y;
        }
    }
}

function handleFreeformMouseMove(pos, e) {
    if (state.isDrawingPolygon) {
        state.currentMousePos = { x: pos.x, y: pos.y };
        redraw();
        return;
    }

    if (state.isDraggingPoint && state.draggedPoint) {
        updateAutoScrollMousePos(e.clientX, e.clientY);
        const pad = getPadding();
        const imgW = dom.sourceCanvas.width;
        const imgH = dom.sourceCanvas.height;
        state.draggedPoint.x = Math.max(-pad.x, Math.min(imgW + pad.x, pos.x));
        state.draggedPoint.y = Math.max(-pad.y, Math.min(imgH + pad.y, pos.y));
        dom.canvas.style.cursor = 'grabbing';
        startAutoScroll();
        redraw();
    } else if (state.isDraggingCard && state.draggedCard) {
        updateAutoScrollMousePos(e.clientX, e.clientY);
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

async function handleRectMouseDown(pos, e) {
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
        state.isDraggingRectCard   = true;
        state.draggedRectCardIndex = state.selectedRectCardIndex;
        state.dragRectStartX       = pos.x;
        state.dragRectStartY       = pos.y;
    }
}

function handleRectMouseMove(pos, e) {
    if (state.isDraggingRectCard) {
        updateAutoScrollMousePos(e.clientX, e.clientY);
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

export function handleCanvasMouseDown(e) {
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
}

export function handleCanvasMouseMove(e) {
    if (!state.isImageLoaded) return;
    const pos = getMousePos(e);

    if (state.editMode === 'rect') {
        handleRectMouseMove(pos, e);
    } else {
        handleFreeformMouseMove(pos, e);
    }
}

export function handleGlobalMouseUp() {
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
}
