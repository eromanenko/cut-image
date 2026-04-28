import { dom } from './dom.js';
import { state } from './state.js';
import { calculateCutRegions } from './export.js';
import { redraw } from './renderer.js';

export function updateDownloadButtonText() {
    if (state.lines.length === 0) {
        dom.downloadButton.textContent = 'Download';
        return;
    }
    calculateCutRegions();
    dom.downloadButton.textContent = state.cutRegions.length > 0
        ? `Download ${state.cutRegions.length}`
        : 'Download';
}

export function resetState() {
    state.lines = [];
    state.cutRegions = [];
    state.selectedLine = null;
    state.hoverLine = null;
    state.isDragging = false;
    state.draggedLine = null;
    dom.downloadButton.disabled = true;
    dom.resetButton.disabled = true;
    state.pdfDoc = null;
    state.isPdf = false;
}

export function resetLines() {
    state.lines = [];
    state.cutRegions = [];
    state.selectedLine = null;
    state.hoverLine = null;
    state.isDragging = false;
    state.draggedLine = null;
    dom.downloadButton.disabled = true;
    dom.resetButton.disabled = true;
    if (state.isImageLoaded) redraw();
}
