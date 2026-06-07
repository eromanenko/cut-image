import { dom } from './dom.js';
import { updateZoomWindow } from './renderer.js';

let isDraggingZoom = false;
let zoomDragOffsetX = 0;
let zoomDragOffsetY = 0;

let isResizingZoom = false;
let zoomBaseWidth = 0;
let zoomBaseHeight = 0;
let zoomResizeStartX = 0;
let zoomResizeStartY = 0;

export function handleZoomTitleMouseDown(e) {
    isDraggingZoom = true;
    const rect = dom.zoomContainer.getBoundingClientRect();
    zoomDragOffsetX = e.clientX - rect.left;
    zoomDragOffsetY = e.clientY - rect.top;
    e.preventDefault();
}

export function handleZoomResizerMouseDown(e) {
    isResizingZoom = true;
    zoomBaseWidth = dom.zoomCanvas.width;
    zoomBaseHeight = dom.zoomCanvas.height;
    zoomResizeStartX = e.clientX;
    zoomResizeStartY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
}

export function handleZoomMouseMove(e) {
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
}

export function handleZoomMouseUp() {
    isDraggingZoom = false;
    isResizingZoom = false;
}
