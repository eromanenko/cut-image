import { dom } from './dom.js';
import { state } from './state.js';
import { updateButtonStates } from './ui.js';

export function applyFilter() {
    if (!state.isImageLoaded || !state.isCvReady) return;

    state.isProcessing = true;
    updateButtonStates();
    dom.processBtn.textContent = "Processing...";

    setTimeout(() => {
        try {
            let src = cv.imread(dom.resultCanvas);
            let dst = new cv.Mat();
            
            let rgb = new cv.Mat();
            cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB, 0);
            
            const method = dom.filterMethod.value;
            
            if (method === 'bilateral') {
                const d = parseInt(dom.biD.value, 10) || 9;
                const sigmaColor = parseFloat(dom.biSigmaColor.value) || 75;
                const sigmaSpace = parseFloat(dom.biSigmaSpace.value) || 75;
                
                cv.bilateralFilter(rgb, dst, d, sigmaColor, sigmaSpace, cv.BORDER_DEFAULT);
                
            } else if (method === 'gaussian') {
                const k = parseInt(dom.gaussK.value, 10) || 5;
                const amount = parseFloat(dom.unsharpAmount.value) || 1.5;
                
                let blurred = new cv.Mat();
                cv.GaussianBlur(rgb, blurred, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT);
                
                cv.addWeighted(rgb, 1.0 + amount, blurred, -amount, 0, dst);
                blurred.delete();
                
            } else if (method === 'median') {
                const k = parseInt(dom.medianK.value, 10) || 5;
                cv.medianBlur(rgb, dst, k);
            }

            let rgba = new cv.Mat();
            cv.cvtColor(dst, rgba, cv.COLOR_RGB2RGBA, 0);
            
            cv.imshow(dom.resultCanvas, rgba);
            
            if (!dom.compareCheckbox.checked) {
                dom.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                dom.ctx.drawImage(dom.resultCanvas, 0, 0);
            }

            state.history.length = state.historyIndex + 1;
            state.history.push(dom.resultCtx.getImageData(0, 0, dom.resultCanvas.width, dom.resultCanvas.height));
            state.historyIndex++;

            src.delete(); dst.delete(); rgb.delete(); rgba.delete();
            
        } catch (err) {
            console.error("Filter error:", err);
            alert("An error occurred applying the filter. See console.");
        } finally {
            state.isProcessing = false;
            dom.processBtn.textContent = "Apply Filter";
            updateButtonStates();
        }
    }, 50);
}
