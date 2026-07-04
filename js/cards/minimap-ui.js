import { dom } from './dom.js';

let isDraggingMinimap = false;
let minimapDragOffsetX = 0;
let minimapDragOffsetY = 0;

export function handleMinimapTitleMouseDown(e) {
    isDraggingMinimap = true;
    const rect = dom.minimapContainer.getBoundingClientRect();
    minimapDragOffsetX = e.clientX - rect.left;
    minimapDragOffsetY = e.clientY - rect.top;
    e.preventDefault();
}

export function handleMinimapMouseMove(e) {
    if (isDraggingMinimap) {
        const x = e.clientX - minimapDragOffsetX;
        const y = e.clientY - minimapDragOffsetY;
        dom.minimapContainer.style.left = `${x}px`;
        dom.minimapContainer.style.top = `${y}px`;
        dom.minimapContainer.style.right = 'auto'; // Reset right so left takes over
    }
}

export function handleMinimapMouseUp() {
    isDraggingMinimap = false;
}
