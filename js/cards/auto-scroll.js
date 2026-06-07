import { state } from './state.js';
import { dom } from './dom.js';
import { redraw } from './renderer.js';
import { moveRectCard } from './rect-mode.js';

let autoScrollRaf = null;
let lastMouseClientX = 0;
let lastMouseClientY = 0;
const SCROLL_ZONE = 80;
const SCROLL_MAX  = 20;

export function updateAutoScrollMousePos(clientX, clientY) {
    lastMouseClientX = clientX;
    lastMouseClientY = clientY;
}

function getScrollSpeed(distance) {
    const t = 1 - distance / SCROLL_ZONE;
    return Math.round(t * t * SCROLL_MAX);
}

export function autoScrollStep() {
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

export function startAutoScroll() {
    if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(autoScrollStep);
}

export function stopAutoScroll() {
    if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
}
