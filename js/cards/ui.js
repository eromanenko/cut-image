import { dom } from './dom.js';
import { state } from './state.js';

export function updateButtonStates() {
    dom.processButton.disabled = !(state.isCvReady && state.isImageLoaded);
    dom.addManualButton.disabled = !state.isImageLoaded;
    dom.deleteButton.disabled = (state.selectedPoint === null);
    dom.downloadButton.disabled = state.detectedCards.length === 0;
    dom.getSizeBtn.disabled = state.detectedCards.length === 0;
    dom.downloadButton.textContent = state.detectedCards.length > 0
        ? `Download ${state.detectedCards.length} card${state.detectedCards.length !== 1 ? 's' : ''}`
        : 'Download';
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
