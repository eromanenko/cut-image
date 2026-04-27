import { dom } from './dom.js';
import { state } from './state.js';

export function updateButtonStates() {
    const isRect = state.editMode === 'rect';

    dom.processButton.disabled = !(state.isCvReady && state.isImageLoaded);
    dom.addManualButton.disabled = !state.isImageLoaded;

    if (isRect) {
        const total = state.rectCards.length;
        const current = state.selectedRectCardIndex + 1;
        dom.deleteButton.disabled = state.selectedRectCardIndex === -1;
        dom.deleteButton.textContent = (total > 0 && current > 0) 
            ? `Unselect ${current}/${total}` 
            : 'Unselect';

        dom.downloadButton.disabled = state.rectCards.length === 0;
        dom.downloadButton.textContent = state.rectCards.length > 0
            ? `Download ${state.rectCards.length} card${state.rectCards.length !== 1 ? 's' : ''}`
            : 'Download';
        if (dom.getSizeBtn) dom.getSizeBtn.disabled = true;
    } else {
        const total = state.detectedCards.length;
        let current = 0;
        if (state.selectedPoint) {
            current = state.detectedCards.findIndex(c => c.includes(state.selectedPoint)) + 1;
        }
        dom.deleteButton.disabled = (state.selectedPoint === null);
        dom.deleteButton.textContent = (total > 0 && current > 0) 
            ? `Unselect ${current}/${total}` 
            : 'Unselect';

        dom.downloadButton.disabled = state.detectedCards.length === 0;
        dom.downloadButton.textContent = state.detectedCards.length > 0
            ? `Download ${state.detectedCards.length} card${state.detectedCards.length !== 1 ? 's' : ''}`
            : 'Download';
        if (dom.getSizeBtn) dom.getSizeBtn.disabled = state.detectedCards.length === 0;
    }
}

/**
 * Switch the visible toolbar rows and toggle-button active states
 * to reflect the given mode ('freeform' | 'rect').
 */
export function applyModeUI(mode) {
    const isRect = mode === 'rect';

    // Toggle button active classes
    dom.freeformModeBtn.classList.toggle('active', !isRect);
    dom.rectModeBtn.classList.toggle('active', isRect);

    // Show/hide toolbar rows
    if (dom.freeformStylingRow)    dom.freeformStylingRow.style.display    = isRect ? 'none' : '';
    if (dom.freeformDimensionsRow) dom.freeformDimensionsRow.style.display = isRect ? 'none' : '';
    if (dom.rectControls)          dom.rectControls.style.display          = isRect ? ''     : 'none';

    // Swap instruction text
    if (dom.instrFreeform) dom.instrFreeform.style.display = isRect ? 'none' : '';
    if (dom.instrRect)     dom.instrRect.style.display     = isRect ? ''     : 'none';
}

export function scrollToCorner(point, cornerIndex) {
    if (!point) return;
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = rect.width / dom.canvas.width;
    const scaleY = rect.height / dom.canvas.height;

    const vpX = rect.left + point.x * scaleX;
    const vpY = rect.top + point.y * scaleY;

    const stickyEl = dom.canvas.closest('.tab-content')?.querySelector('.sticky-controls');
    const stickyH = stickyEl ? stickyEl.getBoundingClientRect().height : 0;

    const pad = 20;
    let targetX = window.scrollX;
    let targetY = window.scrollY;

    switch (cornerIndex) {
        case 0:
            targetX += vpX - pad;
            targetY += vpY - (stickyH + pad);
            break;
        case 1:
            targetX += vpX - (window.innerWidth - pad);
            targetY += vpY - (stickyH + pad);
            break;
        case 2:
            targetX += vpX - (window.innerWidth - pad);
            targetY += vpY - (window.innerHeight - pad);
            break;
        case 3:
            targetX += vpX - pad;
            targetY += vpY - (window.innerHeight - pad);
            break;
    }

    window.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
}

/**
 * Scroll the viewport so the center of a rect-mode card is visible.
 */
export function scrollToRectCard(card, corners) {
    if (!corners) return;
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = rect.width / dom.canvas.width;
    const scaleY = rect.height / dom.canvas.height;
    const vpX = rect.left + cx * scaleX;
    const vpY = rect.top  + cy * scaleY;
    const stickyEl = dom.canvas.closest('.tab-content')?.querySelector('.sticky-controls');
    const stickyH = stickyEl ? stickyEl.getBoundingClientRect().height : 0;
    window.scrollTo({
        left: window.scrollX + vpX - window.innerWidth  / 2,
        top:  window.scrollY + vpY - (stickyH + (window.innerHeight - stickyH) / 2),
        behavior: 'smooth',
    });
}
