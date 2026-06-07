import { state } from './state.js';
import { dom } from './dom.js';
import { redraw } from './renderer.js';
import { getRectCardCorners, rotateRectCard, moveRectCard } from './rect-mode.js';
import { deleteSelectedCard, deleteSelectedRectCard } from './card-operations.js';
import { saveCurrentToDatabase } from './ini-handler.js';
import { updateButtonStates, scrollToCorner, scrollToRectCard } from './ui.js';
import { getPadding } from './utils.js';

let isRotatingCard = false;
let rotationDelta = 0;
let rotationTargetCard = null;

export function rotationLoop() {
    if (!isRotatingCard || !rotationTargetCard) return;
    rotateRectCard(rotationTargetCard, rotationDelta);
    redraw();
    requestAnimationFrame(rotationLoop);
}

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
                    const len = state.detectedCards[cardIdx].length;
                    state.selectedPoint = state.detectedCards[cardIdx][(cornerIdx + len - 1) % len];
                }
            }
        } else {
            if (!state.selectedPoint) {
                state.selectedPoint = state.detectedCards[0][0];
            } else {
                const cardIdx = state.detectedCards.findIndex(c => c.includes(state.selectedPoint));
                if (cardIdx !== -1) {
                    const cornerIdx = state.detectedCards[cardIdx].indexOf(state.selectedPoint);
                    const len = state.detectedCards[cardIdx].length;
                    state.selectedPoint = state.detectedCards[cardIdx][(cornerIdx + 1) % len];
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
                if (card.length === 4) {
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
    }

    if (handled) { 
        e.preventDefault(); 
        redraw(); 
        if (dx !== 0 || dy !== 0) saveCurrentToDatabase();
    }
}

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

export function handleGlobalKeyDown(e) {
    if (e.target.tagName === 'INPUT') return;
    const tabCards = document.getElementById("tab-cards");
    if (tabCards && !tabCards.classList.contains("active")) return;

    if (state.isDrawingPolygon) {
        if (e.key === "Escape") {
            state.isDrawingPolygon = false;
            state.draftPolygon = [];
            if (dom.drawShapeBtn) dom.drawShapeBtn.classList.remove('active');
            dom.canvas.style.cursor = 'crosshair';
            redraw();
            e.preventDefault();
            return;
        }
        if (e.key === "Enter") {
            if (state.draftPolygon.length >= 3) {
                state.detectedCards.push([...state.draftPolygon]);
                saveCurrentToDatabase();
                updateButtonStates();
            }
            state.isDrawingPolygon = false;
            state.draftPolygon = [];
            if (dom.drawShapeBtn) dom.drawShapeBtn.classList.remove('active');
            dom.canvas.style.cursor = 'crosshair';
            redraw();
            e.preventDefault();
            return;
        }
    }

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

    if (state.editMode === 'rect') {
        handleRectKeyDown(e);
        return;
    }

    handleFreeformKeyDown(e);
}

export function handleGlobalKeyUp(e) {
    if (e.code === 'Slash') {
        if (isRotatingCard) {
            isRotatingCard = false;
            saveCurrentToDatabase();
        }
    }
}
