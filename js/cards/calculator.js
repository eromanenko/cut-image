import { dom } from './dom.js';
import { state } from './state.js';
import { redraw } from './renderer.js';

export function initCalculator() {
    if (!dom.calcBtnFreeform || !dom.calcBtnRect) return;

    dom.calcBtnFreeform.addEventListener('click', () => openCalculator('freeform'));
    dom.calcBtnRect.addEventListener('click', () => openCalculator('rect'));

    dom.calcCancelBtn.addEventListener('click', closeCalculator);
    dom.calcCancelX.addEventListener('click', closeCalculator);
    dom.calcApplyBtn.addEventListener('click', applyCalculator);

    // Reactive calculations
    dom.calcMmW.addEventListener('input', () => updateFromMm('W'));
    dom.calcMmH.addEventListener('input', () => updateFromMm('H'));
    dom.calcPxW.addEventListener('input', () => updateFromPx('W'));
    dom.calcPxH.addEventListener('input', () => updateFromPx('H'));
    dom.calcDpi.addEventListener('input', () => updateFromMm('both'));

    // Close modal on background click
    dom.calcModal.addEventListener('click', (e) => {
        if (e.target === dom.calcModal) closeCalculator();
    });
}

function openCalculator(mode) {
    const dpi = parseFloat(dom.dpiInput.value) || 300;
    dom.calcDpi.value = dpi;

    if (mode === 'freeform') {
        const mmW = parseFloat(dom.widthInput.value);
        const mmH = parseFloat(dom.heightInput.value);
        
        if (!isNaN(mmW)) dom.calcMmW.value = mmW;
        else dom.calcMmW.value = '';
        
        if (!isNaN(mmH)) dom.calcMmH.value = mmH;
        else dom.calcMmH.value = '';
        
        updateFromMm('both');
    } else {
        const pxW = parseFloat(dom.rectWidthPx.value);
        const pxH = parseFloat(dom.rectHeightPx.value);
        
        if (!isNaN(pxW)) dom.calcPxW.value = pxW;
        else dom.calcPxW.value = '';
        
        if (!isNaN(pxH)) dom.calcPxH.value = pxH;
        else dom.calcPxH.value = '';
        
        updateFromPx('both');
    }

    dom.calcModal.style.display = 'flex';
}

function closeCalculator() {
    dom.calcModal.style.display = 'none';
}

function updateFromMm(axis) {
    const dpi = parseFloat(dom.calcDpi.value) || 300;
    
    if (axis === 'W' || axis === 'both') {
        const mm = parseFloat(dom.calcMmW.value);
        if (!isNaN(mm)) {
            dom.calcPxW.value = Math.round((mm * dpi) / 25.4);
        } else {
            dom.calcPxW.value = '';
        }
    }
    
    if (axis === 'H' || axis === 'both') {
        const mm = parseFloat(dom.calcMmH.value);
        if (!isNaN(mm)) {
            dom.calcPxH.value = Math.round((mm * dpi) / 25.4);
        } else {
            dom.calcPxH.value = '';
        }
    }
}

function updateFromPx(axis) {
    const dpi = parseFloat(dom.calcDpi.value) || 300;
    
    if (axis === 'W' || axis === 'both') {
        const px = parseFloat(dom.calcPxW.value);
        if (!isNaN(px)) {
            dom.calcMmW.value = (px * 25.4 / dpi).toFixed(2);
        } else {
            dom.calcMmW.value = '';
        }
    }
    
    if (axis === 'H' || axis === 'both') {
        const px = parseFloat(dom.calcPxH.value);
        if (!isNaN(px)) {
            dom.calcMmH.value = (px * 25.4 / dpi).toFixed(2);
        } else {
            dom.calcMmH.value = '';
        }
    }
}

function applyCalculator() {
    const dpi = parseFloat(dom.calcDpi.value);
    if (!isNaN(dpi)) dom.dpiInput.value = dpi;

    if (state.editMode === 'rect') {
        const pxW = parseInt(dom.calcPxW.value);
        const pxH = parseInt(dom.calcPxH.value);
        
        if (!isNaN(pxW)) dom.rectWidthPx.value = pxW;
        if (!isNaN(pxH)) dom.rectHeightPx.value = pxH;
        
        // Trigger the input event to sync state and redraw
        dom.rectWidthPx.dispatchEvent(new Event('input'));
    } else {
        const mmW = parseFloat(dom.calcMmW.value);
        const mmH = parseFloat(dom.calcMmH.value);
        
        if (!isNaN(mmW)) dom.widthInput.value = mmW;
        if (!isNaN(mmH)) dom.heightInput.value = mmH;
    }

    closeCalculator();
}
