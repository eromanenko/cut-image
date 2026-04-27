import { dom } from './dom.js';
import { state } from './state.js';

let tuneCropSize = 300;
let tuneX = 0;
let tuneY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let tuneTimeout = null;

export function initTuneModal() {
    dom.tuneBtn.addEventListener('click', openModal);
    dom.tuneCancelX.addEventListener('click', closeModal);
    dom.tuneCancelBtn.addEventListener('click', closeModal);
    dom.tuneApplyBtn.addEventListener('click', applyTune);

    dom.tuneCanvasContainer.addEventListener('mousedown', startDrag);
    dom.tuneCanvasContainer.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', stopDrag);

    dom.tuneMethod.addEventListener('change', () => {
        updateTuneMethodControls();
        queueTuneRender();
    });

    const tuneInputs = [
        dom.tuneBiD, dom.tuneBiColor, dom.tuneBiSpace,
        dom.tuneGaussK, dom.tuneUnsharpAmt, dom.tuneMedianK
    ];

    tuneInputs.forEach(input => {
        input.addEventListener('input', queueTuneRender);
    });
}

function openModal() {
    if (!state.isImageLoaded) return;

    // Calculate crop size based on 2x2 cm and current DPI
    const dpi = parseInt(dom.dpiInput.value) || 300;
    tuneCropSize = Math.round(20 * dpi / 25.4);
    
    // Limit max crop size to avoid freezing on very high DPI
    if (tuneCropSize > 800) tuneCropSize = 800;
    if (tuneCropSize < 100) tuneCropSize = 100;

    dom.tuneCanvas.width = tuneCropSize;
    dom.tuneCanvas.height = tuneCropSize;
    dom.tuneSourceCanvas.width = tuneCropSize;
    dom.tuneSourceCanvas.height = tuneCropSize;

    // Start at center
    tuneX = Math.max(0, (dom.sourceCanvas.width - tuneCropSize) / 2);
    tuneY = Math.max(0, (dom.sourceCanvas.height - tuneCropSize) / 2);

    // Sync values from main form to modal
    dom.tuneMethod.value = dom.filterMethod.value;
    dom.tuneBiD.value = dom.biD.value;
    dom.tuneBiColor.value = dom.biSigmaColor.value;
    dom.tuneBiSpace.value = dom.biSigmaSpace.value;
    dom.tuneGaussK.value = dom.gaussK.value;
    dom.tuneUnsharpAmt.value = dom.unsharpAmount.value;
    dom.tuneMedianK.value = dom.medianK.value;

    updateTuneMethodControls();
    
    dom.tuneModal.style.display = "flex";
    
    updateTuneSource();
    queueTuneRender();
}

function closeModal() {
    dom.tuneModal.style.display = "none";
}

function applyTune() {
    // Copy values back to main form
    dom.filterMethod.value = dom.tuneMethod.value;
    dom.biD.value = dom.tuneBiD.value;
    dom.biSigmaColor.value = dom.tuneBiColor.value;
    dom.biSigmaSpace.value = dom.tuneBiSpace.value;
    dom.gaussK.value = dom.tuneGaussK.value;
    dom.unsharpAmount.value = dom.tuneUnsharpAmt.value;
    dom.medianK.value = dom.tuneMedianK.value;

    // Trigger main form controls update manually to reflect selected method
    dom.filterMethod.dispatchEvent(new Event('change'));

    closeModal();
}

function updateTuneMethodControls() {
    dom.tuneBiControls.style.display = 'none';
    dom.tuneGaussControls.style.display = 'none';
    dom.tuneMedianControls.style.display = 'none';
    
    if (dom.tuneMethod.value === 'bilateral') dom.tuneBiControls.style.display = 'inline-flex';
    else if (dom.tuneMethod.value === 'gaussian') dom.tuneGaussControls.style.display = 'inline-flex';
    else if (dom.tuneMethod.value === 'median') dom.tuneMedianControls.style.display = 'inline-flex';
}

function startDrag(e) {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    dom.tuneCanvasContainer.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    // Pan image. Since we drag the canvas visually, a right mouse drag means 
    // we want to see the left part of the image, so X decreases.
    tuneX -= dx;
    tuneY -= dy;

    // Clamp
    tuneX = Math.max(0, Math.min(tuneX, dom.sourceCanvas.width - tuneCropSize));
    tuneY = Math.max(0, Math.min(tuneY, dom.sourceCanvas.height - tuneCropSize));

    updateTuneSource();
    queueTuneRender();
}

function stopDrag() {
    isDragging = false;
    dom.tuneCanvasContainer.style.cursor = 'grab';
}

function updateTuneSource() {
    dom.tuneSourceCtx.clearRect(0, 0, tuneCropSize, tuneCropSize);
    // Draw the cropped portion from the CURRENT result canvas to allow stacked tuning!
    // Or should tuning always be done on the current state? Yes, resultCanvas holds current state.
    dom.tuneSourceCtx.drawImage(
        dom.resultCanvas, 
        tuneX, tuneY, tuneCropSize, tuneCropSize, 
        0, 0, tuneCropSize, tuneCropSize
    );
}

function queueTuneRender() {
    if (tuneTimeout) clearTimeout(tuneTimeout);
    tuneTimeout = setTimeout(renderTune, 50);
}

function renderTune() {
    if (!state.isCvReady) return;

    try {
        let src = cv.imread(dom.tuneSourceCanvas);
        let dst = new cv.Mat();
        
        let rgb = new cv.Mat();
        cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB, 0);
        
        const method = dom.tuneMethod.value;
        
        if (method === 'bilateral') {
            const d = parseInt(dom.tuneBiD.value, 10) || 9;
            const sigmaColor = parseFloat(dom.tuneBiColor.value) || 75;
            const sigmaSpace = parseFloat(dom.tuneBiSpace.value) || 75;
            cv.bilateralFilter(rgb, dst, d, sigmaColor, sigmaSpace, cv.BORDER_DEFAULT);
            
        } else if (method === 'gaussian') {
            const k = parseInt(dom.tuneGaussK.value, 10) || 5;
            const amount = parseFloat(dom.tuneUnsharpAmt.value) || 1.5;
            let blurred = new cv.Mat();
            cv.GaussianBlur(rgb, blurred, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);
            cv.addWeighted(rgb, 1.0 + amount, blurred, -amount, 0, dst);
            blurred.delete();
            
        } else if (method === 'median') {
            const k = parseInt(dom.tuneMedianK.value, 10) || 5;
            cv.medianBlur(rgb, dst, k);
        }

        let rgba = new cv.Mat();
        cv.cvtColor(dst, rgba, cv.COLOR_RGB2RGBA, 0);
        
        cv.imshow(dom.tuneCanvas, rgba);
        
        src.delete(); dst.delete(); rgb.delete(); rgba.delete();
        
    } catch (err) {
        console.error("Tune filter error:", err);
    }
}
