import { dom } from './dom.js';
import { state } from './state.js';

export function initCalculator() {
    if (!dom.calcBtnRect) return;
    if (!dom.calcModal || !dom.calcCancelBtn || !dom.calcCancelX || !dom.calcApplyBtn) return;
    if (!dom.calcMmW || !dom.calcMmH || !dom.calcPxW || !dom.calcPxH || !dom.calcDpi) return;

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

    // Load custom sizes from localStorage
    try {
        const stored = localStorage.getItem('ce_custom_sizes');
        if (stored && dom.calcPreset) {
            const customSizes = JSON.parse(stored);
            customSizes.forEach(size => {
                const opt = document.createElement('option');
                opt.value = `${size.w},${size.h}`;
                opt.textContent = `Custom ${size.w}x${size.h} mm`;
                dom.calcPreset.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error loading custom sizes', e); }

    if (dom.calcPreset) {
        dom.calcPreset.addEventListener('change', () => {
            const val = dom.calcPreset.value;
            if (!val) return;
            const [w, h] = val.split(',').map(Number);
            dom.calcMmW.value = w;
            dom.calcMmH.value = h;
            updateFromMm('both');
        });
    }

    // Close modal on background click
    dom.calcModal.addEventListener('click', (e) => {
        if (e.target === dom.calcModal) closeCalculator();
    });
}

let currentTargetRow = null;
let calcKeydownHandler = null;

export function openCalculator(mode, targetRow = null) {
    currentTargetRow = targetRow;
    const dpi = parseFloat(dom.dpiInput.value) || 300;
    dom.calcDpi.value = dpi;
    if (dom.calcPreset) dom.calcPreset.value = '';

    if (mode === 'freeform') {
        const wInput = targetRow ? targetRow.querySelector('.ceWidthInput') : null;
        const hInput = targetRow ? targetRow.querySelector('.ceHeightInput') : null;
        
        const mmW = wInput ? parseFloat(wInput.value) : NaN;
        const mmH = hInput ? parseFloat(hInput.value) : NaN;

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
    
    // Add keydown handler
    calcKeydownHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeCalculator();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            applyCalculator();
        }
    };
    document.addEventListener('keydown', calcKeydownHandler);
    
    // Focus first input
    if (mode === 'freeform' && dom.calcMmW) {
        setTimeout(() => dom.calcMmW.focus(), 10);
    } else if (dom.calcPxW) {
        setTimeout(() => dom.calcPxW.focus(), 10);
    }
}

function closeCalculator() {
    if (calcKeydownHandler) {
        document.removeEventListener('keydown', calcKeydownHandler);
        calcKeydownHandler = null;
    }
    dom.calcModal.style.display = 'none';
    currentTargetRow = null;
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

    let mmW = parseFloat(dom.calcMmW.value);
    let mmH = parseFloat(dom.calcMmH.value);

    // Calculate mm if missing but px is present
    if (isNaN(mmW) || isNaN(mmH)) {
        const pxW = parseFloat(dom.calcPxW.value);
        const pxH = parseFloat(dom.calcPxH.value);
        if (!isNaN(pxW) && !isNaN(dpi)) mmW = parseFloat((pxW * 25.4 / dpi).toFixed(2));
        if (!isNaN(pxH) && !isNaN(dpi)) mmH = parseFloat((pxH * 25.4 / dpi).toFixed(2));
    }

    if (!isNaN(mmW) && !isNaN(mmH) && dom.calcPreset) {
        const wStr = parseFloat(mmW.toFixed(2)).toString();
        const hStr = parseFloat(mmH.toFixed(2)).toString();
        const valStr = `${wStr},${hStr}`;
        
        let exists = false;
        for (let i = 0; i < dom.calcPreset.options.length; i++) {
            if (dom.calcPreset.options[i].value === valStr) {
                exists = true;
                break;
            }
        }
        
        if (!exists && wStr > 0 && hStr > 0) {
            const opt = document.createElement('option');
            opt.value = valStr;
            opt.textContent = `Custom ${wStr}x${hStr} mm`;
            dom.calcPreset.appendChild(opt);
            
            try {
                const stored = localStorage.getItem('ce_custom_sizes');
                const customSizes = stored ? JSON.parse(stored) : [];
                customSizes.push({ w: wStr, h: hStr });
                localStorage.setItem('ce_custom_sizes', JSON.stringify(customSizes));
            } catch (e) { console.error('Error saving custom size', e); }
        }
    }

    if (state.editMode === 'rect') {
        const pxW = parseInt(dom.calcPxW.value);
        const pxH = parseInt(dom.calcPxH.value);

        if (!isNaN(pxW)) dom.rectWidthPx.value = pxW;
        if (!isNaN(pxH)) dom.rectHeightPx.value = pxH;

        // Trigger the input event to sync state and redraw
        dom.rectWidthPx.dispatchEvent(new Event('input'));
    } else if (currentTargetRow) {
        const mmW = parseFloat(dom.calcMmW.value);
        const mmH = parseFloat(dom.calcMmH.value);

        const wInput = currentTargetRow.querySelector('.ceWidthInput');
        const hInput = currentTargetRow.querySelector('.ceHeightInput');

        if (!isNaN(mmW) && wInput) wInput.value = mmW;
        if (!isNaN(mmH) && hInput) hInput.value = mmH;
    }

    closeCalculator();
}
